import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {cleanRadarQuery,videoToRadar,type RadarVideo} from "@/lib/vmv-video-radar";
import {isVideoStudioCountry} from "@/lib/vmv-studio-countries";
import {filterTopicTrends,trendTopicCategory} from "@/lib/vmv-studio-trend-relevance";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
type Scan={id:string;owner_id:string;query:string;status:string;results:RadarVideo[];failure_code:string|null};
const topicFromScan=(scan:Scan)=>scan.query.replace(/\s+\[region:[A-Z]{2}\].*$/,"").trim();
const transform=(scan:Scan)=>({
 scan:{id:scan.id,status:scan.status,country:scan.query.match(/\[region:([A-Z]{2})\]/)?.[1]||null,items:filterTopicTrends(scan.results||[],topicFromScan(scan)).slice(0,3).map(v=>({
  sourceId:v.id,title:v.title,description:v.description,thumbnail:v.thumbnail,url:v.url,channel:v.channel,views:v.views
 }))},source:"youtube",originalMetadataOnly:true
});
async function getScan(id:string,owner:string):Promise<Scan|null>{
 const {data,error}=await videoDb().from("vmv_video_radar_scans")
  .select("id,owner_id,query,status,results,failure_code")
  .eq("id",id).eq("owner_id",owner).maybeSingle();
 return error||!data?null:data as Scan;
}
async function youtubeApi(path:string,params:URLSearchParams,key:string){
 params.set("key",key);
 const res=await fetch("https://www.googleapis.com/youtube/v3/"+path+"?"+params.toString(),{
  cache:"no-store",signal:AbortSignal.timeout(11500),headers:{Accept:"application/json"}
 });
 if(!res.ok){
  const error=await res.json().catch(()=>null);
  const reason=String(error?.error?.errors?.[0]?.reason||"");
  if(res.status===400&&["videoChartNotFound","invalidRegionCode","invalidRegion"].includes(reason))
   throw Error("studio_country_unavailable");
  throw Error(res.status===403||res.status===429?"studio_youtube_quota":"studio_youtube_unavailable");
 }
 const body=await res.json().catch(()=>null);
 if(!Array.isArray(body?.items))throw Error("studio_youtube_unavailable");
 return body.items as Record<string,unknown>[];
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 if(req.headers.get("x-vmv-youtube-consent")!=="accepted")return reply({error:"studio_trend_consent_required"},403);
 const existing=req.nextUrl.searchParams.get("id");
 if(existing){
  if(!validUuid(existing))return reply({error:"studio_trends_invalid"},400);
  const scan=await getScan(existing,owner);
  return scan?reply(transform(scan),scan.status==="pending"?202:200):
   reply({error:"studio_trends_not_found"},404);
 }
 const country=(req.nextUrl.searchParams.get("country")||"US").toUpperCase();
 if(!isVideoStudioCountry(country))return reply({error:"studio_trends_invalid"},400);
 // Never accept a language filter here: language belongs exclusively to the
 // separate Video Studio Wizard setting used by the scriptwriter.
 const query=cleanRadarQuery(req.nextUrl.searchParams.get("q"));
 if(!query)return reply({error:"studio_trends_invalid"},400);
 const key=process.env.YOUTUBE_DATA_API_KEY?.trim();
 if(!key)return reply({error:"studio_youtube_not_connected"},503);
 let scanId:string|null=null;
 try{
  // Reuse existing durable, owner-scoped six-hour cache and twenty searches/day quota.
  const db=videoDb();
  const claimed=await db.rpc("vmv_video_radar_claim",{p_owner:owner,p_query:query+" [region:"+country+"] [topic:v2]",p_days:30});
  if(claimed.error){
   const code=String(claimed.error.message).includes("radar_daily_limit")?"studio_trends_daily_limit":"studio_trends_database_unavailable";
   return reply({error:code},code==="studio_trends_daily_limit"?429:503);
  }
  scanId=claimed.data?.id;
  if(!scanId||!validUuid(scanId))return reply({error:"studio_trends_database_unavailable"},503);
  if(claimed.data?.reused===true){
   const scan=await getScan(scanId,owner);
   if(!scan)return reply({error:"studio_trends_database_unavailable"},503);
   return reply({...transform(scan),cached:true},scan.status==="pending"?202:200);
  }
  // search.list?regionCode only restricts where a video is viewable. It does
  // NOT prove that a video is trending in that country. Use the regional
  // mostPopular chart instead, which is explicitly ranked for that region.
  // Never fall back to a worldwide chart when a regional chart is unavailable.
  const category=trendTopicCategory(query);
  const popularParams=(categoryId?:string)=>new URLSearchParams({
   part:"snippet,statistics",chart:"mostPopular",regionCode:country,
   maxResults:"50",...(categoryId?{videoCategoryId:categoryId}:{})
  });
  // Only serve videos relevant to the chosen subject, even when YouTube's
  // category chart is sparse. Never replace missing matches with unrelated hits.
  const results:RadarVideo[]=[];
  const collect=(raw:Record<string,unknown>[])=>{
   const parsed=raw.map(v=>videoToRadar(v)).filter((v):v is RadarVideo=>Boolean(v));
   for(const video of filterTopicTrends(parsed,query)){
    if(!results.some(existing=>existing.id===video.id))results.push(video);
   }
  };
  if(category){
   try{collect(await youtubeApi("videos",popularParams(category),key));}
   catch(e){
    if(e instanceof Error&&e.message==="studio_youtube_quota")throw e;
    // Not every country publishes every category. Try its regional chart,
    // but retain the mandatory topical filter.
   }
  }
  if(results.length<3)collect(await youtubeApi("videos",popularParams(),key));
  results.splice(12);
  const saved=await db.from("vmv_video_radar_scans")
   .update({status:"ready",results,updated_at:new Date().toISOString(),failure_code:null})
   .eq("id",scanId).eq("owner_id",owner).select("*").single();
  if(saved.error||!saved.data)throw Error("studio_trends_database_unavailable");
  return reply(transform(saved.data as Scan));
 }catch(e){
  const code=e instanceof Error&&e.message.startsWith("studio_")?e.message:"studio_trends_unavailable";
  if(scanId)await videoDb().from("vmv_video_radar_scans")
   .update({status:"failed",failure_code:code,updated_at:new Date().toISOString()})
   .eq("id",scanId).eq("owner_id",owner);
  return reply({error:code},code==="studio_country_unavailable"?422:503);
 }
}
