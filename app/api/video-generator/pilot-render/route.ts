import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders,validUuid} from "@/lib/vmv-video-generator";
import {validPilotLanguage,validPilotVoice} from "@/lib/vmv-pilot-voice-config";
import {verifyElevenLabsVoice} from "@/lib/vmv-pilot-elevenlabs";
import {validPilotQuality,type PilotVariant} from "@/lib/vmv-pilot-quality";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:videoHeaders});
const publicFields="id,pilot_id,topic,style,seconds,narration,subtitles,language,voice_provider,voice_id,quality_mode,status,phase,progress,title,output_path,outputs,preferred_model,failure_code,created_at,updated_at,finished_at";
type RenderRow={
 id:string;status:string;output_path:string|null;outputs:Record<string,unknown>|null;
 quality_mode:string;preferred_model:string|null;[key:string]:unknown;
};
const variantPath=(owner:string,id:string,variant:PilotVariant)=>
 owner+"/"+id+"/"+variant+".mp4";
async function present(row:RenderRow,owner:string){
 const {output_path,outputs,...safe}=row;
 const videoUrls:Partial<Record<PilotVariant,string>>={};
 if(row.status==="completed"||row.status==="failed"){
  for(const variant of ["turbo","high"] as const){
   const path=outputs?.[variant];
   if(typeof path!=="string"||path!==variantPath(owner,row.id,variant))continue;
   const {data,error}=await videoDb().storage.from("vmv-pilot-renders")
    .createSignedUrl(path,3600);
   if(!error&&data?.signedUrl)videoUrls[variant]=data.signedUrl;
  }
  // Compatibility with finished videos created before quality selection existed.
  if(row.status==="completed"&&output_path===owner+"/"+row.id+".mp4"&&!videoUrls.high){
   const {data,error}=await videoDb().storage.from("vmv-pilot-renders")
    .createSignedUrl(output_path,3600);
   if(!error&&data?.signedUrl)videoUrls.high=data.signedUrl;
  }
 }
 const preferred=(row.preferred_model==="turbo"||row.preferred_model==="high")
  ?row.preferred_model:"high";
 const videoUrl=videoUrls[preferred]||videoUrls.turbo||videoUrls.high||null;
 return {...safe,videoUrls,videoUrl};
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 try{
  const query=videoDb().from("vmv_pilot_render_jobs").select(publicFields).eq("owner_id",owner);
  const id=req.nextUrl.searchParams.get("id");
  if(id){
   if(!validUuid(id))return reply({error:"invalid_render_job"},400);
   const {data,error}=await query.eq("id",id).maybeSingle();
   if(error)return reply({error:"pilot_render_unavailable"},503);
   if(!data)return reply({error:"render_not_found"},404);
   return reply({job:await present(data as RenderRow,owner)});
  }
  const {data,error}=await query.order("created_at",{ascending:false}).limit(12);
  if(error)return reply({error:"pilot_render_unavailable"},503);
  return reply({jobs:await Promise.all((data||[]).map(row=>present(row as RenderRow,owner)))});
 }catch{return reply({error:"pilot_render_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 // Paid video generation remains disabled until a verified persistent worker is enabled.
 if(process.env.VMV_PILOT_RENDER_ENABLED!=="true")
  return reply({error:"pilot_worker_not_ready"},503);
 const body=await req.json().catch(()=>null);
 const pilotId=body?.pilotId,clientKey=body?.clientKey;
 const topic=typeof body?.topic==="string"?body.topic.trim():"";
 const audience=typeof body?.audience==="string"?body.audience.trim():"";
 const goal=typeof body?.goal==="string"?body.goal.trim():"";
 const style=body?.style,seconds=Number(body?.seconds),language=body?.language;
 const voiceProvider=body?.voiceProvider,voiceId=body?.voiceId;
 const qualityMode=body?.qualityMode;
 if(!validUuid(pilotId)||!validUuid(clientKey)||body?.confirmCost!==true||
  topic.length<3||topic.length>220||audience.length>180||goal.length>180||
  !["stickman","realistic","cinematic","animated","product"].includes(style)||
  ![15,30,60].includes(seconds)||typeof body?.narration!=="boolean"||
  typeof body?.subtitles!=="boolean"||!validPilotLanguage(language)||
  !validPilotVoice(voiceProvider,voiceId)||body.narration!==(voiceProvider!=="none")||
  !validPilotQuality(qualityMode))
  return reply({error:"invalid_render_request"},400);
 if(voiceProvider==="elevenlabs"&&!await verifyElevenLabsVoice(voiceId,language))
  return reply({error:"elevenlabs_voice_unavailable"},400);
 try{
  const {data,error}=await videoDb().rpc("vmv_pilot_render_enqueue_v3",{
   p_owner:owner,p_pilot:pilotId,p_key:clientKey,
   p_topic:topic,p_audience:audience,p_goal:goal,p_style:style,
   p_seconds:seconds,p_narration:body.narration,p_subtitles:body.subtitles,
   p_language:language,p_voice_provider:voiceProvider,p_voice_id:voiceId,
   p_quality_mode:qualityMode
  });
  if(error){
   const code=String(error.message||"");
   if(code.includes("pilot_render_daily_limit"))return reply({error:"pilot_render_daily_limit"},429);
   if(code.includes("pilot_render_active_limit"))return reply({error:"pilot_render_active_limit"},409);
   if(code.includes("pilot_render_owner_or_settings"))return reply({error:"pilot_render_invalid_owner"},403);
   if(code.includes("pilot_render_key_conflict"))return reply({error:"pilot_render_key_conflict"},409);
   return reply({error:"pilot_render_unavailable"},503);
  }
  if(!validUuid(data))return reply({error:"pilot_render_unavailable"},503);
  return reply({id:data,status:"queued",qualityMode},202);
 }catch{return reply({error:"pilot_render_unavailable"},503);}
}
// Selecting the preferred comparison result is metadata only; no provider charges.
export async function PATCH(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const body=await req.json().catch(()=>null),id=body?.id,preferredModel=body?.preferredModel;
 if(!validUuid(id)||(preferredModel!=="turbo"&&preferredModel!=="high"))
  return reply({error:"invalid_render_preference"},400);
 try{
  const db=videoDb();
  const {data:found,error:readError}=await db.from("vmv_pilot_render_jobs")
   .select("id,status,outputs,quality_mode").eq("id",id).eq("owner_id",owner).maybeSingle();
  if(readError)return reply({error:"pilot_render_unavailable"},503);
  if(!found||found.status!=="completed")return reply({error:"render_not_found"},404);
  const outputs=found.outputs as Record<string,unknown>|null;
  if(outputs?.[preferredModel]!==variantPath(owner,id,preferredModel))return reply({error:"render_not_found"},404);
  const {data,error}=await db.from("vmv_pilot_render_jobs")
   .update({preferred_model:preferredModel}).eq("id",id).eq("owner_id",owner)
   .eq("status","completed").select("id,preferred_model").maybeSingle();
  return error||!data?reply({error:"pilot_render_unavailable"},503):reply({preferredModel:data.preferred_model});
 }catch{return reply({error:"pilot_render_unavailable"},503);}
}
