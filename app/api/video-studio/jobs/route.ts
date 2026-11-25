import {randomUUID} from "node:crypto";
import {readManualJpegDimensions,MAX_MANUAL_UPLOAD_BYTES} from "@/lib/vmv-studio-manual";
import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {validPilotLanguage} from "@/lib/vmv-pilot-voice-config";
import {studioRuntimeCompatible} from "@/lib/vmv-studio-script-auditor";
import {cloudLaunchEnabled,videoStudioWorkerReady,videoStudioSemanticWorkerReady} from "@/lib/vmv-studio-cloud-readiness";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const reply=(obj:Record<string,unknown>,status=200)=>NextResponse.json(obj,{status,headers:{"Cache-Control":"no-store"}});
const STYLES=new Set(["stickman","cartoon2d","cartoon3d","clay","illustrated"]);
const openAi=new Set(["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse","marin","cedar"]);
const price=(seconds:number,quality:string)=>quality==="high"?Math.ceil(seconds*2.5):seconds;
const sceneValid=(s:unknown):s is {speech:string;imagePrompt:string;caption:string}=>
 Boolean(s&&typeof s==="object"&&
  typeof (s as Record<string,unknown>).speech==="string"&&
  (s as {speech:string}).speech.trim().length>=5&&(s as {speech:string}).speech.length<=230&&
  typeof (s as Record<string,unknown>).imagePrompt==="string"&&
  (s as {imagePrompt:string}).imagePrompt.trim().length>=20&&
  (s as {imagePrompt:string}).imagePrompt.length<=950&&
  typeof (s as Record<string,unknown>).caption==="string"&&
  (s as {caption:string}).caption.length<=110);
const isSafeId=(v:unknown,max:number)=>typeof v==="string"&&v.length>0&&v.length<=max&&/^[a-zA-Z0-9_-]+$/.test(v);
type StudioScene={speech:string;imagePrompt:string;motionPrompt?:string;caption:string;motion?:"animate"|"zoom";imagePath?:string|null;approved?:boolean};
type JobRow={id:string;status:string;scenes:StudioScene[];assets:Record<string,unknown>;output_path:string|null;seconds:number;quality_mode:string;[key:string]:unknown};
const publicColumns="id,title,topic,audience,style,seconds,language,voice_provider,voice_id,subtitles,quality_mode,source_platform,status,phase,progress,eta_seconds,scenes,assets,output_path,failure_code,charge_credits,credits_settled,version,created_at,updated_at,finished_at";
async function present(row:JobRow,owner:string,showFrames=true){
 const {assets,output_path,...safe}=row;
 const scenes=Array.isArray(row.scenes)?row.scenes:[];
 const measured=assets?.voice_timeline as {duration?:unknown}|undefined;
 const actualSeconds=typeof measured?.duration==="number"&&Number.isFinite(measured.duration)&&
  measured.duration>=3&&measured.duration<=300?measured.duration:row.seconds;
 const data:Record<string,unknown>={...safe,
  actualSeconds,
  qualityMode:row.quality_mode,
  etaSeconds:typeof row.eta_seconds==="number"?row.eta_seconds:null,
  scenes:scenes.map(s=>({...s,imageUrl:null})),videoUrl:null};
 if(showFrames){
  if(row.status==="awaiting_image_approval"){
   const {data:files}=await videoDb().storage.from("vmv-studio-assets").list(owner+"/"+row.id,{limit:1000,sortBy:{column:"created_at",order:"desc"}});
   const frames=data.scenes as Array<StudioScene&{imageUrl:string|null;imageVersions?:Array<{name:string;url:string}>}>;
   await Promise.all(frames.map(async (frame,i)=>{
    const pattern=new RegExp("^image_"+i+"(?:_[a-f0-9-]{36})?\\.jpg$");
    const previous=(files||[]).filter(f=>pattern.test(f.name)&&owner+"/"+row.id+"/"+f.name!==frame.imagePath).slice(0,10);
    frame.imageVersions=(await Promise.all(previous.map(async f=>{
     const {data:link}=await videoDb().storage.from("vmv-studio-assets").createSignedUrl(owner+"/"+row.id+"/"+f.name,600);
     return link?.signedUrl?{name:f.name,url:link.signedUrl}:null;
    }))).filter((v):v is {name:string;url:string}=>v!==null);
   }));
  }
  const paths=scenes.map((s,i)=>({
   path:typeof s.imagePath==="string"?s.imagePath:"",
   index:i
  })).filter(x=>x.path.startsWith(owner+"/"+row.id+"/")&&x.path.endsWith(".jpg"));
  await Promise.all(paths.map(async x=>{
   const {data:link}=await videoDb().storage.from("vmv-studio-assets").createSignedUrl(x.path,600);
   if(link?.signedUrl)(data.scenes as Array<StudioScene&{imageUrl:string|null}>)[x.index].imageUrl=link.signedUrl;
  }));
 }
 if(row.status==="completed"&&typeof output_path==="string"&&
  output_path.startsWith(owner+"/"+row.id+"/")&&output_path.endsWith(".mp4")){
  const {data:link}=await videoDb().storage.from("vmv-studio-assets").createSignedUrl(output_path,3600);
  if(link?.signedUrl)data.videoUrl=link.signedUrl;
 }
 return data;
}
function parseInput(b:unknown){
 if(!b||typeof b!=="object")return null;
 const x=b as Record<string,unknown>;
 const seconds=x.seconds;
 if(!Number.isInteger(seconds)||Number(seconds)<15||Number(seconds)>180||Number(seconds)%5!==0||
  !STYLES.has(String(x.style))||!validPilotLanguage(x.language)||!["turbo","high"].includes(String(x.qualityMode))||
  typeof x.title!=="string"||x.title.trim().length<3||x.title.length>140||
  typeof x.topic!=="string"||x.topic.trim().length<3||x.topic.length>220||
  typeof x.audience!=="string"||x.audience.trim().length<2||x.audience.length>140||
  !["openai","elevenlabs","none"].includes(String(x.voiceProvider))||
  !isSafeId(x.voiceId,64)||typeof x.subtitles!=="boolean"||
  !validUuid(x.clientKey)||x.confirmCost!==true||!Array.isArray(x.scenes)||
  x.scenes.length<3||x.scenes.length>36||!x.scenes.every(sceneValid)||
  x.scenes.map((s:StudioScene)=>s.speech.trim()).join(" ").length>9000||
  x.estimatedCredits!==price(Number(seconds),String(x.qualityMode)))return null;
 if(x.voiceProvider==="none"&&x.voiceId!=="none")return null;
 if(x.voiceProvider==="openai"&&!openAi.has(String(x.voiceId)))return null;
 if(x.voiceProvider==="elevenlabs"&&!/^[A-Za-z0-9]{15,32}$/.test(String(x.voiceId)))return null;
 return {
  clientKey:x.clientKey as string,
  expectedCredits:price(Number(seconds),String(x.qualityMode)),
  payload:{
   title:x.title.trim(),topic:x.topic.trim(),audience:x.audience.trim(),
   seconds,style:x.style,language:x.language,voice_provider:x.voiceProvider,
   voice_id:x.voiceId,subtitles:x.subtitles,quality_mode:x.qualityMode,
   source_platform:typeof x.sourcePlatform==="string"?x.sourcePlatform.slice(0,20):"idea",
   source_url:typeof x.sourceUrl==="string"&&/^https:\/\//.test(x.sourceUrl)?x.sourceUrl.slice(0,1000):null,
   scenes:x.scenes.map((s:StudioScene)=>({speech:s.speech.trim(),imagePrompt:s.imagePrompt.trim(),caption:s.caption.trim(),motion:s.motion==="zoom"?"zoom":"animate",approved:false,imagePath:null}))
  }
 };
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 try{
  const id=req.nextUrl.searchParams.get("id"),db=videoDb();
  if(id){
   if(!validUuid(id))return reply({error:"studio_invalid_id"},400);
   const {data,error}=await db.from("vmv_studio_jobs").select(publicColumns)
    .eq("id",id).eq("owner_id",owner).maybeSingle();
   if(error)return reply({error:"video_studio_db_unavailable"},503);
   if(!data)return reply({error:"studio_not_found"},404);
   return reply({job:await present(data as JobRow,owner)});
  }
  const {data,error}=await db.from("vmv_studio_jobs").select(publicColumns)
   .eq("owner_id",owner).order("created_at",{ascending:false}).limit(50);
  if(error)return reply({error:"video_studio_db_unavailable"},503);
  return reply({jobs:await Promise.all((data||[]).map(v=>present(v as JobRow,owner,false)))});
 }catch{return reply({error:"video_studio_db_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 if(!cloudLaunchEnabled())
  return reply({error:"video_studio_not_ready"},503);
 // Static flags are insufficient: reject new reservations if the Render worker
 // cannot prove that it is alive and connected right now.
 if(!await videoStudioWorkerReady()||!await videoStudioSemanticWorkerReady())
  return reply({error:"video_studio_worker_not_ready"},503);
 const length=Number(req.headers.get("content-length")||0);
 if(length>65000)return reply({error:"studio_invalid_job"},413);
 const input=parseInput(await req.json().catch(()=>null));
 if(!input)return reply({error:"studio_invalid_job"},400);
 const fullNarration=input.payload.scenes.map(scene=>scene.speech).join(" ");
 if(!studioRuntimeCompatible(fullNarration,Number(input.payload.seconds),
  String(input.payload.language),String(input.payload.voice_provider)))
  return reply({error:"studio_voiceover_duration_mismatch"},422);
 // Never reserve credits for ElevenLabs jobs unless that provider is ready
 // in the SAME Render worker that will render the final narration.
 if(input.payload.voice_provider==="elevenlabs"&&!await videoStudioWorkerReady("elevenlabs"))
  return reply({error:"studio_elevenlabs_worker_not_ready"},503);
 try{
  const db=videoDb();
  const {data,error}=await db.rpc("vmv_studio_create_job",{
   p_owner:owner,p_key:input.clientKey,p_payload:input.payload
  });
  if(error){
   const msg=error.message||"";
   if(msg.includes("studio_insufficient_credits"))return reply({error:"video_studio_insufficient_credits"},402);
   if(msg.includes("studio_invalid_request"))return reply({error:"studio_invalid_job"},400);
   return reply({error:"video_studio_db_unavailable"},503);
  }
  if(!validUuid(data))return reply({error:"video_studio_db_unavailable"},503);
  const {data:row,error:readError}=await db.from("vmv_studio_jobs").select(publicColumns)
   .eq("id",data).eq("owner_id",owner).single();
  return readError||!row?reply({error:"video_studio_db_unavailable"},503):
   reply({job:await present(row as JobRow,owner)},202);
 }catch{return reply({error:"video_studio_db_unavailable"},503);}
}
export async function PATCH(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 const b=await req.json().catch(()=>null),id=b?.id,action=b?.action;
 if(!validUuid(id)||typeof action!=="string"||
  !["approve","approve_all","edit_scene","regenerate","cancel","resume","set_motion","set_motion_prompt","restore_image"].includes(action))
  return reply({error:"studio_invalid_action"},400);
 if(action==="set_motion_prompt"||action==="restore_image"){
  if(!Number.isInteger(b.index)||b.index<0||b.index>35||
   typeof b.value!=="string"||b.value.length>950)return reply({error:"studio_invalid_action"},400);
  try{
   const db=videoDb();
   const {data:row,error:readError}=await db.from("vmv_studio_jobs").select(publicColumns)
    .eq("id",id).eq("owner_id",owner).eq("status","awaiting_image_approval").maybeSingle();
   if(readError||!row)return reply({error:"studio_scene_locked"},409);
   const job=row as JobRow,scene=job.scenes[b.index];
   if(!scene?.imagePath)return reply({error:"studio_images_not_ready"},409);
   const scenes=job.scenes.slice(),assets={...job.assets};
   if(action==="restore_image"){
    const prefix=owner+"/"+id+"/",name=b.value as string;
    if(!new RegExp("^image_"+b.index+"(?:_[a-f0-9-]{36})?\\.jpg$").test(name))return reply({error:"studio_invalid_action"},400);
    const {data:files,error}=await db.storage.from("vmv-studio-assets").list(prefix.slice(0,-1),{search:name,limit:100});
    if(error||!files?.some(f=>f.name===name))return reply({error:"studio_images_not_ready"},409);
    scenes[b.index]={...scene,imagePath:prefix+name,approved:false};
    assets["image_"+b.index]=prefix+name;
   }else scenes[b.index]={...scene,motionPrompt:b.value.trim()};
   for(const key of ["clip_turbo_","clip_high_","task_turbo_","task_high_"])delete assets[key+b.index];
   const {data:updated,error}=await db.from("vmv_studio_jobs").update({scenes,assets,version:Number(job.version)+1,updated_at:new Date().toISOString()})
    .eq("id",id).eq("owner_id",owner).eq("status","awaiting_image_approval").eq("version",job.version).select(publicColumns).maybeSingle();
   if(error||!updated)return reply({error:"studio_scene_locked"},409);
   return reply({job:await present(updated as JobRow,owner)});
  }catch{return reply({error:"video_studio_db_unavailable"},503);}
 }
 if(action==="resume"){
  if(!cloudLaunchEnabled()||!await videoStudioWorkerReady())
   return reply({error:"video_studio_worker_not_ready"},503);
  try{
   const {data,error}=await videoDb().rpc("vmv_studio_resume",{p_owner:owner,p_job:id});
   if(error){
    if(error.message?.includes("studio_insufficient_credits"))
     return reply({error:"video_studio_insufficient_credits"},402);
    if(error.message?.includes("studio_resume_limit"))
     return reply({error:"studio_resume_limit"},409);
    return reply({error:"studio_resume_unavailable"},409);
   }
   return reply({job:await present(data as JobRow,owner)});
  }catch{return reply({error:"video_studio_db_unavailable"},503);}
 }
 // This only updates the motion of an existing frame, does not trigger
 // regeneration and must never touch the credit ledger.
 if(action==="set_motion"){
  if(!Number.isInteger(b?.index)||b.index<0||b.index>35||
   !["zoom","animate"].includes(b?.motion))
   return reply({error:"studio_motion_invalid"},400);
  try{
   const {data,error}=await videoDb().rpc("vmv_studio_set_scene_motion",{
    p_owner:owner,p_job:id,p_index:b.index,p_motion:b.motion
   });
   if(error){
    const reason=error.message||"";
    if(reason.includes("studio_scene_locked"))return reply({error:"studio_scene_locked"},409);
    if(reason.includes("studio_images_not_ready"))return reply({error:"studio_images_not_ready"},409);
    return reply({error:"studio_motion_invalid"},400);
   }
   return reply({job:await present(data as JobRow,owner)});
  }catch{return reply({error:"video_studio_db_unavailable"},503);}
 }
 const index=Number.isInteger(b?.index)?b.index:null;
 let value:string|null=null,regen=false,rpcAction=action;
 if(action==="edit_scene"){
  if(!["speech","imagePrompt"].includes(b.field)||typeof b.value!=="string")
   return reply({error:"studio_invalid_action"},400);
  value=b.value.trim();
  regen=b.field==="imagePrompt";
  if(regen&&b.confirmRegenerationCost!==true)return reply({error:"studio_regeneration_confirmation_required"},403);
 }else if(action==="regenerate"){
  if(b.confirmRegenerationCost!==true)return reply({error:"studio_regeneration_confirmation_required"},403);
  const {data}=await videoDb().from("vmv_studio_jobs").select("scenes")
   .eq("id",id).eq("owner_id",owner).maybeSingle();
  if(!Array.isArray(data?.scenes)||index===null||index<0||index>=data.scenes.length)
   return reply({error:"studio_invalid_action"},400);
  value=String(data.scenes[index]?.imagePrompt||"").slice(0,950);
  regen=true;rpcAction="edit_scene";
 }
 if((action==="edit_scene"||action==="regenerate")&&(!value||value.length<5||value.length>950))
  return reply({error:"studio_invalid_action"},400);
 try{
  const db=videoDb();
  const {data,error}=await db.rpc("vmv_studio_scene_update",{
   p_owner:owner,p_job:id,p_action:rpcAction,p_index:index,p_value:value,p_regen:regen
  });
  if(error){
   const message=error.message||"";
   if(message.includes("studio_insufficient_credits"))return reply({error:"video_studio_insufficient_credits"},402);
   if(message.includes("studio_images_not_ready"))return reply({error:"studio_images_not_ready"},409);
   if(message.includes("studio_scene_locked"))return reply({error:"studio_scene_locked"},409);
   if(message.includes("studio_speech_too_long"))return reply({error:"studio_speech_too_long"},400);
   return reply({error:"studio_invalid_action"},400);
  }
  return reply({job:await present(data as JobRow,owner)});
 }catch{return reply({error:"video_studio_db_unavailable"},503);}
}

export async function PUT(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 if(Number(req.headers.get("content-length")||0)>MAX_MANUAL_UPLOAD_BYTES+30000)return reply({error:"manual_image_too_large"},413);
 try{
  const form=await req.formData(),id=form.get("id"),index=Number(form.get("index")),image=form.get("image");
  if(!validUuid(id)||form.get("index")===null||!Number.isInteger(index)||index<0||index>35||!(image instanceof File)||image.type!=="image/jpeg"||image.size<1024||image.size>MAX_MANUAL_UPLOAD_BYTES)return reply({error:"manual_invalid_image"},400);
  const bytes=Buffer.from(await image.arrayBuffer()),dimensions=readManualJpegDimensions(bytes);
  if(!dimensions||dimensions.width!==720||dimensions.height!==1280)return reply({error:"manual_invalid_image"},400);
  const db=videoDb();
  const {data:row,error:readError}=await db.from("vmv_studio_jobs").select(publicColumns).eq("id",id).eq("owner_id",owner).eq("status","awaiting_image_approval").maybeSingle();
  if(readError||!row)return reply({error:"studio_scene_locked"},409);
  const job=row as JobRow,scene=job.scenes[index];
  if(!scene?.imagePath)return reply({error:"studio_images_not_ready"},409);
  const path=owner+"/"+id+"/image_"+index+"_"+randomUUID()+".jpg";
  const bucket=db.storage.from("vmv-studio-assets");
  const {error:uploadError}=await bucket.upload(path,bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"60"});
  if(uploadError)return reply({error:"manual_upload_unavailable"},503);
  const scenes=job.scenes.slice(),assets={...job.assets};
  scenes[index]={...scene,imagePath:path,approved:false,requiresReview:false} as StudioScene;
  assets["image_"+index]=path;
  for(const key of ["clip_turbo_","clip_high_","task_turbo_","task_high_"])delete assets[key+index];
  const {data:updated,error}=await db.from("vmv_studio_jobs").update({scenes,assets,version:Number(job.version)+1,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",owner).eq("status","awaiting_image_approval").eq("version",job.version).select(publicColumns).maybeSingle();
  if(error||!updated){await bucket.remove([path]);return reply({error:"studio_scene_locked"},409);}
  return reply({job:await present(updated as JobRow,owner)});
 }catch{return reply({error:"manual_upload_unavailable"},503);}
}
