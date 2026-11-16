"use client";
import {useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,RefreshCw} from "lucide-react";
import {
 getDiagnosticQuestions,getDiagnosticRecommendations,diagnosticComplete,
 type DiagnosticAnswers,type DiagnosticLanguage,type DiagnosticRecord,type DiagnosticService
} from "@/lib/business-diagnostic";
import styles from "./BusinessDiagnostic.module.css";

type Props={
 language:DiagnosticLanguage;
 businessName:string;
 record:DiagnosticRecord|null;
 onSave:(answers:DiagnosticAnswers)=>Promise<void>;
 onClose:()=>void;
 onExplore:(service:DiagnosticService)=>void;
};
export default function BusinessDiagnostic({language,businessName,record,onSave,onClose,onExplore}:Props){
 const [answers,setAnswers]=useState<DiagnosticAnswers>(record?.answers||{});
 const [step,setStep]=useState(record?getDiagnosticQuestions(record.answers).length:0);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(Boolean(record));
 const [saveError,setSaveError]=useState("");
 const questions=getDiagnosticQuestions(answers);
 const complete=step>=questions.length&&diagnosticComplete(answers);
 const recommendations=getDiagnosticRecommendations(answers);
 const es=language==="es";
 const text=(esText:string,enText:string)=>es?esText:enText;
 async function save(next:DiagnosticAnswers){
  setSaving(true);setSaveError("");setSaved(false);
  try{await onSave(next);setSaved(true);}
  catch{setSaveError(text("No pudimos guardar tus respuestas. Reintenta.","We couldn't save your answers. Please retry."));}
  finally{setSaving(false);}
 }
 function choose(id:string,value:string){
  const next={...answers,[id]:value};
  setAnswers(next);
  const nextStep=step+1;
  setStep(nextStep);
  if(nextStep>=getDiagnosticQuestions(next).length)void save(next);
 }
 return <section className={styles.wrap} aria-label={text("Diagnóstico de negocio","Business needs assessment")}>
  <header className={styles.top}>
   <button type="button" onClick={onClose} className={styles.back}><ArrowLeft size={18}/>{text("Inicio","Home")}</button>
   <span className={styles.brand}>VMV Business</span>
  </header>
  {!complete?<>
   <div className={styles.intro}>
    <span className={styles.eyebrow}>{text("Conozcamos tu negocio","Let's learn about your business")}</span>
    <h2>{businessName}</h2>
    <p>{text("Responde unas preguntas para descubrir qué te ayudaría a crecer.","Answer a few questions to discover what could help you grow.")}</p>
   </div>
   <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={step} aria-label={text("Progreso","Progress")}>
    <div style={{width:Math.min(100,Math.round(step/questions.length*100))+"%"}}/>
   </div>
   <span className={styles.counter}>{text("Pregunta","Question")} {step+1} {text("de","of")} {questions.length}</span>
   <h3 className={styles.question}>{questions[step].title[language]}</h3>
   <div className={styles.options}>
    {questions[step].options.map(option=><button type="button" key={option.value} className={styles.option}
     onClick={()=>choose(questions[step].id,option.value)}>{option.label[language]}<ArrowRight size={19}/></button>)}
   </div>
   {step>0?<button type="button" onClick={()=>setStep(step-1)} className={styles.previous}>{text("Anterior","Back")}</button>:null}
  </>:<>
   <div className={styles.finished}>
    <CheckCircle2 size={40} color="#7851C3" aria-hidden="true"/>
    <h2>{text("Diagnóstico completado","Assessment complete")}</h2>
    <p>{recommendations.length?text("Encontramos estas oportunidades para tu negocio.","We found these opportunities for your business."):text("No necesitas destacar servicios nuevos por ahora.","You don't need to feature new services right now.")}</p>
   </div>
   <div className={styles.results}>
    {recommendations.map((item,index)=><article key={item.id} className={[styles.result,styles["tone"+index]].join(" ")}>
     <strong>{item.name}</strong><p>{item.reason[language]}</p>
     {saved?<button type="button" onClick={()=>onExplore(item.id)}>{text("Explorar servicio","Explore service")} <ArrowRight size={16}/></button>:null}
    </article>)}
   </div>
   {saving?<p className={styles.notice} role="status">{text("Guardando respuestas…","Saving your answers…")}</p>:null}
   {saveError?<p className={styles.error} role="alert">{saveError}</p>:null}
   {saveError?<button type="button" className={styles.primary} onClick={()=>void save(answers)}><RefreshCw size={17}/>{text("Reintentar guardado","Retry saving")}</button>:null}
   {saved?<button type="button" className={styles.primary} onClick={onClose}>{text("Volver a mi inicio","Return to my Home")} <ArrowRight size={17}/></button>:null}
   {!saving?<button type="button" className={styles.retake} onClick={()=>{setAnswers({});setStep(0);setSaved(false);setSaveError("");}}>{text("Actualizar mis respuestas","Update my answers")}</button>:null}
  </>}
 </section>;
}
