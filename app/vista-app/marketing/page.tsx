"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,BarChart3,CheckCircle2,ClipboardCopy,HeartHandshake,Lightbulb,Megaphone,ShieldCheck,Sparkles,Target,TrendingUp} from "lucide-react";
import styles from "./page.module.css";

type Section="strategy"|"campaign"|"numbers"|"retention";
type Channel="social"|"search"|"local"|"referrals"|"email";
type FormState={
 business:string;industry:string;audience:string;offer:string;cta:string;website:string;
 channel:Channel;budget:string;ticket:string;margin:string;leads:string;sales:string;revenue:string;
};
const initial:FormState={
 business:"",industry:"",audience:"",offer:"",cta:"",website:"",
 channel:"social",budget:"",ticket:"",margin:"",leads:"",sales:"",revenue:""
};
const tabs:{id:Section;label:string;description:string;Icon:typeof Target}[]=[
 {id:"strategy",label:"Diagnóstico",description:"Encuentra oportunidades",Icon:Target},
 {id:"campaign",label:"Campañas",description:"Crea un plan concreto",Icon:Megaphone},
 {id:"numbers",label:"Rentabilidad",description:"Mide lo que funciona",Icon:BarChart3},
 {id:"retention",label:"Clientes",description:"Haz que regresen",Icon:HeartHandshake}
];
const channels:{id:Channel;label:string;desc:string}[]=[
 {id:"social",label:"Instagram / Facebook",desc:"Mostrar tu oferta"},
 {id:"search",label:"Búsqueda en Google",desc:"Capturar intención"},
 {id:"local",label:"Presencia local",desc:"Que te encuentren cerca"},
 {id:"referrals",label:"Referidos",desc:"Activar recomendaciones"},
 {id:"email",label:"Correo autorizado",desc:"Reactivar relaciones"}
];
const number=(raw:string)=>{const n=Number(raw);return raw.trim()!==""&&Number.isFinite(n)&&n>=0?n:null;};
const money=(n:number|null)=>n===null?"—":n.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const percent=(n:number|null)=>n===null?"—":n.toLocaleString("es-US",{maximumFractionDigits:1})+"%";
const safe=(v:string,fallback:string)=>v.trim()||fallback;
function Field({label,value,onChange,placeholder,type="text",hint,min,max}:{
 label:string;value:string;onChange:(v:string)=>void;placeholder?:string;
 type?:string;hint?:string;min?:number;max?:number;
}){
 return <label className={styles.field}><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)}
  placeholder={placeholder} type={type} min={min} max={max} step={type==="number"?"any":undefined} maxLength={type==="text"?250:undefined}/>
  {hint?<small>{hint}</small>:null}</label>;
}
export default function MarketingPage(){
 const [section,setSection]=useState<Section>("strategy");
 const [form,setForm]=useState<FormState>(initial);
 const [notice,setNotice]=useState("");
 const patch=(key:keyof FormState,value:string)=>{setForm(prev=>({...prev,[key]:value}));setNotice("");};
 const spend=number(form.budget),ticket=number(form.ticket),margin=number(form.margin),
  leads=number(form.leads),sales=number(form.sales),enteredRevenue=number(form.revenue);
 const validMargin=margin!==null&&margin<=100?margin:null;
 const revenue=enteredRevenue!==null?enteredRevenue:sales!==null&&ticket!==null?sales*ticket:null;
 const estimatedRevenue=enteredRevenue===null&&revenue!==null;
 const metrics={
  cpl:spend!==null&&leads!==null&&leads>0?spend/leads:null,
  cac:spend!==null&&sales!==null&&sales>0?spend/sales:null,
  conversion:leads!==null&&leads>0&&sales!==null?sales/leads*100:null,
  roas:spend!==null&&spend>0&&revenue!==null?revenue/spend:null,
  contribution:spend!==null&&revenue!==null&&validMargin!==null?
   revenue*(validMargin/100)-spend:null,
  breakEven:ticket!==null&&validMargin!==null?ticket*validMargin/100:null
 };
 const business=safe(form.business,"tu negocio");
 const offer=safe(form.offer,"tu producto o servicio");
 const audience=safe(form.audience,"las personas que más necesitan tu solución");
 const cta=safe(form.cta,"Escríbenos para conocer más");
 const campaign=useMemo(()=>{
  const channel=channels.find(c=>c.id===form.channel)?.label||"Canal";
  const rows:Record<Channel,{angle:string;execution:string;draft:string;measure:string}>={
   social:{
    angle:"Demostrar valor antes de pedir la venta",
    execution:"Publica una demostración real, resuelve una duda frecuente y termina con una invitación clara. Prueba dos creatividades y mide consultas.",
    draft:"¿Buscas "+offer+"? En "+business+" ayudamos a "+audience+". Descubre cómo podemos ayudarte. "+cta+".",
    measure:"Consultas calificadas → clientes → ventas"
   },
   search:{
    angle:"Aparecer cuando el cliente ya busca una solución",
    execution:"Crea una página específica para la oferta, investiga palabras clave y prueba búsquedas relevantes. Excluye consultas que no convierten.",
    draft:business+" | "+offer+". Para "+audience+". "+cta+".",
    measure:"Clics → contactos → clientes → coste de adquisición"
   },
   local:{
    angle:"Aumentar descubrimiento y confianza local",
    execution:"Completa el perfil empresarial, horarios y servicios, publica fotos reales y solicita reseñas auténticas sin incentivos.",
    draft:business+": "+offer+". Consulta horarios, detalles y cómo contactarnos. "+cta+".",
    measure:"Vistas locales → llamadas / mensajes → clientes"
   },
   referrals:{
    angle:"Convertir clientes satisfechos en recomendaciones",
    execution:"Diseña una invitación simple después de una buena experiencia, identifica referidos con una pregunta de origen y mide ventas atribuibles.",
    draft:"¡Gracias por elegir "+business+"! Si conoces a alguien que pueda necesitar "+offer+", nos encantará ayudarle. "+cta+".",
    measure:"Recomendaciones recibidas → clientes nuevos"
   },
   email:{
    angle:"Volver a contactar clientes que aceptaron recibir mensajes",
    execution:"Segmenta clientes con consentimiento, personaliza el contenido, incluye baja sencilla y evita enviar a listas compradas.",
    draft:"Hola, desde "+business+" queremos compartir una novedad: "+offer+". Si te interesa, "+cta+". Puedes dejar de recibir estos mensajes cuando quieras.",
    measure:"Respuestas / clics → compras (no solo aperturas)"
   }
  };
  return {channel,...rows[form.channel]};
 },[form.channel,business,offer,audience,cta]);
 const review="Hola, gracias por elegir "+business+". Si tu experiencia fue buena o tienes sugerencias, nos ayudaría mucho recibir una reseña honesta. Tu opinión nos permite mejorar. ¡Gracias!";
 const followup="Hola, te saludamos de "+business+". Gracias por confiar en nosotros. ¿Hay algo en lo que podamos ayudarte de nuevo? "+cta+". Si prefieres no recibir estos mensajes, dínoslo y no volveremos a escribirte.";
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setNotice("Texto copiado.");}
  catch{setNotice("No se pudo copiar automáticamente; selecciona el texto para copiarlo.");}
 };
 const report=[
  "VMV MARKETING · PLAN DE TRABAJO",
  "Negocio: "+business,"Sector: "+safe(form.industry,"Por definir"),
  "Audiencia: "+audience,"Oferta: "+offer,"Objetivo / CTA: "+cta,
  "Canal: "+campaign.channel,"Enfoque: "+campaign.angle,
  "Acción: "+campaign.execution,"Mensaje de partida: "+campaign.draft,
  "Indicador: "+campaign.measure,
  "Inversión introducida: "+money(spend),
  "Leads introducidos: "+(leads===null?"No indicados":String(leads)),
  "Clientes introducidos: "+(sales===null?"No indicados":String(sales)),
  "Ingresos: "+money(revenue)+(estimatedRevenue?" (estimados por ticket × ventas)":""),
  "CPL: "+money(metrics.cpl),"CAC: "+money(metrics.cac),
  "Contribución después de publicidad: "+money(metrics.contribution),
  "Nota: cálculo aproximado de margen bruto menos publicidad; no incluye gastos fijos, impuestos u otros costes."
 ].join("\n");
 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.header}>
    <Link href="/vista-app" className={styles.back}><ArrowLeft size={17}/> VMV Business</Link>
    <span className={styles.marker}><Sparkles size={14}/> MARKETING STUDIO · BETA</span>
   </header>
   <section className={styles.hero}>
    <div className={styles.heroIntro}>
     <span className={styles.eyebrow}><TrendingUp size={16}/> MÁS CLIENTES. MEJORES DECISIONES.</span>
     <h1>Marketing que se convierte en <em>crecimiento.</em></h1>
     <p>Deja de adivinar qué publicar. Define tu oferta, lanza acciones concretas y descubre si realmente están generando rentabilidad.</p>
     <div className={styles.heroPills}><span>Sin métricas inventadas</span><span>Orientado a resultados</span><span>Listo para pequeños negocios</span></div>
    </div>
    <div className={styles.heroShape}><div><Target size={38}/><strong>Tu siguiente cliente</strong><span>Comienza con una estrategia clara</span></div></div>
   </section>
   <div className={styles.noticeBand}><ShieldCheck size={18}/><p><strong>Herramientas de planificación.</strong> Puedes crear mensajes y calcular resultados con tus propios números. No se han conectado cuentas publicitarias, publicado campañas ni guardado datos en servidores.</p></div>
   <div className={styles.workspace}>
    <aside className={styles.sidebar}>
     <span className={styles.sidebarLabel}>CENTRO DE CRECIMIENTO</span>
     {tabs.map(tab=><button type="button" key={tab.id} onClick={()=>{setSection(tab.id);setNotice("");}}
      className={section===tab.id?styles.tabActive:styles.tab} aria-current={section===tab.id?"page":undefined}>
       <tab.Icon size={20}/><span><strong>{tab.label}</strong><small>{tab.description}</small></span><ArrowUpRight size={14}/></button>)}
     <div className={styles.sidebarNote}><Lightbulb size={19}/><strong>Regla del crecimiento</strong><p>Una campaña no es un éxito por sus vistas. Importan clientes, margen y recurrencia.</p></div>
    </aside>
    <div className={styles.content}>
     {section==="strategy"?<>
      <div className={styles.sectionTop}><span>PASO 01 · FUNDAMENTOS</span><h2>Entendamos tu negocio</h2><p>La mejor estrategia depende de quién compra, qué necesita y cuánto deja cada venta.</p></div>
      <div className={styles.formGrid}>
       <Field label="Nombre del negocio" value={form.business} onChange={v=>patch("business",v)} placeholder="Ej. Mi negocio"/>
       <Field label="Industria o servicio" value={form.industry} onChange={v=>patch("industry",v)} placeholder="Ej. Repostería, limpieza, construcción"/>
       <Field label="Cliente ideal" value={form.audience} onChange={v=>patch("audience",v)} placeholder="¿Quién suele comprar y por qué?"/>
       <Field label="Oferta principal" value={form.offer} onChange={v=>patch("offer",v)} placeholder="¿Qué vendes y qué problema resuelves?"/>
       <Field label="Ticket promedio ($)" type="number" min={0} value={form.ticket} onChange={v=>patch("ticket",v)} placeholder="Ej. 85"/>
       <Field label="Margen bruto estimado (%)" type="number" min={0} max={100} value={form.margin} onChange={v=>patch("margin",v)} placeholder="Ej. 45" hint="Ingreso menos costes directos, antes de publicidad"/>
      </div>
      {margin!==null&&validMargin===null?<p className={styles.warning}>El margen debe estar entre 0 y 100%.</p>:null}
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>Primera oportunidad</strong><p>{form.offer.trim()&&form.audience.trim()?
       "Tu siguiente campaña debe explicar por qué "+offer+" es valioso para "+audience+". Prueba una promesa específica, evidencia real y una llamada a la acción.": 
       "Empieza por una sola oferta y un tipo de cliente. Hablar a todo el mundo suele dificultar medir qué funciona."}</p></div></div>
      <button type="button" className={styles.primary} onClick={()=>setSection("campaign")}>Diseñar campaña <ArrowUpRight size={16}/></button>
     </>:null}
     {section==="campaign"?<>
      <div className={styles.sectionTop}><span>PASO 02 · ADQUISICIÓN</span><h2>Diseña una campaña con propósito</h2><p>Elige dónde quieres alcanzar clientes. El borrador se adapta al canal, pero debes revisarlo antes de publicarlo.</p></div>
      <div className={styles.channelGrid}>{channels.map(item=><button type="button" key={item.id} aria-pressed={form.channel===item.id}
       className={form.channel===item.id?styles.channelActive:styles.channel} onClick={()=>patch("channel",item.id)}>
        <strong>{item.label}</strong><small>{item.desc}</small></button>)}</div>
      <div className={styles.formGrid}>
       <Field label="Oferta a promocionar" value={form.offer} onChange={v=>patch("offer",v)} placeholder="Qué quieres vender"/>
       <Field label="Público objetivo" value={form.audience} onChange={v=>patch("audience",v)} placeholder="A quién va dirigido"/>
       <Field label="Llamada a la acción" value={form.cta} onChange={v=>patch("cta",v)} placeholder="Ej. Solicita una cotización"/>
       <Field label="Página de destino (opcional)" value={form.website} onChange={v=>patch("website",v)} placeholder="https://tusitio.com"/>
      </div>
      <article className={styles.plan}>
       <span className={styles.planTag}><CheckCircle2 size={15}/> PLAN DE CAMPAÑA · BORRADOR</span>
       <h3>{campaign.angle}</h3>
       <p>{campaign.execution}</p>
       <div className={styles.message}><span>MENSAJE INICIAL · REVÍSALO ANTES DE USARLO</span><p>{campaign.draft}</p></div>
       <div className={styles.measure}><BarChart3 size={18}/><span>Medir: <strong>{campaign.measure}</strong></span></div>
       <div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>void copy(campaign.draft)}><ClipboardCopy size={15}/> Copiar mensaje</button><button type="button" className={styles.primary} onClick={()=>void copy(report)}>Copiar plan completo <ArrowUpRight size={15}/></button></div>
      </article>
     </>:null}
     {section==="numbers"?<>
      <div className={styles.sectionTop}><span>PASO 03 · MEDICIÓN</span><h2>¿Tu marketing deja dinero?</h2><p>Introduce resultados reales de una campaña. Los cálculos se actualizan mientras escribes.</p></div>
      <div className={styles.formGrid}>
       <Field label="Gasto publicitario ($)" type="number" min={0} value={form.budget} onChange={v=>patch("budget",v)} placeholder="0"/>
       <Field label="Personas interesadas (leads)" type="number" min={0} value={form.leads} onChange={v=>patch("leads",v)} placeholder="0"/>
       <Field label="Clientes adquiridos" type="number" min={0} value={form.sales} onChange={v=>patch("sales",v)} placeholder="0"/>
       <Field label="Ingresos atribuibles ($)" type="number" min={0} value={form.revenue} onChange={v=>patch("revenue",v)} placeholder="Ingresos reales" hint="Si se deja en blanco: clientes × ticket (estimación)"/>
       <Field label="Ticket promedio ($)" type="number" min={0} value={form.ticket} onChange={v=>patch("ticket",v)} placeholder="0"/>
       <Field label="Margen bruto (%)" type="number" min={0} max={100} value={form.margin} onChange={v=>patch("margin",v)} placeholder="0"/>
      </div>
      {sales!==null&&leads!==null&&sales>leads?<p className={styles.warning}>Hay más clientes que leads registrados. Revisa las fuentes antes de interpretar la conversión.</p>:null}
      {margin!==null&&validMargin===null?<p className={styles.warning}>El margen debe estar entre 0 y 100%.</p>:null}
      <div className={styles.kpis}>
       <div><span>Coste por lead</span><strong>{money(metrics.cpl)}</strong><small>Publicidad ÷ interesados</small></div>
       <div><span>Coste por cliente</span><strong>{money(metrics.cac)}</strong><small>Publicidad ÷ clientes</small></div>
       <div><span>Conversión</span><strong>{percent(metrics.conversion)}</strong><small>Clientes ÷ interesados</small></div>
       <div><span>ROAS</span><strong>{metrics.roas===null?"—":metrics.roas.toFixed(2)+"×"}</strong><small>Ingresos ÷ publicidad</small></div>
      </div>
      <div className={styles.profit}>
       <div><span>Contribución tras publicidad</span><strong>{money(metrics.contribution)}</strong><small>{estimatedRevenue?"Con ingresos estimados por ticket × clientes. ":""}Margen bruto de ventas menos gasto publicitario.</small></div>
       <div><span>CAC máximo de equilibrio por primera compra</span><strong>{money(metrics.breakEven)}</strong><small>Ticket × margen bruto. No contempla costes fijos, impuestos, descuentos ni recompra.</small></div>
      </div>
      <p className={styles.fineprint}>No son datos conectados ni una proyección de ventas. La atribución y el margen introducidos deben verificarse; un ROAS alto no implica ganancias.</p>
     </>:null}
     {section==="retention"?<>
      <div className={styles.sectionTop}><span>PASO 04 · FIDELIZACIÓN</span><h2>El crecimiento también viene de quienes regresan</h2><p>Los clientes actuales pueden comprar otra vez, recomendarte y darte información útil para mejorar.</p></div>
      <div className={styles.retentionCards}>
       <article><span className={styles.iconCircle}><HeartHandshake size={22}/></span><h3>Solicitar reseñas honestas</h3><p>Pide opiniones a tus clientes de forma neutral, sin recompensas ni selección solo de reseñas positivas.</p><div className={styles.message}><p>{review}</p></div><button type="button" className={styles.secondary} onClick={()=>void copy(review)}><ClipboardCopy size={15}/> Copiar mensaje</button></article>
       <article><span className={styles.iconCircle}><Megaphone size={22}/></span><h3>Reactivar con permiso</h3><p>Una invitación útil para personas que aceptaron recibir comunicaciones; respeta las bajas y reglas del canal.</p><div className={styles.message}><p>{followup}</p></div><button type="button" className={styles.secondary} onClick={()=>void copy(followup)}><ClipboardCopy size={15}/> Copiar mensaje</button></article>
      </div>
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>Experimento de 7 días</strong><p>Registra cuántos clientes aceptaron volver a recibir noticias, cuántos respondieron y cuántos regresaron. Compara la utilidad con el coste de conseguir clientes nuevos.</p></div></div>
     </>:null}
     {notice?<p role="status" className={styles.toast}>{notice}</p>:null}
    </div>
   </div>
   <footer className={styles.footer}><span>VMV Business · Marketing Studio</span><span>Planificación y cálculos locales · Sin envío ni publicación automática</span></footer>
  </div>
 </main>;
}
