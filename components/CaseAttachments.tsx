"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CheckCircle2,Download,FileText,Image as ImageIcon,Paperclip,RefreshCw,UploadCloud} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./CaseAttachments.module.css";

type Attachment={id:string;filename:string;bytes:number;content_type:string;created_at:string;uploader_id:string;visibility:"shared"|"internal"};
const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
export default function CaseAttachments({source,caseId,readOnly=false,staff=false}:{source:string;caseId:string;readOnly?:boolean;staff?:boolean}){
 const [attachments,setAttachments]=useState<Attachment[]>([]);
 const [visibility,setVisibility]=useState<"shared"|"internal">("shared");
 const seq=useRef(0);
 const current=useRef(source+":"+caseId);
 current.current=source+":"+caseId;
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
  const request=++seq.current,key=source+":"+caseId;
  setLoading(true);setError("");
  try{
   const token=await auth();
   const url="/api/case-files?source="+encodeURIComponent(source)+"&id="+encodeURIComponent(caseId);
   const res=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const json=await res.json();
   if(!res.ok)throw Error(json.error||"No se pudieron cargar los archivos.");
   if(request===seq.current&&current.current===key)setAttachments(json.attachments||[]);
  }catch(e){if(request===seq.current&&current.current===key)setError(e instanceof Error?e.message:"No se pudieron cargar los archivos.");}
  finally{if(request===seq.current&&current.current===key)setLoading(false);}
 },[auth,source,caseId]);
 useEffect(()=>{setAttachments([]);setFile(null);setVisibility("shared");void load();return()=>{seq.current++;};},[load]);
 const upload=async()=>{
  if(!file||busy)return;
  if(file.size<1||file.size>3_145_728||!allowed.has(file.type)){
   setError("JPG, PNG, WEBP o PDF, máximo 3 MB.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const token=await auth(),form=new FormData();
   form.set("source",source);form.set("id",caseId);form.set("file",file);form.set("visibility",staff?visibility:"shared");
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
  const key=current.current;
  const popup=window.open("about:blank","_blank");
  try{
   const token=await auth();
   const res=await fetch("/api/case-files?file="+encodeURIComponent(id),{cache:"no-store",headers:{Authorization:"Bearer "+token}});
   const json=await res.json();
   if(!res.ok||!json.url)throw Error(json.error||"El archivo no está disponible.");
   const url=new URL(json.url);
   if(url.protocol!=="https:"||!url.hostname)throw Error("Enlace no válido.");
   if(current.current!==key){popup?.close();return;}
   if(popup){popup.opener=null;popup.location.replace(url.toString());}
   else window.location.assign(url.toString());
  }catch(e){popup?.close();setError(e instanceof Error?e.message:"No se pudo abrir el archivo.");}
 };
 return <section className={styles.root} aria-label="Archivos de este caso">
  <div className={styles.heading}><span><Paperclip size={16}/>Archivos adjuntos</span><button aria-label="Actualizar archivos" type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/></button></div>
  {attachments.length?attachments.map(a=><div className={styles.fileRow} key={a.id}>
   <span className={styles.fileIcon}>{a.content_type==="application/pdf"?<FileText size={16}/>:<ImageIcon size={16}/>}</span>
   <div><strong>{a.filename}</strong><small>{Math.round(a.bytes/1024)} KB · {a.visibility==="internal"?"Solo equipo VMV":"Compartido con el cliente"}</small></div>
   <button type="button" title="Abrir archivo temporal" onClick={()=>void open(a.id)}><Download size={16}/></button>
  </div>):<p className={styles.empty}>{loading?"Cargando archivos…":"Todavía no hay archivos en este caso."}</p>}
  {!readOnly?<div className={styles.upload}>
   <label><UploadCloud size={16}/> Seleccionar archivo <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   {staff?<label className={styles.visibilityLabel}>Visibilidad
    <select value={visibility} onChange={e=>setVisibility(e.target.value as "shared"|"internal")}>
      <option value="shared">Compartido con el cliente</option><option value="internal">Solo equipo VMV</option>
    </select>
   </label>:null}
   {file?<div className={styles.selected}><span>{file.name} · {Math.ceil(file.size/1024)} KB</span><button type="button" disabled={busy} onClick={()=>void upload()}>Subir</button></div>:null}
   <small>Hasta 3 MB. JPG, PNG, WEBP o PDF. Evita enviar documentos sensibles innecesarios.</small>
  </div>:null}
  {notice?<p className={styles.success}><CheckCircle2 size={13}/>{notice}</p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
 </section>;
}