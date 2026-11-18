import {NextRequest,NextResponse} from "next/server";
import {experimental_transcribe as transcribe} from "ai";
import {createGateway} from "@ai-sdk/gateway";
import {authenticatedUser,consumeCredit} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const MAX_AUDIO_BYTES=3_300_000;
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const validTypes=new Set(["audio/webm","audio/mp4","audio/ogg","audio/mpeg","audio/wav","audio/x-m4a","audio/aac"]);

export async function POST(req:NextRequest){
 const user=await authenticatedUser(req);
 if(!user)return reply({error:"sign_in_required"},401);
 const size=Number(req.headers.get("content-length")||0);
 if(size>4_000_000)return reply({error:"audio_too_large"},413);
 const elevenKey=process.env.ELEVENLABS_API_KEY;
 const gatewayToken=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers.get("x-vercel-oidc-token")||"";
 if(!elevenKey&&!gatewayToken)return reply({error:"transcription_not_configured"},503);
 let audio:Blob;
 try{
  const form=await req.formData();
  const part=form.get("audio");
  if(!(part instanceof Blob))return reply({error:"audio_required"},400);
  audio=part;
 }catch{return reply({error:"invalid_request"},400);}
 const mime=audio.type.toLowerCase().split(";")[0].trim();
 if(!validTypes.has(mime)||audio.size<512||audio.size>MAX_AUDIO_BYTES)return reply({error:"invalid_audio"},400);
 if(!await consumeCredit(req,"voice"))return reply({error:"daily_limit"},429);
 try{
  let text="";
  if(elevenKey){
   const upload=new FormData();
   upload.append("model_id","scribe_v2");
   upload.append("file",audio,mime.includes("mp4")?"speech.m4a":mime.includes("ogg")?"speech.ogg":mime.includes("wav")?"speech.wav":"speech.webm");
   const response=await fetch("https://api.elevenlabs.io/v1/speech-to-text",{
    method:"POST",headers:{"xi-api-key":elevenKey},body:upload,signal:AbortSignal.timeout(70000),cache:"no-store"
   });
   if(!response.ok){console.error("Marketing captions STT provider status",response.status);return reply({error:"transcription_unavailable"},502);}
   const result=await response.json() as {text?:string};
   text=typeof result.text==="string"?result.text.trim():"";
  }else{
   const gateway=createGateway({apiKey:gatewayToken});
   const result=await transcribe({
    model:gateway.transcriptionModel("openai/gpt-transcribe"),
    audio:new Uint8Array(await audio.arrayBuffer())
   });
   text=String(result.text||"").trim();
  }
  if(!text)return reply({error:"no_speech"},422);
  return reply({text:text.slice(0,6000)});
 }catch(e){
  console.error("Marketing captions STT unavailable",e instanceof Error?e.name:"unknown");
  return reply({error:"transcription_unavailable"},502);
 }
}
