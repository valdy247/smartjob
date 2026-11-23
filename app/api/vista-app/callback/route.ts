import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const origin="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
const headers={"Cache-Control":"private, no-store, max-age=0"};
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+[A-Za-z0-9._~+/-]+$/i.test(bearer))
  return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 const bridgeSid=body?.bridgeSid;
 if(typeof bridgeSid!=="string"||!/^CA[a-f\d]{32}$/i.test(bridgeSid))
  return NextResponse.json({error:"invalid_call"},{status:400,headers});
 try{
  const upstream=await fetch(origin+"/api/ios/callback",{
   method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(11500),
   headers:{Authorization:bearer,"Content-Type":"application/json"},
   body:JSON.stringify({bridgeSid,mode:"direct"})
  });
  const value=upstream.headers.get("content-type")?.includes("application/json")
   ?await upstream.json().catch(()=>null):null;
  if(!upstream.ok)return NextResponse.json({error:typeof value?.error==="string"?value.error:"callback_unavailable"},
   {status:[400,401,403,409,422,429,503].includes(upstream.status)?upstream.status:503,headers});
  if(value?.started!==true||value?.mode!=="direct")
   return NextResponse.json({error:"callback_unavailable"},{status:503,headers});
  return NextResponse.json({started:true,mode:"direct",
   message:"VMV está llamando a tu iPhone. Contesta para conectar con el cliente."},{status:202,headers});
 }catch{return NextResponse.json({error:"callback_unavailable"},{status:503,headers});}
}

export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({available:false,error:"unauthorized"},{status:401,headers});
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+[A-Za-z0-9._~+/-]+$/i.test(bearer))
  return NextResponse.json({available:false,error:"unauthorized"},{status:401,headers});
 try{
  const upstream=await fetch(origin+"/api/ios/callback",{
   method:"GET",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(9000),
   headers:{Authorization:bearer}
  });
  if(!upstream.ok)return NextResponse.json({available:false},{headers});
  const result=await upstream.json().catch(()=>null);
  return NextResponse.json({available:result?.available===true},{headers});
 }catch{return NextResponse.json({available:false},{headers});}
}
