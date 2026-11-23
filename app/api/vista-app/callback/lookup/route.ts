import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const origin="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
const headers={"Cache-Control":"private, no-store, max-age=0"};
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+[A-Za-z0-9._~+/-]+$/i.test(bearer))
  return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 const sid=body?.bridgeSid;
 if(typeof sid!=="string"||!/^CA[a-f\d]{32}$/i.test(sid))
  return NextResponse.json({error:"invalid_call"},{status:400,headers});
 try{
  const response=await fetch(origin+"/api/ios/callback/lookup",{
   method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(11000),
   headers:{Authorization:bearer,"Content-Type":"application/json"},
   body:JSON.stringify({bridgeSid:sid})
  });
  const result=response.headers.get("content-type")?.includes("application/json")
   ?await response.json().catch(()=>null):null;
  if(!response.ok||result?.verified!==true||
     typeof result?.phone!=="string"||!/^\+1[2-9][0-9]{9}$/.test(result.phone))
   return NextResponse.json({error:result?.error||"caller_unavailable"},
    {status:response.status===403?403:response.status===404?404:503,headers});
  return NextResponse.json({phone:result.phone,verified:true},{headers});
 }catch{return NextResponse.json({error:"caller_unavailable"},{status:503,headers});}
}
