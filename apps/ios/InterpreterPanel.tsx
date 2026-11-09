import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder} from "expo-audio";
import * as Speech from "expo-speech";
import type {Session} from "@supabase/supabase-js";
import {api,supabase} from "./session";

type Mode="voice"|"text";
type Stage="context"|"active";
type Language="es"|"en";
type Context={job_type:string;client_name:string;details:string;city:string;state:string;zip:string;dimensions:string;materials:string};
type Answer={question:string;answer:string};
type Turn={source:string;target:string;language:Language;translatedTo:Language;blocked:boolean;warning?:string};
const initial:Context={job_type:"",client_name:"",details:"",city:"",state:"",zip:"",dimensions:"",materials:""};
const flag=(value:Language)=>value==="es"?"🇪🇸":"🇺🇸";
const label=(value:Language)=>value==="es"?"Español":"English";
const vocab={
 es:["hola","gracias","quiero","necesito","usted","puede","cuanto","cuánto","trabajo","mañana","tengo","para","estamos","porque","precio","con","una","por","que","qué","el","la","los","las","del","mi","yo"],
 en:["hello","thanks","please","need","want","work","tomorrow","price","project","customer","where","how","much","with","from","the","and","you","your","are","we","our","my","for"]
};
function predictedLanguage(text:string):Language|null{
 const words=(text.toLowerCase().match(/[a-záéíóúñ]+/g)||[]);
 if(words.length<3)return null;
 let es=0,en=0;
 for(const word of words){
  if(vocab.es.includes(word))es++;
  if(vocab.en.includes(word))en++;
  if(/[áéíóúñ]/.test(word))es+=2;
 }
 if(Math.max(es,en)<2||es===en)return null;
 return es>en?"es":"en";
}
const interfaceColors={dark:"#152329",mint:"#2DD6B0"};
export function InterpreterPanel({session}:{session:Session}){
 const ownerLanguage:Language=session.user.user_metadata?.owner_language==="en"?"en":"es";
 const firstName=String(session.user.user_metadata?.first_name||"").trim();
 const [mode,setMode]=useState<Mode|null>(null),[stage,setStage]=useState<Stage>("context");
 const [accepted,setAccepted]=useState(false),[question,setQuestion]=useState("");
 const [answers,setAnswers]=useState<Answer[]>([]),[answerText,setAnswerText]=useState("");
 const [draft,setDraft]=useState(""),[context,setContext]=useState<Context>(initial);
 const [turns,setTurns]=useState<Turn[]>([]),[recording,setRecording]=useState(false);
 const [working,setWorking]=useState(false),[message,setMessage]=useState("");
 const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
 const pressed=useRef(false),recordingRef=useRef(false),lock=useRef(false);
 const viewRef=useRef<ScrollView|null>(null);
 const firstQuestion=ownerLanguage==="es"?"Hola"+(firstName?", "+firstName:"")+", ¿con quién vas a conversar y de qué van a hablar?":
  "Hi"+(firstName?", "+firstName:"")+", who are you meeting and what will you discuss?";
 const currentQuestion=question||firstQuestion;
 useEffect(()=>{
  let mounted=true;
  if(supabase)void supabase.from("smartjob_contexts").select("job_type,client_name,details,city,state,zip,dimensions,materials")
   .eq("user_id",session.user.id).maybeSingle().then(({data})=>{
    if(mounted&&data)setContext({...initial,...data});
   });
  return()=>{mounted=false;};
 },[session.user.id]);
 useEffect(()=>()=>{Speech.stop();},[]);
 const speak=(value:string,language:Language)=>{
  void Speech.stop();
  Speech.speak(value,{language:language==="es"?"es-ES":"en-US",rate:.93,pitch:1});
 };
 const open=(selected:Mode)=>{
  setMode(selected);setStage("context");setAccepted(false);setQuestion("");
  setAnswers([]);setAnswerText("");setDraft("");setTurns([]);setMessage("");
  if(selected==="voice")speak(firstQuestion,ownerLanguage);
 };
 const close=()=>{
  pressed.current=false;
  if(recordingRef.current)void recorder.stop().catch(()=>{});
  recordingRef.current=false;
  setRecording(false);
  Speech.stop();setMode(null);setMessage("");
 };
 const call=async(endpoint:string,payload:object)=>{
  const {data}=await supabase!.auth.getSession();
  if(!data.session)throw Error("Tu sesión ha terminado.");
  const r=await fetch(api+endpoint,{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+data.session.access_token},
   body:JSON.stringify(payload)
  });
  const value=await r.json();
  if(!r.ok)throw Error(value.error||"No fue posible completar la solicitud.");
  return value as Record<string,unknown>;
 };
 const persist=async(next:Context)=>{
  if(!supabase)return;
  const {error}=await supabase.from("smartjob_contexts").upsert({...next,user_id:session.user.id,updated_at:new Date().toISOString()});
  if(error)setMessage("El contexto se usará en esta sesión, pero no pudo guardarse.");
 };
 const skip=()=>{Speech.stop();setStage("active");setMessage("");};
 const submitContext=async(value:string)=>{
  if(!value.trim()||lock.current)return;
  if(!accepted){setMessage("Confirma el consentimiento antes de continuar.");return;}
  const next=[...answers,{question:currentQuestion,answer:value.trim().slice(0,550)}];
  setAnswers(next);setAnswerText("");setMessage("");setWorking(true);lock.current=true;
  try{
   const result=await call("/api/interpreter",{action:"context",answers:next,ownerLanguage});
   if(result.done===true||next.length>=3){
    const data=(result.context||{}) as Partial<Context>;
    const merged={...context,job_type:data.job_type||context.job_type,
     client_name:data.client_name||context.client_name,
     details:data.details||next.map(v=>v.answer).join(" · ").slice(0,650)};
    setContext(merged);void persist(merged);
    setStage("active");Speech.stop();
   }else{
    const nextQuestion=String(result.question||"").trim();
    if(!nextQuestion){setStage("active");return;}
    setQuestion(nextQuestion);
    if(mode==="voice")speak(nextQuestion,ownerLanguage);
   }
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo preparar el contexto. Puedes omitirlo.");}
  finally{setWorking(false);lock.current=false;}
 };
 const translate=async(value:string)=>{
  if(!value.trim()||lock.current)return;
  if(!accepted){setMessage("Confirma que ambos conocen el uso del traductor.");return;}
  lock.current=true;setWorking(true);setMessage("");
  try{
   const data=await call("/api/interpreter",{action:"translate",text:value.trim(),context});
   const source=data.sourceLanguage==="en"?"en":"es",target:Language=source==="es"?"en":"es";
   if(typeof data.translation!=="string"||!data.translation)throw Error("No se detectó el idioma.");
   const turn:Turn={source:value.trim(),target:data.translation,language:source,translatedTo:target,
    blocked:data.blocked===true,warning:typeof data.warning==="string"?data.warning:""};
   setTurns(previous=>[...previous.slice(-7),turn]);setDraft("");
   if(!turn.blocked&&mode==="voice")speak(turn.target,target);
   if(turn.blocked)setMessage("Comprueba los números antes de reproducir la traducción.");
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo traducir.");}
  finally{setWorking(false);lock.current=false;}
 };
 const input=(value:string)=>stage==="context"?submitContext(value):translate(value);
 const stopRecording=async()=>{
  pressed.current=false;
  if(!recordingRef.current)return;
  recordingRef.current=false;setRecording(false);
  try{
   await recorder.stop();
   if(!recorder.uri)throw Error("No pudimos guardar el audio.");
   if(lock.current)return;
   lock.current=true;setWorking(true);setMessage("");
   const {data}=await supabase!.auth.getSession();
   if(!data.session)throw Error("Inicia sesión de nuevo.");
   const form=new FormData();
   form.append("audio",{uri:recorder.uri,name:"conversation.m4a",type:"audio/mp4"} as unknown as Blob);
   const r=await fetch(api+"/api/voice/transcribe",{
    method:"POST",headers:{Authorization:"Bearer "+data.session.access_token},body:form
   });
   const decoded=await r.json();
   if(!r.ok)throw Error(decoded.error||"Error de transcripción.");
   const spoken=String(decoded.text||"").trim();
   if(!spoken)throw Error("No se detectó voz. Inténtalo de nuevo.");
   lock.current=false;setWorking(false);
   await input(spoken);
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo procesar el audio.");}
  finally{lock.current=false;setWorking(false);}
 };
 const startRecording=async()=>{
  if(working||recordingRef.current||lock.current)return;
  if(!accepted){setMessage("Acepta el consentimiento antes de hablar.");return;}
  pressed.current=true;
  try{
   await Speech.stop();
   const permission=await AudioModule.requestRecordingPermissionsAsync();
   if(!permission.granted)throw Error("Autoriza el micrófono en Ajustes del iPhone.");
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
   if(!pressed.current)return;
   await recorder.prepareToRecordAsync();
   if(!pressed.current)return;
   recorder.record();recordingRef.current=true;setRecording(true);
   if(!pressed.current)void stopRecording();
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo activar el micrófono.");pressed.current=false;}
 };
 const latest=turns[turns.length-1];
 const estimated=predictedLanguage(draft);
 return <View style={styles.entry}>
  <Text style={styles.eyebrow}>TRADUCCIÓN EN PERSONA</Text>
  <Text style={styles.heading}>¿Cómo conversarán?</Text>
  <Pressable style={styles.choice} accessibilityRole="button" onPress={()=>open("voice")}>
   <View style={styles.choiceIcon}><Text style={styles.choiceEmoji}>🎙</Text></View>
   <View style={styles.choiceCopy}><Text style={styles.choiceName}>Iniciar conversación hablada</Text>
    <Text style={styles.choiceDetails}>Habla, suelta y escucha la traducción</Text></View>
   <Text style={styles.chevron}>›</Text>
  </Pressable>
  <Pressable style={styles.choice} accessibilityRole="button" onPress={()=>open("text")}>
   <View style={styles.choiceIcon}><Text style={styles.choiceEmoji}>⌨</Text></View>
   <View style={styles.choiceCopy}><Text style={styles.choiceName}>Escribir mensajes</Text>
    <Text style={styles.choiceDetails}>Idioma detectado automáticamente</Text></View>
   <Text style={styles.chevron}>›</Text>
  </Pressable>
  <Modal visible={mode!==null} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
   <KeyboardAvoidingView style={[styles.modal,{backgroundColor:mode==="voice"?interfaceColors.dark:"#F7FCFB"}]}
    behavior={Platform.OS==="ios"?"padding":undefined}>
    <View style={styles.top}>
     <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={close}><Text style={styles.back}>‹</Text></Pressable>
     <View style={styles.topTitle}><Text style={[styles.title,{color:mode==="voice"?"#F4FBF8":"#152229"}]}>{stage==="context"?"Antes de comenzar":mode==="voice"?"Conversación hablada":"Conversación escrita"}</Text>
      <Text style={styles.topLanguages}>🇺🇸 English ⇄ 🇪🇸 Español</Text></View>
     {stage==="context"?<Pressable accessibilityRole="button" onPress={skip}><Text style={styles.skip}>Omitir</Text></Pressable>:
      <Pressable accessibilityRole="button" onPress={()=>{setTurns([]);setMessage("");}}><Text style={styles.skip}>Limpiar</Text></Pressable>}
    </View>
    {stage==="context"?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contextBody}>
     <View style={styles.contextOrb}><Text style={styles.contextIcon}>✦</Text></View>
     <Text style={styles.contextKicker}>CONTEXTO · {Math.min(answers.length+1,3)} DE 3</Text>
     <Text style={[styles.question,{color:mode==="voice"?"white":"#17242B"}]}>{currentQuestion}</Text>
     <Text style={[styles.smallHint,{color:mode==="voice"?"#A9C4C0":"#66817B"}]}>Solo preguntaremos lo necesario.</Text>
     {mode==="voice"?<>
      <Pressable accessibilityRole="button" style={styles.listenButton} onPress={()=>speak(currentQuestion,ownerLanguage)}>
       <Text style={styles.listenText}>🔊 Escuchar pregunta</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Mantener pulsado para responder"
       onPressIn={()=>void startRecording()} onPressOut={()=>void stopRecording()} disabled={working}
       style={[styles.micButton,recording&&styles.recording]}>
       <Text style={styles.flags}>🇺🇸  🇪🇸</Text><Text style={styles.micIcon}>🎙</Text>
       <Text style={styles.micLabel}>{recording?"Escuchando…":"Responder"}</Text>
      </Pressable>
     </>:<View style={styles.contextComposer}>
      <TextInput multiline numberOfLines={3} style={styles.textField} placeholder="Cuéntame brevemente…"
       placeholderTextColor="#8D9FA0" value={answerText} onChangeText={setAnswerText} maxLength={550}/>
      <Pressable style={styles.primary} onPress={()=>void submitContext(answerText)} disabled={working||!answerText.trim()}>
       <Text style={styles.primaryText}>Continuar →</Text></Pressable>
     </View>}
     <Pressable onPress={()=>setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{checked:accepted}} style={styles.consent}>
      <Text style={styles.consentTick}>{accepted?"☑":"☐"}</Text>
      <Text style={[styles.consentCopy,{color:mode==="voice"?"#B4D1CB":"#57796F"}]}>Ambos aceptamos procesar la conversación con IA.</Text>
     </Pressable>
    </ScrollView>:mode==="voice"?<View style={styles.voiceBody}>
     <ScrollView ref={viewRef} contentContainerStyle={styles.transcript}>
      {latest?<View style={styles.transcriptBlock}>
       <Text style={styles.transcriptLang}>{flag(latest.language)} {label(latest.language)}</Text>
       <Text style={[styles.original,{fontSize:latest.source.length>210?15:latest.source.length>100?19:24}]}>{latest.source}</Text>
       <Text style={styles.down}>↓</Text>
       <Text style={styles.transcriptLang}>{flag(latest.translatedTo)} {label(latest.translatedTo)}</Text>
       <Text style={[styles.translated,{fontSize:latest.target.length>210?15:latest.target.length>100?19:24}]}>{latest.target}</Text>
       {latest.warning?<Text style={styles.warning}>{latest.warning}</Text>:null}
       <Pressable disabled={latest.blocked} onPress={()=>speak(latest.target,latest.translatedTo)}><Text style={styles.listenText}>🔊 Repetir</Text></Pressable>
      </View>:<Text style={styles.voiceEmpty}>La conversación aparecerá aquí</Text>}
     </ScrollView>
     <View style={styles.micZone}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mantener pulsado para hablar"
       onPressIn={()=>void startRecording()} onPressOut={()=>void stopRecording()} disabled={working}
       style={[styles.micButton,recording&&styles.recording]}>
       <Text style={styles.flags}>🇺🇸  🇪🇸</Text><Text style={styles.micIcon}>🎙</Text>
       <Text style={styles.micLabel}>{recording?"Escuchando…":"Mantén pulsado"}</Text>
      </Pressable>
      <Text style={styles.voiceNote}>{working?"Traduciendo…":recording?"Suelta para traducir":"Mantén pulsado mientras hablas"}</Text>
      <Pressable onPress={()=>setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{checked:accepted}} style={styles.consent}>
       <Text style={styles.consentTick}>{accepted?"☑":"☐"}</Text><Text style={styles.consentCopy}>Ambos aceptamos procesar la conversación.</Text>
      </Pressable>
     </View>
    </View>:<View style={styles.textBody}>
     <ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
      {turns.length?turns.map((turn,index)=><View key={index} style={styles.turn}>
       <Text style={styles.turnLanguage}>{flag(turn.language)} {label(turn.language)}</Text>
       <Text style={styles.turnSource}>{turn.source}</Text>
       <Text style={styles.turnLanguage}>{flag(turn.translatedTo)} {label(turn.translatedTo)}</Text>
       <Text style={styles.turnTranslation}>{turn.target}</Text>
       {turn.warning?<Text style={styles.warning}>{turn.warning}</Text>:null}
       <Pressable disabled={turn.blocked} onPress={()=>speak(turn.target,turn.translatedTo)}><Text style={styles.listenText}>🔊 Escuchar</Text></Pressable>
      </View>):<Text style={styles.textEmpty}>Escribe para comenzar</Text>}
     </ScrollView>
     <View style={styles.textInputZone}>
      {estimated?<View style={styles.detected}><Text style={styles.detectedText}>{flag(estimated)} {label(estimated)} detectado</Text></View>:null}
      <View style={styles.compose}>
       <TextInput style={styles.messageInput} multiline placeholder="Escribe en español o inglés…"
        placeholderTextColor="#87999B" maxLength={2400} value={draft} onChangeText={setDraft}/>
       <Pressable accessibilityRole="button" style={styles.send} onPress={()=>void translate(draft)} disabled={working||!draft.trim()}><Text style={styles.sendText}>➤</Text></Pressable>
      </View>
      <Pressable onPress={()=>setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{checked:accepted}} style={styles.consent}>
       <Text style={styles.consentTick}>{accepted?"☑":"☐"}</Text><Text style={[styles.consentCopy,{color:"#647D77"}]}>Ambos aceptamos procesar los mensajes.</Text>
      </Pressable>
     </View>
    </View>}
    {working&&<View style={styles.loading}><ActivityIndicator color={interfaceColors.mint}/><Text style={styles.loadingText}>Procesando…</Text></View>}
    {message?<Text style={[styles.error,{color:mode==="voice"?"#FFBEBD":"#B34257"}]}>{message}</Text>:null}
   </KeyboardAvoidingView>
  </Modal>
 </View>;
}
const styles=StyleSheet.create({
 entry:{paddingTop:10},
 eyebrow:{color:"#0C9E7F",fontSize:11,fontWeight:"800",letterSpacing:2,marginBottom:11},
 heading:{fontSize:25,fontWeight:"800",letterSpacing:-.6,color:"#172329",marginBottom:22},
 choice:{flexDirection:"row",alignItems:"center",gap:14,backgroundColor:"#FFFFFF",borderRadius:23,borderWidth:1,borderColor:"#D8EDE6",padding:19,marginBottom:14},
 choiceIcon:{width:54,height:54,alignItems:"center",justifyContent:"center",backgroundColor:"#D9F9ED",borderRadius:17},
 choiceEmoji:{fontSize:25,color:"#09765B"},choiceCopy:{flex:1},
 choiceName:{fontWeight:"800",fontSize:15,color:"#15222B",lineHeight:20},
 choiceDetails:{color:"#788984",fontSize:11,marginTop:5},chevron:{color:"#0E9775",fontSize:26},
 modal:{flex:1,paddingHorizontal:17,paddingTop:Platform.OS==="ios"?54:28,paddingBottom:Platform.OS==="ios"?22:16},
 top:{minHeight:57,flexDirection:"row",alignItems:"center",gap:10},
 back:{fontSize:37,color:"#3DDDB7",fontWeight:"600",width:35,lineHeight:40},
 topTitle:{flex:1,alignItems:"center"},
 title:{fontSize:14,fontWeight:"800"},topLanguages:{fontSize:11,color:"#84B9A8",marginTop:4,fontWeight:"700"},
 skip:{fontSize:12,color:"#2ED7AD",fontWeight:"800",minWidth:46,textAlign:"right"},
 contextBody:{flexGrow:1,alignItems:"center",justifyContent:"center",paddingVertical:24,gap:14},
 contextOrb:{height:72,width:72,borderRadius:40,backgroundColor:"#26DAB7",justifyContent:"center",alignItems:"center"},
 contextIcon:{fontSize:33,color:"#075A49"},
 contextKicker:{color:"#45DDB7",letterSpacing:2,fontWeight:"800",fontSize:11},
 question:{fontSize:24,fontWeight:"800",textAlign:"center",lineHeight:32,letterSpacing:-.4},
 smallHint:{fontSize:12,textAlign:"center",lineHeight:17},
 listenButton:{padding:12,borderRadius:12,backgroundColor:"#FFFFFF13"},
 listenText:{color:"#31D9AE",fontSize:13,fontWeight:"800",marginTop:6,textAlign:"center"},
 micButton:{width:172,height:172,borderRadius:90,borderWidth:8,borderColor:"#A3FFE52A",backgroundColor:"#37E1BD",justifyContent:"center",alignItems:"center",gap:7},
 recording:{backgroundColor:"#F8AF8A",borderColor:"#F8C0A05B"},flags:{fontSize:30},micIcon:{fontSize:25},micLabel:{color:"#064735",fontSize:12,fontWeight:"900"},
 contextComposer:{width:"100%",maxWidth:470,gap:12},
 textField:{minHeight:103,textAlignVertical:"top",fontSize:16,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D7E9E5",borderRadius:18,padding:14,color:"#1A2D30"},
 primary:{backgroundColor:"#2DDDB8",borderRadius:16,padding:15,alignItems:"center"},
 primaryText:{fontWeight:"800",fontSize:15,color:"#064E3B"},
 consent:{flexDirection:"row",alignItems:"center",gap:8,marginTop:13,alignSelf:"center",maxWidth:370,paddingVertical:6},
 consentTick:{color:"#2EDEB5",fontSize:21},consentCopy:{color:"#ABC9C2",fontSize:11,lineHeight:16,flexShrink:1},
 voiceBody:{flex:1,minHeight:0,justifyContent:"space-between"},
 transcript:{flexGrow:1,justifyContent:"center",alignItems:"center",paddingVertical:20,gap:8},
 transcriptBlock:{alignItems:"center",gap:7,maxWidth:480,width:"100%"},
 transcriptLang:{fontSize:12,color:"#6CE7C6",fontWeight:"800"},
 original:{color:"#FFFFFF",fontWeight:"700",textAlign:"center",lineHeight:30},
 down:{color:"#46E6BC",fontSize:22},
 translated:{color:"#ABFDE2",fontWeight:"800",textAlign:"center",lineHeight:30},
 warning:{fontSize:11,color:"#FFCAA6",textAlign:"center"},
 voiceEmpty:{color:"#91ACA6",fontSize:13,textAlign:"center"},
 micZone:{alignItems:"center",gap:12,paddingBottom:10},
 voiceNote:{fontSize:12,color:"#B4CEC5",textAlign:"center"},
 textBody:{flex:1,minHeight:0},
 messages:{flexGrow:1,paddingVertical:20,gap:14},
 turn:{borderRadius:19,backgroundColor:"#FFFFFF",borderColor:"#DBEBE7",borderWidth:1,padding:16,gap:7},
 turnLanguage:{fontSize:12,fontWeight:"800",color:"#178D73"},
 turnSource:{fontSize:14,color:"#77868B"},
 turnTranslation:{fontSize:20,fontWeight:"700",color:"#17272B",lineHeight:27},
 textEmpty:{marginTop:80,textAlign:"center",color:"#849995",fontSize:13},
 textInputZone:{paddingBottom:10},
 detected:{alignSelf:"flex-start",backgroundColor:"#FFFFFF",borderRadius:25,paddingVertical:8,paddingHorizontal:13,marginBottom:10,borderWidth:1,borderColor:"#C8EADD"},
 detectedText:{color:"#0C896A",fontWeight:"800",fontSize:12},
 compose:{flexDirection:"row",alignItems:"flex-end",backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D8E8E4",borderRadius:19,padding:8,gap:8},
 messageInput:{flex:1,minHeight:49,maxHeight:122,fontSize:15,color:"#1A2D30",paddingHorizontal:8,paddingVertical:9,textAlignVertical:"top"},
 send:{width:45,height:45,justifyContent:"center",alignItems:"center",borderRadius:14,backgroundColor:"#2ED8B3"},
 sendText:{color:"#073B2E",fontSize:23},
 loading:{flexDirection:"row",alignItems:"center",alignSelf:"center",gap:9,paddingVertical:6},
 loadingText:{color:"#3ADDAD",fontSize:12},
 error:{fontSize:12,lineHeight:18,textAlign:"center",marginTop:6,marginBottom:8},
});
