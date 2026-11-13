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
 const {translate,language}=useInterfaceLanguage();
 const localizedTabs=tabs.map(tab=>({...tab,label:translate(("marketing.tabs."+tab.id+".label") as import("@/lib/i18n").MessageKey),description:translate(("marketing.tabs."+tab.id+".desc") as import("@/lib/i18n").MessageKey)}));
 const localizedChannels=channels.map(channel=>({...channel,desc:translate(("marketing.channels."+channel.id) as import("@/lib/i18n").MessageKey)}));
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
    <span className={styles.marker}><Sparkles size={14}/> {translate("marketing.copy.marketing_studio_beta")}</span>
   </header>
   {section!=="actions"?<section className={styles.hero}>
    <div className={styles.heroIntro}>
     <span className={styles.eyebrow}><TrendingUp size={16}/> {translate("marketing.copy.more_customers_smarter_decisions")}</span>
     <h1>{translate("marketing.copy.marketing_that_drives")} <em>{translate("marketing.copy.growth")}</em></h1>
     <p>{translate("marketing.copy.stop_guessing_what_to_publish_define_your_offer_take_pr")}</p>
     <div className={styles.heroPills}><span>{translate("marketing.copy.no_fabricated_metrics")}</span><span>{translate("marketing.copy.results_focused")}</span><span>{translate("marketing.copy.built_for_small_businesses")}</span></div>
    </div>
    <div className={styles.heroShape}><div><Target size={38}/><strong>{translate("marketing.copy.your_next_customer")}</strong><span>{translate("marketing.copy.start_with_a_clear_strategy")}</span></div></div>
   </section>:null}
   {section!=="actions"?<div className={styles.noticeBand}><ShieldCheck size={18}/><p><strong>{translate("marketing.copy.local_planning")}</strong> {translate("marketing.copy.drafts_and_calculations_on_this_screen_are_not_saved_on")}</p></div>:null}
   <div className={section==="actions"?styles.catalogWorkspace:styles.workspace}>
    {section!=="actions"?<aside className={styles.sidebar}>
     <span className={styles.sidebarLabel}>{translate("marketing.copy.growth_center")}</span>
     {localizedTabs.map(tab=><button type="button" key={tab.id} onClick={()=>{setSection(tab.id);setNotice("");}}
      className={section===tab.id?styles.tabActive:styles.tab} aria-current={section===tab.id?"page":undefined}>
       <tab.Icon size={20}/><span><strong>{tab.label}</strong><small>{tab.description}</small></span><ArrowUpRight size={14}/></button>)}
     <div className={styles.sidebarNote}><Lightbulb size={19}/><strong>{translate("marketing.copy.growth_principle")}</strong><p>{translate("marketing.copy.views_alone_do_not_make_a_successful_campaign_customers")}</p></div>
    </aside>:null}
    <div className={section==="actions"?styles.catalogContent:styles.content}>
     {section==="strategy"?<>
      <div className={styles.sectionTop}><span>{translate("marketing.copy.step_01_foundations")}</span><h2>{translate("marketing.copy.let_s_understand_your_business")}</h2><p>{translate("marketing.copy.the_best_strategy_depends_on_who_buys_what_they_need_an")}</p></div>
      <div className={styles.formGrid}>
       <Field label={translate("marketing.copy.business_name_2")} value={form.business} onChange={v=>patch("business",v)} placeholder={translate("marketing.copy.e_g_my_business")}/>
       <label className={styles.field}><span>{translate("marketing.copy.industry_or_service")}</span>
        <select value={form.industry} onChange={e=>patch("industry",e.target.value)} aria-label={translate("marketing.copy.select_your_business_industry")}>
         <option value="">{translate("marketing.copy.select_your_industry")}</option>
         {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>{BUSINESS_CATEGORIES.filter(option=>option.group===group).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>)}
         <option value="unsure">{translate("marketing.copy.i_m_not_sure")}</option>
        </select><small>{translate("marketing.copy.standardized_options_help_create_more_consistent_strate")}</small>
       </label>
       <Field label={translate("marketing.copy.ideal_customer")} value={form.audience} onChange={v=>patch("audience",v)} placeholder={translate("marketing.copy.who_typically_buys_and_why")}/>
       <Field label={translate("marketing.copy.main_offer")} value={form.offer} onChange={v=>patch("offer",v)} placeholder={translate("marketing.copy.what_do_you_sell_and_what_problem_does_it_solve")}/>
       <Field label={translate("marketing.copy.average_order_value_optional")} type="number" min={0} value={form.ticket} onChange={v=>patch("ticket",v)} placeholder={translate("marketing.copy.you_can_leave_this_blank")} hint={translate("marketing.copy.average_amount_per_sale_if_you_don_t_know_don_t_make_it")}/>
       <Field label={translate("marketing.copy.gross_margin_optional")} type="number" min={0} max={100} value={form.margin} onChange={v=>patch("margin",v)} placeholder={translate("marketing.copy.you_can_leave_this_blank")} hint={translate("marketing.copy.percentage_left_from_a_sale_after_direct_costs_excludes")}/>
      </div>
      <div className={styles.metricHelp}>
       <button type="button" className={styles.metricHelpToggle} onClick={()=>setShowMetricHelp(!showMetricHelp)} aria-expanded={showMetricHelp}>
        <Lightbulb size={17}/> {translate("marketing.copy.not_sure_about_these_numbers")} <span>{showMetricHelp?"Ocultar ayuda":"Calculémoslos juntos"}</span>
       </button>
       {showMetricHelp?<div className={styles.metricHelpBody}>
        <p>{translate("marketing.copy.these_details_are_optional_use_real_figures_if_you_have")}</p>
        <div className={styles.metricHelpGrid}>
         <div className={styles.metricHelpSection}>
          <strong>{translate("marketing.copy.average_order_value")}</strong><small>{translate("marketing.copy.total_sales_number_of_orders_in_the_same_period")}</small>
          <label>{translate("marketing.copy.period_revenue")}<input type="number" min={0} value={periodRevenue} onChange={e=>setPeriodRevenue(e.target.value)} placeholder={translate("marketing.copy.e_g_1000")}/></label>
          <label>{translate("marketing.copy.orders_in_the_period")}<input type="number" min={1} value={periodOrders} onChange={e=>setPeriodOrders(e.target.value)} placeholder={translate("marketing.copy.e_g_20")}/></label>
          <span>{translate("marketing.copy.result")} {money(suggestedTicket)}</span>
          <button type="button" disabled={suggestedTicket===null} onClick={()=>patch("ticket",String(Math.round((suggestedTicket??0)*100)/100))}>{translate("marketing.copy.use_average_order_value")}</button>
         </div>
         <div className={styles.metricHelpSection}>
          <strong>{translate("marketing.copy.estimated_margin_for_one_product")}</strong><small>{translate("marketing.copy.selling_price_minus_direct_costs_divided_by_the_price_y")}</small>
          <label>{translate("marketing.copy.selling_price")}<input type="number" min={0} value={samplePrice} onChange={e=>setSamplePrice(e.target.value)} placeholder={translate("marketing.copy.e_g_50")}/></label>
          <label>{translate("marketing.copy.direct_costs")}<input type="number" min={0} value={sampleCost} onChange={e=>setSampleCost(e.target.value)} placeholder={translate("marketing.copy.e_g_20")}/></label>
          <span>{translate("marketing.copy.result")} {percent(suggestedMargin)}</span>
          <button type="button" disabled={suggestedMargin===null} onClick={()=>patch("margin",String(Math.round((suggestedMargin??0)*100)/100))}>{translate("marketing.copy.use_estimate")}</button>
         </div>
        </div>
       </div>:null}
      </div>
      {margin!==null&&validMargin===null?<p className={styles.warning}>{translate("marketing.copy.margin_must_be_between_0_and_100")}</p>:null}
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>{translate("marketing.copy.first_opportunity")}</strong><p>{form.offer.trim()&&form.audience.trim()?
       "Tu siguiente campaña debe explicar por qué "+offer+" es valioso para "+audience+". Prueba una promesa específica, evidencia real y una llamada a la acción.": 
       "Empieza por una sola oferta y un tipo de cliente. Hablar a todo el mundo suele dificultar medir qué funciona."}</p></div></div>
      <button type="button" className={styles.primary} onClick={()=>setSection("campaign")}>{translate("marketing.copy.design_campaign")} <ArrowUpRight size={16}/></button>
     </>:null}
     {section==="actions"?<MarketingActionCenter onWizardActiveChange={setActionWizardActive} businessName={form.business}
      industryId={form.industry} website={form.website} preselectedService={requestedService||undefined}
      onGoToVisibility={()=>{setSection("presence");setNotice("");}}/>:null}
     {section==="presence"?<LocalVisibilityStudio
      profile={{business:form.business,industry:industryName(form.industry),website:form.website,phone:form.phone,address:form.address,city:form.city,region:form.region,postal:form.postal,hours:form.hours,description:form.description}}
      onChange={(key,value)=>patch(key,value)}
      onRequestHelp={(service)=>{setRequestedService(service);setSection("actions");setNotice("");}}/>:null}
     {section==="campaign"?<>
      <div className={styles.sectionTop}><span>{translate("marketing.copy.step_02_acquisition")}</span><h2>{translate("marketing.copy.build_a_purposeful_campaign")}</h2><p>{translate("marketing.copy.choose_where_you_want_to_reach_customers_the_draft_adap")}</p></div>
      <div className={styles.channelGrid}>{localizedChannels.map(item=><button type="button" key={item.id} aria-pressed={form.channel===item.id}
       className={form.channel===item.id?styles.channelActive:styles.channel} onClick={()=>{patch("channel",item.id);setCampaignEditedText(null);setCampaignEditing(false);setCampaignDetailsOpen(false);}}>
        <strong>{item.label}</strong><small>{item.desc}</small></button>)}</div>
      <div className={styles.formGrid}>
       <Field label={translate("marketing.copy.offer_to_promote")} value={form.offer} onChange={v=>patch("offer",v)} placeholder={translate("marketing.copy.what_do_you_want_to_sell")}/>
       <Field label={translate("marketing.copy.target_audience")} value={form.audience} onChange={v=>patch("audience",v)} placeholder={translate("marketing.copy.who_is_it_for")}/>
       <Field label={translate("marketing.copy.call_to_action")} value={form.cta} onChange={v=>patch("cta",v)} placeholder={translate("marketing.copy.e_g_request_a_quote")}/>
       <Field label={translate("marketing.copy.landing_page_optional")} value={form.website} onChange={v=>patch("website",v)} placeholder="https://tusitio.com"/>
      </div>
      <article className={styles.plan}>
       <span className={styles.planTag}><CheckCircle2 size={15}/> {translate("marketing.copy.your_plan_editable_draft")}</span>
       <h3>{campaign.angle}</h3>
       <p className={styles.planSubtitle}>{translate("marketing.copy.an_idea_to_review_customize_and_share_nothing_is_publis")}</p>
       <div className={styles.message}>
        <span>{translate("marketing.copy.suggested_message")}</span>
        {campaignEditing?<textarea className={styles.campaignTextarea} value={activeCampaignDraft}
         onChange={e=>setCampaignEditedText(e.target.value)} maxLength={2000} rows={5}
         aria-label={translate("marketing.copy.edit_campaign_message")}/>:
         <p className={styles.campaignPreview}>{activeCampaignDraft}</p>}
       </div>
       <div className={styles.campaignQuickActions}>
        <button type="button" className={styles.primary} onClick={()=>void shareText(activeCampaignDraft,"Campaña de "+business)}><Share2 size={17}/> {translate("marketing.copy.share")}</button>
        <button type="button" className={styles.secondary} onClick={()=>setCampaignEditing(value=>!value)}>{campaignEditing?<CheckCircle2 size={16}/>:<ClipboardCopy size={16}/>} {campaignEditing?"Listo":"Editar"}</button>
        <button type="button" className={styles.secondary} onClick={()=>void copy(activeCampaignDraft)}><ClipboardCopy size={16}/> {translate("marketing.copy.copy")}</button>
       </div>
       <button type="button" className={styles.detailsToggle} aria-expanded={campaignDetailsOpen}
        onClick={()=>setCampaignDetailsOpen(value=>!value)}>
        <span>{campaignDetailsOpen?"Ocultar estrategia":"Ver estrategia y métricas"}</span>
        {campaignDetailsOpen?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
       </button>
       {campaignDetailsOpen?<div className={styles.campaignDetails}>
        <div><strong>{translate("marketing.copy.what_to_do")}</strong><p>{campaign.execution}</p></div>
        <div className={styles.measure}><BarChart3 size={18}/><span>{translate("marketing.copy.measure")} <strong>{campaign.measure}</strong></span></div>
        <button type="button" className={styles.secondary} onClick={()=>void copy(report)}><ClipboardCopy size={15}/> {translate("marketing.copy.copy_complete_plan")}</button>
       </div>:null}
      </article>
     </>:null}
     {section==="numbers"?<>
      <div className={styles.sectionTop}><span>{translate("marketing.copy.step_03_measurement")}</span><h2>{translate("marketing.copy.is_your_marketing_profitable")}</h2><p>{translate("marketing.copy.enter_real_campaign_results_calculations_update_as_you_")}</p></div>
      <div className={styles.formGrid}>
       <Field label={translate("marketing.copy.ad_spend")} type="number" min={0} value={form.budget} onChange={v=>patch("budget",v)} placeholder="0"/>
       <Field label={translate("marketing.copy.interested_leads")} type="number" min={0} value={form.leads} onChange={v=>patch("leads",v)} placeholder="0"/>
       <Field label={translate("marketing.copy.customers_acquired")} type="number" min={0} value={form.sales} onChange={v=>patch("sales",v)} placeholder="0"/>
       <Field label={translate("marketing.copy.attributed_revenue")} type="number" min={0} value={form.revenue} onChange={v=>patch("revenue",v)} placeholder={translate("marketing.copy.actual_revenue")} hint={translate("marketing.copy.if_left_blank_customers_average_order_value_estimate")}/>
       <Field label={translate("marketing.copy.average_order_value_2")} type="number" min={0} value={form.ticket} onChange={v=>patch("ticket",v)} placeholder="0"/>
       <Field label={translate("marketing.copy.gross_margin")} type="number" min={0} max={100} value={form.margin} onChange={v=>patch("margin",v)} placeholder="0"/>
      </div>
      {sales!==null&&leads!==null&&sales>leads?<p className={styles.warning}>{translate("marketing.copy.you_entered_more_customers_than_leads_check_your_source")}</p>:null}
      {margin!==null&&validMargin===null?<p className={styles.warning}>{translate("marketing.copy.margin_must_be_between_0_and_100")}</p>:null}
      <div className={styles.kpis}>
       <div><span>{translate("marketing.copy.cost_per_lead")}</span><strong>{money(metrics.cpl)}</strong><small>{translate("marketing.copy.ad_spend_leads")}</small></div>
       <div><span>{translate("marketing.copy.cost_per_customer")}</span><strong>{money(metrics.cac)}</strong><small>{translate("marketing.copy.ad_spend_customers")}</small></div>
       <div><span>{translate("marketing.copy.conversion")}</span><strong>{percent(metrics.conversion)}</strong><small>{translate("marketing.copy.customers_leads")}</small></div>
       <div><span>ROAS</span><strong>{metrics.roas===null?"—":metrics.roas.toFixed(2)+"×"}</strong><small>{translate("marketing.copy.revenue_ad_spend")}</small></div>
      </div>
      <div className={styles.profit}>
       <div><span>{translate("marketing.copy.contribution_after_advertising")}</span><strong>{money(metrics.contribution)}</strong><small>{estimatedRevenue?"Con ingresos estimados por ticket × clientes. ":""}Margen bruto de ventas menos gasto publicitario.</small></div>
       <div><span>{translate("marketing.copy.maximum_break_even_cac_on_first_purchase")}</span><strong>{money(metrics.breakEven)}</strong><small>{translate("marketing.copy.average_order_value_gross_margin_excludes_fixed_costs_t")}</small></div>
      </div>
      <p className={styles.fineprint}>{translate("marketing.copy.these_are_not_connected_data_or_a_sales_forecast_verify")}</p>
     </>:null}
     {section==="retention"?<>
      <div className={styles.sectionTop}><span>{translate("marketing.copy.step_04_retention")}</span><h2>{translate("marketing.copy.growth_also_comes_from_returning_customers")}</h2><p>{translate("marketing.copy.existing_customers_can_buy_again_recommend_you_and_prov")}</p></div>
      <div className={styles.retentionCards}>
       <article><span className={styles.iconCircle}><HeartHandshake size={22}/></span><h3>{translate("marketing.copy.request_honest_reviews")}</h3><p>{translate("marketing.copy.ask_customers_for_neutral_feedback_without_incentives_o")}</p>
         <label className={styles.reviewLinkField}>
          <span><Link2 size={15}/> {translate("marketing.copy.review_link_3")} <small>{translate("marketing.copy.optional")}</small></span>
          <input type="url" inputMode="url" value={reviewUrl} onChange={e=>{setReviewUrl(e.target.value);setNotice("");}} maxLength={2048} placeholder="https://g.page/r/..." aria-invalid={!reviewLinkIsValid}/>
          <small>{translate("marketing.copy.paste_a_direct_review_link_so_your_customers_can_open_i")}</small>
          {!reviewLinkIsValid?<strong role="alert">{translate("marketing.copy.enter_a_valid_https_link_before_sharing")}</strong>:null}
         </label>
         <div className={styles.message}><span>{translate("marketing.copy.message_your_customer_will_receive")}</span>
          <p className={reviewPreviewOpen?styles.reviewMessage:styles.clampedMessage}>{review}</p>
          <button type="button" className={styles.previewToggle} aria-expanded={reviewPreviewOpen}
           onClick={()=>setReviewPreviewOpen(value=>!value)}>{reviewPreviewOpen?"Mostrar menos":"Leer mensaje completo"} {reviewPreviewOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
         </div>
         <div className={styles.reviewShare}>
          <button type="button" className={styles.primary} onClick={()=>void shareReview()} disabled={!reviewLinkIsValid}><Share2 size={16}/> {translate("marketing.copy.share_request")}</button>
          <div className={styles.reviewShareOptions} aria-label={translate("marketing.copy.other_ways_to_share")}>
           {reviewLinkIsValid?<a className={styles.shareOption} href={whatsappReviewUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> WhatsApp</a>:null}
           {reviewLinkIsValid?<a className={styles.shareOption} href={emailReviewUrl}><Mail size={15}/> {translate("marketing.copy.email")}</a>:null}
           <button type="button" className={styles.shareOption} onClick={()=>void copy(review)} disabled={!reviewLinkIsValid}><ClipboardCopy size={15}/> {translate("marketing.copy.copy")}</button>
          </div>
          <small>{translate("marketing.copy.you_choose_the_recipients_and_confirm_sending_no_reques")}</small>
         </div>
        </article>
       <article><span className={styles.iconCircle}><Megaphone size={22}/></span><h3>{translate("marketing.copy.reconnect_with_permission")}</h3><p>{translate("marketing.copy.a_helpful_invitation_to_people_who_agreed_to_receive_me")}</p><div className={styles.message}>
        <p className={followupPreviewOpen?styles.reviewMessage:styles.clampedMessage}>{followup}</p>
        <button type="button" className={styles.previewToggle} aria-expanded={followupPreviewOpen}
         onClick={()=>setFollowupPreviewOpen(value=>!value)}>{followupPreviewOpen?"Mostrar menos":"Leer mensaje completo"} {followupPreviewOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
       </div>
       <div className={styles.followupActions}>
        <button type="button" className={styles.primary} onClick={()=>void shareText(followup,"Mensaje de "+business)}><Share2 size={15}/> {translate("marketing.copy.share")}</button>
        <button type="button" className={styles.secondary} onClick={()=>void copy(followup)}><ClipboardCopy size={15}/> {translate("marketing.copy.copy")}</button>
       </div></article>
      </div>
      <div className={styles.insight}><Lightbulb size={21}/><div><strong>{translate("marketing.copy.7_day_experiment")}</strong><p>{translate("marketing.copy.track_how_many_customers_opted_in_replied_and_returned_")}</p></div></div>
     </>:null}
     {section==="actions"&&!actionWizardActive?<details className={styles.advancedTools}><summary>{translate("marketing.ui.moreTools")}</summary><div className={styles.advancedLinks}>{localizedTabs.filter(t=>t.id!=="actions").map(tab=><button key={tab.id} type="button" onClick={()=>setSection(tab.id)}><tab.Icon size={17}/>{tab.label}<ArrowUpRight size={14}/></button>)}</div></details>:null}
     {notice?<p role="status" className={styles.toast}>{notice}</p>:null}
    </div>
   </div>
   {!actionWizardActive?<footer className={styles.footer}><span>{translate("marketing.copy.vmv_business_marketing_studio")}</span><span>{translate("marketing.ui.footer")}</span></footer>:null}
  </div>
 </main>;
}
