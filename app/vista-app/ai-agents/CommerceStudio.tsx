"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,CheckCircle2,Package,Plus,ReceiptText,ShieldCheck,UserRoundCheck,Settings2,ImagePlus,Pencil} from "lucide-react";
import ProductImageField from "./ProductImageField";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {setAgentCatalogReadAccess,type PersistedAgent} from "./agentStore";
import {confirmTestOrder,createTestCheckout,formatUsd,listCatalog,listTestOrders,listHumanRequests,updateHumanRequest,saveCatalogItem,listWebStudioCards,importWebStudioCard,getVerifiedCatalog,
 type CatalogItem,type TestOrder,type HumanRequest,type WebStudioCard,type VerifiedCatalogItem} from "./commerceStore";
import styles from "./CommerceStudio.module.css";
import {useAgentHeaderBack} from "./AgentHeaderBack";

type Form={
 name:string;sku:string;description:string;price:string;image:string;stock_mode:CatalogItem["stock_mode"];
 available_qty:string;approved:boolean;active:boolean;
};
const empty:Form={name:"",sku:"",description:"",price:"",image:"",stock_mode:"manual",available_qty:"",
 approved:false,active:true};
export default function CommerceStudio({agents,onClose,initialAgentId="",onAgentUpdated,workspaceId,catalogOnly=false,onConfigure}:{catalogOnly?:boolean;workspaceId?:string;centralBusinessId?:string;agents:PersistedAgent[];onClose:()=>void;initialAgentId?:string;initialTab?:"setup"|"catalog";onAgentUpdated?:(agent:PersistedAgent)=>void;onConfigure?:()=>void}){
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [webCards,setWebCards]=useState<WebStudioCard[]>([]);
 const [verified,setVerified]=useState<VerifiedCatalogItem[]>([]);
 const [inventoryReady,setInventoryReady]=useState(false);
 const [orders,setOrders]=useState<TestOrder[]>([]);
 const [human,setHuman]=useState<HumanRequest[]>([]);
 const [editing,setEditing]=useState<CatalogItem|null>(null);
 const [form,setForm]=useState<Form>(empty);
 const [agentId,setAgentId]=useState(agents.some(a=>a.id===initialAgentId)?initialAgentId:agents[0]?.id||"");
 const businessId=workspaceId||agents[0]?.business_id||"";
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const [checkoutLinks,setCheckoutLinks]=useState<Record<string,string>>({});
 const [editedAgent,setEditedAgent]=useState<PersistedAgent|null>(null);
 const selectedAgent=(editedAgent?.id===agentId?editedAgent:null)||agents.find(a=>a.id===agentId)||null;
 useEffect(()=>{let live=true;setInventoryReady(false);
  if(!businessId){setVerified([]);return;}
  void getVerifiedCatalog(businessId).then(products=>{
   if(live){setVerified(products);setInventoryReady(true);}
  }).catch(e=>{if(live){setVerified([]);setNotice(e instanceof Error?e.message:"No se pudo verificar inventario.");}});
  return()=>{live=false;};
 },[businessId,items]);
 const toggleCatalogRead=async()=>{
  if(!selectedAgent||busy)return;
  setBusy(true);
  try{
   const enabled=selectedAgent.setup.cap_catalog!=="Sí";
   const updated=await setAgentCatalogReadAccess(selectedAgent,enabled);
   setEditedAgent(updated);onAgentUpdated?.(updated);
   setNotice(""); // The permission state is already visible in the catalog.
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo actualizar el permiso de catálogo.");}
  finally{setBusy(false);}
 };
 const [tab,setTab]=useState<"catalog"|"orders"|"human">("catalog");
 const [catalogView,setCatalogView]=useState<"home"|"add"|"list">("home");
 const useSharedHeader=useAgentHeaderBack(()=>{
  if(tab==="catalog"&&catalogView==="add"){
   setCatalogView(editing?"list":"home");setEditing(null);setForm(empty);setNotice("");return;
  }
  if(tab==="catalog"&&catalogView==="list"){
   setCatalogView("home");setNotice("");return;
  }
  onClose();
 });
 const refresh=async()=>{
  if(!businessId){setItems([]);setOrders([]);setHuman([]);return;}
  const [catalog,history,requests,cards]=await Promise.all([
   listCatalog(businessId),catalogOnly?Promise.resolve([]):listTestOrders(businessId),catalogOnly?Promise.resolve([]):listHumanRequests(businessId),catalogOnly?Promise.resolve([]):listWebStudioCards()
  ]);
  setItems(catalog);setOrders(history);setHuman(requests);setWebCards(cards);
 };
 useEffect(()=>{let live=true;
  if(!businessId){setItems([]);setOrders([]);setHuman([]);setLoading(false);return;}
  setLoading(true);
  void Promise.all([listCatalog(businessId),catalogOnly?Promise.resolve([]):listTestOrders(businessId),catalogOnly?Promise.resolve([]):listHumanRequests(businessId),catalogOnly?Promise.resolve([]):listWebStudioCards()])
   .then(([cat,history,requests,cards])=>{if(live){setItems(cat);setOrders(history);setHuman(requests);setWebCards(cards);}})
   .catch(e=>{if(live)setNotice(e instanceof Error?e.message:"Inicia sesión para consultar tu negocio.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[businessId]);
 const patch=<K extends keyof Form>(key:K,value:Form[K])=>setForm(prev=>({...prev,[key]:value}));
 const save=async()=>{
  if(busy)return;
  setBusy(true);try{
   await saveCatalogItem(form,editing,businessId);await refresh();
   setEditing(null);setForm(empty);setCatalogView("list");
   setNotice("Producto guardado.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const importFromWeb=async(card:WebStudioCard)=>{
  if(busy||!selectedAgent)return;
  setBusy(true);
  try{
   await importWebStudioCard(selectedAgent.business_id,card.id);
   await refresh();setCatalogView("list");
   setNotice("Producto importado. Revisa su precio y actívalo.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo importar la ficha.");}
  finally{setBusy(false);}
 };
 const beginEdit=(item:CatalogItem)=>{
  setEditing(item);setCatalogView("add");setForm({name:item.name,sku:item.sku,description:item.description,
   price:(item.price_cents/100).toFixed(2),image:item.image_path||"",stock_mode:item.stock_mode,
   available_qty:String(item.available_qty??""),approved:item.approved,active:item.active});
 };
 const confirm=async(order:TestOrder)=>{
  setBusy(true);try{await confirmTestOrder(order.id);await refresh();
   setNotice("Aceptación de prueba registrada. Pedido aún NO PAGADO.");}
  catch(e){setNotice(e instanceof Error?e.message:"No se pudo registrar la aceptación.");}
  finally{setBusy(false);}
 };
 const checkout=async(order:TestOrder)=>{
  if(busy)return;
  setBusy(true);
  try{
   const url=await createTestCheckout(order);
   setCheckoutLinks(prev=>({...prev,[order.id]:url}));
   await refresh();
   setNotice("Enlace de Checkout de PRUEBA creado. El pedido sigue pendiente hasta recibir verificación de Stripe.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo obtener el enlace de pago de prueba.");}
  finally{setBusy(false);}
 };
 const copyCheckout=async(url:string)=>{
  try{
   await navigator.clipboard.writeText(url);
   setNotice("Enlace de prueba copiado. Compártelo únicamente con el comprador autorizado.");
  }catch{setNotice("No fue posible copiar el enlace en este navegador.");}
 };
 const markHuman=async(request:HumanRequest,status:"reviewed"|"closed")=>{
  if(busy)return;
  setBusy(true);try{
   await updateHumanRequest(request.id,status);await refresh();
   setNotice("Solicitud de atención actualizada; no se ha enviado ningún mensaje al cliente.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo actualizar.");}
  finally{setBusy(false);}
 };
 return <div className={styles.root}>
  {catalogOnly&&!useSharedHeader?<button type="button" className={styles.subBack} onClick={onClose}>
   <ArrowLeft size={16}/> Cerrar catálogo</button>:null}
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {loading?<p className={styles.hint} role="status">Cargando productos…</p>:null}
  {!catalogOnly?<nav className={styles.tabs} aria-label="Productos y pedidos">
   <button type="button" className={tab==="catalog"?styles.on:styles.off}
    onClick={()=>{setTab("catalog");setCatalogView("home");}}><Package size={15}/> Catálogo</button>
   <button type="button" className={tab==="orders"?styles.on:styles.off}
    onClick={()=>setTab("orders")}><ReceiptText size={15}/> Pedidos ({orders.length})</button>
   <button type="button" className={tab==="human"?styles.on:styles.off}
    onClick={()=>setTab("human")}><UserRoundCheck size={15}/> Solicitudes</button>
  </nav>:null}
  {tab==="catalog"?<>
   {!catalogOnly&&selectedAgent?<div className={styles.catalogConnection}>
    <div className={styles.catalogConnectionInfo}>
     <strong>{selectedAgent.name}</strong>
     <small>Agente · {selectedAgent.setup.cap_catalog==="Sí"?"Conectado":"Desconectado"}</small>
     {onConfigure?<button type="button" className={styles.configureLink} onClick={onConfigure}>
      <Settings2 size={13}/> Permisos</button>:null}
    </div>
    <label className={styles.catalogSwitch} aria-label="Conectar agente al catálogo">
     <input type="checkbox" role="switch" checked={selectedAgent.setup.cap_catalog==="Sí"}
      disabled={busy} onChange={()=>void toggleCatalogRead()}/>
     <span aria-hidden="true"/>
    </label>
   </div>:null}
   {catalogView==="home"?<div className={styles.actionGrid}>
    <button type="button" className={styles.actionCard} onClick={()=>{
     setEditing(null);setForm(empty);setCatalogView("add");setNotice("");
    }}>
     <span className={styles.actionIcon}><ImagePlus size={24}/></span>
     <strong>Agregar producto</strong><small>Nombre, precio y foto</small>
    </button>
    <button type="button" className={styles.actionCard} onClick={()=>{
     setCatalogView("list");setNotice("");
    }}>
     <span className={styles.actionIcon}><Package size={24}/></span>
     <strong>Mis productos</strong><small>{items.length} guardado(s)</small>
    </button>
   </div>:catalogView==="add"?<>
    {!useSharedHeader?<button type="button" className={styles.subBack}
     onClick={()=>{setCatalogView(editing?"list":"home");setEditing(null);setForm(empty);setNotice("");}}>
     <ArrowLeft size={16}/> {editing?"Mis productos":"Catálogo"}</button>:null}
    <div className={styles.heading}><h2>{editing?"Editar producto":"Agregar producto"}</h2></div>
    <div className={styles.form}>
     <label>Nombre<input maxLength={120} value={form.name}
      onChange={e=>patch("name",e.target.value)} placeholder="Nombre del producto"/></label>
     <label>Código (SKU)<input maxLength={45} value={form.sku}
      onChange={e=>patch("sku",e.target.value.toUpperCase())} placeholder="Ej. PASTEL-01"/></label>
     <label>Precio USD<input inputMode="decimal" value={form.price}
      onChange={e=>patch("price",e.target.value)} placeholder="25.00"/></label>
     <label>Descripción<textarea rows={2} value={form.description} maxLength={700}
      onChange={e=>patch("description",e.target.value)}/></label>
     <div className={styles.photoField}>
      <strong>Foto del producto</strong>
      <ProductImageField value={form.image} onChange={url=>patch("image",url)}
       productName={form.name} description={form.description} businessId={businessId}/>
      <small>Visible en la web conectada cuando apruebes el producto.</small>
     </div>
     <label>Existencias<select value={form.stock_mode}
      onChange={e=>patch("stock_mode",e.target.value as Form["stock_mode"])}>
      <option value="manual">Confirmación manual</option>
      <option value="tracked">Cantidad verificada</option>
      <option value="unlimited">Sin límite</option>
     </select></label>
     {form.stock_mode==="tracked"?<label>Unidades<input type="number" inputMode="numeric" min={0}
      max={1000000} value={form.available_qty}
      onChange={e=>patch("available_qty",e.target.value)}/></label>:null}
     <label className={styles.check}><input type="checkbox" checked={form.approved}
      onChange={e=>patch("approved",e.target.checked)}/> Precio aprobado</label>
     <label className={styles.check}><input type="checkbox" checked={form.active}
      onChange={e=>patch("active",e.target.checked)}/> Producto activo</label>
     <button type="button" className={styles.primary}
      disabled={busy||!form.name.trim()||!form.sku.trim()||!form.price.trim()}
      onClick={()=>void save()}><Plus size={17}/> {busy?"Guardando…":editing?"Guardar cambios":"Guardar producto"}</button>
    </div>
    {!editing&&webCards.length>0?<details className={styles.importPanel}>
     <summary>Importar desde Web Studio</summary>
     <div className={styles.items}>{webCards.map(card=>{
      const linked=items.some(item=>item.web_source_id===card.id);
      return <div key={card.id} className={styles.item}><div>
       <strong>{card.title||"Sin nombre"}</strong>
       <small>{card.price||"Sin precio"}</small></div>
       <button type="button" disabled={busy||linked||!card.importable||!selectedAgent}
        onClick={()=>void importFromWeb(card)}>{linked?"Importado":"Importar"}</button>
      </div>;
     })}</div>
    </details>:null}
   </>:<>
    {!useSharedHeader?<button type="button" className={styles.subBack}
     onClick={()=>{setCatalogView("home");setNotice("");}}><ArrowLeft size={16}/> Catálogo</button>:null}
    <div className={styles.heading}><h2>Mis productos ({items.length})</h2></div>
    {items.length===0?<div className={styles.empty}><Package size={26}/>
     <p>Aún no hay productos.</p></div>:
     <div className={styles.items}>{items.map(item=>{
      const image=item.image_path?safeWebImageUrl(item.image_path):null;
      return <article key={item.id} className={styles.item}>
       {image?<img className={styles.productThumb} src={image} alt={item.name}/>:
        <span className={styles.productPlaceholder}><Package size={20}/></span>}
       <div><strong>{item.name}</strong>
        <small>{item.sku} · {formatUsd(item.price_cents)}</small>
        <small>{item.approved&&item.active?"Activo":"Pendiente"}
         {item.stock_mode==="tracked"?" · "+String(item.available_qty??0)+" unidades":""}</small>
        {item.approved&&item.active&&inventoryReady?<small>
         {(()=>{const stock=verified.find(p=>p.id===item.id);
          return stock?.availability==="tracked"?String(stock.availableQuantity)+" disponibles":
           stock?.availability==="manual"?"Existencias por confirmar":
           stock?.availability==="unlimited"?"Sin límite configurado":"No ofertable";
         })()}
        </small>:null}
       </div>
       <button type="button" onClick={()=>beginEdit(item)} aria-label={"Editar "+item.name}>
        <Pencil size={15}/> Editar</button>
      </article>;
     })}</div>}
   </>}
  </>:tab==="orders"?<>
   <h2 className={styles.ordersTitle}>Pedidos de prueba</h2>
   {orders.length===0?<div className={styles.empty}><ReceiptText size={26}/><p>Sin pedidos de prueba.</p></div>:
    <div className={styles.items}>{orders.map(order=><div className={styles.item} key={order.id}>
     <div><strong>Pedido #{order.order_no}</strong>
      <small>{formatUsd(order.total_cents)} · {order.status==="awaiting_confirmation"?"Esperando aceptación":order.status==="awaiting_payment"?"Aceptado · pago pendiente":order.status}</small>
      <small>TEST · {order.payment_status==="paid"?"Pago verificado":"NO PAGADO"}</small></div>
     {order.status==="awaiting_confirmation"?<button type="button" disabled={busy} onClick={()=>void confirm(order)}>
      <CheckCircle2 size={14}/> Simular aceptación</button>:null}
     {order.status==="awaiting_payment"&&order.payment_status!=="paid"?<button type="button"
      disabled={busy} onClick={()=>void checkout(order)}>Enlace test</button>:null}
     {checkoutLinks[order.id]?<button type="button"
      onClick={()=>void copyCheckout(checkoutLinks[order.id])}>Copiar enlace</button>:null}
    </div>)}</div>}
   <div className={styles.warning}><ShieldCheck size={17}/>
    <p>Solo cobros de prueba con Stripe verificado.</p></div>
  </>:<>
   <h2 className={styles.ordersTitle}>Solicitudes humanas</h2>
   {human.length===0?<div className={styles.empty}><UserRoundCheck size={26}/><p>Sin solicitudes.</p></div>:
    <div className={styles.items}>{human.map(req=><article className={styles.item} key={req.id}>
     <div><strong>Solicitud del agente</strong>
      <small>{new Date(req.created_at).toLocaleString("es-US")} · {req.status==="new"?"Nueva":req.status==="reviewed"?"Revisada":"Cerrada"}</small>
      <small>{req.summary}</small></div>
     {req.status==="new"?<button type="button" disabled={busy}
      onClick={()=>void markHuman(req,"reviewed")}>Revisar</button>:req.status==="reviewed"?
      <button type="button" disabled={busy} onClick={()=>void markHuman(req,"closed")}>Cerrar</button>:null}
    </article>)}</div>}
  </>}
 </div>;
}
