import type {SupabaseClient} from "@supabase/supabase-js";
export const QUICK_VIDEO_BUCKET="vmv-video-quick" as const;
export type QuickScene={speech:string;imagePrompt:string;caption:string};
export type QuickVideoProject={
 id:string;owner_id:string;title:string;topic:string;kind:"promo"|"facts";
 visual:"sticks"|"stills";seconds:15|30|60;ratio:"portrait"|"landscape";
 narration:boolean;scenes:QuickScene[];media_path:string;output_mime:"video/mp4"|"video/webm";
 created_at:string;url?:string;
};
export type QuickVideoDetails=Pick<QuickVideoProject,"title"|"topic"|"kind"|"visual"|"seconds"|"ratio"|"narration"|"scenes">;
async function owner(db:SupabaseClient){
 const {data,error}=await db.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error("login");
 return data.user.id;
}
function validDetails(x:QuickVideoDetails){
 if(x.topic.trim().length<3||x.topic.length>220||x.title.length>140||
  !["promo","facts"].includes(x.kind)||!["sticks","stills"].includes(x.visual)||
  ![15,30,60].includes(x.seconds)||!["portrait","landscape"].includes(x.ratio)||
  !Array.isArray(x.scenes)||x.scenes.length<4||x.scenes.length>12||
  x.scenes.some(s=>typeof s.speech!=="string"||typeof s.caption!=="string"||
   typeof s.imagePrompt!=="string"||s.speech.length>500||s.caption.length>500||s.imagePrompt.length>2000))
  throw Error("quick_invalid");
}
export async function saveQuickVideo(db:SupabaseClient,details:QuickVideoDetails,blob:Blob):Promise<string>{
 const uid=await owner(db);
 validDetails(details);
 const media=blob.type.split(";")[0].toLowerCase();
 if(media!=="video/mp4"&&media!=="video/webm")throw Error("quick_invalid_format");
 if(blob.size<1000||blob.size>25*1024*1024)throw Error("quick_file_too_large");
 const {count,error:countError}=await db.from("vmv_video_quick_projects").select("id",{count:"exact",head:true}).eq("owner_id",uid);
 if(countError)throw Error("quick_library_unavailable");
 if((count||0)>=30)throw Error("quick_library_limit");
 const id=crypto.randomUUID();
 const path=uid+"/"+id+(media==="video/mp4"?".mp4":".webm");
 const {error:storageError}=await db.storage.from(QUICK_VIDEO_BUCKET).upload(path,blob,{
  contentType:media,cacheControl:"60",upsert:false
 });
 if(storageError)throw Error("quick_upload_failed");
 const {error:dbError}=await db.from("vmv_video_quick_projects").insert({
  id,owner_id:uid,title:details.title.trim().slice(0,140),topic:details.topic.trim(),
  kind:details.kind,visual:details.visual,seconds:details.seconds,ratio:details.ratio,
  narration:details.narration,scenes:details.scenes,media_path:path,output_mime:media
 });
 if(dbError){
  await db.storage.from(QUICK_VIDEO_BUCKET).remove([path]);
  throw Error(dbError.message.includes("vmv_quick_library_limit_reached")?"quick_library_limit":"quick_library_unavailable");
 }
 return id;
}
export async function listQuickVideos(db:SupabaseClient):Promise<QuickVideoProject[]>{
 const uid=await owner(db);
 const {data,error}=await db.from("vmv_video_quick_projects")
  .select("id,owner_id,title,topic,kind,visual,seconds,ratio,narration,scenes,media_path,output_mime,created_at")
  .eq("owner_id",uid).order("created_at",{ascending:false}).limit(30);
 if(error)throw Error("quick_library_unavailable");
 const projects=(data||[]) as QuickVideoProject[];
 return Promise.all(projects.map(async p=>{
  if(!p.media_path.startsWith(uid+"/"))return {...p,url:""};
  const {data:link}=await db.storage.from(QUICK_VIDEO_BUCKET).createSignedUrl(p.media_path,3600);
  return {...p,url:link?.signedUrl||""};
 }));
}
export async function deleteQuickVideo(db:SupabaseClient,project:QuickVideoProject){
 const uid=await owner(db);
 if(project.owner_id!==uid||!project.media_path.startsWith(uid+"/"))throw Error("quick_permission");
 const {error}=await db.from("vmv_video_quick_projects").delete().eq("id",project.id).eq("owner_id",uid);
 if(error)throw Error("quick_library_unavailable");
 const {error:storage}=await db.storage.from(QUICK_VIDEO_BUCKET).remove([project.media_path]);
 if(storage)throw Error("quick_delete_incomplete");
}
