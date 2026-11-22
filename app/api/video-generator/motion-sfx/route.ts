import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:videoHeaders});
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 return reply({configured:Boolean(process.env.ELEVENLABS_API_KEY),
  model:"eleven_text_to_sound_v3"});
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 if(Number(req.headers.get("content-length")||0)>6500)
  return reply({error:"sfx_request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const slot=body?.slot,duration=body?.durationSeconds;
 const topic=typeof body?.topic==="string"?body.topic.trim():"";
 const scenes=body?.scenes;
 if(body?.confirmCost!==true)return reply({error:"cost_confirmation_required"},400);
 if(!Number.isInteger(slot)||slot<0||slot>5||
  ![5,10].includes(duration)||topic.length<8||topic.length>2000||
  !Array.isArray(scenes)||scenes.length!==2||
  scenes.some((s:unknown)=>typeof s!=="string"||s.trim().length<18||s.length>650))
  return reply({error:"invalid_sfx_request"},400);
 const key=process.env.ELEVENLABS_API_KEY;
 if(!key)return reply({error:"sfx_not_configured"},503);
 const sfxPrompt=[
  "Clean studio-quality, extremely satisfying soft liquid ASMR Foley sound design.",
  "The scene is "+topic.slice(0,360)+".",
  "First action: "+scenes[0].trim().slice(0,440)+".",
  "Then a second distinct action: "+scenes[1].trim().slice(0,440)+".",
  "Sound of soft glossy spheres blending, gentle squishes, crisp pops, deep rounded bubbles,",
  "subtle smooth whooshes and soft viscous stretching. Keep the sequence continuous.",
  "Very close, detailed stereo recording, soothing, low harshness and no clipping.",
  "Absolutely no speech, no narration, no vocals, no music, no background ambience."
 ].join(" ");
 try{
  const upstream=await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json","xi-api-key":key,Accept:"audio/mpeg"},
   body:JSON.stringify({text:sfxPrompt,model_id:"eleven_text_to_sound_v3",
    duration_seconds:duration,prompt_influence:0.65}),
   signal:AbortSignal.timeout(55000)
  });
  if(!upstream.ok){
   const status=upstream.status;
   console.warn("[vmv-motion-sfx]",{slot,status});
   return reply({error:status===401?"sfx_invalid_key":
    status===402?"sfx_credits_required":
    status===403?"sfx_access_denied":
    status===429?"sfx_rate_limited":"sfx_generation_failed",
    upstreamStatus:status},status===429?429:502);
  }
  const data=Buffer.from(await upstream.arrayBuffer());
  if(data.length<1500||data.length>2400000)
   return reply({error:"sfx_invalid_audio"},502);
  return reply({audio:data.toString("base64"),slot,durationSeconds:duration,
   mediaType:"audio/mpeg"});
 }catch{
  return reply({error:"sfx_generation_unavailable"},503);
 }
}