import {createHmac,timingSafeEqual} from "node:crypto";
import {type ActivePhoneRoute} from "@/lib/phone-routes";
import {baseUrl} from "@/lib/twilio-live";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";

const sid=/^CA[a-f\d]{32}$/i;
const uuid=/^[a-f\d-]{36}$/i;
const phone=/^\+[1-9]\d{7,14}$/;
export type LanguageChoice="en"|"es";
export const languageMenuEnabled=()=>process.env.SMARTJOB_LANGUAGE_IVR_ENABLED==="true";

// Temporary Spanish-caller / English-owner test is limited to the existing
// explicitly allowlisted billing pilot user on the Preview branch.
// No production or other customer's language settings are changed.
export const testSpanishToEnglishFor=(userId:string)=>Boolean(
 process.env.VERCEL_ENV==="preview"&&
 process.env.SMARTJOB_STRIPE_MODE==="test"&&
 process.env.SMARTJOB_TEST_SPANISH_TO_ENGLISH==="true"&&
 /^[a-f0-9-]{36}$/i.test(userId)&&
 process.env.SMARTJOB_BILLING_TEST_OWNER_ID===userId
);
export function interpretedLanguagesFor(route:ActivePhoneRoute,ivr:boolean){
 const reverse=ivr&&testSpanishToEnglishFor(route.user_id);
 return {
  customerLanguage:ivr?(reverse?"es-ES" as const:"en-US" as const):route.customer_language,
  ownerLanguage:ivr?(reverse?"en-US" as const:"es-ES" as const):route.owner_language
 };
}
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
export function menuResponse(greeting?:string,attempt=0,spanishToEnglishTest=false){
 const action=xmlEscape(baseUrl+"/api/twilio/live/language?attempt="+attempt);
 const intro=greeting&&greeting.length<=180?say(greeting,"es-ES"):"";
 // Default on no selection: Spanish. No AI is charged until option 1 is chosen.
 return twiml('<Gather input="dtmf" numDigits="1" timeout="6" actionOnEmptyResult="true" method="POST" action="'+action+'">'+
   intro+
   (spanishToEnglishTest
    ?say("Bienvenida a VMV Call. Para español con traducción al inglés, marque uno.","es-ES")+
     say("Para español sin traducción, marque dos o permanezca en la línea.","es-ES")
    :say("Welcome to VMV Call. For English with live interpretation, press one.","en-US")+
     say("Para español, marque dos o permanezca en la línea.","es-ES"))+
   '</Gather>'+say("No se pudo seleccionar un idioma.","es-ES")+'<Hangup/>');
}
export function directClientTwiml(bridge:string,route:ActivePhoneRoute,caller:string,limitSeconds=600){
 const token=selectionSignature(bridge,route.id,caller,"es");
 const action=xmlEscape(baseUrl+"/api/twilio/live/direct-ended?bridge="+bridge+"&route="+route.id+
   "&caller="+encodeURIComponent(caller)+"&proof="+token);
 const client="sj_"+route.user_id.replaceAll("-","");
 // Direct calls avoid the AI relay and a second PSTN leg. The separate
 // national-minute reservation is created before this TwiML is returned.
 return twiml(say("Le conectamos. Un momento por favor.","es-ES")+
  '<Dial answerOnBridge="true" timeout="30" timeLimit="'+String(Math.max(60,Math.min(600,Math.floor(limitSeconds))))+'" record="do-not-record" action="'+action+
  '" method="POST"><Client><Identity>'+xmlEscape(client)+'</Identity>'+
  '<Parameter name="vmv_mode" value="direct"/><Parameter name="vmv_language" value="es"/>'+
  '</Client></Dial><Hangup/>');
}
