"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Phone,Delete} from "lucide-react";
import styles from "./vista-app.module.css";

const keys=["1","2","3","4","5","6","7","8","9"] as const;
function normalize(input:string){
 const compact=input.trim().replace(/[\s().-]/g,"");
 if(!/^\+?[0-9]+$/.test(compact))return null;
 if(compact.length===10)return "+1"+compact;
 if(compact.length===11&&compact.startsWith("1"))return "+"+compact;
 if(/^\+1[0-9]{10}$/.test(compact))return compact;
 return null;
}
export default function DialPad({client,ownerId}:{client:SupabaseClient;ownerId:string}){
 const [phone,setPhone]=useState("");
 const [available,setAvailable]=useState(false);
 const [checking,setChecking]=useState(true);
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [isError,setIsError]=useState(false);
 useEffect(()=>{
  let mounted=true;
  void (async()=>{
   try{
    const {data:session}=await client.auth.getSession();
    if(session.session?.user.id!==ownerId)return;
    const response=await fetch("/api/vista-app/dial",{
     method:"GET",cache:"no-store",headers:{Authorization:"Bearer "+session.session.access_token}
    });
    const result=await response.json().catch(()=>null);
    if(mounted)setAvailable(response.ok&&result?.available===true);
   }catch{if(mounted)setAvailable(false);}
   finally{if(mounted)setChecking(false);}
  })();
  return()=>{mounted=false;};
 },[client,ownerId]);

 const formatted=normalize(phone);
 const add=(digit:string)=>{
  if(busy)return;
  setPhone(previous=>previous.length<20?previous+digit:previous);
  setNotice("");
 };
 async function startCall(){
  if(!client||!formatted||!available||busy)return;
  setConfirm(false);setBusy(true);setNotice("");setIsError(false);
  try{
   const {data:user,error:authError}=await client.auth.getUser();
   const {data:session}=await client.auth.getSession();
   if(authError||user.user?.id!==ownerId||
    !session.session||session.session.user.id!==ownerId)throw Error("Vuelve a iniciar sesión.");
   const response=await fetch("/api/vista-app/dial",{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+session.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({phone:formatted,mode:"direct"})
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||result?.started!==true){
    const messages:Record<string,string>={
     dialer_not_enabled:"Las llamadas salientes aún no están activadas.",
     us_phone_not_verified:"Introduce un número válido de Estados Unidos.",
     line_not_ready:"Tu línea VMV todavía no está lista.",
     active_plan_required:"Necesitas un plan Smart Call habilitado.",
     call_in_progress:"Ya tienes una llamada en curso.",
     dialer_rate_limited:"Has alcanzado el límite de llamadas de prueba.",
     twilio_unavailable:"No se pudo conectar con Twilio.",
     invalid_phone:"Revisa el número ingresado."
    };
    throw Error(messages[result?.error]||"No se pudo iniciar la llamada.");
   }
   setNotice("VMV está llamando a tu iPhone. Contesta para conectar.");
   setPhone("");
  }catch(e){
   setIsError(true);
   setNotice(e instanceof Error?e.message:"No se pudo iniciar la llamada.");
  }finally{setBusy(false);}
 }
 return <div className={styles.dialer} role="tabpanel" aria-label="Teclado para realizar llamadas">
  <div className={styles.dialerNumber}>
   <input type="tel" inputMode="tel" autoComplete="tel" aria-label="Número de teléfono"
    value={phone} onChange={event=>{setPhone(event.target.value.slice(0,20));setNotice("");}}
    placeholder="+1 (000) 000-0000" disabled={busy} maxLength={20}/>
  </div>
  <div className={styles.dialerKeys} role="group" aria-label="Teclado numérico">
   {keys.map(digit=><button key={digit} type="button" className={styles.dialerKey}
    aria-label={digit} disabled={busy} onClick={()=>add(digit)}>{digit}</button>)}
   <span aria-hidden="true"/>
   <button type="button" className={styles.dialerKey} aria-label="0"
    disabled={busy} onClick={()=>add("0")}>0</button>
   <button type="button" className={styles.dialerDelete} title="Borrar último dígito"
    aria-label="Borrar último dígito" disabled={busy||!phone}
    onClick={()=>{setPhone(value=>value.slice(0,-1));setNotice("");}}>
    <Delete size={25}/>
   </button>
  </div>
  <button className={styles.dialerCall} type="button" aria-label="Llamar desde VMV"
   onClick={()=>{if(formatted)setConfirm(true);}}
   disabled={busy||checking||!available||!formatted}><Phone size={26} fill="currentColor" strokeWidth={1.6}/></button>
  <span className={styles.dialerHint}>{checking?"Comprobando línea…":available?"Llamada nacional · VMV":"Llamadas salientes no disponibles"}</span>
  {notice?<p className={isError?styles.dialerError:styles.dialerSuccess} role="status">{notice}</p>:null}
  {confirm&&formatted?<div className={styles.callbackConfirmBackdrop}>
   <div className={styles.callbackConfirmCard} role="dialog" aria-modal="true"
    aria-labelledby="dialer-confirm-title">
    <span className={styles.smallKicker}>LLAMADA NORMAL · VMV</span>
    <h3 id="dialer-confirm-title">¿Llamar ahora?</h3>
    <strong>{formatted}</strong>
    <p>El cliente verá tu número empresarial. Twilio puede generar cargos de voz.</p>
    <button type="button" className={styles.mainAction} disabled={busy} onClick={()=>void startCall()}>Llamar con VMV →</button>
    <button type="button" className={styles.secondaryAction} onClick={()=>setConfirm(false)}>Cancelar</button>
   </div>
  </div>:null}
 </div>;
}
