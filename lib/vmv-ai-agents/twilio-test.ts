import {createHmac,timingSafeEqual} from "node:crypto";
import type {NextRequest} from "next/server";

// AI Agents' own dedicated verifier. Does not change Smart Call's signing base.
export async function verifyAiTestWebhook(req:NextRequest):Promise<URLSearchParams|null>{
  const token=process.env.TWILIO_AUTH_TOKEN||"";
  const testBase=process.env.VMV_AI_TEST_BASE_URL||"";
  const signature=req.headers.get("x-twilio-signature")||"";
  const contentType=req.headers.get("content-type")||"";
  if(req.method!=="POST"||!token||!signature||
     !contentType.includes("application/x-www-form-urlencoded")||
     !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(testBase))return null;
  let body:string;
  try{body=await req.text();}catch{return null;}
  if(body.length>12000)return null;
  const data=new URLSearchParams(body);
  let expectedUrl:string;
  try{
    const source=new URL(req.url);
    expectedUrl=new URL(source.pathname+source.search,testBase).toString();
  }catch{return null;}
  let signed=expectedUrl;
  const keys=[...new Set(data.keys())].sort();
  for(const key of keys){
    const values=data.getAll(key).sort();
    for(const value of values)signed+=key+value;
  }
  const digest=createHmac("sha1",token).update(signed).digest();
  let received:Buffer;
  try{received=Buffer.from(signature,"base64");}catch{return null;}
  if(received.length!==digest.length||!timingSafeEqual(received,digest))return null;
  const account=data.get("AccountSid")||"";
  const call=data.get("CallSid")||"";
  const to=data.get("To")||"";
  if(!/^AC[a-f\d]{32}$/i.test(account)||!/^CA[a-f\d]{32}$/i.test(call)||
     !/^\+[1-9]\d{7,14}$/.test(to))return null;
  if(process.env.TWILIO_ACCOUNT_SID&&account!==process.env.TWILIO_ACCOUNT_SID)return null;
  if(process.env.TWILIO_NUMBER&&to!==process.env.TWILIO_NUMBER)return null;
  return data;
}
