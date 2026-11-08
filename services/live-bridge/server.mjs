import { createHmac,timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer,WebSocket } from "ws";

const AUTH=process.env.TWILIO_AUTH_TOKEN||"";
const ACCOUNT=process.env.TWILIO_ACCOUNT_SID||"";
const WSS_URL=process.env.PUBLIC_WS_URL||"";
const WEB_API=process.env.SMARTJOB_TRANSLATE_URL||"https://smartjob-xi.vercel.app/api/twilio/live/translate";
const EN=process.env.SMARTJOB_DUO_EN_PHONE||"";
const ES=process.env.SMARTJOB_DUO_ES_PHONE||"";
const TWILIO=process.env.TWILIO_NUMBER||"";
const PORT=Number(process.env.PORT||3001);
const MAX_ACTIVE_BRIDGES=1;
const rooms=new Map();
if(!AUTH||!/^AC[a-f\d]{32}$/i.test(ACCOUNT)||!/^wss:\/\/[a-z0-9.-]+\/relay$/i.test(WSS_URL)||![EN,ES,TWILIO].every(v=>/^\+[1-9]\d{7,14}$/.test(v))){
 console.error("Required Live Bridge environment variables are missing or invalid.");
 process.exit(1);
}
const app=createServer((req,res)=>{
 if(req.method==="GET"&&req.url==="/health"){
  res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
  return res.end(JSON.stringify({ok:true,service:"smartjob-live-bridge",bridges:rooms.size}));
 }
 res.writeHead(404,{"content-type":"text/plain"}).end("Not found");
});
const wss=new WebSocketServer({noServer:true,maxPayload:12_000,perMessageDeflate:false});
function authenticUpgrade(req){
 const provided=req.headers["x-twilio-signature"];
 if(typeof provided!=="string")return false;
 const expected=createHmac("sha1",AUTH).update(WSS_URL).digest();
 let actual;
 try{actual=Buffer.from(provided,"base64");}catch{return false;}
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function send(ws,token){
 if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"text",token,last:true,interruptible:false}));
}
function notify(ws,text){send(ws,text);}
function roomFor(id){
 if(rooms.has(id))return rooms.get(id);
 if(rooms.size>=MAX_ACTIVE_BRIDGES)return null;
 const room={customer:null,professional:null,created:Date.now()};
 rooms.set(id,room);return room;
}
function safeSetup(payload){
 const role=payload?.customParameters?.role;
 const bridge=payload?.customParameters?.bridge;
 if((role!=="customer"&&role!=="professional")||!/^CA[a-f\d]{32}$/i.test(bridge||""))return null;
 if(payload.accountSid!==ACCOUNT||!/^CA[a-f\d]{32}$/i.test(payload.callSid||""))return null;
 if(role==="customer"&&!(payload.from===EN&&payload.to===TWILIO&&payload.callSid===bridge))return null;
 if(role==="professional"&&!(payload.from===TWILIO&&payload.to===ES))return null;
 return {role,bridge,callSid:payload.callSid,sessionId:payload.sessionId};
}
async function translate(input,role){
 const data=JSON.stringify({original:input,role});
 const stamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac("sha256",AUTH).update("smartjob-bridge-v1\n"+stamp+"\n"+data).digest("hex");
 const response=await fetch(WEB_API,{
  method:"POST",headers:{"Content-Type":"application/json","x-smartjob-timestamp":stamp,"x-smartjob-signature":signature},
  body:data,signal:AbortSignal.timeout(7500)
 });
 if(!response.ok){console.error("Live Bridge translate endpoint HTTP",response.status);return null;}
 const result=await response.json();
 if(typeof result.translation!=="string"||!result.translation.trim()||result.translation.length>600)return null;
 return result.translation;
}
app.on("upgrade",(req,socket,head)=>{
 if(req.url!=="/relay"||!authenticUpgrade(req)){
  socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");socket.destroy();return;
 }
 wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
});
wss.on("connection",ws=>{
 let ctx=null;
 let busy=false;
 let messages=0;
 ws.on("message",async raw=>{
  if(++messages>500){ws.close(1008,"too many messages");return;}
  let event;
  try{event=JSON.parse(raw.toString());}catch{ws.close(1008,"bad message");return;}
  if(event.type==="setup"){
   if(ctx){ws.close(1008,"duplicate setup");return;}
   const setup=safeSetup(event);
   if(!setup){ws.close(1008,"invalid session");return;}
   const room=roomFor(setup.bridge);
   if(!room){ws.close(1013,"pilot busy");return;}
   if(room[setup.role]&&room[setup.role]!==ws){
    ws.close(1008,"role already connected");return;
   }
   room[setup.role]=ws;
   ctx=setup;
   console.info("Live Bridge participant connected",setup.role);
   if(room.customer&&room.professional){
    notify(room.customer,"Mayuli is connected. You can speak English now.");
    notify(room.professional,"El cliente está conectado. Puedes hablar español.");
   }
   return;
  }
  if(!ctx)return ws.close(1008,"missing setup");
  if(event.type==="error"){console.error("Twilio relay reported error",String(event.description||"").slice(0,100));return;}
  if(event.type!=="prompt"||event.last!==true||busy)return;
  const speech=String(event.voicePrompt||"").trim();
  if(!speech||speech.length>400)return;
  const room=rooms.get(ctx.bridge);
  if(!room||room[ctx.role]!==ws)return;
  const otherRole=ctx.role==="customer"?"professional":"customer";
  const peer=room[otherRole];
  if(!peer||peer.readyState!==WebSocket.OPEN){
   notify(ws,ctx.role==="customer"?"Mayuli is not connected yet.":"El cliente todavía no está conectado.");
   return;
  }
  busy=true;
  try{
   const translated=await translate(speech,ctx.role);
   if(translated&&peer.readyState===WebSocket.OPEN&&rooms.get(ctx.bridge)===room){
    send(peer,translated);
   }else{
    notify(ws,ctx.role==="customer"?"Translation unavailable. Please repeat.":"No se pudo traducir. Repite la frase.");
   }
  }catch(e){
   console.error("Live Bridge request failed",e instanceof Error?e.name:"unknown");
   notify(ws,ctx.role==="customer"?"Please repeat.":"Repite la frase.");
  }finally{busy=false;}
 });
 ws.on("close",()=>{
  if(!ctx)return;
  const room=rooms.get(ctx.bridge);if(!room||room[ctx.role]!==ws)return;
  room[ctx.role]=null;
  const otherRole=ctx.role==="customer"?"professional":"customer";
  if(room[otherRole])notify(room[otherRole],ctx.role==="customer"?"El cliente ha terminado la llamada.":"Mayuli has ended the call.");
  if(!room.customer&&!room.professional)rooms.delete(ctx.bridge);
  console.info("Live Bridge participant disconnected",ctx.role);
 });
 ws.on("error",e=>console.error("Live Bridge socket",e.name));
});
setInterval(()=>{
 for(const [id,room] of rooms)if(!room.customer&&!room.professional&&Date.now()-room.created>60000)rooms.delete(id);
},30000).unref();
app.listen(PORT,"0.0.0.0",()=>console.info("Smart Job Live Bridge listening on port",PORT));
