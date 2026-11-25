import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {MAX_MANUAL_SCENES,MAX_MANUAL_UPLOAD_BYTES,manualImagePath,readManualJpegDimensions} from "@/lib/vmv-studio-manual";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const respond=(body:Record<string,unknown>,status=200)=>
 NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return respond({error:"authentication_required"},401);
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>MAX_MANUAL_UPLOAD_BYTES+30000)return respond({error:"manual_image_too_large"},413);
 try{
  const body=await req.formData();
  const id=body.get("projectId");
  const index=Number(body.get("index"));
  const image=body.get("image");
  if(!validUuid(id)||!Number.isInteger(index)||index<0||index>=MAX_MANUAL_SCENES||
   !(image instanceof File)||image.type!=="image/jpeg"||
   image.size<1024||image.size>MAX_MANUAL_UPLOAD_BYTES)
   return respond({error:"manual_invalid_image"},400);
  const db=videoDb();
  const {data:existing,error:lookupError}=await db.from("vmv_studio_jobs")
   .select("id").eq("id",id).maybeSingle();
  if(lookupError)return respond({error:"manual_upload_unavailable"},503);
  // No overwriting frames of a paid or finished project.
  if(existing)return respond({error:"manual_project_already_started"},409);
  const bytes=Buffer.from(await image.arrayBuffer());
  const dimensions=readManualJpegDimensions(bytes);
  if(!dimensions||dimensions.width!==720||dimensions.height!==1280)
   return respond({error:"manual_invalid_image"},400);
  const path=manualImagePath(owner,id,index);
  const {error}=await db.storage.from("vmv-studio-assets")
   .upload(path,bytes,{contentType:"image/jpeg",upsert:true,cacheControl:"0"});
  if(error)return respond({error:"manual_upload_unavailable"},503);
  return respond({index,ready:true});
 }catch{return respond({error:"manual_upload_unavailable"},503);}
}
