import { NextRequest } from "next/server";
import { bridgeTwiML,E164,liveReady,notReady,verifiedBridge,verifiedLiveRequest } from "@/lib/twilio-live";
import { twiml } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const fields=await verifiedLiveRequest(req,E164(process.env.SMARTJOB_DUO_ES_PHONE));
 if(!fields)return twiml("<Hangup/>",403);
 const query=new URL(req.url).searchParams;
 const bridge=query.get("bridge")||"";
 const sig=query.get("sig")||"";
 if(!liveReady()||!verifiedBridge(bridge,sig))return notReady();
 if(fields.get("From")!==E164(process.env.TWILIO_NUMBER)||fields.get("To")!==E164(process.env.SMARTJOB_DUO_ES_PHONE)){
  return twiml("<Hangup/>",403);
 }
 return bridgeTwiML("professional",bridge);
}
