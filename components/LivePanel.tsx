"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {ArrowLeft,ChevronRight,Keyboard,Languages,Mic,MessageSquareText,Send,Volume2,Trash2,AudioLines} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Profile,JobContext} from "@/lib/types";

type Mode="voice"|"text";
type Stage="choose"|"active";
type Language="es"|"en";
type Translation={id:string;original:string;translated:string;source:Language;target:Language;warning:string|null;blocked:boolean};
type TranslationResult={sourceLanguage?:Language;targetLanguage?:Language;translation?:string;warning?:string|null;blocked?:boolean;error?:string};
const emptyContext:JobContext={job_type:"",city:"",state:"",zip:"",client_name:"",dimensions:"",materials:"",details:""};
const flag=(lang:Language)=>lang==="es"?"🇪🇸":"🇺🇸";
const langLabel=(lang:Language)=>lang==="es"?"Español":"English";
const isSupported=(lang:string):lang is Language=>lang==="es"||lang==="en";
const textSize=(count:number)=>count<65?24:count<135?20:count<250?17:count<450?15:13;
const detectionWords:Record<Language,string[]>={
 es:["hola","gracias","buenos","buenas","quiero","para","porque","necesito","hablar","usted","puede","cuanto","cuánto","trabajo","mañana","mañana","nosotros","tengo","estamos","sobre","precio","necesita","quisiera","hacer","puedes","estoy","esto","esta","que","qué","con","una","uno","del","los","las","por","hay","tiene","ser","el","la","mi","yo"],
 en:["hello","thanks","please","good","morning","need","want","about","with","have","would","can","could","work","tomorrow","price","estimate","project","customer","meeting","where","this","that","your","you","are","how","much","when","why","the","and","for","we","our","my","they","from","it","is"]
};
function typingLanguage(text:string):Language|null{
 const tokens=(text.toLocaleLowerCase().normalize("NFC").match(/[\p{L}]+/gu)||[]);
 if(tokens.length<3)return null;
 const counts={es:0,en:0};
 for(const w of tokens){
  if(detectionWords.es.includes(w))counts.es++;
  if(detectionWords.en.includes(w))counts.en++;
  if(/[áéíóúñ¿¡]/.test(w))counts.es+=2;
 }
 if(Math.abs(counts.es-counts.en)<1||Math.max(counts.es,counts.en)<2)return null;
 return counts.es>counts.en?"es":"en";
}
async function api(supabase:SupabaseClient,url:string,options:RequestInit={}){
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw Error("Tu sesión expiró. Inicia sesión.");
 const headers=new Headers(options.headers);
 headers.set("Authorization","Bearer "+data.session.access_token);
 return fetch(url,{...options,headers});
}
export function LivePanel({supabase,apiStatus}:{profile:Profile;supabase:SupabaseClient;apiStatus:Record<string,boolean>}){
 const [mode,setMode]=useState<Mode>("voice"),[stage,setStage]=useState<Stage>("choose");
 const [accepted,setAccepted]=useState(false);
 const [draft,setDraft]=useState("");
 const context=emptyContext;
 const [turns,setTurns]=useState<Translation[]>([]);
 const [recording,setRecording]=useState(false),[processing,setProcessing]=useState(false),[error,setError]=useState("");
 const [speaking,setSpeaking]=useState(false);
 const audioRef=useRef<HTMLAudioElement|null>(null),recorderRef=useRef<MediaRecorder|null>(null);
 const streamRef=useRef<MediaStream|null>(null),chunksRef=useRef<Blob[]>([]);
 const pressedRef=useRef(false),busyRef=useRef(false),sessionRef=useRef(0);
 const latest=turns.length?turns[turns.length-1]:null;
 const predicted=useMemo(()=>typingLanguage(draft),[draft]);
 useEffect(()=>()=>{sessionRef.current++;streamRef.current?.getTracks().forEach(t=>t.stop());
  if(recorderRef.current?.state==="recording")recorderRef.current.stop();
  audioRef.current?.pause();window.speechSynthesis?.cancel();
 },[]);
 const say=useCallback(async(text:string,language:Language)=>{
  if(!text.trim())return;
  audioRef.current?.pause();window.speechSynthesis?.cancel();
  setSpeaking(true);
  try{
   if(apiStatus.voices&&apiStatus.speech){
    try{
     const r=await api(supabase,"/api/voice/speak",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,language})
     });
     if(r.ok){
      const blob=await r.blob(),url=URL.createObjectURL(blob);
      try{
       const audio=new Audio(url);audioRef.current=audio;
       await new Promise<void>((resolve,reject)=>{
        audio.onended=()=>resolve();audio.onerror=()=>reject(Error("Audio unavailable"));
        audio.play().catch(reject);
       });
      }finally{URL.revokeObjectURL(url);}
      return;
     }
    }catch{/* Browser speech is the fallback if remote voice is unavailable. */}
   }
   if("speechSynthesis" in window){
    await new Promise<void>(resolve=>{
     const u=new SpeechSynthesisUtterance(text);
     u.lang=language==="es"?"es-ES":"en-US";u.rate=.94;u.pitch=1;
     u.onend=()=>resolve();u.onerror=()=>resolve();
     window.speechSynthesis.speak(u);
    });
   }
  }finally{setSpeaking(false);}
 },[apiStatus.voices,apiStatus.speech,supabase]);
 const stopSpeech=()=>{audioRef.current?.pause();window.speechSynthesis?.cancel();setSpeaking(false);};
 const start=(selected:Mode)=>{
  stopSpeech();setError("");setMode(selected);setStage("active");
  setDraft("");setTurns([]);setAccepted(false);sessionRef.current++;
 };
 const translate=async(input:string)=>{
  if(!input.trim()||busyRef.current)return;
  if(!accepted){setError("Pide permiso a la otra persona y acepta el tratamiento de audio y texto.");return;}
  busyRef.current=true;setProcessing(true);setError("");
  const snapshot=sessionRef.current;
  try{
   const r=await api(supabase,"/api/interpreter",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"translate",text:input.trim(),context})
   });
   const result:TranslationResult=await r.json();
   if(!r.ok)throw Error(result.error||"No se pudo traducir.");
   if(snapshot!==sessionRef.current)return;
   if(!isSupported(result.sourceLanguage||"")||!isSupported(result.targetLanguage||"")||!result.translation)
    throw Error("No se detectó el idioma. Prueba otra frase.");
   const item:Translation={
    id:crypto.randomUUID(),original:input.trim(),translated:result.translation,
    source:result.sourceLanguage as Language,target:result.targetLanguage as Language,
    blocked:Boolean(result.blocked),warning:result.warning||null
   };
   setTurns(prev=>[...prev.slice(-9),item]);
   setDraft("");
   if(!item.blocked&&mode==="voice")void say(item.translated,item.target);
   if(item.blocked)setError("Revisa los números antes de reproducir esta traducción.");
  }catch(e){setError(e instanceof Error?e.message:"Error de traducción.");}
  finally{busyRef.current=false;setProcessing(false);}
 };
 const endRecording=()=>{
  pressedRef.current=false;
  if(recorderRef.current?.state==="recording")recorderRef.current.stop();
 };
 const beginRecording=async()=>{
  if(busyRef.current||recording)return;
  if(!accepted){setError("Primero confirma que ambos conocen el uso del micrófono.");return;}
  if(!apiStatus.speech){setError("La transcripción por voz no está disponible. Usa Escribir.");return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
   setError("Este navegador no admite grabación de audio.");return;
  }
  stopSpeech();setError("");pressedRef.current=true;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   if(!pressedRef.current){stream.getTracks().forEach(t=>t.stop());return;}
   streamRef.current=stream;
   const preferred=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
   recorderRef.current=rec;chunksRef.current=[];
   const snapshot=sessionRef.current;
   rec.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
   rec.onstop=async()=>{
    setRecording(false);stream.getTracks().forEach(t=>t.stop());streamRef.current=null;
    recorderRef.current=null;
    if(snapshot!==sessionRef.current)return;
    const blob=new Blob(chunksRef.current,{type:rec.mimeType||"audio/webm"});
    if(blob.size<200){setError("Habla un poco más cerca del micrófono.");return;}
    busyRef.current=true;setProcessing(true);
    try{
     const form=new FormData();const ext=blob.type.includes("mp4")?"m4a":"webm";
     form.append("audio",blob,"conversation."+ext);
     const r=await api(supabase,"/api/voice/transcribe",{method:"POST",body:form});
     const data=await r.json();
     if(!r.ok)throw Error(data.error||"No se pudo entender el audio.");
     const transcript=String(data.text||"").trim();
     if(!transcript)throw Error("No se detectó voz. Vuelve a intentarlo.");
     busyRef.current=false;setProcessing(false);
     await translate(transcript);
    }catch(e){setError(e instanceof Error?e.message:"No se pudo transcribir.");}
    finally{busyRef.current=false;setProcessing(false);}
   };
   rec.onerror=()=>{setError("No se pudo grabar el audio.");endRecording();};
   rec.start();setRecording(true);
  }catch(e){pressedRef.current=false;setRecording(false);setError(e instanceof Error?e.message:"No se pudo abrir el micrófono.");}
 };
 const onPointerDown=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  if(event.pointerType==="mouse"&&event.button!==0)return;
  if(!accepted){setError("Acepta el consentimiento antes de hablar.");return;}
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);void beginRecording();
 };
 const onPointerUp=()=>endRecording();
 const onKeyDown=(event:ReactKeyboardEvent<HTMLButtonElement>)=>{
  if((event.key==="Enter"||event.key===" ")&&!event.repeat){event.preventDefault();void beginRecording();}
 };
 const onKeyUp=(event:ReactKeyboardEvent<HTMLButtonElement>)=>{
  if(event.key==="Enter"||event.key===" "){event.preventDefault();endRecording();}
 };
 const exit=()=>{
  endRecording();stopSpeech();sessionRef.current++;setStage("choose");setError("");
  setRecording(false);setProcessing(false);busyRef.current=false;
 };
 const sendText=(event:FormEvent)=>{
  event.preventDefault();
  void translate(draft);
 };
 const holdButton=()=><button type="button" className={"vmv-one-mic "+(recording?"is-recording":"")}
   disabled={processing} aria-label={recording?"Suelta para traducir":"Mantén pulsado para hablar"}
   onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
   onLostPointerCapture={onPointerUp} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
   <span className="vmv-mic-flags" aria-hidden="true"><span>🇺🇸</span><span>🇪🇸</span></span>
   <Mic size={32} aria-hidden="true"/>
   <small>{recording?"Escuchando…":"Mantén pulsado"}</small>
  </button>;
 const consent=<label className="vmv-interpreter-consent">
  <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>
  <span>Ambos sabemos que se procesará audio o texto con IA.</span>
 </label>;
 if(stage==="choose")return <section className="vmv-interpreter-choice vmv-translator-v4" aria-label="Traductor en persona">
  <div className="vmv-translator-banner">
   <div className="vmv-translator-banner-copy">
    <span className="vmv-translator-banner-eyebrow">VMV BUSINESS / TRADUCTOR</span>
    <h2>Dos idiomas.<br/><em>Una conversación.</em></h2>
    <span className="vmv-translator-language-pill"><span>🇪🇸 Español</span><span aria-hidden="true">⇄</span><span>🇺🇸 English</span></span>
   </div>
   <div className="vmv-translator-banner-art" aria-hidden="true">
    <span className="vmv-translator-orbit vmv-translator-orbit-one"></span>
    <span className="vmv-translator-orbit vmv-translator-orbit-two"></span>
    <span className="vmv-translator-bubble vmv-translator-bubble-one"><Languages size={35}/></span>
    <span className="vmv-translator-bubble vmv-translator-bubble-two"><AudioLines size={28}/></span>
    <span className="vmv-translator-spark">✦</span>
   </div>
  </div>
  <div className="vmv-translator-mode-header"><h3>Elige cómo conversar<span>.</span></h3></div>
  <div className="vmv-interpreter-methods">
   <button type="button" className="vmv-voice-choice" onClick={()=>start("voice")} aria-label="Comenzar conversación hablada">
    <span className="vmv-method-icon"><Mic size={29}/></span>
    <span className="vmv-method-title"><strong>Hablar</strong><small>Voz en tiempo real</small></span>
    <span className="vmv-method-arrow" aria-hidden="true"><ChevronRight size={20}/></span>
   </button>
   <button type="button" className="vmv-text-choice" onClick={()=>start("text")} aria-label="Comenzar conversación escrita">
    <span className="vmv-method-icon"><Keyboard size={29}/></span>
    <span className="vmv-method-title"><strong>Escribir</strong><small>Mensajes traducidos</small></span>
    <span className="vmv-method-arrow" aria-hidden="true"><ChevronRight size={20}/></span>
   </button>
  </div>
 </section>;

 return <section className={"vmv-interpreter-stage "+(mode==="voice"?"is-voice":"is-text")} aria-label="Conversación en persona">
  <div className="vmv-interpreter-screen">
   <header className="vmv-interpreter-header">
    <button type="button" className="vmv-interpreter-close" onClick={exit} aria-label="Salir del traductor"><ArrowLeft size={22}/></button>
    <div><strong>{mode==="voice"?"Conversación hablada":"Conversación escrita"}</strong>
     <small>🇪🇸 Español <span>⇄</span> 🇺🇸 English</small></div>
    <button type="button" className="vmv-interpreter-close" onClick={()=>{setTurns([]);setError("");}} aria-label="Borrar conversación"><Trash2 size={19}/></button>
   </header>

   {mode==="voice"?<div className="vmv-voice-experience">
    <div className="vmv-voice-transcript" role="log" aria-label="Conversación traducida" aria-live="polite">
     {latest?<article className="vmv-transcript-current">
       <span className="vmv-transcript-badge">{flag(latest.source)} {langLabel(latest.source)}</span>
       <p style={{fontSize:textSize(latest.original.length)}}>{latest.original}</p>
       <span className="vmv-transcript-separator">⇣</span>
       <span className="vmv-transcript-badge">{flag(latest.target)} {langLabel(latest.target)}</span>
       <p className="vmv-transcript-translated" style={{fontSize:textSize(latest.translated.length)}}>{latest.translated}</p>
       {latest.warning&&<small className="vmv-transcript-warning">{latest.warning}</small>}
       <button type="button" className="vmv-interpreter-listen" onClick={()=>void say(latest.translated,latest.target)}
        disabled={speaking||latest.blocked}><Volume2 size={16}/> Repetir</button>
      </article>:<div className="vmv-transcript-empty"><MessageSquareText size={24}/><p>Tu conversación aparecerá aquí</p></div>}
    </div>
    <div className="vmv-one-mic-zone">{holdButton()}
     <p className="vmv-mic-instruction">{processing?"Traduciendo…":recording?"Suelta para traducir y escuchar":"Mantén pulsado mientras hablas"}</p>
    </div>
    {consent}
   </div>:<div className="vmv-text-experience">
    <div className="vmv-text-conversation" role="log" aria-live="polite">
     {turns.length?turns.map(turn=><article key={turn.id} className="vmv-text-turn">
      <span>{flag(turn.source)} {langLabel(turn.source)}</span><p>{turn.original}</p>
      <span>{flag(turn.target)} {langLabel(turn.target)}</span><strong>{turn.translated}</strong>
      {turn.warning&&<small>{turn.warning}</small>}
      <button type="button" onClick={()=>void say(turn.translated,turn.target)} disabled={turn.blocked||speaking}><Volume2 size={16}/> Escuchar</button>
     </article>):<div className="vmv-text-empty"><MessageSquareText size={27}/><span>Escribe para comenzar</span></div>}
    </div>
    <div className="vmv-text-composer">
     {predicted&&<div className="vmv-language-detected" role="status"><span>{flag(predicted)}</span>{langLabel(predicted)} detectado</div>}
     <form onSubmit={sendText}><textarea rows={2} value={draft} onChange={e=>setDraft(e.target.value)}
      placeholder="Escribe en español o inglés…" maxLength={2400} aria-label="Mensaje que deseas traducir"/>
      <button type="submit" aria-label="Traducir" disabled={!draft.trim()||processing}><Send size={19}/></button></form>
     {consent}
    </div>
   </div>}
   {(processing||speaking)&&<div className="vmv-interpreter-progress" role="status">{processing?"La IA está procesando…":"Reproduciendo voz…"}</div>}
   {error&&<div role="alert" className="vmv-interpreter-error">{error}</div>}
  </div>
 </section>;
}
