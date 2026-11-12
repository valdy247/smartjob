"use client";
import {useState} from "react";
import {
 ArrowLeft,ArrowUpRight,Bot,BookOpen,BriefcaseBusiness,CalendarDays,Check,
 ChevronRight,ClipboardList,Headphones,MessageCircle,Package,PauseCircle,
 PhoneCall,PlayCircle,ShieldCheck,ShoppingBag,Sparkles,WandSparkles
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import styles from "./page.module.css";

type Kind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
type Status="draft"|"active"|"paused";
type Screen="home"|"editor"|"test";
type AgentDraft={name:string;kind:Kind;purpose:string;personality:string;language:string;instructions:string;knowledge:string};
type Agent=AgentDraft&{id:string;status:Status};
const types:{id:Kind;title:string;sub:string;Icon:LucideIcon;bg:string;fg:string;purpose:string}[]=[
 {id:"calls",title:"Llamadas",sub:"Atención telefónica",Icon:PhoneCall,bg:"#ede2ff",fg:"#7143c7",purpose:"Orientar a quien llama y derivar a una persona cuando sea necesario."},
 {id:"support",title:"Clientes",sub:"Atención y consultas",Icon:Headphones,bg:"#c8f3e4",fg:"#17624f",purpose:"Responder preguntas habituales sobre productos, servicios y horarios."},
 {id:"sales",title:"Ventas",sub:"Productos y servicios",Icon:ShoppingBag,bg:"#ffdf84",fg:"#775018",purpose:"Informar sobre productos confirmados e identificar oportunidades de venta."},
 {id:"bookings",title:"Reservas",sub:"Citas y disponibilidad",Icon:CalendarDays,bg:"#bfe4ff",fg:"#2c6086",purpose:"Informar sobre horarios y ayudar a los clientes a solicitar citas."},
 {id:"inventory",title:"Inventario",sub:"Productos y existencias",Icon:Package,bg:"#ffd4e6",fg:"#9b4776",purpose:"Explicar productos y existencias autorizadas de la empresa."},
 {id:"operations",title:"Administración",sub:"Solicitudes y procesos",Icon:BriefcaseBusiness,bg:"#d7ecff",fg:"#416995",purpose:"Orientar y organizar solicitudes administrativas de forma segura."},
 {id:"custom",title:"A mi medida",sub:"Tu propio objetivo",Icon:WandSparkles,bg:"#e7dfff",fg:"#6b45bb",purpose:"Ayudar con el propósito personalizado del negocio."}
];
function blank(kind:Kind):AgentDraft{
 const item=types.find(t=>t.id===kind)||types[6];
 return {kind,name:kind==="custom"?"Mi agente":"Agente de "+item.title,
  purpose:item.purpose,personality:"Amable y profesional",language:"Español",
  instructions:"",knowledge:""};
}
export default function AIAgentsPreview(){
 const [screen,setScreen]=useState<Screen>("home");
 const [draft,setDraft]=useState<AgentDraft>(()=>blank("support"));
 const [agents,setAgents]=useState<Agent[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [message,setMessage]=useState("");
 const [messageNotice,setMessageNotice]=useState("");
 const [notice,setNotice]=useState("");
 const active=agents.find(a=>a.id===selected)||null;
 const typeInfo=(kind:Kind)=>types.find(t=>t.id===kind)||types[6];
 const start=(kind:Kind)=>{setDraft(blank(kind));setSelected(null);setScreen("editor");setNotice("");};
 const edit=(agent:Agent)=>{setSelected(agent.id);setDraft({
  name:agent.name,kind:agent.kind,purpose:agent.purpose,personality:agent.personality,
  language:agent.language,instructions:agent.instructions,knowledge:agent.knowledge
 });setScreen("editor");};
 const save=()=>{
  if(!draft.name.trim()){setNotice("Escribe el nombre del agente.");return;}
  const cleaned={...draft,name:draft.name.trim().slice(0,80)};
  if(selected){
   setAgents(old=>old.map(a=>a.id===selected?{...a,...cleaned}:a));
  }else{
   setAgents(old=>[{...cleaned,id:String(Date.now()),status:"draft"},...old]);
  }
  setNotice("Diseño guardado solo en esta vista temporal. Aún no se almacena en tu cuenta.");
  setScreen("home");
 };
 const test=(agent:Agent)=>{setSelected(agent.id);setScreen("test");setMessage("");setMessageNotice("");};
 const back=()=>{setScreen("home");setMessageNotice("");};
 const patch=(key:keyof AgentDraft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 return <main className={styles.canvas}>
  <div className={styles.layout}>
   <div className={styles.externalHeader}>
    <a href="/vista-app" className={styles.returnLink}><ArrowLeft size={17}/> VMV Business</a>
    <span className={styles.previewBadge}>PREVIEW · AI AGENTS</span>
   </div>
   <section className={styles.phone} aria-label="Vista previa de AI Agents para iPhone">
    <div className={styles.phoneTop}>
     <b>VMV</b><span className={styles.dynamicIsland}/><span className={styles.phoneSignal}>◢ ▰</span>
    </div>
    <div className={styles.appHeader}>
     <button type="button" className={styles.backIcon} onClick={screen==="home"?()=>{window.location.href="/vista-app";}:back}
      aria-label={screen==="home"?"Volver a VMV":"Volver a AI Agents"}><ArrowLeft size={20}/></button>
     <div className={styles.appTitle}><small>VMV BUSINESS</small><strong>AI Agents<span>.</span></strong></div>
     <span className={styles.sparkleBadge}><Sparkles size={21}/></span>
    </div>
    <div className={styles.scroller}>
     {screen==="home"?<>
      <div className={styles.hero}>
       <div className={styles.heroEyebrow}><span>TU EQUIPO INTELIGENTE</span><Sparkles size={22}/></div>
       <h1>Crea agentes.<br/>Haz más con VMV.</h1>
       <p>Configúralos, enséñales tu negocio y pruébalos desde aquí.</p>
       <div className={styles.heroPills}><span>{agents.length} agentes</span><span>{agents.filter(a=>a.status==="active").length} activos en estudio</span></div>
      </div>
      {notice?<div className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
      <div className={styles.sectionHeading}><div><h2>¿Qué quieres automatizar?</h2><p>Selecciona una función para tu agente.</p></div></div>
      <div className={styles.tiles}>
       {types.map(type=><button type="button" key={type.id} className={styles.tile}
          style={{background:type.bg,color:type.fg}} onClick={()=>start(type.id)}>
          <span className={styles.tileIcon}><type.Icon size={24}/></span>
          <ArrowUpRight className={styles.tileArrow} size={20}/>
          <strong>{type.title}</strong><small>{type.sub}</small>
       </button>)}
      </div>
      <div className={styles.sectionHeading}><h2>Mis agentes</h2><span className={styles.agentCounter}>{agents.length}</span></div>
      {agents.length===0?<div className={styles.empty}>
       <Bot size={30}/><strong>Aquí vivirán tus agentes</strong>
       <p>Elige una tarjeta para crear el primero.</p>
      </div>:<div className={styles.agents}>
       {agents.map(a=>{const t=typeInfo(a.kind);return <article className={styles.agent} key={a.id}>
        <div className={styles.agentTop}><span style={{background:t.bg,color:t.fg}} className={styles.agentIcon}><t.Icon size={21}/></span>
         <span className={styles.agentMeta}><strong>{a.name}</strong><small>{t.title} · {a.language}</small></span>
         <span className={styles.agentState}>{a.status==="draft"?"Borrador":a.status==="active"?"Activo":"Pausado"}</span>
        </div>
        <p>{a.purpose}</p>
        <div className={styles.agentButtons}>
         <button type="button" className={styles.buttonPrimary} onClick={()=>test(a)}><MessageCircle size={15}/> Probar</button>
         <button type="button" className={styles.buttonSecondary} onClick={()=>edit(a)}><ClipboardList size={15}/> Editar</button>
         <button type="button" className={styles.buttonSecondary} onClick={()=>setAgents(old=>old.map(x=>x.id===a.id?{...x,status:x.status==="active"?"paused":"active"}:x))}>
          {a.status==="active"?<PauseCircle size={15}/>:<PlayCircle size={15}/>} {a.status==="active"?"Pausar":"Activar"}
         </button>
        </div>
       </article>})}
      </div>}
      <div className={styles.disclaimer}><ShieldCheck size={16}/> Vista de diseño: los cambios no se guardan en Supabase ni ejecutan acciones reales.</div>
     </>:null}
     {screen==="editor"?<>
      <div className={styles.miniHeader}><div className={styles.miniIcon}><Bot size={24}/></div><h1>{selected?"Editar agente":"Nuevo agente"}</h1>
       <p>Tu negocio, tus instrucciones y tu estilo.</p></div>
      <div className={styles.formSection}><h2>01 · Identidad</h2>
       <label className={styles.field}>Nombre del agente<input value={draft.name} maxLength={80} onChange={e=>patch("name",e.target.value)} placeholder="Ej. Asistente VMV"/></label>
       <label className={styles.field}>¿Qué hará?<textarea value={draft.purpose} maxLength={240} onChange={e=>patch("purpose",e.target.value)} rows={3}/></label>
       <label className={styles.field}>Especialidad</label>
       <div className={styles.chips}>{types.map(t=><button type="button" key={t.id} onClick={()=>patch("kind",t.id)}
        className={draft.kind===t.id?styles.chipSelected:styles.chip}>{t.title}</button>)}</div>
      </div>
      <div className={styles.formSection}><h2>02 · Personalidad e idioma</h2>
       <div className={styles.chips}>{["Amable y profesional","Cercano","Formal","Directo"].map(v=><button type="button"
        key={v} onClick={()=>patch("personality",v)} className={draft.personality===v?styles.chipSelected:styles.chip}>{v}</button>)}</div>
       <div className={styles.chips}>{["Español","English","Bilingüe"].map(v=><button type="button"
        key={v} onClick={()=>patch("language",v)} className={draft.language===v?styles.chipSelected:styles.chip}>{v}</button>)}</div>
      </div>
      <div className={styles.formSection}><h2>03 · Conocimiento</h2>
       <p className={styles.muted}>Información que tienes permiso de compartir.</p>
       <label className={styles.field}>Datos de la empresa<textarea value={draft.knowledge} rows={5} maxLength={8000}
        onChange={e=>patch("knowledge",e.target.value)} placeholder="Horarios, servicios, precios confirmados, políticas..."/></label>
       <label className={styles.field}>Instrucciones<textarea value={draft.instructions} rows={4} maxLength={2500}
        onChange={e=>patch("instructions",e.target.value)} placeholder="Cómo debe responder y cuándo derivar a una persona..."/></label>
      </div>
      <div className={styles.info}><ShieldCheck size={18}/> El agente aún no puede realizar llamadas, compras ni reservas.</div>
      <button type="button" className={styles.saveButton} onClick={save}><Check size={19}/> Guardar diseño</button>
      <p className={styles.smallNote}>Vista temporal: no introduzcas información confidencial. Para guardar agentes reales falta habilitar la base de datos.</p>
     </>:null}
     {screen==="test"&&active?<div className={styles.testing}>
      <div className={styles.testAgent}><div className={styles.testAvatar}><Bot size={24}/></div><strong>{active.name}</strong>
       <small>Simulación privada · Vista de diseño</small></div>
      <div className={styles.sampleConversation}><span>CONVERSACIÓN ILUSTRATIVA</span>
       <div className={styles.sampleUser}>Hola, ¿en qué horario atienden?</div>
       <div className={styles.sampleBot}>Puedo responder con la información autorizada del negocio. Si aún no se ha proporcionado el horario, debo pedir confirmación.</div>
      </div>
      <label className={styles.field}>Mensaje de prueba<textarea value={message} rows={3}
       maxLength={1000} onChange={e=>{setMessage(e.target.value);setMessageNotice("");}} placeholder="Escribe como si fueras un cliente..."/></label>
      <button type="button" className={styles.saveButton} disabled={!message.trim()}
       onClick={()=>setMessageNotice("Este sitio solo presenta la interfaz. Las respuestas reales necesitan activar el simulador y la base de datos.")}>
       <MessageCircle size={18}/> Probar conversación</button>
      {messageNotice?<p className={styles.info}>{messageNotice}</p>:null}
      <button type="button" onClick={()=>edit(active)} className={styles.buttonSecondary}><BookOpen size={16}/> Ajustar conocimiento <ChevronRight size={16}/></button>
      <p className={styles.smallNote}>No se ha realizado ninguna llamada, venta ni reserva. Ningún mensaje se envió a un modelo.</p>
     </div>:null}
    </div>
    <div className={styles.phoneFooter}><div className={styles.footerBrand}><Bot size={17}/> AI Agents</div>
     <span>VMV Business <Sparkles size={12}/></span></div>
   </section>
   <div className={styles.externalFooter}>
    <span><ShieldCheck size={16}/> Módulo aislado · No modifica Smart Call</span>
    <a href="/vista-app">Volver a VMV <ArrowUpRight size={15}/></a>
   </div>
  </div>
 </main>;
}
