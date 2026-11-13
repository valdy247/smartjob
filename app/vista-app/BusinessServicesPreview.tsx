"use client";
import {useEffect,useState,type ChangeEvent} from "react";
import {Bot,Globe,Search,Star,CalendarDays,PanelsTopLeft,MapPin,ChartNoAxesCombined,Link2,PhoneCall,ArrowUpRight,ChevronLeft,Save,Copy,Check,Mail} from "lucide-react";
import styles from "./BusinessServicesPreview.module.css";
import WebServicesStudio from "./WebServicesStudio";
import WebServicesInbox from "./WebServicesInbox";
import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS,categoryIdFromLabel,categoryLabel,categoryById} from "@/lib/vmv-business-categories";

type Charge="subscription"|"one_time";
type Fulfillment="automatic"|"assisted";
type Item={id:string;name:string;charge:Charge;delivery:Fulfillment;state:"pilot"|"planned";color:string;Icon:typeof Globe};
const offers:Item[]=[
 {id:"smart-call",name:"Smart Call",charge:"subscription",delivery:"automatic",state:"pilot",color:"violet",Icon:PhoneCall},
 {id:"site-care",name:"Web Care",charge:"subscription",delivery:"automatic",state:"planned",color:"yellow",Icon:Globe},
 {id:"ai-agents",name:"AI Agents",charge:"subscription",delivery:"automatic",state:"planned",color:"blue",Icon:Bot},
 {id:"local-seo",name:"SEO Local",charge:"subscription",delivery:"assisted",state:"planned",color:"mint",Icon:Search},
 {id:"reviews",name:"Reseñas",charge:"subscription",delivery:"assisted",state:"planned",color:"pink",Icon:Star},
 {id:"smart-booking",name:"Smart Booking",charge:"subscription",delivery:"automatic",state:"planned",color:"lilac",Icon:CalendarDays},
 {id:"website-design",name:"Diseño web",charge:"one_time",delivery:"automatic",state:"planned",color:"yellow",Icon:PanelsTopLeft},
 {id:"google-business-profile",name:"Google Business Profile",charge:"one_time",delivery:"assisted",state:"planned",color:"violet",Icon:MapPin},
 {id:"seo-setup",name:"SEO inicial",charge:"one_time",delivery:"assisted",state:"planned",color:"blue",Icon:ChartNoAxesCombined},
 {id:"domain-setup",name:"Dominio",charge:"one_time",delivery:"assisted",state:"planned",color:"mint",Icon:Link2}
];
type Draft={business:string;category:string;categoryId:string;phone:string;website:string;address:string;area:string;hours:string;description:string;googleEmail:string;assets:string;authorized:boolean};
const empty:Draft={business:"",category:"",categoryId:"",phone:"",website:"",address:"",area:"",hours:"",description:"",googleEmail:"",assets:"",authorized:false};
const fields:{key:Exclude<keyof Draft,"authorized"|"category"|"categoryId">;label:string;max:number;kind?:"email"|"tel"|"url";multi?:boolean}[]=[
 {key:"business",label:"Nombre del negocio *",max:100},
 {key:"phone",label:"Teléfono",max:24,kind:"tel"},
 {key:"website",label:"Sitio web",max:150,kind:"url"},
 {key:"address",label:"Dirección",max:180},
 {key:"area",label:"Zona de servicio",max:120},
 {key:"hours",label:"Horarios",max:150,multi:true},
 {key:"description",label:"Descripción",max:300,multi:true},
 {key:"googleEmail",label:"Correo de Google *",max:150,kind:"email"},
 {key:"assets",label:"Logo / fotos (enlace)",max:150,kind:"url"}
];
const WEB_SERVICE_IDS=new Set(["site-care","local-seo","reviews","website-design","google-business-profile","seo-setup","domain-setup"]);
export default function BusinessServicesPreview({userId,focus="all"}:{userId:string;focus?:"all"|"web"}){
 const [charge,setCharge]=useState<Charge>("subscription");
 const [editor,setEditor]=useState(false);
 const [siteEditor,setSiteEditor]=useState(false);
 const [inboxOpen,setInboxOpen]=useState(false);
 const [draft,setDraft]=useState<Draft>({...empty});
 const [status,setStatus]=useState("");
 const key="vmv.gbp.web.draft.v1."+userId;
 useEffect(()=>{
  let active=true;
  setDraft({...empty});setEditor(false);setStatus("");
  try{
   const raw=window.localStorage.getItem(key);
   if(!raw)return;
   const decoded:unknown=JSON.parse(raw);
   if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))return;
   const obj=decoded as Record<string,unknown>;
   const next={...empty};
   for(const field of fields){
    const value=obj[field.key];
    if(typeof value==="string")next[field.key]=value.slice(0,field.max);
   }
   next.categoryId=categoryById(String(obj.categoryId||""))?.id||categoryIdFromLabel(String(obj.category||""));
   next.category=categoryLabel(next.categoryId,String(obj.category||""));
   next.authorized=obj.authorized===true;
   if(active)setDraft(next);
  }catch{/* Private browsing or malformed local draft. */}
  return()=>{active=false;};
 },[key]);
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const client=getSupabase();if(!client)return;
   const {data:user}=await client.auth.getUser();
   if(user.user?.id!==userId)return;
   const {data,error}=await client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",userId).maybeSingle();
   if(!error&&live&&data?.category_id&&categoryById(data.category_id)){
    setDraft(previous=>previous.categoryId?previous:{...previous,categoryId:data.category_id,category:categoryLabel(data.category_id)});
   }
  })();
  return()=>{live=false;};
 },[userId]);
 const edit=(field:Exclude<keyof Draft,"authorized">,value:string)=>{setDraft(prev=>({...prev,[field]:value}));setStatus("");};
 const save=async()=>{
  try{
   window.localStorage.setItem(key,JSON.stringify(draft));
   if(draft.categoryId){
    const client=getSupabase();
    if(!client)throw new Error("Inicia sesión");
    const {data:user}=await client.auth.getUser();
    if(user.user?.id!==userId)throw new Error("Inicia sesión nuevamente");
    const {error}=await client.from("smartjob_business_category_preferences").upsert({
     owner_id:userId,category_id:draft.categoryId,updated_at:new Date().toISOString()
    },{onConflict:"owner_id"});
    if(error)throw new Error("Borrador local guardado, categoría sin sincronizar");
   }
   setStatus("Borrador guardado");
  }catch(e){setStatus(e instanceof Error?e.message:"No se pudo guardar");}
 };
 const share=async()=>{
  if(!draft.business.trim()||!draft.categoryId.trim()||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.googleEmail.trim()))||!draft.address.trim()&&!draft.area.trim()){
   setStatus("Completa los campos obligatorios");return;
  }
  if(!draft.authorized){setStatus("Confirma la autorización");return;}
  const message=["Google Business Profile","Categoría: "+categoryLabel(draft.categoryId),...fields.map(f=>f.label.replace(/ \*$/,"")+": "+(draft[f.key]||"—")),"Autorización: Sí"].join("\n");
  try{await navigator.clipboard.writeText(message);setStatus("Ficha copiada");}
  catch{setStatus("No se pudo copiar");}
 };
 if(siteEditor)return <WebServicesStudio ownerId={userId} onBack={()=>setSiteEditor(false)}/>;
 if(inboxOpen)return <WebServicesInbox ownerId={userId} onBack={()=>setInboxOpen(false)}/>;
 if(editor)return <section className={styles.root}>
   <button type="button" className={styles.back} onClick={()=>setEditor(false)}><ChevronLeft size={18}/> Servicios</button>
   <div className={styles.editorHero}>
    <div className={styles.editorIcon}><MapPin size={26}/></div>
    <div><h3>Google Business Profile</h3><span>Pago único · Asistido</span></div>
   </div>
   <form className={styles.form} autoComplete="off" spellCheck={false} onSubmit={e=>{e.preventDefault();void save();}}>
    <label className={styles.field}><span>Categoría *</span>
     <select value={draft.categoryId} onChange={e=>{
      const id=e.target.value;
      setDraft(d=>({...d,categoryId:id,category:categoryLabel(id)}));setStatus("");
     }} aria-label="Categoría de negocio">
      <option value="">Seleccionar categoría</option>
      {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>
       {BUSINESS_CATEGORIES.filter(cat=>cat.group===group).map(cat=><option key={cat.id} value={cat.id}>{cat.label}</option>)}
      </optgroup>)}
     </select>
    </label>
    {fields.map(f=><label className={styles.field} key={f.key}>
      <span>{f.label}</span>{f.multi?<textarea maxLength={f.max} value={draft[f.key]} onChange={e=>edit(f.key,e.target.value)} rows={3} placeholder={f.label.replace(" *","")}
       spellCheck={false} autoCorrect="off" autoCapitalize="none" autoComplete="off"/>:
      <input type={f.kind||"text"} maxLength={f.max} value={draft[f.key]} onChange={(e:ChangeEvent<HTMLInputElement>)=>edit(f.key,e.target.value)} placeholder={f.label.replace(" *","")}
       spellCheck={false} autoCorrect="off" autoCapitalize="none" autoComplete="off"/>}
    </label>)}
    <label className={styles.check}><input type="checkbox" checked={draft.authorized} onChange={e=>{setDraft(p=>({...p,authorized:e.target.checked}));setStatus("");}}/><span>Autorizo la gestión de mi perfil.</span></label>
    <button className={styles.save} type="submit"><Save size={17}/> Guardar borrador</button>
    <button className={styles.primary} type="button" onClick={()=>void share()}><Copy size={17}/> Copiar ficha</button>
    <div aria-live="polite" role="status" className={styles.status}>{status}</div>
   </form>
  </section>;
 return <section className={styles.root}>
  <div className={styles.header}><h3>{focus==="web"?"Web Services":"Servicios"}<span>.</span></h3><div className={styles.headerIcon}><PanelsTopLeft size={20}/></div></div>
  {focus==="web"?<div className={styles.webActions}>
    <a className={styles.primary} href="/web-studio"><PanelsTopLeft size={18}/> Editor visual 2.0 <ArrowUpRight size={16}/></a>
    <button className={styles.webActionSecondary} type="button" onClick={()=>setSiteEditor(true)}>Editor clásico</button>
    <button className={styles.webActionSecondary} type="button" onClick={()=>setInboxOpen(true)}><Mail size={17}/> Solicitudes</button>
   </div>:null}
  <div className={styles.toggle} role="group" aria-label="Tipo de servicio">
   <button type="button" className={charge==="subscription"?styles.selected:""} aria-pressed={charge==="subscription"} onClick={()=>setCharge("subscription")}>En planes</button>
   <button type="button" className={charge==="one_time"?styles.selected:""} aria-pressed={charge==="one_time"} onClick={()=>setCharge("one_time")}>Pago único</button>
  </div>
  <div className={styles.grid}>
   {offers.filter(o=>o.charge===charge&&(focus!=="web"||WEB_SERVICE_IDS.has(o.id))).map(o=>{
    const inner=<><div className={styles.offerIcon}><o.Icon size={25}/></div>
     <div className={styles.offerBottom}><strong>{o.name}</strong><div className={styles.badges}>
      <small>{o.delivery==="automatic"?"Auto":"Asistido"}</small>
      <small>{o.id==="ai-agents"?"Beta":o.state==="pilot"?"Piloto":"Próximamente"}</small>
     </div></div>{o.id==="google-business-profile"||o.id==="ai-agents"?<ArrowUpRight className={styles.arrow} size={17}/>:null}</>;
    return o.id==="ai-agents"?
     <button type="button" key={o.id} className={styles.tile+" "+styles[o.color]} onClick={()=>window.location.assign("/vista-app/ai-agents")} aria-label="AI Agents — Beta">{inner}</button>:
     o.id==="google-business-profile"?
     <button type="button" key={o.id} className={styles.tile+" "+styles[o.color]} onClick={()=>setEditor(true)} aria-label="Preparar Google Business Profile">{inner}</button>:
     o.id==="website-design"?<button type="button" key={o.id} className={styles.tile+" "+styles[o.color]} onClick={()=>setSiteEditor(true)} aria-label="Crear web">{inner}</button>:
     <div key={o.id} className={styles.tile+" "+styles[o.color]}>{inner}</div>;
   })}
  </div>
 </section>;
}
