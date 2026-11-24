import {randomBytes} from "node:crypto";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";

export const publicTokenPattern=/^[a-f0-9]{64}$/;
export const noStoreHeaders={
 "Cache-Control":"no-store, no-cache, must-revalidate",
 "X-Robots-Tag":"noindex, nofollow, noarchive",
 "Referrer-Policy":"no-referrer",
 "X-Content-Type-Options":"nosniff"
} as const;
export function validVideoShareToken(token:unknown):token is string{
 return typeof token==="string"&&publicTokenPattern.test(token);
}
export function validStudioOutputPath(path:unknown,owner:unknown,id:unknown):path is string{
 return typeof path==="string"&&validUuid(owner)&&validUuid(id)&&
  path.startsWith(owner+"/"+id+"/")&&
  path.endsWith(".mp4")&&
  !path.includes("..")&&path.length<=500;
}
export function newShareToken(){return randomBytes(32).toString("hex");}
export const sharePath=(token:string)=>"/v/"+token;
/** Use Vercel's branch alias instead of an ephemeral per-commit Preview URL.
 * On production, use the configured production hostname. User-supplied Host
 * is only a fallback, never the preferred source of public link origins.
 */
export function sharePublicUrl(requestOrigin:string,token:string){
 const env=process.env.VERCEL_ENV;
 const host=env==="preview"?process.env.VERCEL_BRANCH_URL:
  env==="production"?process.env.VERCEL_PROJECT_PRODUCTION_URL:undefined;
 try{
  const base=host&&/^[a-z0-9.-]+$/i.test(host)?"https://"+host:requestOrigin;
  const url=new URL(sharePath(token),base);
  return url.protocol==="https:"||url.hostname==="localhost"?url.toString():null;
 }catch{return null;}
}


export async function completedOwnedVideo(owner:string,id:string){
 if(!validUuid(owner)||!validUuid(id))return null;
 const {data,error}=await videoDb().from("vmv_studio_jobs")
  .select("id,owner_id,title,status,output_path")
  .eq("id",id).eq("owner_id",owner).eq("status","completed").maybeSingle();
 if(error||!data||!validStudioOutputPath(data.output_path,owner,id))return null;
 return data as {id:string;owner_id:string;title:string;status:string;output_path:string};
}
export async function publicSharedVideo(token:unknown){
 if(!validVideoShareToken(token))return null;
 const db=videoDb();
 const {data:share,error:shareError}=await db.from("vmv_studio_video_shares")
  .select("job_id,owner_id").eq("token",token).maybeSingle();
 if(shareError||!share)return null;
 const video=await completedOwnedVideo(share.owner_id,share.job_id);
 return video;
}
export async function signedSharedVideo(token:unknown,download:boolean){
 const video=await publicSharedVideo(token);
 if(!video)return null;
 // Supabase signed media URLs are intentionally short-lived; a stable public
 // /v/<token> link issues new signed URLs on each visit or download.
 const name="vmv-video-"+video.id.slice(0,8)+".mp4";
 const {data,error}=await videoDb().storage.from("vmv-studio-assets")
  .createSignedUrl(video.output_path,600,download?{download:name}:undefined);
 if(error||!data?.signedUrl)return null;
 // Prevent open redirects if storage configuration ever changes unexpectedly.
 const storageHost=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||"https://invalid.local").host;
 const url=new URL(data.signedUrl);
 if(url.protocol!=="https:"||url.host!==storageHost)return null;
 return url.toString();
}
