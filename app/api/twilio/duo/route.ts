import {NextRequest} from "next/server";
import {authenticTwilio,twiml} from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Retired two-person pilot. It had no authenticated tenant or paid-minute claim.
export async function POST(req:NextRequest){
 const signed=await authenticTwilio(req);
 return twiml("<Hangup/>",signed?200:403);
}
export async function GET(req:NextRequest){return POST(req);}
