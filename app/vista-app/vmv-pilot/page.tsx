"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,CalendarDays,Check,Clapperboard,History,LoaderCircle,Plus,Sparkles,Target,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {Preview} from "../video-generator/CreativeGenerator";
import ViralRadar from "../video-generator/ViralRadar";
import type {RadarIdea} from "@/lib/vmv-video-radar";
import styles from "./page.module.css";

type Screen="home"|"create"|"history";
type Style="realistic"|"cinematic"|"animated"|"product";
type Pilot={id:string;niche:string;audience:string;goal:string;style:Style;frequency:number;
 monthly_budget_cents:number;delivery:string;status:string;created_at:string;
 research_scan_id:string|null;creative_seed:string;research_video_id:string};
const goals=[
 ["Atraer clientes","Attract customers"],
 ["Conseguir reservas","Get bookings"],
 ["Generar ventas","Drive sales"],
 ["Hacer crecer mi marca","Grow my brand"]
] as const;
const stylesOptions:{id:Style;label:string;preview:"realistic"|"cinematic"|"cartoon"|"stickman"}[]=[
 {id:"realistic",label:"Realista",preview:"realistic"},
 {id:"cinematic",label:"Cinemático",preview:"cinematic"},
 {id:"animated",label:"Cartoon",preview:"cartoon"},
 {id:"product",label:"Producto",preview:"realistic"}
];
const defaults={niche:"",audience:"",goal:"Atraer clientes",style:"realistic" as Style,
 frequency:3,monthly_budget_cents:0,creative_seed:"",research_video_id:"",research_scan_id:null as string|null};

export default function VMVPilotPage(){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const [screen,setScreen]=useState<Screen>("home");
 const [step,setStep]=useState(0);
 const [form,setForm]=useState(defaults);
 const [pilots,setPilots]=useState<Pilot[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const update=(changes:Partial<typeof defaults>)=>setForm(prev=>({...prev,...changes}));
 const token=async()=>{
  const db=getSupabase();if(!db)throw Error(L("Inicia sesión.","Sign in."));
  const {data:{session}}=await db.auth.getSession();
  if(!session)throw Error(L("Inicia sesión.","Sign in."));
  return session.access_token;
 };
 const request=async(method="GET",payload?:Record<string,unknown>)=>{
  const access=await token();
  const res=await fetch("/api/video-generator"+(method==="POST"?"/pilot":""),{
   method,cache:"no-store",headers:{Authorization:"Bearer "+access,...(payload?{"Content-Type":"application/json"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(String(data.error||"No se pudo completar la solicitud."));
  return data;
 };
 const refresh=async()=>{
  setLoading(true);setError("");
  try{const data=await request();setPilots((data.pilots||[]) as Pilot[]);}
  catch(e){setError(e instanceof Error?e.message:L("No pudimos cargar tus campañas.","Couldn't load campaigns."));}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refresh();},[]);
 const start=()=>{setForm(defaults);setStep(0);setError("");setScreen("create");};
 const back=()=>{
  setError("");
  if(screen==="create"&&step>0){setStep(n=>n-1);return;}
  if(screen!=="home"){setScreen("home");return;}
  window.location.assign("/vista-app?tab=services");
 };
 const save=async()=>{
  if(busy||form.niche.trim().length<3||form.audience.trim().length<3)return;
  setBusy(true);setError("");
  try{
   const data=await request("POST",{
    ...form,niche:form.niche.trim(),audience:form.audience.trim(),
    model:"gen4.5",delivery:"social_draft"
   });
   if(!data.pilot?.id)throw Error("pilot_save_unavailable");
   setPilots(prev=>[data.pilot as Pilot,...prev.filter(p=>p.id!==data.pilot.id)]);
   setScreen("history");
  }catch(e){setError(e instanceof Error?e.message:L("No se pudo guardar.","Couldn't save campaign."));}
  finally{setBusy(false);}
 };
 const selectedIdea=(idea:RadarIdea,scanId:string)=>{
  update({creative_seed:(idea.hook+" — "+idea.concept).slice(0,450),
   research_video_id:idea.sourceId,research_scan_id:scanId});
 };
 const titles=[
  L("¿Qué negocio o tema?","Business or topic?"),
  L("¿Cuál es tu objetivo?","What's your goal?"),
  L("¿A quién quieres llegar?","Who is your audience?"),
  L("Elige un estilo","Choose a style"),
  L("Videos por semana","Videos per week"),
  L("Presupuesto mensual estimado","Estimated monthly budget"),
  L("Revisar campaña","Review campaign")
 ];
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.header}>
   <button type="button" onClick={back} aria-label={L("Atrás","Back")}><ArrowLeft size={20}/></button>
   <strong>VMV Pilot</strong><InterfaceLanguagePicker compact/>
  </header>
  {screen==="home"?<>
   <h1>VMV Pilot</h1>
   <div className={styles.tiles}>
    <button type="button" onClick={start}><WandSparkles size={31}/><strong>{L("Crear campaña","Create campaign")}</strong></button>
    <button type="button" onClick={()=>{setScreen("history");void refresh();}}><History size={31}/><strong>{L("Mis campañas","My campaigns")}</strong></button>
   </div>
  </>:null}
  {screen==="create"?<>
   <div className={styles.progress}>{step+1} / 7</div>
   <h1>{titles[step]}</h1>
   {step===0?<div className={styles.inputPanel}>
    <input autoFocus value={form.niche} maxLength={160}
     placeholder={L("Ej. Panadería y pasteles personalizados","e.g. Custom cakes and bakery")}
     onChange={e=>update({niche:e.target.value})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.niche.trim().length>=3)setStep(1);}}/>
    <button type="button" className={styles.arrow} aria-label={L("Siguiente","Next")} disabled={form.niche.trim().length<3} onClick={()=>setStep(1)}><ArrowRight/></button>
   </div>:null}
   {step===1?<div className={styles.choices}>
    {goals.map(([es,english])=><button type="button" key={es}
     onClick={()=>{update({goal:es});setStep(2);}}><Target size={18}/>{en?english:es}</button>)}
   </div>:null}
   {step===2?<div className={styles.inputPanel}>
    <input autoFocus value={form.audience} maxLength={180}
     placeholder={L("Ej. Personas que buscan pasteles para eventos","e.g. Customers planning events")}
     onChange={e=>update({audience:e.target.value})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.audience.trim().length>=3)setStep(3);}}/>
    <button type="button" className={styles.arrow} aria-label={L("Siguiente","Next")} disabled={form.audience.trim().length<3} onClick={()=>setStep(3)}><ArrowRight/></button>
   </div>:null}
   {step===3?<div className={styles.styleGrid}>{stylesOptions.map(item=><button key={item.id} type="button"
    onClick={()=>{update({style:item.id});setStep(4);}}>
    <Preview id={item.preview}/><strong>{item.label}</strong>
   </button>)}</div>:null}
   {step===4?<div className={styles.tiles}>
    {([1,3,5,7] as const).map(n=><button key={n} type="button"
     onClick={()=>{update({frequency:n});setStep(5);}}>
     <CalendarDays size={25}/><strong>{n}</strong></button>)}
   </div>:null}
   {step===5?<div className={styles.tiles}>
    {([0,1500,3000,6000] as const).map(value=><button key={value} type="button"
     onClick={()=>{update({monthly_budget_cents:value});setStep(6);}}>
     <strong>{value===0?L("Sin definir","Not set"):"$"+value/100}</strong></button>)}
   </div>:null}
   {step===6?<div className={styles.review}>
    <div><span>{L("Tema","Topic")}</span><strong>{form.niche}</strong></div>
    <div><span>{L("Objetivo","Goal")}</span><strong>{form.goal}</strong></div>
    <div><span>{L("Público","Audience")}</span><strong>{form.audience}</strong></div>
    <div><span>{L("Estilo","Style")}</span><strong>{stylesOptions.find(s=>s.id===form.style)?.label}</strong></div>
    <div><span>{L("Frecuencia","Frequency")}</span><strong>{form.frequency} / {L("semana","week")}</strong></div>
    <div><span>{L("Presupuesto","Budget")}</span><strong>{form.monthly_budget_cents?"$"+form.monthly_budget_cents/100:L("Sin definir","Not set")}</strong></div>
    <details className={styles.research}>
     <summary>{L("Investigar tendencias (opcional)","Research trends (optional)")}</summary>
     <ViralRadar niche={form.niche} en={en} selectedSource={form.research_video_id}
      onChoose={selectedIdea} onClear={()=>update({creative_seed:"",research_video_id:"",research_scan_id:null})}/>
    </details>
    {form.creative_seed?<p className={styles.inspiration}><Check size={16}/>{L("Idea del Radar seleccionada","Radar idea selected")}</p>:null}
    <p className={styles.warning}>{L("Se guardará en pausa. No genera cargos ni publica automáticamente.","Saved paused. No automatic charges or publishing.")}</p>
    <button type="button" className={styles.primary} onClick={()=>void save()} disabled={busy||form.niche.trim().length<3||form.audience.trim().length<3}>
     {busy?<LoaderCircle className={styles.spin} size={18}/>:<Check size={18}/>}
     {busy?L("Guardando…","Saving…"):L("Guardar campaña","Save campaign")}</button>
   </div>:null}
  </>:null}
  {screen==="history"?<>
   <h1>{L("Mis campañas","My campaigns")}</h1>
   {loading?<p className={styles.empty}><LoaderCircle className={styles.spin} size={18}/> {L("Cargando…","Loading…")}</p>:
   pilots.length?<div className={styles.campaigns}>{pilots.map(p=><article key={p.id} className={styles.campaign}>
    <div><strong>{p.niche}</strong><span>{p.frequency} / {L("semana","week")}</span></div>
    <small>{L("En pausa","Paused")}</small>
    {p.creative_seed?<p>{L("Inspiración guardada","Saved inspiration")}: {p.creative_seed.slice(0,105)}</p>:null}
    <Link href={"/vista-app/ai-agents?service=video&pilot="+encodeURIComponent(p.id)}>
     <Clapperboard size={16}/> {L("Preparar video","Prepare video")}
    </Link>
   </article>)}</div>:<p className={styles.empty}>{L("Todavía no tienes campañas.","No campaigns yet.")}</p>}
   <button type="button" className={styles.primary} onClick={start}><Plus size={18}/>{L("Crear campaña","Create campaign")}</button>
  </>:null}
  {error?<p role="alert" className={styles.error}>{error==="video_not_enabled_for_account"?L("VMV Pilot todavía no está habilitado para esta cuenta.","VMV Pilot is not enabled for this account yet."):error}</p>:null}
 </div></main>;
}
