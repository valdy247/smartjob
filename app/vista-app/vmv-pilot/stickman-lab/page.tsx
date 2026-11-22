"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowLeft,CarFront,Check,Download,Globe2,LoaderCircle,Pause,Play,RotateCcw,Volume2,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import VMVAuthGateway from "@/components/VMVAuthGateway";
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
async function loadContinuousVoice(phrases:string[]):Promise<ContinuousSpeech>{
 const sb=getSupabase();if(!sb)throw Error("Inicia sesión para crear la narración.");
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión para crear la narración.");
 const response=await fetch("/api/video-generator/speech/continuous",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({scenes:phrases,confirmCost:true})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(
  result?.error==="elevenlabs_not_configured_in_preview"?"Falta ELEVENLABS_API_KEY en Vercel Preview.":
  result?.error==="elevenlabs_key_rejected"?"ElevenLabs rechazó la clave API.":
  result?.error==="elevenlabs_credits_required"?"ElevenLabs requiere un plan compatible con la voz seleccionada o créditos adicionales. En cuentas Free, algunas voces no están disponibles por API. Tus clips de Seedance siguen guardados.":
  result?.error==="elevenlabs_rate_limited"?"ElevenLabs alcanzó el límite de solicitudes.":
  result?.error==="elevenlabs_voice_unavailable"?"La voz configurada no está disponible para esta cuenta de ElevenLabs. Verifica ELEVENLABS_VOICE_ID.":
  result?.error==="elevenlabs_access_denied"?"Esta clave no tiene permisos para generar voz en ElevenLabs.":
  result?.providerCode==="max_character_limit_exceeded"||result?.providerCode==="text_too_long"?"ElevenLabs rechazó el texto por longitud.":
  result?.providerCode==="model_access_denied"||result?.providerCode==="feature_not_available"?"Tu plan de ElevenLabs no permite usar el modelo o esta función.":
  "ElevenLabs rechazó la narración ("+String(result?.error||response.status)+
   (result?.providerCode&&result.providerCode!=="unknown"?" / "+result.providerCode:"")+
   "). Los 12 clips existentes se conservan."
 );
 if(typeof result.audio!=="string"||!result.alignment||!Number.isFinite(result.duration))
  throw Error("ElevenLabs no devolvió audio y tiempos válidos.");
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

const MOTION_SCENES=12;
type DirectorBeat={speech:string;caption:string;imagePrompt:string;motionPrompt:string};
type DirectorFrame={imageUrl:string;referencePath:string;prompt?:string};
type DirectorPlan={prompt:string;title:string;storyBible:string;scenes:DirectorBeat[];frames:DirectorFrame[];
 approved?:boolean[];draftPrompts?:string[];previous?:Record<string,DirectorFrame[]>};
const DIRECTOR_PLAN_KEY="vmv-motion-director-plan-v5-60s";
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
}
function readDirectorPlan(prompt:string):DirectorPlan|null{
 const d=readSavedMotion(DIRECTOR_PLAN_KEY) as Partial<DirectorPlan>|null;
 if(d?.prompt===prompt&&Array.isArray(d.scenes)&&d.scenes.length===MOTION_SCENES&&Array.isArray(d.frames))
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
  result?.error==="motion_scene_retry"?(result?.stage==="narration"?"El guion tiene fragmentos incompletos. No se generaron imágenes nuevas.":result?.stage==="storyboard"?"El storyboard no contiene las 12 escenas válidas. No se generaron imágenes nuevas.":result?.reason==="output_truncated"?"La respuesta de OpenAI se cortó antes de terminar. Prueba generar el guion nuevamente.":"OpenAI devolvió una respuesta incompleta. No se generaron imágenes nuevas."):
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
type SeedanceSaved={prompt:string;tokens:string[];urls:string[]};
const SEEDANCE_KEY="vmv-motion-seedance-director-v5-60s";
function readSeedance(prompt:string):SeedanceSaved{
 const state=readSavedMotion(SEEDANCE_KEY) as Partial<SeedanceSaved>|null;
 if(state?.prompt===prompt&&Array.isArray(state.tokens)&&Array.isArray(state.urls))
  return {prompt,tokens:state.tokens,urls:state.urls};
 return {prompt,tokens:[],urls:[]};
}
function saveSeedance(value:SeedanceSaved){saveMotion(SEEDANCE_KEY,value);}
async function seedanceRequest(accessToken:string,body:Record<string,unknown>){
 const response=await fetch("/api/video-generator/motion-seedance",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+accessToken},body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error==="motion_limit"?"Límite diario de pruebas alcanzado. Los clips terminados se conservan.":
  data?.error==="video_status_unavailable"?"No se pudo consultar el estado; reintenta para recuperar el trabajo sin generar otro.":
  data?.error==="ai_gateway_auth_not_configured"?"Vercel AI Gateway rechazó la autenticación o los permisos.":
  data?.error==="ai_gateway_credits_required"?"Vercel AI Gateway informa que se necesitan créditos o configurar pagos.":
  data?.error==="seedance_invalid_parameters"?"Seedance rechazó un parámetro de video. No vuelvas a pagar hasta corregirlo.":
  data?.error==="seedance_gateway_unavailable"?"Vercel AI Gateway tuvo un fallo interno antes de iniciar Seedance. No se ha confirmado que sea por créditos.":
  data?.error==="seedance_video_start_failed"?"Seedance no pudo iniciar la generación.":
  data?.error==="invalid_video_job"?"El identificador del trabajo caducó.": "No pudimos contactar a Seedance.");
 return data;
}
async function loadSeedanceForStitching(accessToken:string,token:string):Promise<string>{
 const response=await fetch("/api/video-generator/motion-seedance",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
  body:JSON.stringify({action:"download",token})
 });
 if(!response.ok)throw Error("No se pudo recuperar el clip desde Seedance. Si el enlace expiró, conserva el clip original.");
 const bytes=await response.blob();
 if(bytes.size<1000||bytes.size>26000000)throw Error("El clip recibido está incompleto.");
 return URL.createObjectURL(new Blob([bytes],{type:"video/mp4"}));
}
async function stitchSeedanceClips(urls:string[],speech:ContinuousSpeech|null=null,showSubtitles=false):Promise<{blob:Blob;extension:"mp4"|"webm"}>{
 if(urls.length!==MOTION_SCENES)throw Error("Faltan clips para unir.");
 const format=chosenFormat();
 const canvas=document.createElement("canvas");canvas.width=720;canvas.height=1280;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx||!canvas.captureStream)throw Error("Este navegador no puede unir videos.");
 const stream=canvas.captureStream(24);
 let audioContext:AudioContext|null=null;
 let recorder:MediaRecorder|null=null;
 let raf=0;
 const videos:HTMLVideoElement[]=[];
 try{
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
 if(speech){
  audioContext=new AudioContext();await audioContext.resume();
  const decoded=await audioContext.decodeAudioData(speech.audio.slice(0));
  decodedDuration=decoded.duration;
  const mix=audioContext.createMediaStreamDestination();
  const source=audioContext.createBufferSource();source.buffer=decoded;source.connect(mix);
  for(const track of mix.stream.getAudioTracks())stream.addTrack(track);
  // A single uninterrupted narration track.
  source.start(audioContext.currentTime+0.3);
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
   video.currentTime=0;
   await video.play();
   const endTime=speech?.sceneEnds?.[index]??(index+1)*5;
   // Each scene gets exactly its spoken duration. Longer speech holds the end frame.
   await new Promise<void>((resolve,reject)=>{
    const frame=()=>{
     try{
      const ratio=Math.max(canvas.width/video.videoWidth,canvas.height/video.videoHeight);
      const width=video.videoWidth*ratio,height=video.videoHeight*ratio;
      ctx.drawImage(video,(720-width)/2,(1280-height)/2,width,height);
      drawCaption(Math.max(0,(performance.now()-videoStart)/1000));
      if((performance.now()-videoStart)/1000>=endTime){resolve();return;}
      raf=requestAnimationFrame(frame);
     }catch{reject(Error("El navegador no pudo componer uno de los clips."));}
    };
    raf=requestAnimationFrame(frame);
   });
   video.pause();
  }
  // Hold the final video frame if the complete narration runs longer than its images.
  const remaining=Math.max(0,decodedDuration-((performance.now()-videoStart)/1000)+0.3);
  if(remaining>0){
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
 const [customMode,setCustomMode]=useState(false);
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
 const [regeneratingScene,setRegeneratingScene]=useState<number|null>(null);
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
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);if(seedJoinedRef.current)URL.revokeObjectURL(seedJoinedRef.current);},[]);
 useEffect(()=>{
  try{
   const saved=readSavedMotion(DIRECTOR_PLAN_KEY) as DirectorPlan|null;
   if(saved?.prompt&&typeof saved.prompt==="string"&&saved.scenes?.length===MOTION_SCENES){
    // Migrate this tab's existing project into cross-tab recovery storage.
    saveDirectorPlan(saved);
    const recovered=readSeedance(saved.prompt);
    if(recovered.urls.length||recovered.tokens.length)saveSeedance(recovered);
    setCustomPrompt(saved.prompt);setCustomMode(true);setWithVoice(true);
    setSavedClipCount(readSeedance(saved.prompt).urls.filter(Boolean).length);
    const plan=readDirectorPlan(saved.prompt);
    if(plan){
     setDirectorPlan(plan);
     // Signed previews expire; refresh URLs without purchasing new generations.
     void (async()=>{
      const sb=getSupabase();if(!sb)return;
      const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)return;
      const refreshed:DirectorFrame[]=[];
      for(const frame of plan.frames){
       try{
        const img=await directorCall(session.access_token,"/api/video-generator/motion-image",
         {action:"preview",referencePath:frame.referencePath});
        refreshed.push({...frame,imageUrl:img.imageUrl});
       }catch{refreshed.push(frame);}
      }
      setDirectorPlan(old=>old?.prompt===plan.prompt?{...old,frames:refreshed}:old);
     })();
    }
   }
  }catch{}
 },[]);
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
   if(!plan){
    setDirectorStatus("Escribiendo narración y diseñando las 12 escenas");
    const result=await directorCall(accessToken,"/api/video-generator/motion-terra",{prompt:customPrompt});
    if(!Array.isArray(result.scenes)||result.scenes.length!==MOTION_SCENES)
     throw Error("La IA no devolvió doce escenas.");
    plan={prompt:customPrompt,title:String(result.title||"VMV Motion"),storyBible:String(result.storyBible||""),
     scenes:result.scenes.map((row:DirectorBeat)=>({
      speech:row.speech,caption:row.caption,imagePrompt:row.imagePrompt,motionPrompt:row.motionPrompt||row.imagePrompt
     })),frames:[],approved:[],draftPrompts:result.scenes.map((row:DirectorBeat)=>row.imagePrompt),previous:{}};
    saveDirectorPlan(plan);
   }
   setDirectorPlan({...plan});
   for(let i=plan.frames.length;i<MOTION_SCENES;i++){
    setDirectorStatus("Creando imagen "+(i+1)+"/"+MOTION_SCENES);
    const image=await directorCall(accessToken,"/api/video-generator/motion-image",{
     mode:"storyframe",
     prompt:["GLOBAL ART DIRECTION AND RECURRING CHARACTER TRAITS: "+plan.storyBible,
      "THIS SHOT ONLY: "+plan.scenes[i].imagePrompt,
      "Draw only this shot. Preserve the same recurring cast and art style, without copying unrelated objects from other scenes."].join(" ").slice(0,1750)
    });
    if(typeof image.imageUrl!=="string"||typeof image.referencePath!=="string")
     throw Error("No se obtuvo la imagen de la escena "+(i+1)+".");
    plan.frames.push({imageUrl:image.imageUrl,referencePath:image.referencePath,prompt:plan.scenes[i].imagePrompt});
    saveDirectorPlan(plan);setDirectorPlan({...plan,frames:[...plan.frames]});
   }
   setDirectorStatus("Revisa las 12 escenas y apruébalas antes de animar");
  }catch(e){
   setError(e instanceof Error?e.message:"No se pudieron preparar las imágenes.");
   setDirectorStatus("");
  }finally{directorBusyRef.current=false;setDirectorBusy(false);}
 },[customPrompt]);
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
  if(readSeedance(directorPlan.prompt).tokens.some(Boolean)){
   setError("Ya existen animaciones Seedance. No reemplaces imágenes de un video iniciado; crea una historia nueva para evitar mezclar escenas.");
   return;
  }
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
  });setPreviousScene(null);setError("");
 },[]);
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
 const animateApproved=useCallback(async()=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current)return;
  const plan=readDirectorPlan(customPrompt);
  if(!plan||plan.frames.length!==MOTION_SCENES||
   !Array.from({length:MOTION_SCENES},(_,i)=>i).every(i=>plan.approved?.[i]===true&&
    (plan.draftPrompts?.[i]??plan.scenes[i].imagePrompt)===plan.scenes[i].imagePrompt)){
   setError("Aprueba las 12 imágenes y regenera cualquier escena cuyo prompt hayas editado.");return;
  }
  directorBusyRef.current=true;seedBusyRef.current=true;setDirectorBusy(true);setSeedBusy(true);
  setError("");setSeedJoined("");
  try{
   const client=getSupabase();if(!client)throw Error("Inicia sesión para generar el video.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para generar el video.");
   const accessToken=session.access_token;
   if(withVoice){
    const check=await fetch("/api/video-generator/speech/continuous",{headers:{Authorization:"Bearer "+accessToken},cache:"no-store"});
    const config=await check.json().catch(()=>null);
    if(!check.ok||!config?.configured)throw Error(
     config?.error==="elevenlabs_voice_unavailable"?"ElevenLabs no reconoce la voz configurada. Establece una voz disponible en ELEVENLABS_VOICE_ID; tus 12 clips siguen guardados.":
     config?.error==="elevenlabs_key_rejected"?"ElevenLabs rechazó la API key de Preview. Comprueba ELEVENLABS_API_KEY; tus 12 clips siguen guardados.":
     config?.error==="elevenlabs_access_denied"?"La API key no tiene permisos suficientes para acceder a ElevenLabs; los clips siguen guardados.":
     config?.error==="elevenlabs_credits_required"?"El plan de ElevenLabs o los créditos disponibles no permiten utilizar esta voz por API. Tus clips de Seedance siguen guardados.":
     "No se pudo verificar ElevenLabs (HTTP "+String(config?.upstreamStatus||check.status)+
      (config?.providerCode&&config.providerCode!=="unknown"?", "+config.providerCode:"")+
      "). Tus 12 clips siguen guardados."
    );
   }
   const job=readSeedance(customPrompt);setSeedUrls(job.urls.filter(Boolean));setSavedClipCount(job.urls.filter(Boolean).length);
   for(let beat=0;beat<MOTION_SCENES;beat++){
    if(job.urls[beat])continue;
    let token=job.tokens[beat];
    if(!token){
     setDirectorStatus("Animando escena "+(beat+1)+"/"+MOTION_SCENES+" · Seedance 720p");
     const started=await seedanceRequest(accessToken,{
      action:"start",prompt:customPrompt,beat,confirmCost:true,
      imagePath:plan.frames[beat].referencePath,
      motionPrompt:plan.scenes[beat].motionPrompt,storyBible:plan.storyBible
     });
     if(typeof started?.token!=="string")throw Error("Seedance no inició la escena "+(beat+1)+".");
     token=started.token;job.tokens[beat]=token;saveSeedance(job);
    }
    setDirectorStatus("Esperando animación "+(beat+1)+"/"+MOTION_SCENES);
    let completed=false;
    for(let n=0;n<120;n++){
     const response=await seedanceRequest(accessToken,{action:"status",token});
     if(response?.status==="completed"&&typeof response.url==="string"){
      job.urls[beat]=response.url;saveSeedance(job);setSeedUrls(job.urls.filter(Boolean));setSavedClipCount(job.urls.filter(Boolean).length);
      completed=true;break;
     }
     if(response?.status==="failed")throw Error("Seedance no completó la escena "+(beat+1)+". Las anteriores siguen guardadas.");
     await new Promise<void>(resolve=>setTimeout(resolve,5000));
    }
    if(!completed)throw Error("La escena "+(beat+1)+" continúa procesándose. Pulsa Dar movimiento para recuperar su estado.");
   }
   setDirectorStatus("Preparando narración, subtítulos y montaje");
   const speech=withVoice?await loadContinuousVoice(plan.scenes.map(scene=>scene.speech)):null;
   const localUrls:string[]=[];
   let video:Blob,extension:"mp4"|"webm";
   try{
    for(let i=0;i<MOTION_SCENES;i++)localUrls.push(await loadSeedanceForStitching(accessToken,job.tokens[i]));
    ({blob:video,extension}=await stitchSeedanceClips(localUrls,speech,subtitles));
   }finally{localUrls.forEach(url=>URL.revokeObjectURL(url));}
   const finalUrl=URL.createObjectURL(video);
   if(seedJoinedRef.current)URL.revokeObjectURL(seedJoinedRef.current);
   seedJoinedRef.current=finalUrl;setSeedJoined(finalUrl);setExtension(extension);
   setDirectorStatus("Video terminado · 60 segundos"+(withVoice?" con voz":""));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo terminar el video.");setDirectorStatus("");}
  finally{directorBusyRef.current=false;seedBusyRef.current=false;setDirectorBusy(false);setSeedBusy(false);}
 },[customPrompt,withVoice,voice,subtitles]);
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
   <div className={css.intro}><h1>VMV Motion</h1><span>IA directora · Seedance · Historia continua</span></div>
   <div className={css.modeRow}>
    <button type="button" className={customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>{setCustomMode(true);setWithVoice(true);}}>Tu historia</button>
    <button type="button" className={!customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(false)}>Ejemplos</button>
   </div>
   {customMode?<label className={css.promptField}>
    <span>¿Qué quieres contar?</span>
    <textarea disabled={rendering||directorBusy} value={customPrompt} maxLength={2000} rows={4}
     placeholder="Ejemplo: Un pequeño elefante busca agua en la selva. Encuentra un río y ayuda a sus amigos a beber."
     onChange={e=>{setCustomPrompt(e.target.value);setTerraStory(null);setDirectorPlan(null);setSeedUrls([]);setPreviousScene(null);pendingStoryboard.current={prompt:"",images:[]};}}/>
    <small>{customPrompt.length}/2000 · Video de 60 segundos con IA</small>
   </label>:<div className={css.topics}>
    <button type="button" className={topic==="space"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("space");}} disabled={rendering}>
     <Globe2 size={21}/>{language==="es"?"Planetas":"Planets"}</button>
    <button type="button" className={topic==="race"?css.active:""}
     onClick={()=>{if(!rendering)setTopic("race");}} disabled={rendering}>
     <CarFront size={21}/>{language==="es"?"Fórmula 1":"Formula 1"}</button>
   </div>}
   <section className={css.stage}>
    {!customMode?<div className={css.canvasWrap}>
     <canvas ref={canvas} width={STICKMAN_WIDTH} height={STICKMAN_HEIGHT}
      aria-label="Vista previa de animación Stickman" role="img"/>
     {!rendering?<button className={css.play} type="button"
       onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pausar":"Reproducir"}>
       {playing?<Pause size={18}/>:<Play size={18}/>}
      </button>:null}
     <span className={css.duration}>{customMode?"60s":"30s"} · 9:16</span>
    </div>:null}
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
    {withVoice&&customMode?<div className={css.voiceOptions}><strong>ElevenLabs · Narración continua</strong><small>Audio y subtítulos sincronizados</small></div>:null}
    {withVoice&&!customMode?<div className={css.voiceOptions}>
     {(["alloy","nova"] as const).map(v=><button key={v} type="button"
      disabled={rendering} className={voice===v?css.selected:""} onClick={()=>setVoice(v)}>
      {v==="alloy"?"Alloy":"Nova"}</button>)}
     <small>{language==="es"?"Usa créditos de voz":"Uses voice credits"}</small>
    </div>:null}
    {!customMode?<button className={css.generate} type="button"
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
    {customMode&&!directorPlan?.frames.length?<button className={css.generate} type="button"
     disabled={directorBusy||seedBusy||rendering||customPrompt.trim().length<8}
     onClick={()=>void prepareStoryboard()}>
     {directorBusy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {directorBusy?directorStatus:"Generar video"}
    </button>:null}
    {customMode&&directorPlan?.frames.length?<section className={css.storyReview} aria-label="Revisión de escenas">
     <div className={css.storyHeading}>
      <h2>Revisa antes de animar</h2>
      <p>{directorPlan.title} · {directorPlan.frames.length}/{MOTION_SCENES} imágenes ·
       {(directorPlan.approved||[]).filter(Boolean).length}/{MOTION_SCENES} aprobadas</p>
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
         <p>{scene.speech}</p>
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
     {directorPlan.frames.length<MOTION_SCENES?<button type="button" className={css.generate}
      disabled={directorBusy} onClick={()=>void prepareStoryboard()}>
      {directorBusy?directorStatus:"Continuar generando las imágenes pendientes"}</button>:null}
     {directorPlan.frames.length===MOTION_SCENES?<button type="button" className={css.generate}
      disabled={directorBusy||seedBusy||regeneratingScene!==null||
       !directorPlan.scenes.every((scene,i)=>directorPlan.approved?.[i]===true&&
        (directorPlan.draftPrompts?.[i]??scene.imagePrompt)===scene.imagePrompt)}
      onClick={()=>void animateApproved()}>
      {directorBusy?directorStatus:savedClipCount===MOTION_SCENES?"Reintentar voz y montaje · conservar 12 clips":"Dar movimiento · Seedance 720p"}
     </button>:null}
     <small>Seedance se inicia solo tras aprobar todas las escenas. Regenerar imágenes consume créditos de OpenAI.
      Animar 12 clips cuesta aproximadamente US$1.24 de Seedance, más imágenes y voz opcional.
      Si se interrumpe, se conservan los clips completados.</small>
    </section>:null}
    {customMode&&seedJoined?<div className={css.result}>
     <div className={css.resultTitle}><Check size={18}/><strong>Video terminado · 60 segundos</strong></div>
     <video src={seedJoined} controls playsInline/>
     <a href={seedJoined} download={"vmv-motion-60s."+extension}><Download size={16}/>Descargar video</a>
    </div>:null}
    {error?<p role="alert" className={css.error}>{error}</p>:null}
    {videoUrl?<div className={css.result}>
     <div className={css.resultTitle}><Check size={18}/><strong>{language==="es"?"Video terminado":"Finished video"}</strong></div>
     <video src={videoUrl} controls playsInline preload="metadata"/>
     <a href={videoUrl} download={"vmv-stickman-"+(customMode?"historia":topic)+"."+extension}>
      <Download size={16}/>{language==="es"?"Descargar":"Download"}</a>
    </div>:null}
   </section>
   <p className={css.note}>{language==="es"
    ?(customMode?"Primero revisa y aprueba las 12 imágenes. Después Seedance les da movimiento a 720p y el sistema une los clips, agrega voz y subtítulos si están activados.":"Los ejemplos usan animación Stickman local. Activa Tu historia para crear video con Seedance.")
    :"AI-generated images, cinematic camera and subtitles. OpenAI image generation has a cost."}</p>
  </div>
 </main>;
}
