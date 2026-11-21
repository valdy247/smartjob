"use client";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getSupabase} from "@/lib/supabase";
import {SignupWizard} from "@/components/SignupWizard";
export default function RegisterPage(){
 const {translate:t}=useInterfaceLanguage();
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{setClient(getSupabase());setReady(true);},[]);
 if(!ready)return <main className="vmv-signup-shell" aria-busy="true"/>;
 if(!client)return <main className="vmv-signup-shell"><section className="vmv-signup-finish">
  <h1>{t("register.unavailable")}</h1>
  <p>{t("register.connection")}</p>
  <a href="/vista-app" className="vmv-signup-mainbtn">{t("interface.common.back")}</a>
 </section></main>;
 return <SignupWizard supabase={client} onBack={()=>{window.location.assign("/vista-app");}}/>;
}
