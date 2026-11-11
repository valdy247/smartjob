"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,BookUser,ChevronRight,CreditCard,Headphones,History,House,Languages,LockKeyhole,LogOut,Phone,PhoneCall,ShieldCheck,SlidersHorizontal,Sparkles} from "lucide-react";
import type {Profile} from "@/lib/types";
import {Brand} from "./Brand";
import {CallsPanel} from "./CallsPanel";
import {LivePanel} from "./LivePanel";
import {SettingsPanel} from "./SettingsPanel";
import {BillingPanel} from "./BillingPanel";
import {VMVImageSlot} from "./VMVImageSlot";

type Tab="home"|"calls"|"live"|"settings";
type SettingsView="menu"|"profile"|"numbers"|"billing"|"history"|"security"|"style"|"support"|"services";
type AccountOverview={verified:boolean;connectedToApp:boolean;forwardingReady:boolean;twilioPhone:string|null;publicPhone:string|null;usage:{calls:number;completed:number;minutes:number}};
type PlanOverview={plan:string;status:string;minutes:{available:number;used:number;included:number}};
const NAV=[{key:"home" as const,title:"Inicio",Icon:House},{key:"calls" as const,title:"Llamadas",Icon:Phone},{key:"live" as const,title:"Traductor",Icon:Languages},{key:"settings" as const,title:"Ajustes",Icon:SlidersHorizontal}];
export default function VMVWorkspace({profile,supabase,status,onProfile,onLogout}:{profile:Profile;supabase:SupabaseClient;status:Record<string,boolean>;onProfile:(p:Profile)=>void;onLogout:()=>void}){
 const [tab,setTab]=useState<Tab>("home");
 const [settingsView,setSettingsView]=useState<SettingsView>("menu");
 const [overview,setOverview]=useState<AccountOverview|null>(null);
 const [plan,setPlan]=useState<PlanOverview|null>(null);
 
 const load=async()=>{

  try{
   const {data}=await supabase.auth.getSession();
   if(!data.session)return;
   const headers={Authorization:"Bearer "+data.session.access_token};
   const [a,b]=await Promise.allSettled([
    fetch("/api/ios/account-overview",{headers,cache:"no-store"}),
    fetch("/api/billing/overview",{headers,cache:"no-store"})
   ]);
   if(a.status==="fulfilled"&&a.value.ok)setOverview(await a.value.json() as AccountOverview);
   if(b.status==="fulfilled"&&b.value.ok)setPlan(await b.value.json() as PlanOverview);
  }catch{}
 };
 useEffect(()=>{void load();},[profile.id]);
 const startPlanSetup=async(plan:"starter"|"pro"|"premium")=>{
  const {data,error}=await supabase.from("smartjob_profiles").update({
    preferred_plan:plan,plan_prompt_seen:false,line_setup_completed:false,updated_at:new Date().toISOString()
  }).eq("id",profile.id).select("*").single();
  if(!error&&data)onProfile(data as Profile);
 };
 const changeTab=(next:Tab)=>{setTab(next);if(next==="settings")setSettingsView("menu");window.scrollTo({top:0,behavior:"auto"});};
 const goSettings=(next:SettingsView)=>{setTab("settings");setSettingsView(next);window.scrollTo({top:0,behavior:"auto"});};
 const entries:{title:string;items:{id:SettingsView;label:string;desc:string;Icon:typeof House}[]}[]=[
  {title:"CUENTA",items:[{id:"profile",label:"Mi perfil",desc:"",Icon:BookUser},{id:"security",label:"Seguridad",desc:"",Icon:LockKeyhole}]},
  {title:"LLAMADAS",items:[{id:"numbers",label:"Números y verificación",desc:"",Icon:PhoneCall},{id:"history",label:"Historial",desc:"",Icon:History}]},
  {title:"PAGOS",items:[{id:"billing",label:"Plan y pagos",desc:"",Icon:CreditCard}]},
  {title:"MÁS",items:[{id:"style",label:"Idiomas y asistente",desc:"",Icon:Languages},{id:"services",label:"Otros servicios",desc:"",Icon:Sparkles},{id:"support",label:"Soporte",desc:"",Icon:Headphones}]}
 ];
 return <div className="vmv-app-shell">
  <header className="vmv-topbar"><button type="button" onClick={()=>changeTab("home")} className="vmv-logo-button"><Brand/></button><button type="button" className="vmv-profile-circle" aria-label="Abrir ajustes" onClick={()=>goSettings("menu")}>{profile.first_name.slice(0,1).toUpperCase()}</button></header>
  <main className="vmv-main">
   {tab==="home"&&<div className="vmv-home">
    <div className="vmv-home-intro">
     <p className="vmv-eyebrow">TU ESPACIO</p>
     <h1 className="vmv-title">Hola, {profile.first_name}<span className="vmv-accent">.</span></h1>
     <p className="vmv-home-subtitle">Traducción en tiempo real</p>
    </div>

    <section className="vmv-feature-card vmv-feature-call vmv-feature-call-illustrated" aria-label="Llamadas traducidas">
     <VMVImageSlot slot="imagen-1" className="vmv-feature-artwork"/>
     <button type="button" className="vmv-feature-button vmv-feature-button-call" onClick={()=>changeTab("calls")} aria-label="Abrir llamadas traducidas">
      <Phone size={21} strokeWidth={2.4}/><span>Llamadas traducidas</span><ArrowRight size={21}/>
     </button>
    </section>

    <section className="vmv-feature-card vmv-feature-translate vmv-feature-person-illustrated" aria-label="Traducción en persona">
     <VMVImageSlot slot="imagen-2" className="vmv-feature-artwork"/>
     <button type="button" className="vmv-feature-button vmv-feature-button-translator" onClick={()=>changeTab("live")} aria-label="Abrir traducción en persona">
      <Languages size={21} strokeWidth={2.3}/><span>Traducción en persona</span><ArrowRight size={21}/>
     </button>
    </section>

   </div>}
   {tab==="calls"&&<div className="vmv-context"><div className="vmv-view-heading"><p className="vmv-eyebrow">TELÉFONO</p><h1 className="vmv-title">Llamadas<span className="vmv-accent">.</span></h1></div><CallsPanel mode="dial" onNavigate={goSettings} profile={profile} supabase={supabase} apiStatus={status}/></div>}
   {tab==="live"&&<div className="vmv-context vmv-interpreter"><div className="vmv-view-heading"><p className="vmv-eyebrow">CARA A CARA</p><h1 className="vmv-title">Traductor<span className="vmv-accent">.</span></h1></div><LivePanel profile={profile} supabase={supabase} apiStatus={status}/></div>}
   {tab==="settings"&&<div className="vmv-settings">
    {settingsView==="menu"?<><p className="vmv-eyebrow">PREFERENCIAS</p><h1 className="vmv-title">Ajustes<span className="vmv-accent">.</span></h1>
     {entries.map(section=><section key={section.title} className="vmv-settings-section"><h2>{section.title}</h2><div className="vmv-settings-list">{section.items.map(entry=><button key={entry.id} onClick={()=>setSettingsView(entry.id)} className="vmv-settings-row"><span className="vmv-settings-icon"><entry.Icon size={19}/></span><span className="vmv-settings-copy"><b>{entry.label}</b>{entry.desc&&<small>{entry.desc}</small>}</span><ChevronRight size={19}/></button>)}</div></section>)}
     <button className="vmv-logout" onClick={onLogout}><LogOut size={17}/> Cerrar sesión</button>
    </>:<>
     <button className="vmv-back" onClick={()=>setSettingsView("menu")}><ArrowLeft size={18}/> Ajustes</button>
     <h1 className="vmv-subtitle">{({profile:"Mi perfil",numbers:"Mi línea",billing:"Plan y pagos",history:"Historial",security:"Seguridad",style:"Idiomas y asistente",support:"Soporte",services:"Otros servicios",menu:"Ajustes"} as Record<SettingsView,string>)[settingsView]}</h1>
     {settingsView==="profile"&&<SettingsPanel key={profile.id} profile={profile} supabase={supabase} onChange={onProfile} status={status} onLogout={onLogout}/>}
     {settingsView==="numbers"&&<CallsPanel mode="numbers" profile={profile} supabase={supabase} apiStatus={status}/>}
     {settingsView==="billing"&&<BillingPanel supabase={supabase} userId={profile.id} onChoosePlan={plan=>void startPlanSetup(plan)}/>}
     {settingsView==="history"&&<CallsPanel mode="history" profile={profile} supabase={supabase} apiStatus={status}/>}
     {settingsView==="security"&&<section className="vmv-compact-card"><ShieldCheck size={26}/><h2>Acceso seguro</h2><p className="vmv-muted">Protege tus códigos y contraseña.</p><button className="vmv-secondary-cta" onClick={onLogout}>Cerrar sesión</button></section>}
     {settingsView==="style"&&<><CallsPanel mode="preferences" profile={profile} supabase={supabase} apiStatus={status}/><BillingPanel mode="greetings" supabase={supabase} userId={profile.id}/></>}
     {settingsView==="support"&&<section className="vmv-compact-card"><Headphones size={26}/><h2>Centro de ayuda</h2><p className="vmv-muted">Si una llamada no conecta, revisa la verificación y el registro de voz en la app del iPhone.</p><button className="vmv-secondary-cta" onClick={()=>setSettingsView("numbers")}>Ver mi línea</button></section>}
     {settingsView==="services"&&<section className="vmv-compact-card"><Sparkles size={26}/><h2>VMV Business</h2><p className="vmv-muted">Tus servicios pueden gestionarse desde la web de VMV Business. El panel utiliza tu misma cuenta Supabase; el navegador puede pedirte iniciar sesión de nuevo.</p><a className="vmv-secondary-cta" href="https://vmv-business-design.vercel.app/es/workspace/?service=smart-call">Abrir administración web ↗</a><p className="vmv-muted" style={{marginTop:16}}>Las llamadas y el intérprete siguen disponibles aquí.</p><button className="vmv-secondary-cta" onClick={()=>changeTab("live")}>Abrir traductor</button></section>}
    </>}
   </div>}
  </main>
  <nav className="vmv-dock" aria-label="Navegación principal">{NAV.map(item=><button type="button" key={item.key} className={"vmv-dock-item "+(tab===item.key?"selected":"")} onClick={()=>changeTab(item.key)} aria-current={tab===item.key?"page":undefined} aria-label={item.title}><span className="vmv-dock-orb" aria-hidden="true"><item.Icon size={24} strokeWidth={2.1}/></span><span className="vmv-dock-caption">{item.title}</span></button>)}</nav>
 </div>;
}
