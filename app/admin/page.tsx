"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,ArrowRight,CheckCircle2,ClipboardList,Clock3,FileCheck2,
  Inbox,LayoutDashboard,LockKeyhole,RefreshCw,Search,Send,Settings2,
  ShieldCheck,Users,Wallet,BriefcaseBusiness,ChevronRight,ExternalLink,
  CircleAlert,FilterX
} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./admin.module.css";

type Status = "received" | "quoted" | "approved" | "in_progress" |
  "needs_customer" | "verified" | "cancelled";
type RequestRow = {
  id:string; owner_id:string; service_code:string; business_name:string;
  category_id:string; website_url:string|null; goal_text:string;
  status:Status; execution_mode:string; quoted_price_cents:number|null;
  quote_note:string|null; quote_revision:number; staff_update:string|null;
  evidence_url:string|null; verified_at:string|null;
  created_at:string; updated_at:string;
};
type Section = "home" | "inbox" | "services";
type MobilePane = "list" | "detail" | "context";
type Phase = "checking" | "signed_out" | "forbidden" | "ready" | "unconfigured";
const statuses:Status[] = [
  "received","quoted","approved","in_progress","needs_customer","verified","cancelled"
];
const statusNames:Record<Status,string> = {
  received:"Nueva",quoted:"Presupuesto enviado",approved:"Aprobada",
  in_progress:"En progreso",needs_customer:"Pendiente del cliente",
  verified:"Completada",cancelled:"Cancelada"
};
const serviceNames:Record<string,string> = {
  directory_listings:"Directorios",google_profile:"Perfil de Google",
  apple_maps:"Apple Maps",bing_places:"Bing Places",yelp_profile:"Yelp",
  search_console:"Search Console",seo_improvement:"Mejora web",
  campaign_setup:"Campaña",review_strategy:"Reputación",other:"Marketing general"
};
const formatDate=(value:string)=>Number.isFinite(Date.parse(value))?
  new Date(value).toLocaleString("es-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—";
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const reference=(id:string)=>"MKT-"+id;
const safeLink=(value:string|null)=>{
  if(!value)return null;
  try{const url=new URL(value);return url.protocol==="https:"&&!!url.hostname&&!url.username&&!url.password?url.toString():null;}
  catch{return null;}
};
const countFor=(rows:RequestRow[],status:Status,complete:boolean)=>
  complete?String(rows.filter(item=>item.status===status).length):"—";

export default function AdminPage(){
  const [phase,setPhase]=useState<Phase>("checking");
  const [role,setRole]=useState<"admin"|"agent">("agent");
  const [section,setSection]=useState<Section>("home");
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [status,setStatus]=useState<"all"|Status>("all");
  const [service,setService]=useState("all");
  const [search,setSearch]=useState("");
  const [order,setOrder]=useState<"activity"|"oldest">("activity");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [pane,setPane]=useState<MobilePane>("list");
  const [price,setPrice]=useState("");
  const [quoteNote,setQuoteNote]=useState("");
  const [note,setNote]=useState("");
  const [evidence,setEvidence]=useState("");
  const [busy,setBusy]=useState(false);

  const reload=useCallback(async()=>{
    const client=getSupabase();
    if(!client)return;
    setLoading(true);
    setError("");
    try{
      const identity=await client.auth.getUser();
      if(identity.error||!identity.data.user||identity.data.user.is_anonymous)throw Error("La sesión expiró.");
      const access=await client.from("vmv_marketing_staff").select("role").eq("user_id",identity.data.user.id).maybeSingle();
      if(access.error||!access.data){
        setRows([]);setTotal(0);setPhase("forbidden");
        throw Error("El acceso administrativo dejó de estar autorizado.");
      }
      const result=await client.from("vmv_marketing_requests")
        .select("id,owner_id,service_code,business_name,category_id,website_url,goal_text,status,execution_mode,quoted_price_cents,quote_note,quote_revision,staff_update,evidence_url,verified_at,created_at,updated_at",{count:"exact"})
        .order("updated_at",{ascending:false}).limit(200);
      if(result.error)throw result.error;
      setRows((result.data||[]) as RequestRow[]);
      setTotal(result.count||0);
    }catch{
      setError("No se pudieron cargar las solicitudes. Comprueba tu acceso o la conexión.");
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    const client=getSupabase();
    if(!client){setPhase("unconfigured");return;}
    let stopped=false;
    let generation=0;
    const verify=async()=>{
      const current=++generation;
      setRows([]);setTotal(0);setSelectedId(null);setPhase("checking");
      const {data,error:identityError}=await client.auth.getUser();
      if(stopped||current!==generation)return;
      if(identityError||!data.user||data.user.is_anonymous){setPhase("signed_out");return;}
      const staff=await client.from("vmv_marketing_staff").select("role").eq("user_id",data.user.id).maybeSingle();
      if(stopped||current!==generation)return;
      if(staff.error||!staff.data||!["agent","admin"].includes(staff.data.role)){
        setPhase("forbidden");return;
      }
      setRole(staff.data.role as "admin"|"agent");
      setPhase("ready");
      void reload();
    };
    const listener=client.auth.onAuthStateChange(()=>{
      queueMicrotask(()=>{if(!stopped)void verify();});
    });
    void verify();
    return()=>{stopped=true;generation++;listener.data.subscription.unsubscribe();};
  },[reload]);

  useEffect(()=>{
    if(phase!=="ready")return;
    const params=new URLSearchParams(window.location.search);
    const nextStatus=params.get("status");
    if(nextStatus&&statuses.includes(nextStatus as Status))setStatus(nextStatus as Status);
    const selected=params.get("case");
    if(selected&&/^[0-9a-f-]{36}$/i.test(selected)){
      setSelectedId(selected);setSection("inbox");setPane("detail");
    }
  },[phase]);

  const active=useMemo(()=>rows.find(item=>item.id===selectedId)||null,[rows,selectedId]);
  useEffect(()=>{
    setPrice(active?.quoted_price_cents==null?"":String(active.quoted_price_cents/100));
    setQuoteNote(active?.quote_note||"");
    setNote(active?.staff_update||"");
    setEvidence(active?.evidence_url||"");
  },[active?.id,active?.updated_at]);

  const services=useMemo(()=>[...new Set(rows.map(item=>item.service_code))].sort(),[rows]);
  const visible=useMemo(()=>rows.filter(item=>{
    if(status!=="all"&&item.status!==status)return false;
    if(service!=="all"&&item.service_code!==service)return false;
    const term=search.trim().toLocaleLowerCase();
    return !term||[item.id,item.business_name,item.goal_text,item.service_code]
      .some(value=>value.toLocaleLowerCase().includes(term));
  }).sort((a,b)=>order==="activity"?
    Date.parse(b.updated_at)-Date.parse(a.updated_at):
    Date.parse(a.created_at)-Date.parse(b.created_at)),[rows,status,service,search,order]);
  const complete=total<=rows.length;

  const query=(caseId:string|null,nextStatus:string=status)=>{
    const url=new URL(window.location.href);
    if(caseId)url.searchParams.set("case",caseId);else url.searchParams.delete("case");
    if(nextStatus!=="all")url.searchParams.set("status",nextStatus);else url.searchParams.delete("status");
    window.history.replaceState(window.history.state,"",url.pathname+url.search);
  };
  const choose=(item:RequestRow)=>{
    setSelectedId(item.id);setSection("inbox");setPane("detail");setNotice("");
    query(item.id);
  };
  const filterStatus=(next:"all"|Status)=>{
    setStatus(next);setSection("inbox");setSelectedId(null);setPane("list");
    query(null,next);
  };
  const changeSection=(next:Section)=>{
    setSection(next);setPane("list");setSelectedId(null);query(null);
  };

  const updateCase=async(patch:Record<string,unknown>,success:string)=>{
    if(!active||busy)return;
    const client=getSupabase();
    if(!client)return;
    setBusy(true);setError("");setNotice("");
    try{
      const {data:identity,error:identityError}=await client.auth.getUser();
      if(identityError||!identity.user||identity.user.is_anonymous)throw Error("La sesión expiró.");
      const staff=await client.from("vmv_marketing_staff").select("role").eq("user_id",identity.user.id).maybeSingle();
      if(staff.error||!staff.data)throw Error("No tienes acceso de operador.");
      const result=await client.from("vmv_marketing_requests").update(patch)
        .eq("id",active.id).eq("updated_at",active.updated_at).select("id").maybeSingle();
      if(result.error)throw Error("No se pudo guardar el cambio. Revisa el estado y las aprobaciones.");
      if(!result.data)throw Error("El caso cambió mientras lo editabas. Actualiza antes de continuar.");
      await reload();
      setNotice(success);
    }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo actualizar el caso.");}
    finally{setBusy(false);}
  };
  const sendQuote=async()=>{
    if(!active||!["received","quoted","needs_customer"].includes(active.status))return;
    const amount=price.trim()===""?NaN:Number(price);
    if(!Number.isFinite(amount)||amount<0||amount>1000000||!Number.isSafeInteger(Math.round(amount*100))){
      setError("Escribe un importe válido en dólares.");return;
    }
    if(quoteNote.length>1500){setError("La nota del presupuesto es demasiado larga.");return;}
    await updateCase({quoted_price_cents:Math.round(amount*100),quote_note:quoteNote.trim()||null,status:"quoted"},
      "Presupuesto registrado. El cliente deberá aceptar la versión actual.");
  };
  const changeStage=async(next:Status)=>{
    if(!active)return;
    if(note.length>1500){setError("El avance supera 1,500 caracteres.");return;}
    if(next==="verified"&&!safeLink(evidence)){setError("Para completar, añade una URL HTTPS válida de evidencia.");return;}
    const patch:Record<string,unknown>={status:next,staff_update:note.trim()||null};
    if(next==="verified"){patch.evidence_url=safeLink(evidence);patch.verified_at=new Date().toISOString();}
    await updateCase(patch,next==="needs_customer"?
      "El caso quedó pendiente del cliente. La nota es visible en Marketing; no se envió una notificación.":
      "Estado del caso actualizado.");
  };
  const cards:{title:string;value:Status;icon:typeof Inbox;hint:string}[]=[
    {title:"Nuevas",value:"received",icon:Inbox,hint:"Por revisar"},
    {title:"Por aprobar",value:"quoted",icon:Wallet,hint:"Presupuesto enviado"},
    {title:"Aprobadas",value:"approved",icon:CheckCircle2,hint:"Listas para ejecutar"},
    {title:"En progreso",value:"in_progress",icon:Clock3,hint:"En manos del equipo"},
    {title:"Esperando cliente",value:"needs_customer",icon:Users,hint:"Falta información"},
    {title:"Completadas",value:"verified",icon:FileCheck2,hint:"Con evidencia"}
  ];

  if(phase!=="ready")return <main className={styles.gate}>
    <div className={styles.gateBox}>
      <span className={styles.gateIcon}><LockKeyhole size={25}/></span>
      <p className={styles.eyebrow}>VMV BUSINESS / ADMIN WEB</p>
      <h1>{phase==="checking"?"Comprobando acceso":phase==="forbidden"?"Acceso restringido":
        phase==="unconfigured"?"Servicio no configurado":"Inicia sesión"}</h1>
      <p>{phase==="forbidden"?"Tu cuenta no tiene un permiso interno de operador. Un administrador debe autorizarlo en la base de datos.":
        phase==="signed_out"?"Usa la cuenta existente de VMV Business para entrar. El acceso administrativo requiere autorización adicional.":
        phase==="unconfigured"?"La conexión a Supabase no está disponible.":"Estamos verificando tu identidad y permisos."}</p>
      {phase==="signed_out"?<a className={styles.primary} href="/vista-app">Ir al acceso de VMV <ArrowRight size={16}/></a>:null}
      {phase==="forbidden"?<a className={styles.secondary} href="/vista-app">Volver a VMV Business</a>:null}
    </div>
  </main>;

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/vista-app"><span>V</span><div><b>VMV Business</b><small>OPERACIONES</small></div></a>
      <p className={styles.navGroup}>ESPACIO DE TRABAJO</p>
      <nav aria-label="Navegación administrativa">
        <button className={section==="home"?styles.navActive:styles.navItem} type="button" onClick={()=>changeSection("home")}><LayoutDashboard size={18}/>Inicio</button>
        <button className={section==="inbox"?styles.navActive:styles.navItem} type="button" onClick={()=>changeSection("inbox")}><Inbox size={18}/>Bandeja</button>
        <button className={section==="services"?styles.navActive:styles.navItem} type="button" onClick={()=>changeSection("services")}><BriefcaseBusiness size={18}/>Servicios</button>
      </nav>
      <div className={styles.sideFoot}><ShieldCheck size={18}/><div><strong>{role==="admin"?"Administrador":"Operador"}</strong><span>Acceso verificado</span></div></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div><span className={styles.eyebrow}>PANEL OPERATIVO</span><h1>{section==="home"?"Centro de operaciones":section==="inbox"?"Bandeja de trabajo":"Servicios activos"}</h1>
          <p>{section==="home"?"Lo que necesita atención hoy":section==="inbox"?"Solicitudes de servicio de Marketing":"Trabajos solicitados por categoría"}</p>
        </div>
        <button className={styles.refresh} type="button" onClick={()=>void reload()} disabled={loading||busy}><RefreshCw size={17}/> {loading?"Actualizando":"Actualizar"}</button>
      </header>
      {error?<p className={styles.alert} role="alert"><CircleAlert size={17}/>{error}</p>:null}
      {notice?<p className={styles.success} role="status"><CheckCircle2 size={17}/>{notice}</p>:null}

      {section==="home"?<>
        <div className={styles.statGrid}>
          {cards.map(card=><button key={card.value} type="button" className={styles.stat} onClick={()=>filterStatus(card.value)}>
            <span className={styles.statIcon}><card.icon size={20}/></span><span>{card.title}</span>
            <strong>{countFor(rows,card.value,complete)}</strong><small>{complete?card.hint:"Abre la bandeja para revisar"}</small>
            <ChevronRight className={styles.statArrow} size={17}/>
          </button>)}
        </div>
        <div className={styles.homeBottom}>
          <div><span className={styles.eyebrow}>VISTA OPERATIVA</span><h2>Solicitudes reales, sin duplicados.</h2>
            <p>Esta primera etapa usa directamente las solicitudes que los clientes crean en Marketing. Los cambios se reflejan en su módulo.</p>
          </div>
          <button className={styles.primary} type="button" onClick={()=>changeSection("inbox")}>Abrir bandeja <ArrowRight size={17}/></button>
        </div>
      </>:null}

      {section==="services"?<div className={styles.serviceGrid}>
        {services.length?services.map(code=><button key={code} className={styles.serviceCard} type="button" onClick={()=>{setService(code);setStatus("all");changeSection("inbox");}}>
          <BriefcaseBusiness size={21}/><strong>{serviceNames[code]||code.replaceAll("_"," ")}</strong>
          <small>{rows.filter(item=>item.service_code===code).length} en la muestra reciente</small>
          <ArrowRight size={17}/>
        </button>):<div className={styles.empty}>Todavía no hay solicitudes disponibles.</div>}
      </div>:null}

      {section==="inbox"?<>
        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={18}/><input aria-label="Buscar solicitudes" placeholder="Buscar negocio, referencia o necesidad" value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <select aria-label="Estado" value={status} onChange={e=>filterStatus(e.target.value as "all"|Status)}>
            <option value="all">Todos los estados</option>{statuses.map(value=><option value={value} key={value}>{statusNames[value]}</option>)}
          </select>
          <select aria-label="Servicio" value={service} onChange={e=>setService(e.target.value)}>
            <option value="all">Todos los servicios</option>{services.map(code=><option value={code} key={code}>{serviceNames[code]||code}</option>)}
          </select>
          <select aria-label="Orden" value={order} onChange={e=>setOrder(e.target.value as "activity"|"oldest")}>
            <option value="activity">Actividad reciente</option><option value="oldest">Más antiguas</option>
          </select>
          {(search||status!=="all"||service!=="all")?<button className={styles.clear} type="button" onClick={()=>{setSearch("");setService("all");filterStatus("all");}}><FilterX size={16}/>Limpiar</button>:null}
        </div>
        {total>rows.length?<p className={styles.limit}>Mostrando las {rows.length} solicitudes más recientes de {total}. La búsqueda se aplica a estas solicitudes.</p>:null}
        <div className={styles.inboxGrid} data-pane={pane}>
          <section className={styles.listPane} aria-label="Lista de solicitudes">
            <div className={styles.paneHeading}><strong>Solicitudes</strong><span>{visible.length}</span></div>
            <div className={styles.requestList}>{visible.length?visible.map(item=><button type="button" key={item.id}
              className={selectedId===item.id?styles.requestActive:styles.request}
              onClick={()=>choose(item)} aria-pressed={selectedId===item.id}>
              <span className={styles.requestTop}><strong>{item.business_name}</strong><time>{formatDate(item.updated_at)}</time></span>
              <span className={styles.requestService}>{serviceNames[item.service_code]||item.service_code}</span>
              <span className={styles.requestGoal}>{item.goal_text}</span>
              <span className={styles.requestBottom}><span className={styles.stage} data-stage={item.status}>{statusNames[item.status]}</span><small>#{item.id.slice(0,8).toUpperCase()}</small></span>
            </button>):<div className={styles.empty}>{loading?"Cargando solicitudes…":"Sin casos para estos filtros."}</div>}</div>
          </section>
          <section className={styles.detailPane} aria-label="Detalle de solicitud">
            {active?<><div className={styles.paneHeading}>
              <button className={styles.mobileBack} type="button" onClick={()=>setPane("list")}><ArrowLeft size={17}/>Volver</button>
              <strong>Detalle del trabajo</strong><button type="button" className={styles.mobileInfo} onClick={()=>setPane("context")}>Información <ChevronRight size={16}/></button>
            </div>
            <div className={styles.detailBody}>
              <span className={styles.eyebrow}>SOLICITUD DE SERVICIO · MARKETING</span>
              <h2>{serviceNames[active.service_code]||active.service_code}</h2>
              <div className={styles.detailMeta}><span className={styles.stage} data-stage={active.status}>{statusNames[active.status]}</span><span>{formatDate(active.created_at)}</span></div>
              <div className={styles.detailCard}><h3>Lo que necesita el cliente</h3><p>{active.goal_text}</p></div>
              {active.staff_update?<div className={styles.detailCard}><h3>Última actualización del equipo</h3><p>{active.staff_update}</p></div>:null}
              {active.quoted_price_cents!==null?<div className={styles.detailCard}><h3>Presupuesto · revisión {active.quote_revision}</h3>
                <strong className={styles.price}>{money(active.quoted_price_cents)}</strong>{active.quote_note?<p>{active.quote_note}</p>:null}
                {active.status==="quoted"?<small>Pendiente de aprobación por el cliente desde Marketing.</small>:null}
              </div>:null}
              {safeLink(active.evidence_url)?<div className={styles.detailCard}><h3>Entrega verificada</h3>
                <a href={safeLink(active.evidence_url)||"#"} target="_blank" rel="noopener noreferrer">Consultar evidencia <ExternalLink size={15}/></a>
              </div>:null}
              <div className={styles.editor}>
                <h3>Acciones del equipo</h3>
                {["received","quoted","needs_customer"].includes(active.status)?<div className={styles.editorBlock}>
                  <strong>Preparar presupuesto</strong><div className={styles.quoteFields}>
                    <label>Importe (USD)<input type="number" value={price} min="0" max="1000000" step="0.01" onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></label>
                    <label>Condiciones<textarea value={quoteNote} maxLength={1500} rows={2} onChange={e=>setQuoteNote(e.target.value)} placeholder="Alcance, entregables y plazo…"/></label>
                  </div><button className={styles.primary} type="button" disabled={busy} onClick={()=>void sendQuote()}><Wallet size={16}/> {busy?"Guardando…":"Guardar presupuesto"}</button>
                </div>:null}
                {["received","quoted","approved","in_progress","needs_customer"].includes(active.status)?<div className={styles.editorBlock}>
                  <label>Nota de trabajo<textarea rows={3} maxLength={1500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Información faltante o avance del caso…"/></label>
                  <div className={styles.actionRow}>
                    <button className={styles.secondary} type="button" disabled={busy||!note.trim()} onClick={()=>void updateCase({staff_update:note.trim()},"Último avance guardado en el caso.")}>Guardar nota</button>
                    {active.status!=="needs_customer"?<button className={styles.secondary} type="button" disabled={busy||!note.trim()} onClick={()=>void changeStage("needs_customer")}><Send size={15}/>Marcar pendiente del cliente</button>:null}
                    {active.status==="approved"||(active.status==="needs_customer"&&active.quoted_price_cents!==null)?<button className={styles.primary} type="button" disabled={busy} onClick={()=>void changeStage("in_progress")}>{active.status==="approved"?"Iniciar trabajo":"Retomar si está aprobado"} <ArrowRight size={16}/></button>:null}
                  </div>
                  <small>La nota reemplaza la actualización anterior; el historial de mensajes es una fase posterior.</small>
                </div>:null}
                {active.status==="in_progress"?<div className={styles.editorBlock}>
                  <label>URL HTTPS de evidencia<input type="url" value={evidence} maxLength={750} onChange={e=>setEvidence(e.target.value)} placeholder="https://…"/></label>
                  <button type="button" className={styles.primary} disabled={busy||!safeLink(evidence)} onClick={()=>void changeStage("verified")}><FileCheck2 size={16}/>Marcar completado con evidencia</button>
                </div>:null}
                {active.status==="verified"?<p className={styles.finished}><CheckCircle2 size={17}/>Caso completado. La entrega queda visible en Marketing.</p>:null}
                {active.status==="cancelled"?<p className={styles.finished}>Este caso está cancelado.</p>:null}
                {active.status==="quoted"?<p className={styles.tip}><LockKeyhole size={15}/>No puede iniciarse hasta que el cliente acepte el presupuesto.</p>:null}
                {active.status==="needs_customer"&&active.quoted_price_cents!==null?<p className={styles.tip}><LockKeyhole size={15}/>Retomar requiere la aceptación del presupuesto actual; el servidor verifica la aprobación.</p>:null}
              </div>
            </div></>:<div className={styles.detailEmpty}><ClipboardList size={30}/><strong>Selecciona una solicitud</strong><p>Consulta la necesidad, prepara un presupuesto y registra avances.</p></div>}
          </section>
          <aside className={styles.contextPane} aria-label="Información de la solicitud">
            {active?<><div className={styles.paneHeading}>
              <button className={styles.mobileBack} type="button" onClick={()=>setPane("detail")}><ArrowLeft size={17}/>Detalle</button>
              <strong>Información</strong>
            </div><div className={styles.contextBody}>
              <span className={styles.avatar}>{active.business_name.slice(0,1).toUpperCase()}</span>
              <h3>{active.business_name}</h3><span className={styles.contextSub}>Cuenta propietaria de la solicitud</span>
              <dl><dt>Servicio</dt><dd>{serviceNames[active.service_code]||active.service_code}</dd>
                <dt>Referencia única</dt><dd className={styles.reference}>{reference(active.id)}</dd>
                <dt>Creada</dt><dd>{formatDate(active.created_at)}</dd>
                <dt>Actualizada</dt><dd>{formatDate(active.updated_at)}</dd>
                <dt>Modalidad</dt><dd>{active.execution_mode==="assisted"?"Asistida":"Automatizada"}</dd>
              </dl>
              {safeLink(active.website_url)?<a className={styles.external} href={safeLink(active.website_url)||"#"} target="_blank" rel="noopener noreferrer">Sitio web del negocio <ExternalLink size={15}/></a>:null}
              <div className={styles.contextNote}><ShieldCheck size={16}/>Solo se muestran los datos de la solicitud autorizada, no los pedidos ni contactos del negocio.</div>
            </div></>:<div className={styles.contextBlank}><Settings2 size={24}/>Selecciona un caso para consultar su contexto.</div>}
          </aside>
        </div>
      </>:null}
    </section>
  </main>;
}
