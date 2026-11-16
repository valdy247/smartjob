"use client";
import {useEffect,useRef,useState} from "react";
import {MessageCircle,X,ShieldCheck} from "lucide-react";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import styles from "./WebChatLauncher.module.css";

export default function WebChatLauncher({slug,business,categoryId,services,preview=false}:{
 slug:string;business:string;categoryId:string;services:string[];preview?:boolean;
}){
 const [open,setOpen]=useState(false);
 const closeRef=useRef<HTMLButtonElement>(null);
 const openRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const openFromHash=()=>{if(window.location.hash==="#vmv-chat")setOpen(true);};
  const onChatLink=(event:MouseEvent)=>{
   const target=event.target;
   if(!(target instanceof Element))return;
   const link=target.closest('a[href="#vmv-chat"]');
   if(!link)return;
   event.preventDefault();
   setOpen(true);
  };
  openFromHash();
  window.addEventListener("hashchange",openFromHash);
  document.addEventListener("click",onChatLink,true);
  return()=>{
   window.removeEventListener("hashchange",openFromHash);
   document.removeEventListener("click",onChatLink,true);
  };
 },[]);
 useEffect(()=>{if(open)closeRef.current?.focus();},[open]);
 const close=()=>{setOpen(false);openRef.current?.focus();};
 return <>
  <button ref={openRef} type="button" className={styles.launcher} aria-expanded={open}
   aria-label="Escribir al negocio" onClick={()=>setOpen(o=>!o)}><MessageCircle size={22}/><span>Chat</span></button>
  {open?<div className={styles.overlay} role="presentation" onClick={close}>
   <section className={styles.dialog} role="dialog" aria-modal="true" aria-label={"Enviar mensaje a "+business}
    onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close();}}}
    onClick={event=>event.stopPropagation()}>
    <header><div><small>MENSAJES · VMV</small><h2>Escribe a {business}</h2><p>El negocio recibirá tu consulta en su aplicación. No es un chat en tiempo real.</p></div>
     <button ref={closeRef} type="button" onClick={close} aria-label="Cerrar chat"><X size={21}/></button></header>
    <RequestForm source="builder" preview={preview} slug={slug} business={business} categoryId={categoryId} services={services}/>
    <footer><ShieldCheck size={14}/> Los datos se usan para responder tu consulta.</footer>
   </section>
  </div>:null}
 </>;
}
