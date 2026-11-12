"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {Data} from "@puckeditor/core";
import {Puck} from "@puckeditor/core";
import {ArrowLeft,ExternalLink,Globe,History,Layers,Plus,RefreshCw,Save,ShieldCheck,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {builderConfig,normalizeBuilderDocument,starterBuilderDocument} from "@/lib/web-builder-puck";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import styles from "./WebBuilderWorkspace.module.css";

type Site={id:string;owner_id:string;slug:string;name:string;category_id:string};
type Page={id:string;site_id:string;owner_id:string;slug:string;title:string;description:string;draft:unknown;revision:number;updated_at:string};
type Revision={id:string;page_id:string;version:number;title:string;description:string;document:unknown;created_at:string};
type Domain={id:string;hostname:string;state:string;last_error:string;verification:unknown;last_checked_at:string|null};
type DomainRequest={id:string;hostname:string;intent:"buy"|"connect";status:string;years:number;auto_renew:boolean;created_at:string};
type DomainQuote={domain:string;available:boolean;price:number|null;renewalPrice:number|null;years:number;priceDisplay:string;renewalDisplay:string;premium:boolean};
type View="sites"|"editor"|"history"|"domains";
function slugify(input:string){
 return input.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,49).replace(/-$/g,"");
}
export default function WebBuilderWorkspace(){
 const [userId,setUserId]=useState("");
 const [sites,setSites]=useState<Site[]>([]);
 const [site,setSite]=useState<Site|null>(null);
 const [pages,setPages]=useState<Page[]>([]);
 const [page,setPage]=useState<Page|null>(null);
 const [document,setDocument]=useState<Data>(()=>starterBuilderDocument());
 const [view,setView]=useState<View>("sites");
 const [newSiteName,setNewSiteName]=useState("");
 const [newSiteCategory,setNewSiteCategory]=useState("");
 const [newPageName,setNewPageName]=useState("");
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [revisions,setRevisions]=useState<Revision[]>([]);
 const [domains,setDomains]=useState<Domain[]>([]);
 const [domainRequests,setDomainRequests]=useState<DomainRequest[]>([]);
 const [domainQuote,setDomainQuote]=useState<DomainQuote|null>(null);
 const [domainInput,setDomainInput]=useState("");
 const [quote,setQuote]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const [origin,setOrigin]=useState("");
 const dirty=page&&(JSON.stringify(normalizeBuilderDocument(document))!==JSON.stringify(normalizeBuilderDocument(page.draft))||
  title!==page.title||description!==page.description);
 const siteUrl=site?origin+"/web/"+site.slug:null;
 const pageUrl=site&&page?siteUrl+(page.slug==="home"?"":"/"+page.slug):null;
 const client=useMemo(()=>getSupabase(),[]);
 const authorized=useCallback(async()=>{
  if(!client)throw new Error("Supabase no está disponible");
  const {data,error}=await client.auth.getUser();
  if(error||!data.user||data.user.id!==userId||data.user.is_anonymous)
   throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return client;
 },[client,userId]);
 useEffect(()=>{
  let active=true;
  setOrigin(window.location.origin);
  void(async()=>{
   try{
    if(!client)throw new Error("Supabase no está configurado");
    const {data,error:authError}=await client.auth.getUser();
    if(authError||!data.user||data.user.is_anonymous)throw new Error("Inicia sesión en VMV Business para continuar");
    const {data:rows,error}=await client.from("smartjob_builder_sites")
     .select("id,owner_id,slug,name,category_id").eq("owner_id",data.user.id).order("created_at",{ascending:false});
    if(error)throw new Error("No se pudieron cargar tus sitios");
    if(active){setUserId(data.user.id);setSites((rows||[]) as Site[]);}
    const pref=await client.from("smartjob_business_category_preferences")
     .select("category_id").eq("owner_id",data.user.id).maybeSingle();
    if(active&&pref.data?.category_id)setNewSiteCategory(pref.data.category_id);
   }catch(e){if(active)setError(e instanceof Error?e.message:"No disponible");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false};
 },[client]);
 useEffect(()=>{
  if(!dirty)return;
  const callback=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
  window.addEventListener("beforeunload",callback);
  return()=>window.removeEventListener("beforeunload",callback);
 },[dirty]);
 const loadPages=useCallback(async(currentSite:Site)=>{
  const c=await authorized();
  const {data,error}=await c.from("smartjob_builder_pages")
   .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at")
   .eq("site_id",currentSite.id).eq("owner_id",userId).order("created_at");
  if(error)throw new Error("No se pudieron cargar las páginas");
  return (data||[]) as Page[];
 },[authorized,userId]);
 function choosePage(target:Page){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Cambiar de página?"))return;
  setPage(target);setTitle(target.title);setDescription(target.description);
  setDocument(normalizeBuilderDocument(target.draft));setRefreshKey(x=>x+1);
  setView("editor");setError("");setNotice("");
 }
 async function selectSite(chosen:Site){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Salir del editor?"))return;
  setBusy(true);setError("");setNotice("");
  try{
   const list=await loadPages(chosen);
   setSite(chosen);setPages(list);
   if(list.length){const home=list.find(p=>p.slug==="home")||list[0];setPage(home);
    setTitle(home.title);setDescription(home.description);setDocument(normalizeBuilderDocument(home.draft));
    setView("editor");setRefreshKey(x=>x+1);}
   else{setPage(null);setView("sites");}
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir");}
  finally{setBusy(false);}
 }
 async function createSite(){
  if(busy||!userId)return;
  const name=newSiteName.trim().slice(0,100);
  if(name.length<2){setError("Escribe el nombre del negocio");return;}
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const generated=(slugify(name).slice(0,33)||"mi-negocio")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
   const {data:created,error}=await c.from("smartjob_builder_sites").insert({
    owner_id:userId,slug:generated,name,category_id:newSiteCategory
   }).select("id,owner_id,slug,name,category_id").single();
   if(error||!created)throw new Error("No se pudo crear el sitio");
   const siteCreated=created as Site;
   const {data:home,error:homeError}=await c.from("smartjob_builder_pages").insert({
    site_id:siteCreated.id,owner_id:userId,slug:"home",title:"Inicio",
    description:"",draft:starterBuilderDocument(name,newSiteCategory)
   }).select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").single();
   if(homeError||!home)throw new Error("Sitio creado; vuelve a abrirlo para añadir la página");
   setSites(current=>[siteCreated,...current]);
   setSite(siteCreated);setPages([home as Page]);setPage(home as Page);
   setDocument(normalizeBuilderDocument(home.draft));setTitle(home.title);setDescription("");
   setNewSiteName("");setView("editor");setRefreshKey(v=>v+1);
   setNotice("Sitio creado. Personaliza tus bloques y publica cuando esté listo.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear");}
  finally{setBusy(false);}
 }
 async function createPage(){
  if(!site||busy||!userId)return;
  const name=newPageName.trim().slice(0,100);
  const requested=slugify(name);
  if(name.length<2||requested.length<2){setError("Escribe un nombre para la página");return;}
  if(pages.some(p=>p.slug===requested)){setError("Ya existe esa página");return;}
  if(pages.length>=15){setError("Máximo 15 páginas por sitio en esta versión");return;}
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Crear otra página?"))return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const draft=starterBuilderDocument(name,site.category_id);
   const {data,error}=await c.from("smartjob_builder_pages").insert({
    site_id:site.id,owner_id:userId,slug:requested,title:name,description:"",draft
   }).select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").single();
   if(error||!data)throw new Error("No se pudo crear la página");
   const newPage=data as Page;
   setPages(old=>[...old,newPage]);setPage(newPage);setTitle(name);setDescription("");
   setDocument(normalizeBuilderDocument(draft));setRefreshKey(v=>v+1);setNewPageName("");
   setView("editor");setNotice("Nueva página creada");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear");}
  finally{setBusy(false);}
 }
 async function saveDraft(value:Data):Promise<Page>{
  if(!page)throw new Error("Selecciona una página");
  const c=await authorized();
  const clean=normalizeBuilderDocument(value);
  const pageTitle=title.trim().slice(0,100)||page.title;
  const desc=description.trim().slice(0,300);
  const {data,error}=await c.from("smartjob_builder_pages")
   .update({draft:clean,title:pageTitle,description:desc,updated_at:new Date().toISOString(),revision:page.revision+1})
   .eq("id",page.id).eq("owner_id",userId).eq("revision",page.revision)
   .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").maybeSingle();
  if(error||!data)throw new Error("Esta página se modificó en otra pestaña. Recarga para evitar sobrescribir cambios.");
  const updated=data as Page;setPage(updated);
  setPages(current=>current.map(p=>p.id===updated.id?updated:p));
  return updated;
 }
 async function save(){
  if(busy||!page)return;
  setBusy(true);setError("");setNotice("");
  try{await saveDraft(document);setNotice("Borrador guardado");}
  catch(e){setError(e instanceof Error?e.message:"No se pudo guardar");}
  finally{setBusy(false);}
 }
 async function publish(value:Data){
  if(busy||!page)return;
  setBusy(true);setError("");setNotice("");
  try{
   const updated=await saveDraft(value);
   const c=await authorized();
   const {data,error}=await c.rpc("smartjob_builder_publish_page",{p_page_id:updated.id});
   if(error||!data)throw new Error(error?.message||"No se pudo publicar");
   setNotice("Página publicada. Puedes abrirla con el enlace de arriba.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo publicar");}
  finally{setBusy(false);}
 }
 async function openHistory(){
  if(!page)return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const {data,error}=await c.from("smartjob_builder_revisions")
    .select("id,page_id,version,title,description,document,created_at")
    .eq("page_id",page.id).eq("owner_id",userId).order("version",{ascending:false}).limit(25);
   if(error)throw new Error("No se pudo cargar el historial");
   setRevisions((data||[]) as Revision[]);setView("history");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar");}
  finally{setBusy(false);}
 }
 async function restore(revision:Revision){
  if(busy||!page||!window.confirm("¿Recuperar esta versión como borrador? La página pública no cambiará."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const updated=await saveDraft(normalizeBuilderDocument(revision.document));
   setTitle(revision.title);setDescription(revision.description);
   // Restore stored title and SEO description together with the content.
   const c=await authorized();
   const {data,error}=await c.from("smartjob_builder_pages").update({
    title:revision.title,description:revision.description,revision:updated.revision+1,
    updated_at:new Date().toISOString()
   }).eq("id",page.id).eq("owner_id",userId).eq("revision",updated.revision)
    .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").single();
   if(error||!data)throw new Error("Contenido restaurado; revisa el título manualmente");
   setPage(data as Page);setPages(old=>old.map(p=>p.id===data.id?data as Page:p));
   setDocument(normalizeBuilderDocument(revision.document));
   setRefreshKey(x=>x+1);setView("editor");
   setNotice("Versión recuperada como borrador. Publica para hacerla visible.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo recuperar");}
  finally{setBusy(false);}
 }
 async function openDomains(){
  if(!site)return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const [result,requests]=await Promise.all([
    c.from("smartjob_builder_domains")
     .select("id,hostname,state,last_error,verification,last_checked_at")
     .eq("site_id",site.id).eq("owner_id",userId).order("created_at",{ascending:false}),
    c.from("smartjob_builder_domain_requests")
     .select("id,hostname,intent,status,years,auto_renew,created_at")
     .eq("site_id",site.id).eq("owner_id",userId).order("created_at",{ascending:false})
   ]);
   if(result.error||requests.error)throw new Error("No se pudieron consultar los dominios");
   setDomains((result.data||[]) as Domain[]);
   setDomainRequests((requests.data||[]) as DomainRequest[]);
   setView("domains");
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar");}
  finally{setBusy(false);}
 }
 async function checkDomain(){
  const domain=domainInput.toLowerCase().trim();
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(domain)){setError("Escribe un dominio válido, por ejemplo minombre.com");return;}
  setBusy(true);setQuote("");setDomainQuote(null);setError("");
  try{
   const auth=await authorized();
   const {data:sessionData}=await auth.auth.getSession();
   const token=sessionData.session?.access_token;
   if(!token)throw new Error("Inicia sesión nuevamente");
   const res=await fetch("/api/web-services/domain-search?domain="+encodeURIComponent(domain),{
    cache:"no-store",headers:{"Authorization":"Bearer "+token}
   });
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"No se pudo consultar");
   setDomainQuote(data as DomainQuote);
   setQuote(data.available?
    domain+" disponible. Registro: "+data.priceDisplay+" / "+data.years+" año(s). Renovación: "+data.renewalDisplay+". Precio del registrador; impuestos y comisiones pueden aplicar.":
    data.available===false?domain+" no está disponible para registrar.":"Consulta no disponible ahora.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar");}
  finally{setBusy(false);}
 }
 async function submitDomainRequest(intent:"buy"|"connect"){
  if(!site||!userId||busy)return;
  const domain=(domainQuote?.domain||domainInput).trim().toLowerCase();
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(domain)){setError("Dominio inválido");return;}
  if(intent==="buy"&&(!domainQuote?.available||domainQuote.domain!==domain)){
   setError("Primero consulta la disponibilidad y el precio real");return;
  }
  if(domainRequests.some(item=>item.hostname===domain&&item.intent===intent)){
   setNotice("Ya existe una solicitud para este dominio");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data,error}=await db.from("smartjob_builder_domain_requests").insert({
    owner_id:userId,site_id:site.id,hostname:domain,intent,years:domainQuote?.years||1,
    auto_renew:false,status:"requested"
   }).select("id,hostname,intent,status,years,auto_renew,created_at").single();
   if(error||!data)throw new Error("No se pudo guardar la solicitud");
   setDomainRequests(old=>[data as DomainRequest,...old]);
   setNotice(intent==="buy"?
    "Solicitud de compra guardada. No se realizó ningún cobro ni registro. VMV deberá confirmar el precio final y los datos del titular.":
    "Solicitud de conexión guardada. La verificación DNS es necesaria antes de activar el dominio.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar");}
  finally{setBusy(false);}
 }
 async function requestDomainVerification(hostname:string,action:"connect"|"verify"){
  if(!site||!userId||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión nuevamente");
   const res=await fetch("/api/web-services/domain-connect",{
    method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({siteId:site.id,domain:hostname,action})
   });
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||"No se pudo verificar");
   setNotice(result.connected?"El dominio está conectado y activo.":"Faltan datos DNS. Revisa los registros de verificación.");
   await openDomains();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo verificar");}
  finally{setBusy(false);}
 }
 function back(){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Salir?"))return;
  setSite(null);setPage(null);setView("sites");setError("");setNotice("");
 }
 if(loading)return <main className={styles.loading}>Cargando Web Studio…</main>;
 if(!userId)return <main className={styles.loading}><h2>Inicia sesión para crear tu web</h2>
  <p>{error}</p><a href="/vista-app">Ir a VMV Business</a></main>;
 return <div className={styles.workspace}>
  <header className={styles.topbar}>
   <a href="/vista-app" className={styles.brand}>VMV <span>Web Studio</span></a>
   {site?<button type="button" className={styles.back} onClick={back}><ArrowLeft size={16}/> Mis sitios</button>:null}
  </header>
  {error?<div className={styles.error} role="alert">{error}</div>:null}
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {!site?<main className={styles.landing}>
   <div className={styles.welcome}><small>WEB SERVICES 2.0</small><h1>Crea algo increíble<span>.</span></h1>
    <p>Diseña y publica tus páginas con un editor visual.</p></div>
   <form onSubmit={e=>{e.preventDefault();void createSite();}} className={styles.createSite}>
    <label htmlFor="newSite">Nuevo sitio web</label>
    <div><input id="newSite" maxLength={100} placeholder="Nombre de tu negocio" spellCheck={false}
     value={newSiteName} onChange={e=>setNewSiteName(e.target.value)}/>
     <button type="submit" disabled={busy}><Plus size={17}/> Crear sitio</button></div>
    <label htmlFor="newCategory">Categoría del negocio</label>
    <select id="newCategory" value={newSiteCategory} onChange={e=>setNewSiteCategory(e.target.value)}>
     <option value="">General</option>
     {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>
      {BUSINESS_CATEGORIES.filter(item=>item.group===group).map(category=><option key={category.id} value={category.id}>{category.label}</option>)}
     </optgroup>)}
    </select>
   </form>
   <h2>Mis sitios</h2>
   <div className={styles.siteList}>
    {sites.map(s=><button type="button" key={s.id} className={styles.siteCard}
     onClick={()=>void selectSite(s)}><Globe size={23}/><strong>{s.name}</strong><small>{s.slug}</small><span>Abrir ↗</span></button>)}
    {!sites.length?<p>Tu primer sitio comienza aquí.</p>:null}
   </div>
  </main>:<main className={styles.main}>
   <div className={styles.siteHeading}>
    <div><small>SITIO WEB</small><h1>{site.name}</h1></div>
    <a href={siteUrl||"#"} target="_blank" rel="noopener noreferrer" className={styles.sitePreview}><ExternalLink size={16}/> Ver sitio</a>
   </div>
   <div className={styles.sections}>
    <button type="button" className={view==="editor"?styles.selected:""} onClick={()=>{setView("editor");setError("");}}>Editor</button>
    <button type="button" className={view==="history"?styles.selected:""} onClick={()=>void openHistory()}><History size={14}/> Historial</button>
    <button type="button" className={view==="domains"?styles.selected:""} onClick={()=>void openDomains()}><Globe size={14}/> Dominios</button>
   </div>
   {view==="editor"?<section className={styles.editorSection}>
    <div className={styles.pageTabs}>{pages.map(p=><button type="button" key={p.id}
     className={page?.id===p.id?styles.selected:""} onClick={()=>choosePage(p)}>{p.slug==="home"?"Inicio":p.title}</button>)}</div>
    <form className={styles.addPage} onSubmit={e=>{e.preventDefault();void createPage();}}>
     <input maxLength={100} placeholder="Otra página: Servicios, Contacto…" value={newPageName} onChange={e=>setNewPageName(e.target.value)}/>
     <button type="submit" disabled={busy}><Plus size={15}/> Página</button>
    </form>
    {page?<div className={styles.editing}>
     <div className={styles.editingHeader}>
      <div className={styles.meta}>
       <label>Título SEO<input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label>
       <label>Descripción SEO<input value={description} maxLength={300} onChange={e=>setDescription(e.target.value)}/></label>
      </div>
      <div className={styles.actions}>
       <button type="button" disabled={busy} onClick={()=>void save()}><Save size={15}/> Guardar</button>
       <a href={pageUrl||"#"} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Página pública</a>
      </div>
     </div>
     <div className={styles.puckShell}>
      <Puck key={page.id+"-"+refreshKey} config={builderConfig}
       data={normalizeBuilderDocument(page.draft)} height="75vh"
       onChange={data=>setDocument(data)}
       onPublish={data=>void publish(data)} />
     </div>
    </div>:<p>Selecciona o crea una página.</p>}
   </section>:null}
   {view==="history"?<section className={styles.subPanel}>
    <div className={styles.panelTitle}><History size={18}/><h2>Versiones publicadas</h2></div>
    {revisions.length===0?<p>Esta página no tiene publicaciones anteriores.</p>:revisions.map(v=><div className={styles.version} key={v.id}>
     <span><strong>Versión {v.version}</strong><small>{new Date(v.created_at).toLocaleString("es-US")}</small></span>
     <button type="button" disabled={busy} onClick={()=>void restore(v)}><RefreshCw size={14}/> Recuperar</button>
    </div>)}
   </section>:null}
   {view==="domains"?<section className={styles.subPanel}>
    <div className={styles.panelTitle}><Globe size={19}/><h2>Dominios del sitio</h2></div>
    <p>Busca un dominio para tu negocio. La compra requiere confirmar precio, titular y pago antes de registrar.</p>
    <div className={styles.domainForm}><input placeholder="minegocio.com" value={domainInput} onChange={e=>{setDomainInput(e.target.value);setQuote("");}}
     spellCheck={false} autoComplete="off" maxLength={253}/>
     <button type="button" disabled={busy} onClick={()=>void checkDomain()}>Consultar</button></div>
    {quote?<div className={styles.domainQuote}><strong>{quote}</strong>
     {domainQuote?.available?<div className={styles.domainButtons}>
      <button type="button" disabled={busy} onClick={()=>void submitDomainRequest("buy")}>Solicitar compra con VMV</button>
      <button type="button" disabled={busy} onClick={()=>void submitDomainRequest("connect")}>Ya tengo este dominio</button>
     </div>:null}
     </div>:null}
    {domainRequests.length?<div className={styles.domainRequests}><h3>Mis solicitudes</h3>
     {domainRequests.map(r=><div className={styles.domainRow} key={r.id}>
      <span><strong>{r.hostname}</strong> · {r.intent==="buy"?"Compra":"Conexión"}</span>
      <small>{r.status==="requested"?"Recibida":r.status}</small>
      {r.intent==="connect"?<button type="button" disabled={busy} onClick={()=>void requestDomainVerification(r.hostname,"connect")}>Vincular</button>:null}
     </div>)}
    </div>:null}
    {domains.map(d=><article key={d.id} className={styles.domainRow}>
     <strong>{d.hostname}</strong><span>{d.state==="active"?"Conectado":d.state==="verifying"?"Pendiente de DNS":"Pendiente"}</span>
    </article>)}
    {domains.map(d=>d.state==="verifying"?<button key={"verify-"+d.id} type="button"
     className={styles.verifyDomain} disabled={busy}
     onClick={()=>void requestDomainVerification(d.hostname,"verify")}>Comprobar DNS de {d.hostname}</button>:null)}
    <p className={styles.domainNote}><ShieldCheck size={16}/> Las solicitudes de compra no generan cargos. La conexión definitiva requiere autorización y verificación DNS.</p>
   </section>:null}
  </main>}
 </div>;
}
