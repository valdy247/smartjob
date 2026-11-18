import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {adsMetaReady,activeMeta,authorizedAccounts,authorizedPages,metaGet,metaId,metaPost,
 noCache,uuid,validDestination} from "@/lib/vmv-marketing-ads-meta";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Draft={name:string;headline:string;message:string;destination:string;imageHash:string;
 pageId:string;instagramId:string|null;placements:"facebook"|"facebook_instagram";
 dailyBudgetCents:number;durationDays:number;totalBudgetCents:number;country:"US";
 objective:"OUTCOME_TRAFFIC";specialCategoriesAcknowledged:true;adAccountId:string;cityKey:string;cityName:string;citySearch:string;radiusMiles:10|15|25|50};
const asInt=(x:unknown)=>typeof x==="number"&&Number.isInteger(x)?x:null;
function parseDraft(input:any,adAccountId:string,pages:Awaited<ReturnType<typeof authorizedPages>>,cities:Array<{key:string;name:string;region:string}>):Draft|null{
 const name=typeof input?.name==="string"?input.name.trim():"";
 const headline=typeof input?.headline==="string"?input.headline.trim():"";
 const message=typeof input?.message==="string"?input.message.trim():"";
 const destination=validDestination(input?.destination);
 const imageHash=typeof input?.imageHash==="string"?input.imageHash:"";
 const pageId=typeof input?.pageId==="string"?input.pageId:"";
 const placements=input?.placements;
 const city=cities.find(x=>x.key===input?.cityKey&&x.name===input?.cityName);
 const radius=input?.radiusMiles;
 const daily=asInt(input?.dailyBudgetCents),days=asInt(input?.durationDays);
 const page=pages.find(x=>x.id===pageId);
 if(!page||!name||name.length>80||headline.length<3||headline.length>80||
  message.length<10||message.length>500||!destination||
  !/^[a-f\d]{32}$/i.test(imageHash)||!daily||daily<500||daily>25000||
  !days||days<1||days>30||
  !["facebook","facebook_instagram"].includes(placements)||
  (placements==="facebook_instagram"&&!page.instagramId)||
  input?.specialCategoriesAcknowledged!==true||!city||!metaId(city.key)||
  ![10,15,25,50].includes(radius))return null;
 return {name,headline,message,destination,imageHash,pageId,
  instagramId:page.instagramId,placements,dailyBudgetCents:daily,
  durationDays:days,totalBudgetCents:daily*days,country:"US",
  objective:"OUTCOME_TRAFFIC",specialCategoriesAcknowledged:true,adAccountId,
  cityKey:city.key,cityName:city.name,citySearch:String(input?.citySearch||"").trim().slice(0,80),radiusMiles:radius};
}
const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:noCache});
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);if(!owner)return fail("unauthorized",401);
 const db=billingAdmin();if(!db)return fail("database_unavailable",503);
 const {data,error}=await db.from("vmv_marketing_ads_campaigns")
  .select("id,ad_account_id,status,draft,provider_campaign_id,provider_adset_id,provider_ad_id,approved_at,error_code,created_at")
  .eq("owner_id",owner).order("created_at",{ascending:false}).limit(50);
 if(error)return fail("campaign_history_unavailable",503);
 return NextResponse.json({campaigns:data||[],configured:adsMetaReady(),
  publishReady:adsMetaReady()&&process.env.VMV_ADS_META_PUBLISH_ENABLED==="true"&&
   process.env.VMV_ADS_META_ALLOWED_OWNER_ID===owner},{headers:noCache});
}
export async function POST(req:NextRequest){
 if(!adsMetaReady())return fail("meta_pilot_unavailable",503);
 const owner=await authenticatedUser(req);if(!owner)return fail("unauthorized",401);
 const input=await req.json().catch(()=>null);
 const operation=input?.operation;
 if(!["draft","create_paused","activate","pause"].includes(operation))return fail("invalid_action");
 const db=billingAdmin();if(!db)return fail("database_unavailable",503);
 let active;
 try{active=await activeMeta(owner);}catch{return fail("meta_reconnect_required",409);}
 if(!active)return fail("meta_connect_required",409);
 const selectedAccount=active.connection.selected_ad_account_id;
 if(!selectedAccount)return fail("meta_account_selection_required",409);
 let accounts;
 try{accounts=await authorizedAccounts(active.token);}catch{return fail("meta_accounts_unavailable",502);}
 if(!accounts.some(a=>a.id===selectedAccount&&a.status===1&&a.currency==="USD"))
  return fail("meta_ad_account_not_authorized",403);

 if(operation==="draft"){
  if(!uuid(input?.clientKey))return fail("invalid_idempotency_key");
  let pages;
  try{pages=await authorizedPages(active.token);}catch{return fail("meta_pages_unavailable",502);}
  const citySearch=typeof input?.draft?.citySearch==="string"?input.draft.citySearch.trim():"";
  if(citySearch.length<3||citySearch.length>80)return fail("select_a_meta_city");
  let cities:Array<{key:string;name:string;region:string}>=[];
  try{
   const found=await metaGet("search",active.token,{type:"adgeolocation",
    location_types:JSON.stringify(["city"]),q:citySearch,limit:"25"});
   cities=(Array.isArray(found.data)?found.data:[]).filter((x:any)=>
    metaId(x.key)&&x.country_code==="US"&&x.type==="city")
    .map((x:any)=>({key:String(x.key),name:String(x.name||""),region:String(x.region||"")}));
  }catch{return fail("meta_city_lookup_unavailable",502);}
  const draft=parseDraft(input?.draft,selectedAccount,pages,cities);
  if(!draft)return fail("invalid_campaign_details_or_missing_page");
  const {data,error}=await db.from("vmv_marketing_ads_campaigns").insert({
   owner_id:owner,connection_id:active.connection.id,provider:"meta",
   ad_account_id:selectedAccount,client_key:input.clientKey,draft,status:"draft"
  }).select("id,status,draft").single();
  if(error){
   if(error.code==="23505"){
    const existing=await db.from("vmv_marketing_ads_campaigns")
     .select("id,status,draft").eq("owner_id",owner).eq("client_key",input.clientKey).maybeSingle();
    if(!existing.error&&existing.data)return NextResponse.json({campaign:existing.data,duplicate:true},{headers:noCache});
   }
   return fail("draft_save_failed",503);
  }
  return NextResponse.json({campaign:data},{headers:noCache});
 }
 if(!uuid(input?.campaignId))return fail("invalid_campaign_id");
 const {data:record,error:readError}=await db.from("vmv_marketing_ads_campaigns").select("*")
  .eq("owner_id",owner).eq("id",input.campaignId).maybeSingle();
 if(readError||!record)return fail("campaign_not_found",404);
 if(record.connection_id!==active.connection.id||record.ad_account_id!==selectedAccount)
  return fail("campaign_account_mismatch",409);
 const draft=record.draft as Draft;
 if(draft.adAccountId!==selectedAccount||!metaId(draft.pageId)||
   !validDestination(draft.destination))return fail("campaign_invalid",409);

 if(operation==="create_paused"){
  if(input?.confirmPaused!==true||input?.approvedTotalCents!==draft.totalBudgetCents)
   return fail("explicit_budget_approval_required",403);
  if(record.status!=="draft")return fail("campaign_already_processed",409);
  // The compare-and-set lock prevents duplicate external Meta campaign creation.
  const {data:claimed,error:claimError}=await db.from("vmv_marketing_ads_campaigns")
   .update({status:"provisioning",approved_at:new Date().toISOString(),
    approved_snapshot:draft,updated_at:new Date().toISOString()})
   .eq("id",record.id).eq("owner_id",owner).eq("status","draft").select("id").maybeSingle();
  if(claimError||!claimed)return fail("campaign_already_processing",409);
  let step="campaign";
  try{
   const campaign=await metaPost(selectedAccount+"/campaigns",active.token,{
    name:draft.name,objective:"OUTCOME_TRAFFIC",status:"PAUSED",special_ad_categories:"[]",
    is_adset_budget_sharing_enabled:"false",buying_type:"AUCTION"
   });
   if(!metaId(campaign.id))throw Error("invalid_campaign_response");
   await db.from("vmv_marketing_ads_campaigns").update({provider_campaign_id:campaign.id}).eq("id",record.id);
   step="adset";
   const start=Math.floor(Date.now()/1000)+900;
   const end=start+draft.durationDays*86400;
   const adset=await metaPost(selectedAccount+"/adsets",active.token,{
    name:draft.name+" — audiencia",campaign_id:campaign.id,status:"PAUSED",
    billing_event:"IMPRESSIONS",optimization_goal:"LINK_CLICKS",
    bid_strategy:"LOWEST_COST_WITHOUT_CAP",
    lifetime_budget:String(draft.totalBudgetCents),
    start_time:String(start),end_time:String(end),
    destination_type:"WEBSITE",
    targeting:JSON.stringify({geo_locations:{cities:[{key:draft.cityKey,radius:draft.radiusMiles,distance_unit:"mile"}]},age_min:18,
     publisher_platforms:draft.placements==="facebook"?
       ["facebook"]:["facebook","instagram"]})
   });
   if(!metaId(adset.id))throw Error("invalid_adset_response");
   await db.from("vmv_marketing_ads_campaigns").update({provider_adset_id:adset.id}).eq("id",record.id);
   step="creative";
   const creative=await metaPost(selectedAccount+"/adcreatives",active.token,{
    name:draft.name+" — creativo",
    object_story_spec:JSON.stringify({
     page_id:draft.pageId,
     ...(draft.placements==="facebook_instagram"&&draft.instagramId?
      {instagram_actor_id:draft.instagramId}:{}),
     link_data:{link:draft.destination,message:draft.message,name:draft.headline,
      image_hash:draft.imageHash,
      call_to_action:{type:"LEARN_MORE",value:{link:draft.destination}}}
    })
   });
   if(!metaId(creative.id))throw Error("invalid_creative_response");
   await db.from("vmv_marketing_ads_campaigns").update({provider_creative_id:creative.id}).eq("id",record.id);
   step="ad";
   const ad=await metaPost(selectedAccount+"/ads",active.token,{
    name:draft.name+" — anuncio",adset_id:adset.id,
    creative:JSON.stringify({creative_id:creative.id}),status:"PAUSED"
   });
   if(!metaId(ad.id))throw Error("invalid_ad_response");
   const {error:saveError}=await db.from("vmv_marketing_ads_campaigns").update({
    provider_ad_id:ad.id,status:"paused",error_code:null,updated_at:new Date().toISOString()
   }).eq("id",record.id).eq("owner_id",owner).eq("status","provisioning");
   if(saveError)throw Error("confirmation_not_saved");
   return NextResponse.json({status:"paused",campaignId:record.id,
    metaCampaignId:campaign.id,metaAdId:ad.id,adSpendActive:false},{headers:noCache});
  }catch(error){
   const metaCode=error instanceof Error&&/^meta_api_\d+$/.test(error.message)?
    error.message:"provider_or_save_error";
   await db.from("vmv_marketing_ads_campaigns").update({
    status:"failed",error_code:step+":"+metaCode,updated_at:new Date().toISOString()
   }).eq("id",record.id).eq("owner_id",owner);
   return fail("provider_creation_incomplete_review_"+step,502);
  }
 }
 if(!metaId(record.provider_campaign_id)||!metaId(record.provider_adset_id)||!metaId(record.provider_ad_id))
  return fail("campaign_not_fully_created",409);
 if(operation==="activate"){
  // Operational kill switch: never active until provider and financial QA have passed.
  if(process.env.VMV_ADS_META_PUBLISH_ENABLED!=="true"||
     process.env.VMV_ADS_META_ALLOWED_OWNER_ID!==owner)return fail("publishing_not_enabled",403);
  if(input?.confirmSpend!==true||input?.approvedTotalCents!==draft.totalBudgetCents||
     input?.confirmationText!=="PUBLICAR"||record.status!=="paused"||
     JSON.stringify(record.approved_snapshot)!==JSON.stringify(draft))
    return fail("fresh_publication_approval_required",403);
  const {data:claimed}=await db.from("vmv_marketing_ads_campaigns")
   .update({status:"activation_pending",updated_at:new Date().toISOString()})
   .eq("owner_id",owner).eq("id",record.id).eq("status","paused").select("id").maybeSingle();
  if(!claimed)return fail("activation_already_in_progress",409);
  try{
   // Activate ad and ad set first, campaign last. All objects remain paused if campaign does.
   await metaPost(record.provider_ad_id,active.token,{status:"ACTIVE"});
   await metaPost(record.provider_adset_id,active.token,{status:"ACTIVE"});
   await metaPost(record.provider_campaign_id,active.token,{status:"ACTIVE"});
   const {error}=await db.from("vmv_marketing_ads_campaigns")
    .update({status:"active",updated_at:new Date().toISOString()}).eq("id",record.id);
   if(error)throw Error("status_write_failure");
   return NextResponse.json({status:"active",campaignId:record.id},{headers:noCache});
  }catch{
   // On uncertain outcome, pause the top-level campaign; NEVER claim that it is inactive
   // until we receive confirmation from Meta, as network errors can hide success.
   try{await metaPost(record.provider_campaign_id,active.token,{status:"PAUSED"});}catch{}
   await db.from("vmv_marketing_ads_campaigns").update({
    status:"activation_pending",error_code:"activation_requires_manual_reconciliation"
   }).eq("id",record.id);
   return fail("activation_state_requires_reconciliation",502);
  }
 }
 if(operation==="pause"){
  if(!["active","activation_pending","paused"].includes(record.status))return fail("campaign_not_active",409);
  try{
   await metaPost(record.provider_campaign_id,active.token,{status:"PAUSED"});
   await db.from("vmv_marketing_ads_campaigns").update({
    status:"customer_paused",updated_at:new Date().toISOString()
   }).eq("id",record.id).eq("owner_id",owner);
   return NextResponse.json({status:"customer_paused"},{headers:noCache});
  }catch{return fail("could_not_confirm_pause_with_meta",502);}
 }
 return fail("unsupported_action");
}
