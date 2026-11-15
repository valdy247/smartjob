"use client";
import {useEffect,useState} from "react";
import {Bot,CheckCircle2,RefreshCw} from "lucide-react";
import {loadAgents,type PersistedAgent} from "@/app/vista-app/ai-agents/agentStore";
import {loadBusinessChoices} from "@/app/vista-app/ai-agents/centralBusiness";

type Choice={id:string;name:string};
export default function WebSiteAgentSelector({siteName,selectedId,onSelect}:{
 siteName:string;selectedId:string;onSelect:(agent:Choice|null)=>void;
}){
 const [agents,setAgents]=useState<PersistedAgent[]>([]);
 const [businessNames,setBusinessNames]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;
  setLoading(true);setError("");
  void Promise.all([loadAgents(),loadBusinessChoices()]).then(([items,choices])=>{
   if(!active)return;
   const central=new Map(choices.businesses.map(b=>[b.id,b.name]));
   setBusinessNames(Object.fromEntries(choices.workspaces.map(w=>[w.id,central.get(w.central_business_id||"")||w.name])));
   setAgents(items);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:"No se pudieron consultar tus agentes.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[revision]);
 const normalized=(value:string)=>value.trim().toLocaleLowerCase("es");
 const sorted=[...agents].sort((a,b)=>{
  const aMatch=normalized(businessNames[a.business_id]||"")===normalized(siteName);
  const bMatch=normalized(businessNames[b.business_id]||"")===normalized(siteName);
  return Number(bMatch)-Number(aMatch);
 });
 const selected=agents.find(a=>a.id===selectedId);
 return <div style={{display:"flex",flexDirection:"column",gap:9,margin:"6px 4px 12px"}}>
  <p style={{margin:0,fontSize:12,lineHeight:1.5,color:"#78658d"}}>
   Elige un agente que ya creaste en VMV para asociarlo a esta página.
  </p>
  {loading?<p role="status" style={{fontSize:12}}>Consultando tus agentes…</p>:null}
  {!loading&&sorted.length===0?<p style={{fontSize:12}}>No hay agentes guardados en tu cuenta.</p>:null}
  {sorted.map(agent=><label key={agent.id} style={{
   display:"flex",alignItems:"center",gap:11,padding:"12px 10px",borderRadius:12,
   border:agent.id===selectedId?"2px solid #8250d1":"1px solid #e7dced",background:agent.id===selectedId?"#f7f0ff":"#fff",
   cursor:"pointer"
  }}>
   <input type="radio" name="web-studio-existing-agent" checked={selectedId===agent.id}
    onChange={()=>onSelect({id:agent.id,name:agent.name})}
    style={{accentColor:"#8250d1",width:19,height:19,flexShrink:0}}/>
   <Bot size={20} color="#8250d1"/>
   <span style={{display:"flex",flexDirection:"column",gap:3,minWidth:0}}>
    <strong style={{fontSize:14,color:"#372747"}}>{agent.name}</strong>
    <small style={{fontSize:11,color:"#78658d"}}>{businessNames[agent.business_id]||"Negocio de VMV"} · {agent.status==="active"?"Activo":agent.status==="paused"?"Pausado":"Borrador"}</small>
   </span>
  </label>)}
  {selectedId?<div style={{display:"flex",flexDirection:"column",gap:7,padding:10,borderRadius:12,background:"#f4eefb"}}>
   <span style={{display:"flex",alignItems:"center",gap:7,fontSize:12,fontWeight:800,color:"#523576"}}>
    <CheckCircle2 size={16}/> {selected?"Seleccionado: "+selected.name:"Agente seleccionado anteriormente"}
   </span>
   <small style={{color:"#6e5982",lineHeight:1.5}}>Asociación guardada en este borrador. Todavía no habilita respuestas automáticas del chat público.</small>
   <button type="button" onClick={()=>onSelect(null)} style={{alignSelf:"flex-start",minHeight:32,fontSize:12}}>Quitar selección</button>
  </div>:null}
  {error?<p role="alert" style={{fontSize:12,color:"#a43d56"}}>{error}</p>:null}
  <button type="button" onClick={()=>setRevision(v=>v+1)} disabled={loading}
   style={{display:"flex",gap:7,alignItems:"center",alignSelf:"flex-start",minHeight:35,fontSize:12}}>
   <RefreshCw size={15}/> Actualizar agentes
  </button>
 </div>;
}
