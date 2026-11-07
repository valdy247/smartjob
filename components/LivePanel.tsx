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
  const [contextSaved,setContextSaved]=useState(""),[contextOpen,setContextOpen]=useState(true);
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
  return <div>
    <div className="hero">
      <div><p className="eyebrow">TU ALIADO EN CADA CONVERSACIÓN</p><h1>Traductor <em>Live.</em></h1><p className="muted">Habla con tu cliente o pregúntale a {profile.assistant_name} lo que necesitas.</p></div>
      <span className={"pill "+(apiStatus.ai?"":"warning")}><span className="dot"/>{apiStatus.ai?"IA conectada":"IA por conectar"}</span>
    </div>
    <div className="gridmain">
      <div>
        <section className="card">
          <div className="card-head"><h2 className="inline-icon"><Languages size={20} color="var(--lime)"/> Conversación en vivo</h2><span className="pill off">Por turnos</span></div>
          <div className="language-row">
            <div><label className="label">Tu idioma</label><select className="field" aria-label="Idioma del profesional" value={ownerLang} onChange={e=>setOwnerLang(e.target.value)}>{Object.entries(langs).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></div>
            <button className="swap" type="button" aria-label="Intercambiar idiomas" onClick={()=>{setOwnerLang(customerLang);setCustomerLang(ownerLang);}}><ArrowDownUp size={18}/></button>
            <div><label className="label">Idioma del cliente</label><select className="field" aria-label="Idioma del cliente" value={customerLang} onChange={e=>setCustomerLang(e.target.value)}>{Object.entries(langs).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></div>
          </div>
          <div className="live-sides">
            <div className={"talkbox "+(recording==="owner"?"recording":"")}>
              <div className="pill">TÚ · PROFESIONAL</div>
              <button type="button" disabled={Boolean(busy)||Boolean(recording&&recording!=="owner")} className="circle" onClick={()=>void startOrStop("owner")} aria-label={recording==="owner"?"Detener grabación":"Hablar como profesional"}>{recording==="owner"?<Square size={30} fill="currentColor"/>:<Mic size={34}/>}</button>
              <strong>{recording==="owner"?"Grabando… toca para terminar":"Toca para hablar"}</strong>
              {recording==="owner"?<div className="wave"><span/><span/><span/><span/><span/></div>:<span className="tiny muted">Dile a {profile.assistant_name} qué necesitas</span>}
            </div>
            <div className={"talkbox customer "+(recording==="customer"?"recording":"")}>
              <div className="pill" style={{background:"#49352d",borderColor:"#715143",color:"#ffc6ac"}}>CLIENTE</div>
              <button type="button" disabled={Boolean(busy)||Boolean(recording&&recording!=="customer")} className="circle" onClick={()=>void startOrStop("customer")} aria-label={recording==="customer"?"Detener grabación":"Hablar como cliente"}>{recording==="customer"?<Square size={30} fill="currentColor"/>:<Mic size={34}/>}</button>
              <strong>{recording==="customer"?"Grabando… toca para terminar":"Que hable el cliente"}</strong>
              {recording==="customer"?<div className="wave"><span/><span/><span/><span/><span/></div>:<span className="tiny muted">Se traduce a tu idioma</span>}
            </div>
          </div>
          {busy&&<div className="notice info" style={{marginTop:14}}><AudioLines size={16} style={{verticalAlign:"middle",marginRight:8}}/>{busy}</div>}
          <div className="divider"/>
          <div className="row between" style={{marginBottom:12}}><span className="label" style={{margin:0}}>O prueba escribiendo</span><span className="tiny muted">Usa IA real, no una demo</span></div>
          <div className="tabs-sub" style={{marginBottom:11}}><button type="button" className={speaker==="owner"?"on":""} onClick={()=>setSpeaker("owner")}>Yo hablo</button><button type="button" className={speaker==="customer"?"on":""} onClick={()=>setSpeaker("customer")}>Cliente habla</button></div>
          <form className="text-entry" onSubmit={submit}><input className="field" aria-label="Mensaje a traducir" value={text} onChange={e=>setText(e.target.value)} placeholder={speaker==="owner"?profile.assistant_name+", dile al cliente…":"My name is Nathan…"} maxLength={2400}/><button type="submit" className="btn primary" disabled={Boolean(busy)||!text.trim()} aria-label="Enviar mensaje"><Send size={18}/></button></form>
          <div className="quick-row">
            <button type="button" onClick={()=>{setSpeaker("owner");setText(profile.assistant_name+", dile al cliente que puedo instalar esta puerta por $150 más materiales.");}}>Explicar un precio</button>
            <button type="button" onClick={()=>{setSpeaker("owner");setText(profile.assistant_name+", ¿cuánto me recomiendas cobrar por instalar esta puerta? Usa la ubicación y medidas del trabajo.");}}>Pedir asesoría</button>
            <button type="button" onClick={()=>{setSpeaker("owner");setText(profile.assistant_name+", pregúntale al cliente cómo se llama.");}}>Pedir el nombre</button>
          </div>
          <div className="divider"/>
          <label className="checkbox-label"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Confirmo que puedo compartir esta conversación con los proveedores de reconocimiento de voz y de IA. Avisaré a la otra persona antes de grabar. Las frases se mantienen solo durante esta sesión de navegador y no se guardan en Smart Job.</span></label>
          {error&&<div role="alert" className="notice danger" style={{marginTop:14}}><AlertTriangle size={15} style={{verticalAlign:"middle",marginRight:7}}/>{error}</div>}
        </section>
        <section className="card">
          <div className="card-head"><h2 className="inline-icon"><MessageSquareText size={20} color="var(--lime)"/> Conversación</h2><button className="btn smol ghost" onClick={clear} type="button" disabled={!turns.length}><Trash2 size={14}/>Limpiar</button></div>
          {!turns.length?<div className="empty"><div className="orb" style={{height:76,width:76}}><AudioLines size={28}/></div><strong>Todo empieza con una conversación</strong><span className="small">Toca un micrófono o escribe un mensaje para comenzar.</span><span className="tiny">El asistente no enviará consejos privados al cliente.</span></div>:
            <div className="history">{turns.slice().reverse().map(turn=><article key={turn.id} className={"turn "+(turn.actor==="customer"?"customer":"")}>
              <div className="turnhead"><span>{turn.actor==="owner"?"Tú":"Cliente"} · {new Date(turn.timestamp).toLocaleTimeString("es-US",{hour:"2-digit",minute:"2-digit"})}</span><span className={"chip "+turn.mode}>{turn.mode==="advice"?"Consejo privado":turn.mode==="relay"?"Para el cliente":"Interpretación"}</span></div>
              <div className="original">{turn.source}</div><div className="translated">{turn.output}</div>
              {turn.warning&&<div className="notice danger" style={{marginTop:14}}>{turn.warning}</div>}
              <div style={{marginTop:14}}><button type="button" className="btn ghost smol" disabled={Boolean(playing)} onClick={()=>void play(turn,true)}><Volume2 size={15}/>{turn.blocked?"Confirmé y quiero reproducir":playing===turn.id?"Reproduciendo…":"Escuchar de nuevo"}</button></div>
            </article>)}</div>}
        </section>
      </div>
      <aside>
        <div className="card">
          <div className="card-head"><h2 className="inline-icon"><Sparkles size={20} color="var(--lime)"/> {profile.assistant_name}</h2><span className="pill">Asistente IA</span></div>
          <div className="welcome-art"><div className="orb"><AudioLines size={42}/></div></div>
          <p className="muted small" style={{marginBottom:0}}>Te escucha, habla por ti y puede ayudarte con decisiones de trabajo. <strong style={{color:"var(--white)"}}>Tus preguntas privadas nunca se dicen en voz alta al cliente.</strong></p>
          <div className="divider"/><div className="helper"><Headphones size={16} color="var(--lime)" style={{flexShrink:0}}/>Usa el modo por turnos para evitar eco. La calidad y latencia reales dependen de la red y de las APIs.</div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="inline-icon"><ClipboardList size={20} color="var(--lime)"/> Contexto del trabajo</h2><button type="button" className="btn ghost smol" aria-label="Expandir contexto" onClick={()=>setContextOpen(!contextOpen)}><ChevronDown size={16}/></button></div>
          <p className="small muted">Dale a {profile.assistant_name} la ubicación y detalles para que te asesore con información relevante.</p>
          {contextOpen&&<div className="stack">
            <div><label className="label">Tipo de trabajo</label><input className="field" value={context.job_type} onChange={e=>setContext({...context,job_type:e.target.value})} placeholder="Instalar puerta interior"/></div>
            <div className="form-grid">
              <div><label className="label">Ciudad</label><input className="field" value={context.city} onChange={e=>setContext({...context,city:e.target.value})} placeholder="Columbus"/></div>
              <div><label className="label">Estado</label><input className="field" value={context.state} onChange={e=>setContext({...context,state:e.target.value})} placeholder="GA"/></div>
            </div>
            <div className="form-grid">
              <div><label className="label">Código ZIP</label><input className="field" value={context.zip} onChange={e=>setContext({...context,zip:e.target.value})} placeholder="31909"/></div>
              <div><label className="label">Cliente</label><input className="field" value={context.client_name} onChange={e=>setContext({...context,client_name:e.target.value})} placeholder="Nathan"/></div>
            </div>
            <div><label className="label">Medidas</label><input className="field" value={context.dimensions} onChange={e=>setContext({...context,dimensions:e.target.value})} placeholder="80 × 32 pulgadas"/></div>
            <div><label className="label">Materiales</label><input className="field" value={context.materials} onChange={e=>setContext({...context,materials:e.target.value})} placeholder="Puerta precolgada, madera…"/></div>
            <div><label className="label">Más detalles del trabajo</label><textarea className="field" value={context.details} onChange={e=>setContext({...context,details:e.target.value})} placeholder="Tipo de pared, estado del marco, retirada de puerta anterior…"/></div>
            {contextSaved&&<p role="status" className="small" style={{color:"var(--lime)",margin:0}}>{contextSaved}</p>}
            <button type="button" className="btn primary block" onClick={()=>void saveContext()}><Save size={16}/>Guardar contexto</button>
          </div>}
        </div>
        <div className="notice info" style={{marginTop:17}}><ShieldCheck size={17} style={{verticalAlign:"middle",marginRight:8}}/><strong>Información profesional:</strong> las estimaciones son orientativas, no presupuestos verificados. Verifica medidas, materiales, permisos y riesgos antes de comprometerte.</div>
      </aside>
    </div>
  </div>;
}
