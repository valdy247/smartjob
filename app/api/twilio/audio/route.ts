import { NextRequest,NextResponse } from "next/server";
import { readAudio } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const text=readAudio(new URL(req.url).searchParams.get("token")||"");
 if(!text)return new NextResponse(null,{status:404,headers:{"Cache-Control":"no-store"}});
 const key=process.env.ELEVENLABS_API_KEY;
 const voice=process.env.ELEVENLABS_VOICE_EN||"JBFqnCBsd6RMkjVDRZzb"; // ElevenLabs public documentation example voice
 if(!key)return new NextResponse(null,{status:503});
 try{
  const res=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice)+"?output_format=mp3_44100_128",{
   method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json","Accept":"audio/mpeg"},
   body:JSON.stringify({text,model_id:process.env.ELEVENLABS_TTS_MODEL||"eleven_flash_v2_5"}),
   signal:AbortSignal.timeout(15000)
  });
  if(!res.ok){console.error("Smart Job pilot TTS HTTP",res.status);return new NextResponse(null,{status:502});}
  const audio=await res.arrayBuffer();
  if(audio.byteLength>2_500_000)return new NextResponse(null,{status:502});
  return new NextResponse(audio,{status:200,headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){console.error("Smart Job pilot audio error",e instanceof Error?e.name:"unknown");return new NextResponse(null,{status:502});}
}
