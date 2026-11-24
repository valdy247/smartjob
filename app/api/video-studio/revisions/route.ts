import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {cloudLaunchEnabled,videoStudioWorkerReady} from "@/lib/vmv-studio-cloud-readiness";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const respond=(body:Record<string,unknown>,status=200)=>
 NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const price=(seconds:number,n:number,quality:string)=>
 1+Math.max(1,Math.ceil(seconds/n*(quality==="high"?2.5:1)));
async function getSource(owner:string,id:string){
 if(!validUuid(id))return null;
 const {data,error}=await videoDb().from("vmv_studio_jobs")
  .select("id,status,seconds,quality_mode,scenes,assets,output_path")
  .eq("owner_id",owner).eq("id",id).eq("status","completed").maybeSingle();
 if(error||!data||!Array.isArray(data.scenes)||data.scenes.length<3||
  data.scenes.length>36||typeof data.output_path!=="string"||
  !data.output_path.startsWith(owner+"/"+id+"/"))return null;
 const prefix=owner+"/"+id+"/";
 if(!data.scenes.every((s:{imagePath?:unknown;approved?:boolean})=>
  s.approved===true&&typeof s.imagePath==="string"&&s.imagePath.startsWith(prefix)))
  return null;
 for(let i=0;i<data.scenes.length;i++){
  const clip=data.assets?.["clip_"+data.quality_mode+"_"+i];
  if(typeof clip!=="string"||!clip.startsWith(prefix)||!clip.endsWith(".mp4"))
   return null;
 }
 return data;
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return respond({error:"authentication_required"},401);
 const id=req.nextUrl.searchParams.get("id");
 if(!validUuid(id))return respond({error:"studio_invalid_id"},400);
 try{
  const source=await getSource(owner,id);
  if(!source)return respond({error:"studio_revision_not_available"},409);
  return respond({credits:price(source.seconds,source.scenes.length,source.quality_mode),
   count:source.scenes.length,sourceId:id});
 }catch{return respond({error:"studio_revision_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return respond({error:"authentication_required"},401);
 if(!cloudLaunchEnabled()||!await videoStudioWorkerReady())
  return respond({error:"video_studio_worker_not_ready"},503);
 const len=Number(req.headers.get("content-length")||0);
 if(len>8000)return respond({error:"studio_revision_invalid"},413);
 const b=await req.json().catch(()=>null);
 if(!validUuid(b?.sourceId)||!validUuid(b?.clientKey)||b?.confirmCost!==true||
  typeof b?.prompt!=="string"||b.prompt.trim().length<20||b.prompt.trim().length>950||
  !Number.isInteger(b?.index)||b.index<0||b.index>=36||
  !["animate","zoom"].includes(b?.motion))
  return respond({error:"studio_revision_invalid"},400);
 try{
  const source=await getSource(owner,b.sourceId);
  if(!source||b.index>=source.scenes.length)
   return respond({error:"studio_revision_not_available"},409);
  const credits=price(source.seconds,source.scenes.length,source.quality_mode);
  if(b.expectedCredits!==credits)return respond({error:"studio_revision_price_changed"},409);
  const {data,error}=await videoDb().rpc("vmv_studio_create_scene_revision",{
   p_owner:owner,p_source:b.sourceId,p_key:b.clientKey,p_index:b.index,
   p_prompt:b.prompt.trim(),p_motion:b.motion
  });
  if(error){
   const reason=error.message||"";
   if(reason.includes("studio_insufficient_credits"))
    return respond({error:"video_studio_insufficient_credits"},402);
   if(reason.includes("studio_revision_assets_unavailable")||
      reason.includes("studio_revision_source_invalid"))
    return respond({error:"studio_revision_not_available"},409);
   if(reason.includes("studio_revision_invalid"))
    return respond({error:"studio_revision_invalid"},400);
   return respond({error:"studio_revision_unavailable"},503);
  }
  if(!validUuid(data))return respond({error:"studio_revision_unavailable"},503);
  return respond({id:data,credits},202);
 }catch{return respond({error:"studio_revision_unavailable"},503);}
}
