"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,Check,ClipboardCopy,FileText,Plus,RefreshCw,ShieldCheck,Trash2,Wallet,Send,PackageCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./smart-quote.module.css";

type Business={id:string;name:string;owner_id:string};
type Catalog={id:string;owner_id:string;business_id:string;name:string;description:string;unit_name:string;unit_price_cents:number;active:boolean};
type Line={catalog_item_id:string;name:string;description:string;unit_name:string;quantity:number;unit_price_cents:number;line_total_cents:number};
type Quote={id:string;business_id:string;customer_name:string;customer_email:string;customer_phone:string;lines:Line[];
 subtotal_cents:number;discount_cents:number;delivery_cents:number;tax_bps:number;tax_cents:number;
 deposit_bps:number;deposit_cents:number;total_cents:number;valid_until:string;notes:string;
 status:"draft"|"approved"|"sent"|"cancelled";revision:number;created_at:string};
type ItemInput={catalog_item_id:string;quantity:string;key:number};
type QuoteDraft={id:string|null;customer_name:string;customer_email:string;customer_phone:string;
 items:ItemInput[];tax:string;delivery:string;discount:string;deposit:string;valid_until:string;notes:string};
const plusDays=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const blank=():QuoteDraft=>({id:null,customer_name:"",customer_email:"",customer_phone:"",
 items:[],tax:"0",delivery:"0",discount:"0",deposit:"0",valid_until:plusDays(7),notes:""});
const cents=(raw:string)=>{const v=raw.trim();if(!/^\d{1,8}(\.\d{1,2})?$/.test(v))throw Error("Introduce un importe válido (máximo 2 decimales).");
 const [a,b=""]=v.split(".");return Number(a)*100+Number(b.padEnd(2,"0"));};
const rate=(raw:string)=>{if(!/^\d{1,3}(\.\d{1,2})?$/.test(raw)||Number(raw)>100)throw Error("El porcentaje debe estar entre 0 y 100.");
 return Math.round(Number(raw)*100);};
const money=(value:number,language:string)=>new Intl.NumberFormat(language==="en"?"en-US":"es-US",{style:"currency",currency:"USD"}).format(value/100);
const fmt=(value:number)=>String((value/100).toFixed(2));
const uuid=/^[0-9a-f-]{36}$/i;
export default function SmartQuotePage(){
 const {language}=useInterfaceLanguage();
 const t=(es:string,en:string)=>language==="en"?en:es;
 const [owner,setOwner]=useState("");
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [catalog,setCatalog]=useState<Catalog[]>([]);
 const [quotes,setQuotes]=useState<Quote[]>([]);
 const [tab,setTab]=useState<"quotes"|"catalog">("quotes");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [missingSchema,setMissingSchema]=useState(false);
 const [productId,setProductId]=useState("");
 const [product,setProduct]=useState({name:"",description:"",unit_name:"unidad",price:"",active:true});
 const [quoteForm,setQuoteForm]=useState<QuoteDraft|null>(null);
 const [counter,setCounter]=useState(0);
 const selected=businesses.find(b=>b.id===businessId);
 const activeCatalog=catalog.filter(c=>c.active);
 const load=useCallback(async(id:string)=>{
  const db=getSupabase();if(!db||!id||!uuid.test(id))return;
  const [products,proposals]=await Promise.all([
   db.from("vmv_smart_quote_catalog").select("id,owner_id,business_id,name,description,unit_name,unit_price_cents,active").eq("business_id",id).order("created_at",{ascending:false}).limit(100),
   db.from("vmv_smart_quotes").select("id,business_id,customer_name,customer_email,customer_phone,lines,subtotal_cents,discount_cents,delivery_cents,tax_bps,tax_cents,deposit_bps,deposit_cents,total_cents,valid_until,notes,status,revision,created_at").eq("business_id",id).order("created_at",{ascending:false}).limit(100)
  ]);
  if(products.error||proposals.error){
   const error=products.error||proposals.error;
   setMissingSchema(error?.code==="42P01"||error?.code==="PGRST205"||error?.code==="PGRST204");
   throw Error(t("No se pudo cargar Smart Quote. Comprueba la migración SQL y tus permisos.","Smart Quote could not load. Check the SQL migration and permissions."));
  }
  setMissingSchema(false);setCatalog((products.data||[]) as Catalog[]);setQuotes((proposals.data||[]) as Quote[]);
 },[language]);
 useEffect(()=>{let live=true;(async()=>{
  try{
   const db=getSupabase();if(!db)throw Error("Configuración de Supabase no disponible.");
   const {data,error}=await db.auth.getUser();
   if(error||!data.user||data.user.is_anonymous)throw Error("Inicia sesión para continuar.");
   const {data:list,error:businessError}=await db.from("vmv_marketing_businesses").select("id,name,owner_id").eq("owner_id",data.user.id).order("created_at",{ascending:false}).limit(100);
   if(businessError)throw Error("No fue posible consultar tus negocios.");
   if(!live)return;
   setOwner(data.user.id);setBusinesses((list||[]) as Business[]);
   const first=(list||[])[0]?.id;
   if(first)setBusinessId(first);
  }catch(e){if(live)setMessage(e instanceof Error?e.message:"No se pudo abrir Smart Quote.");}
  finally{if(live)setLoading(false);}
 })();return()=>{live=false;};},[]);
 useEffect(()=>{if(!businessId)return;let live=true;setLoading(true);setMessage("");
  void load(businessId).catch(e=>{if(live)setMessage(e instanceof Error?e.message:"Error al cargar.");})
  .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[businessId,load]);
 const total=useMemo(()=>{
  if(!quoteForm)return null;
  try{
   const lines=quoteForm.items.map(x=>{
    const p=catalog.find(c=>c.id===x.catalog_item_id&&c.active);
    if(!p||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<1||Number(x.quantity)>9999)throw Error("Selecciona un servicio y una cantidad válida.");
    return {item:p,quantity:Number(x.quantity)};
   });
   if(!lines.length)throw Error("Añade al menos un servicio.");
   const subtotal=lines.reduce((a,x)=>a+x.item.unit_price_cents*x.quantity,0);
   const discount=cents(quoteForm.discount),delivery=cents(quoteForm.delivery);
   if(discount>subtotal)throw Error("El descuento supera el subtotal.");
   const taxBps=rate(quoteForm.tax),depositBps=rate(quoteForm.deposit);
   const tax=Math.round((subtotal-discount)*taxBps/10000);
   const due=subtotal-discount+delivery+tax;
   if(due>2000000000)throw Error("La cotización supera el límite permitido.");
   return {subtotal,discount,delivery,tax,due,deposit:Math.round(due*depositBps/10000),taxBps,depositBps};
  }catch{return null;}
 },[quoteForm,catalog]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await fn();}catch(e){setMessage(e instanceof Error?e.message:"No se pudo guardar. Intenta de nuevo.");}finally{setBusy(false);}};
 const saveCatalog=()=>void run(async()=>{
  const db=getSupabase();if(!db||!owner||!businessId)throw Error("Inicia sesión.");
  if(product.name.trim().length<2||product.name.length>120)throw Error("Escribe un nombre de 2 a 120 caracteres.");
  if(!product.unit_name.trim()||product.unit_name.length>35)throw Error("Indica la unidad de venta.");
  const price=cents(product.price);if(price>100000000)throw Error("Precio demasiado alto.");
  const payload={name:product.name.trim(),description:product.description.trim(),unit_name:product.unit_name.trim(),
   unit_price_cents:price,active:product.active,updated_at:new Date().toISOString()};
  const result=productId?await db.from("vmv_smart_quote_catalog").update(payload).eq("id",productId).eq("business_id",businessId).eq("owner_id",owner).select("id").single():
   await db.from("vmv_smart_quote_catalog").insert({owner_id:owner,business_id:businessId,...payload}).select("id").single();
  if(result.error||!result.data)throw Error(result.error?.message||"No se pudo guardar el catálogo.");
  setProductId("");setProduct({name:"",description:"",unit_name:"unidad",price:"",active:true});
  await load(businessId);setMessage(t("Servicio guardado.","Catalog item saved."));
 });
 const beginQuote=()=>{if(!activeCatalog.length){setTab("catalog");setMessage(t("Primero agrega un servicio con precio aprobado.","First add a service with an approved price."));return;}
  const draft=blank();draft.items=[{catalog_item_id:activeCatalog[0].id,quantity:"1",key:Date.now()}];setQuoteForm(draft);setTab("quotes");setMessage("");
 };
 const editQuote=(q:Quote)=>{if(q.status!=="draft")return;
  setQuoteForm({id:q.id,customer_name:q.customer_name,customer_email:q.customer_email,customer_phone:q.customer_phone,
   items:q.lines.map((l,i)=>({catalog_item_id:l.catalog_item_id,quantity:String(l.quantity),key:i+1})),
   tax:String(q.tax_bps/100),delivery:fmt(q.delivery_cents),discount:fmt(q.discount_cents),
   deposit:String(q.deposit_bps/100),valid_until:q.valid_until,notes:q.notes});setTab("quotes");setMessage("");
 };
 const saveQuote=()=>void run(async()=>{
  const db=getSupabase();if(!db||!quoteForm||!businessId||!owner)throw Error("Tu sesión no está disponible.");
  if(quoteForm.customer_name.trim().length<2)throw Error("Falta el nombre del cliente.");
  if(quoteForm.customer_email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteForm.customer_email))throw Error("Correo electrónico inválido.");
  if(!total)throw Error("Revisa los servicios, cantidades y cargos de la cotización.");
  if(quoteForm.valid_until<plusDays(0)||quoteForm.valid_until>plusDays(365))throw Error("La fecha de vencimiento debe estar dentro de los próximos 365 días.");
  const {data,error}=await db.rpc("vmv_smart_quote_save",{
   p_business_id:businessId,p_quote_id:quoteForm.id,p_customer_name:quoteForm.customer_name.trim(),
   p_customer_email:quoteForm.customer_email.trim(),p_customer_phone:quoteForm.customer_phone.trim(),
   p_items:quoteForm.items.map(x=>({catalog_item_id:x.catalog_item_id,quantity:Number(x.quantity)})),
   p_tax_bps:total.taxBps,p_delivery_cents:total.delivery,p_discount_cents:total.discount,
   p_deposit_bps:total.depositBps,p_valid_until:quoteForm.valid_until,p_notes:quoteForm.notes.trim()
  });
  if(error||!data)throw Error(error?.message||"No se pudo guardar el borrador.");
  setQuoteForm(null);await load(businessId);setMessage(t("Borrador guardado. Revísalo antes de aprobar.","Draft saved. Review it before approval."));
 });
 const statusChange=(q:Quote,action:"approve"|"mark_sent"|"cancel")=>void run(async()=>{
  if(action==="approve"&&!window.confirm(t("¿Aprobar la cotización? El importe quedará bloqueado.","Approve this quote? Its amount will be locked.")))return;
  if(action==="mark_sent"&&!window.confirm(t("¿Confirmas que tú ya enviaste la cotización al cliente? Copiarla no equivale a enviarla.","Do you confirm that you personally sent this quote? Copying does not mean sending.")))return;
  if(action==="cancel"&&!window.confirm(t("¿Cancelar esta cotización?","Cancel this quote?")))return;
  const db=getSupabase();if(!db)throw Error("No hay sesión.");
  const {data,error}=await db.rpc("vmv_smart_quote_set_status",{p_quote_id:q.id,p_action:action});
  if(error||data!==true)throw Error(error?.message||"No se pudo cambiar el estado.");
  await load(businessId);setMessage(t("Estado actualizado.","Status updated."));
 });
 const copyQuote=(q:Quote)=>void run(async()=>{
  if(q.status!=="approved"&&q.status!=="sent")throw Error("Solo puedes compartir cotizaciones aprobadas.");
  if(q.valid_until<plusDays(0))throw Error("Esta cotización venció. Crea una nueva propuesta.");
  const text=[
   selected?.name||"VMV Business",t("COTIZACIÓN APROBADA","APPROVED QUOTE")+" #"+q.id.slice(0,8).toUpperCase(),
   t("Cliente: ","Customer: ")+q.customer_name,
   t("Válida hasta: ","Valid through: ")+q.valid_until,"",
   ...q.lines.map(l=>l.name+" · "+l.quantity+" × "+money(l.unit_price_cents,language)+" = "+money(l.line_total_cents,language)),
   "",t("Subtotal: ","Subtotal: ")+money(q.subtotal_cents,language),
   t("Descuento: ","Discount: ")+money(q.discount_cents,language),
   t("Entrega/cargos: ","Delivery/charges: ")+money(q.delivery_cents,language),
   t("Impuestos configurados por el vendedor: ","Seller-configured tax: ")+money(q.tax_cents,language),
   t("TOTAL: ","TOTAL: ")+money(q.total_cents,language),
   q.deposit_bps?t("Depósito propuesto: ","Proposed deposit: ")+money(q.deposit_cents,language):"",
   q.notes?"\n"+t("Condiciones: ","Terms: ")+q.notes:"",
   "",t("Esta cotización no es un recibo ni confirma un pago. El negocio coordina el cobro por separado.",
    "This quote is not a receipt or proof of payment. The business arranges payment separately.")
  ].filter(Boolean).join("\n");
  await navigator.clipboard.writeText(text);
  setMessage(t("Cotización copiada. Envíala por el canal que prefieras y después marca que fue enviada.","Quote copied. Send it through your preferred channel, then mark it as sent."));
 });
 return <main className={styles.page}>
  <div className={styles.shell}>
   <header className={styles.top}><a href="/vista-app" className={styles.back}><ArrowLeft size={17}/>{t("Regresar a VMV","Back to VMV")}</a>
    <span className={styles.pilot}><ShieldCheck size={15}/>{t("Piloto privado","Private pilot")}</span></header>
   <div className={styles.hero}><div className={styles.logo}><FileText size={30}/></div>
    <div><span className={styles.eyebrow}>VMV BUSINESS / SMART QUOTE</span>
     <h1>Smart Quote<span>.</span></h1>
     <p>{t("De una consulta a una cotización profesional, revisada por ti antes de enviarla.",
      "Turn inquiries into professional quotes, reviewed by you before sharing.")}</p></div>
   </div>
   <div className={styles.security}><ShieldCheck size={19}/>
    <span>{t("Los precios provienen de tu catálogo. No hay pagos, mensajes ni descuentos automáticos. Solo tú autorizas cada cotización.",
     "Prices come from your catalog. No automatic payments, messaging or discounts. You authorize every quote.")}</span></div>
   {message?<div role="status" aria-live="polite" className={styles.message}>{message}</div>:null}
   {loading?<div className={styles.loading}><RefreshCw size={22}/>{t("Cargando tus datos…","Loading your data…")}</div>:
   !owner?<div className={styles.blank}><h2>{t("Inicia sesión para empezar","Sign in to start")}</h2><a href="/vista-app">{t("Abrir cuenta VMV","Open VMV account")}</a></div>:
   !businesses.length?<div className={styles.blank}><h2>{t("Primero configura tu negocio","First set up your business")}</h2>
    <p>{t("Smart Quote utiliza los datos reales de la Central de Negocios.","Smart Quote uses your real Central Business data.")}</p>
    <a href="/vista-app/marketing">{t("Configurar mi negocio","Set up my business")}</a></div>:
   <div className={styles.workspace}>
    <section className={styles.toolbar}>
     <label>{t("Negocio","Business")}<select value={businessId} onChange={e=>{setBusinessId(e.target.value);setQuoteForm(null);setProductId("");setMessage("");}}>
      {businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
     <button type="button" onClick={()=>void run(async()=>{await load(businessId);setMessage(t("Información actualizada.","Data refreshed."));})} disabled={busy}><RefreshCw size={17}/>{t("Actualizar","Refresh")}</button>
    </section>
    {missingSchema?<div className={styles.blank}><h2>{t("Preparación de datos pendiente","Database setup pending")}</h2>
     <p>{t("El módulo está desarrollado, pero falta aplicar la migración segura de Smart Quote a Supabase en el entorno autorizado.",
      "This module is built, but its secure SQL migration still needs to be applied to the authorized Supabase environment.")}</p></div>:<>
    <div className={styles.metrics}>
     <div><span>{t("Servicios","Catalog items")}</span><strong>{activeCatalog.length}</strong></div>
     <div><span>{t("Borradores","Drafts")}</span><strong>{quotes.filter(x=>x.status==="draft").length}</strong></div>
     <div><span>{t("Aprobadas","Approved")}</span><strong>{quotes.filter(x=>x.status==="approved"||x.status==="sent").length}</strong></div>
    </div>
    <nav className={styles.tabs}>
     <button type="button" aria-pressed={tab==="quotes"} className={tab==="quotes"?styles.tabActive:""} onClick={()=>setTab("quotes")}><FileText size={17}/>{t("Cotizaciones","Quotes")}</button>
     <button type="button" aria-pressed={tab==="catalog"} className={tab==="catalog"?styles.tabActive:""} onClick={()=>setTab("catalog")}><PackageCheck size={17}/>{t("Catálogo y precios","Catalog & prices")}</button>
    </nav>
    {tab==="catalog"?<div className={styles.twoColumn}>
     <section className={styles.panel}><h2>{productId?t("Editar servicio","Edit service"):t("Agregar servicio","Add a service")}</h2>
      <p>{t("Usa únicamente precios que tu negocio haya establecido.","Only use prices established by your business.")}</p>
      <form onSubmit={e=>{e.preventDefault();saveCatalog();}} className={styles.form}>
       <label>{t("Servicio o producto","Service or product")}<input required minLength={2} maxLength={120} value={product.name} onChange={e=>setProduct(p=>({...p,name:e.target.value}))} placeholder={t("Ej. Pastel personalizado","e.g. Custom cake")}/></label>
       <label>{t("Descripción opcional","Optional description")}<textarea maxLength={500} rows={2} value={product.description} onChange={e=>setProduct(p=>({...p,description:e.target.value}))}/></label>
       <div className={styles.formGrid}><label>{t("Precio unitario (USD)","Unit price (USD)")}<input required inputMode="decimal" value={product.price} onChange={e=>setProduct(p=>({...p,price:e.target.value}))} placeholder="0.00"/></label>
        <label>{t("Unidad","Unit")}<input required maxLength={35} value={product.unit_name} onChange={e=>setProduct(p=>({...p,unit_name:e.target.value}))}/></label></div>
       <label className={styles.check}><input type="checkbox" checked={product.active} onChange={e=>setProduct(p=>({...p,active:e.target.checked}))}/>{t("Disponible para nuevas cotizaciones","Available for new quotes")}</label>
       <button type="submit" disabled={busy} className={styles.primary}><Check size={17}/>{productId?t("Guardar cambios","Save changes"):t("Guardar servicio","Save item")}</button>
       {productId?<button type="button" onClick={()=>{setProductId("");setProduct({name:"",description:"",unit_name:"unidad",price:"",active:true});}}>{t("Cancelar edición","Cancel editing")}</button>:null}
      </form>
     </section>
     <section className={styles.panel}><h2>{t("Precios configurados","Configured prices")}</h2>
      {!catalog.length?<p className={styles.muted}>{t("Aún no hay servicios. Agrega el primero.","No services yet. Add the first one.")}</p>:
       <div className={styles.list}>{catalog.map(x=><div className={styles.listItem} key={x.id}>
        <div><strong>{x.name}</strong><small>{money(x.unit_price_cents,language)} / {x.unit_name} · {x.active?t("Activo","Active"):t("Pausado","Paused")}</small></div>
        <button type="button" onClick={()=>{setProductId(x.id);setProduct({name:x.name,description:x.description,unit_name:x.unit_name,price:fmt(x.unit_price_cents),active:x.active});}}>{t("Editar","Edit")}</button>
       </div>)}</div>}
     </section>
    </div>:quoteForm?<section className={styles.panel}>
     <div className={styles.sectionTop}><div><h2>{quoteForm.id?t("Editar borrador","Edit draft"):t("Nueva cotización","New quote")}</h2>
      <p>{t("Completa la información del cliente y elige servicios de tu catálogo.","Add customer details and choose items from your catalog.")}</p></div>
      <button type="button" onClick={()=>setQuoteForm(null)}>{t("Cerrar","Close")}</button></div>
     <form className={styles.form} onSubmit={e=>{e.preventDefault();saveQuote();}}>
      <div className={styles.formGrid}><label>{t("Nombre del cliente","Customer name")}<input required minLength={2} maxLength={120} value={quoteForm.customer_name} onChange={e=>setQuoteForm(f=>f?{...f,customer_name:e.target.value}:f)}/></label>
       <label>{t("Correo (opcional)","Email (optional)")}<input type="email" maxLength={180} value={quoteForm.customer_email} onChange={e=>setQuoteForm(f=>f?{...f,customer_email:e.target.value}:f)}/></label></div>
      <label>{t("Teléfono (opcional)","Phone (optional)")}<input type="tel" maxLength={35} value={quoteForm.customer_phone} onChange={e=>setQuoteForm(f=>f?{...f,customer_phone:e.target.value}:f)}/></label>
      <h3>{t("Conceptos","Line items")}</h3>
      {quoteForm.items.map((line,i)=><div className={styles.lineInput} key={line.key}>
       <label>{t("Servicio","Service")}<select value={line.catalog_item_id} onChange={e=>setQuoteForm(f=>f?{...f,items:f.items.map((x,n)=>n===i?{...x,catalog_item_id:e.target.value}:x)}:f)}>
        {!activeCatalog.some(x=>x.id===line.catalog_item_id)?<option value={line.catalog_item_id}>{t("Servicio no disponible","Unavailable service")}</option>:null}
        {activeCatalog.map(x=><option key={x.id} value={x.id}>{x.name} · {money(x.unit_price_cents,language)}</option>)}</select></label>
       <label>{t("Cantidad","Qty")}<input inputMode="numeric" type="number" min={1} max={9999} value={line.quantity} onChange={e=>setQuoteForm(f=>f?{...f,items:f.items.map((x,n)=>n===i?{...x,quantity:e.target.value}:x)}:f)}/></label>
       <button title={t("Quitar","Remove")} aria-label={t("Quitar concepto","Remove line")} type="button" onClick={()=>setQuoteForm(f=>f?{...f,items:f.items.filter((_,n)=>n!==i)}:f)}><Trash2 size={18}/></button>
      </div>)}
      <button type="button" className={styles.secondary} disabled={quoteForm.items.length>=25||!activeCatalog.length} onClick={()=>{const next=counter+1;setCounter(next);setQuoteForm(f=>f?{...f,items:[...f.items,{catalog_item_id:activeCatalog[0].id,quantity:"1",key:Date.now()+next}]}:f);}}><Plus size={16}/>{t("Agregar concepto","Add line item")}</button>
      <div className={styles.formGrid}>
       <label>{t("Descuento autorizado (USD)","Authorized discount (USD)")}<input inputMode="decimal" value={quoteForm.discount} onChange={e=>setQuoteForm(f=>f?{...f,discount:e.target.value}:f)}/></label>
       <label>{t("Entrega u otros cargos (USD)","Delivery or charges (USD)")}<input inputMode="decimal" value={quoteForm.delivery} onChange={e=>setQuoteForm(f=>f?{...f,delivery:e.target.value}:f)}/></label>
       <label>{t("Impuestos configurados (%)","Seller-configured tax (%)")}<input inputMode="decimal" value={quoteForm.tax} onChange={e=>setQuoteForm(f=>f?{...f,tax:e.target.value}:f)}/></label>
       <label>{t("Depósito propuesto (%)","Proposed deposit (%)")}<input inputMode="decimal" value={quoteForm.deposit} onChange={e=>setQuoteForm(f=>f?{...f,deposit:e.target.value}:f)}/></label>
       <label>{t("Válida hasta","Valid until")}<input type="date" min={plusDays(0)} max={plusDays(365)} required value={quoteForm.valid_until} onChange={e=>setQuoteForm(f=>f?{...f,valid_until:e.target.value}:f)}/></label>
      </div>
      <label>{t("Condiciones y notas","Terms and notes")}<textarea maxLength={1500} rows={3} value={quoteForm.notes} onChange={e=>setQuoteForm(f=>f?{...f,notes:e.target.value}:f)} placeholder={t("Ej. Plazo de entrega, política de cambios…","e.g. Lead time, change policy…")}/></label>
      <div className={styles.totals}>
       {total?<><span>{t("Subtotal","Subtotal")}<b>{money(total.subtotal,language)}</b></span>
        <span>{t("Impuestos configurados","Configured tax")}<b>{money(total.tax,language)}</b></span>
        <span className={styles.grand}>{t("Total estimado","Estimated total")}<b>{money(total.due,language)}</b></span>
        {total.deposit>0?<span>{t("Depósito propuesto","Proposed deposit")}<b>{money(total.deposit,language)}</b></span>:null}</>:
        <p>{t("Completa los conceptos y los importes para calcular el total.","Complete the line items and amounts to calculate the total.")}</p>}
      </div>
      <p className={styles.hint}>{t("El impuesto se calcula sobre el subtotal después del descuento, sin incluir la entrega. Verifica que esta regla corresponda a tu operación.",
       "Tax applies to the discounted subtotal, excluding delivery. Verify that this rule fits your business.")}</p>
      <button className={styles.primary} type="submit" disabled={busy||!total}><Check size={17}/>{t("Guardar borrador para revisión","Save draft for review")}</button>
     </form>
    </section>:<section className={styles.panel}>
     <div className={styles.sectionTop}><div><h2>{t("Tus cotizaciones","Your quotes")}</h2>
      <p>{t("Solo las cotizaciones aprobadas se pueden copiar para el cliente.","Only approved quotes can be copied for the customer.")}</p></div>
      <button type="button" className={styles.primary} onClick={beginQuote}><Plus size={17}/>{t("Nueva cotización","New quote")}</button></div>
     {!quotes.length?<div className={styles.empty}><FileText size={32}/><p>{t("Aún no hay cotizaciones para este negocio.","No quotes yet for this business.")}</p></div>:
      <div className={styles.quoteList}>{quotes.map(q=><article className={styles.quoteCard} key={q.id}>
       <div className={styles.quoteHeading}><div><span className={styles.quoteCode}>#{q.id.slice(0,8).toUpperCase()} · {t("Rev.","Rev.")} {q.revision}</span>
        <h3>{q.customer_name}</h3><small>{q.customer_email||q.customer_phone||t("Sin contacto registrado","No contact details")}</small></div>
        <span className={styles.status}>{q.status==="draft"?t("Borrador","Draft"):q.status==="approved"?t("Aprobada","Approved"):q.status==="sent"?t("Enviada manualmente","Manually sent"):t("Cancelada","Cancelled")}</span></div>
       <div className={styles.quoteDetails}><strong>{money(q.total_cents,language)}</strong><span>{t("Vence","Expires")} {q.valid_until}{q.valid_until<plusDays(0)?" · "+t("Vencida","Expired"):""}</span></div>
       <div className={styles.quoteItems}>{q.lines.map((l,i)=><span key={i}>{l.quantity} × {l.name}</span>)}</div>
       <div className={styles.actions}>
        {q.status==="draft"?<><button type="button" onClick={()=>editQuote(q)}>{t("Editar","Edit")}</button>
         <button type="button" className={styles.actionPrimary} disabled={busy||q.valid_until<plusDays(0)} onClick={()=>statusChange(q,"approve")}><ShieldCheck size={15}/>{t("Aprobar","Approve")}</button></>:null}
        {q.status==="approved"||q.status==="sent"?<button type="button" disabled={busy||q.valid_until<plusDays(0)} onClick={()=>copyQuote(q)}><ClipboardCopy size={15}/>{t("Copiar propuesta","Copy quote")}</button>:null}
        {q.status==="approved"?<button type="button" disabled={busy} onClick={()=>statusChange(q,"mark_sent")}><Send size={15}/>{t("Ya la envié","I've sent it")}</button>:null}
        {q.status!=="cancelled"?<button type="button" className={styles.danger} disabled={busy} onClick={()=>statusChange(q,"cancel")}>{t("Cancelar","Cancel")}</button>:null}
       </div>
      </article>)}</div>}
    </section>}
    <div className={styles.footer}><Wallet size={18}/>{t("Pagos y depósitos: solo propuesta, sin enlace de cobro hasta conectar un proveedor oficial y verificar los webhooks. La aceptación por el cliente y el CRM unificado son fases posteriores.",
     "Payments and deposits: proposal only. No payment link until an official provider and verified webhooks are connected. Customer acceptance and unified CRM are future phases.")}</div>
   </>}
   </div>}
  </div>
 </main>;
}
