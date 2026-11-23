"use client";
import {useState} from "react";
import {ArrowLeft,Check,LoaderCircle,ShieldCheck,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {V1_NEEDS_QUESTIONS,VMV_V1_NEEDS_KEY,completeV1Needs,type V1NeedsAnswers} from "@/lib/vmv-v1-recommendations";
import styles from "./VMVV1Shell.module.css";

type Props={businessId:string;en:boolean;initial?:V1NeedsAnswers|null;onSaved:(answers:V1NeedsAnswers)=>void;onClose:()=>void};
export default function VMVV1NeedsAssessment({businessId,en,initial,onSaved,onClose}:Props){
 const [answers,setAnswers]=useState<Partial<V1NeedsAnswers>>(initial||{});
 const [step,setStep]=useState(0);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const question=V1_NEEDS_QUESTIONS[step];
 const finish=async(next:Partial<V1NeedsAnswers>)=>{
  if(!completeV1Needs(next))return;
  setSaving(true);setError("");
  try{
   const supabase=getSupabase();
   if(!supabase)throw Error(en?"Session unavailable.":"La sesión no está disponible.");
   const {data:{user},error:identityError}=await supabase.auth.getUser();
   if(identityError||!user)throw Error(en?"Sign in to save.":"Inicia sesión para guardar.");
   const saved={version:1,businessId,answers:next,completedAt:new Date().toISOString()};
   const {error:saveError}=await supabase.auth.updateUser({data:{[VMV_V1_NEEDS_KEY]:saved}});
   if(saveError)throw saveError;
   onSaved(next);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setSaving(false);}
 };
 const choose=(value:string)=>{
  if(!question||saving)return;
  const next={...answers,[question.id]:value};
  setAnswers(next);
  if(step===V1_NEEDS_QUESTIONS.length-1)void finish(next);
  else setStep(s=>s+1);
 };
 return <section className={styles.assessment} aria-label={en?"Business needs assessment":"Diagnóstico de tu negocio"}>
  <div className={styles.assessmentHeader}>
   <button type="button" className={styles.assessmentBack} onClick={()=>step>0?setStep(s=>s-1):onClose()}><ArrowLeft size={18}/>{en?"Back":"Volver"}</button>
   <span>{step+1} / {V1_NEEDS_QUESTIONS.length}</span>
   <button type="button" className={styles.assessmentClose} onClick={onClose} aria-label={en?"Close":"Cerrar"}><X size={18}/></button>
  </div>
  <div className={styles.assessmentProgress}><span style={{width:String((step+1)/V1_NEEDS_QUESTIONS.length*100)+"%"}}/></div>
  <div className={styles.assessmentIntro}>
   <span className={styles.overline}>VMV BUSINESS</span>
   <h2>{en?"Your business, your priorities":"Tu negocio, tus prioridades"}</h2>
   <p>{en?"These answers will help us select four useful tools for your Home.":"Con tus respuestas seleccionaremos cuatro herramientas útiles para tu inicio."}</p>
  </div>
  <h3>{en?question.en:question.es}</h3>
  <div className={styles.assessmentOptions}>
   {question.options.map(option=><button key={option.value} type="button" disabled={saving} onClick={()=>choose(option.value)}>
    <span>{en?option.en:option.es}</span>
    {answers[question.id]===option.value?<Check size={18}/>:null}
   </button>)}
  </div>
  {saving?<p className={styles.assessmentSaving}><LoaderCircle size={16}/> {en?"Saving your preferences…":"Guardando tus preferencias…"}</p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <p className={styles.assessmentPrivacy}><ShieldCheck size={15}/>{en?"Recommendations use only your answers, not private calls or purchases.":"Las recomendaciones se basan en tus respuestas, no en llamadas ni compras privadas."}</p>
 </section>;
}
