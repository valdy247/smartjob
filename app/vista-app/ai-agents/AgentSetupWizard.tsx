"use client";
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,CalendarDays,Check,CheckCircle2,Clock3,PlugZap,ShieldCheck,Sparkles} from "lucide-react";
import styles from "./AgentSetupWizard.module.css";

export type AgentKind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
export type WizardDraft={
 name:string;kind:AgentKind;purpose:string;personality:string;language:string;
 instructions:string;knowledge:string;setup:Record<string,string>;
};
type Question={id:string;title:string;hint?:string;kind?:"text"|"textarea"|"choice"|"multi";options?:string[];required?:boolean;when?:(a:Record<string,string>)=>boolean};
type Section={title:string;subtitle:string;questions:Question[]};
type Props={initial:WizardDraft;onSave:(updated:WizardDraft)=>void;onCancel:()=>void;isPreview?:boolean};
const allRoles:AgentKind[]=["calls","support","sales","bookings","inventory","operations","custom"];
const q=(id:string,title:string,options:string[],required=false,when?:Question["when"]):Question=>({id,title,kind:"choice",options,required,when});
const t=(id:string,title:string,required=false,hint?:string):Question=>({id,title,required,hint,kind:"text"});
const a=(id:string,title:string,required=false,hint?:string):Question=>({id,title,required,hint,kind:"textarea"});
const wants=(s:Record<string,string>,id:string)=>s[id]==="Sí";
const roleQuestions:Record<AgentKind,Question[]>={
 calls:[
 q("calls_goal","¿Qué debe hacer al recibir una llamada?",["Responder preguntas","Tomar mensajes","Identificar posibles ventas","Solicitar citas","Transferir a una persona"],true),
 q("call_forward","Si necesita una persona, ¿qué debe ocurrir?",["Tomar mensaje y avisar al dueño","Transferir a un número autorizado (futuro)","Indicar horario de atención"],true),
 t("call_hello","¿Cómo debe saludar por teléfono?",false,"Ej. Gracias por llamar a..."),
 q("call_after_hours","¿Qué hacer fuera de horario?",["Informar horario","Solicitar mensaje","Derivar a emergencia solo si existe protocolo"],true),
 q("call_consent","¿La empresa tiene una política de aviso y consentimiento para llamadas con IA?",["Sí","Aún debemos definirla"],true)
 ],
 support:[
 a("support_topics","¿Qué preguntas realizan más tus clientes?",true,"Ej. devoluciones, ubicación, tiempos de entrega"),
 q("support_returns","¿Debe explicar políticas de devolución o garantía?",["Sí, con políticas aprobadas","No"],true),
 a("support_exceptions","¿Cuáles son los casos que requieren un empleado?",false)
 ],
 sales:[
 q("sales_goal","¿Cuál es el objetivo comercial principal?",["Informar productos","Calificar interesados","Solicitar datos de contacto con permiso","Preparar una cotización para revisión"],true),
 a("sales_catalog","¿Qué productos o servicios ofrece la empresa?",true,"Nombres, descripción y precios confirmados"),
 q("sales_discounts","¿Puede ofrecer descuentos?",["No","Solo descuentos aprobados por escrito"],true),
 q("sales_handoff","¿Qué hacer si un cliente quiere comprar?",["Derivar a una persona","Recopilar solicitud para revisión"],true)
 ],
 bookings:[
 a("booking_services","¿Qué servicios se pueden reservar y cuánto duran?",true,"Servicio, duración, precio si aplica"),
 q("booking_confirmation","¿Cuándo considerar confirmada una cita?",["Solo después de confirmación humana","Solo tras una futura agenda conectada y autorizada"],true),
 a("booking_rules","¿Cuánto tiempo antes pueden reservar o cancelar?",false),
 q("booking_staff","¿Las citas dependen de empleados o sucursales?",["Sí","No"],true),
 a("booking_staff_details","¿Qué empleados, sedes u horarios hay que distinguir?",false)
 ],
 inventory:[
 q("inventory_goal","¿Qué necesita saber el agente del inventario?",["Disponibilidad de productos","Características y precios","Productos agotados","Solicitudes de reposición"],true),
 a("inventory_products","¿Qué productos o categorías debe conocer?",true,"Categorías y datos autorizados"),
 q("inventory_freshness","Si no hay datos actuales de existencias, ¿qué dirá?",["Que debe confirmar la disponibilidad","Que lo revisará una persona"],true),
 q("inventory_mutations","¿Quieres que prepare solicitudes de ajuste para aprobación?",["Sí, solo propuestas","No"],true)
 ],
 operations:[
 q("ops_goal","¿Qué solicitudes administrativas gestionaría?",["Solicitudes internas","Organización de información","Seguimiento de tareas","Resumen para el dueño"],true),
 a("ops_process","Describe el proceso que debe seguir",true),
 q("ops_permissions","¿Puede modificar información del negocio?",["No, solo sugerir cambios","Solo tras aprobación humana e integración futura"],true)
 ],
 custom:[
 a("custom_tasks","Explica las tareas que deseas delegar al agente",true),
 q("custom_outcome","¿Qué resultado esperas?",["Responder y orientar","Preparar solicitudes","Derivar oportunidades a personas","Resumir información"],true),
 a("custom_limits","¿Qué nunca debería hacer?",true)
 ]
};
function sections(kind:AgentKind):Section[]{
 return [
  {title:"Identidad del agente",subtitle:"Comencemos por definir su función y personalidad.",questions:[]},
  {title:"Conoce tu negocio",subtitle:"Lo esencial para que responda correctamente.",questions:[
   t("business_name","¿Cómo se llama el negocio?",true),
   t("industry","¿A qué se dedica?",true),
   t("location","¿En qué ciudad o zona atiende?",false),
   t("hours","¿Cuál es el horario de atención?",false),
   t("contact","¿Cuál es el medio oficial de contacto?",false,"Correo o teléfono comercial"),
   a("policies","¿Cuáles son las políticas importantes?",false,"Cambios, cancelaciones, garantías, entregas...")
  ]},
  {title:"Qué debe hacer",subtitle:"Preguntas específicas para el trabajo de este agente.",questions:roleQuestions[kind]},
  {title:"Servicios conectados",subtitle:"Preparado para trabajar con las herramientas de VMV.",questions:[
   q("calendar_needed","¿Debe consultar la agenda para informar sobre horarios o citas?",["Sí","No"],true),
   q("calendar_scope","¿Cómo usaría la agenda?",["Consultar disponibilidad","Preparar solicitudes de cita","Ambas"],true,a=>wants(a,"calendar_needed")),
   q("inventory_needed","¿Debe consultar el inventario de VMV?",["Sí","No"],true),
   q("inventory_scope","¿Para qué necesita inventario?",["Consultar productos","Consultar existencias","Ambas"],true,a=>wants(a,"inventory_needed")),
   q("leads_needed","¿Quieres registrar oportunidades o solicitudes de clientes en el futuro?",["Sí","No"],true)
  ]},
  {title:"Reglas y supervisión",subtitle:"Tú decides los límites de este agente.",questions:[
   q("language_rule","¿Qué idioma usará con los clientes?",["Español","English","Bilingüe"],true),
   q("personality_rule","¿Qué estilo de comunicación prefieres?",["Amable y profesional","Cercano","Formal","Directo"],true),
   q("human_review","¿Qué hacer si no conoce la respuesta?",["Reconocerlo y derivar a un humano","Pedir datos y solicitar revisión humana"],true),
   q("data_scope","¿Qué datos personales puede solicitar?",["Solo nombre y medio de contacto con permiso","Ninguno"],true),
   a("restrictions","¿Qué promesas o acciones debe evitar?",false,"No inventar precios, citas, disponibilidad...")
  ]},
  {title:"Revisar y preparar",subtitle:"Comprueba la información antes de crear tu agente.",questions:[]}
 ];
}
function inputValue(v:Record<string,string>,key:string){return v[key]||"";}
export default function AgentSetupWizard({initial,onSave,onCancel,isPreview=true}:Props){
 const [draft,setDraft]=useState<WizardDraft>(()=>({...initial,setup:{...(initial.setup||{})}}));
 const [step,setStep]=useState(0);
 const [error,setError]=useState("");
 const steps=useMemo(()=>sections(draft.kind),[draft.kind]);
 const current=steps[step];
 const shown=current.questions.filter(x=>!x.when||x.when(draft.setup));
 const value=(key:keyof WizardDraft,next:string)=>setDraft(d=>({...d,[key]:next}));
 const answer=(key:string,next:string)=>setDraft(d=>({...d,setup:{...d.setup,[key]:next}}));
 const next=()=>{
  const missing=step===0?(!draft.name.trim()||!draft.purpose.trim()):shown.some(q=>q.required&&!inputValue(draft.setup,q.id).trim());
  if(missing){setError("Completa las preguntas obligatorias antes de continuar.");return;}
  setError("");if(step===steps.length-1){onSave(draft);return;}setStep(x=>x+1);
 };
 const back=()=>{setError("");if(step===0)onCancel();else setStep(x=>x-1);};
 const yesCalendar=wants(draft.setup,"calendar_needed"),yesInventory=wants(draft.setup,"inventory_needed");
 return <section className={styles.root}>
  <div className={styles.progressHead}><span>CONFIGURAR AGENTE</span><strong>{step+1} / {steps.length}</strong></div>
  <div className={styles.progressTrack}><div className={styles.progressBar} style={{width:((step+1)/steps.length*100)+"%"}}/></div>
  <div className={styles.stepDots}>{steps.map((s,i)=><button key={s.title} type="button" className={i===step?styles.stepActive:i<step?styles.stepDone:styles.stepDot}
    onClick={()=>{if(i<step){setStep(i);setError("");}}} aria-label={"Paso "+(i+1)+": "+s.title}>
    {i<step?<Check size={13}/>:i+1}</button>)}</div>
  <div className={styles.titleGroup}><span className={styles.eyebrow}><Sparkles size={14}/> PASO {step+1}</span>
   <h1>{current.title}</h1><p>{current.subtitle}</p></div>
  {step===0?<div className={styles.fields}>
   <label className={styles.field}>¿Cómo se llamará tu agente?<input maxLength={80} value={draft.name} onChange={e=>value("name",e.target.value)} placeholder="Ej. Luna, asistente de ventas"/></label>
   <label className={styles.field}>¿Cuál será su misión?<textarea maxLength={240} rows={3} value={draft.purpose} onChange={e=>value("purpose",e.target.value)} placeholder="¿Qué debe lograr para tu negocio?"/></label>
   <p className={styles.fieldTitle}>¿Cuál será su especialidad?</p>
   <div className={styles.roles}>{allRoles.map(r=><button type="button" key={r} className={draft.kind===r?styles.choiceActive:styles.choice}
    onClick={()=>value("kind",r)}>
    {{calls:"Llamadas",support:"Clientes",sales:"Ventas",bookings:"Reservas",inventory:"Inventario",operations:"Administración",custom:"Personalizado"}[r]}</button>)}</div>
  </div>:null}
  {step>0&&step<steps.length-1?<div className={styles.fields}>{shown.map(question=><div className={styles.question} key={question.id}>
   <label className={styles.fieldTitle} htmlFor={question.kind==="text"||question.kind==="textarea"?"w-"+question.id:undefined}>{question.title}{question.required?<span className={styles.required}> *</span>:null}</label>
   {question.hint?<p className={styles.hint}>{question.hint}</p>:null}
   {question.kind==="choice"?<div className={styles.choices}>{(question.options||[]).map(opt=><button key={opt} type="button"
    className={inputValue(draft.setup,question.id)===opt?styles.choiceActive:styles.choice}
    aria-pressed={inputValue(draft.setup,question.id)===opt}
    onClick={()=>answer(question.id,opt)}>{inputValue(draft.setup,question.id)===opt?<CheckCircle2 size={15}/>:null}{opt}</button>)}</div>:
    question.kind==="textarea"?<textarea id={"w-"+question.id} rows={3} maxLength={500} className={styles.input}
     placeholder="Escribe una respuesta breve..." value={inputValue(draft.setup,question.id)} onChange={e=>answer(question.id,e.target.value)}/>:
    <input id={"w-"+question.id} type="text" maxLength={200} className={styles.input}
     placeholder={question.hint||"Escribe aquí..."} value={inputValue(draft.setup,question.id)} onChange={e=>answer(question.id,e.target.value)}/>}
   </div>)}
   {step===3?<div className={styles.connections}>
    <div className={styles.connection}><CalendarDays size={21}/><span><strong>VMV Scheduling</strong><small>Conector no disponible todavía</small></span><b>NO CONECTADO</b></div>
    <div className={styles.connection}><PlugZap size={21}/><span><strong>VMV Inventory</strong><small>Conector no disponible todavía</small></span><b>NO CONECTADO</b></div>
    {(yesCalendar||yesInventory)?<p className={styles.connectionNote}>Guardaremos esta necesidad en el diseño. No podemos verificar citas ni existencias hasta que estas integraciones estén operativas y autorizadas.</p>:null}
   </div>:null}
  </div>:null}
  {step===steps.length-1?<div className={styles.review}>
    <div className={styles.reviewCard}><strong>{draft.name||"Sin nombre"}</strong><span>{draft.purpose||"Sin propósito"}</span></div>
    <div className={styles.reviewLine}><span>Negocio</span><b>{draft.setup.business_name||"—"}</b></div>
    <div className={styles.reviewLine}><span>Especialidad</span><b>{({calls:"Llamadas",support:"Clientes",sales:"Ventas",bookings:"Reservas",inventory:"Inventario",operations:"Administración",custom:"Personalizado"} as Record<AgentKind,string>)[draft.kind]}</b></div>
    <div className={styles.reviewLine}><span>Idioma</span><b>{draft.setup.language_rule||"Español"}</b></div>
    <div className={styles.reviewLine}><span>Agenda VMV</span><b>{yesCalendar?"Solicitada · pendiente":"No solicitada"}</b></div>
    <div className={styles.reviewLine}><span>Inventario VMV</span><b>{yesInventory?"Solicitado · pendiente":"No solicitado"}</b></div>
    <div className={styles.reviewLine}><span>Supervisión</span><b>{draft.setup.human_review||"Humana"}</b></div>
    <div className={styles.reviewMessage}><ShieldCheck size={20}/><p>Tu agente comenzará como <strong>borrador</strong>. No responderá llamadas ni modificará reservas, inventario o pedidos.</p></div>
    {isPreview?<p className={styles.previewNote}>Esta preview guarda el diseño solo mientras la página esté abierta. No introduzcas información confidencial.</p>:null}
  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <div className={styles.actions}><button type="button" className={styles.prev} onClick={back}><ArrowLeft size={17}/>{step===0?"Cancelar":"Atrás"}</button>
   <button type="button" className={styles.next} onClick={next}>{step===steps.length-1?"Guardar diseño":"Continuar"}
   {step===steps.length-1?<Check size={17}/>:<ArrowRight size={17}/>}</button></div>
 </section>;
}
