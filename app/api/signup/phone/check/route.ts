import {NextRequest} from "next/server";
import {billingAdmin} from "@/lib/vmv-billing";
import {response,smsReady,validPhone,originOk,checkSMS,newTicket,ticketHash} from "@/lib/signup-phone";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!originOk(req))return response({error:"invalid_origin"},403);
 if(!smsReady())return response({error:"sms_unavailable"},503);
 let data:unknown;try{data=await req.json();}catch{return response({error:"invalid_request"},400);}
 const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
 if(!validPhone(payload.phone)||typeof payload.code!=="string"||!/^[0-9]{4,10}$/.test(payload.code))
  return response({error:"invalid_code"},400);
 try{
  if(!await checkSMS(payload.phone,payload.code))return response({error:"incorrect_or_expired_code"},400);
  const ticket=newTicket();
  const db=billingAdmin();
  if(!db)return response({error:"sms_unavailable"},503);
  const {error}=await db.from("vmv_signup_sms_tickets").insert({
   token_hash:ticketHash(ticket),phone:payload.phone,
   expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString()
  });
  if(error)return response({error:"verification_save_failed"},503);
  return response({verified:true,ticket,expiresInDays:7});
 }catch{return response({error:"verification_unavailable"},503);}
}
