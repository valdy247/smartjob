"use client";
import {useState} from "react";
import {ArrowUpRight,CheckCircle2,ClipboardCopy,ExternalLink,Globe2,MapPinned,RefreshCw,Search,ShieldCheck,TrendingUp} from "lucide-react";
import styles from "./LocalVisibilityStudio.module.css";

export type LocalProfile={
 business:string;industry:string;website:string;phone:string;address:string;
 city:string;region:string;postal:string;hours:string;description:string;
};
type EditableKey=Exclude<keyof LocalProfile,"industry">;
type ListingStatus="not_started"|"in_progress"|"self_reported";
type Audit={scores:{performance:number|null;seo:number|null;accessibility:number|null};
 recommendations:string[];source:string;website:string;analyzedAt:string;note:string};
const directories=[
 {id:"google",name:"Google Business Profile",url:"https://business.google.com/add",note:"Búsqueda y Google Maps · Requiere reclamar y verificar el negocio",method:"Sincronización futura con Web Services: API sujeta a aprobación"},
 {id:"bing",name:"Bing Places",url:"https://www.bing.com/forbusiness",note:"Bing y Bing Maps · Puede importar datos desde Google",method:"Registro y verificación gratuitos en Bing"},
 {id:"apple",name:"Apple Business Connect",url:"https://businessconnect.apple.com/",note:"Apple Maps y Siri · Registro empresarial gratuito",method:"Edición desde Apple; APIs avanzadas para socios autorizados"},
 {id:"yelp",name:"Yelp for Business",url:"https://biz.yelp.com/",note:"Directorio y reputación local · Reclama tu ficha",method:"Publicación mediante portal; integración de gestión exige acuerdo con Yelp"}
] as const;
const statusLabels:Record<ListingStatus,string>={
 not_started:"Sin empezar",in_progress:"En trámite",self_reported:"Completado según tú"
};
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}){
 return <label className={styles.field}><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={250}/></label>;
}
function resultTone(value:number|null){return value===null?"Sin datos":value>=90?"Bien":value>=50?"Mejorable":"Prioridad";}

export default function LocalVisibilityStudio({profile,onChange}:{
 profile:LocalProfile;onChange:(key:EditableKey,value:string)=>void;
}){
 const [hideAddress,setHideAddress]=useState(false);
 const [listingStatus,setListingStatus]=useState<Record<string,ListingStatus>>({});
 const [notice,setNotice]=useState("");
 const [audit,setAudit]=useState<Audit|null>(null);
 const [auditError,setAuditError]=useState("");
 const [auditing,setAuditing]=useState(false);
 const details=[
  ["Nombre",profile.business.trim()],["Sector",profile.industry.trim()&&profile.industry!=="Por definir"?profile.industry:""],
  ["Teléfono",profile.phone.trim()],["Ciudad",profile.city.trim()],["Estado / región",profile.region.trim()],
  ["Horario",profile.hours.trim()],["Descripción",profile.description.trim()]
 ];
 const ready=details.filter(([,value])=>Boolean(value)).length;
 const exportText=[
  "FICHA EMPRESARIAL · VMV BUSINESS",
  "Nombre: "+(profile.business.trim()||"Por definir"),
  "Industria: "+profile.industry,
  "Teléfono: "+(profile.phone.trim()||"Por definir"),
  "Ubicación: "+(hideAddress?"Negocio de área de servicio / dirección privada":([profile.address.trim(),profile.city.trim(),profile.region.trim(),profile.postal.trim()].filter(Boolean).join(", ")||"Por definir")),
  "Horario: "+(profile.hours.trim()||"Por definir"),
  "Sitio web: "+(profile.website.trim()||"Por definir"),
  "Descripción: "+(profile.description.trim()||"Por definir")
 ].join("\n");
 const copyProfile=async()=>{
  try{await navigator.clipboard.writeText(exportText);setNotice("Ficha empresarial copiada. Revisa los datos antes de enviarlos a un directorio.");}
  catch{setNotice("No se pudo copiar. Selecciona y copia la información manualmente.");}
 };
 const auditSite=async()=>{
  setAudit(null);setAuditError("");
  if(!profile.website.trim()){setAuditError("Introduce la dirección pública de tu web para analizarla.");return;}
  let parsed:URL;
  try{parsed=new URL(profile.website.trim());if(!["http:","https:"].includes(parsed.protocol))throw new Error();}
  catch{setAuditError("Escribe la URL completa de tu web, por ejemplo https://minegocio.com");return;}
  setAuditing(true);
  try{
   const response=await fetch("/api/marketing/site-audit?url="+encodeURIComponent(parsed.toString()));
   const result=await response.json() as Audit&{error?:string};
   if(!response.ok)throw new Error(result.error||"No fue posible analizar la web.");
   setAudit(result);
  }catch(err){setAuditError(err instanceof Error?err.message:"No fue posible analizar la web.");}
  finally{setAuditing(false);}
 };
 return <div className={styles.root}>
  <header className={styles.header}>
   <span className={styles.overline}><MapPinned size={16}/> VISIBILIDAD LOCAL · PILOTO</span>
   <h2>Haz que encuentren tu negocio.</h2>
   <p>Una ficha coherente para presentar tu empresa en buscadores y directorios. Los registros se realizan en cada plataforma con tu autorización; VMV aún no publica automáticamente.</p>
  </header>
  <div className={styles.summary}>
   <div><strong>{ready} de {details.length}</strong><span>Datos esenciales preparados</span></div>
   <div><strong>{Object.values(listingStatus).filter(v=>v==="in_progress"||v==="self_reported").length} de {directories.length}</strong><span>Directorios iniciados (declarado)</span></div>
  </div>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>01 · UNA SOLA FICHA</span><h3>Información para directorios</h3></div><button type="button" onClick={()=>void copyProfile()} className={styles.copy}><ClipboardCopy size={16}/> Copiar ficha</button></div>
   <p className={styles.muted}>Usa exactamente el mismo nombre comercial, teléfono y datos de ubicación en cada plataforma. No añadas palabras clave al nombre si no forman parte de tu marca real.</p>
   <div className={styles.grid}>
    <Field label="Nombre comercial" value={profile.business} onChange={v=>onChange("business",v)} placeholder="Nombre oficial de tu empresa"/>
    <div className={styles.readonlyField}><span>Industria</span><strong>{profile.industry||"Por definir"}</strong><small>Se selecciona en Diagnóstico</small></div>
    <Field label="Teléfono de atención" value={profile.phone} onChange={v=>onChange("phone",v)} placeholder="+1 555 123 4567"/>
    <Field label="Ciudad" value={profile.city} onChange={v=>onChange("city",v)} placeholder="Ciudad donde operas"/>
    <Field label="Estado o región" value={profile.region} onChange={v=>onChange("region",v)} placeholder="Georgia"/>
    <Field label="Código postal" value={profile.postal} onChange={v=>onChange("postal",v)} placeholder="31901"/>
    {!hideAddress?<Field label="Dirección comercial pública (opcional)" value={profile.address} onChange={v=>onChange("address",v)} placeholder="Solo si atiendes clientes en esta dirección"/>:null}
    <Field label="Horario de atención" value={profile.hours} onChange={v=>onChange("hours",v)} placeholder="Lun–Vie, 9 AM–5 PM"/>
    <Field label="Sitio web" value={profile.website} onChange={v=>{onChange("website",v);setAudit(null);setAuditError("");}} placeholder="https://tusitio.com"/>
   </div>
   <label className={styles.privacy}><input type="checkbox" checked={hideAddress} onChange={e=>setHideAddress(e.target.checked)}/><span>Trabajo a domicilio, por internet o desde una dirección privada. No incluir dirección en la ficha copiada.</span></label>
   <label className={styles.description}><span>Descripción breve del negocio</span><textarea value={profile.description} onChange={e=>onChange("description",e.target.value)} maxLength={500} rows={3} placeholder="Explica qué ofreces, a quién ayudas y dónde atiendes."/><small>Describe servicios reales sin afirmaciones inventadas.</small></label>
   {notice?<p className={styles.notice} role="status">{notice}</p>:null}
  </section>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>02 · DIRECTORIOS GRATUITOS</span><h3>Presencia donde buscan clientes</h3></div></div>
   <p className={styles.muted}>Antes de crear una ficha nueva, busca si ya existe y reclama la tuya para evitar duplicados. Estos botones abren los portales oficiales; los estados son anotaciones manuales, no verificaciones de VMV.</p>
   <div className={styles.directories}>
    {directories.map(item=><article key={item.id} className={styles.directory}>
     <div className={styles.dirHeading}><div><strong>{item.name}</strong><p>{item.note}</p></div><span className={styles.status}>{statusLabels[listingStatus[item.id]||"not_started"]}</span></div>
     <small>{item.method}</small>
     <div className={styles.directoryActions}>
      <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Abrir portal oficial</a>
      <select aria-label={"Estado de "+item.name} value={listingStatus[item.id]||"not_started"} onChange={e=>setListingStatus(prev=>({...prev,[item.id]:e.target.value as ListingStatus}))}>
       <option value="not_started">Sin empezar</option>
       <option value="in_progress">En trámite</option>
       <option value="self_reported">Ya lo completé</option>
      </select>
     </div>
    </article>)}
   </div>
   <p className={styles.fine}>Los estados se muestran solo en esta sesión de prueba. No significan aprobación ni publicación comprobada.</p>
  </section>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>03 · API GRATUITA</span><h3>Auditoría técnica de tu sitio web</h3></div><span className={styles.apiTag}><Globe2 size={14}/> PageSpeed Insights</span></div>
   <p className={styles.muted}>Analizamos la web para detectar oportunidades técnicas de SEO y velocidad móvil usando la API pública de Google. Las puntuaciones no representan visitas ni ventas.</p>
   <button type="button" className={styles.auditButton} disabled={auditing} onClick={()=>void auditSite()}><Search size={17}/>{auditing?"Analizando sitio…":"Analizar mi sitio gratis"}{auditing?<RefreshCw className={styles.spin} size={15}/>:<ArrowUpRight size={15}/>}</button>
   {auditError?<p className={styles.error} role="alert">{auditError}</p>:null}
   {audit?<div className={styles.auditResult}>
    <div className={styles.scores}>
     {([["Velocidad móvil",audit.scores.performance],["SEO técnico",audit.scores.seo],["Accesibilidad",audit.scores.accessibility]] as const).map(([label,value])=><div key={label}><strong>{value===null?"—":value+"/100"}</strong><span>{label}</span><small>{resultTone(value)}</small></div>)}
    </div>
    {audit.recommendations.length>0?<div className={styles.opportunities}><strong><TrendingUp size={16}/> Posibles mejoras detectadas</strong><ul>{audit.recommendations.map((r,i)=><li key={i}>{r}</li>)}</ul></div>:<p className={styles.muted}><CheckCircle2 size={16}/> No se detectaron alertas dentro de las comprobaciones básicas seleccionadas.</p>}
    <p className={styles.fine}><ShieldCheck size={14}/> Fuente: {audit.source}. Estos resultados pueden cambiar entre mediciones.</p>
   </div>:null}
  </section>
 </div>;
}
