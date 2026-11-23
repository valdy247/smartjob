"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,ArrowUpRight,Check,CheckCircle2,ChevronRight,Clapperboard,Clock3,Download,Film,FolderOpen,Globe2,LoaderCircle,Pencil,PlayCircle,RefreshCw,Search,Sparkles,Subtitles,Video,Eye,X,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import VMVAuthGateway from "@/components/VMVAuthGateway";
import PilotVoiceStep from "../vmv-pilot/PilotVoiceStep";
import type {PilotLanguage,PilotVoiceProvider} from "@/lib/vmv-pilot-voice-config";
import styles from "./page.module.css";

type Stage="home"|"topic"|"audience"|"style"|"duration"|"language"|"voice"|"subtitles"|"source"|"trends"|"idea"|"plan"|"quality"|"summary"|"images"|"progress"|"result"|"history";
type Style="stickman"|"cartoon2d"|"cartoon3d"|"clay"|"illustrated";
type Quality="turbo"|"high";
type Scene={speech:string;imagePrompt:string;caption:string;approved?:boolean;requiresReview?:boolean;imageUrl?:string;imagePath?:string};
type Trend={sourceId:string;title:string;description?:string;thumbnail:string;url:string;channel?:string;views?:number};
type Job={id:string;status:string;phase:string;progress:number;scenes:Scene[];seconds:number;style:string;quality_mode:string;title:string;videoUrl?:string|null;created_at:string;failure_code?:string|null;etaSeconds?:number|null;charge_credits?:number;credits_settled?:boolean;version?:number};
type Wallet={balance:number;reserved:number;available:number};
type CreditPack={id:string;credits:number;usdCents:number};
const topics=["Curiosidades","Historia","Ciencia","Tecnología","Educación","Entretenimiento","Negocios","Otro"];
const audiences=["Público general","Niños","Adolescentes","Jóvenes","Adultos","Familias","Emprendedores","Otro"];
const durations=[15,30,60,120,180] as const;
type VideoExample={id:Style;label:string;description:string;poster:string;video:string|null};
const stylesList:VideoExample[]=[
 {id:"stickman",label:"Stickman 2D",description:"Historias sencillas con gran expresividad",poster:"/video-studio/styles/stickman.svg",video:null},
 {id:"cartoon2d",label:"Cartoon 2D",description:"Dibujo animado con color y personalidad",poster:"/video-studio/styles/cartoon2d.svg",video:null},
 {id:"cartoon3d",label:"Cartoon 3D",description:"Personajes tridimensionales cinematográficos",poster:"/video-studio/styles/cartoon3d.svg",video:null},
 {id:"clay",label:"Plastilina 3D",description:"Mundos artesanales con textura real",poster:"/video-studio/styles/clay.svg",video:null}
];
const labels:Record<Stage,string>={
 home:"Video Studio",topic:"¿Qué tema?",audience:"¿Para quién?",style:"Elige un estilo",duration:"Duración",language:"Idioma del video",voice:"Elige una voz",subtitles:"Subtítulos",source:"¿Analizar tendencias?",trends:"Tendencias",idea:"Tu idea",plan:"Tu guion y escenas",quality:"Calidad",summary:"Resumen",images:"Revisa las escenas",progress:"Producción en la nube",result:"Video listo",history:"Historial"
};
const stepsFor=(platform:string):Stage[]=>["topic","audience","style","duration","language","voice","subtitles","source",platform==="idea"?"idea":"trends","plan"];
const estimatedCredits=(seconds:number,quality:Quality)=>Math.ceil(seconds*(quality==="high"?2.5:1));
const readable=(seconds:number)=>seconds>=60?seconds%60===0?seconds/60+" min":Math.floor(seconds/60)+" min "+seconds%60+" s":seconds+" s";
const errorMessages:Record<string,string>={
 video_not_enabled_for_account:"Tu cuenta todavía no tiene acceso a esta prueba.",
 video_studio_not_ready:"La generación en la nube aún no está activada. No se ha cobrado nada.",
 video_studio_db_unavailable:"El historial de Video Studio no está disponible todavía.",
 video_studio_wallet_unavailable:"Los créditos reales todavía no están configurados. No se ha cobrado nada.",
 video_studio_insufficient_credits:"No tienes créditos suficientes para esta generación.",
 video_studio_worker_not_ready:"El procesador de videos todavía no está listo.",
 video_studio_duplicate:"Esta solicitud ya existe. Abre Historial para continuar.",
 studio_invalid_job:"Revisa tu guion y configuración antes de generar.",
 studio_invalid_action:"Esta escena no se pudo actualizar.",
 studio_scene_locked:"El trabajo ya está en producción y no admite edición de imágenes.",
 studio_resume_unavailable:"Este proyecto no se puede reanudar.",
 studio_resume_limit:"Este proyecto alcanzó el límite de reanudaciones.",
 studio_images_not_ready:"Primero deben estar listas todas las imágenes.",
 studio_regeneration_confirmation_required:"Confirma el costo de regenerar una imagen.",
 studio_credit_purchases_not_ready:"Las compras de créditos en modo prueba aún no están conectadas.",
 studio_stripe_checkout_unavailable:"No se pudo iniciar la compra de prueba.",
 studio_trends_daily_limit:"Has alcanzado el límite diario de investigaciones. Puedes continuar con tu idea.",
 studio_trends_database_unavailable:"No pudimos consultar tendencias ahora. Inténtalo después o continúa con tu idea.",
 studio_youtube_not_connected:"YouTube todavía no está configurado en este entorno.",
 studio_youtube_quota:"YouTube agotó temporalmente su cuota. Continúa con tu idea.",
 studio_plan_incomplete:"El guion llegó incompleto. Puedes volver a intentarlo sin perder tu idea.",
 studio_plan_provider_unavailable:"No pudimos preparar el guion. Inténtalo otra vez.",
 studio_plan_not_enabled:"La creación de guiones está disponible solo en el entorno de pruebas.",
 studio_plan_invalid_request:"Revisa los datos de tu proyecto antes de generar el guion.",
 studio_plan_invalid_outline:"El plan de escenas debe regenerarse.",
 studio_trends_unavailable:"No podemos consultar las tendencias en este momento.",
 studio_plan_confirmation_required:"Confirma que quieres generar el guion antes de continuar.",
 studio_plan_invalid_batch:"No se pudo organizar el guion. Vuelve a intentarlo.",
 authentication_required:"Tu sesión ha terminado. Inicia sesión para continuar.",
 video_studio_unavailable:"Este servicio no está disponible ahora. Tus datos del proyecto siguen aquí."
};
const sampleInitial:Scene[]=[];
export default function VideoStudioV1({embedded=false,onExit}:{embedded?:boolean;onExit?:()=>void}={}){
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
 const order=stepsFor(platform);
 const [ideaPrompt,setIdeaPrompt]=useState("");
 const [exampleStyle,setExampleStyle]=useState<Style|null>(null);
 const [draftProgress,setDraftProgress]=useState(0);
 const [draftPhase,setDraftPhase]=useState("");
 const [manualDraft,setManualDraft]=useState(false);
 const [planNotice,setPlanNotice]=useState("");
 const [outline,setOutline]=useState<{title:string;logline:string;hook:string;ending:string;characters:string;setting:string;beats:string[]}|null>(null);
 const [selectedTrend,setSelectedTrend]=useState<Trend|null>(null);
 const [title,setTitle]=useState(""),[scenes,setScenes]=useState<Scene[]>(sampleInitial);
 const [narrationDraft,setNarrationDraft]=useState("");
 const [quality,setQuality]=useState<Quality>("turbo"),[approvedCost,setApprovedCost]=useState(false);
 const [job,setJob]=useState<Job|null>(null),[jobs,setJobs]=useState<Job[]>([]);
 const [historyLoading,setHistoryLoading]=useState(false),[sceneIndex,setSceneIndex]=useState(0);
 const [savingScene,setSavingScene]=useState(false);
 const [wallet,setWallet]=useState<Wallet|null>(null),[packages,setPackages]=useState<CreditPack[]>([]);
 const [purchasesEnabled,setPurchasesEnabled]=useState(false),[purchaseBusy,setPurchaseBusy]=useState(false);
 const [walletBusy,setWalletBusy]=useState(false);
 const [regenIndex,setRegenIndex]=useState<number|null>(null);
 const [frameSpeech,setFrameSpeech]=useState(""),[frameVisual,setFrameVisual]=useState("");
 const clientKeyRef=useRef<string>("");
 const autoApprovalRef=useRef<string>("");
 const [trendConsent,setTrendConsent]=useState(false);
 const [trendCountry,setTrendCountry]=useState("US");
 const [trendLanguage,setTrendLanguage]=useState("es");
 useEffect(()=>{
  // Direct Preview links also open the phone simulator; embedded visits never redirect.
  if(embedded||window.self!==window.top||new URLSearchParams(window.location.search).get("standalone")==="1")return;
  window.location.replace("/vista-app?preview=video");
 },[embedded]);
 const returnToVMV=()=>{
  if(embedded){onExit?.();return;}
  if(window.self!==window.top){
   window.parent.postMessage({type:"vmv-preview-navigate",destination:"services"},window.location.origin);
   return;
  }
  window.location.assign("/vista-app?tab=services");
 };

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
 const loadCredits=useCallback(async()=>{
  setWalletBusy(true);
  try{
   const data=await api("credits");
   if(data?.wallet)setWallet(data.wallet);
   setPackages(Array.isArray(data?.packages)?data.packages:[]);
   setPurchasesEnabled(Boolean(data?.purchasesEnabled));
  }catch{/* Retry later; never invent credits. */}
  finally{setWalletBusy(false);}
 },[api]);
 useEffect(()=>{if(isSignedIn)void loadCredits();},[isSignedIn,loadCredits]);
 useEffect(()=>{
  const scene=job?.scenes?.[sceneIndex];
  setFrameSpeech(scene?.speech||"");setFrameVisual(scene?.imagePrompt||"");
 },[job?.id,job?.version,sceneIndex]);
 const checkout=async(pack:string)=>{
  setPurchaseBusy(true);setError("");
  try{
   const data=await api("checkout","POST",{pack,confirmPurchase:true,clientKey:crypto.randomUUID()});
   if(typeof data?.url!=="string"||!data.url.startsWith("https://checkout.stripe.com/"))
    throw Error("studio_stripe_checkout_unavailable");
   window.location.assign(data.url);
  }catch(e){setError(e instanceof Error?e.message:"studio_stripe_checkout_unavailable");}
  finally{setPurchaseBusy(false);}
 };
  useEffect(()=>{if(stage!=="progress"&&stage!=="images"||!job?.id)return;
  let active=true;
  const check=async()=>{try{const data=await api("jobs?id="+encodeURIComponent(job.id));
    if(!active||!data?.job)return;setJob(data.job);
    if(data.job.status==="awaiting_image_approval"){
     // The user already confirmed the complete cost on the script screen.
     // Auto-approval is safe only when all image validation checks passed.
     if(!Array.isArray(data.job.scenes)||!data.job.scenes.length||!data.job.scenes.every((s:Scene)=>s.requiresReview===false)){setStage("images");return;}
     if(autoApprovalRef.current!==data.job.id){
      autoApprovalRef.current=data.job.id;
      try{
       const approved=await api("jobs","PATCH",{id:data.job.id,action:"approve_all",confirmAnimationCost:true});
       if(!active)return;
       if(approved?.job)setJob(approved.job);
       void loadCredits();
      }catch(e){
       if(active){setError(e instanceof Error?e.message:"studio_invalid_action");setStage("images");}
      }
     }
    }else if(data.job.status==="completed")setStage("result");
  }catch{/* Keep the last server state; next poll may succeed. */}};
  void check();const timer=setInterval(()=>{void check();},6000);
  return()=>{active=false;clearInterval(timer);};
 },[api,stage,job?.id,loadCredits]);
 const next=(s:Stage)=>{setError("");setStage(s)};
 const previous=()=>{setError("");if(stage==="images"||stage==="progress"||stage==="result"){setStage("history");void loadHistory();return;}
  const idx=order.indexOf(stage);setStage(idx>0?order[idx-1]:"home");};
 const reset=()=>{clientKeyRef.current="";autoApprovalRef.current="";setNarrationDraft("");setStage("topic");setTopic("");setOtherTopic("");setAudience("Público general");setVisual("stickman");setSeconds(30);setScenes([]);setTitle("");setIdeaPrompt("");setOutline(null);setDraftProgress(0);setManualDraft(false);setPlanNotice("");setPlatform("idea");setSelectedTrend(null);setApprovedCost(false);setJob(null);setError("");};
 const trendSearch=async()=>{
  setError("");setBusy(true);setTrendResults([]);
  try{
   if(platform!=="youtube")throw Error("studio_trends_unavailable");
   const access=await authenticate();
   const query=encodeURIComponent((topic==="Otro"?otherTopic:topic).slice(0,90));
   const headers={Authorization:"Bearer "+access,"X-VMV-YouTube-Consent":"accepted"};
   let res=await fetch("/api/video-studio/trends?q="+query+"&country="+encodeURIComponent(trendCountry)+"&language="+encodeURIComponent(trendLanguage),{cache:"no-store",headers});
   let data=await res.json().catch(()=>null);
   if(!res.ok&&res.status!==202)throw Error(typeof data?.error==="string"?data.error:"studio_trends_unavailable");
   let attempts=0;
   while(res.status===202&&typeof data?.scan?.id==="string"&&attempts<5){
    await new Promise(resolve=>setTimeout(resolve,1800));
    res=await fetch("/api/video-studio/trends?id="+encodeURIComponent(data.scan.id),{cache:"no-store",headers});
    data=await res.json().catch(()=>null);attempts++;
    if(!res.ok&&res.status!==202)throw Error(typeof data?.error==="string"?data.error:"studio_trends_unavailable");
   }
   if(res.status===202)throw Error("La búsqueda está en curso. Vuelve a tocar Buscar tendencias en unos segundos.");
   const matches=Array.isArray(data?.scan?.items)?data.scan.items:[];
   const verified=matches.filter((t:Trend)=>typeof t?.sourceId==="string"&&
    /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(t.url)&&
    typeof t.thumbnail==="string"&&t.thumbnail.startsWith("https://")).slice(0,3) as Trend[];
   if(!verified.length)throw Error("No encontramos videos recientes verificables. Prueba otro tema o continúa con tu idea.");
   setTrendResults(verified);
  }catch(e){setError(e instanceof Error?e.message:"studio_trends_unavailable");}
  finally{setBusy(false);}
 };
 const makeEditableDraft=()=>{
  const subject=(ideaPrompt.trim()||selectedTrend?.title||(topic==="Otro"?otherTopic:topic).trim()||"Mi historia").slice(0,110);
  // Manual editing is explicit: empty scenes can never be mistaken for a completed script.
  const segments:Scene[]=Array.from({length:seconds/5},()=>({speech:"",imagePrompt:"",caption:""}));
  setTitle(subject.slice(0,100));setScenes(segments);setNarrationDraft("");setOutline(null);setManualDraft(true);
  setDraftProgress(0);setDraftPhase("");
  setPlanNotice("Editor manual: escribe la narración y describe cada imagen. Para continuar, completa todas las escenas.");
  setError("");
 };
 const prepare=async(chosenTrend:Trend|null=selectedTrend)=>{
  setBusy(true);setError("");setManualDraft(false);setPlanNotice("");setDraftProgress(0);setDraftPhase("Creando una historia original…");
  setScenes([]);setOutline(null);
  try{
   const mainTopic=(topic==="Otro"?otherTopic:topic).trim()||ideaPrompt.trim().slice(0,180);
   const shared={
    topic:chosenTrend?.title?.trim().slice(0,220)||mainTopic,
    idea:chosenTrend?.title?.trim().slice(0,220)||ideaPrompt.trim()||mainTopic,
    audience:audience==="Otro"?otherAudience:audience,
    style:visual,seconds,language,
    source:chosenTrend?{platform,sourceId:chosenTrend.sourceId,title:chosenTrend.title,url:chosenTrend.url}:null,
    confirmPlanCost:true
   };
   // Generate short-form creative scripts atomically from the chosen topic.
   if(seconds/5<=6){
    setDraftPhase("Escribiendo la historia y las escenas…");
    const result=await api("plan","POST",{...shared,mode:"complete"});
    if(!result?.outline||!Array.isArray(result?.scenes)||result.scenes.length!==seconds/5)
     throw Error("studio_plan_incomplete");
    const script=result.scenes as Scene[];
    if(script.some(scene=>typeof scene?.speech!=="string"||scene.speech.trim().length<5||
      typeof scene?.imagePrompt!=="string"||scene.imagePrompt.trim().length<35))
     throw Error("studio_plan_incomplete");
    setOutline(result.outline);setTitle(result.outline.title);
    setScenes(script);setNarrationDraft(script.map(s=>s.speech).join(" "));setManualDraft(false);setPlanNotice("");
    setDraftProgress(100);setDraftPhase("Guion listo para revisar");
    return;
   }
   const first=await api("plan","POST",{...shared,mode:"outline"});
   if(!first?.outline||!Array.isArray(first.outline.beats)||first.outline.beats.length!==seconds/5)
    throw Error("studio_plan_incomplete");
   const plan=first.outline as {title:string;logline:string;hook:string;ending:string;characters:string;setting:string;beats:string[]};
   setOutline(plan);setTitle(plan.title);
   setDraftProgress(12);setDraftPhase("Escribiendo escenas y movimientos…");
   const count=seconds/5;
   const batches=Array.from({length:Math.ceil(count/6)},(_,i)=>({start:i*6,size:Math.min(6,count-i*6)}));
   const completed:Scene[]=[];
   // Two short parallel chunks at a time keep large projects within serverless limits.
   for(let i=0;i<batches.length;i+=2){
    const group=await Promise.all(batches.slice(i,i+2).map(async b=>{
     const chunk=await api("plan","POST",{...shared,mode:"scenes",outline:plan,start:b.start,batchSize:b.size});
     if(!Array.isArray(chunk?.scenes)||chunk.scenes.length!==b.size)throw Error("studio_plan_incomplete");
     return {start:b.start,items:chunk.scenes as Scene[]};
    }));
    for(const piece of group)completed.splice(piece.start,piece.items.length,...piece.items);
    setDraftProgress(Math.min(95,12+Math.round(completed.filter(Boolean).length/count*82)));
   }
   if(completed.length!==count||completed.some(s=>!s||typeof s.speech!=="string"||typeof s.imagePrompt!=="string"))
    throw Error("studio_plan_incomplete");
   setScenes(completed);setNarrationDraft(completed.map(s=>s.speech).join(" "));setManualDraft(false);setPlanNotice("");setDraftProgress(100);setDraftPhase("Guion listo para revisar");
  }catch(e){
   const code=e instanceof Error?e.message:"studio_plan_provider_unavailable";
   setError(errorMessages[code]?code:"studio_plan_provider_unavailable");
   setScenes([]);setNarrationDraft("");setManualDraft(false);
  }
  finally{setBusy(false);}
 };
 const patchScene=(index:number,key:"speech"|"imagePrompt",value:string)=>{setScenes(previous=>previous.map((s,i)=>i===index?{...s,[key]:value}:s));setApprovedCost(false);};
 const editNarration=(value:string)=>{
  setNarrationDraft(value);setApprovedCost(false);
  const words=value.trim().split(/\s+/).filter(Boolean);
  setScenes(previous=>previous.map((scene,i)=>{
   const n=previous.length;
   const part=words.slice(Math.floor(i*words.length/n),Math.floor((i+1)*words.length/n)).join(" ");
   return {...scene,speech:part,caption:part.split(/\s+/).slice(0,6).join(" ")};
  }));
 };
 const makeJob=async()=>{
  if(!approvedCost||scenes.length!==seconds/5)return;
  setBusy(true);setError("");
  try{
   const data=await api("jobs","POST",{clientKey:clientKeyRef.current||(clientKeyRef.current=crypto.randomUUID()),title,topic:topic==="Otro"?otherTopic:topic,audience:audience==="Otro"?otherAudience:audience,style:visual,seconds,language,voiceProvider,voiceId,subtitles,qualityMode:quality,scenes,sourcePlatform:platform,sourceUrl:selectedTrend?.url||null,estimatedCredits:estimatedCredits(seconds,quality),confirmCost:true});
   if(!data?.job?.id)throw Error("video_studio_unavailable");
   setJob(data.job);void loadCredits();next("progress");
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setBusy(false);}
 };
 const approve=async(index?:number)=>{
  if(!job)return;setSavingScene(true);setError("");
  try{const data=await api("jobs","PATCH",{id:job.id,action:index===undefined?"approve_all":"approve",index,confirmAnimationCost:true});
   if(!data?.job)throw Error("video_studio_unavailable");
   setJob(data.job);void loadCredits();
   if(data.job.status==="queued_animation"||data.job.status==="animating")next("progress");
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setSavingScene(false);}
 };
 const updateFrame=async(index:number,field:"speech"|"imagePrompt",value:string)=>{
  if(!job)return;setSavingScene(true);setError("");
  try{const data=await api("jobs","PATCH",{id:job.id,action:"edit_scene",index,field,value});
   if(data?.job){setJob(data.job);void loadCredits();}
  }catch(e){setError(e instanceof Error?e.message:"video_studio_unavailable");}
  finally{setSavingScene(false);}
 };
 const regenerateFrame=async(index:number,customVisual?:string)=>{
  if(!job)return;
  setSavingScene(true);setError("");
  try{
   const edit=typeof customVisual==="string";
   const data=await api("jobs","PATCH",{id:job.id,index,
    action:edit?"edit_scene":"regenerate",field:edit?"imagePrompt":undefined,
    value:customVisual,confirmRegenerationCost:true});
   if(data?.job){setJob(data.job);setRegenIndex(null);void loadCredits();next("progress");}
  }catch(e){setError(e instanceof Error?e.message:"studio_invalid_action");}
  finally{setSavingScene(false);}
 };
 const resumeJob=async()=>{
  if(!job||job.status!=="failed")return;
  setBusy(true);setError("");
  try{
   const data=await api("jobs","PATCH",{id:job.id,action:"resume"});
   if(!data?.job)throw Error("studio_resume_unavailable");
   setJob(data.job);void loadCredits();next("progress");
  }catch(e){setError(e instanceof Error?e.message:"studio_resume_unavailable");}
  finally{setBusy(false);}
 };
 const credit=estimatedCredits(seconds,quality);
 const scriptWords=narrationDraft.trim()?narrationDraft.trim().split(/\s+/).length:0;
 const scriptSeconds=Math.round(scriptWords/(language==="es"?2.3:2.25));
 const durationPlausible=Math.abs(scriptSeconds-seconds)<=Math.max(5,seconds*.20);
 const validDraft=scenes.length===seconds/5&&scenes.every(s=>s.speech.trim().length>=5&&s.speech.length<=230&&s.imagePrompt.trim().length>=20);
 const previewExample=stylesList.find(x=>x.id===exampleStyle)||null;
 if(isSignedIn===false){const sb=getSupabase();return sb?<VMVAuthGateway supabase={sb}/>:<main className={styles.center}>Inicia sesión en VMV Business.</main>;}
 return <main className={styles.page} data-vmv-embedded={embedded?"true":undefined}><div className={styles.shell}>
  <header className={styles.header}><button className={styles.back} onClick={()=>stage==="home"?returnToVMV():previous()} aria-label="Volver"><ArrowLeft size={19}/></button><div><strong>Video Studio</strong><small>VMV Business · Creator</small></div><Link href="/vista-app?tab=services" className={styles.brand}
    onClick={event=>{if(embedded||window.self!==window.top){event.preventDefault();returnToVMV();}}}>VMV</Link></header>
  {stage!=="home"&&stage!=="history"&&stage!=="images"&&stage!=="progress"&&stage!=="result"?<div className={styles.progressTop}><span>{labels[stage]}</span><span>{Math.max(1,order.indexOf(stage)+1)} / {order.length}</span><div className={styles.bar}><div style={{width:Math.max(5,(order.indexOf(stage)+1)/order.length*100)+"%"}}/></div></div>:null}
  {stage==="home"?<>
   <div className={styles.homeGrid}>
    <button className={styles.homeCard+" "+styles.createCard} onClick={reset}>
     <span className={styles.homeIllustration}><img src="/video-studio/styles/cartoon3d.svg" alt="" aria-hidden="true"/><span className={styles.homeFloatIcon}><PlayCircle size={23}/></span></span>
     <span className={styles.homeCardInfo}><span><strong>Crear video</strong><small>Comienza una nueva historia</small></span><ArrowUpRight size={22}/></span>
    </button>
    <button className={styles.homeCard+" "+styles.libraryCard} onClick={()=>{next("history");void loadHistory();}}>
     <span className={styles.homeIllustrationAlt}><img src="/video-studio/styles/cartoon2d.svg" alt="" aria-hidden="true"/><span className={styles.homeFloatIcon}><FolderOpen size={23}/></span></span>
     <span className={styles.homeCardInfo}><span><strong>Historial</strong><small>Tus proyectos y videos guardados</small></span><ArrowUpRight size={22}/></span>
    </button>
   </div>
   <p className={styles.footerHint}>Un solo proceso creativo. Tú decides, la IA produce.</p>
   <div className={styles.walletStrip}><span><Sparkles size={18}/><strong>{wallet?wallet.available:"—"}</strong><small>créditos disponibles</small></span>
    <button type="button" onClick={()=>{next("history");void loadHistory();}}><FolderOpen size={16}/> Ver mis proyectos</button>
   </div>
  </>:null}
  {stage==="topic"?<><h1>¿Qué tema?</h1><div className={styles.choiceGrid}>{topics.map(s=><button key={s} className={topic===s?styles.chosen:styles.choice} onClick={()=>{setTopic(s);if(s!=="Otro")next("audience")}}>{s}<ChevronRight size={17}/></button>)}</div>{topic==="Otro"?<div className={styles.field}><input autoFocus maxLength={220} value={otherTopic} placeholder="Describe el tema de tu video" onChange={e=>setOtherTopic(e.target.value)}/><button className={styles.primary} disabled={otherTopic.trim().length<4} onClick={()=>next("audience")}>Continuar</button></div>:null}</>:null}
  {stage==="audience"?<><h1>¿Para quién?</h1><div className={styles.choiceGrid}>{audiences.map(s=><button className={audience===s?styles.chosen:styles.choice} key={s} onClick={()=>{setAudience(s);if(s!=="Otro")next("style")}}>{s}<ChevronRight size={17}/></button>)}</div>{audience==="Otro"?<div className={styles.field}><input value={otherAudience} placeholder="Describe tu público" onChange={e=>setOtherAudience(e.target.value)}/><button className={styles.primary} disabled={otherAudience.trim().length<3} onClick={()=>next("style")}>Continuar</button></div>:null}</>:null}
  {stage==="style"?<>
   <h1>Elige un estilo</h1><p className={styles.help}>Cada historia tendrá una identidad visual. Explora los estilos antes de elegir.</p>
   <div className={styles.styleGrid}>{stylesList.map(item=><article key={item.id} className={visual===item.id?styles.styleChosen:styles.styleOption}>
    <button type="button" className={styles.styleSelect} onClick={()=>{setVisual(item.id);setScenes([]);setOutline(null);next("duration");}}>
     <span className={styles.styleGraphic}><img src={item.poster} alt={"Ilustración del estilo "+item.label} loading="lazy"/></span>
     <span className={styles.styleInfo}><strong>{item.label}</strong><small>{item.description}</small></span>
    </button>
    <button type="button" className={styles.exampleButton} onClick={()=>setExampleStyle(item.id)}><Eye size={16}/> Ver ejemplo <ArrowUpRight size={15}/></button>
   </article>)}</div>
   <p className={styles.styleNote}><Film size={15}/> Ilustraciones de referencia. Los videos completos de cada estilo se añadirán próximamente.</p>
  </>:null}
  {stage==="duration"?<><h1>¿Cuánto debe durar?</h1><div className={styles.optionStack}>{durations.map(s=><button className={styles.optionRow} key={s} onClick={()=>{setSeconds(s);next("language")}}><Clock3 size={18}/><strong>{readable(s)}</strong><small>{s/5} escenas</small><ChevronRight size={18}/></button>)}<button className={styles.optionRow} onClick={()=>{setSeconds(45);setCustomSeconds("45")}}>Personalizado <ChevronRight size={18}/></button></div>{seconds===45?<div className={styles.field}><label>Duración (múltiplos de 5 s, entre 15 y 180)</label><input type="number" min={15} max={180} step={5} value={customSeconds} onChange={e=>setCustomSeconds(e.target.value)}/><button className={styles.primary} disabled={Number(customSeconds)<15||Number(customSeconds)>180||Number(customSeconds)%5!==0} onClick={()=>{setSeconds(Number(customSeconds));next("language")}}>Continuar</button></div>:null}</>:null}
  {stage==="language"?<><h1>Idioma del video</h1><div className={styles.optionStack}>{([{id:"es",label:"Español"},{id:"en",label:"English"},{id:"pt",label:"Português"},{id:"fr",label:"Français"},{id:"de",label:"Deutsch"},{id:"it",label:"Italiano"}] as const).map(x=><button className={styles.optionRow} key={x.id} onClick={()=>{setLanguage(x.id);next("voice")}}><Globe2 size={18}/><strong>{x.label}</strong><ChevronRight size={17}/></button>)}</div></>:null}
  {stage==="voice"?<><h1>Elige una voz</h1><p className={styles.help}>Elige una voz de OpenAI o ElevenLabs. Escucha una muestra antes de elegir. No se descuentan créditos por escuchar.</p><PilotVoiceStep language={language} en={uiLanguage==="en"} selectedProvider={voiceProvider==="none"?undefined:voiceProvider} selectedVoiceId={voiceId} catalogEndpoint="/api/video-studio/voices" previewEndpoint="/api/video-studio/voice-preview" sampleMode="limited" onChoose={(provider,id,name)=>{setVoiceProvider(provider);setVoiceId(id);setVoiceLabel(name);next("subtitles")}}/></>:null}
  {stage==="subtitles"?<><h1>¿Quieres subtítulos?</h1><div className={styles.optionStack}><button className={styles.optionRow} onClick={()=>{setSubtitles(true);next("source")}}><Subtitles size={20}/><strong>Con subtítulos</strong><ChevronRight/></button><button className={styles.optionRow} onClick={()=>{setSubtitles(false);next("source")}}><Subtitles size={20}/><strong>Sin subtítulos</strong><ChevronRight/></button></div></>:null}
  {stage==="source"?<><h1>¿Analizar tendencias?</h1><p className={styles.help}>Encuentra inspiración real o crea directamente con tu tema.</p><div className={styles.optionStack}>{["youtube","facebook","instagram","tiktok","idea"].map(p=><button className={styles.optionRow} key={p} onClick={()=>{setPlatform(p);setSelectedTrend(null);setTrendResults([]);if(p==="idea")next("idea");else next("trends")}}><PlayCircle size={19}/><strong>{p==="idea"?"Continuar con mi idea":p==="youtube"?"YouTube":p==="facebook"?"Facebook":p==="instagram"?"Instagram":"TikTok"}</strong><ChevronRight size={17}/></button>)}</div></>:null}
  {stage==="trends"?<>
   <h1>Tendencias · {platform==="youtube"?"YouTube":platform.charAt(0).toUpperCase()+platform.slice(1)}</h1>
   {platform==="youtube"?<>
    <p className={styles.help}>Elige uno de tres videos reales como inspiración. Crearemos un guion nuevo, no una copia.</p>
    <label className={styles.consent}><input type="checkbox" checked={trendConsent} onChange={e=>setTrendConsent(e.target.checked)}/> Autorizo consultar tendencias públicas de YouTube.</label>
    <button className={styles.primary} disabled={busy||!trendConsent} onClick={()=>void trendSearch()}>{busy?<LoaderCircle className={styles.spin} size={18}/>:<Search size={18}/>} {busy?"Buscando videos reales…":"Mostrar 3 tendencias"}</button>
    <div className={styles.trends}>{trendResults.map(t=><article className={styles.trendCard} key={t.sourceId}>
     <div className={styles.trendPreview}><img src={t.thumbnail} alt={"Miniatura del video original de "+t.channel} loading="lazy"/><span className={styles.trendSource}>YouTube</span></div>
     <div className={styles.trendBody}>
      <div className={styles.trendCopy}>
       <strong className={styles.trendTitle} title={t.title}>{t.title}</strong>
       {t.description?.trim()?<p className={styles.trendDescription}>{t.description.trim()}</p>:null}
      </div>
      <div className={styles.trendActions}>
       <a href={t.url} target="_blank" rel="noopener noreferrer"><PlayCircle size={16}/> Ver tendencia <ArrowUpRight size={14}/></a>
       <button disabled={busy} onClick={()=>{setSelectedTrend(t);setScenes([]);next("plan");void prepare(t);}}><Sparkles size={16}/> Proponer idea <ArrowRight size={14}/></button>
      </div>
     </div>
    </article>)}</div>
    {trendResults.length>0?<p className={styles.note}>Miniaturas y enlaces procedentes de YouTube. No representan un análisis del contenido completo.</p>:null}
   </>:<div className={styles.unavailable}><Clock3 size={25}/><strong>Conexión pendiente</strong><p>Esta plataforma todavía no dispone de una búsqueda oficial verificada. No mostraremos tendencias inventadas.</p></div>}
   <button className={styles.secondary} onClick={()=>{setSelectedTrend(null);next("idea")}}>Continuar con mi idea <ArrowRight size={16}/></button>
  </>:null}
  {stage==="idea"?<>
   <span className={styles.kicker}><Sparkles size={14}/> TU IDEA, TU VIDEO</span>
   <h1>Cuéntanos tu idea</h1>
   <p className={styles.help}>No necesitas saber escribir guiones. Una o dos frases bastan para crear una historia con estructura, personajes y escenas.</p>
   <div className={styles.ideaCard}>
    <label htmlFor="vmv-idea">¿Qué te gustaría contar?</label>
    <textarea id="vmv-idea" value={ideaPrompt} onChange={e=>{setIdeaPrompt(e.target.value);setScenes([]);}} maxLength={3000} rows={5}
     placeholder="Ejemplo: Haz un video divertido sobre los beneficios del apio con un personaje que cuenta curiosidades sorprendentes."/>
    <span>{ideaPrompt.length} / 700</span>
    <p>La IA adaptará el guion a tu público, estilo, idioma y duración.</p>
   </div>
   <button className={styles.primary} disabled={busy||ideaPrompt.trim().length<10} onClick={()=>{next("plan");void prepare(null);}}>
    <Sparkles size={18}/> Crear mi guion con IA <ArrowRight size={17}/>
   </button>
  </>:null}
  {stage==="plan"?<>
   <h1>Tu guion y escenas</h1>
   <p className={styles.help}>{selectedTrend?"Inspirado en el tema de un video real, pero con una historia original.":"Tu idea convertida en una historia original y organizada."} Todo será editable antes de producir.</p>
   {selectedTrend?<div className={styles.selectedTrend}><strong>{selectedTrend.title}</strong><a href={selectedTrend.url} target="_blank" rel="noopener noreferrer">Ver original</a></div>:null}
   {busy?<div className={styles.draftLoading} role="status" aria-live="polite">
    <div className={styles.draftOrb}><Sparkles size={33}/><span>{draftProgress}%</span></div>
    <strong>{draftPhase||"Preparando tu guion…"}</strong><p>Diseñando una secuencia coherente de {seconds/5} escenas de cinco segundos.</p>
    <div className={styles.bar}><div style={{width:String(draftProgress)+"%"}}/></div>
   </div>:null}
   {!busy&&scenes.length===0?<div className={styles.planEmpty}>
    <span><Clapperboard size={29}/></span>
    <h2>{error?"Todavía no tenemos tu guion":"Tu historia empieza aquí"}</h2>
    <p>{error?(errorMessages[error]||"No pudimos completar el guion. Tu idea sigue guardada."):"La IA preparará una historia original con escenas, narración y acciones de cámara."}</p>
    <button className={styles.primary} onClick={()=>void prepare()}><Sparkles size={18}/> {error?"Reintentar con IA":"Generar propuesta"}</button>
    <button className={styles.secondary} type="button" onClick={makeEditableDraft}><Pencil size={16}/> Escribir guion manualmente</button>
     <button className={styles.secondary} onClick={()=>next(platform==="idea"?"idea":"trends")}><Pencil size={16}/> Editar idea</button>
   </div>:null}
   {!busy&&scenes.length>0?<div className={styles.planContent}>
    {manualDraft?<div role="status" className={styles.planDraftNote}><ShieldCheck size={17}/><span>{planNotice}</span><button type="button" disabled={busy} onClick={()=>{
      if(scenes.some(x=>x.speech.trim()||x.imagePrompt.trim())&&!window.confirm("Regenerar con IA reemplazará las escenas que escribiste. ¿Continuar?"))return;
      void prepare(platform==="idea"?null:selectedTrend);
     }}>Reintentar IA</button></div>:null}
    <div className={styles.field}><label>Título</label><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140}/></div>
    <div className={styles.field}>
     <label>Narración completa · editable</label>
     <textarea rows={9} maxLength={8200} value={narrationDraft} onChange={e=>editNarration(e.target.value)}
      placeholder="Escribe una historia continua. Una misma oración puede acompañar varias imágenes."/>
     <p className={styles.help}>{scriptWords} palabras · voz estimada: {readable(scriptSeconds)} · objetivo: {readable(seconds)}</p>
     {!durationPlausible?<p className={styles.note}>Ajusta la extensión del guion. La narración debe acercarse a la duración seleccionada para evitar acelerar o cortar la voz.</p>:null}
    </div>
    <div className={styles.sceneHeading}><strong>Imágenes sugeridas · {scenes.length}</strong><span>Un cambio visual cada ~5 s</span></div>
    <div className={styles.scenes}>{scenes.map((scene,i)=><div className={styles.sceneEditor} key={i}>
     <div className={styles.sceneNumber}><strong>Imagen {i+1}</strong><small>{i*5}–{(i+1)*5} s aprox.</small></div>
     <p className={styles.help}>{scene.speech}</p>
     <label>Descripción visual editable</label>
     <textarea rows={3} maxLength={950} value={scene.imagePrompt} onChange={e=>patchScene(i,"imagePrompt",e.target.value)}/>
    </div>)}</div>
    <div className={styles.field}><label>Calidad del video</label>
     <div className={styles.optionStack}>
      {([{id:"turbo",label:"Turbo · 720p"},{id:"high",label:"Alta calidad · 720p"}] as const).map(v=>
       <button type="button" key={v.id} className={styles.optionRow} aria-pressed={quality===v.id}
        onClick={()=>{setQuality(v.id);setApprovedCost(false);}}>
        <Video size={19}/><strong>{v.label}</strong><span>{estimatedCredits(seconds,v.id)} créditos</span>{quality===v.id?<Check size={17}/>:null}
       </button>)}
     </div>
    </div>
    <div className={styles.price}><small>Costo completo confirmado antes de generar</small><strong>{credit} créditos</strong>
     <p>Incluye imágenes, animación, narración continua, subtítulos si los elegiste y montaje.</p>
    </div>
    <label className={styles.consent}><input type="checkbox" checked={approvedCost} onChange={e=>setApprovedCost(e.target.checked)}/>
     Apruebo este guion, las imágenes sugeridas y el uso de {credit} créditos para generar mi video.</label>
    <button className={styles.primary} disabled={busy||!approvedCost||!durationPlausible||!validDraft} onClick={()=>void makeJob()}>
     {busy?<LoaderCircle className={styles.spin} size={17}/>:<Clapperboard size={17}/>} Generar video por {credit} créditos
    </button>
   </div>:null}
  </>:null}
  {stage==="quality"?<><h1>Calidad del video</h1><p className={styles.help}>Estimaciones de créditos de la versión propuesta; las tarifas definitivas se confirmarán al habilitar los pagos.</p><div className={styles.optionStack}>{([{id:"turbo",label:"Turbo · 720p",description:"Renderizado optimizado"},{id:"high",label:"Alta calidad · 720p",description:"Motor de mayor calidad"}] as const).map(x=><button key={x.id} className={styles.optionRow} onClick={()=>{setQuality(x.id);setApprovedCost(false);next("summary")}}><Video size={20}/><span><strong>{x.label}</strong><small>{x.description}</small></span><b>{estimatedCredits(seconds,x.id)} cr.</b><ChevronRight size={16}/></button>)}</div></>:null}
  {stage==="summary"?<><h1>Resumen de tu video</h1><div className={styles.review}>{([{label:"Tema",value:topic==="Otro"?otherTopic:topic,edit:"topic"},{label:"Público",value:audience==="Otro"?otherAudience:audience,edit:"audience"},{label:"Estilo",value:stylesList.find(x=>x.id===visual)?.label,edit:"style"},{label:"Duración",value:readable(seconds),edit:"duration"},{label:"Idioma",value:language.toUpperCase(),edit:"language"},{label:"Voz",value:voiceLabel,edit:"voice"},{label:"Subtítulos",value:subtitles?"Sí":"No",edit:"subtitles"},{label:"Tendencias",value:selectedTrend?selectedTrend.title:platform==="idea"?"Mi idea":platform,edit:"source"},{label:"Guion",value:scenes.length+" escenas editables",edit:"plan"},{label:"Calidad",value:quality==="high"?"Alta":"Turbo",edit:"quality"}] as {label:string;value:string|undefined;edit:Stage}[]).map(r=><div className={styles.reviewRow} key={r.label}><div><small>{r.label}</small><strong>{r.value}</strong></div><button aria-label={"Editar "+r.label} onClick={()=>next(r.edit)}><Pencil size={17}/></button></div>)}</div><div className={styles.price}><small>Generación estimada · tarifa provisional</small><strong>{credit} créditos</strong><p>Incluye clips, narración seleccionada, subtítulos y montaje. La regeneración de imágenes puede tener costo adicional.</p></div><label className={styles.consent}><input type="checkbox" checked={approvedCost} onChange={e=>setApprovedCost(e.target.checked)}/> Confirmo la configuración y autorizo el uso de créditos indicado cuando el sistema esté habilitado.</label><button className={styles.primary} disabled={busy||!approvedCost||scenes.length!==seconds/5} onClick={()=>void makeJob()}>{busy?<LoaderCircle className={styles.spin} size={17}/>:<Clapperboard size={17}/>} Generar por {credit} créditos</button></>:null}
  {stage==="images"&&job?<><h1>Revisa las imágenes</h1>
<p className={styles.help}>Aprueba los fotogramas antes de animarlos. Cuando estén aprobados, la voz y el montaje seguirán automáticamente en la nube, aunque cierres la web.</p>
<div className={styles.approvalNotice}><CheckCircle2 size={18}/>{job.scenes.filter(x=>x.approved).length} / {job.scenes.length} imágenes aprobadas</div>
<div className={styles.gallery}>{job.scenes.map((scene,i)=><article key={i} className={styles.frameCard}>
<button type="button" className={styles.framePreview} onClick={()=>setSceneIndex(i)}>{scene.imageUrl?<img src={scene.imageUrl} alt={"Fotograma "+(i+1)}/>:<Film size={30}/>}</button>
<div className={styles.frameInfo}><strong>Escena {i+1}</strong><small>{i*5}–{(i+1)*5} s</small><p>{scene.speech}</p>
<button className={styles.secondary} onClick={()=>setSceneIndex(i)}>Editar</button>
{scene.approved?<span className={styles.passed}><Check size={14}/> Aprobada</span>:<button disabled={savingScene||!scene.imageUrl} className={styles.primaryMini} onClick={()=>void approve(i)}>Aprobar</button>}</div></article>)}</div>
{job.scenes[sceneIndex]?<section className={styles.frameEdit}><h2>Escena {sceneIndex+1}</h2>
{job.scenes[sceneIndex].imageUrl?<img className={styles.frameEditImage} src={job.scenes[sceneIndex].imageUrl} alt={"Escena "+(sceneIndex+1)}/>:null}
<label>Narración</label><textarea value={frameSpeech} maxLength={230} onChange={e=>setFrameSpeech(e.target.value)}/>
<button className={styles.secondary} disabled={savingScene||frameSpeech.trim()===job.scenes[sceneIndex].speech||frameSpeech.trim().length<5} onClick={()=>void updateFrame(sceneIndex,"speech",frameSpeech.trim())}>Guardar guion</button>
<label>Descripción de la imagen</label><textarea value={frameVisual} maxLength={950} onChange={e=>setFrameVisual(e.target.value)}/>
<button className={styles.secondary} disabled={savingScene} onClick={()=>setRegenIndex(sceneIndex)}><RefreshCw size={16}/> Regenerar imagen · 1 crédito</button>
</section>:null}
<button className={styles.primary} disabled={savingScene||job.scenes.some(x=>!x.imageUrl)} onClick={()=>void approve()}>Aprobar todas y generar video <ArrowRight size={17}/></button>
<button className={styles.secondary} disabled={savingScene} onClick={async()=>{setSavingScene(true);setError("");
try{await api("jobs","PATCH",{id:job.id,action:"cancel"});void loadCredits();next("history");void loadHistory();}
catch(e){setError(e instanceof Error?e.message:"studio_invalid_action");}finally{setSavingScene(false);}}}>Cancelar proyecto y liberar reserva</button>
{regenIndex!==null?<div role="dialog" aria-modal="true" className={styles.confirmLayer}><div className={styles.confirmCard}>
<h2>Regenerar imagen</h2><p>La escena {regenIndex+1} se generará de nuevo por <strong>1 crédito adicional</strong>. Las demás imágenes no cambiarán.</p>
<button className={styles.primary} disabled={savingScene||!wallet||wallet.available<1} onClick={()=>void regenerateFrame(regenIndex,frameVisual.trim())}>Confirmar · 1 crédito</button>
<button className={styles.secondary} onClick={()=>setRegenIndex(null)}>Cancelar</button>
</div></div>:null}
</>:null}
  {stage==="progress"&&job?<><h1>Creando tu video</h1><p className={styles.help}>El trabajo continúa en la nube. Puedes cerrar la web y volver desde Historial.</p>
<div className={styles.progressCard}>
<div className={styles.progressRing} style={{background:"conic-gradient(#9156c8 "+Math.max(0,Math.min(100,job.progress||0))+"%,#eee9f2 0)"}}><span>{job.progress||0}%</span></div>
<strong>{job.phase||"En cola"}</strong><small>{job.status}</small>
<small>{typeof job.etaSeconds==="number"?"Tiempo aproximado: "+readable(Math.ceil(job.etaSeconds)):"Calculando tiempo estimado…"}</small>
</div>
{job.status==="failed"||job.status==="cancelled"?<div className={styles.error}>
{job.status==="failed"?"No pudimos terminar este proyecto. Liberamos los créditos reservados.":"Proyecto cancelado."}
</div>:null}
{job.status==="failed"?<button className={styles.primary} disabled={busy} onClick={()=>void resumeJob()}>
 {busy?<LoaderCircle size={18} className={styles.spin}/>:<RefreshCw size={18}/>} Reanudar video
 </button>:null}
 <button className={styles.secondary} onClick={()=>{next("history");void loadHistory();}}>Ver historial</button>
</>:null}
  {stage==="result"&&job?<><h1>¡Video listo!</h1>{job.videoUrl?<><video className={styles.videoFinal} controls playsInline src={job.videoUrl}/><a className={styles.primary} href={job.videoUrl} download={"vmv-video-"+job.id+".mp4"}><Download size={19}/> Descargar MP4</a></>:<p className={styles.help}>El archivo está guardado. Actualiza el enlace desde Historial.</p>}<button className={styles.secondary} onClick={()=>{next("history");void loadHistory()}}>Abrir historial</button></>:null}
  {stage==="history"?<><h1>Mis videos</h1>
<div className={styles.walletPanel}><span className={styles.kicker}>MIS CRÉDITOS</span>
<strong>{wallet?wallet.available:"—"} <small>disponibles</small></strong>
<p>{wallet?wallet.reserved:0} créditos reservados en trabajos activos. Solo se cobran cuando el video termina correctamente.</p>
<button className={styles.secondary} disabled={walletBusy} onClick={()=>void loadCredits()}><RefreshCw size={16}/> Actualizar saldo</button>
</div>
<section className={styles.creditPackages}><h2>Comprar créditos</h2>
<p>{purchasesEnabled?"Compra de prueba por Stripe, sin cargos reales.":"Las compras estarán disponibles al conectar las credenciales de Stripe en modo de prueba."}</p>
<div>{packages.map(pack=><button key={pack.id} disabled={purchaseBusy||!purchasesEnabled} onClick={()=>void checkout(pack.id)}>
<strong>{pack.credits} créditos</strong><small>{"$"+(pack.usdCents/100).toFixed(2)} · prueba</small>
</button>)}</div></section>
<div className={styles.historyHeading}><h2>Proyectos guardados</h2><button className={styles.secondary} disabled={historyLoading} onClick={()=>{void loadHistory();void loadCredits();}}>{historyLoading?<LoaderCircle size={16} className={styles.spin}/>:<RefreshCw size={16}/>} Actualizar</button></div>
<div className={styles.history}>{jobs.map(item=><button key={item.id} className={styles.historyItem} onClick={async()=>{
try{const response=await api("jobs?id="+encodeURIComponent(item.id));if(!response?.job)return;
setJob(response.job);setSceneIndex(0);
next(response.job.status==="completed"?"result":response.job.status==="awaiting_image_approval"?"images":"progress");
}catch(e){setError(e instanceof Error?e.message:"video_studio_db_unavailable");}
}}><span className={styles.historyIcon}><Film size={20}/></span><span>
<strong>{item.title||"Video sin título"}</strong><small>{readable(item.seconds)} · {item.phase||item.status}</small>
</span><ChevronRight size={18}/></button>)}
{!jobs.length&&!historyLoading&&!error?<div className={styles.unavailable}><FolderOpen size={30}/><p>Cuando generes un video aparecerá aquí.</p><button onClick={reset} className={styles.primary}>Crear video</button></div>:null}
</div>
</>:null}
  {error&&stage!=="plan"?<div role="alert" className={styles.error}><ShieldCheck size={18}/><span>{errorMessages[error]||"No se pudo completar la operación. Revisa tu configuración e inténtalo de nuevo."}</span></div>:null}
  {previewExample?<div role="dialog" aria-modal="true" aria-label={"Ejemplo de "+previewExample.label} className={styles.exampleOverlay}>
   <button type="button" onClick={()=>setExampleStyle(null)} className={styles.exampleClose} aria-label="Cerrar ejemplo"><X size={24}/></button>
   <div className={styles.exampleContent}>
    {previewExample.video?<video src={previewExample.video} controls autoPlay playsInline poster={previewExample.poster}/>:
     <img src={previewExample.poster} alt={"Vista ilustrada del estilo "+previewExample.label}/>}
    <div className={styles.exampleCaption}><strong>{previewExample.label}</strong>
     <small>{previewExample.video?"Vista previa del video animado":"Ilustración de referencia · video animado próximamente"}</small>
     <button type="button" onClick={()=>{setVisual(previewExample.id);setExampleStyle(null);next("duration");}}>Elegir este estilo <ArrowRight size={16}/></button>
    </div>
   </div>
  </div>:null}
  <footer className={styles.footer}><span>VMV Business · Video Studio</span><button onClick={()=>next("home")}>Inicio</button></footer>
 </div></main>;
}
