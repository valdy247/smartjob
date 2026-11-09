import {NextRequest} from "next/server";
import {response,smsReady,validPhone,originOk,reserveSMS,sendSMS} from "@/lib/signup-phone";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!originOk(req))return response({error:"invalid_origin"},403);
 if(!smsReady())return response({error:"sms_unavailable"},503);
 let data:unknown;try{data=await req.json();}catch{return response({error:"invalid_request"},400);}
 const phone=data&&typeof data==="object"&&"phone" in data?(data as {phone:unknown}).phone:null;
 if(!validPhone(phone))return response({error:"invalid_phone"},400);
 if(!await reserveSMS(req,phone))return response({error:"sms_rate_limit"},429);
 try{
  if(!await sendSMS(phone))return response({error:"sms_delivery_failed"},502);
  return response({sent:true});
 }catch{return response({error:"sms_delivery_failed"},502);}
}
