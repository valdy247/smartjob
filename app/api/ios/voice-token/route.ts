import {createHmac,randomUUID} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";

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
  const head={typ:"JWT",alg:"HS256",cty:"twilio-fpa;v=1"};
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
  if(!await paidServiceAllowed(userId,"direct_call"))return NextResponse.json({error:"active_paid_plan_required"},{status:402,headers:noStore});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
  const authorization=req.headers.get("authorization")||"";
  if(!url||!publishable||!authorization)return NextResponse.json({error:"mobile_voice_not_configured"},{status:503,headers:noStore});
  // Read only the authenticated account's route, enforcing the existing Supabase RLS policy.
  // This does not require a privileged server key and cannot read another user's routes.
  const db=createClient(url,publishable,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization}}
  });
  const {data,error}=await db.from("smartjob_phone_routes")
    .select("id,user_id,receive_method,enabled").eq("user_id",userId)
    .eq("receive_method","ios_app").eq("enabled",true).limit(1).maybeSingle();
  if(error){console.error("Smart Job mobile route lookup",{code:error.code||"unknown",message:String(error.message||"unknown").slice(0,220),status:("status" in error?error.status:"n/a")});
    return NextResponse.json({error:"mobile_voice_unavailable"},{status:503,headers:noStore});}
  // The verified user's Preview pilot may register for a test call without
  // activating a production phone route or changing a Twilio webhook.
  let testOnly=false;
  if(!data&&process.env.SMARTJOB_IOS_TEST_MODE==="true"){
    const verified=await db.from("smartjob_provisioning_requests")
      .select("id").eq("user_id",userId).eq("answer_method","app")
      .not("phone_verified_at","is",null)
      .in("status",["pending","contacted","approved","activated"])
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(verified.error){
      console.error("Smart Job iOS verified pilot lookup",verified.error.code||"unknown");
      return NextResponse.json({error:"mobile_voice_unavailable"},{status:503,headers:noStore});
    }
    testOnly=Boolean(verified.data);
  }
  if(!data&&!testOnly)return NextResponse.json({error:"mobile_voice_not_approved"},{status:403,headers:noStore});
  const identity=serviceIdentity(userId);
  const token=voiceToken(identity);
  if(!token)return NextResponse.json({error:"mobile_voice_not_configured"},{status:503,headers:noStore});
  return NextResponse.json({token,identity,expiresInSeconds:3600,testOnly},{headers:noStore});
}
