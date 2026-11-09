"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getSupabase} from "@/lib/supabase";
import {SignupWizard} from "@/components/SignupWizard";
export default function RegisterPage(){
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{setClient(getSupabase());setReady(true);},[]);
 if(!ready)return <main className="vmv-signup-shell" aria-busy="true"/>;
 if(!client)return <main className="vmv-signup-shell"><section className="vmv-signup-finish">
  <h1>Registro temporalmente no disponible</h1>
  <p>La conexión de cuentas no está configurada.</p>
  <a href="/" className="vmv-signup-mainbtn">Volver</a>
 </section></main>;
 return <SignupWizard supabase={client} onBack={()=>{window.location.assign("/");}}/>;
}
