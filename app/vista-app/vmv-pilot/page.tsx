"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowLeft,ArrowRight,CalendarDays,Check,Clock3,History,LoaderCircle,Plus,Target,Volume2,VolumeX,Subtitles,WandSparkles,Lightbulb,FlaskConical,Landmark,Gamepad2,BookOpen,BriefcaseBusiness,Cpu,UsersRound,Pencil,Smile,GraduationCap,Heart,ShoppingBag,PartyPopper,Zap,Sparkles,GitCompareArrows,Clapperboard} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {Preview} from "../video-generator/CreativeGenerator";
import PilotTrendStep from "./PilotTrendStep";
import PilotVoiceStep from "./PilotVoiceStep";
import {PILOT_LANGUAGES,type PilotLanguage,type PilotVoiceProvider} from "@/lib/vmv-pilot-voice-config";
import {pilotQualityOptions,animationCostCents,priceUSD,type PilotQuality} from "@/lib/vmv-pilot-quality";
import type {RadarIdea} from "@/lib/vmv-video-radar";
import type {PilotRenderRequest} from "@/components/VMVPilotRenderDock";
import css from "./page.module.css";

type Screen="home"|"create"|"history";
type Style="stickman"|"realistic"|"cinematic"|"animated"|"product";
type Pilot={id:string;niche:string;audience:string;goal:string;style:Style;frequency:number;
 monthly_budget_cents:number;delivery:string;status:string;created_at:string;
 research_scan_id:string|null;creative_seed:string;research_video_id:string;
 language?:PilotLanguage;voice_provider?:PilotVoiceProvider;voice_id?:string;seconds?:number;subtitles?:boolean;quality_mode?:PilotQuality};
const goals=[
 ["Entretener","Entertain"],["Enseñar","Teach"],["Informar","Inform"],
 ["Inspirar","Inspire"],["Promocionar","Promote"],["Vender","Sell"]
] as const;
const niches=[
 {es:"Curiosidades",en:"Fun facts",Icon:Lightbulb},
 {es:"Ciencia",en:"Science",Icon:FlaskConical},
 {es:"Historia",en:"History",Icon:Landmark},
 {es:"Tecnología",en:"Technology",Icon:Cpu},
 {es:"Entretenimiento",en:"Entertainment",Icon:Gamepad2},
 {es:"Educación",en:"Education",Icon:BookOpen},
 {es:"Negocios",en:"Business",Icon:BriefcaseBusiness}
] as const;
const audiences=[
 {es:"Todos",en:"Everyone",value:"Público general",Icon:UsersRound},
 {es:"Niños",en:"Kids",value:"Niños",Icon:Smile},
 {es:"Adolescentes",en:"Teens",value:"Adolescentes",Icon:Gamepad2},
 {es:"Jóvenes",en:"Young adults",value:"Jóvenes",Icon:GraduationCap},
 {es:"Adultos",en:"Adults",value:"Adultos",Icon:UsersRound},
 {es:"Familias",en:"Families",value:"Familias",Icon:Heart},
 {es:"Emprendedores",en:"Entrepreneurs",value:"Emprendedores",Icon:ShoppingBag}
] as const;
const stylesOptions:{id:Style;label:string;preview:"realistic"|"cinematic"|"cartoon"|"stickman"}[]=[
 {id:"stickman",label:"Stickman",preview:"stickman"},
 {id:"realistic",label:"Realista",preview:"realistic"},
 {id:"animated",label:"Cartoon",preview:"cartoon"},
 {id:"cinematic",label:"Cinemático",preview:"cinematic"}
];
const defaults={id:"",niche:"",audience:"Público general",goal:"Entretener",
 style:"stickman" as Style,frequency:3,monthly_budget_cents:0,
 creative_seed:"",research_video_id:"",research_scan_id:null as string|null,
 seconds:60 as 15|30|60,narration:true,subtitles:true,language:"es" as PilotLanguage,
 voiceProvider:"openai" as PilotVoiceProvider,voiceId:"alloy",voiceLabel:"Alloy",qualityMode:"turbo" as PilotQuality};

export default function VMVPilotPage(){
 const router=useRouter();
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const [screen,setScreen]=useState<Screen>("home"),[step,setStep]=useState(0);
 const [form,setForm]=useState(defaults),[approved,setApproved]=useState(false);
 const [motionEngine,setMotionEngine]=useState(false);
 const [pilots,setPilots]=useState<Pilot[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [transitioning,setTransitioning]=useState(false);
 const [customNiche,setCustomNiche]=useState(false),[customAudience,setCustomAudience]=useState(false);
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
 const start=()=>{setMotionEngine(false);setForm(defaults);setStep(0);setCustomNiche(false);setCustomAudience(false);setError("");setApproved(false);setScreen("create");};
 const edit=(pilot:Pilot)=>{
  setMotionEngine(false);
  setForm({...defaults,id:pilot.id,niche:pilot.niche,audience:pilot.audience,
   goal:pilot.goal,style:pilot.style,frequency:pilot.frequency,
   monthly_budget_cents:pilot.monthly_budget_cents||0,
   creative_seed:pilot.creative_seed||"",research_video_id:pilot.research_video_id||"",
   research_scan_id:pilot.research_scan_id||null,
   language:pilot.language||"es",
   voiceProvider:pilot.voice_provider||"openai",
   voiceId:pilot.voice_id||"alloy",
   voiceLabel:pilot.voice_provider==="none"?(en?"No voice":"Sin voz"):
    pilot.voice_provider==="elevenlabs"?"ElevenLabs":pilot.voice_id||"Alloy",
   narration:pilot.voice_provider!=="none",
   seconds:([15,30,60] as const).find(v=>v===pilot.seconds)||60,
   subtitles:pilot.subtitles!==false,qualityMode:pilot.quality_mode||"turbo"});
  setStep(11);setCustomNiche(false);setCustomAudience(false);setError("");setApproved(false);setScreen("create");
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
  let navigating=false;
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
    language:form.language,voiceProvider:form.voiceProvider,voiceId:form.voiceId,
    qualityMode:form.qualityMode
   };
   setPilots(prev=>[saved,...prev.filter(p=>p.id!==saved.id)]);
   if(motionEngine){
    const requestId=crypto.randomUUID();
    const brief=[
     "Produce an original, coherent "+form.seconds+"-second social video.",
     "Topic: "+form.niche.trim()+".",
     "Goal: "+form.goal+". Audience: "+form.audience+".",
     "Visual style: vibrant 2D STICKMAN cartoon with expressive actions and richly colored backgrounds.",
     "Spoken language: "+form.language+".",
     form.creative_seed?"Research-backed selected trend/idea: "+form.creative_seed+".":"Find an engaging original angle within this category.",
     "Start with a captivating hook and do not reveal surprise subjects before their narration.",
     "Session ID (metadata only, never narrate): "+requestId
    ].join(" ").slice(0,1950);
    const handoff={requestId,createdAt:Date.now(),prompt:brief,pilotId:saved.id,
     topic:form.niche,goal:form.goal,audience:form.audience,idea:form.creative_seed,
     researchScanId:form.research_scan_id,researchVideoId:form.research_video_id,
     language:form.language,style:form.style,seconds:form.seconds,subtitles:form.subtitles,
     narration:form.narration,voiceProvider:form.voiceProvider,voiceId:form.voiceId,
     confirmedCost:true};
    sessionStorage.setItem("vmv-pilot-motion-handoff-v1",JSON.stringify(handoff));
    navigating=true;
    setTransitioning(true);
    router.push("/vista-app/vmv-pilot/stickman-lab?pilotMotion="+encodeURIComponent(requestId));
   }else{
    window.dispatchEvent(new CustomEvent<PilotRenderRequest>("vmv-pilot:generate",{detail:details}));
    setScreen("history");
   }
  }catch(e){setError(e instanceof Error?e.message:L("No se pudo guardar.","Couldn't save campaign."));}
  finally{if(!navigating){setBusy(false);setTransitioning(false);}}
 };
 const selectedIdea=(idea:RadarIdea,scanId:string)=>{
  update({creative_seed:(idea.hook+" — "+idea.concept).slice(0,450),
   research_video_id:idea.sourceId,research_scan_id:scanId});
  setStep(10);
 };
 const titles=[
  L("¿Qué tema?","What's your topic?"),
  L("Tu objetivo","Your goal"),
  L("Tu público","Your audience"),
  L("Elige un estilo","Choose a style"),
  L("Duración","Duration"),
  L("Videos por semana","Videos per week"),
  L("Idioma del video","Video language"),
  L("Elige una voz","Choose a voice"),
  L("Subtítulos","Subtitles"),
  L("¿Analizar tendencias?","Analyze trends?"),
  L("Calidad","Quality"),
  L("Tu video","Your video")
 ];
 return <main className={css.page}>
  {transitioning?<div className={css.transitionOverlay} role="status" aria-live="polite">
   <div className={css.transitionCard}>
    <span className={css.transitionIcon}><Clapperboard size={26}/></span>
    <LoaderCircle className={css.spin} size={34}/>
    <strong>Preparando tu estudio</strong>
    <p>Estamos abriendo VMV Motion y organizando tu proyecto.</p>
   </div>
  </div>:null}
  <div className={css.shell}>
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
   <button type="button" className={css.labLink}
    onClick={()=>{setTransitioning(true);router.push("/vista-app/vmv-pilot/stickman-lab");}}>
    <Clapperboard size={19}/>{L("Abrir VMV Motion","Open VMV Motion studio")}
    <ArrowRight size={16}/>
   </button>
  </>:null}
  {screen==="create"?<>
   <div className={css.progress}>{step+1} / 12</div>
   <h1>{titles[step]}</h1>
   {step===0?customNiche?<div className={css.inputPanel}>
    <input autoFocus value={form.niche} maxLength={160}
     placeholder={L("Tu nicho","Your niche")}
     onChange={e=>update({niche:e.target.value,creative_seed:"",research_video_id:"",research_scan_id:null})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.niche.trim().length>=3)setStep(1);}}/>
    <button type="button" className={css.arrow} aria-label={L("Siguiente","Next")}
     disabled={form.niche.trim().length<3} onClick={()=>setStep(1)}><ArrowRight/></button>
   </div>:<div className={css.optionGrid}>{niches.map(({es, en:english,Icon})=>
    <button type="button" key={es} onClick={()=>{update({niche:es,creative_seed:"",research_video_id:"",research_scan_id:null});setStep(1);}}>
     <Icon size={23}/><strong>{en?english:es}</strong>
    </button>)}
    <button type="button" onClick={()=>{update({niche:""});setCustomNiche(true);}}>
     <Pencil size={23}/><strong>{L("Otro","Other")}</strong>
    </button></div>:null}
   {step===1?<div className={css.choices}>{goals.map(([es,english])=>
    <button type="button" key={es} onClick={()=>{update({goal:es});setStep(2);}}>
     <Target size={18}/>{en?english:es}</button>)}</div>:null}
   {step===2?customAudience?<div className={css.inputPanel}>
    <input autoFocus value={form.audience} maxLength={180}
     placeholder={L("Tu público","Your audience")}
     onChange={e=>update({audience:e.target.value})}
     onKeyDown={e=>{if(e.key==="Enter"&&form.audience.trim().length>=3)setStep(3);}}/>
    <button type="button" className={css.arrow} aria-label={L("Siguiente","Next")}
     disabled={form.audience.trim().length<3} onClick={()=>setStep(3)}><ArrowRight/></button>
   </div>:<div className={css.optionGrid}>{audiences.map(({es,en:english,value,Icon})=>
    <button type="button" key={es} onClick={()=>{update({audience:value});setStep(3);}}>
     <Icon size={23}/><strong>{en?english:es}</strong>
    </button>)}
    <button type="button" onClick={()=>{update({audience:""});setCustomAudience(true);}}>
     <Pencil size={23}/><strong>{L("Otro","Other")}</strong>
    </button></div>:null}
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
   {step===6?<div className={css.optionGrid}>{PILOT_LANGUAGES.map(item=>
    <button key={item.id} type="button" onClick={()=>{
     update({language:item.id,voiceProvider:"openai",voiceId:"alloy",voiceLabel:"Alloy",narration:true});
     setStep(7);
    }}><Volume2 size={22}/><strong>{item.native}</strong></button>)}</div>:null}
   {step===7?<PilotVoiceStep language={form.language} en={en} onChoose={(provider,id,name)=>{
    update({voiceProvider:provider,voiceId:id,voiceLabel:name,narration:provider!=="none"});
    setStep(8);
   }}/>:null}
   {step===8?<div className={css.tiles}>
    <button type="button" onClick={()=>{update({subtitles:true});setStep(9);}}>
     <Subtitles size={29}/><strong>{L("Con subtítulos","With subtitles")}</strong></button>
    <button type="button" onClick={()=>{update({subtitles:false});setStep(9);}}>
     <Subtitles size={29}/><strong>{L("Sin subtítulos","No subtitles")}</strong></button>
   </div>:null}
   {step===9?<PilotTrendStep niche={form.niche} language={form.language} en={en}
     onSkip={()=>{update({creative_seed:"",research_video_id:"",research_scan_id:null});setStep(10);}}
     onChoose={selectedIdea}/>:null}
   {step===10?<div className={css.choices}>{pilotQualityOptions.map(item=>
    <button type="button" key={item.id} onClick={()=>{setMotionEngine(false);update({qualityMode:item.id});setStep(11);}}>
     {item.id==="turbo"?<Zap size={21}/>:item.id==="high"?<Sparkles size={21}/>:<GitCompareArrows size={21}/>}
     <strong>{item.id==="compare"?L("Probar ambas","Test both"):item.id==="high"?L("Alta","High"):item.name}</strong>
     <small className={css.qualityPrice}>{priceUSD(animationCostCents(form.seconds,item.id))}</small>
    </button>)}
    <p className={css.qualityNote}>{L("Costo estimado de animación · otros servicios aparte","Estimated animation cost · other services extra")}</p>
    {form.style==="stickman"&&["es","en"].includes(form.language)?<button type="button" className={css.ownEngine}
     onClick={()=>{update({qualityMode:"turbo"});setMotionEngine(true);setApproved(false);setStep(11);}}>
     <Clapperboard size={19}/>{"Crear con VMV Motion · Seedance 720p · "+form.seconds+" s"}
     <ArrowRight size={17}/>
    </button>:null}
   </div>:null}
   {step===11?<div className={css.review}>
    {motionEngine?<div><span>Motor</span><strong>VMV Motion · Seedance 720p · {form.seconds} s</strong></div>:null}
    <div><span>{L("Tema","Topic")}</span><strong>{form.niche}</strong></div>
    <div><span>{L("Estilo","Style")}</span><strong>{stylesOptions.find(s=>s.id===form.style)?.label||"Producto"}</strong></div>
    <div><span>{L("Duración","Duration")}</span><strong>{form.seconds}s · 9:16</strong></div>
    <div><span>{L("Calidad","Quality")}</span><strong>{form.qualityMode==="compare"?L("Probar ambas · 2 videos","Test both · 2 videos"):form.qualityMode==="high"?L("Alta","High"):"Turbo"}</strong></div>
    <div><span>{L("Animación estimada","Estimated animation")}</span>
     <strong>{priceUSD(animationCostCents(form.seconds,form.qualityMode))}</strong></div>
    <div><span>{L("Idioma","Language")}</span><strong>{PILOT_LANGUAGES.find(x=>x.id===form.language)?.native}</strong></div>
    <div><span>{L("Voz","Voice")}</span><strong>{form.narration?form.voiceLabel:L("Sin voz","No voice")}</strong></div>
    <div><span>{L("Subtítulos","Subtitles")}</span><strong>{form.subtitles?L("Sí","Yes"):L("No","No")}</strong></div>
    {form.creative_seed?<div className={css.selectedIdea}>
     <span>{L("Idea seleccionada","Selected idea")}</span>
     <strong>{form.creative_seed.slice(0,160)}</strong>
     <button type="button" onClick={()=>setStep(9)}>{L("Cambiar","Change")}</button>
    </div>:null}
    <label className={css.consent}>
     <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
     <span>{form.qualityMode==="compare"
      ?L("Autorizo generar 2 videos y consumir créditos de IA.","I approve 2 videos and AI credit usage.")
      :L("Autorizo generar el video y consumir créditos de IA.","I approve video generation and AI credit usage.")}</span>
    </label>
    <button type="button" className={css.primary} onClick={()=>void generate()}
     disabled={!approved||busy||form.niche.trim().length<3}>
     {busy?<LoaderCircle className={css.spin} size={18}/>:<WandSparkles size={18}/>}
     {busy?L("Preparando…","Preparing…"):motionEngine?L("Crear con VMV Motion","Create with VMV Motion"):form.qualityMode==="compare"?L("Generar ambos videos","Generate both videos"):L("Generar video","Generate video")}</button>
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