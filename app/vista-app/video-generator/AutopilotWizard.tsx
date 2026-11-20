"use client";
import {useState} from "react";
import {
 ArrowLeft,ArrowRight,Check,CheckCircle2,Clapperboard,CalendarDays,
 Camera,CakeSlice,Coins,Download,Dumbbell,Film,Globe2,Heart,House,Instagram,
 Laptop,Lightbulb,LoaderCircle,Megaphone,Package,Palette,PauseCircle,
 ShieldCheck,ShoppingBag,Shirt,Sparkles,Target,Users,WandSparkles,Workflow
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import css from "./AutopilotWizard.module.css";

export type AutopilotPlan={
 id:string;niche:string;audience:string;goal:string;style:string;frequency:number;
 model:"gen4.5"|"kling";monthly_budget_cents:number;delivery:"download"|"social_draft";
};
type Props={
 initial:AutopilotPlan;en:boolean;busy:boolean;
 onSave:(plan:AutopilotPlan,prepare:boolean)=>Promise<boolean>;
 onExit:()=>void;onLibrary:()=>void;
};
type Choice={id:string;es:string;en:string;Icon:LucideIcon};
const niches:Choice[]=[
 {id:"Repostería",es:"Repostería",en:"Baking",Icon:CakeSlice},
 {id:"Moda",es:"Moda",en:"Fashion",Icon:Shirt},
 {id:"Fitness",es:"Fitness",en:"Fitness",Icon:Dumbbell},
 {id:"Tecnología",es:"Tecnología",en:"Tech",Icon:Laptop},
 {id:"Bienes raíces",es:"Inmuebles",en:"Real estate",Icon:House},
 {id:"Historias",es:"Historias",en:"Stories",Icon:Clapperboard}
];
const goals:Choice[]=[
 {id:"Atraer clientes",es:"Más clientes",en:"More customers",Icon:ShoppingBag},
 {id:"Crecer en redes",es:"Más seguidores",en:"More followers",Icon:Heart},
 {id:"Promocionar productos",es:"Mostrar productos",en:"Show products",Icon:Package},
 {id:"Educar y compartir",es:"Compartir ideas",en:"Share ideas",Icon:Lightbulb}
];
const styles:Choice[]=[
 {id:"realistic",es:"Realista",en:"Realistic",Icon:Camera},
 {id:"cinematic",es:"Cine",en:"Cinematic",Icon:Film},
 {id:"animated",es:"Animado",en:"Animated",Icon:Palette},
 {id:"product",es:"Producto",en:"Product",Icon:Package}
];
const audiences=["Clientes locales","Público general","Emprendedores"] as const;
const titles=[
 ["¿De qué trata tu contenido?","What is your content about?"],
 ["¿Qué quieres lograr?","What is your goal?"],
 ["¿Cómo quieres que se vea?","Choose your visual style"],
 ["¿Cuántos videos por semana?","How many videos per week?"],
 ["Elige tus límites","Choose your limits"],
 ["¿Qué harás con los videos?","What will you do with the videos?"],
 ["Tu plan está listo","Your plan is ready"]
];
const subtitles=[
 ["Elige un tema o escribe uno.","Pick a topic or enter your own."],
 ["Un objetivo y tu público.","One goal and your audience."],
 ["Un toque define el estilo.","Just tap a style."],
 ["Es una meta; todavía no se programa solo.","A target, not an active schedule yet."],
 ["Sin cargos automáticos.","No automatic charges."],
 ["Tú aprobarás cada creación.","You approve every creation."],
 ["Revisa y guarda tu configuración.","Review and save your plan."]
];
export default function AutopilotWizard({initial,en,busy,onSave,onExit,onLibrary}:Props){
 const [plan,setPlan]=useState<AutopilotPlan>(initial);
 const [step,setStep]=useState(0);
 const [saved,setSaved]=useState(false);
 const [customNiche,setCustomNiche]=useState(!niches.some(n=>n.id===initial.niche)&&Boolean(initial.niche));
 const [customAudience,setCustomAudience]=useState(Boolean(initial.audience)&&!audiences.includes(initial.audience as typeof audiences[number]));
 const L=(es:string,english:string)=>en?english:es;
 const patch=(next:Partial<AutopilotPlan>)=>{setPlan(p=>({...p,...next}));setSaved(false);};
 const valid=step!==0||plan.niche.trim().length>=3;
 const card=(option:Choice,selected:boolean,onClick:()=>void)=><button type="button"
  key={option.id} aria-pressed={selected} onClick={onClick}
  className={css.choice+(selected?" "+css.selected:"")}>
   <span className={css.iconBubble}><option.Icon size={25} strokeWidth={1.85}/></span>
   <strong>{en?option.en:option.es}</strong>
   {selected?<CheckCircle2 size={19} className={css.tick}/>:null}
  </button>;
 const save=async(prepare:boolean)=>{
  if(busy||!plan.niche.trim()||plan.niche.trim().length<3)return;
  const ok=await onSave({...plan,niche:plan.niche.trim(),audience:plan.audience.trim()},prepare);
  if(ok&&!prepare)setSaved(true);
 };
 if(saved)return <section className={css.wrap}>
  <div className={css.complete}>
   <span className={css.completeIcon}><CheckCircle2 size={37}/></span>
   <span className={css.kicker}>VMV BUSINESS · AUTOPILOT</span>
   <h2>{L("¡Tu plan está guardado!","Your plan is saved!")}</h2>
   <p>{L("Puedes preparar el primer video. Las generaciones recurrentes siguen pausadas.","Prepare your first video. Recurring generations remain paused.")}</p>
   <div className={css.completeStatus}><PauseCircle size={19}/>{L("Piloto en pausa · sin cargos automáticos","Pilot paused · no automatic charges")}</div>
   <button type="button" className={css.action} disabled={busy} onClick={()=>void save(true)}>
    {busy?<LoaderCircle size={18} className={css.spin}/>:<WandSparkles size={20}/>}
    {L("Preparar primer video","Prepare first video")} <ArrowRight size={18}/>
   </button>
   <button type="button" className={css.altAction} onClick={onLibrary}><Clapperboard size={18}/>{L("Ver mis videos","My videos")}</button>
   <button type="button" className={css.textAction} onClick={onExit}>{L("Volver al estudio","Back to studio")}</button>
  </div>
 </section>;
 return <section className={css.wrap}>
  <div className={css.top}><span className={css.kicker}><Workflow size={16}/> VIDEO AUTOPILOT</span>
   <span className={css.stepCounter}>{L("Paso","Step")} {step+1}/{titles.length}</span></div>
  <div className={css.progress} role="progressbar" aria-valuemin={1} aria-valuemax={titles.length}
   aria-valuenow={step+1} aria-label={L("Progreso del asistente","Wizard progress")}>
   <span style={{width:`${((step+1)/titles.length)*100}%`}}/>
  </div>
  <div className={css.heading}>
   <div className={css.miniRobot}><Sparkles size={27}/></div>
   <h2>{titles[step][en?1:0]}</h2>
   <p>{subtitles[step][en?1:0]}</p>
  </div>
  <div className={css.content} key={step}>
   {step===0?<div className={css.grid}>
    {niches.map(option=>card(option,!customNiche&&plan.niche===option.id,()=>{setCustomNiche(false);patch({niche:option.id});}))}
    <button type="button" className={css.choice+(customNiche?" "+css.selected:"")}
     aria-pressed={customNiche} onClick={()=>{setCustomNiche(true);patch({niche:customNiche?plan.niche:""});}}>
     <span className={css.iconBubble}><WandSparkles size={25}/></span><strong>{L("Otro tema","Other topic")}</strong>
    </button>
    {customNiche?<label className={css.inlineField}>{L("Tu tema","Your topic")}
     <input autoFocus value={plan.niche} maxLength={160} placeholder={L("Ej. Jardinería","e.g. Gardening")}
      onChange={e=>patch({niche:e.target.value})}/></label>:null}
   </div>:null}
   {step===1?<div className={css.stack}>
    <div className={css.grid}>{goals.map(option=>card(option,plan.goal===option.id,()=>patch({goal:option.id})))}</div>
    <label className={css.miniLabel}>{L("¿A quién?","Who is it for?")}</label>
    <div className={css.chips}>
     {audiences.map(a=><button key={a} type="button" aria-pressed={!customAudience&&plan.audience===a}
      className={css.chip+(!customAudience&&plan.audience===a?" "+css.chipActive:"")}
      onClick={()=>{setCustomAudience(false);patch({audience:a});}}>{a==="Clientes locales"?L("Clientes locales","Local customers"):a==="Público general"?L("Todos","Everyone"):L("Emprendedores","Entrepreneurs")}</button>)}
     <button type="button" aria-pressed={customAudience} className={css.chip+(customAudience?" "+css.chipActive:"")}
      onClick={()=>{setCustomAudience(true);patch({audience:""});}}>{L("Otro","Other")}</button>
    </div>
    {customAudience?<label className={css.inlineField}>{L("Tu público","Your audience")}
     <input autoFocus value={plan.audience} maxLength={180} onChange={e=>patch({audience:e.target.value})}/></label>:null}
   </div>:null}
   {step===2?<div className={css.grid}>{styles.map(option=>card(option,plan.style===option.id,()=>patch({style:option.id})))}</div>:null}
   {step===3?<div className={css.grid}>
    {([1,3,5,7] as const).map(n=><button type="button" key={n} aria-pressed={plan.frequency===n}
     className={css.choice+" "+css.frequency+(plan.frequency===n?" "+css.selected:"")}
     onClick={()=>patch({frequency:n})}>
      <CalendarDays size={26}/><strong>{n}</strong>
      <small>{n===1?L("video / semana","video / week"):L("videos / semana","videos / week")}</small>
      {plan.frequency===n?<CheckCircle2 size={19} className={css.tick}/>:null}
     </button>)}
    </div>:null}
   {step===4?<div className={css.stack}>
    <label className={css.miniLabel}>{L("Motor de video","Video engine")}</label>
    <div className={css.grid}>
     <button type="button" aria-pressed={plan.model==="gen4.5"} className={css.choice+(plan.model==="gen4.5"?" "+css.selected:"")}
      onClick={()=>patch({model:"gen4.5"})}><span className={css.iconBubble}><Film size={25}/></span><strong>Runway</strong><small>Gen-4.5</small></button>
     <button type="button" aria-pressed={plan.model==="kling"} className={css.choice+(plan.model==="kling"?" "+css.selected:"")}
      onClick={()=>patch({model:"kling"})}><span className={css.iconBubble}><Sparkles size={25}/></span><strong>Kling</strong><small>3.0 Pro</small></button>
    </div>
    <label className={css.miniLabel}>{L("Presupuesto mensual máximo previsto","Planned monthly budget limit")}</label>
    <div className={css.budgetGrid}>{[1500,3000,6000].map(value=><button key={value} type="button"
     aria-pressed={plan.monthly_budget_cents===value} onClick={()=>patch({monthly_budget_cents:value})}
     className={css.budget+(plan.monthly_budget_cents===value?" "+css.budgetActive:"")}>
     <Coins size={20}/><strong>${(value/100).toFixed(0)}</strong><small>USD</small>
    </button>)}</div>
    <p className={css.hint}><ShieldCheck size={16}/>{L("Es solo un límite guardado. No autoriza cargos; los precios se confirman antes de generar.","This only saves a limit. It does not authorize charges; pricing is confirmed before generation.")}</p>
   </div>:null}
   {step===5?<div className={css.stack}>
    <div className={css.grid}>
     <button type="button" aria-pressed={plan.delivery==="download"} onClick={()=>patch({delivery:"download"})}
      className={css.choice+(plan.delivery==="download"?" "+css.selected:"")}>
      <span className={css.iconBubble}><Download size={25}/></span><strong>{L("Descargar","Download")}</strong><small>{L("Guardar y compartir","Save and share")}</small></button>
     <button type="button" aria-pressed={plan.delivery==="social_draft"} onClick={()=>patch({delivery:"social_draft"})}
      className={css.choice+(plan.delivery==="social_draft"?" "+css.selected:"")}>
      <span className={css.iconBubble}><Instagram size={25}/></span><strong>{L("Preparar redes","Prepare socials")}</strong><small>{L("Contenido para revisar","Content for review")}</small></button>
    </div>
    <div className={css.safety}><ShieldCheck size={22}/><div><strong>{L("Siempre con tu aprobación","Always your decision")}</strong>
     <span>{L("Publicación automática: próximamente.","Automatic publishing: coming later.")}</span></div></div>
   </div>:null}
   {step===6?<div className={css.review}>
    <div className={css.summaryTiles}>
     <div><Target size={19}/><span>{L("Tema","Topic")}</span><strong>{plan.niche}</strong></div>
     <div><Megaphone size={19}/><span>{L("Meta","Goal")}</span><strong>{plan.goal||L("Crecer","Grow")}</strong></div>
     <div><Palette size={19}/><span>{L("Estilo","Style")}</span><strong>{styles.find(s=>s.id===plan.style)?.[en?"en":"es"]||plan.style}</strong></div>
     <div><CalendarDays size={19}/><span>{L("Ritmo","Target")}</span><strong>{plan.frequency}/{L("semana","week")}</strong></div>
     <div><Coins size={19}/><span>{L("Límite previsto","Budget limit")}</span><strong>${(plan.monthly_budget_cents/100).toFixed(0)} USD</strong></div>
     <div><Download size={19}/><span>{L("Entrega","Delivery")}</span><strong>{plan.delivery==="download"?L("Descargar","Download"):L("Revisión para redes","Social draft")}</strong></div>
    </div>
    <div className={css.safety}><PauseCircle size={22}/><div><strong>{L("Piloto en pausa","Autopilot paused")}</strong>
     <span>{L("Se guarda tu plan. No inicia videos, cobros ni publicaciones automáticas.","Your plan is saved. No automatic videos, charges or publishing are started.")}</span></div></div>
   </div>:null}
  </div>
  <div className={css.actions}>
   <button type="button" className={css.back} disabled={busy} onClick={()=>step?setStep(i=>i-1):onExit()}>
    <ArrowLeft size={18}/>{step?L("Atrás","Back"):L("Salir","Exit")}</button>
   {step<6?<button type="button" className={css.action} disabled={!valid||busy}
    onClick={()=>setStep(i=>Math.min(6,i+1))}>{L("Continuar","Continue")}<ArrowRight size={19}/></button>:
    <button type="button" className={css.action} disabled={busy||!valid}
     onClick={()=>void save(false)}>
     {busy?<LoaderCircle size={19} className={css.spin}/>:<Check size={19}/>}
     {busy?L("Guardando…","Saving…"):L("Guardar mi plan","Save my plan")}
    </button>}
  </div>
 </section>;
}
