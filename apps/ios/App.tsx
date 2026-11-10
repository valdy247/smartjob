import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Platform,Pressable,
 SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,Modal,Keyboard,Linking,Image,useWindowDimensions} from "react-native";
import {Voice,Call,CallInvite} from "@twilio/voice-react-native-sdk";
import type {Session} from "@supabase/supabase-js";
import {api,supabase,configured} from "./session";
import {InterpreterPanel} from "./InterpreterPanel";
import {NativeActivation,type NativeProfile} from "./NativeActivation";

const colors={bg:"#F8FBFA",card:"#FFFFFF",line:"#DCE8E6",text:"#151D2A",
 muted:"#6D7784",accent:"#00B997",accentText:"#06392E",red:"#E25673"};
const voice=new Voice();
let listenersReady=false;
let pushRegistryInit:Promise<void>|null=null;
function ensurePushRegistry():Promise<void>{
 if(Platform.OS!=="ios")return Promise.resolve();
 if(!pushRegistryInit){
   pushRegistryInit=voice.initializePushRegistry().catch((cause:unknown)=>{
     pushRegistryInit=null;
     throw cause;
   });
 }
 return pushRegistryInit;
}

export default function App(){
 const {height:screenHeight}=useWindowDimensions();
 const [session,setSession]=useState<Session|null>(null);
 const [activationProfile,setActivationProfile]=useState<NativeProfile|null>(null);
 const [activeTab,setActiveTab]=useState<"home"|"calls"|"live"|"settings">("home");
 const [image1Unavailable,setImage1Unavailable]=useState(false);
 const [image2Unavailable,setImage2Unavailable]=useState(false);
 const [keyboardVisible,setKeyboardVisible]=useState(false),[forwardHelpOpen,setForwardHelpOpen]=useState(false);
 const [settingsPage,setSettingsPage]=useState<"menu"|"numbers"|"billing"|"history"|"security"|"profile"|"style"|"support"|"services">("menu");
 const [callHistory,setCallHistory]=useState<{bridge_sid:string;status:string;duration_seconds:number|null;started_at:string;call_mode:string}[]>([]);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [assistantPrefs,setAssistantPrefs]=useState({existing_phone:"",desired_language:"es",caller_language:"en",assistant_name:""});
 const [greetingPrefs,setGreetingPrefs]=useState({voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""});
 const [greetingEditable,setGreetingEditable]=useState(false);
 const [customizationBusy,setCustomizationBusy]=useState(false),[customizationMessage,setCustomizationMessage]=useState("");
 const [inboundLanguage,setInboundLanguage]=useState<"es"|"en"|"unknown">("unknown");
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [working,setWorking]=useState(false),[registering,setRegistering]=useState(false);

 const [ready,setReady]=useState(false),[status,setStatus]=useState("Prepara la recepción de llamadas");
 const [invite,setInvite]=useState<CallInvite|null>(null),[call,setCall]=useState<Call|null>(null);
 const [error,setError]=useState("");
 const [voiceDiagnostic,setVoiceDiagnostic]=useState("Sin diagnóstico de registro todavía.");
 const [accountOverview,setAccountOverview]=useState<{
  verified:boolean;connectedToApp:boolean;forwardingReady:boolean;twilioPhone:string|null;
  publicPhone:string|null;carrier:string|null;menuPrepared?:boolean;menuVerifiedByRealCall?:boolean;forwardingReported?:boolean;usage:{calls:number;completed:number;minutes:number;periodDays:number;directCalls?:number;translatedCalls?:number};
  billing:{enabled:boolean;active?:boolean;pilot?:boolean;message:string;availableMinutes?:number};
 }|null>(null);
 const [overviewBusy,setOverviewBusy]=useState(false);
 const [pilotChecking,setPilotChecking]=useState(false);
 const [pilotReadiness,setPilotReadiness]=useState<{lineReady:boolean;engineReady:boolean;webhookChecked:boolean;webhookReady:boolean;webhookPost:boolean;pushConfigured:boolean;nextStep:string}|null>(null);
 const [billingOverview,setBillingOverview]=useState<{
  plan:string;status:string;minutes:{included:number;used:number;available:number;rollover:number;topup:number};
  note:string
 }|null>(null);
 const [phoneVerification,setPhoneVerification]=useState<{requestId:string;phone:string;verified:boolean;smsAvailable:boolean;requestStatus:string}|null>(null);
 const [smsCode,setSmsCode]=useState(""),[smsSent,setSmsSent]=useState(false);
 const [smsBusy,setSmsBusy]=useState(false),[verificationLoading,setVerificationLoading]=useState(false);
 const [verifyMessage,setVerifyMessage]=useState("");
 useEffect(()=>{
  const show=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboardVisible(true));
  const hide=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboardVisible(false));
  return()=>{show.remove();hide.remove();};
 },[]);
 const registeredAt=useRef(0),inviteRef=useRef<CallInvite|null>(null),callRef=useRef<Call|null>(null);
 const sessionRef=useRef<Session|null>(null);
 useEffect(()=>{
   const client=supabase;
   if(!client)return;
   let mounted=true;
   client.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);sessionRef.current=data.session;}});
   const {data}=client.auth.onAuthStateChange((_event,next)=>{
     if(!mounted)return;
     setSession(next);sessionRef.current=next;
     if(!next){setReady(false);setPhoneVerification(null);setSmsCode("");setSmsSent(false);setStatus("Inicia sesión para recibir llamadas");}
   });
   return()=>{mounted=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  const client=supabase;
  if(!session?.user.id||!client){setActivationProfile(null);return;}
  let alive=true;
  (async()=>{
   try{
    const {data:existing}=await client.from("smartjob_profiles")
     .select("id,first_name,phone,owner_language,assistant_name,line_choice,line_carrier,preferred_plan,plan_prompt_seen,line_setup_completed")
     .eq("id",session.user.id).maybeSingle();
    if(!alive)return;
    if(existing){setActivationProfile(existing as NativeProfile);return;}
    const m=session.user.user_metadata||{};
    if(!m.first_name||!m.last_name||!m.phone||!m.occupation)return;
    const {data:created}=await client.from("smartjob_profiles").upsert({
     id:session.user.id,first_name:String(m.first_name),last_name:String(m.last_name),
     phone:String(m.phone),occupation:String(m.occupation),
     city:String(m.city||""),state:String(m.state||""),country:String(m.country||"US"),
     owner_language:String(m.owner_language||"es"),customer_language:String(m.customer_language||"en"),
     assistant_name:String(m.assistant_name||"Juan"),line_choice:m.line_choice==="new"?"new":"keep",
     line_carrier:"other",plan_prompt_seen:false,line_setup_completed:false
    },{onConflict:"id",ignoreDuplicates:true}).select("*").maybeSingle();
    if(alive&&created)setActivationProfile(created as NativeProfile);
   }catch{if(alive)setActivationProfile(null);}
  })();
  return()=>{alive=false;};
 },[session?.user.id]);
 useEffect(()=>{
   if(listenersReady)return;
   listenersReady=true;
   voice.on(Voice.Event.CallInvite,(incoming:CallInvite)=>{
     inviteRef.current=incoming;setInvite(incoming);
     setStatus("Llamada entrante");
     const details=(incoming as unknown as {customParameters?:Map<string,string>|Record<string,string>}).customParameters;
     const language=details instanceof Map?details.get("vmv_language"):details?.vmv_language;
     setInboundLanguage(language==="es"?"es":language==="en"?"en":"unknown");
     const dismissInvite=()=>{
       if(inviteRef.current!==incoming)return;
       inviteRef.current=null;setInvite(null);
       setInboundLanguage("unknown");setStatus("La llamada terminó antes de contestar");
       setVoiceDiagnostic("Twilio canceló la invitación antes de contestar.");
     };
     incoming.on(CallInvite.Event.Cancelled,dismissInvite);
     incoming.on(CallInvite.Event.Rejected,dismissInvite);
     incoming.on(CallInvite.Event.Accepted,(accepted:Call)=>{
       connectCall(accepted);
     });
   });
   voice.on(Voice.Event.Error,(event:unknown)=>{
     const e=event as {code?:string|number;name?:string};
     const code=typeof e?.code==="string"||typeof e?.code==="number"?String(e.code):"sin código";
     const name=typeof e?.name==="string"?e.name.slice(0,80):"Error del SDK";
     setVoiceDiagnostic("Twilio SDK: "+name+" ("+code+").");
     setError("La conexión de voz tuvo un problema. Consulta el diagnóstico de voz.");
   });
 },[]);
 useEffect(()=>{
   // Register PushKit as soon as the app starts, not only when the user taps a button.
   void ensurePushRegistry().then(()=>{
     setVoiceDiagnostic(prev=>prev==="Sin diagnóstico de registro todavía."?
       "PushKit inicializado al abrir la app. Pendiente de registrar el dispositivo con Twilio.":prev);
   }).catch((cause:unknown)=>{
     const reason=cause instanceof Error?cause.message:"Error desconocido";
     setVoiceDiagnostic("PushKit no pudo inicializarse: "+reason.slice(0,160));
   });
 },[]);
 function clearCallState(connected:Call,message="Llamada finalizada"){
   if(callRef.current!==connected)return;
   callRef.current=null;setCall(null);setStatus(message);
 }
 function connectCall(connected:Call){
   if(callRef.current===connected)return;
   callRef.current=connected;setCall(connected);setInvite(null);inviteRef.current=null;
   setStatus("Conectando interpretación…");
   connected.addListener(Call.Event.Connected,()=>{
     if(callRef.current===connected)setStatus("En llamada con interpretación");
   });
   connected.addListener(Call.Event.ConnectFailure,(cause:unknown)=>{
     const e=cause as {code?:number|string;message?:string}|null;
     setVoiceDiagnostic("Twilio no pudo conectar la llamada ("+String(e?.code||"sin código")+").");
     clearCallState(connected,"No se pudo conectar la llamada");
   });
   connected.addListener(Call.Event.Disconnected,(cause:unknown)=>{
     const e=cause as {code?:number|string}|null;
     if(e?.code)setVoiceDiagnostic("Llamada desconectada: código Twilio "+String(e.code));
     clearCallState(connected);
   });
   if(connected.getState()===Call.State.Disconnected)clearCallState(connected);
 }
 async function reconcileCurrentCall(){
   const current=callRef.current,uid=sessionRef.current?.user.id;
   if(!current||!uid||!supabase)return;
   if(current.getState()===Call.State.Disconnected){
     clearCallState(current);return;
   }
   const sid=current.getSid();
   if(!sid||!/^CA[a-f0-9]{32}$/i.test(sid))return;
   // Only this account's exact Twilio leg: Supabase RLS rejects other users.
   const {data,error:lookupError}=await supabase.from("smartjob_call_sessions")
     .select("status").eq("owner_id",uid).eq("outbound_sid",sid).maybeSingle();
   if(lookupError){
     setVoiceDiagnostic("No se pudo verificar el estado remoto de la llamada.");
     return;
   }
   if(data&&["completed","no-answer","busy","failed","canceled"].includes(data.status)
     &&callRef.current===current){
     try{await current.disconnect();}catch{}
     clearCallState(current,"Llamada finalizada · confirmada por servidor");
     setVoiceDiagnostic("Twilio confirmó el cierre. La pantalla se sincronizó.");
   }
 }
 useEffect(()=>{
   if(!call)return;
   const interval=setInterval(()=>{void reconcileCurrentCall()},12000);
   void reconcileCurrentCall();
   return()=>clearInterval(interval);
 },[call]);
 useEffect(()=>{
   const sub=AppState.addEventListener("change",next=>{
     if(next==="active")void reconcileCurrentCall();
   });
   return()=>sub.remove();
 },[]);
 async function phoneApi(path:string,body?:Record<string,unknown>):Promise<Record<string,unknown>>{
   const client=supabase;
   if(!client)throw new Error("Inicia sesión primero.");
   const {data}=await client.auth.getSession();
   if(!data.session)throw new Error("Tu sesión ha expirado. Vuelve a entrar.");
   const res=await fetch(api+"/api/ios/phone-verification"+path,{
     method:body?"POST":"GET",
     headers:{"Authorization":"Bearer "+data.session.access_token,
       ...(body?{"Content-Type":"application/json"}:{})},
     ...(body?{body:JSON.stringify(body)}:{})
   });
   if(!(res.headers.get("content-type")||"").includes("application/json"))
     throw new Error("El servidor SMS no está disponible en esta versión.");
   const value=await res.json() as Record<string,unknown>;
   if(!res.ok){
     const messages:Record<string,string>={
       sms_not_configured:"El servicio de SMS aún necesita configurarse en Twilio.",
       sms_rate_limit:"Espera al menos un minuto antes de solicitar otro código. Máximo cinco SMS al día.",
       sms_delivery_failed:"Twilio no pudo entregar el SMS. Revisa tu número e inténtalo después.",
       incorrect_or_expired_code:"El código no es correcto o ha expirado. Revisa el SMS.",
       too_many_attempts:"Demasiados intentos. Solicita un nuevo código más tarde.",
       invalid_code:"Introduce el código numérico del SMS.",
       verification_already_completed:"Este número ya fue verificado.",
       verification_save_failed:"El código fue aceptado, pero no se guardó la verificación. Contacta al soporte.",
       no_verification_request:"Todavía no hay un número registrado en tu cuenta.",
       verification_unavailable:"El servidor de verificación no está disponible.",
       unauthorized:"Inicia sesión de nuevo para verificar tu línea."
     };
     throw new Error(messages[String(value.error||"")]||"La verificación no se completó (HTTP "+res.status+").");
   }
   return value;
 }
 async function refreshPhoneVerification(){
   setVerificationLoading(true);setVerifyMessage("");
   try{
     const value=await phoneApi("");
     setPhoneVerification({
       requestId:String(value.requestId||""),phone:String(value.phone||""),
       verified:value.verified===true,smsAvailable:value.smsAvailable===true,
       requestStatus:String(value.requestStatus||"pending")
     });
   }catch(e){setVerifyMessage(e instanceof Error?e.message:"No se pudo consultar el número.");}
   finally{setVerificationLoading(false);}
 }
 useEffect(()=>{
   if(!session?.user.id){setPhoneVerification(null);return;}
   void refreshPhoneVerification();
 },[session?.user.id]);
 async function sendSmsCode(){
   if(!phoneVerification)return;
   setSmsBusy(true);setError("");setVerifyMessage("");
   try{
     await phoneApi("/send",{requestId:phoneVerification.requestId});
     setSmsSent(true);setVerifyMessage("Código enviado a "+phoneVerification.phone+". Escríbelo abajo.");
   }catch(e){setVerifyMessage(e instanceof Error?e.message:"No se pudo enviar el código.");}
   finally{setSmsBusy(false);}
 }
 async function confirmSmsCode(){
   if(!phoneVerification)return;
   setSmsBusy(true);setError("");setVerifyMessage("");
   try{
     const result=await phoneApi("/check",{requestId:phoneVerification.requestId,code:smsCode.trim()});
     if(result.verified!==true)throw new Error("No se pudo completar la verificación.");
     setPhoneVerification({...phoneVerification,verified:true});
     setSmsCode("");setSmsSent(false);
     setStatus("Número verificado · pendiente de aprobación de llamadas");
     setVerifyMessage("Número verificado por SMS. Falta la autorización de tu línea para recibir llamadas.");
   }catch(e){setVerifyMessage(e instanceof Error?e.message:"No se pudo verificar el código.");}
   finally{setSmsBusy(false);}
 }
 async function refreshAccountOverview(){
   if(!supabase||!sessionRef.current)return;
   setOverviewBusy(true);
   try{
     const {data}=await supabase.auth.getSession();
     if(!data.session)return;
     const result=await fetch(api+"/api/ios/account-overview",{
       headers:{"Authorization":"Bearer "+data.session.access_token}
     });
     if(!result.ok)throw new Error("No pudimos obtener tu centro de activación.");
     setAccountOverview(await result.json());
     const billing=await fetch(api+"/api/billing/overview",{
       headers:{"Authorization":"Bearer "+data.session.access_token}
     }).catch(()=>null);
     if(billing?.ok)setBillingOverview(await billing.json());
   }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}
   finally{setOverviewBusy(false);}
 }
 useEffect(()=>{
  if(!session?.user.id){setAccountOverview(null);return;}
  void refreshAccountOverview();
 },[session?.user.id]);
 async function refreshCallHistory(){
  if(!supabase||!sessionRef.current)return;
  setHistoryBusy(true);
  try{
   const {data,error:historyError}=await supabase.from("smartjob_call_sessions")
     .select("bridge_sid,status,duration_seconds,started_at,call_mode")
     .eq("owner_id",sessionRef.current.user.id).order("started_at",{ascending:false}).limit(25);
   if(historyError)throw historyError;
   setCallHistory(data||[]);
  }catch{setError("No se pudo cargar el historial.");}
  finally{setHistoryBusy(false);}
 }
 useEffect(()=>{
  if(session?.user.id&&activeTab==="settings"&&settingsPage==="history")void refreshCallHistory();
 },[session?.user.id,activeTab,settingsPage]);
 async function checkPilotReadiness(){
  if(!supabase||pilotChecking)return;
  setPilotChecking(true);
  try{
    const {data}=await supabase.auth.getSession();
    if(!data.session)throw new Error("Inicia sesión nuevamente.");
    const res=await fetch(api+"/api/ios/pilot-readiness",{
      headers:{Authorization:"Bearer "+data.session.access_token}
    });
    if(!res.ok)throw new Error("No pudimos verificar la conexión (HTTP "+res.status+").");
    const info=await res.json();
    setPilotReadiness(info);
  }catch(e){setPilotReadiness(null);setError(e instanceof Error?e.message:"Diagnóstico no disponible");}
  finally{setPilotChecking(false);}
 }
 async function registerPhone(){
   const client=supabase;
   if(!client||!sessionRef.current)return;
   setRegistering(true);setError("");setVoiceDiagnostic("Solicitando autorización de voz al servidor…");
   try{
     const {data}=await client.auth.getSession();
     if(!data.session)throw new Error("Tu sesión ha expirado. Vuelve a entrar.");
     const res=await fetch(api+"/api/ios/voice-token",{
       method:"POST",headers:{Authorization:"Bearer "+data.session.access_token}
     });
     const contentType=res.headers.get("content-type")||"";
     if(!contentType.includes("application/json")){
       throw new Error("El servidor configurado no tiene activo el servicio de llamadas para iPhone (HTTP "+res.status+"). La aplicación está en pruebas; no actives el desvío de tu línea.");
     }
     const value=await res.json();
     if(!res.ok){
       if(res.status===403)throw new Error("Tu línea todavía necesita verificación y autorización.");
       if(res.status===503)throw new Error("La recepción de llamadas iPhone todavía no está habilitada en este servidor.");
       if(res.status===404)throw new Error("Esta versión del servidor todavía no incluye la recepción de llamadas para iPhone.");
       throw new Error("No se pudo registrar el teléfono (HTTP "+res.status+").");
     }
     if(typeof value.token!=="string")throw new Error("Token de llamadas inválido.");
     setVoiceDiagnostic("Comprobando PushKit en iOS…");
     await ensurePushRegistry();
     setVoiceDiagnostic("Registrando dispositivo con Twilio…");
     await voice.register(value.token);
     registeredAt.current=Date.now();setReady(true);
     setVoiceDiagnostic("Registro de voz aceptado. Comprueba la entrega con una llamada real.");
     setStatus(value.testOnly===true?"iPhone registrado para llamadas de prueba":"iPhone registrado para recibir llamadas");
   }catch(e){
     setReady(false);
     const reason=e instanceof Error?e.message:"Error desconocido";
     setVoiceDiagnostic("Fallo en registro: "+reason.slice(0,180));
     setError(e instanceof Error?e.message:"No fue posible activar la recepción.");
   }finally{setRegistering(false);}
 }
 useEffect(()=>{
   if(!session||!ready)return;
   const sub=AppState.addEventListener("change",next=>{
     if(next==="active"&&Date.now()-registeredAt.current>10*60*1000
       &&!callRef.current&&!inviteRef.current)void registerPhone();
   });
   return()=>sub.remove();
 },[ready,session?.user.id]);
 useEffect(()=>{
   // Re-register on app launch only for an activated iOS phone route.
   // Twilio PushKit bindings may be stale after app restarts or network changes.
   if(session?.user.id&&accountOverview?.connectedToApp&&!ready&&!registering){
     void registerPhone();
   }
 },[session?.user.id,accountOverview?.connectedToApp]);
 async function loadCustomization(){
  if(!supabase||!sessionRef.current)return;
  try{
    const {data:settings}=await supabase.from("smartjob_call_settings")
      .select("existing_phone,desired_language,caller_language,assistant_name")
      .eq("user_id",sessionRef.current.user.id).maybeSingle();
    if(settings)setAssistantPrefs({
      existing_phone:settings.existing_phone||"",desired_language:settings.desired_language||"es",
      caller_language:settings.caller_language||"en",assistant_name:settings.assistant_name||"Juan"
    });
    else setAssistantPrefs({existing_phone:"",desired_language:"es",caller_language:"en",assistant_name:"Juan"});
    const {data}=await supabase.auth.getSession();
    if(!data.session)return;
    const response=await fetch(api+"/api/billing/preferences",{headers:{Authorization:"Bearer "+data.session.access_token}});
    if(response.ok){
      const info=await response.json() as {editable?:boolean;settings?:typeof greetingPrefs};
      setGreetingEditable(info.editable===true);
      if(info.settings)setGreetingPrefs(info.settings);
    }
  }catch{setCustomizationMessage("No se pudieron cargar todos los ajustes.");}
 }
 useEffect(()=>{
  if(session?.user.id&&activeTab==="settings"&&(settingsPage==="style"||settingsPage==="profile"))void loadCustomization();
 },[session?.user.id,activeTab,settingsPage]);
 async function saveAssistantPrefs(){
  if(!supabase||!sessionRef.current)return;
  if(assistantPrefs.desired_language===assistantPrefs.caller_language){
    setCustomizationMessage("Elige dos idiomas diferentes.");return;
  }
  const phone=assistantPrefs.existing_phone.replace(/[ ()-]/g,"");
  if(!/^\+[1-9]\d{7,14}$/.test(phone)){
    setCustomizationMessage("Escribe un teléfono válido con código de país.");return;
  }
  const assistant=assistantPrefs.assistant_name.trim();
  if(!assistant||assistant.length>40){setCustomizationMessage("Escribe el nombre del asistente.");return;}
  setCustomizationBusy(true);setCustomizationMessage("");
  try{
    const {error:saveError}=await supabase.from("smartjob_call_settings").upsert({
      user_id:sessionRef.current.user.id,existing_phone:phone,forwarding_enabled:false,
      desired_language:assistantPrefs.desired_language,caller_language:assistantPrefs.caller_language,
      assistant_name:assistant,updated_at:new Date().toISOString()
    });
    if(saveError)throw saveError;
    setCustomizationMessage("Preferencias guardadas. Los cambios en la línea activa requieren verificación.");
  }catch{setCustomizationMessage("No se pudieron guardar las preferencias.");}
  finally{setCustomizationBusy(false);}
 }
 async function saveGreetingPrefs(){
  if(!greetingEditable||!supabase)return;
  setCustomizationBusy(true);setCustomizationMessage("");
  try{
    const {data}=await supabase.auth.getSession();
    if(!data.session)throw Error("session");
    const response=await fetch(api+"/api/billing/preferences",{
      method:"POST",headers:{Authorization:"Bearer "+data.session.access_token,
        "Content-Type":"application/json"},
      body:JSON.stringify({...greetingPrefs,
        greeting_customer:greetingPrefs.greeting_customer.replace(/[\r\n]+/g," "),
        greeting_owner:greetingPrefs.greeting_owner.replace(/[\r\n]+/g," ")})
    });
    if(!response.ok)throw Error("not_saved");
    setCustomizationMessage("Saludo guardado para nuevas llamadas.");
    await loadCustomization();
  }catch{setCustomizationMessage("No se pudo guardar el saludo.");}
  finally{setCustomizationBusy(false);}
 }
 async function login(){
   if(!supabase)return;
   setWorking(true);setError("");
   try{
     const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
     if(authError)throw new Error(authError.message);
     setPassword("");
     setStatus("Sesión iniciada. Activa la recepción de llamadas.");
   }catch(e){setError(e instanceof Error?e.message:"No se pudo iniciar sesión.");}
   finally{setWorking(false);}
 }
 async function accept(){
   const current=inviteRef.current;
   if(!current)return;
   setWorking(true);setError("");
   try{const accepted=await current.accept();connectCall(accepted);}
   catch{setError("No pudimos contestar. Comprueba el permiso de micrófono y tu conexión.");}
   finally{setWorking(false);}
 }
 async function reject(){
   const current=inviteRef.current;
   if(!current)return;
   try{await current.reject();}catch{}
   inviteRef.current=null;setInvite(null);setStatus("Llamada rechazada");
 }
 async function end(){
   if(!callRef.current)return;
   try{await callRef.current.disconnect();}catch{}
   callRef.current=null;setCall(null);setStatus("Llamada finalizada");
 }
 async function logout(){
   if(supabase)await supabase.auth.signOut();
   setReady(false);setInvite(null);setCall(null);
   setStatus("Sesión cerrada");
 }
 return <SafeAreaView style={styles.safe}>
  <StatusBar barStyle="dark-content" backgroundColor={colors.bg}/>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
   <ScrollView scrollEnabled={activeTab!=="home"||screenHeight<720} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,session&&{paddingBottom:activeTab==="home"?96:130}]}>
    <View style={styles.brand}><View style={styles.brandMark}>
      <View style={styles.brandWave}>
       <View style={[styles.brandWaveBar,{height:13}]}/><View style={[styles.brandWaveBar,{height:24}]}/>
       <View style={[styles.brandWaveBar,{height:32}]}/><View style={[styles.brandWaveBar,{height:24}]}/>
       <View style={[styles.brandWaveBar,{height:13}]}/>
      </View>
     </View>
     <Text style={styles.brandText}>VMV<Text style={{color:"#00AD8D"}}> CALL</Text></Text>
     {session?<Pressable accessibilityRole="button" accessibilityLabel="Abrir ajustes" onPress={()=>{setActiveTab("settings");setSettingsPage("menu");}} style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{String(session.user.user_metadata?.first_name||"V").charAt(0).toUpperCase()}</Text></Pressable>:null}
    </View>
    {!configured?<View style={styles.alert}><Text style={styles.alertText}>Configura el acceso de la app para iniciar sesión.</Text></View>:
    !session?<View style={styles.card}>
      <Text style={styles.kicker}>BIENVENIDO</Text><Text style={styles.heading}>Habla sin{"\n"}fronteras<Text style={{color:colors.accent}}>.</Text></Text>
      <TextInput style={styles.field} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
       textContentType="emailAddress" placeholder="Correo electrónico" placeholderTextColor="#718D95" value={email} onChangeText={setEmail}/>
      <TextInput style={styles.field} secureTextEntry textContentType="password"
       placeholder="Contraseña" placeholderTextColor="#718D95" value={password} onChangeText={setPassword}/>
      <Button label="Entrar" onPress={()=>void login()} disabled={working||!email||!password}/>
      <Button label="Crear cuenta" secondary onPress={()=>void Linking.openURL(api.replace(/\/$/,"")+"/registro").catch(()=>setError("No se pudo abrir el registro."))}/>
     </View>:
    <>
     {activeTab==="home"?<>
      <Text style={styles.kicker}>TU ESPACIO</Text>
      <Text style={styles.heading}>Hola, {String(session.user.user_metadata?.first_name||"").trim()||"bienvenido"}<Text style={{color:colors.accent}}>.</Text></Text>
      <Text style={styles.homeSubtitle}>Traducción en tiempo real</Text>

      <View style={[styles.homeFeatureCard,styles.homeCallsFeature,styles.homeCallsIllustrated]}>
       <View style={styles.homeCallIllustration}>
        {image1Unavailable?<View style={styles.homeImageSlot}><Text style={styles.homeImageLabel}>Imagen 1</Text><Text style={styles.homeImageDescription}>Llamadas traducidas</Text></View>:
         <Image source={{uri:api.replace(/\/$/,"")+"/vmv/imagen-1.webp"}} style={styles.homeCallArtwork} resizeMode="contain"
          accessibilityLabel="Dos personas conversando en distintos idiomas mediante traducción telefónica"
          onError={()=>setImage1Unavailable(true)}/>}
       </View>
       <Pressable accessibilityRole="button" accessibilityLabel="Abrir llamadas traducidas" style={styles.homePrimaryButton} onPress={()=>setActiveTab("calls")}>
        <Text style={styles.homePrimaryText}>☎  Llamadas traducidas  →</Text>
       </Pressable>
      </View>

      <View style={[styles.homeFeatureCard,styles.homeTranslatorFeature,styles.homeTranslatorIllustrated]}>
       <View style={styles.homeTranslatorIllustration}>
        {image2Unavailable?<View style={[styles.homeImageSlot,styles.homeImageSlotSmall,styles.homePlaceholderWide]}>
          <Text style={styles.homeImageLabel}>Imagen 2</Text>
          <Text style={styles.homeImageDescription}>Traducción en persona</Text>
         </View>:
         <Image source={{uri:api.replace(/\/$/,"")+"/vmv/imagen-2.webp"}}
          style={styles.homeTranslatorArtwork} resizeMode="contain"
          accessibilityLabel="Un empleador y un trabajador se dan la mano mientras conversan, con un teléfono para traducir"
          onError={()=>setImage2Unavailable(true)}/>}
       </View>
       <Pressable accessibilityRole="button" accessibilityLabel="Abrir traducción en persona"
        style={styles.homeSecondaryButton} onPress={()=>setActiveTab("live")}>
        <Text style={styles.homeSecondaryText}>✧  Traducción en persona  →</Text>
       </Pressable>
      </View>

     </>:null}
     {activeTab==="calls"?<>
      <Text style={styles.kicker}>TELÉFONO</Text><Text style={styles.heading}>Llamadas<Text style={{color:colors.accent}}>.</Text></Text>
      <View style={[styles.card,styles.featureCard]}>
       <View style={styles.compactBetween}><Text style={styles.featureLabel}>☎  Recepción</Text><Text style={[styles.stateTag,{color:ready?colors.accent:"#F6CC83"}]}>{ready?"CONECTADA":"PENDIENTE"}</Text></View>
       <Text style={styles.featureNumber}>{accountOverview?.twilioPhone||"Sin asignar"}</Text>
       <Text style={styles.featureMuted}>{ready?"Tu iPhone está registrado y listo para sonar":"Conecta tu iPhone para recibir"}</Text>
        {accountOverview?.billing?.pilot?<View style={styles.previewPilotCard}><Text style={styles.previewPilotLabel}>✦ PRUEBA PRIVADA · OPENAI REALTIME</Text><Text style={styles.previewPilotCopy}>Tus minutos VMV están habilitados solo para tu cuenta. Llama desde otro teléfono a este número, marca 1 para traducir y contesta aquí.</Text><Text style={styles.previewPilotMinutes}>Saldo: {accountOverview.billing.availableMinutes??billingOverview?.minutes.available??0} minutos</Text><Button label={pilotChecking?"Comprobando…":"Verificar motor y número"} disabled={pilotChecking} onPress={()=>void checkPilotReadiness()}/>{pilotReadiness?<><Text style={styles.previewPilotCopy}>Motor OpenAI: {pilotReadiness.engineReady?"✓ Listo":"○ Pendiente"} · Webhook Twilio: {pilotReadiness.webhookReady&&pilotReadiness.webhookPost?"✓ Conectado":"○ Revisar"}</Text><Text style={styles.previewPilotCopy}>{pilotReadiness.nextStep}</Text></>:null}</View>:null}
       <Button label={accountOverview?.billing?.active===true?(registering?"Conectando…":ready?"Actualizar conexión":"Conectar iPhone"):"Se necesita plan activo"}
        disabled={registering} onPress={()=>accountOverview?.billing?.active===true?void registerPhone(): (setActiveTab("settings"),setSettingsPage("billing"))}/>
      </View>
      <Pressable accessibilityRole="button" style={styles.settingRow} onPress={()=>{setActiveTab("settings");setSettingsPage("numbers");}}>
       <View style={styles.settingIcon}><Text style={styles.settingEmoji}>📱</Text></View><Text style={styles.settingLabel}>Número y verificación</Text><Text style={styles.settingChevron}>›</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.settingRow} onPress={()=>{setActiveTab("settings");setSettingsPage("history");}}>
       <View style={styles.settingIcon}><Text style={styles.settingEmoji}>🕒</Text></View><Text style={styles.settingLabel}>Historial</Text><Text style={styles.settingChevron}>›</Text>
      </Pressable>
     </>:null}
     {activeTab==="live"?<InterpreterPanel session={session}/>:null}
     {activeTab==="settings"?<>
      {settingsPage==="menu"?<>
       <Text style={styles.kicker}>TU CUENTA</Text><Text style={styles.heading}>Ajustes<Text style={{color:colors.accent}}>.</Text></Text>
       <Text style={styles.groupTitle}>CUENTA</Text>
       <SettingRow emoji="👤" label="Perfil" onPress={()=>setSettingsPage("profile")}/>
       <SettingRow emoji="🔒" label="Seguridad" onPress={()=>setSettingsPage("security")}/>
       <Text style={styles.groupTitle}>LLAMADAS</Text>
       <SettingRow emoji="📱" label="Número y verificación" onPress={()=>setSettingsPage("numbers")}/>
       <SettingRow emoji="🕒" label="Historial" onPress={()=>setSettingsPage("history")}/>
       <Text style={styles.groupTitle}>SUSCRIPCIÓN</Text>
       <SettingRow emoji="💎" label="Plan y minutos" onPress={()=>setSettingsPage("billing")}/>
       <Text style={styles.groupTitle}>MÁS</Text>
       <SettingRow emoji="🌐" label="Idiomas y asistente" onPress={()=>setSettingsPage("style")}/>
       <SettingRow emoji="✨" label="Otros servicios" onPress={()=>setSettingsPage("services")}/>
       <SettingRow emoji="🎧" label="Soporte" onPress={()=>setSettingsPage("support")}/>
       <Pressable style={styles.signout} onPress={()=>void logout()}><Text style={styles.signoutText}>Cerrar sesión</Text></Pressable>
      </>:<>
       <Pressable style={styles.backRow} onPress={()=>setSettingsPage("menu")}><Text style={styles.backText}>‹  Ajustes</Text></Pressable>
       <Text style={styles.heading}>{({numbers:"Mi línea",billing:"Plan y billing",history:"Historial",security:"Seguridad",profile:"Perfil",style:"Idiomas y asistente",support:"Soporte",services:"Otros servicios",menu:"Ajustes"} as Record<typeof settingsPage,string>)[settingsPage]}</Text>
       {settingsPage==="numbers"?<>
        <View style={styles.card}><Text style={styles.cardTitle}>Verificación SMS</Text>
         {verificationLoading?<ActivityIndicator color={colors.accent}/>:phoneVerification?
          phoneVerification.verified?<Text style={styles.success}>✓ {phoneVerification.phone} verificado</Text>:
          <><Text style={styles.helper}>{phoneVerification.phone}</Text>
           {phoneVerification.requestStatus!=="pending"?<Text style={styles.helper}>Solicitud en revisión.</Text>:
            phoneVerification.smsAvailable?<><Button label={smsBusy?"Enviando…":"Enviar SMS"} disabled={smsBusy} onPress={()=>void sendSmsCode()}/>{smsSent?<><TextInput style={styles.field} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={10} placeholder="Código SMS" placeholderTextColor="#718D95" value={smsCode} onChangeText={v=>setSmsCode(v.replace(/[^0-9]/g,""))}/><Button label={smsBusy?"Verificando…":"Verificar"} disabled={smsBusy||smsCode.length<4} onPress={()=>void confirmSmsCode()}/></>:null}</>:<Text style={styles.helper}>Servicio SMS pendiente.</Text>}
          </>:<Button label="Consultar mi número" onPress={()=>void refreshPhoneVerification()}/>}
         {verifyMessage?<Text style={styles.verifyMessage}>{verifyMessage}</Text>:null}
        </View>
        <View style={styles.card}><Text style={styles.cardTitle}>Conexión con el operador</Text>
         <Text style={styles.helper}>Operador: {accountOverview?.carrier?accountOverview.carrier.replace("att","AT&T").replace("tmobile","T-Mobile").replace(/^./,v=>v.toUpperCase()):"Pendiente"}</Text>
         <Text style={styles.featureNumber}>{accountOverview?.twilioPhone||"Pendiente"}</Text>
         <Text style={styles.helper}>Menú bilingüe: {accountOverview?.menuPrepared?"Preparado para pruebas":"Pendiente"}</Text>
         <Text style={styles.helper}>Desvío con tu número: sin confirmar. Requiere una llamada real desde otro teléfono.</Text>
         <Pressable accessibilityRole="button" accessibilityState={{expanded:forwardHelpOpen}} onPress={()=>setForwardHelpOpen(!forwardHelpOpen)} style={styles.settingRow}>
          <Text style={styles.settingLabel}>Instrucciones del operador</Text><Text style={styles.settingChevron}>{forwardHelpOpen?"⌄":"›"}</Text>
         </Pressable>
         {forwardHelpOpen?<View style={{marginTop:15}}>
          {accountOverview?.forwardingReady&&accountOverview?.twilioPhone?
           <><Text style={styles.helper}>Verizon: *72 + {accountOverview.twilioPhone.slice(2)} para activar; *73 para desactivar. Comprueba la recepción primero.</Text>
            <Text style={styles.helper}>No desvíes llamadas de Twilio de vuelta a Verizon: crearías un bucle.</Text></>:
           <Text style={styles.helper}>Primero completa la verificación y autorización. Aún no está habilitado.</Text>}
         </View>:null}
        </View>
       </>:null}
       {settingsPage==="billing"?<View style={styles.card}><Text style={styles.cardTitle}>Mi plan</Text><Text style={styles.statNumber}>{billingOverview?.minutes.available??"—"}</Text><Text style={styles.helper}>Minutos disponibles</Text><Text style={styles.statusText}>{billingOverview?.plan||"Sin suscripción"}</Text><Text style={styles.helper}>Uso: {billingOverview?.minutes.used??"—"} min · Incluidos: {billingOverview?.minutes.included??"—"}</Text><Text style={styles.helper}>Los pagos de prueba no activan las llamadas reales.</Text><Button label="Actualizar" secondary onPress={()=>void refreshAccountOverview()}/><Button label="Elegir plan y configurar" secondary onPress={()=>{if(!activationProfile||!supabase)return;void (async()=>{
         const {data}=await supabase.from("smartjob_profiles").update({
          plan_prompt_seen:false,line_setup_completed:false,preferred_plan:null,updated_at:new Date().toISOString()
         }).eq("id",activationProfile.id).select("*").single();
         if(data)setActivationProfile(data as NativeProfile);
        })();}}/></View>:null}
       {settingsPage==="history"?<View style={styles.card}>
         <View style={styles.compactBetween}><Text style={styles.cardTitle}>Llamadas</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial" onPress={()=>void refreshCallHistory()} style={styles.historyRefresh}><Text style={styles.historyRefreshText}>{historyBusy?"…":"↻"}</Text></Pressable>
         </View>
         {historyBusy?<ActivityIndicator color={colors.accent}/>:callHistory.length?
          callHistory.map(item=><View key={item.bridge_sid} style={styles.historyRow}>
           <View style={{flex:1}}><Text style={styles.historyDate}>{new Date(item.started_at).toLocaleDateString("es-US",{month:"short",day:"numeric"})} · {new Date(item.started_at).toLocaleTimeString("es-US",{hour:"numeric",minute:"2-digit"})}</Text>
           <Text style={styles.historyStatus}>{({"completed":"Finalizada","no-answer":"Sin respuesta","busy":"Ocupada","ringing":"Sonando","failed":"Fallida","canceled":"Cancelada"} as Record<string,string>)[item.status]||"Llamada"}</Text></View>
           <Text style={styles.historyMinutes}>{item.duration_seconds==null?"—":Math.ceil(item.duration_seconds/60)+" min"}</Text>
          </View>):<Text style={styles.helper}>Aún no hay llamadas.</Text>}
        </View>:null}
       {settingsPage==="profile"?<View style={styles.card}><Text style={styles.cardTitle}>Mi cuenta</Text><Text style={styles.helper}>{session.user.email}</Text><Text style={styles.helper}>Los datos del perfil pueden editarse en la web.</Text></View>:null}
       {settingsPage==="security"?<View style={styles.card}><Text style={styles.cardTitle}>Acceso seguro</Text><Text style={styles.helper}>No compartas tu contraseña ni códigos de verificación.</Text><Button label="Cerrar sesión" danger onPress={()=>void logout()}/></View>:null}
       {settingsPage==="style"?<>
         <View style={styles.card}>
          <Text style={styles.cardTitle}>Idiomas</Text>
          <Text style={styles.helper}>Tu idioma</Text>
          <View style={styles.languageChoice}><Pressable style={[styles.languageOption,assistantPrefs.desired_language==="es"&&styles.languageSelected]} onPress={()=>setAssistantPrefs({...assistantPrefs,desired_language:"es",caller_language:"en"})}><Text style={styles.languageOptionText}>Español</Text></Pressable><Pressable style={[styles.languageOption,assistantPrefs.desired_language==="en"&&styles.languageSelected]} onPress={()=>setAssistantPrefs({...assistantPrefs,desired_language:"en",caller_language:"es"})}><Text style={styles.languageOptionText}>English</Text></Pressable></View>
          <Text style={styles.helper}>Cliente: {assistantPrefs.caller_language==="en"?"English":"Español"}</Text>
          <Text style={styles.cardTitle}>Asistente</Text>
          <TextInput style={styles.field} placeholder="Nombre de tu asistente" placeholderTextColor="#718D95" maxLength={40} value={assistantPrefs.assistant_name} onChangeText={v=>setAssistantPrefs({...assistantPrefs,assistant_name:v})}/>
          <Text style={styles.helper}>Tu número actual</Text>
          <TextInput style={styles.field} keyboardType="phone-pad" placeholder="+17060000000" placeholderTextColor="#718D95" value={assistantPrefs.existing_phone} onChangeText={v=>setAssistantPrefs({...assistantPrefs,existing_phone:v})}/>
          <Button label={customizationBusy?"Guardando…":"Guardar preferencias"} disabled={customizationBusy} onPress={()=>void saveAssistantPrefs()}/>
         </View>
         <View style={styles.card}>
          <Text style={styles.cardTitle}>Saludo de llamadas</Text>
          <Text style={styles.helper}>Todos los planes preguntan español o inglés. Personaliza la introducción con Pro o Premium activo.</Text>
          <TextInput style={[styles.field,styles.greetingEditor]} multiline textAlignVertical="top" maxLength={180} editable={greetingEditable&&!customizationBusy}
           placeholder="Gracias por llamar..." placeholderTextColor="#718D95"
           value={greetingPrefs.greeting_customer} onChangeText={v=>setGreetingPrefs({...greetingPrefs,greeting_customer:v})}/>
          <Text style={styles.helper}>{greetingPrefs.greeting_customer.length}/180 caracteres</Text>
          <Button label={customizationBusy?"Guardando…":"Guardar saludo"} disabled={customizationBusy||!greetingEditable} onPress={()=>void saveGreetingPrefs()}/>
          {!greetingEditable?<Text style={styles.helper}>Requiere un plan Pro o Premium activo.</Text>:null}
         </View>
         {customizationMessage?<Text style={styles.helper}>{customizationMessage}</Text>:null}
        </>:null}
       {settingsPage==="support"?<View style={styles.card}><Text style={styles.cardTitle}>Diagnóstico de voz</Text><Text style={styles.helper}>{voiceDiagnostic}</Text><Text style={styles.helper}>{status}</Text><Button label="Actualizar conexión" onPress={()=>void registerPhone()} disabled={registering}/></View>:null}
       {settingsPage==="services"?<View style={styles.card}><Text style={styles.cardTitle}>Intérprete en persona</Text><Text style={styles.helper}>Traduce mensajes sin hacer una llamada.</Text><Button label="Abrir traductor" onPress={()=>setActiveTab("live")}/></View>:null}
      </>}
     </>:null}
    </>}
    {error?<View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{error}</Text></View>:null}
    {working?<ActivityIndicator style={{marginTop:12}} color={colors.accent}/>:null}
   </ScrollView>
   {session&&!keyboardVisible?<View style={styles.bottomDock}>{([{id:"home",emoji:"🏠",label:"Inicio"},{id:"calls",emoji:"📞",label:"Llamadas"},{id:"live",emoji:"🎙️",label:"Traductor"},{id:"settings",emoji:"⚙️",label:"Ajustes"}] as const).map(item=><Pressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:activeTab===item.id}} onPress={()=>{setError("");setActiveTab(item.id);if(item.id==="settings")setSettingsPage("menu");}} style={styles.bottomItem}><View style={[styles.bottomOrb,activeTab===item.id&&styles.bottomOrbActive]}><Text style={styles.bottomEmoji}>{item.emoji}</Text></View><Text style={[styles.bottomLabel,activeTab===item.id&&styles.bottomLabelActive]}>{item.label}</Text></Pressable>)}</View>:null}
  </KeyboardAvoidingView>
  {session&&activationProfile&&!activationProfile.plan_prompt_seen?
   <NativeActivation session={session} profile={activationProfile} onComplete={setActivationProfile}/>:null}
  <Modal visible={!!invite||!!call} animationType="fade" presentationStyle="fullScreen" onRequestClose={()=>{}}>
   <View style={styles.incomingRoot}><StatusBar barStyle="dark-content" backgroundColor="#EBF8F5"/>
    <View style={styles.incomingGlow}/><View style={styles.incomingCard}>
     <Text style={styles.incomingKicker}>VMV CALL · {call?"EN LLAMADA":"LLAMADA ENTRANTE"}</Text>
     <Text style={styles.incomingSymbol}>◉</Text>
     <Text style={styles.incomingName}>{call?"Estás conectado":"Llamada de cliente"}</Text>
     <Text style={styles.incomingLang}>{inboundLanguage==="es"?"Español · directo":inboundLanguage==="en"?"English ⇄ Español":"VMV Call"}</Text>
     <Text style={styles.incomingStatus}>{call?status:"Toca Aceptar para iniciar la conversación"}</Text>
      {inboundLanguage==="en"?<View style={styles.incomingTranslationPill}><Text style={styles.incomingTranslationText}>✧ Traducción en vivo · OpenAI</Text></View>:null}
     <View style={styles.incomingActions}>
      {invite?<><Pressable style={[styles.incomingRound,{backgroundColor:"#AD3F56"}]} accessibilityLabel="Rechazar llamada" onPress={()=>void reject()}><Text style={styles.incomingActionIcon}>✕</Text><Text style={styles.incomingActionText}>Rechazar</Text></Pressable>
       <Pressable style={[styles.incomingRound,{backgroundColor:"#248E71"}]} accessibilityLabel="Contestar llamada" disabled={working} onPress={()=>void accept()}><Text style={styles.incomingActionIcon}>☎</Text><Text style={styles.incomingActionText}>Aceptar</Text></Pressable></>:
       <Pressable style={[styles.incomingRound,{backgroundColor:"#AD3F56"}]} accessibilityLabel="Finalizar llamada" onPress={()=>void end()}><Text style={styles.incomingActionIcon}>☎</Text><Text style={styles.incomingActionText}>Finalizar</Text></Pressable>}
     </View>
    </View>
   </View>
  </Modal>
 </SafeAreaView>;
}
function SettingRow({emoji,label,onPress}:{emoji:string;label:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingRow}>
   <View style={styles.settingIcon}><Text style={styles.settingEmoji}>{emoji}</Text></View><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingChevron}>›</Text>
 </Pressable>;
}

function Button({label,onPress,disabled,secondary,danger}:{label:string,onPress:()=>void,disabled?:boolean,secondary?:boolean,danger?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled}} disabled={disabled}
   onPress={onPress} style={[styles.btn,secondary&&styles.secondary,danger&&styles.danger,disabled&&{opacity:.52}]}>
   <Text style={[styles.btnText,(secondary||danger)&&{color:colors.text}]}>{label}</Text>
 </Pressable>;
}
const styles=StyleSheet.create({
 // Mint cards use only two image placeholders; native image files can replace these later.
 homeSubtitle:{fontSize:15,color:"#727885",marginBottom:16,marginTop:-9},
 homeFeatureCard:{flexDirection:"row",alignItems:"stretch",borderRadius:26,padding:18,borderWidth:1,borderColor:"#D5EFEB",marginBottom:18,overflow:"hidden"},
 homeCallsFeature:{backgroundColor:"#E5FBF5",minHeight:226},
 homeCallsIllustrated:{flexDirection:"column",alignItems:"center",justifyContent:"center",paddingHorizontal:14,paddingVertical:9,minHeight:180},
 homeCallIllustration:{height:116,width:"100%",alignItems:"center",justifyContent:"center"},
 homeCallArtwork:{height:"100%",width:"100%"},

 homeTranslatorFeature:{backgroundColor:"#F3FFFB",minHeight:164},
 homeTranslatorIllustrated:{flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:162,paddingHorizontal:14,paddingVertical:9},
 homeTranslatorIllustration:{height:103,width:"100%",alignItems:"center",justifyContent:"center"},
 homeTranslatorArtwork:{height:"100%",width:"100%"},
 homePlaceholderWide:{flex:0,width:"100%",height:"100%",marginLeft:0},

 homeFeatureCopy:{flex:1.2,justifyContent:"space-between",paddingVertical:8,minWidth:0},
 homeFeatureTitle:{fontSize:26,lineHeight:29,fontWeight:"800",letterSpacing:-1.1,color:"#141B28"},
 homeFeatureSub:{color:"#687784",fontSize:13,lineHeight:18,marginTop:10},
 homePrimaryButton:{borderRadius:29,backgroundColor:"#00B496",paddingVertical:13,paddingHorizontal:18,marginTop:10,alignItems:"center",justifyContent:"center",minHeight:47,width:"100%",maxWidth:298},
 homePrimaryText:{color:"#FFFFFF",fontSize:15,fontWeight:"800"},
 homeSecondaryButton:{borderRadius:29,backgroundColor:"#BFF8E8",paddingVertical:13,paddingHorizontal:15,marginTop:10,alignItems:"center",justifyContent:"center",minHeight:47,width:"100%",maxWidth:298},
 homeSecondaryText:{color:"#07674E",fontSize:14,fontWeight:"800"},
 homeImageSlot:{flex:.8,minWidth:100,borderWidth:1.5,borderStyle:"dashed",borderColor:"#51CDB4",borderRadius:19,backgroundColor:"#C9F8EA",alignItems:"center",justifyContent:"center",marginLeft:10,padding:7},
 homeImageSlotSmall:{backgroundColor:"#E1FFF6",borderColor:"#8DDECA"},
 homeImageLabel:{fontSize:18,fontWeight:"900",color:"#05735D",textAlign:"center"},
 homeImageDescription:{fontSize:10,color:"#5F8E84",textAlign:"center",marginTop:8},
 homeFlag:{fontSize:30,marginRight:8},
 homeLineCard:{flexDirection:"row",alignItems:"center",gap:10,minHeight:88,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0EDE9",borderRadius:23,padding:13,marginTop:12,marginBottom:18},
 homeLineIcon:{width:45,height:45,borderRadius:15,alignItems:"center",justifyContent:"center",backgroundColor:"#CBFBEA"},
 homeLineEmoji:{fontSize:24,color:"#087B61"},
 homeLineTitle:{fontSize:17,fontWeight:"800",color:"#111827"},
 homeLineNumber:{fontSize:11,color:"#6F7B84",marginTop:5},
 homeLineStatus:{borderRadius:22,backgroundColor:"#E3FFF0",paddingVertical:8,paddingHorizontal:8},
 homeLineStatusText:{fontSize:10,fontWeight:"800",color:"#147750"},
 brandWave:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:3,height:35},
 brandWaveBar:{width:4,borderRadius:4,backgroundColor:"#063B32"},

 safe:{flex:1,backgroundColor:colors.bg},
 content:{flexGrow:1,paddingHorizontal:22,paddingTop:22,paddingBottom:46,maxWidth:620,width:"100%",alignSelf:"center"},
 brand:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:30},
 brandMark:{width:50,height:50,borderRadius:16,backgroundColor:"#1CE0BC",alignItems:"center",justifyContent:"center"},
 brandIcon:{fontSize:23,fontWeight:"900",color:colors.accentText},
 brandText:{color:colors.text,fontSize:24,fontWeight:"900",letterSpacing:-1.3},
 kicker:{color:"#06A887",fontSize:11,fontWeight:"800",letterSpacing:2.6,marginBottom:12},
 heading:{color:colors.text,fontSize:39,fontWeight:"800",lineHeight:45,letterSpacing:-1.7,marginBottom:16},
 description:{color:colors.muted,fontSize:15,lineHeight:24,marginBottom:25},
 card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.line,borderRadius:23,padding:21,marginBottom:18},
 cardTitle:{color:colors.text,fontSize:21,fontWeight:"800",marginBottom:8},
 helper:{color:colors.muted,fontSize:13,lineHeight:21,marginBottom:17},
 field:{height:53,borderRadius:13,borderWidth:1,borderColor:"#D0E3E1",backgroundColor:"#FCFFFE",
   paddingHorizontal:15,color:colors.text,fontSize:16,marginBottom:13},
 btn:{backgroundColor:colors.accent,minHeight:52,borderRadius:13,alignItems:"center",justifyContent:"center",padding:13,marginTop:12},
 btnText:{fontSize:15,fontWeight:"800",color:colors.accentText},
 secondary:{backgroundColor:"#E4F8F1"},
 danger:{backgroundColor:"#F5D7DD"},
 statusRow:{flexDirection:"row",alignItems:"center",gap:10,marginTop:12,marginBottom:12},
 dot:{width:9,height:9,borderRadius:5},
 statusText:{flex:1,fontSize:14,color:colors.text,fontWeight:"700"},
 callLabel:{fontSize:11,fontWeight:"800",color:colors.accent,letterSpacing:1.8},
 bigCall:{fontSize:27,fontWeight:"800",color:colors.text,marginVertical:12},
 notice:{backgroundColor:"#F2FCF8",borderRadius:17,borderWidth:1,borderColor:"#D4EAE4",padding:17},
 noticeTitle:{fontSize:14,fontWeight:"800",color:colors.text,marginBottom:7},
 noticeBody:{fontSize:13,color:colors.muted,lineHeight:21},
 signout:{alignSelf:"center",padding:15,marginTop:13},
 signoutText:{fontSize:13,fontWeight:"700",color:colors.muted},
 alert:{borderWidth:1,borderColor:"#EFB7C5",backgroundColor:"#FFF2F5",borderRadius:13,padding:15,marginBottom:16},
 alertText:{fontSize:13,color:"#AD4160",lineHeight:20},
 success:{fontSize:14,color:colors.accent,lineHeight:22,fontWeight:"700"},
 verifyMessage:{fontSize:13,color:colors.text,lineHeight:21,marginTop:13},
 footer:{color:"#617380",fontSize:10,fontWeight:"700",letterSpacing:1.4,alignSelf:"center",marginTop:26},
 headerAvatar:{marginLeft:"auto",width:43,height:43,borderRadius:23,alignItems:"center",justifyContent:"center",backgroundColor:"#BDF3E7"},
 headerAvatarText:{fontSize:17,color:"#006746",fontWeight:"800"},
 featureCard:{backgroundColor:"#E5FBF3",borderColor:"#C7EDE0",padding:21},
 compactBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 featureLabel:{fontSize:13,color:colors.text,fontWeight:"800"},
 stateTag:{fontSize:11,fontWeight:"800",letterSpacing:.5},
 featureNumber:{fontSize:24,color:colors.text,fontWeight:"800",marginTop:26,letterSpacing:-.6},
 featureMuted:{fontSize:12,color:"#72867E",marginTop:6},
 sectionHeading:{fontSize:23,color:colors.text,fontWeight:"800",marginTop:13,marginBottom:15},
 langPair:{flexDirection:"row",gap:8,alignItems:"center",marginBottom:18},
 langBox:{flex:1,flexDirection:"row",alignItems:"center",backgroundColor:"#F1FFFA",borderWidth:1,borderColor:"#D2EAE5",borderRadius:19,padding:12},
 langCode:{fontSize:23,color:colors.text,fontWeight:"800"},
 langSub:{fontSize:11,color:colors.muted,marginTop:4},
 langSwap:{fontSize:25,color:colors.accent},
 statRow:{flexDirection:"row",gap:11,marginBottom:15},
 statCard:{flex:1,borderWidth:1,borderColor:colors.line,borderRadius:18,backgroundColor:colors.card,padding:17},
 statEmoji:{fontSize:21,marginBottom:12},
 statNumber:{fontSize:31,color:colors.text,fontWeight:"800",marginBottom:6},
 statLabel:{fontSize:11,color:colors.muted},
 quickRow:{flexDirection:"row",gap:10,marginVertical:10},
 quickButton:{flex:1,borderRadius:14,padding:15,backgroundColor:"#1A363E",alignItems:"center"},
 quickButtonText:{color:colors.text,fontSize:14,fontWeight:"800"},
 bottomDock:{position:"absolute",bottom:5,left:12,right:12,height:78,backgroundColor:"#FFFFFF",borderRadius:27,borderWidth:1,borderColor:"#E4EEEE",flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingHorizontal:6},
 bottomItem:{flex:1,alignItems:"center",justifyContent:"center",height:74},
 bottomOrb:{width:42,height:42,borderRadius:24,alignItems:"center",justifyContent:"center"},
 bottomOrbActive:{backgroundColor:"#C5F9E9",width:49,height:43,borderRadius:18,borderWidth:0},
 bottomEmoji:{fontSize:22},
 bottomLabel:{color:"#6C7582",fontSize:10,fontWeight:"700",marginTop:1},
 bottomLabelActive:{color:"#0A7658",marginTop:0},
 groupTitle:{color:"#06A886",fontSize:11,fontWeight:"800",letterSpacing:1.7,marginTop:20,marginBottom:8},
 languageChoice:{flexDirection:"row",gap:10,marginVertical:11},
 languageOption:{flex:1,alignItems:"center",justifyContent:"center",padding:13,backgroundColor:"#F0FDF9",borderRadius:12,borderWidth:1,borderColor:"#CEEAE4"},
 languageSelected:{borderColor:colors.accent,backgroundColor:"#D6FAED"},
 languageOptionText:{fontSize:14,fontWeight:"700",color:colors.text},
 greetingEditor:{height:105,paddingTop:12},


 historyRefresh:{width:38,height:38,borderRadius:12,backgroundColor:"#21414A",alignItems:"center",justifyContent:"center"},
 historyRefreshText:{fontSize:25,color:colors.accent},
 historyRow:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderBottomColor:colors.line,paddingVertical:14,gap:12},
 historyDate:{fontSize:13,color:colors.text,fontWeight:"700"},
 historyStatus:{fontSize:11,color:colors.muted,marginTop:4},
 historyMinutes:{fontSize:12,color:colors.accent,fontWeight:"700"},

 settingRow:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#E3EEEB"},
 settingIcon:{width:39,height:39,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:"#E3FAF2"},
 settingEmoji:{fontSize:19},
 settingLabel:{flex:1,color:colors.text,fontWeight:"700",fontSize:14},
 settingChevron:{fontSize:24,color:"#83959A"},
 backRow:{paddingBottom:20},
 backText:{color:colors.accent,fontSize:15,fontWeight:"700"},
 speakerRow:{flexDirection:"row",gap:12,marginBottom:15},
 speakerCard:{flex:1,backgroundColor:"#E1FAF2",borderWidth:1,borderColor:"#BDECDD",borderRadius:16,padding:13,alignItems:"center"},
 speakerActive:{backgroundColor:"#C3F9E8",borderColor:"#20C9A7"},
 speakerEmoji:{fontSize:25,marginBottom:6},
 speakerText:{color:colors.text,fontSize:15,fontWeight:"800"},
 consentRow:{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:10},
 consentCheck:{fontSize:22,color:colors.accent},
 consentText:{flex:1,fontSize:12,color:colors.muted,lineHeight:18},
 resultOriginal:{color:colors.muted,fontSize:13,marginBottom:13},
 resultSay:{color:colors.text,fontSize:21,lineHeight:30,fontWeight:"700"},
 emptyCard:{borderWidth:1,borderColor:colors.line,borderRadius:17,padding:22,alignItems:"center",marginBottom:16},
 emptyIcon:{color:colors.accent,fontSize:30},
 incomingRoot:{flex:1,backgroundColor:"#EBF8F5",justifyContent:"center",padding:18},
 incomingGlow:{position:"absolute",left:-80,right:-60,top:-120,height:400,borderRadius:240,backgroundColor:"#BBF3E5",opacity:.5},
 incomingCard:{flex:1,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D1EAE2",borderRadius:28,marginVertical:20,padding:22,alignItems:"center"},
 incomingKicker:{color:"#357B6B",letterSpacing:1.5,fontSize:11,fontWeight:"800",marginTop:28},
 incomingSymbol:{fontSize:61,color:colors.accent,marginTop:85},
 incomingName:{fontSize:32,fontWeight:"800",color:colors.text,marginTop:30,textAlign:"center"},
 incomingLang:{color:"#4D726B",fontSize:14,marginTop:11},
 incomingStatus:{color:"#607C76",fontSize:12,marginTop:24,textAlign:"center"},
 incomingActions:{flexDirection:"row",justifyContent:"space-around",alignItems:"center",marginTop:"auto",width:"100%",marginBottom:60},
 previewPilotCard:{backgroundColor:"#E8FAF4",borderWidth:1,borderColor:"#B3EBDA",borderRadius:16,padding:14,marginTop:16,marginBottom:10,gap:8},
 previewPilotLabel:{color:"#08765C",fontSize:11,fontWeight:"900",letterSpacing:0.7},
 previewPilotCopy:{color:"#244F44",fontSize:13,lineHeight:20},
 previewPilotMinutes:{color:"#026D56",fontSize:16,fontWeight:"800"},
 incomingTranslationPill:{marginTop:24,backgroundColor:"#E2F9F1",borderRadius:40,paddingHorizontal:18,paddingVertical:12,borderWidth:1,borderColor:"#BAEBDD"},
 incomingTranslationText:{color:"#067D63",fontSize:12,fontWeight:"800"},
 incomingRound:{width:104,height:100,borderRadius:52,alignItems:"center",justifyContent:"center",marginHorizontal:9},
 incomingActionIcon:{color:"#FFFFFF",fontSize:28,fontWeight:"700"},
 incomingActionText:{color:"#FFFFFF",fontSize:12,marginTop:5,fontWeight:"700"}

});
