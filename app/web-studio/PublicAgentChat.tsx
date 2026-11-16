"use client";

import {useEffect,useRef,useState} from "react";
import {Bot,MessageCircle,Send,X} from "lucide-react";
import styles from "./PublicAgentChat.module.css";

type Turn={role:"user"|"assistant";content:string};
export default function PublicAgentChat({slug,agentName}:{slug:string;agentName:string}){
 const [open,setOpen]=useState(false);
 const [message,setMessage]=useState("");
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [turns,setTurns]=useState<Turn[]>([]);
 const closeButton=useRef<HTMLButtonElement|null>(null);
 const launchButton=useRef<HTMLButtonElement|null>(null);
 const end=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{if(open)closeButton.current?.focus();},[open]);
 useEffect(()=>{if(open)end.current?.scrollIntoView({behavior:"smooth",block:"end"});},[open,turns.length,error]);
 function close(){setOpen(false);launchButton.current?.focus();}
 async function send(){
  const text=message.trim();
  if(!text||sending)return;
  setSending(true);setError("");setMessage("");
  const previous=turns.slice(-6);
  setTurns(old=>[...old,{role:"user" as const,content:text}]);
  try{
   const response=await fetch("/api/vmv/ai-agents/public-chat",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({site:slug,message:text,history:previous})
   });
   const payload=await response.json() as {reply?:string;error?:string};
   if(!response.ok||!payload.reply)throw Error(payload.error||"No se pudo responder.");
   setTurns(old=>[...old,{role:"assistant" as const,content:payload.reply!}].slice(-30));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar.");
  }finally{setSending(false);}
 }
 return <>
  <button ref={launchButton} type="button" className={styles.launcher}
   onClick={()=>setOpen(value=>!value)} aria-label={"Hablar con "+agentName}
   aria-expanded={open}><MessageCircle size={21}/><span>Chat IA</span></button>
  {open?<div className={styles.backdrop} onClick={close} role="presentation">
   <section className={styles.dialog} role="dialog" aria-modal="true"
    aria-label={"Chat con "+agentName} onClick={event=>event.stopPropagation()}
    onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close();}}}>
    <header className={styles.header}>
     <span className={styles.avatar}><Bot size={20}/></span>
     <div><strong>{agentName}</strong><small>Asistente de IA</small></div>
     <button ref={closeButton} type="button" onClick={close} aria-label="Cerrar chat"><X size={21}/></button>
    </header>
    <div className={styles.messages} aria-live="polite">
     {turns.length===0?<p className={styles.welcome}>¡Hola! Soy {agentName}. ¿En qué puedo ayudarte?</p>:null}
     {turns.map((turn,i)=><p key={i} className={turn.role==="user"?styles.me:styles.agent}>{turn.content}</p>)}
     {sending?<p className={styles.wait}>Escribiendo…</p>:null}
     {error?<p role="alert" className={styles.error}>{error}</p>:null}
     <div ref={end}/>
    </div>
    <form className={styles.entry} onSubmit={event=>{event.preventDefault();void send();}}>
     <input aria-label="Tu mensaje" placeholder="Escribe tu pregunta…" value={message}
      maxLength={500} disabled={sending} onChange={event=>setMessage(event.target.value)}/>
     <button type="submit" disabled={sending||!message.trim()} aria-label="Enviar mensaje"><Send size={18}/></button>
    </form>
    <small className={styles.footnote}>Asistente de IA · No confirma compras ni reservas.</small>
   </section>
  </div>:null}
 </>;
}
