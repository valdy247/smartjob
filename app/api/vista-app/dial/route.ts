import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const origin="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
const headers={"Cache-Control":"private, no-store, max-age=0"};
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers});
const validToken=(v:string)=>/^Bearer\s+[A-Za-z0-9._~+/-]+$/i.test(v);
async function authorized(req:NextRequest){
 const owner=await authenticatedUser(req);
 const bearer=req.headers.get("authorization")||"";
 return owner&&validToken(bearer)?bearer:null;
}
export async function GET(req:NextRequest){
 const bearer=await authorized(req);
 if(!bearer)return respond({available:false,error:"unauthorized"},401);
 try{
  const r=await fetch(origin+"/api/ios/dial",{
   method:"GET",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10500),
   headers:{Authorization:bearer}
  });
  const data=r.headers.get("content-type")?.includes("application/json")?await r.json().catch(()=>null):null;
  return respond({available:r.ok&&data?.available===true});
 }catch{return respond({available:false});}
}
export async function POST(req:NextRequest){
 const bearer=await authorized(req);
 if(!bearer)return respond({error:"unauthorized"},401);
 const body=await req.json().catch(()=>null);
 if(typeof body?.phone!=="string"||body.phone.length>24||body.mode!=="direct")
  return respond({error:"invalid_phone"},400);
 try{
  const r=await fetch(origin+"/api/ios/dial",{
   method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(17500),
   headers:{Authorization:bearer,"Content-Type":"application/json"},
   body:JSON.stringify({phone:body.phone,mode:"direct"})
  });
  const data=r.headers.get("content-type")?.includes("application/json")?await r.json().catch(()=>null):null;
  if(!r.ok)return respond({error:typeof data?.error==="string"?data.error:"dialer_unavailable"},
   [400,401,403,409,422,429,503].includes(r.status)?r.status:503);
  if(data?.started!==true)return respond({error:"dialer_unavailable"},503);
  return respond({started:true,mode:"direct",message:"VMV está llamando a tu iPhone."},202);
 }catch{return respond({error:"dialer_unavailable"},503);}
}
