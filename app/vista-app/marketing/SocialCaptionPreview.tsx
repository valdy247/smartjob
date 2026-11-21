"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Check,ClipboardCopy,FileVideo2,LockKeyhole,LoaderCircle,RefreshCw,Sparkles,UploadCloud,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import ScienceWaitQuiz from "./ScienceWaitQuiz";
import {extractVideoAudio,MAX_SOCIAL_VIDEO_BYTES} from "./extractVideoAudio";
import styles from "./SocialCaptionPreview.module.css";

const networks=["Instagram","TikTok","Facebook","YouTube","LinkedIn","X"] as const;
type Stage="extract"|"transcribe"|"generate";
type Mode="speech"|"silent";

function userError(code:string,en:boolean){
 const messages:Record<string,[string,string]>={
  sign_in_required:["Inicia sesión otra vez.","Please sign in again."],
  daily_limit:["Alcanzaste el límite de uso de IA o audio de tu plan.","Your plan's daily AI or audio allowance has been reached."],
  transcription_not_configured:["La transcripción no está configurada. Intenta usar la descripción escrita.","Transcription is not configured. Try the written description."],
  generation_not_configured:["La generación de IA no está configurada.","AI caption generation is not configured."],
  transcription_unavailable:["No pudimos transcribir este video. Prueba con otro o describe lo que ocurre.","We couldn't transcribe this video. Try another one or describe what happens."],
  generation_unavailable:["La IA no pudo generar la descripción. Intenta nuevamente.","AI could not generate a caption. Please try again."],
  no_speech:["No detectamos palabras claras. Describe lo que pasa en el video.","No clear speech was detected. Describe what's happening in the video."],
  video_size:["El video supera 200 MB. Selecciona uno más corto.","The video is over 200 MB. Choose a shorter clip."],
  video_duration:["El video debe durar como máximo 2 minutos.","The video must be 2 minutes or less."],
  video_timeout:["No se pudo terminar de extraer el audio. Prueba con un clip más corto.","Audio extraction did not finish. Try a shorter clip."],
  audio_size:["El audio quedó demasiado grande. Prueba con un video más corto.","The audio is too large. Try a shorter video."],
  audio_missing:["No se pudo extraer el audio. Describe lo que sucede en el video.","Audio could not be extracted. Describe what happens in the video."],
  audio_capture:["No se pudo grabar el audio de este video.","Could not capture audio from this video."],
  playback_blocked:["El navegador bloqueó la reproducción. Vuelve a intentarlo.","Your browser blocked playback. Please try again."],
  unsupported_browser:["Este navegador no puede extraer el audio. Describe el video o prueba con otro navegador.","This browser can't extract audio. Describe the video or try another browser."],
  invalid_video:["No pudimos leer este formato de video. Prueba con MP4.","We couldn't read this video format. Try MP4."],
  invalid_audio:["El audio no es compatible o es demasiado grande.","The audio format isn't supported or is too large."],
  audio_too_large:["El audio supera el límite de carga.","Audio exceeds the upload limit."],
  missing_content:["Cuéntanos qué se dice o qué sucede en el video.","Tell us what is said or happens in the video."],
  cancelled:["Proceso cancelado.","Process cancelled."]
 };
 const entry=messages[code]||["No se pudo completar. Intenta otra vez.","Could not complete the request. Please try again."];
 return entry[en?1:0];
}

async function apiResponse(response:Response){
 const json=await response.json().catch(()=>({})) as Record<string,unknown>;
 if(!response.ok)throw new Error(typeof json.error==="string"?json.error:"server_unavailable");
 return json;
}

export default function SocialCaptionPreview({onBack,businessName="",hideBack=false}:{onBack:()=>void;businessName?:string;hideBack?:boolean}){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const [network,setNetwork]=useState("");
 const [brand,setBrand]=useState(businessName);
 useEffect(()=>{setBrand(businessName);},[businessName]);
 const [mode,setMode]=useState<Mode>("speech");
 const [video,setVideo]=useState<File|null>(null);
 const [scene,setScene]=useState("");
 const [transcript,setTranscript]=useState("");
 const [caption,setCaption]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [quizOpen,setQuizOpen]=useState(false);
 const [stage,setStage]=useState<Stage>("extract");
 const controllerRef=useRef<AbortController|null>(null);
 const [seed,setSeed]=useState("captions");
 useEffect(()=>()=>{controllerRef.current?.abort();},[]);
 const canGenerate=Boolean(network&&!busy&&(mode==="silent"?scene.trim().length>=12:video||transcript.trim().length>=12||scene.trim().length>=12));
 const cancel=()=>{controllerRef.current?.abort();setQuizOpen(false);};
 const back=()=>{cancel();onBack();};
 const updateVideo=(file:File|null)=>{
  setError("");setNotice("");setCaption("");setTranscript("");
  if(file&&(!file.type.startsWith("video/")||file.size<1024)){setVideo(null);setError(userError("invalid_video",en));return;}
  if(file&&file.size>MAX_SOCIAL_VIDEO_BYTES){setVideo(null);setError(userError("video_size",en));return;}
  setVideo(file);
 };
 const generate=async()=>{
  if(!canGenerate)return;
  const client=getSupabase();
  if(!client){setError(userError("sign_in_required",en));return;}
  const abortController=new AbortController();
  controllerRef.current=abortController;
  setBusy(true);setError("");setNotice("");setCaption("");
  setSeed(crypto.randomUUID());setStage(mode==="speech"&&video&&!transcript.trim()?"extract":"generate");
  setQuizOpen(true);
  // Start local media playback before the first await, preserving the tap gesture on iOS Safari.
  const needsExtraction=mode==="speech"&&!!video&&!transcript.trim();
  const extraction=needsExtraction&&video?extractVideoAudio(video,abortController.signal)
   .then(blob=>({blob,error:null as unknown})).catch((error:unknown)=>({blob:null as Blob|null,error})):null;
  try{
   const {data:{session},error:sessionError}=await client.auth.getSession();
   if(sessionError||!session?.access_token){abortController.abort();throw new Error("sign_in_required");}
   let spoken=mode==="speech"?transcript.trim():"";
   if(needsExtraction&&extraction){
    const {blob:audio,error:extractError}=await extraction;
    if(extractError)throw extractError;
    if(!audio)throw new Error("audio_missing");
    if(abortController.signal.aborted)throw new Error("cancelled");
    setStage("transcribe");
    const data=new FormData();
    const name=audio.type.includes("mp4")?"audio.m4a":audio.type.includes("ogg")?"audio.ogg":"audio.webm";
    data.append("audio",audio,name);
    const response=await fetch("/api/marketing/social-captions/transcribe",{
     method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:data,signal:abortController.signal,cache:"no-store"
    });
    const result=await apiResponse(response);
    spoken=typeof result.text==="string"?result.text.trim():"";
    if(spoken)setTranscript(spoken);
   }
   if(!spoken&&!scene.trim())throw new Error("no_speech");
   setStage("generate");
   const response=await fetch("/api/marketing/social-captions/generate",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({network,transcript:spoken,scene:scene.trim(),locale:language,brand:brand.trim()}),
    signal:abortController.signal,cache:"no-store"
   });
   const result=await apiResponse(response);
   const value=typeof result.caption==="string"?result.caption.trim():"";
   if(!value)throw new Error("generation_unavailable");
   setCaption(value);
  }catch(e){
   const code=e instanceof Error&&e.message==="sign_in_required"?"sign_in_required":abortController.signal.aborted?"cancelled":e instanceof Error?e.message:"server_unavailable";
   setError(userError(code,en));setQuizOpen(false);
  }finally{
   controllerRef.current=null;setBusy(false);
  }
 };
 const copy=async()=>{
  try{
   await navigator.clipboard.writeText(caption);
   setNotice(en?"Copied. Review before publishing.":"Copiado. Revísalo antes de publicar.");
  }catch{setNotice(en?"Select and copy the text manually.":"Selecciona y copia el texto manualmente.");}
 };
 return <section className={styles.preview} aria-label={en?"Social media captions":"Descripciones para redes"}>
  {!hideBack?<button type="button" className={styles.back} onClick={back}><ArrowLeft size={16}/>{en?"Back to Marketing":"Volver a Marketing"}</button>:null}
  <div className={styles.heading}>
   <span className={styles.icon}><Sparkles size={22}/></span>
   <span className={styles.badge}>{en?"AI caption studio":"Estudio de descripciones con IA"}</span>
   <h2>{en?"Social media captions":"Descripciones para redes"}</h2>
   <p>{en?"Turn spoken video or your own scene description into an editable social caption. Your video stays on your device.":"Convierte la voz de tu video o tu explicación de lo que ocurre en una descripción editable. El video permanece en tu dispositivo."}</p>
  </div>
  <div className={styles.form}>
   <label className={styles.field}>
    <strong><span>01</span>{en?"Which social network?":"¿Para qué red social?"}</strong>
    <select value={network} disabled={busy} onChange={e=>{setNetwork(e.target.value);setCaption("");setNotice("");}}>
     <option value="">{en?"Choose a network":"Selecciona una red"}</option>
     {networks.map(item=><option key={item} value={item}>{item}</option>)}
    </select>
   </label>
   <label className={styles.field}>
    <strong>{en?"Business or brand (optional)":"Negocio o marca (opcional)"}</strong>
    <input type="text" className={styles.brandInput} maxLength={140} value={brand} disabled={busy} onChange={e=>{setBrand(e.target.value);setCaption("");}} placeholder={en?"Example: My bakery":"Ej.: Mi pastelería"}/>
    <small className={styles.helper}>{en?"Only used to personalize your caption; no extra details are invented.":"Se usa solo para personalizar el texto, sin inventar información."}</small>
   </label>
   <div className={styles.field}>
    <strong><span>02</span>{en?"Does the video have speech?":"¿El video tiene voz?"}</strong>
    <div className={styles.modeChoice}>
     <button type="button" disabled={busy} className={mode==="speech"?styles.modeActive:styles.modeButton} aria-pressed={mode==="speech"} onClick={()=>{setMode("speech");setCaption("");setError("");}}>{en?"Yes, transcribe it":"Sí, transcribir voz"}</button>
     <button type="button" disabled={busy} className={mode==="silent"?styles.modeActive:styles.modeButton} aria-pressed={mode==="silent"} onClick={()=>{setMode("silent");setCaption("");setError("");}}>{en?"No, I'll describe it":"No, lo describiré"}</button>
    </div>
   </div>
   {mode==="speech"?<div className={styles.field}>
    <strong><span>03</span>{en?"Choose a video":"Selecciona un video"}</strong>
    <div className={styles.upload}><UploadCloud size={24}/><div><b>{en?"Video stays on your device":"El video permanece en tu dispositivo"}</b><small>{en?"Audio is extracted locally · Up to 2 min":"Solo extraemos audio localmente · Hasta 2 min"}</small></div></div>
    <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" disabled={!network||busy} onChange={e=>{updateVideo(e.target.files?.[0]||null);e.target.value="";}} aria-label={en?"Choose a video from your device":"Seleccionar un video de tu dispositivo"}/>
    {video?<small className={styles.selected}><FileVideo2 size={15}/>{video.name} · {(video.size/1048576).toFixed(1)} MB <button type="button" disabled={busy} onClick={()=>updateVideo(null)} aria-label={en?"Remove selected video":"Quitar video"}><X size={14}/></button></small>:null}
    {!network?<small className={styles.helper}>{en?"Choose a network first.":"Primero selecciona una red."}</small>:null}
    {transcript?<label className={styles.transcriptField}><span>{en?"Detected speech · You can correct it":"Voz detectada · Puedes corregirla"}</span><textarea rows={4} maxLength={6000} value={transcript} disabled={busy} onChange={e=>{setTranscript(e.target.value);setCaption("");}}/></label>:null}
   </div>:null}
   <label className={styles.field}>
    <strong><span>{mode==="speech"?"04":"03"}</span>{mode==="silent"?(en?"What happens in your video?":"¿Qué sucede en el video?"):(en?"Optional: describe what we cannot hear":"Opcional: describe lo que no se escucha")}</strong>
    <textarea rows={3} maxLength={650} value={scene} disabled={busy} onChange={e=>{setScene(e.target.value);setCaption("");}}
      placeholder={en?"Example: A baker decorates a birthday cake with buttercream flowers in her kitchen.":"Ej.: Una pastelera decora un pastel de cumpleaños con flores de crema en su cocina."}/>
    <small className={styles.helper}>{mode==="silent"?(en?"Describe what is visible. No audio is sent.":"Cuenta brevemente lo que se ve. No se envía audio."):(en?"If the video has no speech, choose the description option above.":"Si no hay voz, selecciona la opción de describir el video.")}</small>
   </label>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
   <div className={styles.buttons}>
    <button type="button" className={styles.generateButton} disabled={!canGenerate} onClick={()=>void generate()}>{busy?<LoaderCircle size={17} className={styles.spin}/>:<Sparkles size={17}/>} {busy?(en?"Processing…":"Procesando…"):(caption?(en?"Regenerate caption":"Regenerar descripción"):(en?"Generate caption":"Generar descripción"))}</button>
    {busy?<button type="button" className={styles.cancel} onClick={cancel}><X size={16}/>{en?"Cancel":"Cancelar"}</button>:null}
   </div>
   {caption?<div className={styles.result} aria-live="polite">
    <div className={styles.resultTitle}><span><Check size={17}/>{en?"Your caption for":"Tu descripción para"} {network}</span><small>{en?"Editable draft":"Borrador editable"}</small></div>
    <textarea aria-label={en?"Editable generated caption":"Descripción generada editable"} value={caption} maxLength={1800} onChange={e=>{setCaption(e.target.value);setNotice("");}} rows={7}/>
    <div className={styles.resultButtons}>
     <button type="button" onClick={()=>void copy()} disabled={!caption.trim()}><ClipboardCopy size={17}/>{en?"Copy caption":"Copiar descripción"}</button>
     <button type="button" onClick={()=>void generate()} disabled={busy}><RefreshCw size={16}/>{en?"Try another":"Otra versión"}</button>
    </div>
    {notice?<p className={styles.notice} role="status">{notice}</p>:null}
   </div>:null}
   <p className={styles.privacy}><LockKeyhole size={15}/>{en?"VMV does not save your video or audio. Audio is sent for transcription; text and your description are sent to an AI provider to write the caption. Nothing is published automatically.":"VMV no guarda el video ni el audio. Enviamos el audio al servicio de transcripción y el texto a la IA para redactar la descripción. Nada se publica automáticamente."}</p>
  </div>
  {quizOpen?<ScienceWaitQuiz key={seed} en={en} seed={seed} processing={busy} mode="caption" phase={stage} onContinue={()=>setQuizOpen(false)}/>:null}
 </section>;
}
