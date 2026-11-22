"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Check,Download,Film,LoaderCircle,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import css from "./VMVPilotRenderDock.module.css";

import type {PilotLanguage,PilotVoiceProvider} from "@/lib/vmv-pilot-voice-config";
type PilotStyle="stickman"|"realistic"|"cinematic"|"animated"|"product";
export type PilotRenderRequest={pilotId:string;topic:string;audience:string;goal:string;
 style:PilotStyle;seconds:15|30|60;narration:boolean;subtitles:boolean;language:PilotLanguage;
 voiceProvider:PilotVoiceProvider;voiceId:string};
type Job={
 id:string;pilot_id:string;topic:string;status:"queued"|"planning"|"working"|"assembling"|"completed"|"failed";
 phase:string;progress:number;title:string;videoUrl:string|null;failure_code:string|null;
 created_at:string;seconds:number;
};
const busyStates=new Set(["queued","planning","working","assembling"]);
const dictionary:Record<string,string>={
 pilot_worker_not_ready:"El motor de videos está pendiente de activación.",
 pilot_render_daily_limit:"Límite de una prueba cada 24 horas.",
 pilot_render_active_limit:"Ya tienes un video en proceso.",
 pilot_render_invalid_owner:"Campaña no disponible.",
 video_not_enabled_for_account:"Esta prueba no está habilitada para la cuenta.",
 pilot_render_unavailable:"No se pudo crear el trabajo.",
 invalid_render_request:"La configuración no es válida.",
 elevenlabs_voice_unavailable:"La voz de ElevenLabs no está disponible para ese idioma.",
 pilot_voice_invalid:"La voz no coincide con el idioma seleccionado."
};
async function authorized(path:string,options:RequestInit={}):Promise<unknown>{
 const supabase=getSupabase();
 if(!supabase)throw Error("Inicia sesión.");
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión.");
 const res=await fetch("/api/video-generator/pilot-render"+path,{
  cache:"no-store",...options,headers:{Authorization:"Bearer "+session.access_token,
   ...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}
 });
 const data=await res.json().catch(()=>null);
 if(!data)throw Error("Sin conexión con el servidor.");
 if(!res.ok){
  const reason=String(data.error||"pilot_render_unavailable");
  throw Error(dictionary[reason]||reason);
 }
 return data;
}
export default function VMVPilotRenderDock(){
 const [job,setJob]=useState<Job|null>(null),[visible,setVisible]=useState(true);
 const [error,setError]=useState("");
 const submitting=useRef(false),mounted=useRef(true);
 const refresh=useCallback(async()=>{
  try{
   const response=await authorized("") as {jobs?:Job[]};
   if(!mounted.current||submitting.current)return;
   setJob(current=>{
    const rows=response.jobs||[];
    const currentJob=rows.find(row=>row.id===current?.id);
    return currentJob||rows[0]||null;
   });
  }catch{/* No account or account not entitled: keep page non-blocking. */}
 },[]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  return()=>{mounted.current=false;};
 },[refresh]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{void refresh();},6000);
  return()=>window.clearInterval(timer);
 },[refresh]);
 useEffect(()=>{
  const listener=(event:Event)=>{
   const input=(event as CustomEvent<PilotRenderRequest>).detail;
   if(!input?.pilotId||submitting.current)return;
   submitting.current=true;setVisible(true);setError("");
   setJob({id:"local",pilot_id:input.pilotId,topic:input.topic,
    status:"queued",phase:"Iniciando",progress:0,title:input.topic,
    videoUrl:null,failure_code:null,created_at:new Date().toISOString(),seconds:input.seconds});
   void(async()=>{
    try{
     const answer=await authorized("",{
      method:"POST",body:JSON.stringify({...input,clientKey:crypto.randomUUID(),confirmCost:true})
     }) as {id:string};
     if(!answer?.id)throw Error("No se pudo iniciar el video.");
     setJob(current=>current?{...current,id:answer.id}:current);
     setTimeout(()=>{void refresh();},1600);
    }catch(e){
     setError(e instanceof Error?e.message:"No se pudo iniciar.");
     setJob(null);
    }finally{submitting.current=false;}
   })();
  };
  window.addEventListener("vmv-pilot:generate",listener);
  return()=>window.removeEventListener("vmv-pilot:generate",listener);
 },[refresh]);
 if(!job&&!error)return null;
 const state=job?.status||"failed";
 const finished=state==="completed"&&Boolean(job?.videoUrl);
 const failed=state==="failed"||Boolean(error);
 const percent=finished?100:Math.min(99,Math.max(0,job?.progress||0));
 return <aside className={css.dock} aria-label="VMV Pilot">
  <button type="button" className={css.ring} onClick={()=>setVisible(v=>!v)}
   aria-label={"VMV Pilot "+percent+"%"}>
   <span className={css.circle} style={{background:"conic-gradient("+
    (failed?"#c84f71":"#8c60c0")+" "+percent+"%,#e9e0f0 "+percent+"% 100%)"}}>
    <span>{finished?<Check size={20}/>:failed?<X size={18}/>:percent+"%"}</span>
   </span>
  </button>
  {visible?<section className={css.card} aria-live="polite">
   <div className={css.head}><strong>VMV Pilot</strong>
    <button type="button" aria-label="Minimizar" onClick={()=>setVisible(false)}><X size={18}/></button></div>
   {job&&busyStates.has(state)?<div className={css.working}>
    <LoaderCircle className={css.spin} size={17}/>
    <span>{job.phase==="queued"?"En cola":job.phase}</span>
    <strong>{percent}%</strong>
   </div>:null}
   {finished?<div className={css.finished}>
    <video controls playsInline preload="metadata" src={job?.videoUrl||undefined}/>
    <div className={css.actions}>
     <a href={job?.videoUrl||"#"} download={(job?.title||"vmv-pilot").slice(0,45)+".mp4"}>
      <Download size={16}/> Descargar</a>
     <Link href="/vista-app/vmv-pilot"><Film size={16}/> Mis campañas</Link>
    </div>
   </div>:null}
   {failed?<p role="alert" className={css.notice}>
    {error||"No se pudo terminar el video. Revisa la campaña."}</p>:null}
   {job&&busyStates.has(state)?<p className={css.hint}>Puedes cerrar la aplicación</p>:null}
  </section>:null}
 </aside>;
}