"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,ChevronRight,Headphones,Inbox,LockKeyhole,
 MessageCircle,Plus,RefreshCw,Send,ShieldCheck,Sparkles,TriangleAlert} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./support.module.css";

type Source="support"|"marketing";
type Item={source:Source;id:string;title:string;service:string;description:string;status:string;created_at:string;updated_at:string};
type Message={id:string;author_id:string;body:string;created_at:string};
const statuses:Record<string,string>={
 new:"Nueva",received:"Recibida",quoted:"Presupuesto disponible",approved:"Aprobada",
 in_progress:"En progreso",needs_customer:"Esperando respuesta",resolved:"Resuelta",
 closed:"Cerrada",verified:"Completada",cancelled:"Cancelada"
};
const services:{id:string;name:string}[]=[
 {id:"general",name:"General"},{id:"billing",name:"Facturación"},{id:"smart_call",name:"Smart Call"},
 {id:"ai_agents",name:"AI Agents"},{id:"web_services",name:"Web Services"},
 {id:"marketing",name:"Marketing"},{id:"company_formation",name:"Crear compañía"},
 {id:"other",name:"Otro"}
];
const fmt=(d:string)=>Number.isFinite(Date.parse(d))?new Intl.DateTimeFormat("es-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(d)):"—";
const uuid=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);

export default function SupportPage(){
 const [phase,setPhase]=useState<"loading"|"ready"|"signed_out"|"error">("loading");
 const [items,setItems]=useState<Item[]>([]);
 const [selected,setSelected]=useState<Item|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [owner,setOwner]=useState("");
 const [formOpen,setFormOpen]=useState(false);
 const [subject,setSubject]=useState("");
 const [service,setService]=useState("general");
 const [description,setDescription]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [mobile,setMobile]=useState<"list"|"detail">("list");
 const api=useCallback(async<T,>(query:string,body?:Record<string,unknown>):Promise<T>=>{
  const client=getSupabase();
  if(!client)throw Error("Conexión no configurada.");
  const {data,error:sessionError}=await client.auth.getSession();
  if(sessionError||!data.session?.access_token)throw Error("Debes iniciar sesión.");
  const result=await fetch("/api/support"+(body?"":"?"+query),{
   method:body?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+data.session.access_token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const json=await result.json().catch(()=>({error:"Respuesta no disponible."}));
  if(!result.ok)throw Error(json.error||"No se pudo completar.");
  return json as T;
 },[]);
 const reload=useCallback(async()=>{
  try{
   const client=getSupabase();
   if(!client){setPhase("error");return;}
   const auth=await client.auth.getUser();
   if(auth.error||!auth.data.user||auth.data.user.is_anonymous){setPhase("signed_out");return;}
   setOwner(auth.data.user.id);
   const r=await api<{
    tickets:{id:string;subject:string;description:string;service_code:string;status:string;created_at:string;updated_at:string}[];
    marketing:{id:string;business_name:string;goal_text:string;service_code:string;status:string;created_at:string;updated_at:string}[];
   }>("view=list");
   setItems([
    ...r.tickets.map(t=>({source:"support" as const,id:t.id,title:t.subject,service:t.service_code,description:t.description,status:t.status,created_at:t.created_at,updated_at:t.updated_at})),
    ...r.marketing.map(m=>({source:"marketing" as const,id:m.id,title:m.business_name,service:m.service_code,description:m.goal_text,status:m.status,created_at:m.created_at,updated_at:m.updated_at}))
   ].sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)));
   setPhase("ready");
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los casos.");setPhase("error");}
 },[api]);
 const open=useCallback(async(item:Item)=>{
  setSelected(item);setFormOpen(false);setMobile("detail");setError("");
  try{
   const result=await api<{messages:Message[];ownerId:string}>("view=thread&source="+item.source+"&id="+item.id);
   setMessages(result.messages);setOwner(result.ownerId);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la conversación.");}
 },[api]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{
  if(phase!=="ready"||!items.length||selected)return;
  const q=new URL(window.location.href).searchParams,source=q.get("source"),id=q.get("id");
  if((source==="marketing"||source==="support")&&id&&uuid(id)){
   const match=items.find(x=>x.id===id&&x.source===source);
   if(match)queueMicrotask(()=>void open(match));
  }
 },[phase,items,selected,open]);
 const create=async()=>{
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api<{id:string}>("",{action:"create",subject,description,service_code:service});
   setFormOpen(false);setSubject("");setDescription("");
   await reload();
   setNotice("Solicitud registrada. Nuestro equipo puede consultarla desde Admin Web.");
   const next:Item={id:result.id,source:"support",title:subject||"Soporte",description:description||"",service,status:"new",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
   // The record was persisted by the API; open its authoritative thread.
   await open(next);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir el ticket.");}
  finally{setBusy(false);}
 };
 const send=async()=>{
  if(!selected||!message.trim())return;
  setBusy(true);setError("");setNotice("");
  try{
   await api("",{action:"message",source:selected.source,id:selected.id,message:message.trim()});
   setMessage("");
   const r=await api<{messages:Message[];ownerId:string}>("view=thread&source="+selected.source+"&id="+selected.id);
   setMessages(r.messages);setNotice("Mensaje guardado para el equipo de VMV.");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar el mensaje.");}
  finally{setBusy(false);}
 };
 const active=useMemo(()=>selected?items.find(x=>x.id===selected.id&&x.source===selected.source)||selected:null,[items,selected]);
 const resolved=active?["resolved","closed","verified","cancelled"].includes(active.status):false;
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.header}><a href="/vista-app" className={styles.back}><ArrowLeft size={17}/>VMV Business</a>
   <span className={styles.brand}>V<span>VMV BUSINESS</span></span>
   <a href="/vista-app/marketing" className={styles.help}>Marketing <ArrowRight size={15}/></a></header>
  <div className={styles.intro}><div><span className={styles.eyebrow}>CENTRO DE AYUDA</span><h1>Estamos aquí para ayudarte<span>.</span></h1>
    <p>Consulta tus casos, escribe al equipo y sigue su avance en un solo lugar.</p></div>
   <button type="button" className={styles.refresh} onClick={()=>void reload()}><RefreshCw size={16}/>Actualizar</button></div>
  {error?<div className={styles.alert} role="alert"><TriangleAlert size={16}/>{error}</div>:null}
  {notice?<div className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</div>:null}
  {phase!=="ready"?<div className={styles.gate}><LockKeyhole size={29}/><h2>{phase==="signed_out"?"Inicia sesión para continuar":phase==="loading"?"Consultando tu cuenta…":"No se pudieron cargar las solicitudes"}</h2>
   {phase==="signed_out"?<a className={styles.primary} href="/vista-app">Entrar a VMV <ArrowRight size={17}/></a>:<button type="button" className={styles.primary} onClick={()=>void reload()}>Reintentar</button>}</div>:
  <div className={styles.grid} data-mobile={mobile}>
   <section className={styles.list}>
    <div className={styles.paneHead}><strong>Mis solicitudes</strong><button type="button" onClick={()=>{setFormOpen(true);setSelected(null);setMobile("detail");setError("");}} className={styles.add}><Plus size={15}/>Nuevo ticket</button></div>
    <div className={styles.listScroll}>{items.length?items.map(item=><button type="button" key={item.source+item.id} className={active?.id===item.id&&active?.source===item.source?styles.rowActive:styles.row} onClick={()=>void open(item)}>
     <span className={styles.rowTitle}><strong>{item.title}</strong><small>{fmt(item.updated_at)}</small></span>
     <span className={styles.rowDescription}>{item.description}</span><span className={styles.rowBottom}><span className={styles.badge}>{item.source==="support"?"Soporte":"Marketing"}</span><span>{statuses[item.status]||item.status}</span></span>
    </button>):<div className={styles.blank}><Inbox size={27}/>Todavía no tienes solicitudes de soporte.</div>}</div>
   </section>
   <section className={styles.detail}>
    <div className={styles.paneHead}><button type="button" className={styles.backMobile} onClick={()=>{setMobile("list");setFormOpen(false);}}><ArrowLeft size={16}/>Mis solicitudes</button>
     <strong>{formOpen?"Abrir ticket":active?"Solicitud "+active.id.slice(0,8).toUpperCase():"Conversación"}</strong></div>
    {formOpen?<div className={styles.form}><span className={styles.eyebrow}>NUEVA SOLICITUD</span><h2>¿En qué podemos ayudarte?</h2>
     <label>Servicio<select value={service} onChange={e=>setService(e.target.value)}>{services.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
     <label>Asunto<input value={subject} maxLength={140} onChange={e=>setSubject(e.target.value)} placeholder="Describe brevemente el problema…"/></label>
     <label>Descripción<textarea rows={6} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Explícanos qué necesitas y los pasos que seguiste…"/></label>
     <p>Este formulario contacta al equipo de VMV Business, no a los clientes de tu negocio.</p>
     <button type="button" className={styles.primary} disabled={busy||subject.trim().length<5||description.trim().length<10} onClick={()=>void create()}><Send size={16}/>Enviar solicitud</button>
    </div>:active?<><div className={styles.caseHeader}><span className={styles.eyebrow}>{active.source==="support"?"SOPORTE VMV":"SERVICIO MARKETING"}</span>
      <h2>{active.title}</h2><span className={styles.badge}>{statuses[active.status]||active.status}</span></div>
      <div className={styles.thread}><div className={styles.original}><small>Solicitud original · {fmt(active.created_at)}</small><p>{active.description}</p></div>
       {messages.map(m=><div className={m.author_id===owner?styles.mine:styles.theirs} key={m.id}>
        <small>{m.author_id===owner?"Tú":"Equipo VMV"} · {fmt(m.created_at)}</small><p>{m.body}</p></div>)}
      </div>
      <div className={styles.composer}>{resolved?<p className={styles.readOnly}>Este caso está finalizado. Si necesitas más ayuda, abre un ticket nuevo.</p>:<>
       <textarea rows={3} maxLength={4000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escribe tu respuesta…" aria-label="Responder a VMV"/>
       <div className={styles.composeActions}><small>Los mensajes quedan en tu expediente.</small><button type="button" className={styles.primary} disabled={busy||!message.trim()} onClick={()=>void send()}><Send size={15}/>Enviar</button></div>
      </>}</div>
     </>:<div className={styles.empty}><MessageCircle size={33}/><h2>Tu conversación con VMV</h2><p>Abre una solicitud o crea un ticket de soporte para empezar.</p>
       <button type="button" className={styles.primary} onClick={()=>{setFormOpen(true);setMobile("detail");}}>Nuevo ticket <ChevronRight size={16}/></button></div>}
   </section>
  </div>}
  <footer className={styles.footer}><ShieldCheck size={15}/>Tus solicitudes son privadas. Los mensajes se guardan para el equipo; no se envía un SMS o email automático.</footer>
 </div></main>;
}