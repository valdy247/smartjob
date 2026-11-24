/**
 * Completed-video edits are new child projects. This worker-side setup copies
 * unchanged images, clips and the original full narration to the child's own
 * private storage prefix. No references may point at another user's project.
 * A retry can finish after a partial copy (storage reports 409 for existing).
 */
export async function prepareRevisionAssets({db,job,scenes,patch,bucket}){
 const sourceId=job.assets?.revision_source_id;
 if(typeof sourceId!=="string")return false;
 if(job.assets?.revision_assets_ready===true)return true;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(sourceId)||!uuid.test(job.id)||!uuid.test(job.owner_id)||
  !Number.isInteger(job.assets?.revision_scene_index)||
  job.assets.revision_scene_index<0||
  job.assets.revision_scene_index>=scenes.length)
  throw Error("revision_source_invalid");
 const changed=job.assets.revision_scene_index;
 const {data:source,error}=await db.from("vmv_studio_jobs")
  .select("id,owner_id,status,assets,scenes,quality_mode,voice_provider")
  .eq("id",sourceId).eq("owner_id",job.owner_id)
  .eq("status","completed").maybeSingle();
 if(error||!source||source.quality_mode!==job.quality_mode||
  source.scenes?.length!==scenes.length)throw Error("revision_source_unavailable");
 const oldRoot=job.owner_id+"/"+sourceId+"/";
 const newRoot=job.owner_id+"/"+job.id+"/";
 const storage=db.storage.from(bucket);
 const assets={...job.assets};
 const safe=(name)=>typeof name==="string"&&name.startsWith(oldRoot)&&
  !name.includes("..")&&name.length<500;
 async function clone(key,remote,mime){
  if(!safe(remote)||!remote.endsWith(mime))throw Error("revision_asset_invalid");
  const target=newRoot+key+mime;
  const {error:copyError}=await storage.copy(remote,target);
  if(copyError&&!["409","ResourceAlreadyExists","The resource already exists"].some(
   v=>String(copyError.statusCode||copyError.error||copyError.message||"").includes(v)
  ))throw Error("revision_asset_copy_failed");
  assets[key]=target;
  return target;
 }
 for(let i=0;i<scenes.length;i++){
  if(i===changed)continue;
  const original=source.scenes[i];
  if(!original||original.approved!==true)
   throw Error("revision_scene_unavailable");
  const target=await clone("image_"+i,original.imagePath,".jpg");
  scenes[i]={...scenes[i],imagePath:target,approved:true,requiresReview:false};
  const key="clip_"+job.quality_mode+"_"+i;
  await clone(key,source.assets?.[key],".mp4");
 }
 if(job.voice_provider!=="none"){
  await clone("voice_continuous",source.assets?.voice_continuous,".mp3");
  if(!source.assets?.voice_timeline||source.assets.voice_timeline.segments?.length!==scenes.length)
   throw Error("revision_audio_alignment_missing");
  assets.voice_timeline=source.assets.voice_timeline;
 }
 if(typeof source.assets?.character_master==="string")
  await clone("character_master",source.assets.character_master,".jpg");
 if(source.assets?.visual_plan)assets.visual_plan=source.assets.visual_plan;
 assets.visual_gallery_audited=true; // Never touch the other approved frames.
 assets.visual_gallery_report={checked:true,flagged:0,corrected:0,
  revision:true,changedScene:changed};
 assets.revision_assets_ready=true;
 await patch(job,{scenes:scenes.map(s=>({...s})),assets});
 return true;
}
