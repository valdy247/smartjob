import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
import {callbackBase,callbackDb,callbackEnabled,callerPhone,validCallSid,validUuid} from "@/lib/vmv-callback";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0"};
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers});
const clientId=(uid:string)=>"client:sj_"+uid.replaceAll("-","");
// Preview dialer accepts only US destinations; prohibit NANP premium/special
// service numbers before even checking Twilio Lookup. No international calling.
function domesticNumber(input:unknown):string|null{
 if(typeof input!=="string"||input.length>24)return null;
 const normalized=input.trim().replace(/[()\s.-]/g,"");
 if(!/^\+?[0-9]+$/.test(normalized))return null;
 const formatted=normalized.startsWith("+")?normalized:
   normalized.length===10?"+1"+normalized:
   normalized.length===11&&normalized.startsWith("1")?"+"+normalized:"";
 if(!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(formatted)||
  formatted.startsWith("+1900")||/^(\+1\d{3})976/.test(formatted)||
  /^(\+1\d{3})55501\d{2}$/.test(formatted))return null;
 return formatted;
}
async function verifiedUSNumber(phone:string,sid:string,token:string):Promise<boolean>{
 // Twilio Basic Lookup is a free validation request, with NO paid Fields.
 try{
  const response=await fetch("https://lookups.twilio.com/v2/PhoneNumbers/"+encodeURIComponent(phone),{
   method:"GET",cache:"no-store",signal:AbortSignal.timeout(7500),
   headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")}
  });
  if(!response.ok)return false;
  const data=await response.json();
  return data.valid===true&&data.country_code==="US"&&data.phone_number===phone;
 }catch{return false;}
}

export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return json({error:"unauthorized"},401);
 if(!callbackEnabled()||!callbackBase()||process.env.SMARTJOB_DIALER_ENABLED!=="true")
  return json({error:"dialer_not_enabled"},503);
 const body=await req.json().catch(()=>null);
 const customer=domesticNumber(body?.phone);
 if(!customer||body?.mode!=="direct")return json({error:"invalid_phone"},400);
 const db=callbackDb();
 if(!db)return json({error:"service_unavailable"},503);
 if(!await paidServiceAllowed(uid,"direct_call"))
  return json({error:"active_plan_required"},403);
 const {data:route,error:routeError}=await db.from("smartjob_phone_routes")
  .select("twilio_number,receive_method,enabled").eq("user_id",uid)
  .eq("enabled",true).eq("receive_method","ios_app").limit(1).maybeSingle();
 if(routeError)return json({error:"line_unavailable"},503);
 const business=route?.twilio_number;
 if(!callerPhone(business)||business!==process.env.TWILIO_NUMBER||customer===business)
  return json({error:"line_not_ready"},422);
 const sid=process.env.TWILIO_ACCOUNT_SID||"",token=process.env.TWILIO_AUTH_TOKEN||"";
 if(!await verifiedUSNumber(customer,sid,token))
  return json({error:"us_phone_not_verified"},422);

 const now=new Date(),cutoff=new Date(now.getTime()-20*60000).toISOString();
 const {error:expiryError}=await db.from("smartjob_callback_requests")
  .update({status:"expired",finished_at:now.toISOString()}).eq("owner_id",uid)
  .in("status",["pending","ringing","bridged"]).lt("created_at",cutoff);
 if(expiryError)return json({error:"dialer_unavailable"},503);
 const [hour,day]=await Promise.all([
  db.from("smartjob_callback_requests").select("id",{count:"exact",head:true})
   .eq("owner_id",uid).gte("created_at",new Date(now.getTime()-3600000).toISOString()),
  db.from("smartjob_callback_requests").select("id",{count:"exact",head:true})
   .eq("owner_id",uid).gte("created_at",new Date(now.getTime()-86400000).toISOString())
 ]);
 if(hour.error||day.error)return json({error:"dialer_unavailable"},503);
 if((hour.count||0)>=4||(day.count||0)>=12)
  return json({error:"dialer_rate_limited"},429);
 // The DB unique partial index enforces only one active call per owner, even
 // for two concurrent requests from separate devices.
 const {data:intent,error:insertError}=await db.from("smartjob_callback_requests")
  .insert({owner_id:uid,source_bridge_sid:null,request_kind:"dialer",
   customer_phone:customer,business_phone:business,status:"pending"})
  .select("id").single();
 if(insertError)return json({error:insertError.code==="23505"?"call_in_progress":"dialer_unavailable"},
  insertError.code==="23505"?409:503);
 if(!validUuid(intent.id))return json({error:"dialer_unavailable"},503);
 const base=callbackBase();
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
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(9000),
   headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),
    "Content-Type":"application/x-www-form-urlencoded"},body:params.toString()
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!validCallSid(result?.sid))throw Error("twilio_unavailable");
  await db.from("smartjob_callback_requests")
   .update({twilio_leg_sid:result.sid,status:"ringing"})
   .eq("id",intent.id).eq("owner_id",uid).eq("status","pending");
  return json({started:true,mode:"direct",message:"VMV está llamando a tu iPhone. Contesta para conectar."},202);
 }catch{
  await db.from("smartjob_callback_requests").update({
   status:"failed",finished_at:new Date().toISOString()
  }).eq("id",intent.id).eq("owner_id",uid).eq("status","pending");
  return json({error:"twilio_unavailable"},503);
 }
}

export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return json({available:false,error:"unauthorized"},401);
 if(!callbackEnabled()||!callbackBase()||process.env.SMARTJOB_DIALER_ENABLED!=="true")
  return json({available:false});
 const db=callbackDb();
 if(!db)return json({available:false});
 const [route,eligible]=await Promise.all([
  db.from("smartjob_phone_routes").select("twilio_number").eq("user_id",uid)
   .eq("enabled",true).eq("receive_method","ios_app").limit(1).maybeSingle(),
  paidServiceAllowed(uid,"direct_call")
 ]);
 return json({available:Boolean(!route.error&&callerPhone(route.data?.twilio_number)&&
  route.data?.twilio_number===process.env.TWILIO_NUMBER&&eligible)});
}
