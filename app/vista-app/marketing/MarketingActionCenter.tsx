"use client";

import {useEffect,useMemo,useState} from "react";
import type {SupabaseClient,User} from "@supabase/supabase-js";
import {
 ArrowUpRight,CheckCircle2,ClipboardList,ExternalLink,FileCheck2,Globe2,
 LockKeyhole,RefreshCw,Send,ShieldCheck,Wallet,Workflow,HandHeart
} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {categoryLabel} from "@/lib/vmv-business-categories";
import styles from "./MarketingActionCenter.module.css";

type ServiceCode="google_profile"|"apple_maps"|"bing_places"|"yelp_profile"|"search_console"|"seo_improvement"|"campaign_setup"|"review_strategy"|"other";
type Status="received"|"quoted"|"approved"|"in_progress"|"needs_customer"|"verified"|"cancelled";
type RequestRow={
 id:string;owner_id:string;service_code:ServiceCode;business_name:string;category_id:string;
 website_url:string|null;goal_text:string;status:Status;execution_mode:"assisted"|"automated";
 quoted_price_cents:number|null;quote_note:string|null;quote_revision:number;
 staff_update:string|null;evidence_url:string|null;verified_at:string|null;
 created_at:string;updated_at:string
};
type Acceptance={id:string;request_id:string;owner_id:string;quote_revision:number;quoted_price_cents:number;accepted_at:string};
type Service={id:ServiceCode;name:string;why:string;mode:string};
const services:Service[]=[
 {id:"google_profile",name:"Google Search y Maps",why:"Crear, reclamar o mejorar tu perfil empresarial.",mode:"Solicitud con verificación"},
 {id:"apple_maps",name:"Apple Maps",why:"Registrar o corregir la presencia de tu negocio.",mode:"Portal oficial + ayuda"},
 {id:"bing_places",name:"Bing Places",why:"Preparar la ficha y gestionar su verificación.",mode:"Portal oficial + ayuda"},
 {id:"yelp_profile",name:"Yelp",why:"Reclamar o actualizar la información del negocio.",mode:"Portal oficial + ayuda"},
 {id:"search_console",name:"Search Console",why:"Configurar el acceso para descubrir búsquedas reales.",mode:"Conexión autorizada pendiente"},
 {id:"seo_improvement",name:"Mejorar el SEO de mi web",why:"Detectar problemas y solicitar correcciones técnicas.",mode:"Auditoría + ayuda"},
 {id:"campaign_setup",name:"Crear una campaña",why:"Diseñar y preparar una campaña con presupuesto aprobado.",mode:"Con aprobación previa"},
 {id:"review_strategy",name:"Conseguir reseñas honestas",why:"Preparar una solicitud ética y fácil de compartir.",mode:"Herramientas y asistencia"},
 {id:"other",name:"Otra necesidad de marketing",why:"Explica el resultado que deseas conseguir.",mode:"Evaluación individual"}
];
const statusNames:Record<Status,string>={
 received:"Solicitud recibida",quoted:"Presupuesto disponible",approved:"Presupuesto aprobado",
 in_progress:"Trabajo en proceso",needs_customer:"Necesitamos tu ayuda",
 verified:"Resultado verificado",cancelled:"Cancelada"
};
const money=(cents:number)=>new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(cents/100);
const date=(v:string)=>new Intl.DateTimeFormat("es-US",{dateStyle:"medium"}).format(new Date(v));
const safeSite=(value:string)=>{
 if(!value.trim())return null;
 try{const u=new URL(value.trim());return ["https:","http:"].includes(u.protocol)&&Boolean(u.hostname)&&!u.username&&!u.password?u.toString():null;}
 catch{return null;}
};
const errorMessage=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

export default function MarketingActionCenter({businessName,industryId,website,onGoToVisibility}:{
 businessName:string;industryId:string;website:string;onGoToVisibility:()=>void
}){
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [authState,setAuthState]=useState<"checking"|"ready"|"signed_out"|"unconfigured">("checking");
 const [staff,setStaff]=useState(false);
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [approvals,setApprovals]=useState<Acceptance[]>([]);
 const [selected,setSelected]=useState<ServiceCode>("google_profile");
 const [name,setName]=useState(businessName);
 const [site,setSite]=useState(website);
 const [goal,setGoal]=useState("");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [teamView,setTeamView]=useState(false);
 const [activeStaffId,setActiveStaffId]=useState<string|null>(null);
 const [quoteDollars,setQuoteDollars]=useState("");
 const [quoteNote,setQuoteNote]=useState("");
 const [stage,setStage]=useState<Status>("received");
 const [stageUpdate,setStageUpdate]=useState("");
 const [evidence,setEvidence]=useState("");
 useEffect(()=>{
  let alive=true;
  const instance=getSupabase();
  setClient(instance);
  if(!instance){setAuthState("unconfigured");return;}
  const sync=async()=>{
   try{
    const {data,error:authError}=await instance.auth.getUser();
    if(!alive)return;
    if(authError||!data.user||data.user.is_anonymous){setUser(null);setAuthState("signed_out");return;}
    setUser(data.user);setAuthState("ready");
   }catch{if(alive){setUser(null);setAuthState("signed_out");}}
  };
  const {data:listener}=instance.auth.onAuthStateChange(()=>queueMicrotask(()=>{if(alive)void sync();}));
  void sync();
  return()=>{alive=false;listener.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(businessName)setName(prev=>prev||businessName);
  if(website)setSite(prev=>prev||website);
 },[businessName,website]);
 useEffect(()=>{
  if(!client||!user){setRequests([]);setApprovals([]);setStaff(false);setTeamView(false);return;}
  let alive=true;
  const load=async()=>{
   setLoading(true);setError("");
   try{
    const [{data:profile},staffResult]=await Promise.all([
     client.from("smartjob_profiles").select("business_name,website_url").eq("id",user.id).maybeSingle(),
     client.from("vmv_marketing_staff").select("role").eq("user_id",user.id).maybeSingle()
    ]);
    if(!alive)return;
    if(profile?.business_name)setName(prev=>prev||profile.business_name);
    if(profile?.website_url)setSite(prev=>prev||profile.website_url);
    if(staffResult.error)throw staffResult.error;
    setStaff(Boolean(staffResult.data));
    const [r,a]=await Promise.all([
     client.from("vmv_marketing_requests").select("*").order("created_at",{ascending:false}).limit(80),
     client.from("vmv_marketing_quote_acceptances").select("*").order("accepted_at",{ascending:false}).limit(120)
    ]);
    if(r.error)throw r.error;
    if(a.error)throw a.error;
    if(alive){setRequests((r.data||[]) as RequestRow[]);setApprovals((a.data||[]) as Acceptance[]);}
   }catch(e){if(alive)setError("No se pudo consultar el centro de solicitudes. "+errorMessage(e,"Revisa la conexión."));}
   finally{if(alive)setLoading(false);}
  };
  void load();
  return()=>{alive=false;};
 },[client,user]);
 const refresh=async()=>{
  if(!client||!user)return;
  setLoading(true);setError("");
  try{
   const [r,a]=await Promise.all([
    client.from("vmv_marketing_requests").select("*").order("created_at",{ascending:false}).limit(80),
    client.from("vmv_marketing_quote_acceptances").select("*").order("accepted_at",{ascending:false}).limit(120)
   ]);
   if(r.error)throw r.error;
   if(a.error)throw a.error;
   setRequests((r.data||[]) as RequestRow[]);setApprovals((a.data||[]) as Acceptance[]);
  }catch(e){setError(errorMessage(e,"Error al consultar solicitudes"));}
  finally{setLoading(false);}
 };
 const ownRequests=useMemo(()=>requests.filter(r=>r.owner_id===user?.id),[requests,user]);
 const shown=teamView&&staff?requests:ownRequests;
 const isAccepted=(req:RequestRow)=>approvals.some(a=>a.request_id===req.id&&a.quote_revision===req.quote_revision&&a.quoted_price_cents===req.quoted_price_cents);
 const submit=async()=>{
  setError("");setMessage("");
  if(!client||!user){setError("Inicia sesión en VMV Business antes de crear una solicitud.");return;}
  if(name.trim().length<2||name.trim().length>150){setError("Introduce el nombre comercial (2 a 150 caracteres).");return;}
  if(goal.trim().length<12||goal.trim().length>1500){setError("Explica el resultado que necesitas en al menos 12 caracteres.");return;}
  if(site.trim()&&!safeSite(site)){setError("La web debe ser una URL pública válida, por ejemplo https://minegocio.com.");return;}
  if(!consent){setError("Confirma que autorizas a VMV a usar los datos de esta solicitud para responderte.");return;}
  setBusy(true);
  try{
   // The DB allows customers to insert only input fields, never quote, status or verification.
   const {data, error:insertError}=await client.from("vmv_marketing_requests").insert({
    owner_id:user.id,service_code:selected,business_name:name.trim(),
    category_id:industryId||"other",website_url:safeSite(site),goal_text:goal.trim(),
    agreed_to_contact:true
   }).select("id").single();
   if(insertError)throw insertError;
   setMessage("Solicitud registrada ("+String(data.id).slice(0,8)+"). El equipo la evaluará y te informará si requiere presupuesto. No hemos publicado nada ni cobrado.");
   setGoal("");setConsent(false);
   await refresh();
  }catch(e){setError("No se pudo registrar la solicitud. "+errorMessage(e,"Vuelve a intentarlo."));}
  finally{setBusy(false);}
 };
 const accept=async(req:RequestRow)=>{
  if(!client||!user||req.owner_id!==user.id||req.status!=="quoted"||req.quoted_price_cents===null)return;
  if(isAccepted(req))return;
  if(!window.confirm("¿Apruebas el presupuesto de "+money(req.quoted_price_cents)+"? Esta aprobación no cobra dinero, pero permite al equipo comenzar el servicio."))return;
  setError("");setMessage("");setBusy(true);
  try{
   const {error:acceptError}=await client.from("vmv_marketing_quote_acceptances").insert({
    owner_id:user.id,request_id:req.id,quote_revision:req.quote_revision,
    quoted_price_cents:req.quoted_price_cents
   });
   if(acceptError)throw acceptError;
   setMessage("Presupuesto "+money(req.quoted_price_cents)+" aprobado y registrado. No se ha realizado ningún cobro.");
   await refresh();
  }catch(e){setError(errorMessage(e,"No se pudo registrar tu aprobación"));}
  finally{setBusy(false);}
 };
 const saveQuote=async(req:RequestRow)=>{
  if(!client||!staff)return;
  const dollars=quoteDollars.trim();
  const amount=Number(dollars);
  if(!/^\d+(\.\d{1,2})?$/.test(dollars)||!Number.isFinite(amount)||amount>1000000){
   setError("Introduce un precio válido en USD, incluido 0 si el servicio es gratuito.");return;
  }
  if(quoteNote.trim().length<8){setError("Describe qué incluye el presupuesto antes de enviarlo.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const {error:quoteError}=await client.from("vmv_marketing_requests")
    .update({quoted_price_cents:Math.round(amount*100),quote_note:quoteNote.trim(),
     staff_update:"Presupuesto preparado. Esperamos tu aprobación."})
    .eq("id",req.id);
   if(quoteError)throw quoteError;
   setMessage("Presupuesto guardado. El cliente puede verlo y aprobarlo desde su cuenta.");
   await refresh();
  }catch(e){setError(errorMessage(e,"No fue posible guardar el presupuesto"));}
  finally{setBusy(false);}
 };
 const updateStage=async(req:RequestRow)=>{
  if(!client||!staff)return;
  if(["approved","in_progress","verified"].includes(stage)&&!isAccepted(req)){
   setError("No puedes comenzar o verificar el trabajo sin la aprobación del presupuesto actual.");return;
  }
  const url=safeSite(evidence);
  if(stage==="verified"&&!url){setError("Para verificar un resultado debes incluir una URL pública válida como evidencia.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const payload={
    status:stage,staff_update:stageUpdate.trim().slice(0,1500)||null,
    evidence_url:stage==="verified"?url:req.evidence_url,
    verified_at:stage==="verified"?new Date().toISOString():null
   };
   const {error:upError}=await client.from("vmv_marketing_requests").update(payload).eq("id",req.id);
   if(upError)throw upError;
   setMessage("Estado actualizado. El cliente verá el cambio al consultar su solicitud.");
   await refresh();
  }catch(e){setError(errorMessage(e,"No se pudo actualizar la solicitud"));}
  finally{setBusy(false);}
 };
 const openStaff=(req:RequestRow)=>{
  setActiveStaffId(req.id);setStage(req.status);
  setQuoteDollars(req.quoted_price_cents===null?"":(req.quoted_price_cents/100).toFixed(2));
  setQuoteNote(req.quote_note||"");setStageUpdate(req.staff_update||"");setEvidence(req.evidence_url||"");
 };
 return <div className={styles.root}>
  <header className={styles.hero}>
   <span><Workflow size={16}/> CENTRO DE ACCIONES · BETA</span>
   <h2>Dinos qué necesitas. VMV organiza cómo hacerlo.</h2>
   <p>Automatizamos lo que tiene una integración segura; si falta una API o una verificación, podrás solicitar asistencia dentro de VMV.</p>
  </header>
  <div className={styles.quickActions}>
   <button type="button" onClick={onGoToVisibility}><Globe2 size={19}/><strong>Analizar mi web</strong><small>Auditoría técnica automática y herramientas de directorios</small><ArrowUpRight size={16}/></button>
   <button type="button" onClick={()=>{setSelected("google_profile");document.getElementById("vmv-marketing-request")?.scrollIntoView({behavior:"smooth",block:"start"});}}><FileCheck2 size={19}/><strong>Registrar mi negocio</strong><small>Google y directorios con ayuda y verificación</small><ArrowUpRight size={16}/></button>
  </div>
  <section className={styles.panel} id="vmv-marketing-request">
   <div className={styles.panelTop}><div><span>01 · SOLICITAR UN RESULTADO</span><h3>¿Qué quieres que hagamos?</h3></div><ShieldCheck size={22}/></div>
   <div className={styles.services}>
    {services.map(s=><button type="button" key={s.id} onClick={()=>setSelected(s.id)} className={selected===s.id?styles.serviceActive:styles.service} aria-pressed={selected===s.id}>
     <strong>{s.name}</strong><small>{s.why}</small><em>{s.mode}</em>
    </button>)}
   </div>
   <div className={styles.formGrid}>
    <label>Nombre comercial<input value={name} maxLength={150} onChange={e=>setName(e.target.value)} placeholder="Tu empresa"/></label>
    <label>Sitio web (opcional)<input value={site} maxLength={500} onChange={e=>setSite(e.target.value)} placeholder="https://minegocio.com" inputMode="url"/></label>
   </div>
   <label className={styles.goalLabel}>¿Qué resultado necesitas?
    <textarea value={goal} maxLength={1500} onChange={e=>setGoal(e.target.value)} rows={4} placeholder="Ej. Tengo un negocio de repostería y quiero que aparezca correctamente en Google Maps. Mi dirección es privada y atiendo por encargo."/>
    <small>{goal.length}/1500 caracteres. Cuéntanos qué esperas conseguir; no compartas contraseñas ni datos bancarios.</small>
   </label>
   <label className={styles.permission}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    <span>Autorizo a VMV a utilizar estos datos para gestionar y responder a esta solicitud. <strong>No autorizo publicaciones, pagos ni cambios externos sin una aprobación aparte.</strong></span>
   </label>
   {authState==="checking"?<p className={styles.muted}>Verificando tu cuenta…</p>:
    authState!=="ready"?<div className={styles.signIn}><LockKeyhole size={19}/><p>{authState==="unconfigured"?"El inicio de sesión aún no está configurado en este entorno.":"Inicia sesión en VMV Business para guardar y seguir tus solicitudes."}</p><a href="/vista-app">Acceder a VMV Business <ArrowUpRight size={15}/></a></div>:
    <button type="button" className={styles.submit} disabled={busy||loading} onClick={()=>void submit()}><Send size={16}/> {busy?"Registrando…":"Enviar solicitud a VMV"}</button>
   }
   <p className={styles.disclaimer}>No hay cargos por enviar una solicitud. Si el trabajo tiene coste, recibirás un presupuesto y deberás aprobarlo antes de que comience.</p>
  </section>
  <section className={styles.panel}>
   <div className={styles.panelTop}><div><span>02 · SEGUIMIENTO REAL</span><h3>Mis solicitudes</h3></div><button type="button" onClick={()=>void refresh()} disabled={loading||!user} className={styles.refresh}><RefreshCw size={16}/> Actualizar</button></div>
   {staff?<div className={styles.viewToggle}><button type="button" aria-pressed={!teamView} onClick={()=>setTeamView(false)}>Mis solicitudes</button><button type="button" aria-pressed={teamView} onClick={()=>setTeamView(true)}>Bandeja del equipo</button></div>:null}
   {!user?<p className={styles.muted}>Tus solicitudes aparecerán aquí cuando inicies sesión.</p>:loading?<p className={styles.muted}>Cargando solicitudes…</p>:
    shown.length===0?<div className={styles.empty}><ClipboardList size={25}/><strong>Aún no hay solicitudes</strong><span>Envía la primera desde el formulario anterior.</span></div>:
    <div className={styles.requestList}>{shown.map(req=>{
     const approved=isAccepted(req);
     const service=services.find(s=>s.id===req.service_code)?.name||req.service_code;
     return <article className={styles.request} key={req.id}>
      <div className={styles.requestTop}><div><strong>{service}</strong><small>{req.business_name} · {date(req.created_at)} · #{req.id.slice(0,8)}</small></div>
       <span className={req.status==="verified"?styles.verified:styles.status}>{statusNames[req.status]}</span></div>
      <p>{req.goal_text}</p>
      {req.staff_update?<div className={styles.staffNote}><strong>Actualización de VMV:</strong> {req.staff_update}</div>:null}
      {req.quoted_price_cents!==null?<div className={styles.quote}>
       <div><Wallet size={18}/><span><strong>{money(req.quoted_price_cents)}</strong> {req.quoted_price_cents===0?"Servicio gratuito":"Presupuesto propuesto"}<small>{req.quote_note||"Detalles pendientes"}</small></span></div>
       {approved?<span className={styles.accepted}><CheckCircle2 size={15}/> Aprobado por el cliente</span>:
        req.owner_id===user.id&&req.status==="quoted"?
         <button type="button" disabled={busy} onClick={()=>void accept(req)}>Aprobar {money(req.quoted_price_cents)}</button>:null}
      </div>:<p className={styles.notQuoted}>El equipo todavía no ha emitido un presupuesto. Ningún trabajo de pago ha comenzado.</p>}
      {req.status==="verified"&&req.evidence_url?<a className={styles.evidence} href={req.evidence_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Ver evidencia del resultado</a>:null}
      {staff&&teamView?<div className={styles.staffControls}>
       <button type="button" onClick={()=>activeStaffId===req.id?setActiveStaffId(null):openStaff(req)}>{activeStaffId===req.id?"Cerrar controles":"Gestionar como equipo"}</button>
       {activeStaffId===req.id?<div className={styles.staffForm}>
        <span>Presupuesto (USD, 0 = gratis)</span><input inputMode="decimal" value={quoteDollars} onChange={e=>setQuoteDollars(e.target.value)} placeholder="0.00"/>
        <span>Qué incluye</span><textarea value={quoteNote} onChange={e=>setQuoteNote(e.target.value)} rows={2}/>
        <button type="button" disabled={busy} onClick={()=>void saveQuote(req)}>Enviar / actualizar presupuesto</button>
        <span>Estado</span><select value={stage} onChange={e=>setStage(e.target.value as Status)}>
         {(["received","quoted","approved","in_progress","needs_customer","verified","cancelled"] as Status[]).map(id=><option key={id} value={id}>{statusNames[id]}</option>)}
        </select>
        <span>Actualización para el cliente</span><textarea value={stageUpdate} onChange={e=>setStageUpdate(e.target.value)} rows={2}/>
        {stage==="verified"?<><span>URL pública que demuestra el resultado</span><input type="url" value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="https://..."/></>:null}
        <button type="button" disabled={busy||(["approved","in_progress","verified"].includes(stage)&&!approved)} onClick={()=>void updateStage(req)}>Guardar estado y evidencia</button>
       </div>:null}
      </div>:null}
     </article>;
    })}</div>
   }
  </section>
  <div className={styles.bottomNote}><HandHeart size={17}/><p>Las APIs y portales externos requieren permisos propios. Una solicitud recibida no significa que el negocio haya sido registrado, ni que el servicio haya empezado.</p></div>
  {message?<p role="status" className={styles.notice}>{message}</p>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
 </div>;
}
