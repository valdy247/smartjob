import {createHmac,createHash,randomBytes} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {billingAdmin} from "@/lib/vmv-billing";
import {twilioVerifyPost} from "@/lib/phone-verification";

export const noStore={"Cache-Control":"no-store"};
export const response=(value:Record<string,unknown>,status=200)=>
 NextResponse.json(value,{status,headers:noStore});
export const validPhone=(value:unknown):value is string=>
 typeof value==="string"&&/^\+[1-9][0-9]{7,14}$/.test(value);
// Pre-account SMS incurs provider charges without a payer. Allow only after a confirmed paid plan.
// Registration may continue without sending a billable code.
export const smsReady=()=>false;
export const originOk=(req:NextRequest)=>{
 const origin=req.headers.get("origin");
 return !origin||origin===req.nextUrl.origin;
};
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
const secretHash=(s:string)=>createHmac("sha256",Buffer.from(process.env.SMARTJOB_PHONE_VERIFY_PROOF_KEY||"","hex")).update(s).digest("hex");
export const ticketHash=digest;
export const newTicket=()=>randomBytes(32).toString("base64url");
export async function reserveSMS(req:NextRequest,phone:string){
 const db=billingAdmin();if(!db)return false;
 // Vercel's proxy provides the client IP; use a conservative shared quota if absent.
 const ip=(req.headers.get("x-vercel-forwarded-for")||req.headers.get("x-forwarded-for")||"unknown")
  .split(",")[0].trim().slice(0,80);
 const {data,error}=await db.rpc("vmv_signup_sms_reserve",{
  p_ip_hash:secretHash("signup-ip-v1:"+ip),p_phone_hash:secretHash("signup-phone-v1:"+phone)
 });
 if(error){console.error("VMV signup SMS rate reservation",error.code);return false;}
 return data===true;
}
export async function sendSMS(phone:string){
 const result=await twilioVerifyPost("Verifications",{To:phone,Channel:"sms"});
 return result.ok&&result.result.status==="pending";
}
export async function checkSMS(phone:string,code:string){
 const result=await twilioVerifyPost("VerificationCheck",{To:phone,Code:code});
 return result.ok&&result.result.status==="approved"&&
  result.result.valid!==false&&result.result.to===phone;
}
