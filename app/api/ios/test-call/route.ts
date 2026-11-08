import {NextRequest} from "next/server";
import {answer,getVerificationContext} from "@/lib/phone-verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// The Preview-only test calls the already-verified owner's Twilio Voice identity.
// It does not modify the existing Twilio phone number's incoming-call webhook.
export async function POST(req:NextRequest){
 if(process.env.SMARTJOB_IOS_TEST_MODE!=="true")
   return answer({error:"test_call_not_enabled"},403);
 const context=await getVerificationContext(req);
 if("response" in context)return context.response;
 if(!context.request.phone_verified_at||context.request.status!=="pending")
   return answer({error:"phone_not_verified"},403);
 const sid=process.env.TWILIO_ACCOUNT_SID||"";
 const apiKey=process.env.TWILIO_API_KEY_SID||"";
 const apiSecret=process.env.TWILIO_API_KEY_SECRET||"";
 const callerId=process.env.TWILIO_NUMBER||"";
 if(!/^AC[a-f\d]{32}$/i.test(sid)||!/^SK[a-f\d]{32}$/i.test(apiKey)||
    !apiSecret||!/^\+[1-9]\d{7,14}$/.test(callerId))
   return answer({error:"twilio_test_not_configured"},503);
 // Rate-limit per verified request: at most 3 calls per 24 hours and 1 per minute.
 const reserved=await context.db.rpc("smartjob_reserve_ios_voip_test_call",{
   p_request_id:context.request.id
 });
 if(reserved.error){
   console.error("Smart Job test call limit failed",reserved.error.code||"unknown");
   return answer({error:"test_call_unavailable"},503);
 }
 if(reserved.data!==true)return answer({error:"test_call_rate_limit"},429);
 const identity="sj_"+context.uid.replaceAll("-","");
 const instructions='<Response><Say voice="alice" language="es-ES">Esta es una llamada de prueba de Smart Job. Si escuchas mi voz, tu iPhone ya puede recibir llamadas de la aplicación.</Say><Pause length="2"/></Response>';
 const params=new URLSearchParams({
   To:"client:"+identity,From:callerId,Twiml:instructions,TimeLimit:"45",Timeout:"20"
 });
 try{
   const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls.json",{
     method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
     headers:{"Content-Type":"application/x-www-form-urlencoded",
       Authorization:"Basic "+Buffer.from(apiKey+":"+apiSecret).toString("base64")},
     body:params.toString()
   });
   const result=await response.json().catch(()=>({})) as Record<string,unknown>;
   if(!response.ok||typeof result.sid!=="string"||!/^CA[a-f\d]{32}$/i.test(result.sid)){
     console.error("Smart Job iOS test call rejected by Twilio",{http:response.status,
       code:typeof result.code==="number"?result.code:"unknown"});
     return answer({error:"twilio_test_call_failed",providerCode:typeof result.code==="number"?result.code:null},502);
   }
   console.info("Smart Job iOS verified VoIP test queued");
   return answer({queued:true,callSid:result.sid,message:"La llamada de prueba fue solicitada a Twilio. Puedes consultar su resultado sin consumir otro intento."});
 }catch(e){
   console.error("Smart Job iOS test call network failure",e instanceof Error?e.name:"unknown");
   return answer({error:"twilio_test_call_failed"},502);
 }
}
