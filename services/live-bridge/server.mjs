// VMV CALL — two Twilio ConversationRelay legs with GPT-4.1 mini text translation.
// Twilio performs speech-to-text and text-to-speech; OpenAI Realtime is not used.
// There is exactly one signed translation bridge per paired, paid telephone call.
import {createHmac,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {WebSocketServer,WebSocket} from "ws";
import {accountSid,callSid} from "./relay-core.mjs";
import {verifiedSetup,cleanPrompt,peerRole,textMessage} from "./conversation-relay.mjs";
import {directTranslationReady,translateDirect} from "./direct-translate.mjs";
import {canStreamTranslation,createVoiceChunks,streamTranslation} from "./translate-stream.mjs";
import {auditTwilioPush} from "./push-diagnostics.mjs";
import {appendOwnerTranscript,verifyTranscriptRequest,snapshotOwnerTranscript} from "./live-transcript.mjs";

const AUTH=process.env.TWILIO_AUTH_TOKEN||"";
const ACCOUNT=process.env.TWILIO_ACCOUNT_SID||"";
const WSS_URL=process.env.PUBLIC_WS_URL||"";
// Interpret directly on Render using its existing OpenAI key. No Vercel proxy.
const ENABLED=process.env.SMARTJOB_CONVERSATION_RELAY_ENABLED==="true";
const PORT=Number(process.env.PORT||3001);
const bounded=(v,fallback,low,high)=>{
  const num=Number(v);
  return Number.isInteger(num)&&num>=low&&num<=high?num:fallback;
};
const MAX_ROOMS=bounded(process.env.SMARTJOB_MAX_CONCURRENT_CALLS,1,1,30);
const MAX_SECONDS=bounded(process.env.SMARTJOB_MAX_CALL_SECONDS,14400,60,14400);
let translatorVerified=false;
// Verify the OpenAI key AND the actual model once at deployment; a key-shaped
// string alone cannot prove the service can translate. No live speech is sent.
const ready=()=>ENABLED&&directTranslationReady()&&translatorVerified;
async function preflightTranslator(){
 if(!ENABLED||!directTranslationReady()){
   console.error("VMV translator startup blocked",{reason:"missing_configuration"});
   return;
 }
 for(let attempt=1;attempt<=3;attempt++){
   const result=await translateDirect("Hello, good morning.","en-US","es-ES");
   if(result.translation){
     translatorVerified=true;
     console.info("VMV GPT-4.1 mini translation preflight passed");
     return;
   }
   console.error("VMV translator preflight failed",{attempt,reason:result.reason});
   if(attempt<3)await new Promise(resolve=>setTimeout(resolve,6000*attempt));
 }
 // Fail closed instead of charging for answered calls with no translation.
}
void preflightTranslator();
// Diagnostic-only: runs asynchronously and never gates active calls.
void auditTwilioPush();
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
  room.transcript.length=0; // Wipe temporary captions on hangup.
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
    metrics:{customer:0,professional:0,translations:0,failures:0},
    transcript:[],nextTranscriptSequence:0};
  rooms.set(id,room);return room;
}
async function translate(original,sourceLanguage,targetLanguage){
  const {translation,reason}=await translateDirect(original,sourceLanguage,targetLanguage);
  if(!translation){
    // Reason codes only. Never log the speech or translated text.
    console.error("VMV direct interpreter failed",{reason});
    return null;
  }
  return translation;
}
async function consume(room,ctx){
  if(ctx.processing||room.closing)return;
  ctx.processing=true;
  try{
    while(ctx.queue.length&&!room.closing){
      const queued=ctx.queue.shift();
      const utterance=queued.text;
      const peer=room.legs[peerRole(ctx.role)];
      if(!peer||!open(peer.ws)){
        sayTo(ctx.ws,ctx.sourceLanguage==="es-ES"
          ?"La otra persona todavía no está conectada."
          :"The other person is not connected yet.");
        continue;
      }
      const started=performance.now();
      const queueMs=Math.round(started-queued.receivedAt);
      let firstSendMs=null,modelMs=0;
      let mode="verified",spoken=null,delivered=false;
      const deliver=(token,last)=>{
        if(room.closing||rooms.get(room.id)!==room)return false;
        const accepted=send(peer.ws,textMessage(token,last));
        if(accepted&&firstSendMs===null)
          firstSendMs=Math.round(performance.now()-queued.receivedAt);
        return accepted;
      };
      // Only ordinary text can begin speaking before the model finishes.
      // Numbers, dates, allergens, prices etc. use the strict full-response lane.
      if(canStreamTranslation(utterance)){
        mode="stream";
        const chunks=createVoiceChunks(deliver);
        const result=await streamTranslation(utterance,ctx.sourceLanguage,ctx.targetLanguage,{
          onDelta:delta=>chunks.push(delta)
        });
        modelMs=result.totalMs;
        if(room.closing||rooms.get(room.id)!==room)break;
        if(result.translation){
          spoken=result.translation;
          try{
            if(!chunks.finish())throw Error("voice_unavailable");
            delivered=true;
          }catch{void finishRoom(room.id,"voice_stream_unavailable");break;}
        }else if(chunks.sent>0){
          // A partial TTS cycle must end with last:true. Do not continue an
          // incomplete or misleading translation without explaining the failure.
          const notice=ctx.targetLanguage==="es-ES"
            ?" Disculpa, la traducción se interrumpió. Repite, por favor."
            :" Sorry, translation was interrupted. Please repeat.";
          try{
            if(!chunks.abortWith(notice))throw Error("voice_unavailable");
          }catch{void finishRoom(room.id,"voice_stream_unavailable");break;}
          room.metrics.failures++;
          appendOwnerTranscript(room,{role:ctx.role,
            text:room.legs.professional?.sourceLanguage==="es-ES"
              ?"La traducción de esta intervención se interrumpió."
              :"Translation of this utterance was interrupted.",failed:true});
          console.warn("VMV interpreter streaming interrupted",{
            role:ctx.role,reason:result.reason,queueMs,
            firstSendMs,modelMs
          });
          continue;
        }else{
          // Nothing audible has been sent yet: the verified complete-response
          // translator is safe to use as a fallback.
          mode="fallback";
          const verifiedAt=performance.now();
          spoken=await translate(utterance,ctx.sourceLanguage,ctx.targetLanguage);
          modelMs+=Math.round(performance.now()-verifiedAt);
        }
      }else{
        const verifiedAt=performance.now();
        spoken=await translate(utterance,ctx.sourceLanguage,ctx.targetLanguage);
        modelMs=Math.round(performance.now()-verifiedAt);
      }
      if(room.closing||rooms.get(room.id)!==room)break;
      if(!spoken){
        room.metrics.failures++;
        appendOwnerTranscript(room,{role:ctx.role,
          text:room.legs.professional?.sourceLanguage==="es-ES"
            ?"No se pudo traducir esta intervención."
            :"This utterance could not be translated.",failed:true});
        if(!sayTo(ctx.ws,ctx.sourceLanguage==="es-ES"
          ?"No se pudo traducir. Por favor, repite la frase."
          :"Translation failed. Please repeat.")){
          void finishRoom(room.id,"notification_backpressure");break;
        }
      }else{
        if(!delivered&&!deliver(spoken,true)){
          void finishRoom(room.id,"translated_playback_unavailable");break;
        }
        room.metrics.translations++;
        appendOwnerTranscript(room,{role:ctx.role,
          text:ctx.role==="customer"?spoken:utterance});
        // No caller identity, speech, numbers, token content, or keys in logs.
        // firstSendMs starts at Twilio's final ASR prompt, NOT at the speaker's
        // last phoneme, and does not include TTS playback start.
        console.info("VMV interpreter timing",{
          role:ctx.role,mode,queueMs,modelMs,
          promptToFirstTextMs:firstSendMs,
          promptToLastTextMs:Math.round(performance.now()-queued.receivedAt)
        });
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
      translationProviderVerified:translatorVerified,
      reason:ready()?undefined:"not_configured",version:5
    }));
  }
  if(req.method==="GET"&&path==="/internal/transcript"){
    // Only signed owner-bound requests from our Next.js proxy can read captions.
    const u=new URL(req.url||"/","http://localhost");
    const bridge=u.searchParams.get("bridge")||"";
    const outbound=u.searchParams.get("outbound")||"";
    const stamp=String(req.headers["x-smartjob-timestamp"]||"");
    const signature=String(req.headers["x-smartjob-signature"]||"");
    const after=Number(u.searchParams.get("after")||"0");
    const authorized=verifyTranscriptRequest(AUTH,{stamp,bridge,outbound,signature});
    const room=authorized?rooms.get(bridge):null;
    const snapshot=room&&Number.isSafeInteger(after)&&after>=0
      ?snapshotOwnerTranscript(room,outbound,after):null;
    res.writeHead(snapshot?200:403,{
      "content-type":"application/json; charset=utf-8","cache-control":"no-store",
      "x-content-type-options":"nosniff"
    });
    return res.end(JSON.stringify(snapshot||{error:"not_authorized"}));
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
    ctx.queue.push({text:utterance,receivedAt:performance.now()});
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
