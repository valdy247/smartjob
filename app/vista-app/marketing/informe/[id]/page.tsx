"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,ExternalLink,FileText,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type {MessageKey} from "@/lib/i18n";
import type {WebRepairData} from "../../WebRepairStudio";
import styles from "./page.module.css";

type ReportRequest={id:string;owner_id:string;business_name:string;website_url:string|null;created_at:string;service_code:string;web_repair_data:WebRepairData|null};
export default function SavedMarketingReport(){
 const {id}=useParams<{id:string}>();
 const {translate,language}=useInterfaceLanguage();
 const [report,setReport]=useState<ReportRequest|null>(null);
 const [pending,setPending]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const run=async()=>{
   const client=getSupabase();
   if(!client){setError("marketing.report.noConnection");setPending(false);return;}
   const {data:{user}}=await client.auth.getUser();
   if(!active)return;
   if(!user||user.is_anonymous){setError("marketing.report.signIn");setPending(false);return;}
   const {data,error:readError}=await client.from("vmv_marketing_requests")
    .select("id,owner_id,business_name,website_url,created_at,service_code,web_repair_data")
    .eq("id",id).eq("service_code","seo_improvement").maybeSingle();
   if(!active)return;
   if(readError||!data){setError("marketing.report.notFound");setPending(false);return;}
   setReport(data as ReportRequest);setPending(false);
  };
  if(id)void run();
  return()=>{active=false;};
 },[id]);
 const audit=report?.web_repair_data?.audit;
 return <main className={styles.page}><div className={styles.shell}>
  <Link href="/vista-app/marketing" className={styles.back}><ArrowLeft size={16}/> {translate("marketing.report.back")}</Link>
  {pending?<p>{translate("marketing.report.loading")}</p>:error?<div role="alert" className={styles.card}>{translate(error as MessageKey)}</div>:report?<div className={styles.card}>
   <div className={styles.kicker}><ShieldCheck size={15}/> {translate("marketing.report.kicker")}</div>
   <h1>{translate("marketing.report.heading")} {report.business_name}</h1>
   <p className={styles.muted}>{report.website_url||translate("marketing.report.website")} · Solicitud #{report.id.slice(0,8)}</p>
   {audit?<><div className={styles.metrics}>
    <div>{translate("marketing.report.speed")}<strong>{audit.scores.performance??"—"}/100</strong></div>
    <div>SEO<strong>{audit.scores.seo??"—"}/100</strong></div>
    <div>{translate("marketing.report.accessibility")}<strong>{audit.scores.accessibility??"—"}/100</strong></div>
   </div>
   <section className={styles.section}><h2>{translate("marketing.report.simple")}</h2>
    <p>{audit.explanation||translate("marketing.report.explanationDefault")}</p>
    <small>{audit.explanationSource==="ai"?translate("marketing.report.aiSource"):translate("marketing.report.automaticSource")}</small>
   </section>
   <section className={styles.section}><h2>{translate("marketing.report.technical")}</h2>
    {(audit.findings||[]).length?(audit.findings||[]).map(f=><article key={f.id} className={styles.finding}><strong>{f.title}</strong><p>{f.description}</p><small>{translate("marketing.report.id")} {f.id} · Resultado: {f.score===null?translate("marketing.report.notAvailable"):Math.round(f.score*100)+"%"}</small></article>):(audit.recommendations||[]).map((f,i)=><article key={i} className={styles.finding}><p>{f}</p></article>)}
    <p className={styles.muted}>{translate("marketing.report.source")} {audit.source}. Analizado: {new Date(audit.analyzedAt).toLocaleString(language==="es"?"es-US":"en-US")} {translate("marketing.report.disclaimer")}</p>
    <a href={audit.reportUrl||"https://pagespeed.web.dev/"} target="_blank" rel="noopener noreferrer" className={styles.link}><ExternalLink size={15}/> {translate("marketing.report.evidence")}</a>
   </section>
   </>:<section className={styles.section}><FileText size={20}/><h2>{translate("marketing.report.manual")}</h2><p>{translate("marketing.report.manualText")}</p></section>}
   <section className={styles.section}><h2>{translate("marketing.report.repair")}</h2>
    <p>{translate("marketing.report.platform")} {report.web_repair_data?.platform==="other"?report.web_repair_data.otherPlatform:report.web_repair_data?.platform||translate("marketing.report.platformMissing")}</p>
    <p>{translate("marketing.report.repository")} {report.web_repair_data?.repositoryHost||translate("marketing.report.repositoryMissing")}</p>
    {report.web_repair_data?.repositoryUrl?<p>{translate("marketing.report.link")} {report.web_repair_data.repositoryUrl}</p>:null}
    <p>{report.web_repair_data?.requestRepair?translate("marketing.report.repairRequested"):translate("marketing.report.onlyReport")}</p>
    <small>{translate("marketing.report.safety")}</small>
   </section>
  </div>:null}
 </div></main>;
}
