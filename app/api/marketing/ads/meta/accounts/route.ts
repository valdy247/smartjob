import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {adsMetaReady,activeMeta,authorizedAccounts,authorizedPages,noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({configured:false,connected:false,accounts:[],pages:[]},{headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 try{
  const active=await activeMeta(owner);
  if(!active)return NextResponse.json({configured:true,connected:false,accounts:[],pages:[]},{headers:noCache});
  const [accounts,pages]=await Promise.all([authorizedAccounts(active.token),authorizedPages(active.token)]);
  return NextResponse.json({configured:true,connected:true,connection:{
   id:active.connection.id,providerName:active.connection.provider_name,
   expiresAt:active.connection.token_expires_at,
   selectedAccountId:active.connection.selected_ad_account_id,
   selectedAccountName:active.connection.selected_ad_account_name
  },accounts,pages},{headers:noCache});
 }catch{return NextResponse.json({configured:true,connected:false,error:"provider_unavailable_or_reconnect_required",accounts:[],pages:[]},{status:503,headers:noCache});}
}
export async function POST(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({error:"meta_connection_not_configured"},{status:503,headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 const input=await req.json().catch(()=>null);
 if(typeof input?.accountId!=="string"||!/^act_\d{5,30}$/.test(input.accountId))
  return NextResponse.json({error:"invalid_account"},{status:400,headers:noCache});
 try{
  const connected=await activeMeta(owner);
  if(!connected)return NextResponse.json({error:"meta_connection_required"},{status:409,headers:noCache});
  const accounts=await authorizedAccounts(connected.token);
  const account=accounts.find(a=>a.id===input.accountId&&a.status===1&&a.currency==="USD");
  if(!account)return NextResponse.json({error:"account_not_authorized_or_unsupported_currency"},{status:403,headers:noCache});
  const db=billingAdmin();if(!db)throw Error("db");
  const {error}=await db.from("vmv_marketing_ads_connections")
   .update({selected_ad_account_id:account.id,selected_ad_account_name:account.name})
   .eq("id",connected.connection.id).eq("owner_id",owner);
  if(error)throw Error("db");
  return NextResponse.json({selectedAccountId:account.id,selectedAccountName:account.name},{headers:noCache});
 }catch{return NextResponse.json({error:"account_selection_unavailable"},{status:503,headers:noCache});}
}
