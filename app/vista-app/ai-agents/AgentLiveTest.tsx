"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Bot,LoaderCircle,MessageCircle,Send,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {PersistedAgent} from "./agentStore";
import styles from "./AgentLiveTest.module.css";

type Item={id:string;role:"user"|"assistant";content:string;created_at:string};
type Conversation={id:string;title:string;created_at:string};
type Props={agent:PersistedAgent;onClose:()=>void;onEdit:()=>void};
const idValid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AgentLiveTest({agent,onClose,onEdit}:Props){
 const [message,setMessage]=useState("");
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [current,setCurrent]=useState<string|null>(null);
 const [messages,setMessages]=useState<Item[]>([]);
 const [sending,setSending]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const listBottom=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{listBottom.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[messages.length]);
 useEffect(()=>{
  let live=true;
  const init=async()=>{
   const db=getSupabase();
   if(!db)throw Error("Supabase no está disponible.");
   const {data:{user},error}=await db.auth.getUser();
   if(error||!user||user.is_anonymous||agent.owner_id!==user.id)throw Error("Inicia sesión en tu cuenta para probar este agente.");
   const {data:history,error:loadError}=await db.from("vmv_ai_conversations")
    .select("id,title,created_at").eq("agent_id",agent.id).eq("owner_id",user.id)
    .order("created_at",{ascending:false}).limit(15);
   if(loadError)throw Error("No se pudieron cargar las simulaciones.");
   if(live)setConversations((history||[]) as Conversation[]);
  };
  void init().catch(e=>{if(live)setNotice(e instanceof Error?e.message:"No se pudo abrir el simulador.");})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[agent.id,agent.owner_id]);
 async function readMessages(conversationId:string){
  if(!idValid.test(conversationId))throw Error("Conversación inválida.");
  const db=getSupabase();if(!db)throw Error("Sin conexión.");
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user||user.id!==agent.owner_id)throw Error("Inicia sesión nuevamente.");
  const {data,error}=await db.from("vmv_ai_messages")
   .select("id,role,content,created_at")
   .eq("conversation_id",conversationId).eq("owner_id",user.id)
   .order("created_at",{ascending:true}).limit(100);
  if(error)throw Error("No se pudieron recuperar los mensajes.");
  setMessages((data||[]) as Item[]);
 }
 async function openConversation(conversationId:string){
  if(sending)return;
  setNotice("");setLoading(true);
  try{await readMessages(conversationId);setCurrent(conversationId);}
  catch(e){setNotice(e instanceof Error?e.message:"No se pudo abrir.");}
  finally{setLoading(false);}
 }
 async function send(){
  const prompt=message.trim().slice(0,1000);
  if(!prompt||sending||!agent.revision)return;
  setSending(true);setNotice("");
  try{
   const db=getSupabase();if(!db)throw Error("Supabase no está disponible.");
   const [{data:auth},{data:identity,error:identityError}]=await Promise.all([
    db.auth.getSession(),db.auth.getUser()
   ]);
   const token=auth.session?.access_token;
   if(identityError||!identity.user||identity.user.id!==agent.owner_id||!token)
    throw Error("Tu sesión expiró. Vuelve a iniciar sesión.");
   let id=current;
   if(!id){
    const {data:created,error:insertError}=await db.from("vmv_ai_conversations")
     .insert({owner_id:identity.user.id,agent_id:agent.id,title:prompt.slice(0,90)})
     .select("id").single();
    if(insertError||!created?.id)throw Error("No se pudo crear la conversación de prueba.");
    id=created.id as string;setCurrent(id);
    setConversations(previous=>[{id:id!,title:prompt.slice(0,90),created_at:new Date().toISOString()},...previous].slice(0,15));
   }
   setMessage("");
   setMessages(prior=>[...prior,{id:"local-"+Date.now(),role:"user",content:prompt,created_at:new Date().toISOString()}]);
   const response=await fetch("/api/vmv/ai-agents/simulate",{
    method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({agentId:agent.id,conversationId:id,message:prompt})
   });
   let payload:{reply?:string;error?:string}={};
   try{payload=await response.json();}catch{}
   if(!response.ok||!payload.reply)throw Error(payload.error||"El agente no respondió; intenta nuevamente.");
   await readMessages(id);
  }catch(e){
   setNotice(e instanceof Error?e.message:"No se pudo completar la prueba.");
  }finally{setSending(false);}
 }
 return <section className={styles.root}>
  <button type="button" className={styles.back} onClick={onClose}><ArrowLeft size={17}/> Mis agentes</button>
  <div className={styles.hero}>
   <span className={styles.avatar}><Bot size={24}/></span>
   <div><strong>{agent.name}</strong><small>Simulación real · IA conectada · Sin acciones comerciales</small></div>
  </div>
  <div className={styles.notice}><ShieldCheck size={17}/>
   <span>Esta conversación usa un modelo de IA y se guarda en tu cuenta. No realiza llamadas, reservas, pedidos ni cobros.</span>
  </div>
  {conversations.length>0?<div className={styles.history}>
   <label htmlFor="agent-test-conversation">Conversaciones anteriores</label>
   <select id="agent-test-conversation" value={current||""} disabled={sending}
    onChange={e=>{if(!e.target.value){setCurrent(null);setMessages([]);}else void openConversation(e.target.value);}}>
    <option value="">Nueva conversación</option>
    {conversations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
   </select>
  </div>:null}
  <div className={styles.chat} aria-live="polite">
   {loading?<p className={styles.empty}><LoaderCircle size={17}/> Cargando…</p>:messages.length===0?
    <p className={styles.empty}><MessageCircle size={19}/> Escribe una pregunta real como si fueras un cliente.</p>:
    messages.map(item=><p key={item.id} className={item.role==="user"?styles.customer:styles.agentReply}>
     <small>{item.role==="user"?"CLIENTE":"AGENTE IA"}</small>
     <span>{item.content}</span>
    </p>)}
   {sending?<p className={styles.empty}><LoaderCircle size={17}/> El agente está respondiendo…</p>:null}
   <div ref={listBottom}/>
  </div>
  {notice?<div className={styles.error} role="alert">{notice}</div>:null}
  <label className={styles.entryLabel} htmlFor="agent-test-prompt">Tu mensaje de prueba</label>
  <textarea id="agent-test-prompt" rows={3} maxLength={1000} value={message}
   onChange={e=>setMessage(e.target.value)}
   placeholder="Hola, ¿qué productos ofrecen y cuál es el horario?" disabled={sending}/>
  <button type="button" className={styles.send} disabled={sending||!message.trim()}
   onClick={()=>void send()}><Send size={17}/>{sending?"Respondiendo…":"Enviar al agente"}</button>
  <button type="button" className={styles.edit} onClick={onEdit}>Editar información del agente</button>
 </section>;
}
