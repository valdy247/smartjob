"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,ArrowUpRight,BookOpen,Check,CheckCircle2,ChevronRight,Clapperboard,Clock3,Download,Film,FolderOpen,Globe2,LoaderCircle,Pencil,PlayCircle,RefreshCw,Search,Sparkles,Subtitles,Video} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import PilotVoiceStep from "../vmv-pilot/PilotVoiceStep";
import type {PilotLanguage,PilotVoiceProvider} from "@/lib/vmv-pilot-voice-config";
import styles from "./page.module.css";

type Stage="home"|"topic"|"audience"|"style"|"duration"|"language"|"voice"|"subtitles"|"source"|"trends"|"plan"|"quality"|"summary"|"images"|"progress"|"result"|"history";
type Style="stickman"|"cartoon2d"|"cartoon3d"|"clay"|"illustrated";
type Quality="turbo"|"high";
type Scene={speech:string;imagePrompt:string;caption:string;approved?:boolean;imageUrl?:string;imagePath?:string};
type Trend={sourceId:string;title:string;thumbnail:string;url:string;channel?:string;views?:number};
type Job={id:string;status:string;phase:string;progress:number;scenes:Scene[];seconds:number;style:string;quality_mode:string;title:string;videoUrl?:string|null;created_at:string;failure_code?:string|null;etaSeconds?:number|null};
const topics=["Curiosidades","Historia","Ciencia","Tecnología","Educación","Entretenimiento","Negocios","Otro"];
const audiences=["Público general","Niños","Adolescentes","Jóvenes","Adultos","Familias","Emprendedores","Otro"];
const durations=[15,30,60,120,180] as const;
const stylesList:{id:Style;label:string;description:string;emoji:string}[]=[
 {id:"stickman",label:"Stickman 2D",description:"Personajes de palitos",emoji:"✏️"},
 {id:"cartoon2d",label:"Cartoon 2D",description:"Dibujos animados",emoji:"🎨"},
 {id:"cartoon3d",label:"Cartoon 3D",description:"Animación tridimensional",emoji:"🧸"},
 {id:"clay",label:"Plastilina 3D",description:"Stop motion artesanal",emoji:"🪁"},
 {id:"illustrated",label:"Cuento ilustrado",description:"Ilustración animada",emoji:"📖"}
];
const labels:Record<Stage,string>={
 home:"Video Studio",topic:"¿Qué tema?",audience:"¿Para quién?",style:"Elige un estilo",duration:"Duración",language:"Idioma del video",voice:"Elige una voz",subtitles:"Subtítulos",source:"¿Analizar tendencias?",trends:"Tendencias",plan:"Tu guion y escenas",quality:"Calidad",summary:"Resumen",images:"Revisa las escenas",progress:"Producción en la nube",result:"Video listo",history:"Historial"
};
const order:Stage[]=["topic","audience","style","duration","language","voice","subtitles","source","trends","plan","quality","summary"];
const estimatedCredits=(seconds:number,quality:Quality)=>Math.ceil(seconds*(quality==="high"?2.5:1));
const readable=(seconds:number)=>seconds>=60?seconds%60===0?seconds/60+" min":Math.floor(seconds/60)+" min "+seconds%60+" s":seconds+" s";
const errorMessages:Record<string,string>={
 video_not_enabled_for_account:"Tu cuenta todavía no tiene acceso a esta prueba.",
 video_studio_not_ready:"La generación en la nube aún no está activada. No se ha cobrado nada.",
 video_studio_db_unavailable:"El historial de Video Studio no está disponible todavía.",
 video_studio_wallet_unavailable:"Los créditos reales todavía no están configurados. No se ha cobrado nada.",
 video_studio_insufficient_credits:"No tienes créditos suficientes para esta generación.",
 video_studio_worker_not_ready:"El procesador de videos todavía no está listo.",
 video_studio_duplicate:"Esta solicitud ya existe. Abre Historial para continuar."
};
const sampleInitial:Scene[]=[];
export default function VideoStudioV1(){
 const {language:uiLanguage}=useInterfaceLanguage();
 const [stage,setStage]=useState<Stage>("home");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [isSignedIn,setIsSignedIn]=useState<boolean|null>(null);
 const [topic,setTopic]=useState(""),[otherTopic,setOtherTopic]=useState("");
 const [audience,setAudience]=useState("Público general"),[otherAudience,setOtherAudience]=useState("");
 const [visual,setVisual]=useState<Style>("stickman");
 const [seconds,setSeconds]=useState(30),[customSeconds,setCustomSeconds]=useState("45");
 const [language,setLanguage]=useState<PilotLanguage>("es");
 const [voiceProvider,setVoiceProvider]=useState<PilotVoiceProvider>("openai"),[voiceId,setVoiceId]=useState("alloy"),[voiceLabel,setVoiceLabel]=useState("Alloy");
 const [subtitles,setSubtitles]=useState(true);
 const [platform,setPlatform]=useState("idea"),[trendResults,setTrendResults]=useState<Trend[]>([]);
 const [selectedTrend,setSelectedTrend]=useState<Trend|null>(null);
 const [title,setTitle]=useState(""),[scenes,setScenes]=useState<Scene[]>(sampleInitial);
 const [quality,setQuality]=useState<Quality>("turbo"),[approvedCost,setApprovedCost]=useState(false);
 const [job,setJob]=useState<Job|null>(null),[jobs,setJobs]=useState<Job[]>([]);
 const [historyLoading,setHistoryLoading]=useState(false),[sceneIndex,setSceneIndex]=useState(0);
 const [savingScene,setSavingScene]=useState(false);
 const [trendConsent,setTrendConsent]=useState(false);
 const [planApproval,setPlanApproval]=useState(false);
 const authenticate=useCallback(async()=>{
  const sb=getSupabase();if(!sb)throw Error("Inicia sesión.");
  const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error("Inicia sesión.");
  return session.access_token;
 },[]);
 const api=useCallback(async(path:string,method="GET",data?:unknown)=>{
  const token=await authenticate();
  const response=await fetch("/api/video-studio/"+path,{method,cache:"no-store",headers:{Authorization:"Bearer "+token,...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw Error(String(json?.error||"video_studio_unavailable"));
  return json;
 },[authenticate]);
 useEffect(()=>{const sb=getSupabase();if(!sb){setIsSignedIn(false);return;}
  let active=true;void sb.auth.getSession().then(x=>{if(active)setIsSignedIn(Boolean(x.data.session));});
  const {data}=sb.auth.onAuthStateChange((_event,session)=>{if(active)setIsSignedIn(Boolean(session));});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 const loadHistory=useCallback(async()=>{
  setHistoryLoading(true);setError("");
  try{const result=await api("jobs");setJobs(Array.isArray(result.jobs)?result.jobs:[]);}
  catch(e){setError(e instanceof Error?e.message:"video_studio_db_unavailable");}
  finally{setHistoryLoading(false);}
 },[api]);
 useEffect(()=>{if(stage!=="progress"&&stage!=="images"||!job?.id)return;
  let active=true;
  const check=async()=>{try{const data=await api("jobs?id="+encodeURIComponent(job.id));
    if(!active||!data?.job)return;setJob(data.job);
    if(data.job.status==="awaiting_image_approval")setStage("images");
    else if(data.job.status==="completed")setStage("result");
  }catch{/* Keep the last server state; next poll may succeed. */}};
  void check();const timer=setInterval(()=>{void check();},6000);
  return()=>{active=false;clearInterval(timer);};
 },[api,stage,job?.id]);
 const next=(s:Stage)=>{setError("");setStage(s)};
 const previous=()=>{setError("");if(stage==="images"||stage==="progress"||stage==="result"){setStage("history");void loadHistory();return;}
  const idx=order.indexOf(stage);setStage(idx>0?order[idx-1]:"home");};
 const reset=()=>{setStage("topic");setTopic("");setOtherTopic("");setAudience("Público general");setVisual("stickman");setSeconds(30);setScenes([]);setTitle("");setSelectedTrend(null);setApprovedCost(false);setJob(null);setError("");};
 const trendSearch=async()=>{
  setError("");setBusy(true);setTrendResults([]);
  try{
   if(platform!=="youtube")throw Error("Por ahora solo YouTube dispone de búsqueda verificada. Puedes continuar con tu idea.");
   const access=await authenticate();
   const query=encodeURIComponent((topic==="Otro"?otherTopic:topic).slice(0,90));
   const res=await fetch("/api/video-generator/radar?q="+query+"&days=30",{cache:"no-store",headers:{Authorization:"Bearer "+access,"X-VMV-YouTube-Consent":"accepted"}});
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw Error(String(data?.error||"radar_unavailable"));
   const matches=(Array.isArray(data?.scan?.items)?data.scan.items:[]).slice(0,3) as Trend[];
   if(!matches.length)throw Error("No encontramos tendencias recientes verificadas para ese tema.");
   setTrendResults(matches);
  }catch(e){setError(e instanceof Error?e.message:"No pudimos consultar las tendencias.");}
  finally{setBusy(false);}
 };
 const prepare=async()=>{
  setBusy(true);setError("");
  try{
   const idea=(topic==="Otro"?otherTopic:topic).trim();
   const result=await api("plan","POST",{topic:idea,audience:audience==="Otro"?otherAudience:audience,style:visual,seconds,language,source:selectedTrend?{platform,sourceId:selectedTrend.sourceId,title:selectedTrend.title,url:selectedTrend.url}:null,confirmPlanCost:true});
   if(!Array.isArray(result.scenes)||result.scenes.length!==seconds/5)throw Error("El guion está incompleto.");
   setTitle(String(result.title||idea));setScenes(result.scenes);setPlanApproval(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo preparar el guion.");}
  finally{setBusy(false);}
 };
 const patchScene=(index:number,key:"speech"|"imagePrompt",value:string)=>{setScenes(previous=>previous.map((s,i)=>i===index?{...s,[key]:value}:s));setApprovedCost(false);};
 const makeJob=async()=>{
  if(!approvedCost||scenes.length!==seconds/5)return;
  setBusy(true);setError("");
  try{
   const data=await api("jobs","POST",{clientKey:crypto.randomUUID(),title,topic:topic==="Otro"?otherTopic:topic,audience:audience==="Otro"?otherAudience:audience,style:visual,seconds,language,voiceProvider,voiceId,subtitles,qualityMode:quality,scenes,sourcePlatform:platform,sourceUrl:selectedTrend?.url||null,estimatedCredits:estimatedCredits(seconds,quality),confirmCost:true});
   if(!data?.job?.id)throw Error("video_studio_unavailable");
   setJob(data.job);next(data.job.status==="awaiting_image_approval"?"images":"progress");
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setBusy(false);}
 };
 const approve=async(index?:number)=>{
  if(!job)return;setSavingScene(true);setError("");
  try{const data=await api("jobs","PATCH",{id:job.id,action:index===undefined?"approve_all":"approve",index,confirmAnimationCost:true});
   if(!data?.job)throw Error("video_studio_unavailable");
   setJob(data.job);
   if(data.job.status==="queued_animation"||data.job.status==="animating")next("progress");
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setSavingScene(false);}
 };
 const updateFrame=async(index:number,field:"speech"|"imagePrompt",value:string)=>{
  if(!job)return;setSavingScene(true);setError("");
  try{const data=await api("jobs","PATCH",{id:job.id,action:"edit_scene",index,field,value});
   if(data?.job)setJob(data.job);
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setSavingScene(false);}
 };
 const credit=estimatedCredits(seconds,quality);
 if(isSignedIn===false){const sb=getSupabase();return sb?<VMVAuthGateway supabase={sb}/>:<main className={styles.center}>Inicia sesión en VMV Business.</main>;}
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.header}><button className={styles.back} onClick={()=>stage==="home"?window.location.assign("/vista-app"):previous()} aria-label="Volver"><ArrowLeft size={19}/></button><div><strong>Video Studio</strong><small>VMV Business · Creator</small></div><Link href="/vista-app" className={styles.brand}>VMV</Link></header>
  {stage!=="home"&&stage!=="history"&&stage!=="images"&&stage!=="progress"&&stage!=="result"?<div className={styles.progressTop}><span>{labels[stage]}</span><span>{Math.max(1,order.indexOf(stage)+1)} / {order.length}</span><div className={styles.bar}><div style={{width:Math.max(5,(order.indexOf(stage)+1)/order.length*100)+"%"}}/></div></div>:null}
  {stage==="home"?<><div className={styles.welcome}><span className={styles.kicker}>CREATIVE STUDIO</span><h1>Historias que cobran vida.</h1><p>Un guion, escenas animadas y narración. Todo en un video.</p></div><div className={styles.homeGrid}><button className={styles.homeCard} onClick={reset}><div className={styles.homeIllustration}><Clapperboard size={62}/><Sparkles size={25}/></div><strong>Crear video</strong><small>Empieza una nueva historia</small><ArrowUpRight className={styles.arrow}/></button><button className={styles.homeCard} onClick={()=>{next("history");void loadHistory();}}><div className={styles.homeIllustrationAlt}><FolderOpen size={58}/></div><strong>Historial</strong><small>Videos y proyectos guardados</small><ArrowUpRight className={styles.arrow}/></button></div></>:null}
  {stage==="topic"?<><h1>¿Qué tema?</h1><div className={styles.choiceGrid}>{topics.map(s=><button key={s} className={topic===s?styles.chosen:styles.choice} onClick={()=>{setTopic(s);if(s!=="Otro")next("audience")}}>{s}<ChevronRight size={17}/></button>)}</div>{topic==="Otro"?<div className={styles.field}><input autoFocus maxLength={220} value={otherTopic} placeholder="Describe el tema de tu video" onChange={e=>setOtherTopic(e.target.value)}/><button className={styles.primary} disabled={otherTopic.trim().length<4} onClick={()=>next("audience")}>Continuar</button></div>:null}</>:null}
  {stage==="audience"?<><h1>¿Para quién?</h1><div className={styles.choiceGrid}>{audiences.map(s=><button className={audience===s?styles.chosen:styles.choice} key={s} onClick={()=>{setAudience(s);if(s!=="Otro")next("style")}}>{s}<ChevronRight size={17}/></button>)}</div>{audience==="Otro"?<div className={styles.field}><input value={otherAudience} placeholder="Describe tu público" onChange={e=>setOtherAudience(e.target.value)}/><button className={styles.primary} disabled={otherAudience.trim().length<3} onClick={()=>next("style")}>Continuar</button></div>:null}</>:null}
  {stage==="style"?<><h1>Elige un estilo</h1><div className={styles.styleGrid}>{stylesList.map(s=><button key={s.id} className={visual===s.id?styles.styleChosen:styles.styleOption} onClick={()=>{setVisual(s.id);next("duration")}}><span className={styles.styleGraphic}>{s.emoji}</span><strong>{s.label}</strong><small>{s.description}</small></button>)}</div></>:null}
  {stage==="duration"?<><h1>¿Cuánto debe durar?</h1><div className={styles.optionStack}>{durations.map(s=><button className={styles.optionRow} key={s} onClick={()=>{setSeconds(s);next("language")}}><Clock3 size={18}/><strong>{readable(s)}</strong><small>{s/5} escenas</small><ChevronRight size={18}/></button>)}<button className={styles.optionRow} onClick={()=>{setSeconds(45);setCustomSeconds("45")}}>Personalizado <ChevronRight size={18}/></button></div>{seconds===45?<div className={styles.field}><label>Duración (múltiplos de 5 s, entre 15 y 180)</label><input type="number" min={15} max={180} step={5} value={customSeconds} onChange={e=>setCustomSeconds(e.target.value)}/><button className={styles.primary} disabled={Number(customSeconds)<15||Number(customSeconds)>180||Number(customSeconds)%5!==0} onClick={()=>{setSeconds(Number(customSeconds));next("language")}}>Continuar</button></div>:null}</>:null}
  {stage==="language"?<><h1>Idioma del video</h1><div className={styles.optionStack}>{([{id:"es",label:"Español"},{id:"en",label:"English"},{id:"pt",label:"Português"},{id:"fr",label:"Français"},{id:"de",label:"Deutsch"},{id:"it",label:"Italiano"}] as const).map(x=><button className={styles.optionRow} key={x.id} onClick={()=>{setLanguage(x.id);next("voice")}}><Globe2 size={18}/><strong>{x.label}</strong><ChevronRight size={17}/></button>)}</div></>:null}
  {stage==="voice"?<><h1>Elige una voz</h1><p className={styles.help}>Escucha y selecciona las voces disponibles de OpenAI y ElevenLabs para el idioma elegido.</p><PilotVoiceStep language={language} en={uiLanguage==="en"} selectedProvider={voiceProvider==="none"?undefined:voiceProvider} selectedVoiceId={voiceId} onChoose={(provider,id,name)=>{setVoiceProvider(provider);setVoiceId(id);setVoiceLabel(name);next("subtitles")}}/></>:null}
  {stage==="subtitles"?<><h1>¿Quieres subtítulos?</h1><div className={styles.optionStack}><button className={styles.optionRow} onClick={()=>{setSubtitles(true);next("source")}}><Subtitles size={20}/><strong>Con subtítulos</strong><ChevronRight/></button><button className={styles.optionRow} onClick={()=>{setSubtitles(false);next("source")}}><Subtitles size={20}/><strong>Sin subtítulos</strong><ChevronRight/></button></div></>:null}
  {stage==="source"?<><h1>¿Analizar tendencias?</h1><p className={styles.help}>Encuentra inspiración real o crea directamente con tu tema.</p><div className={styles.optionStack}>{["youtube","facebook","instagram","tiktok","idea"].map(p=><button className={styles.optionRow} key={p} onClick={()=>{setPlatform(p);setSelectedTrend(null);setTrendResults([]);if(p==="idea")next("plan");else next("trends")}}><PlayCircle size={19}/><strong>{p==="idea"?"Continuar con mi idea":p==="youtube"?"YouTube":p==="facebook"?"Facebook":p==="instagram"?"Instagram":"TikTok"}</strong><ChevronRight size={17}/></button>)}</div></>:null}
  {stage==="trends"?<><h1>Tendencias · {platform.charAt(0).toUpperCase()+platform.slice(1)}</h1>{platform==="youtube"?<><p className={styles.help}>Tres videos verificables para inspirar una historia original. Abrir el original no lo copia.</p><label className={styles.consent}><input type="checkbox" checked={trendConsent} onChange={e=>setTrendConsent(e.target.checked)}/> Autorizo consultar tendencias públicas de YouTube.</label><button className={styles.primary} disabled={busy||!trendConsent} onClick={()=>void trendSearch()}>{busy?<LoaderCircle className={styles.spin} size={18}/>:<Search size={18}/>} Buscar tendencias</button><div className={styles.trends}>{trendResults.map(t=><div className={styles.trendCard} key={t.sourceId}><div className={styles.trendPreview}>{t.thumbnail?<img src={t.thumbnail} alt="Vista previa del video original" loading="lazy"/>:<Film/>}</div><div className={styles.trendActions}><a href={t.url} target="_blank" rel="noopener noreferrer">Ver tendencia <ArrowUpRight size={15}/></a><button onClick={()=>{setSelectedTrend(t);setScenes([]);next("plan")}}>Proponer idea sobre este tema <Sparkles size={16}/></button></div></div>)}</div></>:<div className={styles.unavailable}><Clock3 size={25}/><strong>Próximamente</strong><p>La búsqueda de videos verificables en esta plataforma requiere conexión oficial. No mostraremos tendencias inventadas.</p></div>}<button className={styles.secondary} onClick={()=>{setSelectedTrend(null);next("plan")}}>Continuar con mi idea <ArrowRight size={16}/></button></>:null}
  {stage==="plan"?<><h1>Tu guion y escenas</h1><p className={styles.help}>{selectedTrend?"Crearemos una historia original inspirada en el tema seleccionado.":"Prepara un guion original a partir de tu idea."} Revisa el contenido antes de animarlo.</p>{selectedTrend?<div className={styles.selectedTrend}><strong>{selectedTrend.title}</strong><a href={selectedTrend.url} target="_blank" rel="noopener noreferrer">Ver tendencia</a></div>:null}{scenes.length===0?<button className={styles.primary} disabled={busy} onClick={()=>void prepare()}>{busy?<LoaderCircle className={styles.spin} size={17}/>:<Sparkles size={17}/>} Proponer guion y escenas</button>:<><div className={styles.field}><label>Título del video</label><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140}/></div><p className={styles.help}>Guion de {scenes.length} escenas de 5 segundos. Todo es editable.</p><div className={styles.scenes}>{scenes.map((scene,i)=><div className={styles.sceneEditor} key={i}><strong>Escena {i+1} · {i*5}–{(i+1)*5} s</strong><label>Texto narrado</label><textarea rows={3} value={scene.speech} maxLength={350} onChange={e=>patchScene(i,"speech",e.target.value)}/><label>Imagen / acción</label><textarea rows={3} maxLength={1300} value={scene.imagePrompt} onChange={e=>patchScene(i,"imagePrompt",e.target.value)}/></div>)}</div><button className={styles.primary} disabled={scenes.some(x=>x.speech.length<5||x.imagePrompt.length<20)} onClick={()=>next("quality")}>Continuar <ArrowRight size={17}/></button></>}</>:null}
  {stage==="quality"?<><h1>Calidad del video</h1><p className={styles.help}>Estimaciones de créditos de la versión propuesta; las tarifas definitivas se confirmarán al habilitar los pagos.</p><div className={styles.optionStack}>{([{id:"turbo",label:"Turbo · 720p",description:"Renderizado optimizado"},{id:"high",label:"Alta calidad · 720p",description:"Motor de mayor calidad"}] as const).map(x=><button key={x.id} className={styles.optionRow} onClick={()=>{setQuality(x.id);setApprovedCost(false);next("summary")}}><Video size={20}/><span><strong>{x.label}</strong><small>{x.description}</small></span><b>{estimatedCredits(seconds,x.id)} cr.</b><ChevronRight size={16}/></button>)}</div></>:null}
  {stage==="summary"?<><h1>Resumen de tu video</h1><div className={styles.review}>{([{label:"Tema",value:topic==="Otro"?otherTopic:topic,edit:"topic"},{label:"Público",value:audience==="Otro"?otherAudience:audience,edit:"audience"},{label:"Estilo",value:stylesList.find(x=>x.id===visual)?.label,edit:"style"},{label:"Duración",value:readable(seconds),edit:"duration"},{label:"Idioma",value:language.toUpperCase(),edit:"language"},{label:"Voz",value:voiceLabel,edit:"voice"},{label:"Subtítulos",value:subtitles?"Sí":"No",edit:"subtitles"},{label:"Tendencias",value:selectedTrend?selectedTrend.title:platform==="idea"?"Mi idea":platform,edit:"source"},{label:"Guion",value:scenes.length+" escenas editables",edit:"plan"},{label:"Calidad",value:quality==="high"?"Alta":"Turbo",edit:"quality"}] as {label:string;value:string|undefined;edit:Stage}[]).map(r=><div className={styles.reviewRow} key={r.label}><div><small>{r.label}</small><strong>{r.value}</strong></div><button aria-label={"Editar "+r.label} onClick={()=>next(r.edit)}><Pencil size={17}/></button></div>)}</div><div className={styles.price}><small>Generación estimada · tarifa provisional</small><strong>{credit} créditos</strong><p>Incluye clips, narración seleccionada, subtítulos y montaje. La regeneración de imágenes puede tener costo adicional.</p></div><label className={styles.consent}><input type="checkbox" checked={approvedCost} onChange={e=>setApprovedCost(e.target.checked)}/> Confirmo la configuración y autorizo el uso de créditos indicado cuando el sistema esté habilitado.</label><button className={styles.primary} disabled={busy||!approvedCost||scenes.length!==seconds/5} onClick={()=>void makeJob()}>{busy?<LoaderCircle className={styles.spin} size={17}/>:<Clapperboard size={17}/>} Generar por {credit} créditos</button></>:null}
  {stage==="images"&&job?<><h1>Revisa las imágenes</h1><p className={styles.help}>No se animará ninguna escena hasta que apruebes todas las imágenes. Puedes cerrar la web y regresar más tarde.</p><div className={styles.gallery}>{(job.scenes||[]).map((s,i)=><div key={i} className={styles.frameCard}><div className={styles.framePreview}>{s.imageUrl?<img src={s.imageUrl} alt={"Fotograma "+(i+1)}/>:<Film size={30}/>}</div><div className={styles.frameInfo}><strong>Escena {i+1}</strong><small>{i*5}–{(i+1)*5}s</small><p>{s.speech}</p><button className={styles.secondary} onClick={()=>setSceneIndex(i)}>Revisar</button>{s.approved?<span className={styles.passed}><Check size={14}/> Aprobada</span>:<button disabled={savingScene} className={styles.primaryMini} onClick={()=>void approve(i)}>Aprobar</button>}</div></div>)}</div>{job.scenes?.[sceneIndex]?<div className={styles.frameEdit}><h2>Editar escena {sceneIndex+1}</h2><label>Guion</label><textarea key={job.id+":s:"+sceneIndex} defaultValue={job.scenes[sceneIndex].speech} onBlur={e=>{if(e.target.value!==job.scenes[sceneIndex].speech)void updateFrame(sceneIndex,"speech",e.target.value)}}/><label>Imagen / acción</label><textarea key={job.id+":v:"+sceneIndex} defaultValue={job.scenes[sceneIndex].imagePrompt} onBlur={e=>{if(e.target.value!==job.scenes[sceneIndex].imagePrompt)void updateFrame(sceneIndex,"imagePrompt",e.target.value)}}/><p className={styles.help}>La regeneración del fotograma exige un presupuesto y una aprobación independiente. No se cobrará automáticamente.</p></div>:null}<button className={styles.primary} disabled={savingScene||!job.scenes?.length||job.scenes.some(x=>!x.imageUrl)} onClick={()=>void approve()}>Aprobar todas y continuar automáticamente</button></>:null}
  {stage==="progress"&&job?<><h1>Estamos creando tu video</h1><p className={styles.help}>La generación continúa en la nube aunque cierres la página.</p><div className={styles.progressCard}><div className={styles.progressRing} style={{background:"conic-gradient(#9156c8 "+Math.max(0,Math.min(100,job.progress||0))+"%,#eee9f2 0)"}}><span>{job.progress||0}%</span></div><strong>{job.phase||"En cola"}</strong><small>Estado: {job.status}</small><small>{typeof job.etaSeconds==="number"?"Tiempo aproximado: "+readable(Math.ceil(job.etaSeconds)):"Calculando tiempo estimado…"}</small></div><button className={styles.secondary} onClick={()=>{next("history");void loadHistory()}}>Ver historial</button></>:null}
  {stage==="result"&&job?<><h1>¡Video listo!</h1>{job.videoUrl?<><video className={styles.videoFinal} controls playsInline src={job.videoUrl}/><a className={styles.primary} href={job.videoUrl} download={"vmv-video-"+job.id+".mp4"}><Download size={19}/> Descargar MP4</a></>:<p className={styles.help}>El archivo está guardado. Actualiza el enlace desde Historial.</p>}<button className={styles.secondary} onClick={()=>{next("history");void loadHistory()}}>Abrir historial</button></>:null}
  {stage==="history"?<><h1>Mis videos</h1><button className={styles.secondary} disabled={historyLoading} onClick={()=>void loadHistory()}>{historyLoading?<LoaderCircle className={styles.spin} size={16}/>:<RefreshCw size={16}/>} Actualizar</button><div className={styles.history}>{jobs.map(j=><button key={j.id} className={styles.historyItem} onClick={()=>{setJob(j);next(j.status==="completed"?"result":j.status==="awaiting_image_approval"?"images":"progress")}}><span className={styles.historyIcon}><Film size={20}/></span><span><strong>{j.title||"Video sin título"}</strong><small>{readable(j.seconds)} · {j.phase||j.status}</small></span><ChevronRight size={18}/></button>)}{!jobs.length&&!historyLoading&&!error?<div className={styles.unavailable}><FolderOpen size={30}/><p>Todavía no hay videos guardados.</p><button onClick={reset} className={styles.primary}>Crear video</button></div>:null}</div></>:null}
  {error?<div role="alert" className={styles.error}>{errorMessages[error]||error}</div>:null}
  <footer className={styles.footer}><span>VMV Business · Video Studio V1</span><button onClick={()=>next("home")}>Inicio</button></footer>
 </div></main>;
}
