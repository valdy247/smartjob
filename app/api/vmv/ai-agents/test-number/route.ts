import {NextRequest} from "next/server";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";
import {verifyAiTestWebhook} from "@/lib/vmv-ai-agents/twilio-test";
import {findPhoneRoute} from "@/lib/phone-routes";
import {billingAdmin} from "@/lib/vmv-billing";


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
    !(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN))return false;
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
 const {data:chosen}=await db.from("vmv_ai_agents").select("id,status,configuration")
   .eq("id",choice.agent_id).eq("owner_id",ownerId).maybeSingle();
 if(!chosen||chosen.status!=="active")return false;
 const fields="id,owner_id,agent_id,twilio_account_sid,enabled,verified_ownership,disclosure_approved,approved_at";
 const {data:existing,error:lookupError}=await db.from("vmv_ai_voice_routes")
   .select(fields).eq("twilio_number",number).maybeSingle();
 if(lookupError)return false;
 let entry=existing;
 if(!entry&&process.env.VMV_AI_VOICE_AUTO_ENROLL==="true"){
   const c=chosen.configuration as Record<string,string>|null;
   const trained=c?.call_disclosure==="Sí"||c?.call_consent==="Sí"||
    c?.data_scope!==undefined||c?.personal_data!==undefined;
   if(!trained)return false;
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
export async function POST(req:NextRequest){
 const signed=await verifyAiTestWebhook(req);
 if(!signed)return twiml("<Hangup/>",403);
 const base=configuredBase();
 if(!base)return twiml("<Hangup/>",503);
 const sid=signed.get("CallSid")||"",account=signed.get("AccountSid")||"";
 const to=signed.get("To")||"";
 if(!callSid.test(sid)||!accountSid.test(account)||!e164.test(to)||
    (process.env.TWILIO_ACCOUNT_SID&&account!==process.env.TWILIO_ACCOUNT_SID))
   return twiml("<Hangup/>",403);

 const route=await findPhoneRoute(to);
 // This can only share a number provisioned for Smart Call and its owner.
 if(!route||!route.enabled)return twiml("<Hangup/>",403);
 const available=await agentReady(to,account,route.user_id);
 if(!available)return smartCall();

 const choice=req.nextUrl.searchParams.get("selection");
 if(choice==="menu"){
   const digits=signed.get("Digits")||"";
   if(digits==="2")return redirect(base,agentVoice);
   // Any other choice or a DTMF timeout retains the original voice service.
   return smartCall();
 }
 // Dial 1 for the original Smart Call experience; dial 2 for AI Agents.
 const action=xmlEscape(base+path+"?selection=menu");
 return twiml(
  '<Gather input="dtmf" numDigits="1" timeout="8" method="POST" action="'+action+'">'+
    say("Bienvenido a VMV. Para Smart Call y traducción, marca uno. Para hablar con el agente de inteligencia artificial, marca dos.","es-ES")+
    say("For Smart Call and translation, press one. To speak with our AI assistant, press two.","en-US")+
  '</Gather>'+
  (originalSmartCallUrl()?'<Redirect method="POST">'+xmlEscape(originalSmartCallUrl()!)+'</Redirect>':'<Hangup/>')
 );
}
