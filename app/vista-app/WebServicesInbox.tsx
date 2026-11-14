"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ArrowUpRight,Inbox,Mail,Phone,RefreshCw} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {INQUIRY_DETAIL_LABELS,safeReferenceLink,type InquiryDetailKey} from "@/lib/web-services-inquiries";
import styles from "./WebServicesInbox.module.css";

type Status="new"|"quoted"|"accepted"|"completed"|"archived";
type Inquiry={
 id:string;visitor_name:string;visitor_email:string|null;visitor_phone:string|null;
 service:string;message:string;details:Record<string,unknown>;status:Status;
 created_at:string;site_slug:string;
};
const stages:{value:Status;label:string}[]=[
 {value:"new",label:"Nuevo"},{value:"quoted",label:"Cotizado"},
 {value:"accepted",label:"Aceptado"},{value:"completed",label:"Completado"},
 {value:"archived",label:"Archivado"}
];
function formatTime(date:string){
 const parsed=new Date(date);
 return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat("es-US",{
  month:"short",day:"numeric",hour:"numeric",minute:"2-digit"
 }).format(parsed);
}
export default function WebServicesInbox({ownerId,onBack}:{ownerId:string;onBack:()=>void}){
 const [items,setItems]=useState<Inquiry[]>([]);
 const [counts,setCounts]=useState({new:0,total:0});
 const [loading,setLoading]=useState(true);
 const [busyId,setBusyId]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState<"new"|"all">("new");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const client=getSupabase();
   if(!client)throw new Error("Inicia sesión");
   const {data,error:authError}=await client.auth.getUser();
   if(authError||!data.user||data.user.id!==ownerId||data.user.is_anonymous)
    throw new Error("Inicia sesión nuevamente");
   const [result,totalResult,newResult]=await Promise.all([
    client.from("smartjob_web_inquiries")
     .select("id,visitor_name,visitor_email,visitor_phone,service,message,details,status,created_at,site_slug")
     .eq("owner_id",ownerId).order("created_at",{ascending:false}).limit(100),
    client.from("smartjob_web_inquiries").select("id",{count:"exact",head:true}).eq("owner_id",ownerId),
    client.from("smartjob_web_inquiries").select("id",{count:"exact",head:true}).eq("owner_id",ownerId).eq("status","new")
   ]);
   if(result.error||totalResult.error||newResult.error)throw new Error("No se pudieron cargar las solicitudes");
   setItems((result.data||[]) as Inquiry[]);
   setCounts({new:newResult.count||0,total:totalResult.count||0});
  }catch(e){setError(e instanceof Error?e.message:"No disponible");}
  finally{setLoading(false);}
 },[ownerId]);
 useEffect(()=>{void load();},[load]);
 async function changeStatus(id:string,status:Status){
  if(busyId)return;
  setBusyId(id);setError("");
  try{
   const client=getSupabase();
   if(!client)throw new Error("No disponible");
   const {data,error:authError}=await client.auth.getUser();
   if(authError||!data.user||data.user.id!==ownerId||data.user.is_anonymous)
    throw new Error("Inicia sesión nuevamente");
   const result=await client.from("smartjob_web_inquiries")
    .update({status,updated_at:new Date().toISOString()})
    .eq("id",id).eq("owner_id",ownerId).select("id,status").single();
   if(result.error||!result.data)throw new Error("No se pudo actualizar");
   const before=items.find(item=>item.id===id);
   setItems(previous=>previous.map(item=>item.id===id?{...item,status}:item));
   if(before&&(before.status==="new")!==(status==="new")){
    setCounts(previous=>({...previous,new:Math.max(0,previous.new+(status==="new"?1:-1))}));
   }
  }catch(e){setError(e instanceof Error?e.message:"Error al actualizar");}
  finally{setBusyId(null);}
 }
 const visible=filter==="new"?items.filter(item=>item.status==="new"):items;
 const newCount=counts.new;
 return <section className={styles.root} aria-label="Bandeja de solicitudes web">
  <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={16}/> Web Services</button>
  <div className={styles.heading}>
   <div><span>CLIENTES / WEB SERVICES</span><h2>Solicitudes<b>.</b></h2></div>
   <button type="button" className={styles.refresh} aria-label="Actualizar solicitudes" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/></button>
  </div>
  <div className={styles.stats}>
   <div><span>Nuevas</span><strong>{newCount}</strong></div>
   <div><span>Recibidas</span><strong>{counts.total}</strong></div>
  </div>
  <div className={styles.filters} role="group" aria-label="Filtrar solicitudes">
   <button type="button" aria-pressed={filter==="new"} className={filter==="new"?styles.active:""} onClick={()=>setFilter("new")}>Nuevas</button>
   <button type="button" aria-pressed={filter==="all"} className={filter==="all"?styles.active:""} onClick={()=>setFilter("all")}>Todas</button>
  </div>
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {loading?<p className={styles.empty}>Cargando…</p>:visible.length===0?<div className={styles.emptyState}>
   <Inbox size={27}/><strong>{filter==="new"?"Sin solicitudes nuevas":"Aún no hay solicitudes"}</strong>
  </div>:<div className={styles.cards}>
   {visible.map(item=>{
    const safeEmail=item.visitor_email&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item.visitor_email)?item.visitor_email:null;
    const digits=item.visitor_phone?.replace(/[^+\d]/g,"")||"";
    const safePhone=/^\+?\d{7,15}$/.test(digits)?digits:null;
    const extras=Object.entries(item.details||{}).filter(([key,value])=>
     Object.prototype.hasOwnProperty.call(INQUIRY_DETAIL_LABELS,key)&&typeof value==="string"&&value.trim()
    ) as [InquiryDetailKey,string][];
    return <article className={styles.card} key={item.id}>
     <div className={styles.cardTop}>
      <div><strong className={styles.person}>{item.visitor_name}</strong><span className={styles.date}>{formatTime(item.created_at)}</span></div>
      <span className={styles.stage} data-status={item.status}>{stages.find(s=>s.value===item.status)?.label||"Nuevo"}</span>
     </div>
     {item.service?<div className={styles.service}>{item.service}</div>:null}
     {item.message?<p className={styles.message}>{item.message}</p>:null}
     {extras.length?<dl className={styles.details}>
      {extras.map(([key,value])=><div key={key}><dt>{INQUIRY_DETAIL_LABELS[key]}</dt>
       <dd>{key==="referenceLink"&&safeReferenceLink(value)?
        <a href={safeReferenceLink(value)||"#"} target="_blank" rel="noopener noreferrer">Ver referencia <ArrowUpRight size={12}/></a>:value}</dd>
      </div>)}
     </dl>:null}
     <div className={styles.contacts}>
      {safeEmail?<a href={"mailto:"+safeEmail}><Mail size={14}/> Correo</a>:null}
      {safePhone?<a href={"tel:"+safePhone}><Phone size={14}/> Llamar</a>:null}
     </div>
     <label className={styles.statusSelector}><span>Estado</span>
      <select value={item.status} disabled={busyId===item.id} aria-label={"Estado de "+item.visitor_name}
       onChange={e=>void changeStatus(item.id,e.target.value as Status)}>
       {stages.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
     </label>
    </article>;
   })}
  </div>}
 </section>;
}
