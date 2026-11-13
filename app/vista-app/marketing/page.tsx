"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,BarChart3,CheckCircle2,ChevronDown,ChevronUp,ClipboardCopy,Globe2,HeartHandshake,Workflow,Link2,Lightbulb,Mail,Megaphone,MessageCircle,Share2,ShieldCheck,Sparkles,Target,TrendingUp} from "lucide-react";
import styles from "./page.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import LocalVisibilityStudio from "./LocalVisibilityStudio";
import MarketingActionCenter, {type ServiceCode} from "./MarketingActionCenter";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS,categoryLabel} from "@/lib/vmv-business-categories";

type Section="strategy"|"actions"|"presence"|"campaign"|"numbers"|"retention";
type Channel="social"|"search"|"local"|"referrals"|"email";
type FormState={
 business:string;industry:string;audience:string;offer:string;cta:string;website:string;
 phone:string;address:string;city:string;region:string;postal:string;hours:string;description:string;
 channel:Channel;budget:string;ticket:string;margin:string;leads:string;sales:string;revenue:string;
};
const initial:FormState={
 business:"",industry:"",audience:"",offer:"",cta:"",website:"",
 phone:"",address:"",city:"",region:"",postal:"",hours:"",description:"",
 channel:"social",budget:"",ticket:"",margin:"",leads:"",sales:"",revenue:""
};
const tabs:{id:Section;label:string;description:string;Icon:typeof Target}[]=[
 {id:"actions",label:"Acciones",description:"Solicita y realiza tareas",Icon:Workflow},
 {id:"strategy",label:"Diagnóstico",description:"Encuentra oportunidades",Icon:Target},
 {id:"presence",label:"Visibilidad local",description:"Directorios y SEO gratis",Icon:Globe2},
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
// Shared taxonomy maintained by Web Services; IDs are reused across VMV Business.
const industryName=(id:string)=>id==="unsure"?"No estoy seguro":categoryLabel(id,"Por definir");
const validReviewUrl=(value:string)=>{
 if(!value)return true;
 try{const url=new URL(value);return url.protocol==="https:"&&Boolean(url.hostname);}
 catch{return false;}
};
function Field({label,value,onChange,placeholder,type="text",hint,min,max}:{
 label:string;value:string;onChange:(v:string)=>void;placeholder?:string;
 type?:string;hint?:string;min?:number;max?:number;
}){
 return <label className={styles.field}><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)}
  placeholder={placeholder} type={type} min={min} max={max} step={type==="number"?"any":undefined} maxLength={type==="text"?250:undefined}/>
  {hint?<small>{hint}</small>:null}</label>;
}
export default function MarketingPage(){
 const {translate}=useInterfaceLanguage();
 const [section,setSection]=useState<Section>("actions");
 const [requestedService,setRequestedService]=useState<ServiceCode|null>(null);
 const [actionWizardActive,setActionWizardActive]=useState(false);
 const [form,setForm]=useState<FormState>(initial);
 const [notice,setNotice]=useState("");
 const [reviewUrl,setReviewUrl]=useState("");
 const [campaignDetailsOpen,setCampaignDetailsOpen]=useState(false);
 const [campaignEditing,setCampaignEditing]=useState(false);
 const [campaignEditedText,setCampaignEditedText]=useState<string|null>(null);
 const [reviewPreviewOpen,setReviewPreviewOpen]=useState(false);
 const [followupPreviewOpen,setFollowupPreviewOpen]=useState(false);
 const [showMetricHelp,setShowMetricHelp]=useState(false);
 const [periodRevenue,setPeriodRevenue]=useState("");
 const [periodOrders,setPeriodOrders]=useState("");
 const [samplePrice,setSamplePrice]=useState("");
 const [sampleCost,setSampleCost]=useState("");
 const patch=(key:keyof FormState,value:string)=>{setForm(prev=>({...prev,[key]:value}));setNotice("");};
 const spend=number(form.budget),ticket=number(form.ticket),margin=number(form.margin),
  leads=number(form.leads),sales=number(form.sales),enteredRevenue=number(form.revenue);
 const validMargin=margin!==null&&margin<=100?margin:null;
 const revenueForTicket=number(periodRevenue),ordersForTicket=number(periodOrders);
 const suggestedTicket=revenueForTicket!==null&&ordersForTicket!==null&&ordersForTicket>0?revenueForTicket/ordersForTicket:null;
 const priceForMargin=number(samplePrice),costForMargin=number(sampleCost);
 const suggestedMargin=priceForMargin!==null&&priceForMargin>0&&costForMargin!==null&&costForMargin<=priceForMargin?
  (priceForMargin-costForMargin)/priceForMargin*100:null;
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
 const activeCampaignDraft=campaignEditedText??campaign.draft;
 const reviewLink=reviewUrl.trim();
 const reviewLinkIsValid=validReviewUrl(reviewLink);
 const review="¡Hola! Gracias por elegir "+business+". ¿Podrías contarnos cómo fue tu experiencia con una reseña honesta? Tu opinión nos ayuda a mejorar y orienta a otras personas."+(reviewLink&&reviewLinkIsValid?"\n\nPuedes dejar tu reseña aquí: "+reviewLink:"")+"\n\n¡Muchas gracias!";
 const whatsappReviewUrl="https://wa.me/?text="+encodeURIComponent(review);
 const emailReviewUrl="mailto:?subject="+encodeURIComponent("Tu opinión sobre "+business)+"&body="+encodeURIComponent(review);
 const followup="Hola, te saludamos de "+business+". Gracias por confiar en nosotros. ¿Hay algo en lo que podamos ayudarte de nuevo? "+cta+". Si prefieres no recibir estos mensajes, dínoslo y no volveremos a escribirte.";
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setNotice("Texto copiado.");}
  catch{setNotice("No se pudo copiar automáticamente; selecciona el texto para copiarlo.");}
 };
 const shareText=async(value:string,title:string)=>{
  if(typeof navigator.share==="function"){
   try{await navigator.share({title,text:value});setNotice("Elige la aplicación y confirma el envío.");}
   catch(error){if((error as Error)?.name!=="AbortError")setNotice("No se pudo abrir Compartir. Puedes copiar el mensaje.");}
   return;
  }
  try{await navigator.clipboard.writeText(value);setNotice("El mensaje se copió para que puedas compartirlo.");}
  catch{setNotice("No se pudo compartir ni copiar automáticamente.");}
 };
 const shareReview=async()=>{
  if(!reviewLinkIsValid){setNotice("Revisa el enlace de reseñas: debe comenzar con https:// y ser válido.");return;}
  if(typeof navigator.share==="function"){
   try{await navigator.share({text:review});setNotice("La solicitud se entregó a la opción elegida. Confirma el envío en esa aplicación.");}
   catch(error){if((error as Error)?.name!=="AbortError")setNotice("No se pudo abrir Compartir. Puedes usar WhatsApp, Correo o copiar el mensaje.");}
   return;
  }
  try{await navigator.clipboard.writeText(review);setNotice("La opción nativa no está disponible aquí. Copiamos el mensaje para que lo pegues.");}
  catch{setNotice("La opción nativa no está disponible aquí. Prueba WhatsApp o Correo.");}
 };
 const report=[
  "VMV MARKETING · PLAN DE TRABAJO",
  "Negocio: "+business,"Sector: "+industryName(form.industry),
  "Audiencia: "+audience,"Oferta: "+offer,"Objetivo / CTA: "+cta,
  "Canal: "+campaign.channel,"Enfoque: "+campaign.angle,
  "Acción: "+campaign.execution,"Mensaje de partida: "+activeCampaignDraft,
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
   {section!=="actions"?<section className={styles.hero}>
    <div className={styles.heroIntro}>
     <span className={styles.eyebrow}><TrendingUp size={16}/> MÁS CLIENTES. MEJORES DECISIONES.</span>
     <h1>Marketing que se convierte en <em>crecimiento.</em></h1>
     <p>Deja de adivinar qué publicar. Define tu oferta, lanza acciones concretas y descubre si realmente están generando rentabilidad.</p>
     <div className={styles.heroPills}><span>Sin métricas inventadas</span><span>Orientado a resultados</span><span>Listo para pequeños negocios</span></div>
    </div>
    <div className={styles.heroShape}><div><Target size={38}/><strong>Tu siguiente cliente</strong><span>Comienza con una estrategia clara</span></div></div>
   </section>:null}
   {section!=="actions"?<div className={styles.noticeBand}><ShieldCheck size={18}/><p><strong>Planificación local.</strong> Los borradores y cálculos de esta pantalla no se guardan en servidores. Las solicitudes enviadas desde Acciones sí quedan registradas en tu cuenta; no publicamos campañas ni hacemos cargos automáticamente.</p></div>:null}
   <div className={section==="actions"?styles.catalogWorkspace:styles.workspace}>
    {section!=="actions"?<aside className={styles.sidebar}>
     <span className={styles.sidebarLabel}>CENTRO DE CRECIMIENTO</span>
     {tabs.map(tab=><button type="button" key={tab.id} onClick={()=>{setSection(tab.id);setNotice("");}}
      className={section===tab.id?styles.tabActive:styles.tab} aria-current={section===tab.id?"page":undefined}>
       <tab.Icon size={20}/><span><strong>{tab.label}</strong><small>{tab.description}</small></span><ArrowUpRight size={14}/></button>)}
     <div className={styles.sidebarNote}><Lightbulb size={19}/><strong>Regla del crecimiento</strong><p>Una campaña no es un éxito por sus vistas. Importan clientes, margen y recurrencia.</p></div>
    </aside>:null}
    <div className={section==="actions"?styles.catalogContent:styles.content}>
     {section==="strategy"?<>
      <div className={styles.sectionTop}><span>PASO 01 · FUNDAMENTOS</span><h2>Entendamos tu negocio</h2><p>La mejor estrategia depende de quién compra, qué necesita y cuánto deja cada venta.</p></div>
      <div className={styles.formGrid}>
       <Field label="Nombre del negocio" value={form.business} onChange={v=>patch("business",v)} placeholder="Ej. Mi negocio"/>
       <label className={styles.field}><span>Industria o servicio</span>
        <select value={form.industry} onChange={e=>patch("industry",e.target.value)} aria-label="Selecciona la industria de tu negocio">
         <option value="">Selecciona tu industria</option>
         {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>{BUSINESS_CATEGORIES.filter(option=>option.group===group).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>)}
         <option value="unsure">No estoy seguro</option>
        </select><small>Opciones estandarizadas para estrategias más consistentes.</small>
       </label>
       <Field label="Cliente ideal" value={form.audience} onChange={v=>patch("audience",v)} placeholder="¿Quién suele comprar y por qué?"/>
       <Field label="Oferta principal" value={form.offer} onChange={v=>patch("offer",v)} placeholder="¿Qué vendes y qué problema resuelves?"/>
       <Field label="Ticket promedio ($) · opcional" type="number" min={0} value={form.ticket} onChange={v=>patch("ticket",v)} placeholder="Puedes dejarlo vacío" hint="Importe promedio de cada venta. Si no lo sabes, no necesitas inventarlo."/>
       <Field label="Margen bruto (%) · opcional" type="number" min={0} max={100} value={form.margin} onChange={v=>patch("margin",v)} placeholder="Puedes dejarlo vacío" hint="Porcentaje de una venta tras costes directos. No incluye publicidad ni gastos fijos."/>
      </div>
      <div className={styles.metricHelp}>
       <button type="button" className={styles.metricHelpToggle} onClick={()=>setShowMetricHelp(!showMetricHelp)} aria-expanded={showMetricHelp}>
        <Lightbulb size={17}/> ¿No sabes estos números? <span>{showMetricHelp?"Ocultar ayuda":"Calculémoslos juntos"}</span>
       </button>
       {showMetricHelp?<div className={styles.metricHelpBody}>
        <p>Estos datos son opcionales. Si tienes cifras reales, calcula una aproximación. Si no, continúa con tu campaña y podrás medirlos más adelante.</p>
        <div className={styles.metricHelpGrid}>
         <div className={styles.metricHelpSection}>
          <strong>Ticket promedio</strong><small>Ventas totales ÷ número de pedidos del mismo período.</small>
          <label>Ingresos del período ($)<input type="number" min={0} value={periodRevenue} onChange={e=>setPeriodRevenue(e.target.value)} placeholder="Ej. 1000"/></label>
          <label>Pedidos del período<input type="number" min={1} value={periodOrders} onChange={e=>setPeriodOrders(e.target.value)} placeholder="Ej. 20"/></label>
          <span>Resultado: {money(suggestedTicket)}</span>
          <button type="button" disabled={suggestedTicket===null} onClick={()=>patch("ticket",String(Math.round((suggestedTicket??0)*100)/100))}>Usar ticket</button>
         </div>
         <div className={styles.metricHelpSection}>
          <strong>Margen estimado de un producto</strong><small>Precio menos costes directos, dividido entre el precio. El margen del negocio completo puede ser diferente.</small>
          <label>Precio de venta ($)<input type="number" min={0} value={samplePrice} onChange={e=>setSamplePrice(e.target.value)} placeholder="Ej. 50"/></label>
          <label>Costes directos ($)<input type="number" min={0} value={sampleCost} onChange={e=>setSampleCost(e.target.value)} placeholder="Ej. 20"/></label>
          <span>Resultado: {percent(suggestedMargin)}</span>
          <button type="button" disabled={suggestedMargin===null} onClick={()=>patch("margin",String(Math.round((suggestedMargin??0)*100)/100))}>Usar estimación</button>
         </div>
        </div>
       </div>:null}
      </div>
      {margin!==null&&validMargin===null?<p className={styles.warning}>El margen debe estar entre 0 y 100%.</p>:null}
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>Primera oportunidad</strong><p>{form.offer.trim()&&form.audience.trim()?
       "Tu siguiente campaña debe explicar por qué "+offer+" es valioso para "+audience+". Prueba una promesa específica, evidencia real y una llamada a la acción.": 
       "Empieza por una sola oferta y un tipo de cliente. Hablar a todo el mundo suele dificultar medir qué funciona."}</p></div></div>
      <button type="button" className={styles.primary} onClick={()=>setSection("campaign")}>Diseñar campaña <ArrowUpRight size={16}/></button>
     </>:null}
     {section==="actions"?<MarketingActionCenter onWizardActiveChange={setActionWizardActive} businessName={form.business}
      industryId={form.industry} website={form.website} preselectedService={requestedService||undefined}
      onGoToVisibility={()=>{setSection("presence");setNotice("");}}/>:null}
     {section==="presence"?<LocalVisibilityStudio
      profile={{business:form.business,industry:industryName(form.industry),website:form.website,phone:form.phone,address:form.address,city:form.city,region:form.region,postal:form.postal,hours:form.hours,description:form.description}}
      onChange={(key,value)=>patch(key,value)}
      onRequestHelp={(service)=>{setRequestedService(service);setSection("actions");setNotice("");}}/>:null}
     {section==="campaign"?<>
      <div className={styles.sectionTop}><span>PASO 02 · ADQUISICIÓN</span><h2>Diseña una campaña con propósito</h2><p>Elige dónde quieres alcanzar clientes. El borrador se adapta al canal, pero debes revisarlo antes de publicarlo.</p></div>
      <div className={styles.channelGrid}>{channels.map(item=><button type="button" key={item.id} aria-pressed={form.channel===item.id}
       className={form.channel===item.id?styles.channelActive:styles.channel} onClick={()=>{patch("channel",item.id);setCampaignEditedText(null);setCampaignEditing(false);setCampaignDetailsOpen(false);}}>
        <strong>{item.label}</strong><small>{item.desc}</small></button>)}</div>
      <div className={styles.formGrid}>
       <Field label="Oferta a promocionar" value={form.offer} onChange={v=>patch("offer",v)} placeholder="Qué quieres vender"/>
       <Field label="Público objetivo" value={form.audience} onChange={v=>patch("audience",v)} placeholder="A quién va dirigido"/>
       <Field label="Llamada a la acción" value={form.cta} onChange={v=>patch("cta",v)} placeholder="Ej. Solicita una cotización"/>
       <Field label="Página de destino (opcional)" value={form.website} onChange={v=>patch("website",v)} placeholder="https://tusitio.com"/>
      </div>
      <article className={styles.plan}>
       <span className={styles.planTag}><CheckCircle2 size={15}/> TU PLAN · BORRADOR EDITABLE</span>
       <h3>{campaign.angle}</h3>
       <p className={styles.planSubtitle}>Una idea para revisar, personalizar y compartir. No se publica automáticamente.</p>
       <div className={styles.message}>
        <span>MENSAJE SUGERIDO</span>
        {campaignEditing?<textarea className={styles.campaignTextarea} value={activeCampaignDraft}
         onChange={e=>setCampaignEditedText(e.target.value)} maxLength={2000} rows={5}
         aria-label="Editar mensaje de campaña"/>:
         <p className={styles.campaignPreview}>{activeCampaignDraft}</p>}
       </div>
       <div className={styles.campaignQuickActions}>
        <button type="button" className={styles.primary} onClick={()=>void shareText(activeCampaignDraft,"Campaña de "+business)}><Share2 size={17}/> Compartir</button>
        <button type="button" className={styles.secondary} onClick={()=>setCampaignEditing(value=>!value)}>{campaignEditing?<CheckCircle2 size={16}/>:<ClipboardCopy size={16}/>} {campaignEditing?"Listo":"Editar"}</button>
        <button type="button" className={styles.secondary} onClick={()=>void copy(activeCampaignDraft)}><ClipboardCopy size={16}/> Copiar</button>
       </div>
       <button type="button" className={styles.detailsToggle} aria-expanded={campaignDetailsOpen}
        onClick={()=>setCampaignDetailsOpen(value=>!value)}>
        <span>{campaignDetailsOpen?"Ocultar estrategia":"Ver estrategia y métricas"}</span>
        {campaignDetailsOpen?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
       </button>
       {campaignDetailsOpen?<div className={styles.campaignDetails}>
        <div><strong>Qué hacer</strong><p>{campaign.execution}</p></div>
        <div className={styles.measure}><BarChart3 size={18}/><span>Medir: <strong>{campaign.measure}</strong></span></div>
        <button type="button" className={styles.secondary} onClick={()=>void copy(report)}><ClipboardCopy size={15}/> Copiar plan completo</button>
       </div>:null}
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
       <article><span className={styles.iconCircle}><HeartHandshake size={22}/></span><h3>Solicitar reseñas honestas</h3><p>Pide opiniones a tus clientes de forma neutral, sin recompensas ni selección solo de reseñas positivas.</p>
         <label className={styles.reviewLinkField}>
          <span><Link2 size={15}/> Enlace para dejar la reseña <small>Opcional</small></span>
          <input type="url" inputMode="url" value={reviewUrl} onChange={e=>{setReviewUrl(e.target.value);setNotice("");}} maxLength={2048} placeholder="https://g.page/r/..." aria-invalid={!reviewLinkIsValid}/>
          <small>Pega el enlace directo de tu perfil de reseñas para que el cliente llegue con un toque.</small>
          {!reviewLinkIsValid?<strong role="alert">Introduce un enlace https:// válido antes de compartir.</strong>:null}
         </label>
         <div className={styles.message}><span>MENSAJE QUE RECIBIRÁ TU CLIENTE</span>
          <p className={reviewPreviewOpen?styles.reviewMessage:styles.clampedMessage}>{review}</p>
          <button type="button" className={styles.previewToggle} aria-expanded={reviewPreviewOpen}
           onClick={()=>setReviewPreviewOpen(value=>!value)}>{reviewPreviewOpen?"Mostrar menos":"Leer mensaje completo"} {reviewPreviewOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
         </div>
         <div className={styles.reviewShare}>
          <button type="button" className={styles.primary} onClick={()=>void shareReview()} disabled={!reviewLinkIsValid}><Share2 size={16}/> Compartir solicitud</button>
          <div className={styles.reviewShareOptions} aria-label="Otras formas de compartir">
           {reviewLinkIsValid?<a className={styles.shareOption} href={whatsappReviewUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> WhatsApp</a>:null}
           {reviewLinkIsValid?<a className={styles.shareOption} href={emailReviewUrl}><Mail size={15}/> Correo</a>:null}
           <button type="button" className={styles.shareOption} onClick={()=>void copy(review)} disabled={!reviewLinkIsValid}><ClipboardCopy size={15}/> Copiar</button>
          </div>
          <small>Tú eliges a quién enviarlo y confirmas el mensaje. No se envían solicitudes automáticamente.</small>
         </div>
        </article>
       <article><span className={styles.iconCircle}><Megaphone size={22}/></span><h3>Reactivar con permiso</h3><p>Una invitación útil para personas que aceptaron recibir comunicaciones; respeta las bajas y reglas del canal.</p><div className={styles.message}>
        <p className={followupPreviewOpen?styles.reviewMessage:styles.clampedMessage}>{followup}</p>
        <button type="button" className={styles.previewToggle} aria-expanded={followupPreviewOpen}
         onClick={()=>setFollowupPreviewOpen(value=>!value)}>{followupPreviewOpen?"Mostrar menos":"Leer mensaje completo"} {followupPreviewOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
       </div>
       <div className={styles.followupActions}>
        <button type="button" className={styles.primary} onClick={()=>void shareText(followup,"Mensaje de "+business)}><Share2 size={15}/> Compartir</button>
        <button type="button" className={styles.secondary} onClick={()=>void copy(followup)}><ClipboardCopy size={15}/> Copiar</button>
       </div></article>
      </div>
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>Experimento de 7 días</strong><p>Registra cuántos clientes aceptaron volver a recibir noticias, cuántos respondieron y cuántos regresaron. Compara la utilidad con el coste de conseguir clientes nuevos.</p></div></div>
     </>:null}
     {section==="actions"&&!actionWizardActive?<details className={styles.advancedTools}><summary>{translate("marketing.ui.moreTools")}</summary><div className={styles.advancedLinks}>{tabs.filter(t=>t.id!=="actions").map(tab=><button key={tab.id} type="button" onClick={()=>setSection(tab.id)}><tab.Icon size={17}/>{tab.label}<ArrowUpRight size={14}/></button>)}</div></details>:null}
     {notice?<p role="status" className={styles.toast}>{notice}</p>:null}
    </div>
   </div>
   {!actionWizardActive?<footer className={styles.footer}><span>VMV Business · Marketing Studio</span><span>{translate("marketing.ui.footer")}</span></footer>:null}
  </div>
 </main>;
}
