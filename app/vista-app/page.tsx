"use client";
import {useState} from "react";
import {House,LayoutGrid,PhoneCall,Languages,UserRound,ArrowUpRight,ChevronLeft,
 Settings2,Bell,Clock3,ShieldCheck,Mic,Package,CalendarDays,Users,BarChart3,Workflow,Globe,Bot,RefreshCw} from "lucide-react";
import styles from "./vista-app.module.css";

type Tab="home"|"services"|"calls"|"translator"|"account";
type Panel="overview"|"settings"|"activity";
const modules=[
 {id:"ai",name:"AI Agents",sub:"Agentes inteligentes",Icon:Bot},
 {id:"inventory",name:"Inventory",sub:"Productos y existencias",Icon:Package},
 {id:"schedule",name:"Scheduling",sub:"Calendario de citas",Icon:CalendarDays},
 {id:"crm",name:"CRM & Leads",sub:"Clientes y seguimientos",Icon:Users},
 {id:"web",name:"Web Services",sub:"Tu presencia digital",Icon:Globe},
 {id:"business",name:"Business Management",sub:"Operaciones del negocio",Icon:Settings2},
 {id:"marketing",name:"Marketing & Analytics",sub:"Resultados y campañas",Icon:BarChart3},
 {id:"automations",name:"Automations",sub:"Flujos de trabajo",Icon:Workflow}
];
const nav:[Tab,string,typeof House][]=[
 ["home","Inicio",House],["services","Servicios",LayoutGrid],["calls","Llamadas",PhoneCall],
 ["translator","Traductor",Languages],["account","Cuenta",UserRound]
];
function Setting({label,value,detail}:{label:string;value:string;detail?:string}){
 return <div className={styles.setting}><div><strong>{label}</strong>{detail?<small>{detail}</small>:null}</div><span>{value}</span></div>;
}
export default function VMVMobilePreview(){
 const [tab,setTab]=useState<Tab>("services");
 const [open,setOpen]=useState(true);
 const [panel,setPanel]=useState<Panel>("overview");
 const [language,setLanguage]=useState("Español");
 const [customer,setCustomer]=useState("English");
 const [assistant,setAssistant]=useState("Asistente VMV");
 const [note,setNote]=useState("");
 const go=(next:Tab)=>{setTab(next);if(next!=="services")setOpen(false);setNote("");};
 const showSmartCall=()=>{setTab("services");setOpen(true);setPanel("overview");setNote("");};
 return <main className={styles.stage}>
  <header className={styles.pageHeader}>
   <a href="/" className={styles.wordmark}>VMV<span> BUSINESS</span></a>
   <span className={styles.previewTag}>VISTA PREVIA DE DISEÑO · SIN DATOS REALES</span>
   <a className={styles.webLink} href="https://vmv-business-design-git-feat-vm-073e13-valdys-projects-b97fc7a6.vercel.app/es/workspace/smart-call/" target="_blank" rel="noopener noreferrer">Panel web <ArrowUpRight size={15}/></a>
  </header>
  <div className={styles.layout}>
   <aside className={styles.intro}>
    <span className={styles.kicker}>NUEVA EXPERIENCIA VMV</span>
    <h1>Tu negocio.<br/><em>En tu bolsillo.</em></h1>
    <p>Una sola app para trabajar con tus servicios de VMV. Smart Call se convierte en un módulo nativo con su propio centro de control, sin perder las llamadas ni el traductor.</p>
    <div className={styles.feature}><span>01</span><div><strong>Cinco secciones principales</strong><small>Inicio, Servicios, Llamadas, Traductor y Cuenta.</small></div></div>
    <div className={styles.feature}><span>02</span><div><strong>Smart Call dentro de la app</strong><small>Resumen, ajustes, actividad y acciones rápidas.</small></div></div>
    <div className={styles.feature}><span>03</span><div><strong>Datos compartidos con la web</strong><small>Los controles reales requieren iniciar sesión en la app nativa.</small></div></div>
    <div className={styles.disclaimer}><ShieldCheck size={17}/><span>Esta es una demostración navegable del diseño. Sus controles no guardan ajustes, no llaman ni graban voz.</span></div>
   </aside>
   <div className={styles.phoneFrame} aria-label="Prototipo interactivo de la aplicación VMV Business">
    <div className={styles.device}>
     <div className={styles.statusBar}><span>9:41</span><div className={styles.dynamicIsland}/><span>◢ ▰</span></div>
     <div className={styles.appTop}><div className={styles.appLogo}><span className={styles.mark}>▥</span><b>VMV<span> BUSINESS</span></b></div><button aria-label="Abrir cuenta" onClick={()=>go("account")}><UserRound size={18}/></button></div>
     <div className={styles.scrollArea} key={tab+(open?"smart":"list")}>
      {tab==="home"?<div className={styles.screen}>
       <span className={styles.screenEyebrow}>TU ESPACIO</span><h2>Hola, bienvenido<span className={styles.mint}>.</span></h2><p className={styles.screenLead}>Todas tus herramientas. Un solo lugar.</p>
       <button className={styles.homeHero} onClick={showSmartCall}><span className={styles.tileEyebrow}>COMUNICACIÓN / PILOTO</span><strong>Smart Call</strong><small>Línea, idiomas, voces y saludos.</small><span className={styles.tileArrow}><ArrowUpRight size={22}/></span></button>
       <div className={styles.homeGrid}><button onClick={()=>go("calls")}><PhoneCall size={24}/><strong>Llamadas</strong><small>Recepción y actividad</small></button><button onClick={()=>go("translator")}><Languages size={24}/><strong>Traductor</strong><small>Conversación en vivo</small></button></div>
       <span className={styles.groupTitle}>ACCIONES RECOMENDADAS</span><button className={styles.listEntry} onClick={showSmartCall}><Settings2 size={19}/><div><strong>Configurar Smart Call</strong><small>Preferencias importantes</small></div><span>›</span></button>
      </div>:null}
      {tab==="services"&&!open?<div className={styles.screen}>
       <span className={styles.screenEyebrow}>VMV BUSINESS</span><h2>Mis servicios<span className={styles.mint}>.</span></h2><p className={styles.screenLead}>Tus herramientas desde el teléfono.</p>
       <button className={styles.serviceHero} onClick={showSmartCall}><div className={styles.serviceHeroIcon}><PhoneCall size={24}/></div><span className={styles.tileEyebrow}>SERVICIO EN PILOTO</span><strong>Smart Call</strong><small>Configuración y actividad real desde la app</small><span className={styles.serviceLink}>Abrir servicio →</span></button>
       <span className={styles.groupTitle}>EN DESARROLLO</span>{modules.map(({id,name,sub,Icon})=><div key={id} className={styles.moduleRow}><div className={styles.moduleIcon}><Icon size={17}/></div><div><strong>{name}</strong><small>{sub}</small></div><span className={styles.pending}>Próximamente</span></div>)}
      </div>:null}
      {tab==="services"&&open?<div className={styles.smartScreen}>
       <button className={styles.back} onClick={()=>{setOpen(false);setNote("");}}><ChevronLeft size={17}/> Todos los servicios</button>
       <div className={styles.smartHero}><span>VMV BUSINESS / COMUNICACIÓN</span><h2>Smart Call<span>.</span></h2><p>Tu línea, tus idiomas y la actividad del negocio, en un solo lugar.</p><div className={styles.smartBadge}><span/> Estado de ejemplo · PILOTO</div></div>
       <div className={styles.switcher}>{(["overview","settings","activity"] as Panel[]).map((p,i)=><button key={p} className={panel===p?styles.selected:""} onClick={()=>{setPanel(p);setNote("");}}>{["Resumen","Ajustes","Actividad"][i]}</button>)}</div>
       {panel==="overview"?<><div className={styles.smartCard}><span className={styles.smallKicker}>TU LÍNEA DE NEGOCIO</span><h3>Sin número real</h3><p>Los datos de la línea aparecerán al iniciar sesión en la aplicación.</p><div className={styles.rule}/><Setting label="Idioma del cliente" value={customer}/><Setting label="Tu idioma" value={language}/><Setting label="Asistente" value={assistant}/><Setting label="Plan" value="Ejemplo"/><button className={styles.mainAction} onClick={()=>go("calls")}>Ir a llamadas →</button></div><div className={styles.miniCards}><div><strong>—</strong><small>Llamadas recientes</small></div><div><strong>—</strong><small>Minutos disponibles</small></div></div></>:null}
       {panel==="settings"?<><div className={styles.smartCard}><span className={styles.smallKicker}>CONFIGURACIÓN ESENCIAL</span><h3>Idiomas y asistente</h3><label htmlFor="preview-owner">Tu idioma</label><select id="preview-owner" value={language} onChange={e=>setLanguage(e.target.value)}><option>Español</option><option>English</option></select><label htmlFor="preview-customer">Idioma del cliente</label><select id="preview-customer" value={customer} onChange={e=>setCustomer(e.target.value)}><option>English</option><option>Español</option></select><label htmlFor="preview-assistant">Nombre del asistente</label><input id="preview-assistant" value={assistant} maxLength={40} onChange={e=>setAssistant(e.target.value)}/><p>Este prototipo cambia valores solo en pantalla. Los ajustes reales usan tu cuenta protegida.</p><button className={styles.mainAction} onClick={()=>setNote("Vista de diseño: no se ha guardado ningún cambio.")}>Ver cómo se guarda →</button>{note?<div role="status" className={styles.demoNote}>{note}</div>:null}</div><div className={styles.smartCard}><span className={styles.smallKicker}>PERSONALIZACIÓN PREMIUM</span><h3>Voces y saludos</h3><p>En la app real, las opciones se habilitan únicamente con Pro o Premium activo.</p><div className={styles.voicePills}><span>Estándar</span><span>Clara</span><span>Serena</span></div></div></>:null}
       {panel==="activity"?<div className={styles.smartCard}><span className={styles.smallKicker}>REGISTRO DE LLAMADAS</span><h3>Actividad reciente</h3><div className={styles.emptyHistory}><Clock3 size={28}/><strong>Tu historial, siempre a mano</strong><p>Las llamadas reales aparecerán aquí cuando inicies sesión en el iPhone.</p></div><button className={styles.mainAction} onClick={()=>setNote("Solo demostración visual. No se consultaron datos reales.")}><RefreshCw size={15}/> Actualizar</button>{note?<div className={styles.demoNote}>{note}</div>:null}</div>:null}
      </div>:null}
      {tab==="calls"?<div className={styles.screen}><span className={styles.screenEyebrow}>TELÉFONO</span><h2>Llamadas<span className={styles.mint}>.</span></h2><p className={styles.screenLead}>La recepción nativa y la pantalla de llamada permanecen como funciones principales.</p><div className={styles.smartCard}><div className={styles.bigCircle}><PhoneCall size={35}/></div><h3>Llamadas en tu iPhone</h3><p>El piloto real usa Twilio Voice y la interfaz CallKit. Esta vista web no recibe llamadas.</p><button className={styles.mainAction} onClick={showSmartCall}>Configurar Smart Call →</button></div></div>:null}
      {tab==="translator"?<div className={styles.screen}><span className={styles.screenEyebrow}>TRADUCCIÓN EN VIVO</span><h2>Traductor<span className={styles.mint}>.</span></h2><p className={styles.screenLead}>Interpretación en persona, siempre a un toque.</p><div className={styles.smartCard}><div className={styles.bigCircle}><Mic size={35}/></div><h3>Habla sin fronteras.</h3><p>La app iOS conserva el panel de interpretación existente. El micrófono no está activo en esta demostración.</p></div></div>:null}
      {tab==="account"?<div className={styles.screen}><span className={styles.screenEyebrow}>MI PERFIL</span><h2>Cuenta<span className={styles.mint}>.</span></h2><p className={styles.screenLead}>Preferencias del negocio, suscripción y seguridad.</p><div className={styles.smartCard}><div className={styles.bigCircle}><UserRound size={32}/></div><h3>Una identidad VMV</h3><p>La app nativa y el panel web comparten el proveedor de autenticación, pero mantienen sesiones independientes.</p><button className={styles.mainAction} onClick={showSmartCall}>Mis servicios →</button></div></div>:null}
     </div>
     <nav className={styles.bottomNav} aria-label="Navegación de la aplicación de muestra">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?styles.activeNav:""} onClick={()=>go(id)} aria-pressed={tab===id}><span><Icon size={22}/></span><small>{label}</small></button>)}</nav>
    </div>
   </div>
  </div>
 </main>;
}
