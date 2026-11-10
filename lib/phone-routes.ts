import {createClient} from "@supabase/supabase-js";
import {createHmac,timingSafeEqual} from "node:crypto";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";

export type ActivePhoneRoute={
  id:string;user_id:string;twilio_number:string;destination_phone:string;receive_method:"pstn"|"ios_app";
  customer_language:"en-US"|"es-ES";owner_language:"en-US"|"es-ES";assistant_name:string;enabled:boolean;
};
const phone=/^\+[1-9]\d{7,14}$/;
const sid=/^CA[a-f\d]{32}$/i;
function admin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
export function tenantsReady(){
  return process.env.SMARTJOB_MULTI_TENANT_ENABLED==="true"&&Boolean(admin());
}
export async function findPhoneRoute(number:string){
  const db=admin();
  if(!db||!phone.test(number))return null;
  const {data,error}=await db.from("smartjob_phone_routes").select("id,user_id,twilio_number,destination_phone,receive_method,customer_language,owner_language,assistant_name,enabled")
    .eq("twilio_number",number).eq("enabled",true).maybeSingle();
  if(error){console.error("Smart Job route lookup unavailable",{code:error.code||"unknown",message:String(error.message||"unknown").slice(0,180),details:String(error.details||"").slice(0,160),hint:String(error.hint||"").slice(0,120)});return null;}
  if(!data||![data.twilio_number,data.destination_phone].every(n=>phone.test(n))||
     !["en-US","es-ES"].includes(data.customer_language)||!["en-US","es-ES"].includes(data.owner_language)||data.customer_language===data.owner_language)return null;
  if(!["pstn","ios_app"].includes(data.receive_method))return null;
  return data as ActivePhoneRoute;
}
export async function findPhoneRouteById(id:string){
  const db=admin();
  if(!db||!/^[a-f\d-]{36}$/i.test(id))return null;
  const {data,error}=await db.from("smartjob_phone_routes").select("id,user_id,twilio_number,destination_phone,receive_method,customer_language,owner_language,assistant_name,enabled")
    .eq("id",id).eq("enabled",true).maybeSingle();
  if(error||!data)return null;
  if(!phone.test(data.destination_phone)||!phone.test(data.twilio_number))return null;
  return data as ActivePhoneRoute;
}
export function partnerSignature(bridge:string,route:string,customer:string){
  return createHmac("sha256",process.env.TWILIO_AUTH_TOKEN||"")
    .update(["smartjob-partner-tenant-v1",bridge,route,customer].join("\n")).digest("hex");
}
export function verifyPartnerSignature(bridge:string,route:string,customer:string,signature:string){
  if(!sid.test(bridge)||!/^[a-f\d-]{36}$/i.test(route)||!phone.test(customer)||!/^[a-f\d]{64}$/i.test(signature))return false;
  const expected=Buffer.from(partnerSignature(bridge,route,customer),"hex"),actual=Buffer.from(signature,"hex");
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export async function reservePhoneSession(bridge:string,route:ActivePhoneRoute,mode:"direct"|"translated"="translated"){
  const db=admin();
  if(!db||!sid.test(bridge))return false;
  if(!await paidServiceAllowed(route.user_id,mode==="direct"?"direct_call":"translated_call"))return false;
  const old=new Date(Date.now()-250*60*1000).toISOString();
  // Do not preempt a valid four-hour call when removing abandoned reservations.
  await db.from("smartjob_call_sessions").update({status:"failed",completed_at:new Date().toISOString()})
    .eq("owner_id",route.user_id).in("status",["initiated","ringing","in-progress"]).lt("started_at",old);
  const today=new Date();today.setUTCHours(0,0,0,0);
  const {count,error:counterror}=await db.from("smartjob_call_sessions")
    .select("bridge_sid",{count:"exact",head:true}).eq("owner_id",route.user_id)
    .gte("started_at",today.toISOString());
  if(counterror||count===null||count>=60)return false;
  // One outstanding reservation per owner enforced by a partial unique index.
  const {error}=await db.from("smartjob_call_sessions").insert({
    bridge_sid:bridge,owner_id:route.user_id,route_id:route.id,status:"initiated",call_mode:mode
  });
  if(error){console.error("Smart Job reservation denied",error.code);return false;}
  return true;
}
export async function assignOutboundCall(bridge:string,outbound:string){
  const db=admin();
  if(!db||!sid.test(bridge)||!sid.test(outbound))return false;
  const {error}=await db.from("smartjob_call_sessions").update({outbound_sid:outbound,status:"ringing"})
    .eq("bridge_sid",bridge).eq("status","initiated");
  if(error){console.error("Smart Job session assign failed",error.code);return false;}
  return true;
}
// The outbound leg must consume the paid minutes reserved before dialing.
// Rechecking the unreserved balance here would reject calls that reserved
// their full balance, so authorize the exact Twilio leg against its session.
export async function hasReservedPartnerCall(bridge:string,outbound:string,route:ActivePhoneRoute){
  const db=admin();
  if(!db||!sid.test(bridge)||!sid.test(outbound))return false;
  const {data,error}=await db.from("smartjob_call_sessions")
    .select("bridge_sid")
    .eq("bridge_sid",bridge)
    .eq("outbound_sid",outbound)
    .eq("owner_id",route.user_id)
    .eq("route_id",route.id)
    .eq("call_mode","translated")
    .in("status",["ringing","in-progress"])
    .gt("reserved_minutes",0)
    .eq("billing_settled",false)
    .maybeSingle();
  if(error){
    console.error("Smart Job partner reserved session unavailable",error.code||"unknown");
    return false;
  }
  return Boolean(data);
}
export async function getPairedCallSids(bridge:string){
 const db=admin();
 if(!db||!sid.test(bridge))return null;
 const {data,error}=await db.from("smartjob_call_sessions")
   .select("bridge_sid,outbound_sid,status,reserved_minutes,billing_settled").eq("bridge_sid",bridge).maybeSingle();
 if(error){console.error("Smart Job paired call lookup failed",error.code||"unknown");return null;}
 if(!data)return null;
 return {
  outboundSid:typeof data.outbound_sid==="string"&&sid.test(data.outbound_sid)?data.outbound_sid:null,
  status:String(data.status||""),
  reservedMinutes:Number(data.reserved_minutes||0),
  billingSettled:data.billing_settled===true
 };
}
export async function updatePhoneSession(bridge:string,status:string,duration?:number){
  const db=admin();
  if(!db||!sid.test(bridge)||!["initiated","ringing","in-progress","completed","busy","failed","no-answer","canceled"].includes(status))return;
  const values:Record<string,unknown>={status};
  if(["completed","busy","failed","no-answer","canceled"].includes(status))values.completed_at=new Date().toISOString();
  if(typeof duration==="number"&&Number.isInteger(duration)&&duration>0&&duration<=86400)values.duration_seconds=duration;
  // A completed inbound leg does not mean the separate iOS client leg answered.
  // Never let a later inbound completion overwrite "no-answer"/"busy"/"failed".
  let query=db.from("smartjob_call_sessions").update(values).eq("bridge_sid",bridge);
  if(status==="completed")query=query.in("status",["initiated","ringing","in-progress","completed"]);
  const {error}=await query;
  if(error)console.error("Smart Job session update failed",error.code);
}
