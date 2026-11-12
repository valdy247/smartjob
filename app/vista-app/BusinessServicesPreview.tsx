"use client";
import {useEffect,useState,type ChangeEvent} from "react";
import {Bot,Globe,Search,Star,CalendarDays,PanelsTopLeft,MapPin,ChartNoAxesCombined,Link2,PhoneCall,ArrowUpRight,ChevronLeft,Save,Copy,Check} from "lucide-react";
import styles from "./BusinessServicesPreview.module.css";
import WebServicesStudio from "./WebServicesStudio";

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
type Draft={business:string;category:string;phone:string;website:string;address:string;area:string;hours:string;description:string;googleEmail:string;assets:string;authorized:boolean};
const empty:Draft={business:"",category:"",phone:"",website:"",address:"",area:"",hours:"",description:"",googleEmail:"",assets:"",authorized:false};
const fields:{key:Exclude<keyof Draft,"authorized">;label:string;max:number;kind?:"email"|"tel"|"url";multi?:boolean}[]=[
 {key:"business",label:"Nombre del negocio *",max:100},
 {key:"category",label:"Categoría *",max:80},
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
   next.authorized=obj.authorized===true;
   if(active)setDraft(next);
  }catch{/* Private browsing or malformed local draft. */}
  return()=>{active=false;};
 },[key]);
 const edit=(field:Exclude<keyof Draft,"authorized">,value:string)=>{setDraft(prev=>({...prev,[field]:value}));setStatus("");};
 const save=()=>{
  try{window.localStorage.setItem(key,JSON.stringify(draft));setStatus("Borrador guardado");}
  catch{setStatus("No se pudo guardar");}
 };
 const share=async()=>{
  if(!draft.business.trim()||!draft.category.trim()||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.googleEmail.trim()))||!draft.address.trim()&&!draft.area.trim()){
   setStatus("Completa los campos obligatorios");return;
  }
  if(!draft.authorized){setStatus("Confirma la autorización");return;}
  const message=["Google Business Profile",...fields.map(f=>f.label.replace(/ \*$/,"")+": "+(draft[f.key]||"—")),"Autorización: Sí"].join("\n");
  try{await navigator.clipboard.writeText(message);setStatus("Ficha copiada");}
  catch{setStatus("No se pudo copiar");}
 };
 if(siteEditor)return <WebServicesStudio ownerId={userId} onBack={()=>setSiteEditor(false)}/>;
 if(editor)return <section className={styles.root}>
   <button type="button" className={styles.back} onClick={()=>setEditor(false)}><ChevronLeft size={18}/> Servicios</button>
   <div className={styles.editorHero}>
    <div className={styles.editorIcon}><MapPin size={26}/></div>
    <div><h3>Google Business Profile</h3><span>Pago único · Asistido</span></div>
   </div>
   <form className={styles.form} onSubmit={e=>{e.preventDefault();save();}}>
    {fields.map(f=><label className={styles.field} key={f.key}>
      <span>{f.label}</span>{f.multi?<textarea maxLength={f.max} value={draft[f.key]} onChange={e=>edit(f.key,e.target.value)} rows={3} placeholder={f.label.replace(" *","")}/>:
      <input type={f.kind||"text"} maxLength={f.max} value={draft[f.key]} onChange={(e:ChangeEvent<HTMLInputElement>)=>edit(f.key,e.target.value)} placeholder={f.label.replace(" *","")}/>}
    </label>)}
    <label className={styles.check}><input type="checkbox" checked={draft.authorized} onChange={e=>{setDraft(p=>({...p,authorized:e.target.checked}));setStatus("");}}/><span>Autorizo la gestión de mi perfil.</span></label>
    <button className={styles.save} type="submit"><Save size={17}/> Guardar borrador</button>
    <button className={styles.primary} type="button" onClick={()=>void share()}><Copy size={17}/> Copiar ficha</button>
    <div aria-live="polite" role="status" className={styles.status}>{status}</div>
   </form>
  </section>;
 return <section className={styles.root}>
  <div className={styles.header}><h3>{focus==="web"?"Web Services":"Servicios"}<span>.</span></h3><div className={styles.headerIcon}><PanelsTopLeft size={20}/></div></div>
  {focus==="web"?<button className={styles.primary} type="button" onClick={()=>setSiteEditor(true)} style={{width:"100%",marginBottom:16}}><PanelsTopLeft size={18}/> Crear mi web <ArrowUpRight size={16}/></button>:null}
  <div className={styles.toggle} role="group" aria-label="Tipo de servicio">
   <button type="button" className={charge==="subscription"?styles.selected:""} aria-pressed={charge==="subscription"} onClick={()=>setCharge("subscription")}>En planes</button>
   <button type="button" className={charge==="one_time"?styles.selected:""} aria-pressed={charge==="one_time"} onClick={()=>setCharge("one_time")}>Pago único</button>
  </div>
  <div className={styles.grid}>
   {offers.filter(o=>o.charge===charge&&(focus!=="web"||WEB_SERVICE_IDS.has(o.id))).map(o=>{
    const inner=<><div className={styles.offerIcon}><o.Icon size={25}/></div>
     <div className={styles.offerBottom}><strong>{o.name}</strong><div className={styles.badges}>
      <small>{o.delivery==="automatic"?"Auto":"Asistido"}</small>
      <small>{o.state==="pilot"?"Piloto":"Próximamente"}</small>
     </div></div>{o.id==="google-business-profile"?<ArrowUpRight className={styles.arrow} size={17}/>:null}</>;
    return o.id==="google-business-profile"?
     <button type="button" key={o.id} className={styles.tile+" "+styles[o.color]} onClick={()=>setEditor(true)} aria-label="Preparar Google Business Profile">{inner}</button>:
     o.id==="website-design"?<button type="button" key={o.id} className={styles.tile+" "+styles[o.color]} onClick={()=>setSiteEditor(true)} aria-label="Crear web">{inner}</button>:
     <div key={o.id} className={styles.tile+" "+styles[o.color]}>{inner}</div>;
   })}
  </div>
 </section>;
}
