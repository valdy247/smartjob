"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Check,ImagePlus,LoaderCircle,Sparkles,WandSparkles,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import styles from "./ProductImageField.module.css";

type Props={
 value:string;onChange:(url:string)=>void;
 businessId:string;productName:string;description:string;
};

function suggestedPrompt(name:string,description:string){
 const product=name.trim().slice(0,120);
 const details=description.trim().slice(0,220);
 return ("Fotografía comercial realista de "+(product||"este producto")+
  (details?". "+details:"")+
  ". Producto protagonista, fondo limpio, luz profesional y sin textos ni marcas de agua.")
  .slice(0,450);
}

export default function ProductImageField({value,onChange,businessId,productName,description}:Props){
 const [open,setOpen]=useState(false);
 const [prompt,setPrompt]=useState("");
 const [candidate,setCandidate]=useState("");
 const [working,setWorking]=useState<"improve"|"generate"|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);
 const busy=working!==null;

 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;
  document.body.style.overflow="hidden";
  closeRef.current?.focus();
  const escape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"&&!busy){setOpen(false);triggerRef.current?.focus();}
  };
  window.addEventListener("keydown",escape);
  return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",escape);};
 },[open,busy]);

 const start=()=>{
  setPrompt(suggestedPrompt(productName,description));
  setCandidate("");setError("");setNotice("");setOpen(true);
 };
 const close=()=>{if(busy)return;setOpen(false);setError("");triggerRef.current?.focus();};
 const call=async(action:"improve"|"generate")=>{
  if(busy||prompt.trim().length<8||prompt.trim().length>450)return;
  setWorking(action);setError("");
  try{
   const client=getSupabase();
   if(!client)throw Error("No se pudo conectar.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
   const response=await fetch("/api/web-services/generate-image",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
    body:JSON.stringify({
     action,kind:"product",businessId,
     productName:productName.trim().slice(0,120),
     description:description.trim().slice(0,500),
     business:productName.trim().slice(0,100),
     prompt:prompt.trim()
    })
   });
   const data=await response.json().catch(()=>({})) as {error?:string;prompt?:string;url?:string};
   if(!response.ok)throw Error(data.error||"No fue posible completar la solicitud.");
   if(action==="improve"){
    const improved=typeof data.prompt==="string"?data.prompt.trim():"";
    if(improved.length<8||improved.length>450)throw Error("No se recibió un prompt válido.");
    setPrompt(improved);setCandidate("");
   }else{
    const safe=typeof data.url==="string"?safeWebImageUrl(data.url):null;
    if(!safe)throw Error("No se pudo verificar la imagen.");
    setCandidate(safe);
   }
  }catch(e){setError(e instanceof Error?e.message:"Inténtalo nuevamente.");}
  finally{setWorking(null);}
 };
 const approve=()=>{
  if(busy||!candidate)return;
  const safe=safeWebImageUrl(candidate);
  if(!safe){setError("La imagen ya no es válida.");return;}
  onChange(safe);
  setNotice("Foto aprobada. Guarda el producto para conservarla.");
  close();
 };

 return <div className={styles.root}>
  <BuilderImageField value={value} onChange={url=>{onChange(url);setNotice("");}}
   allowAi={false}/>
  <button ref={triggerRef} type="button" className={styles.generateEntry} onClick={start}>
   <WandSparkles size={18}/> Generar con IA
  </button>
  {notice?<small role="status" className={styles.notice}>{notice}</small>:null}
  {open&&typeof document!=="undefined"?createPortal(
   <div className={styles.overlay} onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section role="dialog" aria-modal="true" aria-label="Generar foto de producto"
     className={styles.modal}>
     <header className={styles.header}>
      <div><small>PRODUCTOS/PEDIDOS</small><strong>Generar foto con IA</strong></div>
      <button type="button" ref={closeRef} onClick={close} disabled={busy}
       aria-label="Cerrar"><X size={20}/></button>
     </header>
     <div className={styles.preview} aria-live="polite">
      {working==="generate"?<div className={styles.loading}>
       <LoaderCircle className={styles.spin} size={38}/>
       <strong>Generando imagen…</strong>
      </div>:candidate?<img src={candidate} alt="Imagen generada pendiente de aprobación"/>:
       <div className={styles.placeholder}><ImagePlus size={32}/>
        <span>Tu imagen aparecerá aquí</span></div>}
     </div>
     <label className={styles.field}>Describe tu imagen
      <textarea rows={4} maxLength={450} value={prompt} disabled={busy}
       placeholder="Ej. Pastel de chocolate, fondo claro, luz profesional…"
       onChange={e=>{setPrompt(e.target.value);setCandidate("");setError("");}}/>
      <small>{prompt.length}/450</small>
     </label>
     {error?<p role="alert" className={styles.error}>{error}</p>:null}
     <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={busy||prompt.trim().length<8}
       onClick={()=>void call("improve")}>
       {working==="improve"?<LoaderCircle className={styles.spin} size={16}/>:<Sparkles size={16}/>}
       {working==="improve"?"Mejorando…":"Mejorar prompt"}
      </button>
      <button type="button" className={styles.primary} disabled={busy||prompt.trim().length<8}
       onClick={()=>void call("generate")}>
       {working==="generate"?<LoaderCircle className={styles.spin} size={16}/>:<WandSparkles size={16}/>}
       {working==="generate"?"Generando…":candidate?"Regenerar":"Generar"}
      </button>
     </div>
     {candidate&&working!=="generate"?<button type="button"
      className={styles.approve} disabled={busy} onClick={approve}>
      <Check size={17}/> Aprobar imagen
     </button>:null}
    </section>
   </div>,document.body):null}
 </div>;
}
