"use client";
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,CalendarDays,Check,CheckCircle2,Clock3,PlugZap,ShieldCheck,Sparkles} from "lucide-react";
import styles from "./AgentSetupWizard.module.css";

export type AgentKind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
export type WizardDraft={
 name:string;kind:AgentKind;purpose:string;personality:string;language:string;
 instructions:string;knowledge:string;setup:Record<string,string>;
};
type Question={id:string;title:string;hint?:string;kind?:"text"|"textarea"|"choice"|"multi"|"state"|"hours";options?:string[];required?:boolean;when?:(a:Record<string,string>)=>boolean};
type Section={title:string;subtitle:string;questions:Question[]};
type Props={initial:WizardDraft;onSave:(updated:WizardDraft)=>Promise<void>|void;onCancel:()=>void;isPreview?:boolean;initialStep?:0|1|2|3;saving?:boolean};
const allRoles:AgentKind[]=["calls","support","sales","bookings","inventory","operations","custom"];
const q=(id:string,title:string,options:string[],required=false,when?:Question["when"]):Question=>({id,title,kind:"choice",options,required,when});
const t=(id:string,title:string,required=false,hint?:string):Question=>({id,title,required,hint,kind:"text"});
const a=(id:string,title:string,required=false,hint?:string):Question=>({id,title,required,hint,kind:"textarea"});
const wants=(s:Record<string,string>,id:string)=>s[id]==="Sí";
const US_STATES=["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","Washington D.C."];
const days=[["mon","Lunes"],["tue","Martes"],["wed","Miércoles"],["thu","Jueves"],["fri","Viernes"],["sat","Sábado"],["sun","Domingo"]] as const;
const times=Array.from({length:49},(_,i)=>String(Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00"));
const taxiBusiness=(a:Record<string,string>)=>/taxi|taxista|transport|traslado|conductor|chofer|ch[oó]fer|ride.?share|limo|car service|uber|lyft/i.test(a.industry||"");
const stateQuestion:Question={id:"state",title:"¿En qué estado está tu negocio?",kind:"state",required:true,when:a=>a.country!=="Otro país"};
const hourQuestion:Question={id:"hours",title:"¿Cuándo atiendes a los clientes?",kind:"hours"};
const availableTools={calendar:false,inventory:false}; // Enable only after verified tenant connector authorization.
function bookingQuestions(a:Record<string,string>):Question[]{
 const taxi=taxiBusiness(a);
 return [
  ...(taxi?[
    q("booking_service_type","¿Qué viajes pueden solicitarte?",["Viajes dentro de la ciudad","Traslados al aeropuerto","Viajes programados","Servicio por horas","Otro"],true),
    t("booking_custom_service","¿Qué otro servicio de transporte ofreces?",true)
  ].map(item=>item.id==="booking_custom_service"?{...item,when:(x:Record<string,string>)=>x.booking_service_type==="Otro"}:item):[
    t("booking_services","¿Qué servicio pueden reservarte?",true,"Por ejemplo: "+(a.industry||"consulta, servicio, cita")),
    q("booking_duration","¿Cuánto dura normalmente ese servicio?",["15 minutos","30 minutos","1 hora","2 horas","Variable, según el cliente"],true)
  ]),
  q("booking_lead","¿Con cuánto tiempo de anticipación aceptas una reserva?",["De inmediato","15 minutos","30 minutos","1 hora","2 horas","24 horas","Otro"],true),
  t("booking_lead_other","¿Con cuánto tiempo exactamente?",true,undefined),
  q("booking_cancel","¿Hasta cuándo permites cancelar sin penalización?",["En cualquier momento","30 minutos antes","1 hora antes","2 horas antes","24 horas antes","No permito cancelaciones","Otro"],true),
  t("booking_cancel_other","¿Cuál es la regla de cancelación?",true),
  q("booking_confirmation","¿Cuándo le decimos al cliente que la reserva está confirmada?",["Después de que yo la confirme","Solo cuando una agenda autorizada lo confirme"],true),
  q("booking_staff",taxi?"¿Quién puede atender los viajes?":"¿Quién atiende las reservas?",taxi?["Solo yo","Varios conductores"]:["Solo yo","Varias personas","Varias sucursales"],true),
  t("booking_staff_details",taxi?"¿Cuántos conductores trabajan?":"¿Qué personas o sedes pueden atender?",true)
 ].map(item=>{
  if(item.id==="booking_lead_other")return {...item,when:(x:Record<string,string>)=>x.booking_lead==="Otro"};
  if(item.id==="booking_cancel_other")return {...item,when:(x:Record<string,string>)=>x.booking_cancel==="Otro"};
  if(item.id==="booking_staff_details")return {...item,when:(x:Record<string,string>)=>x.booking_staff!=="Solo yo"};
  return item;
 });
}

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
 bookings:[],

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
function sections(kind:AgentKind,answers:Record<string,string>):Section[]{
 return [
  {title:"Identidad del agente",subtitle:"Comencemos por definir su función y personalidad.",questions:[]},
  {title:"Conoce tu negocio",subtitle:"Lo esencial para que responda correctamente.",questions:[
   t("business_name","¿Cómo se llama el negocio?",true),
   t("industry","¿A qué se dedica?",true),
   q("country","¿En qué país está tu negocio?",["Estados Unidos","Otro país"],true),
   t("city","¿En qué ciudad atiendes?",true,"Ej. Columbus"),
   stateQuestion,
   {...t("region_other","¿En qué estado, provincia o región?",true),when:x=>x.country==="Otro país"},
   hourQuestion,
   t("contact","¿Qué teléfono o correo comercial pueden usar tus clientes?"),
   q("policy_type","¿Tienes reglas de cambios o cancelaciones que el cliente deba conocer?",["No, ninguna especial","Sí, tengo reglas","Prefiero confirmarlas personalmente"],true),
   {...a("policies","Explícanos esas reglas para que el agente las conozca",true),when:x=>x.policy_type==="Sí, tengo reglas"}
  ]},
  {title:"Qué debe hacer",subtitle:"Preguntas específicas para el trabajo de este agente.",questions:kind==="bookings"?bookingQuestions(answers):roleQuestions[kind]},
  // Hidden until a tenant-scoped, authorized VMV connector is genuinely available.
  ...(availableTools.calendar||availableTools.inventory?[{title:"Herramientas conectadas",subtitle:"Permisos específicos.",questions:[
   ...(availableTools.calendar?[q("calendar_needed","¿Deseas dar permiso de lectura a la agenda?",["Sí","No"],true)]:[]),
   ...(availableTools.inventory&&["inventory","sales"].includes(kind)?[q("inventory_needed","¿Deseas consultar el inventario autorizado?",["Sí","No"],true)]:[])
  ]}]:[]),
  {title:"Reglas y supervisión",subtitle:"Tú decides los límites de este agente.",questions:[
   q("language_rule","¿Qué idioma usará con los clientes?",["Español","English","Bilingüe"],true),
   q("personality_rule","¿Qué estilo de comunicación prefieres?",["Amable y profesional","Cercano","Formal","Directo"],true),
   q("human_review","¿Qué hacer si no conoce la respuesta?",["Reconocerlo y derivar a un humano","Pedir datos y solicitar revisión humana"],true),
   q("data_scope","¿Qué datos personales puede solicitar?",["Solo nombre y medio de contacto con permiso","Ninguno"],true),
   q("call_disclosure","¿Aceptas que el agente avise que es una inteligencia artificial?",["Sí","Todavía no"],true,
    a=>a.channel==="Teléfono"||a.channel==="Teléfono y chat"),
   a("restrictions","¿Qué promesas o acciones debe evitar?",false,"No inventar precios, citas, disponibilidad...")
  ]},
  {title:"Revisar y preparar",subtitle:"Comprueba la información antes de crear tu agente.",questions:[]}
 ];
}
function inputValue(v:Record<string,string>,key:string){return v[key]||"";}
export default function AgentSetupWizard({initial,onSave,onCancel,isPreview=false,initialStep=0,saving=false}:Props){
 const [draft,setDraft]=useState<WizardDraft>(()=>({...initial,setup:{...(initial.setup||{})}}));
 const [step,setStep]=useState<number>(initialStep);
 const [error,setError]=useState("");
 const steps=useMemo(()=>sections(draft.kind,draft.setup),[draft.kind,draft.setup]);
 const current=steps[step];
 const shown=current.questions.filter(x=>!x.when||x.when(draft.setup));
 const value=(key:keyof WizardDraft,next:string)=>setDraft(d=>({...d,[key]:next}));
 const answer=(key:string,next:string)=>setDraft(d=>({...d,setup:{...d.setup,[key]:next}}));
 const next=async()=>{
  const missing=step===0?(!draft.name.trim()||!draft.purpose.trim()):shown.some(q=>q.required&&!inputValue(draft.setup,q.id).trim());
  if(missing){setError("Completa las preguntas obligatorias antes de continuar.");return;}
  setError("");if(step===steps.length-1){
   if(saving)return;
   try{await onSave(draft);}catch(e){
    setError(e instanceof Error?e.message:"No se pudo guardar. Intenta de nuevo.");
   }
   return;
  }setStep(x=>x+1);
 };
 const back=()=>{setError("");if(step===0)onCancel();else setStep(x=>x-1);};
 const yesCalendar=availableTools.calendar&&wants(draft.setup,"calendar_needed"),yesInventory=availableTools.inventory&&wants(draft.setup,"inventory_needed");
 const setHours=(mode:string)=>{
  const pairs:Record<string,string>={};
  if(mode==="24/7"){days.forEach(([key])=>{pairs["h_"+key+"_active"]="Sí";pairs["h_"+key+"_open"]="00:00";pairs["h_"+key+"_close"]="24:00";});}
  if(mode==="Lunes a viernes · 9–5"){days.forEach(([key],i)=>{pairs["h_"+key+"_active"]=i<5?"Sí":"No";pairs["h_"+key+"_open"]="09:00";pairs["h_"+key+"_close"]="17:00";});}
  if(mode==="Todos los días · 9–5"){days.forEach(([key])=>{pairs["h_"+key+"_active"]="Sí";pairs["h_"+key+"_open"]="09:00";pairs["h_"+key+"_close"]="17:00";});}
  setDraft(d=>({...d,setup:{...d.setup,...pairs,hours_mode:mode}}));
 };
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
    onClick={()=>setDraft(d=>({...d,kind:r,purpose:d.kind===r?d.purpose:({calls:"Orientar a las personas que llaman.",support:"Responder preguntas de clientes.",sales:"Informar y calificar oportunidades comerciales.",bookings:"Recibir solicitudes de citas y explicar las políticas.",inventory:"Consultar información autorizada de productos.",operations:"Organizar solicitudes administrativas.",custom:"Cumplir una misión definida por el negocio."} as Record<AgentKind,string>)[r]}))}>
    {{calls:"Llamadas",support:"Clientes",sales:"Ventas",bookings:"Reservas",inventory:"Inventario",operations:"Administración",custom:"Personalizado"}[r]}</button>)}</div>
   <p className={styles.fieldTitle}>¿Dónde trabajará?</p>
   <div className={styles.choices}>{["Teléfono","Chat","Teléfono y chat"].map(x=><button type="button"
    key={x} className={(draft.setup.channel||"Chat")===x?styles.choiceActive:styles.choice}
    onClick={()=>answer("channel",x)}>{x}</button>)}</div>
   <p className={styles.fieldTitle}>¿Qué tareas tendrá permitidas?</p>
   <div className={styles.choices}>{([["cap_attend","Atender preguntas"],["cap_sales","Vender por teléfono o chat"],["cap_bookings","Solicitar reservas"],["cap_catalog","Consultar catálogo"]] as const).map(([key,label])=>
    <button type="button" key={key} aria-pressed={draft.setup[key]==="Sí"}
    className={draft.setup[key]==="Sí"?styles.choiceActive:styles.choice}
    onClick={()=>answer(key,draft.setup[key]==="Sí"?"No":"Sí")}>{draft.setup[key]==="Sí"?"✓ ":""}{label}</button>)}</div>
   {draft.setup.cap_sales==="Sí"?<>
    <p className={styles.fieldTitle}>Autorizaciones de ventas</p>
    <div className={styles.choices}>{([["perm_prepare_order","Preparar pedidos"],["perm_confirm_order","Confirmar tras aceptación"],["perm_payment_link","Ofrecer enlace de pago verificado"]] as const).map(([key,label])=>
     <button type="button" key={key} aria-pressed={draft.setup[key]==="Sí"}
      className={draft.setup[key]==="Sí"?styles.choiceActive:styles.choice}
      onClick={()=>answer(key,draft.setup[key]==="Sí"?"No":"Sí")}>{draft.setup[key]==="Sí"?"✓ ":""}{label}</button>)}</div>
    <p className={styles.hint}>No tomará números de tarjeta por llamada. Los importes se calculan en el servidor.</p>
   </>:null}
  </div>:null}
  {step>0&&step<steps.length-1?<div className={styles.fields}>
   {step===2&&draft.setup.industry?<div className={styles.context}><Sparkles size={15}/> Negocio: <strong>{draft.setup.industry}</strong> · {draft.setup.city||""}{draft.setup.state?", "+draft.setup.state:""}. No necesitas repetir esos datos.</div>:null}
   {shown.map(question=><div className={styles.question} key={question.id}>
   <label className={styles.fieldTitle} htmlFor={question.kind==="text"||question.kind==="textarea"?"w-"+question.id:undefined}>{question.title}{question.required?<span className={styles.required}> *</span>:null}</label>
   {question.hint?<p className={styles.hint}>{question.hint}</p>:null}
   {question.kind==="hours"?<div className={styles.hours}>
    <div className={styles.choices}>{["24/7","Lunes a viernes · 9–5","Todos los días · 9–5","Personalizado"].map(mode=><button type="button" key={mode}
     className={draft.setup.hours_mode===mode?styles.choiceActive:styles.choice} onClick={()=>setHours(mode)}>{mode}</button>)}</div>
    {draft.setup.hours_mode&&<div className={styles.daySchedule}>{days.map(([key,day])=><div className={styles.dayRow} key={key}>
      <strong>{day}</strong><label className={styles.dayToggle}><input type="checkbox"
       checked={draft.setup["h_"+key+"_active"]==="Sí"} onChange={e=>{answer("h_"+key+"_active",e.target.checked?"Sí":"No");}}/> Abierto</label>
      {draft.setup["h_"+key+"_active"]==="Sí"&&<div className={styles.dayTimes}>
       <select aria-label={"Apertura "+day} value={draft.setup["h_"+key+"_open"]||"09:00"} onChange={e=>answer("h_"+key+"_open",e.target.value)}>{times.slice(0,48).map(x=><option key={x}>{x}</option>)}</select>
       <span>a</span>
       <select aria-label={"Cierre "+day} value={draft.setup["h_"+key+"_close"]||"17:00"} onChange={e=>answer("h_"+key+"_close",e.target.value)}>{times.slice(1).map(x=><option key={x}>{x}</option>)}</select>
      </div>}</div>)}</div>}
    </div>:question.kind==="state"?<select id={"w-"+question.id} className={styles.input} aria-label={question.title} value={draft.setup.state||""} onChange={e=>answer("state",e.target.value)}>
     <option value="">Selecciona el estado...</option>{US_STATES.map(x=><option key={x} value={x}>{x}</option>)}</select>:
    question.kind==="choice"?<div className={styles.choices}>{(question.options||[]).map(opt=><button key={opt} type="button"
    className={inputValue(draft.setup,question.id)===opt?styles.choiceActive:styles.choice}
    aria-pressed={inputValue(draft.setup,question.id)===opt}
    onClick={()=>answer(question.id,opt)}>{inputValue(draft.setup,question.id)===opt?<CheckCircle2 size={15}/>:null}{opt}</button>)}</div>:
    question.kind==="textarea"?<textarea id={"w-"+question.id} rows={3} maxLength={500} className={styles.input}
     placeholder="Escribe una respuesta breve..." value={inputValue(draft.setup,question.id)} onChange={e=>answer(question.id,e.target.value)}/>:
    <input id={"w-"+question.id} type="text" maxLength={200} className={styles.input}
     placeholder={question.hint||"Escribe aquí..."} value={inputValue(draft.setup,question.id)} onChange={e=>answer(question.id,e.target.value)}/>}
   </div>)}
   {false?<div className={styles.connections}>
    <div className={styles.connection}><CalendarDays size={21}/><span><strong>VMV Scheduling</strong><small>Conector no disponible todavía</small></span><b>NO CONECTADO</b></div>
    <div className={styles.connection}><PlugZap size={21}/><span><strong>VMV Inventory</strong><small>Conector no disponible todavía</small></span><b>NO CONECTADO</b></div>
    {(yesCalendar||yesInventory)?<p className={styles.connectionNote}>Guardaremos esta necesidad en el diseño. No podemos verificar citas ni existencias hasta que estas integraciones estén operativas y autorizadas.</p>:null}
   </div>:null}
  </div>:null}
  {step===steps.length-1?<div className={styles.review}>
    <div className={styles.reviewCard}><strong>{draft.name||"Sin nombre"}</strong><span>{draft.purpose||"Sin propósito"}</span></div>
    <div className={styles.reviewLine}><span>Negocio</span><b>{draft.setup.business_name||"—"}</b></div>
    <div className={styles.reviewLine}><span>Ubicación</span><b>{[draft.setup.city,draft.setup.country==="Otro país"?draft.setup.region_other:draft.setup.state,draft.setup.country].filter(Boolean).join(", ")||"—"}</b></div>
    <div className={styles.reviewLine}><span>Horario</span><b>{draft.setup.hours_mode||"Sin definir"}</b></div>
    {draft.kind==="bookings"&&<div className={styles.reviewLine}><span>Reserva anticipada</span><b>{draft.setup.booking_lead||"—"}</b></div>}
    <div className={styles.reviewLine}><span>Especialidad</span><b>{({calls:"Llamadas",support:"Clientes",sales:"Ventas",bookings:"Reservas",inventory:"Inventario",operations:"Administración",custom:"Personalizado"} as Record<AgentKind,string>)[draft.kind]}</b></div>
    <div className={styles.reviewLine}><span>Idioma</span><b>{draft.setup.language_rule||"Español"}</b></div>
    <div className={styles.reviewLine}><span>Agenda VMV</span><b>{yesCalendar?"Solicitada · pendiente":"No solicitada"}</b></div>
    <div className={styles.reviewLine}><span>Inventario VMV</span><b>{yesInventory?"Solicitado · pendiente":"No solicitado"}</b></div>
    <div className={styles.reviewLine}><span>Supervisión</span><b>{draft.setup.human_review||"Humana"}</b></div>
    <div className={styles.reviewMessage}><ShieldCheck size={20}/><p>Tu agente comenzará como <strong>borrador</strong>. No responderá llamadas ni modificará reservas, inventario o pedidos.</p></div>
    {isPreview?<p className={styles.previewNote}>Esta es una vista previa; inicia sesión para guardar tu agente.</p>:<p className={styles.previewNote}>Tu agente se guardará en tu cuenta VMV. Podrás editarlo desde la web o el iPhone.</p>}
  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <div className={styles.actions}><button type="button" className={styles.prev} onClick={back}><ArrowLeft size={17}/>{step===0?"Cancelar":"Atrás"}</button>
   <button type="button" disabled={saving} className={styles.next} onClick={()=>void next()}>{saving?"Guardando…":step===steps.length-1?"Guardar agente":"Continuar"}
   {step===steps.length-1?<Check size={17}/>:<ArrowRight size={17}/>}</button></div>
 </section>;
}
