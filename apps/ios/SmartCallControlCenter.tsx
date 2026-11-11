import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {api,supabase} from "./session";

type Language="en"|"es";
type Choice="default"|"bright"|"calm";
type Section="overview"|"settings"|"activity";
type CallSettings={desired_language:Language;caller_language:Language;assistant_name:string};
type Preferences={voice_customer:Choice;voice_owner:Choice;greeting_customer:string;greeting_owner:string};
type Route={twilio_number:string;public_number:string|null;enabled:boolean;receive_method:string};
type CallRow={bridge_sid:string;status:string;call_mode:string;started_at:string;duration_seconds:number|null};
type Billing={plan_code:string;status:string;included_minutes:number;used_minutes:number;topup_minutes:number};
const initialSettings:CallSettings={desired_language:"es",caller_language:"en",assistant_name:""};
const initialPrefs:Preferences={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
const palette={ink:"#14232A",muted:"#6D8185",mint:"#04B58F",pale:"#E9F9F3",line:"#DCECE7",white:"#FFFFFF"};
const validLanguage=(v:unknown):v is Language=>v==="en"||v==="es";
const validChoice=(v:unknown):v is Choice=>v==="default"||v==="bright"||v==="calm";
const readableLanguage=(v:Language)=>v==="es"?"Español":"English";
const voiceLabels:Record<Choice,string>={default:"Estándar",bright:"Clara",calm:"Serena"};
function Action({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
  accessibilityState={{disabled}} style={[s.action,secondary&&s.actionSecondary,disabled&&{opacity:.48}]}>
  <Text style={[s.actionText,secondary&&{color:palette.ink}]}>{label}</Text>
 </Pressable>;
}
function ChoiceRow<T extends string>({value,options,onChange,disabled=false}:{
 value:T;options:{id:T;label:string}[];onChange:(next:T)=>void;disabled?:boolean
}){
 return <View style={s.choices}>{options.map(option=><Pressable key={option.id} accessibilityRole="button"
   accessibilityState={{selected:value===option.id,disabled}}
   disabled={disabled} onPress={()=>onChange(option.id)}
   style={[s.choice,value===option.id&&s.selected,disabled&&{opacity:.6}]}>
  <Text style={[s.choiceText,value===option.id&&s.selectedText]}>{option.label}</Text>
 </Pressable>)}</View>;
}
export function SmartCallControlCenter({session,onOpenCalls,onSettingsSaved}:{
 session:Session;onOpenCalls:()=>void;onSettingsSaved?:()=>void
}){
 const uid=session.user.id;
 const [section,setSection]=useState<Section>("overview");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [settings,setSettings]=useState<CallSettings>(initialSettings);
 const [hasSettings,setHasSettings]=useState(false);
 const [route,setRoute]=useState<Route|null>(null);
 const [billing,setBilling]=useState<Billing|null>(null);
 const [availableMinutes,setAvailableMinutes]=useState<number|null>(null);
 const [calls,setCalls]=useState<CallRow[]>([]);
 const [prefs,setPrefs]=useState<Preferences>(initialPrefs);
 const [prefEditable,setPrefEditable]=useState(false);
 const [prefMessage,setPrefMessage]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase){setNotice("No se ha configurado el acceso seguro.");setLoading(false);return;}
  setLoading(true);setNotice("");
  try{
   const {data:identity,error:authError}=await supabase.auth.getUser();
   if(authError||identity.user?.id!==uid)throw new Error("Vuelve a iniciar sesión.");
   const [settingsResult,routeResult,billingResult,historyResult,authResult]=await Promise.all([
    supabase.from("smartjob_call_settings")
      .select("desired_language,caller_language,assistant_name").eq("user_id",uid).maybeSingle(),
    supabase.from("smartjob_phone_routes")
      .select("twilio_number,public_number,enabled,receive_method")
      .eq("user_id",uid).order("created_at",{ascending:false}).limit(1),
    supabase.from("smartjob_billing_accounts")
      .select("plan_code,status,included_minutes,used_minutes,topup_minutes").eq("user_id",uid).maybeSingle(),
    supabase.from("smartjob_call_sessions")
      .select("bridge_sid,status,call_mode,started_at,duration_seconds")
      .eq("owner_id",uid).order("started_at",{ascending:false}).limit(15),
    supabase.auth.getSession()
   ]);
   if(settingsResult.error||routeResult.error||billingResult.error||historyResult.error)
    throw new Error("No se pudieron cargar todos los datos de tu cuenta.");
   const item=settingsResult.data;
   setHasSettings(!!item);
   if(item)setSettings({
    desired_language:validLanguage(item.desired_language)?item.desired_language:"es",
    caller_language:validLanguage(item.caller_language)&&item.caller_language!==item.desired_language?item.caller_language:(item.desired_language==="en"?"es":"en"),
    assistant_name:String(item.assistant_name||"")
   });
   else setSettings(initialSettings);
   setRoute((routeResult.data?.[0] as Route|undefined)||null);
   setBilling((billingResult.data as Billing|null)||null);
   setAvailableMinutes(null);
   setCalls((historyResult.data as CallRow[]|null)||[]);
   const token=authResult.data.session?.access_token;
   if(!token)throw new Error("La sesión ha expirado.");
   try{
    const usage=await fetch(api+"/api/billing/overview",{headers:{Authorization:"Bearer "+token}});
    if(usage.ok){const overview=await usage.json() as {minutes?:{available?:number}};
      setAvailableMinutes(typeof overview.minutes?.available==="number"?overview.minutes.available:null);}
   }catch{setAvailableMinutes(null);}
   try{
    const response=await fetch(api+"/api/billing/preferences",{headers:{Authorization:"Bearer "+token}});
    if(!response.ok)throw new Error("Preferencias de voz no disponibles.");
    const result=await response.json() as {editable?:boolean;message?:string;settings?:Partial<Preferences>};
    const saved=result.settings;
    const customerVoice=saved?.voice_customer;
    const ownerVoice=saved?.voice_owner;
    setPrefEditable(result.editable===true);
    setPrefMessage(String(result.message||""));
    setPrefs({
     voice_customer:validChoice(customerVoice)?customerVoice:"default",
     voice_owner:validChoice(ownerVoice)?ownerVoice:"default",
     greeting_customer:String(saved?.greeting_customer||""),
     greeting_owner:String(saved?.greeting_owner||"")
    });
   }catch{
    setPrefEditable(false);
    setPrefMessage("No se pudo consultar la configuración de voces. Inténtalo nuevamente.");
   }
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo actualizar Smart Call.");}
  finally{setLoading(false);}
 },[uid]);
 useEffect(()=>{setSection("overview");void refresh();},[refresh]);
 async function saveBasic(){
  if(!supabase||!hasSettings)return;
  if(settings.desired_language===settings.caller_language){setNotice("Selecciona dos idiomas distintos.");return;}
  const assistant=settings.assistant_name.trim();
  if(!assistant||assistant.length>40){setNotice("El nombre del asistente debe contener entre 1 y 40 caracteres.");return;}
  setSaving(true);setNotice("");
  try{
   const {data:identity}=await supabase.auth.getUser();
   if(identity.user?.id!==uid)throw new Error("Tu sesión ha expirado.");
   // Only editable preferences; NEVER mutate forwarding, phone routing or live Twilio line.
   const {data,error}=await supabase.from("smartjob_call_settings").update({
    desired_language:settings.desired_language,caller_language:settings.caller_language,
    assistant_name:assistant,updated_at:new Date().toISOString()
   }).eq("user_id",uid).select("user_id").maybeSingle();
   if(error||!data)throw new Error("No se pudieron guardar los cambios.");
   onSettingsSaved?.();
   setNotice("Preferencias guardadas. Los cambios de una línea activa requieren verificación.");
  }catch(e){setNotice(e instanceof Error?e.message:"Error guardando preferencias.");}
  finally{setSaving(false);}
 }
 async function savePremium(){
  if(!supabase||!prefEditable)return;
  if([prefs.greeting_customer,prefs.greeting_owner].some(value=>
   value.length>180||/[<>\r\n]/.test(value)||(value.trim().length>0&&value.trim().length<10))){
   setNotice("Cada saludo debe tener de 10 a 180 caracteres, sin saltos de línea ni símbolos < >.");
   return;
  }
  setSaving(true);setNotice("");
  try{
   const {data}=await supabase.auth.getSession();
   if(!data.session)throw new Error("Tu sesión ha expirado.");
   const response=await fetch(api+"/api/billing/preferences",{
    method:"POST",headers:{Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify(prefs)
   });
   if(!response.ok)throw new Error(response.status===403?"Necesitas un plan Pro o Premium activo.":"No se pudieron guardar las voces y saludos.");
   await refresh();
   setNotice("Voces y saludos guardados para las próximas llamadas.");
  }catch(e){setNotice(e instanceof Error?e.message:"Error guardando saludos.");}
  finally{setSaving(false);}
 }
 const minutes=availableMinutes;
 return <View style={s.root}>
  <View style={s.hero}><Text style={s.eyebrow}>VMV BUSINESS / COMUNICACIÓN</Text>
   <Text style={s.title}>Smart Call<Text style={{color:palette.mint}}>.</Text></Text>
   <Text style={s.subtitle}>Tu línea, minutos para llamadas traducidas y actividad del negocio, en un solo lugar.</Text>
   <View style={s.statusPill}><View style={[s.statusDot,{backgroundColor:route?.enabled?"#0DB58D":"#E6A94A"}]}/>
    <Text style={s.statusText}>{route?.enabled?"Línea configurada":"Línea pendiente"} · {billing?.plan_code?.toUpperCase()||"SIN PLAN"}</Text>
   </View>
  </View>
  <View style={s.tabs}>{([{id:"overview",label:"Resumen"},{id:"settings",label:"Ajustes"},{id:"activity",label:"Actividad"}] as const).map(item=>
   <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:section===item.id}} onPress={()=>{setSection(item.id);setNotice("");}} style={[s.tab,section===item.id&&s.activeTab]}>
    <Text style={[s.tabText,section===item.id&&s.activeTabText]}>{item.label}</Text>
   </Pressable>)}</View>
  {loading?<ActivityIndicator color={palette.mint} style={{marginVertical:35}}/>:null}
  {!loading&&section==="overview"?<>
   <View style={s.card}><Text style={s.sectionLabel}>TU LÍNEA DE NEGOCIO</Text>
    <Text style={s.number}>{route?.public_number||route?.twilio_number||"Aún sin número asignado"}</Text>
    <Text style={s.helper}>{route?.enabled?"Hay una ruta guardada. La recepción real debe verificarse con una llamada de prueba.":"Completa la activación antes de desviar llamadas."}</Text>
    <View style={s.divider}/>
    <View style={s.infoRow}><Text style={s.infoLabel}>Idioma del cliente</Text><Text style={s.infoValue}>{readableLanguage(settings.caller_language)}</Text></View>
    <View style={s.infoRow}><Text style={s.infoLabel}>Tu idioma</Text><Text style={s.infoValue}>{readableLanguage(settings.desired_language)}</Text></View>
    <View style={s.infoRow}><Text style={s.infoLabel}>Asistente</Text><Text style={s.infoValue}>{settings.assistant_name||"Sin configurar"}</Text></View>
    <View style={s.infoRow}><Text style={s.infoLabel}>Minutos para traducir llamadas</Text><Text style={s.infoValue}>{minutes===null?"No disponible":String(minutes)+" min"}</Text></View>
    <Text style={s.helper}>Este saldo se usa para llamadas con traducción. No es el tiempo total de llamadas entrantes ni el del traductor en persona.</Text>
    <Action label="Ir a llamadas" onPress={onOpenCalls}/>
   </View>
   <View style={s.metricRow}><View style={s.metric}><Text style={s.metricValue}>{calls.length}</Text><Text style={s.metricLabel}>Llamadas registradas</Text></View>
    <View style={s.metric}><Text style={s.metricValue}>{calls.filter(x=>x.call_mode==="translated").length}</Text><Text style={s.metricLabel}>Traducidas (últimas 15)</Text></View></View>
   <Action label="Actualizar información" secondary onPress={()=>void refresh()}/>
  </>:null}
  {!loading&&section==="settings"?<>
   <View style={s.card}><Text style={s.sectionLabel}>CONFIGURACIÓN ESENCIAL</Text>
    <Text style={s.cardTitle}>Idiomas y asistente</Text>
    <Text style={s.inputLabel}>Idioma en el que atiendes</Text>
    <ChoiceRow value={settings.desired_language} options={[{id:"es",label:"Español"},{id:"en",label:"English"}]}
     onChange={desired_language=>setSettings(v=>({...v,desired_language,caller_language:desired_language==="es"?"en":"es"}))} disabled={!hasSettings||saving}/>
    <Text style={s.inputLabel}>Idioma del cliente</Text>
    <ChoiceRow value={settings.caller_language} options={[{id:"en",label:"English"},{id:"es",label:"Español"}]}
     onChange={caller_language=>setSettings(v=>({...v,caller_language,desired_language:caller_language==="es"?"en":"es"}))} disabled={!hasSettings||saving}/>
    <Text style={s.inputLabel}>Nombre del asistente</Text>
    <TextInput style={s.field} value={settings.assistant_name} onChangeText={assistant_name=>setSettings(v=>({...v,assistant_name}))}
     maxLength={40} placeholder="Nombre del asistente" editable={hasSettings&&!saving} autoCorrect={false}/>
    <Text style={s.helper}>La configuración no cambia automáticamente el desvío ni los números de una línea activa.</Text>
    <Action label={saving?"Guardando…":"Guardar idiomas y asistente"} disabled={!hasSettings||saving} onPress={()=>void saveBasic()}/>
    {!hasSettings?<Text style={s.helper}>Primero completa la activación de tu línea en VMV Call.</Text>:null}
   </View>
   <View style={s.card}><Text style={s.sectionLabel}>PERSONALIZACIÓN DE VOZ</Text>
    <Text style={s.cardTitle}>Voces y saludos</Text>
    <Text style={s.helper}>{prefMessage||"La personalización está disponible con Pro o Premium activo."}</Text>
    <Text style={s.inputLabel}>Voz del cliente</Text>
    <ChoiceRow value={prefs.voice_customer} options={(Object.keys(voiceLabels) as Choice[]).map(id=>({id,label:voiceLabels[id]}))}
     disabled={!prefEditable||saving} onChange={voice_customer=>setPrefs(v=>({...v,voice_customer}))}/>
    <Text style={s.inputLabel}>Tu voz de interpretación</Text>
    <ChoiceRow value={prefs.voice_owner} options={(Object.keys(voiceLabels) as Choice[]).map(id=>({id,label:voiceLabels[id]}))}
     disabled={!prefEditable||saving} onChange={voice_owner=>setPrefs(v=>({...v,voice_owner}))}/>
    <Text style={s.inputLabel}>Saludo al cliente</Text>
    <TextInput style={[s.field,s.multiline]} value={prefs.greeting_customer} multiline textAlignVertical="top" maxLength={180}
     placeholder="Gracias por llamar…" editable={prefEditable&&!saving} onChangeText={greeting_customer=>setPrefs(v=>({...v,greeting_customer}))}/>
    <Text style={s.inputLabel}>Saludo para ti</Text>
    <TextInput style={[s.field,s.multiline]} value={prefs.greeting_owner} multiline textAlignVertical="top" maxLength={180}
     placeholder="Tienes una llamada entrante…" editable={prefEditable&&!saving} onChangeText={greeting_owner=>setPrefs(v=>({...v,greeting_owner}))}/>
    <Action label={saving?"Guardando…":"Guardar voces y saludos"} disabled={!prefEditable||saving} onPress={()=>void savePremium()}/>
   </View>
  </>:null}
  {!loading&&section==="activity"?<View style={s.card}>
   <Text style={s.sectionLabel}>REGISTRO DE LLAMADAS</Text>
   <Text style={s.cardTitle}>Actividad reciente</Text>
   {!calls.length?<Text style={s.helper}>Todavía no hay llamadas registradas.</Text>:null}
   {calls.map(item=><View key={item.bridge_sid} style={s.history}>
     <View style={{flex:1}}><Text style={s.historyTitle}>{item.call_mode==="translated"?"Llamada traducida":"Llamada directa"}</Text>
      <Text style={s.helper}>{new Date(item.started_at).toLocaleString()} · {item.status}</Text></View>
     <Text style={s.historyMinutes}>{item.duration_seconds===null?"—":Math.ceil(item.duration_seconds/60)+" min"}</Text>
    </View>)}
   <Action label="Actualizar historial" secondary onPress={()=>void refresh()}/>
  </View>:null}
  {notice?<View accessibilityRole="alert" style={s.message}><Text style={s.messageText}>{notice}</Text></View>:null}
 </View>;
}
const s=StyleSheet.create({
 root:{paddingBottom:16},hero:{backgroundColor:"#15322F",padding:23,borderRadius:25,marginBottom:14},
 eyebrow:{color:"#8CD5C3",fontSize:10,fontWeight:"800",letterSpacing:1.7},
 title:{color:"#FFFFFF",fontSize:36,fontWeight:"900",letterSpacing:-1.6,marginTop:8},
 subtitle:{color:"#C5DFD6",fontSize:13,lineHeight:21,marginTop:6},
 statusPill:{flexDirection:"row",alignItems:"center",marginTop:22,alignSelf:"flex-start",borderRadius:30,
  paddingHorizontal:12,paddingVertical:9,backgroundColor:"#285047"},
 statusDot:{width:8,height:8,borderRadius:4,marginRight:8},statusText:{fontSize:11,fontWeight:"700",color:"#E7FFF6"},
 tabs:{flexDirection:"row",backgroundColor:"#E9F2EF",borderRadius:16,padding:4,marginBottom:18},
 tab:{flex:1,alignItems:"center",paddingVertical:12,borderRadius:12},activeTab:{backgroundColor:"#FFFFFF"},
 tabText:{fontSize:12,fontWeight:"700",color:"#667D7B"},activeTabText:{color:"#153E36"},
 card:{backgroundColor:palette.white,borderWidth:1,borderColor:palette.line,borderRadius:23,padding:20,marginBottom:15},
 sectionLabel:{fontSize:10,fontWeight:"900",letterSpacing:1.5,color:"#168C71",marginBottom:10},
 cardTitle:{fontSize:21,fontWeight:"800",color:palette.ink,marginBottom:14},
 number:{color:palette.ink,fontSize:25,fontWeight:"800",letterSpacing:-.5,marginBottom:8},
 helper:{fontSize:12,lineHeight:19,color:palette.muted,marginTop:7},
 divider:{height:1,backgroundColor:palette.line,marginVertical:14},
 infoRow:{flexDirection:"row",justifyContent:"space-between",paddingVertical:10,gap:12},
 infoLabel:{color:palette.muted,fontSize:12,flex:1},
 infoValue:{color:palette.ink,fontSize:12,fontWeight:"700",textAlign:"right",flex:1},
 metricRow:{flexDirection:"row",gap:10},
 metric:{flex:1,borderColor:palette.line,borderWidth:1,backgroundColor:"#F3FBF8",borderRadius:18,padding:15,marginBottom:15},
 metricValue:{fontSize:27,fontWeight:"900",color:palette.ink},
 metricLabel:{fontSize:11,color:palette.muted,marginTop:6},
 action:{backgroundColor:palette.mint,borderRadius:14,minHeight:49,paddingHorizontal:16,
  alignItems:"center",justifyContent:"center",marginTop:14},
 actionSecondary:{backgroundColor:palette.pale},
 actionText:{fontSize:14,fontWeight:"800",color:"#06392E"},
 choices:{flexDirection:"row",gap:7,marginBottom:9,flexWrap:"wrap"},
 choice:{flex:1,minWidth:75,backgroundColor:"#F5FAF8",borderColor:palette.line,borderWidth:1,
  paddingVertical:12,paddingHorizontal:9,borderRadius:12,alignItems:"center"},
 selected:{borderColor:palette.mint,backgroundColor:palette.pale},
 choiceText:{color:palette.muted,fontSize:12,fontWeight:"700"},
 selectedText:{color:"#076E58"},
 inputLabel:{fontSize:12,fontWeight:"700",color:palette.ink,marginTop:14,marginBottom:9},
 field:{borderWidth:1,borderColor:palette.line,borderRadius:12,paddingHorizontal:13,
  backgroundColor:"#FCFFFE",minHeight:49,fontSize:15,color:palette.ink},
 multiline:{minHeight:88,paddingTop:12},
 history:{flexDirection:"row",gap:10,alignItems:"center",borderBottomWidth:1,borderBottomColor:palette.line,paddingVertical:12},
 historyTitle:{fontSize:13,fontWeight:"800",color:palette.ink},
 historyMinutes:{fontSize:12,fontWeight:"800",color:"#078469"},
 message:{backgroundColor:"#E6F8F0",borderColor:"#B5EAD7",borderWidth:1,padding:14,borderRadius:13,marginTop:12},
 messageText:{color:"#16684F",fontSize:12,lineHeight:18}
});
