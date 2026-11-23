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
 if(req.nextUrl.searchParams.get("scope")==="library"){
  const query=req.nextUrl.searchParams;
  const page=Number(query.get("page")||"0");
  const search=(query.get("search")||"").trim();
  const gender=query.get("gender")||"",age=query.get("age")||"";
  const accent=(query.get("accent")||"").trim();
  const useCase=query.get("use_case")||"";
  const quality=query.get("quality")!=="all";
  const useCases=new Set(["narrative_story","conversational","characters_animation","social_media",
   "entertainment_tv","advertisement","informative_educational"]);
  if(!Number.isInteger(page)||page<0||page>20||search.length>60||
   /[<>\\x00-\\x1f]/.test(search)||!["","male","female","neutral"].includes(gender)||
   !["","young","middle_aged","old"].includes(age)||
   accent.length>32||/[^a-zA-Z_ -]/.test(accent)||
   (useCase&&!useCases.has(useCase)))
   return NextResponse.json({error:"voice_library_invalid_filters"},{status:400});
  if(!key)return NextResponse.json({...responseData,library:[],libraryHasMore:false,
   libraryError:"voice_library_not_connected"},{headers:{"Cache-Control":"no-store"}});
  try{
   const params=new URLSearchParams({language,page:String(page),page_size:"24",
    sort:"trending",include_custom_rates:"false",include_live_moderated:"false"});
   if(quality)params.set("category","high_quality");
   if(search)params.set("search",search);
   if(gender)params.set("gender",gender);
   if(age)params.set("age",age);
   if(accent)params.set("accent",accent);
   if(useCase)params.append("use_cases",useCase);
   const response=await fetch("https://api.elevenlabs.io/v1/shared-voices?"+params,{
    cache:"no-store",headers:{"xi-api-key":key,Accept:"application/json"},
    signal:AbortSignal.timeout(12000)
   });
   if(!response.ok)return NextResponse.json({...responseData,library:[],libraryHasMore:false,
    libraryError:response.status===401||response.status===403?"voice_library_not_authorized":"voice_library_unavailable"},
    {headers:{"Cache-Control":"no-store"}});
   type SharedVoice={public_owner_id?:string;voice_id?:string;name?:string;description?:string;
    accent?:string;gender?:string;age?:string;use_case?:string;category?:string;
    preview_url?:string;rate?:number;verified_languages?:Array<{language?:string;preview_url?:string}>};
   const data=await response.json() as {voices?:SharedVoice[];has_more?:boolean;total_count?:number};
   const library=(Array.isArray(data.voices)?data.voices:[]).filter(v=>
    typeof v.voice_id==="string"&&/^[A-Za-z0-9]{15,32}$/.test(v.voice_id)&&
    typeof v.public_owner_id==="string"&&/^[A-Za-z0-9]{32,80}$/.test(v.public_owner_id)&&
    typeof v.name==="string"&&Boolean(v.name.trim())&&
    (typeof v.rate!=="number"||v.rate<=1)
   ).map(v=>{
    const preview=v.verified_languages?.find(t=>t.language===language)?.preview_url||v.preview_url;
    const g=String(v.gender||"").toLowerCase();
    return {id:v.voice_id!,name:v.name!.trim().slice(0,60),provider:"elevenlabs" as const,
     origin:"library" as const,publicOwnerId:v.public_owner_id!,
     previewUrl:typeof preview==="string"&&preview.startsWith("https://")?preview:"",
     description:String(v.description||"").slice(0,140),
     accent:String(v.accent||"").slice(0,60),age:String(v.age||"").slice(0,35),
     useCase:String(v.use_case||"").slice(0,60),quality:String(v.category||""),
     gender:g==="male"?"male":g==="female"?"female":"unknown"};
   });
   return NextResponse.json({...responseData,library,libraryHasMore:data.has_more===true,
    libraryTotal:Number.isFinite(data.total_count)?data.total_count:null},
    {headers:{"Cache-Control":"no-store"}});
  }catch{
   return NextResponse.json({...responseData,library:[],libraryHasMore:false,
    libraryError:"voice_library_unavailable"},{headers:{"Cache-Control":"no-store"}});
  }
 }
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
