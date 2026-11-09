import {NextRequest} from "next/server";
import {answer,getVerificationContext,twilioVerifyPost,twilioVerifyReady} from "@/lib/phone-verification";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const context=await getVerificationContext(req);
 if("response" in context)return context.response;
 if(!await paidServiceAllowed(context.uid,"direct_call"))return answer({error:"live_paid_plan_required"},402);
 const request=context.request;
 let payload:unknown;
 try{payload=await req.json();}catch{return answer({error:"invalid_request"},400);}
 const requestId=(payload&&typeof payload==="object"&&"requestId" in payload)?payload.requestId:null;
 if(requestId!==request.id)return answer({error:"invalid_request"},403);
 if(request.status!=="pending"||request.phone_verified_at)
   return answer({error:"verification_already_completed"},409);
 if(!twilioVerifyReady())return answer({error:"sms_not_configured"},503);
 const {data,error}=await context.db.rpc("smartjob_reserve_sms_verification",{p_request_id:request.id});
 if(error){console.error("Smart Job SMS rate reservation failed",error.code||"unknown");
   return answer({error:"verification_unavailable"},503);}
 if(data!==true)return answer({error:"sms_rate_limit",retryAfterSeconds:60},429);
 try{
  const sent=await twilioVerifyPost("Verifications",{To:request.destination_phone,Channel:"sms"});
  if(!sent.ok||sent.result.status!=="pending"){
    console.error("Smart Job SMS send failed",sent.code,typeof sent.result.code==="number"?sent.result.code:"unknown");
    return answer({error:sent.code===429?"sms_rate_limit":"sms_delivery_failed"},sent.code===429?429:502);
  }
  return answer({sent:true,maskedPhone:request.destination_phone.slice(0,2)+"••••"+request.destination_phone.slice(-2)});
 }catch(e){
  console.error("Smart Job SMS network unavailable",e instanceof Error?e.name:"unknown");
  return answer({error:"sms_delivery_failed"},502);
 }
}
