"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,Bell,CheckCircle2,ChevronRight,Headphones,Inbox,
 LockKeyhole,MessageCircle,Plus,RefreshCw,Send,ShieldCheck,TriangleAlert,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import CaseAttachments from "@/components/CaseAttachments";
import styles from "./support.module.css";

type Source="support"|"marketing"|"provisioning"|"domain";
type Item={source:Source;id:string;title:string;service:string;description:string;status:string;created_at:string;updated_at:string;due_at:string|null};
type Message={id:string;author_id:string;body:string;created_at:string};
type History={id:number;summary:string;created_at:string};
type Notice={id:number;source:Source;source_id:string;kind:string;title:string;created_at:string;read_at:string|null};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const services=[
 {id:"general",es:"General",en:"General"},{id:"billing",es:"Facturación",en:"Billing"},
 {id:"smart_call",es:"Smart Call",en:"Smart Call"},{id:"ai_agents",es:"AI Agents",en:"AI Agents"},
 {id:"web_services",es:"Web Services",en:"Web Services"},
 {id:"marketing",es:"Marketing",en:"Marketing"},
 {id:"company_formation",es:"Crear compañía",en:"Company formation"},
 {id:"other",es:"Otro",en:"Other"}
];
const statusText:Record<string,[string,string]>={
 new:["Nueva","New"],received:["Recibida","Received"],pending:["Pendiente","Pending"],
 quoted:["Presupuesto disponible","Quote available"],approved:["Aprobada","Approved"],
 in_progress:["En progreso","In progress"],needs_customer:["Esperando respuesta","Waiting on you"],
 resolved:["Resuelta","Resolved"],closed:["Cerrada","Closed"],verified:["Completada","Completed"],
 activated:["Activada","Activated"],connected:["Conectado","Connected"],cancelled:["Cancelada","Canceled"]
};
export default function SupportPage(){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const fmt=(d:string)=>Number.isFinite(Date.parse(d))?
  new Intl.DateTimeFormat(en?"en-US":"es-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(d)):"—";
 const [phase,setPhase]=useState<"loading"|"ready"|"signed_out"|"error">("loading");
 const [items,setItems]=useState<Item[]>([]);
 const [page,setPage]=useState(1),[pages,setPages]=useState(1),[total,setTotal]=useState(0);
 const [selected,setSelected]=useState<Item|null>(null);
 const [messages,setMessages]=useState<Message[]>([]),[hasMore,setHasMore]=useState(false);
 const [history,setHistory]=useState<History[]>([]),[historyMore,setHistoryMore]=useState(false);
 const [owner,setOwner]=useState("");
 const [formOpen,setFormOpen]=useState(false);
 const [subject,setSubject]=useState(""),[service,setService]=useState("general"),[description,setDescription]=useState("");
 const [related,setRelated]=useState<string|null>(null);
 const [message,setMessage]=useState(""),[drafts,setDrafts]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [mobile,setMobile]=useState<"list"|"detail">("list");
 const [notices,setNotices]=useState<Notice[]>([]),[unread,setUnread]=useState(0),[showNotices,setShowNotices]=useState(false);
 const [welcome,setWelcome]=useState<string|null>(null);
 const threadSeq=useRef(0),listSeq=useRef(0),identitySeq=useRef(0),currentKey=useRef<string|null>(null);
 const busyRef=useRef(false),createKey=useRef<string|null>(null),messageKey=useRef<string|null>(null);
 const api=useCallback(async<T,>(query:string,body?:Record<string,unknown>):Promise<T>=>{
  const db=getSupabase();if(!db)throw Error("VMV no está configurado.");
  const session=await db.auth.getSession();
  if(session.error||!session.data.session?.access_token)throw Error("Inicia sesión en VMV.");
  const response=await fetch("/api/support"+(body?"":"?"+query),{
   method:body?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+session.data.session.access_token,
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const result=await response.json().catch(()=>({error:"Respuesta no disponible."}));
  if(!response.ok)throw Object.assign(Error(result.error||"Error de comunicación."),{status:response.status});
  return result as T;
 },[]);
 const loadNotices=useCallback(async()=>{
  try{
   const r=await api<{notifications:Notice[];unread:number}>("view=notifications");
   setNotices(r.notifications);setUnread(r.unread);
  }catch{/* The ticket list remains usable when notifications cannot load. */}
 },[api]);
 const reload=useCallback(async(p=1)=>{
  const seq=++listSeq.current;
  try{
   const db=getSupabase();
   if(!db){setPhase("error");return;}
   const auth=await db.auth.getUser();
   if(auth.error||!auth.data.user||auth.data.user.is_anonymous){setPhase("signed_out");return;}
   const id=auth.data.user.id;
   if(identitySeq.current===0)identitySeq.current++;
   setOwner(id);
   const data=await api<{cases:Item[];total:number;page:number;pages:number;welcome:string|null}>(
    "view=list&page="+p+"&size=20");
   if(seq!==listSeq.current)return;
   setItems(data.cases);setPage(data.page);setPages(data.pages);setTotal(data.total);setWelcome(data.welcome);
   setPhase("ready");void loadNotices();
  }catch(e){
   if(seq!==listSeq.current)return;
   setError(e instanceof Error?e.message:"No se pudieron consultar los casos.");
   setPhase("error");
  }
 },[api,loadNotices]);
 const open=useCallback(async(item:Item)=>{
  const key=item.source+":"+item.id;currentKey.current=key;
  const seq=++threadSeq.current;
  setSelected(item);setFormOpen(false);setMobile("detail");setError("");
  setMessage(drafts[key]||"");messageKey.current=null;
  setMessages([]);setHistory([]);setHasMore(false);
  const param=new URLSearchParams({source:item.source,id:item.id});
  const u=new URL(window.location.href);u.searchParams.set("source",item.source);u.searchParams.set("id",item.id);
  window.history.replaceState(null,"",u.pathname+u.search);
  try{
   const [thread,events]=await Promise.all([
    api<{items:Message[];hasMore:boolean;ownerId:string}>("view=thread&"+param),
    api<{items:History[];hasMore:boolean}>("view=history&"+param)
   ]);
   if(seq!==threadSeq.current||currentKey.current!==key)return;
   setMessages(thread.items);setHasMore(thread.hasMore);setOwner(thread.ownerId);
   setHistory(events.items);setHistoryMore(events.hasMore);
  }catch(e){
   if(seq===threadSeq.current&&currentKey.current===key)setError(e instanceof Error?e.message:"Conversación no disponible.");
  }
 },[api,drafts]);
 const loadOlder=async(isHistory=false)=>{
  if(!selected)return;
  const key=currentKey.current,rows=isHistory?history:messages;
  const oldest=rows[0];if(!oldest)return;
  const param=new URLSearchParams({view:isHistory?"history":"thread",source:selected.source,id:selected.id,
   before:oldest.created_at,beforeId:String(oldest.id),size:"30"});
  try{
   const r=await api<{items:Message[];hasMore:boolean}>(param.toString());
   if(currentKey.current!==key)return;
   if(isHistory){setHistory(prev=>[...(r.items as unknown as History[]),...prev]);setHistoryMore(r.hasMore);}
   else{setMessages(prev=>[...r.items,...prev]);setHasMore(r.hasMore);}
  }catch(e){if(currentKey.current===key)setError(e instanceof Error?e.message:"No se pudo cargar el historial.");}
 };
 useEffect(()=>{
  const db=getSupabase();
  if(!db){setPhase("error");return;}
  let active=true;
  const sub=db.auth.onAuthStateChange(event=>{
   if(event==="SIGNED_OUT"&&active){
    threadSeq.current++;listSeq.current++;identitySeq.current++;currentKey.current=null;
    setItems([]);setMessages([]);setHistory([]);setNotices([]);setUnread(0);
    setOwner("");setSelected(null);setMessage("");setDrafts({});setPhase("signed_out");
   }
   if(event==="SIGNED_IN"&&active)queueMicrotask(()=>{if(active)void reload(1);});
  });
  void reload(1);
  return()=>{active=false;threadSeq.current++;listSeq.current++;sub.data.subscription.unsubscribe();};
 },[reload]);
 useEffect(()=>{
  if(phase!=="ready"||selected)return;
  const params=new URL(window.location.href).searchParams,source=params.get("source") as Source,id=params.get("id");
  if(!["support","marketing","provisioning","domain"].includes(source)||!uuid(id))return;
  const existing=items.find(x=>x.source===source&&x.id===id);
  if(existing){queueMicrotask(()=>void open(existing));return;}
  let active=true;
  void api<{case:Item}>("view=case&source="+source+"&id="+id).then(r=>{
   if(active&&currentKey.current===null)void open(r.case);
  }).catch(()=>{});
  return()=>{active=false;};
 },[phase,items,selected,open,api]);
 const create=async()=>{
  if(busyRef.current)return;
  busyRef.current=true;setBusy(true);setError("");setNotice("");
  const key=createKey.current||crypto.randomUUID();createKey.current=key;
  try{
   const response=await api<{id:string}>("",{action:"create",subject,description,service_code:service,
    related_ticket_id:related,request_key:key});
   createKey.current=null;
   const item:Item={id:response.id,source:"support",title:subject,description,service,
    status:"new",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),due_at:null};
   setFormOpen(false);setSubject("");setDescription("");setRelated(null);
   await reload(1);await open(item);
   setNotice(L("Solicitud registrada con una referencia única.","Ticket created with a unique reference."));
  }catch(e){setError(e instanceof Error?e.message:L("No se pudo crear el ticket.","Ticket could not be created."));}
  finally{busyRef.current=false;setBusy(false);}
 };
 const send=async()=>{
  if(busyRef.current||!selected||!message.trim())return;
  busyRef.current=true;setBusy(true);setError("");
  const key=messageKey.current||crypto.randomUUID();messageKey.current=key;
  const item=selected,itemKey=item.source+":"+item.id;
  try{
   await api("",{action:"message",source:item.source,id:item.id,message:message.trim(),request_key:key});
   messageKey.current=null;setDrafts(prev=>({...prev,[itemKey]:""}));
   if(currentKey.current===itemKey)setMessage("");
   if(currentKey.current===itemKey){await open(item);setMessage("");}
   await reload(page);
   setNotice(L("Mensaje guardado.","Message saved."));
  }catch(e){setError(e instanceof Error?e.message:L("No se pudo enviar.","Could not send the message."));}
  finally{busyRef.current=false;setBusy(false);}
 };
 const markNotice=async(n:Notice)=>{
  try{
   await api("",{action:"mark_notification",id:n.id});
   await loadNotices();setShowNotices(false);
   const item=items.find(x=>x.source===n.source&&x.id===n.source_id)
    ||(await api<{case:Item}>("view=case&source="+n.source+"&id="+n.source_id)).case;
   await open(item);
  }catch(e){setError(e instanceof Error?e.message:"Aviso no disponible.");}
 };
 const active=selected?items.find(x=>x.source===selected.source&&x.id===selected.id)||selected:null;
 const resolved=active?["resolved","closed","verified","cancelled","activated","connected"].includes(active.status):false;
 const label=(code:string)=>statusText[code]?.[en?1:0]||code.replaceAll("_"," ");
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.header}><a href="/vista-app" className={styles.back}><ArrowLeft size={17}/>{L("Volver a VMV","Back to VMV")}</a>
   <span className={styles.brand}>V<span>VMV BUSINESS</span></span>
   <div className={styles.headerActions}><InterfaceLanguagePicker compact/>
    <button type="button" className={styles.bell} onClick={()=>setShowNotices(x=>!x)} aria-label={L("Notificaciones","Notifications")}>
     <Bell size={17}/>{unread>0?<small>{unread}</small>:null}</button></div></header>
  {showNotices?<section className={styles.notices}><strong>{L("Notificaciones","Notifications")}</strong>
   {notices.length?notices.slice(0,15).map(n=><button key={n.id} type="button" onClick={()=>void markNotice(n)}>
    <span>{n.title}</span><small>{fmt(n.created_at)} · {n.read_at?L("Leída","Read"):L("Nueva","New")}</small></button>):
    <p>{L("Sin notificaciones.","No notifications.")}</p>}</section>:null}
  <div className={styles.intro}><div><span className={styles.eyebrow}>{L("CENTRO DE AYUDA","HELP CENTER")}</span>
   <h1>{L("Estamos aquí para ayudarte","We're here to help")}<span>.</span></h1>
   <p>{welcome||L("Consulta tus solicitudes, comparte archivos y habla con el equipo.","Track requests, share files and talk with our team.")}</p></div>
   <button type="button" className={styles.refresh} onClick={()=>void reload(page)}><RefreshCw size={16}/>{L("Actualizar","Refresh")}</button></div>
  {error?<div className={styles.alert} role="alert"><TriangleAlert size={16}/>{error}<button type="button" onClick={()=>setError("")} aria-label="Cerrar"><X size={14}/></button></div>:null}
  {notice?<div className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</div>:null}
  {phase!=="ready"?<div className={styles.gate}><LockKeyhole size={29}/>
   <h2>{phase==="signed_out"?L("Inicia sesión para continuar","Sign in to continue"):phase==="loading"?L("Cargando…","Loading…"):L("No se pudo conectar","Unable to connect")}</h2>
   {phase==="signed_out"?<a className={styles.primary} href="/vista-app">{L("Entrar a VMV","Sign in")} <ArrowRight size={17}/></a>
   :<button type="button" className={styles.primary} onClick={()=>void reload(1)}>{L("Reintentar","Retry")}</button>}</div>:
  <div className={styles.grid} data-mobile={mobile}>
   <section className={styles.list}>
    <div className={styles.paneHead}><strong>{L("Mis solicitudes","My requests")} · {total}</strong><button type="button" className={styles.add}
     onClick={()=>{currentKey.current=null;threadSeq.current++;setFormOpen(true);setSelected(null);setRelated(null);setMobile("detail");setError("");}}>
     <Plus size={15}/>{L("Nuevo ticket","New ticket")}</button></div>
    <div className={styles.listScroll}>{items.length?items.map(item=><button type="button" key={item.source+item.id}
     className={active?.id===item.id&&active?.source===item.source?styles.rowActive:styles.row} onClick={()=>void open(item)}>
     <span className={styles.rowTitle}><strong>{item.title}</strong><small>{fmt(item.updated_at)}</small></span>
     <span className={styles.rowDescription}>{item.description}</span>
     <span className={styles.rowBottom}><span className={styles.badge}>{({support:L("Soporte","Support"),marketing:"Marketing",provisioning:L("Líneas","Phone lines"),domain:L("Dominios","Domains")})[item.source]}</span><span>{label(item.status)}</span></span>
    </button>):<div className={styles.blank}><Inbox size={27}/>{L("Todavía no tienes solicitudes.","No requests yet.")}</div>}
     <div className={styles.pager}><button type="button" disabled={page<=1} onClick={()=>void reload(page-1)}>← {L("Anterior","Previous")}</button><span>{page} / {pages}</span><button type="button" disabled={page>=pages} onClick={()=>void reload(page+1)}>{L("Siguiente","Next")} →</button></div>
    </div>
   </section>
   <section className={styles.detail}><div className={styles.paneHead}>
    <button type="button" className={styles.backMobile} onClick={()=>{setMobile("list");setFormOpen(false);}}><ArrowLeft size={16}/>{L("Mis solicitudes","My requests")}</button>
    <strong>{formOpen?L("Abrir ticket","Open ticket"):active?"#"+active.id.slice(0,8).toUpperCase():L("Conversación","Conversation")}</strong></div>
    {formOpen?<div className={styles.form}><span className={styles.eyebrow}>{L("NUEVA SOLICITUD","NEW REQUEST")}</span>
     <h2>{related?L("Continuar un caso cerrado","Follow up on a resolved case"):L("¿En qué podemos ayudarte?","How can we help?")}</h2>
     {related?<p>{L("Se creará un ticket relacionado con el expediente anterior.","A linked follow-up ticket will be created.")}</p>:null}
     <label>{L("Servicio","Service")}<select value={service} onChange={e=>{setService(e.target.value);createKey.current=null;}}>
       {services.map(x=><option key={x.id} value={x.id}>{en?x.en:x.es}</option>)}</select></label>
     <label>{L("Asunto","Subject")}<input value={subject} maxLength={140} onChange={e=>{setSubject(e.target.value);createKey.current=null;}} placeholder={L("Describe brevemente tu necesidad…","Briefly describe your issue…")}/></label>
     <label>{L("Descripción","Description")}<textarea rows={6} maxLength={4000} value={description} onChange={e=>{setDescription(e.target.value);createKey.current=null;}} placeholder={L("Incluye el contexto y lo que necesitas…","Include context and what you need…")}/></label>
     <p>{L("Este formulario contacta al equipo de VMV, no a los clientes de tu negocio.","This form contacts VMV staff, not your business's customers.")}</p>
     <button type="button" className={styles.primary} disabled={busy||subject.trim().length<5||description.trim().length<10} onClick={()=>void create()}><Send size={16}/>{L("Enviar solicitud","Submit request")}</button>
    </div>:active?<><div className={styles.caseHeader}><span className={styles.eyebrow}>{active.source.toUpperCase()}</span>
     <h2>{active.title}</h2><span className={styles.badge}>{label(active.status)}</span>
     {active.status==="quoted"?<a href="/vista-app/marketing">{L("Revisar presupuesto en Marketing","Review quote in Marketing")} <ChevronRight size={13}/></a>:null}</div>
     <div className={styles.thread}><div className={styles.original}><small>{L("Solicitud original","Original request")} · {fmt(active.created_at)}</small><p>{active.description}</p></div>
      {hasMore?<button type="button" className={styles.more} onClick={()=>void loadOlder(false)}>{L("Mensajes anteriores","Older messages")}</button>:null}
      {messages.map(m=><div className={m.author_id===owner?styles.mine:styles.theirs} key={m.id}><small>{m.author_id===owner?L("Tú","You"):L("Equipo VMV","VMV staff")} · {fmt(m.created_at)}</small><p>{m.body}</p></div>)}
      {history.length?<details className={styles.history}><summary>{L("Historial del caso","Case history")}</summary>
       {historyMore?<button type="button" className={styles.more} onClick={()=>void loadOlder(true)}>{L("Actividad anterior","Older activity")}</button>:null}
       {history.map(h=><p key={h.id}>{h.summary} · {fmt(h.created_at)}</p>)}</details>:null}
     </div>
     <div className={styles.composer}>{resolved?<><p className={styles.readOnly}>{L("Este caso finalizó. Abre un ticket relacionado si necesitas continuar.","This case is closed. Open a linked follow-up ticket to continue.")}</p>
      <button className={styles.primary} type="button" onClick={()=>{setRelated(active.source==="support"?active.id:null);setSelected(null);currentKey.current=null;setFormOpen(true);setMobile("detail");}}>
       <Plus size={15}/>{L("Nueva solicitud de seguimiento","Create follow-up")}</button></>:<>
      <textarea rows={3} maxLength={4000} value={message}
       onChange={e=>{setMessage(e.target.value);messageKey.current=null;setDrafts(prev=>({...prev,[active.source+":"+active.id]:e.target.value}));}}
       placeholder={L("Escribe tu respuesta…","Write your reply…")} aria-label={L("Responder a VMV","Reply to VMV")}/>
      <div className={styles.composeActions}><small>{L("Queda guardado en tu expediente.","Saved in your case.")}</small>
       <button type="button" className={styles.primary} disabled={busy||!message.trim()} onClick={()=>void send()}><Send size={15}/>{L("Enviar","Send")}</button></div>
     </>}</div>
     <CaseAttachments source={active.source} caseId={active.id} readOnly={resolved}/>
    </>:<div className={styles.empty}><MessageCircle size={33}/><h2>{L("Tu conversación con VMV","Your conversation with VMV")}</h2>
      <p>{L("Abre una solicitud o crea un ticket de soporte.","Select a request or create a support ticket.")}</p>
      <button type="button" className={styles.primary} onClick={()=>{setFormOpen(true);setMobile("detail");}}>{L("Nuevo ticket","New ticket")} <ChevronRight size={16}/></button></div>}
   </section>
  </div>}
  <footer className={styles.footer}><ShieldCheck size={15}/>{L("Tus solicitudes son privadas. El equipo comparte avisos dentro de VMV; no se envían correos o SMS automáticamente.","Your requests are private. Updates appear inside VMV; no automatic email or SMS is sent.")}</footer>
 </div></main>;
}