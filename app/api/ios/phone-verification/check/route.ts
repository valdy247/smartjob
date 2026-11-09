import {NextRequest} from "next/server";
import {answer,getVerificationContext,signedVerificationProof,twilioVerifyPost,twilioVerifyReady} from "@/lib/phone-verification";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const context=await getVerificationContext(req);
 if("response" in context)return context.response;
 const request=context.request;
 let payload:unknown;
 try{payload=await req.json();}catch{return answer({error:"invalid_request"},400);}
 const data=payload&&typeof payload==="object"?payload as Record<string,unknown>:{};
 if(data.requestId!==request.id)return answer({error:"invalid_request"},403);
 if(request.status!=="pending"||request.phone_verified_at)
   return answer({error:"verification_already_completed"},409);
 if(typeof data.code!=="string"||!/^[0-9]{4,10}$/.test(data.code))
   return answer({error:"invalid_code"},400);
 if(!twilioVerifyReady())return answer({error:"sms_not_configured"},503);
 try{
  const checked=await twilioVerifyPost("VerificationCheck",{
    To:request.destination_phone,Code:data.code
  });
  // Both Twilio's status and the number must match this user's saved request.
  if(!checked.ok||checked.result.status!=="approved"||
      checked.result.valid===false||checked.result.to!==request.destination_phone){
    return answer({error:checked.code===429?"too_many_attempts":"incorrect_or_expired_code"},checked.code===429?429:400);
  }
  const at=Math.floor(Date.now()/1000);
  const proof=signedVerificationProof(context.uid,request.id,request.destination_phone,at);
  if(!proof)return answer({error:"verification_unavailable"},503);
  const confirmed=await context.db.rpc("smartjob_confirm_sms_verification",{
    p_request_id:request.id,p_verified_at:at,p_signature:proof
  });
  if(confirmed.error||confirmed.data!==true){
    console.error("Smart Job SMS proof store failed",confirmed.error?.code||"unknown");
    return answer({error:"verification_save_failed"},503);
  }
  return answer({verified:true,needsOperatorApproval:true});
 }catch(e){
  console.error("Smart Job SMS check unavailable",e instanceof Error?e.name:"unknown");
  return answer({error:"verification_unavailable"},503);
 }
}
