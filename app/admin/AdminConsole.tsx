"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
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
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import CaseAttachments from "@/components/CaseAttachments";
import TestersPanel from "./TestersPanel";
import styles from "./console.module.css";

type Source="marketing"|"support"|"provisioning"|"domain";
type Section="home"|"inbox"|"clients"|"services"|"team"|"testers"|"settings";
type Pane="list"|"detail"|"context";
type CaseRow={
 source:Source;id:string;owner_id:string;title:string;client_name:string;
 service:string;status:string;description:string;created_at:string;updated_at:string;
 priority:"low"|"normal"|"high"|"urgent";assigned_to:string|null;due_at:string|null;amount:number|null;
};
type Operator={user_id:string;role:"admin"|"agent";name?:string;granted_at?:string;updated_at?:string};
type Message={id:string;author_id:string;kind:"message"|"internal_note";body:string;created_at:string};
type Detail={case:CaseRow;record:Record<string,unknown>;meta:Record<string,unknown>|null;
 messages:Message[];messagesHasMore:boolean;
 history:{id:number;actor_id:string;action:string;summary:string;visibility:string;created_at:string;detail:Record<string,unknown>}[];
 historyHasMore:boolean;profile:Record<string,unknown>|null;
 acceptances:{quote_revision:number;quoted_price_cents:number;accepted_at:string}[]};
type Client={id:string;first_name:string|null;last_name:string|null;business_name:string|null;display_name:string;phone:string|null;website_url:string|null;city:string|null;state:string|null;created_at:string;billing:{plan_code:string;status:string;stripe_mode:string}|null};
type Billing={user_id:string;plan_code:string;status:string;stripe_mode:string;current_period_end:string|null;included_minutes:number;used_minutes:number;reserved_minutes:number;rollover_minutes:number;topup_minutes:number;updated_at:string};
type StaffPayload={staff:Operator[];canManage:boolean};
type BillingPayload={accounts:Billing[];failures:{bridge_sid:string;owner_id:string;status:string;error_code:string;started_at:string}[];failureCount:number;note:string;
 aiAgentsTotal:number;aiAgentsSampleStatuses:Record<string,number>;websitesTotal:number;linesTotal:number;activeLineSample:number};
type SettingsPayload={settings:{key:string;value:Record<string,unknown>;updated_at:string}[]};
type ClientPayload={clients:Client[];total:number;page:number;pages:number;size:number};
type Overview={role:"admin"|"agent";actorId:string;cases:CaseRow[];staff:Operator[];total:number;truncated:boolean;
 failedCalls30d:number|null;sources:Record<Source,number>;
 metrics:{total:number;new:number;unassigned:number;progress:number;waiting:number;soon:number;overdue:number;sources:Record<Source,number>}};
type CasePage={cases:CaseRow[];page:number;size:number;total:number;pages:number};
type Notice={id:number;source:Source;source_id:string;kind:string;title:string;created_at:string;read_at:string|null};

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
const localDateTime=(value:string|null|undefined)=>{
 if(!value||!Number.isFinite(Date.parse(value)))return "";
 const d=new Date(value),n=(v:number)=>String(v).padStart(2,"0");
 return [d.getFullYear(),n(d.getMonth()+1),n(d.getDate())].join("-")+"T"+n(d.getHours())+":"+n(d.getMinutes());
};
const formatDate=(value:string|null|undefined,locale="es-US")=>{
 if(!value||!Number.isFinite(Date.parse(value)))return "—";
 return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
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
 action:"Gestión solicitada",country:"País",otherCategories:"Otras categorías",secondaryPhone:"Teléfono adicional",bookingUrl:"Reservas / pedidos",existingProfileUrl:"Perfil existente",openingDate:"Fecha de apertura",hoursEnabled:"Horarios definidos",googleCategory:"Categoría de Google",kind:"Tipo de negocio",phone:"Teléfono",street:"Dirección",
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
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const date=(value:string|null|undefined)=>formatDate(value,en?"en-US":"es-US");
 const statusesEn:Record<string,string>={
  received:"Received",quoted:"Quote sent",approved:"Approved",in_progress:"In progress",
  needs_customer:"Waiting for customer",verified:"Completed",cancelled:"Canceled",
  new:"New",resolved:"Resolved",closed:"Closed",pending:"Pending",
  contacted:"Contacted",activated:"Activated",active:"Active",low:"Low",normal:"Normal",
  high:"High",urgent:"Urgent",test:"Test",live:"Live"
 };
 const status=(value:string)=>en?(statusesEn[value]||value.replaceAll("_"," ")):statusLabel(value);
 const sourceName=(value:Source)=>en?({support:"Support",marketing:"Marketing",provisioning:"Phone lines",domain:"Domains"}[value]):sourceLabel(value);
 const serviceName=(value:string)=>en?({
  google_profile:"Google Business Profile",directory_listings:"Directories",seo_improvement:"Website improvements",
  review_strategy:"Reputation",general:"General",billing:"Billing",company_formation:"Company formation",
  web_services:"Web Services",smart_call:"Smart Call",ai_agents:"AI Agents",domain:"Domains"
 } as Record<string,string>)[value]||serviceLabel(value):serviceLabel(value);
 const [phase,setPhase]=useState<"checking"|"ready"|"signed_out"|"forbidden"|"unconfigured"|"error">("checking");
 const [section,setSection]=useState<Section>("home");
 const [overview,setOverview]=useState<Overview|null>(null);
 const [casePage,setCasePage]=useState(1);
 const [casePages,setCasePages]=useState(1);
 const [caseTotal,setCaseTotal]=useState(0);
 const [clientPage,setClientPage]=useState(1);
 const [noticeList,setNoticeList]=useState<Notice[]>([]);
 const [noticeCount,setNoticeCount]=useState(0);
 const [noticesOpen,setNoticesOpen]=useState(false);
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [sendingKey,setSendingKey]=useState<string|null>(null);
 const detailSeq=useRef(0),queueSeq=useRef(0),clientsSeq=useRef(0),sessionSeq=useRef(0);
 const selectedRef=useRef<string|null>(null);
 const busyRef=useRef(false);
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
 const [dueOnly,setDueOnly]=useState(false);
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
 const [audit,setAudit]=useState<{events:{id:number;actor_id:string;action:string;source:string;source_id:string|null;created_at:string}[]}|null>(null);
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
  const seq=++sessionSeq.current;
  setLoading(true);
  try{
   const [data,first,notices]=await Promise.all([
    api<Omit<Overview,"cases"|"total"|"truncated"|"sources">>("view=overview"),
    api<CasePage>("view=cases&page=1&size=25"),
    api<{notifications:Notice[];unread:number}>("view=notifications")
   ]);
   if(seq!==sessionSeq.current)return;
   setOverview({...data,cases:first.cases,total:data.metrics.total,truncated:false,sources:data.metrics.sources});
   setCasePage(1);setCasePages(first.pages);setCaseTotal(first.total);
   setNoticeList(notices.notifications);setNoticeCount(notices.unread);
   setPhase("ready");setError("");
  }catch(e){
   if(seq!==sessionSeq.current)return;
   const code=(e as {status?:number}).status;
   if(code===401)setPhase("signed_out");
   else if(code===403)setPhase("forbidden");
   else {setError(e instanceof Error?e.message:"No se pudo actualizar.");setPhase(p=>p==="checking"?"error":p);}
  }finally{if(seq===sessionSeq.current)setLoading(false);}
 },[api]);
 useEffect(()=>{
  const db=getSupabase();
  if(!db){setPhase("unconfigured");return;}
  let active=true;
  const unsubscribe=db.auth.onAuthStateChange(event=>{
   if(event==="SIGNED_OUT"&&active){sessionSeq.current++;detailSeq.current++;queueSeq.current++;clientsSeq.current++;setPhase("signed_out");setOverview(null);setDetail(null);setClients(null);setBilling(null);setTeam(null);setSettings(null);setSelected(null);selectedRef.current=null;setNoticeList([]);setNoticeCount(0);setDraftMessage("");setDrafts({});}
   if(event==="SIGNED_IN"&&active)queueMicrotask(()=>{if(active)void refresh();});
  });
  void refresh();
  return()=>{active=false;unsubscribe.data.subscription.unsubscribe();};
 },[refresh]);
 const loadDetail=useCallback(async(c:CaseRow)=>{
  const seq=++detailSeq.current;
  setDetail(null);setDetailTab("conversation");setError("");
  try{
   const r=await api<Detail>("view=detail&source="+c.source+"&id="+encodeURIComponent(c.id));
   if(seq!==detailSeq.current)return;
   setDetail(r);
   setStage(String(r.record.status||""));
   setStageNote(String(r.record.staff_update||""));
   setProof(String(r.record.evidence_url||""));
   setAmount(typeof r.record.quoted_price_cents==="number"?(r.record.quoted_price_cents/100).toFixed(2):"");
   setQuoteNote(String(r.record.quote_note||""));
   setAssignee(String(r.meta?.assigned_to||""));
   setPriority(String(r.meta?.priority||"normal"));
   setDueAt(localDateTime(typeof r.meta?.due_at==="string"?r.meta.due_at:null));
   setMessageKind(c.source==="marketing"||c.source==="support"?"message":"internal_note");
  }catch(e){if(seq===detailSeq.current)setError(e instanceof Error?e.message:"No se pudo consultar el caso.");}
 },[api]);
 const choose=useCallback((c:CaseRow)=>{
  const key=caseKey(c);
  selectedRef.current=key;setSelected(key);setPane("detail");setSection("inbox");setNotice("");
  setDraftMessage(drafts[key]||"");setSendingKey(null);
  const u=new URL(window.location.href);u.searchParams.set("source",c.source);u.searchParams.set("id",c.id);
  window.history.replaceState(null,"",u.pathname+u.search);
  void loadDetail(c);
 },[loadDetail,drafts]);
 useEffect(()=>{
  if(phase!=="ready"||!overview)return;
  const q=new URL(window.location.href).searchParams,s=q.get("source"),id=q.get("id");
  if(!selected&&id&&uuid(id)&&sources.some(x=>x.id===s)){
   const c=overview.cases.find(c=>c.id===id&&c.source===s)||{
    source:s as Source,id,owner_id:"",title:"Solicitud",client_name:"Cliente",
    service:"general",status:"",description:"",created_at:"",updated_at:"",
    priority:"normal" as const,assigned_to:null,due_at:null,amount:null
   };
   queueMicrotask(()=>choose(c));
  }
 },[phase,overview,selected,choose]);
 const loadQueue=useCallback(async(p:number)=>{
  const seq=++queueSeq.current;
  if(phase!=="ready")return;
  const params=new URLSearchParams({view:"cases",page:String(p),size:"25",
   source:sourceFilter,state:stateFilter,service:serviceFilter,priority:priorityFilter,
   assignee:assigneeFilter,sort:order,q:search});
  if(clientFilter)params.set("owner",clientFilter);
  if(dueOnly)params.set("due","soon");
  try{
   const page=await api<CasePage>(params.toString());
   if(seq!==queueSeq.current)return;
   setOverview(prev=>prev?{...prev,cases:page.cases}:prev);
   setCasePage(page.page);setCasePages(page.pages);setCaseTotal(page.total);
  }catch(e){if(seq===queueSeq.current)setError(e instanceof Error?e.message:"No se pudo cargar la página.");}
 },[api,phase,sourceFilter,stateFilter,serviceFilter,priorityFilter,assigneeFilter,order,search,clientFilter,dueOnly]);
 useEffect(()=>{
  if(phase!=="ready")return;
  setCasePage(1);
  void loadQueue(1);
 },[loadQueue,phase]);
 const loadClients=useCallback(async(p:number)=>{
  const seq=++clientsSeq.current;
  const params=new URLSearchParams({view:"clients",page:String(p),size:"25",q:clientSearch});
  try{
   const result=await api<ClientPayload>(params.toString());
   if(seq!==clientsSeq.current)return;
   setClients(result);setClientPage(result.page);
  }catch(e){if(seq===clientsSeq.current)setError(e instanceof Error?e.message:"No se pudieron consultar los clientes.");}
 },[api,clientSearch]);
 useEffect(()=>{
  if(phase==="ready"&&section==="clients"&&overview?.role==="admin"){
   setClientPage(1);void loadClients(1);
  }
 },[phase,section,overview?.role,loadClients]);
 const loadEarlier=async(history=false)=>{
  if(!detail)return;
  const key=caseKey(detail.case),rows=history?detail.history:detail.messages;
  if(!rows.length)return;
  const first=rows[0],query=new URLSearchParams({
   view:history?"history":"thread",source:detail.case.source,id:detail.case.id,
   before:first.created_at,beforeId:String(first.id),size:"40"
  });
  try{
   const result=await api<{items:Message[];hasMore:boolean}>(query.toString());
   if(selectedRef.current!==key)return;
   if(history)setDetail(prev=>prev?{...prev,
    history:[...(result.items as unknown as Detail["history"]),...prev.history],historyHasMore:result.hasMore}:prev);
   else setDetail(prev=>prev?{...prev,messages:[...result.items,...prev.messages],
    messagesHasMore:result.hasMore}:prev);
  }catch(e){if(selectedRef.current===key)setError(e instanceof Error?e.message:"No se pudo cargar el historial.");}
 };
 const loadSecondary=useCallback(async(next:Section)=>{
  try{
   if(next==="clients"&&!clients&&overview?.role==="admin")void loadClients(1);
   if(next==="team"&&!team)setTeam(await api<StaffPayload>("view=team"));
   if(next==="services"&&!billing&&overview?.role==="admin")setBilling(await api<BillingPayload>("view=billing"));
   if(next==="settings"&&!settings&&overview?.role==="admin"){
    const [data,events]=await Promise.all([
     api<SettingsPayload>("view=settings"),
     api<{events:{id:number;actor_id:string;action:string;source:string;source_id:string|null;created_at:string}[]}>("view=activity")
    ]);setSettings(data);setAudit(events);
    const defaults=data.settings.find(s=>s.key==="support_defaults")?.value;
    if(defaults){setSlaDays(String(defaults.sla_days||3));setWelcome(String(defaults.welcome_message||""));}
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la sección.");}
 },[api,clients,team,billing,settings,overview?.role,loadClients]);
 const navigate=(s:Section)=>{
  setSection(s);setNotice("");setError("");
  if(s==="inbox")setPane("list");
  if(s!=="inbox"){
   selectedRef.current=null;detailSeq.current++;setSelected(null);setDetail(null);
   const u=new URL(window.location.href);u.searchParams.delete("source");u.searchParams.delete("id");
   window.history.replaceState(null,"",u.pathname+u.search);
  }
  void loadSecondary(s);
 };
 const perform=async(payload:Record<string,unknown>,success:string,afterDetail=true):Promise<boolean>=>{
  if(busyRef.current)return false;
  busyRef.current=true;setBusy(true);setError("");setNotice("");
  const current=detail?caseKey(detail.case):null;
  try{
   await api<{ok:boolean}>("",payload);
   if(afterDetail&&detail&&current&&selectedRef.current===current){
    await loadDetail(detail.case);
   }
   const updated=await api<Omit<Overview,"cases"|"total"|"truncated"|"sources">>("view=overview");
   setOverview(prev=>prev?{...prev,...updated,total:updated.metrics.total,sources:updated.metrics.sources}:prev);
   await loadQueue(casePage);
   setNotice(success);
   return true;
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar. Tus cambios siguen escritos.");return false;}
  finally{setBusy(false);busyRef.current=false;}
 };
 const send=async()=>{
  if(!detail||!draftMessage.trim())return;
  const key=caseKey(detail.case),requestKey=sendingKey||crypto.randomUUID();
  setSendingKey(requestKey);
  const saved=await perform({action:"send_message",source:detail.case.source,id:detail.case.id,
   message:draftMessage.trim(),kind:messageKind,request_key:requestKey},
   messageKind==="internal_note"?"Nota interna guardada.":"Mensaje guardado en la cuenta del cliente; no se envió correo ni SMS.");
  if(saved){setSendingKey(null);setDrafts(prev=>({...prev,[key]:""}));if(selectedRef.current===key)setDraftMessage("");}
 };
 const saveMeta=async()=>{
  if(!detail)return;
  await perform({action:"set_meta",source:detail.case.source,id:detail.case.id,
   expected_updated_at:detail.meta?.updated_at||null,
   assigned_to:assignee||null,priority,due_at:dueAt?new Date(dueAt).toISOString():null},
   "Responsable, prioridad y fecha guardados con auditoría.");
 };
 const saveState=async()=>{
  if(!detail)return;
  const source=detail.case.source;
  if(source==="support"){
   await perform({action:"update_ticket",source,id:detail.case.id,status:stage,
    expected_updated_at:detail.record.updated_at},"Estado de soporte actualizado.");
  }else if(source==="marketing"){
   await perform({action:"update_marketing",source,id:detail.case.id,expected_updated_at:detail.record.updated_at,
    operation:"status",status:stage,note:stageNote,evidence_url:proof},"Estado actualizado en la solicitud original.");
  }
 };
 const saveQuote=async()=>{
  if(!detail||detail.case.source!=="marketing")return;
  if(!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())){setError("Introduce un importe con hasta dos decimales.");return;}
  const cents=Math.round(Number(amount)*100);
  await perform({action:"update_marketing",source:"marketing",id:detail.case.id,
   expected_updated_at:detail.record.updated_at,operation:"quote",amount_cents:cents,quote_note:quoteNote},
   "Presupuesto con revisión registrada. La aceptación del cliente no representa un cobro.");
 };
 const refreshCurrent=async()=>{
  const [data,notices]=await Promise.all([
   api<Omit<Overview,"cases"|"total"|"truncated"|"sources">>("view=overview"),
   api<{notifications:Notice[];unread:number}>("view=notifications")
  ]);
  setOverview(prev=>prev?{...prev,...data,total:data.metrics.total,sources:data.metrics.sources}:prev);
  setNoticeList(notices.notifications);setNoticeCount(notices.unread);
  await loadQueue(casePage);
  if(detail&&selectedRef.current===caseKey(detail.case))await loadDetail(detail.case);
  if(section==="clients"&&overview?.role==="admin")await loadClients(clientPage);
  if(section==="team")setTeam(await api<StaffPayload>("view=team"));
  if(section==="services"&&overview?.role==="admin")setBilling(await api<BillingPayload>("view=services"));
 };
 const caseRows=overview?.cases||[];
 const operators=overview?.staff||[];
 const visible=caseRows;
 const selectedRow=caseRows.find(c=>caseKey(c)===selected)||detail?.case||null;
 const servicesInUse=Object.keys(serviceLabels).sort();
 const counts={
  new:overview?.metrics.new||0,unassigned:overview?.metrics.unassigned||0,
  progress:overview?.metrics.progress||0,waiting:overview?.metrics.waiting||0,
  soon:overview?.metrics.soon||0,alerts:overview?.failedCalls30d??null
 };
 const openInbox=(opts?:{state?:"new"|"working"|"waiting"|"done";assignee?:string;source?:Source})=>{
  setStateFilter(opts?.state||"all");setAssigneeFilter(opts?.assignee||"all");setSourceFilter(opts?.source||"all");
  setClientFilter(null);setDueOnly(false);navigate("inbox");
 };
 const stats:{title:string;value:number|null;hint:string;Icon:LucideIcon;call:()=>void}[]=[
  {title:L("Nuevos","New"),value:counts.new,hint:L("Por revisar","Needs review"),Icon:Inbox,call:()=>openInbox({state:"new"})},
  {title:L("Sin asignar","Unassigned"),value:counts.unassigned,hint:L("Necesitan responsable","Needs an owner"),Icon:UserRound,call:()=>openInbox({assignee:"unassigned"})},
  {title:L("En progreso","In progress"),value:counts.progress,hint:L("Trabajo del equipo","Team work"),Icon:ClipboardCheck,call:()=>openInbox({state:"working"})},
  {title:L("Esperando cliente","Waiting for customer"),value:counts.waiting,hint:L("Aguardan respuesta o aprobación","Awaiting reply or approval"),Icon:MessageCircle,call:()=>openInbox({state:"waiting"})},
  {title:L("Próximos o vencidos","Due soon or overdue"),value:counts.soon,hint:L("Plazo menor de 48 horas","Within 48 hours"),Icon:CalendarClock,call:()=>{openInbox();setDueOnly(true);}},
  {title:L("Fallos de llamadas","Call failures"),value:counts.alerts,hint:L("Con código de error · 30 días","Error codes · past 30 days"),Icon:TriangleAlert,call:()=>navigate("services")}
 ];
 const nav:{id:Section;title:string;Icon:LucideIcon}[]=[
  {id:"home",title:L("Inicio","Home"),Icon:LayoutDashboard},{id:"inbox",title:L("Bandeja","Inbox"),Icon:Inbox},
  {id:"clients",title:L("Clientes","Clients"),Icon:Users},{id:"services",title:L("Servicios","Services"),Icon:BriefcaseBusiness},
  {id:"team",title:L("Equipo","Team"),Icon:UserRoundCog},...(overview?.role==="admin"?[{id:"testers" as Section,title:"Testers",Icon:Users}]:[]),{id:"settings",title:L("Configuración","Settings"),Icon:Settings2}
 ];
 const revoke=async(userId:string,nextRole:"admin"|"agent"|"remove"):Promise<boolean>=>{
  if(!window.confirm(nextRole==="remove"?"¿Revocar el acceso administrativo?":"¿Actualizar el rol del operador?"))return false;
  if(busy)return false;
  setBusy(true);setError("");
  try{
   const old=team?.staff.find(o=>o.user_id===userId);
   await api("",{action:"set_staff",user_id:userId,role:nextRole,expected_updated_at:old?.updated_at||null});
   setTeam(await api<StaffPayload>("view=team"));
   const data=await api<Omit<Overview,"cases"|"total"|"truncated"|"sources">>("view=overview");
   setOverview(prev=>prev?{...prev,...data,total:data.metrics.total,sources:data.metrics.sources}:prev);
   setNotice("Permisos actualizados y auditados.");return true;
  }catch(e){setError(e instanceof Error?e.message:"No se pudo modificar el rol. Revísalo antes de reintentar.");return false;}
  finally{setBusy(false);}
 };
 const addStaff=async()=>{
  if(!uuid(staffId)){setError("Introduce el UUID de una cuenta VMV verificada.");return;}
  if(await revoke(staffId,staffRole))setStaffId("");
 };
 const saveSettings=async()=>{
  if(busy)return;
  setBusy(true);setError("");
  try{
   await api("",{action:"update_settings",sla_days:Number(slaDays),welcome_message:welcome,
    expected_updated_at:settings?.settings.find(x=>x.key==="support_defaults")?.updated_at||null});
   setSettings(await api<SettingsPayload>("view=settings"));
   setNotice("Preferencias guardadas. El plazo se aplica a tickets nuevos.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar. Comprueba la versión vigente.");}
  finally{setBusy(false);}
 };
 const markNotice=async(n:Notice)=>{
  try{
   await api("",{action:"mark_notification",notification_id:n.id});
   setNoticeList(prev=>prev.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x));
   setNoticeCount(prev=>Math.max(0,prev-(n.read_at?0:1)));
   setNoticesOpen(false);
   const existing=overview?.cases.find(c=>c.source===n.source&&c.id===n.source_id);
   const direct=existing||{source:n.source,id:n.source_id,owner_id:"",title:n.title,client_name:"Cliente",
     service:"general",status:"",description:"",created_at:"",updated_at:"",
     priority:"normal" as const,assigned_to:null,due_at:null,amount:null};
   choose(direct);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir la notificación.");}
 };
 const showMedia=async(path:string)=>{
  if(!detail)return;
  try{
   const data=await api<{url:string}>("view=media&source=marketing&id="+encodeURIComponent(detail.case.id)+"&path="+encodeURIComponent(path));
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
    <div><p className={styles.eyebrow}>VMV / OPERACIONES</p><h1>{({home:L("Centro de operaciones","Operations center"),inbox:L("Bandeja de trabajo","Work inbox"),clients:L("Clientes","Clients"),services:L("Servicios","Services"),team:L("Equipo","Team"),testers:"Testers",settings:L("Configuración","Settings")} as Record<Section,string>)[section]}</h1>
     <p className={styles.subtitle}>{({home:L("Todo lo importante, sin ruido.","Everything that matters, without noise."),inbox:L("Una sola vista para los trabajos de VMV.","One view for all VMV work."),clients:L("Cuentas y relaciones de servicio.","Accounts and services."),services:L("Estado de los servicios de la plataforma.","Service health and activity."),team:L("Responsables, permisos y colaboración.","Assignments and permissions."),testers:L("Envía previews a destinatarios autorizados.","Send previews to authorized testers."),settings:L("Preferencias de operación y seguridad.","Operations and security preferences.")} as Record<Section,string>)[section]}</p></div>
    <div className={styles.headerActions}><InterfaceLanguagePicker compact/><span className={styles.mode}><span className={styles.greenDot}/> {L("Acceso interno","Internal access")}</span>
     <div className={styles.notificationWrap}>
      <button type="button" className={styles.iconButton} aria-label={"Notificaciones: "+noticeCount+" sin leer"} onClick={()=>setNoticesOpen(v=>!v)}><Bell size={18}/>{noticeCount>0?<span className={styles.notificationCount}>{noticeCount}</span>:null}</button>
      {noticesOpen?<div className={styles.notificationPanel}><strong>Actividad para ti</strong>
       {noticeList.length?noticeList.slice(0,20).map(n=><button key={n.id} type="button" className={n.read_at?styles.notificationRead:styles.notification} onClick={()=>void markNotice(n)}>
        <span>{n.title}</span><small>{date(n.created_at)} · {n.source}</small></button>)
       :<p>Sin notificaciones.</p>}</div>:null}
     </div>
     <button aria-label="Actualizar datos" type="button" className={styles.iconButton} disabled={loading||busy} onClick={()=>void refreshCurrent()}><RefreshCw size={18} className={loading?styles.spin:""}/></button></div>
   </header>
   {error?<div className={styles.alert} role="alert"><TriangleAlert size={17}/><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Cerrar error"><X size={15}/></button></div>:null}
   {notice?<div className={styles.notice} role="status"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Cerrar aviso"><X size={15}/></button></div>:null}
   

   {section==="home"?<>
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>EN ESTE MOMENTO</span><h2>{L("Prioridades del equipo","Team priorities")}</h2></div>
     <button type="button" className={styles.textButton} onClick={()=>openInbox()}>{L("Ver bandeja","Open inbox")} <ArrowUpRight size={16}/></button></div>
    <div className={styles.statGrid}>{stats.map(({title,value,hint,Icon,call})=><button type="button" key={title} className={styles.stat} onClick={call}>
      <div className={styles.statTop}><span className={styles.statIcon}><Icon size={20}/></span><ArrowUpRight size={17}/></div>
      <span>{title}</span><strong>{value===null?"—":value}</strong><small>{hint}</small>
    </button>)}</div>
    <div className={styles.homeGrid}>
     <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>ACTIVIDAD</span><h3>{L("Solicitudes recientes","Recent requests")}</h3></div><button type="button" className={styles.textButton} onClick={()=>openInbox()}>{L("Ver todas","View all")} <ChevronRight size={15}/></button></div>
      {caseRows.length?caseRows.slice(0,6).map(c=><button type="button" key={caseKey(c)} className={styles.recent} onClick={()=>choose(c)}>
       <div className={styles.recentIcon}>{c.source==="marketing"?<Sparkles size={17}/>:c.source==="support"?<Headphones size={17}/>:c.source==="domain"?<Globe2 size={17}/>:<PhoneCall size={17}/>}</div>
       <div><strong>{c.title}</strong><small>{sourceName(c.source)} · {c.client_name}</small></div>
       <span className={styles.chip} data-status={c.status}>{status(c.status)}</span>
      </button>):<div className={styles.blank}>Todavía no hay casos.</div>}
     </section>
     <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>POR SERVICIO</span><h3>{L("Entradas registradas","Recorded requests")}</h3></div></div>
      {sources.map(s=><button key={s.id} type="button" className={styles.serviceLine} onClick={()=>openInbox({source:s.id})}>
       <span className={styles.serviceIcon}><s.Icon size={18}/></span><span><strong>{s.label}</strong><small>{s.description}</small></span>
       <b>{overview?.sources[s.id]||0}</b><ChevronRight size={16}/></button>)}
     </section>
    </div>
   </>:null}

   {section==="inbox"?<>
    <div className={styles.filters}>
     <label className={styles.search}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, asunto, referencia…" aria-label="Buscar casos"/></label>
     <select aria-label="Tipo de caso" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value as Source|"all")}><option value="all">{L("Todos los tipos","All types")}</option>{sources.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
     <select aria-label="Estado" value={stateFilter} onChange={e=>setStateFilter(e.target.value as typeof stateFilter)}><option value="all">{L("Todos los estados","All statuses")}</option><option value="new">{L("Nuevos","New")}</option><option value="working">{L("En progreso","In progress")}</option><option value="waiting">{L("Esperando cliente","Waiting for customer")}</option><option value="done">{L("Finalizados","Completed")}</option></select>
     <select aria-label="Servicio" value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}><option value="all">{L("Todos los servicios","All services")}</option>{servicesInUse.map(v=><option key={v} value={v}>{serviceName(v)}</option>)}</select>
     <select aria-label="Prioridad" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="all">{L("Todas las prioridades","All priorities")}</option>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{status(v)}</option>)}</select>
     <select aria-label="Responsable" value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}><option value="all">{L("Todos los responsables","All assignees")}</option><option value="unassigned">{L("Sin asignar","Unassigned")}</option><option value="self">{L("Asignados a mí","Assigned to me")}</option>{operators.filter(o=>o.user_id!==overview?.actorId).map(o=><option key={o.user_id} value={o.user_id}>{o.user_id===operators[0]?.user_id?"Operador "+o.user_id.slice(0,6):o.user_id.slice(0,8)}</option>)}</select>
     <select aria-label="Orden" value={order} onChange={e=>setOrder(e.target.value as typeof order)}><option value="updated">{L("Actividad reciente","Recent activity")}</option><option value="oldest">{L("Más antiguos","Oldest first")}</option></select>
     {(search||clientFilter||dueOnly||sourceFilter!=="all"||stateFilter!=="all"||serviceFilter!=="all"||priorityFilter!=="all"||assigneeFilter!=="all")?
      <button type="button" className={styles.clear} onClick={()=>{setSearch("");setClientFilter(null);setDueOnly(false);setSourceFilter("all");setStateFilter("all");setServiceFilter("all");setPriorityFilter("all");setAssigneeFilter("all");}}><FilterX size={15}/>{L("Limpiar","Clear")}</button>:null}
    </div>
    <div className={styles.inboxGrid} data-pane={pane}>
     <section className={styles.caseList}>
      <div className={styles.paneHead}><strong>{L("Bandeja","Inbox")}</strong><span>{caseTotal} {L("casos","cases")}</span></div>
      <div className={styles.caseScroll}>{visible.length?visible.map(c=><button type="button" key={caseKey(c)} aria-pressed={selected===caseKey(c)}
       className={selected===caseKey(c)?styles.caseOn:styles.case} onClick={()=>choose(c)}>
       <div className={styles.caseTop}><span className={styles.caseSource}>{sourceName(c.source)} · {serviceName(c.service)}</span><time>{date(c.updated_at)}</time></div>
       <strong>{c.title}</strong><span className={styles.casePreview}>{c.description}</span>
       <div className={styles.caseBottom}><span className={styles.chip} data-status={c.status}>{status(c.status)}</span><small>{shortRef(c)}</small></div>
       <div className={styles.caseCustomer}><UserRound size={12}/>{c.client_name}{c.priority==="high"||c.priority==="urgent"?<span className={styles.urgent}>{status(c.priority)}</span>:null}</div>
      </button>):<div className={styles.blank}><Inbox size={26}/>No hay casos con esos filtros.</div>}
      <div className={styles.pagination}><button type="button" disabled={casePage<=1} onClick={()=>void loadQueue(casePage-1)}><ArrowLeft size={14}/>{L("Anterior","Previous")}</button><span>{casePage} / {casePages}</span><button type="button" disabled={casePage>=casePages} onClick={()=>void loadQueue(casePage+1)}>{L("Siguiente","Next")} <ArrowRight size={14}/></button></div>
     </div>
     </section>
     <section className={styles.caseDetail}>
      {detail&&selectedRow?<><div className={styles.paneHead}>
        <button type="button" className={styles.backMobile} onClick={()=>setPane("list")}><ArrowLeft size={17}/>Bandeja</button>
        <strong>{shortRef(selectedRow)}</strong><button className={styles.contextMobile} type="button" onClick={()=>setPane("context")}>Información <ChevronRight size={16}/></button>
       </div>
       <div className={styles.detailHeader}><p className={styles.eyebrow}>{sourceName(selectedRow.source).toUpperCase()} / {serviceName(selectedRow.service).toUpperCase()}</p>
        <h2>{detail.case.title}</h2><div className={styles.flex}><span className={styles.chip} data-status={detail.case.status}>{status(detail.case.status)}</span><span className={styles.smallMuted}>{date(detail.case.created_at)}</span></div>
       </div>
       <div className={styles.detailTabs}><button type="button" aria-pressed={detailTab==="conversation"} className={detailTab==="conversation"?styles.tabOn:styles.tab} onClick={()=>setDetailTab("conversation")}><MessageSquare size={15}/>{L("Conversación","Conversation")}</button>
        <button type="button" aria-pressed={detailTab==="request"} className={detailTab==="request"?styles.tabOn:styles.tab} onClick={()=>setDetailTab("request")}><FileText size={15}/>{L("Solicitud y acciones","Request & actions")}</button></div>
       {detailTab==="conversation"?<div className={styles.conversation}>
        <div className={styles.initialMessage}><span className={styles.messageAvatar}><UserRound size={17}/></span><div><small>Solicitud original · {date(detail.case.created_at)}</small>
         <p>{detail.case.description}</p></div></div>
        {detail.messagesHasMore?<button type="button" className={styles.secondary} onClick={()=>void loadEarlier(false)}><FileClock size={14}/>{L("Mostrar mensajes anteriores","Load older messages")}</button>:null}
        {detail.messages.map(m=><div key={m.id} className={m.kind==="internal_note"?styles.internalMessage:styles.message}>
          <div className={styles.messageHeading}><strong>{m.kind==="internal_note"?"Nota interna":m.author_id===detail.case.owner_id?"Cliente":"Equipo VMV"}</strong><span>{date(m.created_at)}</span></div>
          <p>{m.body}</p>{m.kind==="internal_note"?<small><LockKeyhole size={12}/> No visible para el cliente</small>:null}
        </div>)}
        <div className={styles.composer}><div className={styles.composerModes}>
         <button type="button" aria-pressed={messageKind==="message"} className={messageKind==="message"?styles.modeOn:styles.modeButton} onClick={()=>setMessageKind("message")}>{L("Mensaje al cliente","Message customer")}</button>
         <button type="button" aria-pressed={messageKind==="internal_note"} className={messageKind==="internal_note"?styles.modeOn:styles.modeButton} onClick={()=>setMessageKind("internal_note")}>{L("Nota interna","Internal note")}</button>
        </div><textarea value={draftMessage} onChange={e=>{setDraftMessage(e.target.value);setSendingKey(null);if(detail)setDrafts(prev=>({...prev,[caseKey(detail.case)]:e.target.value}));}} maxLength={4000} rows={3} placeholder={messageKind==="internal_note"?"Anota algo para el equipo…":"Escribe una respuesta que el cliente verá en su portal…"} aria-label="Nuevo mensaje"/>
        <div className={styles.composerFooter}><small>{messageKind==="message"?"Visible en el portal del cliente. Sin SMS ni email automático.":"Solo para operadores de VMV."}</small>
         <button type="button" className={styles.primary} onClick={()=>void send()} disabled={busy||!draftMessage.trim()}><Send size={15}/>{L("Guardar","Save")}</button></div></div>
        <CaseAttachments source={detail.case.source} caseId={detail.case.id} staff/>
       </div>:<div className={styles.detailContent}><div className={styles.detailBox}><h3>{L("Necesidad del cliente","Customer request")}</h3><p>{detail.case.description}</p></div>
        {detail.case.source==="marketing"?<><div className={styles.detailBox}>
          <h3>{L("Presupuesto","Quote")}</h3><p>{typeof detail.record.quoted_price_cents==="number"?dollars(detail.record.quoted_price_cents):"Todavía sin cotizar."}</p>
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
         <p>{detailText(detail.record.hostname)}</p><p>Tipo: {detailText(detail.record.intent)} · Estado: {status(detail.case.status)}</p>
         <p className={styles.info}>La compra, DNS y publicación necesitan confirmación del proveedor y autorización del titular.</p></div>:null}
        {["marketing","support"].includes(detail.case.source)?<div className={styles.detailBox}><h3>{L("Actualizar estado","Update status")}</h3>
         <div className={styles.actionBox}><label>Estado<select value={stage} onChange={e=>setStage(e.target.value)}>
          {(detail.case.source==="support"?["new","in_progress","needs_customer","resolved","closed"]:
          ["received","approved","in_progress","needs_customer","verified","cancelled"]).map(v=><option key={v} value={v}>{status(v)}</option>)}</select></label>
          {detail.case.source==="marketing"?<><label>Actualización visible<textarea maxLength={1500} rows={3} value={stageNote} onChange={e=>setStageNote(e.target.value)} placeholder="Avance o información que falta…"/></label>
           {stage==="verified"?<label>Enlace HTTPS de evidencia<input value={proof} type="url" onChange={e=>setProof(e.target.value)} placeholder="https://…"/></label>:null}</>:null}
          <button type="button" className={styles.primary} disabled={busy} onClick={()=>void saveState()}><CheckCircle2 size={16}/>{L("Actualizar estado","Update status")}</button>
         </div></div>:null}
        <div className={styles.detailBox}><h3>{L("Historial del caso","Case history")}</h3>
          {detail.historyHasMore?<button type="button" className={styles.secondary} onClick={()=>void loadEarlier(true)}>{L("Ver actividad anterior","Older activity")}</button>:null}
          {detail.history.length?detail.history.map(h=><div key={h.id} className={styles.historyLine}>
           <span>{h.summary}</span><small>{date(h.created_at)} · {h.visibility==="internal"?"Interno":"Compartido"}</small>
          </div>):<p>Todavía no hay cambios registrados en el historial de esta etapa.</p>}
        </div>
       </div>}
      </>:<div className={styles.emptyDetail}><MessageSquare size={34}/><strong>Selecciona una solicitud</strong><p>Conserva la conversación, asigna responsables y registra avances.</p></div>}
     </section>
     <aside className={styles.context}>
      {detail&&selectedRow?<><div className={styles.paneHead}><button type="button" className={styles.backMobile} onClick={()=>setPane("detail")}><ArrowLeft size={17}/>Detalle</button><strong>Información</strong></div>
       <div className={styles.contextBody}><span className={styles.personAvatar}>{selectedRow.client_name.slice(0,1)}</span>
        <h3>{selectedRow.client_name}</h3><small>{detailText(detail.profile?.business_name||detail.case.title)}</small>
        <div className={styles.contextSection}><h4>{L("Información del caso","Case details")}</h4>
         <dl className={styles.dataList}><div><dt>Referencia</dt><dd className={styles.mono}>{shortRef(selectedRow)}</dd></div>
          <div><dt>Tipo</dt><dd>{sourceName(selectedRow.source)}</dd></div><div><dt>Creada</dt><dd>{date(selectedRow.created_at)}</dd></div>
          <div><dt>Actualizada</dt><dd>{date(selectedRow.updated_at)}</dd></div>
          <div><dt>Cliente</dt><dd>{detailText(detail.profile?.first_name)} {detailText(detail.profile?.last_name)}</dd></div>
          {detail.profile?.phone?<div><dt>Teléfono</dt><dd>{detailText(detail.profile.phone)}</dd></div>:null}
          {detail.profile?.city?<div><dt>Ubicación</dt><dd>{detailText(detail.profile.city)} {detailText(detail.profile.state)}</dd></div>:null}
         </dl></div>
        <div className={styles.contextSection}><h4>{L("Organización del trabajo","Case management")}</h4>
         <label>Responsable<select value={assignee} onChange={e=>setAssignee(e.target.value)}>
          <option value="">Sin asignar</option>{operators.map(o=><option key={o.user_id} value={o.user_id}>{o.user_id.slice(0,8)} · {o.role}</option>)}
         </select></label>
         <label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value)}>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{status(v)}</option>)}</select></label>
         <label>Fecha límite <small>(hora de tu dispositivo)</small><input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
         <button type="button" className={styles.primaryWide} onClick={()=>void saveMeta()} disabled={busy}><Check size={15}/>Guardar organización</button>
        </div>
        <div className={styles.contextInfo}><ShieldCheck size={16}/>Este panel utiliza la solicitud original y respeta las autorizaciones de cada servicio.</div>
       </div>
      </>:<div className={styles.blank}>Selecciona un caso para ver su contexto.</div>}
     </aside>
    </div>
   </>:null}

   {section==="clients"?<section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>RELACIONES</span><h3>{L("Directorio de clientes","Client directory")}</h3></div><span className={styles.count}>{clients?.total??"—"} cuentas</span></div>
    {overview?.role!=="admin"?<p className={styles.info}>Solo los administradores pueden consultar el directorio completo.</p>:
    <><label className={styles.search}><Search size={17}/><input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Buscar por nombre, negocio o ciudad…" aria-label="Buscar cliente"/></label>

     <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Cliente / negocio</th><th>Ubicación</th><th>Plan</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      {(clients?.clients||[]).filter(c=>[c.display_name,c.business_name,c.city,c.state].some(v=>String(v||"").toLowerCase().includes(clientSearch.trim().toLowerCase()))).map(c=><tr key={c.id}>
       <td><strong>{c.display_name}</strong><small>{c.business_name||"Sin nombre comercial"}</small></td>
       <td>{[c.city,c.state].filter(Boolean).join(", ")||"—"}</td>
       <td>{c.billing?.plan_code||"Sin plan"}</td>
       <td><span className={styles.chip}>{c.billing?.stripe_mode==="test"?"Prueba · ":""}{c.billing?.status||"Sin facturación"}</span></td>
       <td><button type="button" className={styles.textButton} onClick={()=>{setClientFilter(c.id);setSourceFilter("all");navigate("inbox");}}>Ver casos <ArrowUpRight size={14}/></button></td></tr>)}
     </tbody></table></div>{clients?<div className={styles.pagination}><button type="button" disabled={clientPage<=1} onClick={()=>void loadClients(clientPage-1)}><ArrowLeft size={14}/>Anterior</button><span>{clientPage} / {clients.pages} · {clients.total} cuentas</span><button type="button" disabled={clientPage>=clients.pages} onClick={()=>void loadClients(clientPage+1)}>Siguiente <ArrowRight size={14}/></button></div>:null}{!clients?<div className={styles.blank}>Consultando clientes…</div>:null}
    </>}
   </section>:null}

   {section==="services"?<div className={styles.serviceContent}>
    <div className={styles.serviceCards}>{sources.map(s=><button className={styles.serviceCard} type="button" key={s.id} onClick={()=>openInbox({source:s.id})}>
     <span className={styles.serviceIcon}><s.Icon size={20}/></span><span><strong>{s.label}</strong><small>{s.description}</small></span>
     <b>{overview?.sources[s.id]||0}</b><ArrowUpRight size={16}/></button>)}</div>

    {overview?.role==="admin"?<div className={styles.serviceCards}>
      <div className={styles.serviceCard}><span className={styles.serviceIcon}><Bot size={20}/></span>
        <span><strong>AI Agents</strong><small>{L("Agentes registrados (no necesariamente activos)","Registered agents (not necessarily active)")}</small></span>
        <b>{billing?.aiAgentsTotal??"—"}</b></div>
      <div className={styles.serviceCard}><span className={styles.serviceIcon}><Globe2 size={20}/></span>
        <span><strong>Web Studio</strong><small>{L("Sitios registrados","Registered sites")}</small></span>
        <b>{billing?.websitesTotal??"—"}</b></div>
      <div className={styles.serviceCard}><span className={styles.serviceIcon}><PhoneCall size={20}/></span>
        <span><strong>Smart Call</strong><small>{L("Rutas telefónicas registradas","Recorded phone routes")}</small></span>
        <b>{billing?.linesTotal??"—"}</b></div>
    </div>:null}
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SUPERVISIÓN</span><h2>{L("Facturación y operación","Billing and operations")}</h2></div></div>
    {overview?.role!=="admin"?<div className={styles.surface}><p className={styles.info}>La consulta de facturación requiere rol administrador.</p></div>:
    <div className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>LECTURA SEGURA</span><h3>{L("Suscripciones registradas","Recorded subscriptions")}</h3></div><span className={styles.count}>{billing?.accounts.length||0} cuentas</span></div>
     <p className={styles.info}>Este resumen no permite alterar cobros, saldos ni activar servicios. Las suscripciones de prueba no son pagos reales.</p>
     <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Cuenta</th><th>Plan</th><th>Modo</th><th>Estado</th><th>Minutos restantes (contables)</th></tr></thead><tbody>
      {(billing?.accounts||[]).map(b=><tr key={b.user_id}><td className={styles.mono}>{b.user_id.slice(0,8)}</td><td>{b.plan_code}</td>
       <td><span className={styles.chip} data-status={b.stripe_mode}>{b.stripe_mode==="test"?"TEST":"LIVE"}</span></td>
       <td>{b.status}</td><td>{Math.max(0,b.included_minutes+b.rollover_minutes+b.topup_minutes-b.used_minutes-b.reserved_minutes)}</td></tr>)}
     </tbody></table></div>{!billing?<div className={styles.blank}>Cargando facturación…</div>:null}
     <div className={styles.subtleSeparator}/>
     <h3>Incidencias telefónicas</h3><p className={styles.info}>{billing?.failureCount||0} sesiones con código de error registradas. No se debe interpretar cada error como un cobro.</p>
     {(billing?.failures||[]).slice(0,10).map(f=><div key={f.bridge_sid} className={styles.failure}><TriangleAlert size={15}/><span>{f.error_code||"Error"} · {date(f.started_at)}</span><small>{f.bridge_sid.slice(0,15)}</small></div>)}
    </div>}
   </div>:null}

   {section==="team"?<section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>PERMISOS</span><h3>{L("Personal autorizado","Authorized staff")}</h3></div><span className={styles.count}>{team?.staff.length||0} operadores</span></div>
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

   {section==="testers"&&overview?.role==="admin"?<TestersPanel/>:null}

   {section==="settings"?<div className={styles.settingsGrid}>
    <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>OPERACIÓN</span><h3>{L("Atención y soporte","Customer support")}</h3></div></div>
     {overview?.role!=="admin"?<p className={styles.info}>Los ajustes requieren rol administrador.</p>:<>
     <label className={styles.field}>Plazo objetivo de atención (días)<input type="number" min="1" max="30" value={slaDays} onChange={e=>setSlaDays(e.target.value)}/></label>
     <label className={styles.field}>Mensaje de bienvenida del equipo<textarea rows={4} maxLength={500} value={welcome} onChange={e=>setWelcome(e.target.value)} placeholder="Gracias por contactar a VMV…"/></label>
     <p className={styles.info}>El plazo objetivo se aplica automáticamente a los tickets de soporte nuevos. Para otros servicios, el responsable puede establecer la fecha límite de cada caso.</p>
     <button type="button" disabled={busy} className={styles.primary} onClick={()=>void saveSettings()}><Check size={16}/>{L("Guardar preferencias","Save preferences")}</button>
     </>}</section>
    <section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.eyebrow}>SEGURIDAD</span><h3>{L("Controles administrativos","Security controls")}</h3></div></div>
     <div className={styles.securityLine}><ShieldCheck size={18}/><div><strong>Autenticación existente</strong><small>Supabase Auth, sesión verificada y roles de personal</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><LockKeyhole size={18}/><div><strong>Datos protegidos</strong><small>Las tablas conservan RLS y las mutaciones pasan por el servidor</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><FileClock size={18}/><div><strong>Historial de eventos</strong><small>Mensajes append-only y bitácora de acciones administrativas</small></div><CheckCircle2 size={16}/></div>
     <div className={styles.securityLine}><CreditCard size={18}/><div><strong>Operaciones monetarias</strong><small>Solo consulta: sin reembolsos, compras ni cargos desde Admin</small></div><LockKeyhole size={16}/></div>
     <a className={styles.textButton} href="/vista-app/soporte">Abrir portal de soporte <ExternalLink size={15}/></a>
     {overview?.role==="admin"?<div className={styles.contextSection}><h4>Actividad reciente de administradores</h4>
       {(audit?.events||[]).slice(0,15).map(e=><div key={e.id} className={styles.failure}><FileClock size={14}/><span>{e.action.replaceAll("_"," ")} · {e.source}</span><small>{date(e.created_at)}</small></div>)}
       {!audit?<p className={styles.info}>Cargando bitácora…</p>:audit.events.length===0?<p className={styles.info}>Todavía sin eventos registrados.</p>:null}
     </div>:null}
    </section>
   </div>:null}
  </main>
 </div>;
}

function MarketingDetails({record,onMedia}:{record:Record<string,unknown>;onMedia:(path:string)=>void}){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
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
   {key==="google_profile_data"?<details><summary>{en?"Operator checklist":"Lista de revisión del operador"}</summary><ol>
    <li>{en?"Check eligibility, real business name, category and possible duplicate profiles.":"Revisar elegibilidad, nombre real, categoría y posibles perfiles duplicados."}</li>
    <li>{en?"Quote VMV fees separately; obtain customer approval before starting.":"Cotizar los honorarios de VMV por separado; obtener aprobación antes de empezar."}</li>
    <li>{en?"The customer retains ownership. Request an invitation as manager; never request passwords or verification codes.":"El cliente conserva la propiedad. Solicitar invitación como administrador; nunca pedir contraseñas ni códigos de verificación."}</li>
    <li>{en?"Confirm address visibility, hours, contact details and photos before submitting changes.":"Confirmar dirección pública, horarios, contacto y fotos antes de presentar cambios."}</li>
    <li>{en?"If Google needs customer verification, use Needs customer and explain the next step in the case conversation.":"Si Google requiere verificación del cliente, usar Necesita cliente y explicar el siguiente paso en la conversación del caso."}</li>
    <li>{en?"Complete only after checking the live Google Maps profile, customer access and approved changes. Save the public profile URL as evidence.":"Cerrar solo tras comprobar el perfil real en Google Maps, el acceso del cliente y los cambios aprobados. Guardar el enlace público como evidencia."}</li>
   </ol></details>:null}
   <dl className={styles.dataList}>{Object.entries(entry).filter(([k,v])=>k!=="media"&&v!==null&&v!==""&&v!==undefined).map(([k,v])=>{
    if(k==="hours"&&Array.isArray(v))return <div key={k}><dt>{en?"Business hours":"Horarios del negocio"}</dt><dd>{entry.hoursEnabled?v.map((value,i)=>{
     const h=value as {closed?:boolean;start?:string;end?:string};
     const day=(en?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"])[i]||String(i+1);
     return <div key={i}>{day}: {h.closed?(en?"Closed":"Cerrado"):(h.start+" – "+h.end+(String(h.end)<String(h.start)?(en?" (following day)":" (día siguiente)"):""))}</div>;
    }):(en?"To confirm with customer":"Por confirmar con el cliente")}</dd></div>;
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