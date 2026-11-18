"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./AdsStudio.module.css";
import {Megaphone,ShieldCheck,ArrowUpRight,CheckCircle2,Globe2,ExternalLink,ChevronDown,ChevronLeft,ChevronRight,ImagePlus,MapPin,WandSparkles,BarChart3} from "lucide-react";

type Account={id:string;name:string;currency:string;status:number;timezone:string};
type Page={id:string;name:string;instagramId:string|null;instagramUsername:string};
type Connected={id:string;providerName:string;expiresAt:string|null;selectedAccountId:string|null;selectedAccountName:string|null};
type Campaign={id:string;ad_account_id:string;status:string;draft:{
 name:string;headline:string;message:string;destination:string;totalBudgetCents:number;
 durationDays:number;placements:string};provider_campaign_id:string|null;provider_ad_id:string|null;
 error_code:string|null;created_at:string};
type AdVariant={label:string;headline:string;message:string;why:string};
type Plan={variants:AdVariant[];source:"ai"|"brief";recommendation:string;measurement:string;providerConfigured:boolean};
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
export default function AdsStudio({mode="wizard"}:{mode?:"wizard"|"campaigns"|"platforms"}){
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
 const [plan,setPlan]=useState<Plan|null>(null);
 const [planIndex,setPlanIndex]=useState(0);
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
 const [insights,setInsights]=useState<Record<string,any[]>>({});
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
  if(!image){setPreviewImage("");return;}
  const url=URL.createObjectURL(image);setPreviewImage(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const patch=(name:keyof typeof initial,value:string|boolean)=>{
  setForm(v=>({...v,[name]:value}));setDraftId("");setDraftKey(crypto.randomUUID());setError("");
  if(["business","offer","audience","benefit","cityQuery","stateCode"].includes(name))setPlan(null);
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
   const accounts=(await api("/api/marketing/ads/meta/accounts")) as AccountsResponse;
   setMeta(accounts);setSelectedAccount(accounts.connection?.selectedAccountId||"");
   const list=await api("/api/marketing/ads/meta/campaigns");
   setCampaigns(list.campaigns||[]);
   setPublishReady(list.publishReady===true);
   if(accounts.error)setError(accounts.error);
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  const status=new URLSearchParams(window.location.search).get("meta");
  if(status)setMetaReturn(status);
  void reload();
 },[reload]);
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
   setError(display);
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
   setImageHash("");setDraftId("");
   await reload();setNotice(localized("Meta desconectado.","Meta disconnected."));
  });
 };
 const upload=(file:File|null)=>{
  const seq=++uploadSeq.current;
  setImage(file);setImageHash("");setDraftId("");setDraftKey(crypto.randomUUID());
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
  setPlaces([]);setDraftId("");setDraftKey(crypto.randomUUID());setPlan(null);
 };
 const generate=()=>run("generate",async()=>{
  if(!form.cityKey)throw Error("Selecciona primero una ciudad de Meta.");
  const response=await api("/api/marketing/ads/generate","POST",{
   business:form.business,offer:form.offer,audience:form.audience,
   benefit:form.benefit,city:form.cityName,locale:language,goal:"website"
  }) as Plan;
  if(!Array.isArray(response.variants)||response.variants.length!==3)throw Error("invalid_campaign_brief");
  setPlan(response);setPlanIndex(0);
  setForm(v=>({...v,headline:response.variants[0].headline,message:response.variants[0].message}));
  setDraftId("");setDraftKey(crypto.randomUUID());
  setNotice(localized("Propuesta creada con IA. Revisa y edita antes de aprobar.","AI proposal created. Review and edit before approving."));
 });
 const chooseVariant=(index:number)=>{
  if(!plan?.variants[index])return;
  const variant=plan.variants[index];
  setPlanIndex(index);setForm(v=>({...v,headline:variant.headline,message:variant.message}));
  setDraftId("");setDraftKey(crypto.randomUUID());
 };
 const saveDraft=()=>run("draft",async()=>{
  const daily=Math.round(Number(form.dailyBudget)*100),days=Number(form.durationDays);
  if(!Number.isInteger(daily)||daily<500||daily>25000||!Number.isInteger(days)||days<1||days>30)
   throw Error("budget_must_be_5_to_250_usd_per_day_and_1_to_30_days");
  if(!form.cityKey)throw Error("select_verified_city_first");
  if(!imageHash)throw Error("upload_image_first");
  const result=await api("/api/marketing/ads/meta/campaigns","POST",{
   operation:"draft",clientKey:draftKey,draft:{
    name:form.name,headline:form.headline,message:form.message,destination:trackedDestination,
    cityKey:form.cityKey,cityName:form.cityMetaName,citySearch:form.citySearch,radiusMiles:Number(form.radiusMiles),
    imageHash,pageId:form.pageId,placements:instagramEnabled&&selectedPage?.instagramId?"facebook_instagram":"facebook",
    dailyBudgetCents:daily,durationDays:days,
    specialCategoriesAcknowledged:form.specialCategoriesAcknowledged
   }
  });
  setDraftId(result.campaign.id);
  setNotice(localized("Borrador guardado. Revisa el presupuesto antes de crear objetos pausados.","Draft saved. Review the budget before creating paused objects."));
  await reload();
 });
 const createPaused=(campaignId:string,budget:number)=>{
  if(!window.confirm(localized(
   "Confirmo el diseño y un presupuesto máximo de "+money(budget)+". Crear campaña, conjunto y anuncio PAUSADOS en Meta (sin publicar ni gastar).",
   "I approve the creative and maximum budget of "+money(budget)+". Create PAUSED campaign, ad set and ad in Meta (no publishing or spend).")))return;
  void run("paused:"+campaignId,async()=>{
   const response=await api("/api/marketing/ads/meta/campaigns","POST",{
    operation:"create_paused",campaignId,confirmPaused:true,approvedTotalCents:budget
   });
   setNotice(localized("Anuncio creado y pausado en Meta. No se ha gastado presupuesto.","Ad created in Meta in paused state. No ad spend was triggered."));
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
 const metrics=(c:Campaign)=>run("metrics:"+c.id,async()=>{
  const r=await api("/api/marketing/ads/meta/insights?campaignId="+encodeURIComponent(c.id));
  setInsights(prev=>({...prev,[c.id]:r.rows||[]}));
 });
 const selectedPage=meta.pages.find(x=>x.id===form.pageId);
 const hasAccount=Boolean(meta.connected&&meta.connection?.selectedAccountId);
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

 if(mode==="campaigns")return <div className={styles.workspace}>
  <div className={styles.compactIntro}><div><span className={styles.eyebrow}>{localized("MARKETING · HISTORIAL","MARKETING · HISTORY")}</span>
   <h1>{localized("Mis campañas","My campaigns")}</h1>
   <p>{localized("Gestiona borradores, anuncios pausados y métricas fuera del asistente.","Manage drafts, paused ads and metrics outside the wizard.")}</p></div></div>
  {error?<p className={styles.warning} role="alert">{error}</p>:null}
  {notice?<p className={styles.success} role="status">{notice}</p>:null}
    <details open className={styles.simpleDetails}>
   <summary><span><BarChart3 size={18}/>{localized("Mis campañas","My campaigns")}</span><span className={styles.count}>{campaigns.length}</span><ChevronDown size={17}/></summary>
   {campaigns.length===0?<p className={styles.muted}>{localized("Todavía no hay campañas guardadas.","No saved campaigns yet.")}</p>:
    <div className={styles.history}>{campaigns.map(c=><div key={c.id} className={styles.historyCard}>
     <div className={styles.historyHead}><div><strong>{c.draft.name}</strong><small>{new Date(c.created_at).toLocaleDateString()}</small></div>
      <span className={c.status==="active"?styles.live:styles.pilot}>{c.status}</span></div>
     <p>{c.draft.headline} · {money(c.draft.totalBudgetCents)}</p>
     <div className={styles.inlineActions}>
      {c.status==="draft"?<button className={styles.primary} type="button" disabled={!!busy} onClick={()=>createPaused(c.id,c.draft.totalBudgetCents)}>{localized("Aprobar y crear PAUSADA","Approve and create PAUSED")}</button>:null}
      {c.status==="paused"&&publishReady?<button className={styles.primary} type="button" disabled={!!busy} onClick={()=>publish(c)}>{localized("Autorizar publicación y gasto","Authorize publication and spend")}</button>:null}
      {["active","activation_pending","paused"].includes(c.status)?<button className={styles.secondary} type="button" disabled={!!busy} onClick={()=>pause(c)}>{localized("Pausar","Pause")}</button>:null}
      {c.provider_campaign_id?<button className={styles.secondary} type="button" disabled={!!busy} onClick={()=>void metrics(c)}>{localized("Ver métricas","View metrics")}</button>:null}
     </div>
     {c.error_code?<p className={styles.warning}>{c.error_code}</p>:null}
     {insights[c.id]?.map((row,i)=><p key={i}>{localized("Gasto","Spend")}: {row.spend||"0"} · {localized("Clics","Clicks")}: {row.clicks||"0"}</p>)}
    </div>)}</div>}
  </details>

 </div>;
 if(mode==="platforms")return <div className={styles.workspace}>
  <div className={styles.compactIntro}><div><span className={styles.eyebrow}>{localized("MARKETING · CANALES","MARKETING · CHANNELS")}</span>
   <h1>{localized("Plataformas publicitarias","Ad platforms")}</h1>
   <p>{localized("Integraciones disponibles y próximas conexiones.","Available integrations and upcoming connections.")}</p></div></div>
  <div className={styles.simpleCard}><strong>{localized("Meta Ads · Piloto","Meta Ads · Pilot")}</strong>
   <p className={styles.muted}>{localized("Facebook e Instagram. Anuncios con revisión y aprobación humana.","Facebook and Instagram. Ads with human review and approval.")}</p>
   <a className={styles.primary} href="/vista-app/marketing/ads">{localized("Crear campaña","Create campaign")}</a></div>
    <details open className={styles.simpleDetails}>
   <summary><span><Globe2 size={18}/>{localized("Otras plataformas","Other platforms")}</span><ChevronDown size={17}/></summary>
   <div className={styles.platformGrid}>{platforms.filter(p=>!p.available).map(p=><div className={styles.platform} key={p.name}>
    <strong>{p.name}</strong><small>{p.description}</small><span className={styles.planned}>{localized("Próximamente","Coming soon")}</span>
   </div>)}</div>
  </details>

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
  {error?<p className={styles.warning} role="alert">{error}</p>:null}
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
   <button className={styles.primary} type="button" disabled={!!busy||!hasAccount||!form.cityKey||form.business.trim().length<2||form.offer.trim().length<8||form.audience.trim().length<3} onClick={generate}>
    <WandSparkles size={17}/>{busy==="generate"?localized("Preparando…","Preparing…"):localized("Preparar propuesta de anuncio","Prepare ad proposal")}
   </button>
   {!plan?<p className={styles.muted}>{localized("La IA preparará una propuesta con diferentes enfoques. Puedes elegir y editar el anuncio antes de aprobarlo.","AI will prepare a proposal with different approaches. You can choose and edit the ad before approval.")}</p>:
    <div className={styles.proposal}>
     <div className={styles.planSource}>
      <span className={plan.source==="ai"?styles.connected:styles.pilot}>{plan.source==="ai"?localized("Generado con IA","AI-generated"):localized("Borrador sin IA","Non-AI draft")}</span>
      <small>{plan.source==="ai"?localized("Revisa todos los datos antes de publicar.","Verify all statements before publishing."):
       localized("La IA necesita configurar un proveedor. Estas opciones usan solo tus datos.","AI needs a configured provider. These concepts only use your inputs.")}</small>
     </div>
     <div className={styles.variantTabs} role="group" aria-label={localized("Elegir enfoque del anuncio","Choose an ad concept")}>
      {plan.variants.map((v,i)=><button type="button" key={i} aria-pressed={planIndex===i} className={planIndex===i?styles.variantActive:styles.variant} onClick={()=>chooseVariant(i)}>
       {v.label}</button>)}
     </div>
     <p className={styles.planReason}>{plan.variants[planIndex]?.why}</p>
     <div className={styles.planAnalysis}><strong>{localized("Estrategia","Strategy")}</strong><p>{plan.recommendation}</p>
      <strong>{localized("Qué medir","What to measure")}</strong><p>{plan.measurement}</p></div>
    </div>}
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
   <div className={styles.uploadRow}>
    <label className={styles.imagePicker}>{localized("Imagen del anuncio · JPG/PNG hasta 2 MB","Ad image · JPG/PNG up to 2 MB")}
     <input className={styles.visuallyHiddenFile} type="file" accept="image/jpeg,image/png"
      disabled={busy==="image"} onChange={e=>upload(e.target.files?.[0]||null)}/>
     <span className={styles.imagePickerButton}><ImagePlus size={16}/>{image?image.name.slice(0,30):localized("Elegir imagen","Choose image")}</span>
    </label>
    {busy==="image"?<span className={styles.uploadStatus}>{localized("Preparando imagen automáticamente…","Preparing image automatically…")}</span>:
     imageHash?<span className={styles.connected}><CheckCircle2 size={15}/>{localized("Imagen lista","Image ready")}</span>:
      image?<button type="button" className={styles.secondary} disabled={!!busy} onClick={()=>upload(image)}>{localized("Reintentar imagen","Retry image")}</button>:null}
   </div>
  </section>:null}
  {step===4?<section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><BarChart3 size={19}/></span><div>
    <h2>{localized("Presupuesto y entrega","Budget and delivery")}</h2><small>{localized("El gasto publicitario se paga directamente a Meta.","Ad spend is billed directly by Meta.")}</small></div></div></div>
   <div className={styles.switchRow}><div><strong>{localized("Publicar también en Instagram","Include Instagram")}</strong>
    <small>{selectedPage?.instagramId?localized("Con la cuenta de Instagram vinculada","With your linked Instagram account"):
     localized("Vincula Instagram profesional a esta página desde Meta y vuelve a comprobar.","Link a professional Instagram account to this Page in Meta and check again.")}</small></div>
    <label className={styles.toggle}><input type="checkbox" checked={instagramEnabled&&Boolean(selectedPage?.instagramId)} disabled={!selectedPage?.instagramId}
     onChange={e=>setInstagramEnabled(e.target.checked)}/><span/></label></div>
   {!selectedPage?.instagramId?<button type="button" className={styles.textButton} disabled={!!busy} onClick={()=>void reload()}>
    {localized("Instagram vinculado · Comprobar otra vez","Instagram linked · Check again")}
   </button>:<small className={styles.muted}>{selectedPage.instagramUsername?"@"+selectedPage.instagramUsername:localized("Instagram vinculado","Instagram linked")}</small>}
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
   <button type="button" className={styles.primary} disabled={!canSave||!!busy} onClick={saveDraft}>{localized("Guardar campaña para aprobación","Save campaign for approval")}</button>
   <p className={styles.muted}>{localized("Guardar no publica anuncios. Después podrás crear la campaña pausada para revisar en Meta.",
    "Saving does not publish ads. You can then create a paused campaign for review in Meta.")}</p>
  </section>:null}
  <div className={styles.wizardFooter}>
   {step>0?<button type="button" className={styles.secondary} disabled={!!busy} onClick={()=>goStep(step-1)}><ChevronLeft size={17}/>{localized("Atrás","Back")}</button>:<span/>}
   {step<4?<button type="button" className={styles.primary} disabled={!!busy||!canContinue[step]} onClick={()=>goStep(step+1)}>{localized("Continuar","Continue")}<ChevronRight size={17}/></button>:null}
  </div>
  <p className={styles.foot}>{localized("El presupuesto se cobra en Meta, nunca en este formulario. VMV no crea anuncios activos sin una aprobación adicional.",
   "Ad budgets are billed by Meta, never in this form. VMV does not activate ads without separate approval.")}</p>
 </div>;
}
