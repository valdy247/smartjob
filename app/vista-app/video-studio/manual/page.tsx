"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,Check,ChevronDown,ChevronUp,Clapperboard,Download,Film,ImagePlus,LoaderCircle,Play,RefreshCw,ShieldCheck,Sparkles,Trash2,Upload,Video} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import VideoShareControls from "../VideoShareControls";
import {manualPrice,type ManualMotion,type ManualQuality,MAX_MANUAL_SCENES} from "@/lib/vmv-studio-manual";
import styles from "./page.module.css";

type Shot={id:string;file:File;url:string;prompt:string;motion:ManualMotion};
type Step="upload"|"direct"|"review"|"running"|"done";
type CloudJob={id:string;title:string;status:string;phase:string;progress:number;videoUrl?:string|null;failure_code?:string|null;seconds:number};
const defaultPrompt="Conserva exactamente los personajes, objetos y colores de esta fotografía. Muestra una acción clara y natural, sin introducir elementos nuevos ni cambiar la identidad de nadie.";
const failureMessages:Record<string,string>={
 manual_invalid_image:"No pudimos preparar una fotografía. Prueba con JPEG o PNG.",
 manual_image_too_large:"La fotografía es demasiado grande. Prueba con otra.",
 manual_upload_unavailable:"No se pudo subir una imagen. Puedes volver a intentarlo.",
 manual_images_missing:"No se recibieron todas las fotografías. Reintenta el montaje.",
 manual_invalid_request:"Revisa las fotos y las instrucciones de cada escena.",
 manual_price_changed:"El costo ha cambiado. Actualiza y confirma el nuevo precio.",
 video_studio_insufficient_credits:"No tienes créditos disponibles suficientes para este montaje.",
 manual_create_unavailable:"No pudimos crear el proyecto. No hemos iniciado el montaje.",
 manual_project_already_started:"Este montaje ya está en producción. Abre su progreso.",
 video_studio_worker_not_ready:"El procesador de videos no está disponible ahora. No se han reservado créditos.",
 authentication_required:"Inicia sesión para usar el Editor manual."
};
const readable=(seconds:number)=>seconds>=60?Math.floor(seconds/60)+" min "+seconds%60+" s":seconds+" s";

async function normalisePhoto(file:File){
 // Resize locally so the upload is small enough for iPhone Safari. Letterboxing
 // preserves the full photograph, unlike an automatic center crop.
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(new Error("manual_invalid_image"));
   image.src=url;
  });
  const canvas=document.createElement("canvas");
  canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("manual_invalid_image");
  ctx.fillStyle="#17131f";ctx.fillRect(0,0,720,1280);
  const scale=Math.min(720/image.naturalWidth,1280/image.naturalHeight);
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(720-w)/2,(1280-h)/2,w,h);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.82));
  if(!blob||blob.size<1024||blob.size>2500000)throw Error("manual_invalid_image");
  return new File([blob],"scene.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(url);}
}
export default function ManualVideoStudio(){
 const [signedIn,setSignedIn]=useState<boolean|null>(null);
 const [owner,setOwner]=useState("");
 const [shots,setShots]=useState<Shot[]>([]);
 const shotsRef=useRef<Shot[]>([]);
 const [step,setStep]=useState<Step>("upload");
 const [selected,setSelected]=useState(0);
 const [title,setTitle]=useState("Mi video personalizado");
 const [quality,setQuality]=useState<ManualQuality>("turbo");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [job,setJob]=useState<CloudJob|null>(null);
 const projectRef=useRef<string>("");
 const keyRef=useRef<string>("");
 useEffect(()=>{shotsRef.current=shots;},[shots]);
 useEffect(()=>()=>{shotsRef.current.forEach(s=>URL.revokeObjectURL(s.url));},[]);
 const getToken=useCallback(async()=>{
  const sb=getSupabase();
  if(!sb)throw Error("authentication_required");
  const {data}=await sb.auth.getSession();
  if(!data.session?.access_token)throw Error("authentication_required");
  return data.session.access_token;
 },[]);
 const api=useCallback(async(path:string,method="GET",data?:unknown)=>{
  const token=await getToken();
  const response=await fetch("/api/video-studio/"+path,{
   method,cache:"no-store",headers:{Authorization:"Bearer "+token,
    ...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"manual_create_unavailable");
  return result;
 },[getToken]);
 const openJob=useCallback(async(id:string)=>{
  const result=await api("jobs?id="+encodeURIComponent(id));
  if(!result.job)throw Error("manual_create_unavailable");
  const next=result.job as CloudJob;
  setJob(next);
  setStep(next.status==="completed"?"done":"running");
 },[api]);
 useEffect(()=>{
  const sb=getSupabase();
  if(!sb){setSignedIn(false);return;}
  let active=true;
  void sb.auth.getUser().then(({data})=>{
   if(!active)return;
   const user=data.user;
   setOwner(user?.id||"");
   setSignedIn(Boolean(user));
   if(user){
    const id=window.localStorage.getItem("vmv-manual-job:"+user.id);
    if(id&&/^[a-f0-9-]{36}$/i.test(id))
     void openJob(id).catch(()=>{window.localStorage.removeItem("vmv-manual-job:"+user.id);});
   }
  }).catch(()=>{if(active)setSignedIn(false);});
  const {data:subscription}=sb.auth.onAuthStateChange((_event,session)=>{
   if(!active)return;
   setOwner(session?.user?.id||"");
   setSignedIn(Boolean(session?.user));
  });
  return()=>{active=false;subscription.subscription.unsubscribe();};
 },[openJob]);
 useEffect(()=>{
  if(step!=="running"||!job?.id)return;
  let active=true,checking=false;
  const check=async()=>{
   if(!active||checking)return;
   checking=true;
   try{
    const result=await api("jobs?id="+encodeURIComponent(job.id));
    if(!active||!result.job)return;
    setJob(result.job);
    if(result.job.status==="completed")setStep("done");
   }catch{/* Keep the last confirmed server status; retry when online. */}
   finally{checking=false;}
  };
  const onWake=()=>{if(document.visibilityState==="visible")void check();};
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void check();},6000);
  document.addEventListener("visibilitychange",onWake);
  window.addEventListener("pageshow",onWake);
  return()=>{active=false;clearInterval(interval);
   document.removeEventListener("visibilitychange",onWake);
   window.removeEventListener("pageshow",onWake);
  };
 },[step,job?.id,api]);
 const addPhotos=(files:FileList|null)=>{
  if(!files)return;
  setError("");
  const available=MAX_MANUAL_SCENES-shots.length;
  const incoming=Array.from(files).slice(0,available).filter(file=>file.type.startsWith("image/"));
  if(incoming.length===0){setError("Elige fotografías válidas. Puedes usar hasta 12.");return;}
  setShots(current=>[...current,...incoming.map(file=>({
   id:crypto.randomUUID(),file,url:URL.createObjectURL(file),
   prompt:defaultPrompt,motion:"zoom" as ManualMotion
  }))]);
 };
 const swap=(index:number,direction:number)=>{
  const next=index+direction;
  if(next<0||next>=shots.length)return;
  setShots(current=>{
   const result=[...current];[result[index],result[next]]=[result[next],result[index]];
   return result;
  });
  setSelected(next);
  setConsent(false);
 };
 const remove=(index:number)=>{
  URL.revokeObjectURL(shots[index].url);
  setShots(current=>current.filter((_,i)=>i!==index));
  setSelected(i=>Math.min(i,Math.max(0,shots.length-2)));
  setConsent(false);
 };
 const update=(index:number,changes:Partial<Shot>)=>{
  setShots(current=>current.map((s,i)=>i===index?{...s,...changes}:s));
  setConsent(false);
 };
 const quote=manualPrice(shots.map(x=>x.motion),quality);
 const ready=shots.length>=3&&shots.length<=MAX_MANUAL_SCENES&&
  shots.every(s=>s.prompt.trim().length>=20&&s.prompt.length<=950);
 const restart=()=>{
  if(busy)return;
  setStep("upload");setJob(null);setConsent(false);setError("");
  projectRef.current="";keyRef.current="";
  if(owner)window.localStorage.removeItem("vmv-manual-job:"+owner);
 };
 const generate=async()=>{
  if(!consent||!ready||busy||title.trim().length<3)return;
  setBusy(true);setError("");
  const projectId=projectRef.current||(projectRef.current=crypto.randomUUID());
  const clientKey=keyRef.current||(keyRef.current=crypto.randomUUID());
  try{
   const token=await getToken();
   for(let i=0;i<shots.length;i++){
    setProgress("Preparando y subiendo foto "+(i+1)+" de "+shots.length);
    const jpeg=await normalisePhoto(shots[i].file);
    const form=new FormData();
    form.set("projectId",projectId);form.set("index",String(i));form.set("image",jpeg);
    const response=await fetch("/api/video-studio/manual/upload",{
     method:"POST",headers:{Authorization:"Bearer "+token},body:form
    });
    if(!response.ok){
     const body=await response.json().catch(()=>({}));
     throw Error(body.error||"manual_upload_unavailable");
    }
   }
   setProgress("Guardando orden y creando tu montaje");
   const result=await api("manual/jobs","POST",{
    projectId,clientKey,title:title.trim(),quality,
    scenes:shots.map(s=>({prompt:s.prompt.trim(),motion:s.motion})),
    expectedCredits:quote,confirmCost:true
   });
   if(typeof result.id!=="string")throw Error("manual_create_unavailable");
   if(owner)window.localStorage.setItem("vmv-manual-job:"+owner,result.id);
   await openJob(result.id);
  }catch(e){
   const message=e instanceof Error?e.message:"manual_create_unavailable";
   if(message==="manual_project_already_started"){
    try{await openJob(projectId);return;}catch{/* Show original error. */}
   }
   setError(failureMessages[message]||"No pudimos completar la subida. Tu proyecto no se ha enviado a producción.");
  }finally{setBusy(false);setProgress("");}
 };
 const frame=shots[selected];
 if(signedIn===false){const sb=getSupabase();return sb?
  <VMVAuthGateway supabase={sb}/>:<main className={styles.page}>Inicia sesión en VMV Business.</main>;}
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.top}>
   <Link href="/vista-app/video-studio" className={styles.back} aria-label="Volver a Video Studio"><ArrowLeft size={19}/></Link>
   <div><strong>Editor de videos</strong><small>VMV Business · Creación manual</small></div>
   <span className={styles.mark}>VMV</span>
  </header>
  {signedIn===null?<p className={styles.help}>Comprobando tu sesión…</p>:<>
   {step==="upload"?<>
    <div className={styles.heading}><span>01 / 03 · TUS IMÁGENES</span>
     <h1>Crea con tus propias fotos</h1>
     <p>Elige entre 3 y 12 imágenes. Tú decides el orden; VMV no inventará escenas.</p>
    </div>
    <label className={styles.upload}>
     <ImagePlus size={31}/><strong>Añadir fotografías</strong>
     <small>JPEG, PNG o imágenes compatibles con tu móvil · máximo 12</small>
     <input type="file" accept="image/*" multiple onChange={e=>{addPhotos(e.target.files);e.target.value="";}}/>
    </label>
    {shots.length>0?<><div className={styles.rowBetween}><strong>{shots.length} escenas</strong><span>Mueve con las flechas</span></div>
    <div className={styles.photoGrid}>{shots.map((scene,i)=><div className={styles.photoCard} key={scene.id}>
     <img src={scene.url} alt={"Foto "+(i+1)}/>
     <span className={styles.number}>{i+1}</span>
     <div className={styles.photoActions}>
      <button type="button" aria-label={"Mover escena "+(i+1)+" antes"} disabled={i===0} onClick={()=>swap(i,-1)}><ChevronUp size={18}/></button>
      <button type="button" aria-label={"Mover escena "+(i+1)+" después"} disabled={i===shots.length-1} onClick={()=>swap(i,1)}><ChevronDown size={18}/></button>
      <button type="button" aria-label={"Quitar escena "+(i+1)} onClick={()=>remove(i)}><Trash2 size={16}/></button>
     </div>
    </div>)}</div></>:null}
    <button className={styles.mainButton} disabled={shots.length<3} onClick={()=>{setSelected(0);setStep("direct");}}>
     Dirigir escenas <ArrowRight size={18}/>
    </button>
    {shots.length<3?<p className={styles.hint}>Añade al menos 3 imágenes para continuar.</p>:null}
   </>:null}
   {step==="direct"?<>
    <div className={styles.heading}><span>02 / 03 · DIRECCIÓN CREATIVA</span>
     <h1>Dirige cada escena</h1>
     <p>Selecciona una foto y elige cómo se moverá. Puedes combinar fotos fijas, zoom y animación real.</p>
    </div>
    <div className={styles.thumbs}>{shots.map((s,i)=><button key={s.id} className={i===selected?styles.thumbSelected:styles.thumb}
     onClick={()=>setSelected(i)} aria-pressed={i===selected}>
     <img src={s.url} alt={"Escena "+(i+1)}/><small>{i+1}</small>
    </button>)}</div>
    {frame?<section className={styles.director}>
     <div className={styles.sceneHeading}><strong>Escena {selected+1}</strong><small>5 segundos</small></div>
     <img className={styles.sceneImage} src={frame.url} alt={"Vista previa de escena "+(selected+1)}/>
     <label>Movimiento visual</label>
     <div className={styles.motionModes}>
      {([{id:"still",label:"Fija",note:"Sin movimiento"},{id:"zoom",label:"Zoom",note:"Movimiento de cámara"},
       {id:"animate",label:"Animación IA",note:"Personajes y objetos"}] as const).map(m=>
       <button key={m.id} className={frame.motion===m.id?styles.modeActive:styles.mode}
        onClick={()=>update(selected,{motion:m.id})} aria-pressed={frame.motion===m.id}>
        <strong>{m.label}</strong><small>{m.note}</small>
       </button>)}
     </div>
     <label htmlFor="manual-prompt">¿Qué debe ocurrir en esta escena?</label>
     <textarea id="manual-prompt" value={frame.prompt} maxLength={950} rows={5}
      onChange={e=>update(selected,{prompt:e.target.value})}/>
     <p className={styles.hint}>{frame.motion==="animate"?
      "La IA seguirá esta instrucción al animar tu foto y procurará conservar su aspecto original.":
      frame.motion==="zoom"?"VMV aplicará un movimiento de cámara. La foto no se regenerará.":
      "La imagen se conservará sin movimiento. Tu instrucción queda guardada en el proyecto."}</p>
     <div className={styles.rowBetween}>
      <button className={styles.softButton} disabled={selected===0} onClick={()=>setSelected(i=>i-1)}><ArrowLeft size={15}/> Anterior</button>
      <button className={styles.softButton} onClick={()=>selected<shots.length-1?setSelected(i=>i+1):setStep("review")}>
       {selected<shots.length-1?"Siguiente escena":"Revisar video"} <ArrowRight size={15}/>
      </button>
     </div>
    </section>:null}
    <button className={styles.secondaryButton} onClick={()=>setStep("upload")}>Volver a ordenar fotos</button>
   </>:null}
   {step==="review"?<>
    <div className={styles.heading}><span>03 / 03 · REVISAR Y CREAR</span>
     <h1>Tu video, a tu manera</h1><p>Revisa el orden, el movimiento y el costo antes de iniciar la producción.</p>
    </div>
    <label className={styles.label}>Título del video</label>
    <input className={styles.textInput} value={title} maxLength={140}
     onChange={e=>setTitle(e.target.value)}/>
    <div className={styles.summary}>{shots.map((s,i)=><div className={styles.summaryRow} key={s.id}>
     <img src={s.url} alt=""/><span><strong>Escena {i+1}</strong>
      <small>{s.motion==="animate"?"Animación IA":s.motion==="zoom"?"Zoom de cámara":"Imagen fija"} · 5 s</small></span>
      <button type="button" aria-label={"Editar escena "+(i+1)} onClick={()=>{setSelected(i);setStep("direct");}}>Editar</button>
    </div>)}</div>
    <div className={styles.choiceRow}>
     <span>Calidad</span>
     <div><button className={quality==="turbo"?styles.qualityActive:styles.quality}
      onClick={()=>{setQuality("turbo");setConsent(false);}}>Turbo</button>
      <button className={quality==="high"?styles.qualityActive:styles.quality}
      onClick={()=>{setQuality("high");setConsent(false);}}>Alta</button></div>
    </div>
    <div className={styles.price}><span>{readable(shots.length*5)} · Sin narración ni subtítulos</span>
     <strong>{quote} créditos</strong></div>
    <label className={styles.consent}><input type="checkbox" checked={consent}
     onChange={e=>setConsent(e.target.checked)}/>
     Apruebo este orden y autorizo reservar {quote} créditos para producir el video. Las imágenes siguen siendo mías.
    </label>
    <button className={styles.mainButton} disabled={!consent||!ready||title.trim().length<3||busy}
     onClick={()=>void generate()}>
     {busy?<LoaderCircle size={18} className={styles.spin}/>:<Clapperboard size={18}/>}
     {busy?"Preparando montaje…":"Crear video por "+quote+" créditos"}
    </button>
    {progress?<p role="status" className={styles.hint}>{progress}</p>:null}
    <button className={styles.secondaryButton} disabled={busy} onClick={()=>setStep("direct")}>Seguir editando escenas</button>
   </>:null}
   {step==="running"&&job?<section className={styles.production}>
    <Film size={30}/><h1>{job.status==="failed"?"No pudimos finalizar el montaje":"Montando tu video"}</h1>
    <div className={styles.circle}>{job.progress??0}%</div>
    <p>{job.phase||job.status}</p>
    <p className={styles.hint}>Puedes cerrar o minimizar el móvil. El proceso sigue en la nube y consultarás su estado cuando regreses.</p>
    {job.status==="failed"?<><p className={styles.warning}>No se completó el proyecto. Las reservas se liberan cuando el servidor registra el fallo.</p>
     <button className={styles.secondaryButton} onClick={restart}>Empezar otro proyecto</button></>:null}
    <Link className={styles.softButton} href="/vista-app/video-studio">Ver biblioteca y proyectos</Link>
   </section>:null}
   {step==="done"&&job?<section className={styles.production}>
    <Check size={35}/><h1>¡Tu video está listo!</h1>
    <p>{job.title}</p>
    {job.videoUrl?<><video className={styles.finalVideo} src={job.videoUrl} controls playsInline/>
     <a className={styles.mainButton} href={job.videoUrl} download={"vmv-manual-"+job.id+".mp4"}>
      <Download size={18}/> Descargar MP4
     </a></>:<p>Tu video está guardado. Abre la biblioteca para obtener su enlace actualizado.</p>}
    <VideoShareControls jobId={job.id} request={api}/>
    <button className={styles.secondaryButton} onClick={restart}>Crear otro video con mis fotos</button>
   </section>:null}
   {error?<div role="alert" className={styles.error}><ShieldCheck size={17}/><span>{error}</span></div>:null}
  </>}
  <footer className={styles.footer}><span>Editor manual · Independiente del generador automático</span>
   <Link href="/vista-app/video-studio">Video Studio</Link></footer>
 </div></main>;
}
