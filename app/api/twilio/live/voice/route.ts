import { NextRequest } from "next/server";
import { baseUrl,bridgeSignature,bridgeTwiML,E164,liveReady,notReady,verifiedLiveRequest } from "@/lib/twilio-live";
import { say,twiml } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// Pilot is opt-in and allows the verified English test caller only.
// The production Twilio number's webhook is NOT switched automatically.
export async function POST(req:NextRequest){
 const fields=await verifiedLiveRequest(req);
 if(!fields)return twiml(say("Unauthenticated call.","en-US")+"<Hangup/>",403);
 if(!liveReady())return notReady();
 if(fields.get("From")!==E164(process.env.SMARTJOB_DUO_EN_PHONE)||fields.get("To")!==E164(process.env.TWILIO_NUMBER)){
  return twiml(say("This number is not enabled for the test.","en-US")+"<Hangup/>");
 }
 const bridge=fields.get("CallSid")||"";
 const sid=fields.get("AccountSid")||"";
 if(!/^CA[a-fA-F0-9]{32}$/.test(bridge)||!/^AC[a-fA-F0-9]{32}$/.test(sid))return twiml("<Hangup/>");
 if(process.env.TWILIO_ACCOUNT_SID&&sid!==process.env.TWILIO_ACCOUNT_SID)return twiml("<Hangup/>",403);
 const url=baseUrl+"/api/twilio/live/partner?bridge="+bridge+"&sig="+bridgeSignature(bridge);
 const payload=new URLSearchParams({
  To:E164(process.env.SMARTJOB_DUO_ES_PHONE),
  From:E164(process.env.TWILIO_NUMBER),
  Url:url,Method:"POST",
  Timeout:"25"
 });
 try{
  const res=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls.json",{
   method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(sid+":"+process.env.TWILIO_AUTH_TOKEN).toString("base64")},
   body:payload.toString(),signal:AbortSignal.timeout(4500),cache:"no-store"
  });
  if(!res.ok){
   console.error("Smart Job live partner dial failed HTTP",res.status);
   return twiml(say("Sorry, Mayuli could not be reached. Please call again.","en-US")+"<Hangup/>");
  }
  console.info("Smart Job live outbound call accepted");
  return bridgeTwiML("customer",bridge);
 }catch(e){
  console.error("Smart Job live partner dial request failed",e instanceof Error?e.name:"unknown");
  return twiml(say("Connection unavailable. Please call again.","en-US")+"<Hangup/>");
 }
}
