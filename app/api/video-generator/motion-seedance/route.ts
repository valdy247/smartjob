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
function cinematicPrompt(raw:string,beat:number){
 const premise=raw.replace(/\\s+/g," ").trim().slice(0,500);
 const beats=[
  "Scene 1 of 3. Establish the setting and characters, show a striking discovery or visual hook. End the scene with rising anticipation.",
  "Scene 2 of 3. The same protagonist attempts the main action, encounters a meaningful obstacle, and reacts emotionally. Show real physical action with limbs.",
  "Scene 3 of 3. Continue with the same cast, reveal the surprise or solution and resolve the story with expressive movement and a satisfying final pose."
 ];
 return [
  "Create a five-second vertical 9:16 cinematic 2D animated cartoon shot.",
  "This is animated character performance, not a static illustration or camera-only slideshow.",
  "FULL ORIGINAL STORY AND CAST (keep exactly the same visual identity throughout): "+premise,
  beats[beat],
  "Premium expressive 2D animation, colorful detailed setting, appealing clearly identifiable faces and bodies, polished lighting.",
  "Show convincing limb movements, reaching, lifting, physical interactions, squash and stretch, natural momentum and purposeful camera work.",
  "Consistent character anatomy, fur colors, costumes, size relationships and props between shots. No abstract symbols.",
  "No text overlays, no subtitles, no watermarks, no branding, no spoken audio."
 ].join(" ");
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const body=await req.json().catch(()=>null);
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
 if(!Number.isInteger(beat)||beat<0||beat>2)return reply({error:"invalid_scene_index"},400);
 if(prompt.length<8||prompt.length>500)return reply({error:"invalid_video_prompt"},400);
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!process.env.OPENAI_API_KEY)
  return reply({error:"token_signing_secret_missing"},503);
 const {data:claimed,error:quotaError}=await videoDb().rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(quotaError)return reply({error:"motion_quota_unavailable"},503);
 if(claimed!==true)return reply({error:"motion_limit"},429);
 try{
  const result=await startVideo({
   model:MODEL,prompt:cinematicPrompt(prompt,beat),duration:DURATION,
   aspectRatio:"9:16",resolution:"720x1280"
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
