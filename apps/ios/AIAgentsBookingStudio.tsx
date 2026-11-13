import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Alert,Modal,Pressable,ScrollView,StyleSheet,
 Switch,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {Session} from "@supabase/supabase-js";
import type {Agent} from "./aiAgentsData";
import {addBookingSlot,bookingOverview,saveBookingService,serviceTime,timeZones,
 type BookingService,type BookingSlot,type Booking,type ServiceDraft} from "./aiAgentsBookingData";
const C={ink:"#272039",muted:"#887992",violet:"#8959E7",line:"#E6DCF1",paper:"#FFF",bg:"#FAF8FE",mint:"#E1F7ED",blue:"#E6F2FF"};
type Tab="services"|"slots"|"bookings";
type Picker={title:string;options:{label:string;value:string}[];select:(v:string)=>void}|null;
const draft:ServiceDraft={name:"",description:"",duration_minutes:30,price:"",approved:false,
 active:true,auto_confirm:false,time_zone:"America/New_York"};
const clock=Array.from({length:48},(_,i)=>String(Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00"));
function days(zone:string){
 const fmt=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"});
 const p=fmt.formatToParts(new Date());const number=(x:string)=>Number(p.find(y=>y.type===x)?.value);
 const base=Date.UTC(number("year"),number("month")-1,number("day"),18);
 return Array.from({length:45},(_,i)=>{
  const d=new Date(base+i*86400000);
  const id=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=(kind:string)=>id.find(x=>x.type===kind)?.value||"";
  return {label:new Intl.DateTimeFormat("es-US",{timeZone:zone,weekday:"short",month:"short",day:"numeric"}).format(d),
   value:get("year")+"-"+get("month")+"-"+get("day")};
 });
}
type Props={session:Session;agents:Agent[];selectedAgentId:string|null;onBack:()=>void};
export function AIAgentsBookingStudio({session,agents,selectedAgentId,onBack}:Props){
 const [tab,setTab]=useState<Tab>("services");
 const [services,setServices]=useState<BookingService[]>([]);
 const [slots,setSlots]=useState<BookingSlot[]>([]);
 const [bookings,setBookings]=useState<Booking[]>([]);
 const [agentId,setAgentId]=useState(selectedAgentId||agents[0]?.id||"");
 const [serviceId,setServiceId]=useState("");
 const [editing,setEditing]=useState<BookingService|null>(null);
 const [form,setForm]=useState<ServiceDraft>(draft);
 const [showForm,setShowForm]=useState(false);
 const [slotDate,setSlotDate]=useState("");
 const [slotTime,setSlotTime]=useState("10:00");
 const [capacity,setCapacity]=useState("1");
 const [picker,setPicker]=useState<Picker>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const agent=agents.find(x=>x.id===agentId);
 const business=agent?.business_id||"";
 const selectedService=services.find(s=>s.id===serviceId)||services[0]||null;
 const pick=(title:string,options:{label:string;value:string}[],select:(v:string)=>void)=>
  setPicker({title,options,select:v=>{select(v);setPicker(null);}});
 const refresh=useCallback(async()=>{
  if(!business){setLoading(false);return;}
  setLoading(true);
  try{
   const x=await bookingOverview(session,business);
   setServices(x.services);setSlots(x.slots);setBookings(x.bookings);
   if(!serviceId&&x.services.length)setServiceId(x.services[0].id);
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo consultar la agenda.");}
  finally{setLoading(false);}
 },[session.user.id,business]);
 useEffect(()=>{void refresh();},[refresh]);
 const save=async()=>{
  if(!agent||busy)return;setBusy(true);
  try{await saveBookingService(session,business,form,editing);await refresh();
   setForm(draft);setEditing(null);setShowForm(false);
   setNotice("Servicio guardado. Añade horarios disponibles para permitir reservas.");
  }catch(e){Alert.alert("Servicio",e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const add=async()=>{
  if(!selectedService||!slotDate||busy)return;setBusy(true);
  try{await addBookingSlot(session,selectedService,slotDate,slotTime,Number(capacity));
   await refresh();setNotice("Horario disponible guardado en tu agenda VMV.");
  }catch(e){Alert.alert("Horario",e instanceof Error?e.message:"No se pudo crear.");}
  finally{setBusy(false);}
 };
 const input=(label:string,value:string,onChange:(v:string)=>void,keyboardType:"default"|"decimal-pad"="default")=>
  <View style={s.field}><Text style={s.hint}>{label}</Text><TextInput style={s.input}
    value={value} onChangeText={onChange} keyboardType={keyboardType}
    placeholderTextColor="#9B8FA8"/></View>;
 const button=(label:string,fn:()=>void,disabled=false)=><Pressable
  accessibilityRole="button" disabled={disabled} onPress={fn}
  style={[s.button,disabled&&{opacity:.45}]}><Text style={s.buttonText}>{label}</Text></Pressable>;
 const select=(label:string,value:string,onPress:()=>void)=><Pressable
  accessibilityRole="button" onPress={onPress} style={s.select}>
  <Text style={s.hint}>{label}</Text>
  <View style={s.selectRow}><Text style={s.strong}>{value}</Text>
   <Ionicons name="chevron-down" color={C.violet} size={17}/></View></Pressable>;
 return <View style={s.root}><View style={s.header}>
  <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack}
   style={s.back}><Ionicons name="arrow-back" color={C.violet} size={20}/></Pressable>
  <View style={{flex:1}}><Text style={s.eyebrow}>AI AGENTS · AGENDA</Text>
   <Text style={s.title}>Reservas</Text><Text style={s.headerSub}>Servicios y horarios confirmados por tu negocio</Text></View>
 </View>
 <View style={s.tabs}>{([
  ["services","Servicios"],["slots","Horarios"],["bookings","Citas"]
 ] as [Tab,string][]).map(([key,title])=><Pressable key={key}
  accessibilityRole="tab" accessibilityState={{selected:tab===key}}
  style={[s.tab,tab===key&&s.tabOn]} onPress={()=>setTab(key)}>
  <Text style={[s.tabText,tab===key&&{color:C.violet}]}>{title}</Text></Pressable>)}</View>
 <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
  {loading?<ActivityIndicator color={C.violet}/>:null}
  <View style={s.notice}><Ionicons name="shield-checkmark-outline" size={19} color="#357E5A"/>
   <Text style={[s.hint,{flex:1,color:"#326B51"}]}>Agenda interna de VMV. No está sincronizada con Google Calendar ni con otro calendario externo.</Text></View>
  {notice?<Text style={s.alert}>{notice}</Text>:null}
  {tab==="services"&&<>
   <Text style={s.sectionTitle}>Servicios reservables</Text>
   {select("Agente que atenderá las reservas",agent?.name||"Elegir agente",()=>
    pick("Agente",agents.map(a=>({label:a.name,value:a.id})),v=>setAgentId(v)))}
   {agent?.configuration?.cap_bookings!=="Sí"&&<Text style={s.alert}>
    En el asistente de este agente, activa «Reservas» antes de atender citas por teléfono.</Text>}
   {button(showForm?"Cerrar formulario":"Añadir servicio",()=>{setShowForm(!showForm);setForm(draft);setEditing(null);})}
   {showForm&&<View style={s.card}>
    {input("Nombre del servicio",form.name,v=>setForm(p=>({...p,name:v})))}
    {input("Descripción (opcional)",form.description,v=>setForm(p=>({...p,description:v})))}
    {select("Duración",form.duration_minutes+" min",()=>pick("Duración",
     [15,30,45,60,90,120,180,240].map(n=>({label:n+" minutos",value:String(n)})),
     v=>setForm(p=>({...p,duration_minutes:Number(v)}))))}
    {input("Precio aprobado USD (vacío si aún no está confirmado)",form.price,v=>setForm(p=>({...p,price:v})),"decimal-pad")}
    {select("Zona horaria",form.time_zone,()=>pick("Zona horaria",
     timeZones.map(z=>({label:z,value:z})),v=>setForm(p=>({...p,time_zone:v}))))}
    <View style={s.toggle}><Text style={s.strong}>Aprobar información y servicio</Text>
     <Switch value={form.approved} onValueChange={v=>setForm(p=>({...p,approved:v}))}/></View>
    <View style={s.toggle}><Text style={s.strong}>Confirmar automáticamente si hay plaza</Text>
     <Switch value={form.auto_confirm} onValueChange={v=>setForm(p=>({...p,auto_confirm:v}))}/></View>
    <Text style={s.hint}>La confirmación automática también requiere autorización del agente y una plaza libre. No genera cobros.</Text>
    {button(busy?"Guardando…":"Guardar servicio",()=>void save(),busy)}
   </View>}
   {services.map(x=><View key={x.id} style={s.card}><Text style={s.strong}>{x.name}</Text>
    <Text style={s.hint}>{x.duration_minutes} minutos · {x.price_cents===null?"Precio por confirmar":"$"+(x.price_cents/100).toFixed(2)}</Text>
    <Text style={s.hint}>{x.approved?"Aprobado":"Pendiente de aprobación"} · {x.time_zone}</Text>
    {button("Editar",()=>{setEditing(x);setForm({...x,price:x.price_cents===null?"":(x.price_cents/100).toFixed(2)});setShowForm(true);},false)}
   </View>)}
  </>}
  {tab==="slots"&&<>
   <Text style={s.sectionTitle}>Añadir horarios disponibles</Text>
   {selectedService?<>
    {select("Servicio",selectedService.name,()=>pick("Servicio",services.map(x=>({label:x.name,value:x.id})),setServiceId))}
    {select("Fecha en la zona horaria del servicio",slotDate||"Elegir fecha",
     ()=>pick("Fecha",days(selectedService.time_zone),setSlotDate))}
    {select("Hora de inicio",slotTime,()=>pick("Hora",
     clock.map(x=>({label:x,value:x})),setSlotTime))}
    {select("Plazas disponibles",capacity,()=>pick("Capacidad",
     [1,2,3,4,5,6,8,10,12,20].map(n=>({label:String(n),value:String(n)})),setCapacity))}
    {button(busy?"Guardando…":"Añadir horario",()=>void add(),busy||!slotDate)}
   </>:<Text style={s.hint}>Primero añade un servicio.</Text>}
   {slots.map(x=>{const service=services.find(s=>s.id===x.service_id);
    return <View key={x.id} style={s.card}>
     <Text style={s.strong}>{service?.name||"Servicio"}</Text>
     <Text style={s.hint}>{service?serviceTime(x.start_at,service.time_zone):x.start_at}</Text>
     <Text style={s.hint}>{x.capacity} plazas · {x.active?"Disponible":"Desactivado"}</Text>
    </View>;
   })}
  </>}
  {tab==="bookings"&&<>
   <Text style={s.sectionTitle}>Citas recibidas</Text>
   {button("Actualizar agenda",()=>void refresh(),loading)}
   {bookings.length===0?<Text style={s.hint}>Todavía no se han recibido reservas.</Text>:null}
   {bookings.map(x=>{const srv=services.find(s=>s.id===x.service_id);
    const slot=slots.find(sl=>sl.id===x.slot_id);
    return <View key={x.id} style={s.card}>
     <Text style={s.strong}>{x.customer_name}</Text>
     <Text style={s.hint}>{srv?.name||"Servicio"} · {x.status==="confirmed"?"Confirmada":x.status==="requested"?"Necesita revisión":"Cancelada"}</Text>
     <Text style={s.hint}>{slot&&srv?serviceTime(slot.start_at,srv.time_zone):"Fecha en el historial del negocio"}</Text>
    </View>;
   })}
  </>}
 </ScrollView>
 <Modal visible={Boolean(picker)} transparent animationType="slide" onRequestClose={()=>setPicker(null)}>
  <View style={s.overlay}><View style={s.sheet}><View style={s.modalHead}>
   <Text style={s.sectionTitle}>{picker?.title}</Text><Pressable onPress={()=>setPicker(null)}>
    <Ionicons name="close-circle-outline" size={25} color={C.violet}/></Pressable></View>
   <ScrollView style={{maxHeight:340}}>{picker?.options.map(x=><Pressable key={x.value}
     style={s.modalOption} onPress={()=>picker.select(x.value)}>
      <Text style={s.strong}>{x.label}</Text></Pressable>)}</ScrollView>
  </View></View></Modal>
 </View>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},header:{backgroundColor:C.violet,padding:16,
 flexDirection:"row",alignItems:"center",gap:11},back:{width:39,height:39,
 borderRadius:13,backgroundColor:"#FFF",alignItems:"center",justifyContent:"center"},
 eyebrow:{fontSize:9,fontWeight:"900",color:"#F1E5FF",letterSpacing:1},
 title:{fontSize:22,fontWeight:"900",color:"#FFF",marginTop:3},
 headerSub:{fontSize:11,color:"#F5EBFF",marginTop:3},
 tabs:{flexDirection:"row",padding:9,gap:7,backgroundColor:C.paper},
 tab:{flex:1,padding:11,borderRadius:12,alignItems:"center",backgroundColor:"#F5F0FA"},
 tabOn:{backgroundColor:"#EAE1FD"},tabText:{color:C.muted,fontWeight:"800",fontSize:11},
 scroll:{padding:14,gap:13,paddingBottom:70},
 sectionTitle:{fontSize:17,fontWeight:"900",color:C.ink},
 strong:{fontSize:12,fontWeight:"800",color:C.ink},
 hint:{fontSize:11,color:C.muted,lineHeight:17},
 notice:{padding:12,backgroundColor:C.mint,borderRadius:13,flexDirection:"row",alignItems:"flex-start",gap:9},
 alert:{fontSize:11,lineHeight:17,backgroundColor:"#FFF2E8",color:"#99652C",padding:12,borderRadius:13},
 field:{gap:5},input:{borderWidth:1,borderColor:C.line,backgroundColor:C.paper,
 padding:12,borderRadius:11,color:C.ink,fontSize:12},
 select:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.line,
 borderRadius:13,padding:12,gap:6},
 selectRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 button:{backgroundColor:C.violet,borderRadius:12,padding:12,alignItems:"center"},
 buttonText:{color:"#FFF",fontSize:12,fontWeight:"900"},
 card:{padding:13,backgroundColor:C.paper,borderWidth:1,borderColor:C.line,
 borderRadius:15,gap:8},
 toggle:{flexDirection:"row",gap:10,alignItems:"center",justifyContent:"space-between"},
 overlay:{flex:1,justifyContent:"flex-end",backgroundColor:"#15101A88"},
 sheet:{backgroundColor:"#FFF",padding:16,borderTopLeftRadius:21,borderTopRightRadius:21},
 modalHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},
 modalOption:{padding:13,borderBottomWidth:1,borderBottomColor:C.line}
});
