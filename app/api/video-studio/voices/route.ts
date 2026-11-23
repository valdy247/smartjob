import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {validPilotLanguage,PILOT_VOICES} from "@/lib/vmv-pilot-voice-config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;

type ExternalVoice={voice_id?:string;name?:string;preview_url?:string;labels?:Record<string,string>};

/**
 * Read-only catalog for V1. A logged-in owner may browse available voices
 * without enabling paid video-generation flags or consuming synthesis credits.
 * Synthesis remains behind its separate authorization and budget gates.
 */
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"authentication_required"},{status:401,headers:{"Cache-Control":"no-store"}});
 const language=req.nextUrl.searchParams.get("language");
 if(!validPilotLanguage(language))
  return NextResponse.json({error:"invalid_language"},{status:400,headers:{"Cache-Control":"no-store"}});
 const responseData:{
  standard:typeof PILOT_VOICES;
  elevenlabs:{id:string;name:string;provider:"elevenlabs";previewUrl:string;gender:"male"|"female"|"unknown"}[];
  elevenlabsAvailable:boolean;
 }={standard:PILOT_VOICES,elevenlabs:[],elevenlabsAvailable:false};
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(key){
  try{
   const params=new URLSearchParams({language,page_size:"40"});
   const response=await fetch("https://api.elevenlabs.io/v2/voices?"+params,{
    cache:"no-store",headers:{"xi-api-key":key,Accept:"application/json"},
    signal:AbortSignal.timeout(10000)
   });
   if(response.ok){
    const data=await response.json() as {voices?:ExternalVoice[]};
    const voices=(data.voices||[]).filter(v=>v&&typeof v.voice_id==="string"&&
     /^[a-zA-Z0-9]{15,32}$/.test(v.voice_id)&&typeof v.name==="string"&&v.name.length>0);
    responseData.elevenlabs=voices.slice(0,40).map(v=>({
     id:v.voice_id!,name:v.name!.slice(0,60),provider:"elevenlabs",
     gender:v.labels?.gender?.toLowerCase()==="male"?"male":
      v.labels?.gender?.toLowerCase()==="female"?"female":"unknown",
     previewUrl:typeof v.preview_url==="string"&&v.preview_url.startsWith("https://")?v.preview_url:""
    }));
    responseData.elevenlabsAvailable=responseData.elevenlabs.length>0;
   }
  }catch{/* Public OpenAI list remains available if external catalog is unreachable. */}
 }
 return NextResponse.json(responseData,{headers:{"Cache-Control":"no-store"}});
}
