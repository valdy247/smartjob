import {NextRequest} from "next/server";
import {answer,getVerificationContext,masked,twilioVerifyReady} from "@/lib/phone-verification";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const context=await getVerificationContext(req);
 if("response" in context)return context.response;
 const request=context.request;
 return answer({
  requestId:request.id,phone:masked(request.destination_phone),
  verified:!!request.phone_verified_at,requestStatus:request.status,
  smsAvailable:twilioVerifyReady()&&await paidServiceAllowed(context.uid,"direct_call")
 });
}
