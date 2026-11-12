"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getSupabase} from "@/lib/supabase";
import {SignupWizard} from "@/components/SignupWizard";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function RegisterPage(){
 const {translate}=useInterfaceLanguage();
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{setClient(getSupabase());setReady(true);},[]);
 if(!ready)return <main className="vmv-signup-shell" aria-busy="true"/>;
 if(!client)return <main className="vmv-signup-shell"><section className="vmv-signup-finish">
  <h1>{translate("common.accessError")}</h1>
  <p>La conexión de cuentas no está configurada.</p>
  <a href="/" className="vmv-signup-mainbtn">{translate("common.back")}</a>
 </section></main>;
 return <SignupWizard supabase={client} onBack={()=>{window.location.assign("/");}}/>;
}
