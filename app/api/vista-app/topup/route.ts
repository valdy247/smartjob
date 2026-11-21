import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const PILOT_ORIGIN="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
const isPlan=(v:unknown):v is "starter"|"pro"|"premium"=>
 v==="starter"||v==="pro"||v==="premium";

export async function POST(req:NextRequest){
 const bearer=req.headers.get("authorization")||"";
 const match=/^Bearer\s+([A-Za-z0-9._~+/-]+)$/i.exec(bearer);
 const userId=await authenticatedUser(req);
 if(!match||!userId)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 if(!isPlan(body?.plan)||body?.service!=="translated")
  return NextResponse.json({error:"invalid_topup_type"},{status:400,headers});
 // Only the existing test-mode translated-minute top-up exists. Never
 // pretend that a direct-call top-up, live payment or second balance exists.
 try{
  const response=await fetch(PILOT_ORIGIN+"/api/billing/topup",{
   method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
   headers:{Authorization:"Bearer "+match[1],"Content-Type":"application/json"},
   body:JSON.stringify({plan:body.plan})
  });
  if(!response.headers.get("content-type")?.includes("application/json"))
   return NextResponse.json({error:"topup_unavailable"},{status:503,headers});
  const data=await response.json();
  if(!response.ok)return NextResponse.json({
   error:response.status===403?"active_plan_required":"topup_unavailable"
  },{status:response.status===403?403:503,headers});
  const checkout=typeof data?.url==="string"?data.url:"";
  const target=new URL(checkout);
  if(data.mode!=="test"||target.protocol!=="https:"||target.hostname!=="checkout.stripe.com")
   return NextResponse.json({error:"invalid_checkout_url"},{status:503,headers});
  return NextResponse.json({url:checkout,mode:"test",service:"translated"},{headers});
 }catch{return NextResponse.json({error:"topup_unavailable"},{status:503,headers});}
}
