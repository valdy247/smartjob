import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Alert,KeyboardAvoidingView,Platform,Pressable,SafeAreaView,
  ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {Session} from "@supabase/supabase-js";
import {AI_AGENT_TEMPLATES,createConversation,emptyAgent,getAgents,getConversations,getMessages,
  saveAgent,simulateAgent,updateAgentStatus,type Agent,type AgentConversation,
  type AgentDraft,type AgentKind,type AgentMessage,type AgentStatus,type Language} from "./aiAgentsData";

const C={bg:"#F9FAFC",paper:"#FFFFFF",ink:"#201C35",muted:"#817A91",
  purple:"#8959ED",purpleDark:"#7040C8",line:"#ECE8F3",pink:"#FCE4F0",mint:"#DDF8EE"};
type Screen="home"|"edit"|"chat"|"history";
type Props={session:Session;onBack:()=>void};
type IconName=React.ComponentProps<typeof Ionicons>["name"];

function Action({label,onPress,solid=false,disabled=false,icon}:{
  label:string;onPress:()=>void;solid?:boolean;disabled?:boolean;icon?:IconName
}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    disabled={disabled} style={[styles.action,solid?styles.actionSolid:styles.actionOutline,
      disabled?{opacity:0.45}:null]}>
    {icon?<Ionicons name={icon} size={17} color={solid?"#FFF":C.purple}/>:null}
    <Text style={[styles.actionLabel,solid?{color:"#FFF"}:null]}>{label}</Text>
  </Pressable>;
}
function Field({label,value,onChangeText,placeholder,multiline=false,maxLength=500}:{
  label:string;value:string;onChangeText:(v:string)=>void;placeholder?:string;multiline?:boolean;maxLength?:number
}){
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[styles.input,multiline?styles.textarea:null]}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor="#A9A1B6" multiline={multiline} maxLength={maxLength}
      textAlignVertical={multiline?"top":"center"} autoCapitalize="sentences"/>
    {multiline?<Text style={styles.counter}>{value.length}/{maxLength}</Text>:null}
  </View>;
}
function SelectPill({label,selected,onPress}:{
  label:string;selected:boolean;onPress:()=>void
}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected}}
    onPress={onPress} style={[styles.pill,selected?styles.pillOn:null]}>
    <Text style={[styles.pillText,selected?{color:C.purpleDark}:null]}>{label}</Text>
  </Pressable>;
}
function SectionTitle({title,caption}:{title:string;caption?:string}){
  return <View style={{marginBottom:12}}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {caption?<Text style={styles.help}>{caption}</Text>:null}
  </View>;
}

export function AIAgentsStudio({session,onBack}:Props){
  const [screen,setScreen]=useState<Screen>("home");
  const [agents,setAgents]=useState<Agent[]>([]);
  const [selected,setSelected]=useState<Agent|null>(null);
  const [draft,setDraft]=useState<AgentDraft>(emptyAgent("support"));
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [history,setHistory]=useState<AgentConversation[]>([]);
  const [conversationId,setConversationId]=useState<string|null>(null);
  const [messages,setMessages]=useState<AgentMessage[]>([]);
  const [message,setMessage]=useState("");

  const refresh=useCallback(async()=>{
    try{const list=await getAgents(session);setAgents(list);setNotice("");}
    catch(e){setNotice(e instanceof Error?e.message:"No se pudo cargar AI Agents.");}
    finally{setLoading(false);}
  },[session.user.id,session.access_token]);
  useEffect(()=>{void refresh();},[refresh]);
  function patch<K extends keyof AgentDraft>(key:K,value:AgentDraft[K]){
    setDraft(old=>({...old,[key]:value}));
  }
  function create(kind:AgentKind){
    setSelected(null);setDraft(emptyAgent(kind));setScreen("edit");
  }
  function edit(agent:Agent){
    setSelected(agent);
    setDraft({name:agent.name,kind:agent.kind,purpose:agent.purpose,
      personality:agent.personality,language:agent.language,instructions:agent.instructions,
      knowledge:agent.knowledge,status:agent.status});
    setScreen("edit");
  }
  async function save(){
    if(busy)return;
    setBusy(true);
    try{
      const item=await saveAgent(session,draft,selected?.id);
      setSelected(item);
      await refresh();
      setScreen("home");
    }catch(e){Alert.alert("No se pudo guardar",e instanceof Error?e.message:"Vuelve a intentarlo.");}
    finally{setBusy(false);}
  }
  async function toggleStatus(agent:Agent){
    setBusy(true);
    const next:AgentStatus=agent.status==="active"?"paused":"active";
    try{
      const changed=await updateAgentStatus(session,agent,next);
      setAgents(current=>current.map(x=>x.id===changed.id?changed:x));
      if(selected?.id===changed.id)setSelected(changed);
    }catch(e){Alert.alert("Estado no actualizado",e instanceof Error?e.message:"Intenta nuevamente.");}
    finally{setBusy(false);}
  }
  function openTest(agent:Agent){
    setSelected(agent);setConversationId(null);setMessages([]);setMessage("");setScreen("chat");
  }
  async function openHistory(agent:Agent){
    setSelected(agent);setLoading(true);
    try{setHistory(await getConversations(session,agent.id));setScreen("history");}
    catch(e){Alert.alert("Historial",e instanceof Error?e.message:"No disponible.");}
    finally{setLoading(false);}
  }
  async function resumeConversation(convo:AgentConversation){
    setLoading(true);
    try{
      setMessages(await getMessages(session,convo.id));
      setConversationId(convo.id);setMessage("");setScreen("chat");
    }catch(e){Alert.alert("Conversación",e instanceof Error?e.message:"No disponible.");}
    finally{setLoading(false);}
  }
  async function send(){
    if(busy||!selected||!message.trim())return;
    const outgoing=message.trim().slice(0,1000);
    setBusy(true);
    try{
      const id=conversationId||await createConversation(session,selected.id,outgoing);
      setConversationId(id);
      setMessage("");
      // The API authenticates the user, applies a daily cap and stores both turns.
      await simulateAgent(session,selected.id,id,outgoing);
      setMessages(await getMessages(session,id));
    }catch(e){
      Alert.alert("Simulador",e instanceof Error?e.message:"No fue posible responder.");
      if(conversationId)try{setMessages(await getMessages(session,conversationId));}catch{}
    }finally{setBusy(false);}
  }
  function goBack(){
    if(screen==="home"){onBack();return;}
    if(screen==="chat"&&conversationId){setScreen("home");return;}
    setScreen("home");
  }
  const activeCount=agents.filter(a=>a.status==="active").length;
  const templates=AI_AGENT_TEMPLATES;
  const kindInfo=(kind:AgentKind)=>templates.find(t=>t.kind===kind)||templates[6];

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1}}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={C.ink}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={styles.headerKicker}>VMV BUSINESS</Text>
          <Text style={styles.headerTitle}>AI Agents<Text style={{color:C.purple}}>.</Text></Text>
        </View>
        <View style={styles.headIcon}><Ionicons name="sparkles" color={C.purple} size={22}/></View>
      </View>

      {screen==="home"?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroKicker}>TU EQUIPO INTELIGENTE</Text>
            <Ionicons name="sparkles-outline" size={28} color="#E5D5FF"/>
          </View>
          <Text style={styles.heroTitle}>Crea agentes.{"\n"}Haz más con VMV.</Text>
          <Text style={styles.heroSub}>Configúralos, enséñales tu negocio y pruébalos desde aquí.</Text>
          <View style={styles.heroStats}>
            <Text style={styles.heroStat}>{agents.length} agentes</Text>
            <Text style={styles.heroStat}>{activeCount} activos en estudio</Text>
          </View>
        </View>
        {notice?<View style={styles.warning}><Ionicons name="information-circle-outline" size={18} color="#76559C"/>
          <Text style={[styles.help,{flex:1}]}>{notice}</Text></View>:null}
        <SectionTitle title="¿Qué quieres automatizar?" caption="Selecciona una función para preparar tu agente."/>
        <View style={styles.templateGrid}>
          {templates.map(template=><Pressable key={template.kind} accessibilityRole="button"
            accessibilityLabel={"Crear agente de "+template.title} onPress={()=>create(template.kind)}
            style={[styles.template,{backgroundColor:template.bg}]}>
            <View style={styles.templateIcon}><Ionicons name={template.icon} size={23} color={template.fg}/></View>
            <View style={{flex:1,justifyContent:"flex-end"}}>
              <Text style={[styles.templateTitle,{color:template.fg}]}>{template.title}</Text>
              <Text style={[styles.templateCaption,{color:template.fg}]}>{template.subtitle}</Text>
            </View>
            <Ionicons name="arrow-up-outline" color={template.fg} size={18} style={styles.templateArrow}/>
          </Pressable>)}
        </View>
        <View style={styles.listHeading}>
          <SectionTitle title="Mis agentes"/>
          <Text style={styles.listCount}>{agents.length}</Text>
        </View>
        {loading?<ActivityIndicator size="large" color={C.purple}/>:agents.length===0?
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={27} color={C.purple}/>
            <Text style={styles.emptyTitle}>Aquí vivirán tus agentes</Text>
            <Text style={styles.help}>Elige una tarjeta para crear tu primero.</Text>
          </View>:agents.map(agent=>{
            const info=kindInfo(agent.kind);
            return <View key={agent.id} style={styles.agentCard}>
              <View style={styles.agentTop}>
                <View style={[styles.agentIcon,{backgroundColor:info.bg}]}>
                  <Ionicons name={info.icon} color={info.fg} size={24}/>
                </View>
                <View style={{flex:1}}>
                  <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                  <Text style={styles.agentSubtitle}>{info.title} · {agent.language.toUpperCase()}</Text>
                </View>
                <View style={[styles.stateBadge,agent.status==="active"?{backgroundColor:"#E2F7E9"}:null]}>
                  <Text style={[styles.stateText,agent.status==="active"?{color:"#237C55"}:null]}>
                    {agent.status==="active"?"Activo":agent.status==="paused"?"Pausado":"Borrador"}
                  </Text>
                </View>
              </View>
              <Text style={styles.agentPurpose} numberOfLines={2}>{agent.purpose}</Text>
              <View style={styles.agentActions}>
                <Action label="Probar" icon="chatbubble-ellipses-outline" solid onPress={()=>openTest(agent)}/>
                <Action label="Editar" icon="create-outline" onPress={()=>edit(agent)}/>
                <Action label="Historial" icon="time-outline" onPress={()=>void openHistory(agent)}/>
              </View>
              <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void toggleStatus(agent)}
                style={styles.toggleRow}>
                <Ionicons name={agent.status==="active"?"pause-circle-outline":"play-circle-outline"} size={17} color={C.purple}/>
                <Text style={styles.toggleText}>{agent.status==="active"?"Pausar agente":"Activar en estudio"}</Text>
              </Pressable>
            </View>;
          })}
        <Text style={styles.footerNote}>Los agentes activos funcionan únicamente en el simulador. Llamadas, ventas, reservas e inventario real requieren conexiones autorizadas.</Text>
      </ScrollView>:null}

      {screen==="edit"?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.editTop}>
          <View style={styles.sectionIcon}><Ionicons name="settings-outline" size={23} color={C.purple}/></View>
          <Text style={styles.screenTitle}>{selected?"Configurar agente":"Nuevo agente"}</Text>
          <Text style={styles.help}>Tu negocio, tus instrucciones y tu estilo.</Text>
        </View>
        <SectionTitle title="01 · Identidad"/>
        <Field label="Nombre del agente" value={draft.name} onChangeText={v=>patch("name",v)} maxLength={80} placeholder="Ej. Asistente VMV"/>
        <Field label="¿Qué hará?" value={draft.purpose} onChangeText={v=>patch("purpose",v)} maxLength={240} multiline placeholder="Describe el objetivo"/>
        <Text style={styles.fieldLabel}>Especialidad</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlinePills}>
          {templates.map(t=><SelectPill key={t.kind} label={t.title}
            selected={draft.kind===t.kind} onPress={()=>patch("kind",t.kind)}/>)}
        </ScrollView>
        <SectionTitle title="02 · Personalidad e idioma"/>
        <View style={styles.pillWrap}>
          {["Amable y profesional","Cercano","Formal","Directo"].map(p=><SelectPill key={p} label={p}
            selected={draft.personality===p} onPress={()=>patch("personality",p)}/>)}
        </View>
        <View style={[styles.pillWrap,{marginTop:8,marginBottom:18}]}>
          {([{key:"es",label:"Español"},{key:"en",label:"English"},{key:"both",label:"Bilingüe"}] as {key:Language;label:string}[])
            .map(l=><SelectPill key={l.key} label={l.label} selected={draft.language===l.key}
              onPress={()=>patch("language",l.key)}/>)}
        </View>
        <SectionTitle title="03 · Conocimiento" caption="Solo información del negocio que tienes permiso de compartir."/>
        <Field label="Información de la empresa" value={draft.knowledge} maxLength={8000}
          onChangeText={v=>patch("knowledge",v)} multiline
          placeholder="Servicios, precios confirmados, horarios, preguntas frecuentes, políticas..."/>
        <Field label="Instrucciones adicionales" value={draft.instructions} maxLength={2500}
          onChangeText={v=>patch("instructions",v)} multiline
          placeholder="Qué debe decir, qué debe evitar y cuándo derivar a un humano..."/>
        <View style={styles.warning}>
          <Ionicons name="shield-checkmark-outline" size={21} color={C.purple}/>
          <Text style={[styles.help,{flex:1}]}>El agente no ejecutará llamadas, pedidos, cobros, citas ni cambios de inventario.</Text>
        </View>
        <Action solid label={busy?"Guardando…":"Guardar agente"} icon="checkmark-circle-outline"
          disabled={busy||!draft.name.trim()} onPress={()=>void save()}/>
        {selected?<View style={{marginTop:10}}><Action label="Probar agente"
          icon="chatbubble-outline" onPress={()=>openTest(selected)}/></View>:null}
      </ScrollView>:null}

      {screen==="chat"&&selected?<View style={{flex:1}}>
        <View style={styles.chatBanner}>
          <View style={styles.chatAvatar}><Ionicons name={kindInfo(selected.kind).icon} size={23} color={C.purple}/></View>
          <View style={{flex:1}}>
            <Text style={styles.agentName}>{selected.name}</Text>
            <Text style={styles.help}>Simulación privada · Sin operaciones reales</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.chatScroll} keyboardShouldPersistTaps="handled">
          {messages.length===0?<View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" color={C.purple} size={29}/>
            <Text style={styles.emptyTitle}>Prueba tu agente</Text>
            <Text style={[styles.help,{textAlign:"center"}]}>Escribe como si fueras un cliente. Evalúa las respuestas antes de publicarlo.</Text>
          </View>:null}
          {messages.map(m=><View key={m.id} style={[styles.bubble,m.role==="user"?styles.bubbleUser:styles.bubbleBot]}>
            <Text style={[styles.bubbleLabel,m.role==="user"?{color:"#EBDDFF"}:null]}>
              {m.role==="user"?"CLIENTE":"AGENTE IA"}
            </Text>
            <Text style={[styles.bubbleText,m.role==="user"?{color:"#FFF"}:null]}>{m.content}</Text>
          </View>)}
          {busy?<View style={styles.typing}><ActivityIndicator color={C.purple}/><Text style={styles.help}>Pensando…</Text></View>:null}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Mensaje de prueba" style={styles.composerInput}
            value={message} onChangeText={setMessage} placeholder="Escribe un mensaje..."
            placeholderTextColor="#9B92AA" multiline maxLength={1000}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje"
            disabled={busy||!message.trim()} onPress={()=>void send()}
            style={[styles.send,busy||!message.trim()?{opacity:0.45}:null]}>
            <Ionicons name="arrow-up" size={22} color="#FFF"/>
          </Pressable>
        </View>
      </View>:null}

      {screen==="history"&&selected?<ScrollView contentContainerStyle={styles.scroll}>
        <SectionTitle title={"Historial · "+selected.name} caption="Simulaciones guardadas en tu cuenta."/>
        {loading?<ActivityIndicator color={C.purple}/>:history.length===0?
          <View style={styles.empty}><Ionicons name="time-outline" size={27} color={C.purple}/>
            <Text style={styles.emptyTitle}>Sin conversaciones todavía</Text></View>:
          history.map(item=><Pressable key={item.id} accessibilityRole="button"
            onPress={()=>void resumeConversation(item)} style={styles.historyRow}>
            <Ionicons name="chatbox-outline" size={21} color={C.purple}/>
            <View style={{flex:1}}><Text style={styles.agentName} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.help}>{new Date(item.created_at).toLocaleDateString()}</Text></View>
            <Ionicons name="chevron-forward" size={19} color={C.muted}/>
          </Pressable>)}
        <Action solid label="Nueva simulación" icon="add" onPress={()=>openTest(selected)}/>
      </ScrollView>:null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  header:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingTop:12,
    paddingBottom:14,gap:13,backgroundColor:C.paper,borderBottomWidth:1,borderBottomColor:C.line},
  back:{height:38,width:38,justifyContent:"center",alignItems:"center",borderRadius:13,backgroundColor:"#F3F0F8"},
  headerKicker:{fontSize:10,fontWeight:"800",letterSpacing:1.4,color:C.muted},
  headerTitle:{fontSize:24,fontWeight:"900",color:C.ink,letterSpacing:-0.9},
  headIcon:{width:43,height:43,borderRadius:17,backgroundColor:"#F1E9FF",alignItems:"center",justifyContent:"center"},
  scroll:{paddingHorizontal:20,paddingVertical:19,paddingBottom:90},
  hero:{backgroundColor:C.purple,borderRadius:29,padding:22,marginBottom:27,overflow:"hidden"},
  heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  heroKicker:{color:"#F7EDFF",fontWeight:"900",fontSize:10,letterSpacing:1.3},
  heroTitle:{fontSize:29,lineHeight:32,color:"#FFF",fontWeight:"900",letterSpacing:-1.1,marginTop:18},
  heroSub:{color:"#F3E9FF",fontSize:13,lineHeight:20,marginTop:10,maxWidth:"92%"},
  heroStats:{flexDirection:"row",gap:10,marginTop:21,flexWrap:"wrap"},
  heroStat:{color:"#FFF",backgroundColor:"#A57BF1",overflow:"hidden",borderRadius:25,
    paddingHorizontal:13,paddingVertical:8,fontSize:11,fontWeight:"800"},
  sectionTitle:{fontSize:20,fontWeight:"900",letterSpacing:-0.6,color:C.ink},
  help:{fontSize:12,lineHeight:18,color:C.muted,marginTop:4},
  templateGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:11,marginBottom:28},
  template:{width:"48%",height:138,borderRadius:23,padding:14,overflow:"hidden"},
  templateIcon:{width:40,height:40,borderRadius:14,alignItems:"center",justifyContent:"center",
    backgroundColor:"#FFFFFFAA"},
  templateTitle:{fontWeight:"900",fontSize:17,letterSpacing:-0.5},
  templateCaption:{fontSize:10,opacity:0.85,marginTop:3},
  templateArrow:{position:"absolute",right:15,top:16},
  listHeading:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4},
  listCount:{fontSize:12,fontWeight:"800",color:C.purple,backgroundColor:"#EFE6FF",
    paddingHorizontal:10,paddingVertical:6,borderRadius:12},
  warning:{flexDirection:"row",gap:9,padding:14,borderRadius:16,backgroundColor:"#F1EBFF",marginBottom:18,alignItems:"center"},
  empty:{paddingVertical:32,paddingHorizontal:20,alignItems:"center",borderRadius:20,
    backgroundColor:C.paper,borderWidth:1,borderColor:C.line,marginBottom:15,gap:6},
  emptyTitle:{fontWeight:"800",fontSize:16,color:C.ink,marginTop:4},
  agentCard:{backgroundColor:C.paper,borderRadius:21,padding:16,marginBottom:12,borderWidth:1,borderColor:C.line},
  agentTop:{flexDirection:"row",alignItems:"center",gap:11},
  agentIcon:{height:48,width:48,borderRadius:16,alignItems:"center",justifyContent:"center"},
  agentName:{fontSize:15,fontWeight:"900",color:C.ink},
  agentSubtitle:{fontSize:11,color:C.muted,marginTop:3},
  agentPurpose:{fontSize:12,color:C.muted,lineHeight:19,marginTop:13},
  stateBadge:{backgroundColor:"#F0EBFA",borderRadius:15,paddingHorizontal:9,paddingVertical:5},
  stateText:{color:C.purpleDark,fontWeight:"800",fontSize:10},
  agentActions:{flexDirection:"row",gap:7,marginTop:15,flexWrap:"wrap"},
  action:{flexDirection:"row",alignItems:"center",justifyContent:"center",
    gap:6,paddingHorizontal:13,paddingVertical:12,borderRadius:14},
  actionSolid:{backgroundColor:C.purple},
  actionOutline:{borderWidth:1,borderColor:"#E4D8FB",backgroundColor:"#FFF"},
  actionLabel:{color:C.purpleDark,fontWeight:"800",fontSize:12},
  toggleRow:{marginTop:13,borderTopWidth:1,borderTopColor:C.line,paddingTop:12,
    flexDirection:"row",gap:7,alignItems:"center"},
  toggleText:{color:C.purple,fontSize:11,fontWeight:"700"},
  footerNote:{fontSize:11,color:C.muted,lineHeight:18,marginTop:15,marginBottom:24},
  editTop:{marginBottom:23},
  sectionIcon:{height:49,width:49,backgroundColor:"#EFE7FF",borderRadius:19,
    alignItems:"center",justifyContent:"center",marginBottom:14},
  screenTitle:{fontSize:27,fontWeight:"900",color:C.ink,letterSpacing:-1},
  field:{marginBottom:19},
  fieldLabel:{fontSize:12,fontWeight:"800",color:C.ink,marginBottom:8},
  input:{backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:15,
    padding:14,fontSize:14,color:C.ink,minHeight:48},
  textarea:{minHeight:105,textAlignVertical:"top"},
  counter:{textAlign:"right",fontSize:10,color:C.muted,marginTop:5},
  inlinePills:{gap:7,paddingBottom:20},
  pillWrap:{flexDirection:"row",gap:7,flexWrap:"wrap",marginBottom:21},
  pill:{paddingHorizontal:12,paddingVertical:10,backgroundColor:C.paper,borderRadius:20,borderWidth:1,borderColor:C.line},
  pillOn:{backgroundColor:"#F0E9FF",borderColor:"#CFB7FC"},
  pillText:{fontWeight:"700",fontSize:12,color:C.muted},
  chatBanner:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#F2EBFF",padding:16},
  chatAvatar:{width:44,height:44,borderRadius:16,justifyContent:"center",alignItems:"center",backgroundColor:"#FFF"},
  chatScroll:{padding:18,paddingBottom:35,gap:11,flexGrow:1},
  bubble:{padding:15,borderRadius:20,maxWidth:"90%"},
  bubbleUser:{backgroundColor:C.purple,alignSelf:"flex-end",borderBottomRightRadius:5},
  bubbleBot:{backgroundColor:C.paper,alignSelf:"flex-start",borderBottomLeftRadius:5,
    borderWidth:1,borderColor:C.line},
  bubbleLabel:{color:C.purple,fontSize:9,fontWeight:"900",letterSpacing:1,marginBottom:5},
  bubbleText:{fontSize:14,lineHeight:21,color:C.ink},
  typing:{flexDirection:"row",gap:8,alignItems:"center"},
  composer:{flexDirection:"row",gap:10,padding:12,backgroundColor:C.paper,borderTopWidth:1,borderTopColor:C.line},
  composerInput:{flex:1,maxHeight:110,minHeight:44,paddingHorizontal:14,paddingVertical:11,
    backgroundColor:"#F6F3FA",borderRadius:18,fontSize:14,color:C.ink},
  send:{width:45,height:45,backgroundColor:C.purple,borderRadius:16,alignItems:"center",justifyContent:"center"},
  historyRow:{flexDirection:"row",gap:12,alignItems:"center",padding:15,backgroundColor:C.paper,
    borderWidth:1,borderColor:C.line,borderRadius:16,marginBottom:10}
});
