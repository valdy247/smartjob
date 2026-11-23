import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {validPilotLanguage} from "@/lib/vmv-pilot-voice-config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});

/** A user explicitly selecting a public library voice authorizes saving it
 * to the studio's licensed ElevenLabs collection. No wallet charge occurs.
 * Provision BEFORE any Video Studio job/credit reservation.
 */
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV!=="preview")return fail("voice_library_not_enabled",503);
 const owner=await authenticatedUser(req);
 if(!owner)return fail("authentication_required",401);
 const body=await req.json().catch(()=>null);
 const voiceId=body?.voiceId,publicOwnerId=body?.publicOwnerId,language=body?.language;
 if(typeof voiceId!=="string"||!/^[A-Za-z0-9]{15,32}$/.test(voiceId)||
  typeof publicOwnerId!=="string"||!/^[A-Za-z0-9]{32,80}$/.test(publicOwnerId)||
  !validPilotLanguage(language))return fail("voice_library_invalid_selection",400);
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(!key)return fail("voice_library_not_connected",503);
 const headers={"xi-api-key":key,Accept:"application/json"};
 try{
  // A previously saved voice is ready to use without another mutation.
  const existing=await fetch("https://api.elevenlabs.io/v1/voices/"+encodeURIComponent(voiceId),{
   headers,cache:"no-store",signal:AbortSignal.timeout(9000)
  });
  if(existing.ok){
   const row=await existing.json().catch(()=>null);
   if(row?.voice_id===voiceId)return NextResponse.json({voiceId},
    {headers:{"Cache-Control":"no-store"}});
  }
  // Never import arbitrary caller-supplied voice IDs: resolve the verified
  // provider ownership and language in the live public catalog.
  const search=new URLSearchParams({search:voiceId,language,page_size:"30",page:"0",
   include_custom_rates:"false",include_live_moderated:"false"});
  const lookup=await fetch("https://api.elevenlabs.io/v1/shared-voices?"+search,{
   headers,cache:"no-store",signal:AbortSignal.timeout(11000)
  });
  if(!lookup.ok)return fail("voice_library_unavailable",502);
  const library=await lookup.json().catch(()=>null) as {
   voices?:Array<{voice_id?:string;public_owner_id?:string;name?:string;rate?:number;
    language?:string;verified_languages?:Array<{language?:string}>}>
  }|null;
  const selected=library?.voices?.find(v=>v.voice_id===voiceId&&v.public_owner_id===publicOwnerId);
  if(!selected||!selected.name||typeof selected.rate==="number"&&selected.rate>1||
   selected.language!==language&&!selected.verified_languages?.some(v=>v.language===language))
   return fail("voice_library_invalid_selection",400);
  const name=("VMV · "+selected.name).slice(0,75);
  const imported=await fetch("https://api.elevenlabs.io/v1/voices/add/"+
   encodeURIComponent(publicOwnerId)+"/"+encodeURIComponent(voiceId),{
   method:"POST",headers:{...headers,"Content-Type":"application/json"},
   body:JSON.stringify({new_name:name,bookmarked:true}),
   cache:"no-store",signal:AbortSignal.timeout(14000)
  });
  if(!imported.ok){
   return fail(imported.status===401||imported.status===403||imported.status===402?
    "voice_library_plan_required":"voice_library_activation_unavailable",503);
  }
  const result=await imported.json().catch(()=>null);
  if(typeof result?.voice_id!=="string"||!/^[A-Za-z0-9]{15,32}$/.test(result.voice_id))
   return fail("voice_library_activation_unavailable",502);
  return NextResponse.json({voiceId:result.voice_id},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("voice_library_activation_unavailable",503);}
}
