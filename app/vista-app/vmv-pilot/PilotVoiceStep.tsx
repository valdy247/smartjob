"use client";
import {useEffect,useRef,useState} from "react";
import {Volume2,VolumeX,LoaderCircle,Play,Pause} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {PILOT_VOICES,type PilotVoiceProvider,type PilotLanguage} from "@/lib/vmv-pilot-voice-config";
import css from "./PilotVoiceStep.module.css";
type Voice={id:string;name:string;provider:"openai"|"elevenlabs";
 gender?:"male"|"female"|"unknown";previewUrl?:string};
type Props={language:PilotLanguage;en:boolean;disabled?:boolean;
 catalogEndpoint?:string;sampleMode?:"paid"|"prerecorded";
 selectedProvider?:"openai"|"elevenlabs";selectedVoiceId?:string;
 onChoose:(provider:PilotVoiceProvider,id:string,name:string)=>void};
export default function PilotVoiceStep({language,en,disabled=false,selectedProvider,selectedVoiceId,onChoose,
 catalogEndpoint="/api/video-generator/pilot-voices",sampleMode="paid"}:Props){
 const [voices,setVoices]=useState<Voice[]>([]);
 const [loading,setLoading]=useState(true),[loadingId,setLoadingId]=useState("");
 const [playingId,setPlayingId]=useState(""),[error,setError]=useState("");
 const [genderFilter,setGenderFilter]=useState<"male"|"all">("all");
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
    const r=await fetch(catalogEndpoint+"?language="+encodeURIComponent(language),{
     cache:"no-store",headers:{Authorization:"Bearer "+access}});
    const data=await r.json();
    if(r.ok&&alive&&Array.isArray(data.elevenlabs))
     setVoices(data.elevenlabs.slice(0,40));
   }catch{/* Standard narrator voices are still available. */}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;playToken.current++;controller.current?.abort();playing.current?.pause();
   cache.current.forEach(src=>URL.revokeObjectURL(src));cache.current.clear();};
 },[language,catalogEndpoint]);
 const play=async(v:Voice)=>{
  const key=language+":"+v.provider+":"+v.id;
  if(playingId===key){stop();return;}
  const seq=++playToken.current;
  controller.current?.abort();
  stop();setError("");
  // ElevenLabs provides a public voice sample URL: listening does not call TTS.
  // OpenAI samples are generated only after the user explicitly taps Escuchar.
  let url=v.provider==="elevenlabs"&&v.previewUrl?.startsWith("https://")?
   v.previewUrl:cache.current.get(key);
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
 const allVoices:Voice[]=[...voices,...PILOT_VOICES];
 const displayed=genderFilter==="male"?
  allVoices.filter(v=>v.gender==="male"||
   (v.provider==="openai"&&["onyx","echo"].includes(v.id))):allVoices;
 return <div className={css.root}>
  <div className={css.filters} role="group" aria-label={en?"Filter voices":"Filtrar voces"}>
   <button type="button" className={genderFilter==="male"?css.active:""}
    aria-pressed={genderFilter==="male"} onClick={()=>setGenderFilter("male")}>
    {en?"Male / deep voices":"Masculinas / graves"}
   </button>
   <button type="button" className={genderFilter==="all"?css.active:""}
    aria-pressed={genderFilter==="all"} onClick={()=>setGenderFilter("all")}>
    {en?"All voices":"Todas las voces"}
   </button>
  </div>
  <div className={css.grid}>{displayed.map(v=>{
   const key=language+":"+v.provider+":"+v.id;
   const selected=selectedProvider===v.provider&&selectedVoiceId===v.id;
   const canPreview=sampleMode==="paid"||(v.provider==="elevenlabs"&&Boolean(v.previewUrl?.startsWith("https://")));
   return <div key={key} className={selected?css.cardSelected:css.card}>
    <button type="button" className={css.select}
     aria-pressed={selected} disabled={disabled}
     onClick={()=>{stop();onChoose(v.provider,v.id,v.name);}}>
     <Volume2 size={22}/><strong>{v.name}</strong>
     <small>{v.provider==="elevenlabs"?"ElevenLabs":
       ["onyx","echo"].includes(v.id)?(en?"OpenAI · deep voice":"OpenAI · voz grave"):
       "OpenAI · estándar"}
      {v.gender==="male"?(en?" · Male":" · Masculina"):
       v.gender==="female"?(en?" · Female":" · Femenina"):""}</small>
     {selected?<span className={css.selectedLabel}>{en?"Selected":"Seleccionada"}</span>:null}
    </button>
    <button type="button" className={css.preview} disabled={disabled||Boolean(loadingId)||!canPreview}
     aria-label={(playingId===key?(en?"Pause ":"Pausar "):(en?"Listen to ":"Escuchar "))+v.name}
     title={!canPreview?(en?"Sample not enabled yet":"Muestra no disponible todavía"):(en?"Listen":"Escuchar")} onClick={()=>void play(v)}>
     {loadingId===key?<LoaderCircle size={16} className={css.spin}/>:
      playingId===key?<Pause size={15}/>:<Play size={15}/>}
     <span>{loadingId===key?(en?"Loading":"Cargando"):
      playingId===key?(en?"Pause":"Pausar"):(en?"Listen":"Escuchar")}</span>
    </button>
   </div>;
  })}
   <button type="button" className={css.none} disabled={disabled}
    onClick={()=>{stop();onChoose("none","none",en?"No voice":"Sin voz");}}>
    <VolumeX size={22}/><strong>{en?"No voice":"Sin voz"}</strong>
   </button>
  </div>
  {loading?<div className={css.loading}><LoaderCircle size={14} className={css.spin}/></div>:null}
  {error?<p role="status" className={css.error}>{error}</p>:null}
  <p className={css.disclaimer}>
   {sampleMode==="prerecorded"
    ?(en?"ElevenLabs prerecorded samples are free to play. OpenAI voice selection is available; paid samples will be enabled after the credit system is tested.":"Las muestras pregrabadas de ElevenLabs se pueden escuchar gratis. Puedes elegir voces de OpenAI; activaremos sus muestras de pago después de probar el sistema de créditos.")
    :(en?"Listen before selecting. ElevenLabs samples are prerecorded. OpenAI voice previews are generated only when you press Listen and may use a few credits.":"Escucha antes de elegir. Las muestras de ElevenLabs son grabaciones existentes. Las de OpenAI se generan solo al pulsar Escuchar y pueden consumir algunos créditos.")}
  </p>
 </div>;
}