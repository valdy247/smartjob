"use client";
import {useCallback,useEffect,useState} from "react";
import {
 ArrowLeft,ArrowUpRight,Bot,Check,CheckCircle2,ChevronRight,
 Globe2,Headphones,Inbox,LoaderCircle,MessageCircle,Package,
 RefreshCw,Settings2,ShieldCheck,ShoppingBag,SlidersHorizontal,
 Sparkles,Unplug,Users,X
} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {listCatalog,type CatalogItem,formatUsd} from "./commerceStore";
import {setAgentCatalogReadAccess,type PersistedAgent} from "./agentStore";
import css from "./ChatWebHub.module.css";
import {useAgentHeaderBack} from "./AgentHeaderBack";

type Section="home"|"sites"|"conversations"|"settings";
type Settings={
 warmth:number;formality:number;reply_style:"brief"|"balanced"|"detailed";
 languages:"auto"|"es"|"en";sales_enabled:boolean;sales_item_ids:string[];
 lead_capture:boolean;human_handoff:boolean;
};
type Site={slug:string;business:string;kind:"classic"|"builder";published_at:string};
type Link={site_slug:string;site_kind:"classic"|"builder";agent_id:string;public_chat_enabled:boolean};
type Conversation={id:string;title:string;created_at:string};
type VisitorChat={id:string;site_slug:string;site_kind:"classic"|"builder";created_at:string;updated_at:string};
type Inquiry={id:string;site_slug:string;visitor_name:string;message:string;service:string;status:string;created_at:string};
type Message={id:string;role:"user"|"assistant";content:string;created_at:string};
const defaults:Settings={warmth:80,formality:55,reply_style:"balanced",languages:"auto",
 sales_enabled:false,sales_item_ids:[],lead_capture:true,human_handoff:true};
const norm=(s:string)=>s.trim().toLocaleLowerCase("es");
const when=(d:string)=>new Date(d).toLocaleDateString("es-US",{month:"short",day:"numeric"});
export default function ChatWebHub({agent,businessName,onBack,onTest,onAgentUpdated}:{
 agent:PersistedAgent;businessName:string;onBack:()=>void;onTest:()=>void;
 onAgentUpdated:(agent:PersistedAgent)=>void;
}){
 const [section,setSection]=useState<Section>("home");
 const [settings,setSettings]=useState<Settings>(defaults);
 const [sites,setSites]=useState<Site[]>([]),[links,setLinks]=useState<Link[]>([]);
 const [catalog,setCatalog]=useState<CatalogItem[]>([]);
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [visitorChats,setVisitorChats]=useState<VisitorChat[]>([]);
 const [settingsSaved,setSettingsSaved]=useState(false);
 const [inquiries,setInquiries]=useState<Inquiry[]>([]);
 const [conversationTab,setConversationTab]=useState<"ai"|"website"|"tests">("ai");
 const [chosen,setChosen]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const owner=agent.owner_id;
 const useSharedHeader=useAgentHeaderBack(()=>{
  if(section==="conversations"&&chosen){
   setChosen(null);setMessages([]);return;
  }
  if(section==="home"){onBack();return;}
  setSection("home");setChosen(null);setMessages([]);setError("");setNotice("");
 });
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión con VMV.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous||user.id!==owner)throw Error("Inicia sesión nuevamente.");
   const [prefs,publications,builderSites,bound,products,tests,requests,visitors]=await Promise.all([
    db.from("vmv_web_chat_settings").select("*").eq("owner_id",owner).eq("agent_id",agent.id).maybeSingle(),
    db.from("smartjob_web_publications").select("slug,content,published_at").eq("owner_id",owner).limit(100),
    db.from("smartjob_builder_public_pages").select("site_slug,site_name,published_at")
     .eq("owner_id",owner).eq("page_slug","home").limit(100),
    db.from("vmv_web_chat_site_links").select("site_slug,site_kind,agent_id,public_chat_enabled").eq("owner_id",owner).limit(100),
    listCatalog(agent.business_id),
    db.from("vmv_ai_conversations").select("id,title,created_at").eq("owner_id",owner).eq("agent_id",agent.id)
     .order("created_at",{ascending:false}).limit(20),
    db.from("smartjob_web_inquiries").select("id,site_slug,visitor_name,message,service,status,created_at")
     .eq("owner_id",owner).order("created_at",{ascending:false}).limit(100),
    db.from("vmv_web_public_chat_sessions").select("id,site_slug,site_kind,created_at,updated_at")
     .eq("owner_id",owner).eq("agent_id",agent.id).order("updated_at",{ascending:false}).limit(40)
   ]);
   if(prefs.error||publications.error||builderSites.error||bound.error||tests.error||requests.error||visitors.error)
    throw Error("No pudimos cargar todos los datos de Chat web.");
   const raw=(publications.data||[]) as {slug:string;content:Record<string,unknown>;published_at:string}[];
   const ownSites:Site[]=raw.filter(s=>norm(String(s.content?.business||""))===norm(businessName))
    .map(s=>({slug:s.slug,business:String(s.content?.business||businessName),published_at:s.published_at,kind:"classic"}));
   const modern=((builderSites.data||[]) as {site_slug:string;site_name:string;published_at:string}[])
    .filter(s=>norm(s.site_name||"")===norm(businessName))
    .map(s=>({slug:s.site_slug,business:s.site_name,published_at:s.published_at,kind:"builder" as const}));
   const allSites=[...modern,...ownSites];
   setSites(allSites);setLinks((bound.data||[]) as Link[]);setCatalog(products);
   setVisitorChats((visitors.data||[]) as VisitorChat[]);
   setConversations((tests.data||[]) as Conversation[]);
   setInquiries(((requests.data||[]) as Inquiry[]).filter(r=>allSites.some(s=>s.slug===r.site_slug)));
   setSettingsSaved(Boolean(prefs.data));
   if(prefs.data){
    const p=prefs.data;
    setSettings({
     warmth:p.warmth,formality:p.formality,
     reply_style:p.reply_style,languages:p.languages,sales_enabled:p.sales_enabled,
     sales_item_ids:Array.isArray(p.sales_item_ids)?p.sales_item_ids:[],
     lead_capture:p.lead_capture,human_handoff:p.human_handoff
    });
   }else setSettings(defaults);
  }catch(e){setError(e instanceof Error?e.message:"No disponible");}
  finally{setLoading(false);}
 },[owner,agent.id,agent.business_id,businessName]);
 useEffect(()=>{void load();},[load]);
 const change=<K extends keyof Settings>(key:K,value:Settings[K])=>{setSettings(p=>({...p,[key]:value}));setNotice("");};
 const eligible=catalog.filter(c=>c.approved&&c.active&&c.price_cents>0&&
  (c.stock_mode==="unlimited"||(c.stock_mode==="tracked"&&Number(c.available_qty)>0)));
 const linked=links.filter(l=>l.agent_id===agent.id);
 const linkedCount=linked.filter(l=>sites.some(s=>s.slug===l.site_slug&&s.kind===l.site_kind)).length;
 const activeCount=linked.filter(l=>l.public_chat_enabled&&sites.some(s=>s.slug===l.site_slug&&s.kind===l.site_kind)).length;
 const selectedCount=eligible.filter(c=>settings.sales_item_ids.includes(c.id)).length;
 async function changeSite(slug:string,remove:boolean){
  if(saving)return;
  const site=sites.find(s=>s.slug===slug);if(!site)return;
  if(remove&&!window.confirm("¿Desvincular "+site.business+"? Se quitará la asociación con el agente."))
   return;
  setSaving(true);setError("");setNotice("");
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(user?.id!==owner)throw Error("Inicia sesión nuevamente.");
   const result=remove?
    await db.from("vmv_web_chat_site_links").delete().eq("owner_id",owner)
     .eq("agent_id",agent.id).eq("site_slug",slug).eq("site_kind",site.kind):
    await db.from("vmv_web_chat_site_links").insert({
     owner_id:owner,site_slug:slug,site_kind:site.kind,agent_id:agent.id,business_id:agent.business_id,
     public_chat_enabled:false
    });
   if(result.error)throw Error(remove?"No se pudo desvincular.":"No se pudo preparar la vinculación.");
   setNotice(remove?"Web desvinculada.":"Web vinculada para futura activación; el chat público sigue apagado.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setSaving(false);}
 }
 async function togglePublicChat(site:Site,activate:boolean){
  if(saving)return;
  if(activate&&!settingsSaved){
   setSection("settings");setNotice("Guarda primero los ajustes del chat.");return;
  }
  if(activate&&agent.status!=="active"){
   setError("Activa primero tu agente principal en AI Agents.");return;
  }
  if(activate&&!window.confirm(
   "¿Activar el chat IA público en "+site.business+"? Los visitantes podrán conversar y usarán la cuota diaria de VMV."
  ))return;
  setSaving(true);setError("");setNotice("");
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(user?.id!==owner)throw Error("Inicia sesión nuevamente.");
   const {data,error:writeError}=await db.from("vmv_web_chat_site_links")
    .update({public_chat_enabled:activate})
    .eq("owner_id",owner).eq("agent_id",agent.id)
    .eq("site_kind",site.kind).eq("site_slug",site.slug)
    .select("public_chat_enabled").single();
   if(writeError||!data||data.public_chat_enabled!==activate)
    throw Error("No se pudo cambiar el estado. Comprueba que el agente principal esté activo y vinculado.");
   await load();
   setNotice(activate?"Chat IA activado para esta web.":"Chat IA pausado. El formulario de contacto permanece.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar el chat.");}
  finally{setSaving(false);}
 }
 async function connectCatalog(){
  if(saving||agent.setup.cap_catalog==="Sí")return;
  setSaving(true);setError("");setNotice("");
  try{
   const updated=await setAgentCatalogReadAccess(agent,true);
   onAgentUpdated(updated);
   setNotice("Catálogo conectado en modo consulta.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo habilitar el catálogo.");}
  finally{setSaving(false);}
 }
 async function saveSettings(){
  if(saving)return;
  setSaving(true);setError("");setNotice("");
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(user?.id!==owner)throw Error("Inicia sesión nuevamente.");
   const values={...settings,sales_item_ids:settings.sales_enabled?
    settings.sales_item_ids.filter(id=>eligible.some(c=>c.id===id)):[],
    owner_id:owner,agent_id:agent.id,business_id:agent.business_id};
   if(values.sales_enabled&&(agent.setup.cap_catalog!=="Sí"||!values.sales_item_ids.length))
    throw Error("Conecta el catálogo y elige productos disponibles.");
   const {error:saveError}=await db.from("vmv_web_chat_settings")
    .upsert(values,{onConflict:"agent_id"});
   if(saveError)throw Error("No se pudo guardar. Revisa los productos autorizados.");
   setSettings(values);setSettingsSaved(true);setNotice("Ajustes guardados para el chat público y la prueba.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setSaving(false);}
 }
 async function showConversation(id:string){
  if(loading||saving)return;
  setChosen(id);setMessages([]);setError("");
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión.");
   const table=conversationTab==="ai"?"vmv_web_public_chat_messages":"vmv_ai_messages";
   const {data,error:readError}=await db.from(table)
    .select("id,role,content,created_at").eq("owner_id",owner)
    .eq(conversationTab==="ai"?"session_id":"conversation_id",id)
    .order("created_at",{ascending:true}).limit(100);
   if(readError)throw Error("No se pudo leer esta conversación.");
   setMessages((data||[]) as Message[]);
  }catch(e){setError(e instanceof Error?e.message:"No disponible.");}
 }
 const groups=[
  {id:"sites" as const,title:"Webs",detail:"Conectar o quitar",Icon:Globe2,color:"lilac"},
  {id:"test" as const,title:"Probar agente",detail:"Chat de prueba",Icon:Bot,color:"mint"},
  {id:"conversations" as const,title:"Conversaciones",detail:"Mensajes recientes",Icon:MessageCircle,color:"blue"},
  {id:"settings" as const,title:"Ajustes",detail:"Tono y productos",Icon:SlidersHorizontal,color:"rose"}
 ];
 return <section className={css.root}>
  {!useSharedHeader?<header className={css.header}>
   <button type="button" className={css.back}
    onClick={()=>section==="home"?onBack():(setSection("home"),setError(""),setNotice(""))}>
    <ArrowLeft size={17}/>{section==="home"?"Mis agentes":"Chat web"}
   </button>
   <span className={css.brand}><Headphones size={15}/> VMV BUSINESS</span>
  </header>:null}
  <div className={css.hero}>
   <div className={css.heroIcon}><Headphones size={27}/></div>
   <div><span className={css.eyebrow}>MI AGENTE · CHAT WEB</span>
    <h1>{section==="home"?"Chat web":
     section==="sites"?"Mis webs":section==="conversations"?"Conversaciones":"Ajustes"}</h1>
    <p>{businessName} · {agent.name}</p>
   </div>
  </div>
  {section==="home"?<>
   <div className={css.overview}>
    <span><ShieldCheck size={17}/> {linkedCount} {linkedCount===1?"web vinculada":"webs vinculadas"}</span>
    <span className={css.paused}>{activeCount?activeCount+" IA activo"+(activeCount===1?"":"s"):"Chat IA sin activar"}</span>
   </div>
   <div className={css.grid}>{groups.map(g=><button key={g.id} type="button"
    className={css.tile+" "+css[g.color]} onClick={()=>g.id==="test"?onTest():setSection(g.id)}>
    <span className={css.tileIcon}><g.Icon size={25}/></span>
    <span><strong>{g.title}</strong><small>{g.detail}</small></span>
    <ChevronRight className={css.arrow} size={17}/>
   </button>)}</div>
   <div className={css.tip}><Sparkles size={17}/><span>
    Prueba el agente, guarda sus ajustes y activa el chat IA por web.
   </span></div>
  </>:null}
  {section==="sites"?<>
   <div className={css.miniHeader}><strong>Mis sitios publicados</strong>
    <button type="button" disabled={loading||saving} onClick={()=>void load()} aria-label="Actualizar webs"><RefreshCw size={16}/></button>
   </div>
   {!loading&&sites.length===0?<div className={css.empty}><Globe2 size={28}/><strong>Sin webs de este negocio</strong>
    <span>Crea o publica una desde Web Services.</span>
   </div>:<div className={css.list}>{sites.map(site=>{
    const record=links.find(link=>link.site_slug===site.slug&&link.site_kind===site.kind);
    const associated=record?.agent_id===agent.id;
    const live=associated&&record?.public_chat_enabled===true;
    return <div className={css.site} key={site.kind+"-"+site.slug}>
     <div className={css.siteIcon}><Globe2 size={20}/></div>
     <div className={css.siteInfo}><strong>{site.business}</strong><small>{site.kind==="builder"?"Web Studio":"Sitio clásico"} · /{site.slug}</small>
      <span className={associated?css.ready:css.muted}>
       {live?"Chat IA activo":associated?"Preparada · IA pausada":record?"Otro agente":"Sin vincular"}
      </span>
     </div>
     <div className={css.siteActions}>
      <a href={(site.kind==="builder"?"/web/":"/sites/")+encodeURIComponent(site.slug)} target="_blank" rel="noopener noreferrer" aria-label="Ver sitio"><ArrowUpRight size={17}/></a>
      {associated?<><button type="button" disabled={saving} className={live?css.disconnect:css.activate}
        onClick={()=>void togglePublicChat(site,!live)}>{live?"Pausar":"Activar IA"}</button>
       <button type="button" disabled={saving} onClick={()=>void changeSite(site.slug,true)}
        className={css.disconnect} aria-label="Desvincular web"><Unplug size={15}/></button></>:
       !record?<button type="button" disabled={saving} onClick={()=>void changeSite(site.slug,false)}>Vincular</button>:null}
     </div>
    </div>;
   })}</div>}
   <div className={css.tip}><ShieldCheck size={17}/><span>
    Activa la IA solo cuando el agente esté listo. Puedes pausarla en cualquier momento.
   </span></div>
  </>:null}
  {section==="conversations"?<>
   <div className={css.tabs} role="group" aria-label="Tipo de conversación">
    <button type="button" aria-pressed={conversationTab==="ai"} className={conversationTab==="ai"?css.activeTab:""}
     onClick={()=>{setConversationTab("ai");setChosen(null);}}>Chat IA · {visitorChats.length}</button>
    <button type="button" aria-pressed={conversationTab==="website"} className={conversationTab==="website"?css.activeTab:""}
     onClick={()=>{setConversationTab("website");setChosen(null);}}>Solicitudes · {inquiries.length}</button>
    <button type="button" aria-pressed={conversationTab==="tests"} className={conversationTab==="tests"?css.activeTab:""}
     onClick={()=>{setConversationTab("tests");setChosen(null);}}>Pruebas · {conversations.length}</button>
   </div>
   {conversationTab==="ai"?(chosen?<div className={css.thread}>
     {!useSharedHeader?<button type="button" onClick={()=>{setChosen(null);setMessages([]);}}><ArrowLeft size={15}/> Chats recientes</button>:null}
     {messages.map(m=><div key={m.id} className={m.role==="user"?css.userBubble:css.agentBubble}>
      <small>{m.role==="user"?"Visitante":"Agente IA"}</small><p>{m.content}</p></div>)}
     {!messages.length?<span className={css.muted}>Sin mensajes disponibles.</span>:null}
    </div>:visitorChats.length?<div className={css.list}>{visitorChats.map(c=><button
     key={c.id} type="button" className={css.testRow} onClick={()=>void showConversation(c.id)}>
     <span className={css.siteIcon}><Bot size={18}/></span>
     <span><strong>Visitante · {c.site_slug}</strong><small>{when(c.updated_at)} · {c.site_kind==="builder"?"Web Studio":"Sitio clásico"}</small></span><ChevronRight size={17}/>
    </button>)}</div>:<div className={css.empty}><Bot size={28}/><strong>Sin chats IA todavía</strong><span>Las conversaciones reales aparecerán aquí.</span></div>):
    conversationTab==="website"?(inquiries.length?
     <div className={css.list}>{inquiries.slice(0,20).map(item=><div key={item.id} className={css.conversation}>
      <div><strong>{item.visitor_name||"Visitante"}</strong><small>{when(item.created_at)} · /{item.site_slug}</small>
       <p>{item.message}</p></div><span className={css.muted}>{item.status==="new"?"Nueva":"Recibida"}</span>
     </div>)}</div>:
     <div className={css.empty}><Inbox size={28}/><strong>Sin solicitudes web</strong><span>Los formularios aparecerán aquí.</span></div>):
    chosen?<div className={css.thread}>
     {!useSharedHeader?<button type="button" onClick={()=>{setChosen(null);setMessages([]);}}><ArrowLeft size={15}/> Conversaciones</button>:null}
     {messages.map(m=><div key={m.id} className={m.role==="user"?css.userBubble:css.agentBubble}>
      <small>{m.role==="user"?"Tú":"Agente"}</small><p>{m.content}</p></div>)}
    </div>:conversations.length?<div className={css.list}>{conversations.map(c=><button type="button" key={c.id}
     className={css.testRow} onClick={()=>void showConversation(c.id)}>
     <span className={css.siteIcon}><MessageCircle size={17}/></span>
     <span><strong>{c.title}</strong><small>{when(c.created_at)} · Prueba privada</small></span><ChevronRight size={17}/>
    </button>)}</div>:<div className={css.empty}><MessageCircle size={28}/><strong>Sin pruebas</strong><span>Usa «Probar agente» para comenzar.</span></div>}
  </>:null}
  {section==="settings"?<>
   <div className={css.panel}>
    <div className={css.settingRow}><div><strong>Amabilidad</strong><small>{settings.warmth<35?"Directo":settings.warmth<70?"Equilibrado":"Cercano"}</small></div>
     <span>{settings.warmth}%</span></div>
    <input type="range" min={1} max={100} step={1} value={settings.warmth}
     onChange={e=>change("warmth",Number(e.target.value))} aria-label="Amabilidad" className={css.slider}/>
    <div className={css.settingRow}><div><strong>Formalidad</strong><small>{settings.formality<35?"Casual":settings.formality<70?"Equilibrado":"Profesional"}</small></div>
     <span>{settings.formality}%</span></div>
    <input type="range" min={1} max={100} step={1} value={settings.formality}
     onChange={e=>change("formality",Number(e.target.value))} aria-label="Formalidad" className={css.slider}/>
    <label className={css.fieldTitle}>Respuesta</label>
    <div className={css.choices}>
     {([["brief","Breve"],["balanced","Normal"],["detailed","Detallada"]] as const).map(([v,label])=>
      <button key={v} type="button" aria-pressed={settings.reply_style===v}
       onClick={()=>change("reply_style",v)}>{label}</button>)}
    </div>
    <label className={css.fieldTitle}>Idioma</label>
    <div className={css.choices}>
     {([["auto","Automático"],["es","Español"],["en","English"]] as const).map(([v,label])=>
      <button key={v} type="button" aria-pressed={settings.languages===v}
       onClick={()=>change("languages",v)}>{label}</button>)}
    </div>
   </div>
   <div className={css.panel}>
    <div className={css.panelTitle}><ShoppingBag size={19}/><strong>Productos en el chat</strong><span className={css.catalogCount}>{selectedCount} seleccionados</span></div>
    <label className={css.toggle}>
     <span><strong>Ofrecer productos</strong><small>Solo aprobados y disponibles</small></span>
     <input type="checkbox" checked={settings.sales_enabled}
      disabled={!settings.sales_enabled&&(agent.setup.cap_catalog!=="Sí"||!eligible.length)}
      onChange={e=>change("sales_enabled",e.target.checked)}/>
    </label>
    {agent.setup.cap_catalog!=="Sí"?<button className={css.catalogConnect} type="button" disabled={saving}
     onClick={()=>void connectCatalog()}><Package size={16}/> Conectar catálogo</button>:null}
    {settings.sales_enabled?<div className={css.productList}>{eligible.map(item=><label key={item.id}>
     <input type="checkbox" checked={settings.sales_item_ids.includes(item.id)}
      onChange={e=>change("sales_item_ids",e.target.checked?
       [...settings.sales_item_ids,item.id]:settings.sales_item_ids.filter(id=>id!==item.id))}/>
     <span><strong>{item.name}</strong><small>{formatUsd(item.price_cents)} · Disponible</small></span>
    </label>)}</div>:null}
    <p className={css.smallNote}>Puede recomendar productos. No cobra ni confirma pedidos.</p>
   </div>
   <div className={css.panel}>
    <div className={css.panelTitle}><Settings2 size={19}/><strong>Atención al cliente</strong></div>
    <label className={css.toggle}><span><strong>Guardar contactos</strong><small>Nombre y teléfono o correo, con permiso</small></span>
     <input type="checkbox" checked={settings.lead_capture} onChange={e=>change("lead_capture",e.target.checked)}/></label>
    <label className={css.toggle}><span><strong>Transferir a humano</strong><small>Si el cliente lo pide o hay dudas</small></span>
     <input type="checkbox" checked={settings.human_handoff} onChange={e=>change("human_handoff",e.target.checked)}/></label>
   </div>
   <button className={css.save} type="button" disabled={saving||loading}
    onClick={()=>void saveSettings()}>{saving?<LoaderCircle size={17} className={css.spin}/>:<Check size={18}/>}
    Guardar ajustes</button>
   <p className={css.smallNote}>Los ajustes funcionan en las pruebas del agente. El chat público aún no está habilitado.</p>
  </>:null}
  {loading?<div className={css.loading}><LoaderCircle size={18} className={css.spin}/> Cargando…</div>:null}
  {error?<div role="alert" className={css.error}>{error}<button onClick={()=>setError("")} aria-label="Cerrar"><X size={15}/></button></div>:null}
  {notice?<div role="status" className={css.notice}><CheckCircle2 size={17}/>{notice}</div>:null}
 </section>;
}
