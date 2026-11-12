"use client";

import {useEffect,useMemo,useState} from "react";
import type {SupabaseClient,User} from "@supabase/supabase-js";
import {
 ArrowLeft,ArrowRight,ArrowUpRight,Apple,Check,CheckCircle2,ClipboardList,ExternalLink,
 FileCheck2,Gauge,Globe2,HandHeart,LayoutGrid,LockKeyhole,MapPinned,
 Megaphone,MessageSquareHeart,Navigation,RefreshCw,Search,Send,ShieldCheck,
 Sparkles,Star,Wallet,Workflow
} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS,categoryLabel} from "@/lib/vmv-business-categories";
import styles from "./MarketingActionCenter.module.css";

export type ServiceCode="google_profile"|"apple_maps"|"bing_places"|"yelp_profile"|"search_console"|"seo_improvement"|"campaign_setup"|"review_strategy"|"other";
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
 {id:"google_profile",name:"Aparecer en Google",why:"Crea o mejora tu perfil de negocio.",mode:"Solicitud con verificación"},
 {id:"apple_maps",name:"Apple Maps",why:"Registrar o corregir la presencia de tu negocio.",mode:"Portal oficial + ayuda"},
 {id:"bing_places",name:"Bing Places",why:"Preparar la ficha y gestionar su verificación.",mode:"Portal oficial + ayuda"},
 {id:"yelp_profile",name:"Yelp",why:"Reclamar o actualizar la información del negocio.",mode:"Portal oficial + ayuda"},
 {id:"search_console",name:"Search Console",why:"Configurar el acceso para descubrir búsquedas reales.",mode:"Conexión autorizada pendiente"},
 {id:"seo_improvement",name:"Mejorar mi web",why:"Descubre mejoras para tu sitio.",mode:"Auditoría + ayuda"},
 {id:"campaign_setup",name:"Crear una campaña",why:"Diseñar y preparar una campaña con presupuesto aprobado.",mode:"Con aprobación previa"},
 {id:"review_strategy",name:"Gestionar reseñas",why:"Responde reseñas y pide opiniones.",mode:"Herramientas y asistencia"},
 {id:"other",name:"Otra necesidad de marketing",why:"Explica el resultado que deseas conseguir.",mode:"Evaluación individual"}
];
type WizardStep=0|1|2|3|4;
const wizardTitles=["Servicio","Tu negocio","Tu objetivo","Confirmar"] as const;
const serviceIcons:Record<ServiceCode,typeof MapPinned>={
 google_profile:MapPinned,apple_maps:Apple,bing_places:Navigation,yelp_profile:Star,
 search_console:Search,seo_improvement:Gauge,campaign_setup:Megaphone,
 review_strategy:MessageSquareHeart,other:Sparkles
};
const suggestedGoals:Record<ServiceCode,string[]>={
 google_profile:["Quiero que mi negocio aparezca en Google Maps.","Quiero reclamar mi ficha empresarial existente.","Necesito corregir los datos de mi negocio en Google."],
 apple_maps:["Quiero registrar mi negocio en Apple Maps.","Necesito reclamar o corregir mi ficha de Apple Maps."],
 bing_places:["Quiero que mi negocio aparezca en Bing Maps.","Necesito reclamar o actualizar mi ficha en Bing Places."],
 yelp_profile:["Quiero reclamar el perfil de mi negocio en Yelp.","Necesito actualizar la información de mi negocio en Yelp."],
 search_console:["Quiero conocer qué búsquedas llevan personas a mi web.","Necesito ayuda para configurar Google Search Console."],
 seo_improvement:["Quiero mejorar la velocidad y el SEO de mi sitio web.","Necesito identificar y solucionar problemas de posicionamiento."],
 campaign_setup:["Quiero preparar una campaña para conseguir clientes.","Necesito ayuda para definir una oferta y un presupuesto publicitario."],
 review_strategy:["Quiero pedir reseñas auténticas a mis clientes.","Necesito mejorar la forma en que respondo a mis reseñas."],
 other:["Quiero explicar una necesidad de marketing para mi negocio.","Necesito ayuda para conseguir más clientes de manera medible."]
};
const statusNames:Record<Status,string>={
 received:"Solicitud recibida",quoted:"Presupuesto disponible",approved:"Presupuesto aprobado",
 in_progress:"Trabajo en proceso",needs_customer:"Necesitamos tu ayuda",
 verified:"Completado con evidencia",cancelled:"Cancelada"
};
const money=(cents:number)=>new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(cents/100);
const date=(v:string)=>new Intl.DateTimeFormat("es-US",{dateStyle:"medium"}).format(new Date(v));
const safeSite=(value:string)=>{
 if(!value.trim())return null;
 try{const u=new URL(value.trim());return ["https:","http:"].includes(u.protocol)&&Boolean(u.hostname)&&!u.username&&!u.password?u.toString():null;}
 catch{return null;}
};
const errorMessage=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

export default function MarketingActionCenter({businessName,industryId,website,onGoToVisibility,preselectedService}:{
 businessName:string;industryId:string;website:string;onGoToVisibility:()=>void;preselectedService?:ServiceCode
}){
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [savedCategory,setSavedCategory]=useState("");
 const [authState,setAuthState]=useState<"checking"|"ready"|"signed_out"|"unconfigured">("checking");
 const [staff,setStaff]=useState(false);
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [approvals,setApprovals]=useState<Acceptance[]>([]);
 const [selected,setSelected]=useState<ServiceCode>(preselectedService||"google_profile");
 const [wizardStep,setWizardStep]=useState<WizardStep>(preselectedService?1:0);
 const [wizardError,setWizardError]=useState("");
 const [submittedId,setSubmittedId]=useState<string|null>(null);
 const [chosenCategory,setChosenCategory]=useState("");
 useEffect(()=>{
  if(preselectedService){
   setSelected(preselectedService);setGoal("");setConsent(false);
   setWizardStep(1);setWizardError("");setSubmittedId(null);
  }
 },[preselectedService]);
 const [name,setName]=useState(businessName);
 const [site,setSite]=useState(website);
 const [goal,setGoal]=useState("");
 const [reviewInput,setReviewInput]=useState("");
 const [reviewTone,setReviewTone]=useState<"cordial"|"breve">("cordial");
 const [auditData,setAuditData]=useState<{scores:{performance:number|null;seo:number|null;accessibility:number|null};recommendations:string[]}|null>(null);
 const [auditPending,setAuditPending]=useState(false);
 const [auditError,setAuditError]=useState("");
 const reviewNegative=/\b(malo|mala|pésimo|pesimo|terrible|decepcion|retraso|tarde|problema|queja|frío|frio|incorrecto|error|horrible|nunca|mal servicio|no recomiendo)\b/i.test(reviewInput);
 const reviewPositive=/\b(excelente|fantástico|fantastico|encantó|encanto|delicioso|deliciosa|recomiendo|increíble|increible|perfecto|perfecta|maravilloso|maravillosa|amable)\b/i.test(reviewInput);
 const answerReview=reviewInput.trim()?(reviewNegative?
  (reviewTone==="breve"?"Lamentamos que tu experiencia no haya sido la esperada. Gracias por contárnoslo; queremos mejorar.":"Gracias por compartir tu experiencia. Lamentamos que no haya sido lo que esperabas. En "+name+" nos tomamos en serio tus comentarios y queremos entender lo ocurrido para mejorar. Te invitamos a contactarnos por nuestros canales habituales."):
  reviewPositive?
  (reviewTone==="breve"?"¡Muchas gracias por tu reseña! Nos alegra saber que disfrutaste tu experiencia.":"¡Muchísimas gracias por compartir tu experiencia! Nos alegra saber que la disfrutaste. En "+name+" valoramos mucho que hayas dedicado tiempo a escribirnos. ¡Esperamos verte pronto!"):
  (reviewTone==="breve"?"Gracias por compartir tu opinión. La tendremos en cuenta.":"Gracias por tomarte el tiempo de compartir tu experiencia. En "+name+" valoramos tus comentarios y los tendremos en cuenta para seguir mejorando.")):"";
 const analyzeSite=async()=>{
  if(!safeSite(site)){setAuditError("Añade un enlace válido en el paso anterior.");return;}
  setAuditPending(true);setAuditError("");setAuditData(null);
  try{
   const response=await fetch("/api/marketing/site-audit?url="+encodeURIComponent(safeSite(site)||""));
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"No se pudo analizar la web.");
   const recommendations=(result.recommendations||[]).slice(0,3) as string[];
   setAuditData({scores:result.scores,recommendations});
   setGoal(("Solicito ayuda para mejorar mi web. Auditoría PageSpeed: velocidad "+(result.scores?.performance??"sin dato")+"/100; SEO "+(result.scores?.seo??"sin dato")+"/100; accesibilidad "+(result.scores?.accessibility??"sin dato")+"/100. Mejoras: "+recommendations.join("; ")).slice(0,1500));
  }catch(error){setAuditError(errorMessage(error,"No se pudo analizar la web."));}
  finally{setAuditPending(false);}
 };
 const reviewRequestMessage="¡Hola! Gracias por elegir "+name+". ¿Podrías compartir una reseña honesta sobre tu experiencia? Tu opinión nos ayuda a mejorar.";

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
 const revealWizard=()=>document.getElementById("vmv-marketing-request")?.scrollIntoView({behavior:"smooth",block:"start"});
 const closeKeyboard=()=>{
  const active=document.activeElement;
  if(active instanceof HTMLElement&&active.matches("input, textarea, select"))active.blur();
 };
 const editWizardStep=(step:WizardStep)=>{closeKeyboard();setWizardStep(step);setWizardError("");revealWizard();};
 const chooseService=(code:ServiceCode)=>{
  if(code!==selected){setGoal("");setConsent(false);setReviewInput("");setAuditData(null);setAuditError("");}
  setSelected(code);setWizardStep(1);setWizardError("");setSubmittedId(null);revealWizard();
 };
 const goNext=()=>{
  setWizardError("");
  if(wizardStep===1){
   if(name.trim().length<2||name.trim().length>150){setWizardError("Escribe el nombre comercial de tu negocio.");return;}
   if(site.trim()&&!safeSite(site)){setWizardError("Comprueba el enlace de tu web: debe comenzar con https://.");return;}
  }
  if(wizardStep===2&&goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5)){setWizardError("Elige una opción o describe lo que necesitas en al menos 12 caracteres.");return;}
  if(wizardStep===2&&goal.trim().length>1500){setWizardError("El mensaje no debe superar 1500 caracteres.");return;}
  if(wizardStep<3){closeKeyboard();setWizardStep((wizardStep+1) as WizardStep);revealWizard();}
 };
 const goBack=()=>{setWizardError("");if(wizardStep>0&&wizardStep<4)editWizardStep((wizardStep-1) as WizardStep);};
 const effectiveCategory=chosenCategory||industryId||savedCategory||"other";
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
    const [{data:profile},staffResult,{data:category}]=await Promise.all([
     client.from("smartjob_profiles").select("business_name,website_url").eq("id",user.id).maybeSingle(),
     client.from("vmv_marketing_staff").select("role").eq("user_id",user.id).maybeSingle(),
     client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",user.id).maybeSingle()
    ]);
    if(!alive)return;
    if(profile?.business_name)setName(prev=>prev||profile.business_name);
    if(profile?.website_url)setSite(prev=>prev||profile.website_url);
    if(category?.category_id)setSavedCategory(category.category_id);
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
  setWizardError("");
  if(wizardStep!==3)return;
  if(!client||!user){setWizardError("Inicia sesión en VMV Business para enviar tu solicitud.");return;}
  if(name.trim().length<2||name.trim().length>150){setWizardStep(1);setWizardError("Introduce el nombre comercial (2 a 150 caracteres).");return;}
  if((goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5))||goal.trim().length>1500){setWizardStep(2);setWizardError("Elige una necesidad o describe el resultado que buscas.");return;}
  if(site.trim()&&!safeSite(site)){setWizardStep(1);setWizardError("La web debe tener una URL válida.");return;}
  if(!consent){setWizardError("Marca la autorización para que podamos atender la solicitud.");return;}
  setBusy(true);
  try{
   // The DB allows customers to insert only input fields, never quote, status or verification.
   const {data, error:insertError}=await client.from("vmv_marketing_requests").insert({
    owner_id:user.id,service_code:selected,business_name:name.trim(),
    category_id:effectiveCategory,website_url:safeSite(site),goal_text:(selected==="review_strategy"&&reviewInput.trim()?("Reseña: "+reviewInput.trim().slice(0,650)+" | Respuesta sugerida, pendiente de revisión: "+answerReview).slice(0,1500):goal.trim()),
    agreed_to_contact:true
   }).select("id").single();
   if(insertError)throw insertError;
   const requestId=String(data.id).slice(0,8);
   setSubmittedId(requestId);setWizardStep(4);
   setMessage("Solicitud #"+requestId+" registrada correctamente. Sin pagos ni publicaciones automáticas.");
   setGoal("");setConsent(false);
   await refresh();
  }catch(e){setWizardError("No se pudo registrar la solicitud. "+errorMessage(e,"Vuelve a intentarlo."));}
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
  {wizardStep===0?<header className={styles.catalogHeading}><h2>¿Qué quieres hacer hoy?</h2><p>Elige un servicio y te ayudamos paso a paso.</p><a href="#vmv-marketing-history" className={styles.historyLink}><ClipboardList size={16}/> Mis solicitudes</a></header>:null}
  <section className={styles.wizardPanel} id="vmv-marketing-request" aria-label="Crear solicitud de marketing">
   {wizardStep===4?<div className={styles.wizardSuccess} role="status">
    <div className={styles.successIcon}><CheckCircle2 size={33}/></div>
    <span className={styles.overline}>SOLICITUD RECIBIDA</span>
    <h3>¡Listo! Ya tenemos tu solicitud.</h3>
    <p>Referencia <strong>#{submittedId}</strong>. La revisaremos y verás aquí si hace falta un presupuesto o alguna información adicional.</p>
    <div className={styles.successReminder}><ShieldCheck size={17}/> No hemos cobrado ni publicado nada. Cualquier coste necesitará tu aprobación.</div>
    <div className={styles.wizardButtons}>
     <button type="button" className={styles.wizardBack} onClick={()=>{setWizardStep(0);setSubmittedId(null);setWizardError("");revealWizard();}}>Crear otra solicitud</button>
     <button type="button" className={styles.wizardPrimary} onClick={()=>document.getElementById("vmv-marketing-history")?.scrollIntoView({behavior:"smooth",block:"start"})}>Ver seguimiento <ArrowRight size={16}/></button>
    </div>
   </div>:<>
    {wizardStep>0?<div className={styles.wizardHeading}>
     <div><span className={styles.overline}><LayoutGrid size={15}/> ASISTENTE DE MARKETING</span>
      <h3>{wizardStep===0?"¿En qué te ayudamos hoy?":wizardStep===1?"Primero, tu negocio":wizardStep===2?"¿Qué necesitas conseguir?":"Confirma tu solicitud"}</h3>
      <p>{wizardStep===0?"Elige una opción para comenzar. Te guiaremos paso a paso.":wizardStep===1?"Usaremos los datos que ya conocemos para ahorrarte trabajo.":wizardStep===2?"Toca una sugerencia o cuéntanos brevemente qué necesitas.":"Revisa todo antes de enviarlo. No se realizará ningún cambio externo."}</p>
     </div>
     <span className={styles.stepCount}>{wizardStep+1} / 4</span>
    </div>:null}
    {wizardStep>0?<ol className={styles.stepper} aria-label="Progreso de la solicitud">
     {wizardTitles.map((label,index)=><li key={label} className={index===wizardStep?styles.stepCurrent:index<wizardStep?styles.stepDone:styles.stepPending} aria-current={index===wizardStep?"step":undefined}>
      <span className={styles.stepBubble}>{index<wizardStep?<Check size={14}/>:index+1}</span><span>{label}</span>
     </li>)}
    </ol>:null}
    {wizardStep===0?<div className={styles.wizardBody}>
     <div className={styles.servicePicker}>
      {services.filter(service=>["google_profile","seo_improvement","review_strategy"].includes(service.id)).map(service=>{
       const ServiceIcon=serviceIcons[service.id];
       return <button type="button" key={service.id} onClick={()=>chooseService(service.id)} className={styles.serviceTile} aria-label={"Elegir "+service.name}>
        <span className={styles.serviceIcon}><ServiceIcon size={23} strokeWidth={1.8}/></span>
        <span className={styles.serviceText}><strong>{service.name}</strong><small>{service.why}</small></span>
        <ArrowUpRight size={16} className={styles.tileArrow}/>
       </button>;
      })}
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> El envío de solicitudes es gratis. Si un servicio cuesta dinero, conocerás el precio antes de aprobarlo.</p>
    </div>:null}
    {wizardStep===1?<div className={styles.wizardBody}>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>SERVICIO ELEGIDO</small><strong>{services.find(s=>s.id===selected)?.name}</strong></span><button type="button" onClick={()=>{setWizardStep(0);setWizardError("");}}>Cambiar</button></div>
     <div className={styles.wizardFields}>
      <label className={styles.wizardField}><span>Nombre de tu negocio <em>Obligatorio</em></span><input type="text" autoComplete="organization" value={name} maxLength={150} onChange={e=>{setName(e.target.value);setWizardError("");}} placeholder="Ej. Mi negocio" /></label>
      <label className={styles.wizardField}><span>¿A qué se dedica?</span><select value={effectiveCategory} onChange={e=>setChosenCategory(e.target.value)}>
       {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>{BUSINESS_CATEGORIES.filter(c=>c.group===group).map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</optgroup>)}
      </select></label>
      <label className={styles.wizardField}><span>Sitio web <em>Opcional</em></span><input type="url" inputMode="url" autoComplete="url" value={site} maxLength={500} onChange={e=>{setSite(e.target.value);setWizardError("");}} placeholder="https://tusitio.com"/></label>
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> Si ya registraste tu negocio en VMV, los datos disponibles aparecen automáticamente.</p>
    </div>:null}
    {wizardStep===2?<div className={styles.wizardBody}>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>ESTAMOS PREPARANDO</small><strong>{services.find(s=>s.id===selected)?.name}</strong></span></div>
     {selected==="seo_improvement"?<div className={styles.specialTool}>
      <strong>Analizar mi sitio</strong>
      <p>{site.trim()||"Añade el enlace de tu web en el paso anterior."}</p>
      <button type="button" className={styles.toolButton} disabled={auditPending||!safeSite(site)} onClick={()=>void analyzeSite()}>{auditPending?"Analizando…":"Analizar gratis"}</button>
      {auditError?<p role="alert">{auditError}</p>:null}
      {auditData?<div className={styles.auditSummary}><span>Velocidad {auditData.scores.performance??"—"}/100 · SEO {auditData.scores.seo??"—"}/100</span><strong>Tres mejoras prioritarias</strong>{auditData.recommendations.length?auditData.recommendations.map((v,i)=><p key={i}>{i+1}. {v}</p>):<p>No hay alertas en las comprobaciones prioritarias.</p>}<small>Auditoría técnica PageSpeed, no garantiza visitas ni ventas.</small></div>:null}
     </div>:null}
     {selected==="review_strategy"?<div className={styles.specialTool}>
       <strong>¿Qué necesitas?</strong>
       <div className={styles.goalPresets}><button type="button" className={styles.preset} onClick={()=>{setGoal("Quiero pedir reseñas honestas a mis clientes.");setReviewInput("");}}>Pedir reseñas</button><button type="button" className={styles.preset} onClick={()=>setGoal("Necesito responder una reseña.")}>Responder una reseña</button></div>
       <label className={styles.goalLabel}>Pega una reseña (opcional)<textarea rows={3} maxLength={650} value={reviewInput} onChange={e=>{setReviewInput(e.target.value);setGoal(e.target.value.trim()?"Necesito responder esta reseña y revisar la respuesta sugerida.":"");}} placeholder="Texto de la reseña del cliente…"/></label>
       {reviewInput.trim()?<div className={styles.auditSummary}><strong>Respuesta para revisar</strong><p>{answerReview}</p><div className={styles.goalPresets}><button type="button" className={styles.preset} onClick={()=>setReviewTone(reviewTone==="cordial"?"breve":"cordial")}>Cambiar tono</button><button type="button" className={styles.toolButton} onClick={()=>void navigator.clipboard?.writeText(answerReview)}>Copiar respuesta</button></div><small>Revisa antes de usarla. Nunca publicamos sin autorización.</small></div>:null}
       {!reviewInput.trim()&&goal.includes("pedir reseñas")?<div className={styles.auditSummary}><p>{reviewRequestMessage}</p><button type="button" className={styles.toolButton} onClick={()=>void navigator.clipboard?.writeText(reviewRequestMessage)}>Copiar mensaje</button></div>:null}
     </div>:null}
     {selected==="google_profile"?<p className={styles.wizardHint}>Google puede requerir verificar que el negocio es tuyo. VMV te ayudará con ese proceso.</p>:null}
     {selected!=="review_strategy"?<span className={styles.presetLabel}>Elige qué necesitas</span>:null}
     <div className={styles.goalPresets}>{(selected==="review_strategy"?[]:suggestedGoals[selected]).map(option=><button key={option} type="button" className={goal===option?styles.presetActive:styles.preset} aria-pressed={goal===option} onClick={()=>{setGoal(option);setWizardError("");}}>
      <CheckCircle2 size={16}/>{option}
     </button>)}</div>
     <label className={styles.goalLabel}>{selected==="review_strategy"?"¿Necesitas ayuda adicional?":"¿Quieres añadir algún detalle?"}
      <textarea value={goal} maxLength={1500} onChange={e=>{setGoal(e.target.value);setWizardError("");}} rows={5} placeholder="Ej. Mi negocio ya aparece, pero tiene el horario incorrecto. No quiero mostrar la dirección de mi casa."/>
      <small>{goal.length}/1500 caracteres · No compartas contraseñas ni información bancaria.</small>
     </label>
    </div>:null}
    {wizardStep===3?<div className={styles.wizardBody}>
     <div className={styles.reviewCard}>
      <div className={styles.reviewTop}><ClipboardList size={20}/><strong>Resumen de tu solicitud</strong></div>
      <div className={styles.reviewItem}><span>Servicio</span><strong>{services.find(s=>s.id===selected)?.name}</strong><button type="button" onClick={()=>editWizardStep(0)}>Editar</button></div>
      <div className={styles.reviewItem}><span>Negocio</span><strong>{name.trim()}</strong><button type="button" onClick={()=>editWizardStep(1)}>Editar</button></div>
      <div className={styles.reviewItem}><span>Sector</span><strong>{categoryLabel(effectiveCategory,"No especificado")}</strong></div>
      {site.trim()?<div className={styles.reviewItem}><span>Sitio web</span><strong className={styles.wrapValue}>{site.trim()}</strong></div>:null}
      <div className={styles.reviewGoal}><span>Qué necesitas</span><p>{selected==="review_strategy"&&reviewInput.trim()?("Reseña: "+reviewInput.trim()+" · Respuesta sugerida: "+answerReview):goal.trim()}</p><button type="button" onClick={()=>editWizardStep(2)}>Modificar descripción</button></div>
     </div>
     <div className={styles.costNote}><Wallet size={22}/><div><strong>Enviar la solicitud: $0</strong><p>El coste de un servicio, si corresponde, se cotizará después. Ningún pago ni publicación se ejecuta al enviar.</p></div></div>
     <label className={styles.permission}><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setWizardError("");}}/>
      <span>Autorizo a VMV a utilizar estos datos para gestionar y responder a mi solicitud. <strong>Publicaciones, pagos y cambios externos necesitarán aprobación adicional.</strong></span>
     </label>
     {authState==="checking"?<p className={styles.muted}>Verificando tu cuenta…</p>:
      authState!=="ready"?<div className={styles.signIn}><LockKeyhole size={19}/><p>{authState==="unconfigured"?"El inicio de sesión no está configurado en este entorno.":"Inicia sesión en VMV Business para guardar tu solicitud."}</p><a href="/vista-app">Entrar a VMV Business <ArrowUpRight size={15}/></a></div>:null}
    </div>:null}
    {wizardError?<p role="alert" className={styles.wizardError}>{wizardError}</p>:null}
    {wizardStep>0?<div className={styles.wizardFooter}>
     <button type="button" className={styles.wizardBack} onClick={goBack} disabled={busy}><ArrowLeft size={16}/> Anterior</button>
     {wizardStep===3?<button type="button" className={styles.wizardPrimary} disabled={busy||loading||authState!=="ready"} onClick={()=>void submit()}><Send size={16}/>{busy?"Enviando…":"Enviar solicitud"}</button>:
      <button type="button" className={styles.wizardPrimary} onClick={goNext}>Continuar <ArrowRight size={16}/></button>}
    </div>:null}
   </>}
  </section>
  <section className={styles.panel} id="vmv-marketing-history">
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
      {req.status==="verified"&&req.evidence_url?<><a className={styles.evidence} href={req.evidence_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Ver evidencia aportada por el equipo</a><p className={styles.notQuoted}>La evidencia fue registrada por VMV; no representa una confirmación independiente del directorio.</p></>:null}
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
