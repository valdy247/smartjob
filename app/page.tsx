"use client";
import { useEffect,useState } from "react";
import type { SupabaseClient,User } from "@supabase/supabase-js";
import { ArrowLeft,Languages,LoaderCircle,PhoneCall,Settings2 } from "lucide-react";
import {initialAccountProfile} from "@/lib/account-profile";
import { getSupabase } from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type { Profile } from "@/lib/types";
import { Brand } from "@/components/Brand";
import { AuthPanel } from "@/components/AuthPanel";
import { Onboarding } from "@/components/Onboarding";
import { ActivationFlow } from "@/components/ActivationFlow";
import { LivePanel } from "@/components/LivePanel";
import { CallsPanel } from "@/components/CallsPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import VMVWorkspace from "@/components/VMVWorkspace";
type Tab="live"|"calls"|"settings";
const blankStatus:Record<string,boolean>={auth:false,ai:false,speech:false,voices:false,telephone:false};
export default function Home(){
  const {translate}=useInterfaceLanguage();
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
    setProfile(null);setCheckingProfile(true);
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
      const initial=initialAccountProfile(currentUser.id,currentUser.user_metadata||{});
      if(initial){
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
  useEffect(()=>{
    if(starting||checkingProfile||!user||profile?.id!==user.id||passwordRecovery)return;
    // Keep password-reset links on their original form, including before the
    // PASSWORD_RECOVERY event. Other signed-in root visits use the current Home.
    const query=new URLSearchParams(window.location.search);
    const fragment=new URLSearchParams(window.location.hash.slice(1));
    if(query.get("type")==="recovery"||fragment.get("type")==="recovery")return;
    window.location.replace("/vista-app");
  },[starting,checkingProfile,user?.id,profile?.id,passwordRecovery]);
  if(splash||starting||checkingProfile)return <div className="splash"><div className="splash-inner"><Brand/><p className="eyebrow" style={{color:"#b1c2b0"}}>{translate("auth.tagline")}</p><div className="splash-track"/></div></div>;
  if(!supabase)return <main className="shell" style={{maxWidth:690,paddingTop:45}}><Brand/><div className="card" style={{marginTop:50}}><h1>{translate("auth.setupTitle")}</h1><p className="muted">{translate("auth.setupHint")}</p><code>NEXT_PUBLIC_SUPABASE_URL</code><br/><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></div></main>;
  if(!user)return <AuthPanel supabase={supabase}/>;
  if(passwordRecovery)return <div className="shell" style={{maxWidth:520,paddingTop:55}}><Brand/><form className="card" style={{marginTop:40}} onSubmit={async e=>{e.preventDefault();const r=await supabase.auth.updateUser({password});setPasswordMsg(r.error?translate("common.saveError"):translate("auth.passwordUpdated"));if(!r.error){setPasswordRecovery(false);setPassword("");}}}><h1>{translate("auth.newPassword")}</h1><p className="muted">{translate("auth.newPasswordHint")}</p><input className="field" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="submit" className="btn primary block" style={{marginTop:16}}>{translate("auth.savePassword")}</button>{passwordMsg&&<p className="small">{passwordMsg}</p>}</form></div>;
  if(!profile||profile.id!==user.id)return <Onboarding user={user} supabase={supabase} onSaved={setProfile}/>;
  if(!profile.plan_prompt_seen)return <ActivationFlow profile={profile} supabase={supabase} onSaved={setProfile} onExit={()=>{}}/>;
  return <VMVWorkspace profile={profile} supabase={supabase} status={status} onProfile={setProfile} onLogout={()=>void signout()}/>;
}
