"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {
 ArrowLeft,ArrowRight,ArrowUpRight,Bell,Bot,BriefcaseBusiness,CalendarClock,
 Check,CheckCheck,CheckCircle2,ChevronDown,ChevronRight,ClipboardCheck,Clock3,
 CreditCard,ExternalLink,FileClock,FileText,FilterX,Globe2,Headphones,
 Inbox,LayoutDashboard,LockKeyhole,MessageCircle,MessageSquare,MoreHorizontal,
 PhoneCall,Plus,RefreshCw,Search,Send,Settings2,ShieldCheck,SlidersHorizontal,
 Sparkles,TriangleAlert,UserRound,UserRoundCog,Users,Wallet, X
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./console.module.css";

type Source="marketing"|"support"|"provisioning"|"domain";
type Section="home"|"inbox"|"clients"|"services"|"team"|"settings";
type Pane="list"|"detail"|"context";
type CaseRow={
 source:Source;id:string;owner_id:string;title:string;client_name:string;
 service:string;status:string;description:string;created_at:string;updated_at:string;
 priority:"low"|"normal"|"high"|"urgent";assigned_to:string|null;due_at:string|null;amount:number|null;
};
type Operator={user_id:string;role:"admin"|"agent";name?:string;granted_at?:string};
type Message={id:string;author_id:string;kind:"message"|"internal_note";body:string;created_at:string};
type Detail={case:CaseRow;record:Record<string,unknown>;meta:Record<string,unknown>|null;
 messages:Message[];profile:Record<string,unknown>|null;
 acceptances:{quote_revision:number;quoted_price_cents:number;accepted_at:string}[]};
type Client={id:string;first_name:string|null;last_name:string|null;business_name:string|null;display_name:string;phone:string|null;website_url:string|null;city:string|null;state:string|null;created_at:string;billing:{plan_code:string;status:string;stripe_mode:string}|null};
type Billing={user_id:string;plan_code:string;status:string;stripe_mode:string;current_period_end:string|null;included_minutes:number;used_minutes:number;reserved_minutes:number;rollover_minutes:number;topup_minutes:number;updated_at:string};
type StaffPayload={staff:Operator[];canManage:boolean};
type BillingPayload={accounts:Billing[];failures:{bridge_sid:string;owner_id:string;status:string;error_code:string;started_at:string}[];failureCount:number;note:string};
type SettingsPayload={settings:{key:string;value:Record<string,unknown>;updated_at:string}[]};
type ClientPayload={clients:Client[];total:number;truncated:boolean};
type Overview={role:"admin"|"agent";cases:CaseRow[];staff:Operator[];total:number;truncated:boolean;
 failedCalls30d:number|null;sources:Record<Source,number>};

const uuid=(value:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const sources:{id:Source;label:string;Icon:LucideIcon;description:string}[]=[
 {id:"support",label:"Soporte",Icon:Headphones,description:"Atención a clientes de VMV"},
 {id:"marketing",label:"Marketing",Icon:Sparkles,description:"Trabajos y cotizaciones"},
 {id:"provisioning",label:"Líneas",Icon:PhoneCall,description:"Solicitudes de telefonía"},
 {id:"domain",label:"Dominios",Icon:Globe2,description:"Registro y conexión"}
];
const serviceLabels:Record<string,string>={
 general:"General",marketing:"Marketing",web_services:"Web Services",smart_call:"Smart Call",
 ai_agents:"AI Agents",billing:"Facturación",company_formation:"Crear compañía",
 other:"Otro servicio",google_profile:"Perfil de Google",directory_listings:"Directorios",
 apple_maps:"Apple Maps",bing_places:"Bing Places",yelp_profile:"Yelp",
 seo_improvement:"Mejora web",search_console:"Search Console",campaign_setup:"Campañas",
 review_strategy:"Reputación",domain:"Dominios"
};
const labels:Record<string,string>={
 received:"Recibida",quoted:"Cotizada",approved:"Aprobada",in_progress:"En progreso",
 needs_customer:"Esperando al cliente",verified:"Verificada",cancelled:"Cancelada",
 new:"Nueva",resolved:"Resuelta",closed:"Cerrada",pending:"Pendiente",
 contacted:"Contactado",activated:"Activada",active:"Activa",
 paid:"Pagado",test:"Prueba",live:"Real",
 low:"Baja",normal:"Normal",high:"Alta",urgent:"Urgente"
};
const statusLabel=(s:string)=>labels[s]||s.replaceAll("_"," ");
const serviceLabel=(s:string)=>serviceLabels[s]||s.replaceAll("_"," ");
const sourceLabel=(s:Source)=>sources.find(v=>v.id===s)?.label||s;
const isDone=(s:string)=>["closed","resolved","cancelled","verified","activated","completed"].includes(s);
const isWaiting=(s:string)=>["needs_customer","quoted"].includes(s);
const isNew=(s:string)=>["new","received","pending"].includes(s);
const formatDate=(value:string|null|undefined)=>{
 if(!value||!Number.isFinite(Date.parse(value)))return "—";
 return new Intl.DateTimeFormat("es-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
};
const dollars=(v:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(v/100);
const safeLink=(value:unknown)=>{
 if(typeof value!=="string")return null;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname?u.toString():null;}
 catch{return null;}
};
const caseKey=(c:CaseRow)=>c.source+":"+c.id;
const shortRef=(c:CaseRow)=>({marketing:"MKT",support:"SUP",provisioning:"TEL",domain:"DOM"}[c.source])+"-"+c.id.slice(0,8).toUpperCase();
const detailText=(v:unknown)=>typeof v==="string"?v:typeof v==="number"?String(v):typeof v==="boolean"?(v?"Sí":"No"):"—";
const metadataLabels:Record<string,string>={
 googleCategory:"Categoría de Google",kind:"Tipo de negocio",phone:"Teléfono",street:"Dirección",
 unit:"Unidad",city:"Ciudad",region:"Estado / región",postal:"Código postal",
 serviceAreas:"Zonas de servicio",description:"Descripción",services:"Servicios",products:"Productos",
 website:"Sitio web",businessName:"Nombre comercial",email:"Correo",ownerEmail:"Correo del titular",
 platform:"Plataforma",otherPlatform:"Otra plataforma",repositoryHost:"Alojamiento",
 repositoryUrl:"Repositorio",requestRepair:"Solicita reparación",mode:"Modalidad",
 reviewText:"Reseña",replyText:"Respuesta propuesta",reviewLink:"Enlace de reseñas",
 goal:"Objetivo",state:"Estado",industry:"Sector"
};
const activeClass=(enabled:boolean,yes:string,no:string)=>enabled?yes:no;

export default function AdminConsole(){
 const [phase,setPhase]=useState<"checking"|"ready"|"signed_out"|"forbidden"|"unconfigured"|"error">("checking");
 const [section,setSection]=useState<Section>("home");
 const [overview,setOverview]=useState<Overview|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [pane,setPane]=useState<Pane>("list");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const [sourceFilter,setSourceFilter]=useState<Source|"all">("all");
 const [stateFilter,setStateFilter]=useState<"all"|"new"|"working"|"waiting"|"done">("all");
 const [priorityFilter,setPriorityFilter]=useState("all");
 const [assigneeFilter,setAssigneeFilter]=useState("all");
 const [serviceFilter,setServiceFilter]=useState("all");
 const [clientFilter,setClientFilter]=useState<string|null>(null);
 const [order,setOrder]=useState<"updated"|"oldest">("updated");
 const [draftMessage,setDraftMessage]=useState("");
 const [messageKind,setMessageKind]=useState<"message"|"internal_note">("message");
 const [stage,setStage]=useState("");
 const [stageNote,setStageNote]=useState("");
 const [proof,setProof]=useState("");
 const [amount,setAmount]=useState("");
 const [quoteNote,setQuoteNote]=useState("");
 const [assignee,setAssignee]=useState("");
 const [priority,setPriority]=useState("normal");
 const [dueAt,setDueAt]=useState("");
 const [detailTab,setDetailTab]=useState<"conversation"|"request">("conversation");
 const [clients,setClients]=useState<ClientPayload|null>(null);
 const [team,setTeam]=useState<StaffPayload|null>(null);
 const [billing,setBilling]=useState<BillingPayload|null>(null);
 const [settings,setSettings]=useState<SettingsPayload|null>(null);
 const [staffId,setStaffId]=useState("");
 const [staffRole,setStaffRole]=useState<"agent"|"admin">("agent");
 const [slaDays,setSlaDays]=useState("3");
 const [welcome,setWelcome]=useState("");
 const [clientSearch,setClientSearch]=useState("");

 const api=useCallback(async<T,>(view:string,post?:Record<string,unknown>):Promise<T>=>{
  const client=getSupabase();
  if(!client)throw Error("No se encuentra configurada la conexión.");
  const {data,error:sessionError}=await client.auth.getSession();
  if(sessionError||!data.session?.access_token)throw Error("Debes iniciar sesión de nuevo.");
  const response=await fetch("/api/admin"+(post?"":"?"+view),{
   method:post?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+data.session.access_token,...(post?{"Content-Type":"application/json"}:{})},
   ...(post?{body:JSON.stringify(post)}:{})
  });
  const result=await response.json().catch(()=>({error:"Respuesta inválida."}));
  if(!response.ok)throw Object.assign(Error(result.error||"No se completó la operación."),{status:response.status});
  return result as T;
 },[]);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const data=await api<Overview>("view=overview");
   setOverview(data);setPhase("ready");setError("");
  }catch(e){
   const code=(e as {status?:number}).status;
   if(code===401)setPhase("signed_out");
   else if(code===403)setPhase("forbidden");
   else {setError(e instanceof Error?e.message:"No se pudo actualizar.");setPhase(p=>p==="checking"?"error":p);}
  }finally{setLoading(false);}
 },[api]);
 useEffect(()=>{
  const db=getSupabase();
  if(!db){setPhase("unconfigured");return;}
  let active=true;
  const unsubscribe=db.auth.onAuthStateChange(event=>{
   if(event==="SIGNED_OUT"&&active){setPhase("signed_out");setOverview(null);setDetail(null);}
   if(event==="SIGNED_IN"&&active)queueMicrotask(()=>{if(active)void refresh();});
  });
  void refresh();
  return()=>{active=false;unsubscribe.data.subscription.unsubscribe();};
 },[refresh]);
 const loadDetail=useCallback(async(c:CaseRow)=>{
  setDetail(null);setDetailTab("conversation");setError("");
  try{
   const r=await api<Detail>("view=detail&source="+c.source+"&id="+encodeURIComponent(c.id));
   setDetail(r);
   setStage(String(r.record.status||""));
   setStageNote(String(r.record.staff_update||""));
   setProof(String(r.record.evidence_url||""));
   setAmount(typeof r.record.quoted_price_cents==="number"?(r.record.quoted_price_cents/100).toFixed(2):"");
   setQuoteNote(String(r.record.quote_note||""));
   setAssignee(String(r.meta?.assigned_to||""));
   setPriority(String(r.meta?.priority||"normal"));
   setDueAt(typeof r.meta?.due_at==="string"?new Date(r.meta.due_at).toISOString().slice(0,16):"");
   setDraftMessage("");setMessageKind(c.source==="marketing"||c.source==="support"?"message":"internal_note");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar el caso.");}
 },[api]);
 const choose=useCallback((c:CaseRow)=>{
  const key=caseKey(c);
  setSelected(key);setPane("detail");setSection("inbox");setNotice("");
  const u=new URL(window.location.href);u.searchParams.set("source",c.source);u.searchParams.set("id",c.id);
  window.history.replaceState(null,"",u.pathname+u.search);
  void loadDetail(c);
 },[loadDetail]);
 useEffect(()=>{
  if(phase!=="ready"||!overview)return;
  const q=new URL(window.location.href).searchParams,s=q.get("source"),id=q.get("id");
  if(!selected&&id&&uuid(id)&&sources.some(x=>x.id===s)){
   const c=overview.cases.find(c=>c.id===id&&c.source===s);
   if(c)queueMicrotask(()=>choose(c));
  }
 },[phase,overview,selected,choose]);
 const loadSecondary=useCallback(async(next:Section)=>{
  try{
   if(next==="clients"&&!clients)setClients(await api<ClientPayload>("view=clients"));
   if(next==="team"&&!team)setTeam(await api<StaffPayload>("view=team"));
   if(next==="services"&&!billing&&overview?.role==="admin")setBilling(await api<BillingPayload>("view=billing"));
   if(next==="settings"&&!settings&&overview?.role==="admin"){
    const data=await api<SettingsPayload>("view=settings");setSettings(data);
    const defaults=data.settings.find(s=>s.key==="support_defaults")?.value;
    if(defaults){setSlaDays(String(defaults.sla_days||3));setWelcome(String(defaults.welcome_message||""));}
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la sección.");}
 },[api,clients,team,billing,settings,overview?.role]);
 const navigate=(s:Section)=>{
  setSection(s);setNotice("");setError("");
  if(s==="inbox")setPane("list");
  if(s!=="inbox"){
   setSelected(null);setDetail(null);
   const u=new URL(window.location.href);u.searchParams.delete("source");u.searchParams.delete("id");
   window.history.replaceState(null,"",u.pathname+u.search);
  }
  void loadSecondary(s);
 };
 const perform=async(payload:Record<string,unknown>,success:string,afterDetail=true)=>{
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api<{ok:boolean;audited?:boolean;notificationSent?:boolean}>("",payload);
   if(afterDetail&&detail){
    const r=await api<Detail>("view=detail&source="+detail.case.source+"&id="+detail.case.id);
    setDetail(r);
    setStage(String(r.record.status||""));
    setStageNote(String(r.record.staff_update||""));
    setProof(String(r.record.evidence_url||""));
    setAmount(typeof r.record.quoted_price_cents==="number"?(r.record.quoted_price_cents/100).toFixed(2):"");
    setQuoteNote(String(r.record.quote_note||""));
    setAssignee(String(r.meta?.assigned_to||""));
    setPriority(String(r.meta?.priority||"normal"));
    setDueAt(typeof r.meta?.due_at==="string"?new Date(r.meta.due_at).toISOString().slice(0,16):"");
   }
   const updated=await api<Overview>("view=overview");setOverview(updated);
   setNotice(success+(result.audited===false?" · La bitácora no pudo confirmarse.":""));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const send=async()=>{
  if(!detail||!draftMessage.trim())return;
  await perform({action:"send_message",source:detail.case.source,id:detail.case.id,message:draftMessage.trim(),kind:messageKind},
   messageKind==="internal_note"?"Nota interna guardada.":"Mensaje guardado. El cliente podrá leerlo en su portal; no se envió una alerta externa.");
  setDraftMessage("");
 };
 const saveMeta=async()=>{
  if(!detail)return;
  await perform({action:"set_meta",source:detail.case.source,id:detail.case.id,
   assigned_to:assignee||null,priority,due_at:dueAt?new Date(dueAt).toISOString():null},"Responsable, prioridad y fecha guardados.");
 };
 const saveState=async()=>{
  if(!detail)return;
  const source=detail.case.source;
  if(source==="support"){
   await perform({action:"update_ticket",source,id:detail.case.id,status:stage},"Estado de soporte actualizado.");
  }else if(source==="marketing"){
   await perform({action:"update_marketing",source,id:detail.case.id,updated_at:detail.record.updated_at,
    operation:"status",status:stage,note:stageNote,evidence_url:proof},"Estado de Marketing actualizado en la solicitud original.");
  }
 };
 const saveQuote=async()=>{
  if(!detail||detail.case.source!=="marketing")return;
  if(!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())){setError("Introduce un importe válido con hasta dos decimales.");return;}
  const cents=Math.round(Number(amount)*100);
  await perform({action:"update_marketing",source:"marketing",id:detail.case.id,
   updated_at:detail.record.updated_at,operation:"quote",amount_cents:cents,quote_note:quoteNote},
   "Presupuesto registrado. Requiere aprobación del cliente; no se realizó ningún cobro.");
 };
 const refreshCurrent=async()=>{
  await refresh();
  if(detail)await loadDetail(detail.case);
  if(section==="clients"){setClients(null);try{setClients(await api<ClientPayload>("view=clients"));}catch{}}
  if(section==="team"){setTeam(null);try{setTeam(await api<StaffPayload>("view=team"));}catch{}}
  if(section==="services"&&overview?.role==="admin"){setBilling(null);try{setBilling(await api<BillingPayload>("view=billing"));}catch{}}
 };
 const caseRows=overview?.cases||[];
 const operators=overview?.staff||[];
 const visible=useMemo(()=>caseRows.filter(c=>{
  if(sourceFilter!=="all"&&c.source!==sourceFilter)return false;
  if(clientFilter&&c.owner_id!==clientFilter)return false;
  if(serviceFilter!=="all"&&c.service!==serviceFilter)return false;
  if(priorityFilter!=="all"&&c.priority!==priorityFilter)return false;
  if(assigneeFilter==="unassigned"&&c.assigned_to!==null)return false;
  if(assigneeFilter!=="all"&&assigneeFilter!=="unassigned"&&c.assigned_to!==assigneeFilter)return false;
  if(stateFilter==="new"&&!isNew(c.status))return false;
  if(stateFilter==="working"&&!(["in_progress","approved","contacted"].includes(c.status)))return false;
  if(stateFilter==="waiting"&&!isWaiting(c.status))return false;
  if(stateFilter==="done"&&!isDone(c.status))return false;
  const q=search.trim().toLowerCase();
  return !q||[c.title,c.description,c.client_name,c.service,c.id].some(x=>x.toLowerCase().includes(q));
 }).sort((a,b)=>order==="oldest"?Date.parse(a.created_at)-Date.parse(b.created_at):
  Date.parse(b.updated_at)-Date.parse(a.updated_at)),[caseRows,sourceFilter,clientFilter,serviceFilter,priorityFilter,assigneeFilter,stateFilter,search,order]);
 const selectedRow=caseRows.find(c=>caseKey(c)===selected)||null;
 const servicesInUse=[...new Set(caseRows.map(c=>c.service))].sort();
 const counts={
  new:caseRows.filter(c=>isNew(c.status)).length,
  unassigned:caseRows.filter(c=>!c.assigned_to&&!isDone(c.status)).length,
  progress:caseRows.filter(c=>["approved","in_progress","contacted"].includes(c.status)).length,
  waiting:caseRows.filter(c=>isWaiting(c.status)).length,
  soon:caseRows.filter(c=>!isDone(c.status)&&c.due_at&&Date.parse(c.due_at)<Date.now()+48*3600000).length,
  alerts:overview?.failedCalls30d??null
 };
 const openInbox=(opts?:{state?:"new"|"working"|"waiting"|"done";assignee?:string;source?:Source})=>{
  setStateFilter(opts?.state||"all");setAssigneeFilter(opts?.assignee||"all");setSourceFilter(opts?.source||"all");
  setClientFilter(null);navigate("inbox");
 };
 const stats:{title:string;value:number|null;hint:string;Icon:LucideIcon;call:()=>void}[]=[
  {title:"Nuevos",value:counts.new,hint:"Por revisar",Icon:Inbox,call:()=>openInbox({state:"new"})},
  {title:"Sin asignar",value:counts.unassigned,hint:"Necesitan responsable",Icon:UserRound,call:()=>openInbox({assignee:"unassigned"})},
  {title:"En progreso",value:counts.progress,hint:"Trabajo del equipo",Icon:ClipboardCheck,call:()=>openInbox({state:"working"})},
  {title:"Esperando cliente",value:counts.waiting,hint:"Aguardan respuesta o aprobación",Icon:MessageCircle,call:()=>openInbox({state:"waiting"})},
  {title:"Próximos o vencidos",value:counts.soon,hint:"Plazo menor de 48 horas",Icon:CalendarClock,call:()=>openInbox()},
  {title:"Fallos de llamadas",value:counts.alerts,hint:"Con código de error · 30 días",Icon:TriangleAlert,call:()=>navigate("services")}
 ];
 const nav:{id:Section;title:string;Icon:LucideIcon}[]=[
  {id:"home",title:"Inicio",Icon:LayoutDashboard},{id:"inbox",title:"Bandeja",Icon:Inbox},
  {id:"clients",title:"Clientes",Icon:Users},{id:"services",title:"Servicios",Icon:BriefcaseBusiness},
  {id:"team",title:"Equipo",Icon:UserRoundCog},{id:"settings",title:"Configuración",Icon:Settings2}
 ];
 const revoke=async(userId:string,nextRole:"admin"|"agent"|"remove")=>{
  if(!window.confirm(nextRole==="remove"?"¿Revocar el acceso administrativo de este operador?":"¿Modificar los permisos de este operador?"))return;
  setBusy(true);setError("");
  try{
   await api("",{action:"set_staff",user_id:userId,role:nextRole});
   setTeam(await api<StaffPayload>("view=team"));
   setOverview(await api<Overview>("view=overview"));setNotice("Permiso actualizado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo modificar el operador.");}
  finally{setBusy(false);}
 };
 const addStaff=async()=>{
  if(!uuid(staffId)){setError("Introduce el UUID de una cuenta VMV verificada.");return;}
  await revoke(staffId,staffRole);
  setStaffId("");
 };
 const saveSettings=async()=>{
  setBusy(true);setError("");
  try{
   await api("",{action:"update_settings",sla_days:Number(slaDays),welcome_message:welcome});
   setSettings(await api<SettingsPayload>("view=settings"));setNotice("Configuración guardada.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la configuración.");}
  finally{setBusy(false);}
 };
 const showMedia=async(path:string)=>{
  if(!detail)return;
  try{
   const data=await api<{url:string}>("view=media&id="+encodeURIComponent(detail.case.id)+"&path="+encodeURIComponent(path));
   const u=safeLink(data.url);
   if(!u)throw Error("Enlace no válido.");
   window.open(u,"_blank","noopener,noreferrer");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir la imagen.");}
 };

 if(phase!=="ready")return <main className={styles.gate}><div className={styles.gateCard}>
  <span className={styles.gateIcon}><LockKeyhole size={24}/></span>
  <p className={styles.eyebrow}>VMV BUSINESS / ADMIN WEB</p>
  <h1>{phase==="checking"?"Verificando tu acceso…":phase==="signed_out"?"Inicia sesión":
   phase==="forbidden"?"Acceso restringido":phase==="unconfigured"?"Sistema no configurado":"No se pudo conectar"}</h1>
  <p>{phase==="forbidden"?"Tu cuenta necesita el permiso de operador interno.":
   phase==="signed_out"?"Inicia sesión en tu cuenta VMV y regresa al panel.":
   phase==="error"?"Revisa la conexión o actualiza la página.":phase==="unconfigured"?"Falta la conexión a Supabase.":"Comprobando identidad y permisos de tu cuenta."}</p>
  <div className={styles.flex}><a href="/vista-app" className={styles.secondary}>Ir a VMV Business</a>
   <button type="button" className={styles.primary} onClick={()=>void refresh()}>Reintentar <RefreshCw size={15}/></button></div>
 </div></main>;

 return <div className={styles.shell}>
  <aside className={styles.sidebar}>
   <a href="/vista-app" className={styles.brand}><span className={styles.brandMark}>V</span><span><b>VMV Business</b><small>ADMIN WORKSPACE</small></span></a>
   <span className={styles.navCaption}>ESPACIO DE TRABAJO</span>
   <nav aria-label="Administración de VMV">
    {nav.map(item=><button type="button" key={item.id} className={section===item.id?styles.navOn:styles.nav}
     aria-current={section===item.id?"page":undefined} onClick={()=>navigate(item.id)} title={item.title}>
     <item.Icon size={19}/><span>{item.title}</span>
     {item.id==="inbox"&&counts.new>0?<small>{counts.new}</small>:null}</button>)}
   </nav>
   <div className={styles.sidebarBottom}><div className={styles.avatar}>V</div><div><strong>Equipo VMV</strong><span>{overview?.role==="admin"?"Administrador":"Operador"}</span></div><ShieldCheck size={16}/></div>
  </aside>
  <main className={styles.main}>
   <header className={styles.header}>
    <div><p className={styles.eyebrow}>VMV / OPERACIONES</p><h1>{({home:"Centro de operaciones",inbox:"Bandeja de trabajo",clients:"Clientes",services:"Servicios",team:"Equipo",settings:"Configuración"} as Record<Section,string>)[section]}</h1>
     <p className={styles.subtitle}>{({home:"Todo lo importante, sin ruido.",inbox:"Una sola vista para los trabajos de VMV.",clients:"Cuentas y relaciones de servicio.",services:"Estado de los servicios de la plataforma.",team:"Responsables, permisos y colaboración.",settings:"Preferencias de operación y seguridad."} as Record<Section,string>)[section]}</p></div>
    <div className={styles.headerActions}><span className={styles.mode}><span className={styles.greenDot}/> Acceso interno</span>
     <button aria-label="Actualizar datos" type="button" className={styles.iconButton} disabled={loading||busy} onClick={()=>void refreshCurrent()}><RefreshCw size={18} className={loading?styles.spin:""}/></button></div>
   </header>
   {error?<div className={styles.alert} role="alert"><TriangleAlert size={17}/><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Cerrar error"><X size={15}/></button></div>:null}
   {notice?<div className={styles.notice} role="status"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Cerrar aviso"><X size={15}/></button></div>:null}
   {overview?.truncated?<p className={styles.warning}>La bandeja muestra un máximo de 150 casos por categoría (100 en líneas y dominios). Los totales provienen del servidor; los filtros y tarjetas actúan sobre la muestra visible.</p>:null}

   {section==="home"?<>
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>EN ESTE MOMENTO</span><h2>Prioridades del equipo</h2></div>
     <button type="button" className={styles.textButton} onClick={()=>openInbox()}>Ver bandeja <ArrowUpRight size={16}/></button></div>
    <div className={styles.statGrid}>{stats.map(({title,value,hint,Icon,call})=><button type="button" key={title} className={styles.stat} onClick={call}>
      <div className={styles.statTop}><span className={styles.statIcon}><Icon size={20}/></span><ArrowUpRight size={17}/></div>
      <span>{title}</span><strong>{value===null?"—":value}</strong><small>{hint}</small>
    </button>)}</div>
    <div className={styles.homeGrid}>
     <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>ACTIVIDAD</span><h3>Solicitudes recientes</h3></div><button type="button" className={styles.textButton} onClick={()=>openInbox()}>Ver todas <ChevronRight size={15}/></button></div>
      {caseRows.length?caseRows.slice(0,6).map(c=><button type="button" key={caseKey(c)} className={styles.recent} onClick={()=>choose(c)}>
       <div className={styles.recentIcon}>{c.source==="marketing"?<Sparkles size={17}/>:c.source==="support"?<Headphones size={17}/>:c.source==="domain"?<Globe2 size={17}/>:<PhoneCall size={17}/>}</div>
       <div><strong>{c.title}</strong><small>{sourceLabel(c.source)} · {c.client_name}</small></div>
       <span className={styles.chip} data-status={c.status}>{statusLabel(c.status)}</span>
      </button>):<div className={styles.blank}>Todavía no hay casos.</div>}
     </section>
     <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>POR SERVICIO</span><h3>Entradas registradas</h3></div></div>
      {sources.map(s=><button key={s.id} type="button" className={styles.serviceLine} onClick={()=>openInbox({source:s.id})}>
       <span className={styles.serviceIcon}><s.Icon size={18}/></span><span><strong>{s.label}</strong><small>{s.description}</small></span>
       <b>{overview?.sources[s.id]||0}</b><ChevronRight size={16}/></button>)}
     </section>
    </div>
   </>:null}

   {section==="inbox"?<>
    <div className={styles.filters}>
     <label className={styles.search}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, asunto, referencia…" aria-label="Buscar casos"/></label>
     <select aria-label="Tipo de caso" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value as Source|"all")}><option value="all">Todos los tipos</option>{sources.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
     <select aria-label="Estado" value={stateFilter} onChange={e=>setStateFilter(e.target.value as typeof stateFilter)}><option value="all">Todos los estados</option><option value="new">Nuevos</option><option value="working">En progreso</option><option value="waiting">Esperando cliente</option><option value="done">Finalizados</option></select>
     <select aria-label="Servicio" value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}><option value="all">Todos los servicios</option>{servicesInUse.map(v=><option key={v} value={v}>{serviceLabel(v)}</option>)}</select>
     <select aria-label="Prioridad" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="all">Todas las prioridades</option>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{statusLabel(v)}</option>)}</select>
     <select aria-label="Responsable" value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}><option value="all">Todos los responsables</option><option value="unassigned">Sin asignar</option>{operators.map(o=><option key={o.user_id} value={o.user_id}>{o.user_id===operators[0]?.user_id?"Operador "+o.user_id.slice(0,6):o.user_id.slice(0,8)}</option>)}</select>
     <select aria-label="Orden" value={order} onChange={e=>setOrder(e.target.value as typeof order)}><option value="updated">Actividad reciente</option><option value="oldest">Más antiguos</option></select>
     {(search||clientFilter||sourceFilter!=="all"||stateFilter!=="all"||serviceFilter!=="all"||priorityFilter!=="all"||assigneeFilter!=="all")?
      <button type="button" className={styles.clear} onClick={()=>{setSearch("");setClientFilter(null);setSourceFilter("all");setStateFilter("all");setServiceFilter("all");setPriorityFilter("all");setAssigneeFilter("all");}}><FilterX size={15}/>Limpiar</button>:null}
    </div>
    <div className={styles.inboxGrid} data-pane={pane}>
     <section className={styles.caseList}>
      <div className={styles.paneHead}><strong>Bandeja</strong><span>{visible.length} casos</span></div>
      <div className={styles.caseScroll}>{visible.length?visible.map(c=><button type="button" key={caseKey(c)} aria-pressed={selected===caseKey(c)}
       className={selected===caseKey(c)?styles.caseOn:styles.case} onClick={()=>choose(c)}>
       <div className={styles.caseTop}><span className={styles.caseSource}>{sourceLabel(c.source)} · {serviceLabel(c.service)}</span><time>{formatDate(c.updated_at)}</time></div>
       <strong>{c.title}</strong><span className={styles.casePreview}>{c.description}</span>
       <div className={styles.caseBottom}><span className={styles.chip} data-status={c.status}>{statusLabel(c.status)}</span><small>{shortRef(c)}</small></div>
       <div className={styles.caseCustomer}><UserRound size={12}/>{c.client_name}{c.priority==="high"||c.priority==="urgent"?<span className={styles.urgent}>{statusLabel(c.priority)}</span>:null}</div>
      </button>):<div className={styles.blank}><Inbox size={26}/>No hay casos con esos filtros.</div>}</div>
     </section>
     <section className={styles.caseDetail}>
      {detail&&selectedRow?<><div className={styles.paneHead}>
        <button type="button" className={styles.backMobile} onClick={()=>setPane("list")}><ArrowLeft size={17}/>Bandeja</button>
        <strong>{shortRef(selectedRow)}</strong><button className={styles.contextMobile} type="button" onClick={()=>setPane("context")}>Información <ChevronRight size={16}/></button>
       </div>
       <div className={styles.detailHeader}><p className={styles.eyebrow}>{sourceLabel(selectedRow.source).toUpperCase()} / {serviceLabel(selectedRow.service).toUpperCase()}</p>
        <h2>{detail.case.title}</h2><div className={styles.flex}><span className={styles.chip} data-status={detail.case.status}>{statusLabel(detail.case.status)}</span><span className={styles.smallMuted}>{formatDate(detail.case.created_at)}</span></div>
       </div>
       <div className={styles.detailTabs}><button type="button" aria-pressed={detailTab==="conversation"} className={detailTab==="conversation"?styles.tabOn:styles.tab} onClick={()=>setDetailTab("conversation")}><MessageSquare size={15}/>Conversación</button>
        <button type="button" aria-pressed={detailTab==="request"} className={detailTab==="request"?styles.tabOn:styles.tab} onClick={()=>setDetailTab("request")}><FileText size={15}/>Solicitud y acciones</button></div>
       {detailTab==="conversation"?<div className={styles.conversation}>
        <div className={styles.initialMessage}><span className={styles.messageAvatar}><UserRound size={17}/></span><div><small>Solicitud original · {formatDate(detail.case.created_at)}</small>
         <p>{detail.case.description}</p></div></div>
        {detail.messages.map(m=><div key={m.id} className={m.kind==="internal_note"?styles.internalMessage:styles.message}>
          <div className={styles.messageHeading}><strong>{m.kind==="internal_note"?"Nota interna":m.author_id===detail.case.owner_id?"Cliente":"Equipo VMV"}</strong><span>{formatDate(m.created_at)}</span></div>
          <p>{m.body}</p>{m.kind==="internal_note"?<small><LockKeyhole size={12}/> No visible para el cliente</small>:null}
        </div>)}
        <div className={styles.composer}><div className={styles.composerModes}>
         <button type="button" aria-pressed={messageKind==="message"} disabled={!["marketing","support"].includes(detail.case.source)} className={messageKind==="message"?styles.modeOn:styles.modeButton} onClick={()=>setMessageKind("message")}>Mensaje al cliente</button>
         <button type="button" aria-pressed={messageKind==="internal_note"} className={messageKind==="internal_note"?styles.modeOn:styles.modeButton} onClick={()=>setMessageKind("internal_note")}>Nota interna</button>
        </div><textarea value={draftMessage} onChange={e=>setDraftMessage(e.target.value)} maxLength={4000} rows={3} placeholder={messageKind==="internal_note"?"Anota algo para el equipo…":"Escribe una respuesta que el cliente verá en su portal…"} aria-label="Nuevo mensaje"/>
        <div className={styles.composerFooter}><small>{messageKind==="message"?"Visible en el portal. No se envía SMS ni email automáticamente.":"Solo para operadores de VMV."}</small>
         <button type="button" className={styles.primary} onClick={()=>void send()} disabled={busy||!draftMessage.trim()}><Send size={15}/>Guardar</button></div></div>
       </div>:<div className={styles.detailContent}><div className={styles.detailBox}><h3>Necesidad del cliente</h3><p>{detail.case.description}</p></div>
        {detail.case.source==="marketing"?<><div className={styles.detailBox}>
          <h3>Presupuesto</h3><p>{typeof detail.record.quoted_price_cents==="number"?dollars(detail.record.quoted_price_cents):"Todavía sin cotizar."}</p>
          {typeof detail.record.quote_note==="string"?<p>{detail.record.quote_note}</p>:null}
          {detail.acceptances.some(a=>a.quote_revision===detail.record.quote_revision&&a.quoted_price_cents===detail.record.quoted_price_cents)?
           <span className={styles.approved}><Check size={14}/>Aprobación vigente registrada</span>:null}
          {["received","quoted","needs_customer"].includes(String(detail.record.status))?<div className={styles.actionBox}>
           <label>Importe en USD<input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label>
           <label>Alcance y condiciones<textarea value={quoteNote} maxLength={1500} rows={3} onChange={e=>setQuoteNote(e.target.value)} placeholder="Incluye…"/></label>
           <button type="button" className={styles.primary} disabled={busy||quoteNote.trim().length<8||!amount} onClick={()=>void saveQuote()}><Wallet size={16}/>Guardar cotización</button>
          </div>:null}</div>
          <MarketingDetails record={detail.record} onMedia={path=>void showMedia(path)}/>
         </>:null}
        {detail.case.source==="provisioning"?<div className={styles.detailBox}><h3>Solicitud de línea</h3>
         <dl className={styles.dataList}>{["carrier","connection_mode","answer_method","customer_language","owner_language","phone_verified_at"].map(k=><div key={k}><dt>{k.replaceAll("_"," ")}</dt><dd>{detailText(detail.record[k])}</dd></div>)}</dl>
         <p className={styles.info}>La activación o compra de líneas se realiza únicamente desde el flujo telefónico autorizado, nunca desde este panel.</p></div>:null}
        {detail.case.source==="domain"?<div className={styles.detailBox}><h3>Solicitud de dominio</h3>
         <p>{detailText(detail.record.hostname)}</p><p>Tipo: {detailText(detail.record.intent)} · Estado: {statusLabel(detail.case.status)}</p>
         <p className={styles.info}>La compra, DNS y publicación necesitan confirmación del proveedor y autorización del titular.</p></div>:null}
        {["marketing","support"].includes(detail.case.source)?<div className={styles.detailBox}><h3>Actualizar estado</h3>
         <div className={styles.actionBox}><label>Estado<select value={stage} onChange={e=>setStage(e.target.value)}>
          {(detail.case.source==="support"?["new","in_progress","needs_customer","resolved","closed"]:
          ["received","approved","in_progress","needs_customer","verified","cancelled"]).map(v=><option key={v} value={v}>{statusLabel(v)}</option>)}</select></label>
          {detail.case.source==="marketing"?<><label>Actualización visible<textarea maxLength={1500} rows={3} value={stageNote} onChange={e=>setStageNote(e.target.value)} placeholder="Avance o información que falta…"/></label>
           {stage==="verified"?<label>Enlace HTTPS de evidencia<input value={proof} type="url" onChange={e=>setProof(e.target.value)} placeholder="https://…"/></label>:null}</>:null}
          <button type="button" className={styles.primary} disabled={busy} onClick={()=>void saveState()}><CheckCircle2 size={16}/>Actualizar estado</button>
         </div></div>:null}
       </div>}
      </>:<div className={styles.emptyDetail}><MessageSquare size={34}/><strong>Selecciona una solicitud</strong><p>Conserva la conversación, asigna responsables y registra avances.</p></div>}
     </section>
     <aside className={styles.context}>
      {detail&&selectedRow?<><div className={styles.paneHead}><button type="button" className={styles.backMobile} onClick={()=>setPane("detail")}><ArrowLeft size={17}/>Detalle</button><strong>Información</strong></div>
       <div className={styles.contextBody}><span className={styles.personAvatar}>{selectedRow.client_name.slice(0,1)}</span>
        <h3>{selectedRow.client_name}</h3><small>{detailText(detail.profile?.business_name||detail.case.title)}</small>
        <div className={styles.contextSection}><h4>Información del caso</h4>
         <dl className={styles.dataList}><div><dt>Referencia</dt><dd className={styles.mono}>{shortRef(selectedRow)}</dd></div>
          <div><dt>Tipo</dt><dd>{sourceLabel(selectedRow.source)}</dd></div><div><dt>Creada</dt><dd>{formatDate(selectedRow.created_at)}</dd></div>
          <div><dt>Actualizada</dt><dd>{formatDate(selectedRow.updated_at)}</dd></div>
          <div><dt>Cliente</dt><dd>{detailText(detail.profile?.first_name)} {detailText(detail.profile?.last_name)}</dd></div>
          {detail.profile?.phone?<div><dt>Teléfono</dt><dd>{detailText(detail.profile.phone)}</dd></div>:null}
          {detail.profile?.city?<div><dt>Ubicación</dt><dd>{detailText(detail.profile.city)} {detailText(detail.profile.state)}</dd></div>:null}
         </dl></div>
        <div className={styles.contextSection}><h4>Organización del trabajo</h4>
         <label>Responsable<select value={assignee} onChange={e=>setAssignee(e.target.value)}>
          <option value="">Sin asignar</option>{operators.map(o=><option key={o.user_id} value={o.user_id}>{o.user_id.slice(0,8)} · {o.role}</option>)}
         </select></label>
         <label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value)}>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{statusLabel(v)}</option>)}</select></label>
         <label>Fecha límite<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
         <button type="button" className={styles.primaryWide} onClick={()=>void saveMeta()} disabled={busy}><Check size={15}/>Guardar organización</button>
        </div>
        <div className={styles.contextInfo}><ShieldCheck size={16}/>Este panel utiliza la solicitud original y respeta las autorizaciones de cada servicio.</div>
       </div>
      </>:<div className={styles.blank}>Selecciona un caso para ver su contexto.</div>}
     </aside>
    </div>
   </>:null}

   {section==="clients"?<section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>RELACIONES</span><h3>Directorio de clientes</h3></div><span className={styles.count}>{clients?.total??"—"} cuentas</span></div>
    {overview?.role!=="admin"?<p className={styles.info}>Solo los administradores pueden consultar el directorio completo.</p>:
    <><label className={styles.search}><Search size={17}/><input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Buscar por nombre, negocio o ciudad…" aria-label="Buscar cliente"/></label>
     {clients?.truncated?<p className={styles.warning}>Se muestran las 250 cuentas más recientes.</p>:null}
     <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Cliente / negocio</th><th>Ubicación</th><th>Plan</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      {(clients?.clients||[]).filter(c=>[c.display_name,c.business_name,c.city,c.state].some(v=>String(v||"").toLowerCase().includes(clientSearch.trim().toLowerCase()))).map(c=><tr key={c.id}>
       <td><strong>{c.display_name}</strong><small>{c.business_name||"Sin nombre comercial"}</small></td>
       <td>{[c.city,c.state].filter(Boolean).join(", ")||"—"}</td>
       <td>{c.billing?.plan_code||"Sin plan"}</td>
       <td><span className={styles.chip}>{c.billing?.stripe_mode==="test"?"Prueba · ":""}{c.billing?.status||"Sin facturación"}</span></td>
       <td><button type="button" className={styles.textButton} onClick={()=>{setClientFilter(c.id);setSourceFilter("all");navigate("inbox");}}>Ver casos <ArrowUpRight size={14}/></button></td></tr>)}
     </tbody></table></div>{!clients?<div className={styles.blank}>Consultando clientes…</div>:null}
    </>}
   </section>:null}

   {section==="services"?<div className={styles.serviceContent}>
    <div className={styles.serviceCards}>{sources.map(s=><button className={styles.serviceCard} type="button" key={s.id} onClick={()=>openInbox({source:s.id})}>
     <span className={styles.serviceIcon}><s.Icon size={20}/></span><span><strong>{s.label}</strong><small>{s.description}</small></span>
     <b>{overview?.sources[s.id]||0}</b><ArrowUpRight size={16}/></button>)}</div>
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SUPERVISIÓN</span><h2>Facturación y operación</h2></div></div>
    {overview?.role!=="admin"?<div className={styles.surface}><p className={styles.info}>La consulta de facturación requiere rol administrador.</p></div>:
    <div className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>LECTURA SEGURA</span><h3>Suscripciones registradas</h3></div><span className={styles.count}>{billing?.accounts.length||0} cuentas</span></div>
     <p className={styles.info}>Este resumen no permite alterar cobros, saldos ni activar servicios. Las suscripciones de prueba no son pagos reales.</p>
     <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Cuenta</th><th>Plan</th><th>Modo</th><th>Estado</th><th>Minutos restantes (contables)</th></tr></thead><tbody>
      {(billing?.accounts||[]).map(b=><tr key={b.user_id}><td className={styles.mono}>{b.user_id.slice(0,8)}</td><td>{b.plan_code}</td>
       <td><span className={styles.chip} data-status={b.stripe_mode}>{b.stripe_mode==="test"?"TEST":"LIVE"}</span></td>
       <td>{b.status}</td><td>{Math.max(0,b.included_minutes+b.rollover_minutes+b.topup_minutes-b.used_minutes-b.reserved_minutes)}</td></tr>)}
     </tbody></table></div>{!billing?<div className={styles.blank}>Cargando facturación…</div>:null}
     <div className={styles.subtleSeparator}/>
     <h3>Incidencias telefónicas</h3><p className={styles.info}>{billing?.failureCount||0} sesiones con código de error registradas. No se debe interpretar cada error como un cobro.</p>
     {(billing?.failures||[]).slice(0,10).map(f=><div key={f.bridge_sid} className={styles.failure}><TriangleAlert size={15}/><span>{f.error_code||"Error"} · {formatDate(f.started_at)}</span><small>{f.bridge_sid.slice(0,15)}</small></div>)}
    </div>}
   </div>:null}

   {section==="team"?<section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>PERMISOS</span><h3>Personal autorizado</h3></div><span className={styles.count}>{team?.staff.length||0} operadores</span></div>
    <div className={styles.teamList}>{(team?.staff||[]).map(p=><div className={styles.teamRow} key={p.user_id}>
     <span className={styles.personAvatar}>{(p.name||"V").slice(0,1)}</span><div><strong>{p.name||"Operador VMV"}</strong><small>{p.user_id}</small></div>
     <span className={styles.chip}>{p.role==="admin"?"Administrador":"Operador"}</span>
     {team?.canManage?<div className={styles.teamActions}><button type="button" className={styles.secondary} disabled={busy||p.role==="admin"} onClick={()=>void revoke(p.user_id,"admin")}>Hacer admin</button>
      <button type="button" className={styles.secondary} disabled={busy||p.role==="agent"} onClick={()=>void revoke(p.user_id,"agent")}>Hacer agente</button>
      <button type="button" className={styles.danger} disabled={busy} onClick={()=>void revoke(p.user_id,"remove")}>Revocar</button></div>:null}
    </div>)}</div>
    {overview?.role==="admin"?<div className={styles.invite}><h3>Autorizar una cuenta VMV existente</h3><p className={styles.info}>Solo cuentas con perfil VMV y email verificado. No envía invitaciones ni crea usuarios nuevos.</p>
     <div className={styles.flex}><input aria-label="Identificador de usuario UUID" placeholder="UUID del usuario verificado" value={staffId} onChange={e=>setStaffId(e.target.value)}/>
     <select aria-label="Nuevo rol" value={staffRole} onChange={e=>setStaffRole(e.target.value as "agent"|"admin")}><option value="agent">Operador</option><option value="admin">Administrador</option></select>
     <button type="button" className={styles.primary} disabled={busy||!uuid(staffId)} onClick={()=>void addStaff()}><Plus size={16}/>Autorizar</button></div></div>:null}
   </section>:null}

   {section==="settings"?<div className={styles.settingsGrid}>
    <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>OPERACIÓN</span><h3>Atención y soporte</h3></div></div>
     {overview?.role!=="admin"?<p className={styles.info}>Los ajustes requieren rol administrador.</p>:<>
     <label className={styles.field}>Plazo objetivo de atención (días)<input type="number" min="1" max="30" value={slaDays} onChange={e=>setSlaDays(e.target.value)}/></label>
     <label className={styles.field}>Mensaje de bienvenida del equipo<textarea rows={4} maxLength={500} value={welcome} onChange={e=>setWelcome(e.target.value)} placeholder="Gracias por contactar a VMV…"/></label>
     <p className={styles.info}>Los plazos de los casos siguen siendo manuales hasta contar con reglas automáticas de vencimiento. Este ajuste guarda la preferencia.</p>
     <button type="button" disabled={busy} className={styles.primary} onClick={()=>void saveSettings()}><Check size={16}/>Guardar preferencias</button>
     </>}</section>
    <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>SEGURIDAD</span><h3>Controles administrativos</h3></div></div>
     <div className={styles.securityLine}><ShieldCheck size={18}/><div><strong>Autenticación existente</strong><small>Supabase Auth, sesión verificada y roles de personal</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><LockKeyhole size={18}/><div><strong>Datos protegidos</strong><small>Las tablas conservan RLS y las mutaciones pasan por el servidor</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><FileClock size={18}/><div><strong>Historial de eventos</strong><small>Mensajes append-only y bitácora de acciones administrativas</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><CreditCard size={18}/><div><strong>Operaciones monetarias</strong><small>Solo consulta: sin reembolsos, compras ni cargos desde Admin</small></div><LockKeyhole size={16}/></div>
     <a className={styles.textButton} href="/vista-app/soporte">Abrir portal de soporte <ExternalLink size={15}/></a>
    </section>
   </div>:null}
  </main>
 </div>;
}

function MarketingDetails({record,onMedia}:{record:Record<string,unknown>;onMedia:(path:string)=>void}){
 const areas:{key:string;label:string}[]=[
  {key:"google_profile_data",label:"Google Business Profile"},
  {key:"web_repair_data",label:"Diagnóstico y reparación web"},
  {key:"directory_data",label:"Directorios"},
  {key:"reputation_data",label:"Reputación"}
 ];
 return <>{areas.map(({key,label})=>{
  const data=record[key];
  if(!data||typeof data!=="object"||Array.isArray(data))return null;
  const entry=data as Record<string,unknown>;
  return <div className={styles.detailBox} key={key}><h3>{label}</h3>
   <dl className={styles.dataList}>{Object.entries(entry).filter(([k,v])=>k!=="media"&&v!==null&&v!==""&&v!==undefined).map(([k,v])=>{
    if(Array.isArray(v)&&k==="selected")return <div key={k}><dt>Directorios seleccionados</dt><dd>{v.map((x,i)=>{
     const d=x&&typeof x==="object"?x as Record<string,unknown>:{};
     return <div key={i} className={styles.directoryRow}><strong>{detailText(d.name||d.id)}</strong><small>{statusLabel(String(d.status||"pending"))}</small>
      {safeLink(d.evidenceUrl)?<a href={safeLink(d.evidenceUrl)||"#"} target="_blank" rel="noopener noreferrer">Evidencia <ExternalLink size={12}/></a>:null}</div>;
    })}</dd></div>;
    if(typeof v==="object")return null;
    return <div key={k}><dt>{metadataLabels[k]||k.replaceAll("_"," ")}</dt><dd>{safeLink(v)?<a href={safeLink(v)||"#"} target="_blank" rel="noopener noreferrer">{String(v).slice(0,65)} <ExternalLink size={12}/></a>:detailText(v)}</dd></div>;
   })}</dl>
   {key==="google_profile_data"&&Array.isArray(entry.media)?<div className={styles.mediaItems}><h4>Imágenes privadas del cliente</h4>
    {(entry.media as {kind?:string;path?:string}[]).filter(m=>typeof m.path==="string").map(m=><button type="button" className={styles.secondary} key={m.path} onClick={()=>onMedia(m.path!)}><ExternalLink size={14}/>Ver {m.kind||"imagen"}</button>)}
   </div>:null}
  </div>;
 })}</>;
}