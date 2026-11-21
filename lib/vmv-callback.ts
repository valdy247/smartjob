import {createHmac,timingSafeEqual} from "node:crypto";
import type {NextRequest} from "next/server";
import {billingAdmin} from "@/lib/vmv-billing";

export const CALLBACK_MAX_SECONDS=600;
export const callbackDb=()=>billingAdmin();
export const callerPhone=(value:unknown):value is string=>
 typeof value==="string"&&/^\+1[2-9][0-9]{9}$/.test(value)&&!/^\+1900/.test(value);
export const validCallSid=(value:unknown):value is string=>
 typeof value==="string"&&/^CA[a-f\d]{32}$/i.test(value);
export const validUuid=(value:unknown):value is string=>
 typeof value==="string"&&/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
export function callbackEnabled(){
 return process.env.SMARTJOB_CALLBACKS_ENABLED==="true"&&
  process.env.VERCEL_ENV==="preview"&&
  /^AC[a-f\d]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||"")&&
  Boolean(process.env.TWILIO_AUTH_TOKEN&&process.env.SUPABASE_SECRET_KEY);
}
export function callbackBase(){
 const supplied=process.env.SMARTJOB_CALLBACK_BASE_URL;
 const generated=process.env.VERCEL_URL?"https://"+process.env.VERCEL_URL:"";
 try{
  const url=new URL(supplied||generated);
  if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash)return null;
  if(!/\.vercel\.app$/.test(url.hostname)&&url.hostname!=="vmvcall.com")return null;
  return url.origin;
 }catch{return null;}
}
// Verify the complete Twilio-signed POST and every form field. The callback
// path is never a public dial API, even if the UUID appears in a log.
export async function verifiedCallbackWebhook(req:NextRequest){
 const token=process.env.TWILIO_AUTH_TOKEN||"";
 const signature=req.headers.get("x-twilio-signature")||"";
 if(!token||!signature||req.method!=="POST"||
    !req.headers.get("content-type")?.includes("application/x-www-form-urlencoded"))return null;
 const body=await req.text();
 if(body.length>12000)return null;
 const params=new URLSearchParams(body);
 const base=callbackBase();
 const url=new URL(req.url);
 if(!base||url.origin!==base||params.get("AccountSid")!==process.env.TWILIO_ACCOUNT_SID||
  !validCallSid(params.get("CallSid")))return null;
 let signed=url.toString();
 const fields=[...new Set(params.keys())].sort();
 for(const field of fields)for(const value of params.getAll(field).sort())signed+=field+value;
 const calculated=createHmac("sha1",token).update(signed).digest();
 let provided:Buffer;
 try{provided=Buffer.from(signature,"base64");}catch{return null;}
 if(provided.length!==calculated.length||!timingSafeEqual(provided,calculated))return null;
 return params;
}
