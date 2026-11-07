"use client";
import { useEffect,useState } from "react";
import type { SupabaseClient,User } from "@supabase/supabase-js";
import { ArrowLeft,Headphones,Languages,LoaderCircle,PhoneCall,Settings2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { Brand } from "@/components/Brand";
import { AuthPanel } from "@/components/AuthPanel";
import { Onboarding } from "@/components/Onboarding";
import { LivePanel } from "@/components/LivePanel";
import { CallsPanel } from "@/components/CallsPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
type Tab="live"|"calls"|"settings";
const blankStatus:Record<string,boolean>={auth:false,ai:false,speech:false,voices:false,telephone:false};
export default function Home(){
  const [splash,setSplash]=useState(true),[supabase,setSupabase]=useState<SupabaseClient|null>(null);
  const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null);
  const [starting,setStarting]=useState(true),[checkingProfile,setCheckingProfile]=useState(true);
  const [status,setStatus]=useState<Record<string,boolean>>(blankStatus),[tab,setTab]=useState<Tab>("live");
  const [passwordRecovery,setPasswordRecovery]=useState(false),[password,setPassword]=useState(""),[passwordMsg,setPasswordMsg]=useState("");
  useEffect(()=>{
    const timer=setTimeout(()=>setSplash(false),1850);
    const client=getSupabase();setSupabase(client);
    if(client){
      client.auth.getUser().then(({data})=>setUser(data.user??null)).finally(()=>setStarting(false));
      const {data}=client.auth.onAuthStateChange((event,session)=>{
        if(event==="PASSWORD_RECOVERY")setPasswordRecovery(true);
        if(event==="SIGNED_OUT"){setUser(null);setProfile(null);setPasswordRecovery(false);}
        else if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED"||event==="INITIAL_SESSION")setUser(session?.user??null);
      });
      fetch("/api/status").then(r=>r.json()).then(s=>setStatus(s)).catch(()=>{});
      return()=>{clearTimeout(timer);data.subscription.unsubscribe();};
    }
    setStarting(false);setCheckingProfile(false);
    fetch("/api/status").then(r=>r.json()).then(s=>setStatus(s)).catch(()=>{});
    return()=>clearTimeout(timer);
  },[]);
  useEffect(()=>{
    if(!supabase||!user){setProfile(null);setCheckingProfile(false);return;}
    let alive=true;setCheckingProfile(true);
    supabase.from("smartjob_profiles").select("*").eq("id",user.id).maybeSingle().then(({data,error})=>{
      if(!alive)return;
      if(error)console.error("Profile lookup",error.message);
      setProfile(data??null);setCheckingProfile(false);
    });return()=>{alive=false;};
  },[supabase,user?.id]);
  const signout=async()=>{await supabase?.auth.signOut();setTab("live");};
  if(splash||starting||checkingProfile)return <div className="splash"><div className="splash-inner"><span className="brandmark"><Headphones size={46} strokeWidth={2.3}/></span><h1>smart<span style={{color:"var(--lime)"}}>job</span></h1><p className="eyebrow" style={{color:"#b1c2b0"}}>Tu trabajo. Sin barreras.</p><div className="splash-track"/></div></div>;
  if(!supabase)return <main className="shell" style={{maxWidth:690,paddingTop:45}}><Brand/><div className="card" style={{marginTop:50}}><h1>Configura Smart Job</h1><p className="muted">Para crear cuentas necesitamos conectar el proyecto Supabase con las variables públicas de Vercel. El diseño está listo pero el acceso no está habilitado.</p><code>NEXT_PUBLIC_SUPABASE_URL</code><br/><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></div></main>;
  if(!user)return <AuthPanel supabase={supabase}/>;
  if(passwordRecovery)return <div className="shell" style={{maxWidth:520,paddingTop:55}}><Brand/><form className="card" style={{marginTop:40}} onSubmit={async e=>{e.preventDefault();const r=await supabase.auth.updateUser({password});setPasswordMsg(r.error?.message||"Contraseña actualizada.");if(!r.error){setPasswordRecovery(false);setPassword("");}}}><h1>Nueva contraseña</h1><p className="muted">Crea una contraseña segura para tu cuenta de Smart Job.</p><input className="field" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="submit" className="btn primary block" style={{marginTop:16}}>Guardar contraseña</button>{passwordMsg&&<p className="small">{passwordMsg}</p>}</form></div>;
  if(!profile)return <Onboarding user={user} supabase={supabase} onSaved={setProfile}/>;
  return <div className="shell">
    <header className="topbar">
      <button type="button" onClick={()=>setTab("live")} style={{background:"transparent",border:0,padding:0,color:"inherit"}}><Brand/></button>
      <nav className="topnav" aria-label="Menú principal">
        <button type="button" onClick={()=>setTab("calls")} className={"navitem "+(tab==="calls"?"active":"")}><PhoneCall size={17}/>Llamadas</button>
        <button type="button" onClick={()=>setTab("live")} className={"navitem "+(tab==="live"?"active":"")}><Languages size={17}/>Traductor Live</button>
      </nav>
      <div className="user-actions"><span className="small muted">Hola, {profile.first_name}</span><button aria-label="Configuración de perfil" title="Mi perfil" className="avatar" onClick={()=>setTab(tab==="settings"?"live":"settings")}>{tab==="settings"?<Settings2 size={18}/>:profile.first_name?.slice(0,1).toUpperCase()}</button></div>
    </header>
    <main>
      {tab==="live"&&<LivePanel profile={profile} supabase={supabase} apiStatus={status}/>}
      {tab==="calls"&&<CallsPanel profile={profile} supabase={supabase} apiStatus={status}/>}
      {tab==="settings"&&<SettingsPanel key={profile.id} profile={profile} supabase={supabase} onChange={setProfile} status={status} onLogout={()=>void signout()}/>}
    </main>
    <footer className="footer">Smart Job · AI Professional Assistant · Web MVP · 2026</footer>
    <nav className="mobile-nav" aria-label="Navegación móvil">
      <button onClick={()=>setTab("calls")} type="button" className={"navitem "+(tab==="calls"?"active":"")}><PhoneCall size={19}/>Llamadas</button>
      <button onClick={()=>setTab("live")} type="button" className={"navitem "+(tab==="live"?"active":"")}><Languages size={19}/>Traductor Live</button>
      <button onClick={()=>setTab("settings")} type="button" className={"navitem "+(tab==="settings"?"active":"")}><Settings2 size={19}/></button>
    </nav>
  </div>;
}
