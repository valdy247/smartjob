import {createHmac,randomUUID} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const noStore={"Cache-Control":"no-store"};
const serviceIdentity=(userId:string)=>"sj_"+userId.replaceAll("-","");

function voiceToken(identity:string){
  const sid=process.env.TWILIO_ACCOUNT_SID||"";
  const key=process.env.TWILIO_API_KEY_SID||"";
  const secret=process.env.TWILIO_API_KEY_SECRET||"";
  const push=process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID||"";
  if(!/^AC[a-f0-9]{32}$/i.test(sid)||!/^SK[a-f0-9]{32}$/i.test(key)||
      !secret||!/^CR[a-f0-9]{32}$/i.test(push))return null;
  const now=Math.floor(Date.now()/1000);
  const head={typ:"JWT",alg:"HS256"};
  // Incoming-only grant: the native app cannot arbitrarily dial phone numbers.
  const payload={
    jti:key+"-"+randomUUID(),iss:key,sub:sid,iat:now,nbf:now-5,exp:now+3600,
    grants:{identity,voice:{incoming:{allow:true},push_credential_sid:push}}
  };
  const b64=(part:unknown)=>Buffer.from(JSON.stringify(part)).toString("base64url");
  const unsigned=b64(head)+"."+b64(payload);
  return unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
}

export async function POST(req:NextRequest){
  if(process.env.SMARTJOB_IOS_VOICE_ENABLED!=="true")
    return NextResponse.json({error:"mobile_voice_not_enabled"},{status:503,headers:noStore});
  const userId=await authenticatedUser(req);
  if(!userId)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const secret=process.env.SUPABASE_SECRET_KEY||"";
  if(!url||!secret)return NextResponse.json({error:"mobile_voice_not_configured"},{status:503,headers:noStore});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.from("smartjob_phone_routes")
    .select("id,user_id,receive_method,enabled").eq("user_id",userId)
    .eq("receive_method","ios_app").eq("enabled",true).limit(1).maybeSingle();
  if(error){console.error("Smart Job mobile route lookup",{code:error.code||"unknown",message:String(error.message||"unknown").slice(0,220),status:("status" in error?error.status:"n/a")});
    return NextResponse.json({error:"mobile_voice_unavailable"},{status:503,headers:noStore});}
  if(!data)return NextResponse.json({error:"mobile_voice_not_approved"},{status:403,headers:noStore});
  const identity=serviceIdentity(userId);
  const token=voiceToken(identity);
  if(!token)return NextResponse.json({error:"mobile_voice_not_configured"},{status:503,headers:noStore});
  return NextResponse.json({token,identity,expiresInSeconds:3600},{headers:noStore});
}
