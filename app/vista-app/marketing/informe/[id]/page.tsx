"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,ExternalLink,FileText,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {WebRepairData} from "../../WebRepairStudio";
import styles from "./page.module.css";

type ReportRequest={id:string;owner_id:string;business_name:string;website_url:string|null;created_at:string;service_code:string;web_repair_data:WebRepairData|null};
export default function SavedMarketingReport(){
 const {id}=useParams<{id:string}>();
 const [report,setReport]=useState<ReportRequest|null>(null);
 const [pending,setPending]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const run=async()=>{
   const client=getSupabase();
   if(!client){setError("No hay conexión con VMV Business.");setPending(false);return;}
   const {data:{user}}=await client.auth.getUser();
   if(!active)return;
   if(!user||user.is_anonymous){setError("Inicia sesión en VMV Business para ver tu informe.");setPending(false);return;}
   const {data,error:readError}=await client.from("vmv_marketing_requests")
    .select("id,owner_id,business_name,website_url,created_at,service_code,web_repair_data")
    .eq("id",id).eq("service_code","seo_improvement").maybeSingle();
   if(!active)return;
   if(readError||!data){setError("No encontramos este informe en tu cuenta.");setPending(false);return;}
   setReport(data as ReportRequest);setPending(false);
  };
  if(id)void run();
  return()=>{active=false;};
 },[id]);
 const audit=report?.web_repair_data?.audit;
 return <main className={styles.page}><div className={styles.shell}>
  <Link href="/vista-app/marketing" className={styles.back}><ArrowLeft size={16}/> Volver a Marketing</Link>
  {pending?<p>Cargando informe…</p>:error?<div role="alert" className={styles.card}>{error}</div>:report?<div className={styles.card}>
   <div className={styles.kicker}><ShieldCheck size={15}/> INFORME PRIVADO · VMV MARKETING</div>
   <h1>Diagnóstico de {report.business_name}</h1>
   <p className={styles.muted}>{report.website_url||"Sitio web"} · Solicitud #{report.id.slice(0,8)}</p>
   {audit?<><div className={styles.metrics}>
    <div>Velocidad<strong>{audit.scores.performance??"—"}/100</strong></div>
    <div>SEO<strong>{audit.scores.seo??"—"}/100</strong></div>
    <div>Accesibilidad<strong>{audit.scores.accessibility??"—"}/100</strong></div>
   </div>
   <section className={styles.section}><h2>Explicación sencilla</h2>
    <p>{audit.explanation||"Esta auditoría muestra indicadores técnicos. Revisa abajo la evidencia específica para conocer qué puede mejorarse."}</p>
    <small>{audit.explanationSource==="ai"?"Interpretación con IA a partir de los datos técnicos.":"Interpretación automática basada en comprobaciones técnicas."}</small>
   </section>
   <section className={styles.section}><h2>Comprobaciones técnicas</h2>
    {(audit.findings||[]).length?(audit.findings||[]).map(f=><article key={f.id} className={styles.finding}><strong>{f.title}</strong><p>{f.description}</p><small>ID: {f.id} · Resultado: {f.score===null?"No disponible":Math.round(f.score*100)+"%"}</small></article>):(audit.recommendations||[]).map((f,i)=><article key={i} className={styles.finding}><p>{f}</p></article>)}
    <p className={styles.muted}>Fuente: {audit.source}. Analizado: {new Date(audit.analyzedAt).toLocaleString("es-US")}. Estos resultados no garantizan ranking ni ventas.</p>
    <a href={audit.reportUrl||"https://pagespeed.web.dev/"} target="_blank" rel="noopener noreferrer" className={styles.link}><ExternalLink size={15}/> Contrastar con PageSpeed Insights</a>
   </section>
   </>:<section className={styles.section}><FileText size={20}/><h2>Revisión manual pendiente</h2><p>Google no devolvió una auditoría automática para este sitio. El equipo puede revisarlo después de evaluar la solicitud.</p></section>}
   <section className={styles.section}><h2>Datos para la reparación</h2>
    <p>Plataforma: {report.web_repair_data?.platform==="other"?report.web_repair_data.otherPlatform:report.web_repair_data?.platform||"No indicada"}</p>
    <p>Repositorio: {report.web_repair_data?.repositoryHost||"No indicado"}</p>
    {report.web_repair_data?.repositoryUrl?<p>Enlace: {report.web_repair_data.repositoryUrl}</p>:null}
    <p>{report.web_repair_data?.requestRepair?"Solicitaste una evaluación y presupuesto de reparación.":"Elegiste conservar el diagnóstico sin contratar una reparación."}</p>
    <small>Ningún acceso o cambio externo fue autorizado automáticamente.</small>
   </section>
  </div>:null}
 </div></main>;
}
