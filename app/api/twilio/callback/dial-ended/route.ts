import {NextRequest} from "next/server";
import {callbackDb,callbackEnabled,validUuid,verifiedCallbackWebhook} from "@/lib/vmv-callback";
import {twiml} from "@/lib/twilio-pilot";
import {nationalPilotFor,settleNational} from "@/lib/vmv-national-minutes";

export const runtime="nodejs";
export const dynamic="force-dynamic";
// Signed Twilio <Dial action>: the destination leg's duration, not the owner's
// total ringing time, determines national minutes. Idempotent on retries.
export async function POST(req:NextRequest){
 if(!callbackEnabled())return twiml("<Hangup/>",503);
 const fields=await verifiedCallbackWebhook(req);
 if(!fields)return twiml("<Hangup/>",403);
 const intent=req.nextUrl.searchParams.get("intent");
 if(!validUuid(intent))return twiml("<Hangup/>",400);
 const db=callbackDb();if(!db)return twiml("<Hangup/>",503);
 const {data:call,error}=await db.from("smartjob_callback_requests")
  .select("owner_id,business_phone,twilio_leg_sid,claimed_at,status")
  .eq("id",intent).maybeSingle();
 if(error||!call)return twiml("<Hangup/>",404);
 const client="client:sj_"+String(call.owner_id).replaceAll("-","");
 if(!call.claimed_at||fields.get("To")!==client||
    fields.get("From")!==call.business_phone||
    (call.twilio_leg_sid&&fields.get("CallSid")!==call.twilio_leg_sid))
  return twiml("<Hangup/>",403);
 const status=fields.get("DialCallStatus")||"";
 if(!["completed","busy","failed","no-answer","canceled"].includes(status))
  return twiml("<Hangup/>",400);
 const raw=Number(fields.get("DialCallDuration")||0);
 if(!Number.isFinite(raw)||raw<0||raw>14400)return twiml("<Hangup/>",400);
 // A completed Dial means a connection was answered; even sub-second calls
 // count at least one domestic minute (not the time the iPhone rang).
 const seconds=status==="completed"?Math.max(1,Math.floor(raw)):0;
 if(nationalPilotFor(call.owner_id)){
  if(!await settleNational("out:"+intent,seconds))
   return twiml("<Hangup/>",503);
 }
 await db.from("smartjob_callback_requests")
  .update({status:status==="completed"?"completed":"failed",finished_at:new Date().toISOString()})
  .eq("id",intent).eq("owner_id",call.owner_id).in("status",["bridged","completed","failed"]);
 return twiml("<Hangup/>");
}
