"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowLeft,CarFront,Check,Download,Globe2,LoaderCircle,Pause,Play,Volume2,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import type {SupabaseClient} from "@supabase/supabase-js";
import {drawStickmanFrame,stickmanStory,userStickmanStory,STICKMAN_WIDTH,STICKMAN_HEIGHT,STICKMAN_SECONDS,
 type StickmanTopic,type StickmanLanguage,type StickmanStory,type MotionShape} from "@/lib/vmv-stickman-engine";
import css from "./page.module.css";

type Format={mime:string;extension:"mp4"|"webm"};
const formats:Format[]=[
 {mime:"video/mp4;codecs=avc1.42E01E,mp4a.40.2",extension:"mp4"},
 {mime:"video/mp4",extension:"mp4"},
 {mime:"video/webm;codecs=vp9,opus",extension:"webm"},
 {mime:"video/webm;codecs=vp8,opus",extension:"webm"},
 {mime:"video/webm",extension:"webm"}
];
function chosenFormat():Format{
 if(typeof MediaRecorder==="undefined")throw Error("Tu navegador no permite exportar video.");
 const format=formats.find(item=>MediaRecorder.isTypeSupported(item.mime));
 if(!format)throw Error("Tu navegador no admite video MP4 ni WebM.");
 return format;
}
function base64ToBuffer(value:string):ArrayBuffer{
 const binary=atob(value),buffer=new ArrayBuffer(binary.length),view=new Uint8Array(buffer);
 for(let i=0;i<binary.length;i++)view[i]=binary.charCodeAt(i);
 return buffer;
}
async function loadVoice(phrases:string[],voice:"alloy"|"nova"):Promise<ArrayBuffer[]>{
 const sb=getSupabase();
 if(!sb)throw Error("Inicia sesión para crear la voz.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión para crear la voz.");
 const response=await fetch("/api/video-generator/speech/scenes",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({scenes:phrases,voice,confirmCost:true})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(result?.error==="voice_limit"?"Límite diario de voces alcanzado.":
  result?.error==="video_not_enabled_for_account"?"Tu cuenta no tiene habilitada la voz de IA.":
  "No se pudo generar la narración.");
 if(!Array.isArray(result?.scenes)||result.scenes.length!==phrases.length)
  throw Error("La narración está incompleta.");
 return result.scenes.map((item:{audio?:string})=>{
  if(typeof item?.audio!=="string"||item.audio.length<1000)throw Error("Audio inválido.");
  return base64ToBuffer(item.audio);
 });
}
async function createTerraStory(prompt:string):Promise<StickmanStory>{
 const sb=getSupabase();
 if(!sb)throw Error("Inicia sesión para generar con Terra.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión para generar con Terra.");
 const response=await fetch("/api/video-generator/motion-terra",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({prompt,confirmCost:true})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error==="openai_key_not_configured"?"Falta configurar OPENAI_API_KEY en Vercel Preview.":
  data?.error==="openai_key_invalid"?"La clave de OpenAI no es válida.":
  data?.error==="openai_quota_or_rate_limit"?"OpenAI rechazó la solicitud por cuota o límite temporal.":
  data?.error==="openai_request_failed"?"OpenAI no pudo procesar la solicitud.":
  data?.error==="terra_gateway_paid_credits_required"?"GPT Terra requiere créditos de pago en Vercel AI Gateway. No se ha activado ningún gasto.":
  data?.error==="terra_credits_exhausted"?"No hay créditos disponibles para GPT Terra.":
  data?.error==="terra_rate_limited"?"Terra recibió demasiadas solicitudes. Intenta más tarde.":
  data?.error==="motion_limit"?"Límite de pruebas alcanzado.":
  data?.error==="motion_scene_retry"?"Terra no creó escenas válidas. Intenta de nuevo.":
  data?.error==="video_not_enabled_for_account"?"La prueba de IA no está habilitada para tu cuenta.":
  "No pudimos generar las escenas con GPT Terra. Revisa la configuración del proveedor.");
 if(!Array.isArray(data?.scenes)||data.scenes.length!==3)throw Error("Terra devolvió escenas incompletas.");
 return {name:String(data.title||"VMV Motion"),scenes:data.scenes.map((scene:{
  speech:string;caption:string;background:string;shapes:MotionShape[]
 })=>({action:"custom" as const,speech:scene.speech,heading:scene.caption,
  background:scene.background,shapes:scene.shapes})) as StickmanStory["scenes"]};
}

async function exportCanvas(canvas:HTMLCanvasElement,
 story:ReturnType<typeof stickmanStory>,showSubtitles:boolean,
 voiceParts:ArrayBuffer[],onProgress:(n:number)=>void):Promise<{blob:Blob;format:Format}>{
 const format=chosenFormat(),ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx||typeof canvas.captureStream!=="function")
  throw Error("Este navegador no puede exportar la animación.");
 let audio:AudioContext|null=null,stream:MediaStream|null=null,recorder:MediaRecorder|null=null;
 let raf=0;
 try{
  const tracks=canvas.captureStream(30);stream=tracks;
  // Narration is aligned to EXACT five-second boundaries and mixed into the file.
  if(voiceParts.length){
   audio=new AudioContext();
   await audio.resume();
   const decoded=await Promise.all(voiceParts.map(buffer=>audio!.decodeAudioData(buffer.slice(0))));
   const mix=audio.createMediaStreamDestination();
   const begin=audio.currentTime+.14;
   decoded.forEach((buffer,i)=>{
    const rate=Math.max(1,buffer.duration/4.76);
    if(rate>1.7)throw Error("La narración es demasiado larga para cinco segundos.");
    const source=audio!.createBufferSource();
    source.buffer=buffer;source.playbackRate.value=rate;source.connect(mix);
    source.start(begin+i*5);
   });
   mix.stream.getAudioTracks().forEach(track=>tracks.addTrack(track));
  }
  recorder=new MediaRecorder(tracks,{
   mimeType:format.mime,videoBitsPerSecond:2500000,audioBitsPerSecond:128000
  });
  const chunks:BlobPart[]=[];
  const completed=new Promise<Blob>((resolve,reject)=>{
   recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder!.onerror=()=>reject(Error("Error durante la exportación."));
   recorder!.onstop=()=>chunks.length?
    resolve(new Blob(chunks,{type:format.mime})):reject(Error("La grabación está vacía."));
  });
  drawStickmanFrame(ctx,story,0,showSubtitles);
  recorder.start(250);
  const start=performance.now()+140;
  await new Promise<void>(resolve=>{
   const draw=(now:number)=>{
    const elapsed=Math.max(0,(now-start)/1000);
    drawStickmanFrame(ctx,story,Math.min(STICKMAN_SECONDS-.001,elapsed),showSubtitles);
    onProgress(Math.min(99,Math.floor(100*elapsed/STICKMAN_SECONDS)));
    if(elapsed>=STICKMAN_SECONDS){resolve();return;}
    raf=requestAnimationFrame(draw);
   };
   raf=requestAnimationFrame(draw);
  });
  if(recorder.state!=="inactive")recorder.stop();
  const blob=await completed;
  return {blob,format};
 }finally{
  cancelAnimationFrame(raf);
  if(recorder&&recorder.state!=="inactive")recorder.stop();
  stream?.getTracks().forEach(t=>t.stop());
  if(audio)void audio.close();
 }
}
export default function StickmanLabPage(){
 const router=useRouter();
 const [auth,setAuth]=useState<"checking"|"signed_in"|"signed_out">("checking");
 const [authClient,setAuthClient]=useState<SupabaseClient|null>(null);
 const [topic,setTopic]=useState<StickmanTopic>("space");
 const [customPrompt,setCustomPrompt]=useState("");
 const [customMode,setCustomMode]=useState(false);
 const [terraStory,setTerraStory]=useState<StickmanStory|null>(null);
 const [language,setLanguage]=useState<StickmanLanguage>("es");
 const [subtitles,setSubtitles]=useState(true),[withVoice,setWithVoice]=useState(false);
 const [voice,setVoice]=useState<"alloy"|"nova">("alloy");
 const [playing,setPlaying]=useState(true),[rendering,setRendering]=useState(false);
 const [progress,setProgress]=useState(0),[stage,setStage]=useState("");
 const [videoUrl,setVideoUrl]=useState(""),[extension,setExtension]=useState<"mp4"|"webm">("webm");
 const [error,setError]=useState("");
 const canvas=useRef<HTMLCanvasElement>(null);
 const playingRef=useRef(true),renderingRef=useRef(false),urlRef=useRef("");
 const timelineRef=useRef(0),lastFrameRef=useRef(0);
 const story=customMode?(terraStory|| (customPrompt.trim().length>=8?userStickmanStory(customPrompt):stickmanStory(topic,language))):stickmanStory(topic,language);
 useEffect(()=>{
  let active=true;
  const client=getSupabase();setAuthClient(client);
  if(!client){setAuth("signed_out");return;}
  const sync=async()=>{
   const {data,error}=await client.auth.getUser();
   if(active)setAuth(!error&&data.user&&!data.user.is_anonymous?"signed_in":"signed_out");
  };
  const {data:listener}=client.auth.onAuthStateChange(()=>{queueMicrotask(()=>{if(active)void sync();});});
  void sync();
  return()=>{active=false;listener.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  playingRef.current=playing;
 },[playing]);
 useEffect(()=>{
  let raf=0;
  lastFrameRef.current=0;timelineRef.current=0;
  const step=(now:number)=>{
   const dt=lastFrameRef.current?Math.min(.08,(now-lastFrameRef.current)/1000):0;
   lastFrameRef.current=now;
   if(!renderingRef.current){
    if(playingRef.current)timelineRef.current=(timelineRef.current+dt)%STICKMAN_SECONDS;
    const ctx=canvas.current?.getContext("2d",{alpha:false});
    if(ctx)drawStickmanFrame(ctx,customMode?(terraStory||(customPrompt.trim().length>=8?userStickmanStory(customPrompt):stickmanStory(topic,language))):stickmanStory(topic,language),timelineRef.current,subtitles);
   }
   raf=requestAnimationFrame(step);
  };
  raf=requestAnimationFrame(step);
  return()=>cancelAnimationFrame(raf);
 },[topic,language,subtitles,customMode,customPrompt,terraStory]);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
 const generate=useCallback(async()=>{
  if(renderingRef.current)return;
  const target=canvas.current;
  if(!target)return;
  renderingRef.current=true;setRendering(true);setProgress(0);
  setError("");setStage(customMode?"GPT Terra dibujando escenas":withVoice?"Preparando voz":"Animando");
  try{
   const selected=customMode?await createTerraStory(customPrompt):stickmanStory(topic,language);
   if(customMode)setTerraStory(selected);
   // Zero animation-provider credits. Optional voice requires explicit consent.
   const spoken=withVoice?await loadVoice(selected.scenes.map(s=>s.speech),voice):[];
   setStage("Montando video");
   const result=await exportCanvas(target,selected,subtitles,spoken,setProgress);
   const next=URL.createObjectURL(result.blob);
   if(urlRef.current)URL.revokeObjectURL(urlRef.current);
   urlRef.current=next;setVideoUrl(next);setExtension(result.format.extension);
   setProgress(100);setStage("Listo");
  }catch(e){
   setError(e instanceof Error?e.message:"No pudimos crear esta prueba.");
   setStage("");setProgress(0);
  }finally{renderingRef.current=false;setRendering(false);}
 },[topic,language,subtitles,withVoice,voice,customMode,customPrompt]);
 if(auth==="checking")return <main className={css.page}><div className={css.shell}>Verificando sesión…</div></main>;
 if(auth==="signed_out")return authClient?<VMVAuthGateway supabase={authClient} compact
  returnTo="/vista-app/vmv-pilot/stickman-lab"/>:
  <main className={css.page}><p>La autenticación no está configurada en esta versión de prueba.</p></main>;
 return <main className={css.page}>
  <div className={css.shell}>
   <header className={css.header}>
    <button type="button" aria-label="Volver a VMV Pilot" onClick={()=>router.push("/vista-app/vmv-pilot")}>
     <ArrowLeft size={19}/></button>
    <strong>VMV Pilot</strong><span className={css.beta}>LAB</span>
   </header>
   <div className={css.intro}><h1>Stickman Studio</h1><span>Motor propio · 2D</span></div>
   <div className={css.modeRow}>
    <button type="button" className={customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(true)}>Tu historia</button>
    <button type="button" className={!customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(false)}>Ejemplos</button>
   </div>
   {customMode?<label className={css.promptField}>
    <span>¿Qué quieres contar?</span>
    <textarea disabled={rendering} value={customPrompt} maxLength={500} rows={4}
     placeholder="Ejemplo: Un pequeño elefante busca agua en la selva. Encuentra un río y ayuda a sus amigos a beber."
     onChange={e=>{setCustomPrompt(e.target.value);setTerraStory(null);}}/>
    <small>{customPrompt.length}/500 · 3 escenas de 5 segundos</small>
   </label>:<div className={css.topics}>
    <button type="button" className={topic==="space"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("space");}} disabled={rendering}>
     <Globe2 size={21}/>{language==="es"?"Planetas":"Planets"}</button>
    <button type="button" className={topic==="race"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("race");}} disabled={rendering}>
     <CarFront size={21}/>{language==="es"?"Fórmula 1":"Formula 1"}</button>
   </div>}
   <section className={css.stage}>
    <div className={css.canvasWrap}>
     <canvas ref={canvas} width={STICKMAN_WIDTH} height={STICKMAN_HEIGHT}
      aria-label="Vista previa de animación Stickman" role="img"/>
     {!rendering?<button className={css.play} type="button"
       onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pausar":"Reproducir"}>
       {playing?<Pause size={18}/>:<Play size={18}/>}
      </button>:null}
     <span className={css.duration}>15s · 9:16</span>
    </div>
    <div className={css.controls}>
     <div className={css.languages} aria-label="Idioma">
      <button type="button" disabled={rendering} className={language==="es"?css.selected:""}
       onClick={()=>setLanguage("es")}>ES</button>
      <button type="button" disabled={rendering} className={language==="en"?css.selected:""}
       onClick={()=>setLanguage("en")}>EN</button>
     </div>
     <label className={css.toggle}><input disabled={rendering} type="checkbox"
      checked={subtitles} onChange={e=>setSubtitles(e.target.checked)}/>
      {language==="es"?"Subtítulos":"Captions"}</label>
     <label className={css.toggle}><input disabled={rendering} type="checkbox"
      checked={withVoice} onChange={e=>setWithVoice(e.target.checked)}/>
      <Volume2 size={15}/>{language==="es"?"Voz IA":"AI voice"}</label>
    </div>
    {withVoice?<div className={css.voiceOptions}>
     {(["alloy","nova"] as const).map(v=><button key={v} type="button"
      disabled={rendering} className={voice===v?css.selected:""} onClick={()=>setVoice(v)}>
      {v==="alloy"?"Alloy":"Nova"}</button>)}
     <small>{language==="es"?"Usa créditos de voz":"Uses voice credits"}</small>
    </div>:null}
    <button className={css.generate} type="button"
     onClick={()=>void generate()} disabled={rendering||(customMode&&customPrompt.trim().length<8)}>
     {rendering?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {rendering?(stage+" · "+progress+"%"):(language==="es"?"Generar video":"Generate video")}
    </button>
    {error?<p role="alert" className={css.error}>{error}</p>:null}
    {videoUrl?<div className={css.result}>
     <div className={css.resultTitle}><Check size={18}/><strong>{language==="es"?"Video terminado":"Finished video"}</strong></div>
     <video src={videoUrl} controls playsInline preload="metadata"/>
     <a href={videoUrl} download={"vmv-stickman-"+(customMode?"historia":topic)+"."+extension}>
      <Download size={16}/>{language==="es"?"Descargar":"Download"}</a>
    </div>:null}
   </section>
   <p className={css.note}>{language==="es"
    ?"Tu historia usa GPT-6.1 Terra para dibujar tres escenas vectoriales originales y consume tokens de IA. Nuestro motor anima y exporta sin Runway. Mantén la pestaña abierta."
    :"Original animation without Runway. Keep this tab open during export."}</p>
  </div>
 </main>;
}
