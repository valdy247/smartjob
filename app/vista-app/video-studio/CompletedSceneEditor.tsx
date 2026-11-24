"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Clapperboard,LoaderCircle,Pencil,RefreshCw,Check} from "lucide-react";
import styles from "./CompletedSceneEditor.module.css";

type Scene={speech:string;imagePrompt:string;imageUrl?:string|null;motion?:"zoom"|"animate"};
type Job={id:string;title:string;scenes:Scene[];quality_mode:string};
type Api=(path:string,method?:string,data?:unknown)=>Promise<any>;
type Props={job:Job;request:Api;onBack:()=>void;onCreated:(id:string)=>Promise<void>};
export default function CompletedSceneEditor({job,request,onBack,onCreated}:Props){
 const [index,setIndex]=useState(0);
 const [prompt,setPrompt]=useState(job.scenes[0]?.imagePrompt||"");
 const [motion,setMotion]=useState<"zoom"|"animate">(job.scenes[0]?.motion==="zoom"?"zoom":"animate");
 const [credits,setCredits]=useState<number|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const keyRef=useRef("");
 useEffect(()=>{
  let active=true;
  setCredits(null);
  void request("revisions?id="+encodeURIComponent(job.id))
   .then(result=>{if(active&&Number.isInteger(result?.credits))setCredits(result.credits);})
   .catch(()=>{if(active)setError("No podemos preparar la edición de este video todavía.");});
  return()=>{active=false;};
 },[job.id,request]);
 const choose=(i:number)=>{
  const scene=job.scenes[i];if(!scene||loading)return;
  setIndex(i);setPrompt(scene.imagePrompt);
  setMotion(scene.motion==="zoom"?"zoom":"animate");
  setConfirmed(false);setError("");keyRef.current="";
 };
 const submit=async()=>{
  if(loading||!confirmed||credits===null||prompt.trim().length<20||prompt.trim().length>950)return;
  setLoading(true);setError("");
  try{
   const key=keyRef.current||(keyRef.current=crypto.randomUUID());
   const result=await request("revisions","POST",{
    sourceId:job.id,clientKey:key,index,prompt:prompt.trim(),motion,
    expectedCredits:credits,confirmCost:true
   });
   if(typeof result?.id!=="string")throw Error("studio_revision_unavailable");
   await onCreated(result.id);
  }catch(err){
   const code=err instanceof Error?err.message:"studio_revision_unavailable";
   setError(code==="video_studio_insufficient_credits"?"No tienes créditos disponibles suficientes para esta edición.":
    code==="studio_revision_price_changed"?"El costo cambió. Vuelve a abrir la edición para confirmar el precio.":
    code==="video_studio_worker_not_ready"?"El procesador de video no está disponible actualmente.":
    code==="studio_revision_not_available"?"Faltan algunos archivos de este video para editar solo una escena.":
    "No pudimos iniciar la edición. El video original no se ha modificado.");
  }finally{setLoading(false);}
 };
 const selected=job.scenes[index];
 return <section className={styles.editor}>
  <button type="button" className={styles.back} onClick={onBack}>
   <ArrowLeft size={17}/> Volver al video
  </button>
  <h1>Editar escenas</h1>
  <p className={styles.intro}>Cambia solo la imagen de una escena y su movimiento. Mantendremos la narración, los otros fotogramas y el video original.</p>
  <div className={styles.strip} role="group" aria-label="Escenas del video">
   {job.scenes.map((scene,i)=><button type="button" key={i}
    aria-pressed={index===i} className={index===i?styles.activeFrame:styles.frame}
    disabled={loading} onClick={()=>choose(i)}>
    {scene.imageUrl?<img src={scene.imageUrl} alt={"Escena "+(i+1)}/>:<Clapperboard size={24}/>}
    <span>Escena {i+1}</span>
   </button>)}
  </div>
  {selected?<div className={styles.form}>
   <h2>Escena {index+1}</h2>
   <p className={styles.speech}>{selected.speech}</p>
   <label htmlFor="vmv-completed-scene-prompt">¿Qué quieres cambiar de esta escena?</label>
   <textarea id="vmv-completed-scene-prompt" value={prompt} maxLength={950}
    rows={5} onChange={e=>{setPrompt(e.target.value);setConfirmed(false);keyRef.current="";}}/>
   <span className={styles.hint}>Describe la nueva imagen, personajes, acciones y encuadre. La narración se conservará exactamente.</span>
   <label htmlFor="vmv-completed-scene-motion">Movimiento visual</label>
   <select id="vmv-completed-scene-motion" value={motion}
    onChange={e=>{setMotion(e.target.value==="zoom"?"zoom":"animate");setConfirmed(false);keyRef.current="";}}>
    <option value="animate">Animación</option>
    <option value="zoom">Movimiento de cámara en imagen</option>
   </select>
   <div className={styles.price}>
    <span>Edición de 1 escena y montaje nuevo</span>
    <strong>{credits===null?"Calculando…":credits+" créditos"}</strong>
   </div>
   <label className={styles.confirm}>
    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    Autorizo reservar {credits??"los"} créditos para crear una nueva versión. El video original se conserva.
   </label>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
   <button type="button" className={styles.submit} onClick={()=>void submit()}
    disabled={loading||!confirmed||credits===null||prompt.trim().length<20||prompt.trim().length>950}>
    {loading?<LoaderCircle size={17} className={styles.spin}/>:<RefreshCw size={17}/>}
    {loading?"Preparando nueva versión…":"Regenerar solo escena "+(index+1)}
   </button>
  </div>:null}
  <p className={styles.footer}><Check size={15}/> Las otras {job.scenes.length-1} escenas y la voz original se reutilizarán.</p>
 </section>;
}
