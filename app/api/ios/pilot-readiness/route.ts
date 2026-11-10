import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin,getBillingAccount,balance} from "@/lib/vmv-billing";
import {ownerPreviewPilot} from "@/lib/vmv-entitlements";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const isE164=(s:string)=>/^\+[1-9]\d{7,14}$/.test(s);

export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const account=await getBillingAccount(uid);
 if(!ownerPreviewPilot(account))return NextResponse.json({error:"private_pilot_only"},{status:403,headers:noStore});
 const db=billingAdmin();
 if(!db)return NextResponse.json({error:"billing_unavailable"},{status:503,headers:noStore});
 const {data:route,error:routeError}=await db.from("smartjob_phone_routes")
  .select("twilio_number,enabled,receive_method").eq("user_id",uid).eq("enabled",true)
  .limit(1).maybeSingle();
 if(routeError)return NextResponse.json({error:"routing_unavailable"},{status:503,headers:noStore});
 const number=String(route?.twilio_number||"");
 const expectedNumber=String(process.env.TWILIO_NUMBER||"");
 const lineReady=Boolean(route?.enabled&&route.receive_method==="ios_app"&&
   isE164(number)&&number===expectedNumber);
 const sid=process.env.TWILIO_ACCOUNT_SID||"";
 const token=process.env.TWILIO_AUTH_TOKEN||"";
 const base=process.env.TWILIO_WEBHOOK_BASE_URL||"";
 const expectedUrl=base.replace(/\/$/,"")+"/api/twilio/live/voice";
 const ws=process.env.SMARTJOB_LIVE_WS_URL||"";
 const healthUrl=/^wss:\/\/[a-zA-Z0-9.-]+\/relay$/.test(ws)
  ?ws.replace(/^wss:/,"https:").replace(/\/relay$/,"/health"):"";
 let engineReady=false,engineName="unavailable";
 let webhookReady=false,webhookChecked=false,webhookPost=false;
 const tasks:Promise<void>[]=[];
 if(healthUrl)tasks.push((async()=>{
  try{
   const res=await fetch(healthUrl,{cache:"no-store",signal:AbortSignal.timeout(4000)});
   const health=await res.json().catch(()=>null);
   engineName=health?.engine==="openai-realtime-translate"?"OpenAI Realtime":"not_ready";
   engineReady=res.ok&&health?.ok===true&&
     health?.engine==="openai-realtime-translate"&&health?.accepting===true;
  }catch{}
 })());
 if(lineReady&&/^AC[a-f\d]{32}$/i.test(sid)&&token&&/^https:\/\/[a-zA-Z0-9.-]+/.test(base))tasks.push((async()=>{
  try{
   const url="https://api.twilio.com/2010-04-01/Accounts/"+sid+
     "/IncomingPhoneNumbers.json?PhoneNumber="+encodeURIComponent(number)+"&PageSize=1";
   const res=await fetch(url,{headers:{
     Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")},
     cache:"no-store",signal:AbortSignal.timeout(4500)});
   if(!res.ok)return;
   const data=await res.json();
   const twilio=(data.incoming_phone_numbers||[])[0];
   webhookChecked=true;
   webhookReady=twilio?.voice_url===expectedUrl;
   webhookPost=String(twilio?.voice_method||"").toUpperCase()==="POST";
  }catch{}
 })());
 await Promise.allSettled(tasks);
 return NextResponse.json({
  pilot:true,lineReady,engineReady,engineName,
  webhookReady,webhookChecked,webhookPost,
  pushConfigured:process.env.SMARTJOB_IOS_VOICE_ENABLED==="true"&&
    /^CR[a-f\d]{32}$/i.test(process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID||""),
  minutesAvailable:balance(account),
  callLimitSeconds:Number(process.env.SMARTJOB_TEST_CALL_CAP_SECONDS||60),
  nextStep:!lineReady?"La línea de prueba no está asignada.":!engineReady?
    "Configura OPENAI_API_KEY y SMARTJOB_REALTIME_TRANSLATE_ENABLED=true en Render.":
    !webhookChecked?"No se pudo confirmar el webhook de Twilio.":
    !webhookReady||!webhookPost?"Configura Twilio Voice webhook POST al enlace Preview de VMV Call.":
    "Conecta tu iPhone, llama desde otro teléfono, marca 1 y contesta.",
 },{headers:noStore});
}
