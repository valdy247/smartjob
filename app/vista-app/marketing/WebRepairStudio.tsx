"use client";
import {useState,type Dispatch,type SetStateAction} from "react";
import {AlertCircle,ArrowUpRight,CheckCircle2,ExternalLink,FileText,ScanSearch} from "lucide-react";
import styles from "./WebRepairStudio.module.css";

export type WebAudit={
 source:string;website:string;analyzedAt:string;
 scores:{performance:number|null;seo:number|null;accessibility:number|null};
 recommendations:string[];findings?:{id:string;title:string;description:string;score:number|null}[];
 reportUrl?:string;status?:"complete"|"unavailable";
 explanation?:string;explanationSource?:"ai"|"automatic";
};
export type WebRepairData={
 platform:string;otherPlatform:string;repositoryHost:string;repositoryUrl:string;
 requestRepair:boolean;notes:string;audit:WebAudit|null;
};
export const emptyWebRepair:WebRepairData={platform:"unknown",otherPlatform:"",repositoryHost:"unknown",repositoryUrl:"",requestRepair:true,notes:"",audit:null};
const platforms=[
 ["unknown","No lo sé"],["vercel","Vercel"],["wordpress","WordPress"],["shopify","Shopify"],["wix","Wix"],
 ["squarespace","Squarespace"],["webflow","Webflow"],["hostinger","Hostinger"],["godaddy","GoDaddy"],
 ["netlify","Netlify"],["cloudflare","Cloudflare Pages"],["cpanel","cPanel / hosting"],["aws","AWS"],
 ["firebase","Firebase"],["other","Otra plataforma"]
];
const codePlatforms=["vercel","netlify","cloudflare","aws","firebase","other","unknown"];
const googleReport=(site:string)=>"https://pagespeed.web.dev/analysis?url="+encodeURIComponent(site);
const linkSafe=(v:string)=>{if(!v.trim())return true;try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
export function validateWebRepair(data:WebRepairData){
 if(data.platform==="other"&&!data.otherPlatform.trim())return "Indica el nombre de la plataforma.";
 if(data.repositoryUrl&&!linkSafe(data.repositoryUrl))return "Introduce un enlace HTTPS válido para tu repositorio.";
 if(data.notes.length>1200)return "El mensaje es demasiado largo.";
 return "";
}
export default function WebRepairStudio({site,data,onChange,accessToken}:{site:string;data:WebRepairData;onChange:Dispatch<SetStateAction<WebRepairData>>;accessToken?:string}){
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const patch=<K extends keyof WebRepairData>(k:K,v:WebRepairData[K])=>onChange(prev=>({...prev,[k]:v}));
 const scan=async()=>{
  setLoading(true);setError("");
  try{
   const res=await fetch("/api/marketing/site-audit?url="+encodeURIComponent(site),{cache:"no-store"});
   const json=await res.json();
   if(!res.ok)throw new Error(json.error||"No fue posible analizar el sitio.");
   const audit:WebAudit={...json,reportUrl:json.reportUrl||googleReport(site),status:"complete"};
   onChange(prev=>({...prev,audit}));
   if(accessToken){
    try{
     const ai=await fetch("/api/marketing/explain-audit",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({audit})});
     if(ai.ok){const result=await ai.json();onChange(prev=>({...prev,audit:{...audit,explanation:result.explanation,explanationSource:result.source}}));}
    }catch{/* Technical report remains usable if interpretation is unavailable. */}
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo realizar el análisis.");}
  finally{setLoading(false);}
 };
 const report=data.audit;
 return <div className={styles.root}>
  <div className={styles.section}>
   <div className={styles.head}><ScanSearch size={21}/><div><strong>Diagnóstico de tu web</strong><small>Primero encontramos qué se puede mejorar.</small></div></div>
   <p className={styles.url}>{site}</p>
   <button type="button" className={styles.primary} onClick={()=>void scan()} disabled={loading}>{loading?"Analizando… puede tardar hasta 2 minutos":report?"Repetir análisis":"Analizar gratis"}</button>
   {loading?<p role="status" className={styles.tip}>Google está revisando la página. Mantén esta pantalla abierta; algunas webs tardan más que otras.</p>:null}
   {error?<div role="alert" className={styles.warning}><AlertCircle size={16}/><span>{error} Puedes continuar y solicitar una revisión humana.</span></div>:null}
   {report?<div className={styles.report}>
     <div className={styles.head}><CheckCircle2 size={18}/><strong>Informe técnico disponible</strong></div>
     <div className={styles.scores}>
      <span>Velocidad <strong>{report.scores.performance??"—"}/100</strong></span>
      <span>SEO <strong>{report.scores.seo??"—"}/100</strong></span>
      <span>Accesibilidad <strong>{report.scores.accessibility??"—"}/100</strong></span>
     </div>
     <div className={styles.explain}><strong>{report.explanationSource==="ai"?"Explicación con IA":"Explicación sencilla"}</strong>
      <p>{report.explanation||"Estos números son una revisión técnica. Una puntuación baja puede indicar cosas que afectan la experiencia, pero no garantiza que haya perdido ventas. Más abajo puedes ver los problemas detectados."}</p>
     </div>
     <details className={styles.technical}><summary><FileText size={16}/> Ver problemas y evidencia</summary>
      <div className={styles.findings}>{(report.findings||[]).length?(report.findings||[]).map(f=><article key={f.id}><strong>{f.title}</strong><p>{f.description}</p><small>{f.id} · Puntuación de comprobación: {f.score===null?"No disponible":Math.round(f.score*100)+"%"}</small></article>):report.recommendations.map((x,i)=><p key={i}>{i+1}. {x}</p>)}</div>
      <small>Fuente: {report.source} · {new Date(report.analyzedAt).toLocaleDateString("es-US")}. Se guardará una copia de los hallazgos al enviar la solicitud.</small>
     </details>
     <a className={styles.external} href={report.reportUrl||googleReport(site)} target="_blank" rel="noopener noreferrer">Contrastar diagnóstico en Google <ExternalLink size={15}/></a>
    </div>:null}
   {!report?<a className={styles.external} href={googleReport(site)} target="_blank" rel="noopener noreferrer">Abrir PageSpeed Insights <ArrowUpRight size={16}/></a>:null}
  </div>
  <div className={styles.section}>
   <div className={styles.head}><FileText size={21}/><div><strong>¿Dónde administras tu web?</strong><small>Si no lo sabes, te ayudaremos a averiguarlo.</small></div></div>
   <label className={styles.field}>Plataforma o alojamiento
    <select value={data.platform} onChange={e=>onChange(prev=>({...prev,platform:e.target.value,repositoryHost:"unknown",repositoryUrl:""}))}>
      {platforms.map(([v,label])=><option key={v} value={v}>{label}</option>)}
    </select>
   </label>
   {data.platform==="other"?<label className={styles.field}>¿Cuál es la plataforma?<input value={data.otherPlatform} maxLength={100} onChange={e=>patch("otherPlatform",e.target.value)} placeholder="Nombre de la plataforma"/></label>:null}
   {codePlatforms.includes(data.platform)?<>
    <label className={styles.field}>¿Dónde está guardado el código?
     <select value={data.repositoryHost} onChange={e=>patch("repositoryHost",e.target.value)}>
      <option value="unknown">No lo sé</option><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="bitbucket">Bitbucket</option><option value="other">Otro / archivos locales</option>
     </select>
    </label>
    {data.repositoryHost!=="unknown"&&data.repositoryHost!=="other"?<label className={styles.field}>Enlace del repositorio (opcional)
      <input type="url" inputMode="url" value={data.repositoryUrl} onChange={e=>patch("repositoryUrl",e.target.value)} maxLength={500} placeholder="https://github.com/organizacion/proyecto"/>
     </label>:null}
   </>:null}
   <p className={styles.tip}>Vercel y GitHub no son lo mismo: uno puede alojar tu web y el otro guardar su código. Nunca escribas contraseñas aquí.</p>
  </div>
  <div className={styles.section}>
   <div className={styles.head}><CheckCircle2 size={21}/><strong>¿Quieres que VMV la repare?</strong></div>
   <div className={styles.choices}>
    <button type="button" aria-pressed={data.requestRepair} onClick={()=>patch("requestRepair",true)}>Sí, quiero una cotización</button>
    <button type="button" aria-pressed={!data.requestRepair} onClick={()=>patch("requestRepair",false)}>Solo guardar el diagnóstico</button>
   </div>
   <label className={styles.field}>¿Hay algo más que debamos saber? (opcional)
     <textarea rows={3} value={data.notes} maxLength={1200} onChange={e=>patch("notes",e.target.value)} placeholder="Por ejemplo: mi web está en Vercel, tengo acceso al proyecto…"/>
   </label>
   <p className={styles.tip}>No pedimos acceso todavía. Si hay trabajo de pago, revisaremos el sitio y te enviaremos un presupuesto que podrás aceptar o rechazar.</p>
  </div>
 </div>;
}
