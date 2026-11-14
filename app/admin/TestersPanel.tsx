"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Check,CheckCircle2,ChevronDown,Clock3,ExternalLink,Mail,MessageSquare,Plus,RefreshCw,Send,ShieldAlert,Smartphone,Users,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./testers.module.css";

type Tester={
 id:string;name:string;email:string|null;phone_e164:string|null;preferred_channel:"email"|"sms";
 active:boolean;email_opt_in:boolean;email_opted_out_at:string|null;
 sms_consent_at:string|null;sms_consent_source:string|null;sms_opted_out_at:string|null;updated_at:string;
};
type Deploy={id:string;url:string;sha:string;message:string;createdAt:number;state:string};
type Preview={ready:Deploy|null;building:Deploy|null;protected:boolean|null;protectionNotes:string[];projectVerified:boolean};
type Batch={id:string;created_by:string;deployment_id:string;deployment_url:string;deployment_sha:string;deployment_message:string;created_at:string;channel_mode:string};
type Delivery={id:string;batch_id:string;tester_id:string;channel:"email"|"sms";address_snapshot:string;state:string;provider:string|null;provider_id:string|null;error_code:string|null;attempt_count:number;created_at:string;updated_at:string};
type Data={testers:Tester[];batches:Batch[];deliveries:Delivery[];preview:Preview|null;previewError:string|null;channels:{email:boolean;sms:boolean}};
const blank=()=>({name:"",email:"",phone:"",country:"+1",preferred_channel:"email" as "email"|"sms",
 active:true,email_opt_in:false,sms_consent:false,sms_source:""});
type Editor=ReturnType<typeof blank>;
const flagCountries=[{name:"USA / Canada +1",value:"+1"},{name:"México +52",value:"+52"},{name:"Cuba +53",value:"+53"},{name:"Colombia +57",value:"+57"},{name:"Rep. Dominicana +1",value:"+1"},{name:"Otro (E.164)",value:"other"}];
const short=(s:string)=>s.slice(0,8);
const format=(v:string|number)=>new Intl.DateTimeFormat("es-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
const label=(s:string)=>({pending:"Pendiente",processing:"Procesando",accepted:"Aceptado por proveedor",delivered:"Entregado",failed:"Fallido",unknown:"Entrega desconocida"} as Record<string,string>)[s]||s;
export default function TestersPanel(){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const [saving,setSaving]=useState(false),[sending,setSending]=useState(false);
 const [form,setForm]=useState<Editor>(blank),[editing,setEditing]=useState<Tester|null>(null);
 const [formOpen,setFormOpen]=useState(false),[selected,setSelected]=useState<string[]>([]);
 const [channel,setChannel]=useState<"auto"|"email"|"sms">("auto");
 const [confirm,setConfirm]=useState(false),[requestKey,setRequestKey]=useState<string|null>(null);
 const [historyOpen,setHistoryOpen]=useState(true);
 const busy=useRef(false);
 const api=useCallback(async<T,>(view:string,body?:Record<string,unknown>):Promise<T>=>{
  const client=getSupabase();
  if(!client)throw Error("Conexión no configurada.");
  const session=await client.auth.getSession();
  if(session.error||!session.data.session?.access_token)throw Error("Tu sesión expiró.");
  const res=await fetch("/api/admin/testers"+(body?"":"?view="+encodeURIComponent(view)),{
   method:body?"POST":"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+session.data.session.access_token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const value=await res.json().catch(()=>({error:"Respuesta inválida."}));
  if(!res.ok)throw Error(value.error||"No se pudo completar.");
  return value as T;
 },[]);
 const reload=useCallback(async()=>{
  setLoading(true);
  try{
   const value=await api<Data>("overview");setData(value);setError("");
   setSelected(prev=>prev.filter(id=>value.testers.some(t=>t.id===id&&t.active)));
  }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}
  finally{setLoading(false);}
 },[api]);
 useEffect(()=>{void reload();},[reload]);
 const refreshPreview=async()=>{
  setLoading(true);setError("");
  try{const response=await api<Pick<Data,"preview"|"channels"|"previewError">>("preview");
   setData(prev=>prev?{...prev,...response}:prev);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo buscar el preview.");}
  finally{setLoading(false);}
 };
 const edit=(t?:Tester)=>{
  setEditing(t||null);setError("");setSuccess("");setFormOpen(true);
  if(!t){setForm(blank());return;}
  const digits=t.phone_e164||"";
  const country=["+52","+53","+57","+1"].find(x=>digits.startsWith(x))||"other";
  setForm({name:t.name,email:t.email||"",phone:country==="other"?digits:digits.slice(country.length),
   country,preferred_channel:t.preferred_channel,active:t.active,email_opt_in:t.email_opt_in,
   sms_consent:Boolean(t.sms_consent_at&&!t.sms_opted_out_at),sms_source:t.sms_consent_source||""});
 };
 const save=async()=>{
  if(busy.current)return;
  const phone=form.phone.trim()?form.country==="other"?form.phone.trim():form.country+form.phone.replace(/[()\s.-]/g,""):"";
  busy.current=true;setSaving(true);setError("");setSuccess("");
  try{
   await api("",{action:"save",id:editing?.id||null,name:form.name.trim(),email:form.email.trim(),
    phone,preferred_channel:form.preferred_channel,active:form.active,
    email_opt_in:form.email_opt_in,sms_consent:form.sms_consent,sms_source:form.sms_source,
    expected_updated_at:editing?.updated_at||null});
   setFormOpen(false);setEditing(null);setSuccess("Tester guardado y auditado.");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setSaving(false);busy.current=false;}
 };
 const changeStatus=async(t:Tester)=>{
  if(busy.current)return;
  busy.current=true;setSaving(true);setError("");
  try{
   await api("",{action:"save",id:t.id,name:t.name,email:t.email||"",phone:t.phone_e164||"",
    preferred_channel:t.preferred_channel,active:!t.active,email_opt_in:t.email_opt_in,
    sms_consent:Boolean(t.sms_consent_at&&!t.sms_opted_out_at),sms_source:t.sms_consent_source||"",
    expected_updated_at:t.updated_at});
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cambiar el estado.");}
  finally{setSaving(false);busy.current=false;}
 };
 const eligible=(t:Tester,mode:"auto"|"email"|"sms"=channel)=>{
  if(!t.active)return false;
  const c=mode==="auto"?t.preferred_channel:mode;
  return c==="email"?Boolean(t.email&&t.email_opt_in&&!t.email_opted_out_at):
   Boolean(t.phone_e164&&t.sms_consent_at&&!t.sms_opted_out_at);
 };
 const selectedPeople=useMemo(()=>data?.testers.filter(t=>selected.includes(t.id))||[],[selected,data]);
 const sendable=selectedPeople.filter(t=>eligible(t));
 const changeSelection=(next:string[])=>{setSelected(next);setRequestKey(null);setConfirm(false);};
 const send=async()=>{
  if(sending||busy.current||!data?.preview?.ready)return;
  if(!requestKey)setRequestKey(crypto.randomUUID());
  const key=requestKey||crypto.randomUUID();
  setRequestKey(key);busy.current=true;setSending(true);setError("");setSuccess("");
  try{
   const result=await api<{ok:boolean;batchId:string;results:{state:string}[];reused:boolean}>("",{
    action:"send",request_key:key,deployment_id:data.preview.ready.id,
    ids:sendable.map(t=>t.id),channel_mode:channel
   });
   setRequestKey(null);setConfirm(false);
   const counts:Record<string,number>={};
   for(const r of result.results)counts[r.state]=(counts[r.state]||0)+1;
   setSuccess("Lote registrado: "+(counts.accepted||0)+" aceptados, "+(counts.failed||0)+" fallidos, "+(counts.unknown||0)+" sin confirmación.");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"El envío no pudo completarse. Reintenta con la misma solicitud.");}
  finally{setSending(false);busy.current=false;}
 };
 const resume=async(batchId:string)=>{
  if(sending||busy.current)return;
  busy.current=true;setSending(true);setError("");setSuccess("");
  try{
   const r=await api<{results:{state:string}[]}>("",{action:"resume",batch_id:batchId});
   setSuccess("Lote reanudado: "+r.results.length+" pendientes procesados.");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo continuar el lote.");}
  finally{setSending(false);busy.current=false;}
 };
 const retry=async(d:Delivery)=>{
  if(sending||busy.current||d.state!=="failed")return;
  busy.current=true;setSending(true);setError("");setSuccess("");
  try{
   const r=await api<{results:{state:string}[]}>("",{action:"retry",delivery_id:d.id});
   setSuccess("Reintento registrado: "+label(r.results[0]?.state||"unknown")+".");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo reintentar.");}
  finally{setSending(false);busy.current=false;}
 };
 const ready=data?.preview?.ready;
 const previewProtected=data?.preview?.protected;
 const isReady=Boolean(ready&&previewProtected===false);
 const channels=data?.channels||{email:false,sms:false};
 const allEligible=data?.testers.filter(t=>eligible(t))||[];
 const chosenChannels=sendable.map(t=>channel==="auto"?t.preferred_channel:channel);
 const channelConfigured=chosenChannels.every(c=>channels[c]);
 const canSend=isReady&&sendable.length>0&&sendable.length<=15&&channelConfigured&&!sending;
 const recipients=sendable.map(t=>({name:t.name,channel:channel==="auto"?t.preferred_channel:channel,
  destination:(channel==="auto"?t.preferred_channel:channel)==="email"?t.email:t.phone_e164}));
 return <section className={styles.wrap}>
  <div className={styles.top}><div><p className={styles.eyebrow}>INVITACIONES DE PRUEBA</p><h2>Testers</h2>
   <p>Envía una versión exacta a destinatarios autorizados. Nada se envía automáticamente con los commits.</p></div>
   <button type="button" className={styles.secondary} onClick={()=>void refreshPreview()} disabled={loading}><RefreshCw size={15}/>Buscar actualización</button></div>
  {error?<p className={styles.error} role="alert">{error}<button onClick={()=>setError("")} aria-label="Cerrar error"><X size={14}/></button></p>:null}
  {success?<p className={styles.success} role="status"><CheckCircle2 size={16}/>{success}</p>:null}
  <div className={styles.preview}>
   <div className={styles.sectionHead}><h3>Último preview válido</h3><span className={ready?styles.ready:styles.muted}>{ready?"READY":"Sin versión disponible"}</span></div>
   {data?.previewError?<p className={styles.warning}>{data.previewError}</p>:null}
   {ready?<div className={styles.previewInfo}>
    <strong>{short(ready.sha)}</strong><span>{ready.message||"Actualización de VMV Business"}</span>
    <small>{format(ready.createdAt)} · {ready.state}</small>
    <a href={ready.url} target="_blank" rel="noopener noreferrer">{ready.url} <ExternalLink size={13}/></a>
   </div>:<p className={styles.placeholder}>{loading?"Consultando Vercel…":"Todavía no hay un despliegue READY verificable para esta rama."}</p>}
   {data?.preview?.building?<p className={styles.building}><Clock3 size={16}/>Hay una actualización posterior en construcción: {short(data.preview.building.sha)}. El preview anterior no incluye esos cambios.</p>:null}
   {previewProtected===true?<p className={styles.warning}><ShieldAlert size={16}/>El preview tiene protección ({data?.preview?.protectionNotes.join(", ")}). No se enviará hasta resolver el acceso oficial de testers.</p>:null}
   {previewProtected===null&&ready?<p className={styles.warning}><ShieldAlert size={16}/>No se pudo verificar la protección del proyecto. Se bloquea el envío hasta comprobarla.</p>:null}
   <div className={styles.channels}><span><Mail size={15}/>Correo: {channels.email?"Configurado":"No configurado"}</span>
     <span><Smartphone size={15}/>SMS: {channels.sms?"Habilitado":"No configurado"}</span></div>
  </div>
  <section className={styles.panel}>
   <div className={styles.sectionHead}><div><h3>Destinatarios</h3><p>{data?.testers.length||0} registrados · {data?.testers.filter(t=>t.active).length||0} activos</p></div>
    <button type="button" className={styles.primary} onClick={()=>edit()}><Plus size={15}/>Agregar tester</button></div>
   <div className={styles.selectBar}><button type="button" className={styles.secondary} onClick={()=>changeSelection(allEligible.map(t=>t.id))}><Check size={14}/>Todos los elegibles</button>
    <button type="button" className={styles.secondary} onClick={()=>changeSelection([])}>Limpiar</button>
    <span>{selected.length} seleccionados · máximo 15 por lote</span></div>
   <div className={styles.people}>{(data?.testers||[]).map(t=><div key={t.id} className={styles.person}>
    <input type="checkbox" aria-label={"Seleccionar "+t.name} disabled={!eligible(t)} checked={selected.includes(t.id)} onChange={e=>changeSelection(e.target.checked?[...selected,t.id]:selected.filter(id=>id!==t.id))}/>
    <div className={styles.initial}>{t.name[0]?.toUpperCase()}</div>
    <div className={styles.personData}><strong>{t.name}</strong><small>{t.email||"Sin correo"} {t.phone_e164?" · "+t.phone_e164:""}</small>
     <span>{t.preferred_channel.toUpperCase()} · {t.active?"Activo":"Inactivo"} · {eligible(t)?"Autorizado":"Sin consentimiento/canal"}</span></div>
    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>edit(t)}>Editar</button>
     <button type="button" className={styles.secondary} disabled={saving} onClick={()=>void changeStatus(t)}>{t.active?"Desactivar":"Activar"}</button></div>
   </div>)}
   {!data?.testers.length?<p className={styles.placeholder}>Todavía no hay testers. Agrega el primero.</p>:null}</div>
   <div className={styles.sendBar}><label>Canal del envío
    <select value={channel} onChange={e=>{setChannel(e.target.value as "auto"|"email"|"sms");setRequestKey(null);setConfirm(false);}}>
     <option value="auto">Preferido por cada tester</option><option value="email">Correo electrónico</option><option value="sms">SMS</option>
    </select></label>
    <div><small>{sendable.length} elegibles para esta selección</small>
     <button type="button" className={styles.primary} disabled={!canSend} onClick={()=>{setRequestKey(null);setConfirm(true);}}><Send size={16}/>Enviar último preview</button></div>
   </div>
   {!channelConfigured&&sendable.length?<p className={styles.warning}>El canal elegido no está configurado en el servidor. Cambia a uno disponible.</p>:null}
   {selected.length>15?<p className={styles.warning}>Divide el envío en lotes de hasta 15 destinatarios.</p>:null}
  </section>
  <section className={styles.panel}><div className={styles.sectionHead}><h3>Historial de envíos</h3><button type="button" className={styles.secondary} onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?"Ocultar":"Mostrar"} <ChevronDown size={15}/></button></div>
   {historyOpen&&(data?.batches||[]).map(b=><div className={styles.batch} key={b.id}>
    <div className={styles.batchHead}><strong>Versión {short(b.deployment_sha)}</strong><small>{format(b.created_at)}</small>
     <a href={b.deployment_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>Abrir versión enviada</a></div>
    {(data?.deliveries||[]).some(d=>d.batch_id===b.id&&d.state==="pending")?
     <button type="button" className={styles.secondary} disabled={sending} onClick={()=>void resume(b.id)}>
       <RefreshCw size={14}/>Continuar envíos pendientes
     </button>:null}
    {(data?.deliveries||[]).filter(d=>d.batch_id===b.id).map(d=><div key={d.id} className={styles.delivery}>
     <span>{data?.testers.find(t=>t.id===d.tester_id)?.name||"Tester"} · {d.channel.toUpperCase()}</span>
     <small>{label(d.state)}{d.error_code?" · "+d.error_code:""}{d.provider_id?" · "+short(d.provider_id):""}</small>
     {d.state==="failed"&&d.attempt_count<3?<button type="button" onClick={()=>void retry(d)} disabled={sending}>Reintentar</button>:null}
    </div>)}
   </div>)}
   {historyOpen&&!data?.batches.length?<p className={styles.placeholder}>No se han registrado envíos.</p>:null}
  </section>
  {formOpen?<div className={styles.overlay} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-label={editing?"Editar tester":"Nuevo tester"}>
   <div className={styles.sectionHead}><h3>{editing?"Editar tester":"Agregar tester"}</h3><button className={styles.close} aria-label="Cerrar" onClick={()=>setFormOpen(false)}><X size={17}/></button></div>
   {error?<p className={styles.error} role="alert">{error}</p>:null}
   <div className={styles.fields}>
    <label>Nombre<input maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre del tester"/></label>
    <label>Correo<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="tester@ejemplo.com"/></label>
    <div className={styles.phoneFields}><label>Código de país<select value={form.country} onChange={e=>setForm({...form,country:e.target.value})}>{flagCountries.map((c,i)=><option key={i} value={c.value}>{c.name}</option>)}</select></label>
     <label>Teléfono {form.country==="other"?"E.164 (+...)":"sin código"}<input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder={form.country==="other"?"+441234567890":"7065550123"}/></label></div>
    <label>Canal preferido<select value={form.preferred_channel} onChange={e=>setForm({...form,preferred_channel:e.target.value as "email"|"sms"})}><option value="email">Correo</option><option value="sms">SMS</option></select></label>
    <label className={styles.check}><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Tester activo</label>
    <label className={styles.check}><input type="checkbox" checked={form.email_opt_in} onChange={e=>setForm({...form,email_opt_in:e.target.checked})}/>Confirma que acepta recibir correos de prueba</label>
    <label className={styles.check}><input type="checkbox" checked={form.sms_consent} onChange={e=>setForm({...form,sms_consent:e.target.checked})}/>Consentimiento explícito para recibir SMS</label>
    {form.sms_consent?<label>Origen del consentimiento SMS<input maxLength={120} value={form.sms_source} onChange={e=>setForm({...form,sms_source:e.target.value})} placeholder="Confirmación escrita del tester"/></label>:null}
   </div>
   <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={()=>setFormOpen(false)}>Cancelar</button>
     <button type="button" className={styles.primary} disabled={saving||!form.name.trim()||(!form.email.trim()&&!form.phone.trim())} onClick={()=>void save()}><Check size={15}/>Guardar tester</button></div>
  </div></div>:null}
  {confirm&&ready?<div className={styles.overlay} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Confirmar envío">
   <div className={styles.sectionHead}><h3>Confirmar envío</h3><button className={styles.close} aria-label="Cerrar" onClick={()=>setConfirm(false)}><X size={17}/></button></div>
   <p className={styles.eyebrow}>VERSIÓN FIJADA · {short(ready.sha)}</p><p className={styles.sample}>VMV Business · Nueva versión para probar<br/>Ya puedes probar la actualización:<br/>{ready.url}<br/><br/>Versión: {short(ready.sha)}</p>
   <p className={styles.confirmLabel}>Destinatarios y canal</p><div className={styles.confirmList}>{recipients.map((r,i)=><div key={i}><strong>{r.name}</strong><small>{r.channel.toUpperCase()} · {r.destination}</small></div>)}</div>
   <p className={styles.disclaimer}>READY no garantiza que la versión esté libre de errores. Enviar no concede acceso a cuentas ni al panel Admin.</p>
   <div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={sending} onClick={()=>setConfirm(false)}>Cancelar</button>
    <button type="button" className={styles.primary} disabled={sending||!canSend} onClick={()=>void send()}><Send size={15}/>{sending?"Enviando…":"Confirmar y enviar"}</button></div>
  </div></div>:null}
 </section>;
}
