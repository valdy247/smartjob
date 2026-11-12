import React,{useCallback,useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Alert,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
import Ionicons from "@expo/vector-icons/Ionicons";

type Contact={id:string;owner_id:string;name:string;phone_e164:string;notes:string;created_at:string};
const canDialVMV=(phone:string)=>/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone);
const normalize=(input:string):string|null=>{
 const compact=input.trim().replace(/[().\s-]/g,"");
 if(!/^\+?[0-9]+$/.test(compact))return null;
 const e164=compact.startsWith("+")?compact:
  compact.length===10?"+1"+compact:compact.length===11&&compact.startsWith("1")?"+"+compact:null;
 return e164&&/^\+[1-9][0-9]{7,14}$/.test(e164)?e164:null;
};
const errorText=(error:unknown)=>{
 const e=error as {code?:string}|null;
 if(e?.code==="23505")return "Este teléfono ya existe en tu agenda.";
 if(e?.code==="23514")return "Comprueba los datos del contacto.";
 return "No pudimos guardar el contacto. Revisa la conexión y vuelve a intentarlo.";
};
export function ContactsPanel({session,onBack,initialPhone="",startInForm=false,embedded=false,onCall}:{
 session:Session;onBack:()=>void;initialPhone?:string;startInForm?:boolean;embedded?:boolean;
 onCall?:(phone:string,name:string)=>void
}){
 const owner=session.user.id;
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [query,setQuery]=useState("");
 const [formOpen,setFormOpen]=useState(startInForm||Boolean(initialPhone));
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [phone,setPhone]=useState(initialPhone);
 const [notes,setNotes]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setError("Supabase no está disponible.");setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const {data:identity,error:authError}=await supabase.auth.getUser();
   if(authError||identity.user?.id!==owner)throw new Error("Vuelve a iniciar sesión.");
   const {data,error:dbError}=await supabase.from("smartjob_contacts")
    .select("id,owner_id,name,phone_e164,notes,created_at").eq("owner_id",owner).order("name").limit(300);
   if(dbError)throw dbError;
   setContacts((data||[]) as Contact[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar la agenda.");}
  finally{setLoading(false);}
 },[owner]);
 useEffect(()=>{void load();},[load]);
 const filtered=useMemo(()=>{
  const term=query.toLocaleLowerCase().trim();
  return term?contacts.filter(x=>x.name.toLocaleLowerCase().includes(term)||x.phone_e164.includes(term)):contacts;
 },[contacts,query]);
 function clear(){
  setEditing(null);setName("");setPhone("");setNotes("");setFormOpen(false);
  setError("");setMessage("");
 }
 function newContact(){
  setEditing(null);setName("");setPhone("");setNotes("");setFormOpen(true);
  setError("");setMessage("");
 }
 function edit(entry:Contact){
  setEditing(entry.id);setName(entry.name);setPhone(entry.phone_e164);setNotes(entry.notes);
  setFormOpen(true);setError("");setMessage("");
 }
 async function save(){
  if(!supabase||busy)return;
  const phoneValue=normalize(phone);
  if(name.trim().length<1||name.trim().length>80){setError("Escribe un nombre de 1 a 80 caracteres.");return;}
  if(!phoneValue){setError("Escribe un teléfono válido, por ejemplo +17060000000.");return;}
  if(notes.length>600){setError("Las notas deben tener menos de 600 caracteres.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const {data:identity}=await supabase.auth.getUser();
   if(identity.user?.id!==owner)throw new Error("Vuelve a iniciar sesión.");
   const values={name:name.trim(),phone_e164:phoneValue,notes:notes.trim(),updated_at:new Date().toISOString()};
   if(editing){
    const {data,error:saveError}=await supabase.from("smartjob_contacts").update(values)
     .eq("id",editing).eq("owner_id",owner).select("id").maybeSingle();
    if(saveError||!data)throw saveError||new Error("No se guardaron los cambios.");
   }else{
    const {data,error:saveError}=await supabase.from("smartjob_contacts").insert({...values,owner_id:owner})
     .select("id").maybeSingle();
    if(saveError||!data)throw saveError||new Error("No se creó el contacto.");
   }
   const wasEdit=Boolean(editing);clear();await load();
   setMessage(wasEdit?"Contacto actualizado.":"Contacto guardado en tu agenda VMV.");
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }
 function askDelete(){
  if(!editing||busy||!supabase)return;
  const id=editing;
  Alert.alert("Eliminar contacto","¿Quieres eliminarlo de tu agenda VMV?",[
   {text:"Cancelar",style:"cancel"},
   {text:"Eliminar",style:"destructive",onPress:()=>void remove(id)}
  ]);
 }
 async function remove(id:string){
  if(!supabase||busy)return;
  setBusy(true);setError("");
  try{
   const {data:identity}=await supabase.auth.getUser();
   if(identity.user?.id!==owner)throw new Error("Vuelve a iniciar sesión.");
   const {data,error:deleteError}=await supabase.from("smartjob_contacts").delete()
    .eq("owner_id",owner).eq("id",id).select("id").maybeSingle();
   if(deleteError||!data)throw deleteError||new Error("No se eliminó.");
   clear();await load();setMessage("Contacto eliminado de tu agenda VMV.");
  }catch{setError("No pudimos eliminar el contacto.");}
  finally{setBusy(false);}
 }
 return <View style={styles.root}>
  {!embedded?<Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Volver a llamadas</Text></Pressable>:null}
  <View style={embedded?styles.compactTitleRow:styles.titleRow}>
   {embedded?<Text style={styles.compactCount}>{contacts.length} contacto{contacts.length===1?"":"s"}</Text>:
   <View style={{flex:1}}><Text style={styles.kicker}>SMART CALL / AGENDA</Text><Text style={styles.title}>Contactos<Text style={{color:"#00BB91"}}>.</Text></Text>
   <Text style={styles.caption}>{contacts.length} contactos guardados en VMV</Text></View>}
   {!formOpen?<Pressable accessibilityRole="button" accessibilityLabel="Nuevo contacto" onPress={newContact} style={styles.plus}><Text style={styles.plusText}>+</Text></Pressable>:null}
  </View>
  {formOpen?<View style={styles.card}>
   <Text style={styles.formTitle}>{editing?"Editar contacto":"Nuevo contacto"}</Text>
   <Text style={styles.label}>Nombre *</Text>
   <TextInput accessibilityLabel="Nombre del contacto" style={styles.field} placeholder="Nombre y apellido"
    placeholderTextColor="#94A69A" value={name} maxLength={80} onChangeText={setName} autoCapitalize="words"/>
   <Text style={styles.label}>Teléfono *</Text>
   <TextInput accessibilityLabel="Número de teléfono" style={styles.field} placeholder="+1 (706) 000-0000" keyboardType="phone-pad"
    placeholderTextColor="#94A69A" value={phone} maxLength={24} onChangeText={setPhone}/>
   <Text style={styles.label}>Nota (opcional)</Text>
   <TextInput accessibilityLabel="Nota del contacto" style={[styles.field,styles.notes]} multiline textAlignVertical="top"
    placeholder="Cliente frecuente, mejor horario…" placeholderTextColor="#94A69A"
    maxLength={600} value={notes} onChangeText={setNotes}/>
   <Text style={styles.caption}>Se guarda en tu agenda VMV. No cambia los contactos del iPhone.</Text>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy}
    onPress={()=>void save()} style={[styles.primary,busy&&{opacity:.55}]}>
    <Text style={styles.primaryText}>{busy?"Guardando…":editing?"Guardar cambios":"Guardar contacto"}</Text>
   </Pressable>
   {editing&&onCall?<Pressable accessibilityRole="button"
    accessibilityLabel={"Preparar llamada a "+name+" desde VMV"}
    disabled={busy||!canDialVMV(phone)}
    style={[styles.callContact, (busy||!canDialVMV(phone))&&styles.callDisabled]}
    onPress={()=>onCall(phone,name)}>
    <Ionicons name="call-outline" size={19} color="#7445B8"/>
    <Text style={styles.callContactText}>Preparar llamada con VMV</Text>
   </Pressable>:null}
   <Pressable accessibilityRole="button" onPress={clear} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
   {editing?<Pressable accessibilityRole="button" disabled={busy} onPress={askDelete} style={styles.delete}>
    <Text style={styles.deleteText}>Eliminar contacto</Text></Pressable>:null}
  </View>:<>
   <TextInput accessibilityLabel="Buscar en contactos" style={styles.search} value={query} onChangeText={setQuery}
    placeholder="Buscar por nombre o número" placeholderTextColor="#93A79A" autoCapitalize="none"/>
   {loading?<ActivityIndicator color="#0BA980" style={{marginTop:30}}/>:
    filtered.length?<View style={styles.card}>{filtered.map(entry=><View key={entry.id} style={styles.contactRow}>
     <Pressable accessibilityRole="button" accessibilityLabel={"Editar "+entry.name}
      style={styles.contactRowMain} onPress={()=>edit(entry)}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{entry.name.slice(0,1).toUpperCase()}</Text></View>
      <View style={{flex:1}}><Text style={styles.contactName}>{entry.name}</Text><Text style={styles.contactPhone}>{entry.phone_e164}</Text></View>
     </Pressable>
     {onCall?<Pressable accessibilityRole="button" accessibilityLabel={"Llamar a "+entry.name+" desde VMV"}
      disabled={!canDialVMV(entry.phone_e164)}
      style={[styles.callIconButton,!canDialVMV(entry.phone_e164)&&styles.callDisabled]}
      onPress={()=>onCall(entry.phone_e164,entry.name)}>
      <Ionicons name="call-outline" size={20} color="#7951C4"/>
     </Pressable>:null}
    </View>)}</View>:
    <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text>
     <Text style={styles.emptyTitle}>{contacts.length?"Sin coincidencias":"Todavía no tienes contactos"}</Text>
     <Text style={styles.caption}>{contacts.length?"Prueba otra búsqueda.":"Añade clientes a tu agenda para encontrarlos fácilmente."}</Text>
     {!contacts.length?<Pressable accessibilityRole="button" style={styles.primary} onPress={newContact}>
      <Text style={styles.primaryText}>+ Añadir contacto</Text></Pressable>:null}
    </View>}
  </>}
  {message?<View style={styles.notice} accessibilityRole="text"><Text style={styles.noticeText}>{message}</Text></View>:null}
  {error?<View style={styles.alert} accessibilityRole="alert"><Text style={styles.alertText}>{error}</Text></View>:null}
 </View>;
}
const styles=StyleSheet.create({
 root:{paddingBottom:22},back:{marginBottom:16,paddingVertical:6},backText:{fontSize:13,color:"#8052C4",fontWeight:"800"},
 compactTitleRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:45,marginBottom:15},
 compactCount:{fontSize:12,color:"#8D7E9E",fontWeight:"800"},
 titleRow:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:19},
 kicker:{fontSize:10,letterSpacing:1.6,fontWeight:"900",color:"#9260E1"},
 title:{fontSize:34,letterSpacing:-1.4,fontWeight:"900",color:"#29223D",marginTop:8},
 caption:{color:"#9186A1",fontSize:12,lineHeight:19,marginTop:5},
 plus:{width:47,height:47,backgroundColor:"#EDE2FF",borderWidth:1,borderColor:"#DDCBF6",borderRadius:14,alignItems:"center",justifyContent:"center"},
 plusText:{fontSize:25,fontWeight:"700",color:"#7C4FC4"},
 card:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#EAE1F1",borderRadius:21,padding:17,marginBottom:16},
 formTitle:{fontSize:20,fontWeight:"800",color:"#29223E",marginBottom:10},
 label:{fontSize:12,fontWeight:"800",color:"#6A5687",marginTop:14,marginBottom:9},
 field:{borderRadius:12,borderWidth:1,borderColor:"#E5D8F2",backgroundColor:"#FBFAFF",minHeight:50,paddingHorizontal:13,color:"#29223D",fontSize:15},
 notes:{minHeight:88,paddingTop:13},
 search:{borderRadius:13,borderWidth:1,borderColor:"#E4D6F2",backgroundColor:"#FFFFFF",height:51,paddingHorizontal:15,marginBottom:15,color:"#29223D",fontSize:14},
 primary:{backgroundColor:"#9060E6",borderRadius:16,minHeight:49,alignItems:"center",justifyContent:"center",marginTop:17,paddingHorizontal:12},
 primaryText:{color:"#FFFFFF",fontSize:14,fontWeight:"900"},
 secondary:{paddingVertical:15,alignItems:"center",marginTop:5},secondaryText:{fontSize:13,fontWeight:"700",color:"#8364AC"},
 delete:{alignItems:"center",padding:13,marginTop:6},deleteText:{color:"#AE4B5A",fontSize:12,fontWeight:"800"},
 contactRow:{flexDirection:"row",alignItems:"center",gap:6,paddingVertical:5,borderBottomColor:"#EAE2F1",borderBottomWidth:1},
 contactRowMain:{flex:1,minWidth:0,minHeight:60,flexDirection:"row",alignItems:"center",gap:11},
 callIconButton:{width:43,height:43,borderRadius:15,backgroundColor:"#EFE5FF",borderWidth:1,borderColor:"#E0CEF8",
  alignItems:"center",justifyContent:"center"},
 callDisabled:{opacity:.3},
 callContact:{marginTop:12,minHeight:44,borderRadius:15,backgroundColor:"#EFE5FF",borderColor:"#E0CEF8",borderWidth:1,
  flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
 callContactText:{color:"#7445B8",fontWeight:"800",fontSize:12},
 avatar:{width:43,height:43,backgroundColor:"#EFE6FF",borderRadius:15,alignItems:"center",justifyContent:"center"},
 avatarText:{fontSize:18,fontWeight:"800",color:"#8052C9"},
 contactName:{fontSize:14,fontWeight:"800",color:"#29223D"},
 contactPhone:{fontSize:12,color:"#92849E",marginTop:5},
 chevron:{fontSize:24,color:"#A69AB4"},
 empty:{alignItems:"center",paddingVertical:38,paddingHorizontal:19,backgroundColor:"#FFFFFF",borderRadius:18,borderWidth:1,borderColor:"#EBE2F3"},
 emptyIcon:{fontSize:42,color:"#9973E2"},emptyTitle:{fontSize:17,color:"#322543",fontWeight:"800",textAlign:"center",marginTop:13},
 notice:{backgroundColor:"#EEE4FF",borderColor:"#D9C5F9",borderWidth:1,padding:13,borderRadius:12},
 noticeText:{fontSize:12,color:"#714CB4"},
 alert:{backgroundColor:"#FFF1F2",borderColor:"#F1CDD3",borderWidth:1,padding:13,borderRadius:12},
 alertText:{fontSize:12,color:"#B3485C"}
});
