"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
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
import styles from "./VMVV1Shell.module.css";
import homeStyles from "./vista-app.module.css";

type Tab="home"|"services"|"account";
type Service={id:string;name:string;description:string;url?:string;Icon:LucideIcon;className:string};
const services:Service[]=[
 {id:"web",name:"Web Services",description:"Crea y administra sitios web.",Icon:Globe,className:"web"},
 {id:"agents",name:"AI Agents",description:"Atención, ventas y reservas con IA.",url:"/vista-app/ai-agents",Icon:Bot,className:"agents"},
 {id:"video",name:"Video Studio",description:"Historias animadas, escenas y narración.",url:"/vista-app/video-studio",Icon:Clapperboard,className:"video"},
 {id:"quote",name:"Smart Quote",description:"Cotizaciones y propuestas profesionales.",url:"/vista-app/smart-quote",Icon:FileText,className:"quote"},
 {id:"marketing",name:"Marketing",description:"Haz crecer tu negocio con estrategia.",url:"/vista-app/marketing",Icon:ChartNoAxesCombined,className:"marketing"},
 {id:"ads",name:"Ads Studio",description:"Prepara y revisa tus campañas.",url:"/vista-app/marketing/ads",Icon:Megaphone,className:"ads"},
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
 const reload=useCallback(async(sb:SupabaseClient)=>{
  setError("");
  const identity=await sb.auth.getUser();
  if(identity.error||!identity.data.user||identity.data.user.is_anonymous){
   setProfile(null);setUser(null);setState("guest");return;
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
  if(value==="services"||value==="home"||value==="account")setTab(value);
  if(params.get("returnTo")==="web-studio"&&state==="ready")router.replace("/web-studio");
  if(params.get("returnTo")==="marketing"&&state==="ready")router.replace("/vista-app/marketing");
 },[params,router,state]);
 const filtered=useMemo(()=>services.filter(item=>(item.name+" "+item.description).toLowerCase().includes(search.toLowerCase().trim())),[search]);
 const open=(id:string)=>{
  if(id==="web"){setTab("services");setWebView(true);return;}
  const href=services.find(s=>s.id===id)?.url;
  if(href)router.push(href);
 };
 const nav=(next:Tab)=>{setTab(next);setWebView(false);setError("");};
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
 return <main className={homeStyles.stage}>
  <header className={homeStyles.pageHeader}>
   <a href="/" className={homeStyles.wordmark}>VMV<span> BUSINESS</span></a>
   <span className={homeStyles.previewTag}>VMV BUSINESS · V1 PREVIEW</span>
   <a href="/vista-app/video-studio" className={homeStyles.webLink}>{L("Video Studio","Video Studio")} <ArrowUpRight size={15}/></a>
  </header>
  <div className={homeStyles.layout}>
   <aside className={homeStyles.intro}>
    <span className={homeStyles.kicker}>VMV BUSINESS</span>
    <h1>{L("Tu negocio.","Your business.")}<br/><em>{L("En tu bolsillo.","In your pocket.")}</em></h1>
    <p>{L("Todo tu negocio, en un solo lugar. Herramientas, servicios e inteligencia artificial para emprendedores.","Your whole business in one place. Tools, services and AI for entrepreneurs.")}</p>
   </aside>
   <div className={homeStyles.phoneFrame}>
    <div className={homeStyles.device}>
     <div className={homeStyles.statusBar}><span>VMV</span><div className={homeStyles.dynamicIsland}/><span>◢ ▰</span></div>
     <div className={tab==="home"?homeStyles.homeTopHidden:homeStyles.appTop}>
      <div className={homeStyles.appLogo}><span className={homeStyles.mark}>▥</span><b>VMV<span> BUSINESS</span></b></div>
      <div className={styles.topActions}><InterfaceLanguagePicker compact/></div>
      <button type="button" onClick={()=>nav("account")} aria-label={L("Mi cuenta","My account")}><UserRound size={18}/></button>
     </div>
     <div className={homeStyles.scrollArea}>
      {tab==="home"?<div className={homeStyles.screen+" "+homeStyles.homeV2+" "+homeStyles.homeConcept} data-vmv-shortcut-scope="home">
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
         <button type="button" className={homeStyles.homeGrowStart} onClick={()=>nav("services")}>{L("Comenzar","Get started")} <ArrowUpRight size={18}/></button>
        </div>
        <div className={homeStyles.homeRocketArt} aria-hidden="true"><span className={homeStyles.homeRocketHalo}/><Rocket size={104} strokeWidth={1.35}/><span className={homeStyles.homeRocketCloud}/></div>
       </section>
       <div className={homeStyles.homeServiceTiles}>
        <button type="button" className={homeStyles.homeTilePink} data-vmv-shortcut-id="web" onClick={()=>open("web")}><Globe size={31}/><strong>Web Services</strong></button>
        <button type="button" className={homeStyles.homeTileLavender} data-vmv-shortcut-id="ai-agents" onClick={()=>open("agents")}><Bot size={31}/><strong>AI Agents</strong></button>
        <button type="button" className={homeStyles.homeTileMint} data-vmv-shortcut-id="agent-video" onClick={()=>open("video")}><Clapperboard size={31}/><strong>Video Studio</strong></button>
        <button type="button" className={homeStyles.homeTileLavender} data-vmv-shortcut-id="agent-quote" onClick={()=>open("quote")}><FileText size={31}/><strong>Smart Quote</strong></button>
        <button type="button" className={homeStyles.homeTileGreen} data-vmv-shortcut-id="marketing" onClick={()=>open("marketing")}><ChartNoAxesCombined size={31}/><strong>Marketing</strong></button>
        <button type="button" className={homeStyles.homeTilePink} data-vmv-shortcut-id="ads" onClick={()=>open("ads")}><Megaphone size={31}/><strong>Ads Studio</strong></button>
       </div>
       <section className={homeStyles.homeBusinessArea}>
        <h3>{L("Mi Negocio","My Business")}</h3>
        <button type="button" className={homeStyles.homeSummaryCard} data-vmv-shortcut-id="account" onClick={()=>nav("account")}>
         <span className={homeStyles.homeSummaryIcon}><TrendingUp size={24}/></span>
         <span><strong>{L("Resumen","Overview")}</strong><small>{L("Actividad y resultados","Activity and results")}</small></span>
         <ChevronLeft size={21} className={homeStyles.homeSummaryChevron} aria-hidden="true"/>
        </button>
       </section>
      </div>:null}
      {tab==="services"&&webView&&user?<section className={styles.webHost}>
       <button className={homeStyles.back} onClick={()=>setWebView(false)}><ChevronLeft size={18}/>{L("Todos los servicios","All services")}</button>
       <BusinessServicesPreview userId={user.id} focus="web"/>
      </section>:null}
      {tab==="services"&&!webView?<section className={styles.catalog}>
       <span className={styles.overline}>{L("CATÁLOGO V1","V1 CATALOG")}</span><h1>{L("Nuestros servicios","Our services")}</h1>
       <label className={styles.search}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={L("Buscar servicio","Search services")}/></label>
       <div className={styles.grid}>{filtered.map(s=><button key={s.id} className={styles.service+" "+styles[s.className]} onClick={()=>open(s.id)}><span className={styles.serviceIcon}><s.Icon size={23}/></span><strong>{s.name}</strong><small>{en?EN[s.description]:s.description}</small><ArrowUpRight size={16} className={styles.serviceArrow}/></button>)}</div>
       {!filtered.length?<p className={styles.empty}>{L("Sin resultados.","No results.")}</p>:null}
      </section>:null}
      {tab==="account"?<section className={styles.account}>
       <span className={styles.overline}>{L("CONFIGURACIÓN","SETTINGS")}</span><h1>{L("Mi cuenta","My account")}</h1>
       <div className={styles.accountCard}><div className={styles.avatar}><UserRound size={26}/></div><strong>{[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||L("Mi perfil","My profile")}</strong><small>{user?.email}</small></div>
       <div className={styles.accountCard}><label>{L("Nombre de tu negocio","Business name")}</label>
        {editing?<><input value={businessName} onChange={e=>setBusinessName(e.target.value)} maxLength={120}/><div className={styles.inline}>
         <button disabled={saving||!businessName.trim()} onClick={()=>void save()} className={styles.mainButton}>{saving?L("Guardando…","Saving…"):L("Guardar","Save")}</button>
         <button className={styles.softButton} onClick={()=>{setEditing(false);setBusinessName(profile?.business_name||"")}}>{L("Cancelar","Cancel")}</button></div></>:<div className={styles.inline}><strong>{profile?.business_name||L("Sin nombre","Not set")}</strong><button onClick={()=>setEditing(true)} className={styles.softButton}>{L("Editar","Edit")}</button></div>}
       </div><div className={styles.accountCard}><p>{L("Tus proyectos y trabajos se guardan en los servicios correspondientes.","Your projects are saved in their respective services.")}</p><Link href="/vista-app/soporte">{L("Contactar soporte","Contact support")} <ArrowUpRight size={15}/></Link></div>
       <button className={styles.logout} onClick={()=>client&&void client.auth.signOut()}><LogOut size={17}/>{L("Cerrar sesión","Sign out")}</button>
      </section>:null}
      {error?<p className={styles.error} role="alert">{error}</p>:null}
     </div>
     <nav className={homeStyles.bottomNav} aria-label={L("Navegación principal","Main navigation")}>
      {([{id:"home",name:L("Inicio","Home"),Icon:Home},{id:"services",name:L("Servicios","Services"),Icon:LayoutGrid},{id:"account",name:L("Cuenta","Account"),Icon:UserRound}] as const).map(item=>
       <button type="button" key={item.id} className={tab===item.id?homeStyles.activeNav:""} aria-pressed={tab===item.id} onClick={()=>nav(item.id)}><span><item.Icon size={22}/></span><small>{item.name}</small></button>)}
     </nav>
    </div>
   </div>
  </div>
 </main>;
}
