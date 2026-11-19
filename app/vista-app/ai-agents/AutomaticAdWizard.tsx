"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,Globe2,Image as ImageIcon,LoaderCircle,Megaphone,Package,ShieldCheck,Sparkles,RefreshCw} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import {saveAgentAdBrief,type AgentAdBrief} from "@/lib/vmv-ai-agents/ad-handoff";
import styles from "./AutomaticAdWizard.module.css";

type Product={id:string;name:string;description:string;price_cents:number;currency:string;stock_mode:string;image_path:string|null;type:"product"|"service"};
type MetaAccount={id:string;name:string;currency:string;status:number};
type MetaPage={id:string;name:string};
type MetaProfile={configured:boolean;connected:boolean;connection?:{selectedAccountId:string|null};accounts:MetaAccount[];pages:MetaPage[]};
type Place={key:string;name:string;region:string;countryCode:string};
type Goal="visits"|"messages"|"sales";
type Answer={businessName:string;website:string;offer:string;productIds:string[];
 audience:string;city:string;region:string;goals:Goal[];
 imageChoice:"business"|"product"|"upload";imageProductId:string;notes:string};
type Step="business"|"website"|"product"|"goal"|"audience"|"account"|"location"|"image"|"copy"|"review";
const steps:Step[]=["business","website","product","goal","audience","account","location","image","copy","review"];
const validSite=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&
 !u.username&&!u.password&&!u.port&&u.hostname.includes(".")&&!u.hostname.endsWith(".local")&&
 !["localhost","127.0.0.1"].includes(u.hostname);}catch{return false;}};
export default function AutomaticAdWizard({business,workspaceId,agent,onClose}:{
 business:CentralBusiness;workspaceId:string;agent:PersistedAgent;onClose:()=>void;
}){
 const [owner,setOwner]=useState("");
 const [step,setStep]=useState<Step>("business");
 const [products,setProducts]=useState<Product[]>([]);
 const [meta,setMeta]=useState<MetaProfile>({configured:false,connected:false,accounts:[],pages:[]});
 const [accountId,setAccountId]=useState("");
 const [pageId,setPageId]=useState("");
 const [places,setPlaces]=useState<Place[]>([]);
 const [cityKey,setCityKey]=useState("");
 const [cityMetaName,setCityMetaName]=useState("");
 const [image,setImage]=useState<File|null>(null);
 const [imageHash,setImageHash]=useState("");
 const [imagePreview,setImagePreview]=useState("");
 const [headline,setHeadline]=useState("");
 const [message,setMessage]=useState("");
 const [pending,setPending]=useState("");
 const [adReady,setAdReady]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [editBusiness,setEditBusiness]=useState(false);
 const [siteChoice,setSiteChoice]=useState<"saved"|"custom"|"none">(validSite(business.website_url||"")?"saved":"custom");
 const [customWebsite,setCustomWebsite]=useState("");
 const [editCity,setEditCity]=useState(false);
 const [answer,setAnswer]=useState<Answer>({
  businessName:business.name,website:validSite(business.website_url||"")?business.website_url||"":"",
  offer:"",productIds:[],audience:"Personas interesadas en los productos o servicios del negocio",
  city:business.city||"",region:business.region||"",goals:["visits"],
  imageChoice:"upload",imageProductId:"",notes:""
 });
 const update=<K extends keyof Answer>(k:K,v:Answer[K])=>setAnswer(x=>({...x,[k]:v}));
 useEffect(()=>{let live=true;
  const run=async()=>{
   const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous||user.id!==business.owner_id||
    user.id!==agent.owner_id||agent.business_id!==workspaceId)
    throw Error("Selecciona un agente y un negocio de tu propia cuenta.");
   if(!live)return;
   setOwner(user.id);
   const [catalog,services]=await Promise.all([
    db.from("vmv_ai_catalog_items")
     .select("id,name,description,price_cents,currency,stock_mode,image_path")
     .eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("approved",true).eq("active",true).order("updated_at",{ascending:false}).limit(50),
    db.from("vmv_ai_booking_services").select("id,name,description,price_cents,currency")
     .eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("approved",true).eq("active",true).limit(50)
   ]);
   if(catalog.error||services.error)throw Error("No se pudo consultar el inventario y los servicios.");
   if(live)setProducts([
    ...(catalog.data||[]).map(x=>({...x,type:"product" as const})),
    ...(services.data||[]).map(x=>({...x,stock_mode:"manual",image_path:null,type:"service" as const}))
   ]);
  };
  void run().catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudo cargar tu negocio.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[business.id,workspaceId,agent.id,agent.owner_id,agent.business_id]);
 const savedWebsite=validSite(business.website_url||"")?business.website_url||"":"";
 const hasSite=Boolean(savedWebsite);
 const index=steps.indexOf(step);
 const selectedProducts=products.filter(x=>answer.productIds.includes(x.id));
 const product=selectedProducts.length===1?selectedProducts[0]:null;
 const verifiedPage=meta.pages.find(p=>p.id===pageId)||null;
 const selectedAccount=meta.accounts.find(a=>a.id===accountId);
 const locationVerified=Boolean(cityKey&&cityMetaName);
 const canContinue=step==="business"?answer.businessName.trim().length>=2:
  step==="website"?siteChoice==="none"||siteChoice==="saved"&&hasSite||siteChoice==="custom"&&validSite(customWebsite):
  step==="product"?answer.offer.trim().length>=3:
  step==="goal"?answer.goals.length>0:
  step==="audience"?answer.audience.trim().length>=3:
  step==="account"?Boolean(meta.connected&&selectedAccount?.status===1&&selectedAccount.currency==="USD"&&verifiedPage):
  step==="location"?locationVerified:
  step==="image"?Boolean(imageHash):
  step==="copy"?headline.trim().length>=5&&message.trim().length>=25:true;
 const next=()=>{
  if(!canContinue)return;
  if(step==="website")setAnswer(x=>({...x,website:siteChoice==="saved"?savedWebsite:siteChoice==="custom"?customWebsite.trim():""}));
  setError("");setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const back=()=>{if(index===0){onClose();return;}setError("");setStep(steps[index-1]);};
 const toggleGoal=(goal:Goal)=>setAnswer(current=>({
  ...current,goals:current.goals.includes(goal)?
   current.goals.filter(item=>item!==goal):[...current.goals,goal]
 }));
 const selectProduct=(id:string)=>{
  setAnswer(x=>{
   const ids=x.productIds.includes(id)?x.productIds.filter(v=>v!==id):[...x.productIds,id];
   const names=products.filter(p=>ids.includes(p.id)).map(p=>p.name);
   return {...x,productIds:ids,offer:names.join(", ").slice(0,220)};
  });
  setHeadline("");setMessage("");setAdReady(false);
 };
 const api=async(path:string,method:"GET"|"POST"="GET",payload?:unknown)=>{
  const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
  const response=await fetch(path,{method,cache:"no-store",headers:{
   Authorization:"Bearer "+session.access_token,...(method==="POST"?{"Content-Type":"application/json"}:{})
  },body:method==="POST"?JSON.stringify(payload):undefined});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(String(data?.error||"El servicio no respondió."));
  return data;
 };
 const fetchMeta=async()=>{
  setPending("meta");setError("");
  try{
   const data=await api("/api/marketing/ads/meta/accounts") as MetaProfile;
   setMeta(data);setAccountId(data.connection?.selectedAccountId||"");
   setPageId(old=>data.pages.some(p=>p.id===old)?old:data.pages.length===1?data.pages[0].id:"");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar Meta.");}
  finally{setPending("");}
 };
 const saveAccount=async(id:string)=>{
  setPending("account");setError("");
  try{
   await api("/api/marketing/ads/meta/accounts","POST",{accountId:id});
   setAccountId(id);
   const data=await api("/api/marketing/ads/meta/accounts") as MetaProfile;
   setMeta(data);setPageId(old=>data.pages.some(p=>p.id===old)?old:data.pages.length===1?data.pages[0].id:"");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo seleccionar la cuenta.");}
  finally{setPending("");}
 };
 const connectMeta=async()=>{
  setPending("meta");setError("");
  try{
   const response=await api("/api/marketing/ads/meta/start","POST",{});
   const url=String(response.url||"");
   if(!url.startsWith("https://www.facebook.com/"))throw Error("Enlace de Meta inválido.");
   window.open(url,"_blank","noopener,noreferrer");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo conectar Meta.");}
  finally{setPending("");}
 };
 const verifyCity=async()=>{
  if(!answer.city.trim()||!meta.connected)return;
  setPending("city");setError("");setPlaces([]);setCityKey("");setCityMetaName("");
  try{
   const data=await api("/api/marketing/ads/meta/locations?q="+encodeURIComponent(answer.city.trim()));
   const states:Record<string,string>={GA:"georgia",FL:"florida",AL:"alabama",TX:"texas",CA:"california",NY:"new york",NC:"north carolina",SC:"south carolina",TN:"tennessee"};
   const wanted=answer.region.trim().toLowerCase();
   const normalized=states[wanted.toUpperCase()]||wanted;
   const results=(Array.isArray(data.places)?data.places:[]) as Place[];
   setPlaces(results.filter(p=>p.countryCode==="US"&&
    (p.region.toLowerCase()===normalized||p.region.toLowerCase()===wanted)));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo verificar la ciudad.");}
  finally{setPending("");}
 };
 const uploadImage=async(file:File)=>{
  setImage(file);setImageHash("");setAdReady(false);setPending("image");setError("");
  if(!["image/jpeg","image/png"].includes(file.type)||file.size<1024||file.size>2*1024*1024){
   setError("Selecciona JPG o PNG de hasta 2 MB.");setPending("");return;
  }
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión.");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
   const form=new FormData();form.set("image",file);
   const response=await fetch("/api/marketing/ads/meta/image",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:form
   });
   const data=await response.json().catch(()=>null);
   if(!response.ok||typeof data?.imageHash!=="string")throw Error(String(data?.error||"Meta rechazó la imagen."));
   setImageHash(data.imageHash);
  }catch(e){setError(e instanceof Error?e.message:"La imagen no se pudo subir.");}
  finally{setPending("");}
 };
 const generateCopy=async()=>{
  setPending("copy");setError("");setAdReady(false);
  try{
   const offer=answer.offer.trim();
   if(offer.length<8)throw Error("Describe la oferta con al menos 8 caracteres.");
   const response=await api("/api/marketing/ads/generate","POST",{
    business:answer.businessName,offer,audience:answer.audience,
    city:cityMetaName,benefit:answer.notes,locale:"es",goal:"website",angle:"offer"
   });
   if(response.source!=="ai"||!response.variant?.headline||!response.variant?.message)
    throw Error("La IA no pudo generar el anuncio. Intenta nuevamente.");
   setHeadline(response.variant.headline);setMessage(response.variant.message);setAdReady(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear el texto.");}
  finally{setPending("");}
 };
 useEffect(()=>{
  if(!image){setImagePreview("");return;}
  const url=URL.createObjectURL(image);setImagePreview(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 const finish=()=>{
  if(!owner||!canContinue||!answer.businessName.trim()||!answer.offer.trim()||
   !answer.city.trim()||!answer.region.trim()||!answer.audience.trim())return;
  if(answer.website&&!validSite(answer.website)){setError("Utiliza una dirección HTTPS válida.");return;}
  const brief:AgentAdBrief={
   version:1,ownerId:owner,businessId:business.id,workspaceId,agentId:agent.id,
   createdAt:Date.now(),businessName:answer.businessName.trim(),website:answer.website.trim(),
   offer:answer.offer.trim(),city:answer.city.trim(),region:answer.region.trim(),
   audience:answer.audience.trim(),goals:answer.goals,
   goal:answer.goals[0],imageChoice:answer.imageChoice,
   imageProductId:answer.imageChoice==="product"?answer.imageProductId:undefined,
   productId:product?.id,priceCents:product?.price_cents,currency:product?.currency,
   notes:answer.notes.trim()
  };
  if(!saveAgentAdBrief(brief)){setError("No se pudo preparar el anuncio. Revisa el almacenamiento de este navegador.");return;}
  // Marketing is the consumer: no campaign, Meta action or ad spend here.
  window.location.assign("/vista-app/marketing/ads/create?from=ai-agents&business="+encodeURIComponent(business.id));
 };
 const question:Record<Step,string>={
  business:"¿Este anuncio es para tu negocio?",
  website:"¿Quieres enviar clientes a tu página web?",
  product:"¿Qué vamos a promocionar?",
  goal:"¿Qué quieres conseguir?",
  audience:"¿A quién quieres llegar?",
  location:"¿Dónde quieres anunciarte?",
  image:"¿Qué imagen usaremos?",
  review:"Tu anuncio está listo para preparar"
 };
 const chip=(label:string,selected:boolean,onClick:()=>void)=><button type="button"
  className={selected?styles.chipSelected:styles.chip} onClick={onClick}
  aria-pressed={selected}>{selected?<Check size={15}/>:null}{label}</button>;
 return <section className={styles.root} aria-label="Asistente para anuncios automáticos">
  <header className={styles.top}><button type="button" onClick={back} aria-label="Volver"><ArrowLeft size={20}/></button>
   <span>Anuncio automático</span><span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span style={{width:((index+1)/steps.length*100)+"%"}}/></div>
  <div className={styles.robot}><Bot size={37}/><Sparkles size={16} className={styles.spark}/></div>
  <h1 className={styles.question}>{question[step]}</h1>
  {loading?<div className={styles.helper}><LoaderCircle size={17}/> Cargando datos del negocio…</div>:null}
  {!loading&&!error&&step==="business"?<div className={styles.answers}>
    <strong className={styles.example}>{business.name}</strong>
    <div className={styles.options}>{chip("Sí",!editBusiness,()=>{
      setEditBusiness(false);update("businessName",business.name);
    })}
     {chip("No, es otro",editBusiness,()=>setEditBusiness(true))}</div>
    {editBusiness?<><input aria-label="Nombre del negocio para este anuncio" maxLength={100}
     value={answer.businessName} onChange={e=>update("businessName",e.target.value)}/>
     <p className={styles.helper}>Cambiarlo aquí no modifica tu negocio guardado.</p></>:null}
   </div>:null}
  {!loading&&step==="website"?<div className={styles.answers}>
    {hasSite?<div className={styles.fact}><Globe2 size={20}/><span>{savedWebsite}</span></div>:null}
    <div className={styles.options}>
     {chip("Sí, usar mi web",siteChoice==="saved",()=>{setSiteChoice(hasSite?"saved":"custom");setError("");})}
     {chip("No, otra opción",siteChoice!=="saved",()=>{setSiteChoice("custom");setError("");})}
    </div>
    {siteChoice!=="saved"?<div className={styles.optionsVertical}>
     {chip("Escribir otra web",siteChoice==="custom",()=>setSiteChoice("custom"))}
     {chip("No tengo web",siteChoice==="none",()=>setSiteChoice("none"))}
    </div>:null}
    {siteChoice==="custom"?<input type="url" inputMode="url" aria-label="Sitio web HTTPS"
     placeholder="https://tunegocio.com" value={customWebsite}
     onChange={e=>setCustomWebsite(e.target.value)} maxLength={240}/>:null}
    {siteChoice==="none"?<p className={styles.helper}>Marketing te pedirá un destino válido antes de publicar.</p>:null}
   </div>:null}
  {!loading&&step==="product"?<div className={styles.answers}>
    {products.length>0?<><p className={styles.helper}>Productos aprobados de {business.name}</p>
     <div className={styles.products}>{products.map(p=><button key={p.id} type="button"
      className={answer.productId===p.id?styles.productActive:styles.product}
      onClick={()=>selectProduct(p.id)}>
      <Package size={16}/><span>{p.name}<small>{p.currency==="usd"?"$"+(p.price_cents/100).toFixed(2):"Precio aprobado"}</small></span>
      {answer.productId===p.id?<Check size={18}/>:null}</button>)}</div></>:null}
    <label className={styles.field}>Producto, servicio u oferta
     <textarea maxLength={220} rows={2} value={answer.offer}
      onChange={e=>setAnswer(x=>({...x,offer:e.target.value,productId:""}))}
      placeholder="¿Qué quieres anunciar?"/></label>
    <p className={styles.helper}>No inventaremos descuentos ni precios.</p>
   </div>:null}
  {!loading&&step==="goal"?<div className={styles.answers}>
    <p className={styles.helper}>Puedes elegir varios objetivos.</p>
    <div className={styles.optionsVertical} role="group" aria-label="Objetivos del anuncio">
     {([["visits","Visitas a mi web"],["messages","Mensajes y consultas"],["sales","Ventas"]] as const)
      .map(([id,title])=><button key={id} type="button"
       className={answer.goals.includes(id)?styles.chipSelected:styles.chip}
       aria-pressed={answer.goals.includes(id)} onClick={()=>toggleGoal(id)}>
       {answer.goals.includes(id)?<Check size={17}/>:null}{title}
      </button>)}
    </div>
   </div>:null}
  {!loading&&step==="audience"?<div className={styles.answers}>
    <label className={styles.field}>Público
     <textarea maxLength={130} rows={3} value={answer.audience} onChange={e=>update("audience",e.target.value)}/></label>
    <p className={styles.helper}>Describe intereses generales; evita datos sensibles o personales.</p>
   </div>:null}
  {!loading&&step==="location"?<div className={styles.answers}>
    {!editCity&&answer.city&&answer.region?<div className={styles.fact}>{answer.city}, {answer.region}</div>:null}
    <div className={styles.options}>{chip("Sí, aquí",!editCity&&Boolean(answer.city),()=>{if(answer.city&&answer.region)next();else setEditCity(true);})}
     {chip("Cambiar ubicación",editCity,()=>setEditCity(true))}</div>
    {editCity||!answer.city?<div className={styles.fieldPair}>
     <label className={styles.field}>Ciudad<input maxLength={100} value={answer.city}
      onChange={e=>update("city",e.target.value)}/></label>
     <label className={styles.field}>Estado<input maxLength={90} value={answer.region}
      onChange={e=>update("region",e.target.value)}/></label></div>:null}
    <p className={styles.helper}>Marketing verificará la ubicación con Meta antes de publicar.</p>
   </div>:null}
  {!loading&&step==="image"?<div className={styles.answers}>
    <div className={styles.optionsVertical}>
     {businessImageAvailable?chip("Usar imagen del negocio",answer.imageChoice==="business",()=>update("imageChoice","business")):null}
     {products.some(p=>p.image_path)?chip("Imagen de un producto",answer.imageChoice==="product",()=>update("imageChoice","product")):null}
     {chip("Subir otra en Marketing",answer.imageChoice==="upload",()=>update("imageChoice","upload"))}
    </div>
    {answer.imageChoice==="product"?<div className={styles.products}>{products.filter(p=>p.image_path).map(p=><button type="button"
     key={p.id} className={answer.imageProductId===p.id?styles.productActive:styles.product}
     onClick={()=>update("imageProductId",p.id)}><ImageIcon size={16}/>{p.name}</button>)}</div>:null}
    <p className={styles.helper}>La imagen se revisa y carga desde Ads Studio; todavía no se publica.</p>
   </div>:null}
  {!loading&&step==="review"?<div className={styles.review}>
    <div><small>Negocio</small><strong>{answer.businessName}</strong></div>
    <div><small>Promoción</small><strong>{answer.offer}</strong></div>
    <div><small>Destino</small><strong>{answer.website||"Por definir en Marketing"}</strong></div>
    <div><small>Zona</small><strong>{answer.city}, {answer.region}</strong></div>
    <div><small>Objetivos</small><strong>{answer.goals.map(goal=>
     ({visits:"Visitas",messages:"Mensajes",sales:"Ventas"} as const)[goal]).join(" · ")}</strong></div>
    <label className={styles.field}>Algo más que debamos saber (opcional)
     <textarea value={answer.notes} onChange={e=>update("notes",e.target.value)}
      rows={2} maxLength={300} placeholder="Detalle real de la oferta"/></label>
   </div>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {!loading&&owner?<div className={styles.footer}>
    {step!=="review"?<button type="button" className={styles.next} disabled={!canContinue} onClick={next}>
     Continuar <ArrowRight size={18}/></button>:
     <button type="button" className={styles.generate} onClick={finish}>
      <Megaphone size={18}/> Generar anuncio <ArrowRight size={17}/></button>}
   </div>:null}
  <p className={styles.safety}><ShieldCheck size={14}/> La aprobación, imagen, presupuesto y publicación se gestionan en Marketing.</p>
 </section>;
}
