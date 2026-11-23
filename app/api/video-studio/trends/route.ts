import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {cleanRadarQuery,validRadarId,videoToRadar,type RadarVideo} from "@/lib/vmv-video-radar";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
type Scan={id:string;owner_id:string;query:string;status:string;results:RadarVideo[];failure_code:string|null};
const transform=(scan:Scan)=>({
 scan:{id:scan.id,status:scan.status,items:(scan.results||[]).slice(0,3).map(v=>({
  sourceId:v.id,title:v.title,thumbnail:v.thumbnail,url:v.url,channel:v.channel,views:v.views
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
 if(!res.ok)throw Error(res.status===403||res.status===429?"studio_youtube_quota":"studio_youtube_unavailable");
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
 const query=cleanRadarQuery(req.nextUrl.searchParams.get("q"));
 if(!query)return reply({error:"studio_trends_invalid"},400);
 const key=process.env.YOUTUBE_DATA_API_KEY?.trim();
 if(!key)return reply({error:"studio_youtube_not_connected"},503);
 let scanId:string|null=null;
 try{
  // Reuse existing durable, owner-scoped six-hour cache and twenty searches/day quota.
  const db=videoDb();
  const claimed=await db.rpc("vmv_video_radar_claim",{p_owner:owner,p_query:query,p_days:30});
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
  const since=new Date(Date.now()-30*86400000).toISOString();
  const search=await youtubeApi("search",new URLSearchParams({
   part:"snippet",type:"video",maxResults:"12",q:query,order:"viewCount",
   publishedAfter:since,videoDuration:"short",safeSearch:"moderate"
  }),key);
  const ids=search.map(item=>(item.id as Record<string,unknown>|undefined)?.videoId).filter(validRadarId);
  const results:RadarVideo[]=ids.length?(await youtubeApi("videos",
   new URLSearchParams({part:"snippet,statistics",id:ids.join(",")}),key))
   .map(v=>videoToRadar(v)).filter((v):v is RadarVideo=>Boolean(v))
   .sort((a,b)=>b.views-a.views).slice(0,12):[];
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
  return reply({error:code},503);
 }
}
