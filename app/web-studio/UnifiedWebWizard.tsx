"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowRight,CheckCircle2,Globe,ImagePlus,LoaderCircle,Package,Plus,RefreshCw,ShieldCheck,Sparkles,X} from "lucide-react";
import BusinessCategoryPicker from "@/components/BusinessCategoryPicker";
import {getSupabase} from "@/lib/supabase";
import {provisionAiWorkspace} from "@/app/vista-app/ai-agents/centralBusiness";
import AgentWebCatalogEditor from "@/app/vista-app/ai-agents/AgentWebCatalogEditor";
import type {CatalogItem} from "@/app/vista-app/ai-agents/commerceStore";
import {accessibleAccent,onAccent,colorsAreDistinct} from "@/lib/web-builder-contrast";
import {applyChosenSiteDesign,createSiteProposals,familyForCategory,type SiteDesignPreferences,
 type SiteIntake,type SiteObjective,type SiteProduct,type SiteProposal} from "@/lib/web-builder-templates";
import {EMPTY_SOCIAL_LINKS,SOCIAL_PLATFORMS,normalizeSocialLinks,normalizeSocialUrl,type BusinessSocialLinks} from "@/lib/web-builder-social";
import {safeWebImageUrl} from "@/lib/web-services-site";
import BuilderImageField from "./BuilderImageField";
import ConnectedServicesEditor,{type ConnectedService} from "./ConnectedServicesEditor";
import TemplateProposals from "./TemplateProposals";
import styles from "./UnifiedWebWizard.module.css";

type Business={id:string;name:string;category_id:string;phone:string;email:string;
 city:string;region:string;description:string|null;social_links:unknown;
 logo_path:string|null;cover_path:string|null};
type FontId=SiteDesignPreferences["font"];
const fontChoices:{id:FontId;label:string;sample:string;fontFamily:string}[]=[
 {id:"modern",label:"Moderna",sample:"Diseño con identidad",fontFamily:"system-ui,sans-serif"},
 {id:"editorial",label:"Editorial",sample:"Diseño con identidad",fontFamily:"Georgia,serif"},
 {id:"rounded",label:"Redondeada",sample:"Diseño con identidad",fontFamily:"Trebuchet MS,sans-serif"},
 {id:"geometric",label:"Geométrica",sample:"Diseño con identidad",fontFamily:"Avenir Next,system-ui,sans-serif"},
 {id:"mono",label:"Tecnológica",sample:"Diseño con identidad",fontFamily:"Consolas,monospace"},
 {id:"classic",label:"Clásica",sample:"Diseño con identidad",fontFamily:"Palatino,Georgia,serif"},
 {id:"humanist",label:"Natural",sample:"Diseño con identidad",fontFamily:"Gill Sans,Calibri,sans-serif"},
 {id:"luxury",label:"Elegante",sample:"Diseño con identidad",fontFamily:"Baskerville,Georgia,serif"}
];
const colorGroups:{label:string;colors:[string,string,string]}[]=[
 {label:"Cálida",colors:["#9A3F60","#E6AC7C","#583C4C"]},
 {label:"Natural",colors:["#267658","#D1A368","#294A3A"]},
 {label:"Moderna",colors:["#31598C","#79BBC9","#283B53"]},
 {label:"Creativa",colors:["#7445A3","#EFA1AE","#4D356B"]}
];
const objectives:{id:SiteObjective;name:string}[]=[
 {id:"calls",name:"Llamadas"},{id:"quotes",name:"Presupuestos"},
 {id:"bookings",name:"Citas"},{id:"orders",name:"Pedidos"}
];
const money=(n:number|null)=>n===null?"Consultar precio":"$"+(n/100).toFixed(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function UnifiedWebWizard({ownerId,busy,onChoose}:{
 ownerId:string;busy:boolean;onChoose:(input:SiteIntake,proposal:SiteProposal)=>void;
}){
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [profileFallback,setProfileFallback]=useState({name:"",phone:"",city:"",category:""});
 const [loading,setLoading]=useState(true);
 const [workspace,setWorkspace]=useState("");
 const [workspaceBusy,setWorkspaceBusy]=useState(false);
 const [workspaceError,setWorkspaceError]=useState("");
 const [products,setProducts]=useState<CatalogItem[]>([]);
 const [services,setServices]=useState<ConnectedService[]>([]);
 const [connectProducts,setConnectProducts]=useState(true);
 const [connectServices,setConnectServices]=useState(true);
 const [goal,setGoal]=useState<SiteObjective>("quotes");
 const [colors,setColors]=useState<string[]>([...colorGroups[0].colors]);
 const [font,setFont]=useState<FontId>("modern");
 const [logo,setLogo]=useState("");
 const [cover,setCover]=useState("");
 const [gallery,setGallery]=useState<string[]>([]);
 const [socials,setSocials]=useState<BusinessSocialLinks>({...EMPTY_SOCIAL_LINKS});
 const [chat,setChat]=useState(false);
 const [direction,setDirection]=useState("");
 const [aiReady,setAiReady]=useState<"checking"|"ready"|"unavailable">("checking");
 const [aiReason,setAiReason]=useState("");
 const [generateBusy,setGenerateBusy]=useState(false);
 const [error,setError]=useState("");
 const [proposal,setProposal]=useState<SiteProposal|null>(null);
 const [selectedInput,setSelectedInput]=useState<SiteIntake|null>(null);
 const [refreshKey,setRefreshKey]=useState(0);
 const [manualFallback,setManualFallback]=useState(false);
 const [retryAi,setRetryAi]=useState(0);
 const selected=businesses.find(b=>b.id===businessId)||null;
 const name=selected?.name||profileFallback.name;
 const category=selected?.category_id||profileFallback.category;
 const phone=selected?.phone||profileFallback.phone;
 const email=selected?.email||"";
 const city=selected?[selected.city,selected.region].filter(Boolean).join(", "):profileFallback.city;
 const about=selected?.description||"";
 const approvedProducts=products.filter(p=>p.approved&&p.active);
 const approvedServices=services.filter(s=>s.approved&&s.active);
 const activeAccent=accessibleAccent(colors[0]||"#9A3F60");
 const handleProducts=useCallback((items:CatalogItem[])=>setProducts(items),[]);
 const handleServices=useCallback((items:ConnectedService[])=>setServices(items),[]);
 useEffect(()=>{
  let mounted=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
    const {data:{user}}=await db.auth.getUser();
    if(!user||user.is_anonymous||user.id!==ownerId)throw Error("La sesión no está disponible.");
    const [central,profile,prefs]=await Promise.all([
     db.from("vmv_marketing_businesses")
      .select("id,name,category_id,phone,email,city,region,description,social_links,logo_path,cover_path")
      .eq("owner_id",ownerId).order("updated_at",{ascending:false}).limit(80),
     db.from("smartjob_profiles").select("business_name,phone,city,state").eq("id",ownerId).maybeSingle(),
     db.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",ownerId).maybeSingle()
    ]);
    if(central.error)throw Error("No se pudieron recuperar los negocios de tu perfil.");
    if(!mounted)return;
    const list=(central.data||[]) as Business[];
    setBusinesses(list);setBusinessId(old=>old||list[0]?.id||"");
    setProfileFallback({name:profile.data?.business_name||"",
     phone:profile.data?.phone||"",city:[profile.data?.city,profile.data?.state].filter(Boolean).join(", "),
     category:prefs.data?.category_id||""});
   }catch(e){if(mounted)setError(e instanceof Error?e.message:"No se pudo cargar tu perfil.");}
   finally{if(mounted)setLoading(false);}
  })();
  return()=>{mounted=false};
 },[ownerId]);
 useEffect(()=>{
  if(!selected){setSocials({...EMPTY_SOCIAL_LINKS});return;}
  setSocials(normalizeSocialLinks(selected.social_links));
  setLogo(safeWebImageUrl(selected.logo_path||"")||"");
  setCover(safeWebImageUrl(selected.cover_path||"")||"");
  setGallery([]);setProposal(null);setWorkspace("");
  setProducts([]);setServices([]);setWorkspaceError("");
  setRefreshKey(n=>n+1);
 },[businessId,selected?.id]);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();
  void(async()=>{
   setAiReady("checking");setAiReason("");
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo conectar a VMV.");
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw Error("Inicia sesión.");
    const res=await fetch("/api/web-services/generate-site",{cache:"no-store",
     headers:{Authorization:"Bearer "+session.access_token},signal:controller.signal});
    const body=await res.json().catch(()=>({})) as {enabled?:boolean;reason?:string};
    if(!res.ok||body.enabled!==true)throw Error(body.reason||"La IA está temporalmente no disponible.");
    if(alive)setAiReady("ready");
   }catch(e){
    if(alive){setAiReady("unavailable");
     setAiReason(e instanceof Error?e.message:"La IA no respondió.");}
   }
  })();
  return()=>{alive=false;controller.abort();};
 },[ownerId,retryAi]);
 useEffect(()=>{
  if(!selected||(!connectProducts&&!connectServices))return;
  let current=true;setWorkspaceBusy(true);
  void provisionAiWorkspace(selected.id).then(id=>{
   if(current&&uuid.test(id)){setWorkspace(id);setWorkspaceError("");}
  }).catch(e=>{if(current){setWorkspace("");setWorkspaceError(e instanceof Error?e.message:"No se pudo conectar el catálogo.");}})
   .finally(()=>{if(current)setWorkspaceBusy(false)});
  return()=>{current=false};
 },[selected?.id,connectProducts,connectServices]);
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==="visible")setRefreshKey(n=>n+1)};
  window.addEventListener("focus",refresh);
  document.addEventListener("visibilitychange",refresh);
  return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
 },[]);
 const input=useMemo<SiteIntake>(()=>{
  const showProducts=connectProducts&&Boolean(workspace);
  const showServices=connectServices&&Boolean(workspace);
  const productItems:SiteProduct[]=showProducts?approvedProducts.slice(0,30).map(p=>({
   id:p.id,title:p.name,description:p.description||"",
   image:"",price:money(p.price_cents)
  })):[];
  const serviceItems=showServices?approvedServices.slice(0,30).map(p=>p.name):[];
  return {business:name.trim(),categoryId:category||"other",offering:showProducts&&showServices?"both":
    showProducts?"products":"services",objective:goal,phone,email,city,about,
   logo,photos:[cover,...gallery].filter(Boolean).slice(0,12),
   products:productItems,offerings:serviceItems,socials:normalizeSocialLinks(socials),
   sourceBusinessId:businessId,agentWorkspaceId:workspace,
   connectInventory:showProducts,connectServices:showServices,
   design:{colors,font,imageStyle:"square",galleryColumns:"3",
    features:{inventory:showProducts,booking:goal==="bookings",chat},
    chatMode:chat?"inbox":"off"}};
 },[name,category,goal,phone,email,city,about,logo,cover,gallery,
  approvedProducts,approvedServices,connectProducts,connectServices,workspace,businessId,colors,font,chat,socials]);
 async function generate(useAi:boolean){
  if(busy||generateBusy)return;
  if(!input.business.trim()||input.business.trim().length<2||!input.categoryId){
   setError("Configura el nombre y la categoría de tu negocio en el perfil de VMV.");return;
  }
  if(!colorsAreDistinct(colors)){setError("Selecciona tres colores diferentes.");return;}
  const invalid=SOCIAL_PLATFORMS.find(p=>socials[p.id].trim()&&!normalizeSocialUrl(socials[p.id],p.id));
  if(invalid){setError("Corrige el enlace de "+invalid.label+".");return;}
  if((connectProducts||connectServices)&&selected&&(!workspace||workspaceBusy||workspaceError)){
   setError("No se ha confirmado la conexión con los catálogos. Inténtalo nuevamente.");return;
  }
  if(useAi&&aiReady!=="ready"){setError(aiReason||"La IA no está disponible.");return;}
  setGenerateBusy(true);setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo abrir VMV.");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Vuelve a iniciar sesión.");
   let ready:SiteProposal;
   if(useAi){
    const res=await fetch("/api/web-services/generate-site",{
     method:"POST",cache:"no-store",
     headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
     body:JSON.stringify({intake,direction:direction.trim()})
    });
    const result=await res.json().catch(()=>({})) as {proposal?:SiteProposal;error?:string};
    if(!res.ok||!result.proposal?.data)throw Error(result.error||"La IA no pudo preparar una propuesta.");
    ready=result.proposal;
   }else{
    const layout=familyForCategory(input.categoryId)==="construction"?1:2;
    ready=createSiteProposals(input,familyForCategory(input.categoryId))[layout];
    ready={...ready,id:"personalized-"+ready.id,name:"Propuesta profesional",
     subtitle:"Una estructura editable con los datos de tu negocio",aiGenerated:false};
   }
   let doc=applyChosenSiteDesign(ready.data,input.design);
   if(input.connectInventory||input.connectServices){
    const rawContent=[...doc.content];
    const firstIndex=rawContent.findIndex(block=>block.type==="OfferingGrid");
    if(firstIndex>=0){
     const first=rawContent[firstIndex];
     if(input.connectInventory&&input.connectServices){
      rawContent[firstIndex]={...first,props:{...first.props,id:"connected-catalog",
       title:"Nuestros productos",items:input.products||[],showPrices:"yes"}};
      rawContent.splice(firstIndex+1,0,{type:"OfferingGrid",props:{
       id:"connected-services",title:"Nuestros servicios",description:"",
       items:input.offerings.map((name,i)=>({id:"service-"+i,title:name,description:"",price:"",image:""})),
       layout:"grid",columns:"3",padding:"normal",surface:"light",showPrices:"no"
      }});
     }else if(input.connectServices){
      rawContent[firstIndex]={...first,props:{...first.props,id:"connected-services",
       title:"Nuestros servicios",
       items:input.offerings.map((name,i)=>({id:"service-"+i,title:name,description:"",price:"",image:""})),
       showPrices:"no"}};
     }else{
      rawContent[firstIndex]={...first,props:{...first.props,id:"connected-catalog",
       title:"Nuestros productos",items:input.products||[],showPrices:"yes"}};
     }
    }
    doc={...doc,content:rawContent};
   }
   setSelectedInput(input);setProposal({...ready,data:doc});
  }catch(e){setError(e instanceof Error?e.message:"No pudimos crear tu propuesta.");}
  finally{setGenerateBusy(false);}
 }
 if(proposal&&selectedInput)return <TemplateProposals
  input={selectedInput} generated={proposal} busy={busy||generateBusy}
  onBack={()=>{setProposal(null);setSelectedInput(null);}}
  onChoose={ready=>onChoose(selectedInput,ready)}/>;
 return <section className={styles.root} aria-label="Crear web profesional">
  <header className={styles.heading}>
   <span><Sparkles size={15}/> VMV WEB STUDIO</span>
   <h1>Tu web, lista para destacar.</h1>
   <p>Una sola configuración. Recuperamos los datos reales del negocio y creamos una propuesta adaptada a escritorio y móvil.</p>
  </header>
  {loading?<p role="status">Cargando tus negocios…</p>:<>
  <div className={styles.section}>
   <div className={styles.sectionTitle}><b>01</b><div><h2>Tu negocio</h2>
    <p>Usamos tu perfil de VMV. Puedes cambiar de negocio sin copiar datos.</p></div></div>
   {businesses.length?<label>Negocio a utilizar
    <select value={businessId} onChange={e=>setBusinessId(e.target.value)}>
     {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
    </select></label>:<p role="alert">Aún no hay un negocio central configurado. Completa tu perfil de negocio en VMV Business para conectar Inventario y Servicios.</p>}
   <div className={styles.businessSummary}>
    <div><strong>{name||"Negocio sin nombre"}</strong><small>{city||"Ubicación pendiente"}</small></div>
    <span>{category||"Categoría por completar"}</span>
   </div>
   {selected?<small>Teléfono: {phone||"No indicado"} · Email: {email||"No indicado"}. Para corregir datos oficiales utiliza el perfil del negocio en VMV.</small>:null}
  </div>
  <div className={styles.section}>
   <div className={styles.sectionTitle}><b>02</b><div><h2>Objetivo y conexiones</h2>
    <p>Selecciona lo que deseas lograr; solo activaremos funciones reales.</p></div></div>
   <div className={styles.goalGrid}>{objectives.map(o=>
    <button type="button" key={o.id} aria-pressed={goal===o.id}
     onClick={()=>setGoal(o.id)}>{o.name}</button>)}</div>
   <div className={styles.connectionRows}>
    <label><input type="checkbox" checked={connectProducts}
     onChange={e=>setConnectProducts(e.target.checked)} disabled={!selected}/>
     <Package size={19}/> Conectar inventario de productos</label>
    <label><input type="checkbox" checked={connectServices}
     onChange={e=>setConnectServices(e.target.checked)} disabled={!selected}/>
     <CheckCircle2 size={19}/> Conectar servicios de AI Agents</label>
    <label><input type="checkbox" checked={chat}
     onChange={e=>setChat(e.target.checked)}/>
     <Globe size={19}/> Mostrar botón de chat / consultas en VMV</label>
    {chat?<small>El chat recibe consultas en tu bandeja. Un agente automático requiere configurar sus permisos y conexión.</small>:null}
   </div>
   {workspaceBusy?<p role="status">Conectando los catálogos del negocio…</p>:null}
   {workspaceError?<p role="alert">{workspaceError}</p>:null}
   {workspace&&(connectProducts||connectServices)?<>
    {connectProducts?<div className={styles.catalogBlock}>
     <h3>Productos sincronizados · {approvedProducts.length} aprobados</h3>
     <AgentWebCatalogEditor key={workspace+"-p-"+refreshKey} workspaceId={workspace}
      onChange={handleProducts}/>
    </div>:null}
    {connectServices?<div className={styles.catalogBlock}>
     <h3>Servicios sincronizados · {approvedServices.length} aprobados</h3>
     <ConnectedServicesEditor key={workspace+"-s-"+refreshKey} workspaceId={workspace}
      onChange={handleServices}/>
    </div>:null}
   </>:null}
   <small>Los productos y servicios se guardan en AI Agents y la web pública lee las listas aprobadas del mismo negocio. La web nunca administra inventario de otro negocio.</small>
  </div>
  <div className={styles.section}>
   <div className={styles.sectionTitle}><b>03</b><div><h2>Identidad visual</h2>
    <p>Elige tres colores y una tipografía. El sistema ajusta el contraste automáticamente.</p></div></div>
   <div className={styles.presets}>{colorGroups.map(group=>
    <button type="button" key={group.label} onClick={()=>setColors([...group.colors])}>
     {group.colors.map(hex=><i key={hex} style={{backgroundColor:hex}}/>)} {group.label}
    </button>)}</div>
   <div className={styles.colorPickers}>
    {["Principal","Secundario","Detalle"].map((label,index)=>
     <label key={label}>{label}<input type="color" value={colors[index]||"#7C488F"}
      onChange={e=>setColors(old=>old.map((v,i)=>i===index?e.target.value:v))}/></label>)}
   </div>
   <div className={styles.contrastPreview}>
    <span style={{color:activeAccent}}>Texto de ejemplo sobre fondo claro</span>
    <strong style={{background:activeAccent,color:onAccent(activeAccent)}}>Botón legible</strong>
    <small>Si eliges un color muy claro, VMV utiliza su variante con contraste suficiente para botones y textos.</small>
   </div>
   <div className={styles.fontGrid}>{fontChoices.map(item=>
    <button type="button" key={item.id} aria-pressed={font===item.id}
     onClick={()=>setFont(item.id)}>
     <small>{item.label}</small><strong style={{fontFamily:item.fontFamily}}>{item.sample}</strong>
    </button>)}</div>
   <div className={styles.media}>
    <div><strong>Logo (opcional)</strong><BuilderImageField kind="logo" value={logo} onChange={setLogo}/></div>
    <div><strong>Portada (opcional)</strong><BuilderImageField value={cover} onChange={setCover}/></div>
    {gallery.map((photo,index)=><div key={index}>
     <strong>Foto adicional {index+1}</strong>
     <BuilderImageField value={photo} onChange={url=>setGallery(old=>old.map((p,i)=>i===index?url:p))}/>
     <button type="button" onClick={()=>setGallery(old=>old.filter((_,i)=>i!==index))}>Quitar espacio</button>
    </div>)}
   </div>
   {gallery.length<10?<button type="button" className={styles.secondary}
    onClick={()=>setGallery(old=>[...old,""])}><ImagePlus size={16}/> Añadir foto opcional</button>:null}
   <small>Si tu cuenta tiene activada la generación de imágenes, podrás utilizarla desde «Mis imágenes». No se inventarán fotos de productos.</small>
  </div>
  <div className={styles.section}>
   <div className={styles.sectionTitle}><b>04</b><div><h2>Redes sociales y últimos detalles</h2>
    <p>Opcionales. Añade los enlaces oficiales de tu negocio.</p></div></div>
   <div className={styles.socialGrid}>{SOCIAL_PLATFORMS.map(platform=>
    <label key={platform.id}>{platform.label}
     <input inputMode="url" type="url" maxLength={500} placeholder={platform.placeholder}
      value={socials[platform.id]} onChange={e=>setSocials(old=>({...old,[platform.id]:e.target.value}))}/>
    </label>)}</div>
   <label>¿Cómo te imaginas tu web? (opcional)
    <textarea rows={3} maxLength={400} value={direction}
     onChange={e=>setDirection(e.target.value)}
     placeholder="Por ejemplo: moderna, elegante, fotografías grandes y un botón de contacto visible."/>
   </label>
  </div>
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <footer className={styles.finish}>
   <small><ShieldCheck size={16}/> Solo se crea un borrador. Nadie publica sin tu aprobación.</small>
   <div>
    {aiReady==="checking"?<span role="status">Comprobando IA…</span>:
     aiReady==="unavailable"?<span role="status">IA no disponible: {aiReason}
      <button type="button" onClick={()=>setRetryAi(n=>n+1)}><RefreshCw size={15}/> Reintentar</button>
     </span>:<span role="status">IA de VMV conectada.</span>}
    <button type="button" disabled={busy||generateBusy||loading||(connectProducts||connectServices)&&workspaceBusy}
     onClick={()=>void generate(aiReady==="ready")}>
     {generateBusy?<LoaderCircle size={18}/>:<Sparkles size={18}/>}
     {generateBusy?"Creando tu propuesta…":aiReady==="ready"?"Crear mi web con IA":"Ver propuesta sin IA"}
     <ArrowRight size={17}/>
    </button>
   </div>
  </footer>
  </>}
 </section>;
}
