import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// The native iPhone Preview uses this same pilot API. Keep minute balances
// authoritative on that server; this deployment has no billing admin key.
// Never forward arbitrary paths, cookies, or user-supplied origins.
const PILOT_ORIGIN="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
const noStore={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
const sources={
 billing:"/api/billing/overview",
 line:"/api/ios/account-overview",
 preferences:"/api/billing/preferences"
} as const;

type Key=keyof typeof sources;
type Result={ok:boolean;data:unknown|null;status:number};
async function readSource(key:Key,token:string):Promise<Result>{
 try{
  const response=await fetch(PILOT_ORIGIN+sources[key],{
   method:"GET",headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(9000),redirect:"error"
  });
  const type=response.headers.get("content-type")||"";
  if(!type.includes("application/json"))return {ok:false,data:null,status:502};
  if(!response.ok)return {ok:false,data:null,status:response.status};
  return {ok:true,data:await response.json(),status:200};
 }catch{return {ok:false,data:null,status:503};}
}
async function auth(req:NextRequest){
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]||"";
 if(!token||!await authenticatedUser(req))return null;
 return token;
}
export async function GET(req:NextRequest){
 const token=await auth(req);
 if(!token)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const [billing,line,preferences]=await Promise.all([
  readSource("billing",token),readSource("line",token),readSource("preferences",token)
 ]);
 // Partial failures stay visibly unavailable. Never invent zero minutes.
 return NextResponse.json({billing,line,preferences},{headers:noStore});
}
export async function POST(req:NextRequest){
 const token=await auth(req);
 if(!token)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const body=await req.json().catch(()=>null);
 if(!body||!["default","bright","calm"].includes(body.voice_customer)||
  !["default","bright","calm"].includes(body.voice_owner)){
  return NextResponse.json({error:"invalid_voice"},{status:400,headers:noStore});
 }
 const greetings=[body.greeting_customer,body.greeting_owner];
 if(greetings.some(value=>typeof value!=="string"||value.length>180||
  /[<>\r\n]/.test(value)||(value.trim().length>0&&value.trim().length<10))){
  return NextResponse.json({error:"invalid_greeting"},{status:400,headers:noStore});
 }
 try{
  const response=await fetch(PILOT_ORIGIN+sources.preferences,{
   method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(9000),
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({
    voice_customer:body.voice_customer,voice_owner:body.voice_owner,
    greeting_customer:body.greeting_customer,greeting_owner:body.greeting_owner
   })
  });
  const value=response.headers.get("content-type")?.includes("application/json")?
   await response.json().catch(()=>null):null;
  if(!response.ok)return NextResponse.json({
   error:response.status===403?"plan_required":response.status===400?"invalid_preferences":"upstream_unavailable"
  },{status:[400,401,403].includes(response.status)?response.status:503,headers:noStore});
  return NextResponse.json({saved:value?.saved===true},{headers:noStore});
 }catch{return NextResponse.json({error:"upstream_unavailable"},{status:503,headers:noStore});}
}
