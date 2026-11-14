"use client";
import {useMemo,useState} from "react";
import {ArrowLeft,BookCheck,Check,CheckCircle2,ChevronDown,ChevronUp,Clipboard,
 ClipboardCheck,Lightbulb,LockKeyhole,MessageCircleQuestion,ShieldCheck,Sparkles,TriangleAlert} from "lucide-react";
import type {WizardDraft} from "./AgentSetupWizard";
import {inspectAgent} from "./agentQuality";
import styles from "./AgentQualityLab.module.css";

type Tab="checklist"|"tests"|"brief";
type Props={agent:WizardDraft;onClose:()=>void;onEdit:(step:0|1|2|3)=>void};
export default function AgentQualityLab({agent,onClose,onEdit}:Props){
 const report=useMemo(()=>inspectAgent(agent),[agent]);
 const [tab,setTab]=useState<Tab>("checklist");
 const [expanded,setExpanded]=useState<string|null>(null);
 const [copied,setCopied]=useState<string|null>(null);
 async function copy(value:string,id:string){
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard_unavailable");
   await navigator.clipboard.writeText(value);
   setCopied(id);
  }catch{setCopied("error");}
 }
 const requiredMissing=report.missing.filter(c=>c.priority==="required").length;
 const safeSummary=report.requiredPassed?"Configuración esencial cubierta":"Aún faltan datos esenciales";
 return <div className={styles.root}>
  <div className={styles.topBar}><button type="button" onClick={onClose} className={styles.backButton}>
   <ArrowLeft size={16}/> Mis agentes</button><span className={styles.previewTag}>LAB · VISTA PREVIA</span></div>
  <div className={styles.hero}>
   <div className={styles.heroKicker}><Sparkles size={15}/> VMV AGENT QUALITY LAB</div>
   <h1>Antes de hablar,<br/>que esté preparado.</h1>
   <p>Revisa lo que sabe tu agente y descubre qué necesita aprender.</p>
   <div className={styles.scoreCard}>
    <div className={styles.ring} style={{background:`conic-gradient(#8C5EE9 0% ${report.percent}%, #E5DCF2 ${report.percent}% 100%)`}}>
     <div><strong>{report.percent}%</strong><small>Configurado</small></div>
    </div>
    <div className={styles.scoreDescription}><strong>{safeSummary}</strong>
     <span>{report.checks.filter(c=>c.passed).length} de {report.checks.length} puntos cubiertos</span>
     <em>{requiredMissing} requisitos esenciales pendientes</em>
    </div>
   </div>
  </div>
  <div className={styles.facts}>
   <span><ShieldCheck size={15}/> Evaluación de datos, no de respuestas reales</span>
   <span><LockKeyhole size={15}/> Sin llamadas ni acciones externas</span>
  </div>
  <div className={styles.tabs} role="tablist" aria-label="Panel de calidad">
   {([["checklist","Chequeo"],["tests","Pruebas"],["brief","Ficha"]] as const).map(([id,label])=>
    <button type="button" key={id} role="tab" aria-selected={tab===id}
     onClick={()=>setTab(id)} className={tab===id?styles.tabActive:styles.tab}>{label}</button>)}
  </div>
  {tab==="checklist"?<section className={styles.tabContent}>
   <h2>Lo que aún necesita</h2>
   <p className={styles.sub}>Cada recomendación te lleva a la sección correcta del asistente.</p>
   {report.missing.length===0?<div className={styles.allGood}><CheckCircle2 size={23}/><strong>Ficha de negocio completa</strong>
     <p>El siguiente paso es probar las respuestas reales con clientes ficticios antes de habilitar canales.</p></div>:
     <div className={styles.issueList}>
      {report.missing.map(c=><div key={c.id} className={styles.issue}>
       <span className={c.priority==="required"?styles.requiredIcon:styles.suggestedIcon}>
        {c.priority==="required"?<TriangleAlert size={17}/>:<Lightbulb size={17}/>}</span>
       <div><strong>{c.title}</strong><p>{c.detail}</p>
        <button type="button" onClick={()=>onEdit(c.step)} className={styles.fixLink}>
          Completar ahora <span aria-hidden>→</span></button></div>
      </div>)}
     </div>}
   <h3>Información confirmada</h3>
   <div className={styles.checkedList}>
    {report.checks.filter(c=>c.passed).map(c=><div key={c.id}>
     <CheckCircle2 size={16}/><span>{c.title}</span></div>)}
    {report.checks.every(c=>!c.passed)?<p>Todavía no has completado ningún punto.</p>:null}
   </div>
  </section>:null}
  {tab==="tests"?<section className={styles.tabContent}>
   <h2>Ensayo con clientes</h2>
   <p className={styles.sub}>Preguntas generadas para tu tipo de negocio. Úsalas en el simulador cuando esté conectado y compara con los resultados esperados.</p>
   <div className={styles.testList}>{report.tests.map((test,i)=><article className={styles.testCard} key={test.id}>
    <div className={styles.testHeader}><span>{String(i+1).padStart(2,"0")} · {test.area}</span>
     <button type="button" title="Copiar pregunta" aria-label={"Copiar: "+test.question} onClick={()=>void copy(test.question,test.id)}>
      {copied===test.id?<ClipboardCheck size={17}/>:<Clipboard size={17}/>}</button></div>
    <strong>“{test.question}”</strong>
    <button type="button" className={styles.expectedToggle} aria-expanded={expanded===test.id}
      onClick={()=>setExpanded(p=>p===test.id?null:test.id)}>
     Qué debería responder {expanded===test.id?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>
    {expanded===test.id?<div className={styles.expected}><Check size={16}/><p>{test.expected}</p></div>:null}
   </article>)}</div>
   <div className={styles.notice}><MessageCircleQuestion size={18}/> Estas son pruebas sugeridas, no resultados de un modelo. No hemos evaluado llamadas reales.</div>
  </section>:null}
  {tab==="brief"?<section className={styles.tabContent}>
   <h2>Ficha de entrenamiento</h2>
   <p className={styles.sub}>Un resumen organizado a partir de lo que ya respondiste; listo para revisar y compartir con tu equipo.</p>
   <div className={styles.briefHead}><BookCheck size={20}/><strong>{agent.name}</strong>
    <button type="button" onClick={()=>void copy(report.brief,"brief")}>
     {copied==="brief"?<Check size={15}/>:<Clipboard size={15}/>}
     {copied==="brief"?"Copiada":"Copiar"}</button></div>
   <pre className={styles.briefText}>{report.brief}</pre>
   <div className={styles.notice}><ShieldCheck size={18}/> Esta ficha no envía datos a IA ni publica información de tu negocio.</div>
  </section>:null}
  {copied==="error"?<p role="alert" className={styles.copyError}>No se pudo copiar automáticamente en este navegador.</p>:null}
  <button type="button" onClick={()=>onEdit(report.missing[0]?.step??2)} className={styles.cta}>
   <Sparkles size={17}/> {report.missing.length?"Completar configuración":"Revisar agente"}
  </button>
 </div>;
}
