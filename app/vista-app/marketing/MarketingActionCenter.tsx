"use client";

import {useEffect,useMemo,useRef,useState} from "react";
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
import WebRepairStudio,{emptyWebRepair,validateWebRepair,type WebRepairData} from "./WebRepairStudio";
import ReputationStudio,{reviewReplyTemplate,type ReviewMode} from "./ReputationStudio";
import DirectoryDiscovery,{emptyDirectory,validateDirectory,directoryStatusNames,safeDirectoryUrl,type DirectoryData,type DirectoryProgress} from "./DirectoryDiscovery";
import {readMarketingDraft,writeMarketingDraft,readDraftMedia,saveDraftMedia,clearMarketingDraft,markGuestLoginPending,transferGuestDraft,type StoredMarketingDraft} from "./MarketingDraftStore";
import GoogleProfileWizard,{emptyGoogle,emptyMedia,googleStepNames,validateGoogleStep,validateGoogleLinks,validateGoogleAll,type GoogleData,type GoogleMedia} from "./GoogleProfileWizard";

export type ServiceCode="directory_listings"|"google_profile"|"apple_maps"|"bing_places"|"yelp_profile"|"search_console"|"seo_improvement"|"campaign_setup"|"review_strategy"|"other";
type Status="received"|"quoted"|"approved"|"in_progress"|"needs_customer"|"verified"|"cancelled";
type RequestRow={
 id:string;owner_id:string;service_code:ServiceCode;business_name:string;category_id:string;
 website_url:string|null;goal_text:string;status:Status;execution_mode:"assisted"|"automated";
 quoted_price_cents:number|null;quote_note:string|null;quote_revision:number;
 staff_update:string|null;evidence_url:string|null;verified_at:string|null;
 created_at:string;updated_at:string;google_profile_data?:GoogleData&{media?:{kind:string;path:string}[]}|null;web_repair_data?:WebRepairData|null;directory_data?:DirectoryData|null
};
type Acceptance={id:string;request_id:string;owner_id:string;quote_revision:number;quoted_price_cents:number;accepted_at:string};
type Service={id:ServiceCode;name:string;why:string;mode:string};
const services:Service[]=[
 {id:"directory_listings",name:"Aparecer en directorios",why:"Yelp, Tripadvisor y directorios de tu ciudad.",mode:"Selección y solicitud asistida"},
 {id:"google_profile",name:"Aparecer en Google",why:"Crea o mejora tu perfil de negocio.",mode:"Solicitud con verificación"},
 {id:"apple_maps",name:"Apple Maps",why:"Registrar o corregir la presencia de tu negocio.",mode:"Portal oficial + ayuda"},
 {id:"bing_places",name:"Bing Places",why:"Preparar la ficha y gestionar su verificación.",mode:"Portal oficial + ayuda"},
 {id:"yelp_profile",name:"Yelp",why:"Reclamar o actualizar la información del negocio.",mode:"Portal oficial + ayuda"},
 {id:"search_console",name:"Search Console",why:"Configurar el acceso para descubrir búsquedas reales.",mode:"Conexión autorizada pendiente"},
 {id:"seo_improvement",name:"Mejorar mi web",why:"Descubre mejoras para tu sitio.",mode:"Auditoría + ayuda"},
 {id:"campaign_setup",name:"Crear una campaña",why:"Diseñar y preparar una campaña con presupuesto aprobado.",mode:"Con aprobación previa"},
 {id:"review_strategy",name:"Mi reputación",why:"Responde reseñas y encuentra directorios.",mode:"Herramientas y asistencia"},
 {id:"other",name:"Otra necesidad de marketing",why:"Explica el resultado que deseas conseguir.",mode:"Evaluación individual"}
];
type WizardStep=0|1|2|3|4;
const wizardTitles=["Servicio","Tu negocio","Tu objetivo","Confirmar"] as const;
const serviceIcons:Record<ServiceCode,typeof MapPinned>={
 directory_listings:MapPinned,google_profile:MapPinned,apple_maps:Apple,bing_places:Navigation,yelp_profile:Star,
 search_console:Search,seo_improvement:Gauge,campaign_setup:Megaphone,
 review_strategy:MessageSquareHeart,other:Sparkles
};
const suggestedGoals:Record<ServiceCode,string[]>={
 directory_listings:["Quiero registrar o corregir mi negocio en directorios locales y nacionales."],
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

export default function MarketingActionCenter({businessName,industryId,website,onGoToVisibility,preselectedService,onWizardActiveChange}:{
 businessName:string;industryId:string;website:string;onGoToVisibility:()=>void;preselectedService?:ServiceCode;onWizardActiveChange?:(active:boolean)=>void
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
 const [googleStep,setGoogleStep]=useState(0);
 const [googleData,setGoogleData]=useState<GoogleData>(emptyGoogle);
 const [googleMedia,setGoogleMedia]=useState<GoogleMedia>(emptyMedia);
 useEffect(()=>{onWizardActiveChange?.(wizardStep>0&&wizardStep<4);},[wizardStep,onWizardActiveChange]);
 const [wizardError,setWizardError]=useState("");
 const [submittedId,setSubmittedId]=useState<string|null>(null);
 const [chosenCategory,setChosenCategory]=useState("");
 useEffect(()=>{
  if(preselectedService){
   setSelected(preselectedService);setGoal("");setConsent(false);
   setWizardStep(1);setGoogleStep(0);setWizardError("");setSubmittedId(null);
  }
 },[preselectedService]);
 const [name,setName]=useState(businessName);
 const [site,setSite]=useState(website);
 const [goal,setGoal]=useState("");
 const [reviewInput,setReviewInput]=useState("");
 const [reviewMode,setReviewMode]=useState<ReviewMode>("respond");
 const [reviewLink,setReviewLink]=useState("");
 const [reviewReply,setReviewReply]=useState("");
 const [reviewTone,setReviewTone]=useState<"cordial"|"breve">("cordial");
 const [webRepair,setWebRepair]=useState<WebRepairData>(emptyWebRepair);
 const [directoryData,setDirectoryData]=useState<DirectoryData>(emptyDirectory);
 const [directoryStatus,setDirectoryStatus]=useState<Record<string,DirectoryProgress>>({});
 const [directoryProof,setDirectoryProof]=useState<Record<string,string>>({});
 const [accessToken,setAccessToken]=useState("");
 const reviewNegative=/\b(malo|mala|pésimo|pesimo|terrible|decepcion|retraso|tarde|problema|queja|frío|frio|incorrecto|error|horrible|nunca|mal servicio|no recomiendo)\b/i.test(reviewInput);
 const reviewPositive=/\b(excelente|fantástico|fantastico|encantó|encanto|delicioso|deliciosa|recomiendo|increíble|increible|perfecto|perfecta|maravilloso|maravillosa|amable)\b/i.test(reviewInput);
 const answerReview=reviewInput.trim()?(reviewNegative?
  (reviewTone==="breve"?"Lamentamos que tu experiencia no haya sido la esperada. Gracias por contárnoslo; queremos mejorar.":"Gracias por compartir tu experiencia. Lamentamos que no haya sido lo que esperabas. En "+name+" nos tomamos en serio tus comentarios y queremos entender lo ocurrido para mejorar. Te invitamos a contactarnos por nuestros canales habituales."):
  reviewPositive?
  (reviewTone==="breve"?"¡Muchas gracias por tu reseña! Nos alegra saber que disfrutaste tu experiencia.":"¡Muchas gracias por compartir tu experiencia! Nos alegra saber que la disfrutaste. En "+name+" valoramos mucho que hayas dedicado tiempo a escribirnos. ¡Esperamos verte pronto!"):
  (reviewTone==="breve"?"Gracias por compartir tu opinión. La tendremos en cuenta.":"Gracias por tomarte el tiempo de compartir tu experiencia. En "+name+" valoramos tus comentarios y los tendremos en cuenta para seguir mejorando.")):"";
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
 const [draftReady,setDraftReady]=useState(false);
 const resolvedDraftOwner=useRef<string|null|"initial">("initial");
 const [draftNotice,setDraftNotice]=useState("");
 const [photoNotice,setPhotoNotice]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const submitting=useRef(false);
 const draftSnapshot=():StoredMarketingDraft=>({
  version:2,savedAt:Date.now(),requestId,ownerId:user?.id||null,
  service:selected,step:wizardStep,googleStep,
  name,site,category:chosenCategory||industryId||savedCategory||"other",goal,reviewInput,reviewTone,
  reviewLink,reviewReply,googleData,webRepair,directoryData
 });
 const saveCurrentDraft=async()=>{
  const ok=writeMarketingDraft(draftSnapshot());
  if(!ok){setDraftNotice("El dispositivo no pudo guardar el formulario. No cierres la página.");return false;}
  if(selected==="google_profile"){
   try{await saveDraftMedia(requestId,googleMedia);setPhotoNotice("");}
   catch{setPhotoNotice("No pudimos guardar tus fotos. Selecciónalas nuevamente después de iniciar sesión.");}
  }
  return true;
 };
 useEffect(()=>{
  if(authState==="checking"||authState==="unconfigured")return;
  let active=true;
  const uid=authState==="ready"?user?.id||null:null;
  setDraftReady(false);
  void (async()=>{
   const saved=uid?(transferGuestDraft(uid)||readMarketingDraft(uid)):readMarketingDraft(null);
   if(!saved&&resolvedDraftOwner.current!=="initial"&&resolvedDraftOwner.current!==uid){
    setRequestId(crypto.randomUUID());setWizardStep(0);setGoogleStep(0);
    setSelected("google_profile");setName(businessName||"");setSite(website||"");setChosenCategory("");
    setGoal("");setReviewInput("");setReviewLink("");setReviewReply("");setReviewMode("respond");
    setGoogleData(emptyGoogle);setGoogleMedia(emptyMedia);setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);
    setConsent(false);setDraftNotice("");
   }
   resolvedDraftOwner.current=uid;
   if(saved&&active&&services.some(item=>item.id===saved.service)){
    setRequestId(saved.requestId);setSelected(saved.service as ServiceCode);
    setWizardStep(saved.step as WizardStep);
    setGoogleStep(Math.max(0,Math.min(saved.googleStep,googleStepNames.length-1)));
    setName(saved.name||"");setSite(saved.site||"");setChosenCategory(saved.category||"");
    setGoal(saved.goal||"");setReviewInput(saved.reviewInput||"");
    setReviewLink(saved.reviewLink||"");setReviewReply(saved.reviewReply||"");
    setReviewTone(saved.reviewTone==="breve"?"breve":"cordial");
    if(saved.googleData)setGoogleData(saved.googleData);
    if(saved.webRepair)setWebRepair(saved.webRepair);
    if(saved.directoryData)setDirectoryData(saved.directoryData);
    setConsent(false);
    setDraftNotice("Tu solicitud está recuperada. Revisa los datos antes de enviarla.");
    try{const media=await readDraftMedia(saved.requestId);if(active&&media)setGoogleMedia(media);}
    catch{if(active)setPhotoNotice("No pudimos recuperar las fotos; vuelve a seleccionarlas.");}
   }
   if(active)setDraftReady(true);
  })();
  return()=>{active=false;};
 },[authState,user?.id]);
 useEffect(()=>{
  if(!draftReady||authState==="checking"||wizardStep<1||wizardStep>3)return;
  const id=window.setTimeout(()=>{
   if(!writeMarketingDraft(draftSnapshot()))setDraftNotice("No se está guardando el borrador. Mantén abierta esta página.");
  },300);
  return()=>window.clearTimeout(id);
 },[draftReady,authState,user?.id,wizardStep,googleStep,selected,name,site,chosenCategory,industryId,savedCategory,goal,reviewInput,reviewTone,reviewLink,reviewReply,googleData,webRepair,directoryData,requestId]);
 useEffect(()=>{
  if(!draftReady||selected!=="google_profile"||wizardStep<1||wizardStep>3)return;
  const id=window.setTimeout(()=>{
   void saveDraftMedia(requestId,googleMedia).then(()=>setPhotoNotice("")).catch(()=>setPhotoNotice("No pudimos conservar las fotos en este dispositivo. Selecciónalas de nuevo al regresar."));
  },450);
  return()=>window.clearTimeout(id);
 },[draftReady,selected,googleMedia,wizardStep,requestId]);
 const continueToLogin=async()=>{
  setBusy(true);
  const saved=await saveCurrentDraft();
  setBusy(false);
  if(saved){markGuestLoginPending();window.location.assign("/vista-app?returnTo=marketing");}
 };
 const revealWizard=()=>document.getElementById("vmv-marketing-request")?.scrollIntoView({behavior:"smooth",block:"start"});
 const closeKeyboard=()=>{
  const active=document.activeElement;
  if(active instanceof HTMLElement&&active.matches("input, textarea, select"))active.blur();
 };
 const editWizardStep=(step:WizardStep)=>{closeKeyboard();setWizardStep(step);setWizardError("");revealWizard();};
 const chooseService=(code:ServiceCode)=>{
  if(code!==selected){setRequestId(crypto.randomUUID());setGoal("");setConsent(false);setReviewLink("");setReviewReply("");setReviewMode("respond");setReviewInput("");setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);setGoogleStep(0);setGoogleMedia(emptyMedia);}
  setSelected(code);setWizardStep(1);setWizardError("");setSubmittedId(null);revealWizard();
 };
 const goNext=()=>{
  setWizardError("");
  if(wizardStep===1){
   if(selected==="seo_improvement"&&!site.trim()){setWizardError("Indica la dirección de tu sitio web para analizarlo.");return;}
   if(name.trim().length<2||name.trim().length>150){setWizardError("Escribe el nombre comercial de tu negocio.");return;}
   if(site.trim()&&!safeSite(site)){setWizardError("Comprueba el enlace de tu web: debe comenzar con https://.");return;}
  }
  if(wizardStep===2&&selected==="google_profile"){
   const missing=validateGoogleStep(googleStep,googleData)||validateGoogleLinks(googleData);
   if(missing){setWizardError(missing);return;}
   if(googleStep<googleStepNames.length-1){closeKeyboard();setGoogleStep(googleStep+1);revealWizard();return;}
  }
  if(wizardStep===2&&selected==="directory_listings"){const issue=validateDirectory(directoryData);if(issue){setWizardError(issue);return;}}
  if(wizardStep===2&&selected==="seo_improvement"){const invalid=validateWebRepair(webRepair);if(invalid){setWizardError(invalid);return;}}
  if(wizardStep===2&&selected!=="google_profile"&&selected!=="seo_improvement"&&selected!=="directory_listings"&&goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5)){setWizardError("Elige una opción o describe lo que necesitas en al menos 12 caracteres.");return;}
  if(wizardStep===2&&goal.trim().length>1500){setWizardError("El mensaje no debe superar 1500 caracteres.");return;}
  if(wizardStep<3){closeKeyboard();setWizardStep((wizardStep+1) as WizardStep);revealWizard();}
 };
 const goBack=()=>{setWizardError("");if(wizardStep===3&&selected==="google_profile"){editWizardStep(2);setGoogleStep(googleStepNames.length-1);return;}if(wizardStep===2&&selected==="google_profile"&&googleStep>0){closeKeyboard();setGoogleStep(googleStep-1);revealWizard();return;}if(wizardStep>0&&wizardStep<4)editWizardStep((wizardStep-1) as WizardStep);};
 const effectiveCategory=chosenCategory||industryId||savedCategory||"other";
 useEffect(()=>{if(effectiveCategory!=="other")setGoogleData(v=>v.googleCategory?v:{...v,googleCategory:categoryLabel(effectiveCategory,"")});},[effectiveCategory]);
 const googleGoalText=googleData.action==="create"?"Quiero preparar la creación de mi perfil en Google Business Profile.":googleData.action==="claim"?"Quiero reclamar y verificar mi perfil existente de Google Business Profile.":"Quiero corregir o ampliar mi perfil de Google Business Profile.";
 const googleFiles=[...(googleMedia.logo?[{kind:"logo",file:googleMedia.logo}]:[]),...(googleMedia.cover?[{kind:"cover",file:googleMedia.cover}]:[]),...googleMedia.photos.map((file,i)=>({kind:"photo-"+(i+1),file}))];
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
    const {data:session}=await instance.auth.getSession();if(alive)setAccessToken(session.session?.access_token||"");
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
 const openPrivatePhoto=async(path:string)=>{
  if(!client)return;
  const {data,error:mediaError}=await client.storage.from("vmv-google-media").createSignedUrl(path,120);
  if(mediaError||!data?.signedUrl){setError("No fue posible abrir la imagen privada. Inténtalo otra vez.");return;}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 };
 const submit=async()=>{
  setError("");setMessage("");setWizardError("");
  if(wizardStep!==3||submitting.current)return;
  submitting.current=true;
  if(!client||!user){submitting.current=false;setWizardError("Inicia sesión en VMV Business para enviar tu solicitud.");return;}
  if(name.trim().length<2||name.trim().length>150){setWizardStep(1);setWizardError("Introduce el nombre comercial (2 a 150 caracteres).");submitting.current=false;return;}
  if(selected==="google_profile"){
   const missing=validateGoogleAll(googleData);
   if(missing){setWizardStep(2);setGoogleStep(missing.step);setWizardError(missing.error);submitting.current=false;return;}
   const invalid=validateGoogleLinks(googleData);
   if(invalid){setWizardStep(2);setGoogleStep(2);setWizardError(invalid);submitting.current=false;return;}
   const bad=googleFiles.find(({file})=>!(["image/jpeg","image/png"].includes(file.type))||file.size<10240||file.size>5242880);
   if(bad){setWizardStep(2);setGoogleStep(5);setWizardError("Revisa "+bad.file.name+": fotos JPG o PNG entre 10 KB y 5 MB.");submitting.current=false;return;}
  }
  if(selected!=="google_profile"&&selected!=="seo_improvement"&&selected!=="directory_listings"&&((goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5))||goal.trim().length>1500)){setWizardStep(2);setWizardError("Elige una necesidad o describe el resultado que buscas.");submitting.current=false;return;}
  if(selected==="directory_listings"&&validateDirectory(directoryData)){setWizardStep(2);setWizardError(validateDirectory(directoryData));submitting.current=false;return;}
  if(selected==="seo_improvement"&&validateWebRepair(webRepair)){setWizardStep(2);setWizardError(validateWebRepair(webRepair));submitting.current=false;return;}
  if(selected==="seo_improvement"&&!site.trim()){setWizardStep(1);setWizardError("Añade la web que deseas mejorar.");submitting.current=false;return;}
  if(site.trim()&&!safeSite(site)){setWizardStep(1);setWizardError("La web debe tener una URL válida.");submitting.current=false;return;}
  if(!consent){setWizardError("Marca la autorización para que podamos atender la solicitud.");submitting.current=false;return;}
  setBusy(true);
  const uploaded:string[]=[];
  let inserted=false;
  try{
   const {data:existing,error:lookupError}=await client.from("vmv_marketing_requests")
    .select("id").eq("id",requestId).eq("owner_id",user.id).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing){
    inserted=true;setSubmittedId(String(existing.id).slice(0,8));setWizardStep(4);
    await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
    setMessage("Esta solicitud ya estaba guardada. No enviamos un duplicado.");
    await refresh();return;
   }
   const mediaPaths:{kind:string;path:string}[]=[];
   if(selected==="google_profile"){
    const folder=user.id+"/"+requestId;
    for(const {kind,file} of googleFiles){
     const extension=file.type==="image/png"?"png":"jpg";
     const path=folder+"/"+kind+"."+extension;
     const {error:uploadError}=await client.storage.from("vmv-google-media").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
     if(uploadError&&uploadError.message?.toLowerCase().includes("already exists")){mediaPaths.push({kind,path});continue;}
     if(uploadError)throw new Error("No se pudo guardar la imagen "+kind+". "+uploadError.message);
     uploaded.push(path);mediaPaths.push({kind,path});
    }
   }
   const {data,error:insertError}=await client.from("vmv_marketing_requests").insert({
    id:requestId,owner_id:user.id,service_code:selected,business_name:name.trim(),
    category_id:effectiveCategory,website_url:safeSite(site),
    goal_text:selected==="directory_listings"?("Solicito evaluación para registrar o actualizar "+directoryData.selected.length+" directorios en "+directoryData.city+", "+directoryData.state+". Se requiere revisar elegibilidad, duplicados y presupuesto antes de iniciar."):selected==="google_profile"?googleGoalText:selected==="seo_improvement"?(webRepair.requestRepair?"Solicito presupuesto para reparación técnica de mi página web.":"Solicito guardar mi diagnóstico web sin contratar reparación."):selected==="review_strategy"&&reviewInput.trim()?
     ("Reseña: "+reviewInput.trim().slice(0,650)+" | Respuesta para revisión: "+(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)).slice(0,700)).slice(0,1500):goal.trim(),
    agreed_to_contact:true,
    ...(selected==="google_profile"?{google_profile_data:{...googleData,...(googleData.kind==="service_area"?{street:"",unit:"",city:"",region:"",postal:""}:{}),media:mediaPaths}}:{}),
    ...(selected==="seo_improvement"?{web_repair_data:webRepair}:{}),
    ...(selected==="directory_listings"?{directory_data:{...directoryData,industry:effectiveCategory}}:{})
   }).select("id").single();
   if(insertError){
    const {data:alreadySaved}=await client.from("vmv_marketing_requests")
     .select("id").eq("id",requestId).eq("owner_id",user.id).maybeSingle();
    if(!alreadySaved)throw insertError;
    inserted=true;
    setSubmittedId(String(alreadySaved.id).slice(0,8));setWizardStep(4);
    await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
    setMessage("Tu solicitud ya estaba recibida. No se envió de nuevo.");
    await refresh();return;
   }
   inserted=true;
   const savedId=String(data.id).slice(0,8);
   setSubmittedId(savedId);setWizardStep(4);
   await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
   setMessage("Solicitud #"+requestId+" guardada con sus datos"+(uploaded.length?" y "+uploaded.length+" imágenes":"")+". No se ha publicado en Google.");
   setGoal("");setConsent(false);setGoogleMedia(emptyMedia);
   await refresh();
  }catch(e){
   if(!inserted&&uploaded.length)await client.storage.from("vmv-google-media").remove(uploaded);
   setWizardError("No se pudo completar el envío. "+errorMessage(e,"Inténtalo de nuevo."));
  }finally{setBusy(false);submitting.current=false;}
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
 const updateDirectoryProgress=async(req:RequestRow)=>{
  if(!client||!staff||!req.directory_data)return;
  setBusy(true);setError("");
  try{
   const selected=req.directory_data.selected.map(t=>{
    const status=directoryStatus[t.id]||t.status;
    const evidenceUrl=(directoryProof[t.id]??t.evidenceUrl).trim();
    if(["published","already_listed"].includes(status)&&!safeDirectoryUrl(evidenceUrl))throw Error("Para confirmar "+t.name+" debes incluir una URL HTTPS de la ficha.");
    if(["submitted","published"].includes(status)&&!isAccepted(req))throw Error("Primero el cliente debe aprobar el presupuesto de gestión (puede ser $0) antes de enviar registros a "+t.name+".");
    return {...t,status,evidenceUrl:["published","already_listed"].includes(status)?evidenceUrl:"",note:t.note};
   });
   const {error:saveError}=await client.from("vmv_marketing_requests").update({directory_data:{...req.directory_data,selected}}).eq("id",req.id);
   if(saveError)throw saveError;
   setMessage("Estados guardados. El cliente ya puede consultar el seguimiento de cada directorio.");
   await refresh();
  }catch(e){setError(errorMessage(e,"No se pudieron guardar los estados."));}
  finally{setBusy(false);}
 };
 const openStaff=(req:RequestRow)=>{
  setDirectoryStatus({});setDirectoryProof({});
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
      <label className={styles.wizardField}><span>Sitio web <em>{selected==="seo_improvement"?"Necesario":"Opcional"}</em></span><input type="url" inputMode="url" autoComplete="url" value={site} maxLength={500} onChange={e=>{setSite(e.target.value);setWizardError("");}} placeholder="https://tusitio.com"/></label>
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> Si ya registraste tu negocio en VMV, los datos disponibles aparecen automáticamente.</p>
    </div>:null}
    {wizardStep===2?<div className={styles.wizardBody}>
     {selected==="google_profile"?<GoogleProfileWizard step={googleStep} data={googleData} onData={setGoogleData} media={googleMedia} onMedia={setGoogleMedia} business={name} website={site}/>:<>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>ESTAMOS PREPARANDO</small><strong>{services.find(s=>s.id===selected)?.name}</strong></span></div>
     {selected==="directory_listings"?<DirectoryDiscovery data={directoryData} onChange={setDirectoryData} industry={effectiveCategory}/>:null}
     {selected==="seo_improvement"?<WebRepairStudio site={site} data={webRepair} onChange={setWebRepair} accessToken={accessToken}/>:null}
     {selected==="review_strategy"?<ReputationStudio business={name} mode={reviewMode} onModeChange={v=>{setReviewMode(v);setGoal(v==="request"?"Quiero solicitar reseñas auténticas a mis clientes.":"Necesito preparar respuestas para reseñas reales.");}} reviewInput={reviewInput} onReviewChange={v=>{setReviewInput(v);setReviewReply("");setGoal(v.trim()?"Necesito preparar una respuesta revisable para una reseña real.":"");}} reply={reviewReply} onReplyChange={setReviewReply} link={reviewLink} onLinkChange={v=>{setReviewLink(v);setGoal("Quiero compartir un enlace auténtico para recibir reseñas de mis clientes.");}} onDirectory={()=>{setSelected("directory_listings");setWizardError("");setGoal("");}} reviewTone={reviewTone} onToneChange={setReviewTone}/>:null}
     {selected==="directory_listings"?<button type="button" className={styles.preset} onClick={()=>{setSelected("review_strategy");setWizardError("");}}>← Volver a reseñas</button>:null}
     {selected!=="review_strategy"&&selected!=="seo_improvement"&&selected!=="directory_listings"?<span className={styles.presetLabel}>Elige qué necesitas</span>:null}
     <div className={styles.goalPresets}>{(selected==="review_strategy"||selected==="seo_improvement"||selected==="directory_listings"?[]:suggestedGoals[selected]).map(option=><button key={option} type="button" className={goal===option?styles.presetActive:styles.preset} aria-pressed={goal===option} onClick={()=>{setGoal(option);setWizardError("");}}>
      <CheckCircle2 size={16}/>{option}
     </button>)}</div>
     {selected!=="seo_improvement"&&selected!=="directory_listings"?<label className={styles.goalLabel}>{selected==="review_strategy"?"¿Necesitas ayuda adicional?":"¿Quieres añadir algún detalle?"}
      <textarea value={goal} maxLength={1500} onChange={e=>{setGoal(e.target.value);setWizardError("");}} rows={5} placeholder="Ej. Mi negocio ya aparece, pero tiene el horario incorrecto. No quiero mostrar la dirección de mi casa."/>
      <small>{goal.length}/1500 caracteres · No compartas contraseñas ni información bancaria.</small>
     </label>:null}
     </>}
    </div>:null}
    {wizardStep===3?<div className={styles.wizardBody}>
     <div className={styles.reviewCard}>
      <div className={styles.reviewTop}><ClipboardList size={20}/><strong>Resumen de tu solicitud</strong></div>
      <div className={styles.reviewItem}><span>Servicio</span><strong>{services.find(s=>s.id===selected)?.name}</strong><button type="button" onClick={()=>editWizardStep(0)}>Editar</button></div>
      <div className={styles.reviewItem}><span>Negocio</span><strong>{name.trim()}</strong><button type="button" onClick={()=>editWizardStep(1)}>Editar</button></div>
      <div className={styles.reviewItem}><span>Sector</span><strong>{categoryLabel(effectiveCategory,"No especificado")}</strong></div>
      {site.trim()?<div className={styles.reviewItem}><span>Sitio web</span><strong className={styles.wrapValue}>{site.trim()}</strong></div>:null}
      {selected==="google_profile"?<div className={styles.googleReview}><strong>Datos para Google</strong><span>Operación: {googleData.action==="create"?"Crear":googleData.action==="claim"?"Reclamar":"Mejorar"} · {googleData.kind==="storefront"?"Local":googleData.kind==="service_area"?"Área de servicio":"Local y entregas"}</span><span>Categoría: {googleData.googleCategory}</span><span>{googleData.kind==="service_area"?"Áreas: "+googleData.serviceAreas:[googleData.street,googleData.unit,googleData.city,googleData.region,googleData.postal,googleData.country].filter(Boolean).join(", ")}</span>{googleData.phone?<span>Teléfono: {googleData.phone}</span>:null}{googleData.hoursEnabled?<span>Horarios: {googleData.hours.filter(h=>!h.closed).length} días abiertos</span>:null}{googleData.description?<span>Descripción: {googleData.description}</span>:null}<span>Fotos: {googleFiles.length} (privadas)</span><button type="button" onClick={()=>{setGoogleStep(0);editWizardStep(2);}}>Revisar datos de Google</button></div>:null}
      {selected==="directory_listings"?<div className={styles.googleReview}><strong>Directorios solicitados</strong><span>{directoryData.city}, {directoryData.state}</span>{directoryData.selected.map(d=><span key={d.id}>{d.name} · {d.cost==="free"?"Ficha gratuita":d.cost==="membership"?"Posible membresía":"Por evaluar"}</span>)}<span>VMV confirmará requisitos y precio antes de actuar.</span><button type="button" onClick={()=>editWizardStep(2)}>Revisar selección</button></div>:null}
      {selected==="review_strategy"?<div className={styles.googleReview}><strong>Mi reputación</strong>{reviewInput.trim()?<span>Reseña real: {reviewInput}</span>:null}{reviewInput.trim()?<span>Respuesta revisada: {reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)}</span>:null}{reviewLink?<span>Enlace de reseñas: {reviewLink}</span>:null}</div>:null}
      {selected==="seo_improvement"?<div className={styles.googleReview}><strong>Diagnóstico web</strong><span>{webRepair.audit?"Velocidad: "+(webRepair.audit.scores.performance??"—")+"/100; SEO: "+(webRepair.audit.scores.seo??"—")+"/100":"Sin análisis automático; se requiere revisión técnica"}</span><span>Plataforma: {webRepair.platform==="other"?webRepair.otherPlatform:webRepair.platform}</span><span>Repositorio: {webRepair.repositoryHost}</span><span>{webRepair.requestRepair?"Quiero una cotización":"Solo guardar el diagnóstico"}</span><button type="button" onClick={()=>editWizardStep(2)}>Revisar información</button></div>:null}
      <div className={styles.reviewGoal}><span>Qué necesitas</span><p>{selected==="seo_improvement"?(webRepair.requestRepair?"Solicitar evaluación y presupuesto de reparación.":"Guardar diagnóstico sin reparación."):selected==="google_profile"?googleGoalText:selected==="review_strategy"&&reviewInput.trim()?("Reseña: "+reviewInput.trim()+" · Respuesta: "+(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone))):goal.trim()}</p><button type="button" onClick={()=>editWizardStep(2)}>Modificar descripción</button></div>
     </div>
     <div className={styles.costNote}><Wallet size={22}/><div><strong>Enviar la solicitud: $0</strong><p>El coste de un servicio, si corresponde, se cotizará después. Ningún pago ni publicación se ejecuta al enviar.</p></div></div>
     <label className={styles.permission}><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setWizardError("");}}/>
      <span>Autorizo a VMV a utilizar estos datos para gestionar y responder a mi solicitud. <strong>Publicaciones, pagos y cambios externos necesitarán aprobación adicional.</strong></span>
     </label>
     {authState==="checking"?<p className={styles.muted}>Verificando tu cuenta…</p>:
      authState!=="ready"?<div className={styles.signIn}><LockKeyhole size={19}/><p>{authState==="unconfigured"?"El inicio de sesión no está configurado en este entorno.":"Antes de entrar, guardaremos tus respuestas en este dispositivo. Al volver podrás continuar donde quedaste."}</p><button type="button" disabled={busy||!draftReady} onClick={()=>void continueToLogin()}>Guardar y entrar a VMV <ArrowUpRight size={15}/></button><small>El borrador se conserva hasta 48 horas en este navegador. Usa el mismo dispositivo y navegador para volver.</small></div>:null}
    </div>:null}
    {draftNotice?<p role="status" className={styles.draftNotice}>{draftNotice}</p>:null}
    {photoNotice?<p role="status" className={styles.photoNotice}>{photoNotice}</p>:null}
    {wizardError?<p role="alert" className={styles.wizardError}>{wizardError}</p>:null}
    {wizardStep>0?<div className={styles.wizardFooter}>
     <button type="button" className={styles.wizardBack} onClick={goBack} disabled={busy}><ArrowLeft size={16}/> Anterior</button>
     {wizardStep===3?<button type="button" className={styles.wizardPrimary} disabled={busy||loading||authState!=="ready"} onClick={()=>void submit()}><Send size={16}/>{busy?"Enviando…":"Enviar solicitud"}</button>:
      <button type="button" className={styles.wizardPrimary} onClick={goNext}>{selected==="google_profile"&&wizardStep===2&&googleStep<googleStepNames.length-1?"Siguiente":"Continuar"} <ArrowRight size={16}/></button>}
    </div>:null}
   </>}
  </section>
  {(wizardStep===0||wizardStep===4)?<section className={styles.panel} id="vmv-marketing-history">
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
      {req.service_code==="directory_listings"&&req.directory_data?<div className={styles.dirHistory}><strong>Directorios seleccionados · {req.directory_data.city}, {req.directory_data.state}</strong>{req.directory_data.selected.map(t=><div className={styles.dirHistoryRow} key={t.id}><div><strong>{t.name}</strong><small>{directoryStatusNames[t.status]||"Por revisar"}</small>{t.evidenceUrl&&safeDirectoryUrl(t.evidenceUrl)?<a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer">Ver evidencia de publicación ↗</a>:null}{t.note?<small>{t.note}</small>:null}</div>{staff&&teamView&&activeStaffId===req.id?<div className={styles.dirStaffFields}><select aria-label={"Estado de "+t.name} value={directoryStatus[t.id]||t.status} onChange={e=>setDirectoryStatus(v=>({...v,[t.id]:e.target.value as DirectoryProgress}))}>{Object.entries(directoryStatusNames).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><input aria-label={"Enlace verificado de "+t.name} value={directoryProof[t.id]??t.evidenceUrl} onChange={e=>setDirectoryProof(v=>({...v,[t.id]:e.target.value}))} placeholder="URL pública (solo si publicado)"/></div>:null}</div>)}</div>:null}
      {req.service_code==="seo_improvement"&&req.web_repair_data?<><a className={styles.reportLink} href={"/vista-app/marketing/informe/"+req.id}>Abrir informe completo guardado ↗</a><details className={styles.googleSaved}><summary>Ver diagnóstico y plataforma</summary><div className={styles.googleSavedContent}><p>Plataforma: {req.web_repair_data.platform==="other"?req.web_repair_data.otherPlatform:req.web_repair_data.platform}</p><p>Repositorio: {req.web_repair_data.repositoryHost}</p>{req.web_repair_data.repositoryUrl?<p>{req.web_repair_data.repositoryUrl}</p>:null}{req.web_repair_data.audit?<><p>Velocidad {req.web_repair_data.audit.scores.performance??"—"}/100 · SEO {req.web_repair_data.audit.scores.seo??"—"}/100</p>{req.web_repair_data.audit.explanation?<p>{req.web_repair_data.audit.explanation}</p>:null}<a href={req.web_repair_data.audit.reportUrl||"https://pagespeed.web.dev/"} target="_blank" rel="noopener noreferrer">Ver evidencia técnica en Google</a></>:<p>Sin informe automático. Solicitud pendiente de revisión.</p>}</div></details></>:null}
      {req.service_code==="google_profile"&&req.google_profile_data?<details className={styles.googleSaved}>
       <summary>Ver datos del perfil y fotos</summary><div className={styles.googleSavedContent}>
        <p><strong>Categoría Google:</strong> {req.google_profile_data.googleCategory||"Pendiente"}</p>
        <p><strong>Ubicación:</strong> {req.google_profile_data.kind==="service_area"?"Zona de servicio":req.google_profile_data.kind==="hybrid"?"Local y entregas":"Local"}</p>
        {req.google_profile_data.kind==="service_area"?<p>{req.google_profile_data.serviceAreas}</p>:<p>{[req.google_profile_data.street,req.google_profile_data.unit,req.google_profile_data.city,req.google_profile_data.region,req.google_profile_data.postal].filter(Boolean).join(", ")}</p>}
        {req.google_profile_data.phone?<p><strong>Teléfono:</strong> {req.google_profile_data.phone}</p>:null}
        {req.google_profile_data.description?<p><strong>Descripción:</strong> {req.google_profile_data.description}</p>:null}
        {req.google_profile_data.services?<p><strong>Servicios:</strong> {req.google_profile_data.services}</p>:null}
        {req.google_profile_data.products?<p><strong>Productos:</strong> {req.google_profile_data.products}</p>:null}
        {req.google_profile_data.media?.map(photo=><button type="button" key={photo.path} onClick={()=>void openPrivatePhoto(photo.path)}>Ver imagen {photo.kind}</button>)}
       </div></details>:null}
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
        {req.directory_data?<button type="button" disabled={busy} onClick={()=>void updateDirectoryProgress(req)}>Guardar estados de directorios</button>:null}
       </div>:null}
      </div>:null}
     </article>;
    })}</div>
   }
  </section>:null}
  {(wizardStep===0||wizardStep===4)?<div className={styles.bottomNote}><HandHeart size={17}/><p>Las APIs y portales externos requieren permisos propios. Una solicitud recibida no significa que el negocio haya sido registrado, ni que el servicio haya empezado.</p></div>:null}
  {message?<p role="status" className={styles.notice}>{message}</p>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
 </div>;
}
