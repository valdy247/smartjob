"use client";

import {useState} from "react";
import {BrainCircuit,CheckCircle2} from "lucide-react";
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

export default function ScienceWaitQuiz({en,seed}:{en:boolean;seed:string}){
 const [index,setIndex]=useState(()=>[...seed].reduce((n,c)=>n+c.charCodeAt(0),0)%QUESTIONS.length);
 const [chosen,setChosen]=useState<number|null>(null);
 const question=QUESTIONS[index];
 const choices=en?question.choicesEn:question.choicesEs;
 const correct=chosen!==null&&chosen===question.correct;
 return <section className={styles.root} aria-label={en?"Science question while submitting":"Pregunta de ciencia mientras se envía"}>
  <div className={styles.top}><span className={styles.icon}><BrainCircuit size={17}/></span><div><strong>{en?"A quick science challenge":"Un acertijo de ciencia"}</strong><small>{en?"Your request is still being sent. Play while you wait.":"Tu solicitud sigue enviándose. Juega mientras tanto."}</small></div></div>
  <p className={styles.question}>{en?question.en:question.es}</p>
  <div className={styles.choices} role="group" aria-label={en?question.en:question.es}>
   {choices.map((choice,i)=><button key={i} type="button" disabled={chosen!==null} className={chosen!==null&&i===question.correct?styles.right:chosen===i?styles.wrong:styles.choice} onClick={()=>setChosen(i)}>{choice}</button>)}
  </div>
  {chosen!==null?<div className={styles.result} aria-live="polite"><span><CheckCircle2 size={14}/><strong>{correct?(en?"Correct!":"¡Correcto!"):(en?"Good try!":"¡Buen intento!")}</strong> {en?question.factEn:question.factEs}</span><button type="button" onClick={()=>{setChosen(null);setIndex(i=>(i+1)%QUESTIONS.length);}}>{en?"Another question":"Otra pregunta"}</button></div>:null}
 </section>;
}
