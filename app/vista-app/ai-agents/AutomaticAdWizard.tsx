"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,Globe2,Image as ImageIcon,LoaderCircle,Megaphone,Package,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import {saveAgentAdBrief,type AgentAdBrief} from "@/lib/vmv-ai-agents/ad-handoff";
import styles from "./AutomaticAdWizard.module.css";

type Product={id:string;name:string;description:string;price_cents:number;currency:string;stock_mode:string;image_path:string|null};
type Answer={businessName:string;website:string;offer:string;productId:string;
 audience:string;city:string;region:string;goal:"visits"|"messages"|"sales";
 imageChoice:"business"|"product"|"upload";imageProductId:string;notes:string};
type Step="business"|"website"|"product"|"goal"|"audience"|"location"|"image"|"review";
const steps:Step[]=["business","website","product","goal","audience","location","image","review"];
const validSite=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&
 !u.username&&!u.password&&!u.port&&u.hostname.includes(".")&&!u.hostname.endsWith(".local")&&
 !["localhost","127.0.0.1"].includes(u.hostname);}catch{return false;}};
export default function AutomaticAdWizard({business,workspaceId,agent,onClose}:{
 business:CentralBusiness;workspaceId:string;agent:PersistedAgent;onClose:()=>void;
}){
 const [owner,setOwner]=useState("");
 const [step,setStep]=useState<Step>("business");
 const [products,setProducts]=useState<Product[]>([]);
 const [businessImageAvailable,setBusinessImageAvailable]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [editBusiness,setEditBusiness]=useState(false);
 const [editSite,setEditSite]=useState(false);
 const [editCity,setEditCity]=useState(false);
 const [answer,setAnswer]=useState<Answer>({
  businessName:business.name,website:validSite(business.website_url||"")?business.website_url||"":"",
  offer:"",productId:"",audience:"Personas interesadas en los productos o servicios del negocio",
  city:business.city||"",region:business.region||"",goal:"visits",
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
   const [catalog,profile]=await Promise.all([
    db.from("vmv_ai_catalog_items")
     .select("id,name,description,price_cents,currency,stock_mode,image_path")
     .eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("approved",true).eq("active",true).order("updated_at",{ascending:false}).limit(50),
    db.from("vmv_marketing_businesses").select("id,logo_path,cover_path")
     .eq("id",business.id).eq("owner_id",user.id).maybeSingle()
   ]);
   if(catalog.error||profile.error||!profile.data)throw Error("No se pudo consultar el contenido del negocio.");
   if(live){
    setProducts((catalog.data||[]) as Product[]);
    setBusinessImageAvailable(Boolean(profile.data.logo_path||profile.data.cover_path));
   }
  };
  void run().catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudo cargar tu negocio.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[business.id,workspaceId,agent.id,agent.owner_id,agent.business_id]);
 const hasSite=Boolean(answer.website);
 const index=steps.indexOf(step);
 const product=products.find(x=>x.id===answer.productId)||null;
 const hasProductImage=products.some(x=>x.id===answer.imageProductId&&x.image_path);
 const canContinue=step==="business"?answer.businessName.trim().length>=2:
  step==="website"?!answer.website.trim()||validSite(answer.website):
  step==="product"?answer.offer.trim().length>=3:
  step==="audience"?answer.audience.trim().length>=3:
  step==="location"?answer.city.trim().length>=2&&answer.region.trim().length>=2:
  step==="image"?answer.imageChoice!=="product"||hasProductImage:true;
 const next=()=>{if(!canContinue)return;setError("");setStep(steps[Math.min(index+1,steps.length-1)]);};
 const back=()=>{if(index===0){onClose();return;}setError("");setStep(steps[index-1]);};
 const selectProduct=(id:string)=>{
  const p=products.find(x=>x.id===id);
  update("productId",id);
  setAnswer(x=>({...x,productId:id,offer:p?p.name:"",imageProductId:p?.image_path?p.id:""}));
 };
 const finish=()=>{
  if(!owner||!canContinue||!answer.businessName.trim()||!answer.offer.trim()||
   !answer.city.trim()||!answer.region.trim()||!answer.audience.trim())return;
  if(answer.website&&!validSite(answer.website)){setError("Utiliza una dirección HTTPS válida.");return;}
  const brief:AgentAdBrief={
   version:1,ownerId:owner,businessId:business.id,workspaceId,agentId:agent.id,
   createdAt:Date.now(),businessName:answer.businessName.trim(),website:answer.website.trim(),
   offer:answer.offer.trim(),city:answer.city.trim(),region:answer.region.trim(),
   audience:answer.audience.trim(),goal:answer.goal,imageChoice:answer.imageChoice,
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
    <div className={styles.options}>{chip("Sí",!editBusiness,()=>{setEditBusiness(false);update("businessName",business.name);next();})}
     {chip("No, es otro",editBusiness,()=>setEditBusiness(true))}</div>
    {editBusiness?<><input aria-label="Nombre del negocio para este anuncio" maxLength={100}
     value={answer.businessName} onChange={e=>update("businessName",e.target.value)}/>
     <p className={styles.helper}>Cambiarlo aquí no modifica tu negocio guardado.</p></>:null}
   </div>:null}
  {!loading&&step==="website"?<div className={styles.answers}>
    {hasSite&&!editSite?<div className={styles.fact}><Globe2 size={20}/><span>{answer.website}</span></div>:null}
    <div className={styles.options}>
     {chip("Sí",!editSite&&hasSite,()=>{if(!hasSite)setEditSite(true);else next();})}
     {chip("No / usar otra",editSite||!hasSite,()=>{setEditSite(true);update("website","");})}
    </div>
    {editSite?<><input type="url" inputMode="url" aria-label="Sitio web HTTPS" placeholder="https://tunegocio.com"
     value={answer.website} onChange={e=>update("website",e.target.value)} maxLength={240}/>
     <p className={styles.helper}>Si no tienes web, puedes continuar sin ella y definir el destino con Marketing.</p></>:null}
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
  {!loading&&step==="goal"?<div className={styles.answers}><div className={styles.optionsVertical}>
    {([["visits","Visitas a mi web"],["messages","Mensajes y consultas"],["sales","Ventas"]] as const)
     .map(([id,title])=>chip(title,answer.goal===id,()=>{update("goal",id);next();}))}
   </div></div>:null}
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
    <div><small>Objetivo</small><strong>{({visits:"Visitas",messages:"Mensajes",sales:"Ventas"} as const)[answer.goal]}</strong></div>
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
