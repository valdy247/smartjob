import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";

// Cloud project snapshots are private, owner-scoped, and do not run any AI.
// MP4 uploads use Supabase signed uploads so large videos never cross the
// serverless function's request-body limit.
export const runtime="nodejs";
export const dynamic="force-dynamic";
const PROJECT_BUCKET="vmv-motion-projects";
const RENDER_BUCKET="vmv-motion-renders";
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
const validId=(value:unknown):value is string=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const storage=()=>videoDb().storage;
async function ensureBucket(name:string,size:number,mimes:string[]){
 const store=storage();
 const exists=await store.getBucket(name);
 if(!exists.error)return true;
 const created=await store.createBucket(name,{
  public:false,fileSizeLimit:size,allowedMimeTypes:mimes
 });
 return !created.error||/already.exists|duplicate|already exists/i.test(created.error.message);
}
function projectPath(owner:string,id:string){return owner+"/"+id+".json";}
function renderPath(owner:string,id:string,extension:string,revisionId?:string){
 return owner+"/"+id+"/"+(revisionId&&validId(revisionId)?"versions/"+revisionId:"final")+"."+extension;
}
// Sharing requires a real, completed file in the private render bucket.
// Twelve animated clips alone are not a downloadable final video.
async function finishedRender(owner:string,id:string,project:ProjectSnapshot):
 Promise<{path:string;extension:"mp4"|"webm"}|null>{
 const bucket=storage().from(RENDER_BUCKET);
 const root=await bucket.list(owner+"/"+id,{limit:100});
 if(root.error)return null;
 const saved=new Set((root.data||[]).filter(x=>x.id!==null).map(x=>x.name));
 const active=project.seedance.activeRenderId;
 const revisions=[...(project.seedance.voiceRevisions||[])].reverse();
 if(active&&validId(active)||!saved.has("final.mp4")&&!saved.has("final.webm")){
  const versions=await bucket.list(owner+"/"+id+"/versions",{limit:100});
  if(!versions.error){
   const present=new Set((versions.data||[]).filter(x=>x.id!==null).map(x=>x.name));
   const candidates=active?[
    ...revisions.filter(v=>v.id===active),
    ...revisions.filter(v=>v.id!==active)
   ]:revisions;
   for(const revision of candidates){
    if(present.has(revision.id+"."+revision.extension))
     return {path:renderPath(owner,id,revision.extension,revision.id),
      extension:revision.extension};
   }
  }
 }
 for(const extension of ["mp4","webm"] as const)
  if(saved.has("final."+extension))
   return {path:renderPath(owner,id,extension),extension};
 return null;
}
type ProjectSnapshot={
 id:string;plan:{prompt:string;title?:string;storyBible?:string;scenes:unknown[];frames:unknown[]};
 seedance:{prompt:string;tokens:string[];urls:string[];
  voicePreset?:"elevenlabs"|"alloy"|"nova"|"echo";
  elevenVoiceId?:string;
  voiceRevisions?:Array<{id:string;extension:"mp4"|"webm";voice:string;createdAt:string}>;
  activeRenderId?:string;};
 publish?:{title?:string;caption?:string;hashtags?:string;platform?:string;
  scheduledFor?:string;postedAt?:string;views?:number;leads?:number;sales?:number};
 updatedAt?:string;
};
function validSnapshot(input:unknown,owner:string):input is ProjectSnapshot{
 if(!input||typeof input!=="object")return false;
 const x=input as Partial<ProjectSnapshot>;
 if(!validId(x.id)||!x.plan||typeof x.plan.prompt!=="string"||
  x.plan.prompt.length<8||x.plan.prompt.length>2000||
  !Array.isArray(x.plan.scenes)||x.plan.scenes.length!==12||
  !Array.isArray(x.plan.frames)||x.plan.frames.length>12||
  !x.seedance||x.seedance.prompt!==x.plan.prompt||
  !Array.isArray(x.seedance.tokens)||x.seedance.tokens.length>12||
  !Array.isArray(x.seedance.urls)||x.seedance.urls.length>12)return false;
 // Do not accept cross-user or inline base64 payloads from client snapshots.
 for(const frame of x.plan.frames){
  const path=(frame as {referencePath?:unknown})?.referencePath;
  if(typeof path!=="string"||path.length>180||
   !path.startsWith(owner+"/")||!/^[-a-z0-9/]+\.jpg$/.test(path))return false;
 }
 const voice=x.seedance.voicePreset;
 if(voice!==undefined&&!["elevenlabs","alloy","nova","echo"].includes(voice))return false;
 if(x.seedance.elevenVoiceId!==undefined&&
  (typeof x.seedance.elevenVoiceId!=="string"||x.seedance.elevenVoiceId.length>30))return false;
 if(x.seedance.activeRenderId!==undefined&&
  x.seedance.activeRenderId!==""&&!validId(x.seedance.activeRenderId))return false;
 if(x.seedance.voiceRevisions!==undefined){
  if(!Array.isArray(x.seedance.voiceRevisions)||x.seedance.voiceRevisions.length>30||
   x.seedance.voiceRevisions.some(v=>!validId(v?.id)||
    !["mp4","webm"].includes(v.extension)||typeof v.voice!=="string"||
    v.voice.length>60||typeof v.createdAt!=="string"||v.createdAt.length>40))
   return false;
 }
 return true;
}
async function readProject(owner:string,id:string){
 const file=await storage().from(PROJECT_BUCKET).download(projectPath(owner,id));
 if(file.error||!file.data)return null;
 const json=await file.data.text();
 if(json.length>300000)return null;
 try{const project=JSON.parse(json) as unknown;return validSnapshot(project,owner)?project:null;}
 catch{return null;}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"motion_library_forbidden"},403);
 const len=Number(req.headers.get("content-length")||0);
 if(len>360000)return reply({error:"motion_library_request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const action=typeof body?.action==="string"?body.action:"";

 if(action==="save"){
  const project:unknown=body?.project;
  if(!validSnapshot(project,owner))return reply({error:"motion_project_invalid"},400);
  const snapshot:ProjectSnapshot={...project,updatedAt:new Date().toISOString()};
  // Keep complete project (scene prompts, private reference paths, tokens).
  // Signed images may expire; the client re-signs them when restored.
  const bytes=Buffer.from(JSON.stringify(snapshot));
  if(bytes.length>300000)return reply({error:"motion_project_too_large"},413);
  try{
   if(!await ensureBucket(PROJECT_BUCKET,350000,["application/json"]))
    return reply({error:"motion_library_unavailable"},503);
   const uploaded=await storage().from(PROJECT_BUCKET).upload(
    projectPath(owner,snapshot.id),bytes,{
     contentType:"application/json",cacheControl:"0",upsert:true
    });
   if(uploaded.error)return reply({error:"motion_cloud_save_failed"},503);
   return reply({saved:true,id:snapshot.id,updatedAt:snapshot.updatedAt});
  }catch{return reply({error:"motion_cloud_save_failed"},503);}
 }
 if(action==="list"){
  try{
   const listed=await storage().from(PROJECT_BUCKET).list(owner,{
    limit:100,sortBy:{column:"updated_at",order:"desc"}
   });
   if(listed.error)return reply({error:"motion_cloud_list_unavailable"},503);
   const files=(listed.data||[]).filter(x=>x.name.endsWith(".json")&&
    validId(x.name.slice(0,-5))).slice(0,40);
   const loaded=await Promise.all(files.map(async file=>{
    const id=file.name.slice(0,-5);
    const project=await readProject(owner,id);
    if(!project)return null;
    const first=project.plan.frames[0] as {referencePath?:string}|undefined;
    let coverUrl="";
    if(first?.referencePath?.startsWith(owner+"/")){
     try{
      const signed=await storage().from("vmv-motion-frames-preview")
       .createSignedUrl(first.referencePath,3600);
      if(!signed.error&&signed.data?.signedUrl)coverUrl=signed.data.signedUrl;
     }catch{}
    }
    const ready=Boolean(await finishedRender(owner,id,project).catch(()=>null));
    return {id,title:String(project.plan.title||"Proyecto").slice(0,100),
     updatedAt:project.updatedAt||file.updated_at||"",
     clips:project.seedance.urls.filter(Boolean).length,
     scenes:project.plan.frames.length,coverUrl,ready};
   }));
   return reply({projects:loaded.filter(Boolean)});
  }catch{return reply({error:"motion_cloud_list_unavailable"},503);}
 }
 if(action==="load"){
  if(!validId(body?.id))return reply({error:"motion_project_id_invalid"},400);
  try{
   const project=await readProject(owner,body.id);
   return project?reply({project}):reply({error:"motion_project_not_found"},404);
  }catch{return reply({error:"motion_project_not_found"},404);}
 }
 if(action==="render-upload"){
  if(!validId(body?.id)||!["mp4","webm"].includes(body?.extension))
   return reply({error:"motion_render_invalid"},400);
  const extension=body.extension as string;
  try{
   const project=await readProject(owner,body.id);
   if(!project)return reply({error:"motion_project_not_found"},404);
   if(!await ensureBucket(RENDER_BUCKET,100000000,["video/mp4","video/webm"]))
    return reply({error:"motion_render_storage_unavailable"},503);
   const revisionId=body?.revisionId;
   if(revisionId!==undefined&&!validId(revisionId))
    return reply({error:"motion_render_revision_invalid"},400);
   const path=renderPath(owner,body.id,extension,revisionId);
   const signed=await storage().from(RENDER_BUCKET).createSignedUploadUrl(path,{upsert:true});
   if(signed.error||!signed.data?.token)return reply({error:"motion_render_storage_unavailable"},503);
   return reply({path,token:signed.data.token,bucket:RENDER_BUCKET});
  }catch{return reply({error:"motion_render_storage_unavailable"},503);}
 }
 // A short-lived bearer URL downloads the exact stored video bytes.
 // The Storage bucket remains private and project ownership is verified above.
 if(action==="render-share"){
  if(!validId(body?.id))return reply({error:"motion_project_id_invalid"},400);
  try{
   const project=await readProject(owner,body.id);
   if(!project)return reply({error:"motion_project_not_found"},404);
   const saved=await finishedRender(owner,body.id,project);
   if(!saved)return reply({error:"motion_render_not_found"},404);
   // The signed URL serves the exact uploaded file; it never recompresses.
   const filename="VMV-Motion-"+body.id.slice(0,8)+"."+saved.extension;
   const expiresIn=7*24*60*60;
   const signed=await storage().from(RENDER_BUCKET).createSignedUrl(
    saved.path,expiresIn,{download:filename});
   if(!signed.error&&signed.data?.signedUrl)
    return reply({url:signed.data.signedUrl,filename,
     expiresAt:new Date(Date.now()+expiresIn*1000).toISOString()});
   return reply({error:"motion_render_share_unavailable"},503);
  }catch{return reply({error:"motion_render_share_unavailable"},503);}
 }
 if(action==="render-url"){
  if(body?.revisionId!==undefined&&!validId(body.revisionId))
   return reply({error:"motion_render_revision_invalid"},400);
  if(!validId(body?.id)||!["mp4","webm"].includes(body?.extension))
   return reply({error:"motion_render_invalid"},400);
  try{
   const project=await readProject(owner,body.id);
   if(!project)return reply({error:"motion_project_not_found"},404);
   const signed=await storage().from(RENDER_BUCKET).createSignedUrl(
    renderPath(owner,body.id,body.extension,
     validId(body?.revisionId)?body.revisionId:undefined),3600);
   if(signed.error||!signed.data?.signedUrl)return reply({error:"motion_render_not_found"},404);
   return reply({url:signed.data.signedUrl});
  }catch{return reply({error:"motion_render_not_found"},404);}
 }
 return reply({error:"motion_library_action_invalid"},400);
}
