"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import {ArrowRight,ImagePlus,Plus,ShieldCheck,Sparkles,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import {FAMILIES,familyForCategory,type SiteFamily,type SiteIntake,type SiteOffering,type SiteObjective,type SiteProposal} from "@/lib/web-builder-templates";
import BuilderImageField from "./BuilderImageField";
import TemplateProposals from "./TemplateProposals";
import styles from "./WebSiteIntake.module.css";

type Props={ownerId:string;busy:boolean;onChoose:(input:SiteIntake,proposal:SiteProposal)=>void};
const offeringOptions:{id:SiteOffering;title:string;hint:string}[]=[
 {id:"products",title:"Productos",hint:"Catálogo y consultas"},
 {id:"services",title:"Servicios",hint:"Especialidades y contacto"},
 {id:"both",title:"Ambos",hint:"Productos y servicios"}
];
const goals:{id:SiteObjective;label:string;details:string}[]=[
 {id:"calls",label:"Recibir llamadas",details:"Botón de llamada"},
 {id:"quotes",label:"Pedir presupuestos",details:"Formulario de consulta"},
 {id:"bookings",label:"Solicitar citas",details:"Solicitud, no agenda automática"},
 {id:"orders",label:"Consultar pedidos",details:"Solicitud, sin cobro"}
];
export default function WebSiteIntake({ownerId,busy,onChoose}:Props){
 const [name,setName]=useState("");
 const [category,setCategory]=useState("");
 const [kind,setKind]=useState<SiteOffering>("services");
 const [goal,setGoal]=useState<SiteObjective>("quotes");
 const [phone,setPhone]=useState("");
 const [email,setEmail]=useState("");
 const [city,setCity]=useState("");
 const [about,setAbout]=useState("");
 const [logo,setLogo]=useState("");
 const [photos,setPhotos]=useState<string[]>([]);
 const [services,setServices]=useState<string[]>([]);
 const [newItem,setNewItem]=useState("");
 const [family,setFamily]=useState<SiteFamily|null>(null);
 const [stage,setStage]=useState<"details"|"proposals">("details");
 const [mode,setMode]=useState<"templates"|"ai">("templates");
 const [error,setError]=useState("");
 useEffect(()=>{
  let alive=true;
  void(async()=>{
   const client=getSupabase();if(!client)return;
   const {data:auth}=await client.auth.getUser();
   if(!auth.user||auth.user.id!==ownerId||auth.user.is_anonymous)return;
   const [profile,pref,classic]=await Promise.all([
    client.from("smartjob_profiles").select("business_name,phone,city,state").eq("id",ownerId).maybeSingle(),
    client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",ownerId).maybeSingle(),
    client.from("smartjob_web_sites").select("draft").eq("owner_id",ownerId).maybeSingle()
   ]);
   if(!alive)return;
   const saved=classic.data?.draft&&typeof classic.data.draft==="object"?classic.data.draft as Record<string,unknown>:{};
   const person=profile.data;
   setName(old=>old||String(person?.business_name||saved.business||"").slice(0,100));
   setCategory(old=>old||String(pref.data?.category_id||saved.categoryId||"").slice(0,60));
   setPhone(old=>old||String(saved.phone||person?.phone||"").slice(0,36));
   setEmail(old=>old||String(saved.email||"").slice(0,180));
   setCity(old=>old||String(saved.address||[person?.city,person?.state].filter(Boolean).join(", ")).slice(0,180));
   setAbout(old=>old||String(saved.intro||"").slice(0,500));
   setLogo(old=>old||String(saved.logo||"").slice(0,450));
   const existingPhotos=Array.isArray(saved.gallery)?saved.gallery.filter((v:unknown):v is string=>typeof v==="string").slice(0,4):[];
   const existingServices=typeof saved.services==="string"?saved.services.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,16):[];
   setPhotos(old=>old.length?old:existingPhotos);
   setServices(old=>old.length?old:existingServices);
  })();
  return()=>{alive=false;};
 },[ownerId]);
 const intake=useMemo<SiteIntake>(()=>({
  business:name.trim(),categoryId:category,offering:kind,objective:goal,
  phone:phone.trim(),email:email.trim(),city:city.trim(),about:about.trim(),
  logo,photos:photos.filter(Boolean),offerings:services.filter(Boolean)
 }),[name,category,kind,goal,phone,email,city,about,logo,photos,services]);
 const suggestedFamily=family||familyForCategory(category);
 function addService(event:FormEvent){
  event.preventDefault();
  const value=newItem.trim().slice(0,120);
  if(!value)return;
  if(services.length>=25){setError("Máximo 25 elementos iniciales; puedes agregar más desde el editor.");return;}
  setServices(old=>[...old,value]);setNewItem("");setError("");
 }
 function preview(){
  if(intake.business.length<2){setError("Escribe el nombre del negocio.");return;}
  if(!category){setError("Selecciona la categoría del negocio.");return;}
  if(intake.email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intake.email)){
   setError("Comprueba el correo de contacto.");return;
  }
  setError("");setStage("proposals");
 }
 if(stage==="proposals")return <TemplateProposals input={intake} familyOverride={suggestedFamily}
   busy={busy} onBack={()=>setStage("details")} onChoose={proposal=>onChoose(intake,proposal)}/>;
 return <section className={styles.root}>
  <div className={styles.intro}><small>WEB STUDIO · NUEVO SITIO</small><h2>Empecemos por tu negocio<span>.</span></h2>
   <p>Usaremos tus datos para preparar propuestas editables. Revisa que sean correctos antes de continuar.</p></div>
  <div className={styles.form}>
   <div className={styles.panel}>
    <h3><span>01</span> Información</h3>
    <div className={styles.twoColumns}>
     <label>Nombre del negocio<input value={name} maxLength={100} placeholder="Nombre comercial" onChange={e=>setName(e.target.value)}/></label>
     <label>Categoría<select value={category} onChange={e=>{setCategory(e.target.value);setFamily(null);}}>
      <option value="">Seleccionar categoría</option>
      {CATEGORY_GROUPS.map(group=><optgroup label={group} key={group}>
       {BUSINESS_CATEGORIES.filter(v=>v.group===group).map(v=><option value={v.id} key={v.id}>{v.label}</option>)}
      </optgroup>)}
     </select></label>
     <label>Teléfono de negocio<input value={phone} maxLength={36} type="tel" placeholder="+1 000 000 0000" onChange={e=>setPhone(e.target.value)}/></label>
     <label>Correo de contacto<input value={email} maxLength={180} type="email" placeholder="hola@minegocio.com" onChange={e=>setEmail(e.target.value)}/></label>
    </div>
    <label>Ciudad o zona atendida<input value={city} maxLength={180} placeholder="Ciudad, estado" onChange={e=>setCity(e.target.value)}/></label>
    <label>Descripción aprobada<textarea value={about} maxLength={500} rows={3}
     placeholder="¿Qué hace tu negocio? Incluye solamente información real." onChange={e=>setAbout(e.target.value)}/></label>
   </div>
   <div className={styles.panel}>
    <h3><span>02</span> Oferta y objetivo</h3>
    <label>¿Qué ofreces?</label>
    <div className={styles.choices}>
     {offeringOptions.map(item=><button key={item.id} type="button" data-active={kind===item.id}
      onClick={()=>setKind(item.id)}><strong>{item.title}</strong><small>{item.hint}</small></button>)}
    </div>
    <label>Objetivo principal</label>
    <div className={styles.choices}>
     {goals.map(item=><button key={item.id} type="button" data-active={goal===item.id}
      onClick={()=>setGoal(item.id)}><strong>{item.label}</strong><small>{item.details}</small></button>)}
    </div>
    <form className={styles.addItem} onSubmit={addService}>
     <label>{kind==="products"?"Productos":kind==="services"?"Servicios":"Productos y servicios"} (opcional)
      <span>Uno por campo. Sin precios inventados.</span></label>
     <div><input maxLength={120} value={newItem} placeholder="Ej. Pasteles personalizados"
      onChange={e=>setNewItem(e.target.value)}/><button type="submit"><Plus size={16}/> Agregar</button></div>
     <div className={styles.tokens}>{services.map((item,index)=><span key={index}>{item}
      <button type="button" aria-label={"Eliminar "+item} onClick={()=>setServices(old=>old.filter((_,i)=>i!==index))}><Trash2 size={12}/></button>
     </span>)}</div>
    </form>
   </div>
   <div className={styles.panel}>
    <h3><span>03</span> Identidad visual</h3>
    <p>Usa fotografías propias. También puedes continuar sin ellas y añadirlas desde el editor antes de publicar.</p>
    <div className={styles.photos}>
     <div><strong>Logo</strong><BuilderImageField value={logo} onChange={setLogo}/></div>
     {[0,1].map(i=><div key={i}><strong>{i===0?"Foto de portada":"Foto de productos o trabajos"}</strong>
      <BuilderImageField value={photos[i]||""} onChange={url=>setPhotos(old=>{
       const arr=[...old];arr[i]=url;return arr;
      })}/></div>)}
    </div>
   </div>
   <div className={styles.panel}>
    <h3><span>04</span> Diseño inicial</h3>
    <div className={styles.pathChoices}>
     <button type="button" data-active={mode==="templates"} onClick={()=>setMode("templates")}>
      <ImagePlus size={20}/><strong>Elegir una plantilla</strong><small>Tres propuestas basadas en tu contenido.</small>
     </button>
     <button type="button" data-active={mode==="ai"} onClick={()=>setMode("ai")}>
      <Sparkles size={20}/><strong>Diseñar con IA</strong><small>Se habilitará al conectar el proveedor y los costos.</small>
     </button>
    </div>
    {mode==="templates"?<label>Familia de diseño<select value={suggestedFamily} onChange={e=>setFamily(e.target.value as SiteFamily)}>
      {FAMILIES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </select></label>:<div role="status" className={styles.aiUnavailable}>
      La generación personalizada con IA no está habilitada. No se ejecutará ninguna IA ni habrá cargos. Puedes continuar con plantillas.
      <button type="button" onClick={()=>setMode("templates")}>Usar plantillas</button>
     </div>}
   </div>
   {error?<p className={styles.error} role="alert">{error}</p>:null}
   <div className={styles.finish}>
    <span><ShieldCheck size={16}/> Tus datos no se publicarán todavía.</span>
    <button type="button" disabled={busy||mode!=="templates"} onClick={preview}>
     Ver propuestas <ArrowRight size={17}/>
    </button>
   </div>
  </div>
 </section>;
}
