import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
/** A single privately returned image; no external URLs or permanently stored assets. */
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 if(Number(req.headers.get("content-length")||0)>7000)return reply({error:"request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 if(body?.confirmCost!==true||prompt.length<35||prompt.length>1800)return reply({error:"invalid_image_request"},400);
 if(!process.env.OPENAI_API_KEY)return reply({error:"openai_key_not_configured"},503);
 // One persistent quota slot per image prevents unrestricted paid image requests.
 const {data:claimed,error:quotaError}=await videoDb().rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(quotaError)return reply({error:"image_quota_unavailable"},503);
 if(claimed!==true)return reply({error:"image_daily_limit"},429);
 try{
  const response=await fetch("https://api.openai.com/v1/images/generations",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(105000),
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
   body:JSON.stringify({
    model:"gpt-image-1-mini",size:"1024x1536",quality:"medium",output_format:"jpeg",
    n:1,prompt:"One original 2D illustration frame for a vertical 9:16 cartoon movie. "+prompt
   })
  });
  if(!response.ok){
   const failure=await response.json().catch(()=>null);
   const providerError=failure?.error;
   // Diagnose by error category only; never log full prompts, provider messages or credentials.
   const code=typeof providerError?.code==="string"?providerError.code.slice(0,80):"unknown";
   const type=typeof providerError?.type==="string"?providerError.type.slice(0,80):"unknown";
   const param=typeof providerError?.param==="string"?providerError.param.slice(0,60):"none";
   console.warn("[vmv-motion-image] OpenAI rejected image",{status:response.status,code,type,param});
   if(response.status===400){
    if(/safety|moderation|content_policy|policy_violation|blocked/i.test(code+" "+type))
     return reply({error:"image_safety_rejected"},422);
    return reply({error:"image_bad_request",providerCode:code==="unknown"?undefined:code},422);
   }
   if(response.status===401)return reply({error:"openai_key_invalid"},503);
   if(response.status===429)return reply({error:"openai_quota_or_rate_limit"},429);
   return reply({error:"image_provider_failed"},503);
  }
  const data=await response.json();
  const image=data?.data?.[0]?.b64_json;
  if(typeof image!=="string"||image.length<1000||image.length>8500000)
   return reply({error:"image_invalid_response"},502);
  return reply({imageBase64:image,mediaType:"image/jpeg"});
 }catch(error){
  console.warn("[vmv-motion-image]",error instanceof Error?error.name:"unknown");
  return reply({error:"image_provider_failed"},503);
 }
}
