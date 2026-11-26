import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {cloudLaunchEnabled,videoStudioWorkerReady,videoStudioWorkerProbe} from "@/lib/vmv-studio-cloud-readiness";
import {manualImagePath,manualPrice,validManualStoryboard,validManualQuality,validSingleImageStoryboard} from "@/lib/vmv-studio-manual";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const respond=(body:Record<string,unknown>,status=200)=>
 NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return respond({error:"authentication_required"},401);
 if(!cloudLaunchEnabled()||!await videoStudioWorkerReady())
  return respond({error:"video_studio_worker_not_ready"},503);
 const size=Number(req.headers.get("content-length")||0);
 if(size>18000)return respond({error:"manual_invalid_request"},413);
 const b=await req.json().catch(()=>null);
 const single=b?.mode==="single";
 if(single&&!(await videoStudioWorkerProbe("none",true)).ready)return respond({error:"single_image_worker_not_ready"},503);
 if(!validUuid(b?.projectId)||!validUuid(b?.clientKey)||
  typeof b?.title!=="string"||b.title.trim().length<3||b.title.length>140||
  !validManualQuality(b?.quality)||!(single?validSingleImageStoryboard(b?.scenes):validManualStoryboard(b?.scenes))||
  b?.confirmCost!==true)return respond({error:"manual_invalid_request"},400);
 const credit=manualPrice(b.scenes.map((s:{motion:"animate"|"zoom"|"still"})=>s.motion),b.quality);
 if(b.expectedCredits!==credit)return respond({error:"manual_price_changed"},409);
 try{
  const db=videoDb();
  // Idempotent retry: do not reserve credits a second time.
  const {data:prior,error:priorError}=await db.from("vmv_studio_jobs")
   .select("id,owner_id,client_key,source_platform").eq("id",b.projectId).maybeSingle();
  if(priorError)return respond({error:"manual_create_unavailable"},503);
  if(prior){
   if(prior.owner_id===owner&&prior.client_key===b.clientKey&&prior.source_platform==="manual")
    return respond({id:prior.id,credits:credit},200);
   return respond({error:"manual_project_already_started"},409);
  }
  const prefix=owner+"/"+b.projectId;
  const {data:files,error:filesError}=await db.storage.from("vmv-studio-assets")
   .list(prefix,{limit:25,offset:0});
  if(filesError)return respond({error:"manual_create_unavailable"},503);
  for(let i=0;i<b.scenes.length;i++){
   const filename="image_"+i+".jpg";
   const found=files?.find((file:{name:string;metadata?:{size?:number;mimetype?:string}})=>file.name===filename);
   if(!found||!found.metadata||typeof found.metadata.size!=="number"||
    found.metadata.size<1024||found.metadata.size>2500000||
    !["image/jpeg","image/jpg"].includes(found.metadata.mimetype||""))
    return respond({error:"manual_images_missing"},409);
  }
  const scenes=b.scenes.map((scene:{prompt:string;motion:"animate"|"zoom"|"still"},i:number)=>({
   speech:single?"Animación de una imagen":scene.prompt.trim().slice(0,220),
   imagePrompt:scene.prompt.trim(),
   ...(single?{motionPrompt:scene.prompt.trim()}:{}),
   caption:"",
   motion:scene.motion,
   imagePath:manualImagePath(owner,b.projectId,i),
   approved:true,
   requiresReview:false,
   durationSeconds:5
  }));
  const {data,error}=await db.rpc(single?"vmv_studio_create_single_image_job":"vmv_studio_create_manual_job",{
   p_owner:owner,p_job:b.projectId,p_key:b.clientKey,
   p_title:b.title.trim(),p_quality:b.quality,p_scenes:scenes,p_expected:credit
  });
  if(error){
   const message=error.message||"";
   if(message.includes("studio_insufficient_credits"))
    return respond({error:"video_studio_insufficient_credits"},402);
   if(message.includes("manual_price_changed"))
    return respond({error:"manual_price_changed"},409);
   if(message.includes("manual_job_conflict"))
    return respond({error:"manual_project_already_started"},409);
   if(message.includes("manual_invalid_request"))
    return respond({error:"manual_invalid_request"},400);
   return respond({error:"manual_create_unavailable"},503);
  }
  if(!validUuid(data))return respond({error:"manual_create_unavailable"},503);
  return respond({id:data,credits:credit},201);
 }catch{return respond({error:"manual_create_unavailable"},503);}
}
