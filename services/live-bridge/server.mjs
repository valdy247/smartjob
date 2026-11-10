// VMV CALL — two Twilio ConversationRelay legs with GPT-4.1 mini text translation.
// Twilio performs speech-to-text and text-to-speech; OpenAI Realtime is not used.
// There is exactly one signed translation bridge per paired, paid telephone call.
import {createHmac,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {WebSocketServer,WebSocket} from "ws";
import {accountSid,callSid} from "./relay-core.mjs";
import {verifiedSetup,cleanPrompt,peerRole,textMessage} from "./conversation-relay.mjs";

const AUTH=process.env.TWILIO_AUTH_TOKEN||"";
const ACCOUNT=process.env.TWILIO_ACCOUNT_SID||"";
const WSS_URL=process.env.PUBLIC_WS_URL||"";
const TRANSLATE_URL=process.env.SMARTJOB_TRANSLATE_URL||"";
const ENABLED=process.env.SMARTJOB_CONVERSATION_RELAY_ENABLED==="true";
const PORT=Number(process.env.PORT||3001);
const bounded=(v,fallback,low,high)=>{
  const num=Number(v);
  return Number.isInteger(num)&&num>=low&&num<=high?num:fallback;
};
const MAX_ROOMS=bounded(process.env.SMARTJOB_MAX_CONCURRENT_CALLS,1,1,30);
const MAX_SECONDS=bounded(process.env.SMARTJOB_MAX_CALL_SECONDS,14400,60,14400);
const validUrl=()=>/^https:\/\/[a-z0-9.-]+(?:\/[a-zA-Z0-9/_-]+)?\/api\/twilio\/live\/translate$/i.test(TRANSLATE_URL);
const ready=()=>ENABLED&&validUrl();
const rooms=new Map();
const open=ws=>ws?.readyState===WebSocket.OPEN;
const MAX_BUFFERED_BYTES=128000;

if(!AUTH||!accountSid(ACCOUNT)||!/^wss:\/\/[a-z0-9.-]+(?::443)?\/relay$/i.test(WSS_URL)){
  console.error("VMV ConversationRelay configuration is invalid");
  process.exit(1);
}
function send(ws,message){
  if(!open(ws)||ws.bufferedAmount>MAX_BUFFERED_BYTES)return false;
  try{ws.send(JSON.stringify(message));return true;}catch{return false;}
}
function sayTo(ws,text){return send(ws,textMessage(text));}
function authenticatedUpgrade(req){
  const signature=req.headers["x-twilio-signature"];
  if(typeof signature!=="string")return false;
  const digest=createHmac("sha1",AUTH).update(WSS_URL).digest();
  let actual;
  try{actual=Buffer.from(signature,"base64");}catch{return false;}
  return actual.length===digest.length&&timingSafeEqual(actual,digest);
}
function authenticatedEnd(stamp,sig,body){
  if(!/^1\d{9}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>30||
     !/^[a-f\d]{64}$/i.test(sig)||!callSid(body))return false;
  const digest=createHmac("sha256",AUTH)
    .update("smartjob-end-v1\n"+stamp+"\n"+body).digest();
  const actual=Buffer.from(sig,"hex");
  return actual.length===digest.length&&timingSafeEqual(actual,digest);
}
async function terminateTwilio(sid){
  try{
    await fetch("https://api.twilio.com/2010-04-01/Accounts/"+ACCOUNT+"/Calls/"+sid+".json",{
      method:"POST",
      headers:{Authorization:"Basic "+Buffer.from(ACCOUNT+":"+AUTH).toString("base64"),
        "Content-Type":"application/x-www-form-urlencoded"},
      body:"Status=completed",signal:AbortSignal.timeout(4500),cache:"no-store"
    });
  }catch{console.error("VMV Twilio leg cleanup request failed");}
}
async function finishRoom(id,reason){
  const room=rooms.get(id);
  if(!room||room.closing)return;
  room.closing=true;
  rooms.delete(id);
  console.info("VMV ConversationRelay call ended",{
    reason,seconds:Math.floor((Date.now()-room.created)/1000),
    customerPrompts:room.metrics.customer,professionalPrompts:room.metrics.professional,
    translations:room.metrics.translations,failures:room.metrics.failures
  });
  const connected=["customer","professional"].map(role=>room.legs[role]).filter(Boolean);
  for(const ctx of connected){ctx.queue.length=0;try{ctx.ws.close();}catch{}}
  // Close BOTH legs so a silent/orphaned call cannot keep consuming minutes.
  await Promise.allSettled(connected.map(ctx=>terminateTwilio(ctx.callSid)));
}
function createRoom(id){
  if(rooms.has(id))return rooms.get(id);
  if(rooms.size>=MAX_ROOMS)return null;
  const room={id,created:Date.now(),closing:false,
    legs:{customer:null,professional:null},
    metrics:{customer:0,professional:0,translations:0,failures:0}};
  rooms.set(id,room);return room;
}
async function translate(original,sourceLanguage,targetLanguage){
  const body=JSON.stringify({original,sourceLanguage,targetLanguage});
  const stamp=String(Math.floor(Date.now()/1000));
  const sig=createHmac("sha256",AUTH)
    .update("vmv-conversationrelay-translate-v1\n"+stamp+"\n"+body).digest("hex");
  try{
    const response=await fetch(TRANSLATE_URL,{
      method:"POST",headers:{"Content-Type":"application/json",
        "x-smartjob-timestamp":stamp,"x-smartjob-signature":sig},
      body,signal:AbortSignal.timeout(7500),cache:"no-store"
    });
    if(!response.ok){
      console.error("VMV text interpretation unavailable",{status:response.status});
      return null;
    }
    const parsed=await response.json();
    return typeof parsed.translation==="string"&&parsed.translation.trim()&&
      parsed.translation.length<=700?parsed.translation.trim():null;
  }catch(err){
    console.error("VMV text interpretation failed",err instanceof Error?err.name:"unknown");
    return null;
  }
}
async function consume(room,ctx){
  if(ctx.processing||room.closing)return;
  ctx.processing=true;
  try{
    while(ctx.queue.length&&!room.closing){
      const utterance=ctx.queue.shift();
      const peer=room.legs[peerRole(ctx.role)];
      if(!peer||!open(peer.ws)){
        sayTo(ctx.ws,ctx.sourceLanguage==="es-ES"
          ?"La otra persona todavía no está conectada.":"The other person is not connected yet.");
        continue;
      }
      const spoken=await translate(utterance,ctx.sourceLanguage,ctx.targetLanguage);
      if(room.closing||rooms.get(room.id)!==room)break;
      if(!spoken){
        room.metrics.failures++;
        if(!sayTo(ctx.ws,ctx.sourceLanguage==="es-ES"
          ?"No se pudo traducir. Por favor, repite la frase."
          :"Translation failed. Please repeat.")){
          void finishRoom(room.id,"notification_backpressure");break;
        }
      }else{
        room.metrics.translations++;
        if(!sayTo(peer.ws,spoken)){
          void finishRoom(room.id,"translated_playback_unavailable");break;
        }
      }
    }
  }finally{ctx.processing=false;}
}
const app=createServer((req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname;
  if(["GET","HEAD"].includes(req.method)&&["/","/health"].includes(path)){
    res.writeHead(ready()?200:503,{"content-type":"application/json","cache-control":"no-store"});
    return res.end(req.method==="HEAD"?"":JSON.stringify({
      ok:ready(),service:"smartjob-live-bridge",engine:"twilio-conversationrelay",
      bridges:rooms.size,capacity:MAX_ROOMS,accepting:ready()&&rooms.size<MAX_ROOMS,
      reason:ready()?undefined:"not_configured",version:5
    }));
  }
  if(req.method==="POST"&&path==="/internal/end"){
    const stamp=String(req.headers["x-smartjob-timestamp"]||"");
    const sig=String(req.headers["x-smartjob-signature"]||"");
    let body="";
    req.on("data",part=>{
      body+=part;
      if(body.length>100)req.destroy();
    });
    req.on("end",()=>{
      if(!authenticatedEnd(stamp,sig,body)){res.writeHead(403).end();return;}
      void finishRoom(body,"twilio_callback");
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
});
const wss=new WebSocketServer({noServer:true,maxPayload:20000,perMessageDeflate:false});
app.on("upgrade",(req,socket,head)=>{
  if(req.url!=="/relay"||!ready()||!authenticatedUpgrade(req)){
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
});
wss.on("connection",ws=>{
  let ctx=null,count=0;
  ws.on("message",raw=>{
    if(++count>MAX_SECONDS*4+100){ws.close(1008,"message_limit");return;}
    let message;
    try{message=JSON.parse(raw.toString());}catch{ws.close(1008,"invalid_json");return;}
    if(message.type==="setup"){
      if(ctx){ws.close(1008,"duplicate_setup");return;}
      const setup=verifiedSetup(message,ACCOUNT,AUTH);
      if(!setup){ws.close(1008,"unauthorized_setup");return;}
      const room=createRoom(setup.bridge);
      if(!room||room.closing||room.legs[setup.role]){
        ws.close(1013,"bridge_unavailable");return;
      }
      ctx={...setup,ws,queue:[],processing:false};
      room.legs[setup.role]=ctx;
      console.info("VMV ConversationRelay leg connected",{role:ctx.role});
      if(room.legs.customer&&room.legs.professional){
        sayTo(room.legs.customer.ws,room.legs.customer.sourceLanguage==="es-ES"
          ?"El intérprete está conectado. Puedes hablar normalmente."
          :"The interpreter is connected. You can speak normally.");
        sayTo(room.legs.professional.ws,room.legs.professional.sourceLanguage==="es-ES"
          ?"El intérprete está conectado. Puedes hablar normalmente."
          :"The interpreter is connected. You can speak normally.");
      }
      return;
    }
    if(!ctx){ws.close(1008,"missing_setup");return;}
    const room=rooms.get(ctx.bridge);
    if(!room||room.closing||room.legs[ctx.role]!==ctx)return;
    if(message.type==="error"){
      // Never log transcripts or phone identifiers.
      console.error("VMV ConversationRelay error",String(message.description||"provider_error").slice(0,90));
      void finishRoom(room.id,"twilio_relay_error");return;
    }
    if(message.type!=="prompt")return;
    const utterance=cleanPrompt(message);
    if(!utterance)return;
    room.metrics[ctx.role]++;
    if(ctx.queue.length>=4){
      room.metrics.failures++;
      sayTo(ctx.ws,ctx.sourceLanguage==="es-ES"
        ?"Un momento, por favor. Habla un poco más despacio."
        :"Please speak a little more slowly.");
      return;
    }
    ctx.queue.push(utterance);
    void consume(room,ctx);
  });
  ws.on("close",()=>{if(ctx)void finishRoom(ctx.bridge,"relay_disconnected");});
  ws.on("error",()=>{if(ctx)void finishRoom(ctx.bridge,"relay_socket_error");});
});
setInterval(()=>{
  for(const [id,room] of rooms){
    const age=Date.now()-room.created;
    if(age>MAX_SECONDS*1000)void finishRoom(id,"duration_limit");
    else if(age>30000&&(!room.legs.customer||!room.legs.professional))
      void finishRoom(id,"partner_connection_timeout");
  }
},2000).unref();
app.listen(PORT,"0.0.0.0",()=>console.info("VMV ConversationRelay bridge listening",PORT));
