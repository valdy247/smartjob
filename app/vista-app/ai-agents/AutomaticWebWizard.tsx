"use client";
import {useEffect,useMemo,useState} from "react";
import dynamic from "next/dynamic";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,Globe2,ImagePlus,LoaderCircle,Package,Pencil,RefreshCw,ShieldCheck,Sparkles,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES,categoryLabel} from "@/lib/vmv-business-categories";
import {safeWebImageUrl} from "@/lib/web-services-site";
import type {CatalogItem} from "./commerceStore";
import AgentWebCatalogEditor from "./AgentWebCatalogEditor";
import AgentWebMediaPicker from "./AgentWebMediaPicker";
import {createSiteProposals,type SiteDesignPreferences,type SiteIntake,type SiteProduct,type SiteProposal} from "@/lib/web-builder-templates";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";

import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";

const TemplateProposals=dynamic(()=>import("@/app/web-studio/TemplateProposals"),{ssr:false,
 loading:()=> <p role="status">Preparando vista previa de tu sitio…</p>});
type Stage="business"|"project"|"catalog"|"products"|"contact"|"colors"|"typography"|"photography"|"media"|"review"|"preview";
type Item={id:string;name:string;description:string;price_cents:number|null;type:"product"|"service";approved:boolean};
type Existing={id:string;name:string;slug:string};
type Typeface="modern"|"editorial"|"rounded"|"geometric"|"mono"|"classic"|"humanist"|"luxury";
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
 catalog:"¿Quieres conectar tu catálogo?",
 products:"Revisa los productos de tu inventario",
 contact:"¿Qué información de contacto nos falta?",
 colors:"¿Qué colores te gustan?",
 typography:"¿Qué tipografía prefieres?",
 photography:"¿Qué estilo de fotografías usaremos?",
 media:"¿Qué imágenes usaremos?",
 review:"Revisa todo antes de generar tu web",
 preview:"Tu página web está lista para visualizar"
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
 const [catalogChoice,setCatalogChoice]=useState<"yes"|"no"|null>(null);
 const [inventoryItems,setInventoryItems]=useState<CatalogItem[]>([]);
 const [skipEmail,setSkipEmail]=useState(false);
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
 const [imageAiReady,setImageAiReady]=useState(false);
 const [direction,setDirection]=useState("Diseño ultramoderno, elegante y fácil de usar desde el teléfono.");
 const [aiAvailable,setAiAvailable]=useState(false);
 const [aiReason,setAiReason]=useState("");
 const [proposal,setProposal]=useState<SiteProposal|null>(null);
 const [proposalSignature,setProposalSignature]=useState("");
 const [created,setCreated]=useState("");
 const approvedProducts=inventoryItems.filter(x=>x.approved&&x.active);
 const products=approvedProducts.slice(0,30);
 const services=items.filter(x=>x.type==="service");
 const uniqueOffers=Array.from(new Set([
  ...(catalogChoice==="yes"?approvedProducts.map(x=>x.name):[]),
  ...services.map(x=>x.name)
 ])).slice(0,30);
 const features={inventory:catalogChoice==="yes",booking,chat};
 const needsContact=!email.trim()&&!skipEmail;
 const stages:Stage[]=["business","project","catalog",
  ...(catalogChoice==="yes"?["products" as Stage]:[]),
  ...(needsContact?["contact" as Stage]:[]),
  "colors","typography","photography","media","review","preview"];
 const progress=Math.max(0,stages.indexOf(stage));
 const input=useMemo<SiteIntake>(()=>{
  const selectedProducts:SiteProduct[]=catalogChoice==="yes"?products.slice(0,30).map(x=>({
   id:x.id,title:x.name,description:x.description.slice(0,400),
   price:typeof x.price_cents==="number"?"$"+(x.price_cents/100).toFixed(2):"",image:""
  })):[];
  const selectedServices=services.map(x=>x.name).slice(0,20);
  const offering=catalogChoice==="yes"&&selectedProducts.length?
   (selectedServices.length?"both":"products"):"services";
  const design:SiteDesignPreferences={colors:palette,font,imageStyle:shape,
   galleryColumns:"3",features,chatMode:chat?"inbox":"off"};
  return {business:name.trim().slice(0,100),categoryId:category,offering,
   objective:booking?"bookings":objective,phone:phone.trim().slice(0,36),
   email:email.trim().slice(0,180),city:city.trim().slice(0,180),
   about:about.trim().slice(0,500),logo,
   photos:Array.from(new Set([cover,...gallery].filter(Boolean))).slice(0,9),
   offerings:selectedServices,products:selectedProducts,design};
 },[name,category,objective,booking,phone,email,city,about,logo,cover,gallery,
  inventoryItems,items,catalogChoice,chat,palette,font,shape]);
 const signature=JSON.stringify({input,direction});
 const validStage=stage==="business"?name.trim().length>=2&&Boolean(category):
  stage==="catalog"?catalogChoice!==null:
  stage==="contact"?Boolean(skipEmail||email.trim())&&validEmail(email):
  stage==="colors"?palette.length===3:
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
    const [central,existingSites,bookingServices]=await Promise.all([
     db.from("vmv_marketing_businesses").select("id,email,services,category_id")
      .eq("id",business.id).eq("owner_id",user.id).maybeSingle(),
     db.from("smartjob_builder_sites").select("id,name,slug").eq("owner_id",user.id).limit(20),
     db.from("vmv_ai_booking_services").select("id,name,description,price_cents")
      .eq("business_id",workspaceId).eq("owner_id",user.id).eq("active",true).eq("approved",true).limit(30)
    ]);
    if(central.error||!central.data)throw Error("El negocio ya no está disponible para esta cuenta.");
    if(existingSites.error)throw Error("No se pudieron comprobar las páginas existentes.");
    if(!live)return;
    setEmail(String(central.data.email||"").slice(0,180));
    if(!category&&central.data.category_id)setCategory(central.data.category_id);
    const knownServices:Item[]=(bookingServices.data||[]).map(x=>({
     ...x,type:"service" as const,approved:true
    }));
    const savedServices=String(central.data.services||"").split(/[\n,]+/).map(cleanOffer).filter(Boolean);
    for(const label of savedServices.slice(0,12)){
     if(knownServices.some(x=>x.name.toLocaleLowerCase("es")===label.toLocaleLowerCase("es")))continue;
     knownServices.push({id:"central-service-"+knownServices.length,name:label,
      description:"",price_cents:null,type:"service",approved:true});
    }
    setItems(knownServices);
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
  // The final preview follows the owner's complete review; generation is a
  // separate action that cannot spend credits without explicit request.
  go(stages[Math.min(progress+1,stages.length-1)]);
 };
 const previous=()=>{
  if(returnToReview){setReturnToReview(false);go("review");return;}
  if(progress===0){onClose();return;}
  go(stages[progress-1]);
 };
 const edit=(target:Stage)=>{setReturnToReview(true);go(target);};
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
 const generate=async()=>{
  if(busy||!name.trim()||!category||palette.length!==3)return;
  setBusy("generate");setError("");setProposal(null);
  try{
   if(!aiAvailable){
    const result=createSiteProposals(input);
    if(!result[0])throw Error("No se pudo preparar un diseño sin IA.");
    setProposal(result[0]);setProposalSignature(signature);go("preview");return;
   }
   const res=await askAi("/api/web-services/generate-site",{
    intake:input,direction:direction.trim().slice(0,360)
   });
   if(!res.proposal?.data)throw Error("La IA no devolvió una web editable.");
   setProposal(res.proposal as SiteProposal);setProposalSignature(signature);go("preview");
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
   // Never publish or overwrite. The catalog link points to the canonical
   // owner-scoped inventory only when the owner expressly chose Sí.
   setCreated(slug);
   const enabled=await db.from("smartjob_builder_sites")
    .update({
     inquiries_enabled:inquiries,
     inventory_connection_enabled:catalogChoice==="yes",
     inventory_business_id:catalogChoice==="yes"?workspaceId:null,
     services_connection_enabled:false,
     services_business_id:null,
     updated_at:new Date().toISOString()
    })
    .eq("id",result.data.siteId).eq("owner_id",owner).select("id").single();
   if(enabled.error||!enabled.data){
    setError("La web se creó, pero no se pudo configurar el formulario de solicitudes. Ábrela en Web Studio para revisarlo.");
    return;
   }
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
     onClick={()=>setMode("alternative")}>Crear una propuesta alternativa sin reemplazar la actual</button>:null}
   </div>
   {existing.length?<div className={styles.info}>
    <span>Encontré {existing.length} web(s) en tu cuenta.</span>
    <a href="/web-studio?mode=templates">Editar una web existente</a>
   </div>:<p className={styles.note}>Crearemos un borrador nuevo. No será público hasta que lo apruebes.</p>}
  </div>:null}
  {!loading&&owner&&stage==="catalog"?<div className={styles.panel}>
   <p className={styles.note}>Tu web puede mostrar el inventario de tu negocio, con precios y productos aprobados. Tú decides si autorizas esa conexión.</p>
   <div className={styles.optionsVertical}>
    <button type="button" className={catalogChoice==="yes"?styles.optionActive:styles.option}
     aria-pressed={catalogChoice==="yes"} onClick={()=>setCatalogChoice("yes")}>
     <Check size={17}/> Sí, conectar mi catálogo</button>
    <button type="button" className={catalogChoice==="no"?styles.optionActive:styles.option}
     aria-pressed={catalogChoice==="no"} onClick={()=>{setCatalogChoice("no");setInventoryItems([]);}}>
     No, crear la web sin acceso al inventario</button>
   </div>
   <p className={styles.note}>Si respondes No, la web no se conectará a Inventario ni mostrará sus precios y existencias.</p>
  </div>:null}
  {!loading&&owner&&stage==="products"&&catalogChoice==="yes"?<div className={styles.panel}>
   <p className={styles.note}>Todos tus productos están aquí. Edítalos o añade nuevos: se guardarán en el mismo Inventario de AI Agents, no en una lista paralela.</p>
   <AgentWebCatalogEditor workspaceId={workspaceId} onChange={setInventoryItems}/>
   <p className={styles.note}>Tu web mostrará los productos activos y aprobados. Los no aprobados seguirán en Inventario, pero no serán públicos.</p>
  </div>:null}
  {!loading&&owner&&stage==="contact"?<div className={styles.panel}>
   <p className={styles.note}>Tu agente ya conoce el teléfono y otros datos del negocio. Solo te preguntará lo que falta.</p>
   {(!email.trim()||returnToReview)?<label className={styles.field}>Correo comercial
    <input type="email" maxLength={180} value={email} placeholder="ventas@tunegocio.com"
     onChange={e=>{setEmail(e.target.value);setSkipEmail(false);}}/></label>:null}
   {!email.trim()?<label className={styles.checkLine}>
    <input type="checkbox" checked={skipEmail} onChange={e=>setSkipEmail(e.target.checked)}/>
    Mi web no tendrá correo por ahora</label>:null}
   {!phone.trim()||returnToReview?<label className={styles.field}>Teléfono (opcional)
    <input type="tel" maxLength={36} value={phone} onChange={e=>setPhone(e.target.value)}/></label>:null}
   {!city.trim()||returnToReview?<label className={styles.field}>Ciudad y estado (opcional)
    <input maxLength={180} value={city} onChange={e=>setCity(e.target.value)}/></label>:null}
   {returnToReview?<label className={styles.field}>Descripción del negocio
    <textarea rows={3} maxLength={500} value={about} onChange={e=>setAbout(e.target.value)}/></label>:null}
   <p className={styles.note}>Nunca se publicará tu domicilio privado automáticamente.</p>
  </div>:null}
  {!loading&&owner&&stage==="colors"?<div className={styles.panel}>
   <p className={styles.note}>Elige tres colores para la identidad de tu nueva web. El efecto suave de colores de AI Agents no altera esta selección.</p>
   <div className={styles.swatches} role="group" aria-label="Colores de la web">
    {colors.map(([label,hex])=><button key={hex} type="button"
     className={palette.includes(hex)?styles.swatchActive:styles.swatch}
     onClick={()=>toggleColor(hex)} aria-pressed={palette.includes(hex)} title={label}>
     <span style={{backgroundColor:hex}}/><small>{label}</small>{palette.includes(hex)?<Check size={14}/>:null}
    </button>)}
   </div>
   <p className={styles.note}>{palette.length}/3 colores elegidos.</p>
  </div>:null}
  {!loading&&owner&&stage==="typography"?<div className={styles.panel}>
   <p className={styles.note}>Selecciona la letra que mejor represente a tu negocio. Todos los ejemplos se ven antes de continuar.</p>
   <div className={styles.fontGrid} role="group" aria-label="Tipografías">
    {([
     ["modern","Moderna",'system-ui,-apple-system,"Segoe UI",sans-serif'],
     ["editorial","Editorial",'Georgia,"Times New Roman",serif'],
     ["rounded","Amigable",'"Trebuchet MS",system-ui,sans-serif'],
     ["geometric","Geométrica",'"Avenir Next",Montserrat,system-ui,sans-serif'],
     ["mono","Tecnológica",'ui-monospace,"SFMono-Regular",monospace'],
     ["classic","Clásica",'"Palatino Linotype",Palatino,serif'],
     ["humanist","Natural",'"Gill Sans",Calibri,system-ui,sans-serif'],
     ["luxury","Elegante",'"Baskerville","Times New Roman",serif']
    ] as const).map(([id,label,family])=><button key={id} type="button"
     className={font===id?styles.fontActive:styles.fontCard} aria-pressed={font===id}
     onClick={()=>setFont(id)}>
     <span className={styles.fontSample} style={{fontFamily:family}}>Aa</span>
     <strong style={{fontFamily:family}}>{label}</strong>
     {font===id?<Check size={16}/>:null}
    </button>)}
   </div>
  </div>:null}
  {!loading&&owner&&stage==="photography"?<div className={styles.panel}>
   <p className={styles.note}>Elige cómo se presentarán las fotografías. La vista previa muestra la diferencia de forma y composición.</p>
   <div className={styles.photoGrid} role="group" aria-label="Estilos de fotografías">
    {([
     ["rounded","Suaves"],["square","Modernas"],["pill","Orgánicas"],["bordered","Editoriales"]
    ] as const).map(([id,label])=><button type="button" key={id}
     className={shape===id?styles.photoActive:styles.photoCard}
     aria-pressed={shape===id} onClick={()=>setShape(id)}>
     <span className={styles.photoDemo+" "+styles["photo_"+id]}>
      <svg viewBox="0 0 140 95" role="img" aria-label={"Ejemplo "+label}>
       <rect width="140" height="95" fill="#e2ebe9"/>
       <circle cx="103" cy="23" r="11" fill="#ffd3a5"/>
       <path d="M0 89L41 33L68 61L96 38L140 90Z" fill="#72a4a2"/>
       <path d="M0 95L56 57L80 78L116 52L140 75V95Z" fill="#3c797b"/>
      </svg>
     </span>
     <span>{label}</span>{shape===id?<Check size={16}/>:null}
    </button>)}
   </div>
  </div>:null}
  {!loading&&owner&&stage==="media"?<div className={styles.panel}>
   <p className={styles.note}>Usa Subir imagen o Generar con IA. Después selecciona si es para el logo, la portada o la galería. Solo necesitas un logo y una portada; la galería admite hasta ocho fotos.</p>
   <AgentWebMediaPicker business={name} category={category}
    offer={uniqueOffers.slice(0,6).join(", ")||about}
    aiEnabled={imageAiReady} logo={logo} cover={cover} gallery={gallery}
    onLogo={setLogo} onCover={setCover} onGallery={setGallery}/>
  </div>:null}
  {!loading&&owner&&stage==="review"?<div className={styles.panel}>
   <p className={styles.note}>Esta es toda la configuración antes de generar. Usa el lápiz a la derecha para corregir cualquier dato sin empezar de nuevo.</p>
   <div className={styles.review}>
    {reviewCard("Negocio",name,"business")}
    {reviewCard("Proyecto",mode==="new"?"Página web nueva":"Propuesta alternativa","project")}
    {reviewCard("Conexión a Inventario",catalogChoice==="yes"?"Sí · catálogo conectado":"No · sin acceso al catálogo","catalog")}
    {catalogChoice==="yes"?reviewCard("Productos aprobados",
     products.length+" producto(s) · "+products.map(x=>x.name).join(", "),"products"):null}
    {reviewCard("Teléfono",phone||"Sin teléfono","contact")}
    {reviewCard("Correo",email||"Sin correo","contact")}
    {reviewCard("Ciudad",city||"No especificada","contact")}
    {reviewCard("Descripción",about||"Pendiente","contact")}
    {reviewCard("Colores",palette.join(" · "),"colors")}
    {reviewCard("Tipografía",font,"typography")}
    {reviewCard("Fotografías",shape,"photography")}
    {reviewCard("Logo",logo?"Imagen seleccionada":"Sin logo","media")}
    {reviewCard("Portada",cover?"Imagen seleccionada":"Sin portada","media")}
    {reviewCard("Galería",gallery.length+" de 8 imágenes","media")}
   </div>
   <p className={styles.note}>Al aprobar, el agente preparará una propuesta. Después podrás visualizarla y guardar un borrador editable en Web Studio. Ninguna página se publica automáticamente.</p>
  </div>:null}
  {!loading&&owner&&stage==="preview"?<div className={styles.panel}>
   {proposal&&proposalSignature===signature?<TemplateProposals input={input}
    generated={proposal} busy={Boolean(busy)}
    onBack={()=>{go("review");setProposal(null);}}
    onChoose={p=>{setProposal(p);setProposalSignature(signature);}}/>:
    <div className={styles.warning}>
     La propuesta debe generarse desde la Revisión. Si cambiaste datos, regresa, confirma la configuración y genera otra vez.
     <button type="button" className={styles.option} onClick={()=>go("review")}>Volver a Revisión</button>
    </div>}
  </div>:null}
  {error?<div role="alert" className={styles.error}>{error}
   {created?<a href={"/web-studio?mode=templates&open="+encodeURIComponent(created)}>
    Abrir el borrador creado en Web Studio</a>:null}
  </div>:null}
  {!loading&&owner?<div className={styles.footer}>
   {stage==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={Boolean(busy)||!name.trim()||!category||palette.length!==3||!validEmail(email)}
    onClick={()=>void generate()}>
    {busy==="generate"?<LoaderCircle size={18} className={styles.spin}/>:<Sparkles size={18}/>}
    {busy==="generate"?"Generando tu web…":"Aprobar y generar mi web"} <ArrowRight size={18}/></button>:
   stage==="preview"?<button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={Boolean(busy)||!proposal||proposalSignature!==signature||Boolean(created)}
    onClick={()=>void save()}>
    {busy==="save"?<LoaderCircle size={18} className={styles.spin}/>:<Globe2 size={18}/>}
    {busy==="save"?"Guardando…":"Guardar borrador y abrir Web Studio"} <ArrowRight size={18}/></button>:
   <button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={!validStage||Boolean(busy)} onClick={next}>
    {returnToReview?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={18}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> No se publica ninguna web sin tu aprobación.</p>
 </section>;
}
