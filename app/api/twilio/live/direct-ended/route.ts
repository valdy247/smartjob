import {NextRequest} from "next/server";
import {verifiedLiveRequest,E164} from "@/lib/twilio-live";
import {findPhoneRouteById,updatePhoneSession} from "@/lib/phone-routes";
import {validSelectionSignature} from "@/lib/vmv-ivr";
import {twiml} from "@/lib/twilio-pilot";
import {nationalPilotFor,settleNational} from "@/lib/vmv-national-minutes";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const params=await verifiedLiveRequest(req,null);
 if(!params)return twiml("<Hangup/>",403);
 const q=req.nextUrl.searchParams;
 const bridge=q.get("bridge")||"",routeId=q.get("route")||"",caller=q.get("caller")||"",proof=q.get("proof")||"";
 if(params.get("CallSid")!==bridge||!validSelectionSignature(bridge,routeId,caller,"es",proof))
  return twiml("<Hangup/>",403);
 const route=await findPhoneRouteById(routeId);
 if(!route||route.twilio_number!==E164(params.get("To")||"")||route.receive_method!=="ios_app")
  return twiml("<Hangup/>",403);
 const value=params.get("DialCallStatus")||"";
 const status=(["completed","busy","failed","no-answer","canceled"].includes(value)?value:"failed");
 const raw=Number(params.get("DialCallDuration")||0);
 await updatePhoneSession(bridge,status,Number.isInteger(raw)&&raw>=0?raw:undefined);
 // This ledger is distinct from AI translation. Idempotent if Twilio retries.
 if(nationalPilotFor(route.user_id)){
  const seconds=status==="completed"&&Number.isInteger(raw)&&raw>0?raw:0;
  if(!await settleNational("in:"+bridge,seconds))
   console.error("VMV national inbound settlement pending",status);
 }
 // No call to settleCallMinutes: direct Spanish calls never consume AI minutes.
 return twiml("<Hangup/>");
}
