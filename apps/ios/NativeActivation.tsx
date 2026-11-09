import React,{useEffect,useState} from "react";
import {ActivityIndicator,Modal,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {api,supabase} from "./session";

export type NativeProfile={
 id:string;first_name:string;phone:string;owner_language:string;assistant_name:string;
 line_choice?:"keep"|"new";line_carrier?:string;preferred_plan?:"starter"|"pro"|"premium"|null;
 plan_prompt_seen?:boolean;line_setup_completed?:boolean;
};
type Plan={id:"starter"|"pro"|"premium";name:string;priceCents:number;minutes:number};
type Step="plans"|"configure";
const carriers=[["verizon","Verizon"],["att","AT&T"],["tmobile","T-Mobile"],["xfinity","Xfinity"],
 ["spectrum","Spectrum"],["cricket","Cricket"],["metro","Metro"],["boost","Boost"],
 ["googlefi","Google Fi"],["other","Otro"]] as const;
const colors={mint:"#18D3AF",dark:"#182631",muted:"#6D8681"};
export function NativeActivation({session,profile,onComplete}:{session:Session;profile:NativeProfile;onComplete:(value:NativeProfile)=>void}){
 const [phase,setPhase]=useState<Step>(profile.preferred_plan&&!profile.line_setup_completed?"configure":"plans");
 const [step,setStep]=useState(0),[plans,setPlans]=useState<Plan[]>([]),[loading,setLoading]=useState(true);
 const [plan,setPlan]=useState<Plan["id"]|null>(profile.preferred_plan||null);
 const [line,setLine]=useState<"keep"|"new">(profile.line_choice||"keep");
 const [language,setLanguage]=useState(profile.owner_language==="en"?"en":"es");
 const [name,setName]=useState(profile.assistant_name||"Juan"),[carrier,setCarrier]=useState(profile.line_carrier||"other");
 const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let mounted=true;
  fetch(api+"/api/billing/overview",{headers:{Authorization:"Bearer "+session.access_token}})
   .then(r=>{if(!r.ok)throw Error("Planes no disponibles");return r.json();})
   .then(r=>{if(mounted)setPlans(Array.isArray(r.plans)?r.plans:[]);})
   .catch(()=>{if(mounted)setError("No se pudieron cargar los planes. Puedes omitir.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[session.access_token]);
 const persist=async(values:Record<string,unknown>)=>{
  if(!supabase)throw Error("Sesión no disponible.");
  const {data,error:failure}=await supabase.from("smartjob_profiles").update({
   ...values,updated_at:new Date().toISOString()
  }).eq("id",profile.id).select("*").single();
  if(failure||!data)throw Error("No se pudo guardar. Inténtalo otra vez.");
  onComplete(data as NativeProfile);
 };
 const skip=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{await persist({plan_prompt_seen:true,preferred_plan:null,line_setup_completed:false});}
  catch(e){setError(e instanceof Error?e.message:"Error al guardar.");}
  finally{setBusy(false);}
 };
 const finish=async()=>{
  if(!supabase||!plan||!ack)return;
  if(!name.trim()){setError("Introduce un nombre para el asistente.");return;}
  setBusy(true);setError("");
  try{
   const {error:settingsError}=await supabase.from("smartjob_call_settings").upsert({
    user_id:profile.id,existing_phone:profile.phone,desired_language:language,
    caller_language:language==="es"?"en":"es",assistant_name:name.trim(),
    forwarding_enabled:false,updated_at:new Date().toISOString()
   },{onConflict:"user_id"});
   if(settingsError)throw Error("No se pudieron guardar las preferencias.");
   await persist({preferred_plan:plan,plan_prompt_seen:true,line_setup_completed:true,
    line_choice:line,line_carrier:line==="keep"?carrier:"other",assistant_name:name.trim(),
    owner_language:language,customer_language:language==="es"?"en":"es"});
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>{}}>
  <SafeAreaView style={styles.safe}>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.mark}><View style={styles.wave}>
      {[13,24,32,24,13].map((height,index)=><View key={index}
       style={{height,width:4,borderRadius:4,backgroundColor:"#063B32"}}/>)}
     </View>
     <Text style={styles.brand}>VMV <Text style={{color:"#07B894"}}>CALL</Text></Text></View>
    {phase==="plans"?<>
     <Text style={styles.eyebrow}>PRIMER ACCESO</Text><Text style={styles.title}>Elige tu plan.</Text>
     <Text style={styles.subtitle}>Puedes decidirlo después. Sin un pago real, no recibirás llamadas.</Text>
     {loading?<ActivityIndicator color={colors.mint}/>:plans.map(p=><Pressable key={p.id}
      accessibilityRole="button" style={styles.plan} onPress={()=>{setPlan(p.id);setPhase("configure");setStep(0);setError("");}}>
      <View style={styles.between}><Text style={styles.planTitle}>{p.name}</Text>
       <Text style={styles.price}>{"$"}{(p.priceCents/100).toFixed(2)}/mes</Text></View>
      <Text style={styles.details}>{p.minutes} minutos traducidos · Configurar →</Text>
     </Pressable>)}
     <Text style={styles.warning}>Los planes son precios de referencia. Los pagos de prueba no activan llamadas.</Text>
     <Pressable accessibilityRole="button" style={styles.secondary} onPress={()=>void skip()} disabled={busy}>
      <Text style={styles.secondaryText}>{busy?"Guardando…":"Omitir por ahora →"}</Text></Pressable>
    </>:<>
     <Text style={styles.eyebrow}>CONFIGURACIÓN · {step+1} DE 3</Text>
     {step===0?<><Text style={styles.title}>Mi número.</Text>
      <Text style={styles.subtitle}>Número de contacto: {profile.phone}</Text>
      <Pressable accessibilityRole="radio" accessibilityState={{checked:line==="keep"}} style={[styles.option,line==="keep"&&styles.selected]} onPress={()=>setLine("keep")}>
       <Text style={styles.optionTitle}>☎  Conservar mi número</Text>
       <Text style={styles.details}>El desvío con tu operador se configura después.</Text></Pressable>
      <Pressable accessibilityRole="radio" accessibilityState={{checked:line==="new"}} style={[styles.option,line==="new"&&styles.selected]} onPress={()=>setLine("new")}>
       <Text style={styles.optionTitle}>📱 Solicitar número nuevo</Text>
       <Text style={styles.details}>No se compra ni asigna automáticamente.</Text></Pressable>
     </>:step===1?<><Text style={styles.title}>Tu idioma.</Text>
      <View style={styles.row}>
       <Pressable style={[styles.smallOption,language==="es"&&styles.selected]} onPress={()=>setLanguage("es")}><Text style={styles.optionTitle}>🇪🇸 Español</Text></Pressable>
       <Pressable style={[styles.smallOption,language==="en"&&styles.selected]} onPress={()=>setLanguage("en")}><Text style={styles.optionTitle}>🇺🇸 English</Text></Pressable>
      </View>
      <Text style={styles.label}>Nombre del asistente</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={40} placeholder="Mi asistente"/>
      {line==="keep"&&<><Text style={styles.label}>Operador</Text>
       <View style={styles.chips}>{carriers.map(([id,label])=><Pressable key={id} onPress={()=>setCarrier(id)}
        style={[styles.chip,carrier===id&&styles.selected]}><Text style={styles.chipText}>{label}</Text></Pressable>)}</View></>}
     </>:<><Text style={styles.title}>Casi listo.</Text>
      <Text style={styles.subtitle}>{plan?.toUpperCase()} · {line==="keep"?"Tu número":"Número nuevo"} · {language==="es"?"Español":"English"}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:ack}} style={styles.consent} onPress={()=>setAck(!ack)}>
       <Text style={{fontSize:24,color:"#0AA784"}}>{ack?"☑":"☐"}</Text><Text style={styles.consentText}>Entiendo que primero se debe confirmar un pago real, verificar el número y aprobar la línea. No habrá compras automáticas.</Text>
      </Pressable>
     </>}
     <Pressable accessibilityRole="button" disabled={busy||(step===2&&!ack)} style={[styles.primary,busy&&styles.disabled]}
      onPress={()=>step===2?void finish():setStep(i=>Math.min(2,i+1))}>
      <Text style={styles.primaryText}>{busy?"Guardando…":step===2?"Guardar configuración":"Siguiente →"}</Text>
     </Pressable>
     <Pressable accessibilityRole="button" style={styles.secondary} onPress={()=>{setError("");if(step===0)setPhase("plans");else setStep(i=>i-1);}}>
      <Text style={styles.secondaryText}>← Atrás</Text></Pressable>
    </>}
    {error?<Text style={styles.error}>{error}</Text>:null}
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#F7FCFA"},content:{paddingHorizontal:24,paddingTop:18,paddingBottom:65,maxWidth:660,width:"100%",alignSelf:"center"},
 mark:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:43},
 wave:{backgroundColor:"#27E7C4",width:50,height:50,borderRadius:16,justifyContent:"center",alignItems:"center",flexDirection:"row",gap:3},
 
 brand:{fontSize:25,color:"#16222D",fontWeight:"900",letterSpacing:-1},
 eyebrow:{color:"#0DAA87",fontSize:11,letterSpacing:2,fontWeight:"800",marginBottom:12},
 title:{fontSize:34,fontWeight:"800",letterSpacing:-1.2,color:"#16222D",marginBottom:9},
 subtitle:{fontSize:14,lineHeight:21,color:"#6C827C",marginBottom:23},
 plan:{borderWidth:1,borderColor:"#D8EDE5",borderRadius:21,padding:19,backgroundColor:"#FFF",marginBottom:12},
 between:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 planTitle:{fontSize:19,color:"#16222D",fontWeight:"800"},price:{fontSize:15,color:"#08765F",fontWeight:"800"},
 details:{fontSize:12,lineHeight:18,color:"#68847C",marginTop:7},
 warning:{fontSize:12,lineHeight:20,color:"#9B7144",backgroundColor:"#FFF6E8",borderRadius:13,padding:13,marginVertical:12},
 option:{borderRadius:18,borderWidth:1,borderColor:"#D6EAE2",backgroundColor:"#FFF",padding:18,marginBottom:12},
 selected:{borderWidth:2,borderColor:"#16CC9F",backgroundColor:"#E9FFF6"},
 optionTitle:{fontSize:15,color:"#18352F",fontWeight:"800"},
 row:{flexDirection:"row",gap:12,marginBottom:12},smallOption:{flex:1,borderRadius:15,borderWidth:1,borderColor:"#D6EAE2",padding:16},
 label:{fontSize:12,color:"#567A6C",fontWeight:"800",marginTop:13,marginBottom:9},
 input:{borderWidth:1,borderColor:"#D1E9E0",borderRadius:14,backgroundColor:"#FFF",padding:14,fontSize:15,color:"#172E29"},
 chips:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{borderWidth:1,borderColor:"#D6EAE2",borderRadius:13,paddingVertical:9,paddingHorizontal:11},
 chipText:{fontSize:12,fontWeight:"700",color:"#355B4F"},
 consent:{flexDirection:"row",alignItems:"flex-start",gap:9,borderRadius:16,padding:16,backgroundColor:"#E9FFF6"},
 consentText:{fontSize:12,lineHeight:18,color:"#466A5D",flex:1},
 primary:{backgroundColor:"#2CE1BA",minHeight:52,justifyContent:"center",alignItems:"center",borderRadius:16,marginTop:22},
 disabled:{opacity:.5},primaryText:{color:"#064535",fontSize:15,fontWeight:"900"},
 secondary:{padding:16,alignItems:"center",marginTop:12},secondaryText:{fontSize:13,color:"#0C9473",fontWeight:"800"},
 error:{marginTop:12,fontSize:12,color:"#AE4160",backgroundColor:"#FFF1F4",padding:13,borderRadius:12}
});
