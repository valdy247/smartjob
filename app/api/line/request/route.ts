import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
const validPhone=(x:unknown)=>typeof x==="string"&&/^\+[1-9]\d{7,14}$/.test(x);
const CARRIERS=new Set(["verizon","att","tmobile","xfinity","spectrum","cricket","metro","boost","uscellular","googlefi","visible","mint","straighttalk","consumer","usmobile","other"]);
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return reply({error:"unauthorized"},401);
 if(!await paidServiceAllowed(uid,"direct_call"))return reply({error:"live_paid_plan_required"},402);
 let body:Record<string,unknown>;try{body=await req.json();}catch{return reply({error:"invalid_request"},400);}
 if(!body||typeof body!=="object")return reply({error:"invalid_request"},400);
 const destination=String(body.destination_phone||"").trim(),assistant=String(body.assistant_name||"").trim();
 const customer=String(body.customer_language||""),owner=String(body.owner_language||"");
 const carrier=String(body.carrier||"other"),connection=String(body.connection_mode||"conditional");
 const answer=String(body.answer_method||"app");
 if(!validPhone(destination)||assistant.length<1||assistant.length>40||
   !["en-US","es-ES"].includes(owner)||!["en-US","es-ES"].includes(customer)||customer===owner||
   !CARRIERS.has(carrier)||!["conditional","all_calls"].includes(connection)||answer!=="app")
   return reply({error:"invalid_line_request"},400);
 const db=billingAdmin();if(!db)return reply({error:"service_unavailable"},503);
 const {data:profile,error:profileError}=await db.from("smartjob_profiles").select("phone,line_choice").eq("id",uid).maybeSingle();
 if(profileError||!profile)return reply({error:"profile_unavailable"},503);
 // A new-number preference is only a REQUEST, never an automatic number purchase.
 // Require that the account's destination phone is the verified contact number.
 if(profile.phone!==destination)return reply({error:"phone_mismatch"},409);
 const {data:proof}=await db.from("vmv_signup_phone_verified").select("phone").eq("user_id",uid).maybeSingle();
 const {data:existingVerified}=await db.from("smartjob_provisioning_requests")
   .select("phone_verified_at").eq("user_id",uid).eq("destination_phone",destination)
   .not("phone_verified_at","is",null).limit(1).maybeSingle();
 if(proof?.phone!==destination&&!existingVerified?.phone_verified_at)return reply({error:"phone_verification_required"},403);
 const {data:pending,error:pendingError}=await db.from("smartjob_provisioning_requests")
   .select("id,status").eq("user_id",uid).in("status",["pending","contacted","approved","activated"]).limit(1).maybeSingle();
 if(pendingError)return reply({error:"review_unavailable"},503);
 if(pending)return reply({error:"request_already_exists"},409);
 const {data,error}=await db.from("smartjob_provisioning_requests").insert({
  user_id:uid,destination_phone:destination,carrier,connection_mode:connection,
  answer_method:answer,owner_language:owner,customer_language:customer,
  assistant_name:assistant,status:"pending"
 }).select("id,status,created_at,destination_phone,carrier,connection_mode,answer_method").single();
 if(error){console.error("VMV provisioning request blocked",error.code);return reply({error:"request_unavailable"},503);}
 return reply({request:data,message:"Solicitud recibida para revisión manual. No se ha comprado ni activado un número."},202);
}
