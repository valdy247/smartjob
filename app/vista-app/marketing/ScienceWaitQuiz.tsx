"use client";

import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2,XCircle} from "lucide-react";
import styles from "./ScienceWaitQuiz.module.css";

type Question={
 es:string;en:string;choicesEs:[string,string,string];choicesEn:[string,string,string];correct:number;factEs:string;factEn:string;
};
const QUESTIONS:Question[]=[
 {es:"¿Qué gas absorben las plantas durante la fotosíntesis?",en:"Which gas do plants absorb during photosynthesis?",choicesEs:["Oxígeno","Dióxido de carbono","Nitrógeno"],choicesEn:["Oxygen","Carbon dioxide","Nitrogen"],correct:1,factEs:"Las plantas utilizan CO₂ para fabricar azúcares con ayuda de la luz.",factEn:"Plants use CO₂ to make sugars with the help of light."},
 {es:"¿En qué planeta dura más un día que un año?",en:"On which planet is one day longer than one year?",choicesEs:["Venus","Marte","Neptuno"],choicesEn:["Venus","Mars","Neptune"],correct:0,factEs:"Venus tarda unos 243 días terrestres en girar sobre sí mismo y 225 en orbitar el Sol.",factEn:"Venus rotates in about 243 Earth days but orbits the Sun in about 225."},
 {es:"¿Qué partícula del átomo tiene carga negativa?",en:"Which atomic particle has a negative charge?",choicesEs:["Protón","Neutrón","Electrón"],choicesEn:["Proton","Neutron","Electron"],correct:2,factEs:"Los electrones tienen carga negativa; los protones, positiva.",factEn:"Electrons carry a negative charge; protons carry a positive charge."},
 {es:"¿Qué le ocurre al sonido en el vacío del espacio?",en:"What happens to sound in the vacuum of space?",choicesEs:["Viaja más rápido","No se propaga","Se vuelve más agudo"],choicesEn:["It travels faster","It cannot travel","It becomes higher-pitched"],correct:1,factEs:"El sonido necesita un medio material para propagarse.",factEn:"Sound needs a material medium through which to travel."},
 {es:"¿Qué fuerza mantiene a los planetas orbitando el Sol?",en:"What force keeps planets orbiting the Sun?",choicesEs:["Magnetismo","Gravedad","Fricción"],choicesEn:["Magnetism","Gravity","Friction"],correct:1,factEs:"La gravedad del Sol curva las trayectorias de los planetas.",factEn:"The Sun's gravity bends the planets' trajectories."},
 {es:"¿Cuál es el símbolo químico del oro?",en:"What is the chemical symbol for gold?",choicesEs:["Ag","Au","Go"],choicesEn:["Ag","Au","Go"],correct:1,factEs:"Au proviene de «aurum», el nombre latino del oro.",factEn:"Au comes from aurum, the Latin name for gold."},
 {es:"¿Qué unidad se considera la base de los seres vivos?",en:"What is the basic unit of living organisms?",choicesEs:["El átomo","La célula","El órgano"],choicesEn:["The atom","The cell","The organ"],correct:1,factEs:"La célula es la unidad estructural y funcional básica de la vida.",factEn:"The cell is the basic structural and functional unit of life."},
 {es:"A presión atmosférica normal, ¿a qué temperatura hierve el agua?",en:"At standard atmospheric pressure, at what temperature does water boil?",choicesEs:["80 °C","100 °C","120 °C"],choicesEn:["80 °C","100 °C","120 °C"],correct:1,factEs:"A nivel del mar el agua pura hierve cerca de 100 °C.",factEn:"At sea level, pure water boils at about 100 °C."}
];

export default function ScienceWaitQuiz({en,seed,processing,onContinue,mode="request",phase="generate"}:{en:boolean;seed:string;processing:boolean;onContinue:()=>void;mode?:"request"|"audit"|"caption";phase?:"extract"|"transcribe"|"generate"}){
 const [index,setIndex]=useState(()=>[...seed].reduce((n,c)=>n+c.charCodeAt(0),0)%QUESTIONS.length);
 const [chosen,setChosen]=useState<number|null>(null);
 const titleRef=useRef<HTMLHeadingElement>(null);
 const isAudit=mode==="audit";
 const isCaption=mode==="caption";
 const statusLabel=isCaption?(processing?(phase==="extract"?(en?"Extracting audio on your device…":"Extrayendo audio en tu dispositivo…"):phase==="transcribe"?(en?"Transcribing speech…":"Transcribiendo la voz…"):(en?"Writing your caption…":"Preparando tu descripción…")):(en?"Your caption is ready.":"Tu descripción está lista.")):
  processing?(isAudit?(en?"Analyzing your website…":"Analizando tu web…"):(en?"Sending your request…":"Enviando tu solicitud…")):(isAudit?(en?"Analysis complete. You can continue.":"Análisis listo. Puedes continuar."):(en?"Submission finished. You can continue.":"El envío terminó. Puedes continuar."));
 const question=QUESTIONS[index];
 const choices=en?question.choicesEn:question.choicesEs;
 const correct=chosen!==null&&chosen===question.correct;

 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const before=document.body.style.overflow;
  document.body.style.overflow="hidden";
  titleRef.current?.focus();
  return ()=>{document.body.style.overflow=before;previous?.focus();};
 },[]);

 if(typeof document==="undefined")return null;
 return createPortal(<section className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="science-wait-heading"
  onKeyDown={event=>{
   if(event.key!=="Tab")return;
   const focusables=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
   if(!focusables.length){event.preventDefault();return;}
   const first=focusables[0],last=focusables[focusables.length-1];
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===titleRef.current)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }}>
  <button type="button" className={styles.skip} onClick={onContinue}
   aria-label={en?"Skip optional quiz":"Omitir acertijo opcional"}>{en?"Skip":"Omitir"}</button>
  <div className={styles.content}>
   <div className={styles.status} role="status">{processing?<span className={styles.spinner} aria-hidden="true"/>:<CheckCircle2 size={17} aria-hidden="true"/>}{statusLabel}</div>
   <p className={styles.eyebrow}>{en?"Optional science quiz":"Acertijo opcional"}</p>
   <h2 id="science-wait-heading" ref={titleRef} tabIndex={-1} className={styles.question}>{en?question.en:question.es}</h2>
   <div className={styles.choices} role="group" aria-label={en?"Choose your answer":"Elige tu respuesta"}>
    {choices.map((choice,i)=>{
     const isSelected=chosen===i;
     const isCorrect=chosen!==null&&i===question.correct;
     return <button key={i} type="button" disabled={chosen!==null} aria-pressed={isSelected}
      className={isCorrect?styles.right:isSelected?styles.wrong:styles.choice} onClick={()=>setChosen(i)}>
      {choice}{isSelected&&chosen!==null?(correct?<CheckCircle2 size={18} aria-hidden="true"/>:<XCircle size={18} aria-hidden="true"/>):null}
     </button>;
    })}
   </div>
   {chosen!==null?<div className={styles.result} aria-live="polite">
    <p className={styles.resultText}>
     {correct?<><CheckCircle2 className={styles.answerIcon} size={17} aria-hidden="true"/><strong>{en?"Correct answer!":"¡Respuesta correcta!"}</strong></>
     :<><XCircle className={styles.answerIcon} size={17} aria-hidden="true"/><strong>{en?"Incorrect answer.":"Respuesta incorrecta."}</strong>{" "}{en?"You chose":"Elegiste"}: {choices[chosen]}. {en?"Correct":"Correcta"}: {choices[question.correct]}.</>}
    </p>
    <p className={styles.resultText}>{en?question.factEn:question.factEs}</p>
    {processing?<button type="button" className={styles.next} onClick={()=>{setChosen(null);setIndex(i=>(i+1)%QUESTIONS.length);titleRef.current?.focus();}}>{en?"Next question":"Otra pregunta"}</button>:null}
   </div>:<p className={styles.helper}>{processing?(en?"The process continues whether you play or skip.":"El proceso continúa aunque omitas el juego."):(en?"The game is optional.":"El juego es opcional.")}</p>}
   {!processing?<button type="button" className={styles.continue} onClick={onContinue}>
    {en?"Continue":"Continuar"}
   </button>:null}
  </div>
 </section>,document.body);
}
