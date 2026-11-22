import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {experimental_startVideo as startVideo,experimental_getVideoStatus as getVideoStatus} from "ai";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";

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
function unseal(token:string,owner:string):unknown|null{
 try{
  if(token.length>10000)return null;
  const [payload,signature,...rest]=token.split(".");
  if(!payload||!signature||rest.length)return null;
  const expected=createHmac("sha256",secret()).update(payload).digest("base64url");
  const left=Buffer.from(signature),right=Buffer.from(expected);
  if(left.length!==right.length||!timingSafeEqual(left,right))return null;
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(data.owner!==owner||!Number.isFinite(data.createdAt)||
   Date.now()-data.createdAt>24*60*60*1000||data.createdAt>Date.now()+60000)return null;
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
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const body=await req.json().catch(()=>null);
 if(body?.action==="download"){
  const token=typeof body?.token==="string"?body.token:"";
  const operation=unseal(token,owner);
  if(!operation)return reply({error:"invalid_video_job"},403);
  try{
   const {status,url}=await finishedVideo(operation);
   if(status!=="completed"||!url)return reply({error:"video_not_ready"},409);
   const data=await fetchClip(url);
   return new NextResponse(Buffer.from(data),{headers:{
    ...videoHeaders,"Content-Type":"video/mp4","Content-Length":String(data.length),
    "Cache-Control":"private, no-store","Content-Disposition":"inline; filename=seedance-clip.mp4"
   }});
  }catch(e){
   console.warn("[vmv-seedance-download]",e instanceof Error?e.message.slice(0,70):"unknown");
   return reply({error:"video_download_unavailable"},502);
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
 if(body?.action!=="start"||body?.confirmCost!==true)return reply({error:"cost_confirmation_required"},400);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 const beat=body?.beat;
 const imagePath=typeof body?.imagePath==="string"?body.imagePath:"";
 const motionPrompt=typeof body?.motionPrompt==="string"?body.motionPrompt.trim():"";
 const storyBible=typeof body?.storyBible==="string"?body.storyBible.trim():"";
 if(!imagePath.startsWith(owner+"/")||!/^[-a-z0-9/]+\.jpg$/.test(imagePath)||motionPrompt.length<18||motionPrompt.length>650||storyBible.length>1200)return reply({error:"storyboard_images_required"},400);
 if(!Number.isInteger(beat)||beat<0||beat>11)return reply({error:"invalid_scene_index"},400);
 if(prompt.length<8||prompt.length>2000)return reply({error:"invalid_video_prompt"},400);
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!process.env.OPENAI_API_KEY)
  return reply({error:"token_signing_secret_missing"},503);
 // Private preview is already restricted to the explicitly allowlisted owner.
 // No daily test quota: the owner controls each paid generation via confirmCost.
 try{
  const signed=await videoDb().storage.from("vmv-motion-frames-preview").createSignedUrl(imagePath,7200);
  if(signed.error||!signed.data?.signedUrl)return reply({error:"storyboard_image_missing"},409);
  const result=await startVideo({
   model:MODEL,
   prompt:{image:signed.data.signedUrl,text:[
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
  const issue=e as {name?:unknown;statusCode?:unknown;status?:unknown;response?:{status?:unknown;body?:unknown};data?:unknown;cause?:unknown};
  const name=e instanceof Error?e.name:"unknown";
  const status=[issue?.statusCode,issue?.status,issue?.response?.status].find(v=>typeof v==="number");
  const message=e instanceof Error?e.message:"";
  // Avoid logging user prompts, credentials, URLs, or raw upstream response bodies.
  const cause=issue?.cause as {name?:unknown;statusCode?:unknown;message?:unknown}|undefined;
  const safeDetails={
   name:name.slice(0,100),status:typeof status==="number"?status:undefined,
   causeName:typeof cause?.name==="string"?cause.name.slice(0,100):undefined,
   causeStatus:typeof cause?.statusCode==="number"?cause.statusCode:undefined,
   isAuth:/Unauthorized|Authentication|invalid.api.key/i.test(name+" "+message),
   isCredits:/insufficient|billing|credit|quota|payment.required/i.test(message),
   isParameters:/invalid|parameter|resolution|unsupported|aspect.ratio/i.test(message)
  };
  console.warn("[vmv-seedance-start]",safeDetails);
  if(safeDetails.isAuth||status===401||status===403)return reply({error:"ai_gateway_auth_not_configured"},503);
  if(safeDetails.isCredits||status===402)return reply({error:"ai_gateway_credits_required"},402);
  if(safeDetails.isParameters||status===400||status===422)return reply({error:"seedance_invalid_parameters"},422);
  return reply({error:"seedance_gateway_unavailable"},503);
 }
}
