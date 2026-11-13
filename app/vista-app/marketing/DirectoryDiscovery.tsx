"use client";
import {useMemo} from "react";
import {MapPin,ExternalLink,SearchCheck,Check} from "lucide-react";
import styles from "./DirectoryDiscovery.module.css";

export type DirectoryProgress="pending_review"|"researching"|"needs_customer"|"submitted"|"published"|"not_eligible";
export type DirectoryTarget={id:string;name:string;type:"national"|"state"|"local"|"research";url:string;cost:"free"|"membership"|"unknown";status:DirectoryProgress;evidenceUrl:string;note:string};
export type DirectoryData={city:string;state:string;postal:string;industry:string;serviceArea:boolean;selected:DirectoryTarget[];notes:string};
export const emptyDirectory:DirectoryData={city:"",state:"",postal:"",industry:"",serviceArea:false,selected:[],notes:""};
const list=[
 {id:"yelp",name:"Yelp",type:"national",url:"https://biz.yelp.com/",cost:"free",scope:"all",description:"Ficha gratuita; Yelp debe aceptar el negocio."},
 {id:"apple",name:"Apple Business",type:"national",url:"https://businessconnect.apple.com/",cost:"free",scope:"all",description:"Ficha de negocio en Mapas de Apple; requiere verificación."},
 {id:"bing",name:"Bing Places",type:"national",url:"https://www.bingplaces.com/",cost:"free",scope:"all",description:"Ficha en Bing Maps; requiere verificación."},
 {id:"tripadvisor",name:"Tripadvisor",type:"national",url:"https://www.tripadvisor.com/Owners",cost:"free",scope:"travel",description:"Para establecimientos elegibles de comida, turismo, alojamiento y experiencias."},
 {id:"explore-ga",name:"Explore Georgia",type:"state",url:"https://industry.exploregeorgia.org/partner-extranet",cost:"free",scope:"ga-travel",description:"Directorio turístico de Georgia; alta gratis para negocios elegibles."},
 {id:"chamber-columbus",name:"Greater Columbus Chamber",type:"local",url:"https://columbusgachamber.com/membership-directory/",cost:"membership",scope:"columbus",description:"Directorio de miembros; revisar membresía y condiciones."}
] as const;
const costNames={free:"Ficha sin tarifa de alta",membership:"Puede requerir membresía",unknown:"Por verificar"};
const normalize=(v:string)=>v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const isGeorgia=(v:string)=>["georgia","ga"].includes(normalize(v));
const isTravel=(industry:string)=>/bakery|restaurant|food|tour|travel|hotel|lodg|cafe|coffee|dessert|pastel|panader|repost|hostel|activity/i.test(industry);
export function directoryOptions(d:DirectoryData){
 const ga=isGeorgia(d.state);
 const travel=isTravel(d.industry);
 const columbus=ga&&normalize(d.city).includes("columbus");
 return list.filter(x=>x.scope==="all"||x.scope==="travel"&&travel||x.scope==="ga-travel"&&ga&&travel||x.scope==="columbus"&&columbus);
}
export function researchTarget(data:DirectoryData):DirectoryTarget{
 return {id:"research-local",name:"Buscar directorios en "+[data.city,data.state].filter(Boolean).join(", "),type:"research",url:"",cost:"unknown",status:"pending_review",evidenceUrl:"",note:"Investigación humana pendiente; no es una ficha publicada."};
}
export function validateDirectory(data:DirectoryData){
 if(!data.state.trim()||!data.city.trim())return "Indica ciudad y estado para buscar oportunidades locales.";
 if(data.city.length>100||data.state.length>100||data.postal.length>20||data.notes.length>800)return "Revisa la longitud de los datos ingresados.";
 if(!data.selected.length)return "Selecciona al menos un directorio o la investigación local.";
 return "";
}
export function safeDirectoryUrl(v:string){try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&u.href.length<=750;}catch{return false;}}
export const directoryStatusNames:Record<DirectoryProgress,string>={
 pending_review:"Por revisar",researching:"Investigando",needs_customer:"Necesita tu ayuda",
 submitted:"Solicitud enviada al directorio",published:"Publicado y verificado",not_eligible:"No elegible"
};
export default function DirectoryDiscovery({data,onChange,industry}:{data:DirectoryData;onChange:(d:DirectoryData)=>void;industry:string}){
 const current={...data,industry:data.industry||industry};
 const options=useMemo(()=>directoryOptions(current),[current.city,current.state,current.industry]);
 const selectedIds=new Set(data.selected.map(x=>x.id));
 const patch=(key:keyof DirectoryData,value:string|boolean)=>onChange({...data,[key]:value});
 const toggle=(id:string)=>{
  const next=data.selected.filter(x=>x.id!==id);
  if(!selectedIds.has(id)){
   const match=options.find(x=>x.id===id);
   const target=id==="research-local"?researchTarget(data):match?{id:match.id,name:match.name,type:match.type,url:match.url,cost:match.cost,status:"pending_review" as const,evidenceUrl:"",note:match.description}:null;
   if(target)next.push(target);
  }
  onChange({...data,selected:next});
 };
 return <div className={styles.root}>
  <div className={styles.section}>
   <div className={styles.heading}><MapPin size={19}/><div><strong>¿Dónde está tu negocio?</strong><small>Buscamos opciones relevantes para tu ciudad y sector.</small></div></div>
   <div className={styles.two}>
    <label>Ciudad<input value={data.city} maxLength={100} onChange={e=>patch("city",e.target.value)} placeholder="Columbus"/></label>
    <label>Estado<input value={data.state} maxLength={100} onChange={e=>patch("state",e.target.value)} placeholder="Georgia o GA"/></label>
   </div>
   <label>Código postal (opcional)<input value={data.postal} maxLength={20} onChange={e=>patch("postal",e.target.value)} placeholder="31901" inputMode="numeric"/></label>
   <label className={styles.toggle}><input type="checkbox" checked={data.serviceArea} onChange={e=>patch("serviceArea",e.target.checked)}/> Atiendo por entregas o en casa del cliente</label>
   <p className={styles.hint}>No pedimos tu dirección residencial. Los directorios pueden tener reglas de elegibilidad distintas.</p>
  </div>
  <div className={styles.section}>
   <div className={styles.heading}><SearchCheck size={19}/><div><strong>Directorios que podemos revisar</strong><small>Selecciona los que te interesan. Antes comprobaremos si ya tienes ficha.</small></div></div>
   <div className={styles.options}>
    {options.map(d=><div key={d.id} className={styles.optionRow}>
     <button type="button" aria-pressed={selectedIds.has(d.id)} onClick={()=>toggle(d.id)} className={styles.option}>
      <span className={styles.checkbox}>{selectedIds.has(d.id)?<Check size={13}/>:null}</span>
      <span className={styles.optionText}><strong>{d.name}</strong><small>{d.description}</small><em>{costNames[d.cost]}</em></span>
     </button>
     <a className={styles.source} href={d.url} target="_blank" rel="noopener noreferrer" title={"Consultar requisitos de "+d.name} aria-label={"Consultar requisitos de "+d.name}><ExternalLink size={16}/></a>
    </div>)}
    <button type="button" aria-pressed={selectedIds.has("research-local")} onClick={()=>toggle("research-local")} className={styles.option}>
     <span className={styles.checkbox}>{selectedIds.has("research-local")?<Check size={13}/>:null}</span>
     <span className={styles.optionText}><strong>Encontrar otros directorios locales</strong><small>VMV investigará directorios de tu estado, ciudad, cámaras de comercio y sector.</small><em>Revisión y precio de gestión sujetos a cotización</em></span>
    </button>
   </div>
   <p className={styles.hint}>Las opciones mostradas son oportunidades por evaluar, no fichas encontradas ni publicaciones automáticas. La membresía o la gestión pueden costar dinero; te informaremos antes de contratar.</p>
  </div>
  <div className={styles.section}>
   <strong>¿Algún dato que debamos conocer? (opcional)</strong>
   <textarea rows={3} value={data.notes} onChange={e=>patch("notes",e.target.value)} maxLength={800} placeholder="Ej. Ya aparezco en Yelp, pero los horarios están incorrectos."/>
   <p className={styles.hint}>VMV comprobará duplicados y requisitos; nunca creará fichas ni pagará membresías sin tu autorización.</p>
  </div>
 </div>;
}
