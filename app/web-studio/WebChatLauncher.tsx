"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Bot,CheckCircle2,Headphones,LoaderCircle,MessageCircle,Send,ShieldCheck,UserRound,X} from "lucide-react";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import css from "./WebChatLauncher.module.css";

type VisitorMessage={role:"user"|"assistant";content:string;created_at?:string};
type Status={enabled:boolean;agent?:string;business?:string;handoff?:boolean;leadCapture?:boolean;messages?:VisitorMessage[]};
type Props={
 slug:string;business:string;categoryId:string;services:string[];preview?:boolean;
 siteKind?:"classic"|"builder";fallbackMode?:"inbox"|"none";
};
export default function WebChatLauncher({slug,business,categoryId,services,preview=false,
 siteKind="builder",fallbackMode="inbox"}:Props){
 const [open,setOpen]=useState(false);
 const [status,setStatus]=useState<Status|null>(null),[checking,setChecking]=useState(true);
 const [messages,setMessages]=useState<VisitorMessage[]>([]);
 const [text,setText]=useState(""),[consent,setConsent]=useState(false);
 const [sending,setSending]=useState(false),[error,setError]=useState("");
 const [contact,setContact]=useState(false);
 const closeRef=useRef<HTMLButtonElement>(null),openRef=useRef<HTMLButtonElement>(null);
 const scrollRef=useRef<HTMLDivElement>(null);
 const refresh=useCallback(async()=>{
  if(preview){setChecking(false);return;}
  try{
   const response=await fetch("/api/vmv/public-chat?kind="+siteKind+"&slug="+encodeURIComponent(slug),
    {method:"GET",cache:"no-store",credentials:"same-origin"});
   const result=await response.json() as Status;
   if(result.enabled===true){
    setStatus(result);setMessages(Array.isArray(result.messages)?result.messages:[]);
   }else{setStatus({enabled:false});setMessages([]);}
  }catch{setStatus({enabled:false});}
  finally{setChecking(false);}
 },[slug,siteKind,preview]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(open)closeRef.current?.focus();},[open]);
 useEffect(()=>{if(open)scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});},
  [open,messages.length,sending]);
 const close=()=>{setOpen(false);setContact(false);openRef.current?.focus();};
 const send=async(e?:FormEvent)=>{
  e?.preventDefault();
  const question=text.trim();
  if(!status?.enabled||!consent||sending||question.length===0||question.length>650)return;
  setText("");setSending(true);setError("");
  setMessages(prev=>[...prev,{role:"user",content:question}]);
  try{
   const response=await fetch("/api/vmv/public-chat",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({slug,kind:siteKind,message:question,consent:true,website:""})
   });
   const result=await response.json() as {reply?:string;error?:string};
   if(!response.ok||!result.reply)throw Error(result.error||"Chat no disponible.");
   setMessages(prev=>[...prev,{role:"assistant",content:result.reply!}]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar. Inténtalo nuevamente.");}
  finally{setSending(false);}
 };
 const available=!checking&&(status?.enabled===true||fallbackMode==="inbox");
 if(!available)return null;
 const live=status?.enabled===true;
 return <>
  <button ref={openRef} type="button" className={css.launcher} aria-expanded={open}
   aria-label={live?"Hablar con el agente IA":"Escribir al negocio"}
   onClick={()=>setOpen(o=>!o)}><MessageCircle size={22}/><span>{live?"Chat IA":"Chat"}</span></button>
  {open?<div className={css.overlay} role="presentation" onClick={close}>
   <section className={css.dialog} role="dialog" aria-modal="true"
    aria-label={(live?"Chat de IA de ":"Enviar mensaje a ")+business}
    onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close();}}}
    onClick={event=>event.stopPropagation()}>
    <header>
     <div><small>{live?"ASISTENTE IA · VMV":"MENSAJES · VMV"}</small>
      <h2>{contact?"Escríbenos":live?(status?.agent||"Asistente IA"):"Escribe a "+business}</h2>
      <p>{live?"Respuestas con IA, supervisadas por el negocio.": "El negocio recibirá tu consulta. No es un chat en tiempo real."}</p>
     </div>
     <button ref={closeRef} type="button" onClick={close} aria-label="Cerrar chat"><X size={21}/></button>
    </header>
    {!live||contact?<div className={css.formPanel}>
     {live?<button type="button" className={css.backToChat} onClick={()=>{setContact(false);setError("");}}>
      <MessageCircle size={15}/> Volver al chat</button>:null}
     <RequestForm source={siteKind==="builder"?"builder":"classic"} preview={preview}
      slug={slug} business={business} categoryId={categoryId} services={services}/>
    </div>:<>
     <div className={css.chatStream} ref={scrollRef} role="log" aria-live="polite" aria-label="Mensajes del chat">
      {messages.length===0?<div className={css.chatWelcome}>
       <span><Bot size={24}/></span>
       <strong>¡Hola! Soy el asistente de {business}.</strong>
       <p>¿En qué puedo ayudarte?</p>
      </div>:messages.map((item,i)=><div key={i}
       className={item.role==="user"?css.visitorBubble:css.aiBubble}>
       <small>{item.role==="user"?"Tú":"Asistente IA"}</small><p>{item.content}</p>
      </div>)}
      {sending?<div className={css.waiting}><LoaderCircle size={17} className={css.spin}/> Escribiendo…</div>:null}
     </div>
     {!consent?<label className={css.consent}>
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      <span>Acepto conversar con IA y guardar estos mensajes hasta 29 días.{" "}
       <a href="/web-chat-privacy" target="_blank" rel="noopener noreferrer">Privacidad</a></span>
     </label>:null}
     {error?<p className={css.chatError} role="alert">{error}</p>:null}
     <form className={css.chatInput} onSubmit={e=>void send(e)}>
      <label className={css.srOnly} htmlFor="vmv-public-chat-message">Tu mensaje</label>
      <textarea id="vmv-public-chat-message" rows={2} maxLength={650} value={text}
       placeholder={consent?"Escribe un mensaje…":"Acepta privacidad para empezar"}
       disabled={!consent||sending} onChange={e=>setText(e.target.value)}
       onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send();}}}/>
      <button type="submit" disabled={!consent||sending||!text.trim()} aria-label="Enviar mensaje">
       {sending?<LoaderCircle size={18} className={css.spin}/>:<Send size={18}/>}</button>
     </form>
     <div className={css.chatActions}>
      {status.handoff?<button type="button" onClick={()=>setContact(true)}><Headphones size={15}/> Hablar con una persona</button>:null}
      <span><ShieldCheck size={13}/> IA · sin pagos ni reservas</span>
     </div>
    </>}
    <footer><ShieldCheck size={14}/> {live?"No compartas tarjetas ni datos sensibles.":"Los datos se usan para responder tu consulta."}</footer>
   </section>
  </div>:null}
 </>;
}
