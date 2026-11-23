import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {parseVideoInput,pollRunway,startRunway,videoAllowed,videoDb,videoHeaders,videoReady,validUuid} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:videoHeaders});
async function ownerOf(req:NextRequest){const owner=await authenticatedUser(req);return owner&&videoAllowed(owner)?owner:null;}
export async function GET(req:NextRequest){
 const owner=await ownerOf(req);
 if(!owner)return reply({error:"video_not_enabled_for_account"},403);
 try{
  const db=videoDb();
  const id=req.nextUrl.searchParams.get("id");
  if(id){
   if(!validUuid(id))return reply({error:"invalid_job"},400);
   const {data:job,error}=await db.from("vmv_video_jobs").select("*").eq("owner_id",owner).eq("id",id).maybeSingle();
   if(error||!job)return reply({error:"video_job_not_found"},404);
   if(["PENDING","THROTTLED","RUNNING"].includes(job.status)&&job.provider_task_id&&videoReady()){
    try{
     const state=await pollRunway(job.provider_task_id);
     const final=state.status==="SUCCEEDED"&&!state.outputUrl?"FAILED":state.status;
     const patch={status:final,output_url:state.outputUrl||job.output_url||null,
      failure_code:final==="FAILED"?"runway_generation_failed":null,updated_at:new Date().toISOString()};
     const updated=await db.from("vmv_video_jobs").update(patch).eq("owner_id",owner).eq("id",id).select("*").single();
     if(!updated.error&&updated.data)return reply({job:updated.data});
    }catch(err){console.warn("[video-generator] status temporarily unavailable",err instanceof Error?err.name:"error");}
   }
   return reply({job});
  }
  const [jobs,pilots]=await Promise.all([
   db.from("vmv_video_jobs").select("id,owner_id,pilot_id,prompt,mode,model,ratio,duration,status,output_url,failure_code,caption,created_at,updated_at").eq("owner_id",owner).order("created_at",{ascending:false}).limit(30),
   db.from("vmv_video_pilots").select("*").eq("owner_id",owner).order("created_at",{ascending:false}).limit(10)
  ]);
  if(jobs.error||pilots.error)return reply({error:"video_history_unavailable"},503);
  return reply({jobs:jobs.data||[],pilots:pilots.data||[],configured:videoReady(),pilot:true,
   dailyLimit:50,automaticPublishing:false});
 }catch{return reply({error:"video_database_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await ownerOf(req);
 if(!owner)return reply({error:"video_not_enabled_for_account"},403);
 if(!videoReady())return reply({error:"runway_key_missing"},503);
 const length=Number(req.headers.get("content-length")||0);
 if(length>4600000)return reply({error:"image_too_large"},413);
 const body=await req.json().catch(()=>null);
 const input=parseVideoInput(body);
 if(!input||body?.confirmCost!==true||!validUuid(body?.clientKey))
  return reply({error:"invalid_video_request"},400);
 const pilotId=body.pilotId==null?null:body.pilotId;
 if(pilotId!==null&&!validUuid(pilotId))return reply({error:"invalid_pilot"},400);
 const db=videoDb();
 const saved=await db.rpc("vmv_video_reserve_pilot_job",{
  p_owner:owner,p_key:body.clientKey,p_prompt:input.prompt,p_mode:input.mode,
  p_model:input.model,p_ratio:input.ratio,p_duration:input.duration,p_pilot:pilotId
 });
 if(saved.error){
  const detail=String(saved.error.message||"");
  const error=/video_daily_limit/.test(detail)?"video_daily_limit":
   /video_active_job_limit/.test(detail)?"video_active_job_limit":
   /video_pilot_not_found/.test(detail)?"video_pilot_not_found":"video_reservation_failed";
  return reply({error},error==="video_daily_limit"||error==="video_active_job_limit"?429:409);
 }
 const jobId=saved.data?.id;
 if(!validUuid(jobId))return reply({error:"video_reservation_failed"},503);
 if(saved.data?.reused===true){
  const existing=await db.from("vmv_video_jobs").select("*").eq("id",jobId).eq("owner_id",owner).maybeSingle();
  return reply({job:existing.data},200);
 }
 try{
  const taskId=await startRunway(input);
  const caption=typeof body.caption==="string"?body.caption.trim().slice(0,500):"";
  const result=await db.from("vmv_video_jobs").update({
   provider_task_id:taskId,status:"PENDING",caption,updated_at:new Date().toISOString()
  }).eq("id",jobId).eq("owner_id",owner).select("*").single();
  if(result.error)throw Error("video_task_persistence_failed");
  return reply({job:result.data},202);
 }catch(err){
  const code=err instanceof Error&&/^runway_[a-z_]+$/.test(err.message)?err.message:"runway_start_unavailable";
  await db.from("vmv_video_jobs").update({status:"FAILED",failure_code:code,updated_at:new Date().toISOString()})
   .eq("owner_id",owner).eq("id",jobId);
  console.warn("[video-generator] generation start failed",{code});
  return reply({error:code,jobId},503);
 }
}
