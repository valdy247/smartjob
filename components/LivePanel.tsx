"use client";
import { useCallback,useEffect,useRef,useState,type FormEvent } from "react";
import { AudioLines,ArrowDownUp,Check,ChevronDown,ClipboardList,Headphones,Languages,MessageSquareText,Mic,MicOff,Pause,Play,RotateCcw,Send,ShieldCheck,Sparkles,Volume2,AlertTriangle,Trash2,Square,Save } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile,JobContext,Actor,AiTurn } from "@/lib/types";

const langs:Record<string,string>={es:"🇪🇸 Español",en:"🇺🇸 English",pt:"🇧🇷 Português",fr:"🇫🇷 Français",it:"🇮🇹 Italiano",de:"🇩🇪 Deutsch"};
const contextBlank:JobContext={job_type:"",city:"",state:"",zip:"",client_name:"",dimensions:"",materials:"",details:""};
type ApiAnswer={mode:"relay"|"advice"|"interpret";say:string;language:string;note?:string;warning?:string;blocked?:boolean;error?:string};
async function authedFetch(supabase:SupabaseClient,url:string,options:RequestInit={}):Promise<Response>{
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  return fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+token}});
}
export function LivePanel({profile,supabase,apiStatus}:{profile:Profile,supabase:SupabaseClient,apiStatus:Record<string,boolean>}){
  const [context,setContext]=useState<JobContext>({...contextBlank,city:profile.city,state:profile.state});
  const [contextSaved,setContextSaved]=useState(""),[contextOpen,setContextOpen]=useState(false);
  const [ownerLang,setOwnerLang]=useState(profile.owner_language||"es"),[customerLang,setCustomerLang]=useState(profile.customer_language||"en");
  const [speaker,setSpeaker]=useState<Actor>("owner"),[text,setText]=useState("");
  const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(""),[error,setError]=useState("");
  const [recording,setRecording]=useState<Actor|null>(null),[playing,setPlaying]=useState<string|null>(null);
  const [turns,setTurns]=useState<AiTurn[]>([]);
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]);
  const audio=useRef<HTMLAudioElement|null>(null);
  const busyRef=useRef(false);
  useEffect(()=>{let on=true;
    supabase.from("smartjob_contexts").select("*").eq("user_id",profile.id).maybeSingle().then(({data})=>{if(on&&data)setContext({job_type:data.job_type||"",city:data.city||"",state:data.state||"",zip:data.zip||"",client_name:data.client_name||"",dimensions:data.dimensions||"",materials:data.materials||"",details:data.details||""});});
    return()=>{on=false;};
  },[supabase,profile.id]);
  useEffect(()=>()=>{stream.current?.getTracks().forEach(x=>x.stop());audio.current?.pause();window.speechSynthesis?.cancel();},[]);
  const saveContext=async()=>{setContextSaved("");
    const {error}=await supabase.from("smartjob_contexts").upsert({...context,user_id:profile.id,updated_at:new Date().toISOString()});
    setContextSaved(error?error.message:"Contexto profesional guardado.");};
  const play=useCallback(async(line:AiTurn,manual=false)=>{
    if(line.blocked&&!manual)return;
    if(!accepted){setError("Primero acepta el aviso de privacidad y tratamiento del audio.");return;}
    setPlaying(line.id);
    try{
      if(apiStatus.speech&&apiStatus.voices){
        const r=await authedFetch(supabase,"/api/voice/speak",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:line.output,language:line.language})});
        if(!r.ok)throw new Error((await r.json()).error||"No se pudo generar la voz.");
        const blob=await r.blob(),url=URL.createObjectURL(blob);
        audio.current?.pause();const a=new Audio(url);audio.current=a;
        await new Promise<void>((resolve,reject)=>{a.onended=()=>resolve();a.onerror=()=>reject(new Error("No se pudo reproducir el audio."));a.play().catch(reject);});
        URL.revokeObjectURL(url);
      }else if("speechSynthesis" in window){
        window.speechSynthesis.cancel();
        const utter=new SpeechSynthesisUtterance(line.output);utter.lang=line.language;utter.rate=0.94;utter.pitch=1;
        await new Promise<void>((resolve,reject)=>{utter.onend=()=>resolve();utter.onerror=()=>reject(new Error("Error en la voz del navegador."));window.speechSynthesis.speak(utter);});
      }else throw new Error("No hay sintetizador de voz configurado.");
    }catch(e){setError(e instanceof Error?e.message:"No se pudo reproducir la voz.");}
    finally{setPlaying(null);}
  },[supabase,apiStatus.speech,apiStatus.voices,accepted]);
  const processText=async(input:string,from:Actor)=>{
    if(!accepted){setError("Acepta primero el envío de voz/texto a los proveedores de IA.");return;}
    if(!input.trim())return;
    if(busyRef.current)return;
    busyRef.current=true;setBusy("Pensando y traduciendo…");setError("");
    try{
      const r=await authedFetch(supabase,"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        text:input.trim(),actor:from,assistantName:profile.assistant_name,context,
        ownerLanguage:ownerLang,customerLanguage:customerLang,history:turns.slice(-6)
      })});
      const data:ApiAnswer=await r.json();
      if(!r.ok)throw new Error(data.error||"No fue posible traducir la frase.");
      const item:AiTurn={id:crypto.randomUUID(),actor:from,source:input.trim(),output:data.say,mode:data.mode,
        language:data.language,warning:data.warning||undefined,blocked:Boolean(data.blocked),timestamp:Date.now()};
      setTurns(prev=>[...prev.slice(-11),item]);
      setBusy("");
      if(!item.blocked)await play(item);
      else setError("Se requiere confirmación humana antes de reproducir esta traducción.");
    }catch(err){setError(err instanceof Error?err.message:"No se pudo procesar el mensaje.");}
    finally{busyRef.current=false;setBusy("");}
  };
  const startOrStop=async(from:Actor)=>{
    if(busyRef.current)return;
    if(recording){
      if(recorder.current?.state==="recording")recorder.current.stop();
      return;
    }
    if(!accepted){setError("Marca la casilla de consentimiento antes de activar el micrófono.");return;}
    if(!apiStatus.speech){setError("Falta conectar ElevenLabs en Vercel para transcribir el micrófono. Puedes probar el modo texto si OpenAI está configurado.");return;}
    try{
      setError("");
      const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      stream.current=s;const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(m=>MediaRecorder.isTypeSupported(m));
      const rec=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
      recorder.current=rec;chunks.current=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      rec.onstop=async()=>{
        setRecording(null);s.getTracks().forEach(x=>x.stop());stream.current=null;
        busyRef.current=true;setBusy("Escuchando tu mensaje…");
        try{
          const b=new Blob(chunks.current,{type:rec.mimeType||"audio/webm"});
          if(b.size<200)throw new Error("El audio fue demasiado corto.");
          const form=new FormData();form.append("audio",b,"speech.webm");
          const r=await authedFetch(supabase,"/api/voice/transcribe",{method:"POST",body:form});
          const v=await r.json();if(!r.ok)throw new Error(v.error||"No se entendió el audio.");
          if(!v.text?.trim())throw new Error("No se detectó voz. Acércate al micrófono.");
          busyRef.current=false;setBusy("");
          await processText(String(v.text),from);
        }catch(err){setError(err instanceof Error?err.message:"Error procesando audio.");setBusy("");}
        finally{busyRef.current=false;}
      };
      rec.start();setRecording(from);
    }catch(err){setError(err instanceof Error?err.message:"No se pudo usar el micrófono.");}
  };
  const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;const input=text;setText("");void processText(input,speaker);};
  const clear=()=>{audio.current?.pause();window.speechSynthesis?.cancel();setTurns([]);setError("");};
  return <section className="vmv-translation-workspace" aria-label="Intérprete cara a cara">
   <div className="vmv-compact-card vmv-translation-controls">
    <div className="vmv-translation-languages">
     <select className="field" aria-label="Tu idioma" value={ownerLang} onChange={e=>setOwnerLang(e.target.value)}>{Object.entries(langs).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select>
     <button type="button" aria-label="Intercambiar idiomas" className="vmv-swap" onClick={()=>{setOwnerLang(customerLang);setCustomerLang(ownerLang);}}><ArrowDownUp size={19}/></button>
     <select className="field" aria-label="Idioma del cliente" value={customerLang} onChange={e=>setCustomerLang(e.target.value)}>{Object.entries(langs).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select>
    </div>
    <div className="vmv-translation-speakers">
     <div className={"vmv-translation-speaker "+(recording==="owner"?"recording":"")}>
      <span className="vmv-speaker-label">Tú</span>
      <button type="button" className="vmv-translation-mic" disabled={Boolean(busy)||Boolean(recording&&recording!=="owner")} onClick={()=>void startOrStop("owner")} aria-label={recording==="owner"?"Detener grabación":"Hablar como profesional"}>{recording==="owner"?<Square size={27} fill="currentColor"/>:<Mic size={29}/>}</button>
      <span className="vmv-mic-hint">{recording==="owner"?"Detener":"Hablar"}</span>
     </div>
     <div className={"vmv-translation-speaker customer "+(recording==="customer"?"recording":"")}>
      <span className="vmv-speaker-label">Cliente</span>
      <button type="button" className="vmv-translation-mic" disabled={Boolean(busy)||Boolean(recording&&recording!=="customer")} onClick={()=>void startOrStop("customer")} aria-label={recording==="customer"?"Detener grabación":"Hablar como cliente"}>{recording==="customer"?<Square size={27} fill="currentColor"/>:<Mic size={29}/>}</button>
      <span className="vmv-mic-hint">{recording==="customer"?"Detener":"Hablar"}</span>
     </div>
    </div>
    <div className="vmv-translation-message">
     <div className="vmv-translation-switch" role="group" aria-label="Quién habla">
      <button type="button" className={speaker==="owner"?"selected":""} aria-pressed={speaker==="owner"} onClick={()=>setSpeaker("owner")}>Tú</button>
      <button type="button" className={speaker==="customer"?"selected":""} aria-pressed={speaker==="customer"} onClick={()=>setSpeaker("customer")}>Cliente</button>
     </div>
     <form onSubmit={submit} className="vmv-translation-input"><input className="field" aria-label="Mensaje a traducir" value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe un mensaje…" maxLength={2400}/><button className="vmv-send" type="submit" disabled={Boolean(busy)||!text.trim()} aria-label="Traducir mensaje"><Send size={19}/></button></form>
    </div>
    <label className="vmv-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Acepto procesar audio y texto con IA e informar a la otra persona.</span></label>
    {busy&&<div role="status" className="vmv-translation-status"><AudioLines size={16}/> {busy}</div>}
    {error&&<p role="alert" className="notice danger vmv-inline-feedback">{error}</p>}
   </div>
   <div className="vmv-compact-card vmv-translation-history">
    <div className="vmv-between"><h2>Conversación</h2><button type="button" className="vmv-icon-button" aria-label="Borrar conversación" title="Borrar" disabled={!turns.length} onClick={clear}><Trash2 size={18}/></button></div>
    {!turns.length?<div className="vmv-empty-state"><MessageSquareText size={27}/><span>Empieza a hablar</span></div>:
     <div className="vmv-turns">{turns.slice().reverse().map(turn=><article key={turn.id} className={"vmv-turn "+(turn.actor==="customer"?"customer":"")}>
      <div className="vmv-between"><span className="vmv-turn-label">{turn.actor==="owner"?"Tú":"Cliente"} · {turn.mode==="advice"?"Privado":"Traducción"}</span><button type="button" className="vmv-replay" aria-label="Escuchar traducción" disabled={Boolean(playing)} onClick={()=>void play(turn,true)}><Volume2 size={17}/></button></div>
      <p className="vmv-original">{turn.source}</p><p className="vmv-output">{turn.output}</p>
      {turn.warning&&<p className="vmv-warning">{turn.warning}</p>}
      {turn.blocked&&<p className="vmv-warning">Revisa antes de reproducir.</p>}
     </article>)}</div>}
   </div>
   <details className="vmv-compact-card vmv-context-details">
    <summary><ClipboardList size={18}/> Contexto profesional <ChevronDown size={17}/></summary>
    <div className="vmv-context-fields">
     <div><label className="label">Trabajo</label><input className="field" value={context.job_type} onChange={e=>setContext({...context,job_type:e.target.value})} placeholder="Tipo de trabajo"/></div>
     <div className="form-grid"><div><label className="label">Ciudad</label><input className="field" value={context.city} onChange={e=>setContext({...context,city:e.target.value})}/></div><div><label className="label">Estado</label><input className="field" value={context.state} onChange={e=>setContext({...context,state:e.target.value})}/></div></div>
     <div className="form-grid"><div><label className="label">ZIP</label><input className="field" value={context.zip} onChange={e=>setContext({...context,zip:e.target.value})}/></div><div><label className="label">Cliente</label><input className="field" value={context.client_name} onChange={e=>setContext({...context,client_name:e.target.value})}/></div></div>
     <div className="form-grid"><div><label className="label">Medidas</label><input className="field" value={context.dimensions} onChange={e=>setContext({...context,dimensions:e.target.value})}/></div><div><label className="label">Materiales</label><input className="field" value={context.materials} onChange={e=>setContext({...context,materials:e.target.value})}/></div></div>
     <div><label className="label">Detalles</label><textarea className="field" value={context.details} onChange={e=>setContext({...context,details:e.target.value})}/></div>
     <button type="button" className="btn primary block" onClick={()=>void saveContext()}><Save size={16}/> Guardar</button>
     {contextSaved&&<p role="status" className="vmv-muted">{contextSaved}</p>}
    </div>
   </details>
  </section>;
}
