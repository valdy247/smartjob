"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Bot,CheckCircle2,Headphones,LoaderCircle,MessageCircle,Send,ShieldCheck,X} from "lucide-react";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import css from "./WebChatLauncher.module.css";
type VisitorMessage={role:"user"|"assistant"|"human";content:string;created_at?:string};
type Status={enabled:boolean;agent?:string;business?:string;handoff?:boolean;leadCapture?:boolean;
 handoffStatus?:"bot"|"waiting"|"human";aiOnline?:boolean;leadSaved?:boolean;messages?:VisitorMessage[]};
type Props={slug:string;business:string;categoryId:string;services:string[];preview?:boolean;
 siteKind?:"classic"|"builder";fallbackMode?:"inbox"|"none"};
export default function WebChatLauncher({slug,business,categoryId,services,preview=false,
 siteKind="builder",fallbackMode="inbox"}:Props){
 const [open,setOpen]=useState(false),[checking,setChecking]=useState(true);
 const [status,setStatus]=useState<Status|null>(null),[messages,setMessages]=useState<VisitorMessage[]>([]);
 const [text,setText]=useState(""),[consent,setConsent]=useState(false);
 const [sending,setSending]=useState(false),[error,setError]=useState("");
 const [contact,setContact]=useState(false),[offerLead,setOfferLead]=useState(false);
 const [leadName,setLeadName]=useState(""),[leadPhone,setLeadPhone]=useState(""),[leadEmail,setLeadEmail]=useState("");
 const [leadConsent,setLeadConsent]=useState(false),[leadBusy,setLeadBusy]=useState(false),[leadSaved,setLeadSaved]=useState(false);
 const closeRef=useRef<HTMLButtonElement>(null),openRef=useRef<HTMLButtonElement>(null);
 const scrollRef=useRef<HTMLDivElement>(null),sendingRef=useRef(false);
 const refresh=useCallback(async(silent=false)=>{
  if(preview){setChecking(false);return;}
  try{
   const r=await fetch("/api/vmv/public-chat?kind="+siteKind+"&slug="+encodeURIComponent(slug),
    {method:"GET",cache:"no-store",credentials:"same-origin"});
   const data=await r.json() as Status;
   if(data.enabled){
    setStatus(data);
    if(!sendingRef.current)setMessages(Array.isArray(data.messages)?data.messages:[]);
    if(data.leadSaved){setLeadSaved(true);setOfferLead(false);}
   }else{setStatus({enabled:false});setMessages([]);}
  }catch{if(!silent)setStatus({enabled:false});}
  finally{if(!silent)setChecking(false);}
 },[slug,siteKind,preview]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(!open||!status?.enabled||preview)return;
  const id=window.setInterval(()=>void refresh(true),2500);
  return()=>window.clearInterval(id);
 },[open,status?.enabled,refresh,preview]);
 useEffect(()=>{if(open)closeRef.current?.focus();},[open]);
 useEffect(()=>{if(open)scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});},
  [open,messages.length,sending,offerLead]);
 const close=()=>{setOpen(false);setContact(false);openRef.current?.focus();};
 const sendMessage=async(question:string)=>{
  if(!status?.enabled||!consent||sending||question.length<1||question.length>650)return;
  sendingRef.current=true;setSending(true);setError("");
  setMessages(prev=>[...prev,{role:"user",content:question}]);
  try{
   const r=await fetch("/api/vmv/public-chat",{
    method:"POST",cache:"no-store",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({slug,kind:siteKind,message:question,consent:true,website:""})
   });
   const data=await r.json() as {reply?:string;error?:string;offerContact?:boolean;
    mode?:"bot"|"waiting"|"human";handoffStatus?:"waiting"};
   if(!r.ok)throw Error(data.error||"Chat no disponible.");
   if(data.reply)setMessages(prev=>[...prev,{role:"assistant",content:data.reply!}]);
   if(data.mode==="waiting"||data.mode==="human")
    setStatus(prev=>prev?{...prev,handoffStatus:data.mode==="human"?"human":"waiting"}:prev);
   if(data.offerContact&&!leadSaved)setOfferLead(true);
   await refresh(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar. Inténtalo nuevamente.");}
  finally{sendingRef.current=false;setSending(false);void refresh(true);}
 };
 const send=(e:FormEvent)=>{e.preventDefault();const question=text.trim();if(!question)return;
  setText("");void sendMessage(question);};
 const transfer=async()=>{
  if(!consent){setError("Acepta primero la privacidad.");return;}
  if(!messages.length){await sendMessage("Quiero hablar con una persona del negocio.");return;}
  setSending(true);setError("");
  try{
   const r=await fetch("/api/vmv/public-chat/action",{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({kind:siteKind,slug,action:"handoff",consent:true})});
   const data=await r.json() as {error?:string};
   if(!r.ok)throw Error(data.error||"No se pudo pedir ayuda.");
   setStatus(prev=>prev?{...prev,handoffStatus:"waiting"}:prev);
   await refresh(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo pedir ayuda.");}
  finally{setSending(false);}
 };
 const saveLead=async(e:FormEvent)=>{
  e.preventDefault();if(!leadConsent||leadBusy||!leadName.trim()||(!leadPhone.trim()&&!leadEmail.trim()))return;
  setLeadBusy(true);setError("");
  try{
   const r=await fetch("/api/vmv/public-chat/action",{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({kind:siteKind,slug,action:"lead",consent:true,
     name:leadName.trim(),email:leadEmail.trim(),phone:leadPhone.trim()})});
   const data=await r.json() as {error?:string};
   if(!r.ok)throw Error(data.error||"No se pudo guardar el contacto.");
   setLeadSaved(true);setOfferLead(false);setLeadName("");setLeadPhone("");setLeadEmail("");
  }catch(e){setError(e instanceof Error?e.message:"Comprueba tus datos.");}
  finally{setLeadBusy(false);}
 };
 const available=!checking&&(status?.enabled===true||fallbackMode==="inbox");
 if(!available)return null;
 const live=status?.enabled===true;
 const human=status?.handoffStatus==="waiting"||status?.handoffStatus==="human";
 return <>
  <button ref={openRef} type="button" className={css.launcher} aria-expanded={open}
   aria-label={live?"Hablar con el agente IA":"Escribir al negocio"} onClick={()=>setOpen(o=>!o)}>
   <MessageCircle size={22}/><span>{live?"Chat IA":"Chat"}</span></button>
  {open?<div className={css.overlay} role="presentation" onClick={close}>
   <section className={css.dialog} role="dialog" aria-modal="true"
    aria-label={(live?"Chat de IA de ":"Enviar mensaje a ")+business}
    onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();close();}}}
    onClick={e=>e.stopPropagation()}>
    <header><div><small>{live?(human?"ATENCIÓN HUMANA · VMV":"ASISTENTE IA · VMV"):"MENSAJES · VMV"}</small>
     <h2>{contact?"Escríbenos":live?(status?.agent||"Asistente IA"):"Escribe a "+business}</h2>
     <p>{human?status?.handoffStatus==="waiting"?"Un miembro del equipo fue avisado.":"Estás conversando con el equipo.":
      live?"Asistente de inteligencia artificial de este negocio.":"Tu consulta llegará al negocio."}</p>
    </div><button ref={closeRef} type="button" onClick={close} aria-label="Cerrar chat"><X size={21}/></button></header>
    {!live||contact?<div className={css.formPanel}>
     {live?<button type="button" className={css.backToChat} onClick={()=>{setContact(false);setError("");}}>
      <MessageCircle size={15}/> Volver al chat</button>:null}
     <RequestForm source={siteKind==="builder"?"builder":"classic"} preview={preview}
      slug={slug} business={business} categoryId={categoryId} services={services}/>
    </div>:<>
     <div className={css.chatStream} ref={scrollRef} role="log" aria-live="polite" aria-label="Mensajes del chat">
      {messages.length===0?<div className={css.chatWelcome}>
       <span><Bot size={24}/></span><strong>¡Hola! Soy el asistente de {business}.</strong>
       <p>¿En qué puedo ayudarte?</p></div>:messages.map((item,i)=><div key={i}
       className={item.role==="user"?css.visitorBubble:css.aiBubble}>
       <small>{item.role==="user"?"Tú":item.role==="human"?"Equipo humano":"Asistente IA"}</small>
       <p>{item.content}</p></div>)}
      {sending?<div className={css.waiting}><LoaderCircle size={17} className={css.spin}/> {human?"Enviando…":"Escribiendo…"}</div>:null}
      {status?.handoffStatus==="waiting"?<div className={css.waiting}><Headphones size={16}/> Esperando atención humana</div>:null}
      {offerLead&&status.leadCapture&&!leadSaved?<form className={css.leadCard} onSubmit={e=>void saveLead(e)}>
       <strong>¿Te contactamos?</strong><small>Opcional · comparte solo lo que desees</small>
       <input required placeholder="Tu nombre" maxLength={80} value={leadName} onChange={e=>setLeadName(e.target.value)}/>
       <input placeholder="Teléfono (+1…)" type="tel" maxLength={35} value={leadPhone} onChange={e=>setLeadPhone(e.target.value)}/>
       <input placeholder="Correo electrónico" type="email" maxLength={180} value={leadEmail} onChange={e=>setLeadEmail(e.target.value)}/>
       <label><input type="checkbox" checked={leadConsent} onChange={e=>setLeadConsent(e.target.checked)}/>
        <span>Acepto compartir mis datos con este negocio para recibir respuesta.</span></label>
       <div><button type="submit" disabled={!leadConsent||leadBusy||!leadName.trim()||(!leadPhone.trim()&&!leadEmail.trim())}>
        {leadBusy?"Guardando…":"Compartir datos"}</button>
        <button type="button" onClick={()=>setOfferLead(false)}>Ahora no</button></div>
      </form>:null}
      {leadSaved?<div className={css.leadSaved}><CheckCircle2 size={15}/> Contacto compartido</div>:null}
     </div>
     {!consent?<label className={css.consent}>
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      <span>Acepto conversar con IA y guardar mensajes por hasta 29 días.{" "}
       <a href="/web-chat-privacy" target="_blank" rel="noopener noreferrer">Privacidad</a></span>
     </label>:null}
     {error?<p className={css.chatError} role="alert">{error}</p>:null}
     <form className={css.chatInput} onSubmit={send}>
      <label className={css.srOnly} htmlFor="vmv-public-chat-message">Tu mensaje</label>
      <textarea id="vmv-public-chat-message" rows={2} maxLength={650} value={text}
       placeholder={consent?"Escribe un mensaje…":"Acepta privacidad para empezar"}
       disabled={!consent||sending} onChange={e=>setText(e.target.value)}
       onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendMessage(text.trim());setText("");}}}/>
      <button type="submit" disabled={!consent||sending||!text.trim()} aria-label="Enviar mensaje">
       {sending?<LoaderCircle size={18} className={css.spin}/>:<Send size={18}/>}</button>
     </form>
     <div className={css.chatActions}>
      {!human&&status.handoff?<button type="button" onClick={()=>void transfer()} disabled={sending}>
       <Headphones size={15}/> Hablar con una persona</button>:null}
      {human?<button type="button" onClick={()=>setContact(true)}>Formulario de contacto</button>:null}
      <span><ShieldCheck size={13}/> Sin pagos ni reservas automáticas</span>
     </div>
    </>}
    <footer><ShieldCheck size={14}/> No compartas tarjetas ni datos sensibles.</footer>
   </section>
  </div>:null}
 </>;
}
