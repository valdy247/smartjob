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
function providerFailure(detail:unknown,status:number){
 const body=(detail&&typeof detail==="object"?detail:{}) as Record<string,unknown>;
 const nested=(body.detail&&typeof body.detail==="object"?body.detail:{}) as Record<string,unknown>;
 const raw=typeof nested.status==="string"?nested.status:
  typeof nested.code==="string"?nested.code:
  typeof nested.error==="string"?nested.error:
  typeof body.error==="string"?body.error:"";
 const code=/^[a-z0-9_-]{1,70}$/i.test(raw)?raw:"unknown";
 const invalidKey=["invalid_api_key","missing_api_key","invalid_key"].includes(code);
 const voiceMissing=["voice_not_found","invalid_voice_id","voice_id_not_found"].includes(code);
 const credits=["quota_exceeded","insufficient_credits","not_enough_credits"].includes(code);
 const access=["model_access_denied","permission_denied","feature_not_available"].includes(code);
 const error=invalidKey||status===401?"elevenlabs_key_rejected":
  voiceMissing||status===404?"elevenlabs_voice_unavailable":
  credits||status===402?"elevenlabs_credits_required":
  access||status===403?"elevenlabs_access_denied":
  status===429?"elevenlabs_rate_limited":"elevenlabs_generation_failed";
 return {error,providerCode:code,upstreamStatus:status};
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const key=process.env.ELEVENLABS_API_KEY;
 if(!key)return reply({configured:false,error:"elevenlabs_not_configured_in_preview"},503);
 const voiceId=process.env.ELEVENLABS_VOICE_ID||"21m00Tcm4TlvDq8ikWAM";
 if(!/^[a-zA-Z0-9]{20}$/.test(voiceId))return reply({configured:false,error:"elevenlabs_voice_not_configured"},503);
 try{
  const check=await fetch("https://api.elevenlabs.io/v1/voices/"+voiceId,{
   method:"GET",cache:"no-store",headers:{"xi-api-key":key},signal:AbortSignal.timeout(12000)
  });
  if(!check.ok){
   const detail=await check.json().catch(()=>null);
   const failure=providerFailure(detail,check.status);
   console.warn("[vmv-elevenlabs] voice preflight failure",failure);
   return reply({configured:false,...failure},503);
  }
  return reply({configured:true});
 }catch{
  return reply({configured:false,error:"elevenlabs_voice_check_failed"},503);
 }
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
   const detail=await response.json().catch(()=>null);
   const failure=providerFailure(detail,response.status);
   console.warn("[vmv-elevenlabs] TTS failure",failure);
   return reply(failure,response.status===429?429:502);
  }
  const data=await response.json().catch(()=>null);
  const audio=typeof data?.audio_base64==="string"?data.audio_base64:"";
  if(!audio||audio.length>11000000||!validAlignment(data?.alignment))
   return reply({error:"elevenlabs_invalid_response"},502);
  const alignment=data.alignment as Alignment;
  const duration=alignment.character_end_times_seconds.at(-1)||0;
  if(duration<10||duration>100)return reply({error:"elevenlabs_invalid_duration"},502);
  // Translate the original twelve script segments into real spoken-time boundaries.
  const spoken=segments.map((s:string)=>s.trim());
  let position=0;
  const sceneEnds=spoken.map((segment:string,i:number)=>{
   position+=segment.length;
   const offset=Math.min(position-1,alignment.character_end_times_seconds.length-1);
   const time=alignment.character_end_times_seconds[offset]??0;
   if(i<spoken.length-1)position++;
   return time;
  });
  const aligned=alignment.characters.length>=text.length*0.9&&
   sceneEnds.every((time:number,i:number)=>Number.isFinite(time)&&time>0&&
    (i===0||time>sceneEnds[i-1]))&&
   Math.abs(sceneEnds[11]-duration)<1.5;
  return reply({audio,mediaType:"audio/mpeg",alignment,duration,
   sceneEnds:aligned?sceneEnds:null});
 }catch(e){
  console.warn("[vmv-elevenlabs] request failure",e instanceof Error?e.name:"unknown");
  return reply({error:"elevenlabs_unavailable"},503);
 }
}
