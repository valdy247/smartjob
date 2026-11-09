"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,AudioLines,BookUser,ChevronRight,Clock3,CreditCard,Headphones,History,House,Languages,LockKeyhole,LogOut,Mic2,Phone,PhoneCall,ShieldCheck,SlidersHorizontal,Sparkles,Wallet} from "lucide-react";
import type {Profile} from "@/lib/types";
import {Brand} from "./Brand";
import {CallsPanel} from "./CallsPanel";
import {LivePanel} from "./LivePanel";
import {SettingsPanel} from "./SettingsPanel";
import {BillingPanel} from "./BillingPanel";

type Tab="home"|"calls"|"live"|"settings";
type SettingsView="menu"|"profile"|"numbers"|"billing"|"history"|"security"|"style"|"support"|"services";
type AccountOverview={verified:boolean;connectedToApp:boolean;forwardingReady:boolean;twilioPhone:string|null;publicPhone:string|null;usage:{calls:number;completed:number;minutes:number}};
type PlanOverview={plan:string;status:string;minutes:{available:number;used:number;included:number}};
const NAV=[{key:"home" as const,title:"Inicio",icon:"🏠",Icon:House},{key:"calls" as const,title:"Llamadas",icon:"📞",Icon:Phone},{key:"live" as const,title:"Traductor",icon:"🎙️",Icon:Languages},{key:"settings" as const,title:"Ajustes",icon:"⚙️",Icon:SlidersHorizontal}];

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
 const changeTab=(next:Tab)=>{setTab(next);if(next==="settings")setSettingsView("menu");window.scrollTo({top:0,behavior:"auto"});};
 const goSettings=(next:SettingsView)=>{setTab("settings");setSettingsView(next);window.scrollTo({top:0,behavior:"auto"});};
 const entries:{title:string;items:{id:SettingsView;label:string;desc:string;Icon:typeof House}[]}[]=[
  {title:"CUENTA",items:[{id:"profile",label:"Mi perfil",desc:"",Icon:BookUser},{id:"security",label:"Seguridad",desc:"",Icon:LockKeyhole}]},
  {title:"LLAMADAS",items:[{id:"numbers",label:"Números y verificación",desc:"",Icon:PhoneCall},{id:"history",label:"Historial",desc:"",Icon:History}]},
  {title:"PAGOS",items:[{id:"billing",label:"Plan y pagos",desc:"",Icon:CreditCard}]},
  {title:"MÁS",items:[{id:"style",label:"Idiomas, voz y estilo",desc:"",Icon:Languages},{id:"services",label:"Otros servicios",desc:"",Icon:Sparkles},{id:"support",label:"Soporte",desc:"",Icon:Headphones}]}
 ];
 return <div className="vmv-app-shell">
  <header className="vmv-topbar"><button type="button" onClick={()=>changeTab("home")} className="vmv-logo-button"><Brand/></button><button type="button" className="vmv-profile-circle" aria-label="Abrir ajustes" onClick={()=>goSettings("menu")}>{profile.first_name.slice(0,1).toUpperCase()}</button></header>
  <main className="vmv-main">
   {tab==="home"&&<div className="vmv-home">
    <p className="vmv-eyebrow">TU ESPACIO</p><h1 className="vmv-title">Hola, {profile.first_name}<span className="vmv-accent">.</span></h1>
    <div className="vmv-hero-card">
     <div className="vmv-between"><span className="vmv-small-label"><PhoneCall size={16}/> Mi línea</span><span className={"vmv-tag "+(overview?.connectedToApp?"is-live":"is-pending")}>{overview?.connectedToApp?"Conectada":"Pendiente"}</span></div>
     <div className="vmv-hero-value">{overview?.publicPhone||overview?.twilioPhone||"VMV Call"}</div>
     <div className="vmv-hero-caption">{overview?.connectedToApp?"iPhone configurado":"Configura tu recepción"}</div>
     <button className="vmv-big-cta" onClick={()=>goSettings("numbers")}>{overview?.connectedToApp?"Administrar línea":"Configurar mi línea"} <ArrowRight size={18}/></button>
    </div>
    <h2 className="vmv-section-title">Idiomas <button onClick={()=>changeTab("live")} aria-label="Abrir traductor"><ChevronRight size={18}/></button></h2>
    <div className="vmv-language-pair"><div><b>{(profile.owner_language||"es").toUpperCase()}</b><small>Tu idioma</small></div><span>⇄</span><div><b>{(profile.customer_language||"en").toUpperCase()}</b><small>Cliente</small></div></div>
    <div className="vmv-summary-grid">
     <button onClick={()=>goSettings("billing")} className="vmv-summary-card"><Wallet size={21}/><b>{plan?plan.minutes.available:"—"}</b><small>Minutos</small></button>
     <button onClick={()=>goSettings("history")} className="vmv-summary-card"><Clock3 size={21}/><b>{overview?overview.usage.calls:"—"}</b><small>Llamadas · 30 días</small></button>
    </div>
    <div className="vmv-quick-actions"><button onClick={()=>changeTab("calls")}><Phone size={18}/> Llamadas</button><button onClick={()=>changeTab("live")}><Mic2 size={18}/> Traducir</button></div>
   
   </div>}
   {tab==="calls"&&<div className="vmv-context"><div className="vmv-view-heading"><p className="vmv-eyebrow">TELÉFONO</p><h1 className="vmv-title">Llamadas<span className="vmv-accent">.</span></h1></div><CallsPanel mode="dial" onNavigate={goSettings} profile={profile} supabase={supabase} apiStatus={status}/></div>}
   {tab==="live"&&<div className="vmv-context vmv-interpreter"><div className="vmv-view-heading"><p className="vmv-eyebrow">CARA A CARA</p><h1 className="vmv-title">Traductor<span className="vmv-accent">.</span></h1></div><LivePanel profile={profile} supabase={supabase} apiStatus={status}/></div>}
   {tab==="settings"&&<div className="vmv-settings">
    {settingsView==="menu"?<><p className="vmv-eyebrow">PREFERENCIAS</p><h1 className="vmv-title">Ajustes<span className="vmv-accent">.</span></h1>
     {entries.map(section=><section key={section.title} className="vmv-settings-section"><h2>{section.title}</h2><div className="vmv-settings-list">{section.items.map(entry=><button key={entry.id} onClick={()=>setSettingsView(entry.id)} className="vmv-settings-row"><span className="vmv-settings-icon"><entry.Icon size={19}/></span><span className="vmv-settings-copy"><b>{entry.label}</b>{entry.desc&&<small>{entry.desc}</small>}</span><ChevronRight size={19}/></button>)}</div></section>)}
     <button className="vmv-logout" onClick={onLogout}><LogOut size={17}/> Cerrar sesión</button>
    </>:<>
     <button className="vmv-back" onClick={()=>setSettingsView("menu")}><ArrowLeft size={18}/> Ajustes</button>
     <h1 className="vmv-subtitle">{({profile:"Mi perfil",numbers:"Mi línea",billing:"Plan y pagos",history:"Historial",security:"Seguridad",style:"Personalización",support:"Soporte",services:"Otros servicios",menu:"Ajustes"} as Record<SettingsView,string>)[settingsView]}</h1>
     {settingsView==="profile"&&<SettingsPanel key={profile.id} profile={profile} supabase={supabase} onChange={onProfile} status={status} onLogout={onLogout}/>}
     {settingsView==="numbers"&&<CallsPanel profile={profile} supabase={supabase} apiStatus={status}/>}
     {settingsView==="billing"&&<BillingPanel supabase={supabase} userId={profile.id}/>}
     {settingsView==="history"&&<CallsPanel mode="history" profile={profile} supabase={supabase} apiStatus={status}/>}
     {settingsView==="security"&&<section className="vmv-compact-card"><ShieldCheck size={26}/><h2>Acceso seguro</h2><p className="vmv-muted">Protege tus códigos y contraseña.</p><button className="vmv-secondary-cta" onClick={onLogout}>Cerrar sesión</button></section>}
     {settingsView==="style"&&<section className="vmv-compact-card"><Languages size={26}/><h2>Idiomas y voces</h2><p className="vmv-muted">{profile.owner_language.toUpperCase()} ⇄ {profile.customer_language.toUpperCase()}</p><button className="vmv-secondary-cta" onClick={()=>setSettingsView("profile")}>Cambiar idiomas</button><button className="vmv-secondary-cta" onClick={()=>setSettingsView("billing")}>Configurar voces y saludos</button><a className="vmv-secondary-cta" style={{textAlign:"center",textDecoration:"none"}} href="/vista-llamada">Ver pantalla de llamada entrante ↗</a></section>}
     {settingsView==="support"&&<section className="vmv-compact-card"><Headphones size={26}/><h2>Centro de ayuda</h2><p className="vmv-muted">Si una llamada no conecta, revisa la verificación y el registro de voz en la app del iPhone.</p><button className="vmv-secondary-cta" onClick={()=>setSettingsView("numbers")}>Ver mi línea</button></section>}
     {settingsView==="services"&&<section className="vmv-compact-card"><Sparkles size={26}/><h2>Más herramientas</h2><p className="vmv-muted">Intérprete en persona y asistente privado disponibles en Traductor.</p><button className="vmv-secondary-cta" onClick={()=>changeTab("live")}>Abrir traductor</button></section>}
    </>}
   </div>}
  </main>
  <nav className="vmv-dock" aria-label="Navegación principal">{NAV.map(item=><button type="button" key={item.key} className={"vmv-dock-item "+(tab===item.key?"selected":"")} onClick={()=>changeTab(item.key)} aria-current={tab===item.key?"page":undefined} aria-label={item.title}><span className="vmv-dock-orb" aria-hidden="true">{item.icon}</span><span className="vmv-dock-caption">{item.title}</span></button>)}</nav>
 </div>;
}
