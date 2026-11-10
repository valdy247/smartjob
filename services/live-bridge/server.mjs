// VMV CALL: Twilio Media Streams <-> OpenAI Realtime Translate.
// Each paid, signed two-leg call owns two isolated OpenAI translation sessions.
// Incoming media is G.711 mu-law 8k; OpenAI accepts/returns PCM16LE 24k.
import {createHmac,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {WebSocketServer,WebSocket} from "ws";
import {accountSid,callSid,e164,validReceiver,matchesRouteSignature} from "./relay-core.mjs";
import {mulaw8ToPcm24,pcm24ToMulaw8,safePcm24Chunk} from "./media-codec.mjs";

const AUTH=process.env.TWILIO_AUTH_TOKEN||"";
const ACCOUNT=process.env.TWILIO_ACCOUNT_SID||"";
const WSS_URL=process.env.PUBLIC_WS_URL||"";
const API_KEY=process.env.OPENAI_API_KEY||"";
const PORT=Number(process.env.PORT||3001);
const ENABLED=process.env.SMARTJOB_REALTIME_TRANSLATE_ENABLED==="true";
const maxEnv=(s,floor,low,high)=>{
  const v=Number(s);
  return Number.isInteger(v)?Math.max(low,Math.min(high,v)):floor;
};
const MAX_ROOMS=maxEnv(process.env.SMARTJOB_MAX_CONCURRENT_CALLS,1,1,30);
const MAX_SECONDS=maxEnv(process.env.SMARTJOB_MAX_CALL_SECONDS,600,60,1800);
const MAX_AI_BUFFER=40000;
const MAX_TWILIO_BUFFER=512000;
const SILENCE_200MS=Buffer.alloc(1600,0xff);
const rooms=new Map();
const ready=()=>ENABLED&&/^sk-/.test(API_KEY);
const isOpen=ws=>ws?.readyState===WebSocket.OPEN;

if(!AUTH||!accountSid(ACCOUNT)||!/^wss:\/\/[a-z0-9.-]+(?::443)?\/relay$/i.test(WSS_URL)){
  console.error("Invalid Twilio WebSocket configuration");
  process.exit(1);
}

function validSignature(provided,expected){
  if(typeof provided!=="string"||!/^[a-f0-9]{64}$/i.test(provided))return false;
  const a=Buffer.from(provided,"hex"),b=Buffer.from(expected,"hex");
  return a.length===b.length&&timingSafeEqual(a,b);
}
function verifyUpgrade(req){
  const provided=req.headers["x-twilio-signature"];
  if(typeof provided!=="string")return false;
  const expected=createHmac("sha1",AUTH).update(WSS_URL).digest();
  let received;
  try{received=Buffer.from(provided,"base64");}catch{return false;}
  return received.length===expected.length&&timingSafeEqual(expected,received);
}
function configureStart(packet){
  const s=packet?.start,p=s?.customParameters||{};
  if(!s||!callSid(s.callSid)||s.accountSid!==ACCOUNT||
     !/^MZ[a-f0-9]{32}$/i.test(s.streamSid||"")||
     !["customer","professional"].includes(p.role)||!callSid(p.bridge))return null;
  // No unsigned pilot/caller shortcuts: only a paid tenant's signed route is accepted.
  const route={bridge:p.bridge,customer:p.customer,twilio:p.twilio,owner:p.owner,
    customerLanguage:p.customerLanguage,ownerLanguage:p.ownerLanguage};
  if(!e164(route.customer)||!e164(route.twilio)||!validReceiver(route.owner)||
     !["en-US","es-ES"].includes(route.customerLanguage)||
     !["en-US","es-ES"].includes(route.ownerLanguage)||
     route.customerLanguage===route.ownerLanguage||
     !matchesRouteSignature(AUTH,route,p.routeSignature))return null;
  if(p.role==="customer"&&s.callSid!==p.bridge)return null;
  if(p.role==="professional"&&s.callSid===p.bridge)return null;
  return {role:p.role,bridge:p.bridge,callSid:s.callSid,streamSid:s.streamSid,
    customerLanguage:route.customerLanguage,ownerLanguage:route.ownerLanguage,
    safetyId:createHmac("sha256",AUTH).update(route.owner).digest("hex")};
}
function peer(role){return role==="customer"?"professional":"customer";}
function sendTwilio(ws,packet){
  if(!isOpen(ws)||ws.bufferedAmount>MAX_TWILIO_BUFFER)return false;
  ws.send(JSON.stringify(packet));return true;
}
async function callApi(sid,form){
  return fetch("https://api.twilio.com/2010-04-01/Accounts/"+ACCOUNT+"/Calls/"+sid+".json",{
    method:form?"POST":"GET",
    headers:form?{Authorization:"Basic "+Buffer.from(ACCOUNT+":"+AUTH).toString("base64"),
      "Content-Type":"application/x-www-form-urlencoded"}:
      {Authorization:"Basic "+Buffer.from(ACCOUNT+":"+AUTH).toString("base64")},
    body:form?new URLSearchParams(form).toString():undefined,
    signal:AbortSignal.timeout(4500),cache:"no-store"
  });
}
async function finishRoom(id,why){
  const room=rooms.get(id);
  if(!room||room.closing)return;
  room.closing=true;
  console.info("VMV Realtime bridge finished",why);
  for(const side of ["customer","professional"]){
    const ai=room.ai[side];
    if(isOpen(ai?.ws)){
      try{ai.ws.send(JSON.stringify({type:"session.close"}));}catch{}
    }
    if(ai?.ws)try{ai.ws.close();}catch{}
    if(isOpen(room.legs[side]?.ws))try{room.legs[side].ws.close();}catch{}
  }
  rooms.delete(id);
  await Promise.allSettled(
    [room.legs.customer?.callSid,room.legs.professional?.callSid]
      .filter(callSid).map(sid=>callApi(sid,{Status:"completed"}))
  );
}
function noRoomYet(id){
  if(rooms.has(id))return rooms.get(id);
  if(rooms.size>=MAX_ROOMS)return null;
  const room={id,createdAt:Date.now(),closing:false,legs:{customer:null,professional:null},
    ai:{customer:null,professional:null},starting:false};
  rooms.set(id,room);return room;
}
function sendAudioToPeer(room,role,base64){
  const target=room.legs[peer(role)];
  const ai=room.ai[role];
  if(!target||!isOpen(target.ws)||!ai||room.closing)return;
  let pcm;
  try{pcm=safePcm24Chunk(Buffer.from(base64,"base64"));}catch{void finishRoom(room.id,"bad_openai_audio");return;}
  const joined=ai.outRemainder.length?Buffer.concat([ai.outRemainder,pcm]):pcm;
  const usable=Math.floor(joined.length/6)*6;
  ai.outRemainder=Buffer.from(joined.subarray(usable));
  if(!usable)return;
  let mu;
  try{mu=pcm24ToMulaw8(joined.subarray(0,usable));}catch{void finishRoom(room.id,"audio_codec_failed");return;}
  // Twilio buffers packets and plays them in sequence. Avoid unbounded queueing.
  for(let offset=0;offset<mu.length;offset+=1600){
    const portion=mu.subarray(offset,offset+1600);
    if(!sendTwilio(target.ws,{event:"media",streamSid:target.streamSid,
      media:{payload:portion.toString("base64")}})){
      void finishRoom(room.id,"twilio_audio_backpressure");return;
    }
  }
}
function flushInput(ai){
  if(!ai.ready||!isOpen(ai.ws))return;
  while(ai.pending.length>=1600){
    const chunk=ai.pending.subarray(0,1600);
    ai.pending=Buffer.from(ai.pending.subarray(1600));
    const pcm=mulaw8ToPcm24(chunk);
    if(ai.ws.bufferedAmount>MAX_AI_BUFFER)throw new Error("openai_audio_backpressure");
    ai.ws.send(JSON.stringify({type:"session.input_audio_buffer.append",audio:pcm.toString("base64")}));
  }
}
function pushInput(room,side,packet){
  const ai=room.ai[side];
  if(!ai||room.closing||typeof packet?.media?.payload!=="string")return;
  let samples;
  try{samples=Buffer.from(packet.media.payload,"base64");}catch{return;}
  if(!samples.length||samples.length>3200)return;
  // 200 ms input frames. Preserve silence from the carrier, even between phrases.
  ai.pending=Buffer.concat([ai.pending,samples]);
  if(ai.pending.length>16000)ai.pending=Buffer.from(ai.pending.subarray(-16000));
  try{flushInput(ai);}catch{void finishRoom(room.id,"openai_input_overflow");}
}
function startAi(room,side){
  const ctx=room.legs[side];
  const target=side==="customer"?ctx.ownerLanguage:ctx.customerLanguage;
  const language=target==="es-ES"?"es":"en";
  const ai={ws:null,ready:false,pending:Buffer.alloc(0),outRemainder:Buffer.alloc(0)};
  room.ai[side]=ai;
  const ws=new WebSocket(
    "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate",
    {headers:{Authorization:"Bearer "+API_KEY,
      "OpenAI-Safety-Identifier":ctx.safetyId},handshakeTimeout:10000,maxPayload:2000000,
      perMessageDeflate:false}
  );
  ai.ws=ws;
  ws.on("message",raw=>{
    if(room.closing)return;
    let event;
    try{event=JSON.parse(raw.toString());}catch{void finishRoom(room.id,"openai_invalid_json");return;}
    if(event.type==="session.created"){
      ws.send(JSON.stringify({type:"session.update",session:{audio:{output:{language}}}}));
    }else if(event.type==="session.updated"){
      ai.ready=true;
      try{flushInput(ai);}catch{void finishRoom(room.id,"openai_input_overflow");}
    }else if(event.type==="session.output_audio.delta"&&typeof event.delta==="string"){
      sendAudioToPeer(room,side,event.delta);
    }else if(event.type==="error"){
      // Never print audio, transcript or API secrets.
      console.error("VMV Realtime error",String(event.error?.code||"provider_error").slice(0,70));
      void finishRoom(room.id,"openai_provider_error");
    }
  });
  ws.on("error",()=>void finishRoom(room.id,"openai_socket_error"));
  ws.on("close",()=>{if(!room.closing)void finishRoom(room.id,"openai_disconnected");});
}
function maybeStart(room){
  if(room.starting||room.closing||!room.legs.customer||!room.legs.professional)return;
  room.starting=true;
  startAi(room,"customer");
  startAi(room,"professional");
  console.info("VMV Realtime sessions initiated");
}
const app=createServer((req,res)=>{
  const route=new URL(req.url||"/","http://localhost").pathname;
  if(["GET","HEAD"].includes(req.method)&&["/","/health"].includes(route)){
    res.writeHead(ready()?200:503,{"content-type":"application/json","cache-control":"no-store"});
    return res.end(req.method==="HEAD"?"":JSON.stringify({ok:ready(),
      service:"smartjob-live-bridge",engine:"openai-realtime-translate",
      bridges:rooms.size,capacity:MAX_ROOMS,accepting:ready()&&rooms.size<MAX_ROOMS,
      reason:ready()?undefined:"not_configured",version:4}));
  }
  if(req.method==="POST"&&route==="/internal/end"){
    const stamp=String(req.headers["x-smartjob-timestamp"]||"");
    const sig=String(req.headers["x-smartjob-signature"]||"");
    if(!/^1\d{9}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>30){
      res.writeHead(403).end();return;
    }
    let body="";
    req.on("data",b=>{body+=b;if(body.length>100)req.destroy();});
    req.on("end",()=>{
      const expected=createHmac("sha256",AUTH).update("smartjob-end-v1\n"+stamp+"\n"+body).digest("hex");
      if(!callSid(body)||!validSignature(sig,expected)){
        res.writeHead(403).end();return;
      }
      void finishRoom(body,"twilio_callback");
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
});
const wss=new WebSocketServer({noServer:true,maxPayload:16000,perMessageDeflate:false});
app.on("upgrade",(req,socket,head)=>{
  if(req.url!=="/relay"||!ready()||!verifyUpgrade(req)){
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");socket.destroy();return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
});
wss.on("connection",ws=>{
  let ctx=null,packetCount=0;
  ws.on("message",raw=>{
    if(++packetCount>MAX_SECONDS*80+200){ws.close(1008,"message_limit");return;}
    let p;
    try{p=JSON.parse(raw.toString());}catch{ws.close(1008,"invalid_json");return;}
    if(p.event==="connected")return;
    if(p.event==="start"){
      if(ctx){ws.close(1008,"duplicate_start");return;}
      ctx=configureStart(p);
      if(!ctx){ws.close(1008,"route_auth_failed");return;}
      const room=noRoomYet(ctx.bridge);
      if(!room||room.closing||room.legs[ctx.role]){
        ws.close(1013,"no_capacity");return;
      }
      room.legs[ctx.role]={...ctx,ws};
      maybeStart(room);
      return;
    }
    if(!ctx)return ws.close(1008,"missing_start");
    const room=rooms.get(ctx.bridge);
    if(!room||room.closing||room.legs[ctx.role]?.ws!==ws)return;
    if(p.event==="media"){
      if(p.streamSid!==ctx.streamSid)return;
      pushInput(room,ctx.role,p);
    }else if(p.event==="stop"){
      void finishRoom(ctx.bridge,"twilio_stop");
    }
  });
  ws.on("close",()=>{
    if(ctx)void finishRoom(ctx.bridge,"twilio_disconnect");
  });
  ws.on("error",()=>{if(ctx)void finishRoom(ctx.bridge,"twilio_socket_error");});
});
setInterval(()=>{
  for(const [id,room] of rooms){
    const age=Date.now()-room.createdAt;
    if(age>MAX_SECONDS*1000)void finishRoom(id,"duration_limit");
    else if(age>30000&&(!room.legs.customer||!room.legs.professional))
      void finishRoom(id,"second_leg_timeout");
  }
},2000).unref();
app.listen(PORT,"0.0.0.0",()=>console.info("VMV OpenAI Realtime Media Bridge listening",PORT));
