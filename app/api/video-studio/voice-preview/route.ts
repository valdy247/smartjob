import {NextRequest,NextResponse} from "next/server";
import {generateSpeech} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb} from "@/lib/vmv-video-generator";
import {validPilotLanguage,validPilotVoice} from "@/lib/vmv-pilot-voice-config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=65;

const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const failure=(message:string,status:number)=>
 NextResponse.json({error:message},{status,headers});

// Short, fixed content. User input cannot be turned into arbitrary billable TTS.
const script={
 es:"Hola, esta es una muestra breve de mi voz para tu próximo video.",
 en:"Hello, this is a short sample of my voice for your next video.",
 pt:"Olá, esta é uma breve amostra da minha voz para seu próximo vídeo.",
 fr:"Bonjour, voici un court extrait de ma voix pour votre prochaine vidéo.",
 de:"Hallo, hier ist eine kurze Hörprobe meiner Stimme für dein nächstes Video.",
 it:"Ciao, questo è un breve esempio della mia voce per il tuo prossimo video."
} as const;

/** V1 preview only. Daily quota is claimed before the paid provider is called.
 * Listening to a demo never deducts Video Studio credits. */
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV!=="preview")return failure("voice_preview_unavailable",503);
 const owner=await authenticatedUser(req);
 if(!owner)return failure("authentication_required",401);
 if(Number(req.headers.get("content-length")||0)>1024)return failure("invalid_voice_preview",413);
 const body=await req.json().catch(()=>null);
 const language=body?.language,provider=body?.provider,voiceId=body?.voiceId;
 if(!validPilotLanguage(language)||provider!=="openai"||!validPilotVoice(provider,voiceId))
  return failure("invalid_voice_preview",400);
 let granted=false;
 try{
  const {data,error}=await videoDb().rpc("vmv_pilot_voice_preview_claim",{
   p_owner:owner,p_language:language,p_provider:"openai"
  });
  if(error)return failure("voice_preview_unavailable",503);
  granted=data===true;
 }catch{return failure("voice_preview_unavailable",503);}
 if(!granted)return failure("voice_preview_limit",429);
 try{
  const output=await generateSpeech({
   model:gateway.speechModel("openai/tts-1"),
   text:script[language],voice:voiceId,abortSignal:AbortSignal.timeout(45000)
  });
  const audio=new Uint8Array(output.audio.uint8Array);
  if(audio.byteLength<1000||audio.byteLength>900000)return failure("voice_preview_unavailable",503);
  const payload=new Uint8Array(new ArrayBuffer(audio.byteLength));
  payload.set(audio);
  return new NextResponse(payload,{status:200,headers:{
   ...headers,"Content-Type":"audio/mpeg","Content-Length":String(audio.byteLength)
  }});
 }catch{return failure("voice_preview_unavailable",503);}
}
