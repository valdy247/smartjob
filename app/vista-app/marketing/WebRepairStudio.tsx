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
// Honest, evidence-linked explanation even when the AI service is unavailable.
const actionFromFinding=(id:string,title:string)=>{
 const key=(id+" "+title).toLowerCase();
 if(/image|imagen|picture|webp|avif|bitmap/.test(key))return "Revisar y optimizar las imágenes señaladas por Google, y volver a medir la carga.";
 if(/javascript|unused-js|script|third.part/.test(key))return "Comprobar qué scripts son necesarios y reducir el trabajo de código que ralentiza la página.";
 if(/render.block|critical.request|network.dependency|request.chain/.test(key))return "Revisar los recursos que bloquean la aparición del contenido principal.";
 if(/largest.contentful|lcp|initial.server|server.response/.test(key))return "Investigar qué demora el contenido principal y probar una mejora concreta.";
 if(/font|texto visible/.test(key))return "Optimizar la carga de las fuentes para que los textos aparezcan antes.";
 if(/cache|caché/.test(key))return "Revisar cuánto tiempo se guardan los recursos para acelerar visitas posteriores.";
 if(/meta.description|document.title|crawl|robots|index/.test(key))return "Revisar esta configuración para ayudar a los buscadores a interpretar la página.";
 if(/contrast|label|aria|landmark|accessib/.test(key))return "Comprobar y corregir esta barrera de accesibilidad.";
 return "Revisar esta comprobación técnica y determinar si requiere una corrección.";
};
function practicalExplanation(a:WebAudit){
 const scores=a.scores;
 const parts:string[]=[];
 if(scores.performance!==null){
  parts.push(scores.performance>=90?"La velocidad medida es buena.":"La velocidad puede mejorarse"+(scores.performance>=70?", aunque el resultado actual es razonablemente bueno.":"."));
 }
 if(scores.seo!==null&&scores.seo>=95)parts.push("El SEO técnico obtuvo una puntuación alta en las comprobaciones de Google.");
 if(scores.accessibility!==null&&scores.accessibility>=95)parts.push("La accesibilidad también obtuvo una puntuación alta en las comprobaciones automáticas.");
 const findings=(a.findings||[]).filter(f=>typeof f.title==="string"&&f.title.trim()).slice(0,20);
 const candidates=findings.filter(f=>/image|lcp|largest.contentful|script|javascript|render.block|network.dependency|server.response|cache|font|third.part/i.test(f.id+" "+f.title));
 const chosen=(candidates.length?candidates:findings).slice(0,3);
 if(chosen.length){
  parts.push("Para mejorar, estas son las primeras revisiones que proponemos, basadas en los hallazgos de Google:");
  chosen.forEach((f,i)=>parts.push((i+1)+". "+actionFromFinding(f.id,f.title)+" (Evidencia: "+f.title+")"));
 }else{
  parts.push("Google no señaló problemas concretos entre los hallazgos recibidos. No recomendamos reparaciones sin una revisión adicional.");
 }
 parts.push("Antes de cambiar tu web, VMV debe comprobar qué solución corresponde a su plataforma y enviarte un presupuesto para aprobar.");
 return parts.join("\n\n");
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
     <div className={styles.explain}><strong>{report.explanationSource==="ai"?"Qué te recomienda la IA":"Qué podemos mejorar"}</strong>
      <p>{report.explanation||practicalExplanation(report)}</p>
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
