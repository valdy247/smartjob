"use client";
import {normalizeGoogleProfile,googlePhotoKey,googleProfileLink} from "@/lib/google-profile-request";
import {websiteAddress} from "@/lib/website-address";
import {businessGoogleSeed,mergeGoogleWithBusiness,applyProfileEditsToGoogle,googleChangesForProfile,businessRequestSnapshot,centralBusinessDefaults,centralBusinessWritePayload,validCentralBusiness,type CentralBusiness} from "@/lib/vmv-central-business";
import CentralBusinessEditor,{emptyBusinessFiles,type CentralBusinessFiles} from "./CentralBusinessEditor";
import BusinessCategoryPicker from "@/components/BusinessCategoryPicker";

import {useEffect,useMemo,useRef,useState} from "react";
import type {SupabaseClient,User} from "@supabase/supabase-js";
import {
 ArrowLeft,ArrowRight,ArrowUpRight,Apple,Check,CheckCircle2,ClipboardList,ExternalLink,
 FileCheck2,Gauge,Globe2,HandHeart,LayoutGrid,LockKeyhole,MapPinned,
 Megaphone,MessageSquareHeart,Navigation,RefreshCw,Search,Send,ShieldCheck,
 Sparkles,Star,Wallet,Workflow,Video,Languages,Users,BarChart3,Ellipsis,ChevronDown,FilePenLine,NotebookPen,Trash2,Copy,X,Clock3,Shirt
} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {t as contentText,type MessageKey} from "@/lib/i18n";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import {marketingCategoryLabel,marketingGroupLabel} from "@/lib/marketing-taxonomy-i18n";
import styles from "./MarketingActionCenter.module.css";
import WebRepairStudio,{emptyWebRepair,validateWebRepair,type WebRepairData} from "./WebRepairStudio";
import ReputationStudio,{reviewReplyTemplate,type ReviewMode} from "./ReputationStudio";
import DirectoryDiscovery,{emptyDirectory,validateDirectory,directoryStatusNames,localizedDirectoryStatus,safeDirectoryUrl,type DirectoryData,type DirectoryProgress} from "./DirectoryDiscovery";
import {readMarketingDraft,writeMarketingDraft,readDraftMedia,saveDraftMedia,clearMarketingDraft,markGuestLoginPending,transferGuestDraft,readBusinessDraftMedia,saveBusinessDraftMedia,type StoredMarketingDraft} from "./MarketingDraftStore";
import GoogleProfileWizard,{emptyGoogle,emptyMedia,googleStepNames,validateGoogleStep,validateGoogleLinks,validateGoogleAll,type GoogleData,type GoogleMedia} from "./GoogleProfileWizard";
import ScienceWaitQuiz from "./ScienceWaitQuiz";
import SocialCaptionPreview from "./SocialCaptionPreview";
import {marketingRequestProgress} from "@/lib/marketing-request-progress";

export type ServiceCode="directory_listings"|"google_profile"|"apple_maps"|"bing_places"|"yelp_profile"|"search_console"|"seo_improvement"|"campaign_setup"|"review_strategy"|"other";
type Status="received"|"quoted"|"approved"|"in_progress"|"needs_customer"|"verified"|"cancelled";
type ActivityEvent={date:string;kind:"quote"|"status"|"directories"|"update";status:Status;note?:string;quoteCents?:number|null;revision?:number;evidenceUrl?:string|null};
type RequestRow={
 id:string;owner_id:string;service_code:ServiceCode;business_name:string;business_id?:string|null;category_id:string;
 website_url:string|null;goal_text:string;status:Status;execution_mode:"assisted"|"automated";
 quoted_price_cents:number|null;quote_note:string|null;quote_revision:number;
 staff_update:string|null;evidence_url:string|null;verified_at:string|null;
 created_at:string;updated_at:string;business_snapshot?:ReturnType<typeof businessRequestSnapshot>|null;confirmed_at?:string|null;consent_version?:string|null;activity_history?:ActivityEvent[];reputation_data?:{mode:string;reviewText:string;replyText:string;reviewLink:string}|null;google_profile_data?:GoogleData&{media?:{kind:string;path:string}[]}|null;web_repair_data?:WebRepairData|null;directory_data?:DirectoryData|null
};
type SavedBusiness=CentralBusiness&{source?:"profile"|"agent"};
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
const comingSoonCards=[
 {id:"crm",Icon:Users,es:"CRM y embudos de venta",en:"CRM & sales funnels",esDesc:"De cada llamada o visita web a una venta, con seguimiento por etapas.",enDesc:"Turn calls and website contacts into tracked sales opportunities."},
 {id:"omnichannel",Icon:Send,es:"Automatización omnicanal",en:"Omnichannel automation",esDesc:"Seguimiento autorizado por email, SMS y WhatsApp.",enDesc:"Permission-based follow-ups by email, SMS and WhatsApp."},
 {id:"social_ads",Icon:Megaphone,es:"Redes y anuncios",en:"Social media & ads",esDesc:"Programar publicaciones y gestionar campañas de Meta y Google.",enDesc:"Schedule posts and manage Meta and Google campaigns."},
 {id:"seo_reputation",Icon:Globe2,es:"SEO y reputación automáticos",en:"Automated SEO & reputation",esDesc:"Conectar la web y las reseñas a acciones de mejora continuas.",enDesc:"Connect website SEO and reviews to ongoing improvements."},
 {id:"video-translate",Icon:Languages,es:"Video Translate",en:"Video Translate",esDesc:"Traducción y doblaje de videos a otros idiomas con una voz similar a la original.",enDesc:"Translate and dub videos into other languages with a voice similar to the original."},
 {id:"business-cards",Icon:FilePenLine,es:"Tarjeta de presentación",en:"Business Cards",esDesc:"Próximamente podrás solicitar tarjetas de negocio. Planeamos imprimirlas con Office Depot y enviarlas a tu domicilio.",enDesc:"Soon you can order business cards. We plan to arrange printing through Office Depot and home delivery."},
 {id:"merch-studio",Icon:Shirt,es:"VMV Merch Studio",en:"VMV Merch Studio",esDesc:"Pulóveres personalizados con logo y código QR. Diseña y solicita impresión y entrega a domicilio.",enDesc:"Custom shirts with your logo and QR code. Design and request printing with home delivery."},
 {id:"attribution",Icon:BarChart3,es:"Analítica y atribución",en:"Analytics & attribution",esDesc:"Saber qué anuncio generó cada llamada, cliente y venta.",enDesc:"See which ad drove each call, customer and sale."}
] as const;
type WizardStep=0|1|2|3|4;

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
const safeSite=(value:string)=>{
 if(!value.trim())return null;
 try{const u=new URL(value.trim());return ["https:","http:"].includes(u.protocol)&&Boolean(u.hostname)&&!u.username&&!u.password?u.toString():null;}
 catch{return null;}
};
// Technical API errors are not localized; never render their raw messages in either locale.
const errorMessage=(_error:unknown,localizedFallback:string)=>localizedFallback;

export default function MarketingActionCenter({businessName,industryId,website,onGoToVisibility,preselectedService,onWizardActiveChange,registerHeaderBack,requestsOnly=false,openSocialCaptions=false}:{
 businessName:string;industryId:string;website:string;onGoToVisibility:()=>void;preselectedService?:ServiceCode;onWizardActiveChange?:(active:boolean)=>void;registerHeaderBack?:(callback:(()=>void)|null)=>void;requestsOnly?:boolean;openSocialCaptions?:boolean
}){
 const {language,translate}=useInterfaceLanguage();
 const [contentLanguage]=useState(language);
 const en=language==="en";

 const wizardTitles=[translate("marketing.step.service"),translate("marketing.step.business"),translate("marketing.step.goal"),translate("marketing.step.confirm")];
 const statusNames:Record<Status,string>={received:translate("marketing.status.received"),quoted:translate("marketing.status.quoted"),approved:translate("marketing.status.approved"),in_progress:translate("marketing.status.in_progress"),needs_customer:translate("marketing.status.needs_customer"),verified:translate("marketing.status.verified"),cancelled:translate("marketing.status.cancelled")};
 const serviceNames:Record<ServiceCode,string>={directory_listings:translate("marketing.service.directory_listings.name"),google_profile:translate("marketing.service.google_profile.name"),apple_maps:translate("marketing.service.apple_maps.name"),bing_places:translate("marketing.service.bing_places.name"),yelp_profile:translate("marketing.service.yelp_profile.name"),search_console:translate("marketing.service.search_console.name"),seo_improvement:translate("marketing.service.seo_improvement.name"),campaign_setup:translate("marketing.service.campaign_setup.name"),review_strategy:translate("marketing.service.review_strategy.name"),other:translate("marketing.service.other.name")};
 const serviceWhys:Record<ServiceCode,string>={directory_listings:translate("marketing.service.directory_listings.why"),google_profile:translate("marketing.service.google_profile.why"),apple_maps:translate("marketing.service.apple_maps.why"),bing_places:translate("marketing.service.bing_places.why"),yelp_profile:translate("marketing.service.yelp_profile.why"),search_console:translate("marketing.service.search_console.why"),seo_improvement:translate("marketing.service.seo_improvement.why"),campaign_setup:translate("marketing.service.campaign_setup.why"),review_strategy:translate("marketing.service.review_strategy.why"),other:translate("marketing.service.other.why")};
 const money=(cents:number)=>new Intl.NumberFormat(language==="es"?"es-US":"en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const date=(v:string)=>new Intl.DateTimeFormat(language==="es"?"es-US":"en-US",{dateStyle:"medium"}).format(new Date(v));
 const serviceName=(id:ServiceCode)=>serviceNames[id]||id;
 const serviceWhy=(id:ServiceCode)=>serviceWhys[id]||"";

 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const activeBusinessOwnerRef=useRef<string|null>(null);
 activeBusinessOwnerRef.current=user?.id||null;
 const [savedCategory,setSavedCategory]=useState("");
 const [savedBusinesses,setSavedBusinesses]=useState<SavedBusiness[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [businessDetails,setBusinessDetails]=useState<CentralBusiness>({id:"",owner_id:"",...centralBusinessDefaults()});
 const [businessFiles,setBusinessFiles]=useState<CentralBusinessFiles>(emptyBusinessFiles);
 const [saveAlsoInBusiness,setSaveAlsoInBusiness]=useState(false);
 const businessEditedRef=useRef(false);
 const [businessBusy,setBusinessBusy]=useState(false);
 const [businessMessage,setBusinessMessage]=useState("");
 const [businessError,setBusinessError]=useState("");
 const [authState,setAuthState]=useState<"checking"|"ready"|"signed_out"|"unconfigured">("checking");
 const [staff,setStaff]=useState(false);
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [approvals,setApprovals]=useState<Acceptance[]>([]);
 const [campaignTestReceipts,setCampaignTestReceipts]=useState<Array<{request_id:string;quote_revision:number;amount_cents:number;paid_at:string}>>([]);
 const [campaignCheckoutBusy,setCampaignCheckoutBusy]=useState<string|null>(null);
 const campaignTestCheckoutVisible=process.env.NEXT_PUBLIC_VMV_MARKETING_CAMPAIGN_TEST_CHECKOUT==="true";
 const [expandedRequests,setExpandedRequests]=useState<Record<string,boolean>>({});
 const [caseAction,setCaseAction]=useState<{id:string;kind:"note"|"edit"|"cancel"|"delete"}|null>(null);
 const [caseActionText,setCaseActionText]=useState("");
 const [caseActionError,setCaseActionError]=useState("");
 const [caseActionBusy,setCaseActionBusy]=useState(false);
 const [selected,setSelected]=useState<ServiceCode>(preselectedService||"google_profile");
 const [wizardStep,setWizardStep]=useState<WizardStep>(preselectedService?1:0);
 const [socialPreviewOpen,setSocialPreviewOpen]=useState(openSocialCaptions);
 const [googleStep,setGoogleStep]=useState(0);
 const [editLoadedGoogle,setEditLoadedGoogle]=useState(false);
 const [webStage,setWebStage]=useState(0);
 const [googleData,setGoogleData]=useState<GoogleData>(emptyGoogle);
 const [googleMedia,setGoogleMedia]=useState<GoogleMedia>(emptyMedia);
 useEffect(()=>{onWizardActiveChange?.((wizardStep>0&&wizardStep<4)||socialPreviewOpen);},[wizardStep,socialPreviewOpen,onWizardActiveChange]);
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
 useEffect(()=>{
  if(preselectedService!=="other")return;
  const requested=new URLSearchParams(window.location.search).get("goal");
  if(requested&&requested.length<=240)setGoal(requested);
 },[preselectedService]);
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
 const [submissionQuiz,setSubmissionQuiz]=useState<{seed:string;processing:boolean}|null>(null);
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
 const [pausedStep,setPausedStep]=useState<WizardStep|null>(null);
 useEffect(()=>{setMessage("");setError("");setWizardError("");setBusinessMessage("");setBusinessError("");setDraftNotice("");setPhotoNotice("");},[language]);
 const submitting=useRef(false);
 const draftSnapshot=():StoredMarketingDraft=>({
  version:2,savedAt:Date.now(),requestId,ownerId:user?.id||null,
  service:selected,step:wizardStep,googleStep,webStage,businessId,businessDetails,saveAlsoInBusiness,
  name,site,category:chosenCategory||industryId||savedCategory||"other",goal,reviewInput,reviewTone,
  reviewLink,reviewReply,reviewMode,consent,googleData,webRepair,directoryData
 });
 const saveCurrentDraft=async()=>{
  const ok=writeMarketingDraft(draftSnapshot());
  if(!ok){setDraftNotice(translate("marketing.action.this_device_couldn_t_save_the_form_keep_this_page_ope"));return false;}
  try{await saveBusinessDraftMedia(requestId,businessFiles);}catch{setPhotoNotice(en?"Business photos could not be saved on this device.":"Las fotos del negocio no pudieron guardarse en este dispositivo.");}
  if(selected==="google_profile"){
   try{await saveDraftMedia(requestId,googleMedia);setPhotoNotice("");}
   catch{setPhotoNotice(translate("marketing.action.we_couldn_t_save_your_photos_select_them_again_after_"));}
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
    setRequestId(crypto.randomUUID());setWizardStep(0);setGoogleStep(0);setWebStage(0);
    setSelected("google_profile");setBusinessId("");setSavedBusinesses([]);setBusinessDetails({id:"",owner_id:"",...centralBusinessDefaults()});setBusinessFiles(emptyBusinessFiles);setName(businessName||"");setSite(website||"");setChosenCategory("");
    setGoal("");setReviewInput("");setReviewLink("");setReviewReply("");setReviewMode("respond");
    setGoogleData(emptyGoogle);setGoogleMedia(emptyMedia);setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);
    setConsent(false);setDraftNotice("");
   }
   resolvedDraftOwner.current=uid;
   if(saved&&active&&services.some(item=>item.id===saved.service)){
    businessEditedRef.current=true;
    setRequestId(saved.requestId);setSelected(saved.service as ServiceCode);
    setBusinessId(saved.businessId||"");
    if(saved.businessDetails)setBusinessDetails(saved.businessDetails);
    setSaveAlsoInBusiness(saved.saveAlsoInBusiness===true);
    setWizardStep(saved.step as WizardStep);
    setGoogleStep(Math.max(0,Math.min(saved.googleStep,googleStepNames.length-1)));
    setWebStage(Math.max(0,Math.min(saved.webStage||0,2)));
    setName(saved.name||"");setSite(saved.site||"");setChosenCategory(saved.category||"");
    setGoal(saved.goal||"");setReviewInput(saved.reviewInput||"");
    setReviewLink(saved.reviewLink||"");setReviewReply(saved.reviewReply||"");setReviewMode(saved.reviewMode==="request"?"request":"respond");
    setReviewTone(saved.reviewTone==="breve"?"breve":"cordial");
    if(saved.googleData)setGoogleData(saved.googleData);
    if(saved.webRepair)setWebRepair(saved.webRepair);
    if(saved.directoryData)setDirectoryData(saved.directoryData);
    setConsent(saved.consent===true);
    setDraftNotice(translate("marketing.action.your_request_has_been_restored_review_it_before_submi"));
    try{const media=await readDraftMedia(saved.requestId);if(active&&media)setGoogleMedia(media);const businessMedia=await readBusinessDraftMedia(saved.requestId);if(active&&businessMedia)setBusinessFiles(businessMedia);}
    catch{if(active)setPhotoNotice(translate("marketing.action.we_couldn_t_restore_your_photos_select_them_again"));}
   }
   if(active)setDraftReady(true);
  })();
  return()=>{active=false;};
 },[authState,user?.id]);
 useEffect(()=>{
  if(!draftReady||authState==="checking"||wizardStep<1||wizardStep>3)return;
  const id=window.setTimeout(()=>{
   if(!writeMarketingDraft(draftSnapshot()))setDraftNotice(translate("marketing.action.your_draft_isn_t_being_saved_keep_this_page_open"));
  },300);
  return()=>window.clearTimeout(id);
 },[draftReady,authState,user?.id,wizardStep,googleStep,selected,name,site,chosenCategory,industryId,savedCategory,webStage,businessId,businessDetails,saveAlsoInBusiness,goal,reviewInput,reviewTone,reviewLink,reviewReply,reviewMode,consent,googleData,webRepair,directoryData,requestId]);
 useEffect(()=>{
  if(!draftReady||wizardStep<1||wizardStep>3)return;
  const id=window.setTimeout(()=>{void saveBusinessDraftMedia(requestId,businessFiles).catch(()=>setPhotoNotice(en?"Could not preserve business photos.":"No pudimos conservar las fotos del negocio."));},450);
  return()=>window.clearTimeout(id);
 },[draftReady,wizardStep,businessFiles,requestId]);
 useEffect(()=>{
  if(!draftReady||!user||businessId||businessEditedRef.current)return;
  const real=savedBusinesses.filter(b=>!b.source);
  if(real.length!==1)return;
  const b=real[0];setBusinessId(b.id);setBusinessDetails({...b});setName(b.name);setSite(b.website_url||"");setChosenCategory(b.category_id);
  setGoogleData(g=>g.googleCategory||g.phone||g.street?mergeGoogleWithBusiness(g,b):businessGoogleSeed(b,g.action));
 },[draftReady,user?.id,savedBusinesses,businessId]);
 useEffect(()=>{
  if(!draftReady||selected!=="google_profile"||wizardStep<1||wizardStep>3)return;
  const id=window.setTimeout(()=>{
   void saveDraftMedia(requestId,googleMedia).then(()=>setPhotoNotice("")).catch(()=>setPhotoNotice(translate("marketing.action.we_couldn_t_keep_your_photos_on_this_device_select_th")));
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
  setRequestId(crypto.randomUUID());setPausedStep(null);setWebStage(0);
  setSaveAlsoInBusiness(false);
  if(code!==selected){setGoal("");setConsent(false);setReviewLink("");setReviewReply("");setReviewMode("respond");setReviewInput("");setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);setGoogleStep(0);setGoogleMedia(emptyMedia);}
  const linked=savedBusinesses.some(x=>x.id===businessId&&!x.source);
  setEditLoadedGoogle(false);setSelected(code);setWizardStep(code==="google_profile"&&linked?2:1);setGoogleStep(0);setWizardError("");setSubmittedId(null);revealWizard();
 };
 const goNext=async()=>{
  setWizardError("");
  if(wizardStep===1){
   if(user&&!savedBusinesses.some(x=>x.id===businessId&&!x.source)){
    const id=await saveBusiness();
    if(!id){setWizardError(en?"Save or select a business to continue.":"Guarda o selecciona un negocio para continuar.");return;}
   }
   if(selected==="seo_improvement"&&!site.trim()){setWizardError(translate("marketing.action.enter_the_website_address_to_analyze_it"));return;}
   if(name.trim().length<2||name.trim().length>150){setWizardError(translate("marketing.action.enter_your_business_name"));return;}
   if(site.trim()&&!websiteAddress(site)){setWizardError(translate("category.invalidWebsite"));return;}
  }
  if(wizardStep===2&&selected==="google_profile"){
   const missing=validateGoogleStep(googleStep,googleData,language);
   if(missing){setWizardError(missing);return;}
   if(googleStep<googleStepNames.length-1){
    const selectedRecord=savedBusinesses.find(x=>x.id===businessId&&!x.source);
    const steps=Array.from({length:5-googleStep},(_,i)=>googleStep+i+1);
    const incomplete=(index:number)=>{
     if(!selectedRecord||validateGoogleStep(index,googleData,language))return true;
     if(index===1)return Boolean(validateGoogleStep(1,googleData,language));
     if(index===2)return !googleData.phone.trim()&&!googleData.secondaryPhone.trim();
     if(index===3)return !googleData.hoursEnabled;
     if(index===4)return !googleData.description.trim()&&!googleData.services.trim()&&!googleData.products.trim();
     if(index===5)return !selectedRecord.logo_path&&!selectedRecord.cover_path&&!selectedRecord.gallery_paths.length&&!googleFiles.length;
     return true;
    };
    const next=steps.find(incomplete);
    closeKeyboard();
    if(next!==undefined){setEditLoadedGoogle(false);setGoogleStep(next);revealWizard();return;}
    setWizardStep(3);revealWizard();return;
   }
  }
  if(wizardStep===2&&selected==="directory_listings"){const issue=validateDirectory(directoryData,effectiveCategory,language);if(issue){setWizardError(issue);return;}}
  if(wizardStep===2&&selected==="seo_improvement"){
   if(webStage===0){setWebStage(1);closeKeyboard();revealWizard();return;}
   if(webStage===1&&webRepair.requestRepair){setWebStage(2);closeKeyboard();revealWizard();return;}
   const invalid=validateWebRepair(webRepair,language);if(invalid){setWizardError(invalid);return;}
  }
  if(wizardStep===2&&selected!=="google_profile"&&selected!=="seo_improvement"&&selected!=="directory_listings"&&goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5)){setWizardError(translate("marketing.action.choose_an_option_or_describe_your_needs_in_at_least_1"));return;}
  if(wizardStep===2&&goal.trim().length>1500){setWizardError(translate("marketing.action.the_message_cannot_exceed_1_500_characters"));return;}
  if(wizardStep<3){closeKeyboard();setWizardStep((wizardStep+1) as WizardStep);revealWizard();}
 };
 const goBack=()=>{setWizardError("");
  if(wizardStep===2&&selected==="seo_improvement"&&webStage>0){setWebStage(webStage-1);closeKeyboard();revealWizard();return;}
  if(wizardStep===3&&selected==="google_profile"){editWizardStep(2);setGoogleStep(googleStepNames.length-1);return;}if(wizardStep===2&&selected==="google_profile"&&googleStep>0){closeKeyboard();setGoogleStep(googleStep-1);revealWizard();return;}if(wizardStep>0&&wizardStep<4)editWizardStep((wizardStep-1) as WizardStep);};
 const headerActionRef=useRef<()=>void>(()=>{});
 headerActionRef.current=()=>{
  if(socialPreviewOpen){setSocialPreviewOpen(false);return;}
  goBack();
 };
 const hasSubscreen=(wizardStep>0&&wizardStep<4)||socialPreviewOpen;
 useEffect(()=>{
  if(!registerHeaderBack||!hasSubscreen)return;
  const handler=()=>headerActionRef.current();
  registerHeaderBack(handler);
  return()=>registerHeaderBack(null);
 },[registerHeaderBack,hasSubscreen]);
 const effectiveCategory=chosenCategory||industryId||savedCategory||"other";
 // The VMV internal industry is NOT an official Google category. Ask for the real category separately.
 const googleGoalText=googleData.action==="create"?contentText(contentLanguage,"marketing.action.googleCreateGoal"):googleData.action==="claim"?contentText(contentLanguage,"marketing.action.googleClaimGoal"):contentText(contentLanguage,"marketing.action.googleImproveGoal");
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
  if(!client||!user){setRequests([]);setApprovals([]);setStaff(false);setTeamView(false);setSavedBusinesses([]);setBusinessId("");return;}
  let alive=true;
  const load=async()=>{
   setLoading(true);setError("");
   try{
    void loadSavedBusinesses(user.id);
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
     (teamView&&staff?client.from("vmv_marketing_requests").select("*"):client.from("vmv_marketing_requests").select("*").eq("owner_id",user.id)).order("created_at",{ascending:false}).limit(80),
     (teamView&&staff?client.from("vmv_marketing_quote_acceptances").select("*"):client.from("vmv_marketing_quote_acceptances").select("*").eq("owner_id",user.id)).order("accepted_at",{ascending:false}).limit(120)
    ]);
    if(r.error)throw r.error;
    if(a.error)throw a.error;
    if(alive){setRequests((r.data||[]) as RequestRow[]);setApprovals((a.data||[]) as Acceptance[]);}
   }catch(e){if(alive)setError(translate("marketing.feedback.requestQueryError",{reason:errorMessage(e,translate("marketing.action.check_your_connection"))}));}
   finally{if(alive)setLoading(false);}
  };
  void load();
  return()=>{alive=false;};
 },[client,user,teamView,staff]);
 const loadSavedBusinesses=async(owner:string)=>{
  if(!client)return;
  const [saved,profile,agent,category]=await Promise.all([
   client.from("vmv_marketing_businesses").select("*").eq("owner_id",owner).order("created_at",{ascending:true}).limit(60),
   client.from("smartjob_profiles").select("business_name,website_url,city,state,country,phone").eq("id",owner).maybeSingle(),
   client.from("vmv_ai_businesses").select("id,name").eq("owner_id",owner).limit(60),
   client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",owner).maybeSingle()
  ]);
  if(activeBusinessOwnerRef.current!==owner)return;
  if(saved.error){setBusinessError(translate("marketing.action.couldn_t_load_saved_businesses_try_again"));return;}
  const records=(saved.data||[]) as SavedBusiness[];
  const suggestions:SavedBusiness[]=[];
  const primary=profile.data?.business_name?.trim();
  // An onboarding name or AI Agent name is a suggestion, not proof that two
  // profiles are the same business. Only explicit selection can import it.
  if(primary&&!records.some(x=>x.source_system==="profile"&&x.source_record_id===owner)){
   suggestions.push({id:"profile:"+owner,owner_id:owner,...centralBusinessDefaults(primary,category.data?.category_id||industryId||"other",profile.data?.website_url||null),
    city:profile.data?.city||"",region:profile.data?.state||"",country:(profile.data?.country||"US").toUpperCase(),phone:profile.data?.phone||"",source:"profile",source_system:"profile",source_record_id:owner});
  }
  for(const row of agent.data||[]){
   if(!row.name||records.some(x=>x.source_system==="ai_agent"&&x.source_record_id===row.id))continue;
   suggestions.push({id:"agent:"+row.id,owner_id:owner,...centralBusinessDefaults(row.name),
    source:"agent",source_system:"ai_agent",source_record_id:row.id});
  }
  setSavedBusinesses([...records,...suggestions]);
  if(records.length===1&&!businessEditedRef.current&&!businessId&&draftReady){
   const one=records[0];setBusinessId(one.id);setBusinessDetails({...one});setBusinessFiles(emptyBusinessFiles);
   setName(one.name);setSite(one.website_url||"");setChosenCategory(one.category_id);
   setGoogleData(v=>v.googleCategory||v.phone||v.street?mergeGoogleWithBusiness(v,one):businessGoogleSeed(one,v.action));
  }
  setBusinessError("");
 };
 const pickBusiness=(id:string)=>{
  const record=savedBusinesses.find(x=>x.id===id);
  if(!record)return;
  businessEditedRef.current=true;
  const {source:ignored,...clean}=record;
  setBusinessId(id);setBusinessDetails({...clean});setBusinessFiles(emptyBusinessFiles);
  setName(record.name);setSite(record.website_url||"");setChosenCategory(record.category_id||"other");
  setSaveAlsoInBusiness(false);setConsent(false);
  setGoogleData(v=>businessGoogleSeed(record,v.action));
  setGoogleMedia(emptyMedia);
  setBusinessMessage(en?"Business selected. Only missing details will be requested.":"Negocio seleccionado. Pediremos solo los datos que falten.");
  setBusinessError("");setWizardError("");
 };
 const saveBusiness=async():Promise<string|null>=>{
  if(!client||!user){setBusinessError(en?"Sign in to save your business.":"Inicia sesión para guardar tu negocio.");return null;}
  const draft:CentralBusiness={...businessDetails,name:name.trim(),category_id:effectiveCategory,website_url:websiteAddress(site),owner_id:user.id};
  const invalid=validCentralBusiness(draft);
  if(invalid){setBusinessError(invalid);return null;}
  setBusinessBusy(true);setBusinessError("");setBusinessMessage("");
  try{
   const inMemory=savedBusinesses.find(x=>x.id===businessId&&!x.source&&x.owner_id===user.id);
   const remote=!inMemory&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(businessId)?
    await client.from("vmv_marketing_businesses").select("*").eq("owner_id",user.id).eq("id",businessId).maybeSingle():null;
   const current=inMemory||(remote?.data as SavedBusiness|null)||undefined;
   const newId=current?.id||(/^[a-f0-9-]{36}$/i.test(businessId)?businessId:requestId);
   const payload=centralBusinessWritePayload(draft);
   const result=current?
    await client.from("vmv_marketing_businesses").update(payload).eq("id",current.id).eq("owner_id",user.id).select("*").single():
    await client.from("vmv_marketing_businesses").insert({...payload,id:newId,owner_id:user.id}).select("*").single();
   let saved=result.data as CentralBusiness|null;
   if(result.error){
    // An uncertain response can hide a successful creation. Reuse its stable id.
    const check=await client.from("vmv_marketing_businesses").select("*").eq("id",newId).eq("owner_id",user.id).maybeSingle();
    if(!check.data)throw result.error;
    saved=check.data as CentralBusiness;
   }
   if(!saved)throw Error("Business did not save");
   if(businessFiles.logo||businessFiles.cover||businessFiles.gallery.length){
    const updates:{logo_path?:string;cover_path?:string;gallery_paths?:string[]}={};
    for(const [kind,file] of [
     ...(businessFiles.logo?[["logo",businessFiles.logo] as const]:[]),
     ...(businessFiles.cover?[["cover",businessFiles.cover] as const]:[]),
     ...businessFiles.gallery.map((f,i)=>["gallery-"+i,f] as const)
    ]){
     if(!["image/jpeg","image/png"].includes(file.type)||file.size<10240||file.size>5242880)throw Error(en?"Only JPG/PNG photos of 10 KB–5 MB are allowed.":"Fotos JPG o PNG, de 10 KB a 5 MB.");
     const path=user.id+"/"+saved.id+"/"+kind+"-"+(await googlePhotoKey(file))+"."+(file.type==="image/png"?"png":"jpg");
     const upload=await client.storage.from("vmv-business-media").upload(path,file,{contentType:file.type,upsert:false});
     if(upload.error&&!upload.error.message?.toLowerCase().includes("already exists"))throw upload.error;
     if(kind==="logo")updates.logo_path=path;
     else if(kind==="cover")updates.cover_path=path;
     else updates.gallery_paths=[...(updates.gallery_paths||saved.gallery_paths||[]),path].slice(-12);
    }
    const written=await client.from("vmv_marketing_businesses").update(updates).eq("id",saved.id).eq("owner_id",user.id).select("*").single();
    if(written.error)throw written.error;
    saved=written.data as CentralBusiness;
   }
   if(activeBusinessOwnerRef.current!==user.id)return null;
   setBusinessId(saved.id);setBusinessDetails({...saved});setBusinessFiles(emptyBusinessFiles);
   await loadSavedBusinesses(user.id);
   setBusinessMessage(en?"Business profile saved.":"Perfil de negocio guardado.");
   return saved.id;
  }catch(e){
   setBusinessError(errorMessage(e,en?"Could not save the business.":"No pudimos guardar el negocio."));
   return null;
  }finally{setBusinessBusy(false);}
 };
 const refresh=async()=>{
  if(!client||!user)return;
  setLoading(true);setError("");
  try{
   const [r,a]=await Promise.all([
    (teamView&&staff?client.from("vmv_marketing_requests").select("*"):client.from("vmv_marketing_requests").select("*").eq("owner_id",user.id)).order("created_at",{ascending:false}).limit(80),
    (teamView&&staff?client.from("vmv_marketing_quote_acceptances").select("*"):client.from("vmv_marketing_quote_acceptances").select("*").eq("owner_id",user.id)).order("accepted_at",{ascending:false}).limit(120)
   ]);
   if(r.error)throw r.error;
   if(a.error)throw a.error;
   setRequests((r.data||[]) as RequestRow[]);setApprovals((a.data||[]) as Acceptance[]);
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_load_requests")));}
  finally{setLoading(false);}
 };
 // Refresh visible request cards after returning to the tab, and every minute while open.
 // A change of status is displayed only after the server returns the updated record.
 useEffect(()=>{
  if(!requestsOnly||!client||!user)return;
  let active=true,pending=false;
  const sync=async()=>{
   if(pending||document.visibilityState==="hidden")return;
   pending=true;
   try{
    const [requestsResult,approvalResult]=await Promise.all([
     (teamView&&staff?client.from("vmv_marketing_requests").select("*"):client.from("vmv_marketing_requests").select("*").eq("owner_id",user.id)).order("created_at",{ascending:false}).limit(80),
     (teamView&&staff?client.from("vmv_marketing_quote_acceptances").select("*"):client.from("vmv_marketing_quote_acceptances").select("*").eq("owner_id",user.id)).order("accepted_at",{ascending:false}).limit(120)
    ]);
    if(active&&!requestsResult.error&&!approvalResult.error){
     setRequests((requestsResult.data||[]) as RequestRow[]);
     setApprovals((approvalResult.data||[]) as Acceptance[]);
    }
   }catch{/* Manual Refresh remains available if background refresh fails. */}
   finally{pending=false;}
  };
  const handleVisibility=()=>{if(document.visibilityState==="visible")void sync();};
  const interval=window.setInterval(()=>void sync(),60000);
  window.addEventListener("focus",handleVisibility);
  document.addEventListener("visibilitychange",handleVisibility);
  return()=>{active=false;window.clearInterval(interval);window.removeEventListener("focus",handleVisibility);document.removeEventListener("visibilitychange",handleVisibility);};
 },[requestsOnly,client,user,teamView,staff]);
 useEffect(()=>{
  if(!requestsOnly||!client||!user||!campaignTestCheckoutVisible)return;
  let active=true;
  void client.from("vmv_marketing_campaign_test_payments")
   .select("request_id,quote_revision,amount_cents,paid_at")
   .eq("owner_id",user.id).order("paid_at",{ascending:false}).limit(100)
   .then(({data,error})=>{if(active&&!error)setCampaignTestReceipts(data||[]);});
  return()=>{active=false;};
 },[requestsOnly,client,user?.id,requests,campaignTestCheckoutVisible]);
 const ownRequests=useMemo(()=>requests.filter(r=>r.owner_id===user?.id),[requests,user]);
 const shown=teamView&&staff?requests:ownRequests;
 const isAccepted=(req:RequestRow)=>approvals.some(a=>a.request_id===req.id&&a.quote_revision===req.quote_revision&&a.quoted_price_cents===req.quoted_price_cents);
 const isCampaignTestPaid=(req:RequestRow)=>campaignTestReceipts.some(p=>
  p.request_id===req.id&&p.quote_revision===req.quote_revision&&p.amount_cents===req.quoted_price_cents);
 const startCampaignTestCheckout=async(req:RequestRow)=>{
  if(!client||!user||req.owner_id!==user.id||req.service_code!=="campaign_setup"||
     req.status!=="quoted"||!isAccepted(req)||isCampaignTestPaid(req)||!campaignTestCheckoutVisible)return;
  setCampaignCheckoutBusy(req.id);setError("");setMessage("");
  try{
   const {data:{session},error:sessionError}=await client.auth.getSession();
   if(sessionError||!session?.access_token)throw new Error("session_required");
   const response=await fetch("/api/marketing/campaign-checkout",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
    body:JSON.stringify({request_id:req.id})
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||typeof result?.url!=="string"||
      !result.url.startsWith("https://checkout.stripe.com/"))throw new Error("checkout_unavailable");
   window.location.assign(result.url);
  }catch{setError(en?"Test payment is unavailable. Try again later.":"El pago de prueba no está disponible. Intenta de nuevo más tarde.");}
  finally{setCampaignCheckoutBusy(null);}
 };
 const openPrivatePhoto=async(path:string)=>{
  if(!client)return;
  const {data,error:mediaError}=await client.storage.from("vmv-google-media").createSignedUrl(path,120);
  if(mediaError||!data?.signedUrl){setError(translate("marketing.action.couldn_t_open_the_private_image_try_again"));return;}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 };
 const openBusinessPhoto=async(path:string)=>{
  if(!client||!user)return;
  // The private bucket has owner/staff policies and never exposes public URLs.
  const {data,error:photoError}=await client.storage.from("vmv-business-media").createSignedUrl(path,90);
  if(photoError||!data?.signedUrl){setError(en?"Private photo is not available.":"No pudimos abrir la foto privada.");return;}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 };
 const submit=async()=>{
  setError("");setMessage("");setWizardError("");
  if(wizardStep!==3||submitting.current)return;
  submitting.current=true;
  if(!client||!user){submitting.current=false;setWizardError(translate("marketing.action.sign_in_to_vmv_business_to_submit_your_request"));return;}
  if(name.trim().length<2||name.trim().length>150){setWizardStep(1);setWizardError(translate("marketing.action.enter_a_business_name_2_150_characters"));submitting.current=false;return;}
  if(selected==="google_profile"){
   const missing=validateGoogleAll(googleData,language);
   if(missing){setWizardStep(2);setGoogleStep(missing.step);setWizardError(missing.error);submitting.current=false;return;}
   const invalid=validateGoogleLinks(googleData,language);
   if(invalid){setWizardStep(2);setGoogleStep(2);setWizardError(invalid);submitting.current=false;return;}
   const bad=googleFiles.find(({file})=>!(["image/jpeg","image/png"].includes(file.type))||file.size<10240||file.size>5242880);
   if(bad){setWizardStep(2);setGoogleStep(5);setWizardError(translate("marketing.feedback.invalidPhoto",{file:bad.file.name}));submitting.current=false;return;}
  }
  if(selected!=="google_profile"&&selected!=="seo_improvement"&&selected!=="directory_listings"&&((goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5))||goal.trim().length>1500)){setWizardStep(2);setWizardError(translate("marketing.action.choose_a_need_or_describe_the_result_you_want"));submitting.current=false;return;}
  if(selected==="review_strategy"&&reviewMode==="request"&&!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(reviewLink.trim())){setWizardStep(2);setWizardError(translate("marketing.action.enter_a_valid_https_link_to_request_reviews"));submitting.current=false;return;}
  if(selected==="directory_listings"&&validateDirectory(directoryData,effectiveCategory,language)){setWizardStep(2);setWizardError(validateDirectory(directoryData,effectiveCategory,language));submitting.current=false;return;}
  if(selected==="seo_improvement"&&validateWebRepair(webRepair,language)){setWizardStep(2);setWizardError(validateWebRepair(webRepair,language));submitting.current=false;return;}
  if(selected==="seo_improvement"&&!site.trim()){setWizardStep(1);setWizardError(translate("marketing.action.enter_the_website_you_want_to_improve"));submitting.current=false;return;}
  if(site.trim()&&!websiteAddress(site)){setWizardStep(1);setWizardError(translate("marketing.action.the_website_url_must_be_valid"));submitting.current=false;return;}
  if(!consent){setWizardError(translate("marketing.action.check_the_authorization_box_so_we_can_process_your_re"));submitting.current=false;return;}
  setSubmissionQuiz({seed:requestId,processing:true});
  setBusy(true);
  const uploaded:string[]=[];
  let insertAttempted=false;
  let inserted=false;
  try{
   const {data:existing,error:lookupError}=await client.from("vmv_marketing_requests")
    .select("id").eq("id",requestId).eq("owner_id",user.id).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing){
    inserted=true;setSubmittedId(String(existing.id).slice(0,8));setWizardStep(4);
    await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
    setMessage(translate("marketing.action.this_request_was_already_saved_we_didn_t_submit_a_dup"));
    await refresh();return;
   }
   let linkedId=businessId;
   if(!savedBusinesses.some(x=>x.id===linkedId&&!x.source)){
    const createdId=await saveBusiness();
    if(!createdId)throw Error(en?"Save or select your business before submitting.":"Guarda o selecciona tu negocio antes de enviar.");
    linkedId=createdId;
   }
   const found=await client.from("vmv_marketing_businesses").select("*").eq("owner_id",user.id).eq("id",linkedId).maybeSingle();
   if(found.error||!found.data)throw Error(en?"Business unavailable. Select your business again.":"El negocio no está disponible. Vuelve a seleccionarlo.");
   const storedBusiness=found.data as CentralBusiness;
   // Save the customer-approved request before changing the reusable profile.
   // The request records the reviewed version without changing the stored
   // profile when the optional "save changes" control was not selected.
   const approvedBusiness:CentralBusiness={...storedBusiness,
     ...businessDetails,id:linkedId,owner_id:user.id,name:name.trim(),
     category_id:effectiveCategory,website_url:websiteAddress(site),
     logo_path:storedBusiness.logo_path,cover_path:storedBusiness.cover_path,gallery_paths:storedBusiness.gallery_paths};
   const snapshot=businessRequestSnapshot(approvedBusiness,selected==="google_profile"?"google_profile":"other",
     selected==="google_profile"?normalizeGoogleProfile(googleData):undefined);
   const mediaPaths:{kind:string;path:string}[]=[];
   if(selected==="google_profile"){
    const folder=user.id+"/"+requestId;
    for(const {kind,file} of googleFiles){
     const extension=file.type==="image/png"?"png":"jpg";
     const fingerprint=await googlePhotoKey(file);
     const path=folder+"/"+kind+"-"+fingerprint+"."+extension;
     const {error:uploadError}=await client.storage.from("vmv-google-media").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
     if(uploadError&&uploadError.message?.toLowerCase().includes("already exists")){mediaPaths.push({kind,path});continue;}
     if(uploadError)throw new Error("No se pudo guardar la imagen "+kind+". "+uploadError.message);
     uploaded.push(path);mediaPaths.push({kind,path});
    }
    // Admin already knows how to open private Google request photos. Copy
    // inherited central-business media into immutable request-scoped paths,
    // rather than depending on a profile image that may later be replaced.
    const inherited=[
     ...(storedBusiness.logo_path?[{kind:"logo",source:storedBusiness.logo_path}]:[]),
     ...(storedBusiness.cover_path?[{kind:"cover",source:storedBusiness.cover_path}]:[]),
     ...storedBusiness.gallery_paths.map((source,i)=>({kind:"photo-"+(i+1),source}))
    ];
    const used=new Set(mediaPaths.map(m=>m.kind));
    let nextPhoto=1;
    for(const item of inherited){
     let kind=item.kind;
     if(kind.startsWith("photo-")){
      while(nextPhoto<=8&&used.has("photo-"+nextPhoto))nextPhoto++;
      if(nextPhoto>8)break;
      kind="photo-"+nextPhoto;
     }
     if(used.has(kind)||mediaPaths.length>=10)continue;
     const downloaded=await client.storage.from("vmv-business-media").download(item.source);
     if(downloaded.error||!downloaded.data)throw Error(en?"We could not attach a saved business photo. Try again.":"No pudimos adjuntar una foto guardada del negocio. Inténtalo nuevamente.");
     const type=item.source.toLowerCase().endsWith(".png")?"image/png":"image/jpeg";
     const blob=new Blob([downloaded.data],{type});
     if(blob.size<10240||blob.size>5242880)throw Error(en?"A saved business photo must be 10 KB–5 MB.":"Una foto guardada debe pesar entre 10 KB y 5 MB.");
     const fingerprint=await googlePhotoKey(blob);
     const extension=type==="image/png"?"png":"jpg";
     const path=folder+"/"+kind+"-"+fingerprint+"."+extension;
     const uploadedMedia=await client.storage.from("vmv-google-media").upload(path,blob,{contentType:type,cacheControl:"3600",upsert:false});
     if(uploadedMedia.error&&!uploadedMedia.error.message?.toLowerCase().includes("already exists"))
      throw Error(en?"We could not preserve a business photo for this request.":"No pudimos conservar una foto del negocio para esta solicitud.");
     if(!uploadedMedia.error)uploaded.push(path);
     mediaPaths.push({kind,path});used.add(kind);
    }
   }
   insertAttempted=true;
   const {data,error:insertError}=await client.from("vmv_marketing_requests").insert({
    id:requestId,owner_id:user.id,service_code:selected,business_name:name.trim(),
    business_id:linkedId,business_snapshot:snapshot,consent_version:"vmv-business-consent-v1",
    category_id:effectiveCategory,website_url:websiteAddress(site),
    goal_text:selected==="directory_listings"?(contentText(contentLanguage,"marketing.feedback.directoryGoal",{count:directoryData.selected.length,city:directoryData.city,state:directoryData.state})):selected==="google_profile"?googleGoalText:selected==="seo_improvement"?(webRepair.requestRepair?contentText(contentLanguage,"marketing.feedback.repairGoal"):contentText(contentLanguage,"marketing.feedback.reportOnlyGoal")):selected==="review_strategy"&&reviewInput.trim()?
     (contentText(contentLanguage,"marketing.feedback.reputationGoal",{review:reviewInput.trim().slice(0,650),reply:(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)).slice(0,700)})).slice(0,1500):goal.trim(),
    agreed_to_contact:true,
    ...(selected==="google_profile"?{google_profile_data:{...normalizeGoogleProfile(googleData),media:mediaPaths}}:{}),
    ...(selected==="seo_improvement"?{web_repair_data:webRepair}:{}),
    ...(selected==="directory_listings"?{directory_data:{...directoryData,industry:effectiveCategory}}:{}),
    ...(selected==="review_strategy"?{reputation_data:{mode:reviewMode,reviewText:reviewInput.slice(0,650),replyText:(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)).slice(0,1200),reviewLink:reviewLink.slice(0,750)}}:{})
   }).select("id").single();
   if(insertError){
    const {data:alreadySaved}=await client.from("vmv_marketing_requests")
     .select("id").eq("id",requestId).eq("owner_id",user.id).maybeSingle();
    if(!alreadySaved)throw insertError;
    inserted=true;
    setSubmittedId(String(alreadySaved.id).slice(0,8));setWizardStep(4);
    await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
    setMessage(translate("marketing.action.we_already_received_your_request_it_wasn_t_sent_again"));
    await refresh();return;
   }
   inserted=true;
   let profileUpdateWarning="";
   if(saveAlsoInBusiness&&selected==="google_profile"){
    try{
     const changed=await client.from("vmv_marketing_businesses")
      .update({name:name.trim(),category_id:effectiveCategory,website_url:websiteAddress(site),...googleChangesForProfile(storedBusiness,googleData)})
      .eq("owner_id",user.id).eq("id",linkedId).select("*").single();
     if(changed.error)throw changed.error;
     setBusinessDetails(changed.data as CentralBusiness);
     setSaveAlsoInBusiness(false);
    }catch{
     // The request is already confirmed. A failed optional synchronization
     // must not turn its successful submission into a misleading retry.
     profileUpdateWarning=en?" The request was saved, but the business profile could not be updated.":" La solicitud se guardó, pero el perfil del negocio no pudo actualizarse.";
    }
   }
   const savedId=String(data.id).slice(0,8);
   setSubmittedId(savedId);setWizardStep(4);
   await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
   setMessage(translate("marketing.feedback.saved",{id:requestId,photos:uploaded.length?translate("marketing.feedback.photoCount",{count:uploaded.length}):""})+profileUpdateWarning);
   setGoal("");setConsent(false);setGoogleMedia(emptyMedia);
   await refresh();
  }catch(e){
   if(!inserted&&!insertAttempted&&uploaded.length)await client.storage.from("vmv-google-media").remove(uploaded);
   setWizardError(translate("marketing.feedback.submitFailed",{reason:errorMessage(e,translate("marketing.action.try_again"))}));
  }finally{setSubmissionQuiz(current=>current?{...current,processing:false}:null);setBusy(false);submitting.current=false;}
 };
 const accept=async(req:RequestRow)=>{
  if(!client||!user||req.owner_id!==user.id||req.status!=="quoted"||req.quoted_price_cents===null)return;
  if(isAccepted(req))return;
  if(!window.confirm(translate("marketing.feedback.approvePrompt",{price:money(req.quoted_price_cents)})))return;
  setError("");setMessage("");setBusy(true);
  try{
   const {error:acceptError}=await client.from("vmv_marketing_quote_acceptances").insert({
    owner_id:user.id,request_id:req.id,quote_revision:req.quote_revision,
    quoted_price_cents:req.quoted_price_cents
   });
   if(acceptError)throw acceptError;
   setMessage(translate("marketing.feedback.approved",{price:money(req.quoted_price_cents)}));
   await refresh();
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_record_your_approval")));}
  finally{setBusy(false);}
 };
 const saveQuote=async(req:RequestRow)=>{
  if(!client||!staff)return;
  const dollars=quoteDollars.trim();
  const amount=Number(dollars);
  if(!/^\d+(\.\d{1,2})?$/.test(dollars)||!Number.isFinite(amount)||amount>1000000){
   setError(translate("marketing.action.enter_a_valid_usd_price_including_0_for_a_free_servic"));return;
  }
  if(quoteNote.trim().length<8){setError(translate("marketing.action.describe_what_s_included_in_the_quote_before_sending_"));return;}
  setBusy(true);setError("");setMessage("");
  try{
   const {error:quoteError}=await client.from("vmv_marketing_requests")
    .update({quoted_price_cents:Math.round(amount*100),quote_note:quoteNote.trim(),
     staff_update:contentText(contentLanguage,"marketing.feedback.prepared")})
    .eq("id",req.id);
   if(quoteError)throw quoteError;
   setMessage(translate("marketing.action.quote_saved_the_customer_can_view_and_approve_it_from"));
   await refresh();
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_save_the_quote")));}
  finally{setBusy(false);}
 };
 const updateStage=async(req:RequestRow)=>{
  if(!client||!staff)return;
  if(["approved","in_progress","verified"].includes(stage)&&!isAccepted(req)){
   setError(translate("marketing.action.you_cannot_begin_or_verify_work_without_approval_of_t"));return;
  }
  const url=safeSite(evidence);
  if(stage==="verified"&&!url){setError(translate("marketing.action.to_verify_the_result_include_a_valid_public_evidence_"));return;}
  setBusy(true);setError("");setMessage("");
  try{
   const payload={
    status:stage,staff_update:stageUpdate.trim().slice(0,1500)||null,
    evidence_url:stage==="verified"?url:req.evidence_url,
    verified_at:stage==="verified"?new Date().toISOString():null
   };
   const {error:upError}=await client.from("vmv_marketing_requests").update(payload).eq("id",req.id);
   if(upError)throw upError;
   setMessage(translate("marketing.action.status_updated_the_customer_will_see_it_when_viewing_"));
   await refresh();
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_update_the_request")));}
  finally{setBusy(false);}
 };
 const updateDirectoryProgress=async(req:RequestRow)=>{
  if(!client||!staff||!req.directory_data)return;
  setBusy(true);setError("");
  try{
   const selected=req.directory_data.selected.map(t=>{
    const status=directoryStatus[t.id]||t.status;
    const evidenceUrl=(directoryProof[t.id]??t.evidenceUrl).trim();
    if(["published","already_listed"].includes(status)&&!safeDirectoryUrl(evidenceUrl))throw Error(translate("marketing.feedback.confirmListing",{name:t.name}));
    if(["submitted","published"].includes(status)&&!isAccepted(req))throw Error(translate("marketing.feedback.approvalNeeded",{name:t.name}));
    return {...t,status,evidenceUrl:["published","already_listed"].includes(status)?evidenceUrl:"",note:t.note};
   });
   const {error:saveError}=await client.from("vmv_marketing_requests").update({directory_data:{...req.directory_data,selected}}).eq("id",req.id);
   if(saveError)throw saveError;
   setMessage(translate("marketing.action.statuses_saved_the_customer_can_see_each_directory_s_"));
   await refresh();
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_save_directory_statuses")));}
  finally{setBusy(false);}
 };
 const selectCaseAction=(id:string,kind:"note"|"edit"|"cancel"|"delete")=>{
  setCaseAction({id,kind});setCaseActionText("");setCaseActionError("");
 };
 const sendCaseAction=async(req:RequestRow)=>{
  if(!client||!user||req.owner_id!==user.id||!caseAction||caseAction.id!==req.id)return;
  const details=caseActionText.trim();
  if(["note","edit"].includes(caseAction.kind)&&details.length<8){
   setCaseActionError(en?"Please describe your request in at least 8 characters.":"Describe tu solicitud con al menos 8 caracteres.");return;
  }
  if(caseAction.kind==="delete"&&!window.confirm(en?
   "Request removal of this case? The VMV team will review it; this will not delete it immediately.":
   "¿Solicitar la eliminación de este caso? VMV lo revisará; no se eliminará inmediatamente."))return;
  const titles={note:"Nota del cliente",edit:"Solicitud de modificación",cancel:"Solicitud de cancelación",delete:"Solicitud de eliminación"} as const;
  const text=details||(caseAction.kind==="cancel"?"Solicito cancelar este caso.":"Solicito eliminar este expediente de acuerdo con el procedimiento aplicable.");
  setCaseActionBusy(true);setCaseActionError("");
  try{
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("session");
   const response=await fetch("/api/support",{
    method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"message",source:"marketing",id:req.id,
     message:titles[caseAction.kind]+" (#"+req.id.slice(0,8)+"): "+text,
     request_key:crypto.randomUUID()})
   });
   const payload=await response.json().catch(()=>({})) as {error?:string};
   if(!response.ok)throw Error(payload.error||"request");
   setCaseAction(null);setCaseActionText("");
   setMessage(en?"Message sent to VMV. The case remains unchanged until it is reviewed.":"Mensaje enviado a VMV. El caso sigue igual hasta que se revise.");
  }catch(e){
   setCaseActionError(e instanceof Error&&e.message!=="request"&&e.message!=="session"?e.message:
    en?"We couldn't send the message. Open Support to continue.":"No pudimos enviar el mensaje. Abre Soporte para continuar.");
  }finally{setCaseActionBusy(false);}
 };
 const openStaff=(req:RequestRow)=>{
  setDirectoryStatus({});setDirectoryProof({});
  setActiveStaffId(req.id);setStage(req.status);
  setQuoteDollars(req.quoted_price_cents===null?"":(req.quoted_price_cents/100).toFixed(2));
  setQuoteNote(req.quote_note||"");setStageUpdate(req.staff_update||"");setEvidence(req.evidence_url||"");
 };
 return <div className={styles.root}>
  {!requestsOnly&&wizardStep===0&&user&&businessId&&savedBusinesses.some(x=>x.id===businessId&&!x.source)?<div className={styles.activeBusiness}><MapPinned size={15}/>{en?"Active business: ":"Negocio activo: "}<strong>{savedBusinesses.find(x=>x.id===businessId)?.name||name}</strong></div>:null}
  {!requestsOnly&&wizardStep===0?<header className={styles.catalogHeading}><h2>{en?"What would you like to do?":"¿Qué quieres hacer hoy?"}</h2><nav className={styles.catalogLinks} aria-label={en?"Marketing shortcuts":"Accesos de Marketing"}><a href="/vista-app/marketing/requests" className={styles.historyLink}><ClipboardList size={16}/> {translate("marketing.ui.requests")}</a><a href="/vista-app/marketing/negocios" className={styles.historyLink}><MapPinned size={16}/> {en?"My businesses":"Mis negocios"}</a></nav>{pausedStep!==null?<button type="button" className={styles.resumeDraft} onClick={()=>{setWizardStep(pausedStep);setPausedStep(null);revealWizard();}}>{translate("marketing.request.continueDraft")}</button>:null}</header>:null}
  {!requestsOnly&&wizardStep>0&&wizardStep<4?<button type="button" className={styles.historyWizardAccess} onClick={()=>{void (async()=>{if(await saveCurrentDraft())window.location.assign("/vista-app/marketing/requests");})();}}><ClipboardList size={15}/> {translate("marketing.ui.requests")}</button>:null}
  {!requestsOnly?<section className={wizardStep===0?styles.catalogPanel:styles.wizardPanel} id="vmv-marketing-request" aria-label={translate("marketing.ui.createAria")}>
   {wizardStep===4?<div className={styles.wizardSuccess} role="status">
    <div className={styles.successIcon}><CheckCircle2 size={33}/></div>
    <span className={styles.overline}>{translate("marketing.copy.request_received")}</span>
    <h3>{translate("marketing.copy.success_we_received_your_request")}</h3>
    <p>{translate("marketing.copy.reference")} <strong>#{submittedId}</strong>{translate("marketing.copy.we_ll_review_it_any_quote_or_additional_details_will")}</p>
    <div className={styles.successReminder}><ShieldCheck size={17}/> {translate("marketing.copy.nothing_has_been_charged_or_published_any_cost_will_")}</div>
    <div className={styles.wizardButtons}>
     <button type="button" className={styles.wizardBack} onClick={()=>{setRequestId(crypto.randomUUID());setWizardStep(0);setSubmittedId(null);setWizardError("");setPausedStep(null);revealWizard();}}>{translate("marketing.copy.create_another_request")}</button>
     <button type="button" className={styles.wizardPrimary} onClick={()=>window.location.assign("/vista-app/marketing/requests")}>{translate("marketing.copy.view_progress")} <ArrowRight size={16}/></button>
    </div>
   </div>:<>
    {wizardStep>0?<div className={styles.wizardHeading}>
     <div><span className={styles.overline}><LayoutGrid size={15}/> {translate("marketing.copy.marketing_assistant")}</span>
      <h3>{wizardStep===1?translate("marketing.action.first_your_business"):wizardStep===2&&selected==="google_profile"?(en?"Your Google Business Profile":"Tu perfil en Google"):wizardStep===2?translate("marketing.action.what_do_you_want_to_achieve"):translate("marketing.action.confirm_your_request")}</h3>
     </div>
     <span className={styles.stepCount}>{wizardStep+1} / 4</span>
    </div>:null}
    {wizardStep>0?<ol className={styles.stepper} aria-label={translate("marketing.action.request_progress")}>
     {wizardTitles.map((label,index)=><li key={label} className={index===wizardStep?styles.stepCurrent:index<wizardStep?styles.stepDone:styles.stepPending} aria-current={index===wizardStep?"step":undefined}>
      <span className={styles.stepBubble}>{index<wizardStep?<Check size={14}/>:index+1}</span><span>{label}</span>
     </li>)}
    </ol>:null}
    {wizardStep===0?(socialPreviewOpen?<SocialCaptionPreview businessName={name} hideBack={Boolean(registerHeaderBack)} onBack={()=>setSocialPreviewOpen(false)}/>:<div className={styles.wizardBody}>
     <div className={styles.servicePicker} data-vmv-shortcut-scope="marketing-actions">
      {services.filter(service=>["google_profile","seo_improvement","review_strategy"].includes(service.id)).map(service=>{
       const ServiceIcon=serviceIcons[service.id];
       return <button type="button" key={service.id} data-vmv-shortcut-id={service.id==="google_profile"?"google-profile":service.id==="seo_improvement"?"seo":"reputation"} onClick={()=>chooseService(service.id)} className={styles.serviceTile} aria-label={translate("marketing.action.chooseServiceAria",{service:serviceName(service.id)})}>
        <span className={styles.serviceIcon}><ServiceIcon size={23} strokeWidth={1.8}/></span>
        <span className={styles.serviceText}><strong>{serviceName(service.id)}</strong><small>{serviceWhy(service.id)}</small></span>
        <span className={styles.serviceCta}>{en?"Start":"Empezar"}</span>
       </button>;
      })}
      <button type="button" data-vmv-shortcut-id="social-captions" onClick={()=>setSocialPreviewOpen(true)} className={styles.serviceTile} aria-label={en?"Create social media captions":"Crear descripciones para redes"}>
       <span className={styles.serviceIcon}><Video size={23} strokeWidth={1.8}/></span>
       <span className={styles.serviceText}><strong>{en?"Social media captions":"Descripciones para redes"}</strong><small>{en?"Caption suggestions from your videos.":"Descripciones recomendadas a partir de tus videos."}</small></span>
       <span className={styles.serviceCta}>{en?"Start":"Empezar"}</span>
      </button>
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> {translate("marketing.ui.requestFree")}</p>
     <section className={styles.futureSection} aria-labelledby="vmv-marketing-next">
      <div className={styles.futureHeading}><div><span>{en?"WHAT'S NEXT":"LO QUE VIENE"}</span><h3 id="vmv-marketing-next">{en?"More tools for your business":"Más herramientas para tu negocio"}</h3><p>{en?"Planned features. Not available yet.":"Funciones previstas. Todavía no están disponibles."}</p></div></div>
      <div className={styles.futureGrid}>{comingSoonCards.map(feature=><article key={feature.id} className={styles.futureCard}>
       <div className={styles.futureIcon}><feature.Icon size={20}/></div>
       <strong>{en?feature.en:feature.es}</strong>
       <p>{en?feature.enDesc:feature.esDesc}</p>
       <small>{en?"Coming soon":"Próximamente"}</small>
      </article>)}</div>
     </section>
    </div>):null}
    {wizardStep===1?<div className={styles.wizardBody}>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>{translate("marketing.copy.selected_service")}</small><strong>{serviceName(selected)}</strong></span><button type="button" onClick={()=>{setWizardStep(0);setWizardError("");}}>{translate("marketing.copy.change")}</button></div>
     <div className={styles.wizardFields}>
      <div className={styles.savedBusinessBox}>
       <label className={styles.wizardField}><span>{en?"Load a saved business":translate("marketing.action.load_a_saved_business")}</span>
        <select value={businessId} onChange={e=>pickBusiness(e.target.value)} disabled={!user||businessBusy}>
         <option value="">{en?"Select a business…":translate("marketing.action.select_your_business")}</option>
         {savedBusinesses.map(item=><option key={item.id} value={item.id}>{item.name}{item.source?" · "+(item.source==="profile"?translate("marketing.action.vmv_profile"):"AI Agents"):""}</option>)}
        </select>
       </label>
       <div className={styles.businessActions}>
        <button type="button" disabled={savedBusinesses.some(x=>!x.source)} onClick={()=>{businessEditedRef.current=true;setBusinessId("");setBusinessDetails({id:"",owner_id:user?.id||"",...centralBusinessDefaults()});setBusinessFiles(emptyBusinessFiles);setGoogleData(emptyGoogle);setGoogleMedia(emptyMedia);setName("");setSite("");setChosenCategory("other");setBusinessMessage("");setBusinessError("");}}>{en?"New business":translate("marketing.action.new_business")}</button>
       </div>
       {savedBusinesses.some(x=>!x.source)?<p className={styles.businessNote}>{en?"Additional businesses are pending plan-limit approval. Existing businesses remain accessible.":"Los negocios adicionales están pendientes de definir los límites del plan. Los existentes se conservan."}</p>:null}
       {!user?<p className={styles.businessNote}>{en?"Sign in to save and load businesses on any device. You can still complete this request." :translate("marketing.action.customersNote")}</p>:null}
       {businessMessage?<p role="status" className={styles.businessSuccess}>{businessMessage}</p>:null}
       {businessError?<p role="alert" className={styles.businessError}>{businessError}</p>:null}
      </div>
      <label className={styles.wizardField}><span>{translate("marketing.copy.business_name")} <em>{translate("marketing.copy.required")}</em></span><input type="text" autoComplete="organization" value={name} maxLength={150} onChange={e=>{businessEditedRef.current=true;setName(e.target.value);setWizardError("");}} placeholder={translate("marketing.action.e_g_my_business")} /></label>
      <label className={styles.wizardField}><span>{translate("marketing.copy.what_does_your_business_do")}</span><BusinessCategoryPicker value={effectiveCategory} onChange={v=>{businessEditedRef.current=true;setChosenCategory(v);}}/></label>
      <label className={styles.wizardField}><span>{translate("marketing.copy.website")} <em>{selected==="seo_improvement"?translate("marketing.action.required"):translate("marketing.action.optional")}</em></span><input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" autoComplete="url" value={site} maxLength={500} onChange={e=>{businessEditedRef.current=true;setSite(e.target.value);setWizardError("");}} placeholder={translate("category.websiteExample")}/></label>
      <CentralBusinessEditor business={businessDetails} onChange={v=>{businessEditedRef.current=true;setGoogleData(g=>applyProfileEditsToGoogle(g,businessDetails,v));setBusinessDetails(v);}} files={businessFiles} onFiles={setBusinessFiles}/>
      <button type="button" className={styles.saveBusinessInline} disabled={businessBusy||!user} onClick={()=>void saveBusiness()}>{businessBusy?(en?"Saving…":"Guardando…"):savedBusinesses.some(x=>x.id===businessId&&!x.source)?(en?"Save business changes":translate("marketing.action.update_saved_business")):(en?"Save this business for next time":translate("marketing.action.save_this_business_for_future_requests"))}</button>
     </div>
    </div>:null}
    {wizardStep===2?<div className={styles.wizardBody}>
     {selected==="google_profile"?<>
      <GoogleProfileWizard key={businessId+"-"+googleStep} editLoaded={editLoadedGoogle} loadedData={savedBusinesses.some(b=>b.id===businessId&&!b.source)?businessGoogleSeed(businessDetails,googleData.action):undefined} step={googleStep} data={googleData} onData={v=>{setGoogleData(v);setWizardError("");}} media={googleMedia} onMedia={setGoogleMedia} business={name} website={websiteAddress(site)||site}/>
      {googleStep===5&&[businessDetails.logo_path,businessDetails.cover_path,...businessDetails.gallery_paths].filter(Boolean).length>0?<div className={styles.googleReview}><strong>{en?"Photos already saved in your business profile":"Fotos guardadas en el perfil de tu negocio"}</strong>{[businessDetails.logo_path,businessDetails.cover_path,...businessDetails.gallery_paths].filter((p):p is string=>Boolean(p)).map((path,i)=><button key={path} type="button" onClick={()=>void openBusinessPhoto(path)}>{en?"View private photo ":"Ver foto privada "}{i+1}</button>)}<small>{en?"These images will be referenced in the approved request.":"Estas imágenes quedarán referenciadas en la solicitud aprobada."}</small></div>:null}
     </>:<>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>{translate("marketing.copy.preparing_your_request")}</small><strong>{serviceName(selected)}</strong></span></div>
     {selected==="directory_listings"?<DirectoryDiscovery data={directoryData} onChange={setDirectoryData} industry={effectiveCategory}/>:null}
     {selected==="seo_improvement"?<WebRepairStudio step={webStage} site={websiteAddress(site)||site} data={webRepair} onChange={setWebRepair} accessToken={accessToken}/>:null}
     {selected==="review_strategy"?<ReputationStudio business={name} mode={reviewMode} onModeChange={v=>{setReviewMode(v);setGoal(v==="request"?"Quiero solicitar reseñas auténticas a mis clientes.":"Necesito preparar respuestas para reseñas reales.");}} reviewInput={reviewInput} onReviewChange={v=>{setReviewInput(v);setReviewReply("");setGoal(v.trim()?"Necesito preparar una respuesta revisable para una reseña real.":"");}} reply={reviewReply} onReplyChange={setReviewReply} link={reviewLink} onLinkChange={v=>{setReviewLink(v);setGoal("Quiero compartir un enlace auténtico para recibir reseñas de mis clientes.");}} onDirectory={()=>{setSelected("directory_listings");setWizardError("");setGoal("");}} reviewTone={reviewTone} onToneChange={setReviewTone}/>:null}
     {selected==="directory_listings"?<button type="button" className={styles.preset} onClick={()=>{setSelected("review_strategy");setWizardError("");}}>{translate("marketing.copy.back_to_reviews")}</button>:null}
     {selected!=="review_strategy"&&selected!=="seo_improvement"&&selected!=="directory_listings"?<span className={styles.presetLabel}>{translate("marketing.copy.choose_what_you_need")}</span>:null}
     <div className={styles.goalPresets}>{(selected==="review_strategy"||selected==="seo_improvement"||selected==="directory_listings"?[]:suggestedGoals[selected]).map((option,index)=>{const key=("marketing.goal."+selected+"."+index) as MessageKey;const persisted=contentText(contentLanguage,key);return <button key={option} type="button" className={goal===persisted?styles.presetActive:styles.preset} aria-pressed={goal===persisted} onClick={()=>{setGoal(persisted);setWizardError("");}}>
      <CheckCircle2 size={16}/>{translate(key)}
     </button>})}</div>
     {selected!=="seo_improvement"&&selected!=="directory_listings"?<label className={styles.goalLabel}>{selected==="review_strategy"?translate("marketing.action.do_you_need_more_help"):translate("marketing.action.would_you_like_to_add_details")}
      <textarea value={goal} maxLength={1500} onChange={e=>{setGoal(e.target.value);setWizardError("");}} rows={5} placeholder={translate("marketing.action.e_g_my_business_is_listed_but_the_hours_are_wrong_i_d")}/>
      <small>{goal.length}/1500 {translate("marketing.action.counterHint")}</small>
     </label>:null}
     </>}
    </div>:null}
    {wizardStep===3?<div className={styles.wizardBody}>
     <div className={styles.reviewCard}>
      <div className={styles.reviewTop}><ClipboardList size={20}/><strong>{translate("marketing.copy.request_summary")}</strong></div>
      <div className={styles.reviewItem}><span>{en?"Service":"Servicio"}</span><strong>{serviceName(selected)}</strong><button type="button" onClick={()=>editWizardStep(0)}>{translate("marketing.copy.edit")}</button></div>
      <div className={styles.reviewItem}><span>{translate("marketing.copy.business")}</span><strong>{name.trim()}</strong><button type="button" onClick={()=>editWizardStep(1)}>{translate("marketing.copy.edit")}</button></div>
      <div className={styles.reviewItem}><span>{translate("marketing.copy.industry")}</span><strong>{marketingCategoryLabel(language,effectiveCategory,translate("marketing.action.not_specified"))}</strong></div>
      {site.trim()?<div className={styles.reviewItem}><span>{translate("marketing.copy.website")}</span><strong className={styles.wrapValue}>{site.trim()}</strong></div>:null}
      {selected==="google_profile"?<>
       <div className={styles.googleReview}><strong>{en?"Google listing":"Gestión de Google"}</strong>
        <span>{googleData.action==="create"?(en?"Create listing":"Crear perfil"):googleData.action==="claim"?(en?"Claim existing listing":"Reclamar perfil"):en?"Improve listing":"Mejorar perfil"} · {googleData.googleCategory}</span>
        {googleData.action!=="create"&&googleData.existingProfileUrl?<span>{googleData.existingProfileUrl}</span>:null}
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(0);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
       <div className={styles.googleReview}><strong>{en?"Location and address visibility":"Ubicación y visibilidad de la dirección"}</strong>
        <span>{googleData.kind==="service_area"?(en?"Service area; residential address hidden":"Área de servicio; dirección residencial oculta"):
         ([googleData.street,googleData.unit,googleData.city,googleData.region,googleData.postal,googleData.country].filter(Boolean).join(", ")||"—")}</span>
        {googleData.serviceAreas?<span>{en?"Service areas: ":"Zonas de servicio: "}{googleData.serviceAreas}</span>:null}
        <span>{googleData.kind==="service_area"?(en?"Not shared in this request":"No se comparte la dirección privada"):(en?"Storefront address may be visible on Google":"La dirección del local podrá aparecer en Google")}</span>
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(1);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
       <div className={styles.googleReview}><strong>{en?"Contact and booking":"Contacto y reservas"}</strong>
        <span>{googleData.phone||(en?"Phone pending":"Teléfono pendiente")}</span>
        {googleData.secondaryPhone?<span>{googleData.secondaryPhone}</span>:null}
        {site?<span>{websiteAddress(site)||site}</span>:null}
        {googleData.bookingUrl?<span>{googleData.bookingUrl}</span>:null}
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(2);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
       <div className={styles.googleReview}><strong>{en?"Opening hours":"Horarios"}</strong>
        <span>{googleData.hoursEnabled?(googleData.hours.filter(h=>h&&!h.closed).length+" "+(en?"days open":"días abiertos")):(en?"To be confirmed":"Pendientes de confirmar")}</span>
        {googleData.action==="create"&&googleData.openingDate?<span>{en?"Opening date: ":"Fecha de apertura: "}{googleData.openingDate}</span>:null}
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(3);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
       <div className={styles.googleReview}><strong>{en?"Description, products and services":"Descripción, productos y servicios"}</strong>
        <span>{googleData.description||"—"}</span>
        {googleData.services?<span>{googleData.services}</span>:null}{googleData.products?<span>{googleData.products}</span>:null}
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(4);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
       <div className={styles.googleReview}><strong>{en?"Private photos and files":"Fotos y archivos privados"}</strong>
        <span>{en?"Saved business photos: ":"Fotos del negocio: "}{[businessDetails.logo_path,businessDetails.cover_path,...businessDetails.gallery_paths].filter(Boolean).length}</span>
        <span>{en?"Additional request photos: ":"Fotos adicionales: "}{googleFiles.length}</span>
        <button type="button" onClick={()=>{setEditLoadedGoogle(true);setGoogleStep(5);editWizardStep(2);}}>{translate("marketing.copy.edit")}</button>
       </div>
      </>:null}
      {selected==="directory_listings"?<div className={styles.googleReview}><strong>{translate("marketing.copy.requested_directories")}</strong><span>{directoryData.city}, {directoryData.state}</span>{directoryData.selected.map(d=><span key={d.id}>{d.name} · {d.cost==="free"?translate("marketing.action.free_listing"):d.cost==="membership"?translate("marketing.action.membership_may_be_required"):translate("marketing.action.to_evaluate")}</span>)}<span>{translate("marketing.copy.vmv_will_confirm_requirements_and_pricing_before_tak")}</span><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.review_selection")}</button></div>:null}
      {selected==="review_strategy"?<div className={styles.googleReview}><strong>{translate("marketing.copy.my_reputation")}</strong>{reviewInput.trim()?<span>{translate("marketing.copy.real_review")} {reviewInput}</span>:null}{reviewInput.trim()?<span>{translate("marketing.copy.reviewed_response")} {reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)}</span>:null}{reviewLink?<span>{translate("marketing.copy.review_link")} {reviewLink}</span>:null}</div>:null}
      {selected==="seo_improvement"?<div className={styles.googleReview}><strong>{translate("marketing.copy.website_diagnosis")}</strong><span>{webRepair.audit?translate("marketing.action.speed")+(webRepair.audit.scores.performance??"—")+"/100; SEO: "+(webRepair.audit.scores.seo??"—")+"/100":translate("marketing.action.no_automated_analysis_technical_review_required")}</span><span>{translate("marketing.copy.platform")} {webRepair.platform==="other"?webRepair.otherPlatform:webRepair.platform}</span><span>{translate("marketing.copy.repository")} {webRepair.repositoryHost}</span><span>{webRepair.requestRepair?translate("marketing.action.i_want_a_quote"):translate("marketing.action.save_diagnosis_only")}</span><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.review_information")}</button></div>:null}
      <div className={styles.reviewGoal}><span>{translate("marketing.copy.what_you_need")}</span><p>{selected==="seo_improvement"?(webRepair.requestRepair?translate("marketing.action.request_a_repair_evaluation_and_quote"):translate("marketing.action.save_diagnosis_without_repairs")):selected==="google_profile"?googleGoalText:selected==="review_strategy"&&reviewInput.trim()?(translate("marketing.action.reviewLabel")+reviewInput.trim()+translate("marketing.action.reviewResponse")+(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone))):goal.trim()}</p><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.edit_description")}</button></div>
     </div>
     {selected==="google_profile"&&savedBusinesses.some(b=>b.id===businessId&&!b.source)?<label className={styles.permission}><input type="checkbox" checked={saveAlsoInBusiness} onChange={e=>setSaveAlsoInBusiness(e.target.checked)}/><span>{en?"Also save the corrections to my business profile (optional).":"Guardar también las correcciones en mi negocio (opcional)."} <strong>{en?"Leaving this unchecked only changes this request.":"Sin marcar, los cambios serán solo para esta solicitud."}</strong></span></label>:null}
     {selected==="google_profile"?<p className={styles.wizardHint}>{translate("marketing.google.serviceDisclosure")} <a href="https://support.google.com/business/answer/7353941" target="_blank" rel="noopener noreferrer">{translate("marketing.google.thirdPartyNotice")}</a></p>:null}
     <div className={styles.costNote}><Wallet size={22}/><div><strong>{translate("marketing.copy.submit_request_0")}</strong><p>{translate("marketing.copy.any_service_cost_will_be_quoted_later_no_payment_or_")}</p></div></div>
     <label className={styles.permission}><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setWizardError("");}}/>
      <span>{en?"I reviewed these details and they are correct. I authorize VMV to manage this request.":"He revisado los datos y son correctos. Autorizo a VMV a gestionar esta solicitud."} <strong>{en?"Payments, public listings and external changes require separate approval.":"Los pagos, publicaciones y cambios externos necesitan aprobación adicional."}</strong></span>
     </label>
     {authState==="checking"?<p className={styles.muted}>{translate("marketing.copy.checking_your_account")}</p>:
      authState!=="ready"?<div className={styles.signIn}><LockKeyhole size={19}/><p>{authState==="unconfigured"?translate("marketing.action.sign_in_isn_t_configured_in_this_environment"):translate("marketing.action.we_ll_save_your_answers_on_this_device_before_signing")}</p><button type="button" disabled={busy||!draftReady} onClick={()=>void continueToLogin()}>{translate("marketing.copy.save_and_sign_in_to_vmv")} <ArrowUpRight size={15}/></button><small>{translate("marketing.copy.this_draft_is_saved_in_this_browser_for_up_to_48_hou")}</small></div>:null}
    </div>:null}
    {draftNotice?<p role="status" className={styles.draftNotice}>{draftNotice}</p>:null}
    {photoNotice?<p role="status" className={styles.photoNotice}>{photoNotice}</p>:null}
    {wizardError?<p role="alert" className={styles.wizardError}>{wizardError}</p>:null}
    {wizardStep>0?<div className={styles.wizardFooter}>
     {!registerHeaderBack?<button type="button" className={styles.wizardBack} onClick={goBack} disabled={busy}><ArrowLeft size={16}/> {translate("marketing.copy.previous")}</button>:null}
     {wizardStep===3?<button type="button" className={styles.wizardPrimary} disabled={busy||loading||authState!=="ready"} onClick={()=>void submit()}><Send size={16}/>{busy?translate("marketing.action.submitting"):translate("marketing.action.submit_request")}</button>:
      <button type="button" className={styles.wizardPrimary} onClick={goNext}>{selected==="google_profile"&&wizardStep===2&&googleStep<googleStepNames.length-1?translate("marketing.action.next"):translate("marketing.action.continue")} <ArrowRight size={16}/></button>}
    </div>:null}
   </>}
  </section>:null}
  {requestsOnly?<section className={styles.panel} id="vmv-marketing-history">
   <div className={styles.panelTop}><div><span>{translate("marketing.ui.tracking").replace(/^02\s*·\s*/,"")}</span><h3>{translate("marketing.ui.requests")}</h3></div><button type="button" onClick={()=>void refresh()} disabled={loading||!user} className={styles.refresh}><RefreshCw size={16}/> {translate("marketing.ui.refresh")}</button></div>
   {staff?<div className={styles.viewToggle}><button type="button" aria-pressed={!teamView} onClick={()=>setTeamView(false)}>{translate("marketing.ui.requests")}</button><button type="button" aria-pressed={teamView} onClick={()=>setTeamView(true)}>{translate("marketing.ui.teamInbox")}</button></div>:null}
   {!user?<p className={styles.muted}>{translate("marketing.ui.loginEmpty")}</p>:loading?<p className={styles.muted}>{translate("marketing.ui.loading")}</p>:
    shown.length===0?<div className={styles.empty}><ClipboardList size={25}/><strong>{translate("marketing.ui.empty")}</strong><span>{translate("marketing.ui.emptyHint")}</span><a href="/vista-app/marketing" className={styles.reportLink}>{translate("marketing.report.back")}</a></div>:
    <div className={styles.requestList}>{shown.map(req=>{
     const approved=isAccepted(req);
     const service=serviceName(req.service_code);
     const progress=marketingRequestProgress(req.status,approved,req.activity_history);
     const expanded=expandedRequests[req.id]??Boolean(staff&&teamView);
     const supportUrl="/vista-app/soporte?source=marketing&id="+encodeURIComponent(req.id);
     const historyEntries:Array<{key:string;date:string;kind:string;note?:string;quoteCents?:number|null}>=[
      ...(Array.isArray(req.activity_history)?req.activity_history:[]).map((ev,i)=>({key:"event-"+i,date:ev.date,kind:ev.kind,note:ev.note,quoteCents:ev.quoteCents})),
      ...approvals.filter(a=>a.request_id===req.id).map(a=>({key:"acceptance-"+a.id,date:a.accepted_at,kind:"acceptance",quoteCents:a.quoted_price_cents}))
     ].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
     return <article className={styles.request} key={req.id}>
      <div className={styles.requestTop}>
       <div className={styles.requestIdentity}><strong>{service}</strong><small>{req.business_name} <span aria-hidden="true">·</span> {date(req.created_at)} <span aria-hidden="true">·</span> #{req.id.slice(0,8)}</small></div>
       <div className={styles.requestTopActions}>
        <span className={req.status==="verified"?styles.verified:styles.status} data-stage={req.status}>{statusNames[req.status]}</span>
        {req.owner_id===user?.id?<details className={styles.requestMenu}
         onKeyDown={e=>{if(e.key==="Escape")e.currentTarget.open=false;}}
         onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}}>
         <summary className={styles.requestMenuButton} aria-label={en?"Case options":"Opciones del caso"} title={en?"Case options":"Opciones del caso"}><Ellipsis size={20}/></summary>
         <div className={styles.requestMenuPanel} onClick={e=>{if((e.target as HTMLElement).closest("button,a"))e.currentTarget.closest("details")?.removeAttribute("open");}}>
          <a href={supportUrl}><MessageSquareHeart size={16}/>{en?"Contact support":"Hablar con soporte"}</a>
          <button type="button" onClick={()=>setExpandedRequests(v=>({...v,[req.id]:true}))}><Clock3 size={16}/>{en?"View case details":"Ver detalles e historial"}</button>
          <button type="button" onClick={()=>selectCaseAction(req.id,"note")}><NotebookPen size={16}/>{en?"Add a note":"Añadir nota"}</button>
          {req.status!=="verified"&&req.status!=="cancelled"?<button type="button" onClick={()=>selectCaseAction(req.id,"edit")}><FilePenLine size={16}/>{en?"Request changes":"Solicitar modificación"}</button>:null}
          {req.status!=="verified"&&req.status!=="cancelled"?<button type="button" onClick={()=>selectCaseAction(req.id,"cancel")}><X size={16}/>{en?"Request cancellation":"Solicitar cancelación"}</button>:null}
          <button type="button" className={styles.requestMenuDanger} onClick={()=>selectCaseAction(req.id,"delete")}><Trash2 size={16}/>{en?"Request removal":"Solicitar eliminación"}</button>
          <button type="button" onClick={()=>void navigator.clipboard.writeText(req.id).then(()=>setMessage(en?"Case reference copied.":"Referencia copiada.")).catch(()=>setError(en?"Couldn't copy the reference.":"No pudimos copiar la referencia."))}><Copy size={16}/>{en?"Copy case reference":"Copiar referencia"}</button>
         </div>
        </details>:null}
       </div>
      </div>
      <div className={styles.caseProgress}>
       <div className={styles.caseProgressLabels}><span>{en?"Case progress":"Progreso del caso"}</span><strong>{approved&&req.status==="quoted"?(en?"Quote approved":"Cotización aprobada"):statusNames[req.status]}</strong></div>
       <div className={styles.caseProgressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        aria-label={en?"Case milestones completed; not an estimate of work time":"Etapas registradas del caso; no es una estimación de tiempo"}>
        <span className={req.status==="cancelled"?styles.caseProgressCancelled:styles.caseProgressFill} style={{width:progress+"%"}}/>
       </div>
      </div>
      <p>{req.goal_text}</p>
      {caseAction?.id===req.id&&req.owner_id===user?.id?<form className={styles.caseComposer} onSubmit={e=>{e.preventDefault();void sendCaseAction(req);}}>
       <div className={styles.caseComposerHeader}><strong>{caseAction.kind==="note"?(en?"Note to VMV":"Nota para VMV"):caseAction.kind==="edit"?(en?"Request a modification":"Solicitar modificación"):caseAction.kind==="cancel"?(en?"Request cancellation":"Solicitar cancelación"):(en?"Request record removal":"Solicitar eliminación")}</strong>
        <button type="button" onClick={()=>setCaseAction(null)} aria-label={en?"Close":"Cerrar"}><X size={16}/></button></div>
       <p>{caseAction.kind==="delete"?(en?"VMV will review the request before removing any record. Nothing is deleted now.":"VMV revisará la solicitud antes de eliminar cualquier expediente. Nada se borra ahora."):en?"Your message goes to VMV support. The original case is unchanged until reviewed.":"Tu mensaje llega a soporte de VMV. El caso original no cambia hasta que se revise."}</p>
       <textarea aria-label={en?"Message to VMV":"Mensaje para VMV"} rows={3} maxLength={1200} value={caseActionText} disabled={caseActionBusy} onChange={e=>setCaseActionText(e.target.value)}
        placeholder={caseAction.kind==="note"?(en?"Add details for the team…":"Escribe una nota para el equipo…"):caseAction.kind==="edit"?(en?"Describe the information to change…":"Explica qué información quieres modificar…"):en?"Optional reason…":"Motivo (opcional)…"}/>
       {caseActionError?<p className={styles.caseComposerError} role="alert">{caseActionError}</p>:null}
       <div className={styles.caseComposerActions}><button type="button" disabled={caseActionBusy} onClick={()=>setCaseAction(null)}>{en?"Cancel":"Volver"}</button>
        <button type="submit" disabled={caseActionBusy}>{caseActionBusy?(en?"Sending…":"Enviando…"):(en?"Send to VMV":"Enviar a VMV")}</button></div>
      </form>:null}
      <div className={styles.requestFooter}>
       <button type="button" className={styles.requestExpand} aria-expanded={expanded}
        onClick={()=>setExpandedRequests(v=>({...v,[req.id]:!expanded}))}><ChevronDown size={17} className={expanded?styles.chevronUp:undefined}/>{expanded?(en?"Hide details":"Ocultar detalles"):(en?"Details and history":"Detalles e historial")}</button>
       {req.owner_id===user?.id?<a className={styles.requestSupport} href={supportUrl}><MessageSquareHeart size={15}/>{en?"Support":"Soporte"}</a>:null}
       {req.status==="quoted"&&!approved&&req.owner_id===user?.id?<button className={styles.requestReviewQuote} type="button" onClick={()=>setExpandedRequests(v=>({...v,[req.id]:true}))}>{en?"Review quote":"Revisar cotización"}</button>:null}
      </div>
      {expanded?<div className={styles.requestExpanded}>
      {req.service_code==="review_strategy"&&req.reputation_data?<details className={styles.googleSaved}><summary>{translate("marketing.copy.view_reputation_details")}</summary><div className={styles.googleSavedContent}>{req.reputation_data.reviewText?<p>{translate("marketing.copy.real_review")} {req.reputation_data.reviewText}</p>:null}{req.reputation_data.replyText?<p>{translate("marketing.action.preparedResponse")} {req.reputation_data.replyText}</p>:null}{req.reputation_data.reviewLink?<a href={req.reputation_data.reviewLink} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.review_link_2")}</a>:null}<small>{translate("marketing.copy.no_automatic_publishing_or_sending")}</small></div></details>:null}
      {req.service_code==="directory_listings"&&req.directory_data?<div className={styles.dirHistory}><strong>{translate("marketing.copy.selected_directories")} {req.directory_data.city}, {req.directory_data.state}</strong>{req.directory_data.selected.map(t=><div className={styles.dirHistoryRow} key={t.id}><div><strong>{t.id==="research-local"?translate("marketing.directory.researchFor",{place:[req.directory_data?.city,req.directory_data?.state].filter(Boolean).join(", ")}):t.name}</strong><small>{localizedDirectoryStatus(language,t.status)}</small>{t.existingUrl&&safeDirectoryUrl(t.existingUrl)?<a href={t.existingUrl} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.existing_link_supplied_by_the_customer_not_verified")}</a>:null}{t.evidenceUrl&&safeDirectoryUrl(t.evidenceUrl)?<a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.view_publication_evidence")}</a>:null}{t.note?<small>{t.note}</small>:null}</div>{staff&&teamView&&activeStaffId===req.id?<div className={styles.dirStaffFields}><select aria-label={translate("marketing.action.status_of")+t.name} value={directoryStatus[t.id]||t.status} onChange={e=>setDirectoryStatus(v=>({...v,[t.id]:e.target.value as DirectoryProgress}))}>{Object.entries(directoryStatusNames).map(([v])=><option key={v} value={v}>{localizedDirectoryStatus(language,v as DirectoryProgress)}</option>)}</select><input aria-label={translate("marketing.action.verified_link_for")+t.name} value={directoryProof[t.id]??t.evidenceUrl} onChange={e=>setDirectoryProof(v=>({...v,[t.id]:e.target.value}))} placeholder={translate("marketing.action.public_url_only_if_published")}/></div>:null}</div>)}</div>:null}
      {req.service_code==="seo_improvement"&&req.web_repair_data?<><a className={styles.reportLink} href={"/vista-app/marketing/informe/"+req.id}>{translate("marketing.copy.open_saved_full_report")}</a><details className={styles.googleSaved}><summary>{translate("marketing.copy.view_diagnosis_and_platform")}</summary><div className={styles.googleSavedContent}><p>{translate("marketing.copy.platform")} {req.web_repair_data.platform==="other"?req.web_repair_data.otherPlatform:req.web_repair_data.platform}</p><p>{translate("marketing.copy.repository")} {req.web_repair_data.repositoryHost}</p>{req.web_repair_data.repositoryUrl?<p>{req.web_repair_data.repositoryUrl}</p>:null}{req.web_repair_data.audit?<><p>{translate("marketing.action.auditSpeed")} {req.web_repair_data.audit.scores.performance??"—"}/100 {translate("marketing.action.seoSeparator")}{req.web_repair_data.audit.scores.seo??"—"}/100</p>{req.web_repair_data.audit.explanation?<p>{req.web_repair_data.audit.explanation}</p>:null}<a href={req.web_repair_data.audit.reportUrl||"https://pagespeed.web.dev/"} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.view_technical_evidence_on_google")}</a></>:<p>{translate("marketing.copy.no_automatic_report_request_awaiting_review")}</p>}</div></details></>:null}
      {req.business_snapshot&&req.business_snapshot.mediaPaths.length>0?<details className={styles.googleSaved}><summary>{en?"Saved business photos (private)":"Fotos del negocio guardadas (privadas)"}</summary><div className={styles.googleSavedContent}>{req.business_snapshot.mediaPaths.map((path,i)=><button type="button" key={path} onClick={()=>void openBusinessPhoto(path)}>{en?"View image ":"Ver imagen "}{i+1}</button>)}</div></details>:null}
      {req.service_code==="google_profile"&&req.google_profile_data?<details className={styles.googleSaved}>
       <summary>{translate("marketing.copy.view_profile_details_and_photos")}</summary><div className={styles.googleSavedContent}>
        <p><strong>{translate("marketing.copy.google_category")}</strong> {req.google_profile_data.googleCategory||translate("marketing.action.pending")}</p>
        <p><strong>{translate("marketing.copy.location")}</strong> {req.google_profile_data.kind==="service_area"?translate("marketing.action.service_area"):req.google_profile_data.kind==="hybrid"?translate("marketing.action.storefront_and_delivery"):translate("marketing.action.storefront")}</p>
        {req.google_profile_data.kind==="service_area"?<p>{req.google_profile_data.serviceAreas}</p>:<p>{[req.google_profile_data.street,req.google_profile_data.unit,req.google_profile_data.city,req.google_profile_data.region,req.google_profile_data.postal].filter(Boolean).join(", ")}</p>}
        {req.google_profile_data.phone?<p><strong>{translate("marketing.copy.phone")}</strong> {req.google_profile_data.phone}</p>:null}
        <p><strong>{translate("marketing.google.countryLabel")}</strong> {req.google_profile_data.country}</p>
        {req.google_profile_data.secondaryPhone?<p><strong>{translate("marketing.google.additional_phone")}</strong> {req.google_profile_data.secondaryPhone}</p>:null}
        {req.google_profile_data.otherCategories?<p><strong>{translate("marketing.google.other_categories")}</strong> {req.google_profile_data.otherCategories}</p>:null}
        {req.google_profile_data.openingDate?<p><strong>{translate("marketing.google.opening_date")}</strong> {req.google_profile_data.openingDate}</p>:null}
        {req.google_profile_data.hoursEnabled&&Array.isArray(req.google_profile_data.hours)?<div><strong>{translate("marketing.google.regular_hours")}</strong><ul>{req.google_profile_data.hours.map((hour,i)=><li key={i}>
         {translate((["marketing.google.mon_2","marketing.google.tue","marketing.google.wed","marketing.google.thu","marketing.google.fri","marketing.google.sat","marketing.google.sun"] as const)[i])}: {hour.closed?translate("marketing.google.closed"):<>{hour.start} – {hour.end}{hour.end<hour.start?" · "+translate("marketing.google.nextDay"):""}</>}
        </li>)}</ul></div>:<p>{translate("marketing.google.hoursPending")}</p>}
        {googleProfileLink(req.google_profile_data.bookingUrl)?<a href={googleProfileLink(req.google_profile_data.bookingUrl)!} target="_blank" rel="noopener noreferrer">{translate("marketing.google.booking_or_ordering_link")}</a>:null}
        {googleProfileLink(req.google_profile_data.existingProfileUrl)?<a href={googleProfileLink(req.google_profile_data.existingProfileUrl)!} target="_blank" rel="noopener noreferrer">{translate("marketing.google.existing_listing_url")}</a>:null}
        {req.google_profile_data.description?<p><strong>{translate("marketing.copy.description")}</strong> {req.google_profile_data.description}</p>:null}
        {req.google_profile_data.services?<p><strong>{translate("marketing.copy.services")}</strong> {req.google_profile_data.services}</p>:null}
        {req.google_profile_data.products?<p><strong>{translate("marketing.copy.products")}</strong> {req.google_profile_data.products}</p>:null}
        {req.google_profile_data.media?.map(photo=><button type="button" key={photo.path} onClick={()=>void openPrivatePhoto(photo.path)}>{translate("marketing.copy.view_image")} {photo.kind}</button>)}
       </div></details>:null}
      <details className={styles.activityTimeline}>
       <summary>{translate("marketing.request.history")} · {1+historyEntries.length}</summary>
       <ol>
        <li><span>{date(req.created_at)}</span><strong>{translate("marketing.request.received")}</strong></li>
        {historyEntries.map(ev=><li key={ev.key}>
         <span>{date(ev.date)}</span>
         <strong>{ev.kind==="acceptance"?translate("marketing.request.accepted"):ev.kind==="quote"?translate("marketing.request.quotePrepared"):ev.kind==="directories"?translate("marketing.request.directoryUpdated"):ev.kind==="status"?translate("marketing.request.statusUpdated"):translate("marketing.request.teamUpdate")}</strong>
         {typeof ev.quoteCents==="number"?<small>{money(ev.quoteCents)}</small>:null}
         {ev.note?<small>{ev.note}</small>:null}
        </li>)}
       </ol>
      </details>
      {req.staff_update?<div className={styles.staffNote}><strong>{translate("marketing.copy.vmv_update")}</strong> {req.staff_update}</div>:null}
      {req.quoted_price_cents!==null?<div className={styles.quote}>
       <div><Wallet size={18}/><span><strong>{money(req.quoted_price_cents)}</strong> {req.quoted_price_cents===0?translate("marketing.action.free_service"):translate("marketing.action.proposed_quote")}<small>{req.quote_note||translate("marketing.action.details_pending")}</small></span></div>
       {approved?<span className={styles.accepted}><CheckCircle2 size={15}/> {translate("marketing.copy.approved_by_customer")}</span>:
        req.owner_id===user.id&&req.status==="quoted"?
         <button type="button" disabled={busy} onClick={()=>void accept(req)}>{translate("marketing.copy.approve")} {money(req.quoted_price_cents)}</button>:null}
       {campaignTestCheckoutVisible&&req.service_code==="campaign_setup"&&req.owner_id===user.id&&approved&&req.quoted_price_cents!==null&&req.quoted_price_cents>0?
        isCampaignTestPaid(req)?<span className={styles.accepted}><CheckCircle2 size={15}/>{en?"VMV service fee paid (TEST)":"Servicio VMV pagado (PRUEBA)"}</span>:
        req.status==="quoted"?<button type="button" disabled={campaignCheckoutBusy===req.id||busy} onClick={()=>void startCampaignTestCheckout(req)}>
         {campaignCheckoutBusy===req.id?(en?"Opening test checkout…":"Abriendo cobro de prueba…"):(en?"Pay VMV service fee (TEST)":"Pagar servicio VMV (PRUEBA)")} {money(req.quoted_price_cents)}
        </button>:null
       :null}
       {campaignTestCheckoutVisible&&req.service_code==="campaign_setup"&&req.owner_id===user.id&&approved?
        <small>{en?"TEST charge covers VMV service only. Your ad budget is paid separately to Meta/Google. No ads are published.":"El cobro de PRUEBA es solo por el servicio VMV. El presupuesto publicitario se paga aparte a Meta/Google. No se publican anuncios."}</small>:null}
      </div>:<p className={styles.notQuoted}>{translate("marketing.copy.the_team_has_not_issued_a_quote_yet_no_paid_work_has")}</p>}
      {req.status==="verified"&&req.evidence_url?<><a className={styles.evidence} href={req.evidence_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> {translate("marketing.copy.view_evidence_provided_by_the_team")}</a><p className={styles.notQuoted}>{translate("marketing.copy.this_evidence_was_recorded_by_vmv_and_does_not_indep")}</p></>:null}
      {staff&&teamView?<div className={styles.staffControls}>
       <button type="button" onClick={()=>activeStaffId===req.id?setActiveStaffId(null):openStaff(req)}>{activeStaffId===req.id?translate("marketing.action.close_controls"):translate("marketing.action.manage_as_team")}</button>
       {activeStaffId===req.id?<div className={styles.staffForm}>
        <span>{translate("marketing.copy.quote_usd_0_free")}</span><input inputMode="decimal" value={quoteDollars} onChange={e=>setQuoteDollars(e.target.value)} placeholder="0.00"/>
        <span>{translate("marketing.copy.what_s_included")}</span><textarea value={quoteNote} onChange={e=>setQuoteNote(e.target.value)} rows={2}/>
        <button type="button" disabled={busy} onClick={()=>void saveQuote(req)}>{translate("marketing.copy.send_update_quote")}</button>
        <span>{translate("marketing.copy.status")}</span><select value={stage} onChange={e=>setStage(e.target.value as Status)}>
         {(["received","quoted","approved","in_progress","needs_customer","verified","cancelled"] as Status[]).map(id=><option key={id} value={id}>{statusNames[id]}</option>)}
        </select>
        <span>{translate("marketing.copy.update_for_customer")}</span><textarea value={stageUpdate} onChange={e=>setStageUpdate(e.target.value)} rows={2}/>
        {stage==="verified"?<><span>{translate("marketing.copy.public_url_showing_the_result")}</span><input type="url" value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="https://..."/></>:null}
        <button type="button" disabled={busy||(["approved","in_progress","verified"].includes(stage)&&!approved)} onClick={()=>void updateStage(req)}>{translate("marketing.copy.save_status_and_evidence")}</button>
        {req.directory_data?<button type="button" disabled={busy} onClick={()=>void updateDirectoryProgress(req)}>{translate("marketing.copy.save_directory_statuses")}</button>:null}
       </div>:null}
      </div>:null}
      </div>:null}
     </article>;
    })}</div>
   }
  </section>:null}
  {!requestsOnly&&(wizardStep===0||wizardStep===4)?<div className={styles.bottomNote}><HandHeart size={17}/><p>{translate("marketing.ui.external")}</p></div>:null}
  {submissionQuiz?<ScienceWaitQuiz key={submissionQuiz.seed} en={en} seed={submissionQuiz.seed} processing={submissionQuiz.processing} onContinue={()=>setSubmissionQuiz(null)}/>:null}
  {message?<p role="status" className={styles.notice}>{message}</p>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
 </div>;
}
