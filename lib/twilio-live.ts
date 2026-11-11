import {createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest} from "next/server";
import {authenticTwilio,PILOT_BASE,say,twiml,xmlEscape} from "@/lib/twilio-pilot";

export const E164=(value:string|undefined)=>/^\+[1-9]\d{7,14}$/.test(value||"")?value!:"";
export type RelayOptions={
  customer:string;twilio:string;owner:string;
  customerLanguage:"en-US"|"es-ES";ownerLanguage:"en-US"|"es-ES";
  assistantName?:string;
  voiceCustomer?:string;voiceOwner?:string;
  greetingCustomer?:string;greetingOwner?:string;
};
export function liveReady(){
  const ws=process.env.SMARTJOB_LIVE_WS_URL||"";
  return Boolean(process.env.SMARTJOB_LIVE_ENABLED==="true"&&
    /^wss:\/\/[a-zA-Z0-9.-]+(?::443)?\/relay$/.test(ws)&&
    (process.env.SMARTJOB_MULTI_TENANT_ENABLED==="true" ||
      (E164(process.env.SMARTJOB_DUO_EN_PHONE)&&E164(process.env.SMARTJOB_DUO_ES_PHONE)))&&
    E164(process.env.TWILIO_NUMBER)&&process.env.TWILIO_AUTH_TOKEN);
}
export function bridgeSignature(bridge:string){
  return createHmac("sha256",process.env.TWILIO_AUTH_TOKEN||"")
    .update("smartjob-live-partner-v1:"+bridge).digest("hex");
}
export function verifiedBridge(bridge:string,sig:string){
  if(!/^CA[a-f\d]{32}$/i.test(bridge)||!/^[a-f\d]{64}$/i.test(sig))return false;
  const expected=Buffer.from(bridgeSignature(bridge),"hex"),actual=Buffer.from(sig,"hex");
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function relayRouteSignature(bridge:string,config:RelayOptions){
  return createHmac("sha256",process.env.TWILIO_AUTH_TOKEN||"")
    .update(["smartjob-relay-v2",bridge,config.customer,config.twilio,config.owner,config.customerLanguage,config.ownerLanguage].join("\n"))
    .digest("hex");
}
export function validatedConfig(config:RelayOptions){
  return Boolean(E164(config.customer)&&E164(config.twilio)&&
    (E164(config.owner)||/^client:sj_[a-f0-9]{32}$/i.test(config.owner))&&
    ["en-US","es-ES"].includes(config.customerLanguage)&&
    ["en-US","es-ES"].includes(config.ownerLanguage)&&
    config.customerLanguage!==config.ownerLanguage);
}
// Each person has an independent ConversationRelay: Twilio provides STT/TTS,
// and our signed WebSocket bridge forwards text through GPT-4.1 mini.
export function bridgeTwiML(role:"customer"|"professional",bridge:string,config?:RelayOptions){
  if(!config||!validatedConfig(config)||!/^CA[a-f\d]{32}$/i.test(bridge))return twiml("<Hangup/>",403);
  const locale=role==="customer"?config.customerLanguage:config.ownerLanguage;
  const defaultGreeting=locale==="es-ES"
    ?"VMV Call. Estamos conectando la traducción. Un momento, por favor."
    :"VMV Call. We are connecting your interpreter. One moment, please.";
  const customGreeting=role==="customer"?config.greetingCustomer:config.greetingOwner;
  const greeting=(customGreeting&&customGreeting.length<=180)?customGreeting:defaultGreeting;
  const chosenVoice=role==="customer"?config.voiceCustomer:config.voiceOwner;
  // Allowed voice ids come from our own fixed catalogue (never from the webhook).
  const voice=chosenVoice&&/^[A-Za-z0-9_-]{20,100}$/.test(chosenVoice)
    ?' voice="'+xmlEscape(chosenVoice)+'"':"";
  const params:[string,string][]=[
    ["bridge",bridge],["role",role],
    ["customer",config.customer],["twilio",config.twilio],["owner",config.owner],
    ["customerLanguage",config.customerLanguage],["ownerLanguage",config.ownerLanguage],
    ["routeSignature",relayRouteSignature(bridge,config)]
  ];
  const tags=params.map(([key,value])=>
    '<Parameter name="'+key+'" value="'+xmlEscape(value)+'"/>').join("");
  // Flux detects meaningful end-of-turn instead of waiting for fixed silence.
  // Can be disabled without editing code if live-call recognition regresses.
  const fluxEnabled=process.env.SMARTJOB_RELAY_FLUX_ENABLED!=="false";
  const recognition=fluxEnabled
    ?' transcriptionProvider="Deepgram" speechModel="flux" eotThreshold="0.8"'+
      ' speechTimeout="3000" ignoreBackchannel="true" echoPromptFiltering="true"'
    :' speechTimeout="800"';
  const url=xmlEscape(process.env.SMARTJOB_LIVE_WS_URL||"");
  const action=xmlEscape(PILOT_BASE+"/api/twilio/live/ended?bridge="+bridge+
    "&sig="+bridgeSignature(bridge));
  return twiml('<Connect action="'+action+'" method="POST">'+
    '<ConversationRelay url="'+url+'" ttsLanguage="'+locale+
    '" transcriptionLanguage="'+locale+'" ttsProvider="ElevenLabs"'+voice+
    recognition+' events="speaker-events" interruptible="none" reportInputDuringAgentSpeech="speech"'+
    ' welcomeGreeting="'+xmlEscape(greeting)+'" welcomeGreetingInterruptible="none">'+
    tags+'</ConversationRelay></Connect><Hangup/>');
}
export async function verifiedLiveRequest(req:NextRequest,expectedTo?:string|null){
  return authenticTwilio(req,expectedTo);
}
export function notReady(){
  return twiml(say("VMV Call. El servicio de traducción no está disponible.")+"<Hangup/>");
}
export const baseUrl=PILOT_BASE;
