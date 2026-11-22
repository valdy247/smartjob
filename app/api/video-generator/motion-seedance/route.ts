import {NextRequest,NextResponse} from "next/server";
import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import {experimental_startVideo as startVideo,experimental_getVideoStatus as getVideoStatus} from "ai";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";
import {classifyGatewayVideoFailure} from "@/lib/vmv-gateway-video-error.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const MODEL="bytedance/seedance-v1.0-pro-fast";
const DURATION=5;
const RESOLUTION="720p";
const COST_USD=0.103;
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:videoHeaders});
function secret(){
 // Only used to authenticate a saved operation to its owner, never sent to the browser.
 const value=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.OPENAI_API_KEY;
 if(!value)throw Error("token_signing_secret_missing");
 return value;
}
function seal(owner:string,operation:unknown){
 const payload=Buffer.from(JSON.stringify({owner,operation,createdAt:Date.now()})).toString("base64url");
 const digest=createHmac("sha256",secret()).update(payload).digest("base64url");
 return payload+"."+digest;
}
function unseal(token:string,owner:string,allowArchived=false):unknown|null{
 try{
  if(token.length>10000)return null;
  const [payload,signature,...rest]=token.split(".");
  if(!payload||!signature||rest.length)return null;
  const expected=createHmac("sha256",secret()).update(payload).digest("base64url");
  const left=Buffer.from(signature),right=Buffer.from(expected);
  if(left.length!==right.length||!timingSafeEqual(left,right))return null;
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(data.owner!==owner||!Number.isFinite(data.createdAt)||
   (!allowArchived&&Date.now()-data.createdAt>24*60*60*1000)||
   data.createdAt>Date.now()+60000)return null;
  return data.operation;
 }catch{return null;}
}
function storyBeats(raw:string):string[]{
 const lines=raw.trim().replace(/\s+/g," ").match(/[^.!?;]+[.!?;]?/g)?.map(s=>s.trim()).filter(Boolean)||[];
 // A separate action per clip. Repeating the entire plot in each prompt made the
 // video model re-enact the same actions in all three five-second generations.
 if(lines.length>=3){
  const first=lines[0],second=lines[1],third=lines.slice(2).join(" ");
  return [first,second,third];
 }
 if(lines.length===2)return [lines[0],lines[1],lines[1]];
 const clauses=raw.trim().split(/,\s+|\s+(?:pero|entonces|después|luego|suddenly|then|finally|but)\s+/i).filter(Boolean);
 if(clauses.length>=3){
  return [clauses[0],clauses.slice(1,-1).join(", "),clauses[clauses.length-1]];
 }
 const words=raw.trim().split(/\s+/);
 const cut=Math.ceil(words.length/3);
 return [words.slice(0,cut).join(" "),words.slice(cut,cut*2).join(" "),words.slice(cut*2).join(" ")];
}
function cinematicPrompt(raw:string,beat:number){
 const scene=storyBeats(raw)[beat]?.trim()||raw;
 const normalized=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const mouseCat=/(raton|mouse)/.test(normalized)&&/(gato|cat)/.test(normalized)&&/(queso|cheese)/.test(normalized);
 const cast=mouseCat
  ?"Character bible shared across all clips: a very small gray mouse with rounded pink ears, a huge friendly orange cat with cream muzzle, and one enormous golden Swiss-cheese wedge. Same blue-tiled cozy wooden kitchen. Both characters are fully recognizable 2D cartoons."
  :"Keep the same identifiable character design, distinctive colors, costumes, scale and setting across the three shots. Do not change any designs.";
 const exclusions=[
  "FIRST SCENE ONLY: establish the discovery and end BEFORE the hero tries to solve the central problem. Do not reveal the final helper or resolution.",
  "SECOND SCENE ONLY: the hero physically attempts the difficult action and struggles. DO NOT replay the opening discovery; DO NOT show the final solution or helper succeeding.",
  "THIRD SCENE ONLY: show the surprising helper arriving, both characters cooperating to solve the problem, and the emotional payoff. Do not replay discovery or solo struggle."
 ];
 return [
  "Create ONLY one specific five-second sequence from a three-part animated film. Vertical 9:16.",
  cast,
  "EXACT ACTION TO ANIMATE IN THIS SHOT: "+scene,
  mouseCat?exclusions[beat]:[
   "This is the opening shot: show ONLY its assigned introductory action, with a clear hook and anticipation.",
   "This is the middle shot: show ONLY the assigned action and obstacle, not the beginning or ending.",
   "This is the final shot: show ONLY the assigned resolution and reaction; do not reset to the opening."
  ][beat],
  "IMPORTANT: Animate the assigned action only. The other scenes happen before or after this clip and MUST NOT appear here. Never summarize or reenact the whole story.",
  "Premium expressive hand-drawn 2D animation, colorful coherent background, appealing acting and facial expressions, physical limb movement, convincing weight, deliberate cinematic shot framing. 24fps.",
  "No text, subtitles, lettering, watermarks or logos. Do not narrate."
 ].join(" ");
}
async function finishedVideo(operation:unknown){
 const result=await getVideoStatus(MODEL,{operation:operation as Parameters<typeof getVideoStatus>[1]["operation"]});
 if(result.status!=="completed")return {status:result.status,url:null};
 const video=result.videos?.[0] as {url?:string}|undefined;
 const url=typeof video?.url==="string"&&/^https:\/\//.test(video.url)?video.url:null;
 return {status:result.status,url};
}
function isSafeMediaUrl(raw:string):boolean{
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.port&&u.port!=="443")return false;
  const h=u.hostname.toLowerCase();
  if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".localhost")||!h.includes(".")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(":"))return false;
  return true;
 }catch{return false;}
}
async function fetchClip(raw:string):Promise<Uint8Array>{
 let url=raw;
 for(let n=0;n<4;n++){
  if(!isSafeMediaUrl(url))throw Error("invalid_media_origin");
  const res=await fetch(url,{redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(25000)});
  if([301,302,303,307,308].includes(res.status)){
   const loc=res.headers.get("location");
   if(!loc)throw Error("missing_media_location");
   url=new URL(loc,url).href;
   continue;
  }
  if(!res.ok)throw Error("media_fetch_"+res.status);
  const type=res.headers.get("content-type")||"";
  if(!/video\/|application\/octet-stream/i.test(type))throw Error("invalid_media_type");
  const len=Number(res.headers.get("content-length")||0);
  if(len>26000000)throw Error("media_too_large");
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.byteLength<1000||bytes.byteLength>26000000)throw Error("invalid_media_size");
  return bytes;
 }
 throw Error("media_redirect_limit");
}
// ByteDance's completed Seedance clips are hosted on signed Volcengine TOS
// links. A previously signed operation token proves ownership; never accept
// arbitrary remote download URLs or grant unauthenticated URL fetching.
function trustedSeedanceUrl(raw:string):boolean{
 if(!isSafeMediaUrl(raw))return false;
 try{
  const hostname=new URL(raw).hostname.toLowerCase();
  return (hostname==="volces.com"||hostname.endsWith(".volces.com"))&&
   /\.mp4(?:$|\/)/i.test(new URL(raw).pathname);
 }catch{return false;}
}
const CLIP_BUCKET="vmv-motion-clips-preview";
function clipPath(owner:string,token:string){
 return owner+"/"+createHash("sha256").update(token).digest("hex")+".mp4";
}
function serveClip(bytes:Uint8Array){
 return new NextResponse(Buffer.from(bytes),{headers:{
  ...videoHeaders,"Content-Type":"video/mp4","Content-Length":String(bytes.byteLength),
  "Cache-Control":"private, no-store","Content-Disposition":"inline; filename=seedance-clip.mp4"
 }});
}
async function savePrivateClip(owner:string,token:string,data:Uint8Array):Promise<boolean>{
 try{
  const db=videoDb(),storage=db.storage;
  const bucket=await storage.getBucket(CLIP_BUCKET);
  if(bucket.error){
   const made=await storage.createBucket(CLIP_BUCKET,{
    public:false,fileSizeLimit:26000000,allowedMimeTypes:["video/mp4"]
   });
   if(made.error&&!/already.exists|duplicate/i.test(made.error.message))
    throw Error("clip_bucket_unavailable");
  }
  const upload=await storage.from(CLIP_BUCKET).upload(clipPath(owner,token),Buffer.from(data),{
   contentType:"video/mp4",cacheControl:"3600",upsert:true
  });
  if(upload.error)throw Error("clip_storage_upload_failed");
  return true;
 }catch(e){
  console.warn("[vmv-seedance-archive]",e instanceof Error?e.message.slice(0,65):"unknown");
  return false;
 }
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const body=await req.json().catch(()=>null);
 if(body?.action==="download"||body?.action==="archive"){
  const archiveOnly=body.action==="archive";
  const token=typeof body?.token==="string"?body.token:"";
  const operation=unseal(token,owner,true);
  if(!operation)return reply({error:"invalid_video_job"},403);
  const jobFresh=Boolean(unseal(token,owner));
  // First use our private copy, which remains available after provider URLs
  // and gateway credit checks expire.
  try{
   const cached=await videoDb().storage.from(CLIP_BUCKET).download(clipPath(owner,token));
   if(!cached.error&&cached.data){
    const bytes=new Uint8Array(await cached.data.arrayBuffer());
    if(bytes.length>=1000&&bytes.length<=26000000)
     return archiveOnly?reply({saved:true,cached:true}):serveClip(bytes);
   }
  }catch{}
  const sourceUrl=typeof body?.sourceUrl==="string"?body.sourceUrl:"";
  let mediaUrl:string|null=null;
  if(sourceUrl&&trustedSeedanceUrl(sourceUrl)){
   // Existing signed TOS URL: no paid model call, and no gateway status call.
   mediaUrl=sourceUrl;
  }else{
   if(sourceUrl)console.warn("[vmv-seedance-download]",{reason:"unsupported_video_host"});
   // Provider operations expire after 24 hours; archived files do not.
   if(!jobFresh)return reply({error:"video_archive_missing"},410);
   try{
    const result=await finishedVideo(operation);
    if(result.status!=="completed"||!result.url)return reply({error:"video_not_ready"},409);
    mediaUrl=result.url;
   }catch(e){
    const issue=classifyGatewayVideoFailure(e);
    console.warn("[vmv-seedance-download]",{reason:"provider_status_failed",status:issue.status,
     providerType:issue.providerType});
    return reply({error:"video_provider_status_unavailable",
     ...(issue.providerType?{providerType:issue.providerType}:{})},502);
   }
  }
  if(!mediaUrl)return reply({error:"video_source_unavailable"},502);
  try{
   // Reject unsafe destination and any unsafe redirect before fetching.
   // Existing fetchClip imposes a 26 MB cap and content-type restrictions.
   const data=await fetchClip(mediaUrl);
   // Persist the MP4 so voice/stitch retries never depend on expiring links.
   const saved=await savePrivateClip(owner,token,data);
   if(archiveOnly)return saved?reply({saved:true}):reply({error:"clip_archive_unavailable"},503);
   return serveClip(data);
  }catch(e){
   const message=e instanceof Error?e.message:"unknown";
   const reason=/^media_fetch_(403|404|410)$/.test(message)?"video_source_expired":
    /^media_fetch_\d+$/.test(message)?"video_source_unavailable":
    /invalid_media_origin|missing_media_location|media_redirect_limit/.test(message)?"video_source_rejected":
    /media_too_large|invalid_media_size/.test(message)?"video_source_invalid":"video_download_unavailable";
   console.warn("[vmv-seedance-download]",{reason,source:"seedance_video_file"});
   return reply({error:reason},502);
  }
 }
 if(body?.action==="status"){
  const token=typeof body?.token==="string"?body.token:"";
  const operation=unseal(token,owner);
  if(!operation)return reply({error:"invalid_video_job"},403);
  try{
   const result=await getVideoStatus(MODEL,{operation:operation as Parameters<typeof getVideoStatus>[1]["operation"]});
   const state=result.status;
   if(state==="completed"){
    const video=result.videos?.[0] as {url?:string;data?:string;mediaType?:string}|undefined;
    const url=typeof video?.url==="string"&&/^https:\/\//.test(video.url)?video.url:null;
    if(!url)return reply({error:"video_result_unavailable",status:state},502);
    return reply({status:"completed",url,mediaType:"video/mp4"});
   }
   return reply({status:state==="error"?"failed":"pending"});
  }catch(e){
   console.warn("[vmv-seedance-status]",e instanceof Error?e.name:"unknown");
   return reply({error:"video_status_unavailable"},503);
  }
 }
 // Verify every scene before the first paid animation operation. This preflight
 // only reads Supabase image references and configuration; it never calls Seedance.
 const action=body?.action;
 if(!["start","preflight"].includes(action))return reply({error:"invalid_motion_action"},400);
 if(body?.confirmCost!==true)return reply({error:"cost_confirmation_required"},400);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 const storyBible=typeof body?.storyBible==="string"?body.storyBible.trim():"";
 if(prompt.length<8||prompt.length>2000)return reply({error:"invalid_video_prompt"},400);
 if(storyBible.length>1200)return reply({error:"seedance_story_bible_too_long"},400);
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!process.env.OPENAI_API_KEY)
  return reply({error:"token_signing_secret_missing"},503);
 // The AI SDK can authenticate through Vercel OIDC; do not require a separate key.
 const clips=action==="preflight"?body?.clips:[body];
 if(!Array.isArray(clips)||!clips.length||clips.length>12)
  return reply({error:"invalid_scene_list"},400);
 const validated:{beat:number;imagePath:string;motionPrompt:string}[]=[];
 for(const item of clips){
  const beat=item?.beat,imagePath=typeof item?.imagePath==="string"?item.imagePath:"";
  const motionPrompt=typeof item?.motionPrompt==="string"?item.motionPrompt.trim():"";
  if(!Number.isInteger(beat)||beat<0||beat>11)
   return reply({error:"invalid_scene_index",beat},400);
  if(!imagePath.startsWith(owner+"/"))
   return reply({error:"seedance_image_owner_mismatch",beat},403);
  if(!/^[-a-z0-9/]+\.jpg$/.test(imagePath))
   return reply({error:"seedance_image_path_invalid",beat},400);
  if(motionPrompt.length<18||motionPrompt.length>650)
   return reply({error:"seedance_motion_prompt_invalid",beat,length:motionPrompt.length},400);
  validated.push({beat,imagePath,motionPrompt});
 }
 // Check the entire storyboard before spending on the first animation.
 const signedUrls:string[]=[];
 for(const clip of validated){
  try{
   const signed=await videoDb().storage.from("vmv-motion-frames-preview").createSignedUrl(clip.imagePath,7200);
   if(signed.error||!signed.data?.signedUrl)
    return reply({error:"storyboard_image_missing",beat:clip.beat},409);
   signedUrls.push(signed.data.signedUrl);
  }catch{return reply({error:"image_storage_unavailable",beat:clip.beat},503);}
 }
 if(action==="preflight")return reply({ready:true,clips:validated.length,model:MODEL,estimatedCostUsd:Number((validated.length*COST_USD).toFixed(3))});
 const {beat,imagePath,motionPrompt}=validated[0];
 // Private preview is already restricted to the explicitly allowlisted owner.
 // Only an explicit confirmed request can start a paid generation.
 try{
  const signedUrl=signedUrls[0];
  const result=await startVideo({
   model:MODEL,
   prompt:{image:signedUrl,text:[
    "Animate the supplied opening image as a five-second shot in its EXISTING genre and art style, whether documentary, cinematic, 3D, or cartoon.",
    "Preserve the image’s initial subject identities, material realism, art direction and layout THROUGH THIS SHOT, while allowing motion and logically required changes during the five seconds.",
    storyBible?"Common art direction and recurring character traits: "+storyBible:"",
    "ANIMATE ONLY THIS SCENE: "+motionPrompt,
    "Do not replay other scenes, restart the story or introduce unrelated objects. Follow exactly the motion direction. Animate meaningful physical action and visual transformations rather than only camera zoom.",
    "Preserve this shot’s chosen visual genre and cinematic composition. No added text, logos, captions or speech."
   ].join(" ")},
   duration:DURATION,aspectRatio:"9:16",resolution:"1280x720"
  });
  return reply({status:"pending",token:seal(owner,result.operation),model:MODEL,duration:DURATION,estimatedCostUsd:COST_USD,beat});
 }catch(e){
  const problem=classifyGatewayVideoFailure(e);
  // Only log the allowlisted error category, operation number and HTTP status.
  // Upstream bodies/messages may contain sensitive prompts or identifiers.
  console.warn("[vmv-seedance-start]",{
   beat:beat+1,status:problem.status,providerType:problem.providerType,
   budgetScope:problem.budgetScope,error:problem.error
  });
  const http=problem.error==="seedance_invalid_parameters"?422:
   problem.error==="ai_gateway_rate_limited"?429:
   problem.status===402?402:503;
  return reply({error:problem.error,
   ...(problem.providerType?{providerType:problem.providerType}:{}),
   ...(problem.budgetScope?{budgetScope:problem.budgetScope}:{}),
   beat},http);
 }
}
