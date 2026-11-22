"use client";
import {useEffect,useRef,useState} from "react";
import {Mic2,Volume2,VolumeX,LoaderCircle,Play} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {PILOT_VOICES,type PilotVoiceProvider,type PilotLanguage} from "@/lib/vmv-pilot-voice-config";
import css from "./PilotVoiceStep.module.css";
type Voice={id:string;name:string;provider:"openai"|"elevenlabs";previewUrl?:string};
type Props={language:PilotLanguage;en:boolean;onChoose:(provider:PilotVoiceProvider,id:string,name:string)=>void};
export default function PilotVoiceStep({language,en,onChoose}:Props){
 const [voices,setVoices]=useState<Voice[]>([]);
 const [loading,setLoading]=useState(true);
 const playing=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{
  let alive=true;setLoading(true);setVoices([]);
  void(async()=>{
   try{
    const sb=getSupabase();
    const session=await sb?.auth.getSession();
    const access=session?.data.session?.access_token;
    if(!access)return;
    const r=await fetch("/api/video-generator/pilot-voices?language="+encodeURIComponent(language),{
     cache:"no-store",headers:{Authorization:"Bearer "+access}});
    const data=await r.json();
    if(r.ok&&alive&&Array.isArray(data.elevenlabs))setVoices(data.elevenlabs.slice(0,3));
   }catch{/* Standard multilingual voices remain selectable. */}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;playing.current?.pause();};
 },[language]);
 const play=(src:string)=>{
  if(playing.current){playing.current.pause();playing.current=null;}
  const audio=new Audio(src);playing.current=audio;void audio.play().catch(()=>{});
 };
 const displayed:Voice[]=[...voices,...PILOT_VOICES.slice(0,2)];
 return <div className={css.root}>
  <div className={css.grid}>{displayed.map(v=><div key={v.provider+"-"+v.id} className={css.card}>
   <button type="button" className={css.select} onClick={()=>onChoose(v.provider,v.id,v.name)}>
    <Volume2 size={22}/><strong>{v.name}</strong><small>{v.provider==="elevenlabs"?"ElevenLabs":"Estándar"}</small>
   </button>
   {v.previewUrl?<button type="button" className={css.preview} aria-label={(en?"Listen to ":"Escuchar ")+v.name}
     onClick={()=>play(v.previewUrl!)}><Play size={15}/></button>:null}
  </div>)}
   <button type="button" className={css.none} onClick={()=>onChoose("none","none",en?"No voice":"Sin voz")}>
    <VolumeX size={22}/><strong>{en?"No voice":"Sin voz"}</strong>
   </button>
  </div>
  {loading?<div className={css.loading}><LoaderCircle size={14} className={css.spin}/></div>:null}
 </div>;
}