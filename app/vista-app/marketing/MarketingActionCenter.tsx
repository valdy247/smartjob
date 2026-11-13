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
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import {marketingCategoryLabel,marketingGroupLabel} from "@/lib/marketing-taxonomy-i18n";
import styles from "./MarketingActionCenter.module.css";
import WebRepairStudio,{emptyWebRepair,validateWebRepair,type WebRepairData} from "./WebRepairStudio";
import ReputationStudio,{reviewReplyTemplate,type ReviewMode} from "./ReputationStudio";
import DirectoryDiscovery,{emptyDirectory,validateDirectory,directoryStatusNames,localizedDirectoryStatus,safeDirectoryUrl,type DirectoryData,type DirectoryProgress} from "./DirectoryDiscovery";
import {readMarketingDraft,writeMarketingDraft,readDraftMedia,saveDraftMedia,clearMarketingDraft,markGuestLoginPending,transferGuestDraft,type StoredMarketingDraft} from "./MarketingDraftStore";
import GoogleProfileWizard,{emptyGoogle,emptyMedia,googleStepNames,validateGoogleStep,validateGoogleLinks,validateGoogleAll,type GoogleData,type GoogleMedia} from "./GoogleProfileWizard";

export type ServiceCode="directory_listings"|"google_profile"|"apple_maps"|"bing_places"|"yelp_profile"|"search_console"|"seo_improvement"|"campaign_setup"|"review_strategy"|"other";
type Status="received"|"quoted"|"approved"|"in_progress"|"needs_customer"|"verified"|"cancelled";
type RequestRow={
 id:string;owner_id:string;service_code:ServiceCode;business_name:string;category_id:string;
 website_url:string|null;goal_text:string;status:Status;execution_mode:"assisted"|"automated";
 quoted_price_cents:number|null;quote_note:string|null;quote_revision:number;
 staff_update:string|null;evidence_url:string|null;verified_at:string|null;
 created_at:string;updated_at:string;reputation_data?:{mode:string;reviewText:string;replyText:string;reviewLink:string}|null;google_profile_data?:GoogleData&{media?:{kind:string;path:string}[]}|null;web_repair_data?:WebRepairData|null;directory_data?:DirectoryData|null
};
type SavedBusiness={id:string;owner_id:string;name:string;category_id:string;website_url:string|null;source?:"profile"|"agent"};
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
const errorMessage=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;

export default function MarketingActionCenter({businessName,industryId,website,onGoToVisibility,preselectedService,onWizardActiveChange}:{
 businessName:string;industryId:string;website:string;onGoToVisibility:()=>void;preselectedService?:ServiceCode;onWizardActiveChange?:(active:boolean)=>void
}){
 const {language,translate}=useInterfaceLanguage();
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
 const [savedCategory,setSavedCategory]=useState("");
 const [savedBusinesses,setSavedBusinesses]=useState<SavedBusiness[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [businessBusy,setBusinessBusy]=useState(false);
 const [businessMessage,setBusinessMessage]=useState("");
 const [businessError,setBusinessError]=useState("");
 const [authState,setAuthState]=useState<"checking"|"ready"|"signed_out"|"unconfigured">("checking");
 const [staff,setStaff]=useState(false);
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [approvals,setApprovals]=useState<Acceptance[]>([]);
 const [selected,setSelected]=useState<ServiceCode>(preselectedService||"google_profile");
 const [wizardStep,setWizardStep]=useState<WizardStep>(preselectedService?1:0);
 const [googleStep,setGoogleStep]=useState(0);
 const [webStage,setWebStage]=useState(0);
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
 const [pausedStep,setPausedStep]=useState<WizardStep|null>(null);
 useEffect(()=>{setMessage("");setError("");setWizardError("");setBusinessMessage("");setBusinessError("");setDraftNotice("");setPhotoNotice("");},[language]);
 const submitting=useRef(false);
 const draftSnapshot=():StoredMarketingDraft=>({
  version:2,savedAt:Date.now(),requestId,ownerId:user?.id||null,
  service:selected,step:wizardStep,googleStep,webStage,businessId,
  name,site,category:chosenCategory||industryId||savedCategory||"other",goal,reviewInput,reviewTone,
  reviewLink,reviewReply,reviewMode,consent,googleData,webRepair,directoryData
 });
 const saveCurrentDraft=async()=>{
  const ok=writeMarketingDraft(draftSnapshot());
  if(!ok){setDraftNotice(translate("marketing.action.this_device_couldn_t_save_the_form_keep_this_page_ope"));return false;}
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
    setSelected("google_profile");setBusinessId("");setSavedBusinesses([]);setName(businessName||"");setSite(website||"");setChosenCategory("");
    setGoal("");setReviewInput("");setReviewLink("");setReviewReply("");setReviewMode("respond");
    setGoogleData(emptyGoogle);setGoogleMedia(emptyMedia);setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);
    setConsent(false);setDraftNotice("");
   }
   resolvedDraftOwner.current=uid;
   if(saved&&active&&services.some(item=>item.id===saved.service)){
    setRequestId(saved.requestId);setSelected(saved.service as ServiceCode);
    setBusinessId(saved.businessId||"");
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
    try{const media=await readDraftMedia(saved.requestId);if(active&&media)setGoogleMedia(media);}
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
 },[draftReady,authState,user?.id,wizardStep,googleStep,selected,name,site,chosenCategory,industryId,savedCategory,webStage,businessId,goal,reviewInput,reviewTone,reviewLink,reviewReply,reviewMode,consent,googleData,webRepair,directoryData,requestId]);
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
  if(code!==selected){setGoal("");setConsent(false);setReviewLink("");setReviewReply("");setReviewMode("respond");setReviewInput("");setWebRepair(emptyWebRepair);setDirectoryData(emptyDirectory);setGoogleStep(0);setGoogleMedia(emptyMedia);}
  setSelected(code);setWizardStep(1);setWizardError("");setSubmittedId(null);revealWizard();
 };
 const goNext=()=>{
  setWizardError("");
  if(wizardStep===1){
   if(selected==="seo_improvement"&&!site.trim()){setWizardError(translate("marketing.action.enter_the_website_address_to_analyze_it"));return;}
   if(name.trim().length<2||name.trim().length>150){setWizardError(translate("marketing.action.enter_your_business_name"));return;}
   if(site.trim()&&!safeSite(site)){setWizardError(translate("marketing.action.check_your_website_link_it_must_begin_with_https"));return;}
  }
  if(wizardStep===2&&selected==="google_profile"){
   const missing=validateGoogleStep(googleStep,googleData,language)||validateGoogleLinks(googleData,language);
   if(missing){setWizardError(missing);return;}
   if(googleStep<googleStepNames.length-1){closeKeyboard();setGoogleStep(googleStep+1);revealWizard();return;}
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
 const effectiveCategory=chosenCategory||industryId||savedCategory||"other";
 useEffect(()=>{if(effectiveCategory!=="other")setGoogleData(v=>v.googleCategory?v:{...v,googleCategory:marketingCategoryLabel(language,effectiveCategory,"")});},[effectiveCategory,language]);
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
     client.from("vmv_marketing_requests").select("*").order("created_at",{ascending:false}).limit(80),
     client.from("vmv_marketing_quote_acceptances").select("*").order("accepted_at",{ascending:false}).limit(120)
    ]);
    if(r.error)throw r.error;
    if(a.error)throw a.error;
    if(alive){setRequests((r.data||[]) as RequestRow[]);setApprovals((a.data||[]) as Acceptance[]);}
   }catch(e){if(alive)setError("No se pudo consultar el centro de solicitudes. "+errorMessage(e,translate("marketing.action.check_your_connection")));}
   finally{if(alive)setLoading(false);}
  };
  void load();
  return()=>{alive=false;};
 },[client,user]);
 const loadSavedBusinesses=async(owner:string)=>{
  if(!client)return;
  const [saved,profile,agent,category]=await Promise.all([
   client.from("vmv_marketing_businesses").select("id,owner_id,name,category_id,website_url").eq("owner_id",owner).order("created_at",{ascending:false}).limit(60),
   client.from("smartjob_profiles").select("business_name,website_url").eq("id",owner).maybeSingle(),
   client.from("vmv_ai_businesses").select("id,name").eq("owner_id",owner).limit(60),
   client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",owner).maybeSingle()
  ]);
  if(saved.error){setBusinessError(translate("marketing.action.couldn_t_load_saved_businesses_try_again"));return;}
  const records=(saved.data||[]) as SavedBusiness[];
  const known=new Set(records.map(x=>x.name.trim().toLowerCase()));
  const candidates:SavedBusiness[]=[];
  const primary=profile.data?.business_name?.trim();
  if(primary&&!known.has(primary.toLowerCase())){candidates.push({id:"profile:"+owner,owner_id:owner,name:primary,category_id:category.data?.category_id||industryId||"other",website_url:profile.data?.website_url||null,source:"profile"});known.add(primary.toLowerCase());}
  for(const row of agent.data||[]){
   const candidate=String(row.name||"").trim();
   if(!candidate||known.has(candidate.toLowerCase()))continue;
   candidates.push({id:"agent:"+row.id,owner_id:owner,name:candidate,category_id:"other",website_url:null,source:"agent"});
   known.add(candidate.toLowerCase());
  }
  setSavedBusinesses([...records,...candidates]);
  setBusinessError("");
 };
 const pickBusiness=(id:string)=>{
  if(!id)return;
  const selectedBusiness=savedBusinesses.find(item=>item.id===id);
  if(!selectedBusiness)return;
  setBusinessId(id);setName(selectedBusiness.name);setSite(selectedBusiness.website_url||"");
  setChosenCategory(selectedBusiness.category_id||"other");
  setBusinessMessage(translate("marketing.action.business_loaded_you_can_edit_the_details_before_conti"));
  setBusinessError("");setWizardError("");
 };
 const saveBusiness=async()=>{
  if(!client||!user){setBusinessError(translate("marketing.action.sign_in_to_save_this_business_to_your_account"));return;}
  const cleanName=name.trim();const cleanSite=site.trim();
  if(cleanName.length<2||cleanName.length>150){setBusinessError(translate("marketing.action.enter_a_business_name_between_2_and_150_characters"));return;}
  if(cleanSite&&!safeSite(cleanSite)){setBusinessError(translate("marketing.action.the_website_must_have_a_valid_https_url"));return;}
  setBusinessBusy(true);setBusinessError("");setBusinessMessage("");
  try{
   const existing=savedBusinesses.find(x=>x.id===businessId&&!x.source);
   const payload={name:cleanName,category_id:effectiveCategory,website_url:safeSite(cleanSite)};
   const result=existing?
    await client.from("vmv_marketing_businesses").update(payload).eq("id",existing.id).eq("owner_id",user.id).select("id").single():
    await client.from("vmv_marketing_businesses").insert({owner_id:user.id,...payload}).select("id").single();
   if(result.error)throw result.error;
   setBusinessId(String(result.data.id));
   await loadSavedBusinesses(user.id);
   setBusinessMessage(translate("marketing.action.business_saved_you_can_select_it_next_time"));
  }catch(e){
   setBusinessError(errorMessage(e,translate("marketing.action.couldn_t_save_the_business_check_whether_one_with_tha")));
  }finally{setBusinessBusy(false);}
 };
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
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_load_requests")));}
  finally{setLoading(false);}
 };
 const ownRequests=useMemo(()=>requests.filter(r=>r.owner_id===user?.id),[requests,user]);
 const shown=teamView&&staff?requests:ownRequests;
 const isAccepted=(req:RequestRow)=>approvals.some(a=>a.request_id===req.id&&a.quote_revision===req.quote_revision&&a.quoted_price_cents===req.quoted_price_cents);
 const openPrivatePhoto=async(path:string)=>{
  if(!client)return;
  const {data,error:mediaError}=await client.storage.from("vmv-google-media").createSignedUrl(path,120);
  if(mediaError||!data?.signedUrl){setError(translate("marketing.action.couldn_t_open_the_private_image_try_again"));return;}
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
   if(bad){setWizardStep(2);setGoogleStep(5);setWizardError("Revisa "+bad.file.name+": fotos JPG o PNG entre 10 KB y 5 MB.");submitting.current=false;return;}
  }
  if(selected!=="google_profile"&&selected!=="seo_improvement"&&selected!=="directory_listings"&&((goal.trim().length<12&&!(selected==="review_strategy"&&reviewInput.trim().length>=5))||goal.trim().length>1500)){setWizardStep(2);setWizardError(translate("marketing.action.choose_a_need_or_describe_the_result_you_want"));submitting.current=false;return;}
  if(selected==="review_strategy"&&reviewMode==="request"&&!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(reviewLink.trim())){setWizardStep(2);setWizardError(translate("marketing.action.enter_a_valid_https_link_to_request_reviews"));submitting.current=false;return;}
  if(selected==="directory_listings"&&validateDirectory(directoryData,effectiveCategory,language)){setWizardStep(2);setWizardError(validateDirectory(directoryData,effectiveCategory,language));submitting.current=false;return;}
  if(selected==="seo_improvement"&&validateWebRepair(webRepair,language)){setWizardStep(2);setWizardError(validateWebRepair(webRepair,language));submitting.current=false;return;}
  if(selected==="seo_improvement"&&!site.trim()){setWizardStep(1);setWizardError(translate("marketing.action.enter_the_website_you_want_to_improve"));submitting.current=false;return;}
  if(site.trim()&&!safeSite(site)){setWizardStep(1);setWizardError(translate("marketing.action.the_website_url_must_be_valid"));submitting.current=false;return;}
  if(!consent){setWizardError(translate("marketing.action.check_the_authorization_box_so_we_can_process_your_re"));submitting.current=false;return;}
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
   insertAttempted=true;
   const {data,error:insertError}=await client.from("vmv_marketing_requests").insert({
    id:requestId,owner_id:user.id,service_code:selected,business_name:name.trim(),
    category_id:effectiveCategory,website_url:safeSite(site),
    goal_text:selected==="directory_listings"?("Solicito evaluación para registrar o actualizar "+directoryData.selected.length+" directorios en "+directoryData.city+", "+directoryData.state+". Se requiere revisar elegibilidad, duplicados y presupuesto antes de iniciar."):selected==="google_profile"?googleGoalText:selected==="seo_improvement"?(webRepair.requestRepair?"Solicito presupuesto para reparación técnica de mi página web.":"Solicito guardar mi diagnóstico web sin contratar reparación."):selected==="review_strategy"&&reviewInput.trim()?
     ("Reseña: "+reviewInput.trim().slice(0,650)+" | Respuesta para revisión: "+(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)).slice(0,700)).slice(0,1500):goal.trim(),
    agreed_to_contact:true,
    ...(selected==="google_profile"?{google_profile_data:{...googleData,...(googleData.kind==="service_area"?{street:"",unit:"",city:"",region:"",postal:""}:{}),media:mediaPaths}}:{}),
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
   const savedId=String(data.id).slice(0,8);
   setSubmittedId(savedId);setWizardStep(4);
   await clearMarketingDraft(user.id,requestId);setDraftNotice("");setPhotoNotice("");
   setMessage(translate("marketing.action.request")+requestId+" guardada con sus datos"+(uploaded.length?" y "+uploaded.length+" imágenes":"")+". No se ha publicado en Google.");
   setGoal("");setConsent(false);setGoogleMedia(emptyMedia);
   await refresh();
  }catch(e){
   if(!inserted&&!insertAttempted&&uploaded.length)await client.storage.from("vmv-google-media").remove(uploaded);
   setWizardError("No se pudo completar el envío. "+errorMessage(e,translate("marketing.action.try_again")));
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
     staff_update:"Presupuesto preparado. Esperamos tu aprobación."})
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
    if(["published","already_listed"].includes(status)&&!safeDirectoryUrl(evidenceUrl))throw Error("Para confirmar "+t.name+" debes incluir una URL HTTPS de la ficha.");
    if(["submitted","published"].includes(status)&&!isAccepted(req))throw Error("Primero el cliente debe aprobar el presupuesto de gestión (puede ser $0) antes de enviar registros a "+t.name+".");
    return {...t,status,evidenceUrl:["published","already_listed"].includes(status)?evidenceUrl:"",note:t.note};
   });
   const {error:saveError}=await client.from("vmv_marketing_requests").update({directory_data:{...req.directory_data,selected}}).eq("id",req.id);
   if(saveError)throw saveError;
   setMessage(translate("marketing.action.statuses_saved_the_customer_can_see_each_directory_s_"));
   await refresh();
  }catch(e){setError(errorMessage(e,translate("marketing.action.couldn_t_save_directory_statuses")));}
  finally{setBusy(false);}
 };
 const openStaff=(req:RequestRow)=>{
  setDirectoryStatus({});setDirectoryProof({});
  setActiveStaffId(req.id);setStage(req.status);
  setQuoteDollars(req.quoted_price_cents===null?"":(req.quoted_price_cents/100).toFixed(2));
  setQuoteNote(req.quote_note||"");setStageUpdate(req.staff_update||"");setEvidence(req.evidence_url||"");
 };
 return <div className={styles.root}>
  {wizardStep===0?<header className={styles.catalogHeading}><h2>{en?"What would you like to do?":"¿Qué quieres hacer hoy?"}</h2><p>{en?"Choose a service. We’ll guide you.":"Elige un servicio y te ayudamos paso a paso."}</p><a href="#vmv-marketing-history" className={styles.historyLink}><ClipboardList size={16}/> {en?"My requests":"Mis solicitudes"}</a>{pausedStep!==null?<button type="button" className={styles.resumeDraft} onClick={()=>{setWizardStep(pausedStep);setPausedStep(null);revealWizard();}}>{en?"Continue saved request":"Continuar mi solicitud guardada"}</button>:null}</header>:null}
  {wizardStep>0&&wizardStep<4?<button type="button" className={styles.historyWizardAccess} onClick={()=>{setPausedStep(wizardStep);void saveCurrentDraft();setWizardStep(0);window.setTimeout(()=>document.getElementById("vmv-marketing-history")?.scrollIntoView({behavior:"smooth"}),0);}}><ClipboardList size={15}/> {en?"My requests":"Mis solicitudes"}</button>:null}
  <section className={wizardStep===0?styles.catalogPanel:styles.wizardPanel} id="vmv-marketing-request" aria-label={translate("marketing.ui.createAria")}>
   {wizardStep===4?<div className={styles.wizardSuccess} role="status">
    <div className={styles.successIcon}><CheckCircle2 size={33}/></div>
    <span className={styles.overline}>{translate("marketing.copy.request_received")}</span>
    <h3>{translate("marketing.copy.success_we_received_your_request")}</h3>
    <p>{translate("marketing.copy.reference")} <strong>#{submittedId}</strong>{translate("marketing.copy.we_ll_review_it_any_quote_or_additional_details_will")}</p>
    <div className={styles.successReminder}><ShieldCheck size={17}/> {translate("marketing.copy.nothing_has_been_charged_or_published_any_cost_will_")}</div>
    <div className={styles.wizardButtons}>
     <button type="button" className={styles.wizardBack} onClick={()=>{setRequestId(crypto.randomUUID());setWizardStep(0);setSubmittedId(null);setWizardError("");setPausedStep(null);revealWizard();}}>{translate("marketing.copy.create_another_request")}</button>
     <button type="button" className={styles.wizardPrimary} onClick={()=>document.getElementById("vmv-marketing-history")?.scrollIntoView({behavior:"smooth",block:"start"})}>{translate("marketing.copy.view_progress")} <ArrowRight size={16}/></button>
    </div>
   </div>:<>
    {wizardStep>0?<div className={styles.wizardHeading}>
     <div><span className={styles.overline}><LayoutGrid size={15}/> {translate("marketing.copy.marketing_assistant")}</span>
      <h3>{wizardStep===0?translate("marketing.action.how_can_we_help_today"):wizardStep===1?translate("marketing.action.first_your_business"):wizardStep===2?translate("marketing.action.what_do_you_want_to_achieve"):translate("marketing.action.confirm_your_request")}</h3>
      <p>{wizardStep===0?translate("marketing.action.choose_an_option_to_begin_we_ll_guide_you_step_by_ste"):wizardStep===1?translate("marketing.action.we_ll_use_the_information_we_already_have_to_save_you"):wizardStep===2?translate("marketing.action.choose_a_suggestion_or_briefly_describe_your_needs"):translate("marketing.action.review_everything_before_submitting_no_external_chang")}</p>
     </div>
     <span className={styles.stepCount}>{wizardStep+1} / 4</span>
    </div>:null}
    {wizardStep>0?<ol className={styles.stepper} aria-label={translate("marketing.action.request_progress")}>
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
        <span className={styles.serviceText}><strong>{serviceName(service.id)}</strong><small>{serviceWhy(service.id)}</small></span>
        <span className={styles.serviceCta}>{en?"Start":"Empezar"} <ArrowUpRight size={14}/></span>
       </button>;
      })}
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> {translate("marketing.ui.requestFree")}</p>
    </div>:null}
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
        <button type="button" onClick={()=>{setBusinessId("");setName("");setSite("");setChosenCategory("other");setBusinessMessage("");setBusinessError("");}}>{en?"New business":translate("marketing.action.new_business")}</button>
       </div>
       {!user?<p className={styles.businessNote}>{en?"Sign in to save and load businesses on any device. You can still complete this request.":"Inicia sesión para guardar y cargar negocios desde cualquier dispositivo. Puedes continuar tu solicitud sin hacerlo."}</p>:null}
       {businessMessage?<p role="status" className={styles.businessSuccess}>{businessMessage}</p>:null}
       {businessError?<p role="alert" className={styles.businessError}>{businessError}</p>:null}
      </div>
      <label className={styles.wizardField}><span>{translate("marketing.copy.business_name")} <em>{translate("marketing.copy.required")}</em></span><input type="text" autoComplete="organization" value={name} maxLength={150} onChange={e=>{setName(e.target.value);setWizardError("");}} placeholder={translate("marketing.action.e_g_my_business")} /></label>
      <label className={styles.wizardField}><span>{translate("marketing.copy.what_does_your_business_do")}</span><select value={effectiveCategory} onChange={e=>setChosenCategory(e.target.value)}>
       {CATEGORY_GROUPS.map(group=><optgroup key={group} label={marketingGroupLabel(language,group)}>{BUSINESS_CATEGORIES.filter(c=>c.group===group).map(c=><option value={c.id} key={c.id}>{marketingCategoryLabel(language,c.id)}</option>)}</optgroup>)}
      </select></label>
      <label className={styles.wizardField}><span>{translate("marketing.copy.website")} <em>{selected==="seo_improvement"?translate("marketing.action.required"):translate("marketing.action.optional")}</em></span><input type="url" inputMode="url" autoComplete="url" value={site} maxLength={500} onChange={e=>{setSite(e.target.value);setWizardError("");}} placeholder="https://tusitio.com"/></label>
      <button type="button" className={styles.saveBusinessInline} disabled={businessBusy||!user} onClick={()=>void saveBusiness()}>{businessBusy?(en?"Saving…":"Guardando…"):businessId?(en?"Update saved business":translate("marketing.action.update_saved_business")):(en?"Save this business for next time":translate("marketing.action.save_this_business_for_future_requests"))}</button>
     </div>
     <p className={styles.wizardHint}><ShieldCheck size={15}/> {translate("marketing.copy.if_you_registered_your_business_with_vmv_available_d")}</p>
    </div>:null}
    {wizardStep===2?<div className={styles.wizardBody}>
     {selected==="google_profile"?<GoogleProfileWizard step={googleStep} data={googleData} onData={setGoogleData} media={googleMedia} onMedia={setGoogleMedia} business={name} website={site}/>:<>
     <div className={styles.selectedServiceBanner}><span className={styles.selectedServiceIcon}>{(()=>{const Icon=serviceIcons[selected];return <Icon size={23}/>;})()}</span><span><small>{translate("marketing.copy.preparing_your_request")}</small><strong>{serviceName(selected)}</strong></span></div>
     {selected==="directory_listings"?<DirectoryDiscovery data={directoryData} onChange={setDirectoryData} industry={effectiveCategory}/>:null}
     {selected==="seo_improvement"?<WebRepairStudio step={webStage} site={site} data={webRepair} onChange={setWebRepair} accessToken={accessToken}/>:null}
     {selected==="review_strategy"?<ReputationStudio business={name} mode={reviewMode} onModeChange={v=>{setReviewMode(v);setGoal(v==="request"?"Quiero solicitar reseñas auténticas a mis clientes.":"Necesito preparar respuestas para reseñas reales.");}} reviewInput={reviewInput} onReviewChange={v=>{setReviewInput(v);setReviewReply("");setGoal(v.trim()?"Necesito preparar una respuesta revisable para una reseña real.":"");}} reply={reviewReply} onReplyChange={setReviewReply} link={reviewLink} onLinkChange={v=>{setReviewLink(v);setGoal("Quiero compartir un enlace auténtico para recibir reseñas de mis clientes.");}} onDirectory={()=>{setSelected("directory_listings");setWizardError("");setGoal("");}} reviewTone={reviewTone} onToneChange={setReviewTone}/>:null}
     {selected==="directory_listings"?<button type="button" className={styles.preset} onClick={()=>{setSelected("review_strategy");setWizardError("");}}>{translate("marketing.copy.back_to_reviews")}</button>:null}
     {selected!=="review_strategy"&&selected!=="seo_improvement"&&selected!=="directory_listings"?<span className={styles.presetLabel}>{translate("marketing.copy.choose_what_you_need")}</span>:null}
     <div className={styles.goalPresets}>{(selected==="review_strategy"||selected==="seo_improvement"||selected==="directory_listings"?[]:suggestedGoals[selected]).map(option=><button key={option} type="button" className={goal===option?styles.presetActive:styles.preset} aria-pressed={goal===option} onClick={()=>{setGoal(option);setWizardError("");}}>
      <CheckCircle2 size={16}/>{option}
     </button>)}</div>
     {selected!=="seo_improvement"&&selected!=="directory_listings"?<label className={styles.goalLabel}>{selected==="review_strategy"?translate("marketing.action.do_you_need_more_help"):translate("marketing.action.would_you_like_to_add_details")}
      <textarea value={goal} maxLength={1500} onChange={e=>{setGoal(e.target.value);setWizardError("");}} rows={5} placeholder={translate("marketing.action.e_g_my_business_is_listed_but_the_hours_are_wrong_i_d")}/>
      <small>{goal.length}/1500 caracteres · No compartas contraseñas ni información bancaria.</small>
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
      {selected==="google_profile"?<div className={styles.googleReview}><strong>{translate("marketing.copy.google_profile_details")}</strong><span>{translate("marketing.copy.action")} {googleData.action==="create"?translate("marketing.action.create"):googleData.action==="claim"?translate("marketing.action.claim"):translate("marketing.action.improve")} · {googleData.kind==="storefront"?translate("marketing.action.storefront"):googleData.kind==="service_area"?"Área de servicio":translate("marketing.action.storefront_and_delivery")}</span><span>{translate("marketing.copy.category")} {googleData.googleCategory}</span><span>{googleData.kind==="service_area"?"Áreas: "+googleData.serviceAreas:[googleData.street,googleData.unit,googleData.city,googleData.region,googleData.postal,googleData.country].filter(Boolean).join(", ")}</span>{googleData.phone?<span>{translate("marketing.copy.phone")} {googleData.phone}</span>:null}{googleData.hoursEnabled?<span>{translate("marketing.copy.hours")} {googleData.hours.filter(h=>!h.closed).length} días abiertos</span>:null}{googleData.description?<span>{translate("marketing.copy.description")} {googleData.description}</span>:null}<span>{translate("marketing.copy.photos")} {googleFiles.length} (privadas)</span><button type="button" onClick={()=>{setGoogleStep(0);editWizardStep(2);}}>{translate("marketing.copy.review_google_details")}</button></div>:null}
      {selected==="directory_listings"?<div className={styles.googleReview}><strong>{translate("marketing.copy.requested_directories")}</strong><span>{directoryData.city}, {directoryData.state}</span>{directoryData.selected.map(d=><span key={d.id}>{d.name} · {d.cost==="free"?translate("marketing.action.free_listing"):d.cost==="membership"?translate("marketing.action.membership_may_be_required"):translate("marketing.action.to_evaluate")}</span>)}<span>{translate("marketing.copy.vmv_will_confirm_requirements_and_pricing_before_tak")}</span><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.review_selection")}</button></div>:null}
      {selected==="review_strategy"?<div className={styles.googleReview}><strong>{translate("marketing.copy.my_reputation")}</strong>{reviewInput.trim()?<span>{translate("marketing.copy.real_review")} {reviewInput}</span>:null}{reviewInput.trim()?<span>{translate("marketing.copy.reviewed_response")} {reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone)}</span>:null}{reviewLink?<span>{translate("marketing.copy.review_link")} {reviewLink}</span>:null}</div>:null}
      {selected==="seo_improvement"?<div className={styles.googleReview}><strong>{translate("marketing.copy.website_diagnosis")}</strong><span>{webRepair.audit?translate("marketing.action.speed")+(webRepair.audit.scores.performance??"—")+"/100; SEO: "+(webRepair.audit.scores.seo??"—")+"/100":translate("marketing.action.no_automated_analysis_technical_review_required")}</span><span>{translate("marketing.copy.platform")} {webRepair.platform==="other"?webRepair.otherPlatform:webRepair.platform}</span><span>{translate("marketing.copy.repository")} {webRepair.repositoryHost}</span><span>{webRepair.requestRepair?translate("marketing.action.i_want_a_quote"):translate("marketing.action.save_diagnosis_only")}</span><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.review_information")}</button></div>:null}
      <div className={styles.reviewGoal}><span>{translate("marketing.copy.what_you_need")}</span><p>{selected==="seo_improvement"?(webRepair.requestRepair?translate("marketing.action.request_a_repair_evaluation_and_quote"):translate("marketing.action.save_diagnosis_without_repairs")):selected==="google_profile"?googleGoalText:selected==="review_strategy"&&reviewInput.trim()?("Reseña: "+reviewInput.trim()+" · Respuesta: "+(reviewReply||reviewReplyTemplate(name,reviewInput,reviewTone))):goal.trim()}</p><button type="button" onClick={()=>editWizardStep(2)}>{translate("marketing.copy.edit_description")}</button></div>
     </div>
     <div className={styles.costNote}><Wallet size={22}/><div><strong>{translate("marketing.copy.submit_request_0")}</strong><p>{translate("marketing.copy.any_service_cost_will_be_quoted_later_no_payment_or_")}</p></div></div>
     <label className={styles.permission}><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setWizardError("");}}/>
      <span>{translate("marketing.copy.i_authorize_vmv_to_use_these_details_to_manage_and_r")} <strong>{translate("marketing.copy.publishing_payments_and_external_changes_will_requir")}</strong></span>
     </label>
     {authState==="checking"?<p className={styles.muted}>{translate("marketing.copy.checking_your_account")}</p>:
      authState!=="ready"?<div className={styles.signIn}><LockKeyhole size={19}/><p>{authState==="unconfigured"?translate("marketing.action.sign_in_isn_t_configured_in_this_environment"):translate("marketing.action.we_ll_save_your_answers_on_this_device_before_signing")}</p><button type="button" disabled={busy||!draftReady} onClick={()=>void continueToLogin()}>{translate("marketing.copy.save_and_sign_in_to_vmv")} <ArrowUpRight size={15}/></button><small>{translate("marketing.copy.this_draft_is_saved_in_this_browser_for_up_to_48_hou")}</small></div>:null}
    </div>:null}
    {draftNotice?<p role="status" className={styles.draftNotice}>{draftNotice}</p>:null}
    {photoNotice?<p role="status" className={styles.photoNotice}>{photoNotice}</p>:null}
    {wizardError?<p role="alert" className={styles.wizardError}>{wizardError}</p>:null}
    {wizardStep>0?<div className={styles.wizardFooter}>
     <button type="button" className={styles.wizardBack} onClick={goBack} disabled={busy}><ArrowLeft size={16}/> {translate("marketing.copy.previous")}</button>
     {wizardStep===3?<button type="button" className={styles.wizardPrimary} disabled={busy||loading||authState!=="ready"} onClick={()=>void submit()}><Send size={16}/>{busy?translate("marketing.action.submitting"):translate("marketing.action.submit_request")}</button>:
      <button type="button" className={styles.wizardPrimary} onClick={goNext}>{selected==="google_profile"&&wizardStep===2&&googleStep<googleStepNames.length-1?translate("marketing.action.next"):translate("marketing.action.continue")} <ArrowRight size={16}/></button>}
    </div>:null}
   </>}
  </section>
  {(wizardStep===0||wizardStep===4)?<section className={styles.panel} id="vmv-marketing-history">
   <div className={styles.panelTop}><div><span>{translate("marketing.ui.tracking")}</span><h3>{translate("marketing.ui.requests")}</h3></div><button type="button" onClick={()=>void refresh()} disabled={loading||!user} className={styles.refresh}><RefreshCw size={16}/> {translate("marketing.ui.refresh")}</button></div>
   {staff?<div className={styles.viewToggle}><button type="button" aria-pressed={!teamView} onClick={()=>setTeamView(false)}>{translate("marketing.ui.requests")}</button><button type="button" aria-pressed={teamView} onClick={()=>setTeamView(true)}>{translate("marketing.ui.teamInbox")}</button></div>:null}
   {!user?<p className={styles.muted}>{translate("marketing.ui.loginEmpty")}</p>:loading?<p className={styles.muted}>{translate("marketing.ui.loading")}</p>:
    shown.length===0?<div className={styles.empty}><ClipboardList size={25}/><strong>{translate("marketing.ui.empty")}</strong><span>{translate("marketing.ui.emptyHint")}</span></div>:
    <div className={styles.requestList}>{shown.map(req=>{
     const approved=isAccepted(req);
     const service=serviceName(req.service_code);
     return <article className={styles.request} key={req.id}>
      <div className={styles.requestTop}><div><strong>{service}</strong><small>{req.business_name} · {date(req.created_at)} · #{req.id.slice(0,8)}</small></div>
       <span className={req.status==="verified"?styles.verified:styles.status}>{statusNames[req.status]}</span></div>
      <p>{req.goal_text}</p>
      {req.service_code==="review_strategy"&&req.reputation_data?<details className={styles.googleSaved}><summary>{translate("marketing.copy.view_reputation_details")}</summary><div className={styles.googleSavedContent}>{req.reputation_data.reviewText?<p>{translate("marketing.copy.real_review")} {req.reputation_data.reviewText}</p>:null}{req.reputation_data.replyText?<p>Respuesta preparada: {req.reputation_data.replyText}</p>:null}{req.reputation_data.reviewLink?<a href={req.reputation_data.reviewLink} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.review_link_2")}</a>:null}<small>{translate("marketing.copy.no_automatic_publishing_or_sending")}</small></div></details>:null}
      {req.service_code==="directory_listings"&&req.directory_data?<div className={styles.dirHistory}><strong>{translate("marketing.copy.selected_directories")} {req.directory_data.city}, {req.directory_data.state}</strong>{req.directory_data.selected.map(t=><div className={styles.dirHistoryRow} key={t.id}><div><strong>{t.id==="research-local"?messageForResearch(t.name,language):t.name}</strong><small>{localizedDirectoryStatus(language,t.status)}</small>{t.existingUrl&&safeDirectoryUrl(t.existingUrl)?<a href={t.existingUrl} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.existing_link_supplied_by_the_customer_not_verified")}</a>:null}{t.evidenceUrl&&safeDirectoryUrl(t.evidenceUrl)?<a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.view_publication_evidence")}</a>:null}{t.note?<small>{t.note}</small>:null}</div>{staff&&teamView&&activeStaffId===req.id?<div className={styles.dirStaffFields}><select aria-label={translate("marketing.action.status_of")+t.name} value={directoryStatus[t.id]||t.status} onChange={e=>setDirectoryStatus(v=>({...v,[t.id]:e.target.value as DirectoryProgress}))}>{Object.entries(directoryStatusNames).map(([v])=><option key={v} value={v}>{localizedDirectoryStatus(language,v as DirectoryProgress)}</option>)}</select><input aria-label={translate("marketing.action.verified_link_for")+t.name} value={directoryProof[t.id]??t.evidenceUrl} onChange={e=>setDirectoryProof(v=>({...v,[t.id]:e.target.value}))} placeholder={translate("marketing.action.public_url_only_if_published")}/></div>:null}</div>)}</div>:null}
      {req.service_code==="seo_improvement"&&req.web_repair_data?<><a className={styles.reportLink} href={"/vista-app/marketing/informe/"+req.id}>{translate("marketing.copy.open_saved_full_report")}</a><details className={styles.googleSaved}><summary>{translate("marketing.copy.view_diagnosis_and_platform")}</summary><div className={styles.googleSavedContent}><p>{translate("marketing.copy.platform")} {req.web_repair_data.platform==="other"?req.web_repair_data.otherPlatform:req.web_repair_data.platform}</p><p>{translate("marketing.copy.repository")} {req.web_repair_data.repositoryHost}</p>{req.web_repair_data.repositoryUrl?<p>{req.web_repair_data.repositoryUrl}</p>:null}{req.web_repair_data.audit?<><p>Velocidad {req.web_repair_data.audit.scores.performance??"—"}/100 · SEO {req.web_repair_data.audit.scores.seo??"—"}/100</p>{req.web_repair_data.audit.explanation?<p>{req.web_repair_data.audit.explanation}</p>:null}<a href={req.web_repair_data.audit.reportUrl||"https://pagespeed.web.dev/"} target="_blank" rel="noopener noreferrer">{translate("marketing.copy.view_technical_evidence_on_google")}</a></>:<p>{translate("marketing.copy.no_automatic_report_request_awaiting_review")}</p>}</div></details></>:null}
      {req.service_code==="google_profile"&&req.google_profile_data?<details className={styles.googleSaved}>
       <summary>{translate("marketing.copy.view_profile_details_and_photos")}</summary><div className={styles.googleSavedContent}>
        <p><strong>{translate("marketing.copy.google_category")}</strong> {req.google_profile_data.googleCategory||translate("marketing.action.pending")}</p>
        <p><strong>{translate("marketing.copy.location")}</strong> {req.google_profile_data.kind==="service_area"?translate("marketing.action.service_area"):req.google_profile_data.kind==="hybrid"?translate("marketing.action.storefront_and_delivery"):translate("marketing.action.storefront")}</p>
        {req.google_profile_data.kind==="service_area"?<p>{req.google_profile_data.serviceAreas}</p>:<p>{[req.google_profile_data.street,req.google_profile_data.unit,req.google_profile_data.city,req.google_profile_data.region,req.google_profile_data.postal].filter(Boolean).join(", ")}</p>}
        {req.google_profile_data.phone?<p><strong>{translate("marketing.copy.phone")}</strong> {req.google_profile_data.phone}</p>:null}
        {req.google_profile_data.description?<p><strong>{translate("marketing.copy.description")}</strong> {req.google_profile_data.description}</p>:null}
        {req.google_profile_data.services?<p><strong>{translate("marketing.copy.services")}</strong> {req.google_profile_data.services}</p>:null}
        {req.google_profile_data.products?<p><strong>{translate("marketing.copy.products")}</strong> {req.google_profile_data.products}</p>:null}
        {req.google_profile_data.media?.map(photo=><button type="button" key={photo.path} onClick={()=>void openPrivatePhoto(photo.path)}>{translate("marketing.copy.view_image")} {photo.kind}</button>)}
       </div></details>:null}
      {req.staff_update?<div className={styles.staffNote}><strong>{translate("marketing.copy.vmv_update")}</strong> {req.staff_update}</div>:null}
      {req.quoted_price_cents!==null?<div className={styles.quote}>
       <div><Wallet size={18}/><span><strong>{money(req.quoted_price_cents)}</strong> {req.quoted_price_cents===0?translate("marketing.action.free_service"):translate("marketing.action.proposed_quote")}<small>{req.quote_note||translate("marketing.action.details_pending")}</small></span></div>
       {approved?<span className={styles.accepted}><CheckCircle2 size={15}/> {translate("marketing.copy.approved_by_customer")}</span>:
        req.owner_id===user.id&&req.status==="quoted"?
         <button type="button" disabled={busy} onClick={()=>void accept(req)}>{translate("marketing.copy.approve")} {money(req.quoted_price_cents)}</button>:null}
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
     </article>;
    })}</div>
   }
  </section>:null}
  {(wizardStep===0||wizardStep===4)?<div className={styles.bottomNote}><HandHeart size={17}/><p>{translate("marketing.ui.external")}</p></div>:null}
  {message?<p role="status" className={styles.notice}>{message}</p>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
 </div>;
}
