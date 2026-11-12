"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {SupabaseClient,User} from "@supabase/supabase-js";
import type {Profile} from "@/lib/types";
import {getSupabase} from "@/lib/supabase";

export type Tab="home"|"services"|"calls"|"translator"|"account";
export type Panel="overview"|"settings"|"activity"|"minutes";
export type CallSettings={user_id:string;existing_phone:string;desired_language:string;caller_language:string;assistant_name:string};
export type Route={id:string;twilio_number:string;public_number:string|null;enabled:boolean;receive_method:string;forwarding_mode:string;destination_phone:string};
export type Provisioning={status:string;carrier:string;answer_method:string;phone_verified_at:string|null};
export type CallRecord={bridge_sid:string;started_at:string;status:string;call_mode:"direct"|"translated";duration_seconds:number|null;caller_phone:string|null};
export type Voice="default"|"bright"|"calm";
export type Preferences={voice_customer:Voice;voice_owner:Voice;greeting_customer:string;greeting_owner:string};
export type Billing={
 plan:string;status:string;billingMode:"test"|"live";subscriptionActive:boolean;previewPilotActive:boolean;
 canCheckout:boolean;phoneServiceReady:boolean;periodEnd:string|null;note:string;
 national:{enabled:boolean;included:number;used:number;reserved:number;available:number;periodStart:string|null;periodEnd:string|null};
 minutes:{included:number;used:number;reserved:number;rollover:number;topup:number;available:number;temporaryHold:number;holdUntil:string|null};
 plans:{id:string;name:string;priceCents:number;minutes:number}[];
 topup:{plan:string;minutes:number;priceCents:number;available:boolean}|null;
};
export type LineStatus={
 verified:boolean;connectedToApp:boolean;forwardingReady:boolean;menuPrepared:boolean;menuVerifiedByRealCall:boolean;
 publicPhone:string|null;twilioPhone:string|null;carrier:string|null;forwardingReported:boolean;
 nextAction:string;billing:{active:boolean;pilot:boolean;message:string};
 usage:{periodDays:number;calls:number;completed:number;directCalls:number;translatedCalls:number;minutes:number};
};
type Result<T>={ok:boolean;data:T|null;status:number};
export type Summary={billing:Result<Billing>;line:Result<LineStatus>;preferences:Result<{editable:boolean;message:string;settings:Preferences}>};
const defaults:Preferences={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
const validVoice=(value:unknown):value is Voice=>value==="default"||value==="bright"||value==="calm";
export function useSmartCallAccount(){
 const [client,setClient]=useState<SupabaseClient|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [phase,setPhase]=useState<"checking"|"signed_out"|"signed_in"|"unconfigured">("checking");
 const [profile,setProfile]=useState<Profile|null>(null);
 const [settings,setSettings]=useState<CallSettings|null>(null);
 const [route,setRoute]=useState<Route|null>(null);
 const [provisioning,setProvisioning]=useState<Provisioning|null>(null);
 const [calls,setCalls]=useState<CallRecord[]>([]);
 const [summary,setSummary]=useState<Summary|null>(null);
 const [preferences,setPreferences]=useState<Preferences>(defaults);
 const [loading,setLoading]=useState(false);
 const [working,setWorking]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const requestId=useRef(0);
 const identityId=useRef<string|null>(null);
 useEffect(()=>{
  let mounted=true;
  const instance=getSupabase();
  if(!instance){setPhase("unconfigured");return;}
  setClient(instance);
  const synchronize=async()=>{
   try{
    const {data,error:authError}=await instance.auth.getUser();
    if(!mounted)return;
    if(authError||!data.user||data.user.is_anonymous){
     identityId.current=null;requestId.current++;
     setUser(null);setProfile(null);setSettings(null);setRoute(null);
     setProvisioning(null);setCalls([]);setSummary(null);setPreferences(defaults);
     setPhase("signed_out");
    }else{
     if(identityId.current!==data.user.id){
      identityId.current=data.user.id;requestId.current++;
      setProfile(null);setSettings(null);setRoute(null);setProvisioning(null);
      setCalls([]);setSummary(null);setPreferences(defaults);
     }
     setUser(data.user);setPhase("signed_in");
    }
   }catch{if(mounted){setUser(null);setPhase("signed_out");setError("No se pudo verificar tu sesión. Revisa tu conexión.");}}
  };
  const {data:listener}=instance.auth.onAuthStateChange(event=>{
   if(event==="SIGNED_OUT"){
    identityId.current=null;requestId.current++;setUser(null);setPhase("signed_out");setProfile(null);
    setSettings(null);setSummary(null);setRoute(null);setCalls([]);setProvisioning(null);
    setPreferences(defaults);setNotice("");setError("");
   }else if(event==="SIGNED_IN"||event==="INITIAL_SESSION"||event==="TOKEN_REFRESHED"){
    queueMicrotask(()=>{if(mounted)void synchronize();});
   }
  });
  void synchronize();
  return()=>{mounted=false;requestId.current++;listener.subscription.unsubscribe();};
 },[]);
 const refresh=useCallback(async(silent=false)=>{
  if(!client||!user)return;
  const revision=++requestId.current;
  if(!silent)setLoading(true);
  setError("");
  try{
   const {data:identity,error:identityError}=await client.auth.getUser();
   if(identityError||identity.user?.id!==user.id)throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.");
   const {data:session,error:sessionError}=await client.auth.getSession();
   if(sessionError||!session.session||session.session.user.id!==user.id)throw new Error("Tu sesión expiró.");
   const uid=user.id;
   const [profileRes,settingsRes,routeRes,provisionRes,callsRes,summaryRes]=await Promise.all([
    client.from("smartjob_profiles").select("*").eq("id",uid).maybeSingle(),
    client.from("smartjob_call_settings").select("user_id,existing_phone,desired_language,caller_language,assistant_name").eq("user_id",uid).maybeSingle(),
    client.from("smartjob_phone_routes").select("id,twilio_number,public_number,enabled,receive_method,forwarding_mode,destination_phone").eq("user_id",uid).order("created_at",{ascending:false}).limit(1),
    client.from("smartjob_provisioning_requests").select("status,carrier,answer_method,phone_verified_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(1),
    client.from("smartjob_call_sessions").select("bridge_sid,started_at,status,call_mode,duration_seconds,caller_phone").eq("owner_id",uid).order("started_at",{ascending:false}).limit(25),
    fetch("/api/vista-app/smart-call",{cache:"no-store",headers:{Authorization:"Bearer "+session.session.access_token}})
      .then(async response=>{
       if(!response.ok)throw new Error("pilot_unavailable");
       return response.json() as Promise<Summary>;
      })
      .catch(()=>({
       billing:{ok:false,data:null,status:503},line:{ok:false,data:null,status:503},
       preferences:{ok:false,data:null,status:503}
      } as Summary))
   ]);
   if(revision!==requestId.current)return;
   if(profileRes.error||!profileRes.data||profileRes.data.id!==uid)throw new Error("Esta cuenta no tiene un perfil de Smart Call. Completa el registro primero.");
   setProfile(profileRes.data as Profile);
   setSettings(settingsRes.error?null:settingsRes.data as CallSettings|null);
   setRoute(routeRes.error?null:(routeRes.data?.[0] as Route|undefined)||null);
   setProvisioning(provisionRes.error?null:(provisionRes.data?.[0] as Provisioning|undefined)||null);
   setCalls(callsRes.error?[]:(callsRes.data as CallRecord[]|null)||[]);
   setSummary(summaryRes);
   const prefs=summaryRes.preferences;
   if(prefs.ok&&prefs.data?.settings){
    const p=prefs.data.settings;
    setPreferences({
     voice_customer:validVoice(p.voice_customer)?p.voice_customer:"default",
     voice_owner:validVoice(p.voice_owner)?p.voice_owner:"default",
     greeting_customer:String(p.greeting_customer||""),
     greeting_owner:String(p.greeting_owner||"")
    });
   }else{setPreferences(defaults);}
   if(settingsRes.error||routeRes.error||provisionRes.error||callsRes.error||
     !summaryRes.billing.ok||!summaryRes.line.ok||!summaryRes.preferences.ok)
    setError("Algunos datos no están disponibles. Actualiza para volver a consultarlos.");
  }catch(e){
   if(revision!==requestId.current)return;
   setError(e instanceof Error?e.message:"No se pudo obtener la información de Smart Call.");
   setSummary(null);
  }finally{if(revision===requestId.current)setLoading(false);}
 },[client,user]);
 useEffect(()=>{if(phase==="signed_in"&&user&&client)void refresh();},[phase,user?.id,client,refresh]);
 // Refresh monetary balances and incoming activity whenever the browser tab
 // becomes visible again; do not overwrite unsaved form edits automatically.
 const updateActivity=useCallback(async()=>{
  if(!client||!user)return;
  const revision=requestId.current;
  try{
   const {data:session}=await client.auth.getSession();
   if(!session.session||session.session.user.id!==user.id)return;
   const [latest,remote]=await Promise.all([
    client.from("smartjob_call_sessions").select("bridge_sid,started_at,status,call_mode,duration_seconds,caller_phone")
      .eq("owner_id",user.id).order("started_at",{ascending:false}).limit(25),
    fetch("/api/vista-app/smart-call",{cache:"no-store",headers:{Authorization:"Bearer "+session.session.access_token}})
   ]);
   if(latest.error||!remote.ok||revision!==requestId.current)return;
   const data=await remote.json() as Summary;
   if(revision!==requestId.current)return;
   if(data.billing.ok||data.line.ok){setSummary(previous=>previous?{
    ...previous,billing:data.billing,line:data.line
   }:data);}
   setCalls(latest.data as CallRecord[]||[]);
  }catch{/* Manual refresh reports service errors. */}
 },[client,user]);
 useEffect(()=>{
  if(!user)return;
  const visible=()=>{if(document.visibilityState==="visible"&&!working&&!loading)void updateActivity();};
  document.addEventListener("visibilitychange",visible);
  const interval=window.setInterval(visible,45000);
  return()=>{document.removeEventListener("visibilitychange",visible);window.clearInterval(interval);};
 },[user?.id,loading,working,updateActivity]);
 const signIn=useCallback(async(email:string,password:string)=>{
  if(!client)return;
  setWorking(true);setNotice("");setError("");
  try{
   const {data,error:loginError}=await client.auth.signInWithPassword({email:email.trim(),password});
   if(loginError||!data.user)throw new Error("No pudimos iniciar sesión. Comprueba tus credenciales.");
   setUser(data.user);setPhase("signed_in");
  }catch(e){setError(e instanceof Error?e.message:"Error de inicio de sesión.");}
  finally{setWorking(false);}
 },[client]);
 const signOut=useCallback(async()=>{
  if(!client)return;
  setWorking(true);
  try{await client.auth.signOut();requestId.current++;setUser(null);setPhase("signed_out");}
  catch{setError("No pudimos cerrar la sesión. Inténtalo nuevamente.");}
  finally{setWorking(false);}
 },[client]);
 const saveBasic=useCallback(async(next:CallSettings)=>{
  if(!client||!user||!settings){setError("Primero termina de configurar tu cuenta Smart Call.");return false;}
  const assistant=next.assistant_name.trim();
  if(!["es","en"].includes(next.desired_language)||!["es","en"].includes(next.caller_language)||
    next.desired_language===next.caller_language){setError("Selecciona dos idiomas diferentes.");return false;}
  if(!assistant||assistant.length>40){setError("El asistente debe tener entre 1 y 40 caracteres.");return false;}
  setWorking(true);setNotice("");setError("");
  try{
   const {data:identity}=await client.auth.getUser();
   if(identity.user?.id!==user.id)throw new Error("Sesión inválida.");
   // UPDATE only allowed fields of the owner's existing settings row.
   // No forwarding, line ownership, billing or Twilio provisioning changes.
   const {data,error:saveError}=await client.from("smartjob_call_settings").update({
    desired_language:next.desired_language,caller_language:next.caller_language,
    assistant_name:assistant,updated_at:new Date().toISOString()
   }).eq("user_id",user.id).select("user_id").maybeSingle();
   if(saveError||!data)throw new Error("No pudimos guardar tus ajustes.");
   setSettings({...settings,...next,assistant_name:assistant});
   setNotice("Idiomas y asistente guardados. Los cambios de ruta telefónica requieren verificación.");
   return true;
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");return false;}
  finally{setWorking(false);}
 },[client,user,settings]);
 const savePremium=useCallback(async(next:Preferences)=>{
  if(!client||!user||summary?.preferences.data?.editable!==true){setError("Necesitas Pro o Premium activo.");return false;}
  const greetings=[next.greeting_customer,next.greeting_owner];
  if(!validVoice(next.voice_customer)||!validVoice(next.voice_owner)||greetings.some(
   value=>value.length>180||/[<>\r\n]/.test(value)||(value.trim().length>0&&value.trim().length<10)
  )){setError("Los saludos deben tener 10 a 180 caracteres, sin saltos de línea ni < >.");return false;}
  setWorking(true);setError("");setNotice("");
  try{
   const {data:session}=await client.auth.getSession();
   if(!session.session||session.session.user.id!==user.id)throw new Error("Tu sesión expiró.");
   const response=await fetch("/api/vista-app/smart-call",{
    method:"POST",cache:"no-store",headers:{"Authorization":"Bearer "+session.session.access_token,
      "Content-Type":"application/json"},body:JSON.stringify(next)
   });
   if(!response.ok)throw new Error(response.status===403?"Necesitas Pro o Premium activo.":"No se pudieron guardar las voces y los saludos.");
   const result=await response.json();
   if(result.saved!==true)throw new Error("No se pudo confirmar el guardado.");
   setPreferences(next);
   setNotice("Voces y saludos guardados. Se aplicarán a las próximas llamadas.");
   return true;
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");return false;}
  finally{setWorking(false);}
 },[client,user,summary?.preferences.data?.editable]);
 return {client,user,phase,profile,settings,route,provisioning,calls,summary,preferences,
  setPreferences,loading,working,notice,error,setNotice,setError,refresh,signIn,signOut,saveBasic,savePremium};
}
