import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { authenticTwilio, PILOT_BASE, say, twiml, xmlEscape } from "@/lib/twilio-pilot";

export const E164=(value:string|undefined)=>/^\+[1-9]\d{7,14}$/.test(value||"")?value!:"";
export function liveReady(){
 const ws=process.env.SMARTJOB_LIVE_WS_URL||"";
 return Boolean(process.env.SMARTJOB_LIVE_ENABLED==="true"&&
  /^wss:\/\/[a-zA-Z0-9.-]+(?::443)?\/relay$/.test(ws)&&
  E164(process.env.SMARTJOB_DUO_EN_PHONE)&&E164(process.env.SMARTJOB_DUO_ES_PHONE)&&
  E164(process.env.TWILIO_NUMBER)&&process.env.TWILIO_AUTH_TOKEN);
}
export function bridgeSignature(bridge:string):string{
 return createHmac("sha256",process.env.TWILIO_AUTH_TOKEN||"")
   .update("smartjob-live-partner-v1:"+bridge).digest("hex");
}
export function verifiedBridge(bridge:string,sig:string):boolean{
 if(!/^CA[a-fA-F0-9]{32}$/.test(bridge)||!/^[a-fA-F0-9]{64}$/.test(sig))return false;
 const expected=Buffer.from(bridgeSignature(bridge),"hex"),actual=Buffer.from(sig,"hex");
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function bridgeTwiML(role:"customer"|"professional",bridge:string){
 const english=role==="customer";
 const locale=english?"en-US":"es-ES";
 const greet=english
  ?"Welcome to Smart Job. This call uses live AI translation. We are connecting you with Mayuli. Please speak English."
  :"Hola Mayuli. Esta llamada utiliza traducción en vivo con inteligencia artificial. Habla español con normalidad.";
 // Each leg has its own language and synthesized audio; the two original
 // telephone audios are deliberately never joined together.
 const relay='<Connect><ConversationRelay url="'+xmlEscape(process.env.SMARTJOB_LIVE_WS_URL||"")+
  '" transcriptionLanguage="'+locale+'" ttsLanguage="'+locale+
  '" ttsProvider="ElevenLabs" welcomeGreeting="'+xmlEscape(greet)+
  '" welcomeGreetingInterruptible="none" speechTimeout="800">'+
  '<Parameter name="bridge" value="'+bridge+'"/>'+
  '<Parameter name="role" value="'+role+'"/>'+
  '</ConversationRelay></Connect><Hangup/>';
 return twiml(relay);
}
export async function verifiedLiveRequest(req:NextRequest,expectedTo?:string){
 return authenticTwilio(req,expectedTo);
}
export function notReady(){
 return twiml(say("Smart Job. El modo de traducción en vivo está en preparación.")+"<Hangup/>");
}
export const baseUrl=PILOT_BASE;
