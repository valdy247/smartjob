import {NextRequest,NextResponse} from "next/server";
import {generateSpeech} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";
import {validPilotLanguage,validPilotVoice} from "@/lib/vmv-pilot-voice-config";
import {verifyElevenLabsVoice} from "@/lib/vmv-pilot-elevenlabs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=75;
const error=(code:string,status:number)=>
 NextResponse.json({error:code},{status,headers:videoHeaders});

// Fixed, short scripts: never synthesize arbitrary user-supplied text.
const samples={
 es:"Hola, esta es una muestra de mi voz. Así podría sonar tu próximo video.",
 en:"Hello, this is a sample of my voice. This is how your next video could sound.",
 pt:"Olá, esta é uma amostra da minha voz. Assim poderá soar o seu próximo vídeo.",
 fr:"Bonjour, voici un échantillon de ma voix. Voici comment pourrait sonner votre prochaine vidéo.",
 de:"Hallo, hier ist eine Hörprobe meiner Stimme. So könnte dein nächstes Video klingen.",
 it:"Ciao, questo è un esempio della mia voce. Ecco come potrebbe suonare il tuo prossimo video."
} as const;
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return error("video_not_enabled_for_account",403);
 if(Number(req.headers.get("content-length")||0)>1024)return error("invalid_voice_preview",413);
 const body=await req.json().catch(()=>null);
 const language=body?.language,provider=body?.provider,voiceId=body?.voiceId;
 if(!validPilotLanguage(language)||!validPilotVoice(provider,voiceId)||provider==="none")
  return error("invalid_voice_preview",400);
 if(provider==="elevenlabs"){
  if(!process.env.ELEVENLABS_API_KEY)return error("elevenlabs_not_connected",503);
  if(!await verifyElevenLabsVoice(voiceId,language))
   return error("elevenlabs_voice_unavailable",400);
 }
 let granted=false;
 try{
  const {data,error:claimError}=await videoDb().rpc("vmv_pilot_voice_preview_claim",{
   p_owner:owner,p_language:language,p_provider:provider
  });
  if(claimError)return error("voice_preview_unavailable",503);
  granted=data===true;
 }catch{return error("voice_preview_unavailable",503);}
 if(!granted)return error("voice_preview_limit",429);
 try{
  let audio:Uint8Array;
  if(provider==="openai"){
   const output=await generateSpeech({
    model:gateway.speechModel("openai/tts-1"),
    text:samples[language],voice:voiceId,
    abortSignal:AbortSignal.timeout(60000)
   });
   audio=new Uint8Array(output.audio.uint8Array);
  }else{
   const response=await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voiceId)+
    "?output_format=mp3_44100_128",{
     method:"POST",cache:"no-store",
     headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY||"",
      "Content-Type":"application/json",Accept:"audio/mpeg"},
     body:JSON.stringify({text:samples[language],model_id:"eleven_multilingual_v2"}),
     signal:AbortSignal.timeout(60000)
    });
   if(!response.ok)return error("voice_preview_unavailable",503);
   const bytes=await response.arrayBuffer();
   audio=new Uint8Array(bytes);
  }
  if(audio.byteLength<1000||audio.byteLength>900000)return error("voice_preview_unavailable",503);
  return new NextResponse(audio,{status:200,headers:{
   ...videoHeaders,"Content-Type":"audio/mpeg","X-Content-Type-Options":"nosniff",
   "Content-Length":String(audio.byteLength)
  }});
 }catch{return error("voice_preview_unavailable",503);}
}
