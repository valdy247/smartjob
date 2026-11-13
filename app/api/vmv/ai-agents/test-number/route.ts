import {NextRequest} from "next/server";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";
import {verifyAiTestWebhook} from "@/lib/vmv-ai-agents/twilio-test";
import {findPhoneRoute} from "@/lib/phone-routes";
import {billingAdmin} from "@/lib/vmv-billing";
import {aiAgentModelPathAvailable} from "@/lib/vmv-ai-agents/model";
import {businessWeek,checkCallPolicy,decideCall,localParts,type CallPolicy} from "@/lib/vmv-ai-agents/call-policy";


export const runtime="nodejs";
export const dynamic="force-dynamic";

// Optional single-number test switch. No existing Twilio webhook is modified.
// Once explicitly approved, Twilio can POST its test number to this endpoint.
// The default/fallback always hands the call back to the unmodified Smart Call route.
const path="/api/vmv/ai-agents/test-number";

const agentVoice="/api/vmv/ai-agents/voice";
const callSid=/^CA[a-f\d]{32}$/i;
const accountSid=/^AC[a-f\d]{32}$/i;
const e164=/^\+[1-9]\d{7,14}$/;

function configuredBase(){
 const base=process.env.VMV_AI_TEST_BASE_URL||"";
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base))return null;
 return base;
}
function redirect(base:string,destination:string){
 const target=xmlEscape(base+destination);
 return twiml('<Redirect method="POST">'+target+'</Redirect>');
}
function originalSmartCallUrl(){
 const raw=process.env.VMV_AI_ORIGINAL_VOICE_WEBHOOK||"";
 try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||!url.hostname||url.username||url.password)return null;
   if(url.pathname==="/api/vmv/ai-agents/test-number")return null;
   return url.toString();
 }catch{return null;}
}
function smartCall(){
 const original=originalSmartCallUrl();
 return original?twiml('<Redirect method="POST">'+xmlEscape(original)+'</Redirect>'):
   twiml("<Hangup/>",503);
}

async function agentReady(number:string,account:string,ownerId:string){
 if(process.env.VERCEL_ENV!=="preview"||process.env.VMV_AI_VOICE_PILOT_ENABLED!=="true"||
    !aiAgentModelPathAvailable())return false;
 if(!/^[a-f0-9-]{36}$/i.test(process.env.VMV_AI_TEST_OWNER_ID||"")||
    process.env.VMV_AI_TEST_OWNER_ID!==ownerId)return false;
 // Preserve the pre-pilot Smart Call webhook before even considering enrollment.
 if(!originalSmartCallUrl())return false;
 const db=billingAdmin();
 if(!db)return false;
 // The owner explicitly selects an agent in web or iPhone before Twilio enrollment.
 const {data:phone}=await db.from("smartjob_phone_routes").select("id,user_id")
   .eq("twilio_number",number).eq("user_id",ownerId).eq("enabled",true).maybeSingle();
 if(!phone)return false;
 const {data:choice}=await db.from("vmv_ai_phone_selections").select("agent_id")
   .eq("route_id",phone.id).eq("owner_id",ownerId).maybeSingle();
 if(!choice?.agent_id)return false;
 const {data:chosen}=await db.from("vmv_ai_agents").select("id,kind,status,configuration")
   .eq("id",choice.agent_id).eq("owner_id",ownerId).maybeSingle();
 if(!chosen||chosen.status!=="active")return false;
 const fields="id,owner_id,agent_id,twilio_account_sid,enabled,verified_ownership,disclosure_approved,approved_at";
 const {data:existing,error:lookupError}=await db.from("vmv_ai_voice_routes")
   .select(fields).eq("twilio_number",number).maybeSingle();
 if(lookupError)return false;
 let entry=existing;
 const config=chosen.configuration as Record<string,string>|null;
 const disclosed=config?.call_disclosure==="Sí"||config?.call_consent==="Sí";
 const phoneChannel=config?.channel==="Teléfono"||config?.channel==="Teléfono y chat"||
   (!config?.channel&&chosen.kind==="calls");
 if(!disclosed||!phoneChannel)return false;
 // The owner can change which agent handles FUTURE calls. Running calls keep
 // the immutable version pinned in vmv_ai_voice_calls.
 if(entry&&entry.agent_id!==choice.agent_id&&process.env.VMV_AI_VOICE_AUTO_ENROLL==="true"){
   if(entry.owner_id!==ownerId||entry.twilio_account_sid!==account||
      !entry.verified_ownership||!entry.disclosure_approved||!entry.enabled)return false;
   const {data:switched,error:switchError}=await db.from("vmv_ai_voice_routes")
    .update({agent_id:choice.agent_id}).eq("id",entry.id).eq("owner_id",ownerId)
    .eq("twilio_account_sid",account).select(fields).single();
   if(switchError||!switched)return false;
   entry=switched;
 }
 if(!entry&&process.env.VMV_AI_VOICE_AUTO_ENROLL==="true"){
   const {data:created,error:creationError}=await db.from("vmv_ai_voice_routes")
     .insert({
       owner_id:ownerId,agent_id:choice.agent_id,twilio_number:number,
       twilio_account_sid:account,enabled:true,verified_ownership:true,
       disclosure_approved:true,approved_at:new Date().toISOString()
     }).select(fields).single();
   if(creationError||!created)return false;
   entry=created;
 }
 if(!entry||entry.owner_id!==ownerId||entry.agent_id!==choice.agent_id||
    entry.twilio_account_sid!==account||!entry.enabled||
    !entry.verified_ownership||!entry.disclosure_approved||!entry.approved_at)return false;
 return true; // Each call is still capped by the server-only voice quota RPC.
}
type OwnerRoute=NonNullable<Awaited<ReturnType<typeof findPhoneRoute>>>;
type SavedDecision={policy:CallPolicy;action:ReturnType<typeof decideCall>};
async function savedDecision(route:OwnerRoute):Promise<SavedDecision|null>{
 const db=billingAdmin();if(!db)throw Error("Phone call settings backend unavailable");
 const {data,error}=await db.from("vmv_ai_call_settings").select("*")
  .eq("route_id",route.id).eq("owner_id",route.user_id).maybeSingle();
 if(error)throw Error("Phone call settings lookup failed");
 if(!data)return null; // Preserve the existing 1/2 Twilio menu for unconfigured accounts.
 const policy=checkCallPolicy(data);
 let week=policy.schedule;
 if(policy.use_business_hours){
  const {data:choice,error:selError}=await db.from("vmv_ai_phone_selections").select("agent_id")
   .eq("route_id",route.id).eq("owner_id",route.user_id).maybeSingle();
  if(selError||!choice?.agent_id)throw Error("Business hours need a selected agent");
  const {data:agent,error:agentError}=await db.from("vmv_ai_agents").select("configuration")
   .eq("id",choice.agent_id).eq("owner_id",route.user_id).maybeSingle();
  if(agentError)throw Error("Business hours lookup failed");
  const hours=businessWeek(agent?.configuration as Record<string,unknown>|null);
  if(!hours)throw Error("Business hours incomplete");
  week=hours;
 }
 return {policy,action:decideCall(policy,localParts(new Date(),policy.time_zone),week)};
}
function closed(policy?:CallPolicy|null){
 return twiml(say(policy?.closed_message||
  "Lo sentimos, no podemos atender tu llamada en este momento.","es-ES")+"<Hangup/>");
}
function fallback(policy:CallPolicy|null,translationReady:boolean){
 return policy?.outside_action==="message"?closed(policy):
  translationReady?smartCall():closed(policy);
}
async function callBrand(route:OwnerRoute):Promise<string>{
 const db=billingAdmin();if(!db)return "";
 const {data:selection}=await db.from("vmv_ai_phone_selections")
  .select("agent_id").eq("route_id",route.id).eq("owner_id",route.user_id).maybeSingle();
 if(!selection?.agent_id)return "";
 const {data:agent}=await db.from("vmv_ai_agents").select("configuration,business_id")
  .eq("id",selection.agent_id).eq("owner_id",route.user_id).maybeSingle();
 const businessName=agent?.configuration?.business_name;
 if(typeof businessName==="string"&&businessName.trim())return businessName.trim().slice(0,75);
 if(!agent?.business_id)return "";
 const {data:business}=await db.from("vmv_ai_businesses").select("name")
  .eq("id",agent.business_id).eq("owner_id",route.user_id).maybeSingle();
 const name=String(business?.name||"").trim();
 return name&&name!=="Mi negocio"?name.slice(0,75):"";
}
function menuPrompt(base:string,brand:string){
 const name=brand?"Gracias por llamar a "+brand+". ":"Gracias por llamar. ";
 const action=xmlEscape(base+path+"?selection=menu");
 return twiml('<Gather input="dtmf" numDigits="1" timeout="8" method="POST" action="'+action+'">'+
  say(name+"Para hablar con el asistente de inteligencia artificial, marca dos. Para hablar con traducción, marca uno.","es-ES")+
  say("For the AI assistant, press two. For a translated call, press one.","en-US")+
  '</Gather>'+
  (originalSmartCallUrl()?'<Redirect method="POST">'+xmlEscape(originalSmartCallUrl()!)+'</Redirect>':"<Hangup/>"));
}
function ringOwner(base:string,route:OwnerRoute,policy:CallPolicy,caller:string){
 // The owner must have explicitly chosen this mode; no hidden outbound dialing.
 const destination=route.destination_phone;
 if(!/^\+[1-9]\d{7,14}$/.test(destination)||destination===route.twilio_number||
    destination===caller)return twiml('<Redirect method="POST">'+xmlEscape(base+agentVoice)+'</Redirect>');
 return twiml(
  '<Dial callerId="'+xmlEscape(route.twilio_number)+'" timeout="'+policy.ring_seconds+
  '" answerOnBridge="true" method="POST" action="'+xmlEscape(base+path+"?flow=after_owner")+'">'+
  '<Number>'+xmlEscape(destination)+'</Number></Dial>'+
  '<Hangup/>'
 );
}
export async function POST(req:NextRequest){
 const signed=await verifyAiTestWebhook(req);
 if(!signed){
  console.warn("[vmv-ai-voice-pilot] rejected unsigned Twilio webhook");
  return twiml("<Hangup/>",403);
 }
 const base=configuredBase();
 if(!base)return twiml("<Hangup/>",503);
 const sid=signed.get("CallSid")||"",account=signed.get("AccountSid")||"";
 const to=signed.get("To")||"",caller=signed.get("From")||"";
 if(!callSid.test(sid)||!accountSid.test(account)||!e164.test(to)||
    (process.env.TWILIO_ACCOUNT_SID&&account!==process.env.TWILIO_ACCOUNT_SID))
  return twiml("<Hangup/>",403);
 const route=await findPhoneRoute(to);
 if(!route||!route.enabled||route.user_id!==process.env.VMV_AI_TEST_OWNER_ID)
  return twiml("<Hangup/>",403);
 if(process.env.VERCEL_ENV!=="preview"||process.env.VMV_AI_VOICE_PILOT_ENABLED!=="true"||
    !originalSmartCallUrl())return smartCall();

 let saved:SavedDecision|null;
 try{saved=await savedDecision(route);}
 catch(error){
  console.error("[vmv-ai-voice-pilot] owner call policy unavailable",
   error instanceof Error?error.message:"unknown");
  return twiml(say("La configuración de atención no está disponible. Por favor, llama más tarde.")+"<Hangup/>");
 }
 const policy=saved?.policy||null,decision=saved?.action||null;
 const flow=req.nextUrl.searchParams.get("flow");
 if(flow==="after_owner"){
  if(!policy||policy.agent_mode!=="after_no_answer"||!decision?.agentAvailable)
   return fallback(policy,Boolean(decision?.translationAvailable));
  const status=signed.get("DialCallStatus");
  if(status==="completed"||status==="answered")return twiml("<Hangup/>");
  if(!["no-answer","busy","failed"].includes(status||""))return closed(policy);
  const ready=await agentReady(to,account,route.user_id);
  return ready?redirect(base,agentVoice):fallback(policy,decision.translationAvailable);
 }
 if(flow!==null)return closed(policy);
 const selection=req.nextUrl.searchParams.get("selection");
 if(selection==="menu"){
  const digits=signed.get("Digits")||"";
  if(digits==="1")return decision&&!decision.translationAvailable?
    closed(policy):smartCall();
  if(digits!=="2")return decision?
    fallback(policy,decision.translationAvailable):smartCall();
  if(decision&&!decision.agentAvailable)return fallback(policy,decision.translationAvailable);
  const ready=await agentReady(to,account,route.user_id);
  if(!ready){
   console.warn("[vmv-ai-voice-pilot] owner selected agent not ready");
   return twiml(say("El asistente no está disponible en este momento.","es-ES")+
    (decision?.translationAvailable?'<Redirect method="POST">'+
     xmlEscape(originalSmartCallUrl()!)+'</Redirect>':"<Hangup/>"));
  }
  return policy?.agent_mode==="after_no_answer"?
   ringOwner(base,route,policy,caller):redirect(base,agentVoice);
 }
 if(selection!==null)return closed(policy);
 // Accounts without settings keep their tested 1 -> Smart Call, 2 -> AI behavior.
 if(!saved)return menuPrompt(base,await callBrand(route));
 const outcome=decision!;
 if(outcome.action==="message")return closed(policy);
 if(outcome.action==="translation")return smartCall();
 if(outcome.action==="menu")return menuPrompt(base,await callBrand(route));
 const ready=await agentReady(to,account,route.user_id);
 if(!ready)return fallback(policy,outcome.translationAvailable);
 return outcome.action==="ring_owner"?
  ringOwner(base,route,policy!,caller):redirect(base,agentVoice);
}
