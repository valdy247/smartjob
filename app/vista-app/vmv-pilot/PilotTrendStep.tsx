"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,Check,ChevronRight,LoaderCircle,Radar,RotateCcw,SkipForward} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {RadarIdea,RadarVideo} from "@/lib/vmv-video-radar";
import css from "./PilotTrendStep.module.css";

type Scan={id:string;status:string;query:string;days?:number;createdAt?:string;
 items:RadarVideo[];ideas:RadarIdea[];failure:string|null};
type ScanResponse={scan:Scan;reused?:boolean};
type Props={niche:string;language:string;en:boolean;onSkip:()=>void;onChoose:(idea:RadarIdea,scanId:string)=>void};
const messages:Record<string,[string,string]>={
 login:["Inicia sesión nuevamente.","Sign in again."],
 network:["No se pudo conectar. Reintentar.","Connection failed. Try again."],
 video_not_enabled_for_account:["Pilot no está habilitado para esta cuenta.","Pilot isn't enabled for this account."],
 radar_daily_limit:["Límite de 20 investigaciones nuevas por 24 horas. Puedes seguir creando con tu tema sin buscar YouTube.",
  "Limit of 20 new searches per 24 hours. You can still create from your topic without YouTube research."],
 radar_youtube_key_missing:["Falta conectar YouTube.","YouTube isn't connected."],
 radar_youtube_quota_or_access:["YouTube rechazó la clave o agotó su cuota.","YouTube rejected the key or the quota is exhausted."],
 radar_youtube_unavailable:["YouTube no respondió.","YouTube didn't respond."],
 radar_database_unavailable:["No se pudo guardar el análisis.","Research could not be saved."],
 radar_ai_unavailable:["No se pudieron crear ideas.","Could not generate ideas."],
 radar_consent_required:["Acepta primero los términos.","Accept the terms first."],
 radar_empty:["No hay videos recientes para este nicho.","No recent videos for this niche."]
};
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const trim=(value:string,n:number)=>value.length>n?value.slice(0,n-1)+"…":value;
const compact=(n:number)=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);

export default function PilotTrendStep({niche,language,en,onSkip,onChoose}:Props){
 const [mode,setMode]=useState<"choice"|"consent"|"loading"|"results"|"failed">("choice");
 const [phase,setPhase]=useState(""),[scan,setScan]=useState<Scan|null>(null),[failure,setFailure]=useState("");
 const [days,setDays]=useState<7|30|90>(30),[cached,setCached]=useState(false);
 const active=useRef(0);
 const L=(es:string,english:string)=>en?english:es;
 useEffect(()=>()=>{active.current++;},[]);
 useEffect(()=>{active.current++;setScan(null);setMode("choice");setFailure("");setCached(false);},[niche,language]);
 const api=async (path:string,method="GET",body?:Record<string,unknown>):Promise<ScanResponse>=>{
  const sb=getSupabase();if(!sb)throw Error("login");
  const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error("login");
  const response=await fetch("/api/video-generator/radar"+path,{method,cache:"no-store",
   headers:{Authorization:"Bearer "+session.access_token,"X-VMV-YouTube-Consent":"accepted",
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>null);
  if(!data||typeof data!=="object")throw Error("network");
  if(!response.ok)throw Error(String(data.error||"network"));
  return data as ScanResponse;
 };
 const start=async()=>{
  const id=++active.current;setMode("loading");setFailure("");
  try{
   setPhase(L("Buscando tendencias","Finding trends"));
   const initial=await api("?q="+encodeURIComponent(niche.slice(0,90))+"&days="+days);
   setCached(initial.reused===true);
   let current=initial.scan;
   if(!current?.id)throw Error("network");
   for(let i=0;current.status==="pending"&&i<24;i++){
    await delay(2500);if(id!==active.current)return;
    current=(await api("?id="+encodeURIComponent(current.id))).scan;
   }
   if(id!==active.current)return;
   if(current.status!=="ready")throw Error(current.failure||"radar_youtube_unavailable");
   if(!current.items?.length)throw Error("radar_empty");
   setPhase(L("Creando propuestas","Preparing ideas"));
   current=(await api("","POST",{scanId:current.id,language})).scan;
   if(id!==active.current)return;
   if(!current?.ideas?.length)throw Error("radar_ai_unavailable");
   setScan(current);setMode("results");
  }catch(e){
   if(id!==active.current)return;
   const code=e instanceof Error?e.message:"network";
   setFailure(messages[code]?.[en?1:0]||L("No fue posible analizar tendencias.","Could not analyze trends."));
   setMode("failed");
  }
 };
 const skip=()=>{active.current++;onSkip();};
 return <div className={css.root}>
  {mode==="choice"?<div className={css.options}>
   <button type="button" onClick={()=>setMode("consent")}><Radar size={27}/><strong>{L("Sí, analizar","Yes, analyze")}</strong></button>
   <button type="button" onClick={skip}><SkipForward size={27}/><strong>{L("No, continuar","No, continue")}</strong></button>
  </div>:null}
  {mode==="consent"?<div className={css.consent}>
   <div className={css.source}>YouTube <span>· {L("datos públicos","public data")}</span></div>
   <p>{L("Tema:","Topic:")} <strong>{niche}</strong></p>
   <div className={css.periodPicker} role="group" aria-label={L("Periodo de búsqueda","Research date range")}>
    {([7,30,90] as const).map(period=><button key={period} type="button"
     className={days===period?css.periodActive:undefined}
     aria-pressed={days===period} onClick={()=>setDays(period)}>
     {period} {L("días","days")}</button>)}
   </div>
   <p>{L("Una búsqueda idéntica se reutiliza durante 6 horas. Cambia el periodo para buscar otras fuentes. Límite: 20 investigaciones nuevas cada 24 horas.",
    "Identical searches are cached for 6 hours. Change the time window to find other sources. Limit: 20 new searches per 24 hours.")}</p>
   <p>{L("Para buscar tendencias, acepta","To research trends, accept")} <a href="/vista-app/video-generator/radar-privacy" target="_blank" rel="noopener noreferrer">{L("Privacidad","Privacy")}</a> {L("y","and")} <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">{L("Términos de YouTube","YouTube Terms")}</a>.</p>
   <button type="button" className={css.action} onClick={()=>void start()}><Radar size={17}/>{L("Aceptar y analizar","Accept and analyze")}</button>
   <button type="button" className={css.minor} onClick={skip}>{L("Crear con mi tema sin análisis","Create from my topic without research")}</button>
  </div>:null}
  {mode==="loading"?<div className={css.wait} role="status" aria-live="polite">
   <LoaderCircle className={css.spin} size={29}/><strong>{phase}</strong>
   <button type="button" onClick={skip}>{L("Omitir","Skip")}</button>
  </div>:null}
  {mode==="results"?<>
   <div className={css.found}><Check size={16}/>{L("3 ideas inspiradas en YouTube","3 ideas inspired by YouTube")}</div>
   <p className={css.researchStatus}>
    {L("Tema: ","Topic: ")}<strong>{scan?.query}</strong>
    {" · "}{scan?.days||days} {L("días","days")}
    {" · "}{cached?L("Resultados guardados (6 horas)","Cached results (6 hours)"):
     L("Nueva investigación","New research")}
    {scan?.createdAt?" · "+new Date(scan.createdAt).toLocaleString(en?"en-US":"es-US"):null}
   </p>
   <p className={css.disclosure}>
    {L("Las ideas y sus títulos son propuestas de IA. Las vistas pertenecen exclusivamente a los videos originales de YouTube, no a las ideas propuestas. Son cifras acumuladas, no una medición de viralidad en tiempo real.",
     "Idea headlines are AI suggestions. View counts belong only to the original YouTube videos, not the suggested ideas. These are cumulative totals, not real-time virality measurements.")}
    {" "}{L("Búsqueda de videos publicados en los últimos 30 días.",
      "Search limited to videos published within the last 30 days.")}
   </p>
   <div className={css.ideas}>{scan?.ideas.slice(0,3).map((idea,i)=>{
    const video=scan.items.find(v=>v.id===idea.sourceId);
    return <article className={css.idea} key={idea.sourceId+"-"+i}>
     <button type="button" className={css.ideaMain} onClick={()=>onChoose(idea,scan.id)}>
      <span className={css.number}>{i+1}</span>
      <span className={css.words}>
       <span className={css.ideaLabel}>{L("Idea sugerida por IA","AI-suggested idea")}</span>
       <strong>{trim(idea.hook,110)}</strong><small>{trim(idea.concept,145)}</small>
      </span>
      <ChevronRight size={18}/>
     </button>
     {video?<div className={css.sourceCard}>
      <span className={css.sourceLabel}>{L("Video original verificado en YouTube","Original video from YouTube")}</span>
      <a className={css.sourceLink} href={video.url} target="_blank" rel="noopener noreferrer"
       aria-label={L("Abrir video original de YouTube","Open original YouTube video")}>
       {video.thumbnail?<img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"/>:null}
       <span className={css.sourceWords}>
        <strong>{trim(video.title,140)}</strong>
        <small>{trim(video.channel,70)} · {new Date(video.publishedAt).toLocaleDateString(en?"en-US":"es-US")}</small>
        <span>{compact(video.views)} {L("vistas acumuladas del video original","cumulative views on the original video")} <ArrowUpRight size={13}/></span>
       </span>
      </a>
     </div>:null}
    </article>;
   })}</div>
   <button type="button" className={css.minor} onClick={skip}>{L("Crear con mi tema sin análisis","Create from my topic without research")}</button>
  </>:null}
  {mode==="failed"?<div className={css.failed}>
   <p role="alert">{failure}</p>
   <div className={css.failureActions}>
    <button type="button" onClick={()=>void start()}><RotateCcw size={16}/>{L("Reintentar","Retry")}</button>
    <button type="button" onClick={skip}>{L("Crear con mi tema sin investigar","Create from my topic")}</button>
   </div>
  </div>:null}
 </div>;
}