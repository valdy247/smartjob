import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const callSid=/^CA[a-f0-9]{32}$/i;
export async function GET(req:NextRequest){
 if(process.env.SMARTJOB_IOS_TEST_MODE!=="true")return NextResponse.json({error:"disabled"},{status:403,headers:noStore});
 const userId=await authenticatedUser(req);
 if(!userId)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const sid=req.nextUrl.searchParams.get("sid")||"";
 if(!callSid.test(sid))return NextResponse.json({error:"invalid_sid"},{status:400,headers:noStore});
 const account=process.env.TWILIO_ACCOUNT_SID||"",token=process.env.TWILIO_AUTH_TOKEN||"";
 const from=process.env.TWILIO_NUMBER||"";
 if(!/^AC[a-f0-9]{32}$/i.test(account)||!token||!/^\+[1-9]\d{7,14}$/.test(from))
   return NextResponse.json({error:"not_configured"},{status:503,headers:noStore});
 const auth="Basic "+Buffer.from(account+":"+token).toString("base64");
 const url="https://api.twilio.com/2010-04-01/Accounts/"+account+"/Calls/"+sid;
 try{
  const res=await fetch(url+".json",{headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(5500)});
  if(!res.ok)return NextResponse.json({error:"provider_unavailable"},{status:502,headers:noStore});
  const item=await res.json() as Record<string,unknown>;
  const expectedTo="client:sj_"+userId.replaceAll("-","");
  const created=Date.parse(String(item.date_created||""));
  if(item.to!==expectedTo||item.from!==from||!Number.isFinite(created)||Math.abs(Date.now()-created)>48*3600*1000)
    return NextResponse.json({error:"not_found"},{status:404,headers:noStore});
  const status=String(item.status||"unknown");
  let providerCode=typeof item.error_code==="number"?item.error_code:null;
  const notifications=await fetch(url+"/Notifications.json?PageSize=20",{
    headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(5500)
  }).catch(()=>null);
  if(notifications?.ok){
   const data=await notifications.json() as {notifications?:Array<{error_code?:number|string}>};
   const errors=(data.notifications||[]).map(n=>Number(n.error_code)).filter(n=>Number.isInteger(n)&&n>0);
   if(errors.length)providerCode=errors[0];
  }
  return NextResponse.json({status,providerCode,delivered:status==="in-progress"||status==="completed"&&Number(item.duration||0)>0},{headers:noStore});
 }catch(e){
  console.error("Smart Job iOS delivery status unavailable",e instanceof Error?e.name:"unknown");
  return NextResponse.json({error:"provider_unavailable"},{status:503,headers:noStore});
 }
}
