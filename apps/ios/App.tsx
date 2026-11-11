import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Platform,Pressable,
 SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,Modal,Keyboard,Linking} from "react-native";
import {Voice,Call,CallInvite} from "@twilio/voice-react-native-sdk";
import type {Session} from "@supabase/supabase-js";
import Ionicons from "@expo/vector-icons/Ionicons";
import {api,supabase,configured} from "./session";
import {InterpreterPanel} from "./InterpreterPanel";
import {CallScreen} from "./CallScreen";
import {SmartCallControlCenter} from "./SmartCallControlCenter";
import {ContactsPanel} from "./ContactsPanel";
import {DialPad} from "./DialPad";
import {NativeActivation,type NativeProfile} from "./NativeActivation";
import {FALLBACK_MODULES,loadBusinessModules,openBusinessWorkspace,type BusinessModule} from "./businessWorkspace";

const colors={bg:"#F8FBFA",card:"#FFFFFF",line:"#DCE8E6",text:"#151D2A",
 muted:"#6D7784",accent:"#00B997",accentText:"#06392E",red:"#E25673"};
const voice=new Voice();
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
 const [session,setSession]=useState<Session|null>(null);
 const [activationProfile,setActivationProfile]=useState<NativeProfile|null>(null);
 const [activeTab,setActiveTab]=useState<"home"|"services"|"calls"|"live"|"settings">("home");
  const [callsView,setCallsView]=useState<"dial"|"history"|"contacts">("dial");
  const [callTypeFilter,setCallTypeFilter]=useState<"all"|"direct"|"translated">("all");
  const [contactsPhone,setContactsPhone]=useState("");
  const [contactsFromHistory,setContactsFromHistory]=useState(false);
 const [businessModules,setBusinessModules]=useState<BusinessModule[]>(FALLBACK_MODULES);
 const [activeModule,setActiveModule]=useState<string|null>(null);
 const [keyboardVisible,setKeyboardVisible]=useState(false),[forwardHelpOpen,setForwardHelpOpen]=useState(false);
 const [settingsPage,setSettingsPage]=useState<"menu"|"numbers"|"billing"|"history"|"security"|"profile"|"style"|"support"|"services">("menu");
 const [callHistory,setCallHistory]=useState<{bridge_sid:string;status:string;duration_seconds:number|null;started_at:string;call_mode:string;caller_phone:string|null}[]>([]);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [callbackBusy,setCallbackBusy]=useState<string|null>(null);
 const [callerLookupBusy,setCallerLookupBusy]=useState<string|null>(null);
 const [callbackNotice,setCallbackNotice]=useState("");
 const [directCallbackActive,setDirectCallbackActive]=useState(false);
 const [assistantPrefs,setAssistantPrefs]=useState({existing_phone:"",desired_language:"es",caller_language:"en",assistant_name:""});
 const [greetingPrefs,setGreetingPrefs]=useState({voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""});
 const [greetingEditable,setGreetingEditable]=useState(false);
 const [customizationBusy,setCustomizationBusy]=useState(false),[customizationMessage,setCustomizationMessage]=useState("");
 const [inboundLanguage,setInboundLanguage]=useState<"es"|"en"|"unknown">("unknown");
 // Public catalog metadata, never a source of subscriptions or permissions.
 useEffect(()=>{
   if(!session?.user.id||!(activeTab==="services"||(activeTab==="settings"&&settingsPage==="services")))return;
   let mounted=true;
   void loadBusinessModules().then(modules=>{if(mounted)setBusinessModules(modules);});
   return()=>{mounted=false;};
 },[session?.user.id,activeTab,settingsPage]);
 async function openBusinessWeb(serviceId?:string){
   try{await openBusinessWorkspace(serviceId);}
   catch{Alert.alert("No se pudo abrir la web","Revisa tu conexión e inténtalo nuevamente.");}
 }
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [working,setWorking]=useState(false),[registering,setRegistering]=useState(false);

 const [ready,setReady]=useState(false),[status,setStatus]=useState("Prepara la recepción de llamadas");
 const [invite,setInvite]=useState<CallInvite|null>(null),[call,setCall]=useState<Call|null>(null);
 const [error,setError]=useState("");
 const [voiceDiagnostic,setVoiceDiagnostic]=useState("Esperando registro PushKit/Twilio.");
 const [lastVoiceAttempt,setLastVoiceAttempt]=useState("Aún no se ha intentado");
 const [accountOverview,setAccountOverview]=useState<{
  verified:boolean;connectedToApp:boolean;forwardingReady:boolean;twilioPhone:string|null;
  publicPhone:string|null;carrier:string|null;menuPrepared?:boolean;menuVerifiedByRealCall?:boolean;forwardingReported?:boolean;usage:{calls:number;completed:number;minutes:number;periodDays:number;directCalls?:number;translatedCalls?:number};
  billing:{enabled:boolean;active?:boolean;pilot?:boolean;message:string;availableMinutes?:number};
 }|null>(null);
 const [overviewBusy,setOverviewBusy]=useState(false);
 const [pilotChecking,setPilotChecking]=useState(false);
 const [pilotReadiness,setPilotReadiness]=useState<{lineReady:boolean;engineReady:boolean;webhookChecked:boolean;webhookReady:boolean;webhookPost:boolean;pushConfigured:boolean;nextStep:string}|null>(null);
 const [billingOverview,setBillingOverview]=useState<{
  plan:string;status:string;previewPilotActive?:boolean;minutes:{included:number;used:number;available:number;rollover:number;topup:number};
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
 const registrationInFlight=useRef(false);
 const callbackRequestedAt=useRef(0);
 const directCallbackRef=useRef(false);
 const sessionRef=useRef<Session|null>(null);
 const pendingBusinessLink=useRef<"calls"|"services"|null>(null);
 useEffect(()=>{
   const processLink=(url:string|null)=>{
     if(!url)return;
     // Only accept these two fixed routes. Never parse auth tokens from links.
     const route=/^smartjob:\/\/(calls|services)\/?$/.exec(url);
     if(!route)return;
     const target=route[1] as "calls"|"services";
     pendingBusinessLink.current=target;
     if(sessionRef.current?.user){
       setActiveTab(target==="calls"?"calls":"services");
       if(target==="services")setActiveModule(null);
       pendingBusinessLink.current=null;
     }
   };
   const subscription=Linking.addEventListener("url",event=>processLink(event.url));
   void Linking.getInitialURL().then(processLink).catch(()=>{});
   return()=>subscription.remove();
 },[]);
 useEffect(()=>{
   if(!session?.user.id||!pendingBusinessLink.current)return;
   const target=pendingBusinessLink.current;
   pendingBusinessLink.current=null;
   setActiveTab(target==="calls"?"calls":"services");
   if(target==="services")setActiveModule(null);
 },[session?.user.id]);
 // Pilot-only diagnostic events; no recordings, transcripts, phone numbers or tokens.
 // A signed Supabase session and active iOS route are required by database RLS.
 function voiceTelemetry(event_type:
   "app_open"|"pushkit_ok"|"pushkit_error"|"register_attempt"|"register_ok"|
   "register_error"|"sdk_error"|"invite_received"|"invite_canceled"|
   "invite_accepted"|"call_connected"|"call_failed"|"call_disconnected"|"call_ended",
   code?:string|number){
   const user_id=sessionRef.current?.user.id;
   if(!user_id||!supabase)return;
   const raw=code===undefined?"":String(code);
   const error_code=/^[A-Za-z0-9_-]{1,32}$/.test(raw)?raw:null;
   void supabase.from("smartjob_ios_voice_events").insert({
     user_id,event_type,error_code,app_build:"0.4.3-8"
   }).then(({error:uploadError})=>{
     if(uploadError)console.warn("VMV voice diagnostic delivery failed",uploadError.code);
   });
 }
 useEffect(()=>{if(session?.user.id)voiceTelemetry("app_open");},[session?.user.id]);
 useEffect(()=>{
   const client=supabase;
   if(!client)return;
   let mounted=true;
   client.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);sessionRef.current=data.session;}});
   const {data}=client.auth.onAuthStateChange((_event,next)=>{
     if(!mounted)return;
     setSession(next);sessionRef.current=next;
     if(!next){setReady(false);setPhoneVerification(null);setSmsCode("");setSmsSent(false);setStatus("Inicia sesión para recibir llamadas");setCallHistory([]);setCallsView("dial");setCallTypeFilter("all");setContactsPhone("");}
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
   // Do not keep a module-global listener bound to a previous React mount.
   // After a screen reload that stale callback can swallow CallInvite events.
   const onInvite=(incoming:CallInvite)=>{
      const callbackExpected=callbackRequestedAt.current>0&&
       Date.now()-callbackRequestedAt.current<60000;
      directCallbackRef.current=callbackExpected;
      setDirectCallbackActive(callbackExpected);
     setVoiceDiagnostic("Twilio entregó una invitación de llamada al iPhone.");
     voiceTelemetry("invite_received");
     inviteRef.current=incoming;setInvite(incoming);
     setStatus("Llamada entrante");
     const details=(incoming as unknown as {customParameters?:Map<string,string>|Record<string,string>}).customParameters;
     const language=details instanceof Map?details.get("vmv_language"):details?.vmv_language;
     setInboundLanguage(language==="es"?"es":language==="en"?"en":"unknown");
     const dismissInvite=()=>{
       if(inviteRef.current!==incoming)return;
       inviteRef.current=null;setInvite(null);
       setInboundLanguage("unknown");setStatus("La llamada terminó antes de contestar");
        directCallbackRef.current=false;setDirectCallbackActive(false);callbackRequestedAt.current=0;
       setVoiceDiagnostic("Twilio canceló la invitación antes de contestar.");
       voiceTelemetry("invite_canceled");
     };
     incoming.on(CallInvite.Event.Cancelled,dismissInvite);
     incoming.on(CallInvite.Event.Rejected,dismissInvite);
     incoming.on(CallInvite.Event.Accepted,(accepted:Call)=>{
       voiceTelemetry("invite_accepted");
       connectCall(accepted);
     });
   };
   const onVoiceError=(event:unknown)=>{
     const e=event as {code?:string|number;name?:string};
     const code=typeof e?.code==="string"||typeof e?.code==="number"?String(e.code):"sin código";
     const name=typeof e?.name==="string"?e.name.slice(0,80):"Error del SDK";
     setVoiceDiagnostic("Twilio SDK: "+name+" ("+code+").");
     voiceTelemetry("sdk_error",code);
     setError("La conexión de voz tuvo un problema. Consulta el diagnóstico de voz.");
   };
   voice.on(Voice.Event.CallInvite,onInvite);
   voice.on(Voice.Event.Error,onVoiceError);
   return()=>{
     voice.off(Voice.Event.CallInvite,onInvite);
     voice.off(Voice.Event.Error,onVoiceError);
   };
 },[]);
 useEffect(()=>{
   // Register PushKit as soon as the app starts, not only when the user taps a button.
   void ensurePushRegistry().then(()=>{
     voiceTelemetry("pushkit_ok");
     setVoiceDiagnostic(prev=>prev==="Esperando registro PushKit/Twilio."?
       "PushKit inicializado. Pendiente de registrar el dispositivo con Twilio.":prev);
   }).catch((cause:unknown)=>{
     const reason=cause instanceof Error?cause.message:"Error desconocido";
     setVoiceDiagnostic("PushKit no pudo inicializarse: "+reason.slice(0,160));
     voiceTelemetry("pushkit_error",cause instanceof Error?cause.name:"unknown");
   });
 },[]);
 function clearCallState(connected:Call,message="Llamada finalizada"){
   if(callRef.current!==connected)return;
   callRef.current=null;setCall(null);setStatus(message);
    directCallbackRef.current=false;setDirectCallbackActive(false);callbackRequestedAt.current=0;
 }
 async function detectDirectCallback(connected:Call){
  if(!supabase||!sessionRef.current)return;
  const sid=connected.getSid();
  if(!sid||!/^CA[a-f\d]{32}$/i.test(sid))return;
  try{
   const {data:session}=await supabase.auth.getSession();
   if(!session.session||session.session.user.id!==sessionRef.current.user.id)return;
   const response=await fetch(api+"/api/ios/callback?legSid="+encodeURIComponent(sid),{
    headers:{Authorization:"Bearer "+session.session.access_token}
   });
   const result=await response.json().catch(()=>null);
   if(response.ok&&result?.isCallback===true&&callRef.current===connected){
    directCallbackRef.current=true;setDirectCallbackActive(true);
    setStatus("Llamada normal con cliente");
   }
  }catch{/* The live call is not interrupted by a diagnostic request. */}
 }
 function connectCall(connected:Call){
   if(callRef.current===connected)return;
   callRef.current=connected;setCall(connected);setInvite(null);inviteRef.current=null;
    setStatus(directCallbackRef.current?"Conectando con el cliente…":"Conectando interpretación…");
   connected.addListener(Call.Event.Connected,()=>{
     if(callRef.current===connected)setStatus(directCallbackRef.current?"En llamada normal":"En llamada con interpretación");
      void detectDirectCallback(connected);
     voiceTelemetry("call_connected");
   });
   connected.addListener(Call.Event.ConnectFailure,(cause:unknown)=>{
     const e=cause as {code?:number|string;message?:string}|null;
     setVoiceDiagnostic("Twilio no pudo conectar la llamada ("+String(e?.code||"sin código")+").");
     voiceTelemetry("call_failed",e?.code||"unknown");
     clearCallState(connected,"No se pudo conectar la llamada");
   });
   connected.addListener(Call.Event.Disconnected,(cause:unknown)=>{
     const e=cause as {code?:number|string}|null;
     if(e?.code)setVoiceDiagnostic("Llamada desconectada: código Twilio "+String(e.code));
     voiceTelemetry("call_disconnected",e?.code||"none");
     clearCallState(connected);
   });
   if(connected.getState()===Call.State.Disconnected)clearCallState(connected);
    else if(connected.getState()===Call.State.Connected)void detectDirectCallback(connected);
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
    else{setBillingOverview(null);setError("No pudimos consultar tu suscripción VMV. Comprueba la conexión y pulsa Actualizar.");}
   }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}
   finally{setOverviewBusy(false);}
 }
 useEffect(()=>{
  if(!session?.user.id){setAccountOverview(null);setBillingOverview(null);return;}
  void refreshAccountOverview();
 },[session?.user.id]);
 async function refreshCallHistory(){
  if(!supabase||!sessionRef.current)return;
  setHistoryBusy(true);
  try{
   const {data,error:historyError}=await supabase.from("smartjob_call_sessions")
     .select("bridge_sid,status,duration_seconds,started_at,call_mode,caller_phone")
     .eq("owner_id",sessionRef.current.user.id).order("started_at",{ascending:false}).limit(25);
   if(historyError)throw historyError;
   setCallHistory(data||[]);
  }catch{setError("No se pudo cargar el historial.");}
  finally{setHistoryBusy(false);}
 }
 useEffect(()=>{
  if(session?.user.id&&((activeTab==="settings"&&settingsPage==="history")||(activeTab==="calls"&&callsView==="history")))void refreshCallHistory();
 },[session?.user.id,activeTab,settingsPage,callsView]);
 async function lookupOriginalCaller(item:{bridge_sid:string;caller_phone:string|null}){
  if(!supabase||!sessionRef.current||callerLookupBusy)return;
  setCallerLookupBusy(item.bridge_sid);setCallbackNotice("");
  try{
   const {data:identity}=await supabase.auth.getUser();
   const {data:session}=await supabase.auth.getSession();
   if(identity.user?.id!==sessionRef.current.user.id||!session.session||
     session.session.user.id!==identity.user.id)throw Error("Tu sesión expiró.");
   const response=await fetch(api+"/api/ios/callback/lookup",{
    method:"POST",headers:{Authorization:"Bearer "+session.session.access_token,
     "Content-Type":"application/json"},
    body:JSON.stringify({bridgeSid:item.bridge_sid})
   });
   const info=await response.json().catch(()=>null);
   if(!response.ok||info?.verified!==true)throw Error("Twilio no tiene un número verificable para esta llamada.");
   await refreshCallHistory();
   setCallbackNotice("Número verificado en Twilio: "+info.phone+". Ya puedes devolver la llamada.");
  }catch(e){setCallbackNotice(e instanceof Error?e.message:"No se pudo recuperar el número.");}
  finally{setCallerLookupBusy(null);}
 }
 async function returnCustomerCall(item:{bridge_sid:string;caller_phone:string|null}){
  if(!item.caller_phone||!supabase||!sessionRef.current||callbackBusy)return;
  if(callRef.current||inviteRef.current){
   Alert.alert("Llamada en curso","Finaliza la llamada actual antes de devolver otra.");return;
  }
  const to=item.caller_phone;
  Alert.alert("Devolver llamada con VMV",
   "Twilio llamará primero a tu iPhone. Cuando contestes, conectará con "+to+
   " mostrando tu número VMV. Será una llamada normal, sin traducción. Twilio puede generar cargos de voz. ¿Continuar?",[
    {text:"Cancelar",style:"cancel"},
    {text:"Devolver llamada",onPress:()=>{void (async()=>{
     if(!supabase||!sessionRef.current)return;
     setCallbackBusy(item.bridge_sid);setCallbackNotice("");setError("");
     try{
      const {data:identity}=await supabase.auth.getUser();
      const {data:session}=await supabase.auth.getSession();
      if(identity.user?.id!==sessionRef.current?.user.id||
       !session.session||session.session.user.id!==identity.user.id)
       throw Error("Tu sesión expiró. Vuelve a entrar.");
      const response=await fetch(api+"/api/ios/callback",{
       method:"POST",
       headers:{Authorization:"Bearer "+session.session.access_token,
        "Content-Type":"application/json"},
       body:JSON.stringify({bridgeSid:item.bridge_sid,mode:"direct"})
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||result?.started!==true){
       const errors:Record<string,string>={
        callback_not_enabled:"La devolución no está habilitada todavía en este piloto.",
        callback_rate_limited:"Se alcanzó el límite de devoluciones de prueba.",
        callback_in_progress:"Ya hay una devolución en curso.",
        verified_caller_or_line_missing:"No se pudo verificar el número del cliente o la línea VMV.",
        active_plan_required:"Necesitas tener Smart Call habilitado."
       };
       throw Error(errors[result?.error]||"No se pudo conectar con Twilio. Inténtalo nuevamente.");
      }
      callbackRequestedAt.current=Date.now();
      setCallbackNotice("Twilio está llamando a tu iPhone. Contesta para hablar con "+to+".");
     }catch(e){setCallbackNotice(e instanceof Error?e.message:"Devolución no disponible.");}
     finally{setCallbackBusy(null);}
    })();}}
   ]);
 }
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
   setLastVoiceAttempt(new Date().toLocaleString());
   if(registrationInFlight.current){
     setVoiceDiagnostic("Ya se está actualizando la conexión. Espera el resultado.");return;
   }
   const client=supabase;
   if(!client||!sessionRef.current){
     setReady(false);
     setVoiceDiagnostic("No se pudo iniciar el registro: abre tu sesión de VMV CALL e inténtalo nuevamente.");
     setError("No hay sesión activa para registrar este iPhone.");
     voiceTelemetry("register_error","no_session");
     return;
   }
   registrationInFlight.current=true;
   voiceTelemetry("register_attempt");
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
     voiceTelemetry("register_ok");
     setVoiceDiagnostic("Registro de Twilio aceptado a las "+new Date().toLocaleTimeString()+". Todavía debemos verificar la entrega VoIP con una llamada.");
     setStatus(value.testOnly===true?"iPhone registrado para llamadas de prueba":"iPhone registrado para recibir llamadas");
   }catch(e){
     setReady(false);
     const reason=e instanceof Error?e.message:"Error desconocido";
     setVoiceDiagnostic("Fallo en registro: "+reason.slice(0,180));
     voiceTelemetry("register_error",(e as {code?:string|number}|null)?.code|| (e instanceof Error?e.name:"unknown"));
     setError(e instanceof Error?e.message:"No fue posible activar la recepción.");
   }finally{registrationInFlight.current=false;setRegistering(false);}
 }
 useEffect(()=>{
   if(!session||!ready)return;
   const sub=AppState.addEventListener("change",next=>{
     if(next==="active"&&Date.now()-registeredAt.current>2*60*1000
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
      caller_language:settings.caller_language===settings.desired_language?(settings.desired_language==="en"?"es":"en"):(settings.caller_language||"en"),assistant_name:settings.assistant_name||"Juan"
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
   voiceTelemetry("call_ended");
 }
 async function logout(){
   if(supabase)await supabase.auth.signOut();
   setReady(false);setInvite(null);setCall(null);
   setStatus("Sesión cerrada");
 }
 return <SafeAreaView style={styles.safe}>
  <StatusBar barStyle="dark-content" backgroundColor={colors.bg}/>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
   <ScrollView style={activeTab==="home"?styles.homeScrollSurface:undefined} scrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,session&&{paddingBottom:150}]}>
    {session&&activeTab==="home"?null:<View style={styles.brand}><View style={styles.brandMark}>
      <View style={styles.brandWave}>
       <View style={[styles.brandWaveBar,{height:13}]}/><View style={[styles.brandWaveBar,{height:24}]}/>
       <View style={[styles.brandWaveBar,{height:32}]}/><View style={[styles.brandWaveBar,{height:24}]}/>
       <View style={[styles.brandWaveBar,{height:13}]}/>
      </View>
     </View>
     <Text style={styles.brandText}>VMV<Text style={{color:"#00AD8D"}}> BUSINESS</Text></Text>
     {session?<Pressable accessibilityRole="button" accessibilityLabel="Abrir ajustes" onPress={()=>{setActiveTab("settings");setSettingsPage("menu");}} style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{String(session.user.user_metadata?.first_name||"V").charAt(0).toUpperCase()}</Text></Pressable>:null}
    </View>}
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
      <View style={styles.homeWelcomeV2}>
       <Pressable accessibilityRole="button" accessibilityLabel="Abrir cuenta"
        onPress={()=>{setSettingsPage("menu");setActiveTab("settings");}} style={styles.homeUser}>
        <View style={styles.homeAvatar}><Ionicons name="person-outline" size={23} color="#754BD0"/></View>
        <View style={{flex:1}}>
         <Text style={styles.homeEyebrow}>BIENVENIDO A VMV</Text>
         <Text style={styles.homeGreeting} numberOfLines={1}>Hola, {String(session.user.user_metadata?.first_name||"").trim()||"bienvenido"}</Text>
        </View>
       </Pressable>
       <View style={styles.homeBrandBadge}><Text style={styles.homeBrandBadgeText}>BUSINESS ✦</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir Smart Call"
       style={styles.homeSpotlightV2} onPress={()=>{setActiveModule("smart-call");setActiveTab("services");}}>
       <View style={styles.homeSpotlightRingOuter}/>
       <View style={styles.homeSpotlightRingInner}/>
       <View style={styles.homeSpotlightPhone}><Ionicons name="call" size={34} color="#64339F"/></View>
       <Text style={styles.homeSpotlightSpark}>✦</Text>
       <Text style={styles.homeSpotlightKicker}>SMART CALL  ·  EN PILOTO</Text>
       <Text style={styles.homeSpotlightHeadline}>Tu negocio,{"\n"}siempre conectado<Text style={{color:"#F9E28A"}}>.</Text></Text>
       <Text style={styles.homeSpotlightCaption}>Llamadas y traducción</Text>
       <View style={styles.homeSpotlightMinutes}>
        <Text style={styles.homeSpotlightMinutesText}>{billingOverview?.minutes?.available??"—"} min  <Text style={{fontSize:10,fontWeight:"600"}}>para traducir</Text></Text>
       </View>
       <View style={styles.homeSpotlightArrow}><Ionicons name="arrow-up-outline" size={20} color="#FFFFFF"/></View>
      </Pressable>
      <View style={styles.homeSectionHead}>
       <Text style={styles.homeSectionTitle}>Destacados<Text style={{color:"#8959EB"}}>.</Text></Text>
       <Pressable accessibilityRole="button" accessibilityLabel="Ver todos los servicios" style={styles.homeSeeAll}
        onPress={()=>{setActiveModule(null);setActiveTab("services");}}>
        <Text style={styles.homeSeeAllText}>Ver todos</Text><Ionicons name="arrow-up-outline" size={15} color="#8960D4"/>
       </Pressable>
      </View>
      <View style={styles.homeProductGrid}>
       <Pressable accessibilityRole="button" accessibilityLabel="Abrir traductor"
        style={[styles.homeProductTile,styles.homeProductMint]} onPress={()=>setActiveTab("live")}>
        <View style={styles.homeProductIconV2}><Ionicons name="language-outline" size={28} color="#105744"/></View>
        <View><Text style={[styles.homeProductTitle,{color:"#104A39"}]}>Traductor</Text>
         <Text style={[styles.homeProductSub,{color:"#367E6A"}]}>En persona</Text></View>
       </Pressable>
       <View style={[styles.homeProductTile,styles.homeProductYellow]}>
        <View style={styles.homeProductIconV2}><Ionicons name="globe-outline" size={28} color="#69471D"/></View>
        <View><Text style={[styles.homeProductTitle,{color:"#63451B"}]}>Web Services</Text>
         <Text style={[styles.homeProductSub,{color:"#916F3C"}]}>Próximamente</Text></View>
       </View>
       <View style={[styles.homeProductTile,styles.homeProductSky]}>
        <View style={styles.homeProductIconV2}><Ionicons name="sparkles-outline" size={28} color="#305D8B"/></View>
        <View><Text style={[styles.homeProductTitle,{color:"#294C78"}]}>AI Agents</Text>
         <Text style={[styles.homeProductSub,{color:"#547DA0"}]}>Próximamente</Text></View>
       </View>
       <View style={[styles.homeProductTile,styles.homeProductPink]}>
        <View style={styles.homeProductIconV2}><Ionicons name="stats-chart-outline" size={28} color="#914B74"/></View>
        <View><Text style={[styles.homeProductTitle,{color:"#82425F"}]}>Marketing</Text>
         <Text style={[styles.homeProductSub,{color:"#AD7692"}]}>Próximamente</Text></View>
       </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Explorar otros servicios"
       onPress={()=>{setActiveModule(null);setActiveTab("services");}} style={styles.homeExploreV2}>
       <Text style={styles.homeExploreSpark} accessible={false}>✦</Text>
       <Text style={styles.homeExploreEyebrow}>VMV BUSINESS</Text>
       <Text style={styles.homeExploreTitle}>Descubre lo que{"\n"}viene después.</Text>
       <View style={styles.homeExploreAction}><Text style={styles.homeExploreActionText}>Explorar servicios  ↗</Text></View>
      </Pressable>
     </>:null}
     {activeTab==="calls"?<>
       <View style={styles.callsTabs}>
        {([{id:"dial",emoji:"⌨️",label:"Teclado"},{id:"history",emoji:"🕘",label:"Historial"},{id:"contacts",emoji:"👥",label:"Contactos"}] as const).map(item=>
         <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
          accessibilityState={{selected:callsView===item.id}}
          style={[styles.callsTab,callsView===item.id&&styles.callsTabActive]}
          onPress={()=>{
           setCallsView(item.id);
           if(item.id==="contacts"){setContactsPhone("");setContactsFromHistory(false);}
           if(item.id==="history")setCallTypeFilter("all");
          }}>
          <Text style={styles.callsTabEmoji}>{item.emoji}</Text>
         </Pressable>)}
       </View>
       {callsView==="dial"?<DialPad session={session} onStarted={()=>{
        callbackRequestedAt.current=Date.now();
       }}/>:null}
       {callsView==="history"?<>
        <View style={styles.callsHistoryToolbar}>
         <View style={styles.callsFilters}>
          {([{id:"all",label:"Todas"},{id:"direct",label:"Directas"},{id:"translated",label:"Traducidas"}] as const).map(item=>
           <Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:callTypeFilter===item.id}}
            style={[styles.callsFilter,callTypeFilter===item.id&&styles.callsFilterActive]}
            onPress={()=>setCallTypeFilter(item.id)}>
            <Text style={[styles.callsFilterText,callTypeFilter===item.id&&styles.callsFilterTextActive]}>{item.label}</Text>
           </Pressable>)}
         </View>
         <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial" disabled={historyBusy}
          style={styles.historyRefresh} onPress={()=>void refreshCallHistory()}>
          <Text style={styles.historyRefreshText}>{historyBusy?"…":"↻"}</Text>
         </Pressable>
        </View>
        <View style={styles.card}>
         {historyBusy?<ActivityIndicator color={colors.accent}/>:
          callHistory.filter(item=>callTypeFilter==="all"||item.call_mode===callTypeFilter).length?
           callHistory.filter(item=>callTypeFilter==="all"||item.call_mode===callTypeFilter).map(item=>
            <View key={item.bridge_sid} style={styles.historyRow}>
             <View style={{flex:1}}>
              <Text style={styles.historyDate}>{item.call_mode==="translated"?"Llamada traducida":"Llamada directa"}</Text>
              <Text style={styles.historyStatus}>{new Date(item.started_at).toLocaleDateString("es-US",{month:"short",day:"numeric"})} · {new Date(item.started_at).toLocaleTimeString("es-US",{hour:"numeric",minute:"2-digit"})}</Text>
              <Text style={styles.historyStatus}>{({"completed":"Finalizada","in-progress":"En curso","no-answer":"Sin respuesta","busy":"Ocupada","ringing":"Sonando","initiated":"Iniciando","failed":"Fallida","canceled":"Cancelada"} as Record<string,string>)[item.status]||item.status}</Text>
             </View>
             <View style={{alignItems:"flex-end",gap:7}}>
              <Text style={styles.historyMinutes}>{item.duration_seconds==null?"—":Math.ceil(Math.max(0,item.duration_seconds)/60)+" min"}</Text>
              {!item.caller_phone?<Pressable accessibilityRole="button" accessibilityLabel="Recuperar número desde Twilio"
               disabled={Boolean(callerLookupBusy)} onPress={()=>void lookupOriginalCaller(item)}>
                <Text style={styles.historyCallback}>{callerLookupBusy===item.bridge_sid?"Buscando…":"Buscar número"}</Text>
               </Pressable>:null}
              {item.caller_phone?<Pressable accessibilityRole="button" accessibilityLabel="Devolver llamada con el número VMV"
               disabled={Boolean(callbackBusy)} onPress={()=>void returnCustomerCall(item)}>
                <Text style={styles.historyCallback}>{callbackBusy===item.bridge_sid?"Conectando…":"☎ Devolver llamada"}</Text>
               </Pressable>:null}
              <Pressable accessibilityRole="button" accessibilityLabel="Guardar contacto desde esta llamada" onPress={()=>{
               setContactsPhone(item.caller_phone||"");setContactsFromHistory(true);setCallsView("contacts");
              }}><Text style={styles.historySaveContact}>{item.caller_phone?"Guardar contacto":"Añadir contacto"}</Text></Pressable>
             </View>
            </View>):
           <Text style={styles.helper}>No hay llamadas de este tipo.</Text>}
         {callbackNotice?<Text style={styles.callbackNotice}>{callbackNotice}</Text>:null}
        </View>
       </>:null}
       {callsView==="contacts"?<ContactsPanel key={session.user.id+":"+contactsPhone+":"+contactsFromHistory}
        session={session} initialPhone={contactsPhone} startInForm={contactsFromHistory}
        embedded onBack={()=>setCallsView("dial")}/>:null}
      </>:null}
      {activeTab==="live"?<InterpreterPanel session={session}/>:null}
      {activeTab==="services"?<>
       {activeModule==="smart-call"?<>
        <Pressable accessibilityRole="button" style={styles.backRow} onPress={()=>setActiveModule(null)}>
         <Text style={styles.backText}>‹ Todos los servicios</Text>
        </Pressable>
        <SmartCallControlCenter session={session} onOpenCalls={()=>setActiveTab("calls")} onSettingsSaved={()=>void loadCustomization()}/>
       </>:<>
        <Text style={styles.kicker}>VMV BUSINESS</Text>
        <Text style={styles.heading}>Mis servicios<Text style={{color:colors.accent}}>.</Text></Text>
        <Text style={styles.description}>Controla tus herramientas desde la app. Los módulos en desarrollo no muestran ajustes que todavía no funcionan.</Text>
        <Pressable accessibilityRole="button" onPress={()=>setActiveModule("smart-call")}
         style={[styles.card,{backgroundColor:"#E7FBF3",borderColor:"#AEE9D5"}]}>
         <Text style={styles.kicker}>COMUNICACIÓN · PILOTO</Text>
         <Text style={styles.cardTitle}>☎  Smart Call</Text>
         <Text style={styles.helper}>Línea, idiomas, asistente, voces, saludos y actividad. Configuración real de tu cuenta.</Text>
         <Text style={styles.backText}>Abrir centro de control  →</Text>
        </Pressable>
        <Text style={styles.groupTitle}>PRÓXIMAMENTE</Text>
        {businessModules.filter(module=>module.id!=="smart-call").map(module=><View key={module.id} style={styles.settingRow}>
         <View style={styles.settingIcon}><Text style={styles.settingEmoji}>▦</Text></View>
         <View style={{flex:1}}><Text style={styles.settingLabel}>{module.name}</Text>
          <Text style={styles.helper}>En desarrollo · sin configuración activa</Text></View>
        </View>)}
       </>}
      </>:null}
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
       <Text style={styles.groupTitle}>VMV BUSINESS</Text>
       <SettingRow emoji="🖥️" label="Plataforma web" onPress={()=>void openBusinessWeb("smart-call")}/>
       <SettingRow emoji="🧩" label="Mis servicios" onPress={()=>{setActiveModule(null);setActiveTab("services");}}/>
       <Text style={styles.groupTitle}>MÁS</Text>
       <SettingRow emoji="🌐" label="Idiomas y asistente" onPress={()=>setSettingsPage("style")}/>
       <SettingRow emoji="🎧" label="Soporte" onPress={()=>setSettingsPage("support")}/>
       <Pressable style={styles.signout} onPress={()=>void logout()}><Text style={styles.signoutText}>Cerrar sesión</Text></Pressable>
      </>:<>
       <Pressable style={styles.backRow} onPress={()=>setSettingsPage("menu")}><Text style={styles.backText}>‹  Ajustes</Text></Pressable>
       <Text style={styles.heading}>{({numbers:"Mi línea",billing:"Plan y minutos",history:"Historial",security:"Seguridad",profile:"Perfil",style:"Idiomas y asistente",support:"Soporte",services:"Otros servicios",menu:"Ajustes"} as Record<typeof settingsPage,string>)[settingsPage]}</Text>
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
       {settingsPage==="billing"?<>
        <Text style={styles.kicker}>TU PLAN {billingOverview?.plan&&billingOverview.plan!=="none"?"· "+billingOverview.plan.toUpperCase():""}</Text>
        <View style={styles.card}>
         <Text style={styles.cardTitle}>Llamadas normales</Text>
         <Text style={styles.billingBigText}>{accountOverview?.billing.active?"Incluidas con tu plan":"Acceso no disponible"}</Text>
         {billingOverview?.plan==="starter"?<View style={styles.callsInfoRow}><Text style={styles.callsInfoLabel}>Starter · plan previsto</Text><Text style={styles.callsInfoValue}>150 min nacionales</Text></View>:null}
         <View style={styles.callsInfoRow}><Text style={styles.callsInfoLabel}>Llamadas · 30 días</Text><Text style={styles.callsInfoValue}>{accountOverview?.usage.directCalls??"—"}</Text></View>
         
        </View>
        <View style={styles.card}>
         <Text style={styles.cardTitle}>Llamadas con traducción</Text>
         <Text style={styles.statNumber}>{billingOverview?.minutes.available??"—"}</Text>
         <Text style={styles.helper}>Minutos disponibles</Text>
         <View style={styles.callsInfoRow}><Text style={styles.callsInfoLabel}>Incluidos en el plan</Text><Text style={styles.callsInfoValue}>{billingOverview?.minutes.included??"—"} min</Text></View>
         <View style={styles.callsInfoRow}><Text style={styles.callsInfoLabel}>Consumidos</Text><Text style={styles.callsInfoValue}>{billingOverview?.minutes.used??"—"} min</Text></View>
         <View style={styles.callsInfoRow}><Text style={styles.callsInfoLabel}>Recargas</Text><Text style={styles.callsInfoValue}>{billingOverview?.minutes.topup??"—"} min</Text></View>
         <Text style={styles.helper}>{billingOverview?.previewPilotActive?"Cuenta de prueba · TEST":""}</Text>
         <Button label="Actualizar saldos" secondary onPress={()=>void refreshAccountOverview()}/>
         <Button label="Ver planes ↗" secondary onPress={()=>void Linking.openURL("https://vmv-business-design-git-feat-vm-073e13-valdys-projects-b97fc7a6.vercel.app/es/planes/").catch(()=>setError("No pudimos abrir los planes."))}/>
         <Button label="Gestionar plan" secondary onPress={()=>{if(!activationProfile||!supabase)return;void (async()=>{
          const {data}=await supabase.from("smartjob_profiles").update({
           plan_prompt_seen:false,updated_at:new Date().toISOString()
          }).eq("id",activationProfile.id).select("*").single();
          if(data)setActivationProfile(data as NativeProfile);
         })();}}/>
        </View>
       </>:null}
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
       {settingsPage==="support"?<View style={styles.card}><Text style={styles.cardTitle}>Diagnóstico de voz · iPhone</Text><Text style={styles.helper}>Registro: {registering?"En progreso":ready?"Aceptado por Twilio":"No confirmado"}</Text><Text style={styles.helper}>Último intento: {lastVoiceAttempt}</Text><Text style={styles.helper}>{voiceDiagnostic||"Aún no llegó respuesta del SDK."}</Text><Text style={styles.helper}>{status}</Text><Button label={registering?"Comprobando conexión…":"Actualizar conexión"} onPress={()=>void registerPhone()} disabled={registering}/></View>:null}
       {settingsPage==="services"?<View style={styles.card}>
         <Text style={styles.cardTitle}>Servicios de VMV Business</Text>
         <Text style={styles.helper}>Usa Smart Call desde esta app. Los demás servicios y las opciones avanzadas estarán en la plataforma web. Se utiliza la misma cuenta de Supabase, pero el navegador conserva su propia sesión.</Text>
         {businessModules.map(module=><Pressable key={module.id}
           accessibilityRole="button" accessibilityLabel={"Abrir "+module.name+" en la plataforma web"}
           onPress={()=>void openBusinessWeb(module.id)} style={styles.settingRow}>
           <View style={styles.settingIcon}><Text style={styles.settingEmoji}>{module.id==="smart-call"?"☎️":"▦"}</Text></View>
           <View style={{flex:1}}>
             <Text style={styles.settingLabel}>{module.name}</Text>
             <Text style={styles.helper}>{module.state==="pilot-separate"?"Servicio telefónico en pruebas":"Producto previsto / en desarrollo"}</Text>
           </View>
           <Text style={styles.settingChevron}>↗</Text>
         </Pressable>)}
         <Button label="Abrir plataforma web" secondary onPress={()=>void openBusinessWeb()}/>
       </View>:null}
      </>}
     </>:null}
    </>}
    {error?<View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{error}</Text></View>:null}
    {working?<ActivityIndicator style={{marginTop:12}} color={colors.accent}/>:null}
   </ScrollView>
   {session&&!keyboardVisible?<View style={styles.bottomDock}>
     {([{id:"home",icon:"home-outline",label:"Inicio"},{id:"services",icon:"grid-outline",label:"Servicios"},
       {id:"calls",icon:"call-outline",label:"Llamadas"},{id:"live",icon:"language-outline",label:"Traductor"},
       {id:"settings",icon:"person-outline",label:"Cuenta"}] as const).map(item=>
       <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
        accessibilityState={{selected:activeTab===item.id}}
        onPress={()=>{setError("");setActiveTab(item.id);if(item.id==="settings")setSettingsPage("menu");}}
        style={[styles.bottomItem,item.id==="calls"&&styles.bottomItemCenter]}>
        <View style={[styles.bottomOrb,activeTab===item.id&&styles.bottomOrbActive,item.id==="calls"&&styles.bottomOrbCenter,
          item.id==="calls"&&activeTab===item.id&&styles.bottomOrbCenterActive]}>
         <Ionicons name={item.icon} size={item.id==="calls"?25:22}
          color={item.id==="calls"?"#FFFFFF":activeTab===item.id?"#211D36":"#B7B4CA"}/>
        </View>
        <Text style={[styles.bottomLabel,activeTab===item.id&&styles.bottomLabelActive,
          item.id==="calls"&&styles.bottomLabelCenter]}>{item.label}</Text>
       </Pressable>)}
    </View>:null}
  </KeyboardAvoidingView>
  {session&&activationProfile&&!activationProfile.plan_prompt_seen?
   <NativeActivation session={session} profile={activationProfile} onComplete={setActivationProfile}/>:null}
  <Modal visible={!!invite||!!call} animationType="fade" presentationStyle="fullScreen"
    onRequestClose={()=>{}}>
    <CallScreen voice={voice} invite={invite} call={call} busy={working} status={status}
      ownerLanguage={assistantPrefs.desired_language==="en"?"en-US":"es-ES"}
      onAccept={()=>void accept()} onReject={()=>void reject()} onEnd={()=>void end()} directCall={directCallbackActive}/>
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
 // Premium VMV Home: purple communications hero, warm pastel product catalogue.
 homeScrollSurface:{backgroundColor:"#FBFAFF"},
 homeWelcomeV2:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:22},
 homeUser:{flex:1,flexDirection:"row",alignItems:"center",gap:11},
 homeAvatar:{width:46,height:46,borderRadius:16,alignItems:"center",justifyContent:"center",backgroundColor:"#E6D6FF"},
 homeEyebrow:{fontSize:10,fontWeight:"800",letterSpacing:1.1,color:"#9B91AD",marginBottom:4},
 homeGreeting:{fontSize:18,fontWeight:"800",letterSpacing:-.55,color:"#231E38"},
 homeBrandBadge:{borderRadius:24,backgroundColor:"#F0E9FF",paddingHorizontal:11,paddingVertical:11},
 homeBrandBadgeText:{color:"#744DBB",fontSize:10,fontWeight:"800",letterSpacing:.5},
 homeSpotlightV2:{minHeight:220,backgroundColor:"#8656E4",borderRadius:25,overflow:"hidden",padding:21,position:"relative",marginBottom:2,shadowColor:"#7348D5",shadowOpacity:.22,shadowRadius:16,shadowOffset:{width:0,height:9},elevation:6},
 homeSpotlightRingOuter:{position:"absolute",width:157,height:157,borderRadius:80,borderWidth:22,borderColor:"#B998F1",opacity:.45,top:35,right:-26},
 homeSpotlightRingInner:{position:"absolute",width:112,height:112,borderRadius:57,borderWidth:15,borderColor:"#F2D3FF",opacity:.43,top:77,right:1},
 homeSpotlightPhone:{position:"absolute",width:78,height:78,borderRadius:24,alignItems:"center",justifyContent:"center",backgroundColor:"#FFCA81",right:18,top:69,transform:[{rotate:"-15deg"}]},
 homeSpotlightSpark:{position:"absolute",right:18,top:24,color:"#F7E185",fontSize:31,fontWeight:"800"},
 homeSpotlightKicker:{fontSize:10,fontWeight:"800",letterSpacing:1,color:"#EFE4FF"},
 homeSpotlightHeadline:{color:"#FFFFFF",fontSize:28,lineHeight:31,fontWeight:"800",letterSpacing:-1.5,marginTop:22,maxWidth:"78%"},
 homeSpotlightCaption:{fontSize:12,color:"#E9DDFF",marginTop:9},
 homeSpotlightMinutes:{alignSelf:"flex-start",backgroundColor:"#FFFFFF29",borderWidth:1,borderColor:"#FFFFFF65",paddingVertical:8,paddingHorizontal:12,borderRadius:20,marginTop:20},
 homeSpotlightMinutesText:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
 homeSpotlightArrow:{position:"absolute",right:16,bottom:16,width:34,height:34,borderRadius:17,backgroundColor:"#FFFFFF3C",alignItems:"center",justifyContent:"center"},
 homeSectionHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:9,marginTop:26,marginBottom:15},
 homeSectionTitle:{fontSize:25,color:"#221B34",fontWeight:"800",letterSpacing:-1.2},
 homeSeeAll:{flexDirection:"row",alignItems:"center",gap:3,paddingVertical:6},
 homeSeeAllText:{fontSize:12,color:"#8960D4",fontWeight:"800"},
 homeProductGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",rowGap:12},
 homeProductTile:{width:"48%",minHeight:151,borderRadius:21,padding:16,justifyContent:"space-between",overflow:"hidden"},
 homeProductMint:{backgroundColor:"#B7EDDA"},
 homeProductYellow:{backgroundColor:"#FFE083"},
 homeProductSky:{backgroundColor:"#BFE5FF"},
 homeProductPink:{backgroundColor:"#FFD2E7"},
 homeProductIconV2:{width:46,height:46,borderRadius:16,backgroundColor:"#FFFFFF7A",alignItems:"center",justifyContent:"center"},
 homeProductTitle:{fontSize:18,fontWeight:"800",letterSpacing:-.7},
 homeProductSub:{fontSize:11,fontWeight:"700",marginTop:5},
 homeExploreV2:{position:"relative",overflow:"hidden",borderRadius:23,backgroundColor:"#FFC365",padding:21,minHeight:159,marginTop:15,marginBottom:12,alignItems:"flex-start"},
 homeExploreSpark:{position:"absolute",right:3,top:-2,fontSize:124,color:"#FFFFFF70",transform:[{rotate:"-18deg"}]},
 homeExploreEyebrow:{fontSize:10,fontWeight:"800",letterSpacing:1.2,color:"#855235"},
 homeExploreTitle:{fontSize:25,fontWeight:"800",lineHeight:29,letterSpacing:-1.1,color:"#4A2A27",marginTop:11},
 homeExploreAction:{borderRadius:24,backgroundColor:"#FFFFFF85",paddingHorizontal:12,paddingVertical:9,marginTop:13},
 homeExploreActionText:{fontSize:11,color:"#51352D",fontWeight:"800"},
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
 bottomDock:{position:"absolute",bottom:12,left:15,right:15,height:77,backgroundColor:"#1C1A2B",borderRadius:30,borderWidth:1,borderColor:"#333048",flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingHorizontal:7,shadowColor:"#171326",shadowOpacity:.23,shadowRadius:13,shadowOffset:{width:0,height:9},elevation:8},
 bottomItem:{flex:1,alignItems:"center",justifyContent:"center",height:62},
 bottomItemCenter:{transform:[{translateY:-13}]},
 bottomOrb:{width:43,height:36,borderRadius:17,alignItems:"center",justifyContent:"center"},
 bottomOrbActive:{backgroundColor:"#FFFFFF"},
 bottomOrbCenter:{width:57,height:57,borderRadius:29,backgroundColor:"#8853EA",borderColor:"#FBFAFF",borderWidth:4,shadowColor:"#442A91",shadowOpacity:.4,shadowRadius:8,shadowOffset:{width:0,height:6},elevation:6},
 bottomOrbCenterActive:{backgroundColor:"#A06EFF",borderColor:"#E4D4FF"},
 bottomLabel:{color:"#AFA9C3",fontSize:9,fontWeight:"700",marginTop:2},
 bottomLabelActive:{color:"#FFFFFF"},
 bottomLabelCenter:{color:"#E1D4F5",marginTop:0},
 groupTitle:{color:"#06A886",fontSize:11,fontWeight:"800",letterSpacing:1.7,marginTop:20,marginBottom:8},
 languageChoice:{flexDirection:"row",gap:10,marginVertical:11},
 languageOption:{flex:1,alignItems:"center",justifyContent:"center",padding:13,backgroundColor:"#F0FDF9",borderRadius:12,borderWidth:1,borderColor:"#CEEAE4"},
 languageSelected:{borderColor:colors.accent,backgroundColor:"#D6FAED"},
 languageOptionText:{fontSize:14,fontWeight:"700",color:colors.text},
 greetingEditor:{height:105,paddingTop:12},


 callsHeadingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
 contactsEntry:{borderWidth:1,borderColor:"#B8E9D3",backgroundColor:"#E9FAF1",paddingVertical:10,paddingHorizontal:12,borderRadius:12,marginBottom:10},
 contactsEntryText:{fontSize:12,color:"#0A8867",fontWeight:"800"},
 historySaveContact:{fontSize:11,color:"#0B936F",fontWeight:"800",paddingVertical:5},
 billingBigText:{fontSize:21,fontWeight:"800",color:"#0A8365",marginBottom:10},
 historyCallback:{fontSize:11,color:"#0C8B65",fontWeight:"900",paddingVertical:5},
 callbackNotice:{fontSize:12,color:"#127C5C",lineHeight:19,backgroundColor:"#E7F9EE",padding:12,borderRadius:11,marginTop:14},
 callsTabEmoji:{fontSize:25,lineHeight:34,textAlign:"center"},
 callsHistoryToolbar:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:14},
 callsTabs:{flexDirection:"row",backgroundColor:"#EAF5EE",borderWidth:1,borderColor:"#D4EADB",padding:5,borderRadius:18,marginBottom:18,gap:5},
 callsTab:{flex:1,minHeight:54,borderRadius:13,alignItems:"center",justifyContent:"center"},
 callsTabActive:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#B7E9D0"},
 callsTabText:{fontSize:14,fontWeight:"700",color:"#758B81"},
 callsTabTextActive:{color:"#08795B",fontWeight:"800"},
 callsDivider:{height:1,backgroundColor:"#CFE6DA",marginVertical:18},
 callsInfoRow:{flexDirection:"row",justifyContent:"space-between",gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#DDEEE7",alignItems:"center"},
 callsInfoLabel:{fontSize:12,color:"#648176",flex:1,fontWeight:"600"},
 callsInfoValue:{fontSize:12,color:"#193C30",flex:1,textAlign:"right",fontWeight:"800"},
 callsHistoryHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:14},
 callsFilters:{flex:1,flexDirection:"row",gap:8,marginBottom:0},
 callsFilter:{flex:1,minHeight:42,borderRadius:12,borderWidth:1,borderColor:"#D6EADF",backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center",paddingHorizontal:5},
 callsFilterActive:{backgroundColor:"#E0F9ED",borderColor:"#99DFC0"},
 callsFilterText:{fontSize:12,fontWeight:"700",color:"#6C867A"},
 callsFilterTextActive:{fontWeight:"800",color:"#08795B"},
 callsHistoryFoot:{fontSize:11,textAlign:"center",color:"#84968C",marginTop:15},
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
