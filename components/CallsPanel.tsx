"use client";
import {useEffect,useState,type FormEvent} from "react";
import {Check,PhoneCall,PhoneForwarded,ShieldAlert,Settings2,Clock3,ShieldCheck,Info} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Profile,CallSettings} from "@/lib/types";

type PhoneRoute={id:string;twilio_number:string;destination_phone:string;customer_language:string;owner_language:string;enabled:boolean;assistant_name:string};
type CallRecord={bridge_sid:string;status:string;duration_seconds:number|null;started_at:string};
type ProvisionRequest={id:string;status:string;created_at:string;destination_phone:string;carrier:string;connection_mode:string;answer_method:string};
const blank:CallSettings={existing_phone:"",forwarding_enabled:false,desired_language:"es",caller_language:"en",assistant_name:"Juan"};
const statusLabel:Record<string,string>={"initiated":"Iniciando","ringing":"Llamando","in-progress":"En curso","completed":"Finalizada","busy":"Ocupado","no-answer":"Sin respuesta","canceled":"Cancelada","failed":"Fallida"};
export function CallsPanel({supabase,profile,apiStatus}:{supabase:SupabaseClient;profile:Profile;apiStatus:Record<string,boolean>}){
  const [form,setForm]=useState<CallSettings>(blank);
  const [route,setRoute]=useState<PhoneRoute|null>(null),[history,setHistory]=useState<CallRecord[]>([]);
  const [request,setRequest]=useState<ProvisionRequest|null>(null),[requestBusy,setRequestBusy]=useState(false);
  const [carrier,setCarrier]=useState("other"),[connectionMode,setConnectionMode]=useState("conditional"),[answerMethod,setAnswerMethod]=useState("app");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState(""),[error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    async function load(){
      setLoading(true);
      const [settings,routing,calls,requests]=await Promise.all([
        supabase.from("smartjob_call_settings").select("*").eq("user_id",profile.id).maybeSingle(),
        supabase.from("smartjob_phone_routes").select("id,twilio_number,destination_phone,customer_language,owner_language,enabled,assistant_name").eq("user_id",profile.id).limit(1).maybeSingle(),
        supabase.from("smartjob_call_sessions").select("bridge_sid,status,duration_seconds,started_at").eq("owner_id",profile.id).order("started_at",{ascending:false}).limit(10),
        supabase.from("smartjob_provisioning_requests").select("id,status,created_at,destination_phone,carrier,connection_mode,answer_method").eq("user_id",profile.id).order("created_at",{ascending:false}).limit(1).maybeSingle()
      ]);
      if(!alive)return;
      setForm(settings.data?{...blank,...settings.data}:{...blank,existing_phone:profile.phone,desired_language:profile.owner_language,caller_language:profile.customer_language,assistant_name:profile.assistant_name});
      setRoute((routing.data as PhoneRoute|null)||null);
      setHistory((calls.data as CallRecord[]|null)||[]);
      setRequest((requests.data as ProvisionRequest|null)||null);
      if(requests.data){setCarrier(requests.data.carrier||"other");setConnectionMode(requests.data.connection_mode||"conditional");setAnswerMethod(requests.data.answer_method||"app");}
      if(settings.error||routing.error||calls.error||requests.error)setError("No se pudo cargar toda la información de telefonía. Verifica tu conexión.");
      setLoading(false);
    }
    void load();
    return()=>{alive=false;};
  },[supabase,profile.id,profile.phone,profile.owner_language,profile.customer_language,profile.assistant_name]);
  const save=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");setMessage("");
    if(form.desired_language===form.caller_language){setError("Elige dos idiomas diferentes.");setBusy(false);return;}
    const {error:saveError}=await supabase.from("smartjob_call_settings").upsert({
      user_id:profile.id,existing_phone:form.existing_phone.trim(),forwarding_enabled:false,
      desired_language:form.desired_language,caller_language:form.caller_language,
      assistant_name:form.assistant_name.trim(),updated_at:new Date().toISOString()
    });
    if(saveError)setError(saveError.message);
    else setMessage(route?.enabled?"Preferencias guardadas. Los cambios de la línea activa requieren verificación.":"Preferencias guardadas. Para recibir llamadas, primero debe asignarse un número verificado.");
    setBusy(false);
  };
  const submitRequest=async()=>{
    setError("");setMessage("");
    const destination=form.existing_phone.trim().replace(/[ ()-]/g,"");
    if(!/^\+[1-9]\d{7,14}$/.test(destination)){setError("Ingresa un teléfono válido con código de país, por ejemplo +17060000000.");return;}
    if(form.desired_language===form.caller_language){setError("Elige dos idiomas diferentes.");return;}
    const name=form.assistant_name.trim();
    if(!name||name.length>40){setError("El nombre del asistente debe tener entre 1 y 40 caracteres.");return;}
    setRequestBusy(true);
    const {data,error:requestError}=await supabase.from("smartjob_provisioning_requests").insert({
      user_id:profile.id,destination_phone:destination,
      customer_language:form.caller_language==="es"?"es-ES":"en-US",
      owner_language:form.desired_language==="es"?"es-ES":"en-US",
      assistant_name:name,carrier,connection_mode:connectionMode,answer_method:answerMethod
    }).select("id,status,created_at,destination_phone,carrier,connection_mode,answer_method").single();
    if(requestError)setError(requestError.code==="23505"?"Ya tienes una solicitud pendiente.":"No fue posible enviar la solicitud. Inténtalo de nuevo.");
    else{setRequest(data as ProvisionRequest);setMessage("Solicitud recibida. Conservas tu número y tu servicio actual; no hemos activado ningún desvío ni comprado una línea.");}
    setRequestBusy(false);
  };
  const active=Boolean(route?.enabled);
  return <div>
    <div className="hero"><div><h1>Llamadas <em>con IA.</em></h1><p className="muted">Tu teléfono en dos idiomas, sin instalar nada para tus clientes.</p></div></div>
    <div className="gridmain">
      <div>
        <div className="call-hero row" style={{marginBottom:19}}>
          <div className="brandmark" style={{height:56,width:56,borderRadius:17}}><PhoneCall size={25}/></div>
          <div className="flex1"><strong>Interpretación telefónica</strong><p className="small muted" style={{marginTop:4}}>{active?"Número asignado y autorizado":"Configuración de cuenta"}</p></div>
          <span className={"pill "+(active?"":"warning")}><span className="dot"/>{loading?"CARGANDO":active?"ACTIVA":"PENDIENTE"}</span>
        </div>
        {active&&route&&<div className="card" style={{marginBottom:18}}>
          <div className="card-head"><h2>Tu línea Smart Job</h2><ShieldCheck size={18} color="var(--lime)"/></div>
          <p className="small muted">Los clientes marcan este número; Smart Job llama a tu teléfono y traduce la conversación.</p>
          <p style={{fontSize:23,fontWeight:750,margin:"14px 0 6px"}}>{route.twilio_number}</p>
          <div className="row between small" style={{marginTop:12}}><span>Teléfono de destino</span><strong>{route.destination_phone}</strong></div>
          <div className="row between small" style={{marginTop:12}}><span>Idiomas activos</span><strong>{route.customer_language} → {route.owner_language}</strong></div>
          <p className="small muted" style={{marginTop:14}}>Los desvíos y cambios de destino se activan después de verificar el número. Nunca se habilitan solo por registrarse.</p>
        </div>}
        <form className="card" onSubmit={save}>
          <div className="card-head"><h2>Preferencias</h2><Settings2 size={18} color="#9dacb7"/></div>
          <div className="field-group"><label className="label">Tu número actual (el que ya conocen tus clientes)</label>
            <input type="tel" required className="field" maxLength={25} value={form.existing_phone} onChange={e=>setForm({...form,existing_phone:e.target.value})} placeholder="+1 706 000 0000"/>
          </div>
          <div className="form-grid">
            <div className="field-group"><label className="label">Tu idioma</label>
              <select className="field" value={form.desired_language} onChange={e=>setForm({...form,desired_language:e.target.value})}>
                <option value="es">Español</option><option value="en">English</option>
              </select>
            </div>
            <div className="field-group"><label className="label">Idioma del cliente</label>
              <select className="field" value={form.caller_language} onChange={e=>setForm({...form,caller_language:e.target.value})}>
                <option value="en">English</option><option value="es">Español</option>
              </select>
            </div>
          </div>
          <div className="field-group"><label className="label">Nombre en el saludo</label>
            <input className="field" maxLength={40} value={form.assistant_name} onChange={e=>setForm({...form,assistant_name:e.target.value})}/>
          </div>
          <div className="notice info" style={{marginBottom:18}}><Info size={17} style={{verticalAlign:"middle",marginRight:7}}/>
            {active?"Estas preferencias no modifican automáticamente tu línea activa. Para cambiar destino o idioma de tu número, solicita una verificación.":"Guardar preferencias no compra un número ni activa el servicio. La asignación se realiza después de verificar la identidad y el destino."}
          </div>
          {message&&<div role="status" className="notice" style={{marginBottom:13}}>{message}</div>}
          {error&&<div role="alert" className="notice danger" style={{marginBottom:13}}>{error}</div>}
          <button className="btn primary block" type="submit" disabled={busy}><Check size={16}/>{busy?"Guardando…":"Guardar preferencias"}</button>
        </form>
        <section className="card" aria-labelledby="existing-number-title" style={{marginTop:20}}>
          <div className="card-head"><h2 id="existing-number-title">Conserva tu número actual</h2><PhoneForwarded size={18} color="var(--lime)"/></div>
          <p className="small muted">Tus clientes pueden seguir llamando al número que ya conocen. Podemos conectar esas llamadas a Smart Job mediante un desvío permitido por tu operador, sin cambiar tu número público.</p>
          <div className="notice info" style={{marginTop:14}}>
            <strong>Importante:</strong> si activas el desvío en el mismo teléfono al que Smart Job intenta devolver la llamada, se puede producir un bucle. Antes de activarlo, necesitamos otra línea para contestar o una opción de recepción en la aplicación.
          </div>
          <p className="small muted" style={{marginTop:14}}>Otra posibilidad es portar tu número a Twilio. Eso transfiere las llamadas y los SMS, por lo que requiere revisar primero las consecuencias con tu operador. Ninguna de las dos opciones está activada automáticamente.</p>
        </section>
        <div className="card" style={{marginTop:20}}>
          <div className="card-head"><h2>Conecta tu número actual</h2><PhoneForwarded size={18} color="var(--lime)"/></div>
          <p className="small muted">Registra tu número actual y cómo te gustaría recibir las llamadas traducidas. No tendrás que comunicar otro número a tus clientes. Antes de habilitar el servicio verificaremos que eres su titular y que tu operador permite conectar las llamadas.</p>
          <div className="form-grid" style={{marginTop:18}}>
            <div className="field-group">
              <label htmlFor="existing-carrier" className="label">Operador del número</label>
              <select id="existing-carrier" className="field" value={carrier} onChange={e=>setCarrier(e.target.value)} disabled={Boolean(request?.status==="pending")}>
                <option value="other">Otro operador</option>
                <option value="verizon">Verizon</option>
                <option value="att">AT&amp;T</option>
                <option value="tmobile">T-Mobile</option>
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="connection-mode" className="label">Cuándo quieres traducir</label>
              <select id="connection-mode" className="field" value={connectionMode} onChange={e=>setConnectionMode(e.target.value)} disabled={Boolean(request?.status==="pending")}>
                <option value="conditional">Solo ocupadas o no atendidas</option>
                <option value="all_calls">Todas las llamadas entrantes</option>
                <option value="port">Trasladar el número (consulta)</option>
              </select>
            </div>
            <div className="field-group full">
              <label htmlFor="answer-method" className="label">Cómo contestarías con traducción</label>
              <select id="answer-method" className="field" value={answerMethod} onChange={e=>setAnswerMethod(e.target.value)} disabled={Boolean(request?.status==="pending")}>
                <option value="app">Aplicación de Smart Job (en desarrollo)</option>
                <option value="separate_line">Otra línea o teléfono (requiere verificación)</option>
              </select>
            </div>
          </div>
          <div className="notice info" style={{margin:"4px 0 15px"}}>
            {connectionMode==="conditional"
              ?"Las llamadas contestadas normalmente siguen sin traducción. Si estás ocupado o no contestas, las llamadas podrán llegar a Smart Job, una vez configurado."
              :connectionMode==="all_calls"
                ?"La línea normal dejará de sonar directamente mientras el desvío completo esté activado. Para contestar sin bucles necesitarás la aplicación Smart Job o un segundo teléfono."
                :"Portar tu número mueve el servicio de voz a otro proveedor; requiere coordinación y puede afectar SMS y tu plan móvil."}
            {carrier==="verizon"&&connectionMode!=="port"?
              <span> Verizon permite desvío condicional (*71) o completo (*72), pero no lo actives hasta recibir tu destino Smart Job verificado.</span>:null}
          </div>
          {request&&<p className="small" style={{marginTop:12}}>Tu última solicitud: <strong>{({pending:"Pendiente de revisión",contacted:"En contacto",approved:"Aprobada",rejected:"No aprobada",activated:"Activada"} as Record<string,string>)[request.status]||request.status}</strong></p>}
          <button className="btn primary block" type="button" style={{marginTop:16}} onClick={()=>void submitRequest()} disabled={requestBusy||active||request?.status==="pending"||loading}>
            {requestBusy?"Enviando…":active?"Línea ya asignada":request?.status==="pending"?"Solicitud enviada":"Solicitar conexión sin cargo"}
          </button>
          <p className="small muted" style={{marginTop:10}}>Esta solicitud no cambia tu operador, no activa un desvío, no compra números y no genera cargos. La traducción automática aún necesita configuración y una aplicación de recepción o línea alternativa.</p>
        </div>
        <div className="card" style={{marginTop:20}}>
          <div className="card-head"><h2>Historial de llamadas</h2><Clock3 size={18} color="var(--lime)"/></div>
          <p className="small muted">Solo estado y duración. Smart Job no guarda aquí grabaciones ni transcripciones de lo que hablaron.</p>
          {!history.length?<p className="muted small" style={{marginTop:18}}>Aún no hay llamadas de una línea asignada a tu cuenta.</p>:
            <div style={{marginTop:18}}>{history.map(item=><div key={item.bridge_sid} className="row between" style={{padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
              <div><strong className="small">{new Date(item.started_at).toLocaleString("es-US",{dateStyle:"medium",timeStyle:"short"})}</strong>
                <p className="small muted" style={{marginTop:3}}>{statusLabel[item.status]||item.status}</p></div>
              <span className="small">{item.duration_seconds===null?"—":Math.ceil(item.duration_seconds/60)+" min"}</span>
            </div>)}</div>}
        </div>
      </div>
      <aside>
        <div className="card">
          <div className="card-head"><h2>Estado de Smart Job</h2><PhoneForwarded size={18} color="var(--lime)"/></div>
          <div className="row between small" style={{marginBottom:12}}><span>Traducción IA</span><span className={"pill "+(apiStatus.ai?"":"off")}>{apiStatus.ai?"CONECTADO":"PENDIENTE"}</span></div>
          <div className="row between small" style={{marginBottom:12}}><span>Servidor telefónico</span><span className={"pill "+(apiStatus.telephone?"":"off")}>{apiStatus.telephone?"CONFIGURADO":"PENDIENTE"}</span></div>
          <div className="row between small"><span>Tu línea asignada</span><span className={"pill "+(active?"":"warning")}>{active?"ACTIVA":"PENDIENTE"}</span></div>
          <p className="small muted" style={{marginTop:18}}><ShieldAlert size={14} style={{verticalAlign:"middle",marginRight:5}}/>En la versión inicial, el registro no activa la telefonía ni inicia cargos automáticamente.</p>
        </div>
      </aside>
    </div>
  </div>;
}
