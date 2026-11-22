import {NextRequest,NextResponse} from "next/server";
import {generateSpeech} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const reply=(error:string,status:number)=>NextResponse.json({error},{status,headers:videoHeaders});

export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply("video_not_enabled_for_account",403);
 const length=Number(req.headers.get("content-length")||0);
 if(length>16000)return reply("voice_request_too_large",413);
 const body=await req.json().catch(()=>null);
 const scenes=body?.scenes;
 if(body?.confirmCost!==true||!Array.isArray(scenes)||scenes.length<3||scenes.length>12||
  scenes.some((s:unknown)=>typeof s!=="string"||s.trim().length<12||s.length>220))
  return reply("invalid_voice_request",400);
 // Shared persistent video-test quota, rather than per-process in-memory throttling.
 const {data:granted,error:claimError}=await videoDb().rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(claimError)return reply("voice_quota_unavailable",503);
 if(granted!==true)return reply("voice_limit",429);
 try{
  const outputs:Array<{audio:string;mediaType:string}>=[];
  // Throttle TTS concurrency to avoid bursts and uncontrolled cost.
  for(let i=0;i<scenes.length;i+=3){
   const chunk=await Promise.all(scenes.slice(i,i+3).map(async (speech:string)=>{
    const output=await generateSpeech({
     model:gateway.speechModel("openai/tts-1"),
     text:speech.trim(),voice:body?.voice==="nova"?"nova":"alloy",
     abortSignal:AbortSignal.timeout(65000)
    });
    const bytes=Buffer.from(output.audio.uint8Array);
    if(bytes.length<1000||bytes.length>1200000)throw Error("bad_voice");
    return {audio:bytes.toString("base64"),mediaType:output.audio.mediaType||"audio/mpeg"};
   }));
   outputs.push(...chunk);
  }
  return NextResponse.json({scenes:outputs},{headers:videoHeaders});
 }catch{return reply("voice_unavailable",503);}
}