"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Bot,Check,Headphones,RotateCcw,Send,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {checkCallPolicy,type CallPolicy,type CallDecision} from "@/lib/vmv-ai-agents/call-policy";
import styles from "./CallPreviewChat.module.css";

type Route=CallDecision["action"];
type Scenario="actual"|"menu"|"agent"|"translation";
type Agent={id:string;name:string;language:string;status:string;configuration:Record<string,string>};
type Line={id:number;who:"system"|"caller"|"agent";text:string};
const copy=(text:string)=>text.trim().slice(0,1000);
function agentGreeting(agent:Agent|null){
 if(!agent)return "El agente no está disponible para la simulación.";
 const cfg=agent.configuration||{};
 const business=(cfg.business_name||"el negocio").trim();
 const greeting=(cfg.call_hello||cfg.call_greeting||"").trim();
 if(agent.language==="en"){
  return "Thank you for calling "+business+". I'm an artificial intelligence assistant."+
   (greeting?" "+greeting:" How may I help you?");
 }
 return "Gracias por llamar a "+business+". Soy un asistente de inteligencia artificial."+
  (greeting?" "+greeting:" ¿En qué puedo ayudarte?");
}
export default function CallPreviewChat({policy,selectedAgentId,onClose}:{
 policy:CallPolicy;selectedAgentId:string|null;onClose:()=>void
}){
 const [lines,setLines]=useState<Line[]>([]);
 const [route,setRoute]=useState<Route|null>(null);
 const [scenario,setScenario]=useState<Scenario>("actual");
 const [routeNote,setRouteNote]=useState("");
 const [agent,setAgent]=useState<Agent|null>(null);
 const [agents,setAgents]=useState<Agent[]>([]);
 const [agentChoice,setAgentChoice]=useState("");
 const [entry,setEntry]=useState("");
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [restart,setRestart]=useState(0);
 const sequence=useRef(0);
 const conversation=useRef<string|null>(null);
 const scroll=useRef<HTMLDivElement|null>(null);
 const line=(who:Line["who"],text:string):Line=>({id:++sequence.current,who,text});
 useEffect(()=>{scroll.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[lines.length]);
 useEffect(()=>{
  let alive=true;conversation.current=null;setAgent(null);setRoute(null);
  setLines([]);setError("");setRouteNote("");setLoading(true);setEntry("");
  const load=async()=>{
   const db=getSupabase();
   if(!db)throw Error("No se pudo abrir la prueba.");
   const {data:{user},error:userError}=await db.auth.getUser();
   const {data:{session}}=await db.auth.getSession();
   if(userError||!user||user.is_anonymous||!session?.access_token)throw Error("Inicia sesión para probar la llamada.");
   let decision:CallDecision|null=null;
   let agentReadyForCalls=false;
   if(scenario==="actual"){
    const response=await fetch("/api/vmv/ai-agents/call-settings",{
     method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
     Authorization:"Bearer "+session.access_token},
     body:JSON.stringify({policy:checkCallPolicy(policy)})
    });
    const payload=await response.json() as {decision?:CallDecision;selectedAgentReady?:boolean;error?:string};
    if(!response.ok||!payload.decision)throw Error(payload.error||"No se pudo simular esta configuración.");
    decision=payload.decision;
    agentReadyForCalls=Boolean(payload.selectedAgentReady);
   }
   const {data:rows,error:agentsError}=await db.from("vmv_ai_agents")
    .select("id,name,language,configuration,status")
    .eq("owner_id",user.id).limit(25);
   if(agentsError)throw Error("No se pudieron cargar tus agentes.");
   const options:Agent[]=(rows||[]).map(row=>({
    id:row.id,name:row.name,language:row.language,status:row.status,
    configuration:(row.configuration||{}) as Record<string,string>
   }));
   const picked=scenario==="actual"?selectedAgentId:
    (agentChoice||selectedAgentId||(options.length===1?options[0].id:null));
   const found=options.find(a=>a.id===picked)||null;
   if(!alive)return;
   setAgents(options);
   setAgent(found);
   const action:Route=scenario==="actual"?decision!.action:scenario;
   if(scenario!=="actual")setRouteNote("Escenario de prueba · no modifica la línea.");
   else if(action==="message"){
    setRouteNote(!agentReadyForCalls&&policy.agent_enabled?
     "No hay un agente activo seleccionado para esta línea.":
     decision?.reason==="outside_hours"?
      "La configuración está fuera de horario.":
      "Las funciones disponibles no están atendiendo ahora.");
   }else setRouteNote("Así respondería la línea según tus ajustes.");
   if(action==="agent"&&!found){
    setRoute("message");
    setLines([line("system","No tienes un agente seleccionado. Elige uno en AI Agents y vuelve a probar.")]);
   }else{
    setRoute(action);
    if(action==="menu"){
     setLines([line("system","Menú orientativo: marca 1 para el agente IA o 2 para traducción.")]);
    }else if(action==="agent"){
     setLines([line("agent",agentGreeting(found))]);
    }else if(action==="translation"){
     setLines([line("system","Smart Call conectaría a ambas personas con traducción en tiempo real. Esta vista es solo una simulación.")]);
    }else if(action==="ring_owner"){
     setLines([line("system","Primero sonaría el teléfono autorizado durante "+policy.ring_seconds+" segundos.")]);
    }else{
     setLines([line("system",policy.closed_message)]);
    }
   }
  };
  void load().catch(e=>{if(alive)setError(e instanceof Error?e.message:"No se pudo cargar la prueba.");})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[policy,selectedAgentId,restart,scenario,agentChoice]);
 const select=(digit:1|2)=>{
  if(route!=="menu")return;
  const next:Route=digit===1?(agent?"agent":"message"):"translation";
  setLines(previous=>[...previous,line("caller",String(digit)),
   line(digit===1?"agent":"system",digit===1?agentGreeting(agent):
    "Smart Call conectaría a ambas personas con traducción en tiempo real. Esta vista es solo una simulación.")]);
  setRoute(next);
 };
 const noAnswer=()=>{
  if(route!=="ring_owner")return;
  setLines(previous=>[...previous,line("caller","No contesta"),
   line("agent",agentGreeting(agent))]);
  setRoute("agent");
 };
 const send=async()=>{
  const prompt=copy(entry);
  if(!prompt||sending||route!=="agent"||!agent)return;
  setError("");setSending(true);setEntry("");
  setLines(previous=>[...previous,line("caller",prompt)]);
  try{
   const db=getSupabase();
   if(!db)throw Error("Sin conexión.");
   const [{data:{user},error:userError},{data:{session}}]=await Promise.all([
    db.auth.getUser(),db.auth.getSession()
   ]);
   if(userError||!user||user.is_anonymous||!session?.access_token)throw Error("La sesión expiró.");
   let id=conversation.current;
   if(!id){
    const {data:created,error:insertError}=await db.from("vmv_ai_conversations")
     .insert({owner_id:user.id,agent_id:agent.id,title:prompt.slice(0,90)})
     .select("id").single();
    if(insertError||!created?.id)throw Error("No se pudo iniciar la conversación de prueba.");
    id=created.id as string;conversation.current=id;
   }
   const response=await fetch("/api/vmv/ai-agents/simulate",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
    body:JSON.stringify({agentId:agent.id,conversationId:id,message:prompt,phonePreview:true})
   });
   const result=await response.json() as {reply?:string;error?:string};
   if(!response.ok||!result.reply)throw Error(result.error||"El agente no respondió.");
   setLines(previous=>[...previous,line("agent",result.reply!)]);
  }catch(e){setError(e instanceof Error?e.message:"No se completó la prueba.");}
  finally{setSending(false);}
 };
 return <section className={styles.root} aria-label="Simulación de llamada">
  <div className={styles.top}>
   <button type="button" className={styles.back} onClick={onClose} aria-label="Cerrar prueba"><ArrowLeft size={16}/></button>
   <div className={styles.heading}><strong>Probar llamada</strong><small>Simulación · sin llamar</small></div>
   <button type="button" className={styles.restart} onClick={()=>setRestart(v=>v+1)} disabled={loading||sending} aria-label="Reiniciar prueba"><RotateCcw size={17}/></button>
   <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
  </div>
  <div className={styles.scenarios} role="group" aria-label="Elegir recorrido de prueba">
   {([["actual","Ruta actual"],["menu","Menú 1 / 2"],["agent","Agente IA"],["translation","Traducción"]] as const).map(([value,label])=>
    <button key={value} type="button" aria-pressed={scenario===value}
     disabled={loading||sending} className={scenario===value?styles.scenarioActive:styles.scenario}
     onClick={()=>setScenario(value)}>{label}</button>)}
  </div>
  {(scenario==="agent"||scenario==="menu")&&agents.length>0?
   <label className={styles.agentPicker}>Agente de prueba
    <select value={agentChoice||selectedAgentId||(agents.length===1?agents[0].id:"")}
     disabled={loading||sending}
     onChange={e=>setAgentChoice(e.target.value)}>
     {agents.length>1&&!agentChoice&&!selectedAgentId?<option value="">Elige un agente</option>:null}
     {agents.map(a=><option key={a.id} value={a.id}>{a.name}{a.status!=="active"?" · inactivo":""}</option>)}
    </select>
   </label>:null}
  {routeNote?<p className={styles.routeNote}>{routeNote}</p>:null}
  {agent&&agent.status!=="active"&&(scenario==="agent"||scenario==="menu")?
   <p className={styles.inactiveNote} role="status">{agent.name} está inactivo. Puedes probarlo aquí, pero no atiende llamadas reales.</p>:null}
  <div className={styles.chat} aria-live="polite" aria-relevant="additions text">
   {loading?<p className={styles.wait}>Preparando llamada de prueba…</p>:null}
   {lines.map(item=><div key={item.id} className={item.who==="caller"?styles.userBubble:styles.botBubble}>
    <small>{item.who==="caller"?"CLIENTE":item.who==="agent"?"AGENTE IA":"LLAMADA"}</small>
    <span>{item.text}</span>
   </div>)}
   {sending?<p className={styles.wait}>El agente está respondiendo…</p>:null}
   <div ref={scroll}/>
  </div>
  {!loading&&!error&&route==="menu"?<div className={styles.options}>
   <button type="button" onClick={()=>select(1)}><Bot size={17}/><b>1</b> Agente IA</button>
   <button type="button" onClick={()=>select(2)}><Headphones size={17}/><b>2</b> Traducción</button>
  </div>:null}
  {!loading&&route==="ring_owner"?<div className={styles.options}>
   <button type="button" onClick={noAnswer}>Simular sin respuesta</button>
   <button type="button" onClick={()=>{setRoute("message");setLines(v=>[...v,line("caller","Contesta una persona"),line("system","La llamada continuaría con la persona autorizada.")]);}}><Check size={16}/> Contesta una persona</button>
  </div>:null}
  {!loading&&route==="agent"&&agent?<form className={styles.write} onSubmit={e=>{e.preventDefault();void send();}}>
   <input aria-label="Mensaje del cliente" placeholder="Escribe como cliente…" maxLength={1000}
    value={entry} onChange={e=>setEntry(e.target.value)} disabled={sending}/>
   <button type="submit" disabled={sending||!entry.trim()} aria-label="Enviar al agente"><Send size={18}/></button>
  </form>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <p className={styles.disclaimer}>Vista previa de reglas y guion orientativo, no audio real. El chat de IA usa el límite diario de simulaciones.</p>
 </section>;
}