"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import {consumeAgentAdBrief,type AgentAdBrief} from "@/lib/vmv-ai-agents/ad-handoff";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./AdsStudio.module.css";
import {Megaphone,ShieldCheck,ArrowUpRight,CheckCircle2,Globe2,ExternalLink,ChevronDown,ChevronLeft,ChevronRight,ImagePlus,MapPin,WandSparkles,BarChart3,LoaderCircle,Instagram,X,Tag,Sparkles,Send,BookmarkCheck,CreditCard} from "lucide-react";

type Account={id:string;name:string;currency:string;status:number;timezone:string};
type Page={id:string;name:string;instagramId:string|null;instagramUsername:string};
type Connected={id:string;providerName:string;expiresAt:string|null;selectedAccountId:string|null;selectedAccountName:string|null};
type Campaign={id:string;ad_account_id:string;status:string;draft:{
 name:string;headline:string;message:string;destination:string;totalBudgetCents:number;
 durationDays:number;placements:string;imageHash?:string;pageId?:string;
 cityKey?:string;cityName?:string;citySearch?:string;radiusMiles?:number;
 dailyBudgetCents?:number;specialCategoriesAcknowledged?:boolean;
 intake?:{business?:string;offer?:string;audience?:string;benefit?:string;stateCode?:string;
 cityDisplay?:string;destinationInput?:string;utmEnabled?:boolean}};
 provider_campaign_id:string|null;provider_ad_id:string|null;
 metaAdsetEffectiveStatus?:string|null;metaAdsetEndAt?:string|null;
 error_code:string|null;created_at:string};
type PaymentCheck={state:"ready"|"missing"|"unverified"|"inactive";checkedAt:string;
 reason?:"funding_detected"|"funding_absent"|"funding_unavailable"|"provider_unavailable"|"account_inactive"|"connection_unavailable"};
type InsightRow={impressions?:string;reach?:string;clicks?:string;spend?:string;cpc?:string;ctr?:string;date_start?:string;date_stop?:string};
type AdAngle="offer"|"local"|"value";
type GeneratedAd={source:"ai";angle:AdAngle;variant:{headline:string;message:string}};
const adAngles=[
 {id:"offer",titleEs:"Destacar mi oferta",titleEn:"Highlight my offer",helpEs:"Qué vendes y por qué elegirlo.",helpEn:"What you sell and why choose it.",Icon:Tag},
 {id:"local",titleEs:"Llegar a mi ciudad",titleEn:"Reach local customers",helpEs:"Conecta con personas cerca.",helpEn:"Connect with nearby customers.",Icon:MapPin},
 {id:"value",titleEs:"Mostrar mi diferencia",titleEn:"Show what makes me different",helpEs:"Resalta el valor real del negocio.",helpEn:"Highlight genuine business value.",Icon:Sparkles}
] as const;
type Place={key:string;name:string;region:string;countryCode:string};
type AccountsResponse={configured:boolean;connected:boolean;connection?:Connected;accounts:Account[];
 pages:Page[];error?:string};
const initial={name:"",business:"",offer:"",audience:"",benefit:"",stateCode:"",cityQuery:"",cityKey:"",cityName:"",cityMetaName:"",citySearch:"",radiusMiles:"15",utmEnabled:true,headline:"",message:"",destination:"",pageId:"",
 dailyBudget:"10",durationDays:"7",placements:"facebook_instagram" as "facebook"|"facebook_instagram",
 specialCategoriesAcknowledged:false};
const usStates="AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming".split("|").map(x=>x.split(":") as [string,string]);
const adsWordmark="VMV ADS";
const platforms=[
 {name:"Meta Ads",description:"Facebook e Instagram",available:true},
 {name:"Google Ads",description:"Búsqueda, YouTube y Display",available:false},
 {name:"TikTok Ads",description:"Videos y anuncios TikTok",available:false},
 {name:"Pinterest Ads",description:"Pins promocionados",available:false},
 {name:"LinkedIn Ads",description:"Anuncios profesionales",available:false},
 {name:"Snapchat Ads",description:"Anuncios Snapchat",available:false}
];
export default function AdsStudio({mode="wizard",registerHeaderBack}:{mode?:"wizard"|"campaigns"|"platforms";registerHeaderBack?:(callback:(()=>void)|null)=>void}){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const localized=(es:string,english:string)=>en?english:es;
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const [metaReturn,setMetaReturn]=useState("");
 const [error,setError]=useState("");
 const [meta,setMeta]=useState<AccountsResponse>({configured:false,connected:false,accounts:[],pages:[]});
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [selectedAccount,setSelectedAccount]=useState("");
 const [form,setForm]=useState(initial);
 const [selectedAngle,setSelectedAngle]=useState<AdAngle|null>(null);
 const [conceptDialogOpen,setConceptDialogOpen]=useState(false);
 const conceptDialogRef=useRef<HTMLDivElement|null>(null);
 const [places,setPlaces]=useState<Place[]>([]);
 const [previewImage,setPreviewImage]=useState("");
 const [instagramEnabled,setInstagramEnabled]=useState(true);
 const [step,setStep]=useState(0);
 const [placeSearching,setPlaceSearching]=useState(false);
 const [locationError,setLocationError]=useState("");
 const [pagePickerOpen,setPagePickerOpen]=useState(false);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [image,setImage]=useState<File|null>(null);
 const [imageHash,setImageHash]=useState("");
 const uploadSeq=useRef(0);
 const [draftKey,setDraftKey]=useState(()=>crypto.randomUUID());
 const [draftId,setDraftId]=useState("");
 const [paymentCheck,setPaymentCheck]=useState<PaymentCheck|null>(null);
 const [confirmSendOpen,setConfirmSendOpen]=useState(false);
 const [spendConsent,setSpendConsent]=useState(false);
 const [finished,setFinished]=useState<{kind:"saved"|"sent"|"paused"|"failed";id:string}|null>(null);
 const resumedOnce=useRef(false);
 const [insights,setInsights]=useState<Record<string,{rows:InsightRow[];period:string}>>({});
 const [creativeChecks,setCreativeChecks]=useState<Record<string,{ok:boolean;reason:string;subcode?:number|null;metaMessage?:string;metaTrace?:string}>>({});
 const [historyFilter,setHistoryFilter]=useState<"pending"|"active"|"completed">("pending");
 const [agentBrief,setAgentBrief]=useState<AgentAdBrief|null>(null);
 const [handoffLoading,setHandoffLoading]=useState(false);
 const handoffChecked=useRef(false);
 const [publishReady,setPublishReady]=useState(false);
 const total=useMemo(()=>Math.round(Number(form.dailyBudget)*100)*Number(form.durationDays),[form.dailyBudget,form.durationDays]);
 const normalizedDestination=useMemo(()=>{
  const raw=form.destination.trim();
  if(!raw||/\s/.test(raw)||raw.startsWith("//")||raw.startsWith("\\")||
   /^(?!https:\/\/)[a-z][a-z0-9+.-]*:\/\//i.test(raw))return null;
  try{
   const url=new URL(/^https:\/\//i.test(raw)?raw:"https://"+raw);
   if(url.protocol!=="https:"||url.username||url.password||url.port||
    !url.hostname.includes(".")||url.hostname==="localhost"||
    url.hostname.endsWith(".local")||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))return null;
   return url.toString();
  }catch{return null;}
 },[form.destination]);
 const trackedDestination=useMemo(()=>{
  if(!normalizedDestination)return "";
  if(!form.utmEnabled)return normalizedDestination;
  const url=new URL(normalizedDestination);
  url.searchParams.set("utm_source","meta");
  url.searchParams.set("utm_medium","paid_social");
  const slug=(form.name||form.business||"vmv_campaign").toLowerCase().normalize("NFD")
   .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").slice(0,50);
  url.searchParams.set("utm_campaign",slug||"vmv_campaign");
  return url.toString();
 },[normalizedDestination,form.utmEnabled,form.name,form.business]);
 const testDestination=()=>{
  if(normalizedDestination)window.open(normalizedDestination,"_blank","noopener,noreferrer");
 };
 useEffect(()=>{
  if(!conceptDialogOpen)return;
  const previous=document.activeElement as HTMLElement|null;
  const dialog=conceptDialogRef.current;
  dialog?.querySelector<HTMLButtonElement>("button[data-concept]")?.focus();
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setConceptDialogOpen(false);return;}
   if(event.key!=="Tab"||!dialog)return;
   const buttons=Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
   if(!buttons.length)return;
   const first=buttons[0],last=buttons[buttons.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",onKeyDown);
  return()=>{
   document.body.style.overflow=oldOverflow;
   document.removeEventListener("keydown",onKeyDown);
   previous?.focus();
  };
 },[conceptDialogOpen]);

 useEffect(()=>{
  if(!image){setPreviewImage("");return;}
  const url=URL.createObjectURL(image);setPreviewImage(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const patch=(name:keyof typeof initial,value:string|boolean)=>{
  setForm(v=>({...v,[name]:value}));setFinished(null);setPaymentCheck(null);
  setConfirmSendOpen(false);setDraftKey(crypto.randomUUID());setError("");
  if(["business","offer","audience","benefit","cityQuery","stateCode"].includes(name))setSelectedAngle(null);
 };
 const api=async(path:string,method="GET",payload?:unknown,formData=false)=>{
  const client=getSupabase();if(!client)throw Error("sign_in_required");
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw Error("sign_in_required");
  const response=await fetch(path,{
   method,cache:"no-store",
   headers:{"Authorization":"Bearer "+session.access_token,...(formData?{}:method==="POST"?{"Content-Type":"application/json"}:{})},
   ...(method==="POST"?{body:formData?payload as FormData:JSON.stringify(payload)}:{})
  });
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(typeof value?.error==="string"?value.error:"request_failed");
  return value;
 };
 const reload=useCallback(async()=>{
  setLoading(true);
  try{
   // The history belongs to VMV and must remain visible if Meta temporarily disconnects.
   if(mode==="campaigns"){
    const list=await api("/api/marketing/ads/meta/campaigns");
    setCampaigns(list.campaigns||[]);
    setPublishReady(list.publishReady===true);
   }else if(mode==="wizard"){
    const accounts=(await api("/api/marketing/ads/meta/accounts")) as AccountsResponse;
    setMeta(accounts);setSelectedAccount(accounts.connection?.selectedAccountId||"");
    const list=await api("/api/marketing/ads/meta/campaigns");
    setCampaigns(list.campaigns||[]);
    setPublishReady(list.publishReady===true);
    if(accounts.error)setError(accounts.error);
   }
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setLoading(false);}
 },[mode]);
 useEffect(()=>{
  if(mode!=="wizard"||handoffChecked.current)return;
  handoffChecked.current=true;
  const query=new URLSearchParams(window.location.search);
  if(query.get("from")!=="ai-agents")return;
  const id=query.get("business")||"";
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return;
  let mounted=true;
  setHandoffLoading(true);
  void (async()=>{
   const db=getSupabase();if(!db)return;
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.is_anonymous||!mounted)return;
   const {data:central}=await db.from("vmv_marketing_businesses").select("id")
    .eq("id",id).eq("owner_id",user.id).maybeSingle();
   if(!central||!mounted)return;
   // Check business ownership before consuming the one-time intake. Each stored
   // agent and workspace must still belong to the signed-in owner.
   const {data:workspaces}=await db.from("vmv_ai_businesses").select("id")
    .eq("owner_id",user.id).eq("central_business_id",id).limit(20);
   if(!workspaces?.length||!mounted)return;
   const candidate=consumeAgentAdBrief(user.id,id);
   if(!candidate||!workspaces.some(w=>w.id===candidate.workspaceId))return;
   const {data:agent}=await db.from("vmv_ai_agents").select("id")
    .eq("id",candidate.agentId).eq("owner_id",user.id)
    .eq("business_id",candidate.workspaceId).maybeSingle();
   if(!agent||!mounted)return;
   const state=usStates.find(([code,name])=>code.toLowerCase()===candidate.region.toLowerCase()||
    name.toLowerCase()===candidate.region.toLowerCase());
   const city=candidate.city.trim().replace(/\s*,.*$/,"");
   // These Meta identifiers come from the authenticated wizard, then must still
   // match currently authorized account/Page; server campaign checks remain final.
   const selectedMeta=(await api("/api/marketing/ads/meta/accounts")) as AccountsResponse;
   const matchAccount=selectedMeta.connected&&candidate.accountId&&
    selectedMeta.connection?.selectedAccountId===candidate.accountId;
   const matchPage=matchAccount&&selectedMeta.pages.some(p=>p.id===candidate.pageId);
   if(!matchPage||!candidate.cityKey||!candidate.imageHash||!candidate.headline||!candidate.message){
    setError(localized("El anuncio necesita volver al agente para completar cuenta, ubicación, imagen o texto.",
     "Return to the agent to finish account, location, image or copy."));
    return;
   }
   if(mounted){
    setMeta(selectedMeta);setSelectedAccount(candidate.accountId||"");
    setImageHash(candidate.imageHash||"");
    setSelectedAngle("offer");
    setForm(v=>({...v,business:candidate.businessName.slice(0,80),
     offer:candidate.offer.slice(0,200),audience:candidate.audience.slice(0,130),
     benefit:candidate.notes.slice(0,180),destination:candidate.website,
     name:(candidate.businessName+" · "+candidate.offer).slice(0,80),
     stateCode:state?.[0]||"",cityQuery:city.slice(0,80),citySearch:city.slice(0,80),
     cityKey:candidate.cityKey||"",cityName:candidate.cityMetaName||"",
     cityMetaName:candidate.cityMetaName||"",pageId:candidate.pageId||"",
     headline:candidate.headline||"",message:candidate.message||""}));
   }
   setAgentBrief(candidate);
   setStep(4); // Review first, not the five-step creation wizard.
   // Creative copy and Meta image have already been prepared by AI Agents.
   // This screen only reviews budget, policy declarations and approval.
  })().catch(()=>{if(mounted)setError(localized("No se pudo recuperar el anuncio del agente.","Could not load the agent's ad brief."));})
   .finally(()=>{if(mounted)setHandoffLoading(false);});
  return()=>{mounted=false;};
 },[mode]);
 useEffect(()=>{
  const status=new URLSearchParams(window.location.search).get("meta");
  if(status)setMetaReturn(status);
  void reload();
 },[reload]);
 const describeFailure=(code:string)=>{
  if(code==="meta_reconnect_required"||code==="meta_connect_required")
   return localized("La conexión con Meta venció. Vuelve a conectar la cuenta desde el primer paso.",
    "Your Meta connection expired. Reconnect it from step one.");
  if(code==="meta_account_selection_required"||code==="meta_ad_account_not_authorized")
   return localized("No podemos usar esta cuenta publicitaria. Selecciona una cuenta activa en el primer paso.",
    "This ad account cannot be used. Select an active account in step one.");
  if(code==="meta_app_in_development_mode")
   return localized("Meta bloquea la creación de anuncios porque la aplicación sigue en modo Desarrollo. Debe cambiarse a Activo (Live) en Meta Developers.",
    "Meta blocks new creatives because the app remains in Development mode. Switch it to Live in Meta Developers.");
  if(code==="meta_creative_image_not_found")
   return localized("Meta no encontró la imagen del anuncio en esta cuenta. Es necesario subirla de nuevo.", "Meta cannot find the ad image in this account. Upload it again.");
  if(code==="meta_instagram_identity_deprecated")
   return localized("Meta rechazó un campo antiguo de Instagram. La integración ya utiliza el identificador actualizado.", "Meta rejected an old Instagram field. The integration now uses the updated identifier.");
  if(code==="meta_creative_parameters_rejected")
   return localized("Meta rechazó algún parámetro del anuncio. Revisa la campaña y solicita ayuda antes de repetirla.", "Meta rejected an ad parameter. Review the campaign and request help before resubmitting.");
  if(code==="meta_payment_not_detected")
   return localized("Meta no mostró un método de pago para esta cuenta. Comprueba la facturación en Meta. No se activó el anuncio.",
    "Meta did not show a payment method for this account. Check Meta billing. The ad was not activated.");
  if(code==="meta_payment_not_verified")
   return localized("Meta no compartió datos suficientes sobre el pago. Esto NO significa que haya rechazado tu anuncio; no se activó.",
    "Meta did not share enough billing information. This does NOT mean your ad was rejected; it was not activated.");
  if(code.startsWith("provider_creation_incomplete_review_"))
   return localized("Meta no pudo completar la creación del anuncio. Puede haber elementos pausados en Meta. No lo envíes otra vez: revisa Historial y solicita ayuda usando la referencia de la campaña.",
    "Meta could not finish creating the ad. Paused items may exist in Meta. Do not send it again: check History and contact support using the campaign reference.");
  if(code==="campaign_already_processed"||code==="campaign_already_processing")
   return localized("Esta campaña ya se está procesando o fue enviada antes. Consulta Historial antes de repetir.",
    "This campaign is already processing or was submitted before. Check History before retrying.");
  if(code==="activation_state_requires_reconciliation")
   return localized("Meta no confirmó si la activación se completó. Consulta Historial; la campaña podría estar activa y generando gasto. No repitas el envío.",
    "Meta has not confirmed whether activation completed. Check History; the campaign may be live and spending. Do not resend.");
  return null;
 };
 const run=async(label:string,fn:()=>Promise<void>)=>{
  setBusy(label);setError("");setNotice("");
  try{await fn();}
  catch(e){
   const message=e instanceof Error?e.message:"operation_failed";
   const display=message==="ai_generation_unavailable_retry"?
    localized("La IA no pudo crear el anuncio. Intenta nuevamente en un momento; no se generó una plantilla como sustituto.",
     "AI could not create your ad. Please retry shortly; no template was substituted."):
    message==="ai_provider_not_available"?
    localized("La conexión de IA no está disponible en este momento. Intenta más tarde.",
     "The AI connection is unavailable. Please try later."):
    message==="ai_daily_limit_retry_later"||message==="ai_provider_rate_limited"?
    localized("La generación de IA alcanzó su límite de solicitudes. Intenta más tarde.",
     "AI generation hit a request limit. Please try later."):
    message==="ai_provider_access_denied"?
    localized("La conexión de IA necesita autorización en Vercel. Estamos revisándola.",
     "The AI connection needs Vercel authorization. We're investigating it."):
    message==="ai_provider_billing_unavailable"?
    localized("El proveedor de IA no tiene facturación disponible. Revisa la configuración de Vercel.",
     "The AI provider's billing is unavailable. Check Vercel configuration."):
    message==="ai_provider_timeout"?
    localized("La IA tardó demasiado en responder. Intenta nuevamente.",
     "The AI request timed out. Please try again."):
    message==="ai_invalid_provider_response"?
    localized("La IA respondió, pero el anuncio no cumplió los requisitos. Intenta generarlo nuevamente.",
     "AI responded but the ad did not meet the requirements. Please regenerate."):message;
   setError(describeFailure(message)||display);
  }
  finally{setBusy("");}
 };
 const connect=()=>run("connect",async()=>{
  const result=await api("/api/marketing/ads/meta/start","POST",{});
  if(typeof result.url!=="string"||!result.url.startsWith("https://www.facebook.com/"))throw Error("unsafe_auth_url");
  window.location.assign(result.url);
 });
 const chooseAccount=()=>run("account",async()=>{
  await api("/api/marketing/ads/meta/accounts","POST",{accountId:selectedAccount});
  setNotice(localized("Cuenta publicitaria seleccionada.","Ad account selected."));
  await reload();
 });
 const disconnect=()=>{
  if(!window.confirm(localized("¿Desconectar Meta y revocar el acceso desde VMV? Puedes revocar también la app en Meta.","Disconnect Meta and remove VMV's access token? You can revoke the app in Meta as well.")))return;
  void run("disconnect",async()=>{
   await api("/api/marketing/ads/meta/disconnect","POST",{});
   setImageHash("");setDraftId("");setPaymentCheck(null);setFinished(null);
   await reload();setNotice(localized("Meta desconectado.","Meta disconnected."));
  });
 };
 const upload=(file:File|null)=>{
  const seq=++uploadSeq.current;
  setImage(file);setImageHash("");setFinished(null);setPaymentCheck(null);setDraftKey(crypto.randomUUID());
  setError("");
  if(!file)return;
  if(!["image/png","image/jpeg"].includes(file.type)||file.size<1024||file.size>2*1024*1024){
   setError(localized("Selecciona una imagen JPG o PNG de hasta 2 MB.","Choose a JPG or PNG image up to 2 MB."));
   return;
  }
  void run("image",async()=>{
   const data=new FormData();data.set("image",file);
   const result=await api("/api/marketing/ads/meta/image","POST",data,true);
   if(seq===uploadSeq.current){
    setImageHash(result.imageHash);
    setNotice(localized("Imagen lista para el anuncio.","Image ready for the ad."));
   }
  });
 };
 const choosePlace=(place:Place)=>{
  const stateName=usStates.find(([code])=>code===form.stateCode)?.[1]||place.region;
  const base=place.name.trim().replace(/\s*\([^)]*\)\s*$/,"").split(",")[0].trim();
  setForm(v=>({...v,cityKey:place.key,cityName:base+(stateName?", "+stateName:""),
   cityMetaName:place.name,cityQuery:base,citySearch:base}));
  setPlaces([]);setFinished(null);setPaymentCheck(null);setDraftKey(crypto.randomUUID());setSelectedAngle(null);
 };
 const generate=(angle:AdAngle)=>{
  setConceptDialogOpen(false);
  void run("generate",async()=>{
   if(!form.cityKey)throw Error("Selecciona primero una ciudad de Meta.");
   const response=await api("/api/marketing/ads/generate","POST",{
    business:form.business,offer:form.offer,audience:form.audience,
    benefit:form.benefit,city:form.cityName,locale:language,goal:"website",angle
   }) as GeneratedAd;
   if(response.source!=="ai"||response.angle!==angle||
      typeof response.variant?.headline!=="string"||typeof response.variant?.message!=="string")
    throw Error("ai_invalid_provider_response");
   setSelectedAngle(angle);
   setForm(v=>({...v,headline:response.variant.headline,message:response.variant.message}));
   setFinished(null);setPaymentCheck(null);setDraftKey(crypto.randomUUID());
   setNotice(localized("Anuncio generado. Puedes editarlo antes de aprobar.","Ad generated. You can edit it before approval."));
  });
 };
 const saveDraftRecord=async()=>{
  const daily=Math.round(Number(form.dailyBudget)*100),days=Number(form.durationDays);
  if(!Number.isInteger(daily)||daily<500||daily>25000||!Number.isInteger(days)||days<1||days>30)
   throw Error("budget_must_be_5_to_250_usd_per_day_and_1_to_30_days");
  if(!form.cityKey)throw Error("select_verified_city_first");
  if(!imageHash)throw Error("upload_image_first");
  const result=await api("/api/marketing/ads/meta/campaigns","POST",{
   operation:draftId?"update_draft":"draft",clientKey:draftKey,
   ...(draftId?{campaignId:draftId}:{}),
   draft:{
    name:form.name,headline:form.headline,message:form.message,destination:trackedDestination,
    cityKey:form.cityKey,cityName:form.cityMetaName,citySearch:form.citySearch,
    radiusMiles:Number(form.radiusMiles),imageHash,pageId:form.pageId,
    placements:instagramEnabled&&selectedPage?.instagramId?"facebook_instagram":"facebook",
    dailyBudgetCents:daily,durationDays:days,
    specialCategoriesAcknowledged:form.specialCategoriesAcknowledged,
    intake:{business:form.business,offer:form.offer,audience:form.audience,
     benefit:form.benefit,stateCode:form.stateCode,cityDisplay:form.cityName,
     destinationInput:form.destination,utmEnabled:form.utmEnabled}
   }
  });
  if(typeof result.campaign?.id!=="string")throw Error("draft_save_failed");
  setDraftId(result.campaign.id);
  return result.campaign as Campaign;
 };
 const saveDraft=()=>void run("draft",async()=>{
  const saved=await saveDraftRecord();
  setFinished({kind:"saved",id:saved.id});
  setNotice(localized("Guardado en Pendientes. Puedes retomarlo desde Historial y resultados.",
   "Saved under Pending. You can resume it from History & results."));
 });
 const prepareSend=()=>void run("payment",async()=>{
  if(!canSave)return;
  const result=await api("/api/marketing/ads/meta/payment-check") as PaymentCheck;
  setPaymentCheck(result);
  if(result.state!=="ready")return;
  if(!publishReady){
   setNotice(localized("El envío real sigue desactivado en esta versión de pruebas. Puedes guardar el anuncio sin crear nada en Meta.",
    "Live sending remains disabled in this preview. You can save the ad without creating anything in Meta."));
   return;
  }
  setSpendConsent(false);setConfirmSendOpen(true);
 });
 const sendAd=()=>{
  if(!publishReady||!spendConsent||!confirmSendOpen||paymentCheck?.state!=="ready"||!canSave)return;
  setConfirmSendOpen(false);
  void run("send",async()=>{
   const saved=await saveDraftRecord();
   try{
    await api("/api/marketing/ads/meta/campaigns","POST",{
     operation:"create_paused",campaignId:saved.id,confirmPaused:true,approvedTotalCents:total
    });
    setFinished({kind:"paused",id:saved.id});
   }catch(e){
    setFinished({kind:"failed",id:saved.id});
    throw e;
   }
   await api("/api/marketing/ads/meta/campaigns","POST",{
    operation:"activate",campaignId:saved.id,confirmSpend:true,
    approvedTotalCents:total,confirmationText:"PUBLICAR"
   });
   setFinished({kind:"sent",id:saved.id});
   setNotice(localized("Meta confirmó la activación. El anuncio puede requerir revisión antes de publicarse.",
    "Meta confirmed activation. The ad may require review before delivery."));
   await reload();
  });
 };
 const publish=(c:Campaign)=>{
  const phrase=window.prompt(localized(
   "PUBLICAR puede generar gastos en tu cuenta Meta hasta "+money(c.draft.totalBudgetCents)+". Escribe PUBLICAR para autorizar.",
   "Publishing can spend up to "+money(c.draft.totalBudgetCents)+" in your Meta account. Type PUBLICAR to authorize."));
  if(phrase!=="PUBLICAR")return;
  void run("publish:"+c.id,async()=>{
   await api("/api/marketing/ads/meta/campaigns","POST",{operation:"activate",
    campaignId:c.id,confirmSpend:true,approvedTotalCents:c.draft.totalBudgetCents,
    confirmationText:phrase});
   setNotice(localized("Meta confirmó la activación. Supervisa el gasto en tu cuenta publicitaria.","Meta confirmed activation. Monitor spend in your ad account."));
   await reload();
  });
 };
 const pause=(c:Campaign)=>{
  if(!window.confirm(localized("¿Pausar esta campaña en Meta?","Pause this Meta campaign?")))return;
  void run("pause:"+c.id,async()=>{
   await api("/api/marketing/ads/meta/campaigns","POST",{operation:"pause",campaignId:c.id});
   setNotice(localized("Meta confirmó la pausa de la campaña.","Meta confirmed the campaign pause."));
   await reload();
  });
 };
 const checkCreative=(c:Campaign)=>run("creative:"+c.id,async()=>{
  const result=await api("/api/marketing/ads/meta/creative-check","POST",{campaignId:c.id});
  setCreativeChecks(prev=>({...prev,[c.id]:result}));
 });
 const creativeMessage=(result:{ok:boolean;reason:string})=>{
  if(result.ok)return localized(
   "Meta aceptó los parámetros en una validación sin crear anuncios. Esto no garantiza la aprobación posterior; este intento anterior sigue fallido.",
   "Meta accepted the parameters in a no-creation validation. This does not guarantee approval; the earlier attempt remains failed.");
  switch(result.reason){
   case "meta_app_in_development_mode":return localized(
    "La aplicación de Meta todavía está en modo Desarrollo. Para crear anuncios nuevos debe pasar a modo Activo (Live), con los permisos de publicidad correspondientes.",
    "The Meta app is still in Development mode. To create new ads it must switch to Live with the required ad permissions.");
   case "meta_instagram_identity_deprecated":return localized(
    "Meta rechazó un identificador de Instagram antiguo. Ya corregimos el parámetro; vuelve a verificar antes de crear otra campaña.",
    "Meta rejected a deprecated Instagram identifier. The field is updated; validate again before creating another campaign.");
   case "meta_creative_image_not_found":return localized(
    "Meta no encuentra esa imagen en la cuenta publicitaria seleccionada. Será necesario subirla nuevamente a esa misma cuenta.",
    "Meta cannot find this image in the selected ad account. Re-upload it to that account.");
   case "meta_reconnect_required":return localized(
    "Meta requiere volver a iniciar sesión para validar el anuncio.",
    "Meta requires you to reconnect before validation.");
   case "meta_creative_access_denied":return localized(
    "La cuenta o la aplicación de Meta no tiene los permisos necesarios para preparar anuncios.",
    "The account or Meta app lacks the necessary permissions to create ad creatives.");
   default:return localized(
    "Meta sigue rechazando algún parámetro, pero no identificó cuál. Conservamos la referencia para investigarlo sin duplicar anuncios.",
    "Meta still rejects a parameter but did not identify which one. Keep the reference for support without creating duplicates.");
  }
 };
 const metrics=(c:Campaign)=>run("metrics:"+c.id,async()=>{
  const r=await api("/api/marketing/ads/meta/insights?campaignId="+encodeURIComponent(c.id));
  setInsights(prev=>({...prev,[c.id]:{rows:Array.isArray(r.rows)?r.rows:[],period:r.period||"maximum"}}));
 });
 const selectedPage=meta.pages.find(x=>x.id===form.pageId);
 const hasAccount=Boolean(meta.connected&&meta.connection?.selectedAccountId);
 useEffect(()=>{
  if(mode!=="wizard"||loading||resumedOnce.current)return;
  resumedOnce.current=true;
  const requested=new URLSearchParams(window.location.search).get("draft");
  if(!requested||!/^[0-9a-f-]{36}$/i.test(requested))return;
  const saved=campaigns.find(c=>c.id===requested&&c.status==="draft");
  if(!saved){setError(localized("No encontramos un borrador editable de esa cuenta.",
    "No editable draft was found for this account."));return;}
  const d=saved.draft,extra=d.intake||{};
  setForm(v=>({...v,
   name:d.name||"",headline:d.headline||"",message:d.message||"",
   destination:extra.destinationInput||d.destination||"",business:extra.business||d.name||"",
   offer:extra.offer||"",audience:extra.audience||"",benefit:extra.benefit||"",
   stateCode:extra.stateCode||"",cityQuery:d.citySearch||"",citySearch:d.citySearch||"",
   cityKey:d.cityKey||"",cityMetaName:d.cityName||"",
   cityName:extra.cityDisplay||d.cityName||"",pageId:d.pageId||"",
   radiusMiles:String(d.radiusMiles||15),utmEnabled:extra.utmEnabled??true,
   dailyBudget:String((d.dailyBudgetCents||1000)/100),
   durationDays:String(d.durationDays||7),
   specialCategoriesAcknowledged:d.specialCategoriesAcknowledged===true
  }));
  setInstagramEnabled(d.placements==="facebook_instagram");
  setImageHash(d.imageHash||"");
  setDraftId(saved.id);setStep(4);
  setNotice(localized("Borrador recuperado. Puedes editarlo o enviarlo cuando esté habilitado.",
   "Draft restored. You can edit it or send it when publishing is enabled."));
 },[mode,loading,campaigns]);
 const canSave=Boolean(hasAccount&&form.cityKey&&form.pageId&&imageHash&&
  form.name.trim().length>=2&&form.headline.trim().length>=5&&form.message.trim().length>=10&&
  form.specialCategoriesAcknowledged&&Boolean(normalizedDestination)&&
  Number.isInteger(total)&&total>=500&&total<=750000);
 const steps=en?["Account","Promotion","Location","Ad","Review"]:["Cuenta","Promoción","Ubicación","Anuncio","Revisión"];
 const canContinue=[
  hasAccount&&Boolean(form.pageId),
  form.business.trim().length>=2&&form.offer.trim().length>=8,
  Boolean(form.cityKey),
  form.headline.trim().length>=5&&form.message.trim().length>=10&&form.name.trim().length>=2&&
   Boolean(normalizedDestination)&&Boolean(imageHash)
 ];
 const goStep=(n:number)=>{setStep(Math.max(0,Math.min(4,n)));window.scrollTo({top:0,behavior:"smooth"});};
 const headerBackAction=useRef<()=>void>(()=>{});
 headerBackAction.current=()=>goStep(step-1);
 const canGoBack=mode==="wizard"&&step>0;
 useEffect(()=>{
  if(!registerHeaderBack||!canGoBack)return;
  const handler=()=>headerBackAction.current();
  registerHeaderBack(handler);
  return()=>registerHeaderBack(null);
 },[registerHeaderBack,canGoBack]);
 useEffect(()=>{
  const term=form.cityQuery.trim();
  if(step!==2||!hasAccount||!form.stateCode||term.length<3||form.cityKey){
   setPlaces([]);setPlaceSearching(false);setLocationError("");return;
  }
  let active=true;
  setPlaceSearching(true);setLocationError("");
  const timer=window.setTimeout(()=>{
   void (async()=>{
    try{
     const result=await api("/api/marketing/ads/meta/locations?q="+encodeURIComponent(term));
     if(!active)return;
     const stateName=usStates.find(s=>s[0]===form.stateCode)?.[1]?.toLowerCase()||"";
     const matches=(Array.isArray(result.places)?result.places:[]).filter((p:Place)=>{
      const region=p.region.toLowerCase();
      return region===stateName||region===form.stateCode.toLowerCase()||region.includes(stateName);
     });
     setPlaces(matches);
     if(!matches.length)setLocationError(localized("No encontramos la ciudad en ese estado. Prueba otro nombre.","No city found in this state. Try another name."));
    }catch{if(active){setPlaces([]);setLocationError(localized("La búsqueda de Meta no respondió. Comprueba la conexión.","Meta location search failed. Check the connection."));}}
    finally{if(active)setPlaceSearching(false);}
   })();
  },550);
  return()=>{active=false;window.clearTimeout(timer);};
 },[step,hasAccount,form.stateCode,form.cityQuery,form.cityKey,language]);

 const campaignGroup=(c:Campaign):"pending"|"active"|"completed"=>{
  if(["completed","finished","ended","archived"].includes(c.status)||c.metaAdsetEffectiveStatus==="COMPLETED")return "completed";
  if(c.status==="active")return "active";
  return "pending";
 };
 const groupItems=campaigns.filter(c=>campaignGroup(c)===historyFilter);
 const groupCount=(group:"pending"|"active"|"completed")=>campaigns.filter(c=>campaignGroup(c)===group).length;
 const statusLabel=(c:Campaign)=>{
  if(c.metaAdsetEffectiveStatus==="COMPLETED")return localized("Terminada","Completed");
  const values:Record<string,[string,string]>={
   draft:["Guardada · Pendiente","Saved · Pending"],paused:["Preparada · Pausada","Prepared · Paused"],
   provisioning:["Preparando en Meta","Creating in Meta"],
   failed:["Requiere revisión","Needs review"],
   activation_pending:["Pendiente de confirmación","Awaiting confirmation"],
   customer_paused:["Pausada","Paused"],active:["En curso","Active"],
   completed:["Terminada","Completed"],finished:["Terminada","Completed"],
   ended:["Terminada","Completed"],archived:["Archivada","Archived"]
  };
  const pair=values[c.status];
  return pair?localized(pair[0],pair[1]):localized("Estado por revisar","Status to review");
 };
 const metricNumber=(value?:string)=>{
  const n=Number(value);
  return value!==undefined&&Number.isFinite(n)?n.toLocaleString(en?"en-US":"es-US",{maximumFractionDigits:1}):"—";
 };
 const metricMoney=(value?:string)=>{
  const n=Number(value);
  return value!==undefined&&Number.isFinite(n)?money(Math.round(n*100)):"—";
 };
 if(mode==="campaigns")return <div className={styles.workspace}>
  <div className={styles.compactIntro}><div>
   <span className={styles.eyebrow}><BarChart3 size={15}/>{localized("ADS STUDIO · HISTORIAL","ADS STUDIO · HISTORY")}</span>
   <h1>{localized("Historial y resultados","History & results")}</h1>
   <p>{localized("Revisa el estado de tus campañas y las métricas que Meta haya registrado.","Review your campaign status and any metrics recorded by Meta.")}</p>
  </div></div>
  {error?<p className={styles.warning} role="alert">{error}</p>:null}
  {notice?<p className={styles.success} role="status">{notice}</p>:null}
  <div className={styles.historyTabs} role="group" aria-label={localized("Filtrar campañas","Filter campaigns")}>
   {([
    ["pending",localized("Pendientes","Pending")],
    ["active",localized("En curso","Active")],
    ["completed",localized("Terminadas","Completed")]
   ] as const).map(([key,label])=><button type="button" key={key}
     aria-pressed={historyFilter===key}
     className={historyFilter===key?styles.historyTabSelected:styles.historyTab}
     onClick={()=>setHistoryFilter(key)}>{label}<span>{groupCount(key)}</span></button>)}
  </div>
  {loading?<div className={styles.simpleCard}><p className={styles.muted}>{localized("Cargando campañas…","Loading campaigns…")}</p></div>:
   groupItems.length?<div className={styles.history}>{groupItems.map(c=><article key={c.id} className={styles.historyCard}>
    <div className={styles.historyHead}>
     <div><strong>{c.draft?.name||localized("Campaña","Campaign")}</strong><small>{new Date(c.created_at).toLocaleDateString(en?"en-US":"es-US",{year:"numeric",month:"short",day:"numeric"})}</small></div>
     <span className={campaignGroup(c)==="active"?styles.live:campaignGroup(c)==="completed"?styles.connected:styles.pilot}>{statusLabel(c)}</span>
    </div>
    <p>{c.draft?.headline||"—"}</p>
    <div className={styles.historyInfo}>
     <span><small>{localized("Presupuesto configurado","Configured budget")}</small><strong>{money(c.draft?.totalBudgetCents||0)}</strong></span>
     <span><small>{localized("Red","Network")}</small><strong>{c.draft?.placements==="facebook_instagram"?"Facebook + Instagram":"Facebook"}</strong></span>
    </div>
    {c.metaAdsetEndAt?<small className={styles.historyContext}>{localized("Fin programado en Meta: ","Meta scheduled end: ")}{new Date(c.metaAdsetEndAt).toLocaleDateString(en?"en-US":"es-US")}</small>:null}
    {c.error_code?<div className={styles.adIssue}>
     <div className={styles.adIssueTitle}><ShieldCheck size={18}/>
      <strong>{c.status==="failed"?
       localized("No se completó la creación del anuncio","Ad creation was not completed"):
       localized("Esta campaña requiere atención","This campaign needs attention")}</strong></div>
     <p>{c.error_code.startsWith("creative:")?
      localized("Meta rechazó la solicitud para preparar la imagen y el texto del anuncio. El motivo exacto no está disponible. No fue un rechazo posterior a la revisión ni un problema de pago confirmado.",
       "Meta rejected the request to prepare the ad creative. The exact reason is unavailable. This was not a post-review ad rejection or a confirmed billing issue."):
      c.error_code.startsWith("adset:")?
      localized("Meta no pudo configurar el presupuesto o la audiencia. No se activó el anuncio.",
       "Meta could not configure the budget or audience. The ad was not activated."):
      c.error_code.startsWith("campaign:")?
      localized("Meta no pudo crear la estructura de la campaña. No se activó el anuncio.",
       "Meta could not create the campaign. The ad was not activated."):
      c.error_code.startsWith("ad:")?
      localized("Meta no pudo finalizar la creación del anuncio. La campaña quedó sin activar.",
       "Meta could not finish creating the ad. The campaign was not activated."):
      localized("Ocurrió un problema durante la preparación. Comprueba el estado antes de intentar otra vez.",
       "There was a problem preparing the campaign. Check its status before trying again.")}</p>
     <p>{localized("Esta campaña no se activó desde VMV. Pueden existir elementos pausados en Meta. No vuelvas a enviarla; solicita ayuda con esta referencia.",
      "This campaign was not activated from VMV. Paused items may exist in Meta. Do not resubmit it; request help using this reference.")}</p>
     <small>{localized("Referencia VMV: ","VMV reference: ")}{c.id.slice(0,8)}
      {" · "}{localized("Diagnóstico: ","Diagnostic: ")}{c.error_code}</small>
     <div className={styles.paymentActions}>
      {c.status==="failed"?<button type="button" className={styles.secondary} disabled={!!busy}
       onClick={()=>void checkCreative(c)}>
       {busy==="creative:"+c.id?<LoaderCircle size={15} className={styles.spinIcon}/>:<ShieldCheck size={15}/>}
       {localized("Comprobar con Meta · sin crear anuncio","Check with Meta · no ad created")}
      </button>:null}
      <button type="button" className={styles.secondary} onClick={()=>void navigator.clipboard?.writeText("VMV "+c.id+" · "+c.error_code).catch(()=>{})}>
       {localized("Copiar referencia","Copy reference")}</button>
      <a href="/vista-app/soporte" className={styles.secondary}>
       {localized("Solicitar ayuda","Get support")}</a>
     </div>
    </div>:null}
    {creativeChecks[c.id]?<div className={styles.creativeValidation} role="status">
     <strong>{creativeChecks[c.id].ok?localized("Validación completada","Validation completed"):
      localized("Diagnóstico de Meta","Meta diagnosis")}</strong>
     <p>{creativeMessage(creativeChecks[c.id])}</p>
     {creativeChecks[c.id].metaMessage?<p>{localized("Detalle de Meta: ","Meta details: ")}
      {creativeChecks[c.id].metaMessage}</p>:null}
     {creativeChecks[c.id].subcode?<small>{localized("Código Meta: ","Meta code: ")}{creativeChecks[c.id].subcode}</small>:null}
     {creativeChecks[c.id].metaTrace?<small>{localized("Referencia técnica de Meta: ","Meta trace reference: ")}
      {creativeChecks[c.id].metaTrace}</small>:null}
     {!creativeChecks[c.id].ok&&creativeChecks[c.id].reason==="meta_app_in_development_mode"?
      <a className={styles.secondary} href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">
       <ExternalLink size={15}/>{localized("Abrir Meta Developers","Open Meta Developers")}</a>:null}
    </div>:null}
    {c.status==="activation_pending"?<div className={styles.adIssue}>
     <strong>{localized("Activación pendiente de confirmación","Activation pending confirmation")}</strong>
     <p>{localized("Meta no confirmó el resultado. El anuncio podría estar activo y generar gastos. No repitas el envío; pide ayuda para verificar el estado.",
      "Meta did not confirm the outcome. The ad could be active and spending. Do not resubmit; request help to verify its status.")}</p>
     <a href="/vista-app/soporte" className={styles.secondary}>{localized("Solicitar ayuda","Get support")}</a>
    </div>:null}
    <div className={styles.inlineActions}>
     {c.status==="draft"?<button type="button" className={styles.secondary} disabled={!!busy}
      onClick={()=>void checkCreative(c)}>
      {busy==="creative:"+c.id?<LoaderCircle size={15} className={styles.spinIcon}/>:<ShieldCheck size={15}/>}
      {localized("Comprobar con Meta · sin publicar","Check with Meta · no publishing")}
     </button>:null}
     {c.status==="draft"?<a className={styles.primary} href={"/vista-app/marketing/ads/create?draft="+encodeURIComponent(c.id)}>
      {localized("Continuar campaña","Resume campaign")}</a>:null}
     {c.status==="paused"&&publishReady?<button className={styles.primary} type="button" disabled={!!busy} onClick={()=>publish(c)}>
      {localized("Autorizar publicación y gasto","Authorize publication and spend")}</button>:null}
     {["active","activation_pending","paused"].includes(c.status)?<button className={styles.secondary} type="button" disabled={!!busy} onClick={()=>pause(c)}>{localized("Pausar","Pause")}</button>:null}
     {c.provider_campaign_id&&c.provider_ad_id&&c.status!=="failed"?<button className={styles.secondary} type="button" disabled={!!busy} onClick={()=>void metrics(c)}>
      {busy==="metrics:"+c.id?localized("Consultando…","Loading…"):localized("Ver resultados","View results")}</button>:null}
    </div>
    {insights[c.id]?<div className={styles.resultsPanel}>
     <div className={styles.resultsHeading}><strong>{localized("Resultados de Meta","Meta results")}</strong>
      <small>{localized("Datos acumulados disponibles","Available cumulative data")}</small></div>
     {insights[c.id].rows.length?insights[c.id].rows.map((row,index)=>
      <div className={styles.resultsGrid} key={index}>
       <span><small>{localized("Gasto real","Actual spend")}</small><strong>{metricMoney(row.spend)}</strong></span>
       <span><small>{localized("Clics","Clicks")}</small><strong>{metricNumber(row.clicks)}</strong></span>
       <span><small>{localized("Impresiones","Impressions")}</small><strong>{metricNumber(row.impressions)}</strong></span>
       <span><small>{localized("Alcance","Reach")}</small><strong>{metricNumber(row.reach)}</strong></span>
       <span><small>{localized("CTR","CTR")}</small><strong>{row.ctr?metricNumber(row.ctr)+"%":"—"}</strong></span>
       <span><small>{localized("Costo por clic","Cost per click")}</small><strong>{metricMoney(row.cpc)}</strong></span>
      </div>):
       <p className={styles.muted}>{localized("Meta aún no reporta resultados para esta campaña.","Meta has not reported results for this campaign yet.")}</p>}
     <p className={styles.resultsNote}>{localized("Estos son datos publicitarios de Meta, no ventas verificadas. Las métricas pueden retrasarse.","These are Meta advertising metrics, not verified sales. Reporting may be delayed.")}</p>
    </div>:null}
   </article>)}</div>:
   <div className={styles.emptyHistory}><BarChart3 size={24}/>
    <strong>{historyFilter==="pending"?localized("No tienes campañas pendientes","No pending campaigns"):
     historyFilter==="active"?localized("No hay campañas en curso","No active campaigns"):
      localized("No hay campañas terminadas registradas","No completed campaigns recorded")}</strong>
    <p>{historyFilter==="completed"?
     localized("Las campañas pausadas no se consideran terminadas. Mostraremos aquí las que Meta confirme como completadas.","Paused campaigns are not considered completed. Campaigns confirmed as completed by Meta will appear here."):
     localized("Las campañas que correspondan a este estado aparecerán aquí.","Campaigns in this state will appear here.")}</p>
   </div>}
 </div>;
 if(mode==="platforms")return <div className={styles.workspace}>
  <div className={styles.compactIntro}><div><span className={styles.eyebrow}>{localized("MARKETING · CANALES","MARKETING · CHANNELS")}</span>
   <h1>{localized("Plataformas publicitarias","Ad platforms")}</h1>
   <p>{localized("Integraciones disponibles y próximas conexiones.","Available integrations and upcoming connections.")}</p></div></div>
  <div className={styles.simpleCard}><strong>{localized("Meta Ads · Piloto","Meta Ads · Pilot")}</strong>
   <p className={styles.muted}>{localized("Facebook e Instagram. Anuncios con revisión y aprobación humana.","Facebook and Instagram. Ads with human review and approval.")}</p>
   <a className={styles.primary} href="/vista-app/marketing/ads/create">{localized("Crear campaña","Create campaign")}</a></div>
    <details open className={styles.simpleDetails}>
   <summary><span><Globe2 size={18}/>{localized("Otras plataformas","Other platforms")}</span><ChevronDown size={17}/></summary>
   <div className={styles.platformGrid}>{platforms.filter(p=>!p.available).map(p=><div className={styles.platform} key={p.name}>
    <strong>{p.name}</strong><small>{p.description}</small><span className={styles.planned}>{localized("Próximamente","Coming soon")}</span>
   </div>)}</div>
  </details>

 </div>;
 if(mode==="wizard"&&!agentBrief&&!draftId)return <div className={styles.workspace}>
  <div className={styles.simpleCard}>
   <h2>{localized("Prepara tu anuncio con AI Agents","Prepare your ad with AI Agents")}</h2>
   <p className={styles.muted}>{handoffLoading?
    localized("Recibiendo anuncio de tu agente…","Receiving your agent's ad…"):
    localized("La creación comienza en AI Agents. Tu agente reúne los datos y Marketing revisa el presupuesto.",
     "Creation starts in AI Agents. Your agent gathers the details and Marketing reviews the budget.")}</p>
   <a className={styles.primary} href="/vista-app/ai-agents">{localized("Abrir AI Agents","Open AI Agents")}</a>
  </div>
 </div>;
 return <div className={styles.workspace}>
  <div className={styles.compactIntro}>
   <div><span className={styles.eyebrow}><Megaphone size={15}/>{localized("MARKETING · ANUNCIOS","MARKETING · ADS")}</span>
    <h1>{localized("Crea tu campaña","Create your campaign")}</h1>
    <p>{localized("Una propuesta clara, con presupuesto y resultados medibles.","A clear proposal, with a budget and measurable results.")}</p></div>
   <span className={styles.pilot}>{localized("Piloto Meta","Meta pilot")}</span>
  </div>
  {metaReturn==="connected"&&meta.connected?<p className={styles.success}><CheckCircle2 size={16}/>{localized("Tu cuenta Meta se conectó correctamente.","Your Meta account connected successfully.")}</p>:null}
  {notice?<p className={styles.success} role="status"><CheckCircle2 size={16}/>{notice}</p>:null}
  {error&&step!==4?<p className={styles.warning} role="alert">{error}</p>:null}
  <nav className={styles.wizardSteps} aria-label={localized("Pasos de la campaña","Campaign steps")}>
   {steps.map((label,i)=><button key={i} type="button" aria-current={i===step?"step":undefined}
    className={i===step?styles.wizardStepCurrent:i<step?styles.wizardStepDone:styles.wizardStep}
    disabled={!!busy||i>step} onClick={()=>goStep(i)}>
    <span>{i<step?<CheckCircle2 size={15}/>:i+1}</span><small>{label}</small></button>)}
  </nav>
  {step===0?<section className={styles.simpleCard}>
   <div className={styles.cardTop}>
    <div className={styles.cardTitle}><span className={styles.cardIcon}><ShieldCheck size={19}/></span><div><h2>{localized("Cuenta publicitaria","Ad account")}</h2>
     <small>{loading?localized("Comprobando…","Checking…"):
      meta.connected?meta.connection?.selectedAccountName||meta.connection?.providerName||"Meta":
       localized("Conecta Meta de forma segura","Securely connect Meta")}</small></div></div>
    {meta.connected?<span className={styles.connected}><CheckCircle2 size={14}/>{localized("Conectada","Connected")}</span>:null}
   </div>
   {!loading&&!meta.configured?<p className={styles.warning}>{localized("Meta todavía no está configurado en este entorno.","Meta is not configured in this environment.")}</p>:null}
   {!loading&&meta.configured&&!meta.connected?<button type="button" className={styles.primary} disabled={!!busy} onClick={connect}>{localized("Conectar con Meta","Connect Meta")} <ArrowUpRight size={15}/></button>:null}
   {!loading&&meta.connected&&!meta.connection?.selectedAccountId?<div className={styles.accountSelect}>
    <label>{localized("Selecciona tu cuenta de anuncios","Choose an ad account")}
     <select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>
      <option value="">{localized("Elegir cuenta","Choose account")}</option>
      {meta.accounts.map(a=><option key={a.id} value={a.id} disabled={a.status!==1||a.currency!=="USD"}>{a.name} · {a.currency}</option>)}
     </select></label>
    <button className={styles.primary} type="button" disabled={!selectedAccount||!!busy} onClick={chooseAccount}>{localized("Usar esta cuenta","Use this account")}</button>
   </div>:null}
   {hasAccount?<div className={styles.accountSelect}>
    <span className={styles.fieldHeading}>{localized("Página de Facebook para el anuncio","Facebook Page for your ad")}</span>
    <button type="button" className={styles.pagePicker} aria-expanded={pagePickerOpen} onClick={()=>setPagePickerOpen(v=>!v)}>
     <span>{selectedPage?.name||localized("Seleccionar página","Choose a Page")}</span><ChevronDown size={17}/>
    </button>
    {pagePickerOpen?<div className={styles.pageOptions} role="group" aria-label={localized("Páginas disponibles","Available Pages")}>
     {meta.pages.map(p=><button key={p.id} type="button"
      className={form.pageId===p.id?styles.pageOptionSelected:styles.pageOption}
      onClick={()=>{patch("pageId",p.id);setPagePickerOpen(false);}}>
      <span><strong>{p.name}</strong><small>{p.instagramId?
       localized("Instagram vinculado","Instagram linked")+(p.instagramUsername?" · @"+p.instagramUsername:""):
       localized("Instagram no vinculado","Instagram not linked")}</small></span>
      {form.pageId===p.id?<CheckCircle2 size={17}/>:null}
     </button>)}
    </div>:null}
    {!meta.pages.length?<small className={styles.muted}>{localized("No se encontraron páginas autorizadas. Comprueba los permisos en Meta y vuelve a conectar.",
     "No authorized Pages found. Check permissions in Meta and reconnect.")}</small>:null}
   </div>:null}
   {!loading&&meta.connected&&meta.connection?.selectedAccountId?<details className={styles.inlineDisclosure}>
    <summary>{localized("Cambiar cuenta o desconectar","Change account or disconnect")} <ChevronDown size={15}/></summary>
    <div className={styles.accountSelect}>
     <label>{localized("Cuenta publicitaria","Ad account")}
      <select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>
       {meta.accounts.map(a=><option key={a.id} value={a.id} disabled={a.status!==1||a.currency!=="USD"}>{a.name} · {a.currency}</option>)}
      </select></label>
     <div className={styles.inlineActions}><button className={styles.secondary} type="button" disabled={!selectedAccount||!!busy||selectedAccount===meta.connection?.selectedAccountId} onClick={chooseAccount}>{localized("Cambiar","Change")}</button>
      <button type="button" disabled={!!busy} className={styles.textButton} onClick={disconnect}>{localized("Desconectar Meta","Disconnect Meta")}</button></div>
    </div>
   </details>:null}
  </section>:null}
  {step===1?<section className={styles.simpleCard}>
   <div className={styles.cardTop}>
    <div className={styles.cardTitle}><span className={styles.cardIcon}><MapPin size={19}/></span><div>
     <h2>{localized("Tu promoción","Your promotion")}</h2>
     <small>{localized("Cuéntanos lo esencial; sin formularios interminables.","Just the essentials. No endless forms.")}</small></div></div>
   </div>
   <div className={styles.formStack}>
    <label>{localized("Nombre del negocio","Business name")}
     <input maxLength={80} value={form.business} onChange={e=>patch("business",e.target.value)} placeholder={localized("Ej. Panadería Mayuli","E.g. Mayuli Bakery")}/></label>
    <label>{localized("¿Qué vendes o promocionas?","What are you promoting?")}
     <textarea rows={2} maxLength={200} value={form.offer} onChange={e=>patch("offer",e.target.value)}
      placeholder={localized("Ej. Pasteles y dulces cubanos por encargo","E.g. Custom Cuban cakes and desserts")}/></label>
    <label>{localized("¿Qué te diferencia? (solo hechos reales)","What sets you apart? (real facts only)")}
     <input maxLength={180} value={form.benefit} onChange={e=>patch("benefit",e.target.value)}
      placeholder={localized("Ej. Entregas a domicilio, pedidos personalizados","E.g. Delivery, made-to-order cakes")}/></label>
    <label>{localized("¿Para quién es?","Who is it for?")}
     <input maxLength={130} value={form.audience} onChange={e=>patch("audience",e.target.value)}
      placeholder={localized("Ej. Personas que quieren encargar un pastel","E.g. Customers ordering a birthday cake")}/>
     <small>{localized("Esto orienta el mensaje; no selecciona atributos personales en Meta.","For ad copy only; not personal-attribute targeting in Meta.")}</small></label>
   </div>
  </section>:null}
  {step===2?<section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><MapPin size={19}/></span><div>
    <h2>{localized("Ciudad y alcance","City and reach")}</h2><small>{localized("Elige dónde quieres anunciar.","Choose where your ad appears.")}</small>
   </div></div></div>
   <div className={styles.formStack}>
    <label>{localized("País","Country")}<input disabled value={localized("Estados Unidos","United States")} /></label>
    <label>{localized("Estado","State")}<select value={form.stateCode} onChange={e=>{
     patch("stateCode",e.target.value);setForm(v=>({...v,cityQuery:"",cityKey:"",cityName:"",cityMetaName:"",citySearch:""}));setPlaces([]);
    }}>
     <option value="">{localized("Seleccionar estado","Choose a state")}</option>
     {usStates.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}
    </select></label>
    <label>{localized("Ciudad","City")}<input autoComplete="off" maxLength={80} disabled={!form.stateCode}
     value={form.cityQuery} onChange={e=>{
      patch("cityQuery",e.target.value);setForm(v=>({...v,cityKey:"",cityName:"",cityMetaName:"",citySearch:""}));setPlaces([]);
     }} placeholder={localized("Ej. Columbus","E.g. Columbus")}/></label>
    {placeSearching?<small className={styles.muted}>{localized("Buscando ciudades…","Searching cities…")}</small>:null}
    {places.length?<div className={styles.locationResults} role="group" aria-label={localized("Ciudades encontradas","Matching cities")}>
     {places.map(p=><button key={p.key} type="button" onClick={()=>choosePlace(p)}><MapPin size={15}/> {p.name}{p.region?", "+p.region:""}</button>)}
    </div>:null}
    {locationError?<p className={styles.completionNote} role="status">{locationError}</p>:null}
    {form.cityKey?<div className={styles.placePicked}><CheckCircle2 size={15}/>{form.cityName}</div>:null}
    <label>{localized("Radio de alcance","Target radius")}<select value={form.radiusMiles} onChange={e=>patch("radiusMiles",e.target.value)}>
     {[10,15,25,50].map(n=><option key={n} value={n}>{n} {localized("millas","miles")}</option>)}
    </select></label>
    <small className={styles.muted}>{localized("Solo elegimos ciudades verificadas por Meta. Nunca todo Estados Unidos por defecto.","Only Meta-verified cities are used, never the entire United States by default.")}</small>
   </div>
  </section>:null}
  {step===3?<section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><WandSparkles size={19}/></span><div>
    <h2>{localized("Propuesta publicitaria","Ad proposal")}</h2>
    <small>{localized("Prepara y revisa tu anuncio antes de guardarlo.","Prepare and review your ad before saving.")}</small></div></div></div>
   {!agentBrief?<>
   <div className={styles.aiGenerateRow}>
    <button className={styles.primary} type="button" disabled={!!busy||!hasAccount||!form.cityKey||form.business.trim().length<2||form.offer.trim().length<8||form.audience.trim().length<3}
     onClick={()=>setConceptDialogOpen(true)}>
     {busy==="generate"?<LoaderCircle size={17} className={styles.spinIcon}/>:<WandSparkles size={17}/>}
     {busy==="generate"?localized("Generando anuncio…","Generating ad…"):localized("Generar anuncio","Generate ad")}
    </button>
    {selectedAngle?<span className={styles.aiReady}><CheckCircle2 size={15}/>{localized("Listo para editar","Ready to edit")}</span>:null}
   </div>
   </>:<p className={styles.success}><CheckCircle2 size={16}/>{localized("El agente generó el texto. Puedes editarlo aquí.","Your agent generated this copy. You can edit it here.")}</p>}
   <div className={styles.formStack}>
    <label>{localized("Título del anuncio","Ad headline")}
     <input maxLength={80} value={form.headline} onChange={e=>patch("headline",e.target.value)} placeholder={localized("Título específico y comprobable","Specific, factual headline")}/></label>
    <label>{localized("Texto del anuncio","Ad text")}
     <textarea rows={4} maxLength={500} value={form.message} onChange={e=>patch("message",e.target.value)} placeholder={localized("Qué ofreces y por qué vale la pena visitar tu web","What you offer and why people should visit your website")}/></label>
    <label>{localized("Nombre interno de la campaña","Campaign name")}
     <input maxLength={80} value={form.name} onChange={e=>patch("name",e.target.value)} placeholder={localized("Ej. Pasteles · Noviembre","E.g. Cakes · November")}/></label>
    <label>{localized("Enlace de destino","Destination link")}
     <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      value={form.destination} onChange={e=>patch("destination",e.target.value)}
      placeholder={localized("Ej. mayulibakery.com","E.g. mayulibakery.com")}/></label>
    <div className={styles.linkCheck}>
     <button type="button" className={styles.secondary} disabled={!normalizedDestination}
      onClick={testDestination}><ExternalLink size={15}/>{localized("Probar enlace","Test link")}</button>
     {normalizedDestination?<small>{localized("Enlace seguro: ","Secure URL: ")}{normalizedDestination}</small>:
      form.destination.trim()?<small className={styles.linkError}>{localized("Escribe un dominio válido. Solo HTTPS.","Enter a valid domain. HTTPS only.")}</small>:null}
    </div>
   </div>
   <div className={styles.preview}>
    <div className={styles.previewHeader}><span className={styles.previewBrand}>{form.business.trim().slice(0,1).toUpperCase()||"V"}</span><div>
     <strong>{form.business||localized("Tu negocio","Your business")}</strong><small>{localized("Vista previa · anuncio","Preview · ad")}</small></div></div>
    <p>{form.message||localized("Aquí aparecerá tu anuncio.","Your ad will appear here.")}</p>
    {previewImage?<img src={previewImage} alt={localized("Vista previa de imagen seleccionada","Selected image preview")}/>:
     <div className={styles.previewEmpty}><ImagePlus size={24}/>{localized("Selecciona una imagen para ver el anuncio","Select an image to preview your ad")}</div>}
    <div className={styles.previewBottom}><div><strong>{form.headline||localized("Título del anuncio","Ad headline")}</strong>
     <small>{(()=>{try{return normalizedDestination?new URL(normalizedDestination).hostname:localized("Tu sitio web","Your website");}catch{return localized("Tu sitio web","Your website");}})()}</small></div>
     <span>{localized("Más información","Learn more")}</span></div>
   </div>
   {!agentBrief?<>
   <div className={styles.uploadRow} aria-live="polite">
    <label className={styles.imagePicker}>{localized("Imagen del anuncio · JPG/PNG hasta 2 MB","Ad image · JPG/PNG up to 2 MB")}
     <input className={styles.visuallyHiddenFile} type="file" accept="image/jpeg,image/png"
      disabled={busy==="image"} onChange={e=>upload(e.target.files?.[0]||null)}/>
     <span className={styles.imagePickerButton}><ImagePlus size={16}/>{image?image.name.slice(0,30):localized("Elegir imagen","Choose image")}</span>
    </label>
    {busy==="image"?<span className={styles.uploadStatus} role="status"><LoaderCircle size={17} className={styles.spinIcon} aria-hidden="true"/>{localized("Subiendo imagen a Meta…","Uploading image to Meta…")}</span>:
     imageHash?<span className={styles.connected}><CheckCircle2 size={15}/>{localized("Imagen lista","Image ready")}</span>:
      image?<button type="button" className={styles.secondary} disabled={!!busy} onClick={()=>upload(image)}>{localized("Reintentar imagen","Retry image")}</button>:null}
   </div>
   {busy==="image"?<p className={styles.imageWaitText}>{localized("Puedes esperar unos segundos. Continuar se activará automáticamente cuando Meta termine.","Please wait a few seconds. Continue will activate automatically when Meta is ready.")}</p>:null}
   </>:<p className={styles.success}><CheckCircle2 size={16}/>{localized("Imagen confirmada por Meta desde el agente.","Meta confirmed the image from your agent.")}</p>}
  </section>:null}
  {step===4&&agentBrief?<section className={styles.agentReview} aria-label={localized("Revisión del anuncio preparado por tu agente","Review the ad prepared by your agent")}>
   <div className={styles.agentReviewHeader}><span className={styles.agentReviewIcon}><Sparkles size={24}/></span>
    <div><small>{localized("DEL AGENTE A MARKETING","FROM AGENT TO MARKETING")}</small><h2>{localized("Revisa tu anuncio","Review your ad")}</h2>
     <p>{localized("Tu agente ya recopiló los datos. Solo falta completar lo que Meta exige.","Your agent already collected the details. Complete only what Meta requires.")}</p>
    </div>
   </div>
   <div className={styles.agentReviewGrid}>
    <div><small>{localized("Negocio","Business")}</small><strong>{form.business||"—"}</strong></div>
    <div><small>{localized("Producto u oferta","Offer")}</small><strong>{form.offer||"—"}</strong></div>
    <div><small>{localized("Sitio web","Website")}</small><strong>{form.destination||localized("Pendiente","Pending")}</strong></div>
    <div><small>{localized("Ubicación","Location")}</small><strong>{agentBrief.city}, {agentBrief.region}</strong></div>
    <div><small>{localized("Público","Audience")}</small><strong>{form.audience||"—"}</strong></div>
    <div><small>{localized("Objetivos","Goals")}</small><strong>{(agentBrief.goals||[agentBrief.goal]).map(g=>({
     visits:localized("Visitas","Visits"),messages:localized("Mensajes","Messages"),sales:localized("Ventas","Sales")
    }[g])).join(" · ")}</strong></div>
   </div>
   <div className={styles.agentReviewTasks}>
    <strong>{localized("Antes de guardar la campaña","Before saving the campaign")}</strong>
    {!hasAccount||!form.pageId?<button type="button" onClick={()=>goStep(0)}>
     <span>{localized("Cuenta y página de Facebook","Facebook account and Page")}</span><ChevronRight size={18}/></button>:null}
    {!form.cityKey?<button type="button" onClick={()=>goStep(2)}>
     <span>{localized("Confirmar ciudad en Meta","Verify city in Meta")}</span><ChevronRight size={18}/></button>:null}
    {!form.headline.trim()||!form.message.trim()||!imageHash||!normalizedDestination?
     <button type="button" onClick={()=>goStep(3)}>
      <span>{localized("Generar texto, revisar enlace y cargar imagen","Generate copy, review link and upload image")}</span><ChevronRight size={18}/></button>:null}
    {!form.specialCategoriesAcknowledged?<p>{localized("Confirma más abajo la categoría especial y el presupuesto.","Confirm the ad category and budget below.")}</p>:null}
    {hasAccount&&form.pageId&&form.cityKey&&form.headline&&form.message&&imageHash&&normalizedDestination?
     <p>{localized("Cuenta, imagen y creatividad listas. Revisa el presupuesto y confirma abajo.","Account, image and creative ready. Review the budget and confirm below.")}</p>:null}
    {(agentBrief.goals||[agentBrief.goal]).some(g=>g!=="visits")?
     <p>{localized("Meta Ads Studio solo prepara clics a la web en este piloto. Los objetivos de mensajes o ventas quedan como intención; no se activarán automáticamente.","This Meta Ads pilot supports website clicks only. Message and sales goals are preferences and will not activate automatically.")}</p>:null}
   </div>
   <div className={styles.inlineActions}>
    <button type="button" className={styles.secondary} onClick={()=>goStep(1)}>{localized("Editar los datos","Edit details")}</button>
    <button type="button" className={styles.secondary} onClick={()=>goStep(3)}>{localized("Editar anuncio e imagen","Edit ad and image")}</button>
   </div>
  </section>:null}
  {handoffLoading?<p className={styles.muted}>{localized("Preparando revisión…","Preparing review…")}</p>:null}
  {step===4?<section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><BarChart3 size={19}/></span><div>
    <h2>{localized("Presupuesto y entrega","Budget and delivery")}</h2><small>{localized("El gasto publicitario se paga directamente a Meta.","Ad spend is billed directly by Meta.")}</small></div></div></div>
   <div className={styles.instagramConnection}>
    <div className={styles.igHeading}><Instagram size={19} aria-hidden="true"/>
     <div><strong>{localized("Instagram","Instagram")}</strong>
      <small>{selectedPage?.name||localized("Selecciona una página de Facebook en el primer paso","Choose a Facebook Page in the first step")}</small></div>
     {selectedPage?.instagramId?<span className={styles.connected}><CheckCircle2 size={14}/>{localized("Vinculado","Linked")}</span>:
      <span className={styles.pilot}>{localized("Sin vincular","Not linked")}</span>}
    </div>
    {selectedPage?.instagramId?<p className={styles.igHelp}>{selectedPage.instagramUsername?"@"+selectedPage.instagramUsername:
     localized("Meta reconoce un Instagram profesional vinculado a esta página.","Meta recognizes a professional Instagram account linked to this Page.")}</p>:
     <div className={styles.igHelp}>
      <p>{localized("El switch no conecta cuentas. Vincula tu Instagram profesional a esta página de Facebook desde Meta Business Suite y vuelve para comprobarlo.",
       "The switch doesn't link accounts. Link your professional Instagram to this Facebook Page in Meta Business Suite, then return to verify it.")}</p>
      <div className={styles.igActions}>
       <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className={styles.secondary}>
        <ExternalLink size={15}/>{localized("Vincular Instagram en Meta","Link Instagram in Meta")}</a>
       <button type="button" className={styles.secondary} disabled={loading||!!busy} onClick={()=>void reload()}>
        {loading?<LoaderCircle size={15} className={styles.spinIcon} aria-hidden="true"/>:<CheckCircle2 size={15}/>}
        {loading?localized("Comprobando…","Checking…"):localized("Comprobar conexión","Check connection")}</button>
      </div>
      <small>{localized("En Meta: Configuración → Cuentas → Instagram. Asegúrate de vincularlo también a la página seleccionada.",
       "In Meta: Settings → Accounts → Instagram. Make sure it is also linked to the selected Page.")}</small>
     </div>}
    <div className={styles.switchRow}><div><strong>{localized("Incluir Instagram en el anuncio","Include Instagram in the ad")}</strong>
     <small>{selectedPage?.instagramId?localized("Activar ubicaciones de Instagram para esta campaña.","Enable Instagram placements for this campaign."):
      localized("Disponible cuando Meta confirme la vinculación.","Available after Meta confirms the linked account.")}</small></div>
     <label className={styles.toggle}><input type="checkbox" aria-label={localized("Incluir Instagram en el anuncio","Include Instagram in the ad")}
      checked={instagramEnabled&&Boolean(selectedPage?.instagramId)} disabled={!selectedPage?.instagramId}
      onChange={e=>setInstagramEnabled(e.target.checked)}/><span/></label>
    </div>
   </div>
   <div className={styles.switchRow}><div><strong>{localized("Añadir etiquetas UTM","Add UTM tags")}</strong>
    <small>{localized("Añade etiquetas al enlace para atribuir visitas.","Adds tags to your URL to attribute visits.")}</small></div>
    <label className={styles.toggle}><input type="checkbox" checked={form.utmEnabled} onChange={e=>patch("utmEnabled",e.target.checked)}/><span/></label></div>
   <div className={styles.compactFields}>
    <label>{localized("Por día (USD)","Per day (USD)")}
     <input type="number" min="5" max="250" step="0.01" value={form.dailyBudget} onChange={e=>patch("dailyBudget",e.target.value)}/></label>
    <label>{localized("Duración (días)","Duration (days)")}
     <input type="number" min="1" max="30" value={form.durationDays} onChange={e=>patch("durationDays",e.target.value)}/></label>
   </div>
   <div className={styles.budgetSimple}><div><small>{localized("Presupuesto total configurado","Configured total ad budget")}</small>
     <strong>{Number.isFinite(total)&&total>0?money(total):"—"}</strong></div>
    <span>{localized("Sin gasto ahora","No spend now")}</span></div>
   <details className={styles.inlineDisclosure}>
    <summary>{localized("Detalles de seguimiento","Tracking details")} <ChevronDown size={15}/></summary>
    <div className={styles.formStack}>
     {form.utmEnabled&&form.destination?<small className={styles.trackedLink}>{localized("Enlace con UTM: ","Tracked link: ")}{trackedDestination}</small>:null}
    </div>
   </details>
   <label className={styles.permission}><input type="checkbox" checked={form.specialCategoriesAcknowledged}
    onChange={e=>patch("specialCategoriesAcknowledged",e.target.checked)}/>
    <span>{localized("Confirmo que no anuncio vivienda, empleo, crédito ni otra categoría especial. Los datos de mi oferta son verdaderos y tengo derechos sobre las imágenes.",
     "I confirm this is not housing, employment, credit or another special category. My claims are accurate and I own the image rights.")}</span></label>
   {!canSave?<p className={styles.completionNote}>{localized("Para guardar: selecciona ciudad y página, escribe título y mensaje, agrega enlace HTTPS e imagen, define presupuesto y confirma la categoría del anuncio.",
    "To save: select a city and Page, enter headline and copy, add an HTTPS link and image, set a budget and confirm the ad category.")}</p>:null}
   <div className={styles.finalActions}>
    <button type="button" className={styles.primary} disabled={!canSave||!!busy||finished?.kind==="sent"}
     onClick={prepareSend}>
     {busy==="payment"?<LoaderCircle size={17} className={styles.spinIcon}/>:<Send size={17}/>}
     {localized("Enviar anuncio","Send ad")}
    </button>
    <button type="button" className={styles.secondary} disabled={!canSave||!!busy||finished?.kind==="sent"}
     onClick={saveDraft}>
     {busy==="draft"?<LoaderCircle size={17} className={styles.spinIcon}/>:<BookmarkCheck size={17}/>}
     {localized("Guardar para más tarde","Save for later")}
    </button>
   </div>
   {paymentCheck?<div className={styles.paymentResult} role="status">
    <div className={styles.paymentHeading}><CreditCard size={18}/>
     <strong>{paymentCheck.state==="ready"?
      localized("Meta informó una fuente de pago","Meta reported a funding source"):
      paymentCheck.state==="missing"?
      localized("Meta no mostró un método de pago","Meta did not show a payment method"):
      paymentCheck.state==="inactive"?
      localized("La cuenta publicitaria no está activa","Ad account is not active"):
      localized("No pudimos comprobar el pago en Meta","We could not check payment in Meta")}</strong>
    </div>
    <p>{paymentCheck.state==="ready"?
      localized("La disponibilidad de pago se verificará nuevamente antes de activar. Meta decide si acepta el cobro.",
       "Payment availability will be rechecked before activation. Meta ultimately determines whether it accepts charges."):
      paymentCheck.state==="missing"?
      localized("Meta no devolvió una fuente de pago para esta cuenta. Verifica el método de pago en la sección Facturación de Meta. Esto no significa que tu anuncio haya sido rechazado. Aún no se envió ni generó gasto.",
       "Meta did not return a funding source for this account. Check its payment method in Meta Billing. This does not mean your ad was rejected. Nothing was sent or spent."):
      paymentCheck.state==="inactive"?
      localized("Revisa el estado de la cuenta en Meta antes de enviar anuncios.",
       "Review your account status in Meta before sending ads."):
      localized("Meta no permitió verificar la información de pago desde VMV. Puede haber una tarjeta válida: no sabemos si falta o si los permisos impiden verla. Esto NO es una revisión ni un rechazo del anuncio. No se envió ni se generó gasto.",
       "Meta did not let VMV verify payment information. A valid card may exist; we cannot tell whether it is missing or hidden by permissions. This is NOT an ad review or rejection. No ad was sent and no spend occurred.")}</p>
    {paymentCheck.state!=="ready"?<div className={styles.paymentActions}>
     <a href="https://www.facebook.com/adsmanager/billing" className={styles.secondary}
      target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{localized("Revisar pago en Meta","Check billing in Meta")}</a>
     <button type="button" className={styles.secondary} disabled={!!busy} onClick={prepareSend}>
      <CheckCircle2 size={15}/>{localized("Comprobar otra vez","Check again")}</button>
    </div>:null}
   </div>:null}
   {!publishReady?<p className={styles.pilotNotice}>
    <ShieldCheck size={16}/>{localized("Modo de pruebas: Enviar solo comprueba la cuenta. La publicación y el gasto siguen desactivados.",
     "Preview mode: Send only checks your account. Publishing and ad spend remain disabled.")}</p>:null}
   {finished?<div className={["paused","failed"].includes(finished.kind)?styles.warning:styles.success} role="status">
    <CheckCircle2 size={17}/>
    <div><strong>{finished.kind==="sent"?localized("Campaña enviada a Meta","Campaign sent to Meta"):
      finished.kind==="paused"?localized("Campaña creada en Meta, aún pausada","Campaign created in Meta, still paused"):
      finished.kind==="failed"?localized("Meta no pudo completar el anuncio","Meta could not finish the ad"):
      localized("Campaña guardada","Campaign saved")}</strong>
     <p>{finished.kind==="sent"?
      localized("Meta confirmó la solicitud de activación. Comprueba la aprobación y entrega en Historial.",
       "Meta confirmed the activation request. Check review and delivery in History."):
      finished.kind==="paused"?
      localized("La campaña está pausada en Meta y no se activó. Consulta Historial para revisar el estado.",
       "The campaign is paused in Meta and was not activated. Check History to review its status."):
      finished.kind==="failed"?
      localized("Algunos elementos pueden haberse creado pausados. No vuelvas a enviar: consulta Historial y usa la referencia para pedir soporte.",
       "Some items may have been created paused. Do not resend: check History and use the reference for support."):
      localized("Está en Pendientes. Puedes continuar después sin crear anuncios en Meta.",
       "It is in Pending. You can resume later without creating ads in Meta.")}</p>
     <a className={styles.secondary} href="/vista-app/marketing/ads/campaigns">
      {localized("Ver historial y resultados","View history & results")}</a></div>
   </div>:null}
   {error&&step===4?<div className={styles.adIssue} role="alert">
    <div className={styles.adIssueTitle}><ShieldCheck size={18}/>
     <strong>{localized("No pudimos completar esta acción","We could not complete this action")}</strong></div>
    <p>{error}</p>
    <div className={styles.paymentActions}>
     <a className={styles.secondary} href="/vista-app/marketing/ads/campaigns">
      {localized("Ver estado en Historial","Check status in History")}</a>
     <a className={styles.secondary} href="/vista-app/soporte">{localized("Solicitar ayuda","Get support")}</a>
    </div>
   </div>:null}
   <p className={styles.muted}>{localized("Meta cobra directamente a la cuenta publicitaria del cliente. Guardar no publica ni genera gasto.",
    "Meta charges the customer's ad account directly. Saving does not publish or incur spend.")}</p>
  </section>:null}
  {confirmSendOpen?<div className={styles.conceptOverlay}>
   <div className={styles.conceptModal} role="dialog" aria-modal="true" aria-labelledby="vmv-send-title">
    <div className={styles.conceptHeading}>
     <div><span><ShieldCheck size={16}/>{localized("CONFIRMAR GASTO","CONFIRM SPEND")}</span>
      <h2 id="vmv-send-title">{localized("Enviar anuncio a Meta","Send ad to Meta")}</h2>
      <p>{localized("Meta cobrará directamente en tu cuenta publicitaria si comienza la entrega.",
       "Meta bills your ad account directly if delivery begins.")}</p></div>
     <button className={styles.conceptClose} type="button" onClick={()=>setConfirmSendOpen(false)}
      aria-label={localized("Cerrar","Close")}><X size={19}/></button>
    </div>
    <div className={styles.budgetSimple}>
     <div><small>{localized("Presupuesto máximo de Meta","Maximum Meta ad budget")}</small>
      <strong>{money(total)}</strong></div>
     <span>{form.durationDays} {localized("días","days")}</span>
    </div>
    <label className={styles.permission}>
     <input type="checkbox" checked={spendConsent} onChange={e=>setSpendConsent(e.target.checked)}/>
     <span>{localized("Autorizo el envío y el gasto publicitario hasta este presupuesto. Meta revisa el anuncio y gestiona el cobro.",
      "I authorize submission and ad spend up to this budget. Meta reviews the ad and handles billing.")}</span>
    </label>
    <div className={styles.finalActions}>
     <button type="button" className={styles.primary} disabled={!spendConsent||!!busy}
      onClick={sendAd}><Send size={17}/>{localized("Confirmar envío","Confirm send")}</button>
     <button type="button" className={styles.secondary} onClick={()=>setConfirmSendOpen(false)}>
      {localized("Volver","Go back")}</button>
    </div>
   </div>
  </div>:null}
  {conceptDialogOpen?<div className={styles.conceptOverlay} onMouseDown={e=>{if(e.target===e.currentTarget)setConceptDialogOpen(false);}}>
   <div ref={conceptDialogRef} className={styles.conceptModal} role="dialog" aria-modal="true" aria-labelledby="vmv-ad-angle-title" aria-describedby="vmv-ad-angle-subtitle">
    <div className={styles.conceptHeading}>
     <div><span><WandSparkles size={16}/>{localized("CREACIÓN CON IA","CREATE WITH AI")}</span>
      <h2 id="vmv-ad-angle-title">{localized("¿Qué quieres destacar?","What do you want to highlight?")}</h2>
      <p id="vmv-ad-angle-subtitle">{localized("Elige una opción y generaremos tu anuncio.","Choose one option to generate your ad.")}</p></div>
     <button type="button" className={styles.conceptClose} onClick={()=>setConceptDialogOpen(false)} aria-label={localized("Cerrar","Close")}><X size={20}/></button>
    </div>
    <div className={styles.conceptOptions}>
     {adAngles.map(item=><button key={item.id} type="button" data-concept className={styles.conceptOption} onClick={()=>generate(item.id)}>
      <span className={styles.conceptIcon}><item.Icon size={21}/></span>
      <span className={styles.conceptText}><strong>{en?item.titleEn:item.titleEs}</strong><small>{en?item.helpEn:item.helpEs}</small></span>
      <ChevronRight size={18} className={styles.conceptArrow}/>
     </button>)}
    </div>
   </div>
  </div>:null}
  {agentBrief&&step!==4?<div className={styles.agentReviewReturn}>
    <button type="button" className={styles.secondary} onClick={()=>goStep(4)}>
     <ChevronRight size={16}/>{localized("Volver a revisión","Back to review")}</button>
   </div>:null}
  <div className={styles.wizardFooter}>
   {step>0&&!registerHeaderBack?<button type="button" className={styles.secondary} disabled={!!busy} onClick={()=>goStep(step-1)}><ChevronLeft size={17}/>{localized("Atrás","Back")}</button>:<span/>}
   {step<4?<button type="button" className={styles.primary} disabled={!!busy||!canContinue[step]} aria-busy={busy==="image"} onClick={()=>goStep(step+1)}>
    {step===3&&busy==="image"?<><LoaderCircle size={17} className={styles.spinIcon} aria-hidden="true"/>{localized("Cargando imagen…","Uploading image…")}</>:
     <>{localized("Continuar","Continue")}<ChevronRight size={17}/></>}
   </button>:null}
  </div>
  <p className={styles.foot}>{localized("El presupuesto se cobra en Meta, nunca en este formulario. VMV no crea anuncios activos sin una aprobación adicional.",
   "Ad budgets are billed by Meta, never in this form. VMV does not activate ads without separate approval.")}</p>
 </div>;
}
