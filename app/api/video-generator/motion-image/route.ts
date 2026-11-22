import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
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
 if(body?.action==="preview"){
  const imagePath=typeof body?.referencePath==="string"?body.referencePath:"";
  if(!imagePath.startsWith(owner+"/")||!/^[-a-z0-9/]+\.jpg$/.test(imagePath))
   return reply({error:"invalid_image_reference"},403);
  const signed=await videoDb().storage.from("vmv-motion-frames-preview").createSignedUrl(imagePath,7200);
  if(signed.error||!signed.data?.signedUrl)return reply({error:"image_reference_unavailable"},409);
  return reply({imageUrl:signed.data.signedUrl,referencePath:imagePath});
 }
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 const movieMode=body?.mode==="storyframe";
 const referencePath=typeof body?.referencePath==="string"?body.referencePath:"";
 const characterReference=body?.referenceMode==="character";
 if(movieMode&&referencePath&&(!referencePath.startsWith(owner+"/")||!/^[-a-z0-9/]+\.jpg$/.test(referencePath)))return reply({error:"invalid_image_reference"},403);
 if(body?.confirmCost!==true||prompt.length<35||prompt.length>1800)return reply({error:"invalid_image_request"},400);
 if(!process.env.OPENAI_API_KEY)return reply({error:"openai_key_not_configured"},503);
 // Private preview is already restricted to the explicitly allowlisted owner.
 // No daily test quota: the owner controls each paid generation via confirmCost.
 try{
  const db=videoDb();
  let inputImage:Blob|null=null;
  if(movieMode&&referencePath){
   const downloaded=await db.storage.from("vmv-motion-frames-preview").download(referencePath);
   if(downloaded.error||!downloaded.data)return reply({error:"image_reference_unavailable"},409);
   inputImage=downloaded.data;
  }
  const form=inputImage?new FormData():null;
  if(form){
   form.set("model","gpt-image-1-mini");
   form.set("prompt",(characterReference?
    "Use the attached image ONLY as a visual reference for recurring character identity: match their face, color palette, clothing, body proportions and illustration style. Draw a DISTINCT new shot specified below, with its own actions and environment. Do not reuse unrelated background objects, text or subjects from the reference image. Keep portrait 9:16. No captions or text. ":
    "Continue the SAME animated short and KEEP the cast, environment, lighting, color palette and artwork consistent with the supplied previous scene image. Change ONLY the on-screen action and character poses as described. Create the NEXT distinct five-second scene start frame, not a repeat of the previous shot. No captions or text. ")+prompt);
   form.set("size","1024x1536");form.set("quality","medium");form.set("output_format","jpeg");form.set("n","1");
   form.set("image",inputImage!,"previous-scene.jpg");
  }
  const response=await fetch(inputImage?"https://api.openai.com/v1/images/edits":"https://api.openai.com/v1/images/generations",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(105000),
   headers:{...(form?{}:{"Content-Type":"application/json"}),Authorization:"Bearer "+process.env.OPENAI_API_KEY},
   body:form??JSON.stringify({
    model:"gpt-image-1-mini",size:"1024x1536",quality:"medium",output_format:"jpeg",
    n:1,prompt:"Create ONE original opening frame for a cinematic vertical 9:16 short film. Follow the specific genre, art direction, subject matter, setting and shot composition provided. Do not introduce objects or characters from other scenes. Do not add captions, labels or logos. "+prompt
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
  if(movieMode){
   const bytes=Buffer.from(image,"base64");
   if(bytes.length<1024||bytes.length>4500000)return reply({error:"image_size_unavailable"},502);
   const bucket="vmv-motion-frames-preview";
   const storage=db.storage;
   const exists=await storage.getBucket(bucket);
   if(exists.error){
    const created=await storage.createBucket(bucket,{public:false,fileSizeLimit:5000000,allowedMimeTypes:["image/jpeg"]});
    if(created.error&&!/already.exists|duplicate/i.test(created.error.message))return reply({error:"image_storage_unavailable"},503);
   }
   const imagePath=owner+"/"+randomUUID()+".jpg";
   const uploaded=await storage.from(bucket).upload(imagePath,bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"3600"});
   if(uploaded.error)return reply({error:"image_storage_unavailable"},503);
   const link=await storage.from(bucket).createSignedUrl(imagePath,7200);
   if(link.error||!link.data?.signedUrl)return reply({error:"image_url_unavailable"},503);
   return reply({imageUrl:link.data.signedUrl,referencePath:imagePath,mediaType:"image/jpeg"});
  }
  return reply({imageBase64:image,mediaType:"image/jpeg"});
 }catch(error){
  console.warn("[vmv-motion-image]",error instanceof Error?error.name:"unknown");
  return reply({error:"image_provider_failed"},503);
 }
}
