import {NextRequest} from "next/server";
import {callbackDb,callbackEnabled,callerPhone,validUuid,verifiedCallbackWebhook,CALLBACK_MAX_SECONDS} from "@/lib/vmv-callback";
import {twiml,xmlEscape} from "@/lib/twilio-pilot";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Twilio invokes this only AFTER the registered iPhone answers the callback.
// A signed Twilio request and one-time database claim are both mandatory.
export async function POST(req:NextRequest){
 if(!callbackEnabled())return twiml("<Hangup/>",503);
 const fields=await verifiedCallbackWebhook(req);
 if(!fields)return twiml("<Hangup/>",403);
 const id=req.nextUrl.searchParams.get("intent");
 if(!validUuid(id))return twiml("<Hangup/>",400);
 const db=callbackDb();
 if(!db)return twiml("<Hangup/>",503);
 const {data:request,error}=await db.from("smartjob_callback_requests")
  .select("id,owner_id,customer_phone,business_phone,twilio_leg_sid,status,expires_at,claimed_at")
  .eq("id",id).maybeSingle();
 if(error||!request)return twiml("<Hangup/>",404);
 const client="client:sj_"+String(request.owner_id).replaceAll("-","");
 const sid=fields.get("CallSid")||"";
 if(fields.get("To")!==client||fields.get("From")!==request.business_phone||
    (request.twilio_leg_sid&&request.twilio_leg_sid!==sid)||
    !callerPhone(request.customer_phone)||!callerPhone(request.business_phone)||
    Date.parse(request.expires_at)<Date.now()||
    !["pending","ringing"].includes(request.status)||request.claimed_at)
  return twiml("<Hangup/>",403);
 const {data:claimed,error:claimError}=await db.from("smartjob_callback_requests")
  .update({status:"bridged",claimed_at:new Date().toISOString(),twilio_leg_sid:sid})
  .eq("id",id).eq("owner_id",request.owner_id)
  .in("status",["pending","ringing"]).is("claimed_at",null)
  .select("id").maybeSingle();
 if(claimError||!claimed)return twiml("<Hangup/>",409);
 // The customer sees only the provisioned business Twilio number. There is
 // no translation bridge; this is a direct conversation, capped at 10 min.
 return twiml('<Dial callerId="'+xmlEscape(request.business_phone)+
  '" timeout="25" timeLimit="'+CALLBACK_MAX_SECONDS+'" record="do-not-record">'+
  '<Number>'+xmlEscape(request.customer_phone)+'</Number></Dial><Hangup/>');
}
