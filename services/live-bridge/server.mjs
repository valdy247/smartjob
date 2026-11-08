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
const boundedEnv=(raw,fallback,min,max)=>{const n=Number(raw);return Number.isFinite(n)&&Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;};
const MAX_ACTIVE_BRIDGES=boundedEnv(process.env.SMARTJOB_MAX_CONCURRENT_CALLS,1,1,30);
const MAX_CALL_SECONDS=boundedEnv(process.env.SMARTJOB_MAX_CALL_SECONDS,600,60,1800);
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
  if(req.method==="POST"&&path==="/internal/end"){
    const stamp=req.headers["x-smartjob-timestamp"]||"",sig=req.headers["x-smartjob-signature"]||"";
    const seconds=Number(stamp);
    if(!/^1\d{9}$/.test(stamp)||Math.abs(Date.now()/1000-seconds)>30||!/^[a-f\d]{64}$/i.test(sig)){
      res.writeHead(403).end();return;
    }
    let input="";
    req.on("data",chunk=>{input+=chunk;if(input.length>300)req.destroy();});
    req.on("end",()=>{
      const bridge=input;
      const expected=createHmac("sha256",AUTH).update("smartjob-end-v1\n"+stamp+"\n"+bridge).digest("hex");
      if(!callSid(bridge)||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(expected,"hex"))){
        res.writeHead(403).end();return;
      }
      void finishRoom(bridge,"twilio-callback");
      res.writeHead(204).end();
    });
    return;
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
    if(!e164(route.customer)||!e164(route.twilio)||!(e164(route.owner)||/^client:sj_[a-f0-9]{32}$/i.test(route.owner))||!["en-US","es-ES"].includes(route.customerLanguage)||!["en-US","es-ES"].includes(route.ownerLanguage)||route.customerLanguage===route.ownerLanguage||!matchesRouteSignature(AUTH,route,p.routeSignature))return null;
    if(role==="customer"&&(data.from!==route.customer||data.to!==route.twilio||data.callSid!==bridge))return null;
    if(role==="professional"&&(data.from!==route.twilio||data.to!==route.owner))return null;
  }else{
    // Backward compatible allowlist: live pilot only, never arbitrary callers.
    if(role==="customer"&&(data.from!==EN||data.to!==TWILIO||data.callSid!==bridge))return null;
    if(role==="professional"&&(data.from!==TWILIO||data.to!==ES))return null;
  }
  return {role,bridge,callSid:data.callSid,sessionId:data.sessionId,connectionType:data.connectionType||"initial",customerLanguage:isNew?p.customerLanguage:"en-US",ownerLanguage:isNew?p.ownerLanguage:"es-ES"};
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
  const room={customer:null,professional:null,customerSid:null,professionalSid:null,started:Date.now(),jobs:{customer:null,professional:null},queues:{customer:[],professional:[]},contexts:{customer:null,professional:null},closing:false};
  rooms.set(id,room);return room;
}
function cancelJob(room,role,clearQueue=false){
  const active=room.jobs[role];
  if(active){active.abort();room.jobs[role]=null;}
  if(clearQueue)room.queues[role].length=0;
}
function abortRoom(room){cancelJob(room,"customer",true);cancelJob(room,"professional",true);}
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

async function interpret(source,role,sourceLanguage,signal,onToken){
  const body=JSON.stringify({original:source,role,sourceLanguage,stream:true});
  const stamp=String(Math.floor(Date.now()/1000));
  const sig=createHmac("sha256",AUTH).update("smartjob-bridge-v1\n"+stamp+"\n"+body).digest("hex");
  const response=await fetch(WEB_API,{method:"POST",headers:{"Content-Type":"application/json","x-smartjob-timestamp":stamp,"x-smartjob-signature":sig},
    body,signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
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
function queueTranslation(room,ctx,speech){
  const role=ctx.role;
  if(!open(room[peerRole(role)])){
    sendText(room[role],role==="customer"?"The other person has not connected.":"La otra persona todavía no está conectada.");
    return;
  }
  if(room.queues[role].length>=5){
    sendText(room[role],role==="customer"?"Please pause for the interpretation.":"Por favor, haz una pausa para la traducción.");
    return;
  }
  room.contexts[role]=ctx;
  room.queues[role].push(speech);
  pumpTranslation(room,role);
}
function pumpTranslation(room,role){
  if(room.closing||room.jobs[role]||!room.queues[role].length)return;
  const ctx=room.contexts[role],peer=room[peerRole(role)];
  if(!ctx||!open(peer)){room.queues[role].length=0;return;}
  const speech=room.queues[role].shift();
  const controller=new AbortController();
  room.jobs[role]=controller;
  const begun=Date.now();
  const stream=makeStreamingTokens((token,last)=>{
    if(!controller.signal.aborted&&open(peer)&&!room.closing)sendText(peer,token,{last,interruptible:true,preemptible:false});
  });
  void (async()=>{
    try{
      await interpret(speech,role,role==="customer"?ctx.customerLanguage:ctx.ownerLanguage,controller.signal,token=>stream.next(token));
      if(!controller.signal.aborted&&room.jobs[role]===controller){
        const count=stream.finish();
        if(!count)throw new Error("translation_empty");
        console.info("Live Bridge completed turn",role,"duration_ms",Date.now()-begun,"tokens",count);
      }
    }catch(e){
      if(!controller.signal.aborted){
        console.error("Live Bridge translation issue",e?.name==="AbortError"?"aborted":String(e?.message||"unknown").replace(/[^a-zA-Z0-9_]/g,"").slice(0,60));
        sendText(room[role],role==="customer"?"Please repeat that sentence.":"Repite esa frase, por favor.");
      }
    }finally{
      if(room.jobs[role]===controller)room.jobs[role]=null;
      pumpTranslation(room,role);
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
        sendText(room.customer,setup.customerLanguage==="en-US"?"Your interpreter is connected. Please speak English.":"El intérprete está conectado. Puedes hablar español.");
        sendText(room.professional,setup.ownerLanguage==="es-ES"?"El intérprete está conectado. Puedes hablar español.":"Your interpreter is connected. Please speak English.");
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
      cancelJob(room,peerRole(ctx.role),true);
      console.info("Live Bridge translation interrupted",ctx.role);return;
    }
    if(event.type!=="prompt"||event.last!==true)return;
    const speech=String(event.voicePrompt||"").trim();
    if(!speech||speech.length>400)return;
    queueTranslation(room,ctx,speech);
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
