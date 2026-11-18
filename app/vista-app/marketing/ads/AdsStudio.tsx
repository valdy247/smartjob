"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./AdsStudio.module.css";
import {Megaphone,ShieldCheck,ArrowUpRight,CheckCircle2,Globe2,ChevronDown,ImagePlus,MapPin,WandSparkles,BarChart3} from "lucide-react";

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
const initial={name:"",business:"",offer:"",audience:"",benefit:"",cityQuery:"",cityKey:"",cityName:"",citySearch:"",radiusMiles:"15",utmEnabled:true,headline:"",message:"",destination:"",pageId:"",
 dailyBudget:"10",durationDays:"7",placements:"facebook_instagram" as "facebook"|"facebook_instagram",
 specialCategoriesAcknowledged:false};
const adsWordmark="VMV ADS";
const platforms=[
 {name:"Meta Ads",description:"Facebook e Instagram",available:true},
 {name:"Google Ads",description:"Búsqueda, YouTube y Display",available:false},
 {name:"TikTok Ads",description:"Videos y anuncios TikTok",available:false},
 {name:"Pinterest Ads",description:"Pins promocionados",available:false},
 {name:"LinkedIn Ads",description:"Anuncios profesionales",available:false},
 {name:"Snapchat Ads",description:"Anuncios Snapchat",available:false}
];
export default function AdsStudio(){
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
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [image,setImage]=useState<File|null>(null);
 const [imageHash,setImageHash]=useState("");
 const [draftKey,setDraftKey]=useState(()=>crypto.randomUUID());
 const [draftId,setDraftId]=useState("");
 const [insights,setInsights]=useState<Record<string,any[]>>({});
 const [publishReady,setPublishReady]=useState(false);
 const total=useMemo(()=>Math.round(Number(form.dailyBudget)*100)*Number(form.durationDays),[form.dailyBudget,form.durationDays]);
 const trackedDestination=useMemo(()=>{
  try{
   const url=new URL(form.destination);
   if(!form.utmEnabled||url.protocol!=="https:")return form.destination;
   url.searchParams.set("utm_source","meta");
   url.searchParams.set("utm_medium","paid_social");
   const slug=(form.name||form.business||"vmv_campaign").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").slice(0,50);
   url.searchParams.set("utm_campaign",slug||"vmv_campaign");
   return url.toString();
  }catch{return form.destination;}
 },[form.destination,form.utmEnabled,form.name,form.business]);
 useEffect(()=>{
  if(!image){setPreviewImage("");return;}
  const url=URL.createObjectURL(image);setPreviewImage(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const patch=(name:keyof typeof initial,value:string|boolean)=>{
  setForm(v=>({...v,[name]:value}));setDraftId("");setDraftKey(crypto.randomUUID());setError("");
  if(["business","offer","audience","benefit","cityQuery"].includes(name))setPlan(null);
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
  catch(e){setError(e instanceof Error?e.message:"operation_failed");}
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
 const upload=()=>run("image",async()=>{
  if(!image)throw Error("select_image");
  const f=new FormData();f.set("image",image);
  const result=await api("/api/marketing/ads/meta/image","POST",f,true);
  setImageHash(result.imageHash);
  setNotice(localized("Imagen enviada de forma segura a Meta.","Image uploaded securely to Meta."));
 });
 const searchPlaces=()=>run("locations",async()=>{
  const term=form.cityQuery.trim();
  if(term.length<3)throw Error("Escribe al menos 3 letras de tu ciudad.");
  const result=await api("/api/marketing/ads/meta/locations?q="+encodeURIComponent(term));
  setPlaces(result.places||[]);
  if(!result.places?.length)throw Error("Meta no encontró ciudades. Prueba otro nombre.");
 });
 const choosePlace=(place:Place)=>{
  setForm(v=>({...v,cityKey:place.key,cityName:place.name+
   (place.region?", "+place.region:""),citySearch:v.cityQuery}));
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
  setNotice(response.source==="ai"?
   localized("Tres propuestas creadas con IA. Elige la que mejor represente tu negocio.",
    "Three AI-generated concepts. Choose the best fit for your business."):
   localized("Preparé tres borradores basados en tus datos. No son IA: falta configurar el proveedor para las propuestas avanzadas.",
    "Three editable rule-based drafts are ready. These are not AI: the provider must be configured."));
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
    cityKey:form.cityKey,cityName:form.cityName.split(",")[0],citySearch:form.citySearch,radiusMiles:Number(form.radiusMiles),
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
  form.specialCategoriesAcknowledged&&/^https:\/\//.test(form.destination)&&
  Number.isInteger(total)&&total>=500&&total<=750000);
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
  <section className={styles.simpleCard}>
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
  </section>
  <section className={styles.simpleCard}>
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
    <div className={styles.locationRow}>
     <label>{localized("Ciudad donde quieres anunciar","Target city")}
      <input maxLength={80} value={form.cityQuery} onChange={e=>{
       patch("cityQuery",e.target.value);setForm(v=>({...v,cityKey:"",cityName:"",citySearch:""}));setPlaces([]);
      }} placeholder={localized("Ej. Columbus, Georgia","E.g. Columbus, Georgia")}/></label>
     <button type="button" className={styles.secondary} disabled={!hasAccount||!!busy||form.cityQuery.trim().length<3} onClick={searchPlaces}>{busy==="locations"?localized("Buscando…","Searching…"):localized("Buscar en Meta","Find in Meta")}</button>
    </div>
    {places.length?<div className={styles.locationResults} role="group" aria-label={localized("Resultados de ciudades","City results")}>
     {places.map(p=><button key={p.key} type="button" onClick={()=>choosePlace(p)}><MapPin size={15}/> {p.name}{p.region?", "+p.region:""}</button>)}</div>:null}
    {form.cityKey?<div className={styles.placePicked}><CheckCircle2 size={15}/>{form.cityName} · {localized("Radio","Radius")}
     <select aria-label={localized("Radio de alcance en millas","Target radius in miles")} value={form.radiusMiles} onChange={e=>patch("radiusMiles",e.target.value)}>
      {[10,15,25,50].map(n=><option key={n} value={n}>{n} mi</option>)}
     </select></div>:null}
   </div>
  </section>
  <section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><WandSparkles size={19}/></span><div>
    <h2>{localized("Propuesta publicitaria","Ad proposal")}</h2>
    <small>{localized("Tres enfoques para comparar, editar y aprobar.","Three concepts to compare, edit and approve.")}</small></div></div></div>
   <button className={styles.primary} type="button" disabled={!!busy||!hasAccount||!form.cityKey||form.business.trim().length<2||form.offer.trim().length<8||form.audience.trim().length<3} onClick={generate}>
    <WandSparkles size={17}/>{busy==="generate"?localized("Preparando…","Preparing…"):localized("Preparar 3 propuestas","Prepare 3 concepts")}
   </button>
   {!plan?<p className={styles.muted}>{localized("Los títulos y mensajes serán editables. Si la IA no está conectada, te lo indicaremos y usaremos borradores basados en tus datos.","Headlines and messages are editable. If AI is not connected, we'll say so and use rule-based drafts.")}</p>:
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
    <label>{localized("Página web del anuncio (HTTPS)","Ad destination (HTTPS)")}
     <input type="url" inputMode="url" value={form.destination} onChange={e=>patch("destination",e.target.value)} placeholder="https://tusitio.com"/></label>
   </div>
   <div className={styles.preview}>
    <div className={styles.previewHeader}><span className={styles.previewBrand}>{form.business.trim().slice(0,1).toUpperCase()||"V"}</span><div>
     <strong>{form.business||localized("Tu negocio","Your business")}</strong><small>{localized("Vista previa · anuncio","Preview · ad")}</small></div></div>
    <p>{form.message||localized("Aquí aparecerá tu anuncio.","Your ad will appear here.")}</p>
    {previewImage?<img src={previewImage} alt={localized("Vista previa de imagen seleccionada","Selected image preview")}/>:
     <div className={styles.previewEmpty}><ImagePlus size={24}/>{localized("Selecciona una imagen para ver el anuncio","Select an image to preview your ad")}</div>}
    <div className={styles.previewBottom}><div><strong>{form.headline||localized("Título del anuncio","Ad headline")}</strong>
     <small>{(()=>{try{return new URL(form.destination).hostname;}catch{return localized("Tu sitio web","Your website");}})()}</small></div>
     <span>{localized("Más información","Learn more")}</span></div>
   </div>
   <div className={styles.uploadRow}>
    <label>{localized("Imagen del anuncio · JPG/PNG hasta 2 MB","Ad image · JPG/PNG up to 2 MB")}
     <input type="file" accept="image/jpeg,image/png" onChange={e=>{setImage(e.target.files?.[0]||null);
      setImageHash("");setDraftId("");setDraftKey(crypto.randomUUID());}}/></label>
    <button type="button" className={styles.secondary} disabled={!!busy||!image} onClick={upload}>{busy==="image"?localized("Subiendo…","Uploading…"):localized("Preparar imagen en Meta","Prepare image in Meta")}</button>
    {imageHash?<span className={styles.connected}><CheckCircle2 size={15}/>{localized("Lista","Ready")}</span>:null}
   </div>
  </section>
  <section className={styles.simpleCard}>
   <div className={styles.cardTop}><div className={styles.cardTitle}><span className={styles.cardIcon}><BarChart3 size={19}/></span><div>
    <h2>{localized("Presupuesto y entrega","Budget and delivery")}</h2><small>{localized("El gasto publicitario se paga directamente a Meta.","Ad spend is billed directly by Meta.")}</small></div></div></div>
   <div className={styles.switchRow}><div><strong>{localized("Publicar también en Instagram","Include Instagram")}</strong>
    <small>{selectedPage?.instagramId?localized("Con la cuenta de Instagram vinculada","With your linked Instagram account"):
     localized("Necesita una página con Instagram profesional vinculado","Requires a Page with linked professional Instagram")}</small></div>
    <label className={styles.toggle}><input type="checkbox" checked={instagramEnabled&&Boolean(selectedPage?.instagramId)} disabled={!selectedPage?.instagramId}
     onChange={e=>setInstagramEnabled(e.target.checked)}/><span/></label></div>
   <div className={styles.switchRow}><div><strong>{localized("Medir visitas con UTM","Track visits with UTM")}</strong>
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
    <summary>{localized("Página y configuración avanzada","Page and advanced settings")} <ChevronDown size={15}/></summary>
    <div className={styles.formStack}>
     <label>{localized("Página de Facebook autorizada","Authorized Facebook Page")}
      <select value={form.pageId} onChange={e=>patch("pageId",e.target.value)}>
       <option value="">{localized("Seleccionar página","Choose a Page")}</option>
       {meta.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
     {form.utmEnabled&&form.destination?<small className={styles.trackedLink}>{localized("Enlace con UTM: ","Tracked link: ")}{trackedDestination}</small>:null}
    </div>
   </details>
   {!form.pageId&&meta.pages.length>0?<div className={styles.accountSelect}>
    <label>{localized("Selecciona una página de Facebook para continuar","Select a Facebook Page to continue")}
     <select value={form.pageId} onChange={e=>patch("pageId",e.target.value)}>
      <option value="">{localized("Elegir página","Choose Page")}</option>
      {meta.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select></label></div>:null}
   <label className={styles.permission}><input type="checkbox" checked={form.specialCategoriesAcknowledged}
    onChange={e=>patch("specialCategoriesAcknowledged",e.target.checked)}/>
    <span>{localized("Confirmo que no anuncio vivienda, empleo, crédito ni otra categoría especial. Los datos de mi oferta son verdaderos y tengo derechos sobre las imágenes.",
     "I confirm this is not housing, employment, credit or another special category. My claims are accurate and I own the image rights.")}</span></label>
   <button type="button" className={styles.primary} disabled={!canSave||!!busy} onClick={saveDraft}>{localized("Guardar campaña para aprobación","Save campaign for approval")}</button>
   <p className={styles.muted}>{localized("Guardar no publica anuncios. Después podrás crear la campaña pausada para revisar en Meta.",
    "Saving does not publish ads. You can then create a paused campaign for review in Meta.")}</p>
  </section>
  <details className={styles.simpleDetails}>
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
  <details className={styles.simpleDetails}>
   <summary><span><Globe2 size={18}/>{localized("Otras plataformas","Other platforms")}</span><ChevronDown size={17}/></summary>
   <div className={styles.platformGrid}>{platforms.filter(p=>!p.available).map(p=><div className={styles.platform} key={p.name}>
    <strong>{p.name}</strong><small>{p.description}</small><span className={styles.planned}>{localized("Próximamente","Coming soon")}</span>
   </div>)}</div>
  </details>
  <p className={styles.foot}>{localized("El presupuesto se cobra en Meta, nunca en este formulario. VMV no crea anuncios activos sin una aprobación adicional.",
   "Ad budgets are billed by Meta, never in this form. VMV does not activate ads without separate approval.")}</p>
 </div>;
}
