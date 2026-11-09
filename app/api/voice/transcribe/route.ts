import {NextRequest,NextResponse} from "next/server";
import {experimental_transcribe as transcribe} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser,consumeCredit} from "@/lib/auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!await authenticatedUser(req))return NextResponse.json({error:"Inicia sesión."},{status:401});
 const hasEleven=Boolean(process.env.ELEVENLABS_API_KEY);
 const hasGateway=Boolean(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN);
 if(!hasEleven&&!hasGateway)return NextResponse.json({error:"No hay servicio de transcripción configurado."},{status:503});
 try{
  const form=await req.formData(),file=form.get("audio");
  if(!(file instanceof Blob)||file.size<200||file.size>10_000_000)
   return NextResponse.json({error:"Audio inválido o demasiado grande."},{status:400});
  if(!await consumeCredit(req,"voice"))
   return NextResponse.json({error:"Límite de audio diario alcanzado o acceso denegado."},{status:429});
  const kind=file.type.toLowerCase();
  const name=kind.includes("mp4")||kind.includes("m4a")?"conversation.m4a":
   kind.includes("mpeg")?"conversation.mp3":kind.includes("ogg")?"conversation.ogg":
   kind.includes("wav")?"conversation.wav":"conversation.webm";
  if(hasEleven){
   const forward=new FormData();
   forward.append("model_id","scribe_v2");
   forward.append("file",file,name);
   const r=await fetch("https://api.elevenlabs.io/v1/speech-to-text",{
    method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY!},
    body:forward,signal:AbortSignal.timeout(30000)
   });
   if(!r.ok){console.error("VMV Eleven STT",r.status);return NextResponse.json({error:"No se pudo reconocer el audio. Inténtalo otra vez."},{status:502});}
   const data=await r.json();
   return NextResponse.json({text:String(data.text||"").trim(),language:data.language_code||null});
  }
  // Preview needs no production ElevenLabs key: use the project's own Vercel AI Gateway.
  const result=await transcribe({
   model:gateway.transcriptionModel("openai/gpt-4o-mini-transcribe"),
   audio:new Uint8Array(await file.arrayBuffer())
  });
  return NextResponse.json({text:String(result.text||"").trim(),language:result.language||null});
 }catch(e){
  console.error("VMV transcription unavailable",e instanceof Error?e.message:"unknown");
  return NextResponse.json({error:"Error al transcribir audio."},{status:502});
 }
}
