import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {activeMeta,metaGet,metaId,noCache,uuid} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 const id=new URL(req.url).searchParams.get("campaignId");
 if(!uuid(id))return NextResponse.json({error:"invalid_campaign_id"},{status:400,headers:noCache});
 const db=billingAdmin();if(!db)return NextResponse.json({error:"database_unavailable"},{status:503,headers:noCache});
 const {data,error}=await db.from("vmv_marketing_ads_campaigns")
  .select("id,connection_id,provider_campaign_id").eq("owner_id",owner).eq("id",id).maybeSingle();
 if(error||!data||!metaId(data.provider_campaign_id))
  return NextResponse.json({error:"campaign_unavailable"},{status:404,headers:noCache});
 try{
  const active=await activeMeta(owner);
  if(!active||active.connection.id!==data.connection_id)
   return NextResponse.json({error:"reconnect_meta"},{status:409,headers:noCache});
  const insights=await metaGet(data.provider_campaign_id+"/insights",active.token,{
   fields:"date_start,date_stop,impressions,reach,clicks,spend,cpc,ctr",
   date_preset:"last_7d",limit:"7"
  });
  return NextResponse.json({source:"Meta Marketing API",period:"last_7d",
   rows:Array.isArray(insights.data)?insights.data:[]},{headers:noCache});
 }catch{return NextResponse.json({error:"insights_unavailable"},{status:502,headers:noCache});}
}
