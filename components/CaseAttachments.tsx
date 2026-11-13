"use client";
import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,Download,FileText,Image as ImageIcon,Paperclip,RefreshCw,UploadCloud} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./CaseAttachments.module.css";

type Attachment={id:string;filename:string;bytes:number;content_type:string;created_at:string;uploader_id:string};
const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
export default function CaseAttachments({source,caseId,readOnly=false}:{source:string;caseId:string;readOnly?:boolean}){
 const [attachments,setAttachments]=useState<Attachment[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const auth=useCallback(async()=>{
  const db=getSupabase();
  if(!db)throw Error("Almacenamiento no disponible.");
  const session=await db.auth.getSession();
  if(session.error||!session.data.session?.access_token)throw Error("Sesión requerida.");
  return session.data.session.access_token;
 },[]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const token=await auth();
   const url="/api/case-files?source="+encodeURIComponent(source)+"&id="+encodeURIComponent(caseId);
   const res=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const json=await res.json();
   if(!res.ok)throw Error(json.error||"No se pudieron cargar los archivos.");
   setAttachments(json.attachments||[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los archivos.");}
  finally{setLoading(false);}
 },[auth,source,caseId]);
 useEffect(()=>{void load();},[load]);
 const upload=async()=>{
  if(!file||busy)return;
  if(file.size<1||file.size>3_145_728||!allowed.has(file.type)){
   setError("JPG, PNG, WEBP o PDF, máximo 3 MB.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const token=await auth(),form=new FormData();
   form.set("source",source);form.set("id",caseId);form.set("file",file);
   const res=await fetch("/api/case-files",{method:"POST",headers:{Authorization:"Bearer "+token},body:form,cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"No se pudo subir el archivo.");
   setFile(null);setNotice("Archivo guardado de manera privada.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo subir el archivo.");}
  finally{setBusy(false);}
 };
 const open=async(id:string)=>{
  setError("");
  const popup=window.open("about:blank","_blank");
  try{
   const token=await auth();
   const res=await fetch("/api/case-files?file="+encodeURIComponent(id),{cache:"no-store",headers:{Authorization:"Bearer "+token}});
   const json=await res.json();
   if(!res.ok||!json.url)throw Error(json.error||"El archivo no está disponible.");
   const url=new URL(json.url);
   if(url.protocol!=="https:"||!url.hostname)throw Error("Enlace no válido.");
   if(popup){popup.opener=null;popup.location.replace(url.toString());}
   else window.location.assign(url.toString());
  }catch(e){popup?.close();setError(e instanceof Error?e.message:"No se pudo abrir el archivo.");}
 };
 return <section className={styles.root} aria-label="Archivos de este caso">
  <div className={styles.heading}><span><Paperclip size={16}/>Archivos adjuntos</span><button aria-label="Actualizar archivos" type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/></button></div>
  {attachments.length?attachments.map(a=><div className={styles.fileRow} key={a.id}>
   <span className={styles.fileIcon}>{a.content_type==="application/pdf"?<FileText size={16}/>:<ImageIcon size={16}/>}</span>
   <div><strong>{a.filename}</strong><small>{Math.round(a.bytes/1024)} KB · Privado</small></div>
   <button type="button" title="Abrir archivo temporal" onClick={()=>void open(a.id)}><Download size={16}/></button>
  </div>):<p className={styles.empty}>{loading?"Cargando archivos…":"Todavía no hay archivos en este caso."}</p>}
  {!readOnly?<div className={styles.upload}>
   <label><UploadCloud size={16}/> Seleccionar archivo <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   {file?<div className={styles.selected}><span>{file.name} · {Math.ceil(file.size/1024)} KB</span><button type="button" disabled={busy} onClick={()=>void upload()}>Subir</button></div>:null}
   <small>Hasta 3 MB. JPG, PNG, WEBP o PDF. Evita enviar documentos sensibles innecesarios.</small>
  </div>:null}
  {notice?<p className={styles.success}><CheckCircle2 size={13}/>{notice}</p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
 </section>;
}