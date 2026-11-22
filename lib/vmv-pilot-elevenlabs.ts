import {type PilotLanguage} from "@/lib/vmv-pilot-voice-config";
export async function verifyElevenLabsVoice(voiceId:string,language:PilotLanguage):Promise<boolean>{
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(!key||!/^[A-Za-z0-9]{15,32}$/.test(voiceId))return false;
 try{
  const params=new URLSearchParams({language,voice_ids:voiceId,page_size:"20"});
  const response=await fetch("https://api.elevenlabs.io/v2/voices?"+params,{
   cache:"no-store",headers:{"xi-api-key":key,Accept:"application/json"},
   signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)return false;
  const data=await response.json() as {voices?:Array<{voice_id?:string;labels?:{language?:string}}>}
  return Array.isArray(data.voices)&&data.voices.some(v=>
   v.voice_id===voiceId&&(!v.labels?.language||v.labels.language===language));
 }catch{return false;}
}