"use client";
import {useEffect,useRef,useState} from "react";
import {Volume2,VolumeX,LoaderCircle,Play,Pause,Search} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {PILOT_VOICES,type PilotVoiceProvider,type PilotLanguage} from "@/lib/vmv-pilot-voice-config";
import css from "./PilotVoiceStep.module.css";
type Voice={id:string;name:string;provider:"openai"|"elevenlabs";
 gender?:"male"|"female"|"unknown";accent?:string;description?:string;previewUrl?:string;
 age?:string;useCase?:string;quality?:string;origin?:"library";publicOwnerId?:string};
type Props={language:PilotLanguage;en:boolean;disabled?:boolean;
 catalogEndpoint?:string;previewEndpoint?:string;activationEndpoint?:string;
 libraryMode?:boolean;sampleMode?:"paid"|"prerecorded"|"limited";
 selectedProvider?:"openai"|"elevenlabs";selectedVoiceId?:string;
 onChoose:(provider:PilotVoiceProvider,id:string,name:string)=>void};
export default function PilotVoiceStep({language,en,disabled=false,selectedProvider,selectedVoiceId,onChoose,
 catalogEndpoint="/api/video-generator/pilot-voices",previewEndpoint="/api/video-generator/pilot-voice-preview",
 activationEndpoint="/api/video-studio/voice-activate",libraryMode=false,sampleMode="paid"}:Props){
 const [voices,setVoices]=useState<Voice[]>([]);
 const [libraryVoices,setLibraryVoices]=useState<Voice[]>([]);
 const [libraryPage,setLibraryPage]=useState(0),[libraryMore,setLibraryMore]=useState(false);
 const [libraryTotal,setLibraryTotal]=useState<number|null>(null);
 const [libraryLoading,setLibraryLoading]=useState(false),[libraryError,setLibraryError]=useState("");
 const [ageFilter,setAgeFilter]=useState(""),[useCaseFilter,setUseCaseFilter]=useState("");
 const [qualityFilter,setQualityFilter]=useState<"high_quality"|"all">("high_quality");
 const [loading,setLoading]=useState(true),[loadingId,setLoadingId]=useState("");
 const [playingId,setPlayingId]=useState(""),[error,setError]=useState("");
 const [genderFilter,setGenderFilter]=useState<"male"|"female"|"all">("all");
 const [providerFilter,setProviderFilter]=useState<"openai"|"elevenlabs"|"all">("all");
 const [search,setSearch]=useState("");
 const [accentFilter,setAccentFilter]=useState("");
 const [visibleCount,setVisibleCount]=useState(24);
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
  let alive=true;setLoading(true);setVoices([]);setError("");setAccentFilter("");setVisibleCount(24);
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
     setVoices(data.elevenlabs.slice(0,120));
   }catch{/* Standard narrator voices are still available. */}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;playToken.current++;controller.current?.abort();playing.current?.pause();
   cache.current.forEach(src=>URL.revokeObjectURL(src));cache.current.clear();};
 },[language,catalogEndpoint]);
 useEffect(()=>{
  if(!libraryMode)return;
  setLibraryVoices([]);setLibraryPage(0);setVisibleCount(24);setLibraryMore(false);
 },[libraryMode,language,search,genderFilter,ageFilter,accentFilter,useCaseFilter,qualityFilter]);
 useEffect(()=>{
  if(!libraryMode)return;
  let alive=true;
  const abort=new AbortController();
  const timer=setTimeout(()=>{void(async()=>{
   setLibraryLoading(true);setLibraryError("");
   try{
    const sb=getSupabase(),session=await sb?.auth.getSession();
    const access=session?.data.session?.access_token;
    if(!access)throw Error("authentication_required");
    const params=new URLSearchParams({language,scope:"library",page:String(libraryPage)});
    if(search.trim())params.set("search",search.trim());
    if(genderFilter!=="all")params.set("gender",genderFilter);
    if(ageFilter)params.set("age",ageFilter);
    if(accentFilter)params.set("accent",accentFilter);
    if(useCaseFilter)params.set("use_case",useCaseFilter);
    if(qualityFilter==="all")params.set("quality","all");
    const response=await fetch(catalogEndpoint+"?"+params,{
     headers:{Authorization:"Bearer "+access},cache:"no-store",signal:abort.signal
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error("voice_library_unavailable");
    if(!alive)return;
    const received=Array.isArray(data?.library)?data.library as Voice[]:[];
    setLibraryVoices(prev=>libraryPage===0?received:[
     ...prev,...received.filter(v=>!prev.some(p=>p.id===v.id))
    ]);
    setLibraryMore(data?.libraryHasMore===true);
    setLibraryTotal(typeof data?.libraryTotal==="number"?data.libraryTotal:null);
    if(data?.libraryError)setLibraryError(String(data.libraryError));
   }catch(e){
    if(!alive||abort.signal.aborted)return;
    setLibraryError(e instanceof Error?e.message:"voice_library_unavailable");
   }finally{if(alive)setLibraryLoading(false);}
  })();},search?320:0);
  return()=>{alive=false;clearTimeout(timer);abort.abort();};
 },[libraryMode,language,catalogEndpoint,libraryPage,search,genderFilter,ageFilter,accentFilter,useCaseFilter,qualityFilter]);
 const choose=async(v:Voice)=>{
  stop();setError("");
  if(!libraryMode||v.origin!=="library"){onChoose(v.provider,v.id,v.name);return;}
  if(!v.publicOwnerId){setError(en?"Voice is unavailable.":"Esta voz no está disponible.");return;}
  const key=language+":"+v.provider+":"+v.id;
  setLoadingId(key);
  try{
   const sb=getSupabase(),session=await sb?.auth.getSession();
   const access=session?.data.session?.access_token;
   if(!access)throw Error("authentication_required");
   const response=await fetch(activationEndpoint,{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},
    body:JSON.stringify({voiceId:v.id,publicOwnerId:v.publicOwnerId,language})
   });
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw Error(String(data?.error||"voice_library_activation_unavailable"));
   if(typeof data?.voiceId!=="string")throw Error("voice_library_activation_unavailable");
   onChoose("elevenlabs",data.voiceId,v.name);
  }catch(e){
   const code=e instanceof Error?e.message:"voice_library_activation_unavailable";
   setError(code==="voice_library_plan_required"?
    (en?"This voice requires an eligible ElevenLabs plan. Select another voice.":"Esta voz requiere un plan compatible de ElevenLabs. Selecciona otra.") :
    (en?"Couldn't activate this voice. No video credits were charged.":"No pudimos habilitar esta voz. No se descontaron créditos del video."));
  }finally{setLoadingId("");}
 };
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
    const r=await fetch(previewEndpoint,{
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
 const allVoices:Voice[]=[...PILOT_VOICES,...voices,...libraryVoices].filter((v,i,list)=>
  list.findIndex(other=>other.provider===v.provider&&other.id===v.id)===i);
 const accents=Array.from(new Set([...voices,...libraryVoices].map(v=>v.accent?.trim()).filter((v):v is string=>Boolean(v))))
  .sort((a,b)=>a.localeCompare(b));
 const term=search.trim().toLocaleLowerCase();
 const displayed=allVoices.filter(v=>{
  if(providerFilter!=="all"&&v.provider!==providerFilter)return false;
  if(genderFilter==="male"&&!(v.gender==="male"||
   (v.provider==="openai"&&["onyx","echo"].includes(v.id))))return false;
  if(genderFilter==="female"&&v.gender!=="female")return false;
  if(accentFilter&&v.accent!==accentFilter)return false;
  if(ageFilter&&v.age&&v.age!==ageFilter)return false;
  if(useCaseFilter&&v.useCase&&v.useCase!==useCaseFilter)return false;
  return !term||[v.name,v.provider,v.accent,v.description].filter(Boolean)
   .join(" ").toLocaleLowerCase().includes(term);
 });
 const visible=displayed.slice(0,visibleCount);
 return <div className={css.root}>
  <label className={css.searchWrap}>
   <Search size={18} aria-hidden="true"/>
   <input type="search" value={search} placeholder={en?"Search voices, accents or styles":"Buscar voces, acentos o estilos"}
    aria-label={en?"Search voices":"Buscar voces"}
    onChange={e=>{setSearch(e.target.value);setVisibleCount(24);}}/>
  </label>
  <div className={css.filters} role="group" aria-label={en?"Voice providers":"Proveedores de voz"}>
   {([{id:"all",label:en?"All providers":"Todas"},{id:"openai",label:"OpenAI"},{id:"elevenlabs",label:"ElevenLabs"}] as const).map(f=>
    <button type="button" key={f.id} className={providerFilter===f.id?css.active:""}
     aria-pressed={providerFilter===f.id} onClick={()=>{setProviderFilter(f.id);setVisibleCount(24);}}>{f.label}</button>)}
  </div>
  <div className={css.filters} role="group" aria-label={en?"Voice type":"Tipo de voz"}>
   {([{id:"all",label:en?"All voices":"Todas las voces"},{id:"male",label:en?"Male / deep":"Masculinas / graves"},
    {id:"female",label:en?"Female":"Femeninas"}] as const).map(f=>
    <button type="button" key={f.id} className={genderFilter===f.id?css.active:""}
     aria-pressed={genderFilter===f.id} onClick={()=>{setGenderFilter(f.id);setVisibleCount(24);}}>{f.label}</button>)}
  </div>
  {libraryMode?<label className={css.accentSelect}>
   <span>{en?"Accent":"Acento"}</span>
   <input type="search" list="vmv-voice-accents" maxLength={32} value={accentFilter}
    placeholder={en?"Any accent · e.g. mexican":"Cualquier acento · ej. mexican"}
    onChange={e=>{setAccentFilter(e.target.value);setVisibleCount(24);}}/>
   <datalist id="vmv-voice-accents">
    {accents.map(a=><option key={a} value={a}/>)}
   </datalist>
  </label>:accents.length>0?<label className={css.accentSelect}>
   <span>{en?"Accent":"Acento"}</span>
   <select value={accentFilter} onChange={e=>{setAccentFilter(e.target.value);setVisibleCount(24);}}>
    <option value="">{en?"All accents":"Todos los acentos"}</option>
    {accents.map(a=><option key={a} value={a}>{a}</option>)}
   </select>
  </label>:null}
  {libraryMode?<div className={css.libraryFilters}>
   <label>{en?"Quality":"Calidad"}<select value={qualityFilter} onChange={e=>setQualityFilter(e.target.value as "high_quality"|"all")}>
    <option value="high_quality">{en?"Studio quality":"Calidad de estudio"}</option>
    <option value="all">{en?"All available":"Todas las disponibles"}</option>
   </select></label>
   <label>{en?"Age":"Edad"}<select value={ageFilter} onChange={e=>setAgeFilter(e.target.value)}>
    <option value="">{en?"All":"Todas"}</option>
    <option value="young">{en?"Young":"Joven"}</option>
    <option value="middle_aged">{en?"Adult":"Adulta"}</option>
    <option value="old">{en?"Mature":"Madura"}</option>
   </select></label>
   <label>{en?"Style":"Uso"}<select value={useCaseFilter} onChange={e=>setUseCaseFilter(e.target.value)}>
    <option value="">{en?"All styles":"Todos"}</option>
    <option value="narrative_story">{en?"Narration":"Narración"}</option>
    <option value="social_media">{en?"Social media":"Redes sociales"}</option>
    <option value="conversational">{en?"Conversational":"Conversacional"}</option>
    <option value="advertisement">{en?"Advertising":"Publicidad"}</option>
    <option value="informative_educational">{en?"Educational":"Educativa"}</option>
    <option value="characters_animation">{en?"Characters":"Personajes"}</option>
   </select></label>
  </div>:null}
  <p className={css.count} role="status">{displayed.length} {en?"voices loaded":"voces cargadas"}
   {libraryMode&&libraryTotal!==null?" · "+libraryTotal+" "+(en?"in the library":"en la biblioteca"):""}
  </p>
  <div className={css.grid}>{visible.map(v=>{
   const key=language+":"+v.provider+":"+v.id;
   const selected=selectedProvider===v.provider&&selectedVoiceId===v.id;
   const hasPublicSample=v.provider==="elevenlabs"&&Boolean(v.previewUrl?.startsWith("https://"));
    const canPreview=sampleMode==="paid"||(sampleMode==="limited"&&v.provider==="openai")||hasPublicSample;
   return <div key={key} className={selected?css.cardSelected:css.card}>
    <button type="button" className={css.select}
     aria-pressed={selected} disabled={disabled}
     onClick={()=>void choose(v)}>
     {loadingId===key?<LoaderCircle size={22} className={css.spin}/>:<Volume2 size={22}/>}
     <strong>{v.name}</strong>
     <small>{v.provider==="elevenlabs"?"ElevenLabs":
       ["onyx","echo"].includes(v.id)?(en?"OpenAI · deep voice":"OpenAI · voz grave"):
       "OpenAI · estándar"}
      {v.gender==="male"?(en?" · Male":" · Masculina"):
       v.gender==="female"?(en?" · Female":" · Femenina"):""}</small>
     {v.accent?<small className={css.accent}>{v.accent}</small>:null}
     {v.origin==="library"?<small>{en?"Studio voice library":"Biblioteca de voces premium"}</small>:null}
     {v.description?<small className={css.voiceDescription} title={v.description}>{v.description}</small>:null}
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
  {displayed.length===0?<p className={css.empty}>{en?"No voices match these filters.":"No hay voces que coincidan con estos filtros."}</p>:null}
  {displayed.length>visible.length||libraryMode&&libraryMore?<button type="button" className={css.more}
   disabled={libraryLoading} onClick={()=>{
    if(displayed.length>visible.length)setVisibleCount(current=>current+24);
    else setLibraryPage(current=>current+1);
   }}>
   {libraryLoading?(en?"Loading voices…":"Cargando voces…"):(en?"Show more voices":"Mostrar más voces")}
  </button>:null}
  {libraryMode&&libraryLoading?<p className={css.count}>{en?"Searching high-quality voices…":"Buscando voces de alta calidad…"}</p>:null}
  {libraryMode&&libraryError?<p className={css.error}>{en?"The public voice library is temporarily unavailable. Saved and OpenAI voices remain selectable.":"La biblioteca pública no está disponible en este momento. Puedes elegir las voces guardadas o las de OpenAI."}</p>:null}
  {loading?<div className={css.loading}><LoaderCircle size={14} className={css.spin}/></div>:null}
  {error?<p role="status" className={css.error}>{error}</p>:null}
  <p className={css.disclaimer}>
   {sampleMode==="limited"
    ?(en?"Listen before choosing. OpenAI demos play on demand, with a daily limit and no Video Studio credit charge. ElevenLabs uses available recordings.":"Escucha antes de elegir. OpenAI genera la muestra al pulsar Escuchar, con límite diario y sin descontar créditos de Video Studio. ElevenLabs utiliza sus grabaciones disponibles.")
    :sampleMode==="prerecorded"
    ?(en?"ElevenLabs prerecorded samples are free to play. OpenAI voice selection is available; paid samples will be enabled after the credit system is tested.":"Las muestras pregrabadas de ElevenLabs se pueden escuchar gratis. Puedes elegir voces de OpenAI; activaremos sus muestras de pago después de probar el sistema de créditos.")
    :(en?"Listen before selecting. ElevenLabs samples are prerecorded. OpenAI voice previews are generated only when you press Listen and may use a few credits.":"Escucha antes de elegir. Las muestras de ElevenLabs son grabaciones existentes. Las de OpenAI se generan solo al pulsar Escuchar y pueden consumir algunos créditos.")}
  </p>
 </div>;
}