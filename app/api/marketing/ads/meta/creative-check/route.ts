import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {adsMetaReady,activeMeta,metaCreativeReason,MetaApiError,
 validateMetaLinkCreative,noCache,uuid} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:noCache});
/** Validates an existing own draft/failed creative in Meta, without creating any object. */
export async function POST(req:NextRequest){
 if(!adsMetaReady())return reply({error:"meta_pilot_unavailable"},503);
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"unauthorized"},401);
 const body=await req.json().catch(()=>null);
 if(!uuid(body?.campaignId))return reply({error:"invalid_campaign_id"},400);
 const db=billingAdmin();
 if(!db)return reply({error:"database_unavailable"},503);
 const {data:campaign,error:queryError}=await db.from("vmv_marketing_ads_campaigns")
  .select("id,owner_id,status,draft,connection_id,ad_account_id")
  .eq("id",body.campaignId).eq("owner_id",owner).maybeSingle();
 if(queryError||!campaign)return reply({error:"campaign_not_found"},404);
 if(!["draft","failed"].includes(campaign.status))
  return reply({error:"campaign_not_eligible_for_validation"},409);
 let connected;
 try{connected=await activeMeta(owner);}catch{return reply({error:"meta_reconnect_required"},409);}
 if(!connected||connected.connection.id!==campaign.connection_id||
  connected.connection.selected_ad_account_id!==campaign.ad_account_id)
  return reply({error:"campaign_account_mismatch"},409);
 try{
  await validateMetaLinkCreative(campaign.ad_account_id,connected.token,campaign.draft);
  return reply({ok:true,reason:"meta_creative_validation_passed",
   createdInMeta:false,adSpendActive:false});
 }catch(error){
  const reason=metaCreativeReason(error);
  const subcode=error instanceof MetaApiError&&Number.isInteger(error.subcode)&&
   Number(error.subcode)>0?error.subcode:null;
  console.warn("[meta-ads] non-mutating creative validation rejected",{
   campaignRef:campaign.id.slice(0,8),reason,subcode,
   metaCode:error instanceof MetaApiError?error.code:null,
   metaTrace:error instanceof MetaApiError?error.traceId:null
  });
  return reply({ok:false,reason,subcode,
   ...(error instanceof MetaApiError&&error.providerMessage?{metaMessage:error.providerMessage}:{}),
   ...(error instanceof MetaApiError&&error.traceId?{metaTrace:error.traceId}:{}),
   createdInMeta:false,adSpendActive:false});
 }
}
