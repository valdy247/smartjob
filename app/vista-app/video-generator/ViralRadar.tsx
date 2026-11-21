"use client";
import {useEffect,useState} from "react";
import {ArrowUpRight,BarChart3,CheckCircle2,ChevronDown,ChevronUp,
 ExternalLink,Lightbulb,LoaderCircle,PlayCircle,RefreshCw,Search,Sparkles,Youtube} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {RadarVideo,RadarIdea} from "@/lib/vmv-video-radar";
import css from "./ViralRadar.module.css";

type Scan={id:string;query:string;days:number;status:string;items:RadarVideo[];
 ideas:RadarIdea[];createdAt:string;failure:string|null};
type Props={niche:string;en:boolean;selectedSource:string;onChoose:(idea:RadarIdea,scanId:string)=>void;onClear:()=>void};
const compact=(n:number)=>new Intl.NumberFormat("es-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const errors:Record<string,[string,string]>={
 radar_youtube_key_missing:["Falta conectar YouTube Data API en Vercel.","Connect YouTube Data API in Vercel."],
 radar_youtube_quota_or_access:["YouTube rechazó la consulta o alcanzó su cuota.","YouTube denied this search or its quota was reached."],
 radar_youtube_unavailable:["YouTube no respondió. Prueba más tarde.","YouTube is temporarily unavailable."],
 radar_database_unavailable:["No se pudo guardar esta búsqueda.","Research could not be saved."],
 radar_daily_limit:["Límite de 6 investigaciones por día.","Maximum 6 fresh searches per day."],
 radar_ai_unavailable:["La IA no pudo preparar ideas. Puedes seguir viendo las fuentes.","AI couldn't prepare ideas. Sources remain available."],
 radar_empty:["No hay videos adecuados para generar ideas.","No suitable videos to build ideas."],
 radar_consent_required:["Acepta primero las condiciones del Radar.","Accept the Radar terms before searching."]
};
export default function ViralRadar({niche,en,selectedSource,onChoose,onClear}:Props){
 const [open,setOpen]=useState(false),[period,setPeriod]=useState(30);
 const [term,setTerm]=useState(niche),[loading,setLoading]=useState(""),[error,setError]=useState("");
 const [scan,setScan]=useState<Scan|null>(null),[history,setHistory]=useState<Scan[]>([]);
 const [configured,setConfigured]=useState<boolean|null>(null);
 const [consent,setConsent]=useState(false);
 const L=(es:string,english:string)=>en?english:es;
 const auth=async()=>{
  const db=getSupabase();if(!db)throw Error("login");
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("login");
  return session.access_token;
 };
 const request=async(path:string,method="GET",body?:Record<string,unknown>)=>{
  const token=await auth();
  const res=await fetch("/api/video-generator/radar"+path,{
   method,cache:"no-store",
   headers:{Authorization:"Bearer "+token,"X-VMV-YouTube-Consent":consent?"accepted":"",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await res.json().catch(()=>({error:"network"}));
  if(!res.ok)throw Error(String(data.error||"network"));
  return data;
 };
 useEffect(()=>{
  if(!consent)return;
  let active=true;
  void request("").then(data=>{
   if(active){setConfigured(data.configured===true);setHistory((data.history||[]) as Scan[]);}
  }).catch(()=>{if(active)setConfigured(null);});
  return()=>{active=false;};
 },[consent]);
 useEffect(()=>{setTerm(niche);setScan(null);},[niche]);
 useEffect(()=>{if(!scan||scan.status!=="pending")return;
  let active=true;
  const timer=window.setInterval(()=>{
   void request("?id="+encodeURIComponent(scan.id)).then(data=>{
    if(active)setScan(data.scan as Scan);
   }).catch(()=>{if(active)setError(L("No se pudo actualizar el análisis.","Unable to refresh this analysis."));});
  },3000);
  return()=>{active=false;window.clearInterval(timer);};
 },[scan?.id,scan?.status]);
 const search=async()=>{
  if(loading||!consent)return;
  setLoading("search");setError("");setScan(null);
  try{
   const q=term.trim().replace(/\s+/g," ");
   if(q.length<3||q.length>90)throw Error("query");
   const data=await request("?q="+encodeURIComponent(q)+"&days="+period);
   setScan(data.scan as Scan);
  }catch(e){const code=e instanceof Error?e.message:"network";setError(
   errors[code]?.[en?1:0]||L("No se pudo investigar este tema.","Couldn't research this topic.")
  );}
  finally{setLoading("");}
 };
 const makeIdeas=async()=>{
  if(!scan||scan.status!=="ready"||loading)return;
  setLoading("ideas");setError("");
  try{const data=await request("","POST",{scanId:scan.id});setScan(data.scan as Scan);}
  catch(e){const code=e instanceof Error?e.message:"network";setError(
   errors[code]?.[en?1:0]||L("No se pudieron generar ideas.","Couldn't generate ideas.")
  );}
  finally{setLoading("");}
 };
 const clearHistory=async()=>{
  if(loading||!window.confirm(L(
   "¿Eliminar tus investigaciones de Radar Viral? Esto también quitará la idea vinculada al plan. No afecta videos de YouTube.",
   "Delete your Viral Radar research? This also removes the linked idea from your plan. YouTube videos are unaffected.")))return;
  setLoading("delete");setError("");
  try{
   await request("","DELETE");
   setScan(null);setHistory([]);onClear();
  }catch{setError(L("No se pudieron borrar las investigaciones.","Couldn't delete your research."));}
  finally{setLoading("");}
 };
 const active=scan?.status==="ready"&&scan.items.length>0;
 return <section className={css.root}>
  <button type="button" className={css.launch} aria-expanded={open} onClick={()=>{
   if(!open&&term!==niche&&!scan)setTerm(niche);
   setOpen(v=>!v);
  }}>
   <span className={css.launchIcon}><Search size={21}/></span>
   <span><strong>{L("Investigar mi mercado","Research my market")}</strong>
    <small>{L("Ver videos reales y detectar oportunidades","See real videos and spot opportunities")}</small>
   </span>
   {open?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
  </button>
  {selectedSource?<div className={css.selectedInfo}><CheckCircle2 size={16}/>
   {L("Idea original elegida para tu piloto","Original idea selected for your pilot")}
  </div>:null}
  {open?<div className={css.panel}>
   <div className={css.source}><Youtube size={21}/><span>
    <strong>YouTube · {L("fuentes públicas","public sources")}</strong>
    <small>{L("Reels / Shorts de hasta 4 minutos · no analizamos el video completo","Short videos up to 4 minutes · metadata only")}</small>
   </span></div>
   <label className={css.consent}>
    <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    <span>{L("Acepto el uso de datos públicos de YouTube según","I accept public YouTube data usage under")}{" "}
     <a href="/vista-app/video-generator/radar-privacy" target="_blank" rel="noopener noreferrer">{L("Privacidad de Radar","Radar Privacy")}</a>{" "}
     {L("y","and")}{" "}<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">{L("Términos de YouTube","YouTube Terms")}</a>.
    </span>
   </label>
   <div className={css.queryLine}>
    <input value={term} maxLength={90} onChange={e=>setTerm(e.target.value)}
     aria-label={L("Buscar tema","Search topic")} placeholder={L("Tema o producto","Topic or product")}/>
    <button type="button" disabled={!consent||Boolean(loading)||term.trim().length<3} onClick={()=>void search()}>
     {loading==="search"?<LoaderCircle size={17} className={css.spin}/>:<Search size={17}/>}
     {L("Buscar","Search")}
    </button>
   </div>
   <div className={css.filters}>
    {([7,30,90] as const).map(days=><button type="button" key={days} onClick={()=>setPeriod(days)}
     aria-pressed={period===days} className={period===days?css.activePeriod:""}>{days} {L("días","days")}</button>)}
    <span>{L("Máx. 6 búsquedas nuevas/día","Up to 6 new searches/day")}</span>
   </div>
   {configured===false?<p className={css.notice}>
    {L("YouTube todavía no está conectado. El administrador debe configurar YOUTUBE_DATA_API_KEY.",
     "YouTube isn't connected. An administrator must configure YOUTUBE_DATA_API_KEY.")}
   </p>:null}
   {error?<p role="alert" className={css.error}>{error}</p>:null}
   {scan?.status==="pending"?<p className={css.loading}><LoaderCircle size={18} className={css.spin}/>
    {L("Investigación en curso…","Research in progress…")}</p>:null}
   {scan?.status==="failed"?<p className={css.error}>{L("No se completó la búsqueda.","Search was not completed.")}</p>:null}
   {scan?.status==="ready"?<>
    <div className={css.resultHeader}><strong>{L("Videos encontrados","Videos found")} · {scan.items.length}</strong>
     <small>{L("Consulta","Scanned")} {new Date(scan.createdAt).toLocaleDateString(en?"en-US":"es-US")}</small>
    </div>
    {!scan.items.length?<p className={css.notice}>{L("No encontramos videos recientes. Cambia el término o periodo.","No recent videos found. Try another topic or period.")}</p>:null}
    <div className={css.videoList}>{scan.items.map(v=><article className={css.videoCard} key={v.id}>
     <a className={css.thumbLink} href={v.url} target="_blank" rel="noopener noreferrer"
      aria-label={L("Abrir video original en YouTube","Open original YouTube video")}>
      <img alt="" loading="lazy" src={v.thumbnail}/>
      <span><PlayCircle size={19}/></span>
     </a>
     <div className={css.videoMeta}>
      <strong title={v.title}>{v.title}</strong>
      <small>{v.channel} · {new Date(v.publishedAt).toLocaleDateString(en?"en-US":"es-US")}</small>
      <div className={css.stats}>
       <span><BarChart3 size={13}/>{compact(v.views)} {L("vistas","views")}</span>
       {v.likes!==null?<span>{compact(v.likes)} {L("me gusta","likes")}</span>:null}
       {v.comments!==null?<span>{compact(v.comments)} {L("comentarios","comments")}</span>:null}
      </div>
      <a className={css.sourceLink} href={v.url} target="_blank" rel="noopener noreferrer">
       {L("Ver fuente","View source")} <ExternalLink size={13}/></a>
     </div>
    </article>)}</div>
    <p className={css.disclaimer}>
     {L("Estadísticas públicas comunicadas por YouTube. No representan crecimiento en tiempo real ni garantizan ventas. Las ideas de IA son hipótesis basadas en metadatos; no hemos visto los videos.",
      "Raw public statistics from YouTube. No real-time growth or sales guarantees. AI ideas are metadata-based hypotheses; videos were not viewed.")}
    </p>
    {active?<div className={css.ideasBox}>
     <div><Lightbulb size={20}/><strong>{L("Ideas originales","Original concepts")}</strong></div>
     {!scan.ideas.length?<button type="button" className={css.ideasButton} disabled={Boolean(loading)}
      onClick={()=>void makeIdeas()}>{loading==="ideas"?<LoaderCircle size={17} className={css.spin}/>:<Sparkles size={17}/>}
      {L("Crear 3 ideas con IA","Generate 3 AI ideas")}</button>:null}
     {scan.ideas.map((idea,i)=><div className={css.idea} key={idea.sourceId+"-"+i}>
      <strong>{idea.hook}</strong>
      <p>{idea.concept}</p>
      <small>{idea.reason}</small>
      <button type="button" onClick={()=>onChoose(idea,scan.id)}><CheckCircle2 size={16}/>{L("Usar esta idea","Use this idea")}</button>
     </div>)}
    </div>:null}
   </>:null}
   {!scan&&history.length?<div className={css.history}><strong>{L("Investigaciones anteriores","Previous research")}</strong>
    <div>{history.slice(0,3).map(h=><button key={h.id} type="button" onClick={()=>{
     setScan(h);setTerm(h.query);setPeriod(h.days);
    }}>{h.query} <ArrowUpRight size={13}/></button>)}</div>
   </div>:null}
   {(scan||history.length)>0?<button type="button" className={css.deleteAction}
    disabled={Boolean(loading)} onClick={()=>void clearHistory()}>
    {L("Borrar mis investigaciones","Delete my research")}
   </button>:null}
   <p className={css.providerHint}>{L("Solo fuentes públicas de YouTube. Instagram y TikTok se integrarán con acceso autorizado.",
    "Public YouTube data only. Instagram and TikTok require separate authorized integrations.")}</p>
  </div>:null}
 </section>;
}
