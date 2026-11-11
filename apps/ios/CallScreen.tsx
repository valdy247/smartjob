import React,{useEffect,useRef,useState} from "react";
import {
  ActivityIndicator,Pressable,SafeAreaView,ScrollView,StatusBar,
  StyleSheet,Text,View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {BlurView} from "expo-blur";
import {AudioDevice,Call,CallInvite,Voice} from "@twilio/voice-react-native-sdk";
import {api,supabase} from "./session";

type Caption={
  seq:number;speaker:"customer"|"professional";
  text:string;failed?:boolean;atSeconds:number;
};
type CaptionResponse={
  language:"es-ES"|"en-US";turns:Caption[];
  hasMore:boolean;truncated:boolean;
};
type Props={
  voice:Voice;
  invite:CallInvite|null;
  call:Call|null;
  busy:boolean;
  status:string;
  onAccept:()=>void;
  onReject:()=>void;
  onEnd:()=>void;
  ownerLanguage?:"en-US"|"es-ES";
};
const formatSeconds=(s:number)=>
  String(Math.floor(s/60)).padStart(2,"0")+":"+
  String(s%60).padStart(2,"0");
const keypad=[
  ["1",""],["2","ABC"],["3","DEF"],
  ["4","GHI"],["5","JKL"],["6","MNO"],
  ["7","PQRS"],["8","TUV"],["9","WXYZ"],
  ["*",""],["0","+"],["#",""]
];
const digitsPattern=/^[0-9*#]$/;
const letterColor="#F8F8FA";
const roomTitle="VMV CALL";

export function CallScreen({
  voice,invite,call,busy,status,onAccept,onReject,onEnd,
  ownerLanguage="es-ES"
}:Props){
  const [muted,setMuted]=useState(false);
  const [speaker,setSpeaker]=useState(false);
  const [audioBusy,setAudioBusy]=useState(false);
  const [keypadOpen,setKeypadOpen]=useState(false);
  const [keypadDigits,setKeypadDigits]=useState("");
  const [transcriptOpen,setTranscriptOpen]=useState(false);
  const [turns,setTurns]=useState<Caption[]>([]);
  const [captionLanguage,setCaptionLanguage]=useState<"en-US"|"es-ES">(ownerLanguage);
  const [captionError,setCaptionError]=useState("");
  const [truncated,setTruncated]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [controlError,setControlError]=useState("");
  const [dtmfBusy,setDtmfBusy]=useState(false);
  const cursor=useRef(0),polling=useRef(false),connectedAt=useRef<number|null>(null);
  const transcriptScroll=useRef<ScrollView|null>(null);

  useEffect(()=>{
    setMuted(false);setSpeaker(false);setKeypadOpen(false);setKeypadDigits("");
    setTranscriptOpen(false);setTurns([]);setCaptionError("");setTruncated(false);
    setControlError("");setElapsed(0);cursor.current=0;connectedAt.current=null;
    setCaptionLanguage(ownerLanguage);
    if(!call)return;
    setMuted(call.isMuted()===true);
    const connected=()=>{
      if(connectedAt.current===null)connectedAt.current=Date.now();
    };
    if(call.getState()===Call.State.Connected)connected();
    call.addListener(Call.Event.Connected,connected);
    const tick=setInterval(()=>{
      if(connectedAt.current!==null)
        setElapsed(Math.max(0,Math.floor((Date.now()-connectedAt.current)/1000)));
    },1000);
    return()=>{clearInterval(tick);call.off(Call.Event.Connected,connected);};
  },[call,ownerLanguage]);

  useEffect(()=>{
    if(!call)return;
    const onAudioDevices=(_devices:AudioDevice[],selected?:AudioDevice)=>{
      setSpeaker(selected?.type===AudioDevice.Type.Speaker);
    };
    voice.on(Voice.Event.AudioDevicesUpdated,onAudioDevices);
    void voice.getAudioDevices().then(v=>{
      setSpeaker(v.selectedDevice?.type===AudioDevice.Type.Speaker);
    }).catch(()=>{});
    return()=>{voice.off(Voice.Event.AudioDevicesUpdated,onAudioDevices);};
  },[voice,call]);

  useEffect(()=>{
    if(!call||!transcriptOpen)return;
    let cancelled=false;
    async function update(){
      if(polling.current||cancelled)return;
      polling.current=true;
      try{
        const sid=call?.getSid();
        if(!sid||!/^CA[a-f\d]{32}$/i.test(sid)){
          if(!cancelled)setCaptionError("Esperando a que la llamada se conecte…");
          return;
        }
        const {data:{session}}=await supabase!.auth.getSession();
        if(!session)throw Error("session_expired");
        const url=api+"/api/ios/live-transcript?callSid="+encodeURIComponent(sid)+
          "&after="+cursor.current;
        const result=await fetch(url,{
          headers:{"Authorization":"Bearer "+session.access_token}
        });
        if(result.status===404||result.status===409){
          if(!cancelled)setCaptionError("Esperando transcripción de esta llamada…");
          return;
        }
        if(!result.ok)throw Error("transcript_server_"+result.status);
        const payload=await result.json() as CaptionResponse;
        if(!Array.isArray(payload.turns)||!["es-ES","en-US"].includes(payload.language))
          throw Error("invalid_transcript");
        if(cancelled)return;
        setCaptionLanguage(payload.language);
        setTruncated(v=>v||payload.truncated===true);
        setCaptionError("");
        const incoming=payload.turns.filter(t=>
          Number.isSafeInteger(t.seq)&&t.seq>cursor.current&&
          (t.speaker==="professional"||t.speaker==="customer")&&
          typeof t.text==="string"&&t.text.length<=800
        );
        if(incoming.length){
          cursor.current=Math.max(cursor.current,...incoming.map(t=>t.seq));
          setTurns(prev=>{
            const have=new Set(prev.map(t=>t.seq));
            return [...prev,...incoming.filter(t=>!have.has(t.seq))]
              .sort((a,b)=>a.seq-b.seq).slice(-2000);
          });
        }
      }catch(e){
        if(!cancelled)setCaptionError(
          e instanceof Error&&e.message==="session_expired"
            ?"Vuelve a iniciar sesión para ver la transcripción."
            :"Transcripción temporalmente no disponible. La llamada continúa."
        );
      }finally{polling.current=false;}
    }
    void update();
    const timer=setInterval(()=>{void update();},1150);
    return()=>{cancelled=true;clearInterval(timer);};
  },[call,transcriptOpen]);

  async function muteMicrophone(){
    if(!call||audioBusy)return;
    setAudioBusy(true);setControlError("");
    try{
      const confirmed=await call.mute(!(call.isMuted()??muted));
      setMuted(confirmed);
    }catch{setControlError("No se pudo cambiar el micrófono.");}
    finally{setAudioBusy(false);}
  }

  async function changeSpeaker(){
    if(!call||audioBusy)return;
    setAudioBusy(true);setControlError("");
    try{
      const state=await voice.getAudioDevices();
      const targetType=speaker?AudioDevice.Type.Earpiece:AudioDevice.Type.Speaker;
      const chosen=state.audioDevices.find(d=>d.type===targetType);
      if(!chosen)throw Error("missing_audio_device");
      await chosen.select();
      const current=await voice.getAudioDevices();
      setSpeaker(current.selectedDevice?.type===AudioDevice.Type.Speaker);
    }catch{
      setControlError("No se pudo cambiar la salida de audio.");
    }finally{setAudioBusy(false);}
  }

  async function pressDigit(digit:string){
    if(!call||dtmfBusy||!digitsPattern.test(digit))return;
    setDtmfBusy(true);setControlError("");
    try{
      // Real in-call DTMF through Twilio Voice SDK; never place a new PSTN call.
      await call.sendDigits(digit);
      setKeypadDigits(v=>(v+digit).slice(-32));
    }catch{setControlError("No se pudo enviar el tono. Intenta otra vez.");}
    finally{setDtmfBusy(false);}
  }

  const labels=captionLanguage==="en-US"
    ?{you:"You",caller:"Caller",title:"Live transcript",waiting:"Your conversation will appear here.",temporary:"Only visible during this call · Not saved",older:"Older lines were omitted.",back:"Back"}
    :{you:"Tú",caller:"Cliente",title:"Transcripción",waiting:"Aquí aparecerá la conversación.",temporary:"Solo durante esta llamada · No se guarda",older:"Se omitieron intervenciones antiguas.",back:"Volver"};

  return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content" backgroundColor="#171922"/>
    <View pointerEvents="none" style={styles.glowOne}/>
    <View pointerEvents="none" style={styles.glowTwo}/>
    <View style={styles.main}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Ionicons name="pulse" color="#FFFFFF" size={21}/>
        </View>
        <Text style={styles.brandText}>{roomTitle}</Text>
      </View>
      <View style={styles.callerArea}>
        <Text style={styles.callerName}>Cliente</Text>
        <Text style={styles.callClock}>
          {call?connectedAt.current===null?"Conectando…":formatSeconds(elapsed):"Llamada entrante"}
        </Text>
        {call?<Text style={styles.subStatus}>{status}</Text>:null}
      </View>
      <View style={styles.controlArea}>
        {call?<View style={styles.controlsRow}>
          <CallControl label={muted?"Activar micrófono":"Silencio"}
            icon={muted?"mic-off":"mic-off-outline"} selected={muted}
            disabled={audioBusy} onPress={()=>void muteMicrophone()}/>
          <CallControl label="Teclado" icon="keypad-outline"
            selected={keypadOpen} onPress={()=>setKeypadOpen(true)}/>
          <CallControl label="Altavoz" icon={speaker?"volume-high":"volume-high-outline"}
            selected={speaker} disabled={audioBusy} onPress={()=>void changeSpeaker()}/>
        </View>:<Text style={styles.ringingTip}>Desliza o responde desde tu iPhone</Text>}
        {call?<Pressable accessibilityRole="button"
            accessibilityLabel="Ver transcripción en vivo"
            onPress={()=>setTranscriptOpen(true)} style={styles.transcriptButton}>
            <Ionicons name="document-text-outline" color="#FFFFFF" size={23}/>
            <Text style={styles.transcriptButtonText}>Transcripción</Text>
          </Pressable>:null}
        {controlError?<Text style={styles.controlError}>{controlError}</Text>:null}
      </View>
      <View style={styles.bottomArea}>
        {call?<Pressable accessibilityRole="button"
          accessibilityLabel="Finalizar llamada"
          style={styles.hangupButton} onPress={onEnd}>
          <Ionicons name="call" size={39} color="#FFFFFF"
            style={{transform:[{rotate:"135deg"}]}}/>
        </Pressable>:<View style={styles.incomingButtons}>
          <View style={styles.incomingOption}>
            <Pressable accessibilityRole="button" accessibilityLabel="Rechazar"
              disabled={busy} style={styles.decline} onPress={onReject}>
              <Ionicons name="call" size={30} color="#FFF"
                style={{transform:[{rotate:"135deg"}]}}/>
            </Pressable>
            <Text style={styles.optionText}>Rechazar</Text>
          </View>
          <View style={styles.incomingOption}>
            <Pressable accessibilityRole="button" accessibilityLabel="Contestar"
              disabled={busy} style={styles.accept} onPress={onAccept}>
              <Ionicons name="call" size={30} color="#FFF"/>
            </Pressable>
            <Text style={styles.optionText}>Contestar</Text>
          </View>
        </View>}
        {call?<Text style={styles.endText}>Finalizar llamada</Text>:null}
      </View>
    </View>

    {call&&keypadOpen?<View style={styles.overlay}>
      <BlurView tint="dark" intensity={88} style={StyleSheet.absoluteFill}/>
      <View style={styles.overlayTint}/>
      <View style={styles.overlayHeader}>
        <Pressable accessibilityRole="button" onPress={()=>setKeypadOpen(false)}
          style={styles.backPress}>
          <Ionicons name="chevron-back" size={23} color="#FFF"/>
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
        <Text style={styles.overlayTitle}>Teclado</Text>
        <View style={{width:84}}/>
      </View>
      <Text style={styles.dialedDigits}>{keypadDigits||" "}</Text>
      <View style={styles.dialpad}>
        {keypad.map(([digit,letters])=>
          <Pressable key={digit} accessibilityRole="button" accessibilityLabel={"Marcar "+digit}
            disabled={dtmfBusy} onPress={()=>void pressDigit(digit)}
            style={styles.digitButton}>
            <Text style={styles.digit}>{digit}</Text>
            <Text style={styles.digitLetters}>{letters}</Text>
          </Pressable>)}
      </View>
      {controlError?<Text style={styles.controlError}>{controlError}</Text>:null}
      <View style={styles.overlayEnd}>
        <Pressable style={styles.smallHangup} onPress={onEnd} accessibilityLabel="Finalizar llamada">
          <Ionicons name="call" size={30} color="#FFF"
            style={{transform:[{rotate:"135deg"}]}}/>
        </Pressable>
      </View>
    </View>:null}

    {call&&transcriptOpen?<View style={styles.overlay}>
      {/* Blur the actual call screen rather than replacing it with a new theme. */}
      <BlurView tint="dark" intensity={95} style={StyleSheet.absoluteFill}/>
      <View style={styles.overlayTint}/>
      <View style={styles.overlayHeader}>
        <Pressable accessibilityRole="button" onPress={()=>setTranscriptOpen(false)}
          style={styles.backPress}>
          <Ionicons name="chevron-back" size={23} color="#FFF"/>
          <Text style={styles.backText}>{labels.back}</Text>
        </Pressable>
        <Text style={styles.overlayTitle}>{labels.title}</Text>
        <View style={{width:84}}/>
      </View>
      <View style={styles.chatSubheader}>
        <View style={styles.liveDot}/>
        <Text style={styles.liveLabel}>
          {captionLanguage==="en-US"?"English":"Español"}
        </Text>
      </View>
      <ScrollView ref={transcriptScroll}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={()=>transcriptScroll.current?.scrollToEnd({animated:true})}>
        {truncated?<Text style={styles.chatInfo}>{labels.older}</Text>:null}
        {turns.length===0?<View style={styles.emptyTranscript}>
          <Ionicons name="chatbubbles-outline" size={32} color="#C9CEDB"/>
          <Text style={styles.waitingText}>{labels.waiting}</Text>
          {captionError?<Text style={styles.chatInfo}>{captionError}</Text>:null}
          {!captionError?<ActivityIndicator color="#BDBCD9" style={{marginTop:16}}/>:null}
        </View>:turns.map(t=>
          <View key={t.seq} style={[
              styles.messageBlock,t.speaker==="professional"?styles.messageOwn:styles.messageCustomer
            ]}>
            <Text style={styles.messageSpeaker}>
              {t.speaker==="professional"?labels.you:labels.caller}
              {" · "}{formatSeconds(Number.isFinite(t.atSeconds)?t.atSeconds:0)}
            </Text>
            <View style={[
              styles.bubble,t.speaker==="professional"?styles.bubbleOwn:styles.bubbleCustomer,
              t.failed&&styles.bubbleFailed
            ]}>
              <Text style={styles.messageText}>{t.text}</Text>
            </View>
          </View>
        )}
      </ScrollView>
      {captionError&&turns.length>0?<Text style={styles.chatInfo}>{captionError}</Text>:null}
      <View style={styles.chatFooter}>
        <Text style={styles.chatFooterText}>{labels.temporary}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Finalizar llamada"
          style={styles.chatEnd} onPress={onEnd}>
          <Ionicons name="call" size={25} color="#FFF"
            style={{transform:[{rotate:"135deg"}]}}/>
        </Pressable>
      </View>
    </View>:null}
  </SafeAreaView>;
}

type IonName=React.ComponentProps<typeof Ionicons>["name"];
function CallControl({label,icon,selected,disabled,onPress}:{
  label:string;icon:IonName;selected?:boolean;disabled?:boolean;onPress:()=>void
}){
  return <View style={styles.controlContainer}>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{selected:selected===true,disabled:disabled===true}}
      disabled={disabled} onPress={onPress} style={[
        styles.controlCircle,selected&&styles.controlSelected
      ]}>
      <Ionicons name={icon} size={32} color={selected?"#181821":letterColor}/>
    </Pressable>
    <Text style={styles.controlLabel}>{label}</Text>
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#171923",overflow:"hidden"},
  glowOne:{position:"absolute",left:-135,top:130,width:310,height:360,
    borderRadius:180,backgroundColor:"#6F364C",opacity:0.18},
  glowTwo:{position:"absolute",right:-190,bottom:20,width:440,height:520,
    borderRadius:260,backgroundColor:"#302F6E",opacity:0.24},
  main:{flex:1,alignItems:"center",justifyContent:"space-between",
    paddingHorizontal:18,paddingTop:54,paddingBottom:56},
  brandRow:{flexDirection:"row",alignItems:"center",gap:12},
  brandIcon:{height:36,width:36,borderRadius:10,backgroundColor:"#7555EE",
    alignItems:"center",justifyContent:"center"},
  brandText:{fontSize:20,fontWeight:"700",letterSpacing:1.4,color:"#FAFAFF"},
  callerArea:{alignItems:"center",marginTop:25},
  callerName:{fontSize:47,fontWeight:"600",letterSpacing:-1.7,color:"#FFF"},
  callClock:{marginTop:12,fontSize:25,fontWeight:"400",color:"#B8B8C6"},
  subStatus:{color:"#8A8E9F",fontSize:12,marginTop:8},
  controlArea:{width:"100%",alignItems:"center",gap:48,marginTop:"auto",marginBottom:"auto"},
  controlsRow:{flexDirection:"row",width:"100%",justifyContent:"space-around"},
  controlContainer:{alignItems:"center",gap:11,minWidth:92},
  controlCircle:{width:78,height:78,borderRadius:39,backgroundColor:"#363743",
    alignItems:"center",justifyContent:"center"},
  controlSelected:{backgroundColor:"#F2F2F6"},
  controlLabel:{fontSize:14,color:"#FFFFFF",fontWeight:"500"},
  ringingTip:{color:"#A0A2B0",fontSize:15},
  transcriptButton:{flexDirection:"row",alignItems:"center",justifyContent:"center",
    gap:13,borderRadius:40,backgroundColor:"#333440",paddingVertical:18,
    paddingHorizontal:30,minWidth:225},
  transcriptButtonText:{fontSize:17,fontWeight:"500",color:"#FAFAFC"},
  controlError:{color:"#FFB8BE",fontSize:12,textAlign:"center",marginHorizontal:20},
  bottomArea:{alignItems:"center",justifyContent:"center",minHeight:148},
  hangupButton:{width:83,height:83,borderRadius:44,backgroundColor:"#FF3B35",
    alignItems:"center",justifyContent:"center"},
  endText:{color:"#FFFFFF",fontSize:15,marginTop:14},
  incomingButtons:{flexDirection:"row",width:"100%",justifyContent:"space-around"},
  incomingOption:{gap:12,alignItems:"center"},
  decline:{width:76,height:76,borderRadius:40,backgroundColor:"#FF3B35",
    alignItems:"center",justifyContent:"center"},
  accept:{width:76,height:76,borderRadius:40,backgroundColor:"#36C96A",
    alignItems:"center",justifyContent:"center"},
  optionText:{color:"#FFF",fontSize:16},
  overlay:{...StyleSheet.absoluteFillObject,zIndex:10,
    backgroundColor:"rgba(18,18,28,0.25)",paddingTop:24,paddingBottom:18},
  overlayTint:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(17,18,28,0.55)"},
  overlayHeader:{paddingHorizontal:20,height:62,flexDirection:"row",
    alignItems:"center",justifyContent:"space-between"},
  backPress:{flexDirection:"row",alignItems:"center",width:84,gap:0},
  backText:{color:"#FFF",fontSize:14,fontWeight:"600"},
  overlayTitle:{color:"#FFF",fontSize:19,fontWeight:"700"},
  dialedDigits:{minHeight:66,fontSize:29,textAlign:"center",color:"#FFF",
    letterSpacing:3,marginTop:30,marginBottom:18},
  dialpad:{width:"84%",alignSelf:"center",flexDirection:"row",
    flexWrap:"wrap",justifyContent:"space-around",maxWidth:360},
  digitButton:{width:"29%",aspectRatio:1.12,marginBottom:12,
    borderRadius:100,backgroundColor:"rgba(110,112,135,0.4)",
    alignItems:"center",justifyContent:"center"},
  digit:{fontSize:34,color:"#FFF",fontWeight:"400",lineHeight:40},
  digitLetters:{fontSize:9,letterSpacing:2,color:"#D9D9E0",height:14},
  overlayEnd:{alignItems:"center",marginTop:"auto",marginBottom:10},
  smallHangup:{backgroundColor:"#F43835",width:65,height:65,borderRadius:36,
    alignItems:"center",justifyContent:"center"},
  chatSubheader:{alignSelf:"center",flexDirection:"row",alignItems:"center",
    gap:8,marginTop:10,marginBottom:8},
  liveDot:{width:8,height:8,borderRadius:4,backgroundColor:"#39D5A0"},
  liveLabel:{fontSize:13,color:"#D2D0E1",fontWeight:"500"},
  chatScroll:{flex:1,width:"100%"},
  chatContent:{paddingHorizontal:18,paddingTop:26,paddingBottom:28,flexGrow:1},
  emptyTranscript:{flex:1,alignItems:"center",justifyContent:"center",gap:13},
  waitingText:{color:"#EEEFF5",fontSize:16,textAlign:"center"},
  chatInfo:{fontSize:12,color:"#D6BECA",marginVertical:10,textAlign:"center"},
  messageBlock:{maxWidth:"85%",marginBottom:17},
  messageOwn:{alignSelf:"flex-end",alignItems:"flex-end"},
  messageCustomer:{alignSelf:"flex-start",alignItems:"flex-start"},
  messageSpeaker:{fontSize:11,color:"#BABACB",marginBottom:6,marginHorizontal:8},
  bubble:{borderRadius:19,paddingVertical:12,paddingHorizontal:15},
  bubbleOwn:{backgroundColor:"rgba(107,89,213,0.90)",borderBottomRightRadius:5},
  bubbleCustomer:{backgroundColor:"rgba(74,77,100,0.92)",borderBottomLeftRadius:5},
  bubbleFailed:{backgroundColor:"rgba(100,68,77,0.90)"},
  messageText:{color:"#FFF",fontSize:15,lineHeight:22},
  chatFooter:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
    paddingHorizontal:22,paddingTop:12,paddingBottom:8,borderTopWidth:1,
    borderTopColor:"rgba(255,255,255,0.12)"},
  chatFooterText:{fontSize:11,color:"#C4C3D3",maxWidth:"75%"},
  chatEnd:{backgroundColor:"#F43835",height:50,width:50,borderRadius:26,
    justifyContent:"center",alignItems:"center"}
});
