import {NextRequest,NextResponse} from "next/server";
import {generateSpeech} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=80;
const reply=(error:string,status:number)=>
 NextResponse.json({error},{status,headers:videoHeaders});
const calls=new Map<string,{count:number;until:number}>();

export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply("video_not_enabled_for_account",403);
 const body=await req.json().catch(()=>null);
 const text=typeof body?.text==="string"?body.text.trim():"";
 const voice=body?.voice==="nova"?"nova":"alloy";
 if(!body?.confirmCost||text.length<12||text.length>1500)
  return reply("invalid_voice_request",400);
 const previous=calls.get(owner),now=Date.now();
 if(previous&&previous.until>now&&previous.count>=8)
  return reply("voice_limit",429);
 calls.set(owner,{count:previous&&previous.until>now?previous.count+1:1,
  until:previous&&previous.until>now?previous.until:now+3600000});
 try{
  const speech=await generateSpeech({
   model:gateway.speechModel("openai/tts-1"),
   text,voice,
   abortSignal:AbortSignal.timeout(65000)
  });
  const bytes=speech.audio.uint8Array;
  if(bytes.length<1024||bytes.length>6*1024*1024)return reply("voice_unavailable",502);
  return new NextResponse(new Uint8Array(bytes),{
   headers:{...videoHeaders,"Content-Type":speech.audio.mediaType||"audio/mpeg",
    "Content-Disposition":"inline; filename=vmv-narration.mp3"}
  });
 }catch{return reply("voice_unavailable",503);}
}
