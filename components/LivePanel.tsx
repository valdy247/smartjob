"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {ArrowLeft,Check,ChevronRight,Headphones,Keyboard,Languages,Mic,MicOff,MessageSquareText,Send,ShieldCheck,SkipForward,Volume2,X,RotateCcw,Trash2,AudioLines} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Profile,JobContext} from "@/lib/types";

type Mode="voice"|"text";
type Stage="choose"|"context"|"active";
type Language="es"|"en";
type Answer={question:string;answer:string};
type Translation={id:string;original:string;translated:string;source:Language;target:Language;warning:string|null;blocked:boolean};
type TranslationResult={sourceLanguage?:Language;targetLanguage?:Language;translation?:string;warning?:string|null;blocked?:boolean;error?:string};
type ContextResult={done?:boolean;question?:string;context?:{job_type?:string;client_name?:string;details?:string};error?:string};
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
export function LivePanel({profile,supabase,apiStatus}:{profile:Profile;supabase:SupabaseClient;apiStatus:Record<string,boolean>}){
 const ownerLanguage:Language=profile.owner_language==="en"?"en":"es";
 const [mode,setMode]=useState<Mode>("voice"),[stage,setStage]=useState<Stage>("choose");
 const [accepted,setAccepted]=useState(false),[question,setQuestion]=useState("");
 const [answers,setAnswers]=useState<Answer[]>([]),[interviewText,setInterviewText]=useState("");
 const [draft,setDraft]=useState(""),[context,setContext]=useState<JobContext>({...emptyContext,city:profile.city,state:profile.state});
 const [turns,setTurns]=useState<Translation[]>([]);
 const [recording,setRecording]=useState(false),[processing,setProcessing]=useState(false),[error,setError]=useState("");
 const [speaking,setSpeaking]=useState(false);
 const audioRef=useRef<HTMLAudioElement|null>(null),recorderRef=useRef<MediaRecorder|null>(null);
 const streamRef=useRef<MediaStream|null>(null),chunksRef=useRef<Blob[]>([]);
 const pressedRef=useRef(false),busyRef=useRef(false),sessionRef=useRef(0);
 const latest=turns.length?turns[turns.length-1]:null;
 const predicted=useMemo(()=>typingLanguage(draft),[draft]);
 const currentQuestion=question|| (ownerLanguage==="es"?
  "Hola, ¿con quién vas a conversar y de qué van a hablar?":
  "Hi! Who will you speak with, and what will you discuss?");
 useEffect(()=>{
  let mounted=true;
  supabase.from("smartjob_contexts").select("job_type,city,state,zip,client_name,dimensions,materials,details")
   .eq("user_id",profile.id).maybeSingle().then(({data})=>{
    if(mounted&&data)setContext({...emptyContext,city:profile.city,state:profile.state,...data});
   });
  return()=>{mounted=false;};
 },[profile.id,supabase,profile.city,profile.state]);
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
  stopSpeech();setError("");setMode(selected);setStage("context");setAnswers([]);setQuestion("");
  setInterviewText("");setDraft("");setTurns([]);setAccepted(false);sessionRef.current++;
  if(selected==="voice"){
   // The first greeting is directly connected to the user action.
   void say(ownerLanguage==="es"?
    "Hola, ¿con quién vas a conversar y de qué van a hablar?":
    "Hi! Who will you speak with, and what will you discuss?",ownerLanguage);
  }
 };
 const saveContext=async(next:JobContext)=>{
  try{
   const {error:e}=await supabase.from("smartjob_contexts")
    .upsert({...next,user_id:profile.id,updated_at:new Date().toISOString()});
   if(e)console.warn("VMV interpreter context not persisted",e.code);
  }catch{/* In-session context still works even if persistence fails. */}
 };
 const finishInterview=(final?:ContextResult["context"])=>{
  const merged={...context,job_type:final?.job_type||context.job_type,
   client_name:final?.client_name||context.client_name,
   details:final?.details||answers.map(x=>x.answer).join(" · ").slice(0,650)||context.details};
  setContext(merged);if(final||answers.length)void saveContext(merged);
  stopSpeech();setError("");setStage("active");
 };
 const ask=async(answer:string)=>{
  if(!answer.trim()||busyRef.current)return;
  if(!accepted){setError("Acepta el tratamiento de voz y texto antes de continuar.");return;}
  const next=[...answers,{question:currentQuestion,answer:answer.trim().slice(0,550)}];
  setAnswers(next);setInterviewText("");setProcessing(true);busyRef.current=true;setError("");
  const snapshot=sessionRef.current;
  try{
   const r=await api(supabase,"/api/interpreter",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"context",answers:next,ownerLanguage})
   });
   const data:ContextResult=await r.json();if(!r.ok)throw Error(data.error||"No se pudo preparar el contexto.");
   if(snapshot!==sessionRef.current)return;
   if(data.done||next.length>=3){
    const result=data.context||{details:next.map(x=>x.answer).join(" · ").slice(0,650)};
    const merged={...context,job_type:result.job_type||context.job_type,client_name:result.client_name||context.client_name,
     details:result.details||next.map(x=>x.answer).join(" · ").slice(0,650)};
    setContext(merged);void saveContext(merged);setStage("active");stopSpeech();
   }else{
    const followup=String(data.question||"").trim();
    if(!followup){setStage("active");return;}
    setQuestion(followup);
    if(mode==="voice")void say(followup,ownerLanguage);
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo preparar el contexto. Puedes omitirlo.");}
  finally{busyRef.current=false;setProcessing(false);}
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
    source:result.sourceLanguage,target:result.targetLanguage,
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
   const currentStage=stage;
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
     if(currentStage==="context")await ask(transcript);
     else await translate(transcript);
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
  if(stage==="context")void ask(interviewText);
  else void translate(draft);
 };
 const holdButton=(contextMode=false)=><button type="button" className={"vmv-one-mic "+(recording?"is-recording":"")}
   disabled={processing} aria-label={recording?"Suelta para traducir":"Mantén pulsado para hablar"}
   onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
   onLostPointerCapture={onPointerUp} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
   <span className="vmv-mic-flags" aria-hidden="true"><span>🇺🇸</span><span>🇪🇸</span></span>
   <Mic size={32} aria-hidden="true"/>
   <small>{recording?"Escuchando…":contextMode?"Responder":"Mantén pulsado"}</small>
  </button>;
 const consent=<label className="vmv-interpreter-consent">
  <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>
  <span>Ambos sabemos que se procesará audio o texto con IA.</span>
 </label>;
 if(stage==="choose")return <section className="vmv-interpreter-choice" aria-label="Traductor en persona">
  <h2>¿Cómo quieres conversar?</h2>
  <div className="vmv-interpreter-methods">
   <button type="button" onClick={()=>start("voice")}><span className="vmv-method-icon"><Mic size={32}/></span>
    <strong>Iniciar conversación hablada</strong><small>Habla, suelta y escucha la traducción.</small><ChevronRight size={20}/></button>
   <button type="button" onClick={()=>start("text")}><span className="vmv-method-icon"><Keyboard size={32}/></span>
    <strong>Escribir mensajes</strong><small>Detectamos el idioma automáticamente.</small><ChevronRight size={20}/></button>
  </div>
 </section>;

 return <section className={"vmv-interpreter-stage "+(mode==="voice"?"is-voice":"is-text")} aria-label="Conversación en persona">
  <div className="vmv-interpreter-screen">
   <header className="vmv-interpreter-header">
    <button type="button" className="vmv-interpreter-close" onClick={exit} aria-label="Salir del traductor"><ArrowLeft size={22}/></button>
    <div><strong>{stage==="context"?"Antes de comenzar":mode==="voice"?"Conversación hablada":"Conversación escrita"}</strong>
     <small>🇪🇸 Español <span>⇄</span> 🇺🇸 English</small></div>
    {stage==="active"&&<button type="button" className="vmv-interpreter-close" onClick={()=>{setTurns([]);setError("");}} aria-label="Borrar conversación"><Trash2 size={19}/></button>}
    {stage==="context"&&<button type="button" className="vmv-interpreter-skip" onClick={()=>finishInterview()}>Omitir <SkipForward size={16}/></button>}
   </header>

   {stage==="context"?<div className="vmv-interpreter-interview">
    <span className="vmv-interpreter-kicker">CONTEXTO · {Math.min(3,answers.length+1)} DE 3</span>
    <div className="vmv-interview-orb"><AudioLines size={25}/></div>
    <p className="vmv-interview-question">{currentQuestion}</p>
    <p className="vmv-interpreter-subtle">Solo preguntaré lo necesario para entender la situación.</p>
    {mode==="voice"&&<div className="vmv-interview-speech">
     <button type="button" className="vmv-interpreter-listen" onClick={()=>void say(currentQuestion,ownerLanguage)}>
      <Volume2 size={16}/> Escuchar pregunta</button>
     {holdButton(true)}
    </div>}
    {mode==="text"&&<form className="vmv-interview-form" onSubmit={sendText}>
      <textarea rows={3} value={interviewText} onChange={e=>setInterviewText(e.target.value)}
       placeholder="Cuéntame brevemente…" maxLength={550} aria-label="Tu respuesta"/>
      <button type="submit" disabled={processing||!interviewText.trim()}>Continuar <ArrowLeft size={17} style={{transform:"rotate(180deg)"}}/></button>
    </form>}
    {consent}
   </div>:mode==="voice"?<div className="vmv-voice-experience">
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
