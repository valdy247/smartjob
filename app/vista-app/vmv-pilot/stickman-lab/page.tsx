"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowLeft,BookOpen,CarFront,Check,Clapperboard,Cloud,Copy,Download,FolderOpen,Globe2,LoaderCircle,Pause,Play,Plus,RotateCcw,Share2,Volume2,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import PilotVoiceStep from "../PilotVoiceStep";
import type {SupabaseClient} from "@supabase/supabase-js";
import {drawStickmanFrame,stickmanStory,userStickmanStory,STICKMAN_WIDTH,STICKMAN_HEIGHT,STICKMAN_SECONDS,
 type StickmanTopic,type StickmanLanguage,type StickmanStory} from "@/lib/vmv-stickman-engine";
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
type SpeechAlignment={characters:string[];character_start_times_seconds:number[];character_end_times_seconds:number[]};
type ContinuousSpeech={audio:ArrayBuffer;alignment:SpeechAlignment;duration:number;sceneEnds?:number[]|null};
type CaptionCue={start:number;end:number;text:string};
async function loadContinuousVoice(phrases:string[],provider:"openai"|"elevenlabs"="elevenlabs",voiceId=""):Promise<ContinuousSpeech>{
 const sb=getSupabase();if(!sb)throw Error("Inicia sesión para crear la narración.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión para crear la narración.");
 const response=await fetch("/api/video-generator/speech/continuous",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({scenes:phrases,confirmCost:true,provider,voiceId:voiceId||undefined})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(
  result?.error==="openai_key_not_configured"?"La voz de OpenAI no está configurada.":
  result?.error==="openai_voice_unavailable"?"OpenAI no pudo crear esta voz. Tus clips siguen guardados.":
  result?.error==="openai_alignment_unavailable"?"No se pudo sincronizar la nueva voz con los subtítulos.":
  result?.error==="elevenlabs_not_configured_in_preview"?"Falta ELEVENLABS_API_KEY en Vercel Preview.":
  result?.error==="elevenlabs_key_rejected"?"ElevenLabs rechazó la clave API.":
  result?.error==="elevenlabs_credits_required"?"ElevenLabs requiere un plan compatible con la voz seleccionada o créditos adicionales. En cuentas Free, algunas voces no están disponibles por API. Tus clips de Seedance siguen guardados.":
  result?.error==="elevenlabs_rate_limited"?"ElevenLabs alcanzó el límite de solicitudes.":
  result?.error==="elevenlabs_voice_unavailable"?"La voz configurada no está disponible para esta cuenta de ElevenLabs. Verifica ELEVENLABS_VOICE_ID.":
  result?.error==="elevenlabs_access_denied"?"Esta clave no tiene permisos para generar voz en ElevenLabs.":
  result?.providerCode==="max_character_limit_exceeded"||result?.providerCode==="text_too_long"?"ElevenLabs rechazó el texto por longitud.":
  result?.providerCode==="model_access_denied"||result?.providerCode==="feature_not_available"?"Tu plan de ElevenLabs no permite usar el modelo o esta función.":
  "La generación de voz no se completó ("+String(result?.error||response.status)+
   (result?.providerCode&&result.providerCode!=="unknown"?" / "+result.providerCode:"")+
   "). Los 12 clips existentes se conservan."
 );
 if(typeof result.audio!=="string"||!result.alignment||!Number.isFinite(result.duration))
  throw Error("El proveedor no devolvió audio y tiempos válidos.");
 return {audio:base64ToBuffer(result.audio),alignment:result.alignment as SpeechAlignment,duration:result.duration,
  sceneEnds:Array.isArray(result.sceneEnds)?result.sceneEnds:null};
}
function captionCues(alignment:SpeechAlignment):CaptionCue[]{
 const {characters,character_start_times_seconds:starts,character_end_times_seconds:ends}=alignment;
 const cues:CaptionCue[]=[];let words:{text:string;start:number;end:number}[]=[];
 let word="",start=0,end=0;
 const flush=()=>{if(word.trim())words.push({text:word.trim(),start,end});word="";};
 for(let i=0;i<characters.length;i++){
  const char=characters[i];
  if(/\s/u.test(char)){flush();continue;}
  if(!word)start=starts[i];word+=char;end=ends[i];
 }flush();
 for(let i=0;i<words.length;i+=5){
  const group=words.slice(i,i+5);
  cues.push({start:group[0].start,end:group[group.length-1].end,text:group.map(w=>w.text).join(" ")});
 }
 return cues;
}
type PendingStoryboard={prompt:string;data?:{title?:string;scenes:Array<{speech:string;caption:string;imagePrompt:string;camera?:{focusX:number;focusY:number;startZoom:number;endZoom:number}}>};images:StickmanStory["scenes"][number][]};
async function createTerraStory(prompt:string,pending:PendingStoryboard):Promise<StickmanStory>{
 const sb=getSupabase();
 if(!sb)throw Error("Inicia sesión para generar con OpenAI.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión para generar con OpenAI.");
 if(pending.prompt!==prompt){pending.prompt=prompt;pending.data=undefined;pending.images=[];}
 if(!pending.data){
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
  data?.error==="motion_scene_retry"?"OpenAI no creó el guion de escenas. Intenta de nuevo.":
  data?.error==="video_not_enabled_for_account"?"La prueba de IA no está habilitada para tu cuenta.":
  "No pudimos generar las escenas con OpenAI. Revisa la configuración del proveedor.");
 if(!Array.isArray(data?.scenes)||data.scenes.length!==3)throw Error("OpenAI devolvió escenas incompletas.");
 pending.data=data;
 }
 const data=pending.data!;
 const scenes:StickmanStory["scenes"]=pending.images.slice() as StickmanStory["scenes"];
 for(let i=pending.images.length;i<3;i++){
  const scene=data.scenes[i] as {speech:string;caption:string;imagePrompt:string;camera?:{focusX:number;focusY:number;startZoom:number;endZoom:number}};
  if(typeof scene.imagePrompt!=="string"||scene.imagePrompt.length<35)throw Error("El guion de imágenes está incompleto.");
  const imageResponse=await fetch("/api/video-generator/motion-image",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
   body:JSON.stringify({prompt:scene.imagePrompt,confirmCost:true})
  });
  const imageData=await imageResponse.json().catch(()=>null);
  if(!imageResponse.ok){
   const error=imageData?.error;
   throw Error(error==="image_daily_limit"?"Alcanzaste el límite diario de imágenes.":
    error==="openai_quota_or_rate_limit"?"OpenAI no tiene cuota disponible o está saturado.":
    error==="openai_key_invalid"?"La clave de OpenAI no es válida.":
    error==="image_safety_rejected"?"OpenAI rechazó el contenido visual de la escena "+(i+1)+". Modifica la descripción de esa escena.":
    error==="image_bad_request"?"OpenAI rechazó las instrucciones de la escena "+(i+1)+(imageData?.providerCode?" ("+imageData.providerCode+")":"")+".":
    "No pudimos crear la ilustración de la escena "+(i+1)+".");
  }
  const image=new Image();
  image.src="data:"+(imageData?.mediaType||"image/jpeg")+";base64,"+imageData?.imageBase64;
  await image.decode();
  const complete={action:"custom" as const,speech:scene.speech,heading:scene.caption,camera:scene.camera,image};
  scenes.push(complete);pending.images.push(complete);
 }
 return {name:String(data.title||"VMV Motion"),scenes};
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
  if(recorder!==null){const activeRecorder=recorder as MediaRecorder;if(activeRecorder.state!=="inactive")activeRecorder.stop();}
  const blob=await completed;
  return {blob,format};
 }finally{
  cancelAnimationFrame(raf);
  if(recorder&&recorder.state!=="inactive")recorder.stop();
  stream?.getTracks().forEach(t=>t.stop());
  if(audio)void audio.close();
 }
}
const MINIMAX_PENDING_KEY="vmv-motion-minimax-pending-v1";
async function minimaxRequest(accessToken:string,body:Record<string,unknown>){
 const response=await fetch("/api/video-generator/motion-minimax",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
  body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error==="motion_limit"?"Se alcanzó el límite diario de pruebas.":
  data?.error==="ai_gateway_auth_not_configured"?"Vercel AI Gateway no tiene credenciales configuradas.":
  data?.error==="minimax_video_start_failed"?"MiniMax no pudo iniciar el video. Revisa los créditos de AI Gateway.":
  data?.error==="video_result_unavailable"?"MiniMax finalizó, pero no proporcionó un enlace válido.": 
  data?.error==="video_status_unavailable"?"No pudimos consultar el progreso de MiniMax. Puedes reintentar sin pagar otro video.":
  "No pudimos iniciar o consultar el video MiniMax.");
 return data;
}

const MOTION_SCENES=12; // maximum scene count for legacy 60-second projects
type MotionSeconds=15|30|60;
const validMotionSeconds=(seconds:unknown):seconds is MotionSeconds=>
 seconds===15||seconds===30||seconds===60;
const scenesForSeconds=(seconds:MotionSeconds)=>seconds/5;
function durationFromPrompt(prompt:string):MotionSeconds|null{
 const found=prompt.slice(0,1000).match(/\b(15|30|60)\s*(?:\*{0,2}\s*)?(?:segundos?|seconds?|s)\b/i);
 const duration=found?Number(found[1]):null;
 return validMotionSeconds(duration)?duration:null;
}
type PilotMotionHandoff={requestId:string;createdAt:number;prompt:string;pilotId:string;
 topic:string;goal:string;audience:string;idea:string;researchScanId:string|null;researchVideoId:string;language:string;style:string;
 seconds:number;subtitles:boolean;narration:boolean;voiceProvider:string;voiceId:string;confirmedCost:boolean};
const PILOT_MOTION_HANDOFF_KEY="vmv-pilot-motion-handoff-v1";
type DirectorBeat={speech:string;caption:string;imagePrompt:string;motionPrompt:string};
type DirectorFrame={imageUrl:string;referencePath:string;prompt?:string};
type DirectorPlan={prompt:string;title:string;storyBible:string;seconds?:MotionSeconds;scenes:DirectorBeat[];frames:DirectorFrame[];
 approved?:boolean[];draftPrompts?:string[];previous?:Record<string,DirectorFrame[]>};
const DIRECTOR_PLAN_KEY="vmv-motion-director-plan-v5-60s";
function validMotionPlan(plan:Partial<DirectorPlan>|null|undefined):plan is DirectorPlan{
 return Boolean(plan?.prompt&&Array.isArray(plan.scenes)&&
  [3,6,12].includes(plan.scenes.length)&&
  (plan.seconds===undefined||plan.scenes.length===plan.seconds/5)&&
  Array.isArray(plan.frames)&&plan.frames.length<=plan.scenes.length);
}
const sceneTotal=(plan:DirectorPlan|null|undefined,seconds:MotionSeconds=60)=>
 plan?.scenes?.length||scenesForSeconds(seconds);
const baseMotionSeconds=(plan:DirectorPlan|null|undefined):MotionSeconds=>
 validMotionSeconds(plan?.seconds)?plan.seconds:
 plan?.scenes.length===3?15:plan?.scenes.length===6?30:60;
const MOTION_RECOVERY_MS=24*60*60*1000;
function readSavedMotion(key:string):unknown{
 // Prefer the current tab's state, then recover recent state from another tab.
 try{
  const current=sessionStorage.getItem(key);
  if(current){const parsed=JSON.parse(current);if(parsed?.prompt)return parsed;}
 }catch{}
 try{
  const archive=JSON.parse(localStorage.getItem(key+"-recovery")||"null");
  if(archive&&Number.isFinite(archive.savedAt)&&Date.now()-archive.savedAt>=0&&
   Date.now()-archive.savedAt<MOTION_RECOVERY_MS&&archive.data?.prompt){
   try{sessionStorage.setItem(key,JSON.stringify(archive.data));}catch{}
   return archive.data;
  }
 }catch{}
 return null;
}
function saveMotion(key:string,value:unknown){
 try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}
 try{localStorage.setItem(key+"-recovery",JSON.stringify({savedAt:Date.now(),data:value}));}catch{}
 // Event is consumed by the mounted studio to debounce cloud backups.
 if(typeof window!=="undefined")window.dispatchEvent(new Event("vmv-motion-saved"));
}
function readDirectorPlan(prompt:string):DirectorPlan|null{
 const d=readSavedMotion(DIRECTOR_PLAN_KEY) as Partial<DirectorPlan>|null;
 if(d?.prompt===prompt&&validMotionPlan(d))
  return d as DirectorPlan;
 return null;
}
function saveDirectorPlan(plan:DirectorPlan){saveMotion(DIRECTOR_PLAN_KEY,plan);}
async function directorCall(accessToken:string,endpoint:string,data:Record<string,unknown>){
 const response=await fetch(endpoint,{method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
  body:JSON.stringify({...data,confirmCost:true})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(
  result?.error==="image_daily_limit"||result?.error==="motion_limit"?"Se alcanzó el límite de pruebas.":
  result?.error==="image_storage_unavailable"?"No se pudo guardar el fotograma de referencia.": 
  result?.error==="image_reference_unavailable"?"No se encontró la imagen anterior para mantener la continuidad.":
  result?.error==="openai_quota_or_rate_limit"?"OpenAI no tiene cuota disponible.":
  result?.error==="image_safety_rejected"?"OpenAI bloqueó esta imagen por moderación. Ajusta su descripción antes de volver a generar.":
  result?.error==="image_bad_request"?"OpenAI rechazó la imagen"+(result?.providerCode?" ("+result.providerCode+")":"")+". No se realizarán más intentos automáticos.":
  result?.error==="motion_scene_retry"?(result?.stage==="narration"?
   "La IA no devolvió "+(result?.expectedScenes||"todas las")+" frases para la duración elegida. Si escribiste las frases por escena, se conservarán al reintentar. No se generaron imágenes nuevas.":
   result?.stage==="storyboard"?"La IA no devolvió las escenas completas para este video. No se generaron imágenes nuevas.":
   result?.reason==="output_truncated"?"La respuesta de OpenAI se cortó antes de terminar. Prueba generar el guion nuevamente.":
   "OpenAI devolvió una respuesta incompleta. No se generaron imágenes nuevas."):
  result?.error==="motion_ai_unavailable"?"Falló la preparación del guion con OpenAI (motion_ai_unavailable). Revisa los registros de Vercel.":
  result?.error==="openai_request_failed"?"OpenAI no pudo procesar el guion (openai_request_failed).":
  result?.error==="openai_key_not_configured"?"Falta configurar OpenAI en el entorno Preview.":
  result?.error==="openai_key_invalid"?"La clave de OpenAI fue rechazada.":
  result?.error==="terra_rate_limited"?"OpenAI alcanzó un límite temporal. El trabajo guardado se conserva.":
  result?.error==="invalid_motion_request"?"La solicitud del guion supera los límites admitidos.":
  result?.error==="request_too_large"?"El texto enviado es demasiado grande para la API.":
  result?.error==="image_invalid_response"?"La imagen generada no tiene un formato válido.":
  result?.error==="image_size_unavailable"?"La imagen excede el tamaño admitido para guardarla.":
  result?.error==="image_url_unavailable"?"La imagen se creó, pero no se pudo generar su vista previa.":
  result?.error==="image_provider_failed"?"El servicio de generación de imágenes falló.":
  result?.error==="image_reference_unavailable"?"No se pudo recuperar el fotograma de referencia.":
  result?.error==="invalid_image_request"?"El prompt de imagen no cumple los límites (35–1800 caracteres).":
  result?.error==="video_not_enabled_for_account"?"La generación de video no está habilitada para esta cuenta.":
  result?.error==="image_storage_unavailable"?"El almacenamiento de imágenes no está disponible.":
  "No se pudo completar la preparación ("+String(result?.error||"http_"+response.status).slice(0,70)+"). Las escenas terminadas siguen guardadas."
 );
 return result;
}
type VoicePreset="elevenlabs"|"alloy"|"nova"|"echo"|"onyx";
type SavedVoiceRevision={id:string;extension:"mp4"|"webm";voice:string;createdAt:string};
type SeedanceSaved={prompt:string;tokens:string[];urls:string[];
 clipPrompt?:string[];needsMotion?:boolean[];
 history?:Record<string,{token:string;url:string}[]>;
 draftTokens?:Record<string,string>;
 voicePreset?:VoicePreset;elevenVoiceId?:string;
 voiceRevisions?:SavedVoiceRevision[];activeRenderId?:string;
 asmrEnabled?:boolean;montageSeconds?:MotionSeconds;narrationEnabled?:boolean;
 seconds?:MotionSeconds};
const VOICE_CHOICES:{id:VoicePreset;label:string;detail:string}[]=[
 {id:"alloy",label:"Alloy",detail:"Equilibrada y natural"},
 {id:"nova",label:"Nova",detail:"Cálida y expresiva"},
 {id:"echo",label:"Echo",detail:"Grave y serena"},
 {id:"onyx",label:"Onyx",detail:"Muy grave y envolvente"},
 {id:"elevenlabs",label:"ElevenLabs",detail:"Voz configurada en tu estudio"}
];
function selectedVoiceName(preset:VoicePreset):string{
 return VOICE_CHOICES.find(choice=>choice.id===preset)?.label||"Narración";
}
const SEEDANCE_KEY="vmv-motion-seedance-director-v5-60s";
function readSeedance(prompt:string):SeedanceSaved{
 const state=readSavedMotion(SEEDANCE_KEY) as Partial<SeedanceSaved>|null;
 if(state?.prompt===prompt&&Array.isArray(state.tokens)&&Array.isArray(state.urls))
  return {prompt,tokens:state.tokens,urls:state.urls,
   clipPrompt:Array.isArray(state.clipPrompt)?state.clipPrompt:[],
   needsMotion:Array.isArray(state.needsMotion)?state.needsMotion:[],
   history:state.history&&typeof state.history==="object"?state.history:{},
   draftTokens:state.draftTokens&&typeof state.draftTokens==="object"?state.draftTokens:{},
   voicePreset:["alloy","nova","echo","onyx","elevenlabs"].includes(String(state.voicePreset))?
    state.voicePreset:"elevenlabs",
   elevenVoiceId:typeof state.elevenVoiceId==="string"?state.elevenVoiceId:"",
   voiceRevisions:Array.isArray(state.voiceRevisions)?state.voiceRevisions:[],
   activeRenderId:typeof state.activeRenderId==="string"?state.activeRenderId:"",
   asmrEnabled:state.asmrEnabled===true,
   montageSeconds:validMotionSeconds(state.montageSeconds)?state.montageSeconds:60,
   narrationEnabled:state.narrationEnabled===true,
   seconds:validMotionSeconds(state.seconds)?state.seconds:undefined};
 return {prompt,tokens:[],urls:[],narrationEnabled:false};
}
function saveSeedance(value:SeedanceSaved){saveMotion(SEEDANCE_KEY,value);}
type MotionProjectArchive={id:string;label:string;savedAt:number;plan:DirectorPlan;seedance:SeedanceSaved;cloudId?:string};
type CloudMotionProject={id:string;title:string;updatedAt:string;clips:number;scenes:number;sceneCount?:number;seconds?:number;coverUrl?:string;ready?:boolean};
type MotionPublishDraft={title:string;caption:string;hashtags:string;platform:string;
 scheduledFor:string;postedAt:string;views:number;leads:number;sales:number;
 revenueUsd:number;spendUsd:number};
const EMPTY_PUBLISH:MotionPublishDraft={title:"",caption:"",hashtags:"",platform:"TikTok",
 scheduledFor:"",postedAt:"",views:0,leads:0,sales:0,revenueUsd:0,spendUsd:0};
const CLOUD_ID_KEY="vmv-motion-cloud-project-v1";
function currentCloudId():string{
 try{
  let id=localStorage.getItem(CLOUD_ID_KEY)||"";
  if(!/^[0-9a-f-]{36}$/i.test(id)){id=crypto.randomUUID();localStorage.setItem(CLOUD_ID_KEY,id);}
  return id;
 }catch{return "";}
}
function setCloudId(id:string){
 if(/^[0-9a-f-]{36}$/i.test(id))try{localStorage.setItem(CLOUD_ID_KEY,id);}catch{}
}
function publishStorageKey(id:string){return "vmv-motion-publish-"+id;}
function readPublishDraft(id:string):MotionPublishDraft{
 try{
  const data=JSON.parse(localStorage.getItem(publishStorageKey(id))||"null");
  if(data&&typeof data==="object")return {...EMPTY_PUBLISH,...data};
 }catch{}
 return {...EMPTY_PUBLISH};
}
async function motionLibrary(accessToken:string,body:Record<string,unknown>){
 const response=await fetch("/api/video-generator/motion-library",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+accessToken},body:JSON.stringify(body)
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(String(result?.error||"motion_library_unavailable"));
 return result;
}
const MOTION_PROJECTS_KEY="vmv-motion-projects-v1";
function archivedMotionProjects():MotionProjectArchive[]{
 try{
  const raw=JSON.parse(localStorage.getItem(MOTION_PROJECTS_KEY)||"[]") as unknown;
  if(!Array.isArray(raw))return [];
  return raw.filter((v):v is MotionProjectArchive=>{
   if(!v||typeof v!=="object")return false;
   const item=v as Partial<MotionProjectArchive>;
   return typeof item.id==="string"&&typeof item.savedAt==="number"&&
    Date.now()-item.savedAt>=0&&Date.now()-item.savedAt<MOTION_RECOVERY_MS&&
    typeof item.plan?.prompt==="string"&&Array.isArray(item.plan.scenes)&&
    validMotionPlan(item.plan)&&
    item.seedance?.prompt===item.plan.prompt;
  }).slice(0,10);
 }catch{return [];}
}
function archiveMotionProject(plan:DirectorPlan){
 const seedance=readSeedance(plan.prompt);
 const current=archivedMotionProjects().filter(item=>item.plan.prompt!==plan.prompt);
 const entry:MotionProjectArchive={id:crypto.randomUUID(),
  label:plan.title||plan.prompt.slice(0,64),savedAt:Date.now(),plan,seedance,cloudId:currentCloudId()};
 try{
  localStorage.setItem(MOTION_PROJECTS_KEY,JSON.stringify([entry,...current].slice(0,10)));
 }catch{throw Error("No se pudo guardar una copia del proyecto anterior. No se inició una historia nueva para evitar perder clips.");}
}
function forgetActiveMotionProject(){
 try{localStorage.removeItem(CLOUD_ID_KEY);}catch{}
 for(const key of [DIRECTOR_PLAN_KEY,SEEDANCE_KEY]){
  try{sessionStorage.removeItem(key);localStorage.removeItem(key+"-recovery");}catch{}
 }
}

async function flushActiveMotionToCloud(plan:DirectorPlan){
 const sb=getSupabase();if(!sb)throw Error("No hay conexión con Supabase.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("La sesión no está activa.");
 const id=currentCloudId();
 await motionLibrary(session.access_token,{action:"save",project:{
  id,plan,seedance:readSeedance(plan.prompt),publish:readPublishDraft(id)
 }});
}
async function seedanceRequest(accessToken:string,body:Record<string,unknown>){
 let response:Response;
 try{
  response=await fetch("/api/video-generator/motion-seedance",{
   method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
    Authorization:"Bearer "+accessToken},body:JSON.stringify(body)
  });
 }catch{throw Error("No hubo respuesta de la red. Revisa tu conexión antes de volver a iniciar la animación; las imágenes siguen guardadas.");}
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  const messages:Record<string,string>={
   motion_limit:"Límite diario de pruebas alcanzado. Los clips terminados se conservan.",
   video_status_unavailable:"No se pudo consultar el estado del trabajo existente. Reintenta sin generar otro.",
   ai_gateway_auth_not_configured:"Vercel AI Gateway no está configurado para Seedance en Preview.",
   ai_gateway_credits_required:"AI Gateway rechazó el pago o un presupuesto. Esto no demuestra falta de saldo.",
   ai_gateway_budget_exceeded:"Un presupuesto de AI Gateway llegó a su límite. El crédito disponible no evita ese bloqueo.",
   ai_gateway_funds_unavailable:"AI Gateway rechazó la operación por saldo utilizable insuficiente en el contexto que la ejecuta.",
   ai_gateway_billing_restricted:"AI Gateway requiere verificar o habilitar la facturación para esta solicitud.",
   ai_gateway_payment_rejected:"AI Gateway devolvió HTTP 402, pero no especificó si es presupuesto o saldo. No compres créditos sin identificar el límite.",
   ai_gateway_rate_limited:"AI Gateway aplicó un límite temporal de solicitudes. Las escenas anteriores se conservan.",
   seedance_invalid_parameters:"Seedance rechazó un parámetro de video. No se ha confirmado una generación nueva.",
   seedance_gateway_unavailable:"El proveedor de Seedance no está disponible. No se ha confirmado una generación nueva.",
   seedance_video_start_failed:"Seedance no pudo iniciar la generación.",
   invalid_video_job:"El identificador de la animación caducó; conserva las imágenes y los clips anteriores.",
   video_not_enabled_for_account:"Tu sesión no tiene acceso al motor de video. Revisa el inicio de sesión.",
   cost_confirmation_required:"Falta confirmar la autorización de la generación.",
   invalid_motion_action:"La solicitud del motor no tiene una acción válida.",
   invalid_scene_list:"El storyboard no tiene doce referencias válidas.",
   invalid_scene_index:"Una escena tiene un número incorrecto.",
   invalid_video_prompt:"La descripción del video no cumple los límites de longitud.",
   seedance_story_bible_too_long:"La descripción visual del storyboard es demasiado larga.",
   seedance_image_owner_mismatch:"La imagen pertenece a una sesión o usuario diferente.",
   seedance_image_path_invalid:"La referencia de la imagen tiene un formato no admitido.",
   seedance_motion_prompt_invalid:"La indicación de movimiento de una escena está vacía o fuera de los límites.",
   storyboard_image_missing:"No se pudo recuperar la imagen original para animarla.",
   image_storage_unavailable:"El almacenamiento temporal de imágenes no respondió.",
   token_signing_secret_missing:"Falta la configuración segura del identificador del trabajo."
  };
  const code=typeof data?.error==="string"?data.error:"";
  const beat=Number.isInteger(data?.beat)?" (escena "+(data.beat+1)+")":"";
  const scopeNames:Record<string,string>={project:"proyecto",team:"equipo",user:"usuario",api_key:"clave API"};
  const scope=code==="ai_gateway_budget_exceeded"&&typeof data?.budgetScope==="string"?
   " Presupuesto afectado: "+(scopeNames[data.budgetScope]||"no identificado")+".":"";
  const knownType=typeof data?.providerType==="string"&&/^[a-z_]{3,60}$/.test(data.providerType)?
   " Motivo del proveedor: "+data.providerType+".":"";
  throw Error((messages[code]||"La API de animación respondió con un error desconocido")+
   " (HTTP "+response.status+(code?", "+code:"")+")"+beat+"."+scope+knownType+
   " Tus imágenes y los clips anteriores se conservan. No se hizo ningún reintento automático.");
 }
 return data;
}
async function loadSeedanceForStitching(accessToken:string,token:string,sourceUrl:string,beat:number):Promise<string>{
 let response:Response;
 try{
  response=await fetch("/api/video-generator/motion-seedance",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
   // Request a short-lived storage URL instead of sending the MP4 through Vercel.
   // Existing archived clips are reused; no new Seedance generation is started.
   body:JSON.stringify({action:"stitch-url",token,sourceUrl})
  });
 }catch{
  throw Error("Escena "+(beat+1)+": no se pudo conectar con el servidor de clips. "+
   "Revisa tu conexión y vuelve a montar; los MP4 guardados se conservan.");
 }
 if(!response.ok){
  const failure=await response.json().catch(()=>null);
  const reason=typeof failure?.error==="string"?failure.error:"unknown";
  const messages:Record<string,string>={
   invalid_video_job:"El identificador del clip caducó. No se generó ningún clip nuevo.",
   video_not_ready:"El trabajo todavía no está completado.",
   video_provider_status_unavailable:"El proveedor no permite consultar el trabajo antiguo. Intentamos recuperar la copia guardada.",
   video_source_expired:"Caducó el enlace temporal del MP4. Si no existe una copia privada, el proveedor debe renovar el enlace.",
   video_source_unavailable:"El servidor que aloja el MP4 no respondió correctamente.",
   video_source_rejected:"El enlace del MP4 no pasó las validaciones de descarga segura.",
   video_source_invalid:"El MP4 es demasiado grande o está incompleto.",
   video_archive_missing:"La copia privada de este MP4 no existe y el trabajo original caducó. Se requiere recuperar el archivo fuente.",
   video_download_unavailable:"No se pudo descargar el MP4.",
   clip_archive_unavailable:"No se pudo guardar el MP4 existente en almacenamiento privado.",
   clip_signed_url_unavailable:"El almacenamiento no permitió acceder al MP4 archivado."
  };
  throw Error("Escena "+(beat+1)+": "+(messages[reason]||"No se pudo recuperar el MP4")+
   " (HTTP "+response.status+", "+reason+"). No se inició otra generación.");
 }
 const ticket=await response.json().catch(()=>null);
 if(typeof ticket?.url!=="string"||!ticket.url.startsWith("https://"))
  throw Error("Escena "+(beat+1)+": no se pudo obtener el enlace seguro del MP4.");
 let clipResponse:Response;
 try{clipResponse=await fetch(ticket.url,{cache:"no-store"});}
 catch{
  throw Error("Escena "+(beat+1)+": la descarga directa del MP4 falló. "+
   "Comprueba la conexión y reintenta sin generar clips nuevos.");
 }
 if(!clipResponse.ok)
  throw Error("Escena "+(beat+1)+": el almacenamiento rechazó la descarga del MP4 "+
   "(HTTP "+clipResponse.status+"). No se generó otro clip.");
 const bytes=await clipResponse.blob();
 if(bytes.size<1000||bytes.size>26000000)
  throw Error("Escena "+(beat+1)+": el MP4 archivado está vacío o incompleto.");
 return URL.createObjectURL(new Blob([bytes],{type:"video/mp4"}));
}
type MotionSfx={audio:ArrayBuffer;start:number};
type MotionMix={music:File|null;musicVolume:number;voiceVolume:number;fadeSeconds:number;
 effects?:MotionSfx[];seconds?:MotionSeconds};
const motionSfxCache=new Map<string,ArrayBuffer>();
async function loadMotionSfx(accessToken:string,prompt:string,scenes:DirectorBeat[],
 seconds:MotionSeconds,onProgress:(step:number)=>void):Promise<MotionSfx[]>{
 if(![3,6,12].includes(scenes.length)||scenes.length*5<seconds)
  throw Error("El número de escenas no coincide con la duración elegida.");
 const effects:MotionSfx[]=[];
 const groups=Math.min(6,scenes.length);
 const perGroup=scenes.length/groups;
 const durationSeconds=seconds/groups;
 for(let slot=0;slot<groups;slot++){
  onProgress(slot+1);
  const descriptions=scenes.slice(slot*perGroup,(slot+1)*perGroup)
   .map(scene=>scene.motionPrompt);
  const cacheKey=JSON.stringify([prompt,durationSeconds,slot,descriptions]);
  let audio=motionSfxCache.get(cacheKey);
  if(!audio){
   const response=await fetch("/api/video-generator/motion-sfx",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
    body:JSON.stringify({confirmCost:true,slot,durationSeconds,topic:prompt,scenes:descriptions})
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=result?.error;
    throw Error(reason==="sfx_not_configured"?
     "ElevenLabs Sound Effects no está configurado en este preview. No se modificaron los clips.": 
     reason==="sfx_credits_required"?"ElevenLabs no tiene créditos disponibles para sonidos. Los clips permanecen guardados.":
     reason==="sfx_access_denied"?"La clave de ElevenLabs no permite generar efectos de sonido. Los clips siguen guardados.":
     reason==="sfx_rate_limited"?"ElevenLabs limitó temporalmente los sonidos. Los ya creados siguen en memoria para reintentar.":
     "No se pudo generar el efecto ASMR "+(slot+1)+"/6. Los clips siguen guardados.");
   }
   if(typeof result?.audio!=="string"||result.audio.length<1000||result.audio.length>3200000)
    throw Error("ElevenLabs devolvió un audio ASMR incompleto.");
   audio=base64ToBuffer(result.audio);
   if(motionSfxCache.size>=24)motionSfxCache.delete(motionSfxCache.keys().next().value!);
   motionSfxCache.set(cacheKey,audio);
  }
  effects.push({audio,start:slot*durationSeconds});
 }
 return effects;
}
async function stitchSeedanceClips(urls:string[],speech:ContinuousSpeech|null=null,showSubtitles=false,
 options:MotionMix={music:null,musicVolume:0.18,voiceVolume:1,fadeSeconds:0.2}
):Promise<{blob:Blob;extension:"mp4"|"webm"}>{
 const outputSeconds=options.seconds||urls.length*5;
 if(![15,30,60].includes(outputSeconds)||![3,6,12].includes(urls.length)||
  outputSeconds>urls.length*5)
  throw Error("La duración elegida no coincide con los clips; conserva las escenas guardadas.");
 const segmentSeconds=outputSeconds/urls.length;
 const playbackSpeed=5/segmentSeconds;
 const format=chosenFormat();
 const canvas=document.createElement("canvas");canvas.width=720;canvas.height=1280;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx||!canvas.captureStream)throw Error("Este navegador no puede unir videos.");
 const stream=canvas.captureStream(24);
 let audioContext:AudioContext|null=null;
 let voiceSource:AudioBufferSourceNode|null=null;
 let musicSource:AudioBufferSourceNode|null=null;
 const effectSources:AudioBufferSourceNode[]=[];
 let recorder:MediaRecorder|null=null;
 let raf=0;
 const videos:HTMLVideoElement[]=[];
 let activePreview:HTMLVideoElement|null=null;
 const requireForeground=()=>{
  if(document.visibilityState!=="visible")
   throw Error("Chrome pausó el montaje al cambiar de pestaña. Vuelve a esta pestaña y reintenta; tus clips están guardados.");
 };
 try{
  requireForeground();
  // Load all local object URLs BEFORE recording to avoid long blank gaps.
  for(const url of urls){
   const video=document.createElement("video");
   video.muted=true;video.playsInline=true;video.preload="auto";video.src=url;
   await new Promise<void>((resolve,reject)=>{
    video.onloadeddata=()=>resolve();
    video.onerror=()=>reject(Error("No se puede decodificar uno de los clips descargados."));
    video.load();
   });
   videos.push(video);
  }
  ctx.fillStyle="#111";ctx.fillRect(0,0,720,1280);
 const cues=speech?captionCues(speech.alignment):[];
 let decodedDuration=0;
 if(speech||options.music||options.effects?.length){
  audioContext=new AudioContext();await audioContext.resume();
  const mix=audioContext.createMediaStreamDestination();
  if(speech){
   const decoded=await audioContext.decodeAudioData(speech.audio.slice(0));
   decodedDuration=decoded.duration;
   const voice=audioContext.createBufferSource();voice.buffer=decoded;
   const gain=audioContext.createGain();gain.gain.value=Math.min(2,Math.max(0,options.voiceVolume));
   voice.connect(gain);gain.connect(mix);
   voiceSource=voice;
  }
  if(options.music){
   const bytes=await options.music.arrayBuffer();
   if(bytes.byteLength>30000000)throw Error("La pista musical supera los 30 MB.");
   const decoded=await audioContext.decodeAudioData(bytes.slice(0));
   if(!decoded.duration||decoded.duration<1)throw Error("La pista musical no contiene audio válido.");
   const background=audioContext.createBufferSource();background.buffer=decoded;background.loop=true;
   const gain=audioContext.createGain();gain.gain.value=Math.min(0.7,Math.max(0,options.musicVolume));
   background.connect(gain);gain.connect(mix);
   musicSource=background;
  }
  for(const effect of options.effects||[]){
   const decoded=await audioContext.decodeAudioData(effect.audio.slice(0));
   if(!decoded.duration||decoded.duration<0.5||decoded.duration>12)
    throw Error("Un efecto ASMR no contiene audio válido.");
   const source=audioContext.createBufferSource();source.buffer=decoded;
   const volume=audioContext.createGain();volume.gain.value=0.85;
   source.connect(volume);volume.connect(mix);
   effectSources.push(source);
  }
  for(const track of mix.stream.getAudioTracks())stream.addTrack(track);
 }
 recorder=new MediaRecorder(stream,{mimeType:format.mime,videoBitsPerSecond:2800000,audioBitsPerSecond:128000});
 const chunks:BlobPart[]=[];
 const finished=new Promise<Blob>((resolve,reject)=>{
  recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder!.onerror=()=>reject(Error("Falló la unión de los clips."));
  recorder!.onstop=()=>chunks.length?resolve(new Blob(chunks,{type:format.mime})):
   reject(Error("El archivo final está vacío."));
 });
  recorder.start(300);
  // Schedule all audio AFTER decoding and starting the recorder, so adding
  // a large music file cannot consume the opening narration before capture.
  if(audioContext){
   const startsAt=audioContext.currentTime+0.04;
   voiceSource?.start(startsAt);
   musicSource?.start(startsAt);
   effectSources.forEach((source,index)=>
    source.start(startsAt+Math.max(0,options.effects?.[index]?.start||0)));

  }
  const videoStart=performance.now();
  const drawCaption=(time:number)=>{
   if(!showSubtitles||!speech)return;
   const cue=cues.find(c=>time>=c.start&&time<=c.end+.08);
   if(!cue)return;
   ctx.font="bold 35px system-ui, sans-serif";ctx.textAlign="center";
   ctx.lineWidth=7;ctx.strokeStyle="#080808";ctx.fillStyle="#ffffff";
   const words=cue.text.split(/\s+/),lines:string[]=[];let line="";
   for(const word of words){const candidate=line?line+" "+word:word;
    if(ctx.measureText(candidate).width>625&&line){lines.push(line);line=word;}else line=candidate;}
   if(line)lines.push(line);
   lines.slice(0,3).forEach((part,n)=>{const y=1090+(n-Math.min(lines.length-1,2))*44;
    ctx.strokeText(part,360,y);ctx.fillText(part,360,y);});
  };
  for(const [index,video] of videos.entries()){
   requireForeground();
   if(activePreview){activePreview.pause();activePreview.remove();activePreview=null;}
   // Chrome can power-pause video-only media not visible in the document.
   video.style.position="fixed";video.style.right="12px";video.style.bottom="12px";
   video.style.width="112px";video.style.height="200px";
   video.style.objectFit="cover";video.style.borderRadius="10px";
   video.style.zIndex="1000";video.style.pointerEvents="none";
   video.style.boxShadow="0 8px 24px rgba(0,0,0,.24)";
   video.setAttribute("aria-label","Vista previa del clip durante el montaje");
   document.body.appendChild(video);activePreview=video;
   video.currentTime=0;
   video.playbackRate=playbackSpeed;
   try{await video.play();}
   catch{throw Error("Chrome interrumpió el clip "+(index+1)+". Mantén esta pestaña visible y vuelve a intentar el montaje; los clips están guardados.");}
   const endTime=speech?.sceneEnds?.[index]??(index+1)*segmentSeconds;
   // Validate actual media progress, not only wall-clock progress. Otherwise a
   // stalled decoder can create seconds of identical frames while audio keeps going.
   const clipStartedAt=performance.now();
   let lastMediaTime=video.currentTime,lastMediaAdvance=clipStartedAt;
   let lastFrameCount=-1,lastFrameAdvance=clipStartedAt;
   const quality=video as HTMLVideoElement&{
    getVideoPlaybackQuality?:()=>{totalVideoFrames:number};
   };
   const startFrameCount=quality.getVideoPlaybackQuality?.().totalVideoFrames;
   if(typeof startFrameCount==="number")lastFrameCount=startFrameCount;
   const segmentStart=index?(speech?.sceneEnds?.[index-1]??index*segmentSeconds):0;
   const expectedLength=endTime-segmentStart;
   if(expectedLength<=0)throw Error("La duración de una escena no es válida.");
   await new Promise<void>((resolve,reject)=>{
    const frame=()=>{
     try{
      requireForeground();
      if(video.paused&&!video.ended)throw Error("paused_by_browser");
      const now=performance.now();
      if(video.currentTime>lastMediaTime+0.035){
       lastMediaTime=video.currentTime;lastMediaAdvance=now;
      }
      const count=quality.getVideoPlaybackQuality?.().totalVideoFrames;
      if(typeof count==="number"){
       if(count>lastFrameCount){lastFrameCount=count;lastFrameAdvance=now;}
       // Some browsers report frame counters that do not update for local blobs;
       // media-time watchdog still applies independently.
      }
      if(now-lastMediaAdvance>1200&&!video.ended)
       throw Error("video_stalled");
      if(typeof count==="number"&&lastFrameCount>=0&&now-lastFrameAdvance>1500&&!video.ended)
       throw Error("video_frames_stalled");
      // A stalled media element must never be treated as a completed 5s clip.
      if((now-clipStartedAt)/1000>expectedLength+2.5)
       throw Error("video_timing_overrun");
      const ratio=Math.max(canvas.width/video.videoWidth,canvas.height/video.videoHeight);
      const width=video.videoWidth*ratio,height=video.videoHeight*ratio;
      ctx.drawImage(video,(720-width)/2,(1280-height)/2,width,height);
      const current=(performance.now()-videoStart)/1000;
      const fade=Math.max(0,Math.min(0.45,options.fadeSeconds));
      if(fade>0){
       const incoming=index>0?Math.max(0,1-(current-segmentStart)/fade):0;
       const outgoing=index<urls.length-1?Math.max(0,1-(endTime-current)/fade):0;
       const opacity=Math.min(0.8,Math.max(incoming,outgoing)*0.8);
       if(opacity>0){ctx.fillStyle="rgba(0,0,0,"+opacity+")";ctx.fillRect(0,0,720,1280);}
      }
      drawCaption(Math.max(0,current));
      if((performance.now()-videoStart)/1000>=endTime){
       const expectedMediaProgress=Math.min(video.duration||expectedLength,
        expectedLength*playbackSpeed);
       if(!video.ended&&video.currentTime+0.4<expectedMediaProgress)
        throw Error("video_incomplete");
       resolve();return;
      }
      raf=requestAnimationFrame(frame);
     }catch{
      reject(Error("La imagen del clip "+(index+1)+" dejó de avanzar durante el montaje. Se canceló la exportación para evitar un video congelado con audio. Vuelve a intentarlo en una pestaña visible; los clips siguen guardados."));
     }
    };
    raf=requestAnimationFrame(frame);
   });
   video.pause();
  }
  // Hold the final video frame if the complete narration runs longer than its images.
  const remaining=Math.max(0,decodedDuration-((performance.now()-videoStart)/1000)+0.3);
  if(remaining>0&&speech){
   await new Promise<void>(resolve=>{
    const until=performance.now()+remaining*1000;
    const draw=()=>{
     drawCaption(Math.max(0,(performance.now()-videoStart)/1000));
     if(performance.now()>=until){resolve();return;}
     raf=requestAnimationFrame(draw);
    };raf=requestAnimationFrame(draw);
   });
  }
  recorder.stop();
  const blob=await finished;
  return {blob,extension:format.extension};
 }finally{
  if(activePreview){activePreview.pause();activePreview.remove();}
  cancelAnimationFrame(raf);
  if(recorder!==null){const finalRecorder=recorder as MediaRecorder;if(finalRecorder.state!=="inactive")finalRecorder.stop();}
  for(const video of videos){video.pause();video.removeAttribute("src");video.load();}
  stream.getTracks().forEach(track=>track.stop());
  if(audioContext)void audioContext.close();
 }
}

export default function StickmanLabPage(){
 const router=useRouter();
 const [auth,setAuth]=useState<"checking"|"signed_in"|"signed_out">("checking");
 const [authClient,setAuthClient]=useState<SupabaseClient|null>(null);
 const [topic,setTopic]=useState<StickmanTopic>("space");
 const [customPrompt,setCustomPrompt]=useState("");
 const [pilotAuto,setPilotAuto]=useState(false);
 const [pilotVoiceProvider,setPilotVoiceProvider]=useState<"openai"|"elevenlabs">("elevenlabs");
 const [pilotVoiceId,setPilotVoiceId]=useState("");
 const [voicePreset,setVoicePreset]=useState<VoicePreset>("elevenlabs");
 const [voiceEditorOpen,setVoiceEditorOpen]=useState(false);
 const [voiceRevisions,setVoiceRevisions]=useState<SavedVoiceRevision[]>([]);
 const [activeRenderId,setActiveRenderId]=useState("");
 const autoStartRef=useRef(false);
 const [researchSource,setResearchSource]=useState<{scanId:string;videoId:string}|null>(null);
 const [customMode,setCustomMode]=useState(false);
 const [archivedProjects,setArchivedProjects]=useState<MotionProjectArchive[]>([]);
 const [cloudProjects,setCloudProjects]=useState<CloudMotionProject[]>([]);
 const [cloudStatus,setCloudStatus]=useState("Local");
 const [cloudLoading,setCloudLoading]=useState(false);
 const [libraryOpen,setLibraryOpen]=useState(false);
 const [activeLibraryId,setActiveLibraryId]=useState("");
 const [projectSwitching,setProjectSwitching]=useState(false);
 const [bootstrapping,setBootstrapping]=useState(true);
 const [clipPreviewLoading,setClipPreviewLoading]=useState(false);
 const [characterLoading,setCharacterLoading]=useState(false);
 const [renderLoading,setRenderLoading]=useState(false);
 const [studioStep,setStudioStep]=useState<"crear"|"revisar"|"editar"|"publicar">("crear");
 const [publishDraft,setPublishDraft]=useState<MotionPublishDraft>({...EMPTY_PUBLISH});
 const [selectedScene,setSelectedScene]=useState(0);
 const [motionDraft,setMotionDraft]=useState("");
 const [sceneRendering,setSceneRendering]=useState<number|null>(null);
 const [narrationVolume,setNarrationVolume]=useState(100);
 const [musicVolume,setMusicVolume]=useState(18);
 const [fadeSeconds,setFadeSeconds]=useState(0.2);
 const [asmrEnabled,setAsmrEnabled]=useState(false);
 const [montageSeconds,setMontageSeconds]=useState<MotionSeconds>(60);
 const manualDurationRef=useRef(false);
 const [musicFile,setMusicFile]=useState<File|null>(null);
 const [shareStatus,setShareStatus]=useState("");
 const [libraryShare,setLibraryShare]=useState<{id:string;url:string;filename:string;expiresAt:string}|null>(null);
 const [libraryShareBusy,setLibraryShareBusy]=useState("");
 const [libraryShareNotice,setLibraryShareNotice]=useState("");
 const [libraryShareError,setLibraryShareError]=useState<"missing-video"|"no-project"|"unavailable"|null>(null);
 const [libraryShareTargetId,setLibraryShareTargetId]=useState("");
 const libraryShareInputRef=useRef<HTMLInputElement|null>(null);
 const [characterGuide,setCharacterGuide]=useState("");
 const [characterFrames,setCharacterFrames]=useState<DirectorFrame[]>([]);
 const [characterReferencePath,setCharacterReferencePath]=useState("");
 const [selectedClipPreview,setSelectedClipPreview]=useState("");
 const clipPreviewRef=useRef("");


 const [lastRenderedCloudUrl,setLastRenderedCloudUrl]=useState("");


 const [terraStory,setTerraStory]=useState<StickmanStory|null>(null);
 const [language,setLanguage]=useState<StickmanLanguage>("es");
 const [subtitles,setSubtitles]=useState(true),[withVoice,setWithVoice]=useState(false);
 const [voice,setVoice]=useState<"alloy"|"nova">("alloy");
 const [playing,setPlaying]=useState(true),[rendering,setRendering]=useState(false);
 const [progress,setProgress]=useState(0),[stage,setStage]=useState("");
 const [videoUrl,setVideoUrl]=useState(""),[extension,setExtension]=useState<"mp4"|"webm">("webm");
 const [error,setError]=useState("");
 const [directorBusy,setDirectorBusy]=useState(false);
 const [directorStatus,setDirectorStatus]=useState("");
 const [directorPlan,setDirectorPlan]=useState<DirectorPlan|null>(null);
 const [framesRefreshing,setFramesRefreshing]=useState(false);
 const [frameRefreshError,setFrameRefreshError]=useState("");
 const frameRefreshPromptRef=useRef("");
 const [regeneratingScene,setRegeneratingScene]=useState<number|null>(null);
 const [editingSpeech,setEditingSpeech]=useState<number|null>(null);
 const [speechDraft,setSpeechDraft]=useState("");
 const [previousScene,setPreviousScene]=useState<number|null>(null);
 const directorBusyRef=useRef(false);
 const [seedBusy,setSeedBusy]=useState(false);
 const [seedStage,setSeedStage]=useState("");
 const [seedUrls,setSeedUrls]=useState<string[]>([]);
 const [savedClipCount,setSavedClipCount]=useState(0);
 const [seedJoined,setSeedJoined]=useState("");
 const [seedJoining,setSeedJoining]=useState(false);
 const seedJoinedRef=useRef("");
 const seedBusyRef=useRef(false);
 const [miniBusy,setMiniBusy]=useState(false);
 const [miniStage,setMiniStage]=useState("");
 const [miniUrl,setMiniUrl]=useState("");
 const miniBusyRef=useRef(false);
 const canvas=useRef<HTMLCanvasElement>(null);
 const pendingStoryboard=useRef<PendingStoryboard>({prompt:"",images:[]});
 const playingRef=useRef(true),renderingRef=useRef(false),urlRef=useRef("");
 const timelineRef=useRef(0),lastFrameRef=useRef(0);
 const story=customMode?(terraStory|| (customPrompt.trim().length>=8?userStickmanStory(customPrompt):stickmanStory(topic,language))):stickmanStory(topic,language);
 useEffect(()=>{
  if(bootstrapping||pilotAuto||!customMode||studioStep!=="crear"||directorPlan||manualDurationRef.current)return;
  const detected=durationFromPrompt(customPrompt);
  if(detected&&detected!==montageSeconds)setMontageSeconds(detected);
 },[bootstrapping,pilotAuto,customMode,studioStep,directorPlan,customPrompt,montageSeconds]);
 useEffect(()=>{setMotionDraft(directorPlan?.scenes?.[selectedScene]?.motionPrompt||"");},
  [selectedScene,directorPlan?.prompt,directorPlan?.scenes?.[selectedScene]?.motionPrompt]);
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
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);if(seedJoinedRef.current)URL.revokeObjectURL(seedJoinedRef.current);if(clipPreviewRef.current)URL.revokeObjectURL(clipPreviewRef.current);},[]);
 useEffect(()=>{
  setArchivedProjects(archivedMotionProjects());
  try{setCharacterGuide(localStorage.getItem("vmv-motion-character-guide-v1")||"");}catch{}
 },[]);
 // Debounced, owner-authenticated cloud backup. It never triggers generation.
 useEffect(()=>{
  if(auth!=="signed_in")return;
  let closed=false;let timer:ReturnType<typeof setTimeout>|null=null;
  const sync=async()=>{
   const saved=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
   if(!saved?.prompt||!validMotionPlan(saved))return;
   const sb=getSupabase();if(!sb)return;
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)return;
   const id=currentCloudId();if(!id)return;
   setCloudStatus("Guardando…");
   try{
    const result=await motionLibrary(session.access_token,{action:"save",
     project:{id,plan:saved,seedance:readSeedance(saved.prompt),publish:readPublishDraft(id)}});
    if(closed)return;
    setCloudStatus("En la nube");
    setCloudProjects(current=>{
     const entry:CloudMotionProject={id,title:saved.title||"Proyecto",
      updatedAt:String(result.updatedAt||""),clips:readSeedance(saved.prompt).urls.filter(Boolean).length,
      scenes:saved.frames.length,sceneCount:saved.scenes.length,seconds:saved.scenes.length*5,
      ready:Boolean(lastRenderedCloudUrl)||Boolean(current.find(item=>item.id===id)?.ready)};
     return [entry,...current.filter(item=>item.id!==id)].slice(0,40);
    });
   }catch{if(!closed)setCloudStatus("Solo en este dispositivo · comprueba la conexión");}
  };
  const schedule=()=>{
   if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{void sync();},1400);
  };
  window.addEventListener("vmv-motion-saved",schedule);
  const load=async()=>{
   const sb=getSupabase();if(!sb)return;
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token||closed)return;
   setCloudLoading(true);
   try{
    const result=await motionLibrary(session.access_token,{action:"list"});
    if(!closed)setCloudProjects(Array.isArray(result.projects)?result.projects:[]);
   }catch{if(!closed)setCloudStatus("La biblioteca en la nube no respondió");}
   if(!closed)setCloudLoading(false);
  };
  void load();schedule();
  return()=>{closed=true;if(timer)clearTimeout(timer);
   window.removeEventListener("vmv-motion-saved",schedule);};
 },[auth]);
 const shareLibraryVideo=useCallback(async(id:string)=>{
  if(libraryShareBusy)return;
  setLibraryShareBusy(id);setLibraryShare(null);setLibraryShareNotice("");
  setLibraryShareError(null);setLibraryShareTargetId(id);
  try{
   const sb=getSupabase();if(!sb)throw Error("Inicia sesión para compartir el video.");
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para compartir el video.");
   const result=await motionLibrary(session.access_token,{action:"render-share",id});
   if(typeof result?.url!=="string"||!result.url.startsWith("https://"))
    throw Error("No se pudo crear un enlace de descarga seguro.");
   setLibraryShare({id,url:result.url,filename:String(result.filename||"VMV-Motion.mp4"),
    expiresAt:String(result.expiresAt||"")});
   setLibraryShareNotice("Enlace creado: cualquiera que lo tenga podrá descargar el video durante 7 días.");
  }catch(e){
   const message=e instanceof Error?e.message:"";
   setLibraryShareError(message==="motion_render_not_found"?"missing-video":
    message==="motion_project_not_found"?"no-project":"unavailable");
   setLibraryShareNotice("");
   if(message==="motion_render_not_found")
    setCloudProjects(current=>current.map(item=>item.id===id?{...item,ready:false}:item));
  }finally{setLibraryShareBusy("");}
 },[libraryShareBusy]);
 const copyLibraryShare=useCallback(async()=>{
  if(!libraryShare)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard_unavailable");
   await navigator.clipboard.writeText(libraryShare.url);
   setLibraryShareNotice("Enlace copiado. Puedes enviarlo por mensaje o correo.");
  }catch{
   const field=libraryShareInputRef.current;
   if(field){
    field.focus();field.select();
    try{
     if(document.execCommand("copy")){
      setLibraryShareNotice("Enlace copiado. Ya puedes enviarlo.");
      return;
     }
    }catch{}
   }
   setLibraryShareNotice("El enlace está seleccionado: pulsa Ctrl+C (o Cmd+C) para copiarlo.");
  }
 },[libraryShare]);
 const refreshLibrary=useCallback(async()=>{
  const sb=getSupabase();
  if(!sb)return;
  setCloudLoading(true);
  try{
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para ver tus videos.");
   const result=await motionLibrary(session.access_token,{action:"list"});
   setCloudProjects(Array.isArray(result.projects)?result.projects:[]);
   setError("");
  }catch(e){
   setError(e instanceof Error?e.message:"La biblioteca no está disponible. Tus proyectos locales siguen guardados.");
  }finally{setCloudLoading(false);}
 },[]);
 const importCharacters=useCallback(async(id:string)=>{
  const sb=getSupabase();if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)return;
  setCharacterLoading(true);
  try{
   const result=await motionLibrary(session.access_token,{action:"load",id});
   const guide=String(result.project?.plan?.storyBible||"").slice(0,1100);
   if(!guide)throw Error("Ese proyecto no tiene una guía visual guardada.");
   setCharacterGuide(guide);
   try{localStorage.setItem("vmv-motion-character-guide-v1",guide);}catch{}
   const frames=Array.isArray(result.project?.plan?.frames)?
    result.project.plan.frames as DirectorFrame[]:[];
   const previews=await Promise.all(frames.slice(0,12).map(async frame=>{
    try{
     const signed=await directorCall(session.access_token,"/api/video-generator/motion-image",
      {action:"preview",referencePath:frame.referencePath});
     return {...frame,imageUrl:signed.imageUrl as string};
    }catch{return frame;}
   }));
   setCharacterFrames(previews);setCharacterReferencePath("");
   setShareStatus("Selecciona un fotograma que muestre bien al personaje que deseas conservar.");
  }catch(e){setError(e instanceof Error?e.message:"No se encontró la guía de personajes.");}
  finally{setCharacterLoading(false);}
 },[]);
 const previewSelectedClip=useCallback(async(index:number)=>{
  if(clipPreviewRef.current){URL.revokeObjectURL(clipPreviewRef.current);clipPreviewRef.current="";}
  setSelectedClipPreview("");
  const job=readSeedance(customPrompt);
  if(!job.tokens[index])return;
  const sb=getSupabase();if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)return;
  setClipPreviewLoading(true);
  try{
   const url=await loadSeedanceForStitching(session.access_token,job.tokens[index],job.urls[index],index);
   clipPreviewRef.current=url;setSelectedClipPreview(url);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la vista previa.");}
  finally{setClipPreviewLoading(false);}
 },[customPrompt]);
 const updatePublish=useCallback((patch:Partial<MotionPublishDraft>)=>{
  setPublishDraft(current=>{
   const next={...current,...patch};
   const id=currentCloudId();
   if(id)try{localStorage.setItem(publishStorageKey(id),JSON.stringify(next));}catch{}
   window.dispatchEvent(new Event("vmv-motion-saved"));
   return next;
  });
 },[]);

 useEffect(()=>{
  try{
   const requestId=new URLSearchParams(window.location.search).get("pilotMotion");
   const handoff=JSON.parse(sessionStorage.getItem(PILOT_MOTION_HANDOFF_KEY)||"null") as PilotMotionHandoff|null;
   if(requestId&&handoff?.requestId===requestId&&handoff.confirmedCost===true&&
    handoff.createdAt>Date.now()-2*60*60*1000&&handoff.createdAt<=Date.now()+30000&&
    validMotionSeconds(handoff.seconds)&&handoff.style==="stickman"&&
    ["es","en"].includes(handoff.language)&&handoff.prompt.length>=8&&handoff.prompt.length<=2000){
    const old=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
    if(old?.prompt&&old.prompt!==handoff.prompt){
     archiveMotionProject(old);
     forgetActiveMotionProject();
     setArchivedProjects(archivedMotionProjects());
    }
    setCustomPrompt(handoff.prompt);setCustomMode(true);
    setLanguage(handoff.language as StickmanLanguage);
    setSubtitles(handoff.subtitles);setWithVoice(handoff.narration);
    const handed=readSeedance(handoff.prompt);
    handed.narrationEnabled=handoff.narration;
    handed.seconds=handoff.seconds;
    handed.montageSeconds=handoff.seconds;
    manualDurationRef.current=true;
    setMontageSeconds(handoff.seconds);
    saveSeedance(handed);
    setPilotVoiceProvider(handoff.voiceProvider==="openai"?"openai":"elevenlabs");
    setPilotVoiceId(handoff.voiceId||"");
    setVoicePreset(handoff.voiceProvider==="openai"?
     (["alloy","nova","echo","onyx"].includes(handoff.voiceId)?handoff.voiceId as VoicePreset:"alloy"):
     "elevenlabs");
    setResearchSource(handoff.researchScanId&&handoff.researchVideoId?{scanId:handoff.researchScanId,videoId:handoff.researchVideoId}:null);
    setDirectorPlan(readDirectorPlan(handoff.prompt));
    setSavedClipCount(readSeedance(handoff.prompt).urls.filter(Boolean).length);
    setPilotAuto(true);setStudioStep("revisar");return;
   }
   const saved=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
   if(saved?.prompt&&typeof saved.prompt==="string"&&validMotionPlan(saved)){
    // Migrate this tab's existing project into cross-tab recovery storage.
    saveDirectorPlan(saved);
    const recovered=readSeedance(saved.prompt);
    if(recovered.urls.length||recovered.tokens.length)saveSeedance(recovered);
    setVoicePreset(recovered.voicePreset||"elevenlabs");
    setPilotVoiceId(recovered.elevenVoiceId||"");
    setAsmrEnabled(recovered.asmrEnabled===true);
    manualDurationRef.current=true;
    setMontageSeconds(validMotionSeconds(recovered.montageSeconds)?recovered.montageSeconds:baseMotionSeconds(saved));
    setPilotVoiceId(recovered.elevenVoiceId||"");
    setVoiceRevisions(recovered.voiceRevisions||[]);
    setActiveRenderId(recovered.activeRenderId||"");
    setCustomPrompt(saved.prompt);setCustomMode(true);
    setWithVoice(recovered.narrationEnabled===true&&!recovered.asmrEnabled);
    setSavedClipCount(readSeedance(saved.prompt).urls.filter(Boolean).length);
    const plan=readDirectorPlan(saved.prompt);
    if(plan){setDirectorPlan(plan);setStudioStep(recovered.urls.filter(Boolean).length===plan.scenes.length?"editar":"revisar");}
    setPublishDraft(readPublishDraft(currentCloudId()));
   }
  }catch{}
  finally{setBootstrapping(false);}
 },[]);
 // Frame objects remain in private storage; signed preview URLs expire.
 // "preview" only signs existing frames and never triggers model charges.
 const refreshDirectorFrames=useCallback(async(prompt:string,force=false)=>{
  if(!prompt||(frameRefreshPromptRef.current===prompt&&!force))return;
  const client=getSupabase();if(!client)return;
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)return;
  const saved=readDirectorPlan(prompt);
  if(!saved?.frames.length)return;
  frameRefreshPromptRef.current=prompt;
  setFramesRefreshing(true);setFrameRefreshError("");
  const paths=new Set<string>();
  for(const frame of saved.frames)if(frame.referencePath)paths.add(frame.referencePath);
  for(const versions of Object.values(saved.previous||{}))
   for(const frame of versions)if(frame.referencePath)paths.add(frame.referencePath);
  const fresh=new Map<string,string>();
  for(const path of paths){
   try{
    const result=await directorCall(session.access_token,"/api/video-generator/motion-image",
     {action:"preview",referencePath:path});
    if(typeof result?.imageUrl==="string"&&result.imageUrl.startsWith("https://"))
     fresh.set(path,result.imageUrl);
   }catch{}
  }
  // Keep latest narration edits and approval decisions intact; replace URLs only.
  const latest=readDirectorPlan(prompt);
  if(latest&&fresh.size){
   const remap=(frame:DirectorFrame):DirectorFrame=>{
    const url=fresh.get(frame.referencePath);
    return url?{...frame,imageUrl:url}:frame;
   };
   const previous:Record<string,DirectorFrame[]>={};
   for(const [key,versions] of Object.entries(latest.previous||{}))
    previous[key]=versions.map(remap);
   const updated={...latest,frames:latest.frames.map(remap),previous};
   saveDirectorPlan(updated);
   setDirectorPlan(current=>current?.prompt===prompt?updated:current);
  }
  if(fresh.size<paths.size)
   setFrameRefreshError("No se pudieron cargar algunas imágenes. Puedes reintentar sin generar otras.");
  setFramesRefreshing(false);
 },[]);
 useEffect(()=>{
  if(auth==="signed_in"&&directorPlan?.prompt)
   void refreshDirectorFrames(directorPlan.prompt);
 },[auth,directorPlan?.prompt,refreshDirectorFrames]);
 const resetForProject=useCallback((prompt="")=>{
  manualDurationRef.current=false;
  setCustomPrompt(prompt);setCustomMode(true);setPilotAuto(false);
  setStudioStep(prompt?"revisar":"crear");
  setResearchSource(null);setDirectorPlan(null);setTerraStory(null);
  setSeedUrls([]);setSavedClipCount(0);setSeedJoined("");
  if(clipPreviewRef.current){URL.revokeObjectURL(clipPreviewRef.current);clipPreviewRef.current="";}
  setSelectedClipPreview("");setSelectedScene(0);
  setMusicFile(null);setAsmrEnabled(false);setMontageSeconds(60);setShareStatus("");
  setLibraryShare(null);setLibraryShareError(null);setLibraryShareNotice("");
  setVoicePreset("elevenlabs");setPilotVoiceId("");setVoiceEditorOpen(false);
  setVoiceRevisions([]);setActiveRenderId("");
  setDirectorStatus("");setError("");setPreviousScene(null);
  frameRefreshPromptRef.current="";setFrameRefreshError("");
  setEditingSpeech(null);setSpeechDraft("");
  setWithVoice(false);setSubtitles(true);
  autoStartRef.current=false;
  pendingStoryboard.current={prompt:"",images:[]};
  if(seedJoinedRef.current){URL.revokeObjectURL(seedJoinedRef.current);seedJoinedRef.current="";}
 },[]);
 const restoreCloudProject=useCallback(async(id:string,changeVoice=false)=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const sb=getSupabase();if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)return;
  setCloudLoading(true);setProjectSwitching(true);setError("");
  try{
   const result=await motionLibrary(session.access_token,{action:"load",id});
   const project=result.project as {id:string;plan:DirectorPlan;seedance:SeedanceSaved;
    publish?:Partial<MotionPublishDraft>};
   if(!project?.plan||!project.seedance)throw Error("Proyecto incompleto.");
   const active=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
   if(active?.prompt&&validMotionPlan(active)&&currentCloudId()!==id)
    archiveMotionProject(active);
   resetForProject(project.plan.prompt);
   setCloudId(id);
   saveDirectorPlan(project.plan);
   saveSeedance(project.seedance);
   const draft={...EMPTY_PUBLISH,...project.publish};
   try{localStorage.setItem(publishStorageKey(id),JSON.stringify(draft));}catch{}
   setPublishDraft(draft);
   setDirectorPlan(project.plan);
   setSavedClipCount(project.seedance.urls.filter(Boolean).length);
   setVoicePreset(project.seedance.voicePreset||"elevenlabs");
   setAsmrEnabled(changeVoice?false:project.seedance.asmrEnabled===true);
   manualDurationRef.current=true;
   setMontageSeconds(validMotionSeconds(project.seedance.montageSeconds)?project.seedance.montageSeconds:baseMotionSeconds(project.plan));
   setWithVoice(changeVoice||project.seedance.narrationEnabled===true&&
    project.seedance.asmrEnabled!==true);
   setPilotVoiceId(project.seedance.elevenVoiceId||"");
   setVoiceRevisions(project.seedance.voiceRevisions||[]);
   setActiveRenderId(project.seedance.activeRenderId||"");
   setVoiceEditorOpen(changeVoice);
   setStudioStep(project.seedance.urls.filter(Boolean).length===project.plan.scenes.length?"editar":"revisar");
   setLastRenderedCloudUrl("");
   const current=project.seedance.voiceRevisions?.find(
    revision=>revision.id===project.seedance.activeRenderId);
   const candidates:[string,"mp4"|"webm"][]=[
    ...(current?[[current.id,current.extension] as [string,"mp4"|"webm"]]:[]),
    ["","mp4"],["","webm"]
   ];
   for(const [revisionId,ext] of candidates){
    try{
     const savedVideo=await motionLibrary(session.access_token,{
      action:"render-url",id,extension:ext,...(revisionId?{revisionId}:{})
     });
     if(typeof savedVideo.url==="string"){
      setSeedJoined(savedVideo.url);setExtension(ext);setLastRenderedCloudUrl(savedVideo.url);
      setActiveRenderId(revisionId);
      if(!changeVoice)setStudioStep("publicar");
      break;
     }
    }catch{}
   }
   setCloudStatus("Proyecto recuperado");
   setArchivedProjects(archivedMotionProjects());setLibraryOpen(false);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir el proyecto guardado.");}
  finally{setCloudLoading(false);setProjectSwitching(false);}
 },[resetForProject]);
 const newMotionProject=useCallback(async()=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  setProjectSwitching(true);
  const active=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
  try{
   if(active?.prompt&&validMotionPlan(active)){
    archiveMotionProject(active);
    try{await flushActiveMotionToCloud(active);}
    catch{setCloudStatus("La copia local se conservó; la sincronización en la nube está pendiente.");}
   }
   forgetActiveMotionProject();
   resetForProject();setLibraryOpen(false);
   setPublishDraft({...EMPTY_PUBLISH});setLastRenderedCloudUrl("");
   setArchivedProjects(archivedMotionProjects());
   router.replace("/vista-app/vmv-pilot/stickman-lab");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el proyecto anterior.");}
  finally{setProjectSwitching(false);}
 },[resetForProject,router]);
 const restoreMotionProject=useCallback(async(id:string,changeVoice=false)=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const selected=archivedMotionProjects().find(item=>item.id===id);
  if(!selected)return;
  setProjectSwitching(true);
  try{
   const active=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
   if(active?.prompt&&active.prompt!==selected.plan.prompt&&validMotionPlan(active)){
    archiveMotionProject(active);
    try{await flushActiveMotionToCloud(active);}
    catch{setCloudStatus("El proyecto anterior se conservó localmente; la nube no respondió.");}
   }
   resetForProject(selected.plan.prompt);
   setCloudId(selected.cloudId||crypto.randomUUID());
   saveDirectorPlan(selected.plan);
   saveSeedance(selected.seedance);
   setPublishDraft(readPublishDraft(currentCloudId()));
   setDirectorPlan(selected.plan);
   setSavedClipCount(selected.seedance.urls.filter(Boolean).length);
   setVoicePreset(selected.seedance.voicePreset||"elevenlabs");
   setAsmrEnabled(changeVoice?false:selected.seedance.asmrEnabled===true);
   manualDurationRef.current=true;
   setMontageSeconds(validMotionSeconds(selected.seedance.montageSeconds)?selected.seedance.montageSeconds:baseMotionSeconds(selected.plan));
   setWithVoice(changeVoice||selected.seedance.narrationEnabled===true&&
    selected.seedance.asmrEnabled!==true);
   setPilotVoiceId(selected.seedance.elevenVoiceId||"");
   setVoiceRevisions(selected.seedance.voiceRevisions||[]);
   setActiveRenderId(selected.seedance.activeRenderId||"");
   setVoiceEditorOpen(changeVoice);
   setStudioStep(selected.seedance.urls.filter(Boolean).length===selected.plan.scenes.length?"editar":"revisar");
   const remaining=archivedMotionProjects().filter(item=>item.id!==id);
   try{localStorage.setItem(MOTION_PROJECTS_KEY,JSON.stringify(remaining));}catch{}
   setArchivedProjects(remaining);setLibraryOpen(false);
   router.replace("/vista-app/vmv-pilot/stickman-lab");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir el proyecto.");}
  finally{setProjectSwitching(false);}
 },[resetForProject,router]);
 const pollMinimax=useCallback(async(token:string,accessToken:string)=>{
  setMiniStage("MiniMax está animando los personajes");
  for(let i=0;i<120;i++){
   const result=await minimaxRequest(accessToken,{action:"status",token});
   if(result?.status==="completed"){
    const url=typeof result.url==="string"?result.url:"";
    if(!/^https:\/\//.test(url))throw Error("MiniMax no devolvió un video válido.");
    setMiniUrl(url);setMiniStage("Video MiniMax terminado");
    try{sessionStorage.removeItem(MINIMAX_PENDING_KEY);}catch{}
    return;
   }
   if(result?.status==="failed"){
    try{sessionStorage.removeItem(MINIMAX_PENDING_KEY);}catch{}
    throw Error("MiniMax no pudo completar el video. Comprueba el historial de AI Gateway.");
   }
   await new Promise<void>(resolve=>setTimeout(resolve,5000));
  }
  throw Error("La generación sigue en proceso. Puedes volver a consultar el estado desde esta pestaña.");
 },[]);
 const generateMinimax=useCallback(async()=>{
  if(miniBusyRef.current||renderingRef.current||customPrompt.trim().length<8)return;
  miniBusyRef.current=true;setMiniBusy(true);setError("");setMiniUrl("");
  try{
   const sb=getSupabase();if(!sb)throw Error("Inicia sesión para generar video.");
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para generar video.");
   let token="";
   try{const saved=JSON.parse(sessionStorage.getItem(MINIMAX_PENDING_KEY)||"null");
    if(saved?.prompt===customPrompt&&typeof saved.token==="string")token=saved.token;
   }catch{}
   if(!token){
    setMiniStage("Enviando trabajo a MiniMax");
    const result=await minimaxRequest(session.access_token,{action:"start",prompt:customPrompt,confirmCost:true});
    if(typeof result?.token!=="string")throw Error("MiniMax no entregó un identificador de video.");
    token=result.token;
    try{sessionStorage.setItem(MINIMAX_PENDING_KEY,JSON.stringify({prompt:customPrompt,token}));}catch{}
   }
   await pollMinimax(token,session.access_token);
  }catch(e){setError(e instanceof Error?e.message:"Falló la generación MiniMax.");setMiniStage("");}
  finally{miniBusyRef.current=false;setMiniBusy(false);}
 },[customPrompt,pollMinimax]);

 const prepareStoryboard=useCallback(async()=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current||customPrompt.trim().length<8)return;
  directorBusyRef.current=true;setDirectorBusy(true);setError("");
  try{
   const client=getSupabase();if(!client)throw Error("Inicia sesión para preparar las escenas.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para preparar las escenas.");
   const accessToken=session.access_token;
   let plan=readDirectorPlan(customPrompt);
   // Respect the creator's visible duration, not a stale value from a previous draft.
   const chosenSeconds=plan?baseMotionSeconds(plan):montageSeconds;
   const requiredScenes=sceneTotal(plan,chosenSeconds);
   if(!plan){
    const saved=readSeedance(customPrompt);
    saved.seconds=chosenSeconds;saved.montageSeconds=chosenSeconds;
    saveSeedance(saved);
    setDirectorStatus("Preparando guion de "+chosenSeconds+" s y "+requiredScenes+" escenas");
    const result=await directorCall(accessToken,"/api/video-generator/motion-terra",{prompt:customPrompt,seconds:chosenSeconds,
    ...(characterGuide?{characterGuide}:{}),
    ...(pilotAuto&&researchSource?{researchScanId:researchSource.scanId,researchVideoId:researchSource.videoId}:{})});
    if(!Array.isArray(result.scenes)||result.scenes.length!==requiredScenes)
     throw Error("La IA no devolvió "+requiredScenes+" escenas.");
    plan={prompt:customPrompt,title:String(result.title||"VMV Motion"),storyBible:String(result.storyBible||""),seconds:chosenSeconds,
     scenes:result.scenes.map((row:DirectorBeat)=>({
      speech:row.speech,caption:row.caption,imagePrompt:row.imagePrompt,motionPrompt:row.motionPrompt||row.imagePrompt
     })),frames:[],approved:[],draftPrompts:result.scenes.map((row:DirectorBeat)=>row.imagePrompt),previous:{}};
    saveDirectorPlan(plan);
   }
   setDirectorPlan({...plan});
   for(let i=plan.frames.length;i<requiredScenes;i++){
    setDirectorStatus("Creando imagen "+(i+1)+"/"+requiredScenes);
    const image=await directorCall(accessToken,"/api/video-generator/motion-image",{
     mode:"storyframe",
     ...(characterReferencePath?{referencePath:characterReferencePath,referenceMode:"character"}:{}),
     prompt:["GLOBAL ART DIRECTION AND RECURRING CHARACTER TRAITS: "+plan.storyBible,
      "THIS SHOT ONLY: "+plan.scenes[i].imagePrompt,
      "Draw only this shot. Preserve the same recurring cast and art style, without copying unrelated objects from other scenes."].join(" ").slice(0,1750)
    });
    if(typeof image.imageUrl!=="string"||typeof image.referencePath!=="string")
     throw Error("No se obtuvo la imagen de la escena "+(i+1)+".");
    plan.frames.push({imageUrl:image.imageUrl,referencePath:image.referencePath,prompt:plan.scenes[i].imagePrompt});
    saveDirectorPlan(plan);setDirectorPlan({...plan,frames:[...plan.frames]});
   }
   if(pilotAuto&&plan.frames.length===requiredScenes){
    plan.approved=Array(requiredScenes).fill(true);
    saveDirectorPlan(plan);setDirectorPlan({...plan,approved:[...plan.approved]});
   }
   setDirectorStatus(pilotAuto?"Storyboard listo · el piloto preparará las animaciones":"Revisa las "+requiredScenes+" escenas y apruébalas antes de animar");
   setStudioStep("revisar");
  }catch(e){
   setError(e instanceof Error?e.message:"No se pudieron preparar las imágenes.");
   setDirectorStatus("");
  }finally{directorBusyRef.current=false;setDirectorBusy(false);}
 },[customPrompt,pilotAuto,researchSource,characterGuide,characterReferencePath,montageSeconds]);
 const beginSpeechEdit=useCallback((index:number)=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const plan=readDirectorPlan(customPrompt);
  if(!plan?.scenes[index])return;
  setSpeechDraft(plan.scenes[index].speech);
  setEditingSpeech(index);setError("");
 },[customPrompt]);
 const saveSpeechEdit=useCallback((index:number)=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const speech=speechDraft.trim().replace(/\s+/g," ");
  if(speech.length<8||speech.length>165){
   setError("La narración debe tener entre 8 y 165 caracteres por escena para conservar el ritmo del video.");
   return;
  }
  const plan=readDirectorPlan(customPrompt);
  if(!plan?.scenes[index]){setError("No se encontró esta escena guardada.");return;}
  const scenes=[...plan.scenes];
  const changed=scenes[index].speech!==speech;
  scenes[index]={...scenes[index],speech};
  // Editing narration does not invalidate approved images or paid clips.
  const next={...plan,scenes};
  saveDirectorPlan(next);setDirectorPlan(next);
  if(changed){setSeedJoined("");setStudioStep("editar");}
  setEditingSpeech(null);setSpeechDraft("");setError("");
 },[customPrompt,speechDraft]);
 const updateScenePrompt=useCallback((index:number,prompt:string)=>{
  setDirectorPlan(current=>{
   if(!current)return current;
   const drafts=[...(current.draftPrompts||current.scenes.map(scene=>scene.imagePrompt))];
   drafts[index]=prompt;
   const approved=[...(current.approved||[])];approved[index]=false;
   const next={...current,draftPrompts:drafts,approved};saveDirectorPlan(next);return next;
  });
 },[]);
 const approveScene=useCallback((index:number)=>{
  setDirectorPlan(current=>{
   if(!current||!current.frames[index])return current;
   const edited=current.draftPrompts?.[index]??current.scenes[index].imagePrompt;
   if(edited!==current.scenes[index].imagePrompt){setError("Regenera la imagen para aplicar el prompt modificado.");return current;}
   const approved=[...(current.approved||[])];approved[index]=true;
   const next={...current,approved};saveDirectorPlan(next);return next;
  });
  setError("");
 },[]);
 const regenerateScene=useCallback(async(index:number)=>{
  if(directorBusyRef.current||seedBusyRef.current||!directorPlan?.frames[index])return;
  const seedance=readSeedance(directorPlan.prompt);
  if(seedance.tokens[index]&&!window.confirm(
   "Cambiar esta imagen consume créditos de OpenAI. Después tendrás que animar SOLO la escena "+
   (index+1)+" (~US$0.10), conservando los otros clips. ¿Continuar?"))return;
  const prompt=(directorPlan.draftPrompts?.[index]??directorPlan.scenes[index].imagePrompt).trim();
  if(prompt.length<35||prompt.length>1700){setError("El prompt de la escena debe tener entre 35 y 1700 caracteres.");return;}
  directorBusyRef.current=true;setRegeneratingScene(index);setError("");
  try{
   const sb=getSupabase();if(!sb)throw Error("Inicia sesión.");
   const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error("Inicia sesión.");
   const result=await directorCall(session.access_token,"/api/video-generator/motion-image",{
    mode:"storyframe",prompt:["GLOBAL ART DIRECTION AND RECURRING CHARACTER TRAITS: "+directorPlan.storyBible,
     "THIS SHOT ONLY: "+prompt,
     "Create one fresh still frame in the same 2D cartoon style, using only the action and subjects in this scene."].join(" ").slice(0,1750)
   });
   if(typeof result.imageUrl!=="string"||typeof result.referencePath!=="string")throw Error("No se recibió la nueva imagen.");
   const current=readDirectorPlan(directorPlan.prompt);
   if(!current)throw Error("No se encontró el storyboard guardado.");
   const frames=[...current.frames],scenes=[...current.scenes];
   const previous={...(current.previous||{})};
   previous[index]=[...(previous[index]||[]),{...frames[index],prompt:scenes[index].imagePrompt}].slice(-5);
   frames[index]={imageUrl:result.imageUrl,referencePath:result.referencePath,prompt};
   scenes[index]={...scenes[index],imagePrompt:prompt};
   const approved=[...(current.approved||[])];approved[index]=false;
   const drafts=[...(current.draftPrompts||scenes.map(s=>s.imagePrompt))];drafts[index]=prompt;
   const next={...current,frames,scenes,approved,previous,draftPrompts:drafts};
   saveDirectorPlan(next);setDirectorPlan(next);setPreviousScene(null);
   if(seedance.tokens[index]){
    const job=readSeedance(next.prompt);
    job.needsMotion=job.needsMotion||[];job.needsMotion[index]=true;saveSeedance(job);
    setStudioStep("editar");
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo regenerar la escena.");}
  finally{directorBusyRef.current=false;setRegeneratingScene(null);}
 },[directorPlan]);
 const restorePrevious=useCallback((index:number)=>{
  setDirectorPlan(current=>{
   if(!current)return current;
   const history=[...(current.previous?.[index]||[])];
   const former=history.pop();if(!former)return current;
   const active=current.frames[index],frames=[...current.frames],scenes=[...current.scenes];
   frames[index]=former;
   scenes[index]={...scenes[index],imagePrompt:former.prompt||scenes[index].imagePrompt};
   history.push({...active,prompt:current.scenes[index].imagePrompt});
   const approved=[...(current.approved||[])];approved[index]=false;
   const draftPrompts=[...(current.draftPrompts||scenes.map(s=>s.imagePrompt))];
   draftPrompts[index]=scenes[index].imagePrompt;
   const next={...current,frames,scenes,approved,draftPrompts,previous:{...current.previous,[index]:history}};
   saveDirectorPlan(next);return next;
  });
  const job=readSeedance(customPrompt);
  if(job.tokens[index]){
   job.needsMotion=job.needsMotion||[];job.needsMotion[index]=true;saveSeedance(job);
  }
  setPreviousScene(null);setError("");
 },[customPrompt]);
 const togglePrevious=useCallback(async(index:number)=>{
  if(previousScene===index){setPreviousScene(null);return;}
  const saved=readDirectorPlan(customPrompt);
  const versions=saved?.previous?.[index];
  const older=versions?.[versions.length-1];if(!saved||!older)return;
  try{
   const sb=getSupabase();if(!sb)throw Error("Inicia sesión para recuperar la imagen anterior.");
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para recuperar la imagen anterior.");
   const result=await directorCall(session.access_token,"/api/video-generator/motion-image",
    {action:"preview",referencePath:older.referencePath});
   const updated={...saved,previous:{...saved.previous,
    [index]:[...versions!.slice(0,-1),{...older,imageUrl:result.imageUrl as string}]}};
   saveDirectorPlan(updated);setDirectorPlan(updated);setPreviousScene(index);
  }catch(e){setError(e instanceof Error?e.message:"La versión anterior no está disponible.");}
 },[previousScene,customPrompt]);
 const saveMotionDirection=useCallback(()=>{
  const plan=readDirectorPlan(customPrompt),prompt=motionDraft.trim();
  if(!plan?.scenes[selectedScene]||prompt.length<18||prompt.length>650){
   setError("Describe la acción de esta escena en 18 a 650 caracteres.");return;
  }
  const scenes=[...plan.scenes],before=scenes[selectedScene].motionPrompt;
  scenes[selectedScene]={...scenes[selectedScene],motionPrompt:prompt};
  const updated={...plan,scenes};saveDirectorPlan(updated);setDirectorPlan(updated);
  if(before!==prompt){
   const job=readSeedance(plan.prompt);
   if(job.urls[selectedScene]){
    job.clipPrompt=job.clipPrompt||[];
    if(!job.clipPrompt[selectedScene])job.clipPrompt[selectedScene]=before;
    job.needsMotion=job.needsMotion||[];job.needsMotion[selectedScene]=true;
    saveSeedance(job);
   }
  }
  setError("");setDirectorStatus("Movimiento de la escena "+(selectedScene+1)+" guardado");
 },[customPrompt,selectedScene,motionDraft]);
 const renderSingleScene=useCallback(async(index:number)=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const plan=readDirectorPlan(customPrompt),job=readSeedance(customPrompt);
  if(!plan?.frames[index]||!plan.approved?.[index]){
   setError("Primero aprueba la imagen de esta escena.");return;
  }
  if(job.urls[index]&&!job.draftTokens?.[index]&&!window.confirm(
   "Animar solamente la escena "+(index+1)+" cuesta aproximadamente US$0.103. "+
   "Los demás clips se conservarán. ¿Autorizar esta generación?"))return;
  seedBusyRef.current=true;setSeedBusy(true);setSceneRendering(index);setError("");
  try{
   const sb=getSupabase();if(!sb)throw Error("Inicia sesión.");
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión.");
   const accessToken=session.access_token;
   let pending=job.draftTokens?.[index]||"";
   if(!pending){
    const result=await seedanceRequest(accessToken,{
     action:"start",confirmCost:true,prompt:customPrompt,beat:index,
     imagePath:plan.frames[index].referencePath,
     motionPrompt:plan.scenes[index].motionPrompt,storyBible:plan.storyBible
    });
    if(typeof result.token!=="string")throw Error("No se inició el trabajo.");
    pending=result.token;
    job.draftTokens={...job.draftTokens,[index]:pending};saveSeedance(job);
   }
   let completed=false;
   for(let n=0;n<120;n++){
    setDirectorStatus("Animando solo escena "+(index+1)+" · Seedance");
    const status=await seedanceRequest(accessToken,{action:"status",token:pending});
    if(status?.status==="completed"&&typeof status.url==="string"){
     const latest=readSeedance(customPrompt);
     if(latest.tokens[index]&&latest.urls[index]){
      const previous=latest.history?.[index]||[];
      latest.history={...latest.history,[index]:[...previous,
       {token:latest.tokens[index],url:latest.urls[index]}].slice(-4)};
     }
     latest.tokens[index]=pending;latest.urls[index]=status.url;
     latest.clipPrompt=latest.clipPrompt||[];latest.clipPrompt[index]=plan.scenes[index].motionPrompt;
     latest.needsMotion=latest.needsMotion||[];latest.needsMotion[index]=false;
     latest.draftTokens={...latest.draftTokens};delete latest.draftTokens[index];
     saveSeedance(latest);setSavedClipCount(latest.urls.filter(Boolean).length);
     setSeedJoined("");setDirectorStatus("Escena "+(index+1)+" lista. Monta el video sin regenerar las demás.");
     completed=true;
     try{await seedanceRequest(accessToken,{action:"archive",token:pending,sourceUrl:status.url});}
     catch{setDirectorStatus("Clip terminado; copia privada pendiente.");}
     break;
    }
    if(status?.status==="failed"){
     const latest=readSeedance(customPrompt);
     latest.draftTokens={...latest.draftTokens};delete latest.draftTokens[index];saveSeedance(latest);
     throw Error("Seedance falló. Se conserva la versión anterior de esta escena.");
    }
    await new Promise<void>(resolve=>setTimeout(resolve,5000));
   }
   if(!completed)throw Error("La escena sigue procesándose. Reanúdala desde Editar sin volver a pagar.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo renovar la escena.");}
  finally{seedBusyRef.current=false;setSeedBusy(false);setSceneRendering(null);}
 },[customPrompt]);
 const revertClip=useCallback((index:number)=>{
  const job=readSeedance(customPrompt),history=[...(job.history?.[index]||[])];
  const previous=history.pop();if(!previous)return;
  const active={token:job.tokens[index],url:job.urls[index]};
  job.tokens[index]=previous.token;job.urls[index]=previous.url;
  job.history={...job.history,[index]:[...history,active].slice(-4)};
  job.needsMotion=job.needsMotion||[];job.needsMotion[index]=false;
  saveSeedance(job);setSeedJoined("");setError("");
 },[customPrompt]);
 const setProjectNarration=useCallback((enabled:boolean)=>{
  setWithVoice(enabled);
  if(enabled){setAsmrEnabled(false);}
  if(!customPrompt)return;
  const job=readSeedance(customPrompt);
  job.narrationEnabled=enabled;
  if(enabled){job.asmrEnabled=false;}
  saveSeedance(job);
 },[customPrompt]);
 const chooseProjectVoice=useCallback((preset:VoicePreset,elevenId?:string)=>{
  if(!customPrompt)return;
  if(elevenId&&!/^[A-Za-z0-9]{15,32}$/.test(elevenId))return;
  setAsmrEnabled(false);setVoicePreset(preset);setWithVoice(true);
  if(preset==="elevenlabs"&&elevenId)setPilotVoiceId(elevenId);
  const job=readSeedance(customPrompt);
  job.voicePreset=preset;job.narrationEnabled=true;job.asmrEnabled=false;
  job.montageSeconds=montageSeconds;
  if(preset==="elevenlabs"&&(elevenId||pilotVoiceId))
   job.elevenVoiceId=elevenId||pilotVoiceId;
  saveSeedance(job);
 },[customPrompt,pilotVoiceId,montageSeconds]);
 const openVoiceEditor=useCallback(()=>{
  setAsmrEnabled(false);setWithVoice(true);
  setVoiceEditorOpen(true);setStudioStep("editar");setError("");
 },[]);
 const selectVideoVersion=useCallback(async(revisionId:string)=>{
  const client=getSupabase();if(!client)return;
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)return;
  const job=readSeedance(customPrompt);
  const version=job.voiceRevisions?.find(revision=>revision.id===revisionId);
  if(revisionId&&!version){setError("La versión seleccionada no existe.");return;}
  const formats:("mp4"|"webm")[]=version?[version.extension]:["mp4","webm"];
  setRenderLoading(true);setError("");
  try{
   for(const format of formats){
    try{
     const response=await motionLibrary(session.access_token,{
      action:"render-url",id:currentCloudId(),extension:format,
      ...(revisionId?{revisionId}:{})
     });
     if(typeof response.url!=="string")continue;
     setSeedJoined(response.url);setExtension(format);setLastRenderedCloudUrl(response.url);
     setActiveRenderId(revisionId);job.activeRenderId=revisionId;
     saveSeedance(job);
     setShareStatus(revisionId?"Versión de voz recuperada.":"Video original recuperado.");
     return;
    }catch{}
   }
   throw Error("No se encontró ese video guardado. La versión actual sigue disponible.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir la versión.");}
  finally{setRenderLoading(false);}
 },[customPrompt]);
 const animateApproved=useCallback(async(mode:"normal"|"voice"="normal")=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const plan=readDirectorPlan(customPrompt);
  const voiceOnly=mode==="voice";
  const requiredScenes=sceneTotal(plan,montageSeconds);
  const storedNarration=readSeedance(customPrompt).narrationEnabled===true;
  // Only an explicit, persisted choice can start paid narration.
  const narrationEnabled=voiceOnly?withVoice:
   (withVoice&&storedNarration&&!asmrEnabled);
  if(asmrEnabled&&!voiceOnly&&!window.confirm(
   "Se generarán hasta seis efectos de sonido ASMR con ElevenLabs usando créditos de IA. "+
   "Si faltan clips también se utilizarán créditos de Seedance para animarlos. "+
   "Los clips ya guardados no se volverán a generar. ¿Continuar?"
  ))return;
  if(voiceOnly){
   const prior=readSeedance(customPrompt);
   if(!withVoice||!Array.from({length:requiredScenes},(_,i)=>
    Boolean(prior.tokens[i]&&prior.urls[i])).every(Boolean)){
    setError("Para cambiar la voz necesitas los "+requiredScenes+" clips terminados.");return;
   }
   if(!window.confirm("Se generará una nueva narración utilizando créditos de voz y "+
    "se volverán a unir los "+requiredScenes+" clips existentes. No se cobrará otra animación "+
    "de Seedance y conservaremos el video original. ¿Continuar?"))return;
  }
  if(!plan||plan.frames.length!==requiredScenes||
   !Array.from({length:requiredScenes},(_,i)=>i).every(i=>plan.approved?.[i]===true&&
    (plan.draftPrompts?.[i]??plan.scenes[i].imagePrompt)===plan.scenes[i].imagePrompt)){
   setError("Aprueba las "+requiredScenes+" imágenes y regenera las escenas editadas.");return;
  }
  directorBusyRef.current=true;seedBusyRef.current=true;setDirectorBusy(true);setSeedBusy(true);
  setError("");setDirectorStatus(voiceOnly?"Preparando nueva narración…":"Preparando tu video…");
  try{
   const client=getSupabase();if(!client)throw Error("Inicia sesión para generar el video.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para generar el video.");
   const accessToken=session.access_token;
   const provider=voicePreset==="elevenlabs"?"elevenlabs":"openai";
   const selectedVoiceId=provider==="openai"?voicePreset:pilotVoiceId;
   if(narrationEnabled){
    const params=new URLSearchParams({provider});
    if(selectedVoiceId)params.set("voiceId",selectedVoiceId);
    const check=await fetch("/api/video-generator/speech/continuous?"+params.toString(),{headers:{Authorization:"Bearer "+accessToken},cache:"no-store"});
    const config=await check.json().catch(()=>null);
    if(!check.ok||!config?.configured)throw Error(
     config?.error==="elevenlabs_voice_unavailable"?"ElevenLabs no reconoce la voz configurada. Establece una voz disponible en ELEVENLABS_VOICE_ID; tus clips siguen guardados.":
     config?.error==="elevenlabs_key_rejected"?"ElevenLabs rechazó la API key de Preview. Comprueba ELEVENLABS_API_KEY; tus clips siguen guardados.":
     config?.error==="elevenlabs_access_denied"?"La API key no tiene permisos suficientes para acceder a ElevenLabs; los clips siguen guardados.":
     config?.error==="elevenlabs_credits_required"?"El plan de ElevenLabs o los créditos disponibles no permiten utilizar esta voz por API. Tus clips de Seedance siguen guardados.":
     "No se pudo verificar el proveedor de voz (HTTP "+String(config?.upstreamStatus||check.status)+
      (config?.providerCode&&config.providerCode!=="unknown"?", "+config.providerCode:"")+
      "). Tus clips siguen guardados."
    );
   }
   const job=readSeedance(customPrompt);setSeedUrls(job.urls.filter(Boolean));setSavedClipCount(job.urls.filter(Boolean).length);
   if(voiceOnly&&!Array.from({length:requiredScenes},(_,i)=>
    Boolean(job.tokens[i]&&job.urls[i])).every(Boolean))
    throw Error("Faltan clips guardados. No se inició ninguna animación.");
   if(job.needsMotion?.some(Boolean))throw Error(
    "Hay imágenes o acciones modificadas sin animar. En Editar, genera únicamente esas escenas antes de montar.");
   if(job.draftTokens&&Object.keys(job.draftTokens).length)throw Error(
    "Una escena sigue procesándose. Termínala desde Editar antes del montaje.");
   // Check all pending scenes before authorizing the first new Seedance task.
   // A failed preflight never consumes Seedance video credits.
   const pending=voiceOnly?[]:Array.from({length:requiredScenes},(_,beat)=>beat)
    .filter(beat=>!job.tokens[beat]&&!job.urls[beat]);
   if(pending.length){
    setDirectorStatus("Verificando las imágenes antes de animar · sin costo");
    await seedanceRequest(accessToken,{action:"preflight",confirmCost:true,prompt:customPrompt,
     storyBible:plan.storyBible,clips:pending.map(beat=>({beat,
      imagePath:plan.frames[beat].referencePath,motionPrompt:plan.scenes[beat].motionPrompt}))});
   }
   for(let beat=0;beat<requiredScenes;beat++){
    if(job.urls[beat])continue;
    let token=job.tokens[beat];
    if(!token){
     setDirectorStatus("Animando escena "+(beat+1)+"/"+requiredScenes+" · Seedance 720p");
     const started=await seedanceRequest(accessToken,{
      action:"start",prompt:customPrompt,beat,confirmCost:true,
      imagePath:plan.frames[beat].referencePath,
      motionPrompt:plan.scenes[beat].motionPrompt,storyBible:plan.storyBible
     });
     if(typeof started?.token!=="string")throw Error("Seedance no inició la escena "+(beat+1)+".");
     token=started.token;job.tokens[beat]=token;saveSeedance(job);
    }
    setDirectorStatus("Esperando animación "+(beat+1)+"/"+requiredScenes);
    let completed=false;
    for(let n=0;n<120;n++){
     const response=await seedanceRequest(accessToken,{action:"status",token});
     if(response?.status==="completed"&&typeof response.url==="string"){
      job.urls[beat]=response.url;
      job.clipPrompt=job.clipPrompt||[];job.clipPrompt[beat]=plan.scenes[beat].motionPrompt;
      saveSeedance(job);setSeedUrls(job.urls.filter(Boolean));setSavedClipCount(job.urls.filter(Boolean).length);
      // Archive immediately when the provider URL is still valid.
      try{await seedanceRequest(accessToken,{action:"archive",token,sourceUrl:response.url});}catch{}
      completed=true;break;
     }
     if(response?.status==="failed")throw Error("Seedance no completó la escena "+(beat+1)+". Las anteriores siguen guardadas.");
     await new Promise<void>(resolve=>setTimeout(resolve,5000));
    }
    if(!completed)throw Error("La escena "+(beat+1)+" continúa procesándose. Pulsa Dar movimiento para recuperar su estado.");
   }
   // Verify all twelve stored MP4s BEFORE the provider charges new voice
   // credits. A missing expired clip must never result in paid orphan narration.
   setDirectorStatus("Verificando los "+requiredScenes+" clips guardados · sin cargo");
   const localUrls:string[]=[];
   let video:Blob,extension:"mp4"|"webm";
   try{
    for(let i=0;i<requiredScenes;i++){
     setDirectorStatus("Recuperando MP4 guardado "+(i+1)+"/"+requiredScenes+" · sin regenerar");
     localUrls.push(await loadSeedanceForStitching(accessToken,job.tokens[i],job.urls[i],i));
    }
    setDirectorStatus(asmrEnabled?"Preparando sonidos ASMR sincronizados…":
     voiceOnly?"Generando únicamente la nueva voz…":"Preparando narración, subtítulos y montaje");
    const speech=narrationEnabled?await loadContinuousVoice(plan.scenes.map(scene=>scene.speech),
     provider,selectedVoiceId):null;
    const effects=asmrEnabled?await loadMotionSfx(accessToken,customPrompt,plan.scenes,
     montageSeconds,n=>setDirectorStatus("Creando sonido ASMR "+n+"/"+Math.min(6,plan.scenes.length)+" · guardando los clips")):[];
    setDirectorStatus(asmrEnabled?"Montando el video con ASMR…":"Montando el video con la nueva narración…");
    ({blob:video,extension}=await stitchSeedanceClips(localUrls,speech,asmrEnabled?false:subtitles,{
     music:musicFile,musicVolume:musicVolume/100,
     voiceVolume:narrationVolume/100,fadeSeconds,effects,seconds:montageSeconds
    }));
   }finally{localUrls.forEach(url=>URL.revokeObjectURL(url));}
   // Do not mark a browser recording complete before checking its container metadata.
   // In particular, a 66s MediaRecorder output is not a valid 60s montage.
   const finalUrl=URL.createObjectURL(video);
   try{
    const measured=await new Promise<number>((resolve,reject)=>{
     const probe=document.createElement("video");
     const timeout=window.setTimeout(()=>{probe.removeAttribute("src");probe.load();reject(Error("No se pudo validar la duración del MP4."));},12000);
     probe.preload="metadata";
     probe.onloadedmetadata=()=>{
      window.clearTimeout(timeout);
      const duration=probe.duration;
      probe.removeAttribute("src");probe.load();
      resolve(duration);
     };
     probe.onerror=()=>{window.clearTimeout(timeout);reject(Error("El montaje no contiene video reproducible."));};
     probe.src=finalUrl;
    });
    if(!Number.isFinite(measured)||Math.abs(measured-montageSeconds)>1.5)
     throw Error("El montaje dura "+measured.toFixed(1)+" s en lugar de "+montageSeconds+" s. No se guardó el archivo defectuoso; tus clips siguen disponibles.");
   }catch(e){
    URL.revokeObjectURL(finalUrl);
    throw e;
   }
   // Never overwrite final.mp4: every export is an independent revision.
   const revisionId=crypto.randomUUID();
   try{
    const id=currentCloudId();
    await motionLibrary(accessToken,{action:"save",project:{
     id,plan,seedance:readSeedance(customPrompt),publish:readPublishDraft(id)
    }});
    const ticket=await motionLibrary(accessToken,{
     action:"render-upload",id,extension,...(revisionId?{revisionId}:{})
    });
    const sb=getSupabase();
    if(!sb)throw Error("No se puede acceder al almacenamiento.");
    const uploaded=await sb.storage.from(ticket.bucket).uploadToSignedUrl(
     ticket.path,ticket.token,video,{contentType:"video/"+extension}
    );
    if(uploaded.error)throw Error("Falló la copia del video final.");
    const source=await motionLibrary(accessToken,{
     action:"render-url",id,extension,...(revisionId?{revisionId}:{})
    });
    setLastRenderedCloudUrl(String(source.url||""));
    const latest=readSeedance(customPrompt);
    const version:SavedVoiceRevision={id:revisionId,extension,
     voice:asmrEnabled?"ASMR · "+montageSeconds+" s":narrationEnabled?selectedVoiceName(voicePreset):"Sin narración · "+montageSeconds+" s",
     createdAt:new Date().toISOString()};
    latest.voiceRevisions=[...(latest.voiceRevisions||[]),version].slice(-30);
    latest.activeRenderId=revisionId;latest.voicePreset=voicePreset;
    latest.asmrEnabled=asmrEnabled;latest.montageSeconds=montageSeconds;
    latest.narrationEnabled=narrationEnabled;
    if(provider==="elevenlabs"&&selectedVoiceId)latest.elevenVoiceId=selectedVoiceId;
    saveSeedance(latest);setVoiceRevisions(latest.voiceRevisions||[]);
    setActiveRenderId(revisionId);
    await motionLibrary(accessToken,{action:"save",project:{
     id,plan,seedance:latest,publish:readPublishDraft(id)
    }});
    setCloudStatus("Video y proyecto guardados en la nube");
    if(seedJoinedRef.current&&seedJoinedRef.current!==finalUrl&&seedJoinedRef.current.startsWith("blob:"))
     URL.revokeObjectURL(seedJoinedRef.current);
    seedJoinedRef.current=finalUrl;setSeedJoined(finalUrl);setExtension(extension);
    setStudioStep("publicar");
    setDirectorStatus("Video terminado · "+montageSeconds+" segundos"+(asmrEnabled?" con ASMR":narrationEnabled?" con voz":""));
   }catch{
    URL.revokeObjectURL(finalUrl);
    setCloudStatus("No se pudo guardar el montaje. El video anterior permanece intacto.");
    throw Error("El nuevo montaje no se pudo guardar. No se reemplazó ninguna versión anterior.");
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo terminar el video.");setDirectorStatus("");}
  finally{directorBusyRef.current=false;seedBusyRef.current=false;setDirectorBusy(false);setSeedBusy(false);}
 },[customPrompt,withVoice,voice,subtitles,pilotAuto,pilotVoiceProvider,pilotVoiceId,
  voicePreset,musicFile,musicVolume,narrationVolume,fadeSeconds,asmrEnabled,montageSeconds,seedJoined]);
 useEffect(()=>{
  if(!pilotAuto||auth!=="signed_in"||customPrompt.length<8||autoStartRef.current)return;
  autoStartRef.current=true;
  void (async()=>{
   await prepareStoryboard();
   const plan=readDirectorPlan(customPrompt);
   if(plan&&plan.frames.length===plan.scenes.length&&plan.approved?.every(Boolean))
    await animateApproved();
  })();
 },[pilotAuto,auth,customPrompt,prepareStoryboard,animateApproved]);
 const suggestPublication=useCallback(()=>{
  const plan=readDirectorPlan(customPrompt);if(!plan)return;
  const first=plan.scenes[0]?.speech||"",last=plan.scenes.at(-1)?.speech||"";
  updatePublish({title:plan.title,
   caption:first+" "+last+"\n\n¿Qué opinas? Cuéntanos en los comentarios.",
   hashtags:"#VMVMotion #Historias #VideoConIA"});
  setShareStatus("Texto preparado. Revísalo antes de publicarlo.");
 },[customPrompt,updatePublish]);
 const copyPublication=useCallback(async()=>{
  const plan=readDirectorPlan(customPrompt);
  const content=[publishDraft.title||plan?.title||"VMV Motion",
   publishDraft.caption,publishDraft.hashtags].filter(Boolean).join("\n\n");
  try{
   await navigator.clipboard.writeText(content);
   setShareStatus("Descripción copiada. Ya puedes pegarla en tu red social.");
  }catch{setShareStatus("Tu navegador no permitió copiar. Selecciona y copia el texto manualmente.");}
 },[customPrompt,publishDraft]);
 const shareFinishedVideo=useCallback(async()=>{
  if(!seedJoined){setShareStatus("Primero monta o recupera el video final.");return;}
  // Both Publicar and Biblioteca use a public VMV URL, never the native OS share sheet.
  setShareStatus("");
  setLibraryOpen(true);
  await shareLibraryVideo(currentCloudId());
 },[seedJoined,shareLibraryVideo]);
 const refreshCloudRender=useCallback(async()=>{
  const sb=getSupabase();if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)return;
  setRenderLoading(true);
  try{
   const job=readSeedance(customPrompt);
   const latest=job.voiceRevisions?.find(v=>v.id===job.activeRenderId);
   const result=await motionLibrary(session.access_token,{
    action:"render-url",id:currentCloudId(),extension:latest?.extension||extension,
    ...(latest?{revisionId:latest.id}:{})
   });
   if(typeof result.url!=="string")throw Error("URL inválida.");
   setLastRenderedCloudUrl(result.url);
   setSeedJoined(result.url);
   setShareStatus("Video final recuperado desde la nube.");
  }catch{setShareStatus("Todavía no existe una copia del montaje final guardada.");}
  finally{setRenderLoading(false);}
 },[extension,customPrompt]);
 useEffect(()=>{
  if(auth!=="signed_in"||!directorPlan?.prompt||seedJoined||
   readSeedance(directorPlan.prompt).urls.filter(Boolean).length!==directorPlan.scenes.length)return;
  let active=true;
  const load=async()=>{
   const sb=getSupabase();if(!sb)return;
   const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)return;
   const job=readSeedance(directorPlan.prompt);
   const version=job.voiceRevisions?.find(v=>v.id===job.activeRenderId);
   const choices:[string,"mp4"|"webm"][]=[
    ...(version?[[version.id,version.extension] as [string,"mp4"|"webm"]]:[]),
    ["","mp4"],["","webm"]
   ];
   for(const [revisionId,ext] of choices){
    try{
     const file=await motionLibrary(session.access_token,{
      action:"render-url",id:currentCloudId(),extension:ext,
      ...(revisionId?{revisionId}:{})
     });
     if(active&&typeof file.url==="string"){
      setSeedJoined(file.url);setExtension(ext);setActiveRenderId(revisionId);
      setLastRenderedCloudUrl(file.url);setStudioStep("publicar");break;
     }
    }catch{}
   }
  };
  void load();
  return()=>{active=false;};
 },[auth,directorPlan?.prompt]);
 const generate=useCallback(async()=>{
  if(renderingRef.current)return;
  const target=canvas.current;
  if(!target)return;
  renderingRef.current=true;setRendering(true);setProgress(0);
  setError("");setStage(customMode?"Creando ilustraciones con OpenAI":withVoice?"Preparando voz":"Animando");
  try{
   const selected=customMode?await createTerraStory(customPrompt,pendingStoryboard.current):stickmanStory(topic,language);
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
 if(auth==="checking"||bootstrapping)return <main className={css.page}>
  <div className={css.loadingScreen} role="status" aria-live="polite">
   <span className={css.loadingLogo}><Clapperboard size={26}/></span>
   <LoaderCircle size={35} className={css.spin}/>
   <strong>Preparando VMV Motion</strong>
   <span>Cargando tu estudio creativo…</span>
  </div>
 </main>;
 if(auth==="signed_out")return authClient?<VMVAuthGateway supabase={authClient} compact
  returnTo="/vista-app/vmv-pilot/stickman-lab"/>:
  <main className={css.page}><p>La autenticación no está configurada en esta versión de prueba.</p></main>;
 return <main className={css.page}>
  {projectSwitching?<div className={css.loadingOverlay} role="status" aria-live="polite">
   <div className={css.loadingScreen}>
    <span className={css.loadingLogo}><FolderOpen size={25}/></span>
    <LoaderCircle className={css.spin} size={34}/>
    <strong>Abriendo tu proyecto</strong>
    <span>Preparando escenas, clips y edición…</span>
   </div>
  </div>:null}
  <div className={css.shell}>
   <header className={css.header}>
    <button type="button" aria-label="Volver al asistente" onClick={()=>router.push("/vista-app/vmv-pilot")}>
     <ArrowLeft size={19}/></button>
    <div className={css.headerBrand}><strong>VMV Motion</strong><small>Estudio creativo</small></div>
    <Clapperboard size={20} className={css.headerIcon}/>
   </header>
   <nav className={css.workspaceTabs} aria-label="Secciones del estudio">
    <button type="button" className={!libraryOpen?css.workspaceActive:""}
     aria-current={!libraryOpen?"page":undefined}
     onClick={()=>setLibraryOpen(false)} disabled={projectSwitching}>
     <WandSparkles size={17}/> Estudio
    </button>
    <button type="button" className={libraryOpen?css.workspaceActive:""}
     aria-current={libraryOpen?"page":undefined}
     disabled={directorBusy||seedBusy||rendering||projectSwitching}
     onClick={()=>{setActiveLibraryId(currentCloudId());setLibraryOpen(true);void refreshLibrary();}}>
     <FolderOpen size={17}/> Biblioteca
    </button>
    <button type="button" className={css.newProjectButton}
     disabled={directorBusy||seedBusy||rendering||projectSwitching}
     onClick={()=>void newMotionProject()}><Plus size={17}/> Nuevo</button>
   </nav>
   {libraryOpen?<section className={css.libraryPage} aria-label="Biblioteca de videos">
    <div className={css.libraryHeading}>
     <div><span className={css.eyebrow}>TUS CREACIONES</span>
      <h1>Biblioteca</h1>
      <p>Tus videos guardados y listos para seguir editando.</p>
     </div>
     {cloudLoading?<LoaderCircle size={21} className={css.spin}/>:
      <button type="button" className={css.refreshLibrary} onClick={()=>void refreshLibrary()}
       aria-label="Actualizar biblioteca"><RotateCcw size={17}/></button>}
    </div>
    {libraryShare||libraryShareError?
     <div className={css.libraryShareOverlay}>
      <button type="button" className={css.libraryShareBackdrop}
       aria-label="Cerrar ventana de compartir"
       onClick={()=>{setLibraryShare(null);setLibraryShareError(null);}}/>
      <div className={css.librarySharePanel} role="dialog" aria-modal="true"
       aria-label={libraryShare?"Compartir video":"Estado de video para compartir"}>
       <div className={css.libraryShareHeader}>
        <Share2 size={19}/>
        <strong>{libraryShare?"Compartir video original":"Video pendiente de compartir"}</strong>
        <button type="button" className={css.ghostButton}
         onClick={()=>{setLibraryShare(null);setLibraryShareError(null);}}>Cerrar</button>
       </div>
       {libraryShare?<>
        <p>Comparte el archivo original ({libraryShare.filename}), sin compresión adicional
         y sin pedir que el destinatario inicie sesión. El enlace caduca el
         {" "+new Date(libraryShare.expiresAt).toLocaleString("es-US")}.</p>
        <div className={css.libraryShareLink}>
         <input ref={libraryShareInputRef} type="text" aria-label="Enlace de descarga"
          readOnly value={libraryShare.url} onFocus={e=>e.currentTarget.select()}/>
         <button type="button" onClick={()=>void copyLibraryShare()}>
          <Copy size={16}/> Copiar enlace</button>
        </div>
        <div className={css.libraryShareActions}>
         <a href={"https://wa.me/?text="+encodeURIComponent("Descarga mi video de VMV Motion: "+libraryShare.url)}
          target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
         <a href={"mailto:?subject="+encodeURIComponent("Video de VMV Motion")+"&body="+
          encodeURIComponent("Puedes descargar el video original aquí:\n"+libraryShare.url)}>
          Enviar por correo</a>
         <a href={libraryShare.url} target="_blank" rel="noopener noreferrer">
          Probar descarga</a>
        </div>
       </>:<>
        <p>{libraryShareError==="missing-video"?
         "Las 12 animaciones pueden estar guardadas, pero todavía no existe un video final en la nube. Primero debes montarlo. No necesitas volver a generar los clips.":
         libraryShareError==="no-project"?
         "El proyecto aún no está disponible en la nube. Ábrelo y guarda el montaje antes de compartir.":
         "No pudimos crear el enlace de descarga. Comprueba tu conexión y vuelve a intentarlo."}</p>
        {libraryShareError!=="unavailable"?
         <button type="button" className={css.librarySharePrimary}
          onClick={()=>{
           const id=libraryShareTargetId;
           setLibraryShareError(null);setLibraryShare(null);
           if(id===currentCloudId()){
            setLibraryOpen(false);setStudioStep("editar");
           }else if(id){
            void restoreCloudProject(id);
           }
          }}>Abrir editor para montar</button>:null}
       </>}
       {libraryShareNotice?<p role="status" className={css.libraryShareStatus}>{libraryShareNotice}</p>:null}
      </div>
     </div>:null}
    {cloudLoading?<div className={css.libraryLoading} role="status">
     <LoaderCircle size={24} className={css.spin}/> Cargando proyectos…
    </div>:null}
    {directorPlan||cloudProjects.length||archivedProjects.length?
     <div className={css.libraryGrid}>
      {directorPlan?<div className={css.libraryCard}>
       <button type="button" className={css.libraryCardMain}
        onClick={()=>setLibraryOpen(false)}>
        <span className={css.libraryPoster}><Clapperboard size={27}/>
         {directorPlan.frames[0]?.imageUrl?<img src={directorPlan.frames[0].imageUrl}
          alt="" onError={event=>{event.currentTarget.style.display="none";}}/>:null}
         <span>EN EDICIÓN</span></span>
        <span className={css.libraryCardBody}><strong>{directorPlan.title||"Mi video"}</strong>
         <small>{directorPlan.frames.length} imágenes · {savedClipCount} clips</small>
         <span className={css.libraryCardLink}>Continuar editando</span>
        </span>
       </button>
       {savedClipCount===sceneTotal(directorPlan,montageSeconds)&&Boolean(lastRenderedCloudUrl)?<button type="button" className={css.libraryVoiceAction}
        disabled={Boolean(libraryShareBusy)} onClick={()=>void shareLibraryVideo(currentCloudId())}>
        {libraryShareBusy===currentCloudId()?<LoaderCircle size={16} className={css.spin}/>:<Share2 size={16}/>}
        Compartir enlace
       </button>:null}
       {savedClipCount===sceneTotal(directorPlan,montageSeconds)&&!lastRenderedCloudUrl?<button type="button"
        className={css.libraryVoiceAction} onClick={()=>{setLibraryOpen(false);setStudioStep("editar");}}>
        <Clapperboard size={16}/> Montar para compartir
       </button>:null}
       {savedClipCount===sceneTotal(directorPlan,montageSeconds)?<button className={css.libraryVoiceAction}
        type="button" onClick={()=>{setLibraryOpen(false);openVoiceEditor();}}>
        <Volume2 size={16}/> Cambiar voz
       </button>:null}
      </div>:null}
      {cloudProjects.filter(item=>item.id!==activeLibraryId||!directorPlan).map(item=>
       <div key={item.id} className={css.libraryCard}>
        <button type="button" className={css.libraryCardMain}
         disabled={cloudLoading||projectSwitching}
         onClick={()=>void restoreCloudProject(item.id)}>
         <span className={css.libraryPoster}><Clapperboard size={27}/>
          {item.coverUrl?<img src={item.coverUrl} alt=""
           onError={event=>{event.currentTarget.style.display="none";}}/>:null}
          <span>{item.clips===(item.sceneCount||12)?item.clips+" CLIPS GUARDADOS":"EN PROGRESO"}</span></span>
         <span className={css.libraryCardBody}><strong>{item.title||"Mi video"}</strong>
          <small>{item.scenes} imágenes · {item.clips} clips</small>
          <span className={css.libraryCardLink}>Abrir proyecto</span>
         </span>
        </button>
        {item.ready?<button type="button" className={css.libraryVoiceAction}
         disabled={Boolean(libraryShareBusy)||cloudLoading||projectSwitching}
         onClick={()=>void shareLibraryVideo(item.id)}>
         {libraryShareBusy===item.id?<LoaderCircle size={16} className={css.spin}/>:<Share2 size={16}/>}
         Compartir enlace
        </button>:null}
        {item.clips===(item.sceneCount||12)&&!item.ready?<button type="button"
         className={css.libraryVoiceAction}
         disabled={cloudLoading||projectSwitching}
         onClick={()=>void restoreCloudProject(item.id)}>
         <Clapperboard size={16}/> Montar para compartir
        </button>:null}
        {item.clips===(item.sceneCount||12)?<button type="button" className={css.libraryVoiceAction}
         disabled={cloudLoading||projectSwitching}
         onClick={()=>void restoreCloudProject(item.id,true)}>
         <Volume2 size={16}/> Cambiar voz
        </button>:null}
       </div>)}
      {archivedProjects.filter(item=>!cloudProjects.some(cloud=>cloud.id===item.cloudId)
       &&item.cloudId!==activeLibraryId).map(item=>
       <div key={item.id} className={css.libraryCard}>
        <button type="button" className={css.libraryCardMain}
         disabled={cloudLoading||projectSwitching}
         onClick={()=>void restoreMotionProject(item.id)}>
         <span className={css.libraryPoster}><BookOpen size={27}/>
          {item.plan.frames[0]?.imageUrl?<img src={item.plan.frames[0].imageUrl}
           alt="" onError={event=>{event.currentTarget.style.display="none";}}/>:null}
          <span>EN ESTE DISPOSITIVO</span></span>
         <span className={css.libraryCardBody}><strong>{item.label||"Mi video"}</strong>
          <small>{item.plan.frames.length} imágenes · {item.seedance.urls.filter(Boolean).length} clips</small>
          <span className={css.libraryCardLink}>Abrir proyecto</span>
         </span>
        </button>
        {item.seedance.urls.filter(Boolean).length===item.plan.scenes.length?
         <button type="button" className={css.libraryVoiceAction}
          disabled={cloudLoading||projectSwitching}
          onClick={()=>void restoreMotionProject(item.id)}>
          <Clapperboard size={16}/> Abrir para compartir
         </button>:null}
        {item.seedance.urls.filter(Boolean).length===item.plan.scenes.length?
         <button type="button" className={css.libraryVoiceAction}
          disabled={cloudLoading||projectSwitching}
          onClick={()=>void restoreMotionProject(item.id,true)}>
          <Volume2 size={16}/> Cambiar voz
         </button>:null}
       </div>)}
     </div>:
     !cloudLoading?<div className={css.libraryEmpty}>
      <BookOpen size={27}/><h2>Tu biblioteca empieza aquí</h2>
      <p>Los videos que crees se guardarán en este espacio.</p>
      <button className={css.generate} type="button" onClick={()=>setLibraryOpen(false)}>
       Crear un video</button>
     </div>:null}
    {error?<p role="alert" className={css.error}>{error}</p>:null}
   </section>:<>
   <div className={css.intro}><h1>{directorPlan?.title||"Crea tu video"}</h1>
    <span>{montageSeconds} segundos (montaje) · 9:16 · 720p</span></div>
   {customMode?<nav className={css.studioNav} aria-label="Fases de producción">
    {(["crear","revisar","editar","publicar"] as const).map((step,i)=>{
     const names=["Crear","Revisar","Editar","Publicar"];
     const disabled=step==="revisar"&&!directorPlan?.frames.length||
      step==="editar"&&directorPlan?.frames.length!==directorPlan?.scenes.length||
      step==="publicar"&&!seedJoined&&!lastRenderedCloudUrl;
     return <button key={step} type="button" disabled={disabled||directorBusy||seedBusy||rendering||projectSwitching}
      aria-current={studioStep===step?"step":undefined}
      className={studioStep===step?css.stepActive:""}
      onClick={()=>setStudioStep(step)}>
      <span>{i+1}</span>{names[i]}
     </button>;
    })}
   </nav>:null}
   {customMode&&directorPlan?.prompt?<p className={css.saveIndicator} role="status">
    {cloudStatus==="Guardando…"?<LoaderCircle className={css.spin} size={13}/>:
     cloudStatus==="En la nube"?<Check size={13}/>:<Cloud size={13}/>}
    {cloudStatus==="Guardando…"?"Guardando proyecto…":
     cloudStatus==="En la nube"?"Guardado automáticamente":"Pendiente de sincronizar"}
   </p>:null}
   {(directorBusy||seedBusy||rendering||framesRefreshing||characterLoading||clipPreviewLoading||renderLoading)?
    <div className={css.processingBanner} role="status" aria-live="polite">
     <LoaderCircle size={21} className={css.spin}/>
     <span>{directorBusy||seedBusy?directorStatus||"Preparando tu video…":
      rendering?stage||"Exportando video…":
      framesRefreshing?"Cargando imágenes del proyecto…":
      characterLoading?"Preparando personajes…":
      clipPreviewLoading?"Cargando clip…":"Abriendo el video terminado…"}</span>
    </div>:null}
   {studioStep==="crear"?<div className={css.modeRow}>
    <button type="button" className={customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(true)}>Tu historia</button>
    <button type="button" className={!customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(false)}>Ejemplos</button>
   </div>:null}
   {studioStep==="crear"&&customMode?<label className={css.promptField}>
    <span>¿Qué quieres contar?</span>
    <textarea disabled={rendering||directorBusy||Boolean(directorPlan?.frames.length)} value={customPrompt} maxLength={2000} rows={4}
     placeholder="Ejemplo: Un pequeño elefante busca agua en la selva. Encuentra un río y ayuda a sus amigos a beber."
     onChange={e=>{setCustomPrompt(e.target.value);setTerraStory(null);setDirectorPlan(null);setSeedUrls([]);setPreviousScene(null);pendingStoryboard.current={prompt:"",images:[]};}}/>
    <small>{directorPlan?.frames.length?"Idea guardada. Para otra historia, selecciona «Nuevo».":customPrompt.length+"/2000 · Video de "+montageSeconds+" segundos · "+scenesForSeconds(montageSeconds)+" escenas"}</small>
   </label>:studioStep==="crear"?<div className={css.topics}>
    <button type="button" className={topic==="space"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("space");}} disabled={rendering}>
     <Globe2 size={21}/>{language==="es"?"Planetas":"Planets"}</button>
    <button type="button" className={topic==="race"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("race");}} disabled={rendering}>
     <CarFront size={21}/>{language==="es"?"Fórmula 1":"Formula 1"}</button>
   </div>:null}
   {studioStep==="crear"&&customMode?<div className={css.createDuration} role="group" aria-label="Duración del video">
    <span>Duración</span>
    {([15,30,60] as const).map(seconds=><button key={seconds} type="button"
     aria-pressed={montageSeconds===seconds}
     className={montageSeconds===seconds?css.createDurationActive:""}
     disabled={rendering||directorBusy||seedBusy||Boolean(directorPlan?.frames.length)}
     onClick={()=>{
      manualDurationRef.current=true;setMontageSeconds(seconds);
      if(customPrompt){
       const saved=readSeedance(customPrompt);
       saved.seconds=seconds;saved.montageSeconds=seconds;saveSeedance(saved);
      }
     }}>{seconds} s</button>)}
   </div>:null}
   {studioStep==="crear"&&customMode?<section className={css.characterPanel}>
    <details>
     <summary>Personajes y estilo visual <span>Opcional</span></summary>
     <p>Reutiliza la apariencia de un proyecto anterior. La IA mantiene rasgos y colores, sin copiar escenarios que no correspondan.</p>
     {cloudProjects.length?<select aria-label="Personajes de otro proyecto" defaultValue=""
      disabled={characterLoading}
      onChange={event=>{if(event.target.value)void importCharacters(event.target.value);}}>
      <option value="">Elegir un estilo guardado…</option>
      {cloudProjects.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
     </select>:null}
     {characterLoading?<p className={css.inlineLoading} role="status"><LoaderCircle className={css.spin} size={15}/> Preparando referencias…</p>:null}
     {characterFrames.length?<div>
      <p>Referencia visual opcional: selecciona una imagen donde se vea claramente el personaje.</p>
      <div className={css.shotStrip} role="group" aria-label="Referencias de personajes">
       {characterFrames.map((frame,index)=><button key={frame.referencePath}
        type="button" aria-pressed={characterReferencePath===frame.referencePath}
        className={characterReferencePath===frame.referencePath?css.shotSelected:""}
        onClick={()=>setCharacterReferencePath(current=>
         current===frame.referencePath?"":frame.referencePath)}>
        <img src={frame.imageUrl} alt={"Referencia de personaje "+(index+1)}/>
        <span>Fotograma {index+1}</span>
       </button>)}
      </div>
      {characterReferencePath?<small>Esta referencia orientará las nuevas imágenes. La edición con imagen puede incrementar el costo de OpenAI.</small>:null}
     </div>:null}
     <textarea value={characterGuide} maxLength={1100} rows={3}
      aria-label="Guía visual de personajes"
      placeholder="Rostro, peinado, ropa, colores, proporciones y estilo de los personajes recurrentes…"
      onChange={event=>{setCharacterGuide(event.target.value);
       try{localStorage.setItem("vmv-motion-character-guide-v1",event.target.value);}catch{}}}/>
    </details>
   </section>:null}
   <section className={css.stage}>
    {!customMode?<div className={css.canvasWrap}>
     <canvas ref={canvas} width={STICKMAN_WIDTH} height={STICKMAN_HEIGHT}
      aria-label="Vista previa de animación Stickman" role="img"/>
     {!rendering?<button className={css.play} type="button"
       onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pausar":"Reproducir"}>
       {playing?<Pause size={18}/>:<Play size={18}/>}
      </button>:null}
     <span className={css.duration}>{customMode?montageSeconds+"s":"30s"} · 9:16</span>
    </div>:null}
    {studioStep==="crear"?<div className={css.controls}>
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
      checked={withVoice} onChange={e=>setProjectNarration(e.target.checked)}/>
      <Volume2 size={15}/>{language==="es"?"Voz IA":"AI voice"}</label>
    </div>:null}
    {studioStep==="crear"&&withVoice&&customMode?<div className={css.voiceOptions}><strong>ElevenLabs · Narración continua</strong><small>Audio y subtítulos sincronizados</small></div>:null}
    {studioStep==="crear"&&withVoice&&!customMode?<div className={css.voiceOptions}>
     {(["alloy","nova"] as const).map(v=><button key={v} type="button"
      disabled={rendering} className={voice===v?css.selected:""} onClick={()=>setVoice(v)}>
      {v==="alloy"?"Alloy":"Nova"}</button>)}
     <small>{language==="es"?"Usa créditos de voz":"Uses voice credits"}</small>
    </div>:null}
    {studioStep==="crear"&&!customMode?<button className={css.generate} type="button"
     onClick={()=>void generate()} disabled={rendering||(customMode&&customPrompt.trim().length<8)}>
     {rendering?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {rendering?(stage+" · "+progress+"%"):(language==="es"?"Generar video":"Generate video")}
    </button>:null}
    {false&&customMode?<button className={css.generate} type="button"
     disabled={miniBusy||rendering||customPrompt.trim().length<8}
     onClick={()=>void generateMinimax()}>
     {miniBusy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {miniBusy?miniStage||"Generando con MiniMax":"Video con movimiento real · MiniMax H3 Max · ~US$1.20"}
    </button>:null}
    {false&&customMode?<small>MiniMax genera un video vertical de 15 segundos a 768p. El precio mostrado es estimado; confirmar este botón inicia una generación pagada en Vercel AI Gateway. No incluye narración ni subtítulos automáticos.</small>:null}
    {false&&miniUrl?<div className={css.result}>
      <div className={css.resultTitle}><Check size={18}/><strong>Video con MiniMax listo</strong></div>
      <video src={miniUrl} controls playsInline preload="metadata"/>
      <a href={miniUrl} target="_blank" rel="noreferrer"><Download size={16}/>Abrir MP4 para guardar</a>
     </div>:null}
    {studioStep==="crear"&&customMode&&!directorPlan?.frames.length?<button className={css.generate} type="button"
     disabled={directorBusy||seedBusy||rendering||customPrompt.trim().length<8}
     onClick={()=>void prepareStoryboard()}>
     {directorBusy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {directorBusy?directorStatus:"Generar video"}
    </button>:null}
    {studioStep==="editar"&&customMode&&directorPlan&&directorPlan.frames.length===directorPlan.scenes.length?
     <section className={css.studioPanel} aria-label="Editor del video">
      <div className={css.studioSectionHeading}>
       <div><h2>Editar tu video</h2>
        <p>Cambia una escena sin perder las demás. {savedClipCount}/{directorPlan.scenes.length} clips guardados.</p></div>
       <button type="button" className={css.ghostButton} onClick={()=>setStudioStep("revisar")}>
        Revisar imágenes</button>
      </div>
      <section className={css.voiceChanger} aria-label="Cambiar voz del video">
       <div className={css.voiceChangerHeader}>
        <span className={css.voiceChangerIcon}><Volume2 size={19}/></span>
        <div><h3>Narración del video</h3>
         <p>{withVoice?"Voz seleccionada: "+selectedVoiceName(voicePreset):"Sin voz IA · solo música y efectos"}</p></div>
        <button type="button" className={css.ghostButton}
         disabled={directorBusy||seedBusy}
         onClick={()=>setVoiceEditorOpen(value=>!value)}>
         {voiceEditorOpen?"Cerrar":withVoice?"Cambiar voz":"Activar voz"}</button>
       </div>
       {voiceEditorOpen?<div className={css.voiceChangerBody}>
        <p>Elige otra voz para toda la historia. El sistema actualizará la narración y los subtítulos.</p>
        <PilotVoiceStep language={language} en={language==="en"}
         selectedProvider={voicePreset==="elevenlabs"?"elevenlabs":"openai"}
         selectedVoiceId={voicePreset==="elevenlabs"?pilotVoiceId:voicePreset}
         onChoose={(provider,id)=>{
          if(provider==="none"){setProjectNarration(false);return;}
          chooseProjectVoice(provider==="elevenlabs"?"elevenlabs":id as VoicePreset,
           provider==="elevenlabs"?id:undefined);
         }}/>
        <button type="button" className={css.generate}
         disabled={directorBusy||seedBusy||savedClipCount!==directorPlan.scenes.length||
          framesRefreshing||editingSpeech!==null}
         onClick={()=>void animateApproved("voice")}>
         {directorBusy?<LoaderCircle className={css.spin} size={18}/>:<Volume2 size={18}/>}
         {directorBusy?"Creando voz y montaje…":"Crear versión con esta voz"}
        </button>
        <small>Solo se cobran créditos de voz. No se regeneran los clips de Seedance.
         El video original permanece guardado.</small>
       </div>:null}
      </section>
      <div className={css.shotStrip} role="group" aria-label="Selecciona la escena">
       {directorPlan.frames.map((frame,index)=>{
        const job=readSeedance(directorPlan.prompt);
        const ready=Boolean(job.urls[index]),pending=Boolean(job.needsMotion?.[index]);
        return <button type="button" key={index} aria-pressed={selectedScene===index}
         className={selectedScene===index?css.shotSelected:""}
         onClick={()=>{setSelectedScene(index);setSelectedClipPreview("");setError("");}}>
         <img src={frame.imageUrl} alt={"Escena "+(index+1)} loading="lazy"/>
         <span>{index+1}{pending?" · Editada":ready?" · Lista":""}</span>
        </button>;
       })}
      </div>
      <div className={css.editorFocus}>
       <div className={css.editorMedia}>
        {selectedClipPreview?<video src={selectedClipPreview} controls playsInline preload="metadata"/>:
         <img src={directorPlan.frames[selectedScene].imageUrl} alt={"Fotograma escena "+(selectedScene+1)}/>}
        {readSeedance(directorPlan.prompt).urls[selectedScene]?
         <button type="button" className={css.ghostButton}
          onClick={()=>void previewSelectedClip(selectedScene)}>
          {selectedClipPreview?"Volver a cargar clip":"Reproducir clip guardado"}</button>:null}
       </div>
       <div className={css.editorFields}>
        <h3>Escena {selectedScene+1} <span>{selectedScene*5}–{(selectedScene+1)*5} s</span></h3>
        <label htmlFor="scene-motion-description">Movimiento de la escena</label>
        <textarea id="scene-motion-description" value={motionDraft} maxLength={650} rows={4}
         disabled={seedBusy||directorBusy}
         onChange={event=>setMotionDraft(event.target.value)}/>
        <div className={css.editorActions}>
         <button type="button" disabled={seedBusy||directorBusy||motionDraft.trim().length<18}
          onClick={saveMotionDirection}>Guardar movimiento</button>
         <button type="button" disabled={seedBusy||directorBusy}
          onClick={()=>void renderSingleScene(selectedScene)}>
          {sceneRendering===selectedScene?"Animando…":
           readSeedance(directorPlan.prompt).draftTokens?.[selectedScene]?
            "Recuperar animación":"Animar solo esta escena · ~$0.10"}
         </button>
        </div>
        {readSeedance(directorPlan.prompt).needsMotion?.[selectedScene]?
         <small className={css.attention}>Esta escena cambió. Reanímala antes del montaje final.</small>:null}
        {readSeedance(directorPlan.prompt).history?.[selectedScene]?.length?
         <button className={css.ghostButton} type="button" disabled={seedBusy}
          onClick={()=>revertClip(selectedScene)}>Recuperar clip anterior</button>:null}
        <label>Narración</label>
        {editingSpeech===selectedScene?<div className={css.narrationEdit}>
         <textarea aria-label={"Narración escena "+(selectedScene+1)}
          maxLength={165} value={speechDraft} rows={3}
          onChange={event=>setSpeechDraft(event.target.value)}/>
         <div className={css.editorActions}>
          <button type="button" onClick={()=>saveSpeechEdit(selectedScene)}>Guardar voz</button>
          <button type="button" onClick={()=>setEditingSpeech(null)}>Cancelar</button>
         </div>
        </div>:<div className={css.narrationEdit}>
         <p>{directorPlan.scenes[selectedScene].speech}</p>
         <button type="button" className={css.ghostButton}
          onClick={()=>beginSpeechEdit(selectedScene)}>Editar narración sin rehacer video</button>
        </div>}
       </div>
      </div>
      <details className={css.finishingOptions}>
       <summary>Acabado de video <span>ASMR · voz · música · transiciones</span></summary>
       <div className={css.finishGrid}>
        <label>Duración del video final
         <select value={String(montageSeconds)}
          onChange={e=>{const value=Number(e.target.value);
           if(!validMotionSeconds(value)||value>directorPlan.scenes.length*5)return;
           setMontageSeconds(value);
           if(customPrompt){const job=readSeedance(customPrompt);job.montageSeconds=value;
            saveSeedance(job);}}}>
          <option value="15">15 segundos{directorPlan.scenes.length===3?" · original":" · montaje corto"}</option>
          <option value="30" disabled={directorPlan.scenes.length<6}>
           30 segundos{directorPlan.scenes.length===6?" · original":" · montaje corto"}</option>
          <option value="60" disabled={directorPlan.scenes.length<12}>60 segundos · original</option>
         </select>
        </label>
        <label className={css.asmrOption}>
         <span><input type="checkbox" checked={asmrEnabled}
          disabled={directorBusy||seedBusy}
          onChange={e=>{const enabled=e.target.checked;setAsmrEnabled(enabled);
           if(enabled){setProjectNarration(false);setSubtitles(false);
            setVoiceEditorOpen(false);}
           if(customPrompt){const job=readSeedance(customPrompt);
            job.asmrEnabled=enabled;
            if(enabled){job.narrationEnabled=false;}
            // ASMR can be mixed at either 30s or 60s. Never change the selected duration.
            job.montageSeconds=montageSeconds;
            saveSeedance(job);}}}/>
          Sonidos ASMR con IA</span>
         <small>Compatible con 15, 30 o 60 segundos. Los efectos se sincronizan con las escenas y pueden mezclarse con música sin narración. Requiere autorización y créditos.</small>
        </label>
        <label className={css.asmrOption}>
         <span><input type="checkbox" checked={withVoice&&!asmrEnabled}
          disabled={directorBusy||seedBusy}
          onChange={e=>setProjectNarration(e.target.checked)}/>
          Narración con voz IA</span>
         <small>{withVoice&&!asmrEnabled?
          "Activada: se generará voz al montar. Puede consumir créditos.":
          "Desactivada: no se generará narración. Los sonidos ASMR y la música funcionan por separado."}</small>
        </label>
        {withVoice&&!asmrEnabled?<label>Volumen de narración <strong>{narrationVolume}%</strong>
         <input type="range" min="0" max="150" step="5" value={narrationVolume}
          onChange={e=>setNarrationVolume(Number(e.target.value))}/></label>:null}
        <label>Música de fondo (opcional · compatible con ASMR)
         <input type="file" accept="audio/*" aria-label="Música de fondo"
          onChange={e=>{const file=e.target.files?.[0]||null;
           if(file&&file.size>30000000){setError("La música debe ocupar menos de 30 MB.");return;}
           setMusicFile(file);}}/>
        </label>
        {musicFile?<label>Volumen de música <strong>{musicVolume}%</strong>
         <input type="range" min="0" max="70" step="2" value={musicVolume}
          onChange={e=>setMusicVolume(Number(e.target.value))}/></label>:null}
        <label>Transición entre escenas
         <select value={String(fadeSeconds)} onChange={e=>setFadeSeconds(Number(e.target.value))}>
          <option value="0">Corte directo</option><option value="0.2">Suave · 0.2 s</option>
          <option value="0.4">Cinematográfica · 0.4 s</option>
         </select>
        </label>
       </div>
       <p>Se conservan los {directorPlan.scenes.length} clips de 5 segundos. La duración original es {directorPlan.scenes.length*5} segundos. Puedes añadir música y sonidos ASMR sin volver a animar las escenas.</p>
      </details>
      {directorStatus?<p className={css.cloudState} role="status">{directorStatus}</p>:null}
      <button type="button" className={css.generate}
       disabled={directorBusy||seedBusy||framesRefreshing||editingSpeech!==null||
        directorPlan.frames.length!==directorPlan.scenes.length||
        !directorPlan.scenes.every((scene,i)=>directorPlan.approved?.[i]===true&&
         (directorPlan.draftPrompts?.[i]??scene.imagePrompt)===scene.imagePrompt)}
       onClick={()=>void animateApproved()}>
       {directorBusy?directorStatus:savedClipCount===directorPlan.scenes.length?
        "Montar video · conservar "+directorPlan.scenes.length+" clips":"Continuar animaciones pendientes"}
      </button>
      <small className={css.mutedNote}>Regenerar un clip requiere autorización. El montaje reutiliza las demás escenas y no vuelve a pagar Seedance.</small>
     </section>:null}
    {studioStep==="revisar"&&customMode&&directorPlan?.frames.length?<section className={css.storyReview} aria-label="Revisión de escenas">
     <div className={css.storyHeading}>
      <h2>Revisa tus escenas</h2>
      <p>{directorPlan.title} · {directorPlan.frames.length}/{directorPlan.scenes.length} imágenes ·
       {(directorPlan.approved||[]).filter(Boolean).length}/{directorPlan.scenes.length} aprobadas</p>
      {framesRefreshing?<p className={css.inlineLoading} role="status">
       <LoaderCircle className={css.spin} size={15}/> Cargando tus imágenes…
      </p>:null}
      {frameRefreshError?<div className={css.inlineError} role="alert">
       <span>{frameRefreshError}</span>
       <button type="button" disabled={framesRefreshing}
        onClick={()=>void refreshDirectorFrames(directorPlan.prompt,true)}>
        <RotateCcw size={14}/> Reintentar
       </button>
      </div>:null}
     </div>
     {directorPlan.scenes.map((scene,index)=>{
      const frame=directorPlan.frames[index];
      const history=directorPlan.previous?.[index]||[];
      const older=history[history.length-1];
      const viewingOld=previousScene===index&&!!older;
      const draft=directorPlan.draftPrompts?.[index]??scene.imagePrompt;
      const approved=directorPlan.approved?.[index]===true&&draft===scene.imagePrompt;
      return <article className={css.sceneCard} key={index}>
       <h3>Escena {index+1} <span>{index*5}–{(index+1)*5} s {approved?"· Aprobada":""}</span></h3>
       <div className={css.sceneBody}>
        <div className={css.sceneVisual}>
         {frame?<img src={viewingOld?(older?.imageUrl||frame.imageUrl):frame.imageUrl}
          alt={"Fotograma "+(index+1)+(viewingOld?" anterior":" actual")} loading="lazy"/>:
          <div className={css.sceneEmpty}>Imagen pendiente</div>}
         {viewingOld?<small>Versión anterior</small>:null}
        </div>
        <div className={css.sceneDescription}>
         <strong>Narración</strong>
         {editingSpeech===index?<div>
          <textarea aria-label={"Editar narración de escena "+(index+1)}
           value={speechDraft} maxLength={165} rows={3}
           disabled={directorBusy||seedBusy||rendering}
           onChange={event=>setSpeechDraft(event.target.value)}/>
          <small>{speechDraft.trim().length}/165 caracteres · Aproximadamente 5 segundos</small>
          <div className={css.sceneActions}>
           <button type="button" disabled={directorBusy||seedBusy||rendering||speechDraft.trim().length<8}
            onClick={()=>saveSpeechEdit(index)}><Check size={15}/>Guardar narración</button>
           <button type="button" disabled={directorBusy||seedBusy||rendering}
            onClick={()=>{setEditingSpeech(null);setSpeechDraft("");setError("");}}>Cancelar</button>
          </div>
         </div>:<>
          <p>{scene.speech}</p>
          <div className={css.sceneActions}>
           <button type="button"
            disabled={directorBusy||seedBusy||rendering}
            onClick={()=>beginSpeechEdit(index)}>Editar narración</button>
          </div>
         </>}
         <label htmlFor={"motion-prompt-"+index}>Prompt de imagen</label>
         <textarea id={"motion-prompt-"+index} value={draft} maxLength={1700} rows={4}
          disabled={directorBusy||seedBusy} onChange={e=>updateScenePrompt(index,e.target.value)}/>
         <div className={css.sceneActions}>
          <button type="button" disabled={!frame||directorBusy||seedBusy}
           onClick={()=>void regenerateScene(index)}>
           {regeneratingScene===index?<LoaderCircle className={css.spin} size={15}/>:<RotateCcw size={15}/>}
           Regenerar
          </button>
          {older?<button type="button" disabled={directorBusy||seedBusy}
           onClick={()=>void togglePrevious(index)}>
           {viewingOld?"Volver a actual":"Ver anterior"}</button>:null}
          {viewingOld?<button type="button" disabled={directorBusy||seedBusy}
           onClick={()=>restorePrevious(index)}>Restaurar anterior</button>:null}
          <button type="button" className={approved?css.approved:""}
           disabled={!frame||viewingOld||directorBusy||seedBusy||draft!==scene.imagePrompt}
           onClick={()=>approveScene(index)}><Check size={15}/>{approved?"Aprobada":"Aprobar"}</button>
         </div>
        </div>
       </div>
      </article>;
     })}
     {directorPlan.frames.length<directorPlan.scenes.length?<button type="button" className={css.generate}
      disabled={directorBusy} onClick={()=>void prepareStoryboard()}>
      {directorBusy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
      {directorBusy?directorStatus||"Creando imágenes…":"Continuar con las imágenes"}
     </button>:null}
     {directorPlan.frames.length===directorPlan.scenes.length?<button type="button" className={css.generate}
      disabled={directorBusy||seedBusy||framesRefreshing||editingSpeech!==null||regeneratingScene!==null||
       !directorPlan.scenes.every((scene,i)=>directorPlan.approved?.[i]===true&&
        (directorPlan.draftPrompts?.[i]??scene.imagePrompt)===scene.imagePrompt)}
      onClick={()=>setStudioStep("editar")}>
      Continuar al editor
     </button>:null}
     <small>Seedance se inicia solo tras aprobar todas las escenas. Regenerar imágenes consume créditos de OpenAI.
      Animar {directorPlan.scenes.length} clips cuesta aproximadamente US${(directorPlan.scenes.length*0.103).toFixed(2)} de Seedance Turbo, más imágenes y voz opcional.
      Si se interrumpe, se conservan los clips completados.</small>
    </section>:null}
    {studioStep==="publicar"&&customMode&&seedJoined?<div className={css.result}>
     <div className={css.resultTitle}><Check size={18}/><strong>Video terminado · {montageSeconds} segundos{asmrEnabled?" · ASMR":""}</strong></div>
     <video src={seedJoined} controls playsInline/>
     <a href={seedJoined} download={"vmv-motion-"+montageSeconds+"s."+extension}><Download size={16}/>Descargar video</a>
    </div>:null}
    {studioStep==="publicar"&&customMode&&directorPlan?<section className={css.studioPanel} aria-label="Publicar y medir">
     {!seedJoined?<button type="button" className={css.ghostButton}
      disabled={renderLoading} onClick={()=>void refreshCloudRender()}>
      {renderLoading?<LoaderCircle size={16} className={css.spin}/>:null}
      Abrir video guardado
     </button>:null}
     <div className={css.studioSectionHeading}><div>
      <h2>Listo para compartir</h2>
      <p>Prepara tu publicación y mide resultados sin salir de VMV Motion.</p>
     </div></div>
     <div className={css.editorActions}>
      <button type="button" className={css.ghostButton} onClick={suggestPublication}>
       Sugerir descripción</button>
      <button type="button" className={css.ghostButton} onClick={openVoiceEditor}>
       <Volume2 size={16}/> Cambiar voz</button>
      <button type="button" className={css.ghostButton} onClick={()=>setStudioStep("editar")}>
       Editar escenas</button>
     </div>
     {voiceRevisions.length?<div className={css.videoVersions}>
      <h3>Versiones del video</h3>
      <p>El video original siempre estará disponible.</p>
      <div className={css.versionList}>
       <button type="button" disabled={renderLoading}
        className={!activeRenderId?css.versionActive:""}
        onClick={()=>void selectVideoVersion("")}>Original</button>
       {voiceRevisions.map((item,index)=><button key={item.id} type="button"
        className={activeRenderId===item.id?css.versionActive:""}
        disabled={renderLoading} onClick={()=>void selectVideoVersion(item.id)}>
        {item.voice} · {index+1}
       </button>)}
      </div>
     </div>:null}
     <div className={css.publishFields}>
      <label>Título
       <input maxLength={100} value={publishDraft.title}
        placeholder={directorPlan.title} onChange={e=>updatePublish({title:e.target.value})}/></label>
      <label>Descripción
       <textarea maxLength={1800} rows={4} value={publishDraft.caption}
        placeholder="Describe el valor del video e invita a interactuar…"
        onChange={e=>updatePublish({caption:e.target.value})}/></label>
      <label>Hashtags
       <input maxLength={300} value={publishDraft.hashtags}
        placeholder="#Video #Historia" onChange={e=>updatePublish({hashtags:e.target.value})}/></label>
      <label>Plataforma
       <select value={publishDraft.platform} onChange={e=>updatePublish({platform:e.target.value})}>
        <option>TikTok</option><option>Instagram</option><option>YouTube</option>
       </select></label>
      <label>Fecha planificada <small>No publica automáticamente</small>
       <input type="datetime-local" value={publishDraft.scheduledFor}
        onChange={e=>updatePublish({scheduledFor:e.target.value})}/></label>
     </div>
     <div className={css.editorActions}>
      <button type="button" onClick={()=>void copyPublication()}>Copiar texto</button>
      {seedJoined?<button type="button" onClick={()=>void shareFinishedVideo()}>
       Compartir enlace</button>:null}
     </div>
     <p className={css.mutedNote}>Abre tu plataforma para subir el MP4. No publicamos en tu nombre sin conectar y autorizar esa cuenta.</p>
     <div className={css.socialLinks}>
      <a href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer">TikTok</a>
      <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">Instagram</a>
      <a href="https://studio.youtube.com/" target="_blank" rel="noreferrer">YouTube Studio</a>
     </div>
     <details className={css.finishingOptions}>
      <summary>Resultados de marketing <span>Registro manual</span></summary>
      <p>Introduce datos de la publicación real. No son métricas verificadas por las plataformas.</p>
      <div className={css.finishGrid}>
       {([["views","Visualizaciones"],["leads","Contactos"],["sales","Ventas"],
         ["revenueUsd","Ingresos USD"],["spendUsd","Inversión USD"]] as const).map(([key,label])=>
         <label key={key}>{label}
          <input type="number" min="0" step={key==="revenueUsd"||key==="spendUsd"?"0.01":"1"}
           value={publishDraft[key]} onChange={e=>updatePublish({[key]:Math.max(0,Number(e.target.value)||0)})}/>
         </label>)}
      </div>
      <div className={css.metricsSummary}>
       <span>Conversión a contacto: {publishDraft.views?
        (publishDraft.leads/publishDraft.views*100).toFixed(1)+"%":"—"}</span>
       <span>ROI declarado: {publishDraft.spendUsd>0?
        ((publishDraft.revenueUsd-publishDraft.spendUsd)/publishDraft.spendUsd*100).toFixed(1)+"%":"—"}</span>
      </div>
      <button type="button" className={css.ghostButton}
       onClick={()=>updatePublish({postedAt:new Date().toISOString()})}>
       {publishDraft.postedAt?"Actualizar fecha de publicación":"Marcar como publicado manualmente"}
      </button>
      {publishDraft.postedAt?<p className={css.mutedNote}>
       Fecha indicada: {new Date(publishDraft.postedAt).toLocaleString("es-US")}</p>:null}
     </details>
     {shareStatus?<p role="status" className={css.cloudState}>{shareStatus}</p>:null}
    </section>:null}
    {error?<p role="alert" className={css.error}>{error}</p>:null}
    {videoUrl?<div className={css.result}>
     <div className={css.resultTitle}><Check size={18}/><strong>{language==="es"?"Video terminado":"Finished video"}</strong></div>
     <video src={videoUrl} controls playsInline preload="metadata"/>
     <a href={videoUrl} download={"vmv-stickman-"+(customMode?"historia":topic)+"."+extension}>
      <Download size={16}/>{language==="es"?"Descargar":"Download"}</a>
    </div>:null}
   </section>
   {!customMode?<p className={css.note}>Elige una historia para comenzar. Toda generación de IA requiere autorización.</p>:null}
  </>}
  </div>
 </main>;
}
