import {NextRequest} from "next/server";
import {authenticTwilio,twiml} from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const signed=await authenticTwilio(req);
 return twiml("<Hangup/>",signed?200:403);
}
