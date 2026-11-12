"use client";
import {useEffect,useState,type FormEvent} from "react";
import {createClient} from "@supabase/supabase-js";
import {inquiryFields,safeReferenceLink,type InquiryDetailKey} from "@/lib/web-services-inquiries";

type Props={slug:string;categoryId:string;services:string[];business:string};
type FormState={name:string;email:string;phone:string;service:string;message:string};
const empty:FormState={name:"",email:"",phone:"",service:"",message:""};
type Details=Partial<Record<InquiryDetailKey,string>>;
export default function RequestForm({slug,categoryId,services,business}:Props){
 const [form,setForm]=useState<FormState>({...empty});
 const [details,setDetails]=useState<Details>({});
 const [website,setWebsite]=useState("");
 const [busy,setBusy]=useState(false);
 const [done,setDone]=useState(false);
 const [error,setError]=useState("");
 const extraFields=inquiryFields(categoryId);
 useEffect(()=>{
  const selected=new URLSearchParams(window.location.search).get("service")||"";
  if(services.includes(selected))setForm(current=>({...current,service:selected}));
 },[services]);
 function change(key:keyof FormState,value:string){setForm(current=>({...current,[key]:value}));setError("");}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy||done)return;
  if(form.name.trim().length<2){setError("Escribe tu nombre.");return;}
  if(!form.email.trim()&&!form.phone.trim()){setError("Indica correo o teléfono.");return;}
  if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setError("Revisa el correo.");return;}
  const reference=details.referenceLink?.trim();
  if(reference&&!safeReferenceLink(reference)){setError("El enlace de referencia debe comenzar con https://");return;}
  const filtered:Record<string,string>={};
  for(const field of extraFields){
   const value=(details[field.key]||"").trim();
   if(value)filtered[field.key]=value.slice(0,200);
  }
  if(filtered.referenceLink)filtered.referenceLink=safeReferenceLink(filtered.referenceLink)||"";
  setBusy(true);setError("");
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
   const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)throw new Error("No disponible");
   const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {data,error:submitError}=await client.rpc("smartjob_web_submit_inquiry",{
    p_slug:slug,
    p_payload:{
     name:form.name.trim().slice(0,100),
     email:form.email.trim().slice(0,180),
     phone:form.phone.trim().slice(0,36),
     service:form.service,
     message:form.message.trim().slice(0,1200),
     details:filtered,
     website
    }
   });
   if(submitError||typeof data!=="string")throw new Error("No pudimos enviar la solicitud. Inténtalo más tarde.");
   setDone(true);
   setForm({...empty});setDetails({});
  }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar");}
  finally{setBusy(false);}
 }
 if(done)return <div className="ws-inquiry-success" role="status">
  <span aria-hidden="true">✓</span><h3>Solicitud enviada</h3>
  <p>{business} recibió tu solicitud. Podrás recibir una respuesta por el medio de contacto que indicaste.</p>
  <button type="button" onClick={()=>{setDone(false);setError("");}}>Nueva solicitud</button>
 </div>;
 return <form className="ws-inquiry-form" autoComplete="on" onSubmit={e=>void submit(e)} noValidate>
  <div className="ws-inquiry-field-row">
   <label><span>Nombre *</span><input type="text" autoComplete="name" maxLength={100}
    value={form.name} onChange={e=>change("name",e.target.value)} required placeholder="Tu nombre"/></label>
   <label><span>Correo</span><input type="email" autoComplete="email" inputMode="email" maxLength={180}
    value={form.email} onChange={e=>change("email",e.target.value)} placeholder="tu@correo.com"/></label>
  </div>
  <label><span>Teléfono</span><input type="tel" autoComplete="tel" inputMode="tel" maxLength={36}
   value={form.phone} onChange={e=>change("phone",e.target.value)} placeholder="+1 000 000 0000"/></label>
  {services.length>0?<label><span>Servicio</span><select value={form.service} onChange={e=>change("service",e.target.value)}>
    <option value="">Selecciona un servicio</option>
    {services.map((s,i)=><option key={i} value={s}>{s}</option>)}
   </select></label>:null}
  {extraFields.length>0?<div className="ws-inquiry-extra">
   {extraFields.map(field=><label key={field.key}>
    <span>{field.label}</span>
    <input type={field.inputType} maxLength={200} value={details[field.key]||""}
     min={field.inputType==="date"?new Date().toISOString().slice(0,10):undefined}
     placeholder={field.placeholder||""}
     onChange={e=>{setDetails(old=>({...old,[field.key]:e.target.value}));setError("");}}/>
   </label>)}
  </div>:null}
  <label><span>Cuéntanos qué necesitas</span><textarea rows={4} maxLength={1200}
    placeholder="Detalles de tu solicitud" value={form.message}
    onChange={e=>change("message",e.target.value)}/></label>
  <label className="ws-inquiry-trap" aria-hidden="true">
   <span>Website</span><input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/>
  </label>
  {error?<p className="ws-inquiry-error" role="alert">{error}</p>:null}
  <p className="ws-inquiry-privacy">Tus datos se compartirán con este negocio únicamente para responder tu solicitud.</p>
  <button type="submit" className="ws-inquiry-submit" disabled={busy}>{busy?"Enviando…":"Enviar solicitud"} <span aria-hidden="true">↗</span></button>
 </form>;
}
