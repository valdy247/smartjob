"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,Check,ContactRound,Search,Plus,Trash2,Save,UserRound,Phone,StickyNote,X} from "lucide-react";
import {CountryDialPicker} from "@/components/CountryDialPicker";
import {contactPhoneE164,splitContactPhone} from "@/lib/contact-phone";
import styles from "./vista-app.module.css";

export type VMVContact={
 id:string;owner_id:string;name:string;phone_e164:string;notes:string;created_at:string;updated_at:string;
};
const MAX_CONTACTS=300;
// Smart Call dialer supports US domestic destinations only; never invoke the native phone app.
const canDialVMV=(number:string)=>/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(number);
function messageFor(error:unknown){
 const data=error as {code?:string;message?:string}|null;
 if(data?.code==="23505")return "Este teléfono ya está guardado en tu agenda.";
 if(data?.code==="23514")return "Comprueba los datos del contacto.";
 return "No se pudieron guardar los datos. Revisa tu conexión e inténtalo nuevamente.";
}
export default function ContactBook({client,ownerId,initialPhone="",startInForm=false,embedded=false,onClose,onCall}:{
 client:SupabaseClient;ownerId:string;initialPhone?:string;startInForm?:boolean;embedded?:boolean;onClose:()=>void;onCall?:(phone:string,name:string)=>void
}){
 const [entries,setEntries]=useState<VMVContact[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 const [formOpen,setFormOpen]=useState(Boolean(initialPhone)||startInForm);
 const [name,setName]=useState("");
 const [country,setCountry]=useState(()=>splitContactPhone(initialPhone).country);
 const [phone,setPhone]=useState(()=>splitContactPhone(initialPhone).phone);
 const [notes,setNotes]=useState("");
 const [confirmDelete,setConfirmDelete]=useState<string|null>(null);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const {data:identity,error:authError}=await client.auth.getUser();
   if(authError||identity.user?.id!==ownerId)throw new Error("Tu sesión no está disponible. Vuelve a entrar.");
   const {data,error:readError}=await client.from("smartjob_contacts")
    .select("id,owner_id,name,phone_e164,notes,created_at,updated_at")
    .eq("owner_id",ownerId).order("name",{ascending:true}).limit(MAX_CONTACTS);
   if(readError)throw readError;
   setEntries((data||[]) as VMVContact[]);
  }catch(e){setError((e as Error)?.message||"No se pudieron cargar los contactos.");}
  finally{setLoading(false);}
 },[client,ownerId]);
 useEffect(()=>{void load();},[load]);
 const filtered=useMemo(()=>{
  const q=search.trim().toLocaleLowerCase("es-US");
  if(!q)return entries;
  return entries.filter(item=>item.name.toLocaleLowerCase("es-US").includes(q)||item.phone_e164.includes(q));
 },[entries,search]);
 function resetForm(){
  setEditing(null);setName("");setCountry("US");setPhone("");setNotes("");setFormOpen(false);setConfirmDelete(null);
  setError("");setNotice("");
 }
 function startNew(){
  setEditing(null);setName("");setCountry("US");setPhone("");setNotes("");setFormOpen(true);setError("");setNotice("");
 }
 function openEdit(entry:VMVContact){
  setEditing(entry.id);setName(entry.name);setCountry(splitContactPhone(entry.phone_e164).country);setPhone(splitContactPhone(entry.phone_e164).phone);setNotes(entry.notes||"");
  setFormOpen(true);setError("");setNotice("");
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(saving)return;
  const normalized=contactPhoneE164(phone,country);
  if(name.trim().length<1||name.trim().length>80){setError("El nombre debe tener entre 1 y 80 caracteres.");return;}
  if(!normalized){setError("Escribe un teléfono válido.");return;}
  if(notes.length>600){setError("La nota no debe superar 600 caracteres.");return;}
  setSaving(true);setError("");setNotice("");
  try{
   const {data:identity}=await client.auth.getUser();
   if(identity.user?.id!==ownerId)throw new Error("Tu sesión ha cambiado. Entra nuevamente.");
   const values={name:name.trim(),phone_e164:normalized,notes:notes.trim(),updated_at:new Date().toISOString()};
   if(editing){
    const {data,error:writeError}=await client.from("smartjob_contacts").update(values)
     .eq("id",editing).eq("owner_id",ownerId).select("id").single();
    if(writeError)throw writeError;
    if(!data)throw new Error("El contacto no se pudo actualizar.");
   }else{
    const {data,error:writeError}=await client.from("smartjob_contacts").insert({...values,owner_id:ownerId})
     .select("id").single();
    if(writeError)throw writeError;
    if(!data)throw new Error("El contacto no se pudo crear.");
   }
   resetForm();
   await load();
   setNotice(editing?"Contacto actualizado.":"Contacto guardado en VMV.");
  }catch(e){setError(messageFor(e));}
  finally{setSaving(false);}
 }
 async function remove(id:string){
  if(saving)return;
  setSaving(true);setError("");setNotice("");
  try{
   const {data:identity}=await client.auth.getUser();
   if(identity.user?.id!==ownerId)throw new Error("Tu sesión ha cambiado.");
   const {data,error:deleteError}=await client.from("smartjob_contacts").delete()
    .eq("id",id).eq("owner_id",ownerId).select("id").single();
   if(deleteError||!data)throw deleteError||new Error("No se pudo eliminar.");
   setConfirmDelete(null);await load();setNotice("Contacto eliminado de tu agenda VMV.");
  }catch(e){setError((e as Error)?.message||"No se pudo eliminar el contacto.");}
  finally{setSaving(false);}
 }
 return <section className={styles.contactsPage} aria-label="Agenda de contactos VMV">
  {!embedded?<button type="button" className={styles.back} onClick={onClose}><ArrowLeft size={16}/> Volver a llamadas</button>:null}
  <div className={embedded?styles.contactsHeaderCompact:styles.contactsHeader}>
   {embedded?<span className={styles.contactsMiniCount}>{entries.length} contacto{entries.length===1?"":"s"}</span>:<div><span className={styles.smallKicker}>SMART CALL / AGENDA</span><h2>Contactos<span className={styles.mint}>.</span></h2>
    <p>{entries.length} guardado{entries.length===1?"":"s"} en tu cuenta VMV</p></div>}
   {!formOpen?<button type="button" className={styles.contactAdd} onClick={startNew} aria-label="Nuevo contacto"><Plus size={22}/></button>:null}
  </div>
  {formOpen?<form className={styles.smartCard} onSubmit={e=>void save(e)}>
   <div className={styles.contactFormTitle}>
    <span className={styles.contactAvatar}><UserRound size={22}/></span>
    <div><span className={styles.smallKicker}>MI AGENDA</span><h3>{editing?"Editar contacto":"Nuevo contacto"}</h3></div>
    <button type="button" aria-label="Cancelar" onClick={resetForm} className={styles.contactClose}><X size={18}/></button>
   </div>
   <label htmlFor="contact-name">Nombre *</label>
   <input id="contact-name" autoComplete="name" required maxLength={80} value={name}
    onChange={e=>setName(e.target.value)} placeholder="Nombre y apellido"/>
   <label htmlFor="contact-phone">Teléfono *</label>
   <div className={styles.contactPhoneField}>
    <CountryDialPicker value={country} onChange={setCountry}/>
    <input id="contact-phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={24} value={phone}
     onChange={e=>{
      const value=e.target.value;
      if(value.trim().startsWith("+")){
       const parsed=splitContactPhone(value);setCountry(parsed.country);setPhone(parsed.phone);
      }else setPhone(value);
     }}/>
   </div>
   <label htmlFor="contact-notes">Nota (opcional)</label>
   <textarea id="contact-notes" value={notes} maxLength={600} rows={3}
    onChange={e=>setNotes(e.target.value)} placeholder="Cliente frecuente, horario preferido…"/>
   <p>Guardaremos este contacto en tu cuenta VMV, no automáticamente en la agenda del teléfono.</p>
   <button type="submit" disabled={saving} className={styles.mainAction}><Save size={16}/>{saving?"Guardando…":editing?"Guardar cambios":"Guardar contacto"}</button>
   {editing&&onCall?<button type="button" className={styles.contactFormCall}
    disabled={saving||!canDialVMV(contactPhoneE164(phone,country)||"")} title={!canDialVMV(contactPhoneE164(phone,country)||"")?"Por ahora, solo números de Estados Unidos":undefined}
    onClick={()=>{const number=contactPhoneE164(phone,country);if(number)onCall(number,name);}}><Phone size={17}/> Preparar llamada con VMV</button>:null}
  </form>:<>
   <label className={styles.contactSearch}><Search size={17}/><span className={styles.screenReaderOnly}>Buscar contactos</span>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o número" autoComplete="off"/></label>
   {loading?<div className={styles.emptyHistory}>Cargando contactos…</div>:filtered.length?
    <div className={styles.contactList}>{filtered.map(item=><div key={item.id} className={styles.contactRow}>
     <button type="button" className={styles.contactRowMain} aria-label={"Editar "+item.name}
      onClick={()=>openEdit(item)}>
      <span className={styles.contactAvatar}><UserRound size={19}/></span>
      <span className={styles.contactInfo}><strong>{item.name}</strong><small>{item.phone_e164}</small></span>
     </button>
     {onCall?<button type="button" className={styles.contactDialButton}
      aria-label={"Llamar a "+item.name+" desde VMV"}
      title={canDialVMV(item.phone_e164)?"Llamar con VMV":"Solo números de Estados Unidos"}
      disabled={!canDialVMV(item.phone_e164)}
      onClick={()=>onCall(item.phone_e164,item.name)}><Phone size={19}/></button>:null}
    </div>)}</div>:
    <div className={styles.emptyHistory}><ContactRound size={26}/>
     <strong>{entries.length?"No encontramos coincidencias":"Tu agenda está vacía"}</strong>
     <p>{entries.length?"Prueba otro nombre o teléfono.":"Añade tu primer contacto para identificar a tus clientes."}</p>
     {!entries.length?<button type="button" className={styles.mainAction} onClick={startNew}><Plus size={17}/> Añadir contacto</button>:null}
    </div>}
   {entries.length>=MAX_CONTACTS?<p className={styles.contactHelper}>Mostrando los primeros {MAX_CONTACTS} contactos. Usa la búsqueda o el panel web para gestionar más.</p>:null}
  </>}
  {editing&&formOpen?<div className={styles.contactDanger}>
   {confirmDelete===editing?<div><p>¿Eliminar este contacto de VMV?</p><button type="button" disabled={saving} onClick={()=>void remove(editing)}>Sí, eliminar</button><button type="button" onClick={()=>setConfirmDelete(null)}>Cancelar</button></div>:
    <button type="button" onClick={()=>setConfirmDelete(editing)}><Trash2 size={15}/> Eliminar contacto</button>}
  </div>:null}
  {notice?<p className={styles.successText} role="status"><Check size={15}/> {notice}</p>:null}
  {error?<p className={styles.errorText} role="alert">{error}</p>:null}
 </section>;
}
