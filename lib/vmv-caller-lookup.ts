import {callbackDb,callerPhone,validCallSid} from "@/lib/vmv-callback";
import type {SupabaseClient} from "@supabase/supabase-js";

// Backfill caller ID only from Twilio's original signed-account call record.
// No arbitrary number is ever accepted from the user or from an imported contact.
export async function resolveOriginalCaller(
 db:SupabaseClient,uid:string,bridgeSid:string,businessPhone:string
):Promise<string|null>{
 if(!validCallSid(bridgeSid)||!callerPhone(businessPhone))return null;
 const {data:source,error}=await db.from("smartjob_call_sessions")
  .select("bridge_sid,owner_id,caller_phone").eq("owner_id",uid)
  .eq("bridge_sid",bridgeSid).maybeSingle();
 if(error||!source)return null;
 if(callerPhone(source.caller_phone))return source.caller_phone;
 const acct=process.env.TWILIO_ACCOUNT_SID||"";
 const secret=process.env.TWILIO_AUTH_TOKEN||"";
 if(!/^AC[a-f\d]{32}$/i.test(acct)||!secret)return null;
 try{
  const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+acct+"/Calls/"+
   bridgeSid+".json",{method:"GET",cache:"no-store",signal:AbortSignal.timeout(6500),
   headers:{Authorization:"Basic "+Buffer.from(acct+":"+secret).toString("base64")}});
  if(!r.ok)return null;
  const data=await r.json();
  const from=String(data?.from||"");
  if(data?.sid!==bridgeSid||data?.account_sid!==acct||
     data?.direction!=="inbound"||data?.to!==businessPhone||!callerPhone(from)||
     from===businessPhone)return null;
  // Owner-filtered update: retain the authenticated provider's original From.
  await db.from("smartjob_call_sessions").update({caller_phone:from})
   .eq("bridge_sid",bridgeSid).eq("owner_id",uid).is("caller_phone",null);
  return from;
 }catch{return null;}
}
