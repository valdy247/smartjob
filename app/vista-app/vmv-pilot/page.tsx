"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowLeft,ArrowRight,CalendarDays,Check,Clock3,History,LoaderCircle,Plus,Target,Volume2,VolumeX,Subtitles,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {Preview} from "../video-generator/CreativeGenerator";
import ViralRadar from "../video-generator/ViralRadar";
import type {RadarIdea} from "@/lib/vmv-video-radar";
import type {PilotRenderRequest} from "@/components/VMVPilotRenderDock";
import css from "./page.module.css";

type Screen="home"|"create"|"history";
type Style="stickman"|"realistic"|"cinematic"|"animated"|"product";
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
 {id:"stickman",label:"Stickman",preview:"stickman"},
 {id:"realistic",label:"Realista",preview:"realistic"},
 {id:"animated",label:"Cartoon",preview:"cartoon"},
 {id:"cinematic",label:"Cinemático",preview:"cinematic"}
];
const defaults={id:"",niche:"",audience:"Público general",goal:"Hacer crecer mi marca",
 style:"stickman" as Style,frequency:3,monthly_budget_cents:0,
 creative_seed:"",research_video_id:"",research_scan_id:null as string|null,
 seconds:60 as 15|30|60,narration:true,subtitles:true};

export default function VMVPilotPage(){
 const router=useRouter();
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const [screen,setScreen]=useState<Screen>("home"),[step,setStep]=useState(0);
 const [form,setForm]=useState(defaults),[approved,setApproved]=useState(false);
 const [pilots,setPilots]=useState<Pilot[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const update=(changes:Partial<typeof defaults>)=>setForm(prev=>({...prev,...changes}));
 const token=async()=>{
  const client=getSupabase();if(!client)throw Error(L("Inicia sesión.","Sign in."));
  const {data:{session}}=await client.auth.getSession();
  if(!session)throw Error(L("Inicia sesión.","Sign in."));
  return session.access_token;
 };
 const request=async(method="GET",payload?:Record<string,unknown>)=>{
  const access=await token();
  const res=await fetch("/api/video-generator"+(method==="POST"?"/pilot":""),{
   method,cache:"no-store",
   headers:{Authorization:"Bearer "+access,...(payload?{"Content-Type":"application/json"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(String(data.error||"No se pudo completar."));
  return data;
 };
 const refresh=async()=>{
  setLoading(true);setError("");
  try{const data=await request();setPilots((data.pilots||[]) as Pilot[]);}
  catch(e){setError(e instanceof Error?e.message:L("No pudimos cargar tus campañas.","Couldn't load campaigns."));}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refresh();},[]);
 const start=()=>{setForm(defaults);setStep(0);setError("");setApproved(false);setScreen("create");};
 const edit=(pilot:Pilot)=>{
  setForm({...defaults,id:pilot.id,niche:pilot.niche,audience:pilot.audience,
   goal:pilot.goal,style:pilot.style,frequency:pilot.frequency,
   monthly_budget_cents:pilot.monthly_budget_cents||0,
   creative_seed:pilot.creative_seed||"",research_video_id:pilot.research_video_id||"",
   research_scan_id:pilot.research_scan_id||null});
  setStep(8);setError("");setApproved(false);setScreen("create");
 };
 const back=()=>{
  setError("");
  if(screen==="create"&&step>0){setStep(n=>n-1);return;}
  if(screen!=="home"){setScreen("home");return;}
  router.push("/vista-app?tab=services");
 };
 const generate=async()=>{
  if(busy||!approved||form.niche.trim().length<3)return;
  setBusy(true);setError("");
  try{
   const data=await request("POST",{
    ...form,id:form.id||undefined,niche:form.niche.trim(),audience:form.audience.trim(),
    model:"gen4.5",delivery:"social_draft"
   });
   if(!data.pilot?.id)throw Error("pilot_save_unavailable");
   const saved=data.pilot as Pilot;
   const details:PilotRenderRequest={
    pilotId:saved.id,
    topic:(form.creative_seed||form.niche).slice(0,220),
    audience:form.audience,goal:form.goal,style:form.style,
    seconds:form.seconds,narration:form.narration,subtitles:form.subtitles,
    language:en?"en":"es"
   };
   window.dispatchEvent(new CustomEvent<PilotRenderRequest>("vmv-pilot:generate",{detail:details}));
   setPilots(prev=>[saved,...prev.filter(p=>p.id!==saved.id)]);
   setScreen("history");
  }catch(e){setError(e instanceof Error?e.message:L("No se pudo guardar.","Couldn't save campaign."));}
  finally{setBusy(false);}
 };
 const selectedIdea=(idea:RadarIdea,scanId:string)=>{
  update({creative_seed:(idea.hook+" — "+idea.concept).slice(0,450),
   research_video_id:idea.sourceId,research_scan_id:scanId});
 };
 const titles=[
  L("¿Qué tema?","What's your topic?"),
  L("Tu objetivo","Your goal"),
  L("Tu público","Your audience"),
  L("Elige un estilo","Choose a style"),
  L("Duración","Duration"),
  L("Videos por semana","Videos per week"),
  L("Narración","Narration"),
  L("Subtítulos","Subtitles"),
  L("Tu video","Your video")
 ];
 return <main className={css.page}><div className={css.shell}>
  <header className={css.header}>
   <button type="button" onClick={back} aria-label={L("Atrás","Back")}><ArrowLeft size={20}/></button>
   <strong>VMV Pilot</strong><InterfaceLanguagePicker compact/>
  </header>
  {screen==="home"?<>
   <h1>VMV Pilot</h1>
   <div className={css.tiles}>
    <button type="button" onClick={start}><WandSparkles size={31}/><strong>{L("Crear campaña","Create campaign")}</strong></button>
    <button type="button" onClick={()=>{setScreen("history");void refresh();}}><History size={31}/><strong>{L("Mis campañas","My campaigns")}</strong></button>
   </div>
  </>:null}
  {screen==="create"?<>
   <div className={css.progress}>{step+1} / 9</div>
   <h1>{titles[step]}</h1>
   {step===0?<div className={css.inputPanel}>
    <input autoFocus value={form.niche} maxLength={160}
     placeholder={L("Ej. Curiosidades del universo","e.g. Space curiosities")}
     onChange={e=>update({niche:e.target.value,creative_seed:"",research_video_id:"",research_scan_id:null})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.niche.trim().length>=3)setStep(1);}}/>
    <button type="button" className={css.arrow} aria-label={L("Siguiente","Next")}
     disabled={form.niche.trim().length<3} onClick={()=>setStep(1)}><ArrowRight/></button>
   </div>:null}
   {step===1?<div className={css.choices}>{goals.map(([es,english])=>
    <button type="button" key={es} onClick={()=>{update({goal:es});setStep(2);}}>
     <Target size={18}/>{en?english:es}</button>)}</div>:null}
   {step===2?<div className={css.inputPanel}>
    <input autoFocus value={form.audience} maxLength={180}
     placeholder={L("Ej. Jóvenes interesados en ciencia","e.g. Young people interested in science")}
     onChange={e=>update({audience:e.target.value})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.audience.trim().length>=3)setStep(3);}}/>
    <button type="button" className={css.arrow} aria-label={L("Siguiente","Next")}
     disabled={form.audience.trim().length<3} onClick={()=>setStep(3)}><ArrowRight/></button>
   </div>:null}
   {step===3?<div className={css.styleGrid}>{stylesOptions.map(item=>
    <button key={item.id} type="button" onClick={()=>{update({style:item.id});setStep(4);}}>
     <Preview id={item.preview}/><strong>{item.label}</strong>
    </button>)}</div>:null}
   {step===4?<div className={css.tiles}>{([15,30,60] as const).map(n=>
    <button key={n} type="button" onClick={()=>{update({seconds:n});setStep(5);}}>
     <Clock3 size={25}/><strong>{n}s</strong></button>)}</div>:null}
   {step===5?<div className={css.tiles}>{([1,3,5,7] as const).map(n=>
    <button key={n} type="button" onClick={()=>{update({frequency:n});setStep(6);}}>
     <CalendarDays size={25}/><strong>{n}</strong></button>)}</div>:null}
   {step===6?<div className={css.tiles}>
    <button type="button" onClick={()=>{update({narration:true});setStep(7);}}>
     <Volume2 size={29}/><strong>{L("Con voz","With voice")}</strong></button>
    <button type="button" onClick={()=>{update({narration:false});setStep(7);}}>
     <VolumeX size={29}/><strong>{L("Sin voz","No voice")}</strong></button>
   </div>:null}
   {step===7?<div className={css.tiles}>
    <button type="button" onClick={()=>{update({subtitles:true});setStep(8);}}>
     <Subtitles size={29}/><strong>{L("Con subtítulos","With subtitles")}</strong></button>
    <button type="button" onClick={()=>{update({subtitles:false});setStep(8);}}>
     <Subtitles size={29}/><strong>{L("Sin subtítulos","No subtitles")}</strong></button>
   </div>:null}
   {step===8?<div className={css.review}>
    <div><span>{L("Tema","Topic")}</span><strong>{form.niche}</strong></div>
    <div><span>{L("Estilo","Style")}</span><strong>{stylesOptions.find(s=>s.id===form.style)?.label||"Producto"}</strong></div>
    <div><span>{L("Duración","Duration")}</span><strong>{form.seconds}s · 9:16</strong></div>
    <div><span>{L("Voz","Voice")}</span><strong>{form.narration?L("Sí","Yes"):L("No","No")}</strong></div>
    <div><span>{L("Subtítulos","Subtitles")}</span><strong>{form.subtitles?L("Sí","Yes"):L("No","No")}</strong></div>
    <details className={css.research}>
     <summary>{L("Tendencias","Trends")}</summary>
     <ViralRadar niche={form.niche} en={en} selectedSource={form.research_video_id}
      onChoose={selectedIdea} onClear={()=>update({creative_seed:"",research_video_id:"",research_scan_id:null})}/>
    </details>
    {form.creative_seed?<p className={css.inspiration}><Check size={16}/>{L("Idea seleccionada","Idea selected")}</p>:null}
    <label className={css.consent}>
     <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
     <span>{L("Autorizo usar créditos de IA para este video.","I approve AI credits for this video.")}</span>
    </label>
    <button type="button" className={css.primary} onClick={()=>void generate()}
     disabled={!approved||busy||form.niche.trim().length<3}>
     {busy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {busy?L("Preparando…","Preparing…"):L("Generar video","Generate video")}</button>
   </div>:null}
  </>:null}
  {screen==="history"?<>
   <h1>{L("Mis campañas","My campaigns")}</h1>
   {loading?<p className={css.empty}><LoaderCircle className={css.spin} size={18}/> {L("Cargando…","Loading…")}</p>:
   pilots.length?<div className={css.campaigns}>{pilots.map(p=><article key={p.id} className={css.campaign}>
    <div><strong>{p.niche}</strong><span>{p.frequency} / {L("semana","week")}</span></div>
    <small>{L("En pausa","Paused")}</small>
    <button type="button" className={css.campaignAction} onClick={()=>edit(p)}>
     <WandSparkles size={17}/> {L("Crear video","Create video")}</button>
   </article>)}</div>:<p className={css.empty}>{L("Todavía no tienes campañas.","No campaigns yet.")}</p>}
   <button type="button" className={css.primary} onClick={start}><Plus size={18}/>{L("Crear campaña","Create campaign")}</button>
  </>:null}
  {error?<p role="alert" className={css.error}>{error==="video_not_enabled_for_account"?
   L("VMV Pilot todavía no está habilitado para esta cuenta.","VMV Pilot is not enabled for this account yet."):error}</p>:null}
 </div></main>;
}