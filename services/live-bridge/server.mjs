import {createHmac,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {WebSocketServer,WebSocket} from "ws";
import {accountSid,callSid,e164,matchesRouteSignature,makeStreamingTokens} from "./relay-core.mjs";

const AUTH=process.env.TWILIO_AUTH_TOKEN||"";
const ACCOUNT=process.env.TWILIO_ACCOUNT_SID||"";
const WSS_URL=process.env.PUBLIC_WS_URL||"";
const WEB_API=process.env.SMARTJOB_TRANSLATE_URL||"https://smartjob-xi.vercel.app/api/twilio/live/translate";
const EN=process.env.SMARTJOB_DUO_EN_PHONE||"";
const ES=process.env.SMARTJOB_DUO_ES_PHONE||"";
const TWILIO=process.env.TWILIO_NUMBER||"";
const PORT=Number(process.env.PORT||3001);
const MAX_ACTIVE_BRIDGES=Math.max(1,Math.min(30,Number(process.env.SMARTJOB_MAX_CONCURRENT_CALLS||1)));
const MAX_CALL_SECONDS=Math.max(60,Math.min(1800,Number(process.env.SMARTJOB_MAX_CALL_SECONDS||600)));
const rooms=new Map();
if(!AUTH||!accountSid(ACCOUNT)||!/^wss:\/\/[a-z0-9.-]+\/relay$/i.test(WSS_URL)||![EN,ES,TWILIO].every(e164)){
  console.error("Required Live Bridge environment variables are missing or invalid.");
  process.exit(1);
}

const app=createServer((req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname.replace(/\/$/,"")||"/";
  if(["GET","HEAD"].includes(req.method)&&["/","/health"].includes(path)){
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    return res.end(req.method==="HEAD"?"":JSON.stringify({ok:true,service:"smartjob-live-bridge",bridges:rooms.size,version:2}));
  }
  res.writeHead(404,{"content-type":"text/plain"}).end("Not found");
});
const wss=new WebSocketServer({noServer:true,maxPayload:12_000,perMessageDeflate:false});

function authenticatedUpgrade(req){
  const provided=req.headers["x-twilio-signature"];
  if(typeof provided!=="string")return false;
  const expected=createHmac("sha1",AUTH).update(WSS_URL).digest();
  let received;
  try{received=Buffer.from(provided,"base64");}catch{return false;}
  return received.length===expected.length&&timingSafeEqual(expected,received);
}
function safeSetup(data){
  const p=data?.customParameters||{};
  const role=p.role,bridge=p.bridge;
  if(!["customer","professional"].includes(role)||!callSid(bridge)||!callSid(data?.callSid)||data.accountSid!==ACCOUNT)return null;
  const isNew=Boolean(p.routeSignature);
  if(isNew){
    const route={bridge,customer:p.customer,twilio:p.twilio,owner:p.owner,customerLanguage:p.customerLanguage,ownerLanguage:p.ownerLanguage};
    if(![route.customer,route.twilio,route.owner].every(e164)||!["en-US","es-ES"].includes(route.customerLanguage)||!["en-US","es-ES"].includes(route.ownerLanguage)||route.customerLanguage===route.ownerLanguage||!matchesRouteSignature(AUTH,route,p.routeSignature))return null;
    if(role==="customer"&&(data.from!==route.customer||data.to!==route.twilio||data.callSid!==bridge))return null;
    if(role==="professional"&&(data.from!==route.twilio||data.to!==route.owner))return null;
  }else{
    // Backward compatible allowlist: live pilot only, never arbitrary callers.
    if(role==="customer"&&(data.from!==EN||data.to!==TWILIO||data.callSid!==bridge))return null;
    if(role==="professional"&&(data.from!==TWILIO||data.to!==ES))return null;
  }
  return {role,bridge,callSid:data.callSid,sessionId:data.sessionId,connectionType:data.connectionType||"initial"};
}
const open=ws=>ws?.readyState===WebSocket.OPEN;
function sendText(ws,text,{last=true,interruptible=true,preemptible=false}={}){
  if(open(ws)&&text)ws.send(JSON.stringify({type:"text",token:text,last,interruptible,preemptible}));
}
function endSocket(ws){
  if(open(ws))ws.send(JSON.stringify({type:"end"}));
}
function peerRole(role){return role==="customer"?"professional":"customer";}
function roomFor(id){
  if(rooms.has(id))return rooms.get(id);
  if(rooms.size>=MAX_ACTIVE_BRIDGES)return null;
  const room={customer:null,professional:null,customerSid:null,professionalSid:null,started:Date.now(),jobs:{customer:null,professional:null},closing:false};
  rooms.set(id,room);return room;
}
function cancelJob(room,role){
  const active=room.jobs[role];
  if(active){active.abort();room.jobs[role]=null;}
}
function abortRoom(room){cancelJob(room,"customer");cancelJob(room,"professional");}
async function callApi(sid,form){
  const auth="Basic "+Buffer.from(ACCOUNT+":"+AUTH).toString("base64");
  return fetch("https://api.twilio.com/2010-04-01/Accounts/"+ACCOUNT+"/Calls/"+sid+".json",{
    method:form?"POST":"GET",headers:form?{Authorization:auth,"Content-Type":"application/x-www-form-urlencoded"}:{Authorization:auth},
    body:form?new URLSearchParams(form).toString():undefined,signal:AbortSignal.timeout(4000),cache:"no-store"
  });
}
async function completeCall(sid){
  if(!callSid(sid))return;
  try{
    const result=await callApi(sid,{Status:"completed"});
    if(!result.ok&&result.status!==400)console.error("Live Bridge call cleanup HTTP",result.status);
  }catch(e){console.error("Live Bridge call cleanup unavailable",e?.name||"error");}
}
async function finishRoom(id,reason){
  const room=rooms.get(id);
  if(!room||room.closing)return;
  room.closing=true;abortRoom(room);
  console.info("Live Bridge session ending",reason);
  endSocket(room.customer);endSocket(room.professional);
  const calls=[room.customerSid,room.professionalSid].filter(callSid);
  await Promise.allSettled(calls.map(completeCall));
  rooms.delete(id);
}
async function verifyDisconnectedLeg(id,role,sid){
  const room=rooms.get(id);
  if(!room||room.closing||room[role]||!callSid(sid))return;
  try{
    const status=await callApi(sid);
    if(!status.ok){console.error("Live Bridge status check HTTP",status.status);return;}
    const record=await status.json();
    // A transport restart must not terminate a still-active phone call.
    if(["completed","busy","canceled","failed","no-answer"].includes(record.status))await finishRoom(id,"one-leg-ended");
  }catch(e){console.error("Live Bridge disconnect status check",e?.name||"error");}
}

async function interpret(source,role,signal,onToken){
  const body=JSON.stringify({original:source,role,stream:true});
  const stamp=String(Math.floor(Date.now()/1000));
  const sig=createHmac("sha256",AUTH).update("smartjob-bridge-v1\n"+stamp+"\n"+body).digest("hex");
  const response=await fetch(WEB_API,{method:"POST",headers:{"Content-Type":"application/json","x-smartjob-timestamp":stamp,"x-smartjob-signature":sig},
    body,signal});
  if(!response.ok)throw new Error("translation_http_"+response.status);
  if(!response.body)throw new Error("translation_no_body");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer="",bytes=0,done=false;
  try{
    while(!done){
      const result=await reader.read();
      if(result.done)break;
      bytes+=result.value.byteLength;
      if(bytes>16000)throw new Error("translation_too_large");
      buffer+=decoder.decode(result.value,{stream:true});
      let i;
      while((i=buffer.indexOf("\n"))>=0){
        const line=buffer.slice(0,i);buffer=buffer.slice(i+1);
        if(!line.trim())continue;
        const packet=JSON.parse(line);
        if(packet.error)throw new Error("translation_rejected");
        if(typeof packet.token==="string"&&packet.token)onToken(packet.token);
        if(packet.done){done=true;break;}
      }
      if(buffer.length>1500)throw new Error("translation_line_too_large");
    }
    if(!done)throw new Error("translation_truncated");
  }finally{reader.releaseLock();}
}
function startTranslation(room,ctx,speech){
  const peer=room[peerRole(ctx.role)];
  if(!open(peer)){
    sendText(room[ctx.role],ctx.role==="customer"?"The other person has not connected.":"La otra persona todavía no está conectada.");
    return;
  }
  cancelJob(room,ctx.role);
  const controller=new AbortController();
  room.jobs[ctx.role]=controller;
  const begun=Date.now(),sender=ctx.role;
  const stream=makeStreamingTokens((token,last)=>{
    if(!controller.signal.aborted&&open(peer)&&!room.closing)sendText(peer,token,{last,interruptible:true,preemptible:false});
  });
  void (async()=>{
    try{
      await interpret(speech,sender,controller.signal,token=>stream.next(token));
      if(!controller.signal.aborted&&room.jobs[sender]===controller){
        const count=stream.finish();
        if(!count)throw new Error("translation_empty");
        console.info("Live Bridge completed turn",sender,"duration_ms",Date.now()-begun,"tokens",count);
      }
    }catch(e){
      if(!controller.signal.aborted){
        console.error("Live Bridge translation issue",e?.name==="AbortError"?"aborted":String(e?.message||"unknown").replace(/[^a-zA-Z0-9_]/g,"").slice(0,60));
        sendText(room[sender],sender==="customer"?"Please repeat that sentence.":"Repite esa frase, por favor.");
      }
    }finally{
      if(room.jobs[sender]===controller)room.jobs[sender]=null;
    }
  })();
}
app.on("upgrade",(req,socket,head)=>{
  if(req.url!=="/relay"||!authenticatedUpgrade(req)){
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
});
wss.on("connection",ws=>{
  let ctx=null,count=0;
  ws.on("message",raw=>{
    if(++count>1000){ws.close(1008,"message limit");return;}
    let event;
    try{event=JSON.parse(raw.toString());}catch{ws.close(1008,"bad message");return;}
    if(event.type==="setup"){
      if(ctx){ws.close(1008,"duplicate setup");return;}
      const setup=safeSetup(event);
      if(!setup){ws.close(1008,"invalid session");return;}
      const room=roomFor(setup.bridge);
      if(!room||room.closing){ws.close(1013,"pilot busy");return;}
      if(room[setup.role]&&room[setup.role]!==ws){
        if(setup.connectionType!=="reconnect"||room[setup.role+"Sid"]!==setup.callSid){ws.close(1008,"duplicate role");return;}
        room[setup.role].terminate();
      }
      room[setup.role]=ws;room[setup.role+"Sid"]=setup.callSid;
      ctx=setup;console.info("Live Bridge participant connected",setup.role);
      if(open(room.customer)&&open(room.professional)){
        sendText(room.customer,"Your interpreter is connected. Please speak in English.");
        sendText(room.professional,"El intérprete está conectado. Puedes hablar español.");
      }
      return;
    }
    if(!ctx){ws.close(1008,"missing setup");return;}
    const room=rooms.get(ctx.bridge);
    if(!room||room.closing||room[ctx.role]!==ws)return;
    if(event.type==="error"){
      const code=String(event.description||"").match(/\b64\d{3}\b/)?.[0]||"unknown";
      console.error("Twilio relay error code",code);return;
    }
    if(event.type==="interrupt"){
      // The receiver is speaking: cancel unfinished interpretation sent to them.
      cancelJob(room,peerRole(ctx.role));
      console.info("Live Bridge translation interrupted",ctx.role);return;
    }
    if(event.type!=="prompt"||event.last!==true)return;
    const speech=String(event.voicePrompt||"").trim();
    if(!speech||speech.length>400)return;
    startTranslation(room,ctx,speech);
  });
  ws.on("close",()=>{
    if(!ctx)return;
    const room=rooms.get(ctx.bridge);
    if(!room||room[ctx.role]!==ws)return;
    room[ctx.role]=null;abortRoom(room);
    console.info("Live Bridge participant disconnected",ctx.role);
    if(!room.customer&&!room.professional){rooms.delete(ctx.bridge);return;}
    const check=setTimeout(()=>{void verifyDisconnectedLeg(ctx.bridge,ctx.role,ctx.callSid);},3000);
    check.unref();
  });
  ws.on("error",e=>console.error("Live Bridge socket",e?.name||"error"));
});
setInterval(()=>{
  for(const [id,room] of rooms){
    const elapsed=(Date.now()-room.started)/1000;
    if(elapsed>MAX_CALL_SECONDS)void finishRoom(id,"time-limit");
    else if(elapsed>55&&(!room.customer||!room.professional))void finishRoom(id,"connection-timeout");
  }
},5000).unref();
app.listen(PORT,"0.0.0.0",()=>console.info("Smart Job Live Bridge v2 listening on port",PORT));
