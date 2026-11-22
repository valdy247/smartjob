"use client";
import {useEffect,useRef,useState} from "react";
import {Volume2,VolumeX,LoaderCircle,Play,Pause} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {PILOT_VOICES,type PilotVoiceProvider,type PilotLanguage} from "@/lib/vmv-pilot-voice-config";
import css from "./PilotVoiceStep.module.css";
type Voice={id:string;name:string;provider:"openai"|"elevenlabs"};
type Props={language:PilotLanguage;en:boolean;onChoose:(provider:PilotVoiceProvider,id:string,name:string)=>void};
export default function PilotVoiceStep({language,en,onChoose}:Props){
 const [voices,setVoices]=useState<Voice[]>([]);
 const [loading,setLoading]=useState(true),[loadingId,setLoadingId]=useState("");
 const [playingId,setPlayingId]=useState(""),[error,setError]=useState("");
 const playing=useRef<HTMLAudioElement|null>(null);
 const controller=useRef<AbortController|null>(null);
 const cache=useRef<Map<string,string>>(new Map());
 const playToken=useRef(0);
 const stop=()=>{
  playing.current?.pause();
  playing.current=null;
  setPlayingId("");
 };
 useEffect(()=>{
  let alive=true;setLoading(true);setVoices([]);setError("");
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
   }catch{/* Standard narrator voices are still available. */}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;playToken.current++;controller.current?.abort();playing.current?.pause();
   cache.current.forEach(src=>URL.revokeObjectURL(src));cache.current.clear();};
 },[language]);
 const play=async(v:Voice)=>{
  const key=language+":"+v.provider+":"+v.id;
  if(playingId===key){stop();return;}
  const seq=++playToken.current;
  controller.current?.abort();
  stop();setError("");
  let url=cache.current.get(key);
  if(!url){
   setLoadingId(key);
   const abort=new AbortController();controller.current=abort;
   try{
    const sb=getSupabase(),session=await sb?.auth.getSession();
    const access=session?.data.session?.access_token;
    if(!access)throw Error("login");
    const r=await fetch("/api/video-generator/pilot-voice-preview",{
     method:"POST",signal:abort.signal,cache:"no-store",
     headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},
     body:JSON.stringify({language,provider:v.provider,voiceId:v.id})
    });
    if(!r.ok){
     const data=await r.json().catch(()=>null);
     throw Error(typeof data?.error==="string"?data.error:"voice_preview_unavailable");
    }
    const blob=await r.blob();
    if(blob.type!=="audio/mpeg"||blob.size<1000||blob.size>900000)
     throw Error("voice_preview_unavailable");
    if(seq!==playToken.current)return;
    url=URL.createObjectURL(blob);
    cache.current.set(key,url);
   }catch(e){
    if(seq!==playToken.current||abort.signal.aborted)return;
    const code=e instanceof Error?e.message:"voice_preview_unavailable";
    setError(code==="voice_preview_limit"
     ?(en?"Daily preview limit reached.":"Límite diario de muestras alcanzado.")
     :code==="login"?(en?"Sign in again.":"Inicia sesión de nuevo.")
     :(en?"Could not play the sample. Try again.":"No se pudo reproducir. Inténtalo otra vez."));
    return;
   }finally{if(seq===playToken.current)setLoadingId("");}
  }
  if(seq!==playToken.current||!url)return;
  const audio=new Audio(url);
  playing.current=audio;
  audio.onended=()=>{if(playing.current===audio){playing.current=null;setPlayingId("");}};
  audio.onerror=()=>{if(playing.current===audio){playing.current=null;setPlayingId("");setError(en?"Playback failed.":"Error al reproducir.");}};
  try{
   await audio.play();
   if(seq===playToken.current)setPlayingId(key);
  }catch{
   if(seq===playToken.current){
    // Some mobile browsers block playback after a network fetch. The cached
    // sample can be played by tapping this same button again.
    playing.current=null;setPlayingId("");
    setError(en?"Sample ready. Tap play again.":"Muestra lista. Toca reproducir otra vez.");
   }
  }
 };
 const displayed:Voice[]=[...voices,...PILOT_VOICES.slice(0,2)];
 return <div className={css.root}>
  <div className={css.grid}>{displayed.map(v=>{
   const key=language+":"+v.provider+":"+v.id;
   return <div key={key} className={css.card}>
    <button type="button" className={css.select} onClick={()=>{stop();onChoose(v.provider,v.id,v.name);}}>
     <Volume2 size={22}/><strong>{v.name}</strong>
     <small>{v.provider==="elevenlabs"?"ElevenLabs":en?"Standard":"Estándar"}</small>
    </button>
    <button type="button" className={css.preview} disabled={Boolean(loadingId)}
     aria-label={(playingId===key?(en?"Pause ":"Pausar "):(en?"Listen to ":"Escuchar "))+v.name}
     title={en?"Listen":"Escuchar"} onClick={()=>void play(v)}>
     {loadingId===key?<LoaderCircle size={16} className={css.spin}/>:
      playingId===key?<Pause size={15}/>:<Play size={15}/>}
    </button>
   </div>;
  })}
   <button type="button" className={css.none} onClick={()=>{stop();onChoose("none","none",en?"No voice":"Sin voz");}}>
    <VolumeX size={22}/><strong>{en?"No voice":"Sin voz"}</strong>
   </button>
  </div>
  {loading?<div className={css.loading}><LoaderCircle size={14} className={css.spin}/></div>:null}
  {error?<p role="status" className={css.error}>{error}</p>:null}
 </div>;
}