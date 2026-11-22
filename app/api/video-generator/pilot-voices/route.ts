import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";
import {validPilotLanguage,PILOT_VOICES} from "@/lib/vmv-pilot-voice-config";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
type ExternalVoice={voice_id?:string;name?:string;preview_url?:string;labels?:Record<string,string>};
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))
  return NextResponse.json({error:"video_not_enabled_for_account"},{status:403,headers:videoHeaders});
 const language=req.nextUrl.searchParams.get("language");
 if(!validPilotLanguage(language))
  return NextResponse.json({error:"invalid_language"},{status:400,headers:videoHeaders});
 const result:{standard:typeof PILOT_VOICES;elevenlabs:Array<{id:string;name:string;provider:"elevenlabs";previewUrl:string}>;elevenlabsAvailable:boolean}={
  standard:PILOT_VOICES,elevenlabs:[],elevenlabsAvailable:false
 };
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(key){
  try{
   const params=new URLSearchParams({language,page_size:"20"});
   const response=await fetch("https://api.elevenlabs.io/v2/voices?"+params,{
    cache:"no-store",headers:{"xi-api-key":key,Accept:"application/json"},
    signal:AbortSignal.timeout(10000)
   });
   if(response.ok){
    const data=await response.json() as {voices?:ExternalVoice[]};
    const voices=(data.voices||[]).filter(v=>v&&
     typeof v.voice_id==="string"&&/^[a-zA-Z0-9]{15,32}$/.test(v.voice_id)&&
     typeof v.name==="string"&&v.name.length>0
     &&(!v.labels?.language||v.labels.language===language));
    result.elevenlabs=voices.slice(0,6).map(v=>({
     id:v.voice_id!,name:v.name!.slice(0,60),provider:"elevenlabs",
     previewUrl:typeof v.preview_url==="string"&&v.preview_url.startsWith("https://")?v.preview_url:""
    }));
    result.elevenlabsAvailable=result.elevenlabs.length>0;
   }
  }catch{/* When ElevenLabs fails, keep standard multilingual voices available. */}
 }
 return NextResponse.json(result,{headers:videoHeaders});
}