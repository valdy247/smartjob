import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {experimental_startVideo as startVideo,experimental_getVideoStatus as getVideoStatus} from "ai";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const MODEL="minimax/minimax-h3-max";
const DURATION=15;
const RESOLUTION="768p";
const COST_USD=1.2;
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
function cinematicPrompt(raw:string){
 const premise=raw.replace(/\s+/g," ").trim().slice(0,500);
 return [
  "Create a complete, continuous 15-second vertical 9:16 cinematic 2D animated cartoon short.",
  "This is CHARACTER ANIMATION, not a still image slideshow. Animate walking, reaching, lifting, facial expressions, and physical contact with believable timing and weight.",
  "Visual story supplied by the creator: "+premise,
  "Direct the action in THREE beats within the same uninterrupted short: seconds 0-5 a gripping visual hook establishing the recognizable characters, props and location; seconds 5-10 an action and escalating conflict; seconds 10-15 a clear resolution or delightful surprise.",
  "Maintain the exact same characters, proportions, fur colors, clothing, and prop details for all 15 seconds, in a consistent coherent environment.",
  "Premium hand-crafted animated-film illustration, appealing character design, rich 2D backgrounds, crisp expressive faces, cinematic depth, lively body mechanics, squash and stretch, dramatic but smooth camera pushes and purposeful cuts.",
  "Clear silhouettes, readable staging, no abstract shapes or disconnected body parts.",
  "No text, no watermarks, no logos, no subtitles or speech bubbles burned into frames. No narration is required."
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
   return reply({status:state==="failed"?"failed":"pending"});
  }catch(e){
   console.warn("[vmv-minimax-status]",e instanceof Error?e.name:"unknown");
   return reply({error:"video_status_unavailable"},503);
  }
 }
 if(body?.action!=="start"||body?.confirmCost!==true)return reply({error:"cost_confirmation_required"},400);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 if(prompt.length<8||prompt.length>500)return reply({error:"invalid_video_prompt"},400);
 if(!process.env.AI_GATEWAY_API_KEY&&!process.env.VERCEL_OIDC_TOKEN)
  return reply({error:"ai_gateway_auth_not_configured"},503);
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!process.env.OPENAI_API_KEY)
  return reply({error:"token_signing_secret_missing"},503);
 const {data:claimed,error:quotaError}=await videoDb().rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(quotaError)return reply({error:"motion_quota_unavailable"},503);
 if(claimed!==true)return reply({error:"motion_limit"},429);
 try{
  const result=await startVideo({
   model:MODEL,prompt:cinematicPrompt(prompt),duration:DURATION,
   aspectRatio:"9:16",resolution:RESOLUTION
  });
  return reply({status:"pending",token:seal(owner,result.operation),model:MODEL,duration:DURATION,estimatedCostUsd:COST_USD});
 }catch(e){
  const name=e instanceof Error?e.name:"unknown";
  console.warn("[vmv-minimax-start]",name);
  return reply({error:/Unauthorized|Authentication/i.test(name)?"ai_gateway_auth_not_configured":"minimax_video_start_failed"},503);
 }
}
