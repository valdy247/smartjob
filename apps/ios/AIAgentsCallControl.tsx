import React,{useEffect,useState} from "react";
import {ActivityIndicator,Alert,Modal,Pressable,ScrollView,StyleSheet,
 Switch,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {Session} from "@supabase/supabase-js";
import {getCallInfo,saveCallInfo,simulateCallInfo,weekDays,zones,
 type CallPolicy,type CallInfo,type DayName} from "./aiAgentsCallData";

const C={ink:"#291F3E",muted:"#877896",violet:"#8758E8",line:"#EADFF5",
 mint:"#E6F6EB",paper:"#FFFFFF",bg:"#FAF8FE",soft:"#F0E7FF"};
const dayLabel:Record<DayName,string>={mon:"Lun",tue:"Mar",wed:"Mié",thu:"Jue",fri:"Vie",sat:"Sáb",sun:"Dom"};
type SelectOption={label:string;value:string};
type Selector={title:string;options:SelectOption[];choose:(v:string)=>void}|null;
type Props={session:Session;onBack:()=>void};
const clockOptions:Array<SelectOption>=Array.from({length:48},(_,i)=>{
 const time=String(Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00");
 return {label:time,value:time};
});
function Title({text}:{text:string}){return <Text style={s.title}>{text}</Text>}
function Toggle({label,sub,value,onChange}:{label:string;sub?:string;value:boolean;onChange:(v:boolean)=>void}){
 return <View style={s.toggle}><View style={{flex:1,gap:3}}>
  <Text style={s.strong}>{label}</Text>{sub?<Text style={s.hint}>{sub}</Text>:null}</View>
  <Switch value={value} onValueChange={onChange} trackColor={{false:"#E7DFED",true:"#C9AAF8"}}
   thumbColor={value?C.violet:"#FFF"}/></View>;
}
function Segmented({items,value,onChange}:{items:SelectOption[];value:string;onChange:(v:string)=>void}){
 return <View style={s.choices}>{items.map(item=><Pressable key={item.value}
  accessibilityRole="button" accessibilityState={{selected:value===item.value}}
  onPress={()=>onChange(item.value)} style={[s.chip,value===item.value&&s.selected]}>
  <Text style={[s.chipText,value===item.value&&{color:"#6F40C2"}]}>{item.label}</Text>
 </Pressable>)}</View>;
}
export function AIAgentsCallControl({session,onBack}:Props){
 const [info,setInfo]=useState<CallInfo|null>(null);
 const [policy,setPolicy]=useState<CallPolicy|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [selector,setSelector]=useState<Selector>(null);
 const [testDay,setTestDay]=useState<DayName>("mon");
 const [testTime,setTestTime]=useState("10:00");
 const [result,setResult]=useState("");
 useEffect(()=>{
  let mounted=true;void getCallInfo(session).then(v=>{if(mounted){setInfo(v);setPolicy(v.policy);}})
   .catch(e=>{if(mounted)setMessage(e instanceof Error?e.message:"No se pudo consultar.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[session.user.id]);
 const patch=<K extends keyof CallPolicy>(key:K,value:CallPolicy[K])=>{
  setPolicy(p=>p?{...p,[key]:value}:p);setResult("");
 };
 const dayPatch=(d:DayName,key:"enabled"|"start"|"end",value:boolean|string)=>{
  setPolicy(p=>p?{...p,schedule:{...p.schedule,[d]:{...p.schedule[d],[key]:value}}}:p);
  setResult("");
 };
 const choose=(title:string,options:SelectOption[],fn:(v:string)=>void)=>
  setSelector({title,options,choose:v=>{fn(v);setSelector(null);}});
 const save=async()=>{
  if(!policy||!info||busy)return;setBusy(true);setMessage("");
  try{
   const x=await saveCallInfo(session,policy,info.version);
   setPolicy(x.policy);setInfo({...info,version:x.version});
   setMessage("Guardado para la próxima llamada. Twilio no se ha modificado.");
  }catch(e){Alert.alert("Configuración no guardada",e instanceof Error?e.message:"Actualiza la pantalla.");}
  finally{setBusy(false);}
 };
 const preview=async()=>{
  if(!policy||busy)return;setBusy(true);setResult("");
  try{
   const r=await simulateCallInfo(session,policy,testDay,testTime);
   const labels:Record<string,string>={
    menu:"El cliente elige IA o traducción en el menú",
    agent:"Contesta el agente seleccionado",translation:"Atiende Smart Call con traducción",
    ring_owner:"Primero suena el teléfono del negocio; después el agente",
    message:"Se escucha el mensaje de cierre y termina la llamada"};
   setResult(labels[r.decision.action]||"No disponible");
  }catch(e){Alert.alert("Prueba de horario",e instanceof Error?e.message:"No se pudo comprobar.");}
  finally{setBusy(false);}
 };
 const option=(label:string,value:string,onPress:()=>void)=>
  <Pressable accessibilityRole="button" onPress={onPress} style={s.picker}>
   <Text style={s.hint}>{label}</Text><View style={s.pickerValue}>
    <Text style={s.strong}>{value}</Text>
    <Ionicons name="chevron-down" size={16} color={C.violet}/></View></Pressable>;
 return <View style={s.root}>
  <View style={s.hero}>
   <Pressable accessibilityLabel="Volver" accessibilityRole="button" style={s.back} onPress={onBack}>
    <Ionicons name="arrow-back" color="#7546C1" size={21}/></Pressable>
   <View style={{flex:1}}><Text style={s.eyebrow}>AI AGENTS · TELÉFONO</Text>
    <Text style={s.mainTitle}>Atención de llamadas</Text>
    <Text style={s.heroSub}>{info?.maskedPhone||"Tu línea autorizada"}</Text></View>
  </View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
   {loading?<ActivityIndicator color={C.violet}/>:null}
   {message?<View style={s.banner}><Ionicons name="information-circle-outline" color="#6547A0" size={20}/>
    <Text style={[s.hint,{flex:1,color:"#6547A0"}]}>{message}</Text></View>:null}
   {policy&&info?<>
    <View style={s.box}><Title text="Agente IA"/>
     <Toggle label="Responder llamadas" sub={info.agentActive?"Agente seleccionado y activo":"Primero selecciona y activa tu agente"}
      value={policy.agent_enabled} onChange={v=>patch("agent_enabled",v)}/>
     {policy.agent_enabled&&<>
      <Text style={s.label}>¿Cuándo atiende?</Text>
      <Segmented items={[{label:"Siempre",value:"always"},{label:"Por horario",value:"schedule"},
        ...(info.forwardReady?[{label:"Si no contestan",value:"after_no_answer"}]:[])]}
       value={policy.agent_mode} onChange={v=>patch("agent_mode",v as CallPolicy["agent_mode"])}/>
      {policy.agent_mode==="after_no_answer"&&<>
       {option("Tiempo antes de pasar al agente",policy.ring_seconds+" segundos",
        ()=>choose("Segundos de espera",[10,15,18,20,25,30].map(n=>({label:n+" segundos",value:String(n)})),
          v=>patch("ring_seconds",Number(v))))}
       <Text style={s.hint}>Intenta llamar primero al teléfono autorizado. Puede generar cargos telefónicos.</Text>
      </>}
     </>}
    </View>
    <View style={s.box}><Title text="Traducción"/>
     <Toggle label="Traducción disponible" sub="Se conserva el motor de Smart Call"
      value={policy.translation_enabled}
      onChange={v=>setPolicy(p=>p?{...p,translation_enabled:v,
       outside_action:v?p.outside_action:"message"}:p)}/>
     {policy.translation_enabled&&<Segmented value={policy.translation_mode}
      onChange={v=>patch("translation_mode",v as CallPolicy["translation_mode"])}
      items={[{label:"Siempre",value:"always"},{label:"Por horario",value:"schedule"}]}/>}
    </View>
    {policy.agent_enabled&&policy.translation_enabled&&<View style={s.box}>
     <Title text="Cuando ambos están disponibles"/>
     <Segmented value={policy.coexistence}
      onChange={v=>patch("coexistence",v as CallPolicy["coexistence"])}
      items={[{label:"Menú",value:"menu"},{label:"IA primero",value:"agent_first"},
       {label:"Traducción",value:"translation_first"}]}/>
    </View>}
    {(policy.agent_mode==="schedule"||policy.translation_mode==="schedule")&&<View style={s.box}>
     <Title text="Horario"/>
     {option("Zona horaria",policy.time_zone.replace("America/","").replaceAll("_"," "),
      ()=>choose("Zona horaria",zones.map(z=>({label:z.replace("America/","").replaceAll("_"," "),value:z})),
       v=>patch("time_zone",v)))}
     {info.businessHoursReady&&<Toggle label="Usar horario del negocio" value={policy.use_business_hours}
      onChange={v=>patch("use_business_hours",v)}/>}
     {!policy.use_business_hours&&weekDays.map(day=><View style={s.day} key={day}>
      <Toggle label={dayLabel[day]} value={policy.schedule[day].enabled}
       onChange={v=>dayPatch(day,"enabled",v)}/>
      {policy.schedule[day].enabled&&<View style={s.times}>
       {(["start","end"] as const).map(key=>
        <Pressable key={key} accessibilityRole="button" style={s.timeButton}
         onPress={()=>choose(key==="start"?"Apertura":"Cierre",clockOptions,
           v=>dayPatch(day,key,v))}>
         <Text style={s.hint}>{key==="start"?"Desde":"Hasta"}</Text>
         <Text style={s.strong}>{policy.schedule[day][key]}</Text>
        </Pressable>)}
      </View>}
     </View>)}
     <Text style={s.hint}>Un cierre anterior a la apertura continúa después de medianoche.</Text>
    </View>}
    <View style={s.box}><Title text="Fuera de horario"/>
     <Segmented value={policy.outside_action} onChange={v=>patch("outside_action",v as CallPolicy["outside_action"])}
      items={[...(policy.translation_enabled?[{label:"Smart Call",value:"translation"}]:[]),
       {label:"Mensaje y cierre",value:"message"}]}/>
     {policy.outside_action==="message"&&<TextInput style={s.input} multiline
      maxLength={220} value={policy.closed_message} onChangeText={v=>patch("closed_message",v)}
      placeholder="Mensaje de cierre" placeholderTextColor="#A69AB1"/>}
    </View>
    <View style={s.banner}><Ionicons name="shield-checkmark-outline" size={20} color="#467B60"/>
     <Text style={[s.hint,{flex:1,color:"#3B765B"}]}>Los cambios se aplican a nuevas llamadas. La configuración de traducción existente no se modifica.</Text></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()}
     style={[s.primary,busy&&{opacity:.5}]}><Ionicons name="save-outline" color="#FFF" size={18}/>
     <Text style={s.primaryText}>{busy?"Procesando…":"Guardar atención de llamadas"}</Text></Pressable>
    <View style={s.box}><Title text="Probar configuración"/>
     <Text style={s.hint}>Consulta qué ocurriría sin llamar ni consumir minutos.</Text>
     <View style={s.times}>
      <Pressable style={s.timeButton} onPress={()=>choose("Día de prueba",weekDays.map(d=>({
       label:dayLabel[d],value:d})),v=>setTestDay(v as DayName))}>
       <Text style={s.hint}>Día</Text><Text style={s.strong}>{dayLabel[testDay]}</Text></Pressable>
      <Pressable style={s.timeButton} onPress={()=>choose("Hora de prueba",clockOptions,setTestTime)}>
       <Text style={s.hint}>Hora</Text><Text style={s.strong}>{testTime}</Text></Pressable>
     </View>
     <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void preview()} style={s.secondary}>
      <Ionicons name="flask-outline" size={17} color={C.violet}/>
      <Text style={s.secondaryText}>Ver resultado</Text></Pressable>
     {result?<Text style={s.result} accessibilityRole="text">{result}</Text>:null}
    </View>
   </>:null}
  </ScrollView>
  <Modal visible={Boolean(selector)} transparent animationType="slide"
   onRequestClose={()=>setSelector(null)}>
   <View style={s.overlay}><View style={s.sheet}>
    <View style={s.sheetHead}><Text style={s.title}>{selector?.title}</Text>
     <Pressable accessibilityLabel="Cerrar selector" onPress={()=>setSelector(null)}>
      <Ionicons name="close-circle-outline" size={24} color={C.violet}/></Pressable></View>
    <ScrollView style={{maxHeight:330}}>{selector?.options.map(item=><Pressable key={item.value}
     style={s.option} onPress={()=>selector.choose(item.value)}>
     <Text style={s.strong}>{item.label}</Text></Pressable>)}</ScrollView>
   </View></View>
  </Modal>
 </View>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},
 hero:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:C.violet,padding:16},
 back:{width:40,height:40,alignItems:"center",justifyContent:"center",borderRadius:13,backgroundColor:"#F2E8FF"},
 eyebrow:{fontSize:9,color:"#F1E2FF",letterSpacing:1,fontWeight:"900"},
 mainTitle:{fontSize:20,color:"#FFF",fontWeight:"900",marginTop:4},
 heroSub:{fontSize:11,color:"#F1E4FF",marginTop:3},
 scroll:{padding:14,paddingBottom:70,gap:13},
 box:{backgroundColor:C.paper,borderColor:C.line,borderWidth:1,borderRadius:18,padding:14,gap:12},
 title:{fontSize:16,fontWeight:"900",color:C.ink},
 strong:{fontSize:12,color:C.ink,fontWeight:"800"},
 label:{fontSize:11,fontWeight:"800",color:C.muted},
 hint:{fontSize:11,lineHeight:16,color:C.muted},
 toggle:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
 choices:{flexDirection:"row",gap:7,flexWrap:"wrap"},
 chip:{borderColor:C.line,borderWidth:1,backgroundColor:"#FFF",borderRadius:13,paddingHorizontal:11,paddingVertical:10},
 selected:{backgroundColor:C.soft,borderColor:"#B898F5"},
 chipText:{fontSize:11,color:C.muted,fontWeight:"800"},
 picker:{padding:12,backgroundColor:"#F9F5FE",borderRadius:13,gap:7},
 pickerValue:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 day:{paddingTop:10,borderTopWidth:1,borderTopColor:C.line,gap:8},
 times:{flexDirection:"row",gap:9},
 timeButton:{flex:1,backgroundColor:"#F7F2FD",padding:11,borderRadius:12,gap:5},
 input:{minHeight:65,textAlignVertical:"top",backgroundColor:"#FFF",borderWidth:1,
  borderColor:C.line,borderRadius:12,padding:12,color:C.ink,fontSize:12},
 banner:{flexDirection:"row",alignItems:"flex-start",gap:9,padding:12,borderRadius:13,backgroundColor:C.mint},
 primary:{backgroundColor:C.violet,borderRadius:14,padding:14,flexDirection:"row",
  alignItems:"center",justifyContent:"center",gap:9},
 primaryText:{color:"#FFF",fontSize:12,fontWeight:"900"},
 secondary:{borderColor:C.line,borderWidth:1,backgroundColor:"#FFF",borderRadius:13,
  flexDirection:"row",justifyContent:"center",alignItems:"center",gap:9,padding:12},
 secondaryText:{fontSize:12,fontWeight:"900",color:C.violet},
 result:{backgroundColor:C.soft,color:"#65439B",padding:12,borderRadius:12,fontSize:11,lineHeight:16},
 overlay:{flex:1,backgroundColor:"#17102188",justifyContent:"flex-end"},
 sheet:{backgroundColor:"#FFF",borderTopLeftRadius:22,borderTopRightRadius:22,padding:18},
 sheetHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:14},
 option:{padding:14,borderBottomWidth:1,borderBottomColor:C.line}
});
