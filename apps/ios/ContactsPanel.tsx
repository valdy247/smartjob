import React,{useCallback,useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Alert,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";

type Contact={id:string;owner_id:string;name:string;phone_e164:string;notes:string;created_at:string};
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
export function ContactsPanel({session,onBack,initialPhone="",startInForm=false}:{
 session:Session;onBack:()=>void;initialPhone?:string;startInForm?:boolean
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
  <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Volver a llamadas</Text></Pressable>
  <View style={styles.titleRow}><View style={{flex:1}}><Text style={styles.kicker}>SMART CALL / AGENDA</Text><Text style={styles.title}>Contactos<Text style={{color:"#00BB91"}}>.</Text></Text>
   <Text style={styles.caption}>{contacts.length} contactos guardados en VMV</Text></View>
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
   <Pressable accessibilityRole="button" onPress={clear} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
   {editing?<Pressable accessibilityRole="button" disabled={busy} onPress={askDelete} style={styles.delete}>
    <Text style={styles.deleteText}>Eliminar contacto</Text></Pressable>:null}
  </View>:<>
   <TextInput accessibilityLabel="Buscar en contactos" style={styles.search} value={query} onChangeText={setQuery}
    placeholder="Buscar por nombre o número" placeholderTextColor="#93A79A" autoCapitalize="none"/>
   {loading?<ActivityIndicator color="#0BA980" style={{marginTop:30}}/>:
    filtered.length?<View style={styles.card}>{filtered.map(entry=><Pressable key={entry.id} accessibilityRole="button"
     accessibilityLabel={"Editar "+entry.name} style={styles.contactRow} onPress={()=>edit(entry)}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{entry.name.slice(0,1).toUpperCase()}</Text></View>
      <View style={{flex:1}}><Text style={styles.contactName}>{entry.name}</Text><Text style={styles.contactPhone}>{entry.phone_e164}</Text></View>
      <Text style={styles.chevron}>›</Text>
     </Pressable>)}</View>:
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
 root:{paddingBottom:22},back:{marginBottom:16,paddingVertical:6},backText:{fontSize:13,color:"#0E9270",fontWeight:"800"},
 titleRow:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:19},
 kicker:{fontSize:10,letterSpacing:1.6,fontWeight:"900",color:"#08A781"},
 title:{fontSize:34,letterSpacing:-1.4,fontWeight:"900",color:"#193D32",marginTop:8},
 caption:{color:"#81968C",fontSize:12,lineHeight:19,marginTop:5},
 plus:{width:47,height:47,backgroundColor:"#DFF9EB",borderWidth:1,borderColor:"#B9E8CE",borderRadius:14,alignItems:"center",justifyContent:"center"},
 plusText:{fontSize:25,fontWeight:"700",color:"#088262"},
 card:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DFECE4",borderRadius:21,padding:17,marginBottom:16},
 formTitle:{fontSize:20,fontWeight:"800",color:"#183D32",marginBottom:10},
 label:{fontSize:12,fontWeight:"800",color:"#325B48",marginTop:14,marginBottom:9},
 field:{borderRadius:12,borderWidth:1,borderColor:"#D0E6D9",backgroundColor:"#FAFDFB",minHeight:50,paddingHorizontal:13,color:"#163A2E",fontSize:15},
 notes:{minHeight:88,paddingTop:13},
 search:{borderRadius:13,borderWidth:1,borderColor:"#CFE8D8",backgroundColor:"#FFFFFF",height:51,paddingHorizontal:15,marginBottom:15,color:"#163A2E",fontSize:14},
 primary:{backgroundColor:"#04BE90",borderRadius:13,minHeight:49,alignItems:"center",justifyContent:"center",marginTop:17,paddingHorizontal:12},
 primaryText:{color:"#063F30",fontSize:14,fontWeight:"900"},
 secondary:{paddingVertical:15,alignItems:"center",marginTop:5},secondaryText:{fontSize:13,fontWeight:"700",color:"#4F7864"},
 delete:{alignItems:"center",padding:13,marginTop:6},deleteText:{color:"#AE4B5A",fontSize:12,fontWeight:"800"},
 contactRow:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomColor:"#EBF2EB",borderBottomWidth:1},
 avatar:{width:43,height:43,backgroundColor:"#E2F8EB",borderRadius:15,alignItems:"center",justifyContent:"center"},
 avatarText:{fontSize:18,fontWeight:"800",color:"#12926D"},
 contactName:{fontSize:14,fontWeight:"800",color:"#1D3C30"},
 contactPhone:{fontSize:12,color:"#80978A",marginTop:5},
 chevron:{fontSize:24,color:"#9AAF9F"},
 empty:{alignItems:"center",paddingVertical:38,paddingHorizontal:19,backgroundColor:"#FFFFFF",borderRadius:18,borderWidth:1,borderColor:"#E2EEE6"},
 emptyIcon:{fontSize:42,color:"#20B48B"},emptyTitle:{fontSize:17,color:"#244D3B",fontWeight:"800",textAlign:"center",marginTop:13},
 notice:{backgroundColor:"#E8FAEF",borderColor:"#C1E8D2",borderWidth:1,padding:13,borderRadius:12},
 noticeText:{fontSize:12,color:"#087850"},
 alert:{backgroundColor:"#FFF1F2",borderColor:"#F1CDD3",borderWidth:1,padding:13,borderRadius:12},
 alertText:{fontSize:12,color:"#B3485C"}
});
