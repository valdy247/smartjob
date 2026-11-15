"use client";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Image as ImageIcon,LoaderCircle,MessageCircle,Package,CalendarDays,Sparkles,ShieldCheck} from "lucide-react";
import BusinessCategoryPicker from "@/components/BusinessCategoryPicker";
import {getSupabase} from "@/lib/supabase";
import {normalizeSocialLinks} from "@/lib/web-builder-social";
import type {SiteIntake,SiteProposal,SiteProduct,SiteDesignPreferences} from "@/lib/web-builder-templates";
import TemplateProposals from "./TemplateProposals";
import BuilderImageField from "./BuilderImageField";
import styles from "./WebAiWizard.module.css";

type Business={
 id:string;name:string;category_id:string;phone:string;email:string;city:string;region:string;
 description:string;services:string;products:string;social_links:Record<string,string>|null;
};
type Profile={business_name?:string|null;phone?:string|null;city?:string|null;state?:string|null};
type FontId="modern"|"editorial"|"rounded"|"geometric";
type ImageShape="rounded"|"square"|"pill"|"bordered";
type Form={business:string;categoryId:string;phone:string;email:string;city:string;about:string;services:string;objective:"calls"|"quotes"|"bookings"|"orders"};
const empty:Form={business:"",categoryId:"",phone:"",email:"",city:"",about:"",services:"",objective:"quotes"};
const palette=[
 ["Cereza","#C13D68"],["Rosa","#EE8AA9"],["Coral","#F17969"],["Salmón","#F9A08B"],
 ["Naranja","#EF8B3A"],["Ámbar","#D5A13F"],["Oro","#BC954A"],["Limón","#E2CF61"],
 ["Oliva","#8D9851"],["Verde hoja","#559B68"],["Esmeralda","#239C83"],["Menta","#79CEB8"],
 ["Turquesa","#36B2BA"],["Aguamarina","#81CEDE"],["Azul cielo","#75B8E9"],["Azul","#377FC4"],
 ["Marino","#293F77"],["Lavanda","#A18CE9"],["Violeta","#835CD5"],["Ciruela","#76507E"],
 ["Arcilla","#AA6B58"],["Chocolate","#705345"],["Grafito","#3D4052"],["Marfil","#F3E9D7"]
] as const;
const fonts:{id:FontId;label:string;sample:string;css:string}[]=[
 {id:"modern",label:"Moderna",sample:"Diseñamos tu futuro",css:"system-ui,-apple-system,Segoe UI,sans-serif"},
 {id:"editorial",label:"Editorial",sample:"Diseñamos tu futuro",css:"Georgia,Times New Roman,serif"},
 {id:"rounded",label:"Redondeada",sample:"Diseñamos tu futuro",css:"Trebuchet MS,system-ui,sans-serif"},
 {id:"geometric",label:"Geométrica",sample:"Diseñamos tu futuro",css:"Avenir Next,Montserrat,system-ui,sans-serif"}
];
const shapes:{id:ImageShape;label:string;description:string}[]=[
 {id:"rounded",label:"Suaves",description:"Esquinas redondeadas"},
 {id:"square",label:"Rectas",description:"Bordes rectos"},
 {id:"pill",label:"Orgánicas",description:"Curvas pronunciadas"},
 {id:"bordered",label:"Con marco",description:"Contorno destacado"}
];
const stepNames=["Tu negocio","3 colores","Tipografía","Imágenes","Conexiones","Confirmar"];
const toServices=(s:string)=>s.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean).slice(0,20);
const fmtPrice=(cents:number)=>"$"+(cents/100).toFixed(2);
export default function WebAiWizard({ownerId,busy,onChoose}:{ownerId:string;busy:boolean;onChoose:(input:SiteIntake,proposal:SiteProposal)=>void}){
 const [step,setStep]=useState(0);
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [form,setForm]=useState<Form>(empty);
 const [socials,setSocials]=useState<Record<string,string>>({});
 const [source,setSource]=useState("");
 const [loading,setLoading]=useState(true);
 const [colors,setColors]=useState<string[]>([]);
 const [font,setFont]=useState<FontId>("modern");
 const [shape,setShape]=useState<ImageShape>("rounded");
 const [inventory,setInventory]=useState(false);
 const [booking,setBooking]=useState(false);
 const [chat,setChat]=useState(false);
 const [agentCount,setAgentCount]=useState(0);
 const [catalog,setCatalog]=useState<SiteProduct[]>([]);
 const [logo,setLogo]=useState("");
 const [cover,setCover]=useState("");
 const [context,setContext]=useState("");
 const [aiState,setAiState]=useState<"checking"|"ready"|"unavailable">("checking");
 const [aiError,setAiError]=useState("");
 const [error,setError]=useState("");
 const [generating,setGenerating]=useState(false);
 const [proposal,setProposal]=useState<SiteProposal|null>(null);
 const applyBusiness=(b:Business)=>{
  setBusinessId(b.id);setForm({business:b.name||"",categoryId:b.category_id||"",phone:b.phone||"",
   email:b.email||"",city:[b.city,b.region].filter(Boolean).join(", "),about:b.description||"",
   services:b.services||"",objective:"quotes"});
  setSocials(b.social_links||{});setSource("Perfil central de VMV");
 };
 useEffect(()=>{
  let active=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw new Error("Servicio no disponible");
    const {data:auth}=await db.auth.getUser();
    if(auth.user?.id!==ownerId||auth.user.is_anonymous)throw new Error("Inicia sesión.");
    const [b,p,pref]=await Promise.all([
     db.from("vmv_marketing_businesses").select("id,name,category_id,phone,email,city,region,description,services,products,social_links").eq("owner_id",ownerId).order("updated_at",{ascending:false}).limit(30),
     db.from("smartjob_profiles").select("business_name,phone,city,state").eq("id",ownerId).maybeSingle(),
     db.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",ownerId).maybeSingle()
    ]);
    if(!active)return;
    const saved=(b.data||[]) as Business[];
    setBusinesses(saved);
    if(saved.length)applyBusiness(saved[0]);
    else{
     const profile=(p.data||{}) as Profile;
     setForm(old=>({...old,business:profile.business_name||"",phone:profile.phone||"",
      city:[profile.city,profile.state].filter(Boolean).join(", "),categoryId:String(pref.data?.category_id||"")}));
     setSource("Datos de tu cuenta VMV");
    }
   }catch{if(active)setSource("Completa tu información manualmente");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[ownerId]);
 useEffect(()=>{
  let active=true;const abort=new AbortController();
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw new Error("Conexión no disponible");
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw new Error("Inicia sesión para utilizar IA");
    const res=await fetch("/api/web-services/generate-site",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store",signal:abort.signal});
    const info=await res.json() as {enabled?:boolean;reason?:string};
    if(!res.ok||!info.enabled)throw new Error(info.reason||"La generación de IA no está conectada");
    if(active)setAiState("ready");
   }catch(e){if(active){setAiState("unavailable");setAiError(e instanceof Error?e.message:"IA no disponible");}}
  })();
  return()=>{active=false;abort.abort();};
 },[ownerId]);
 useEffect(()=>{
  if(!businessId){setCatalog([]);setAgentCount(0);return;}
  let active=true;
  void(async()=>{
   const db=getSupabase();if(!db)return;
   try{
    const {data:workspaces}=await db.from("vmv_ai_businesses").select("id").eq("owner_id",ownerId).eq("central_business_id",businessId).limit(1);
    const workspace=workspaces?.[0]?.id;if(!workspace)return;
    const [items,agents]=await Promise.all([
     db.from("vmv_ai_catalog_items").select("id,name,description,price_cents,active,approved").eq("owner_id",ownerId).eq("business_id",workspace).eq("active",true).eq("approved",true).limit(30),
     db.from("vmv_ai_agents").select("id").eq("owner_id",ownerId).eq("business_id",workspace).eq("status","active").limit(10)
    ]);
    if(!active)return;
    setCatalog((items.data||[]).map(p=>({id:p.id,title:p.name,description:p.description||"",
     price:typeof p.price_cents==="number"?fmtPrice(p.price_cents):"",image:""})));
    setAgentCount((agents.data||[]).length);
   }catch{if(active){setCatalog([]);setAgentCount(0);}}
  })();
  return()=>{active=false;};
 },[ownerId,businessId]);
 const selectedBusiness=businesses.find(b=>b.id===businessId);
 const patch=(field:keyof Form,value:string)=>{setForm(old=>({...old,[field]:value}));setError("");};
 const toggleColor=(hex:string)=>{
  setColors(old=>old.includes(hex)?old.filter(x=>x!==hex):old.length<3?[...old,hex]:[...old.slice(1),hex]);
  setError("");
 };
 const next=()=>{
  if(step===0){
   if(form.business.trim().length<2||!form.categoryId){setError("Completa el nombre y la categoría del negocio.");return;}
   if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setError("Revisa el correo comercial.");return;}
  }
  if(step===1&&colors.length!==3){setError("Selecciona exactamente tres colores.");return;}
  setError("");setStep(s=>Math.min(5,s+1));
 };
 const selectedDesign=useMemo<SiteDesignPreferences>(()=>({colors,font,imageStyle:shape,features:{inventory,booking,chat},
  chatMode:chat?"inbox":"off"}),[colors,font,shape,inventory,booking,chat]);
 const input=useMemo<SiteIntake>(()=>{
  const services=toServices(form.services);
  const products=inventory?(catalog.length?catalog:toServices(selectedBusiness?.products||"").map((title,i)=>({id:"business-product-"+i,title,description:"",price:"",image:""}))):[];
  return {business:form.business.trim(),categoryId:form.categoryId,offering:inventory?(services.length?"both":"products"):"services",
   objective:booking?"bookings":form.objective,phone:form.phone.trim(),email:form.email.trim(),
   city:form.city.trim(),about:form.about.trim(),logo,photos:cover?[cover]:[],offerings:services,
   products,socials:normalizeSocialLinks(socials),design:selectedDesign};
 },[form,inventory,booking,catalog,socials,selectedDesign,logo,cover,selectedBusiness]);
 const generate=async()=>{
  if(busy||generating)return;
  if(colors.length!==3){setError("Selecciona tres colores.");setStep(1);return;}
  if(aiState!=="ready"){setError(aiError||"No se ha conectado el generador de IA.");return;}
  setGenerating(true);setError("");
  try{
   const db=getSupabase();if(!db)throw Error("Inicia sesión");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión de nuevo.");
   const res=await fetch("/api/web-services/generate-site",{
    method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
    body:JSON.stringify({intake:input,direction:context.trim().slice(0,360)})
   });
   const result=await res.json() as {proposal?:SiteProposal;error?:string};
   if(!res.ok||!result.proposal?.data)throw Error(result.error||"No pudimos crear el diseño.");
   setProposal(result.proposal);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear el diseño.");}
  finally{setGenerating(false);}
 };
 if(proposal)return <TemplateProposals input={input} generated={proposal} busy={busy} onBack={()=>setProposal(null)}
  onChoose={p=>onChoose(input,p)}/>;
 return <section className={styles.root}>
  <header className={styles.heading}><span><Sparkles size={16}/> VMV AI WEB STUDIO</span>
   <h1>Diseña una web que se parezca a tu negocio<span>.</span></h1>
   <p>Usaremos la información que ya tiene VMV. Puedes corregirla antes de generar.</p></header>
  <nav className={styles.steps} aria-label="Pasos de creación">{stepNames.map((n,i)=>
   <button key={n} type="button" aria-current={step===i?"step":undefined} disabled={i>step||busy||generating}
    onClick={()=>{setStep(i);setError("");}}><b>{i<step?<Check size={14}/>:i+1}</b><span>{n}</span></button>)}</nav>
  {step===0?<div className={styles.panel}>
   <h2>01 · Tu negocio y sus datos</h2>
   <p>Un solo perfil para Marketing, agentes y Web Services. Esta copia es editable y no cambia tu perfil central.</p>
   {loading?<p role="status"><LoaderCircle size={15}/> Cargando tu negocio…</p>:null}
   {businesses.length?<label>Negocio de VMV<select value={businessId} onChange={e=>{const b=businesses.find(x=>x.id===e.target.value);if(b){applyBusiness(b);setCatalog([]);setError("");}}}>
    {businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>:null}
   <small className={styles.source}><CheckCircle2 size={15}/> {source||"Datos editables"}</small>
   <div className={styles.fields}>
    <label>Nombre comercial<input value={form.business} maxLength={100} onChange={e=>patch("business",e.target.value)}/></label>
    <label>Categoría<BusinessCategoryPicker value={form.categoryId} onChange={v=>patch("categoryId",v)}/></label>
    <label>Teléfono<input type="tel" maxLength={36} value={form.phone} onChange={e=>patch("phone",e.target.value)}/></label>
    <label>Correo<input type="email" maxLength={180} value={form.email} onChange={e=>patch("email",e.target.value)}/></label>
    <label>Ciudad y zona<input maxLength={180} value={form.city} onChange={e=>patch("city",e.target.value)}/></label>
    <label>Objetivo<select value={form.objective} onChange={e=>patch("objective",e.target.value)}>
     <option value="quotes">Conseguir consultas y presupuestos</option><option value="calls">Recibir llamadas</option>
     <option value="bookings">Solicitar citas</option><option value="orders">Consultar pedidos</option></select></label>
   </div>
   <label>Descripción del negocio<textarea value={form.about} rows={3} maxLength={500} onChange={e=>patch("about",e.target.value)}/></label>
   <label>Servicios principales (uno por línea)<textarea value={form.services} rows={3} maxLength={1000} onChange={e=>patch("services",e.target.value)}/></label>
   {selectedBusiness?.products?<small className={styles.note}>VMV también conserva los productos descritos en tu perfil. El catálogo verificado se carga si activas Inventario.</small>:null}
  </div>:null}
  {step===1?<div className={styles.panel}>
   <h2>02 · Selecciona 3 colores para tu web</h2><p>El orden importa: principal, secundario y detalles. Puedes cambiar cualquiera.</p>
   <div className={styles.colorGrid}>{palette.map(([name,hex])=>{const rank=colors.indexOf(hex);
    return <button key={hex} type="button" className={styles.colorTile} aria-pressed={rank>=0}
     onClick={()=>toggleColor(hex)} title={name+" · "+hex}>
     <span className={styles.swatch} style={{backgroundColor:hex}}>{rank>=0?<b>{rank+1}</b>:null}</span>
     <small>{name}</small></button>})}</div>
   <div className={styles.palettePreview}><strong>{colors.length}/3 colores</strong>
    <div>{colors.map((hex,i)=><span key={hex} style={{background:hex,color:i===0?"#fff":"#201a29"}}>{["Principal","Secundario","Detalle"][i]}</span>)}</div></div>
  </div>:null}
  {step===2?<div className={styles.panel}>
   <h2>03 · ¿Qué tipografía te representa?</h2><p>Prueba estas fuentes populares. Quedará disponible para ajustar en el Editor 2.0.</p>
   <div className={styles.fontGrid}>{fonts.map(item=><button type="button" key={item.id} aria-pressed={font===item.id}
    onClick={()=>setFont(item.id)}><small>{item.label}</small><strong style={{fontFamily:item.css}}>{item.sample}</strong></button>)}</div>
  </div>:null}
  {step===3?<div className={styles.panel}>
   <h2>04 · ¿Cómo quieres presentar tus imágenes?</h2><p>El marco elegido se aplicará a la imagen principal y podrás ajustarlo después.</p>
   <div className={styles.imageSelectors}>
    <div><strong>Logo del negocio</strong><BuilderImageField kind="logo" value={logo} onChange={setLogo}/></div>
    <div><strong>Foto de portada</strong><BuilderImageField value={cover} onChange={setCover}/></div>
   </div>
   <div className={styles.shapeGrid}>{shapes.map(item=><button type="button" key={item.id}
    aria-pressed={shape===item.id} onClick={()=>setShape(item.id)}>
    <span className={styles.shapePreview} data-shape={item.id}><ImageIcon size={33}/></span>
    <strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
  </div>:null}
  {step===4?<div className={styles.panel}>
   <h2>05 · Conecta las herramientas de tu negocio</h2><p>Solo activamos funciones que tienen un camino real para recibir solicitudes. Ninguna conexión cobra ni publica nada.</p>
   <label className={styles.feature}><input type="checkbox" checked={inventory} onChange={e=>setInventory(e.target.checked)}/><Package size={24}/>
    <span><strong>Inventario y productos</strong><small>Crear sección editable con productos aprobados del catálogo de este negocio. {catalog.length} disponibles.</small></span></label>
   <label className={styles.feature}><input type="checkbox" checked={booking} onChange={e=>setBooking(e.target.checked)}/><CalendarDays size={24}/>
    <span><strong>Citas y agenda</strong><small>Mostrar «Solicitar cita». Las solicitudes llegan a VMV; la reserva automática requiere otra conexión.</small></span></label>
   <label className={styles.feature}><input type="checkbox" checked={chat} onChange={e=>setChat(e.target.checked)}/><MessageCircle size={24}/>
    <span><strong>Botón de chat en la web</strong><small>Recibe las consultas en la bandeja de Web Services dentro de VMV.</small></span></label>
   {chat?<div className={styles.chatOptions}><strong>¿Quién responde?</strong>
    <label><input type="radio" checked readOnly name="chat-mode"/> Tú, desde tu bandeja de VMV</label>
    <label className={styles.disabled}><input type="radio" disabled name="chat-mode"/> Agente IA {agentCount?"("+agentCount+" activo"+(agentCount===1?"":"s")+")":""} · requiere habilitar el canal público de chat</label>
   </div>:null}
  </div>:null}
  {step===5?<div className={styles.panel}>
   <h2>06 · Últimos detalles para la IA</h2>
   <p>Cuéntale el estilo, público y prioridades. No hace falta repetir la información del negocio.</p>
   <label>Indicaciones adicionales (opcional)<textarea value={context} maxLength={360} rows={4}
    placeholder="Ej. Imagen moderna y premium, muy fácil de usar desde móvil, fotos grandes, llamada a la acción visible…"
    onChange={e=>setContext(e.target.value)}/></label>
   <div className={styles.summary}>
    <div><small>Negocio</small><strong>{form.business}</strong></div>
    <div><small>Colores</small><span className={styles.miniColors}>{colors.map(c=><i key={c} style={{background:c}}/>)}</span></div>
    <div><small>Fuente</small><strong>{fonts.find(f=>f.id===font)?.label}</strong></div>
    <div><small>Imágenes</small><strong>{shapes.find(f=>f.id===shape)?.label}</strong></div>
    <div><small>Secciones</small><strong>{[inventory?"Productos":"",booking?"Citas":"",chat?"Chat":"", "Contacto"].filter(Boolean).join(" · ")}</strong></div>
   </div>
   <div className={styles.connection} role="status">{aiState==="checking"?<><LoaderCircle size={16}/> Comprobando IA…</>:
    aiState==="ready"?<><CheckCircle2 size={16}/> Generador de VMV conectado. Hasta 2 generaciones de IA por día.</>:
    <><ShieldCheck size={16}/> {aiError||"La IA no está disponible."} <a href="/web-studio?mode=templates">Usar plantillas</a></>}</div>
   <button type="button" className={styles.generate} disabled={aiState!=="ready"||generating||busy} onClick={()=>void generate()}>
    {generating?<LoaderCircle size={18}/>:<Sparkles size={18}/>} {generating?"Creando tu diseño…":"Generar mi web con IA"} <ArrowRight size={17}/></button>
  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <footer className={styles.footer}>
   <small><ShieldCheck size={15}/> Nada se publica sin tu aprobación.</small>
   <div>{step>0?<button type="button" className={styles.back} disabled={busy||generating} onClick={()=>{setStep(s=>Math.max(0,s-1));setError("");}}><ArrowLeft size={17}/> Anterior</button>:null}
    {step<5?<button type="button" className={styles.next} disabled={loading||busy} onClick={next}>Siguiente <ArrowRight size={17}/></button>:null}</div>
  </footer>
 </section>;
}
