"use client";
import {useEffect,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import base from "./AutomaticWebWizard.module.css";

export async function mediaHeaders(owner:string){
 const db=getSupabase();
 const session=(await db?.auth.getSession())?.data.session;
 if(!session||session.user.id!==owner)throw Error("Inicia sesión nuevamente.");
 return {Authorization:"Bearer "+session.access_token};
}

export default function VideoCreationResult({owner,jobId,image}:{owner:string;jobId:string;image:Blob|null}){
 const [url,setUrl]=useState("");
 const [status,setStatus]=useState("PENDING");
 const [error,setError]=useState("");
 const [attempt,setAttempt]=useState(0);
 const [downloading,setDownloading]=useState(false);
 useEffect(()=>{
  if(image){
   const local=URL.createObjectURL(image);
   setUrl(local);setStatus("SUCCEEDED");
   return ()=>URL.revokeObjectURL(local);
  }
  if(!jobId)return;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{
    const response=await fetch("/api/video-generator?id="+encodeURIComponent(jobId),{
     headers:await mediaHeaders(owner),cache:"no-store",signal:controller.signal});
    if(!response.ok)throw Error("No se pudo consultar el progreso.");
    const {job}=await response.json();
    if(controller.signal.aborted)return;
    setStatus(job.status);
    if(job.status==="SUCCEEDED"&&job.output_url){setUrl(job.output_url);return;}
    if(["FAILED","CANCELLED","CANCELED","SUCCEEDED"].includes(job.status))
     throw Error("La generación terminó sin un video disponible.");
    timer=setTimeout(poll,4500);
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudo consultar el progreso.");}
  };
  void poll();
  return ()=>{controller.abort();clearTimeout(timer);};
 },[image,jobId,owner,attempt]);
 const download=async()=>{
  setDownloading(true);setError("");
  try{
   let blob=image;
   if(!blob){
    const r=await fetch("/api/video-generator/download?id="+encodeURIComponent(jobId),{headers:await mediaHeaders(owner)});
    if(!r.ok)throw Error("No se pudo descargar el video.");
    blob=await r.blob();
   }
   const link=document.createElement("a");
   const objectUrl=URL.createObjectURL(blob);
   link.href=objectUrl;link.download=image?"vmv-imagen."+(image.type.split("/")[1]||"jpg"):"vmv-video-"+jobId.slice(0,8)+".mp4";
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo descargar.");}
  finally{setDownloading(false);}
 };
 return <div className={base.panel}>
  {url?<>{image?<img src={url} alt="Imagen generada" style={{width:"100%",maxHeight:"58vh",objectFit:"contain"}}/>:
   <video src={url} controls playsInline style={{width:"100%",maxHeight:"58vh"}}/>}
   <button type="button" className={base.primary} disabled={downloading} onClick={()=>void download()}>
    {downloading?"Descargando…":image?"Descargar imagen":"Descargar MP4"}</button></>:
   !error&&<p role="status">{status==="RUNNING"?"Generando video…":"Preparando el resultado…"}</p>}
  {error&&<p role="alert">{error}</p>}
  {error&&!url&&!["FAILED","CANCELLED","CANCELED"].includes(status)&&<button type="button" onClick={()=>{setError("");setAttempt(v=>v+1);}}>Actualizar estado</button>}
 </div>;
}
