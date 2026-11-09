import {createHmac} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";

export const noCache={"Cache-Control":"no-store"};
type RequestRow={
 id:string;user_id:string;destination_phone:string;phone_verified_at:string|null;
 status:string;created_at:string;
};
export const answer=(body:Record<string,unknown>,status=200)=>
 NextResponse.json(body,{status,headers:noCache});
export const masked=(phone:string)=>phone.slice(0,2)+"••••"+phone.slice(-2);
export function twilioVerifyReady(){
 const service=process.env.TWILIO_VERIFY_SERVICE_SID||"";
 const sid=process.env.TWILIO_API_KEY_SID||"";
 const secret=process.env.TWILIO_API_KEY_SECRET||"";
 return /^VA[a-f0-9]{32}$/i.test(service)&&/^SK[a-f0-9]{32}$/i.test(sid)&&!!secret;
}
export async function getVerificationContext(req:NextRequest){
 if(process.env.SMARTJOB_IOS_VOICE_ENABLED!=="true")
  return {response:answer({error:"mobile_voice_not_enabled"},503)};
 const uid=await authenticatedUser(req);
 if(!uid)return {response:answer({error:"unauthorized"},401)};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
 const authorization=req.headers.get("authorization")||"";
 if(!url||!key||!authorization)
  return {response:answer({error:"verification_unavailable"},503)};
 const db=createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:authorization}}
 });
 const result=await db.from("smartjob_provisioning_requests")
  .select("id,user_id,destination_phone,phone_verified_at,status,created_at")
  .eq("user_id",uid).in("status",["pending","contacted","approved","activated"])
  .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(result.error)return {response:answer({error:"verification_unavailable"},503)};
 if(!result.data)return {response:answer({error:"no_verification_request"},404)};
 const request=result.data as RequestRow;
 if(!/^\+[1-9]\d{7,14}$/.test(request.destination_phone))
  return {response:answer({error:"invalid_requested_number"},400)};
 return {uid,db,request};
}
export async function twilioVerifyPost(path:"Verifications"|"VerificationCheck",data:Record<string,string>){
 const service=process.env.TWILIO_VERIFY_SERVICE_SID||"";
 const key=process.env.TWILIO_API_KEY_SID||"";
 const secret=process.env.TWILIO_API_KEY_SECRET||"";
 const response=await fetch("https://verify.twilio.com/v2/Services/"+service+"/"+path,{
  method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
  headers:{"Authorization":"Basic "+Buffer.from(key+":"+secret).toString("base64"),
    "Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(data).toString()
 });
 const result=await response.json().catch(()=>({}));
 return {ok:response.ok,code:response.status,result:result as Record<string,unknown>};
}
export function signedVerificationProof(uid:string,requestId:string,phone:string,at:number){
 const shared=process.env.SMARTJOB_PHONE_VERIFY_PROOF_KEY||"";
 if(!/^[a-f0-9]{64}$/.test(shared))return null;
 const message=["smartjob-phone-verify-v1",uid,requestId,phone,String(at)].join("\n");
 return createHmac("sha256",Buffer.from(shared,"hex")).update(message).digest("hex");
}
