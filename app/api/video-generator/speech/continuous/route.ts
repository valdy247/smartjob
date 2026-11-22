import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
type Alignment={characters:string[];character_start_times_seconds:number[];character_end_times_seconds:number[]};
function validAlignment(v:unknown):v is Alignment{
 if(!v||typeof v!=="object")return false;
 const a=v as Partial<Alignment>;
 return Array.isArray(a.characters)&&Array.isArray(a.character_start_times_seconds)&&
  Array.isArray(a.character_end_times_seconds)&&a.characters.length===a.character_start_times_seconds.length&&
  a.characters.length===a.character_end_times_seconds.length&&a.characters.every(c=>typeof c==="string")&&
  a.character_start_times_seconds.every(t=>typeof t==="number"&&Number.isFinite(t))&&
  a.character_end_times_seconds.every(t=>typeof t==="number"&&Number.isFinite(t));
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 return reply({configured:!!process.env.ELEVENLABS_API_KEY});
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 if(Number(req.headers.get("content-length")||0)>15000)return reply({error:"voice_request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const segments=body?.scenes;
 if(body?.confirmCost!==true||!Array.isArray(segments)||segments.length!==12||
  segments.some((s:unknown)=>typeof s!=="string"||s.trim().length<8||s.length>220))
  return reply({error:"invalid_voice_request"},400);
 const key=process.env.ELEVENLABS_API_KEY;
 if(!key)return reply({error:"elevenlabs_not_configured_in_preview"},503);
 const voiceId=process.env.ELEVENLABS_VOICE_ID||"21m00Tcm4TlvDq8ikWAM";
 if(!/^[a-zA-Z0-9]{20}$/.test(voiceId))return reply({error:"elevenlabs_voice_not_configured"},503);
 const text=segments.map((s:string)=>s.trim()).join(" ");
 if(text.length>4000)return reply({error:"voice_request_too_large"},413);
 try{
  const response=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+voiceId+"/with-timestamps?output_format=mp3_44100_128",{
   method:"POST",cache:"no-store",
   headers:{"xi-api-key":key,"Content-Type":"application/json"},
   body:JSON.stringify({text,model_id:"eleven_multilingual_v2",voice_settings:{stability:0.55,similarity_boost:0.75}}),
   signal:AbortSignal.timeout(110000)
  });
  if(!response.ok){
   console.warn("[vmv-elevenlabs] upstream status",response.status);
   return reply({error:response.status===401||response.status===403?"elevenlabs_key_rejected":
    response.status===402?"elevenlabs_credits_required":
    response.status===429?"elevenlabs_rate_limited":"elevenlabs_generation_failed"},response.status===429?429:502);
  }
  const data=await response.json().catch(()=>null);
  const audio=typeof data?.audio_base64==="string"?data.audio_base64:"";
  if(!audio||audio.length>11000000||!validAlignment(data?.alignment))
   return reply({error:"elevenlabs_invalid_response"},502);
  const alignment=data.alignment as Alignment;
  const duration=alignment.character_end_times_seconds.at(-1)||0;
  if(duration<10||duration>100)return reply({error:"elevenlabs_invalid_duration"},502);
  return reply({audio,mediaType:"audio/mpeg",alignment,duration});
 }catch(e){
  console.warn("[vmv-elevenlabs] request failure",e instanceof Error?e.name:"unknown");
  return reply({error:"elevenlabs_unavailable"},503);
 }
}
