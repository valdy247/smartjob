import {NextRequest} from "next/server";
import {authenticTwilio,say,twiml,xmlEscape} from "@/lib/twilio-pilot";
import {findPhoneRoute} from "@/lib/phone-routes";
import {billingAdmin} from "@/lib/vmv-billing";


export const runtime="nodejs";
export const dynamic="force-dynamic";

// Optional single-number test switch. No existing Twilio webhook is modified.
// Once explicitly approved, Twilio can POST its test number to this endpoint.
// The default/fallback always hands the call back to the unmodified Smart Call route.
const path="/api/vmv/ai-agents/test-number";
const currentSmartCall="/api/twilio/live/voice";
const agentVoice="/api/vmv/ai-agents/voice";
const callSid=/^CA[a-f\d]{32}$/i;
const accountSid=/^AC[a-f\d]{32}$/i;
const e164=/^\+[1-9]\d{7,14}$/;

function configuredBase(){
 const base=process.env.TWILIO_WEBHOOK_BASE_URL||"";
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base))return null;
 return base;
}
function redirect(base:string,destination:string){
 const target=xmlEscape(base+destination);
 return twiml('<Redirect method="POST">'+target+'</Redirect>');
}
function smartCall(base:string){return redirect(base,currentSmartCall);}

async function agentReady(number:string,account:string,ownerId:string){
 if(process.env.VERCEL_ENV!=="preview"||process.env.VMV_AI_VOICE_PILOT_ENABLED!=="true"||
    !(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN))return false;
 if(!/^[a-f0-9-]{36}$/i.test(process.env.VMV_AI_TEST_OWNER_ID||"")||
    process.env.VMV_AI_TEST_OWNER_ID!==ownerId)return false;
 const db=billingAdmin();
 if(!db)return false;
 const {data:entry,error}=await db.from("vmv_ai_voice_routes")
   .select("id,owner_id,agent_id,twilio_account_sid,enabled,verified_ownership,disclosure_approved,approved_at")
   .eq("twilio_number",number)
   .eq("twilio_account_sid",account)
   .eq("owner_id",ownerId)
   .eq("enabled",true).maybeSingle();
 if(error||!entry||!entry.verified_ownership||!entry.disclosure_approved||!entry.approved_at)return false;
 const {data:agent,error:agentError}=await db.from("vmv_ai_agents").select("id")
   .eq("id",entry.agent_id).eq("owner_id",ownerId).eq("status","active").maybeSingle();
 if(agentError||!agent)return false;
 return true; // Pilot billing is capped by the dedicated 5-calls/day RPC.
}
export async function POST(req:NextRequest){
 const signed=await authenticTwilio(req,null);
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
 if(!available)return smartCall(base);

 const choice=req.nextUrl.searchParams.get("selection");
 if(choice==="menu"){
   const digits=signed.get("Digits")||"";
   if(digits==="2")return redirect(base,agentVoice);
   // Any other choice or a DTMF timeout retains the original voice service.
   return smartCall(base);
 }
 // Dial 1 for the original Smart Call experience; dial 2 for AI Agents.
 const action=xmlEscape(base+path+"?selection=menu");
 return twiml(
  '<Gather input="dtmf" numDigits="1" timeout="8" method="POST" action="'+action+'">'+
    say("Bienvenido a VMV. Para Smart Call y traducción, marca uno. Para hablar con el agente de inteligencia artificial, marca dos.","es-ES")+
    say("For Smart Call and translation, press one. To speak with our AI assistant, press two.","en-US")+
  '</Gather>'+
  '<Redirect method="POST">'+xmlEscape(base+currentSmartCall)+'</Redirect>'
 );
}
