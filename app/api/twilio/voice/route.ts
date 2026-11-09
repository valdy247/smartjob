import {NextRequest} from "next/server";
import {authenticTwilio,twiml} from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Legacy shared-number pilot cannot establish a verified paying subscriber.
// Disable it rather than spending Twilio/AI resources without billable entitlement.
export async function POST(req:NextRequest){
 const signed=await authenticTwilio(req);
 return twiml("<Hangup/>",signed?200:403);
}
