import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Platform,Pressable,
 SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from "react-native";
import {Voice,Call,CallInvite} from "@twilio/voice-react-native-sdk";
import type {Session} from "@supabase/supabase-js";
import {api,supabase,configured} from "./session";

const colors={bg:"#0B1017",card:"#151E28",line:"#293846",text:"#F5F8FB",
 muted:"#94A4B1",accent:"#B9F37D",accentText:"#172011",red:"#FF9089"};
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
 const [session,setSession]=useState<Session|null>(null);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [working,setWorking]=useState(false),[registering,setRegistering]=useState(false);

 const [ready,setReady]=useState(false),[status,setStatus]=useState("Prepara la recepción de llamadas");
 const [invite,setInvite]=useState<CallInvite|null>(null),[call,setCall]=useState<Call|null>(null);
 const [error,setError]=useState("");
 const [voiceDiagnostic,setVoiceDiagnostic]=useState("Sin diagnóstico de registro todavía.");
 const [accountOverview,setAccountOverview]=useState<{
  verified:boolean;connectedToApp:boolean;forwardingReady:boolean;twilioPhone:string|null;
  publicPhone:string|null;carrier:string|null;usage:{calls:number;completed:number;minutes:number;periodDays:number};
  billing:{enabled:boolean;message:string};
 }|null>(null);
 const [overviewBusy,setOverviewBusy]=useState(false);
 const [billingOverview,setBillingOverview]=useState<{
  plan:string;status:string;minutes:{included:number;used:number;available:number;rollover:number;topup:number};
  note:string
 }|null>(null);
 const [phoneVerification,setPhoneVerification]=useState<{requestId:string;phone:string;verified:boolean;smsAvailable:boolean;requestStatus:string}|null>(null);
 const [smsCode,setSmsCode]=useState(""),[smsSent,setSmsSent]=useState(false);
 const [smsBusy,setSmsBusy]=useState(false),[verificationLoading,setVerificationLoading]=useState(false);
 const [verifyMessage,setVerifyMessage]=useState("");
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
   if(listenersReady)return;
   listenersReady=true;
   voice.on(Voice.Event.CallInvite,(incoming:CallInvite)=>{
     inviteRef.current=incoming;setInvite(incoming);
     setStatus("Llamada entrante · interpretación disponible");
     const dismissInvite=()=>{
       if(inviteRef.current!==incoming)return;
       inviteRef.current=null;setInvite(null);
       setStatus("La llamada terminó antes de contestar");
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
   <StatusBar barStyle="light-content" backgroundColor={colors.bg}/>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
     <View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandIcon}>◉</Text></View>
       <Text style={styles.brandText}>smart<Text style={{color:colors.accent}}>job</Text></Text></View>
     <Text style={styles.kicker}>SMART JOB · VOICE FOR iPHONE</Text>
     <Text style={styles.heading}>Tu trabajo.{"\n"}<Text style={{color:colors.accent}}>Sin barreras.</Text></Text>
     <Text style={styles.description}>Conserva tu número habitual. Contesta en Smart Job cuando tengas una llamada traducida.</Text>

     {!configured?<View style={styles.alert}><Text style={styles.alertText}>
       Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno de la app.
     </Text></View>:!session?
     <View style={styles.card}>
       <Text style={styles.cardTitle}>Inicia sesión</Text>
       <Text style={styles.helper}>Utiliza tu cuenta existente de Smart Job.</Text>
       <TextInput style={styles.field} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
         textContentType="emailAddress" placeholder="Correo electrónico" placeholderTextColor="#71808B"
         value={email} onChangeText={setEmail}/>
       <TextInput style={styles.field} secureTextEntry textContentType="password"
         placeholder="Contraseña" placeholderTextColor="#71808B" value={password} onChangeText={setPassword}/>
       <Button label="Entrar a Smart Job" onPress={()=>void login()} disabled={working||!email||!password}/>
     </View>:
     <>
       <View style={styles.card}>
         <Text style={styles.cardTitle}>Centro de llamadas</Text>
         <View style={styles.statusRow}><View style={[styles.dot,{backgroundColor:ready?colors.accent:colors.red}]}/>
           <Text style={styles.statusText}>{status}</Text></View>
         <Text style={styles.helper}>Conectado como {session.user.email||"profesional"}.</Text>
         {call?<View style={{marginTop:20}}>
           <Text style={styles.callLabel}>LLAMADA EN CURSO</Text>
           <Text style={styles.bigCall}>Traducción activa</Text>
           <Button label="Finalizar llamada" danger onPress={()=>void end()}/>
         </View>:invite?<View style={{marginTop:20}}>
           <Text style={styles.callLabel}>LLAMADA ENTRANTE</Text>
           <Text style={styles.bigCall}>Te están llamando</Text>
           <Button label="Contestar y traducir" disabled={working} onPress={()=>void accept()}/>
           <Button label="Rechazar" secondary onPress={()=>void reject()}/>
         </View>:<>
           <Text style={styles.helper}>La recepción funciona solamente para números verificados y autorizados. No activa ningún desvío de Verizon.</Text>
           <Button label={registering?"Registrando…":ready?"Actualizar conexión":"Preparar mi iPhone"}
             disabled={registering} onPress={()=>void registerPhone()}/>

           <Text style={styles.helper}>Diagnóstico VoIP: {voiceDiagnostic}</Text>
           {ready?<Text style={styles.helper}>Recibe llamadas reales en tu número Smart Job, sin el límite de pruebas VoIP.</Text>:null}
         </>}
       </View>
       <View style={styles.card}>
         <Text style={styles.cardTitle}>Mi número y consumo</Text>
         <Text style={styles.helper}>Gestiona la recepción de llamadas reales y comprueba tu consumo sin límite de pruebas.</Text>
         <Button label={overviewBusy?"Actualizando…":"Actualizar mi estado"} secondary disabled={overviewBusy}
           onPress={()=>void refreshAccountOverview()}/>
         {accountOverview?<>
           <Text style={styles.statusText}>Recepción iOS: {accountOverview.connectedToApp?"Activada":"Pendiente"}</Text>
           <Text style={styles.helper}>Número verificado: {accountOverview.verified?"Sí":"Pendiente"}</Text>
           <Text style={styles.helper}>Número Smart Job: {accountOverview.twilioPhone||"Pendiente de asignación"}</Text>
           <Text style={styles.helper}>Llamadas últimos 30 días: {accountOverview.usage.calls} · completadas: {accountOverview.usage.completed} · minutos registrados: {accountOverview.usage.minutes}</Text>
           <Text style={styles.helper}>Los minutos son orientativos, no un importe facturado. {accountOverview.billing.message}</Text>
           {billingOverview?<View style={{marginTop:10}}>
             <Text style={styles.callLabel}>PLAN DE VMV CALL</Text>
             <Text style={styles.statusText}>Plan: {billingOverview.plan==="none"?"Sin suscripción":billingOverview.plan.toUpperCase()}</Text>
             <Text style={styles.statusText}>Minutos disponibles: {billingOverview.minutes.available}</Text>
             <Text style={styles.helper}>Consumidos: {billingOverview.minutes.used} · Incluidos: {billingOverview.minutes.included} · Acumulados: {billingOverview.minutes.rollover}</Text>
             <Text style={styles.helper}>Las compras y la gestión de planes se preparan primero para la web. {billingOverview.note}</Text>
           </View>:null}
           {accountOverview.forwardingReady&&accountOverview.twilioPhone?
           <View style={{marginTop:14}}>
             <Text style={styles.callLabel}>CONECTA TU NÚMERO ACTUAL</Text>
             <Text style={styles.helper}>Tu número Verizon continúa funcionando de forma normal hasta que TÚ actives el desvío en el operador.</Text>
             <Text style={styles.statusText}>1. Confirma que Smart Job recibe llamadas incluso con el iPhone bloqueado.</Text>
             <Text style={styles.statusText}>2. Desde tu línea Verizon, marca *72 seguido de {accountOverview.twilioPhone.slice(2)} y escucha la confirmación.</Text>
             <Text style={styles.statusText}>3. Pide una llamada REAL a tu número Verizon para confirmar traducción en ambos idiomas.</Text>
             <Text style={styles.helper}>Para volver al funcionamiento normal, marca *73 desde Verizon. No configures el destino Twilio para que llame de nuevo a Verizon: provocaría un bucle.</Text>
           </View>:
           <Text style={styles.helper}>Para habilitar el desvío primero debes verificar tu teléfono y configurar la recepción iOS. No actives *72 todavía.</Text>}
         </>:null}
       </View>
       <View style={styles.card}>
         <Text style={styles.cardTitle}>Verifica tu número por SMS</Text>
         <Text style={styles.helper}>Comprobamos que tienes acceso al número de teléfono registrado en Smart Job. No activa el desvío de llamadas.</Text>
         {verificationLoading?<ActivityIndicator color={colors.accent}/>:
          phoneVerification?
           phoneVerification.verified?
             <Text style={styles.success}>✓ Número {phoneVerification.phone} verificado. Esperando autorización de la línea.</Text>:
           <>
             <Text style={styles.statusText}>Número registrado: {phoneVerification.phone}</Text>
             {phoneVerification.requestStatus!=="pending"?
               <Text style={styles.helper}>Tu solicitud está en revisión. La verificación todavía no está disponible.</Text>:
               phoneVerification.smsAvailable?
               <>
                 <Button label={smsBusy?"Enviando…":"Enviar código por SMS"} disabled={smsBusy} onPress={()=>void sendSmsCode()}/>
                 {smsSent?<View style={{marginTop:16}}>
                   <Text style={styles.helper}>Introduce el código que recibiste por mensaje de texto.</Text>
                   <TextInput style={styles.field} keyboardType="number-pad" textContentType="oneTimeCode"
                     autoComplete="sms-otp" maxLength={10} placeholder="Código SMS" placeholderTextColor="#71808B"
                     value={smsCode} onChangeText={value=>setSmsCode(value.replace(/[^0-9]/g,""))}/>
                   <Button label={smsBusy?"Verificando…":"Confirmar código"} disabled={smsBusy||smsCode.length<4}
                     onPress={()=>void confirmSmsCode()}/>
                 </View>:null}
               </>:<Text style={styles.helper}>La verificación SMS está preparada, pero falta conectar el servicio Twilio Verify.</Text>}
           </>:
           <Button label="Consultar mi número" onPress={()=>void refreshPhoneVerification()}/>
         }
         {verifyMessage?<Text style={styles.verifyMessage}>{verifyMessage}</Text>:null}
       </View>
       <View style={styles.notice}>
         <Text style={styles.noticeTitle}>Tus clientes conservan tu número</Text>
         <Text style={styles.noticeBody}>El desvío del operador se configura después de verificar tu línea y comprobar que este iPhone puede recibir llamadas. No actives *72 todavía.</Text>
       </View>
       <Pressable onPress={()=>void logout()} accessibilityRole="button" style={styles.signout}>
         <Text style={styles.signoutText}>Cerrar sesión</Text>
       </Pressable>
     </>}
     {error?<View accessibilityRole="alert" style={styles.alert}><Text style={styles.alertText}>{error}</Text></View>:null}
     {working?<ActivityIndicator style={{marginTop:12}} color={colors.accent}/>:null}
     <Text style={styles.footer}>SMART JOB · PRIVATE iOS PILOT</Text>
   </ScrollView></KeyboardAvoidingView>
 </SafeAreaView>;
}
function Button({label,onPress,disabled,secondary,danger}:{label:string,onPress:()=>void,disabled?:boolean,secondary?:boolean,danger?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled}} disabled={disabled}
   onPress={onPress} style={[styles.btn,secondary&&styles.secondary,danger&&styles.danger,disabled&&{opacity:.52}]}>
   <Text style={[styles.btnText,(secondary||danger)&&{color:colors.text}]}>{label}</Text>
 </Pressable>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.bg},
 content:{flexGrow:1,paddingHorizontal:22,paddingTop:22,paddingBottom:46,maxWidth:620,width:"100%",alignSelf:"center"},
 brand:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:38},
 brandMark:{width:42,height:42,borderRadius:14,backgroundColor:colors.accent,alignItems:"center",justifyContent:"center"},
 brandIcon:{fontSize:23,fontWeight:"900",color:colors.accentText},
 brandText:{color:colors.text,fontSize:25,fontWeight:"900",letterSpacing:-1.4},
 kicker:{color:colors.accent,fontSize:11,fontWeight:"800",letterSpacing:2.2,marginBottom:12},
 heading:{color:colors.text,fontSize:42,fontWeight:"800",lineHeight:46,letterSpacing:-1.7,marginBottom:16},
 description:{color:colors.muted,fontSize:15,lineHeight:24,marginBottom:25},
 card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.line,borderRadius:23,padding:21,marginBottom:18},
 cardTitle:{color:colors.text,fontSize:21,fontWeight:"800",marginBottom:8},
 helper:{color:colors.muted,fontSize:13,lineHeight:21,marginBottom:17},
 field:{height:53,borderRadius:13,borderWidth:1,borderColor:"#344552",backgroundColor:colors.bg,
   paddingHorizontal:15,color:colors.text,fontSize:16,marginBottom:13},
 btn:{backgroundColor:colors.accent,minHeight:52,borderRadius:13,alignItems:"center",justifyContent:"center",padding:13,marginTop:12},
 btnText:{fontSize:15,fontWeight:"800",color:colors.accentText},
 secondary:{backgroundColor:"#29343F"},
 danger:{backgroundColor:"#813E42"},
 statusRow:{flexDirection:"row",alignItems:"center",gap:10,marginTop:12,marginBottom:12},
 dot:{width:9,height:9,borderRadius:5},
 statusText:{flex:1,fontSize:14,color:colors.text,fontWeight:"700"},
 callLabel:{fontSize:11,fontWeight:"800",color:colors.accent,letterSpacing:1.8},
 bigCall:{fontSize:27,fontWeight:"800",color:colors.text,marginVertical:12},
 notice:{backgroundColor:"#1A2831",borderRadius:17,borderWidth:1,borderColor:"#38505B",padding:17},
 noticeTitle:{fontSize:14,fontWeight:"800",color:colors.text,marginBottom:7},
 noticeBody:{fontSize:13,color:colors.muted,lineHeight:21},
 signout:{alignSelf:"center",padding:15,marginTop:13},
 signoutText:{fontSize:13,fontWeight:"700",color:colors.muted},
 alert:{borderWidth:1,borderColor:"#9D5454",backgroundColor:"#342426",borderRadius:13,padding:15,marginBottom:16},
 alertText:{fontSize:13,color:"#FFD0CE",lineHeight:20},
 success:{fontSize:14,color:colors.accent,lineHeight:22,fontWeight:"700"},
 verifyMessage:{fontSize:13,color:colors.text,lineHeight:21,marginTop:13},
 footer:{color:"#617380",fontSize:10,fontWeight:"700",letterSpacing:1.4,alignSelf:"center",marginTop:26}
});
