import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {validPilotLanguage,PILOT_VOICES} from "@/lib/vmv-pilot-voice-config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;

type ExternalVoice={
 voice_id?:string;name?:string;description?:string;preview_url?:string;
 labels?:Record<string,string>
};
type CatalogVoice={
 id:string;name:string;provider:"elevenlabs";previewUrl:string;
 gender:"male"|"female"|"unknown";accent:string;description:string
};

/**
 * Read-only catalog. Only voices returned by the authenticated ElevenLabs
 * account are selectable. Samples never consume Video Studio credits.
 */
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"authentication_required"},{status:401,headers:{"Cache-Control":"no-store"}});
 const language=req.nextUrl.searchParams.get("language");
 if(!validPilotLanguage(language))
  return NextResponse.json({error:"invalid_language"},{status:400,headers:{"Cache-Control":"no-store"}});
 const responseData:{
  standard:typeof PILOT_VOICES;elevenlabs:CatalogVoice[];elevenlabsAvailable:boolean
 }={standard:PILOT_VOICES,elevenlabs:[],elevenlabsAvailable:false};
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(key){
  try{
   const seen=new Set<string>();
   let nextPageToken:string|null=null;
   // Bound provider calls and catalog size; the UI paginates locally.
   for(let page=0;page<2&&responseData.elevenlabs.length<120;page++){
    const params=new URLSearchParams({language,page_size:"100"});
    if(nextPageToken)params.set("next_page_token",nextPageToken);
    const response=await fetch("https://api.elevenlabs.io/v2/voices?"+params,{
     cache:"no-store",headers:{"xi-api-key":key,Accept:"application/json"},
     signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)break;
    const data=await response.json() as {
     voices?:ExternalVoice[];has_more?:boolean;next_page_token?:string|null
    };
    if(!Array.isArray(data.voices))break;
    for(const v of data.voices){
     if(!v||typeof v.voice_id!=="string"||!/^[A-Za-z0-9]{15,32}$/.test(v.voice_id)||
      typeof v.name!=="string"||!v.name.trim()||seen.has(v.voice_id))continue;
     seen.add(v.voice_id);
     const gender=v.labels?.gender?.toLowerCase();
     responseData.elevenlabs.push({
      id:v.voice_id,name:v.name.trim().slice(0,60),provider:"elevenlabs",
      gender:gender==="male"?"male":gender==="female"?"female":"unknown",
      accent:typeof v.labels?.accent==="string"?v.labels.accent.slice(0,60):"",
      description:typeof v.description==="string"?v.description.slice(0,140):"",
      previewUrl:typeof v.preview_url==="string"&&v.preview_url.startsWith("https://")?v.preview_url:""
     });
     if(responseData.elevenlabs.length>=120)break;
    }
    if(data.has_more!==true||typeof data.next_page_token!=="string"||
     !data.next_page_token||data.next_page_token===nextPageToken)break;
    nextPageToken=data.next_page_token;
   }
   responseData.elevenlabsAvailable=responseData.elevenlabs.length>0;
  }catch{/* Available voices already loaded remain visible if a later page fails. */}
 }
 return NextResponse.json(responseData,{headers:{"Cache-Control":"no-store"}});
}
