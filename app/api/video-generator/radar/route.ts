import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders,validUuid} from "@/lib/vmv-video-generator";
import {askAiAgent} from "@/lib/vmv-ai-agents/model";
import {cleanRadarQuery,validRadarId,videoToRadar,type RadarVideo,type RadarIdea} from "@/lib/vmv-video-radar";
import {validPilotLanguage,pilotLanguageName} from "@/lib/vmv-pilot-voice-config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:videoHeaders});
type Scan={id:string;owner_id:string;query:string;days:number;status:string;
 results:RadarVideo[];ideas:RadarIdea[];ideas_language?:string;created_at:string;failure_code:string|null};
const show=(scan:Scan)=>({scan:{
 id:scan.id,query:scan.query,days:scan.days,status:scan.status,
 items:scan.results||[],ideas:scan.ideas||[],ideasLanguage:scan.ideas_language||"es",createdAt:scan.created_at,
 failure:scan.failure_code
}});
async function account(req:NextRequest){
 const owner=await authenticatedUser(req);
 return owner&&videoAllowed(owner)?owner:null;
}
async function readScan(id:string,owner:string){
 const {data,error}=await videoDb().from("vmv_video_radar_scans")
  .select("id,owner_id,query,days,status,results,ideas,ideas_language,created_at,failure_code")
  .eq("owner_id",owner).eq("id",id).maybeSingle();
 if(error||!data)return null;
 return data as Scan;
}
const youtubeKey=()=>process.env.YOUTUBE_DATA_API_KEY?.trim()||"";
async function youtubeJson(path:string,query:URLSearchParams){
 query.set("key",youtubeKey());
 const res=await fetch("https://www.googleapis.com/youtube/v3/"+path+"?"+query.toString(),{
  cache:"no-store",signal:AbortSignal.timeout(11500),headers:{Accept:"application/json"}
 });
 if(!res.ok){
  // Keep the private API key, response body, and user search terms out of logs.
  if(res.status===429||res.status===403)throw Error("radar_youtube_quota_or_access");
  throw Error("radar_youtube_unavailable");
 }
 const data=await res.json().catch(()=>null);
 if(!data||!Array.isArray(data.items))throw Error("radar_youtube_invalid");
 return data.items as Record<string,unknown>[];
}
async function searchYouTube(query:string,days:number):Promise<RadarVideo[]>{
 const since=new Date(Date.now()-days*86400000).toISOString();
 const params=new URLSearchParams({part:"snippet",type:"video",maxResults:"12",
  q:query,order:"viewCount",publishedAfter:since,videoDuration:"short",
  safeSearch:"moderate",relevanceLanguage:"es",regionCode:"US"});
 const search=await youtubeJson("search",params);
 const ids=search.map(item=>(item.id as Record<string,unknown>|undefined)?.videoId)
  .filter(validRadarId);
 if(!ids.length)return [];
 const items=await youtubeJson("videos",new URLSearchParams({
  part:"snippet,statistics",id:ids.join(",")
 }));
 return items.map(item=>videoToRadar(item)).filter((v):v is RadarVideo=>Boolean(v))
  .sort((a,b)=>b.views-a.views).slice(0,12);
}
/** Private, read-only source research; no posting, downloading or provider charges. */
export async function GET(req:NextRequest){
 const owner=await account(req);
 if(!owner)return reply({error:"video_not_enabled_for_account"},403);
 const id=req.nextUrl.searchParams.get("id");
 if(id){
  if(!validUuid(id))return reply({error:"radar_invalid_scan"},400);
  const found=await readScan(id,owner);
  return found?reply(show(found)):reply({error:"radar_scan_not_found"},404);
 }
 const query=cleanRadarQuery(req.nextUrl.searchParams.get("q"));
 if(!query){
  const {data,error}=await videoDb().from("vmv_video_radar_scans")
   .select("id,owner_id,query,days,status,results,ideas,ideas_language,created_at,failure_code")
   .eq("owner_id",owner).eq("status","ready")
   .gte("created_at",new Date(Date.now()-29*86400000).toISOString())
   .order("created_at",{ascending:false}).limit(4);
  if(error)return reply({error:"radar_database_unavailable"},503);
  // Cheap owner-only provider probe: distinguish a configured key from an authorized one.
  let health=youtubeKey()?"unknown":"radar_youtube_key_missing";
  if(youtubeKey()&&req.headers.get("x-vmv-youtube-consent")==="accepted"){
   try{
    await youtubeJson("videos",new URLSearchParams({part:"snippet",id:"jNQXAC9IVRw",maxResults:"1"}));
    health="ok";
   }catch(e){health=e instanceof Error?e.message:"radar_youtube_unavailable";}
  }
  return reply({history:(data||[]).map(row=>show(row as Scan).scan),
   configured:Boolean(youtubeKey()),health,source:"youtube"});
 }
 if(req.headers.get("x-vmv-youtube-consent")!=="accepted")return reply({error:"radar_consent_required"},403);
 const days=Number(req.nextUrl.searchParams.get("days")||"30");
 if(![7,30,90].includes(days))return reply({error:"radar_invalid_window"},400);
 if(!youtubeKey())return reply({error:"radar_youtube_key_missing"},503);
 try{
  const db=videoDb();
  const reserved=await db.rpc("vmv_video_radar_claim",{
   p_owner:owner,p_query:query,p_days:days
  });
  if(reserved.error){
   if(String(reserved.error.message).includes("radar_daily_limit"))
    return reply({error:"radar_daily_limit"},429);
   return reply({error:"radar_database_unavailable"},503);
  }
  const scanId=reserved.data?.id;
  if(!validUuid(scanId))return reply({error:"radar_database_unavailable"},503);
  if(reserved.data?.reused===true){
   const cached=await readScan(scanId,owner);
   return cached?reply(show(cached),cached.status==="pending"?202:200):
    reply({error:"radar_database_unavailable"},503);
  }
  try{
   const videos=await searchYouTube(query,days);
   const {data,error}=await db.from("vmv_video_radar_scans")
    .update({status:"ready",results:videos,updated_at:new Date().toISOString(),failure_code:null})
    .eq("id",scanId).eq("owner_id",owner).select("*").single();
   if(error||!data)throw Error("radar_database_unavailable");
   return reply(show(data as Scan));
  }catch(e){
   const code=e instanceof Error&&e.message.startsWith("radar_")?e.message:"radar_youtube_unavailable";
   await db.from("vmv_video_radar_scans").update({status:"failed",failure_code:code,updated_at:new Date().toISOString()})
    .eq("id",scanId).eq("owner_id",owner);
   return reply({error:code},503);
  }
 }catch{return reply({error:"radar_database_unavailable"},503);}
}
/** AI uses actual source metadata only; no transcript/video viewing claims. */
export async function POST(req:NextRequest){
 const owner=await account(req);
 if(!owner)return reply({error:"video_not_enabled_for_account"},403);
 if(req.headers.get("x-vmv-youtube-consent")!=="accepted")return reply({error:"radar_consent_required"},403);
 const body=await req.json().catch(()=>null);
 if(!validUuid(body?.scanId))return reply({error:"radar_invalid_scan"},400);
 const language=validPilotLanguage(body?.language)?body.language:"es";
 const scan=await readScan(body.scanId,owner);
 if(!scan||scan.status!=="ready")return reply({error:"radar_scan_not_found"},404);
 if(scan.ideas?.length&&scan.ideas_language===language)return reply(show(scan));
 const items=scan.results.slice(0,5);
 if(!items.length)return reply({error:"radar_empty"},409);
 try{
  const response=await askAiAgent({
   system:[
    "You are an original content trend researcher for entertainment, education, personal creators AND businesses.",
    "Use ONLY the supplied video titles, descriptions, public view counts and publication dates.",
    "You have NOT watched the videos, heard the audio, read transcripts, or observed retention or growth history.",
    "Do not assert specific shots/hooks/engagement mechanics from a video unless its metadata explicitly supports it.",
    "Never reproduce original video content, brand slogans or copyrighted characters.",
    "Propose 3 distinct original concepts relevant to the niche and creator goals; do not assume a business or product exists.",
    "Reply with strict JSON only: {ideas:[{sourceId,hook,concept,cta,reason}]}.",
    "sourceId MUST match an input video id. Reasons must say the idea is a hypothesis based on metadata.",
    "Hooks and concepts STRICTLY in "+pilotLanguageName(language)+". No invented claims or numbers; marketing CTA only for business topics."
   ].join(" "),
   messages:[{role:"user",content:JSON.stringify({
    niche:scan.query,videos:items.map(v=>({
     id:v.id,title:v.title,channel:v.channel,description:v.description,
     views:v.views,publishedAt:v.publishedAt
    }))
   })}],maxOutputTokens:900,temperature:0.45,timeoutMs:18000
  });
  const raw=response.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
  const output=JSON.parse(raw.slice(raw.indexOf("{"),raw.lastIndexOf("}")+1));
  const allowed=new Set(items.map(v=>v.id));
  const ideas=(Array.isArray(output?.ideas)?output.ideas:[]).slice(0,3).filter(
   (v:Record<string,unknown>)=>allowed.has(String(v.sourceId))&&
    ["hook","concept","cta","reason"].every(key=>typeof v[key]==="string"&&String(v[key]).trim().length>6)
  ).map((v:Record<string,unknown>)=>({
   sourceId:String(v.sourceId),hook:String(v.hook).slice(0,160),
   concept:String(v.concept).slice(0,350),cta:String(v.cta).slice(0,150),
   reason:String(v.reason).slice(0,210)
  }));
  if(!ideas.length)return reply({error:"radar_ai_unavailable"},503);
  const db=videoDb();
  const {data,error}=await db.from("vmv_video_radar_scans")
   .update({ideas,ideas_language:language,updated_at:new Date().toISOString()}).eq("id",scan.id)
   .eq("owner_id",owner).eq("status","ready").select("*").single();
  return error||!data?reply({error:"radar_database_unavailable"},503):reply(show(data as Scan));
 }catch{return reply({error:"radar_ai_unavailable"},503);}
}

/** The user can delete their private research without affecting YouTube videos. */
export async function DELETE(req:NextRequest){
 const owner=await account(req);
 if(!owner)return reply({error:"video_not_enabled_for_account"},403);
 const db=videoDb();
 const cleared=await db.rpc("vmv_video_radar_clear_owner",{p_owner:owner});
 return cleared.error?reply({error:"radar_database_unavailable"},503):reply({deleted:true});
}
