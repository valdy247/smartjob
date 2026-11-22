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
type DirectorFrame={imageUrl:string;referencePath:string};
type DirectorPlan={prompt:string;title:string;storyBible:string;scenes:DirectorBeat[];frames:DirectorFrame[];
 approved?:boolean[];draftPrompts?:string[];previous?:Record<string,DirectorFrame[]>};
const DIRECTOR_PLAN_KEY="vmv-motion-director-plan-v5-60s";
function readDirectorPlan(prompt:string):DirectorPlan|null{
 try{
  const d=JSON.parse(sessionStorage.getItem(DIRECTOR_PLAN_KEY)||"null");
  if(d?.prompt===prompt&&Array.isArray(d.scenes)&&d.scenes.length===MOTION_SCENES&&Array.isArray(d.frames))
   return d as DirectorPlan;
 }catch{}
 return null;
}
function saveDirectorPlan(plan:DirectorPlan){
 try{sessionStorage.setItem(DIRECTOR_PLAN_KEY,JSON.stringify(plan));}catch{}
}
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
  result?.error==="image_bad_request"?"OpenAI rechazó la imagen. No se realizarán más intentos automáticos.":
  "La IA no pudo preparar la historia o imagen. Puedes reanudar sin recrear las escenas ya terminadas."
 );
 return result;
}
type SeedanceSaved={prompt:string;tokens:string[];urls:string[]};
const SEEDANCE_KEY="vmv-motion-seedance-director-v5-60s";
function readSeedance(prompt:string):SeedanceSaved{
 try{
  const state=JSON.parse(sessionStorage.getItem(SEEDANCE_KEY)||"null");
  if(state?.prompt===prompt&&Array.isArray(state.tokens)&&Array.isArray(state.urls))
   return {prompt,tokens:state.tokens,urls:state.urls};
 }catch{}
 return {prompt,tokens:[],urls:[]};
}
function saveSeedance(value:SeedanceSaved){
 try{sessionStorage.setItem(SEEDANCE_KEY,JSON.stringify(value));}catch{}
}
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
async function stitchSeedanceClips(urls:string[],voices:ArrayBuffer[]=[],captions:string[]=[],showSubtitles=false):Promise<{blob:Blob;extension:"mp4"|"webm"}>{
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
 if(voices.length){
  audioContext=new AudioContext();
  await audioContext.resume();
  const decoded=await Promise.all(voices.map(b=>audioContext!.decodeAudioData(b.slice(0))));
  const mix=audioContext.createMediaStreamDestination();
  const begin=audioContext.currentTime+.12;
  decoded.forEach((buffer,i)=>{
   // Do not speed up PCM playback: playbackRate changes pitch and creates a chipmunk voice.
   // Keep the natural voice and bound each segment to its five-second scene.
   const source=audioContext!.createBufferSource();
   source.buffer=buffer;source.playbackRate.value=1;source.connect(mix);
   const start=begin+i*5;
   source.start(start);
   source.stop(start+Math.min(buffer.duration,4.98));
  });
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
  for(const [index,video] of videos.entries()){
   video.currentTime=0;
   await video.play();
   const duration=Number.isFinite(video.duration)?Math.min(5,video.duration):5;
   await new Promise<void>((resolve,reject)=>{
    const frame=()=>{
     try{
      const ratio=Math.max(canvas.width/video.videoWidth,canvas.height/video.videoHeight);
      const width=video.videoWidth*ratio,height=video.videoHeight*ratio;
      ctx.drawImage(video,(720-width)/2,(1280-height)/2,width,height);
      if(showSubtitles&&captions[index]){
       const text=captions[index].trim();
       ctx.font="bold 36px system-ui, sans-serif";ctx.textAlign="center";
       ctx.lineWidth=7;ctx.strokeStyle="#080808";ctx.fillStyle="#ffffff";
       const words=text.split(/\\s+/),lines:string[]=[];let line="";
       for(const word of words){
        const candidate=line?line+" "+word:word;
        if(ctx.measureText(candidate).width>610&&line){lines.push(line);line=word;}else line=candidate;
       }
       if(line)lines.push(line);
       lines.slice(0,3).forEach((textLine,n)=>{
        const y=1070+(n-Math.min(lines.length-1,2))*47;
        ctx.strokeText(textLine,360,y);ctx.fillText(textLine,360,y);
       });
      }
      if(video.currentTime>=duration-.05||video.ended){resolve();return;}
      raf=requestAnimationFrame(frame);
     }catch{reject(Error("El navegador no pudo componer uno de los clips."));}
    };
    raf=requestAnimationFrame(frame);
   });
   video.pause();
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
   const saved=JSON.parse(sessionStorage.getItem(DIRECTOR_PLAN_KEY)||"null");
   if(saved?.prompt&&typeof saved.prompt==="string"&&saved.scenes?.length===MOTION_SCENES){
    setCustomPrompt(saved.prompt);
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

 const createCompleteVideo=useCallback(async()=>{
  if(directorBusyRef.current||seedBusyRef.current||renderingRef.current||customPrompt.trim().length<8)return;
  directorBusyRef.current=true;seedBusyRef.current=true;
  setDirectorBusy(true);setSeedBusy(true);setError("");setSeedJoined("");
  try{
   const client=getSupabase();if(!client)throw Error("Inicia sesión para generar el video.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión para generar el video.");
   const accessToken=session.access_token;
   let plan=readDirectorPlan(customPrompt);
   if(!plan){
    setDirectorStatus("1/4 · Escribiendo el guion y definiendo los personajes");
    const result=await directorCall(accessToken,"/api/video-generator/motion-terra",{prompt:customPrompt});
    if(!Array.isArray(result.scenes)||result.scenes.length!==MOTION_SCENES)throw Error("La IA no devolvió doce escenas.");
    plan={prompt:customPrompt,title:String(result.title||"VMV Motion"),storyBible:String(result.storyBible||""),
     scenes:result.scenes.map((row:DirectorBeat)=>({
      speech:row.speech,caption:row.caption,imagePrompt:row.imagePrompt,
      motionPrompt:row.motionPrompt||row.imagePrompt
     })),frames:[]};
    saveDirectorPlan(plan);
   }
   for(let i=plan.frames.length;i<MOTION_SCENES;i++){
    setDirectorStatus("2/4 · Diseñando plano "+(i+1)+"/"+MOTION_SCENES+" según el guion visual");
    const image=await directorCall(accessToken,"/api/video-generator/motion-image",{
     mode:"storyframe",
     prompt:["GLOBAL ART DIRECTION AND RECURRING CHARACTER TRAITS: "+plan.storyBible,
      "THIS SHOT ONLY: "+plan.scenes[i].imagePrompt,
      "Create this frame independently from text. Respect the visual story logic but DO NOT include any objects, backgrounds, or people solely because they appeared in another scene."].join(" ").slice(0,1750)
    });
    if(typeof image.imageUrl!=="string"||typeof image.referencePath!=="string")
     throw Error("No se obtuvo la imagen de la escena "+(i+1)+".");
    plan.frames.push({imageUrl:image.imageUrl,referencePath:image.referencePath});
    saveDirectorPlan(plan);
   }
   setDirectorPlan(plan);
   const job=readSeedance(customPrompt);
   setSeedUrls(job.urls.filter(Boolean));
   for(let beat=0;beat<MOTION_SCENES;beat++){
    if(job.urls[beat])continue;
    let token=job.tokens[beat];
    if(!token){
     setDirectorStatus("3/4 · Animando escena "+(beat+1)+"/"+MOTION_SCENES);
     const started=await seedanceRequest(accessToken,{
      action:"start",prompt:customPrompt,beat,confirmCost:true,
      imagePath:plan.frames[beat].referencePath,
      motionPrompt:plan.scenes[beat].motionPrompt,storyBible:plan.storyBible
     });
     if(typeof started?.token!=="string")throw Error("No se obtuvo el identificador de la escena "+(beat+1)+".");
     token=started.token;job.tokens[beat]=token;saveSeedance(job);
    }
    setDirectorStatus("3/4 · Esperando animación "+(beat+1)+"/"+MOTION_SCENES);
    let completed=false;
    for(let n=0;n<120;n++){
     const response=await seedanceRequest(accessToken,{action:"status",token});
     if(response?.status==="completed"&&typeof response.url==="string"){
      job.urls[beat]=response.url;saveSeedance(job);setSeedUrls(job.urls.filter(Boolean));
      completed=true;break;
     }
     if(response?.status==="failed")throw Error("Seedance no completó la escena "+(beat+1)+". Se conservaron las anteriores.");
     await new Promise<void>(resolve=>setTimeout(resolve,5000));
    }
    if(!completed)throw Error("La escena "+(beat+1)+" sigue procesándose. Pulsa Generar video para recuperar su estado, sin pagarla otra vez.");
   }
   setDirectorStatus("4/4 · Preparando narración y montaje");
   const speechParts=withVoice?await loadVoice(plan.scenes.map(scene=>scene.speech),voice):[];
   const localUrls:string[]=[];
   let video:Blob,extension:"mp4"|"webm";
   try{
    for(let i=0;i<MOTION_SCENES;i++)localUrls.push(await loadSeedanceForStitching(accessToken,job.tokens[i]));
    ({blob:video,extension}=await stitchSeedanceClips(localUrls,speechParts,plan.scenes.map(scene=>scene.caption),subtitles));
   }finally{localUrls.forEach(url=>URL.revokeObjectURL(url));}
   const finalUrl=URL.createObjectURL(video);
   if(seedJoinedRef.current)URL.revokeObjectURL(seedJoinedRef.current);
   seedJoinedRef.current=finalUrl;setSeedJoined(finalUrl);setExtension(extension);
   setDirectorStatus("Video terminado · 60 segundos"+(withVoice?" con voz":""));
  }catch(e){
   setError(e instanceof Error?e.message:"No se pudo terminar el video.");
   setDirectorStatus("");
  }finally{
   directorBusyRef.current=false;seedBusyRef.current=false;
   setDirectorBusy(false);setSeedBusy(false);
  }
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
     onClick={()=>setCustomMode(true)}>Tu historia</button>
    <button type="button" className={!customMode?css.modeActive:""} disabled={rendering}
     onClick={()=>setCustomMode(false)}>Ejemplos</button>
   </div>
   {customMode?<label className={css.promptField}>
    <span>¿Qué quieres contar?</span>
    <textarea disabled={rendering||directorBusy} value={customPrompt} maxLength={2000} rows={4}
     placeholder="Ejemplo: Un pequeño elefante busca agua en la selva. Encuentra un río y ayuda a sus amigos a beber."
     onChange={e=>{setCustomPrompt(e.target.value);setTerraStory(null);setDirectorPlan(null);setSeedUrls([]);pendingStoryboard.current={prompt:"",images:[]};}}/>
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
    <div className={css.canvasWrap}>
     <canvas ref={canvas} width={STICKMAN_WIDTH} height={STICKMAN_HEIGHT}
      aria-label="Vista previa de animación Stickman" role="img"/>
     {!rendering?<button className={css.play} type="button"
       onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pausar":"Reproducir"}>
       {playing?<Pause size={18}/>:<Play size={18}/>}
      </button>:null}
     <span className={css.duration}>{customMode?"60s":"30s"} · 9:16</span>
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
    {customMode?<button className={css.generate} type="button"
     disabled={directorBusy||seedBusy||rendering||customPrompt.trim().length<8}
     onClick={()=>void createCompleteVideo()}>
     {directorBusy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {directorBusy?directorStatus:"Generar video"}
    </button>:null}
    {customMode?<small>Un solo proceso: IA directora, 12 imágenes independientes, 12 animaciones Seedance y video final. El clic autoriza los costos de OpenAI y ~US$1.24 de Seedance a 720p, sin reintentos automáticos. Si falla, el mismo botón reanuda lo ya generado.</small>:null}
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
    ?"Tu historia genera tres ilustraciones con OpenAI y las anima con zoom y transiciones. Consume créditos de OpenAI. No utiliza Runway."
    :"AI-generated images, cinematic camera and subtitles. OpenAI image generation has a cost."}</p>
  </div>
 </main>;
}
