import {IMAGE_PROMPT_LIMIT} from "@/lib/vmv-video-generator/image-prompt";
import {NextRequest,NextResponse} from "next/server";
import {generateImage} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:videoHeaders});
/** Generate a private preview only: no image-to-video credits or publishing here. */
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const size=Number(req.headers.get("content-length")||0);
 if(size>96*1024)return reply({error:"invalid_video_request"},413);
 const body=await req.json().catch(()=>null);
 const db=videoDb();
 const standalone=body?.output==="image";
 const dimensions=body?.size??"1024x1024";
 const quality=body?.quality??"standard";
 if(!["1024x1024","1024x1536","1536x1024"].includes(dimensions)||
    !["standard","high"].includes(quality))return reply({error:"invalid_video_request"},400);
 const input=standalone?body?.prompt:body?.direction;
 const description=typeof input==="string"?input.trim():"";
 if(description.length<3)return reply({error:"complete_video_brief"},400);
 if(description.length>IMAGE_PROMPT_LIMIT)return reply({error:"image_prompt_too_long"},400);
 // Pilot-only 50/day image budget; ordinary Web Studio quotas are untouched.
 const {data:claimed,error:quotaError}=await db.rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(quotaError)return reply({error:"image_quota_unavailable"},503);
 if(claimed!==true)return reply({error:"image_daily_limit"},429);
 try{
  const instructions=standalone?"Create the still image described by the user. Respect the requested subject, composition and style.":[
   "Create one original starting frame for an image-to-video sequence.",
   "Use the subject, setting and style requested by the user."
  ].join(" ");
  const signal=AbortSignal.timeout(110000);
  const modelId="openai/gpt-image-1-mini";
  const request={
   maxRetries:0,
   prompt:instructions+"\n"+description,
   size:dimensions,abortSignal:signal
  };
  let result;
  try{
   result=await generateImage({...request,model:gateway.imageModel(modelId),
    providerOptions:{openai:{quality:quality==="high"?"high":"medium",output_format:"jpeg"}}});
  }catch(error){
   if(!(error instanceof Error)||error.name!=="GatewayInternalServerError"||signal.aborted)throw error;
   const fallback=quality==="high"?"minimax/minimax-h3-image":"minimax/minimax-h3-image-highspeed";
   console.warn("[vmv-video-reference] using alternate image model",{modelId,fallback,dimensions});
   result=await generateImage({...request,model:gateway.imageModel(fallback),
    providerOptions:{minimax:{outputFormat:"jpeg"}}});
  }
  const bytes=Buffer.from(result.image.uint8Array);
  if(bytes.length<1024||bytes.length>6*1024*1024)return reply({error:"image_size_unavailable"},502);
  const mediaType=result.image.mediaType;
  if(!["image/jpeg","image/png","image/webp"].includes(mediaType))
   return reply({error:"image_format_unavailable"},502);
  if(standalone)return new NextResponse(new Uint8Array(bytes),{headers:{...videoHeaders,"Content-Type":mediaType}});
  return reply({imageBase64:bytes.toString("base64"),mediaType});
 }catch(error){
  const name=error instanceof Error?error.name:"unknown";
  console.warn("[vmv-video-reference] image generation failed",{name,quality,dimensions});
  if(name==="GatewayInternalServerError")return reply({error:"image_provider_busy"},503);
  return reply({error:"video_image_unavailable"},503);
 }
}
