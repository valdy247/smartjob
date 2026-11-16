"use client";

import {useEffect,useState} from "react";
import {Bot,CalendarClock,MessageCircle,Package,PhoneCall,Settings2,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {setAgentCatalogReadAccess,setAgentPublicChatAccess,type PersistedAgent,type PhoneSelection} from "./agentStore";
import styles from "./page.module.css";

type Policy={agent_enabled:boolean;[key:string]:unknown};
type CallStatus={version:number;selectedAgentId:string|null;agentActive:boolean;policy:Policy};
type Props={
 agent:PersistedAgent;phone:PhoneSelection|null;
 onUpdated:(agent:PersistedAgent)=>void;onConfigureCalls:()=>void;
};

export default function AgentQuickConnections({agent,phone,onUpdated,onConfigureCalls}:Props){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState<"inventory"|"calls"|"chat"|null>(null);
 const [error,setError]=useState("");
 const [callStatus,setCallStatus]=useState<CallStatus|null>(null);
 const [callLoading,setCallLoading]=useState(false);
 useEffect(()=>{let active=true;
  if(!open||!phone?.routeId){setCallStatus(null);return;}
  setCallLoading(true);
  void(async()=>{
   try{
    const db=getSupabase();
    const {data}=db?await db.auth.getSession():{data:{session:null}};
    if(!data.session?.access_token)return;
    const response=await fetch("/api/vmv/ai-agents/call-settings",{
     cache:"no-store",headers:{Authorization:"Bearer "+data.session.access_token}
    });
    if(!response.ok)return;
    const result=await response.json() as CallStatus;
    if(active)setCallStatus(result);
   }catch{/* A network failure should not flip the switch to an incorrect state. */}
   finally{if(active)setCallLoading(false);}
  })();
  return()=>{active=false;};
 },[open,phone?.routeId,phone?.agentId,agent.id]);
 async function inventoryToggle(enabled:boolean){
  if(busy)return;
  setBusy("inventory");setError("");
  try{
   const latest=await setAgentCatalogReadAccess(agent,enabled);
   onUpdated(latest);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar Inventario.");}
  finally{setBusy(null);}
 }
 const callsConfigured=Boolean(phone?.serverEnrolled&&phone.agentId===agent.id&&agent.status==="active");
 const callsOn=Boolean(callsConfigured&&callStatus?.policy?.agent_enabled);
 async function callsToggle(enabled:boolean){
  if(busy||!callsConfigured||!callStatus)return;
  setBusy("calls");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
   const {data}=await db.auth.getSession();
   if(!data.session?.access_token)throw Error("Inicia sesión nuevamente.");
   const response=await fetch("/api/vmv/ai-agents/call-settings",{
    method:"PUT",cache:"no-store",
    headers:{Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({version:callStatus.version,
     policy:{...callStatus.policy,agent_enabled:enabled}})
   });
   const payload=await response.json() as {error?:string;version?:number;policy?:Policy};
   if(!response.ok||!payload.policy||typeof payload.version!=="number")
    throw Error(payload.error||"No se pudo configurar la línea.");
   setCallStatus({...callStatus,version:payload.version,policy:payload.policy});
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar Llamadas.");}
  finally{setBusy(null);}
 }
 async function chatToggle(enabled:boolean){
  if(busy)return;
  if(enabled&&!window.confirm("Permitir que clientes reales hablen con "+agent.name+
   " mediante IA en la web del negocio. No puede realizar cobros, pedidos ni reservas. ¿Continuar?"))return;
  setBusy("chat");setError("");
  try{
   const updated=await setAgentPublicChatAccess(agent,enabled);
   onUpdated(updated);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar Chat.");}
  finally{setBusy(null);}
 }
 const chatOn=agent.setup.cap_chat==="Sí";
 const inventoryOn=agent.setup.cap_catalog==="Sí";
 return <section className={styles.quickAgentCard} aria-label={"Mi agente "+agent.name}>
  <div className={styles.quickAgentTop}>
   <span className={styles.quickAgentAvatar}><Bot size={37} strokeWidth={1.6}/></span>
   <div className={styles.quickAgentIdentity}>
    <small>MI AGENTE</small>
    <strong>{agent.name}</strong>
   </div>
   <button type="button" className={styles.quickAgentConnectButton}
    aria-expanded={open} aria-controls="vmv-agent-quick-connections"
    onClick={()=>{setOpen(v=>!v);setError("");}}>
    {open?<><X size={15}/> Cerrar</>:<><Settings2 size={15}/> Conexiones</>}
   </button>
  </div>
  {open?<div id="vmv-agent-quick-connections" className={styles.quickAgentConnections}>
   <div className={styles.quickAgentSwitchRow}>
    <span className={styles.quickAgentRowIcon}><MessageCircle size={18}/></span>
    <span className={styles.quickAgentRowName}>Chat
     {chatOn&&agent.status==="paused"?<small>Agente pausado</small>:null}
    </span>
    <input type="checkbox" role="switch" aria-label="Chat público"
     checked={chatOn} disabled={Boolean(busy)}
     onChange={e=>void chatToggle(e.target.checked)}/>
   </div>
   <div className={styles.quickAgentSwitchRow}>
    <span className={styles.quickAgentRowIcon}><PhoneCall size={18}/></span>
    <span className={styles.quickAgentRowName}>Llamadas
     {!callsConfigured?<small>Línea por configurar</small>:null}
    </span>
    {callsConfigured?<input type="checkbox" role="switch" aria-label="Atender llamadas"
      checked={callsOn} disabled={Boolean(busy)||callLoading||!callStatus}
      onChange={e=>void callsToggle(e.target.checked)}/>:
      <button type="button" className={styles.quickAgentSetup} onClick={onConfigureCalls}>
       Configurar
      </button>}
   </div>
   <div className={styles.quickAgentSwitchRow}>
    <span className={styles.quickAgentRowIcon}><Package size={18}/></span>
    <span className={styles.quickAgentRowName}>Inventario</span>
    <input type="checkbox" role="switch" aria-label="Consultar inventario"
     checked={inventoryOn} disabled={Boolean(busy)}
     onChange={e=>void inventoryToggle(e.target.checked)}/>
   </div>
   {error?<small className={styles.quickAgentError} role="alert">{error}</small>:null}
  </div>:null}
 </section>;
}
