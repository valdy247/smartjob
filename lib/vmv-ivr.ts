import {createHmac,timingSafeEqual} from "node:crypto";
import {type ActivePhoneRoute} from "@/lib/phone-routes";
import {baseUrl} from "@/lib/twilio-live";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";

const sid=/^CA[a-f\d]{32}$/i;
const uuid=/^[a-f\d-]{36}$/i;
const phone=/^\+[1-9]\d{7,14}$/;
export type LanguageChoice="en"|"es";
export const languageMenuEnabled=()=>process.env.SMARTJOB_LANGUAGE_IVR_ENABLED==="true";
export function languageDecision(digit:string,attempt=0):"direct"|"translate"|"retry"|"hangup"{
 if(digit==="1")return "translate";
 if(digit==="2"||digit==="")return "direct";
 return attempt>0?"hangup":"retry";
}

export const ivrEligible=(route:ActivePhoneRoute)=>Boolean(route.enabled&&route.receive_method==="ios_app"&&
  process.env.SMARTJOB_IOS_VOICE_ENABLED==="true"&&
  Boolean(process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID));

export function selectionSignature(bridge:string,routeId:string,from:string,choice:LanguageChoice){
 const token=process.env.TWILIO_AUTH_TOKEN||"";
 return createHmac("sha256",token).update(["vmv-ivr-choice-v1",bridge,routeId,from,choice].join("\n")).digest("hex");
}
export function validSelectionSignature(bridge:string,routeId:string,from:string,choice:string,signature:string){
 if(!sid.test(bridge)||!uuid.test(routeId)||!phone.test(from)||!["es","en"].includes(choice)||
    !/^[a-f\d]{64}$/i.test(signature)||!process.env.TWILIO_AUTH_TOKEN)return false;
 const expected=Buffer.from(selectionSignature(bridge,routeId,from,choice as LanguageChoice),"hex");
 const supplied=Buffer.from(signature,"hex");
 return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
export function menuResponse(greeting?:string,attempt=0){
 const action=xmlEscape(baseUrl+"/api/twilio/live/language?attempt="+attempt);
 const intro=greeting&&greeting.length<=180?say(greeting,"es-ES"):"";
 // Default on no selection: Spanish. No AI is charged until option 1 is chosen.
 return twiml('<Gather input="dtmf" numDigits="1" timeout="6" actionOnEmptyResult="true" method="POST" action="'+action+'">'+
   intro+
   say("Welcome to VMV Call. For English with live interpretation, press one.","en-US")+
   say("Para español, marque dos o permanezca en la línea.","es-ES")+
   '</Gather>'+say("No se pudo seleccionar un idioma.","es-ES")+'<Hangup/>');
}
export function directClientTwiml(bridge:string,route:ActivePhoneRoute,caller:string){
 const token=selectionSignature(bridge,route.id,caller,"es");
 const action=xmlEscape(baseUrl+"/api/twilio/live/direct-ended?bridge="+bridge+"&route="+route.id+
   "&caller="+encodeURIComponent(caller)+"&proof="+token);
 const client="sj_"+route.user_id.replaceAll("-","");
 // Direct calls never use the AI relay, minutes reservation or a PSTN leg back to the carrier.
 return twiml(say("Le conectamos. Un momento por favor.","es-ES")+
  '<Dial answerOnBridge="true" timeout="30" record="do-not-record" action="'+action+
  '" method="POST"><Client><Identity>'+xmlEscape(client)+'</Identity>'+
  '<Parameter name="vmv_mode" value="direct"/><Parameter name="vmv_language" value="es"/>'+
  '</Client></Dial><Hangup/>');
}
