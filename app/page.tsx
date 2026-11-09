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
import VMVWorkspace from "@/components/VMVWorkspace";
type Tab="live"|"calls"|"settings";
const blankStatus:Record<string,boolean>={auth:false,ai:false,speech:false,voices:false,telephone:false};
export default function Home(){
  const [splash,setSplash]=useState(true),[supabase,setSupabase]=useState<SupabaseClient|null>(null);
  const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null);
  const [starting,setStarting]=useState(true),[checkingProfile,setCheckingProfile]=useState(true);
  const [status,setStatus]=useState<Record<string,boolean>>(blankStatus);
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
    let alive=true;
    const currentUser=user;
    setCheckingProfile(true);
    // Signup already collected the professional's details. Persist them once after
    // confirmation/login rather than sending the user through a duplicate form.
    async function loadOrCreateProfile(){
      const {data:existing,error:lookupError}=await supabase!.from("smartjob_profiles")
        .select("*").eq("id",currentUser.id).maybeSingle();
      if(!alive)return;
      if(existing){setProfile(existing as Profile);setCheckingProfile(false);return;}
      if(lookupError){
        console.error("VMV Call profile lookup",lookupError.message);
        setProfile(null);setCheckingProfile(false);return;
      }
      const metadata=currentUser.user_metadata||{};
      const first=String(metadata.first_name||"").trim();
      const last=String(metadata.last_name||"").trim();
      const phone=String(metadata.phone||"").trim();
      const occupation=String(metadata.occupation||"").trim();
      if(first&&last&&phone&&occupation){
        const initial:Profile={
          id:currentUser.id,first_name:first,last_name:last,phone,occupation,
          city:String(metadata.city||"").trim(),state:String(metadata.state||"").trim(),
          country:String(metadata.country||"US").slice(0,2).toUpperCase(),assistant_name:String(metadata.assistant_name||"Juan").trim()||"Juan",
          owner_language:String(metadata.owner_language||"es"),
          customer_language:String(metadata.customer_language||"en"),
          // Store wizard choices only in the account holder's own profile (RLS enforced).
          account_type:metadata.account_type==="personal"?"personal":"business",
          occupation_code:String(metadata.occupation_code||"").slice(0,24)||null,
          use_case:String(metadata.use_case||"").slice(0,50)||null,
          business_name:String(metadata.business_name||"").trim().slice(0,120)||null,
          website_url:String(metadata.website_url||"").trim().slice(0,250)||null,
          theme_color:metadata.theme_color==="blue"||metadata.theme_color==="violet"?metadata.theme_color:"mint",
          font_scale:metadata.font_scale==="small"||metadata.font_scale==="large"?metadata.font_scale:"normal",
          appearance:metadata.appearance==="dark"||metadata.appearance==="system"?metadata.appearance:"light",
          reduce_motion:metadata.reduce_motion===true
        };
        const {data:created,error:creationError}=await supabase!.from("smartjob_profiles")
          .upsert(initial,{onConflict:"id",ignoreDuplicates:true}).select("*").maybeSingle();
        if(!alive)return;
        if(creationError)console.error("VMV Call profile creation",creationError.message);
        if(created){setProfile(created as Profile);setCheckingProfile(false);return;}
        // If another tab inserted the profile concurrently, read it without overwriting.
        const {data:concurrent}=await supabase!.from("smartjob_profiles")
          .select("*").eq("id",currentUser.id).maybeSingle();
        if(!alive)return;
        setProfile((concurrent as Profile|null)||null);
      }else{
        // Legacy/shared-auth identities missing registration data use onboarding once.
        setProfile(null);
      }
      if(alive)setCheckingProfile(false);
    }
    void loadOrCreateProfile();
    return()=>{alive=false;};
  },[supabase,user?.id]);
  // A verified SMS may predate the email-confirmation login. Redeem its short-lived
  // one-time proof only after a real authenticated session exists.
  useEffect(()=>{
    if(!supabase||!user)return;
    let cancelled=false;
    const claim=async()=>{
      let pending:{phone?:string;ticket?:string;createdAt?:number;email?:string};
      try{
        const raw=localStorage.getItem("vmv_signup_verified_phone");
        if(!raw)return;
        pending=JSON.parse(raw);
        if(!pending||typeof pending!=="object")return;
        if(typeof pending.createdAt!=="number"||Date.now()-pending.createdAt>7*86400000){
          localStorage.removeItem("vmv_signup_verified_phone");return;
        }
        // Never send one signup's phone attestation as another account.
        if(pending.email?.toLowerCase()!==user.email?.toLowerCase())return;
        if(pending.phone!==user.user_metadata?.phone||!pending.ticket)return;
      }catch{return;}
      const {data}=await supabase.auth.getSession();
      if(cancelled||!data.session)return;
      try{
        const res=await fetch("/api/signup/phone/claim",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
          body:JSON.stringify({phone:pending.phone,ticket:pending.ticket})
        });
        if(!cancelled&&(res.ok||res.status===409)){
          localStorage.removeItem("vmv_signup_verified_phone");
        }
      }catch{ /* Keep the one-time token until it expires or can be claimed. */ }
    };
    void claim();
    return()=>{cancelled=true;};
  },[supabase,user?.id]);
  const signout=async()=>{await supabase?.auth.signOut();};
  if(splash||starting||checkingProfile)return <div className="splash"><div className="splash-inner"><span className="brandmark"><Headphones size={46} strokeWidth={2.3}/></span><h1>VMV<span style={{color:"var(--lime)"}}> Call</span></h1><p className="eyebrow" style={{color:"#b1c2b0"}}>Habla sin fronteras.</p><div className="splash-track"/></div></div>;
  if(!supabase)return <main className="shell" style={{maxWidth:690,paddingTop:45}}><Brand/><div className="card" style={{marginTop:50}}><h1>Configura VMV Call</h1><p className="muted">Para crear cuentas necesitamos conectar el proyecto Supabase con las variables públicas de Vercel. El diseño está listo pero el acceso no está habilitado.</p><code>NEXT_PUBLIC_SUPABASE_URL</code><br/><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></div></main>;
  if(!user)return <AuthPanel supabase={supabase}/>;
  if(passwordRecovery)return <div className="shell" style={{maxWidth:520,paddingTop:55}}><Brand/><form className="card" style={{marginTop:40}} onSubmit={async e=>{e.preventDefault();const r=await supabase.auth.updateUser({password});setPasswordMsg(r.error?.message||"Contraseña actualizada.");if(!r.error){setPasswordRecovery(false);setPassword("");}}}><h1>Nueva contraseña</h1><p className="muted">Crea una contraseña segura para tu cuenta de VMV Call.</p><input className="field" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="submit" className="btn primary block" style={{marginTop:16}}>Guardar contraseña</button>{passwordMsg&&<p className="small">{passwordMsg}</p>}</form></div>;
  if(!profile)return <Onboarding user={user} supabase={supabase} onSaved={setProfile}/>;
  return <VMVWorkspace profile={profile} supabase={supabase} status={status} onProfile={setProfile} onLogout={()=>void signout()}/>;
}
