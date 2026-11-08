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

export default function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [working,setWorking]=useState(false),[registering,setRegistering]=useState(false);
 const [ready,setReady]=useState(false),[status,setStatus]=useState("Prepara la recepción de llamadas");
 const [invite,setInvite]=useState<CallInvite|null>(null),[call,setCall]=useState<Call|null>(null);
 const [error,setError]=useState("");
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
     if(!next){setReady(false);setStatus("Inicia sesión para recibir llamadas");}
   });
   return()=>{mounted=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
   if(listenersReady)return;
   listenersReady=true;
   voice.on(Voice.Event.CallInvite,(incoming:CallInvite)=>{
     inviteRef.current=incoming;setInvite(incoming);
     setStatus("Llamada entrante · interpretación disponible");
     incoming.on(CallInvite.Event.Accepted,(accepted:Call)=>{
       connectCall(accepted);
     });
   });
   voice.on(Voice.Event.Error,()=>{
     setError("La conexión de voz tuvo un problema. Revisa tu red e inténtalo nuevamente.");
   });
 },[]);
 function connectCall(connected:Call){
   callRef.current=connected;setCall(connected);setInvite(null);inviteRef.current=null;
   setStatus("Interpretación conectada");
   connected.addListener(Call.Event.Connected,()=>setStatus("En llamada con interpretación"));
   connected.addListener(Call.Event.Disconnected,()=>{
     callRef.current=null;setCall(null);setStatus("Llamada finalizada");
   });
 }
 async function registerPhone(){
   const client=supabase;
   if(!client||!sessionRef.current)return;
   setRegistering(true);setError("");
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
     await voice.initializePushRegistry();
     await voice.register(value.token);
     registeredAt.current=Date.now();setReady(true);
     setStatus("iPhone registrado para recibir llamadas");
   }catch(e){
     setReady(false);
     setError(e instanceof Error?e.message:"No fue posible activar la recepción.");
   }finally{setRegistering(false);}
 }
 useEffect(()=>{
   if(!session||!ready)return;
   const sub=AppState.addEventListener("change",next=>{
     if(next==="active"&&Date.now()-registeredAt.current>30*60*1000)
       void registerPhone();
   });
   return()=>sub.remove();
 },[ready,session?.user.id]);
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
         </>}
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
 footer:{color:"#617380",fontSize:10,fontWeight:"700",letterSpacing:1.4,alignSelf:"center",marginTop:26}
});
