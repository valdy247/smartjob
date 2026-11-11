import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
import {callbackBase,callbackDb,callbackEnabled,callerPhone,validCallSid,validUuid} from "@/lib/vmv-callback";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0"};
const clientId=(uid:string)=>"client:sj_"+uid.replaceAll("-","");
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers});

// User-triggered return call. The destination is derived exclusively from the
// owner's previously verified Twilio call session. Never accept arbitrary To.
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return json({error:"unauthorized"},401);
 if(!callbackEnabled()||!callbackBase())return json({error:"callback_not_enabled"},503);
 const body=await req.json().catch(()=>null);
 const sourceSid=body?.bridgeSid;
 if(!validCallSid(sourceSid)||body?.mode!=="direct")return json({error:"invalid_request"},400);
 const db=callbackDb();
 if(!db)return json({error:"service_unavailable"},503);
 if(!await paidServiceAllowed(uid,"direct_call"))
  return json({error:"active_plan_required"},403);
 const [source,routeResult]=await Promise.all([
  db.from("smartjob_call_sessions").select("bridge_sid,caller_phone,owner_id,started_at")
    .eq("bridge_sid",sourceSid).eq("owner_id",uid).maybeSingle(),
  db.from("smartjob_phone_routes").select("id,twilio_number,enabled,receive_method")
    .eq("user_id",uid).eq("enabled",true).eq("receive_method","ios_app")
    .limit(1).maybeSingle()
 ]);
 if(source.error||routeResult.error)return json({error:"lookup_unavailable"},503);
 const customer=source.data?.caller_phone;
 const business=routeResult.data?.twilio_number;
 if(!callerPhone(customer)||!callerPhone(business)||
  customer===business||business!==process.env.TWILIO_NUMBER)
  return json({error:"verified_caller_or_line_missing"},422);
 // No toll destinations outside +1 in this pilot. No premium +1-900.
 if(!/^[a-f\d-]{36}$/i.test(uid))return json({error:"unauthorized"},401);
 const now=new Date();
 const cutoff=new Date(now.getTime()-20*60000).toISOString();
 const {error:expiryError}=await db.from("smartjob_callback_requests")
  .update({status:"expired",finished_at:now.toISOString()})
  .eq("owner_id",uid).in("status",["pending","ringing","bridged"])
  .lt("created_at",cutoff);
 if(expiryError)return json({error:"callback_unavailable"},503);
 const hourAgo=new Date(now.getTime()-3600000).toISOString();
 const dayAgo=new Date(now.getTime()-86400000).toISOString();
 const [hour,day]=await Promise.all([
  db.from("smartjob_callback_requests").select("id",{count:"exact",head:true})
    .eq("owner_id",uid).gte("created_at",hourAgo),
  db.from("smartjob_callback_requests").select("id",{count:"exact",head:true})
    .eq("owner_id",uid).gte("created_at",dayAgo)
 ]);
 if(hour.error||day.error)return json({error:"callback_unavailable"},503);
 if((hour.count||0)>=4||(day.count||0)>=12)
  return json({error:"callback_rate_limited"},429);
 const {data:intent,error:insertError}=await db.from("smartjob_callback_requests")
  .insert({owner_id:uid,source_bridge_sid:sourceSid,
    customer_phone:customer,business_phone:business,status:"pending"})
  .select("id").single();
 if(insertError)return json({error:insertError.code==="23505"?"callback_in_progress":"callback_unavailable"},insertError.code==="23505"?409:503);
 if(!validUuid(intent.id))return json({error:"callback_unavailable"},503);
 const base=callbackBase();
 const sid=process.env.TWILIO_ACCOUNT_SID||"",token=process.env.TWILIO_AUTH_TOKEN||"";
 const params=new URLSearchParams({
  To:clientId(uid),From:business,
  Url:base+"/api/twilio/callback/bridge?intent="+intent.id,Method:"POST",
  StatusCallback:base+"/api/twilio/callback/status?intent="+intent.id,
  StatusCallbackMethod:"POST",Timeout:"25",TimeLimit:"720"
 });
 for(const event of ["initiated","ringing","answered","completed"])
  params.append("StatusCallbackEvent",event);
 try{
  const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls.json",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(9500),
   headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),
    "Content-Type":"application/x-www-form-urlencoded"},body:params.toString()
  });
  const value=await response.json().catch(()=>null);
  if(!response.ok||!validCallSid(value?.sid))throw Error("twilio_dial_failed");
  await db.from("smartjob_callback_requests")
   .update({twilio_leg_sid:value.sid,status:"ringing"})
   .eq("id",intent.id).eq("owner_id",uid).eq("status","pending");
  return json({started:true,mode:"direct",businessPhone:business,
   message:"VMV está llamando a tu iPhone. Contesta para conectar con el cliente."},202);
 }catch{
  await db.from("smartjob_callback_requests").update({
   status:"failed",finished_at:new Date().toISOString()
  }).eq("id",intent.id).eq("owner_id",uid).eq("status","pending");
  return json({error:"twilio_connection_unavailable"},503);
 }
}

export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return json({error:"unauthorized"},401);
 const db=callbackDb();
 if(!db||!callbackEnabled()||!callbackBase())
  return json({available:false,reason:"callback_not_enabled"});
 const [route,eligible]=await Promise.all([
  db.from("smartjob_phone_routes").select("twilio_number").eq("user_id",uid)
   .eq("enabled",true).eq("receive_method","ios_app").limit(1).maybeSingle(),
  paidServiceAllowed(uid,"direct_call")
 ]);
 return json({available:Boolean(!route.error&&callerPhone(route.data?.twilio_number)&&
   route.data?.twilio_number===process.env.TWILIO_NUMBER&&eligible),
   reason:eligible?"line_not_ready":"active_plan_required"});
}
