import React,{useMemo,useState} from "react";
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {AgentDraft,AgentKind,Language} from "./aiAgentsData";
import {AI_AGENT_TEMPLATES} from "./aiAgentsData";

type Question={id:string;label:string;type?:"text"|"paragraph"|"choice";options?:string[];required?:boolean;when?:(a:Record<string,string>)=>boolean};
type Stage={title:string;description:string;items:Question[]};
type Props={initial:AgentDraft;onSave:(next:AgentDraft)=>void;onCancel:()=>void;saving?:boolean};
const text=(id:string,label:string,required=false):Question=>({id,label,required,type:"text"});
const para=(id:string,label:string,required=false):Question=>({id,label,required,type:"paragraph"});
const pick=(id:string,label:string,options:string[],required=true,when?:Question["when"]):Question=>
  ({id,label,options,type:"choice",required,when});
const yes=(v:Record<string,string>,id:string)=>v[id]==="Sí";
const scenarios:Record<AgentKind,Question[]>={
 calls:[
  pick("calls_goal","¿Qué debe hacer cuando contesten una llamada?",["Dar información","Tomar mensajes","Detectar oportunidades de venta","Recibir solicitudes de citas","Derivar a un humano"]),
  text("call_greeting","¿Qué saludo debe utilizar?"),
  pick("call_after_hours","¿Qué hacer fuera del horario?",["Informar horario","Tomar un mensaje","Solicitar devolución de llamada"]),
  pick("call_escalation","¿Cómo derivará una conversación?",["Tomar mensaje para el equipo","Transferencia futura a número autorizado","Indicar contacto del negocio"]),
  pick("call_disclosure","¿Existe autorización para informar que responde una IA?",["Sí","Pendiente de definir"])
 ],
 support:[
  para("support_faq","¿Cuáles son las preguntas más frecuentes?",true),
  pick("support_refund","¿Debe hablar sobre cambios y devoluciones?",["Solo según políticas aprobadas","No"]),
  para("support_escalation","¿Qué consultas debe trasladar a una persona?")
 ],
 sales:[
  para("sales_catalog","¿Qué productos y servicios ofrece la empresa?",true),
  pick("sales_goal","¿Qué resultado comercial buscas?",["Explicar productos","Identificar clientes interesados","Preparar solicitud de cotización","Derivar a una persona para comprar"]),
  pick("sales_discount","¿Puede ofrecer descuentos?",["Nunca sin confirmación","Solo descuentos aprobados"]),
  pick("sales_payment","Si alguien quiere pagar, ¿qué debe hacer?",["Derivar a una persona","Tomar solicitud para revisión"])
 ],
 bookings:[
  para("bookings_services","¿Qué servicios pueden reservarse? Indica duración y precio aprobado.",true),
  pick("bookings_confirmation","¿Cuándo podría confirmar una cita?",["Tras confirmación humana","Solo con futura agenda autorizada"]),
  pick("bookings_staff","¿Depende de empleados o sucursales?",["Sí","No"]),
  para("bookings_rules","¿Qué reglas hay para cancelaciones o cambios?")
 ],
 inventory:[
  pick("inventory_goal","¿Qué información necesita consultar?",["Catálogo","Existencias actuales","Precios y variantes","Reposición"]),
  para("inventory_categories","¿Qué productos y categorías podrá conocer?",true),
  pick("inventory_stale","Si falta el stock actualizado, ¿qué debe decir?",["Que no puede confirmar disponibilidad","Que lo consultará una persona"]),
  pick("inventory_edits","¿Debe proponer cambios de inventario?",["No","Solo sugerencias para revisión"])
 ],
 operations:[
  pick("operations_goal","¿Qué solicitudes administrativas manejará?",["Organizar solicitudes","Proponer tareas","Consultar procesos","Preparar resúmenes"]),
  para("operations_process","Describe el proceso interno que seguirá",true),
  pick("operations_edits","¿Puede modificar información real?",["Nunca de forma autónoma","Solo después de autorización futura"])
 ],
 custom:[
  para("custom_tasks","¿Qué tareas específicas debe conocer?",true),
  pick("custom_goal","¿Cuál es el resultado esperado?",["Informar","Preparar solicitudes","Orientar clientes","Derivar a personas"]),
  para("custom_limits","¿Qué acciones están prohibidas?",true)
 ]
};
function stages(kind:AgentKind):Stage[]{
 return [
  {title:"Conoce a tu agente",description:"Su personalidad y misión.",items:[]},
  {title:"Tu negocio",description:"Información oficial para responder correctamente.",items:[
    text("business_name","¿Cómo se llama tu empresa?",true),
    text("industry","¿A qué se dedica tu empresa?",true),
    text("location","¿En qué ciudades o zonas atiende?"),
    text("hours","¿Cuál es el horario de atención?"),
    text("contact","¿Cuál es el correo o teléfono comercial?"),
    para("policies","¿Qué políticas importantes deben conocerse?")
  ]},
  {title:"Su trabajo",description:"Preguntas adaptadas a la especialidad elegida.",items:scenarios[kind]},
  {title:"Conectar con VMV",description:"Elige las herramientas que necesitará más adelante.",items:[
    pick("calendar_needed","¿Necesitas consultar VMV Scheduling?",["Sí","No"]),
    pick("calendar_scope","¿Para qué utilizará la agenda?",["Consultar disponibilidad","Preparar solicitudes de cita","Ambas"],true,a=>yes(a,"calendar_needed")),
    pick("inventory_needed","¿Necesitas consultar VMV Inventory?",["Sí","No"]),
    pick("inventory_scope","¿Qué debe consultar?",["Catálogo","Existencias","Ambas"],true,a=>yes(a,"inventory_needed")),
    pick("leads_needed","¿Debe preparar oportunidades de venta o seguimiento?",["Sí","No"])
  ]},
  {title:"Reglas y supervisión",description:"Define límites y revisiones humanas.",items:[
    pick("handoff","¿Qué hacer si no conoce una respuesta?",["Reconocerlo y derivar a una persona","Solicitar datos y revisión humana"]),
    pick("personal_data","¿Qué información personal podrá solicitar?",["Ninguna","Solo nombre y contacto con consentimiento"]),
    pick("channel","¿Dónde quieres utilizarlo en el futuro?",["Teléfono","Web","App","Varios canales"]),
    para("restrictions","¿Qué promesas o tareas debe evitar?")
  ]},
  {title:"Revisar configuración",description:"Comprueba todo antes de guardar tu agente.",items:[]}
 ];
}
const C={purple:"#8757E9",line:"#EDE5F5",ink:"#2B223D",muted:"#857890",card:"#FFFFFF"};
function Tag({title,selected,onPress}:{title:string;selected:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
   style={[styles.tag,selected&&styles.tagSelected]}>
  {selected?<Ionicons name="checkmark-circle" color="#764CCB" size={16}/>:null}
  <Text style={[styles.tagText,selected&&{color:"#764CCB"}]}>{title}</Text>
 </Pressable>;
}
export function AIAgentWizard({initial,onSave,onCancel,saving=false}:Props){
 const [draft,setDraft]=useState<AgentDraft>(()=>({...initial,configuration:{...(initial.configuration||{})}}));
 const [step,setStep]=useState(0);
 const [error,setError]=useState("");
 const [answers,setAnswers]=useState<Record<string,string>>(()=>({...initial.configuration||{}}));
 const steps=useMemo(()=>stages(draft.kind),[draft.kind]);
 const curr=steps[step];
 const questions=curr.items.filter(q=>!q.when||q.when(answers));
 const update=(key:string,value:string)=>setAnswers(prev=>({...prev,[key]:value}));
 const next=()=>{
  if(step===0&&(!draft.name.trim()||!draft.purpose.trim())){
    setError("Completa el nombre y la misión del agente.");return;
  }
  const missing=questions.find(q=>q.required&&!String(answers[q.id]||"").trim());
  if(missing){setError("Completa las preguntas obligatorias.");return;}
  setError("");
  if(step===steps.length-1) {
    const lang:Language=answers.agent_language==="English"?"en":answers.agent_language==="Bilingüe"?"both":"es";
    onSave({...draft,language:lang,personality:answers.personality||draft.personality,configuration:answers});
  }else setStep(i=>i+1);
 };
 const previous=()=>{setError("");if(step===0)onCancel();else setStep(i=>i-1);};
 const needsCalendar=yes(answers,"calendar_needed"),needsInventory=yes(answers,"inventory_needed");
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
  <View style={styles.headRow}><Text style={styles.kicker}>CONFIGURAR AGENTE</Text><Text style={styles.counter}>{step+1} / {steps.length}</Text></View>
  <View style={styles.progress}><View style={[styles.progressFill,{width:((step+1)/steps.length*100)+"%"}]}/></View>
  <View style={styles.dots}>{steps.map((s,i)=><View key={i}
    style={[styles.dot,i===step&&styles.dotOn,i<step&&styles.dotDone]}>
    {i<step?<Ionicons name="checkmark" size={12} color="#277858"/>:
      <Text style={[styles.dotText,i===step&&{color:"#FFF"}]}>{i+1}</Text>}
  </View>)}</View>
  <Text style={styles.eyebrow}>PASO {step+1}</Text>
  <Text style={styles.title}>{curr.title}</Text>
  <Text style={styles.subtitle}>{curr.description}</Text>

  {step===0?<View style={styles.fields}>
    <Text style={styles.label}>¿Cómo se llama este agente? *</Text>
    <TextInput accessibilityLabel="Nombre del agente" style={styles.input} maxLength={80}
      value={draft.name} onChangeText={name=>setDraft(s=>({...s,name}))}
      placeholder="Ej. Luna, asistente de ventas" placeholderTextColor="#AB9DB9"/>
    <Text style={styles.label}>¿Qué debe lograr? *</Text>
    <TextInput accessibilityLabel="Misión del agente" style={styles.textarea} multiline
      maxLength={240} value={draft.purpose} onChangeText={purpose=>setDraft(s=>({...s,purpose}))}
      placeholder="Explica la misión en una frase" placeholderTextColor="#AB9DB9"/>
    <Text style={styles.label}>Especialidad</Text>
    <View style={styles.choices}>{AI_AGENT_TEMPLATES.map(t=><Tag key={t.kind} title={t.title}
      selected={draft.kind===t.kind} onPress={()=>setDraft(s=>({...s,kind:t.kind,purpose:s.kind===t.kind?s.purpose:t.purpose}))}/>)}</View>
    <Text style={styles.label}>¿Cómo hablará?</Text>
    <View style={styles.choices}>{["Español","English","Bilingüe"].map(x=><Tag key={x} title={x}
      selected={(answers.agent_language||({es:"Español",en:"English",both:"Bilingüe"}[draft.language]))===x}
      onPress={()=>update("agent_language",x)}/>)}</View>
    <Text style={styles.label}>Personalidad</Text>
    <View style={styles.choices}>{["Amable y profesional","Cercano","Formal","Directo"].map(x=>
      <Tag key={x} title={x} selected={(answers.personality||draft.personality)===x}
        onPress={()=>update("personality",x)}/>)}</View>
  </View>:null}

  {step>0&&step<steps.length-1?<View style={styles.fields}>
    {questions.map(item=><View key={item.id} style={styles.question}>
      <Text style={styles.label}>{item.label}{item.required?" *":""}</Text>
      {item.type==="choice"?<View style={styles.choices}>
        {(item.options||[]).map(x=><Tag key={x} title={x}
          selected={answers[item.id]===x} onPress={()=>update(item.id,x)}/>)}</View>:
        <TextInput accessibilityLabel={item.label}
          style={item.type==="paragraph"?styles.textarea:styles.input}
          multiline={item.type==="paragraph"} maxLength={item.type==="paragraph"?500:200}
          textAlignVertical={item.type==="paragraph"?"top":"center"}
          placeholder={item.type==="paragraph"?"Escribe una respuesta breve...":"Escribe aquí..."}
          placeholderTextColor="#AB9DB9" value={answers[item.id]||""}
          onChangeText={v=>update(item.id,v)}/>}
    </View>)}
    {step===3?<View style={styles.connectionBox}>
      <View style={styles.connectionRow}><Ionicons name="calendar-outline" color={C.purple} size={22}/>
        <View style={{flex:1}}><Text style={styles.connectionTitle}>VMV Scheduling</Text>
          <Text style={styles.connectionDesc}>Conector todavía no disponible</Text></View>
        <Text style={styles.pending}>NO CONECTADO</Text></View>
      <View style={styles.connectionRow}><Ionicons name="cube-outline" color={C.purple} size={22}/>
        <View style={{flex:1}}><Text style={styles.connectionTitle}>VMV Inventory</Text>
          <Text style={styles.connectionDesc}>Conector todavía no disponible</Text></View>
        <Text style={styles.pending}>NO CONECTADO</Text></View>
      {(needsCalendar||needsInventory)?<Text style={styles.connectionFoot}>
        Esta necesidad se guardará en el diseño, pero todavía no se pueden consultar citas ni existencias reales.
      </Text>:null}
    </View>:null}
  </View>:null}

  {step===steps.length-1?<View style={styles.summary}>
    <View style={styles.summaryHero}><Text style={styles.summaryName}>{draft.name}</Text>
      <Text style={styles.summaryText}>{draft.purpose}</Text></View>
    {[
      ["Negocio",answers.business_name||"—"],
      ["Tipo de agente",AI_AGENT_TEMPLATES.find(t=>t.kind===draft.kind)?.title||"Personalizado"],
      ["Agenda VMV",needsCalendar?"Solicitada · pendiente":"No solicitada"],
      ["Inventario VMV",needsInventory?"Solicitado · pendiente":"No solicitado"],
      ["Revisión humana",answers.handoff||"Obligatoria"]
    ].map(([label,value])=><View key={label} style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text>
    </View>)}
    <View style={styles.notice}><Ionicons name="shield-checkmark-outline" color="#237C63" size={22}/>
      <Text style={styles.noticeText}>Comenzará como borrador. No contestará llamadas ni modificará reservas, pagos o inventario automáticamente.</Text>
    </View>
  </View>:null}
  {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
  <View style={styles.buttons}>
    <Pressable accessibilityRole="button" onPress={previous} style={styles.back}>
      <Ionicons name="arrow-back" size={16} color="#6E5781"/>
      <Text style={styles.backText}>{step===0?"Cancelar":"Atrás"}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={saving} onPress={next}
      style={[styles.forward,saving?{opacity:.6}:null]}>
      <Text style={styles.forwardText}>{step===steps.length-1?"Guardar agente":saving?"Guardando…":"Continuar"}</Text>
      <Ionicons name={step===steps.length-1?"checkmark":"arrow-forward"} size={17} color="#FFF"/>
    </Pressable>
  </View>
 </ScrollView>;
}
const styles=StyleSheet.create({
 content:{padding:19,paddingBottom:90,backgroundColor:"#FBFAFD"},
 headRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 kicker:{fontSize:10,fontWeight:"900",color:"#8969B1",letterSpacing:1.1},
 counter:{fontSize:12,fontWeight:"900",color:C.purple},
 progress:{height:6,backgroundColor:"#EAE3F4",borderRadius:10,overflow:"hidden",marginTop:12},
 progressFill:{height:"100%",backgroundColor:C.purple,borderRadius:10},
 dots:{flexDirection:"row",justifyContent:"space-between",marginTop:15,marginBottom:24},
 dot:{height:28,width:28,backgroundColor:"#FFF",borderRadius:20,borderWidth:1,
   borderColor:"#E6DCF0",justifyContent:"center",alignItems:"center"},
 dotOn:{backgroundColor:C.purple,borderColor:C.purple},
 dotDone:{backgroundColor:"#DDF7E9",borderColor:"#DDF7E9"},
 dotText:{color:"#978AA5",fontSize:11,fontWeight:"900"},
 eyebrow:{fontSize:10,letterSpacing:1.1,fontWeight:"900",color:C.purple,marginBottom:8},
 title:{fontSize:27,fontWeight:"900",color:C.ink,letterSpacing:-1},
 subtitle:{fontSize:12,color:C.muted,lineHeight:19,marginTop:6,marginBottom:23},
 fields:{gap:16},
 question:{gap:9,marginBottom:4},
 label:{fontSize:12,fontWeight:"800",color:"#322841"},
 input:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:15,
   color:C.ink,padding:13,minHeight:47,fontSize:14},
 textarea:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:15,
   padding:13,minHeight:95,fontSize:14,color:C.ink,textAlignVertical:"top"},
 choices:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:3},
 tag:{backgroundColor:"#FFF",borderColor:"#E8DFF1",borderWidth:1,borderRadius:15,
   paddingHorizontal:13,paddingVertical:10,flexDirection:"row",alignItems:"center",gap:6},
 tagSelected:{backgroundColor:"#EFE6FF",borderColor:"#BE9FF0"},
 tagText:{fontSize:12,fontWeight:"700",color:"#776987"},
 connectionBox:{padding:12,borderRadius:18,backgroundColor:"#F4EEFB",gap:10,marginTop:5},
 connectionRow:{backgroundColor:"#FFF",borderRadius:13,padding:11,flexDirection:"row",gap:9,alignItems:"center"},
 connectionTitle:{fontSize:12,fontWeight:"900",color:C.ink},
 connectionDesc:{fontSize:10,color:C.muted,marginTop:3},
 pending:{fontSize:8,fontWeight:"900",color:"#8E7B9E",backgroundColor:"#F4EFF8",
   borderRadius:10,paddingHorizontal:7,paddingVertical:7},
 connectionFoot:{color:"#776789",fontSize:11,lineHeight:17,marginTop:4},
 summary:{gap:11},
 summaryHero:{backgroundColor:"#EFE5FF",borderRadius:21,padding:18},
 summaryName:{color:"#6C40C3",fontSize:21,fontWeight:"900"},
 summaryText:{fontSize:12,color:"#746486",marginTop:8,lineHeight:18},
 summaryLine:{flexDirection:"row",justifyContent:"space-between",borderBottomWidth:1,
   borderBottomColor:C.line,paddingVertical:10,gap:14},
 summaryLabel:{fontSize:11,color:C.muted},
 summaryValue:{fontSize:11,color:C.ink,fontWeight:"800",maxWidth:"60%",textAlign:"right"},
 notice:{backgroundColor:"#E8F9F0",padding:14,borderRadius:15,flexDirection:"row",gap:10,marginTop:9},
 noticeText:{flex:1,color:"#2F7059",fontSize:11,lineHeight:17},
 error:{fontSize:12,color:"#A53B62",fontWeight:"800",marginTop:14},
 buttons:{flexDirection:"row",gap:10,marginTop:28},
 back:{backgroundColor:"#FFF",borderRadius:15,borderWidth:1,borderColor:C.line,
   padding:14,flexDirection:"row",justifyContent:"center",alignItems:"center",gap:6,minWidth:94},
 backText:{fontSize:12,color:"#6E5781",fontWeight:"800"},
 forward:{flex:1,backgroundColor:C.purple,borderRadius:15,padding:14,
   justifyContent:"center",alignItems:"center",flexDirection:"row",gap:8},
 forwardText:{color:"#FFF",fontSize:12,fontWeight:"900"}
});
