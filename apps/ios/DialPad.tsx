import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {api,supabase} from "./session";

const KEYS=[
 ["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],
 ["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]
] as const;
function normalizedPhone(v:string){
 const raw=v.trim().replace(/[().\s-]/g,"");
 if(!/^\+?[0-9]+$/.test(raw))return null;
 if(raw.length===10)return "+1"+raw;
 if(raw.length===11&&raw.startsWith("1"))return "+"+raw;
 return /^\+1[0-9]{10}$/.test(raw)?raw:null;
}
export function DialPad({session,onStarted}:{session:Session;onStarted:()=>void}){
 const [phone,setPhone]=useState("");
 const [available,setAvailable]=useState(false);
 const [checking,setChecking]=useState(true);
 const [working,setWorking]=useState(false);
 const [notice,setNotice]=useState("");
 const [failed,setFailed]=useState(false);
 const input=useRef<TextInput>(null);
 useEffect(()=>{
  let mounted=true;
  void (async()=>{
   if(!supabase||!api){if(mounted)setChecking(false);return;}
   try{
    const {data:user,error}=await supabase.auth.getUser();
    const {data:active}=await supabase.auth.getSession();
    if(error||user.user?.id!==session.user.id||active.session?.user.id!==session.user.id)return;
    const response=await fetch(api+"/api/ios/dial",{
     method:"GET",headers:{Authorization:"Bearer "+active.session.access_token}
    });
    const result=await response.json().catch(()=>null);
    if(mounted)setAvailable(response.ok&&result?.available===true);
   }catch{if(mounted)setAvailable(false);}
   finally{if(mounted)setChecking(false);}
  })();
  return()=>{mounted=false;};
 },[session.user.id]);
 const normalized=normalizedPhone(phone);
 const addDigit=(digit:string)=>{
  if(working||digit==="*"||digit==="#")return;
  setPhone(v=>v.length>=20?v:v+digit);
  setNotice("");
 };
 async function makeCall(to:string){
  if(!api||!supabase||working||!available)return;
  setWorking(true);setNotice("");setFailed(false);
  try{
   const {data:user,error}=await supabase.auth.getUser();
   const {data:active}=await supabase.auth.getSession();
   if(error||user.user?.id!==session.user.id||active.session?.user.id!==session.user.id)
    throw Error("Vuelve a iniciar sesión.");
   const response=await fetch(api+"/api/ios/dial",{
    method:"POST",headers:{Authorization:"Bearer "+active.session.access_token,
     "Content-Type":"application/json"},
    body:JSON.stringify({phone:to,mode:"direct"})
   });
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.started!==true){
    const messages:Record<string,string>={
     dialer_not_enabled:"Las llamadas salientes aún no están habilitadas.",
     us_phone_not_verified:"Introduce un número válido de Estados Unidos.",
     active_plan_required:"Tu plan no permite llamar.",
     call_in_progress:"Ya hay una llamada en curso.",
     dialer_rate_limited:"Límite de llamadas de prueba alcanzado.",
     line_not_ready:"La línea VMV no está lista.",
     invalid_phone:"Revisa el número."
    };
    throw Error(messages[data?.error]||"No se pudo iniciar la llamada.");
   }
   onStarted();setPhone("");
   setNotice("VMV está llamando a tu iPhone. Contesta para conectar.");
  }catch(e){setFailed(true);setNotice(e instanceof Error?e.message:"Llamada no disponible.");}
  finally{setWorking(false);}
 }
 function confirmCall(){
  if(!normalized||!available||working)return;
  Alert.alert("Llamar con VMV",
   normalized+"\n\nEl cliente verá el número de tu negocio. Twilio puede generar cargos de voz.",
   [{text:"Cancelar",style:"cancel"},{text:"Llamar",onPress:()=>void makeCall(normalized)}]);
 }
 return <View style={s.root}>
  <View style={s.numberRow}>
   <TextInput ref={input} style={s.number} accessibilityLabel="Número para llamar"
    placeholder="+1 (000) 000-0000" placeholderTextColor="#A9C1B3"
    keyboardType="phone-pad" showSoftInputOnFocus={false} maxLength={20} value={phone}
    onChangeText={text=>{setPhone(text.slice(0,20));setNotice("");}} editable={!working}/>
   {phone?<Pressable accessibilityRole="button" accessibilityLabel="Borrar último dígito"
    onPress={()=>setPhone(v=>v.slice(0,-1))} style={s.backspace}><Text style={s.backspaceText}>⌫</Text></Pressable>:null}
  </View>
  <View style={s.keys}>
   {KEYS.map(([digit,letters])=><Pressable key={digit} accessibilityRole="button"
    accessibilityLabel={digit==="*"?"Asterisco":digit==="#"?"Numeral":digit}
    disabled={working||digit==="*"||digit==="#"} style={({pressed})=>
     [s.key,pressed&&s.keyPressed,(digit==="*"||digit==="#")&&s.keyInactive]}
    onPress={()=>addDigit(digit)}>
     <Text style={s.digit}>{digit}</Text><Text style={s.letters}>{letters||" "}</Text>
    </Pressable>)}
  </View>
  <Pressable accessibilityRole="button" accessibilityLabel="Llamar desde VMV"
   disabled={working||checking||!available||!normalized}
   style={[s.call,(working||checking||!available||!normalized)&&s.callDisabled]}
   onPress={confirmCall}>
   {working?<ActivityIndicator color="#FFFFFF"/>:<Text style={s.callIcon}>☎</Text>}
  </Pressable>
  <Text style={s.hint}>{checking?"Comprobando línea…":available?"Llamada nacional · VMV":"Llamadas salientes no disponibles"}</Text>
  {notice?<Text style={[s.notice,failed&&s.error]} accessibilityRole="text">{notice}</Text>:null}
 </View>;
}
const s=StyleSheet.create({
 root:{alignItems:"center",paddingHorizontal:6,paddingTop:12,paddingBottom:30},
 numberRow:{width:"100%",maxWidth:340,flexDirection:"row",alignItems:"center",minHeight:74,marginBottom:10},
 number:{flex:1,minWidth:0,color:"#173A2C",fontSize:27,fontWeight:"600",textAlign:"center",letterSpacing:-.8,paddingVertical:12},
 backspace:{padding:8,alignItems:"center",justifyContent:"center"},
 backspaceText:{fontSize:25,color:"#779587"},
 keys:{width:285,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",rowGap:12},
 key:{width:77,height:77,borderRadius:40,borderWidth:1,borderColor:"#E0EDE5",backgroundColor:"#F0F8F3",alignItems:"center",justifyContent:"center"},
 keyPressed:{backgroundColor:"#C9F0D8"},keyInactive:{opacity:.6},
 digit:{fontSize:29,fontWeight:"500",lineHeight:35,color:"#15382B"},
 letters:{fontSize:9,letterSpacing:1.5,fontWeight:"800",color:"#779288",marginTop:0,minHeight:12},
 call:{width:72,height:72,borderRadius:36,backgroundColor:"#06B98C",alignItems:"center",justifyContent:"center",marginTop:24},
 callDisabled:{opacity:.45},callIcon:{fontSize:35,fontWeight:"700",color:"white",lineHeight:42},
 hint:{fontSize:11,color:"#829C8C",marginTop:14,textAlign:"center"},
 notice:{fontSize:12,color:"#078260",backgroundColor:"#E4F9ED",borderRadius:12,overflow:"hidden",padding:12,marginTop:16,textAlign:"center",lineHeight:19},
 error:{color:"#AD4E59",backgroundColor:"#FFF0F3"}
});
