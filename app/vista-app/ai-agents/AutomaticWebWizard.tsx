"use client";
import {useEffect,useMemo,useState} from "react";
import dynamic from "next/dynamic";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,Globe2,ImagePlus,LoaderCircle,Package,Pencil,RefreshCw,ShieldCheck,Sparkles,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES,categoryLabel} from "@/lib/vmv-business-categories";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {createSiteProposals,type SiteDesignPreferences,type SiteIntake,type SiteProduct,type SiteProposal} from "@/lib/web-builder-templates";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";

const TemplateProposals=dynamic(()=>import("@/app/web-studio/TemplateProposals"),{ssr:false,
 loading:()=> <p role="status">Preparando vista previa de tu sitio…</p>});
type Stage="business"|"project"|"offerings"|"features"|"contact"|"design"|"media"|"direction"|"preview"|"review";
const stages:Stage[]=["business","project","offerings","features","contact","design","media","direction","preview","review"];
type Item={id:string;name:string;description:string;price_cents:number|null;type:"product"|"service";approved:boolean};
type Existing={id:string;name:string;slug:string};
type Typeface="modern"|"editorial"|"rounded"|"geometric";
type ImageShape="rounded"|"square"|"pill"|"bordered";
type Objective="calls"|"quotes"|"bookings"|"orders";
const colors=[["Rosa","#b7357b"],["Violeta","#7947c3"],["Azul","#2c62ab"],["Verde","#217c68"],
 ["Ciruela","#633773"],["Marino","#263f70"],["Grafito","#3d4052"],["Turquesa","#258c94"]] as const;
const validEmail=(v:string)=>!v.trim()||/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim());
const slugify=(name:string)=>name.normalize("NFKD").toLowerCase()
 .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32);
const cleanOffer=(s:string)=>s.trim().replace(/\s+/g," ").slice(0,100);
const stageQuestion:Record<Stage,string>={
 business:"¿Esta página es para tu negocio?",
 project:"¿Qué haremos con tu web?",
 offerings:"¿Qué productos o servicios mostraremos?",
 features:"¿Qué quieres lograr con tu página?",
 contact:"¿Cómo te contactarán tus clientes?",
 design:"¿Qué estilo prefieres?",
 media:"¿Qué imágenes usaremos?",
 direction:"¿Cómo quieres que se sienta tu web?",
 preview:"Así está creando tu web el agente",
 review:"Revisa tu página antes de guardarla"
};
export default function AutomaticWebWizard({business,workspaceId,agent,onClose}:{
 business:CentralBusiness;workspaceId:string;agent:PersistedAgent;onClose:()=>void;
}){
 const [stage,setStage]=useState<Stage>("business");
 const [owner,setOwner]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [returnToReview,setReturnToReview]=useState(false);
 const [customBusiness,setCustomBusiness]=useState(false);
 const [name,setName]=useState(business.name);
 const [category,setCategory]=useState(business.category_id||"");
 const [about,setAbout]=useState((business.description||"").slice(0,480));
 const [mode,setMode]=useState<"new"|"alternative">("new");
 const [existing,setExisting]=useState<Existing[]>([]);
 const [items,setItems]=useState<Item[]>([]);
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [extraOffer,setExtraOffer]=useState("");
 const [objective,setObjective]=useState<Objective>("quotes");
 const [inventory,setInventory]=useState(false);
 const [booking,setBooking]=useState(false);
 const [chat,setChat]=useState(false);
 const [inquiries,setInquiries]=useState(true);
 const [phone,setPhone]=useState(business.phone||"");
 const [email,setEmail]=useState("");
 const [city,setCity]=useState([business.city,business.region].filter(Boolean).join(", "));
 const [palette,setPalette]=useState<string[]>(["#b7357b","#7947c3","#217c68"]);
 const [font,setFont]=useState<Typeface>("modern");
 const [shape,setShape]=useState<ImageShape>("rounded");
 const [logo,setLogo]=useState("");
 const [cover,setCover]=useState("");
 const [gallery,setGallery]=useState<string[]>([]);
 const [skipImages,setSkipImages]=useState(false);
 const [imagePrompt,setImagePrompt]=useState("");
 const [imageCandidate,setImageCandidate]=useState("");
 const [imageAiReady,setImageAiReady]=useState(false);
 const [direction,setDirection]=useState("Diseño ultramoderno, elegante y fácil de usar desde el teléfono.");
 const [aiAvailable,setAiAvailable]=useState(false);
 const [aiReason,setAiReason]=useState("");
 const [proposal,setProposal]=useState<SiteProposal|null>(null);
 const [proposalSignature,setProposalSignature]=useState("");
 const [created,setCreated]=useState("");
 const progress=stages.indexOf(stage);
 const selectedItems=items.filter(x=>selectedIds.includes(x.id));
 const products=selectedItems.filter(x=>x.type==="product");
 const services=selectedItems.filter(x=>x.type==="service");
 const offeredNames=[...selectedItems.map(x=>x.name),...extraOffer.split(/[\n,]+/).map(cleanOffer).filter(Boolean)];
 const uniqueOffers=Array.from(new Set(offeredNames)).slice(0,18);
 const features={inventory:inventory&&products.length>0,booking,chat};
 const input=useMemo<SiteIntake>(()=>{
  const selectedProducts:SiteProduct[]=inventory?products.slice(0,18).map(x=>({
   id:x.id,title:x.name,description:x.description.slice(0,400),
   price:typeof x.price_cents==="number"?"$"+(x.price_cents/100).toFixed(2):"",image:""
  })):[];
  const selectedServices=Array.from(new Set([
   ...services.map(x=>x.name),...extraOffer.split(/[\n,]+/).map(cleanOffer).filter(Boolean)
  ])).slice(0,20);
  const offering=products.length&&selectedServices.length?"both":products.length?"products":"services";
  const design:SiteDesignPreferences={colors:palette,font,imageStyle:shape,
   galleryColumns:"3",features,chatMode:chat?"inbox":"off"};
  return {business:name.trim().slice(0,100),categoryId:category,offering,
   objective:booking?"bookings":objective,phone:phone.trim().slice(0,36),
   email:email.trim().slice(0,180),city:city.trim().slice(0,180),
   about:about.trim().slice(0,500),logo,
   photos:Array.from(new Set([cover,...gallery].filter(Boolean))).slice(0,12),
   offerings:selectedServices,products:selectedProducts,design};
 },[name,category,objective,booking,phone,email,city,about,logo,cover,gallery,
  selectedIds,items,inventory,chat,palette,font,shape,extraOffer]);
 const signature=JSON.stringify({input,direction});
 const validStage=stage==="business"?name.trim().length>=2&&Boolean(category):
  stage==="offerings"?uniqueOffers.length>0:
  stage==="contact"?validEmail(email)&&Boolean(phone.trim()||email.trim()||inquiries):
  stage==="design"?palette.length===3:
  stage==="media"?Boolean(cover||skipImages):
  stage==="preview"?Boolean(proposal&&proposalSignature===signature):
  true;
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user||user.is_anonymous||user.id!==business.owner_id||
     user.id!==agent.owner_id||agent.business_id!==workspaceId)
     throw Error("Debes abrir Web Services desde el agente principal del mismo negocio.");
    if(!live)return;
    setOwner(user.id);
    const [central,existingSites,catalog,bookingServices]=await Promise.all([
     db.from("vmv_marketing_businesses").select("id,email,services,products,category_id")
      .eq("id",business.id).eq("owner_id",user.id).maybeSingle(),
     db.from("smartjob_builder_sites").select("id,name,slug").eq("owner_id",user.id).limit(20),
     db.from("vmv_ai_catalog_items").select("id,name,description,price_cents")
      .eq("business_id",workspaceId).eq("owner_id",user.id).eq("active",true).eq("approved",true).limit(40),
     db.from("vmv_ai_booking_services").select("id,name,description,price_cents")
      .eq("business_id",workspaceId).eq("owner_id",user.id).eq("active",true).eq("approved",true).limit(30)
    ]);
    if(central.error||!central.data)throw Error("El negocio ya no está disponible para esta cuenta.");
    if(existingSites.error)throw Error("No se pudieron comprobar las páginas existentes.");
    if(!live)return;
    setEmail(String(central.data.email||"").slice(0,180));
    if(!category&&central.data.category_id)setCategory(central.data.category_id);
    const existingItems=[
     ...(catalog.data||[]).map(x=>({...x,type:"product" as const,approved:true})),
     ...(bookingServices.data||[]).map(x=>({...x,type:"service" as const,approved:true}))
    ];
    const savedServices=String(central.data.services||"").split(/[\n,]+/).map(cleanOffer).filter(Boolean);
    const savedProducts=String(central.data.products||"").split(/[\n,]+/).map(cleanOffer).filter(Boolean);
    for(const [kind,names] of [["service",savedServices],["product",savedProducts]] as const){
     for(const value of names.slice(0,12)){
      if(existingItems.some(x=>x.name.toLocaleLowerCase("es")===value.toLocaleLowerCase("es")))continue;
      existingItems.push({id:"central-"+kind+"-"+existingItems.length,name:value,description:"",
       price_cents:null,type:kind,approved:true});
     }
    }
    setItems(existingItems);
    setSelectedIds(existingItems.slice(0,6).map(x=>x.id));
    setInventory(existingItems.some(x=>x.type==="product"));
    setExisting((existingSites.data||[]) as Existing[]);
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo cargar el negocio.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[business.id,workspaceId,agent.id]);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   const db=getSupabase();if(!db)return;
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)return;
   const auth={Authorization:"Bearer "+session.access_token};
   const [site,image]=await Promise.all([
    fetch("/api/web-services/generate-site",{headers:auth,cache:"no-store"}).catch(()=>null),
    fetch("/api/web-services/generate-image",{headers:auth,cache:"no-store"}).catch(()=>null)
   ]);
   if(!live)return;
   if(site){const j=await site.json().catch(()=>({}));
    setAiAvailable(site.ok&&j.enabled===true);
    setAiReason(typeof j.reason==="string"?j.reason:"");
   }
   if(image){const j=await image.json().catch(()=>({}));if(live)setImageAiReady(image.ok&&j.enabled===true);}
  })();
  return()=>{live=false;};
 },[]);
 const go=(target:Stage)=>{setError("");setStage(target);};
 const next=()=>{
  if(!validStage||busy)return;
  if(returnToReview){setReturnToReview(false);go("review");return;}
  go(stages[Math.min(progress+1,stages.length-1)]);
 };
 const previous=()=>{
  if(returnToReview){setReturnToReview(false);go("review");return;}
  if(progress===0){onClose();return;}
  go(stages[progress-1]);
 };
 const edit=(target:Stage)=>{setReturnToReview(true);go(target);};
 const toggle=(id:string)=>{
  setSelectedIds(ids=>ids.includes(id)?ids.filter(v=>v!==id):ids.length>=16?ids:[...ids,id]);
 };
 const toggleColor=(hex:string)=>{
  setPalette(current=>current.includes(hex)?current.length===1?current:current.filter(x=>x!==hex):
   current.length>=3?[...current.slice(1),hex]:[...current,hex]);
 };
 const askAi=async(path:string,body:Record<string,unknown>)=>{
  const db=getSupabase();if(!db)throw Error("No hay conexión.");
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token||session.user.id!==owner)throw Error("Inicia sesión nuevamente.");
  const response=await fetch(path,{method:"POST",cache:"no-store",
   headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
   body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(result.error||"La IA no pudo completar esta solicitud."));
  return result;
 };
 const generateImage=async()=>{
  if(busy||!imageAiReady)return;
  if(!window.confirm("Generar la imagen utiliza una generación del cupo diario de IA. ¿Continuar?"))return;
  setBusy("image");setImageCandidate("");setError("");
  try{
   const prompt=(imagePrompt.trim()||"Fotografía comercial auténtica de "+uniqueOffers.slice(0,4).join(", ")+
    " para el negocio, composición limpia, sin texto ni logotipos.").slice(0,450);
   const res=await askAi("/api/web-services/generate-image",{
    prompt,business:name,categoryId:category
   });
   const url=safeWebImageUrl(String(res.url||""));
   if(!url)throw Error("La imagen generada no se pudo verificar.");
   setImageCandidate(url);
  }catch(e){setError(e instanceof Error?e.message:"Error al generar la imagen.");}
  finally{setBusy("");}
 };
 const generate=async()=>{
  if(busy||!name.trim()||!category||!uniqueOffers.length||palette.length!==3)return;
  setBusy("generate");setError("");setProposal(null);
  try{
   if(!aiAvailable){
    const result=createSiteProposals(input);
    if(!result[0])throw Error("No se pudo preparar un diseño sin IA.");
    setProposal(result[0]);setProposalSignature(signature);return;
   }
   const res=await askAi("/api/web-services/generate-site",{
    intake,direction:direction.trim().slice(0,360)
   });
   if(!res.proposal?.data)throw Error("La IA no devolvió una web editable.");
   setProposal(res.proposal as SiteProposal);setProposalSignature(signature);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo generar tu web.");}
  finally{setBusy("");}
 };
 const save=async()=>{
  if(busy||!proposal||proposalSignature!==signature||!owner)return;
  if(!window.confirm("¿Guardar esta web como un borrador nuevo? Tus sitios actuales no se modificarán ni se publicará nada."))return;
  setBusy("save");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo conectar.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.id!==owner||owner!==business.owner_id)
    throw Error("Tu sesión no está autorizada.");
   const {data:allowed}=await db.from("vmv_marketing_businesses").select("id")
    .eq("id",business.id).eq("owner_id",owner).maybeSingle();
   if(!allowed)throw Error("No puedes crear una web para ese negocio.");
   const {normalizeBuilderDocument}=await import("@/lib/web-builder-puck");
   const slug=(slugify(name)||"mi-negocio")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
   const result=await db.rpc("smartjob_builder_create_site",{
    p_name:name.trim().slice(0,100),p_slug:slug,p_category_id:category,
    p_home_draft:normalizeBuilderDocument(proposal.data),
    p_home_description:(proposal.seoDescription||about).slice(0,300),
    p_legacy_source_slug:null
   });
   if(result.error||!result.data?.siteId||!result.data?.pageId)
    throw Error(/límite de cinco sitios/i.test(String(result.error?.message||""))?
     "Has alcanzado el límite de sitios de tu cuenta. Puedes editar los existentes.":
     "No se pudo guardar la web. Revisa tu cuenta o inténtalo nuevamente.");
   if(proposal.seoTitle){
    const page=await db.from("smartjob_builder_pages").select("revision")
     .eq("id",result.data.pageId).eq("owner_id",owner).maybeSingle();
    if(page.data&&!page.error){
     await db.from("smartjob_builder_pages").update({
      title:proposal.seoTitle.slice(0,100),
      description:(proposal.seoDescription||"").slice(0,300),
      revision:page.data.revision+1,updated_at:new Date().toISOString()
     }).eq("id",result.data.pageId).eq("owner_id",owner).eq("revision",page.data.revision);
    }
   }
   setCreated(slug);
   window.location.assign("/web-studio?mode=templates&open="+encodeURIComponent(slug));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la web.");}
  finally{setBusy("");}
 };
 const reviewCard=(label:string,value:string,target:Stage)=><div className={styles.reviewCard} key={label}>
  <span><small>{label}</small><strong>{value||"Pendiente"}</strong></span>
  <button type="button" className={styles.edit} aria-label={"Editar "+label}
   title={"Editar "+label} onClick={()=>edit(target)}><Pencil size={17}/></button>
 </div>;
 return <section className={styles.root+" "+theme.flow} aria-label="Crear web con AI Agents">
  <header className={styles.top}>
   <button type="button" onClick={previous} aria-label="Volver"><ArrowLeft size={19}/></button>
   <span>Web Services · Mi agente</span><span>{progress+1}/{stages.length}</span>
  </header>
  <div className={styles.track}><span className={theme.agentProgress}
   style={{width:((progress+1)/stages.length*100)+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{stageQuestion[stage]}</h1>
  {loading?<p role="status" className={styles.note}><LoaderCircle size={17} className={styles.spin}/> Consultando tu negocio…</p>:null}
  {!loading&&owner&&stage==="business"?<div className={styles.panel}>
   <strong className={styles.emphasis+" "+theme.agentText}>{business.name}</strong>
   <div className={styles.options}>
    <button type="button" className={!customBusiness?styles.optionActive:styles.option}
     onClick={()=>{setCustomBusiness(false);setName(business.name);}}>Sí, este negocio</button>
    <button type="button" className={customBusiness?styles.optionActive:styles.option}
     onClick={()=>setCustomBusiness(true)}>Corregir nombre</button>
   </div>
   {customBusiness?<label className={styles.field}>Nombre visible en esta web
    <input maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>:null}
   <label className={styles.field}>Sector del negocio
    <select value={category} onChange={e=>setCategory(e.target.value)}>
     <option value="">Seleccionar sector</option>
     {BUSINESS_CATEGORIES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
    </select></label>
   <p className={styles.note}>Estos cambios no modifican los datos originales del negocio.</p>
  </div>:null}
  {!loading&&owner&&stage==="project"?<div className={styles.panel}>
   <div className={styles.optionsVertical}>
    <button type="button" className={mode==="new"?styles.optionActive:styles.option}
     onClick={()=>setMode("new")}>Crear una web nueva</button>
    {existing.length?<button type="button" className={mode==="alternative"?styles.optionActive:styles.option}
     onClick={()=>setMode("alternative")}>Crear una versión mejorada sin reemplazar la actual</button>:null}
   </div>
   {existing.length?<div className={styles.info}>
    <span>Encontré {existing.length} web(s) en tu cuenta.</span>
    <a href="/web-studio?mode=templates">Editar una web existente</a>
   </div>:<p className={styles.note}>Crearemos un borrador nuevo. No será público hasta que lo apruebes.</p>}
  </div>:null}
  {!loading&&owner&&stage==="offerings"?<div className={styles.panel}>
   {items.length?<><p className={styles.note}>Seleccioné opciones conocidas del negocio. Puedes quitar o agregar las que quieras.</p>
    <div className={styles.items} role="group" aria-label="Productos y servicios">
     {items.map(x=><button type="button" key={x.id}
      className={selectedIds.includes(x.id)?styles.itemSelected:styles.item}
      aria-pressed={selectedIds.includes(x.id)} onClick={()=>toggle(x.id)}>
      <Package size={17}/><span><strong>{x.name}</strong><small>{x.type==="product"?"Producto":"Servicio"}
       {typeof x.price_cents==="number"?" · $"+(x.price_cents/100).toFixed(2):""}</small></span>
      {selectedIds.includes(x.id)?<Check size={18}/>:null}</button>)}
    </div></>:null}
   <label className={styles.field}>¿Algo más que deba aparecer? (opcional)
    <textarea rows={2} maxLength={350} placeholder="Servicios adicionales separados por coma"
     value={extraOffer} onChange={e=>setExtraOffer(e.target.value)}/></label>
   <p className={styles.note}>Solo se usarán datos aprobados o escritos por ti. No se inventarán precios ni descuentos.</p>
  </div>:null}
  {!loading&&owner&&stage==="features"?<div className={styles.panel}>
   <p className={styles.note}>Elige lo importante. Las conexiones que requieran autorización se configurarán por separado.</p>
   <div className={styles.optionsVertical} role="group" aria-label="Objetivo del sitio">
    {([["calls","Recibir llamadas"],["quotes","Solicitar cotizaciones"],["bookings","Solicitar citas"],["orders","Consultar pedidos"]] as const)
     .map(([id,label])=><button key={id} type="button"
      className={objective===id?styles.optionActive:styles.option}
      aria-pressed={objective===id} onClick={()=>{setObjective(id);setBooking(id==="bookings");}}>{label}</button>)}
   </div>
   <div className={styles.checks}>
    {products.length?<label><input type="checkbox" checked={inventory}
     onChange={e=>setInventory(e.target.checked)}/> Mostrar catálogo de productos</label>:null}
    <label><input type="checkbox" checked={booking} onChange={e=>setBooking(e.target.checked)}/>
     Mostrar solicitud de citas (no reserva automática)</label>
    <label><input type="checkbox" checked={chat} onChange={e=>setChat(e.target.checked)}/>
     Añadir botón de chat (bandeja VMV)</label>
    <label><input type="checkbox" checked={inquiries} onChange={e=>setInquiries(e.target.checked)}/>
     Permitir consultas desde la web</label>
   </div>
  </div>:null}
  {!loading&&owner&&stage==="contact"?<div className={styles.panel}>
   <p className={styles.note}>Completé lo que ya existe en VMV; puedes corregirlo.</p>
   <label className={styles.field}>Teléfono comercial<input type="tel" maxLength={36}
    value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Opcional"/></label>
   <label className={styles.field}>Correo comercial<input type="email" maxLength={180}
    value={email} onChange={e=>setEmail(e.target.value)} placeholder="contacto@tunegocio.com"/></label>
   <label className={styles.field}>Ciudad y estado<input maxLength={180}
    value={city} onChange={e=>setCity(e.target.value)}/></label>
   <label className={styles.field}>Descripción de tu negocio<textarea rows={3} maxLength={500}
    value={about} onChange={e=>setAbout(e.target.value)}
    placeholder="Cuéntanos qué hace especial a tu negocio"/></label>
   <p className={styles.note}>Nunca publicaremos tu dirección privada automáticamente.</p>
  </div>:null}
  {!loading&&owner&&stage==="design"?<div className={styles.panel}>
   <p className={styles.note}>Elige tres colores para tu web. El agente recomendará una composición a partir de ellos.</p>
   <div className={styles.swatches} role="group" aria-label="Colores de la web">
    {colors.map(([label,hex])=><button key={hex} type="button"
     className={palette.includes(hex)?styles.swatchActive:styles.swatch}
     onClick={()=>toggleColor(hex)} aria-pressed={palette.includes(hex)} title={label}>
     <span style={{backgroundColor:hex}}/><small>{label}</small>{palette.includes(hex)?<Check size={14}/>:null}
    </button>)}
   </div>
   <label className={styles.field}>Tipografía
    <select value={font} onChange={e=>setFont(e.target.value as Typeface)}>
     <option value="modern">Moderna</option><option value="editorial">Editorial</option>
     <option value="rounded">Redondeada</option><option value="geometric">Geométrica</option>
    </select></label>
   <label className={styles.field}>Fotografías
    <select value={shape} onChange={e=>setShape(e.target.value as ImageShape)}>
     <option value="rounded">Esquinas suaves</option><option value="square">Rectas</option>
     <option value="pill">Orgánicas</option><option value="bordered">Con marco</option>
    </select></label>
  </div>:null}
  {!loading&&owner&&stage==="media"?<div className={styles.panel}>
   <div className={styles.mediaRow}><strong>Foto principal</strong>
    <BuilderImageField value={cover} onChange={url=>{setCover(url);if(url)setSkipImages(false);}}/></div>
   <div className={styles.mediaRow}><strong>Logo (opcional)</strong>
    <BuilderImageField kind="logo" value={logo} onChange={setLogo}/></div>
   {imageAiReady?<div className={styles.aiImageBox}>
    <p className={styles.note}>También puedes pedir una propuesta de portada con IA y aprobarla antes de usarla.</p>
    <label className={styles.field}>Describe la imagen (opcional)
     <textarea rows={2} maxLength={450} value={imagePrompt}
      onChange={e=>setImagePrompt(e.target.value)} placeholder="Fotografía moderna de nuestros productos"/></label>
    <button type="button" className={styles.option} disabled={Boolean(busy)}
     onClick={()=>void generateImage()}>
     {busy==="image"?<LoaderCircle size={17} className={styles.spin}/>:<WandSparkles size={17}/>}
     {busy==="image"?"Generando…":"Generar portada con IA"}</button>
    {imageCandidate?<div className={styles.candidate}>
     <img src={imageCandidate} alt="Propuesta de imagen de portada"/>
     <div className={styles.options}>
      <button type="button" className={styles.optionActive} onClick={()=>{
       setCover(imageCandidate);setSkipImages(false);setImageCandidate("");
      }}><Check size={15}/> Aprobar</button>
      <button type="button" className={styles.option} disabled={Boolean(busy)}
       onClick={()=>void generateImage()}><RefreshCw size={15}/> Reintentar</button>
     </div>
    </div>:null}
   </div>:<p className={styles.note}>Las imágenes con IA se habilitan cuando el proveedor esté disponible. Puedes subir fotos ahora.</p>}
   <label className={styles.checkLine}><input type="checkbox" checked={skipImages}
    onChange={e=>setSkipImages(e.target.checked)}/> Continuar sin fotos por ahora</label>
  </div>:null}
  {!loading&&owner&&stage==="direction"?<div className={styles.panel}>
   <p className={styles.note}>El agente ya conoce tu negocio, tus productos y tus preferencias. Solo agrega un detalle creativo si quieres.</p>
   <label className={styles.field}>Indicaciones para el diseño
    <textarea rows={4} maxLength={360} value={direction}
     onChange={e=>setDirection(e.target.value)}/></label>
   <div className={styles.info}>Los textos, secciones y SEO serán generados con tus datos verificables, sin inventar promociones ni testimonios.</div>
  </div>:null}
  {!loading&&owner&&stage==="preview"?<div className={styles.panel}>
   {proposal&&proposalSignature===signature?<TemplateProposals input={input} generated={proposal} busy={Boolean(busy)}
    onBack={()=>{setProposal(null);go("direction");}}
    onChoose={p=>{setProposal(p);setProposalSignature(signature);next();}}/>:
    <><p className={styles.note}>Prepararé una propuesta editable. Podrás revisar el diseño antes de guardar el borrador.</p>
     {proposal&&proposalSignature!==signature?<p className={styles.warning}>
      Cambiaste datos desde Revisión. Actualiza el diseño para incluirlos.</p>:null}
     {!aiAvailable?<p className={styles.note}>
      {aiReason||"La IA no está disponible ahora."} Se usará un diseño profesional de plantilla, editable y sin datos inventados.
     </p>:null}
     <button type="button" className={styles.primary+" "+theme.agentButton}
      disabled={Boolean(busy)} onClick={()=>void generate()}>
      {busy==="generate"?<LoaderCircle size={18} className={styles.spin}/>:<Sparkles size={18}/>}
      {busy==="generate"?"Generando tu web…":"Generar y ver propuesta"} <ArrowRight size={17}/></button></>}
  </div>:null}
  {!loading&&owner&&stage==="review"?<div className={styles.panel}>
   <div className={styles.review}>
    {reviewCard("Negocio",name,"business")}
    {reviewCard("Tipo de proyecto",mode==="new"?"Web nueva":"Versión alternativa","project")}
    {reviewCard("Productos y servicios",uniqueOffers.join(", "),"offerings")}
    {reviewCard("Objetivo",({calls:"Llamadas",quotes:"Cotizaciones",bookings:"Citas",orders:"Pedidos"} as const)[objective],"features")}
    {reviewCard("Contacto",[phone,email,city].filter(Boolean).join(" · "),"contact")}
    {reviewCard("Estilo",palette.length+" colores · "+font+" · "+shape,"design")}
    {reviewCard("Imágenes",cover?"Portada aprobada":"Sin fotos por ahora","media")}
    {reviewCard("Indicaciones",direction,"direction")}
    {reviewCard("Diseño generado",proposal?.name||"Pendiente","preview")}
   </div>
   {proposalSignature!==signature?<div className={styles.warning}>
    Cambiaste un dato de tu web. Actualiza el diseño antes de guardar.
    <button type="button" className={styles.option} onClick={()=>{setReturnToReview(false);go("preview");}}>
     Actualizar propuesta</button></div>:null}
   <p className={styles.note}>El borrador se guardará en Web Studio. No reemplaza ni publica sitios actuales.</p>
  </div>:null}
  {error?<div role="alert" className={styles.error}>{error}</div>:null}
  {!loading&&owner?<div className={styles.footer}>
   {stage!=="review"?stage!=="preview"?<button type="button" className={styles.primary+" "+theme.agentButton}
     disabled={!validStage||Boolean(busy)} onClick={next}>
     {returnToReview?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={18}/></button>:null:
    <button type="button" className={styles.primary+" "+theme.agentButton}
     disabled={Boolean(busy)||!proposal||proposalSignature!==signature||Boolean(created)}
     onClick={()=>void save()}>
     {busy==="save"?<LoaderCircle size={18} className={styles.spin}/>:<Globe2 size={18}/>}
     {busy==="save"?"Guardando…":"Guardar borrador y abrir Web Studio"} <ArrowRight size={18}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> No se publica ninguna web sin tu aprobación.</p>
 </section>;
}
