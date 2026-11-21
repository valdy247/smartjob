import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {adsMetaReady,activeMeta,authorizedAccounts,inspectMetaPayment,noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Payment readiness only. No ads created, payments initiated, or billing data returned.
export async function GET(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({error:"meta_pilot_unavailable"},{status:503,headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 try{
  const active=await activeMeta(owner);
  if(!active?.connection.selected_ad_account_id)
   return NextResponse.json({error:"meta_account_selection_required"},{status:409,headers:noCache});
  const accountId=active.connection.selected_ad_account_id;
  const accounts=await authorizedAccounts(active.token);
  if(!accounts.some(a=>a.id===accountId&&a.status===1&&a.currency==="USD"))
   return NextResponse.json({state:"inactive",checkedAt:new Date().toISOString()},{headers:noCache});
  return NextResponse.json(await inspectMetaPayment(active.token,accountId),{headers:noCache});
 }catch{
  return NextResponse.json({state:"unverified",checkedAt:new Date().toISOString()},{headers:noCache});
 }
}