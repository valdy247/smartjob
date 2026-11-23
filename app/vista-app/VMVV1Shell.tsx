"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {useRouter,useSearchParams} from "next/navigation";
import {ArrowLeft,ArrowUpRight,Bot,CheckCircle2,Clapperboard,FileText,Globe,Home,LayoutGrid,LoaderCircle,LogOut,Megaphone,Search,Settings2,ShieldCheck,Sparkles,UserRound,Video,ChartNoAxesCombined,Bell,Rocket,TrendingUp,ChevronLeft} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import type {User,SupabaseClient} from "@supabase/supabase-js";
import type {Profile} from "@/lib/types";
import {getSupabase} from "@/lib/supabase";
import {initialAccountProfile} from "@/lib/account-profile";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import BusinessServicesPreview from "./BusinessServicesPreview";
import VMVV1NeedsAssessment from "./VMVV1NeedsAssessment";
import {readDiagnosticRecord,type DiagnosticAnswers} from "@/lib/business-diagnostic";
import {readV1Needs,recommendV1Services,type V1NeedsAnswers} from "@/lib/vmv-v1-recommendations";
import styles from "./VMVV1Shell.module.css";
import homeStyles from "./vista-app.module.css";

const VideoStudioPreview=dynamic(()=>import("./video-studio/page"),{
 ssr:false,
 loading:()=> <div className={styles.embeddedLoading} role="status" aria-live="polite">
  <div className={styles.loadingSymbol}><Clapperboard size={28}/></div>
  <strong>Preparando Video Studio</strong>
  <p>Tu espacio creativo está listo en un momento.</p>
  <div className={styles.loadingTrack}><span/></div>
 </div>
});
type Tab="home"|"services"|"account";
type Service={id:string;name:string;description:string;url?:string;Icon:LucideIcon;className:string;homeTone:string;shortcutId:string};
const services:Service[]=[
 {id:"web",name:"Web Services",description:"Crea y administra sitios web.",Icon:Globe,className:"web",homeTone:"homeTilePink",shortcutId:"web"},
 {id:"agents",name:"AI Agents",description:"Atención, ventas y reservas con IA.",url:"/vista-app/ai-agents",Icon:Bot,className:"agents",homeTone:"homeTileLavender",shortcutId:"ai-agents"},
 {id:"video",name:"Video Studio",description:"Historias animadas, escenas y narración.",url:"/vista-app/video-studio",Icon:Clapperboard,className:"video",homeTone:"homeTileMint",shortcutId:"agent-video"},
 {id:"quote",name:"Smart Quote",description:"Cotizaciones y propuestas profesionales.",url:"/vista-app/smart-quote",Icon:FileText,className:"quote",homeTone:"homeTileLavender",shortcutId:"agent-quote"},
 {id:"marketing",name:"Marketing",description:"Haz crecer tu negocio con estrategia.",url:"/vista-app/marketing",Icon:ChartNoAxesCombined,className:"marketing",homeTone:"homeTileGreen",shortcutId:"marketing"},
 {id:"ads",name:"Ads Studio",description:"Prepara y revisa tus campañas.",url:"/vista-app/marketing/ads",Icon:Megaphone,className:"ads",homeTone:"homeTilePink",shortcutId:"ads"}
];
const EN:Record<string,string>={
 "Crea y administra sitios web.":"Build and manage websites.",
 "Atención, ventas y reservas con IA.":"AI support, sales, and booking.",
 "Historias animadas, escenas y narración.":"Animated stories, scenes, and narration.",
 "Cotizaciones y propuestas profesionales.":"Quotes and professional proposals.",
 "Haz crecer tu negocio con estrategia.":"Grow your business strategically.",
 "Prepara y revisa tus campañas.":"Prepare and review ad campaigns."
};
export default function VMVV1Shell(){
 const {language}=useInterfaceLanguage(),en=language==="en",router=useRouter(),params=useSearchParams();
 const L=(es:string,enText:string)=>en?enText:es;
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [state,setState]=useState<"checking"|"guest"|"ready"|"missing"|"unconfigured">("checking");
 const [error,setError]=useState("");
 const [tab,setTab]=useState<Tab>("home");
 const [webView,setWebView]=useState(false);
 const [search,setSearch]=useState("");
 const [editing,setEditing]=useState(false);
 const [businessName,setBusinessName]=useState("");
 const [saving,setSaving]=useState(false);
 const [assessmentOpen,setAssessmentOpen]=useState(false);
 const previewFrameRef=useRef<HTMLIFrameElement|null>(null);
 const [needsAnswers,setNeedsAnswers]=useState<V1NeedsAnswers|null>(null);
 const [legacyAnswers,setLegacyAnswers]=useState<DiagnosticAnswers|null>(null);
 const reload=useCallback(async(sb:SupabaseClient)=>{
  setError("");
  const identity=await sb.auth.getUser();
  if(identity.error||!identity.data.user||identity.data.user.is_anonymous){
   setProfile(null);setUser(null);setNeedsAnswers(null);setLegacyAnswers(null);setState("guest");return;
  }
  const who=identity.data.user;
  setUser(who);
  const existing=await sb.from("smartjob_profiles").select("*").eq("id",who.id).maybeSingle();
  let profileData=existing.data;
  if(existing.error){setError(L("No se pudo cargar el perfil.","Couldn't load your profile."));setState("missing");return;}
  if(!profileData){
   const initial=initialAccountProfile(who.id,who.user_metadata||{});
   if(initial){
    const inserted=await sb.from("smartjob_profiles").upsert(initial,{onConflict:"id",ignoreDuplicates:true});
    if(!inserted.error){
     const result=await sb.from("smartjob_profiles").select("*").eq("id",who.id).maybeSingle();
     profileData=result.data;
    }
   }
  }
  if(!profileData){setState("missing");return;}
  setProfile(profileData as Profile);
  const businessId=String(profileData.id||who.id);
  setNeedsAnswers(readV1Needs(who.user_metadata,businessId)?.answers||null);
  setLegacyAnswers(readDiagnosticRecord(who.user_metadata,businessId)?.answers||null);
  setBusinessName(String(profileData.business_name||""));
  setState("ready");
 },[language]);
 useEffect(()=>{
  const sb=getSupabase();
  if(!sb){setState("unconfigured");return;}
  setClient(sb);
  let active=true;
  void reload(sb).catch(()=>{if(active){setState("missing");setError("No se pudo verificar la sesión.");}});
  const {data}=sb.auth.onAuthStateChange(event=>{
   if(["SIGNED_IN","SIGNED_OUT","INITIAL_SESSION"].includes(event))queueMicrotask(()=>{
    if(active)void reload(sb).catch(()=>setState("missing"));
   });
  });
  return()=>{active=false;data.subscription.unsubscribe();};
 },[reload]);
 useEffect(()=>{
  const value=params.get("tab");
  if(value==="services"||value==="home"||value==="account"||value==="settings")setTab(value==="settings"?"account":value);
  if(params.get("returnTo")==="web-studio"&&state==="ready")router.replace("/web-studio");
  if(params.get("returnTo")==="marketing"&&state==="ready")router.replace("/vista-app/marketing");
 },[params,router,state]);
 const filtered=useMemo(()=>services.filter(item=>(item.name+" "+item.description).toLowerCase().includes(search.toLowerCase().trim())),[search]);
 const suggestedServices=useMemo(()=>recommendV1Services(needsAnswers,legacyAnswers)
  .map(id=>services.find(item=>item.id===id)).filter((item):item is Service=>Boolean(item)),[needsAnswers,legacyAnswers]);
 const hasAssessment=Boolean(needsAnswers||legacyAnswers);
 const embeddedService=services.find(item=>item.id===params.get("preview")&&Boolean(item.url))||null;
 useEffect(()=>{
  if(!embeddedService)return;
  setTab("services");setWebView(false);setAssessmentOpen(false);
 },[embeddedService?.id]);
 useEffect(()=>{
  const onFrameMessage=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==previewFrameRef.current?.contentWindow)return;
   if(event.data?.type!=="vmv-preview-navigate")return;
   if(event.data.destination==="home"||event.data.destination==="services")
    router.push("/vista-app?tab="+event.data.destination);
  };
  window.addEventListener("message",onFrameMessage);
  return()=>window.removeEventListener("message",onFrameMessage);
 },[router]);
 const open=(id:string)=>{
  if(id==="web"){setTab("services");setWebView(true);return;}
  const href=services.find(s=>s.id===id)?.url;
  if(href)router.push("/vista-app?preview="+encodeURIComponent(id));
 };
 const nav=(next:Tab)=>{
  setTab(next);setWebView(false);setAssessmentOpen(false);setError("");
  if(embeddedService)router.push("/vista-app?tab="+next);
 };
 const save=async()=>{
  if(!client||!user||!profile||!businessName.trim()||saving)return;
  setSaving(true);setError("");
  const result=await client.from("smartjob_profiles").update({business_name:businessName.trim().slice(0,120)}).eq("id",user.id).select("*").single();
  if(result.error)setError(L("No se pudo guardar el negocio.","Could not save business."));
  else{setProfile(result.data as Profile);setEditing(false);}
  setSaving(false);
 };
 if(state==="unconfigured")return <main className={styles.center}><ShieldCheck size={30}/><h1>VMV Business</h1><p>Falta configurar la conexión de la aplicación.</p></main>;
 if(state==="checking")return <main className={styles.center}><LoaderCircle className={styles.spin} size={30}/><p>{L("Comprobando tu sesión…","Checking your session…")}</p></main>;
 if(state==="guest"&&client)return <VMVAuthGateway supabase={client}/>;
 if(state==="missing")return <main className={styles.center}><ShieldCheck size={30}/><h1>{L("Completa tu perfil","Complete your profile")}</h1><p>{error||L("Necesitas completar el registro antes de continuar.","Finish registration before continuing.")}</p><Link className={styles.mainButton} href="/registro">{L("Ir a registro","Go to registration")}</Link><button className={styles.softButton} onClick={()=>client&&void reload(client)}>{L("Reintentar","Retry")}</button></main>;
 return <main className={homeStyles.stage+" "+styles.previewStage}>
  <header className={homeStyles.pageHeader}>
   <a href="/" className={homeStyles.wordmark}>VMV<span> BUSINESS</span></a>
   <span className={homeStyles.previewTag}>VMV BUSINESS · V1 PREVIEW</span>
   <a href="/vista-app?preview=video" className={homeStyles.webLink}>{L("Video Studio","Video Studio")} <ArrowUpRight size={15}/></a>
  </header>
  <div className={homeStyles.layout+" "+styles.previewLayout}>
   <aside className={homeStyles.intro+" "+styles.previewIntro}>
    <span className={homeStyles.kicker}>VMV BUSINESS</span>
    <h1>{L("Tu negocio.","Your business.")}<br/><em>{L("En tu bolsillo.","In your pocket.")}</em></h1>
    <p>{L("Todo tu negocio, en un solo lugar. Herramientas, servicios e inteligencia artificial para emprendedores.","Your whole business in one place. Tools, services and AI for entrepreneurs.")}</p>
   </aside>
   <div className={homeStyles.phoneFrame+" "+styles.previewPhone}>
    <div className={homeStyles.device+" "+styles.previewDevice}>
     <div className={homeStyles.statusBar}><span>VMV</span><div className={homeStyles.dynamicIsland}/><span>◢ ▰</span></div>
     <div className={tab==="home"||embeddedService?homeStyles.homeTopHidden:homeStyles.appTop}>
      <div className={homeStyles.appLogo}><span className={homeStyles.mark}>▥</span><b>VMV<span> BUSINESS</span></b></div>
      <div className={styles.topActions}><InterfaceLanguagePicker compact/></div>
      <button type="button" onClick={()=>nav("account")} aria-label={L("Mi cuenta","My account")}><UserRound size={18}/></button>
     </div>
     <div className={homeStyles.scrollArea+" "+styles.previewScroll}>
      {embeddedService?<section className={styles.embeddedService} aria-label={embeddedService.name}>
       {embeddedService.id==="video"?
        <div className={styles.embeddedContent}>
         <VideoStudioPreview embedded onExit={()=>nav("services")}/>
        </div>:<>
        <div className={styles.embeddedBar}>
         <button type="button" aria-label={L("Volver a servicios","Back to services")} onClick={()=>nav("services")}><ChevronLeft size={17}/></button>
         <strong>{embeddedService.name}</strong>
        </div>
        <iframe ref={previewFrameRef} className={styles.embeddedFrame}
         title={embeddedService.name} src={embeddedService.url+"?vmvEmbed=1"}
         onLoad={()=>{
          try{
           if(previewFrameRef.current?.contentWindow?.location.pathname==="/vista-app")
            router.push("/vista-app?tab=home");
          }catch{/* A cross-origin destination cannot control the simulator. */}
         }}/>
       </>}
      </section>:null}
      {!embeddedService?<>
      {tab==="home"&&assessmentOpen&&profile?<VMVV1NeedsAssessment businessId={profile.id} en={en} initial={needsAnswers} onSaved={answers=>{setNeedsAnswers(answers);setAssessmentOpen(false);}} onClose={()=>setAssessmentOpen(false)}/>:null}
      {tab==="home"&&!assessmentOpen?<div className={homeStyles.screen+" "+homeStyles.homeV2+" "+homeStyles.homeConcept} data-vmv-shortcut-scope="home">
       <header className={homeStyles.homeIdentity}>
        <span className={homeStyles.homeIdentityBrand}><span className={homeStyles.homeIdentityV} aria-hidden="true">V</span><strong>VMV Business</strong></span>
        <span className={homeStyles.homeIdentityActions}><InterfaceLanguagePicker compact/><span className={homeStyles.homeBell} aria-hidden="true"><Bell size={21}/></span></span>
       </header>
       <div className={homeStyles.homeHello}>
        <h2>{en?"Hi":"Hola"}, {profile?.first_name||L("bienvenido","welcome")} 👋</h2>
        <p>{L("Todo tu negocio, en un solo lugar.","Your whole business, in one place.")}</p>
       </div>
       <section className={homeStyles.homeGrowHero} aria-label={L("Haz crecer tu negocio","Grow your business")}>
        <div className={homeStyles.homeGrowCopy}>
         <h3>{en?"Grow your\nbusiness":"Haz crecer\ntu negocio"}</h3>
         <p>{L("Herramientas, servicios y IA para emprendedores.","Tools, services and AI for entrepreneurs.")}</p>
         <button type="button" className={homeStyles.homeGrowStart} onClick={()=>setAssessmentOpen(true)}>{hasAssessment?L("Actualizar necesidades","Update your needs"):L("Comenzar","Get started")} <ArrowUpRight size={18}/></button>
        </div>
        <div className={homeStyles.homeRocketArt} aria-hidden="true"><span className={homeStyles.homeRocketHalo}/><Rocket size={104} strokeWidth={1.35}/><span className={homeStyles.homeRocketCloud}/></div>
       </section>
       <div className={styles.homeRecommendedHeading}>
        <div><h3>{hasAssessment?L("Recomendado para ti","Recommended for you"):L("Herramientas para comenzar","Tools to get started")}</h3>
         <p>{hasAssessment?L("Según las necesidades de tu negocio.","Based on your business needs."):L("Responde unas preguntas para personalizar tu inicio.","Answer a few questions to personalize your Home.")}</p>
        </div>
        <button type="button" onClick={()=>nav("services")}>{L("Ver todos","See all")} <ArrowUpRight size={15}/></button>
       </div>
       <div className={homeStyles.homeServiceTiles}>
        {suggestedServices.map(service=><button key={service.id} type="button" className={homeStyles[service.homeTone]} data-vmv-shortcut-id={service.shortcutId} onClick={()=>open(service.id)}>
         <service.Icon size={31}/><strong>{service.name}</strong>
        </button>)}
       </div>
       
      </div>:null}
      {tab==="services"&&webView&&user?<section className={styles.webHost}>
       <button className={homeStyles.back} onClick={()=>setWebView(false)}><ChevronLeft size={18}/>{L("Todos los servicios","All services")}</button>
       <BusinessServicesPreview userId={user.id} focus="web"/>
      </section>:null}
      {tab==="services"&&!webView?<section className={styles.catalog+" "+styles.catalogPremium}>
       <span className={styles.overline}>{L("SERVICIOS VMV","VMV SERVICES")}</span>
       <h1>{L("Nuestros servicios","Our services")}</h1>
       <p className={styles.catalogIntro}>{L("Todas las herramientas de tu negocio, organizadas en un solo lugar.","All your business tools in one place.")}</p>
       <label className={styles.search}><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={L("Buscar servicio","Search services")}/></label>
       <div className={styles.catalogTiles}>{filtered.map(service=><button key={service.id} className={styles.catalogService+" "+styles[service.className]} onClick={()=>open(service.id)} data-vmv-shortcut-id={service.shortcutId}>
        <span className={styles.catalogIconLarge}><service.Icon size={27}/></span>
        <ArrowUpRight size={17} className={styles.catalogArrow}/>
        <strong>{service.name}</strong>
        <small>{en?EN[service.description]:service.description}</small>
       </button>)}</div>
       {!filtered.length?<p className={styles.empty}>{L("No encontramos ese servicio.","No matching services found.")}</p>:null}
      </section>:null}
      {tab==="account"?<section className={styles.account}>
       <span className={styles.overline}>VMV BUSINESS</span><h1>{L("Configuración","Settings")}</h1>
       <div className={styles.accountCard}><div className={styles.avatar}><UserRound size={26}/></div><strong>{[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||L("Mi perfil","My profile")}</strong><small>{user?.email}</small></div>
       <div className={styles.accountCard}><label>{L("Nombre de tu negocio","Business name")}</label>
        {editing?<><input value={businessName} onChange={e=>setBusinessName(e.target.value)} maxLength={120}/><div className={styles.inline}>
         <button disabled={saving||!businessName.trim()} onClick={()=>void save()} className={styles.mainButton}>{saving?L("Guardando…","Saving…"):L("Guardar","Save")}</button>
         <button className={styles.softButton} onClick={()=>{setEditing(false);setBusinessName(profile?.business_name||"")}}>{L("Cancelar","Cancel")}</button></div></>:<div className={styles.inline}><strong>{profile?.business_name||L("Sin nombre","Not set")}</strong><button onClick={()=>setEditing(true)} className={styles.softButton}>{L("Editar","Edit")}</button></div>}
       </div><div className={styles.accountCard}><label>{L("Recomendaciones del negocio","Business recommendations")}</label><p>{L("Personaliza las cuatro herramientas de tu inicio con un diagnóstico breve.","Personalize your four Home recommendations with a short assessment.")}</p><button type="button" className={styles.softButton} onClick={()=>{setTab("home");setAssessmentOpen(true);}}>{hasAssessment?L("Actualizar diagnóstico","Update assessment"):L("Personalizar mi Home","Personalize my Home")}</button></div>
       <div className={styles.accountCard}><p>{L("Tus proyectos y trabajos se guardan en los servicios correspondientes.","Your projects are saved in their respective services.")}</p><Link href="/vista-app/soporte">{L("Contactar soporte","Contact support")} <ArrowUpRight size={15}/></Link></div>
       <button className={styles.logout} onClick={()=>client&&void client.auth.signOut()}><LogOut size={17}/>{L("Cerrar sesión","Sign out")}</button>
      </section>:null}
      {error?<p className={styles.error} role="alert">{error}</p>:null}
      </>:null}
     </div>
     <nav className={homeStyles.bottomNav+" "+styles.v1BottomNav} aria-label={L("Navegación principal","Main navigation")}>
      {([{id:"home",name:L("Inicio","Home"),Icon:Home},{id:"services",name:L("Servicios","Services"),Icon:LayoutGrid},{id:"account",name:L("Configuración","Settings"),Icon:Settings2}] as const).map(item=>
       <button type="button" key={item.id} className={tab===item.id?homeStyles.activeNav:""} aria-pressed={tab===item.id} onClick={()=>nav(item.id)}><span><item.Icon size={22}/></span><small>{item.name}</small></button>)}
     </nav>
    </div>
   </div>
  </div>
 </main>;
}
