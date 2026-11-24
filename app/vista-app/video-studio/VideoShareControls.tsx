"use client";
import {useState} from "react";
import {Check,Copy,Link2Off,LoaderCircle,Send,Share2} from "lucide-react";
import styles from "./VideoShareControls.module.css";

type Api=(path:string,method?:string,data?:unknown)=>Promise<unknown>;
type Props={jobId:string;request:Api};
type Response={path?:string|null;error?:string};
export default function VideoShareControls({jobId,request}:Props){
 const [url,setUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [expanded,setExpanded]=useState(false);
 const create=async()=>{
  if(expanded){setExpanded(false);return;}
  if(url){setExpanded(true);return;}
  setBusy(true);setNotice("");
  try{
   const response=await request("shares","POST",{id:jobId,confirmPublicSharing:true}) as Response;
   if(typeof response?.path!=="string"||!/^\/v\/[a-f0-9]{64}$/.test(response.path))
    throw Error("invalid_share");
   setUrl(window.location.origin+response.path);
   setExpanded(true);
  }catch{setNotice("No pudimos crear el enlace. Vuelve a intentarlo.");}
  finally{setBusy(false);}
 };
 const copy=async()=>{
  try{
   await navigator.clipboard.writeText(url);
   setNotice("Enlace copiado. Cualquiera con él podrá descargar el video.");
  }catch{
   window.prompt("Copia este enlace público:",url);
  }
 };
 const send=()=>{
  if(typeof navigator.share==="function"){
   void navigator.share({title:"Video de VMV Business",url})
    .catch((e:unknown)=>{if((e as Error)?.name!=="AbortError")void copy();});
  }else void copy();
 };
 const revoke=async()=>{
  if(!window.confirm("¿Desactivar el enlace? Dejará de abrir el video para nuevas visitas."))return;
  setBusy(true);setNotice("");
  try{
   await request("shares?id="+encodeURIComponent(jobId),"DELETE");
   setUrl("");setExpanded(false);
   setNotice("Enlace desactivado. Puedes crear uno nuevo cuando quieras.");
  }catch{setNotice("No pudimos desactivar el enlace. Vuelve a intentarlo.");}
  finally{setBusy(false);}
 };
 return <div className={styles.wrap}>
  <button type="button" className={styles.trigger} onClick={()=>void create()} disabled={busy}
   aria-expanded={expanded} aria-label={"Compartir video terminado"}>
   {busy?<LoaderCircle size={16} className={styles.spin}/>:<Share2 size={16}/>}
   {expanded?"Ocultar enlace":"Compartir"}
  </button>
  {expanded&&url?<div className={styles.panel}>
   <p>Enlace público. La otra persona puede verlo y descargar el MP4 sin iniciar sesión.</p>
   <input className={styles.url} readOnly value={url} aria-label="Enlace público del video"
    onFocus={e=>e.target.select()}/>
   <div className={styles.buttons}>
    <button type="button" onClick={()=>void copy()}><Copy size={15}/> Copiar enlace</button>
    <button type="button" onClick={send}><Send size={15}/> Enviar</button>
    <button type="button" className={styles.revoke} onClick={()=>void revoke()} disabled={busy}>
     <Link2Off size={15}/> Desactivar
    </button>
   </div>
  </div>:null}
  {notice?<p role="status" className={styles.notice}><Check size={13}/>{notice}</p>:null}
 </div>;
}
