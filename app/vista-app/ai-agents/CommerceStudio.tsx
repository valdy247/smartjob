"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,CheckCircle2,Package,Plus,ReceiptText,ShieldCheck,ShoppingBag,UserRoundCheck,PhoneCall,MessageCircle,Save,Settings2} from "lucide-react";
import {setAgentCatalogReadAccess,type PersistedAgent,type PhoneSelection} from "./agentStore";
import {confirmTestOrder,createTestCheckout,formatUsd,listCatalog,listTestOrders,listHumanRequests,updateHumanRequest,saveCatalogItem,saveCommerceAgentPermissions,listWebStudioCards,importWebStudioCard,getVerifiedCatalog,
 type CatalogItem,type TestOrder,type HumanRequest,type CommerceAgentPermissions,type WebStudioCard,type VerifiedCatalogItem} from "./commerceStore";
import styles from "./CommerceStudio.module.css";
import CatalogProductImageField,{catalogImageUrl} from "./CatalogProductImageField";
import InventoryWebsiteLink from "./InventoryWebsiteLink";

type Form={
 name:string;sku:string;description:string;price:string;stock_mode:CatalogItem["stock_mode"];
 available_qty:string;approved:boolean;active:boolean;image_path:string;
};
const empty:Form={name:"",sku:"",description:"",price:"",stock_mode:"manual",available_qty:"",
 approved:false,active:true,image_path:""};
export default function CommerceStudio({agents,onClose,initialAgentId="",initialTab="catalog",onAgentUpdated,workspaceId,centralBusinessId="",catalogOnly=false,phoneConnection,onManageCalls}:{
 catalogOnly?:boolean;workspaceId?:string;centralBusinessId?:string;agents:PersistedAgent[];
 onClose:()=>void;initialAgentId?:string;initialTab?:"setup"|"catalog";
 onAgentUpdated?:(agent:PersistedAgent)=>void;
 phoneConnection?:PhoneSelection|null;onManageCalls?:()=>void;
}){
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [webCards,setWebCards]=useState<WebStudioCard[]>([]);
 const [verified,setVerified]=useState<VerifiedCatalogItem[]>([]);
 const [inventoryReady,setInventoryReady]=useState(false);
 const [orders,setOrders]=useState<TestOrder[]>([]);
 const [human,setHuman]=useState<HumanRequest[]>([]);
 const [editing,setEditing]=useState<CatalogItem|null>(null);
 const [form,setForm]=useState<Form>(empty);
 const [imageUploading,setImageUploading]=useState(false);
 const [agentId,setAgentId]=useState(agents.some(a=>a.id===initialAgentId)?initialAgentId:agents[0]?.id||"");
 const businessId=workspaceId||agents[0]?.business_id||"";
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const [checkoutLinks,setCheckoutLinks]=useState<Record<string,string>>({});
 const [editedAgent,setEditedAgent]=useState<PersistedAgent|null>(null);
 const [permissions,setPermissions]=useState<CommerceAgentPermissions>({
  channel:"Chat",cap_sales:false,perm_prepare_order:false,perm_confirm_order:false,perm_payment_link:false
 });
 const selectedAgent=(editedAgent?.id===agentId?editedAgent:null)||agents.find(a=>a.id===agentId)||null;
 useEffect(()=>{let live=true;setInventoryReady(false);
  if(!businessId){setVerified([]);return;}
  void getVerifiedCatalog(businessId).then(products=>{
   if(live){setVerified(products);setInventoryReady(true);}
  }).catch(e=>{if(live){setVerified([]);setNotice(e instanceof Error?e.message:"No se pudo verificar inventario.");}});
  return()=>{live=false;};
 },[businessId,items]);
 useEffect(()=>{
  const conf=selectedAgent?.setup||{};
  setPermissions({
   channel:conf.channel==="Teléfono"||conf.channel==="Teléfono y chat"?conf.channel:"Chat",
   cap_sales:conf.cap_sales==="Sí",perm_prepare_order:conf.perm_prepare_order==="Sí",
   perm_confirm_order:conf.perm_confirm_order==="Sí",perm_payment_link:conf.perm_payment_link==="Sí"
  });
 },[selectedAgent?.id,selectedAgent?.revision]);
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
 const savePermissions=async()=>{
  if(!selectedAgent||busy)return;
  setBusy(true);
  try{
   const saved=await saveCommerceAgentPermissions(selectedAgent,permissions);
   setEditedAgent(saved);onAgentUpdated?.(saved);
   setNotice("Permisos guardados en tu cuenta. Las llamadas existentes mantienen su configuración anterior.");
  }catch(e){setNotice(e instanceof Error?e.message:"No fue posible guardar los permisos.");}
  finally{setBusy(false);}
 };

 const [tab,setTab]=useState<"setup"|"catalog"|"orders"|"human">(initialTab);
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
  if(busy||imageUploading)return;
  setBusy(true);try{
   await saveCatalogItem(form,editing,businessId);await refresh();
   setEditing(null);setForm(empty);setNotice("Producto guardado en este negocio. El agente principal podrá consultarlo solo con permisos válidos.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const importFromWeb=async(card:WebStudioCard)=>{
  if(busy||!selectedAgent)return;
  setBusy(true);
  try{
   await importWebStudioCard(selectedAgent.business_id,card.id);
   await refresh();
   setNotice("Ficha importada, pero todavía NO se puede vender. Revisa su precio, inventario y actívala manualmente.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo importar la ficha.");}
  finally{setBusy(false);}
 };
 const beginEdit=(item:CatalogItem)=>{
  setEditing(item);setForm({name:item.name,sku:item.sku,description:item.description,
   price:(item.price_cents/100).toFixed(2),stock_mode:item.stock_mode,
   available_qty:String(item.available_qty??""),approved:item.approved,active:item.active,
   image_path:item.image_path||""});
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
  <button type="button" onClick={onClose} className={styles.back}><ArrowLeft size={17}/> {catalogOnly?"Volver al agente":"AI Agents"}</button>
  {!catalogOnly?<>
  <div className={styles.hero}><div><small>VMV BUSINESS</small><h1>Productos y pedidos</h1></div><ShoppingBag size={28}/></div>
  {tab==="orders"?<p className={styles.hint}>Pedidos de prueba · Sin cobros reales</p>:null}
  </>:null}
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {loading?<p className={styles.hint}>Cargando catálogo y pedidos…</p>:null}
  {!catalogOnly?<div className={styles.tabs}>
   <button type="button" className={tab==="setup"?styles.on:styles.off} onClick={()=>setTab("setup")}><PhoneCall size={15}/> Ventas</button>
   <button type="button" className={tab==="catalog"?styles.on:styles.off} onClick={()=>setTab("catalog")}><Package size={15}/> Catálogo ({items.length})</button>
   <button type="button" className={tab==="orders"?styles.on:styles.off} onClick={()=>setTab("orders")}><ReceiptText size={15}/> Pedidos ({orders.length})</button>
   <button type="button" className={tab==="human"?styles.on:styles.off} onClick={()=>setTab("human")}><UserRoundCheck size={15}/> Humano ({human.filter(x=>x.status==="new").length})</button>
  </div>:null}
  {tab==="setup"?<>
   <div className={styles.heading}><h2>Preparar al agente para vender</h2></div>
   {centralBusinessId?<a className={styles.financeLink} href={"/vista-app/finanzas?business="+encodeURIComponent(centralBusinessId)}>💳 Conectar Stripe para cobrar desde VMV →</a>:null}
   <div className={styles.form}>
    <label>Agente que atenderá las ventas
     <select value={agentId} onChange={e=>{setAgentId(e.target.value);setEditedAgent(null);}}>
      <option value="">Elige tu agente</option>
      {agents.filter(a=>a.revision>0).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
     </select>
    </label>
    {selectedAgent?<><p className={styles.hint}>Ventas no cambia el agente de tu línea.</p>
     <label>Canal del agente
      <select value={permissions.channel} onChange={e=>setPermissions(p=>({...p,channel:e.target.value as CommerceAgentPermissions["channel"]}))}>
       <option value="Chat">Solo chat</option><option value="Teléfono">Teléfono</option>
       <option value="Teléfono y chat">Teléfono y chat</option>
      </select>
     </label>
     <label className={styles.check}><input type="checkbox" checked={permissions.cap_sales}
      onChange={e=>setPermissions(p=>({...p,cap_sales:e.target.checked,
       perm_prepare_order:e.target.checked?p.perm_prepare_order:false,
       perm_confirm_order:e.target.checked?p.perm_confirm_order:false,
       perm_payment_link:e.target.checked?p.perm_payment_link:false}))}/>
      <span>Vender: consultar el catálogo aprobado y explicar sus precios.</span></label>
     <label className={styles.check}><input type="checkbox" disabled={!permissions.cap_sales}
      checked={permissions.perm_prepare_order}
      onChange={e=>setPermissions(p=>({...p,perm_prepare_order:e.target.checked,
       perm_confirm_order:e.target.checked?p.perm_confirm_order:false,
       perm_payment_link:e.target.checked?p.perm_payment_link:false}))}/>
      <span>Preparar cotizaciones y pedidos de PRUEBA con precios calculados en el servidor.</span></label>
     <label className={styles.check}><input type="checkbox" disabled={!permissions.perm_prepare_order}
      checked={permissions.perm_confirm_order}
      onChange={e=>setPermissions(p=>({...p,perm_confirm_order:e.target.checked}))}/>
      <span>Confirmar un pedido de prueba solo después de la aceptación expresa del comprador.</span></label>
     <label className={styles.check}><input type="checkbox" disabled={!permissions.perm_prepare_order}
      checked={permissions.perm_payment_link}
      onChange={e=>setPermissions(p=>({...p,perm_payment_link:e.target.checked}))}/>
      <span>Permitir enlace de pago de PRUEBA solo si el negocio tiene una cuenta comercial verificada.</span></label>
     <button type="button" className={styles.primary} disabled={busy} onClick={()=>void savePermissions()}>
      <Save size={16}/> Guardar permisos de ventas</button>
    </>:<p className={styles.hint}>Guarda primero un agente y selecciónalo aquí.</p>}
   </div>
   <div className={styles.warning}><ShieldCheck size={18}/>
    <p>Añade productos con precio y unidades verificadas en <strong>Catálogo</strong>.</p>
   </div>
   <button type="button" className={styles.primary} onClick={()=>setTab("catalog")}><Package size={16}/> Ir al catálogo</button>
  </>:tab==="catalog"?<>
   <section className={styles.connectionsHub} aria-label="Conexiones del negocio">
    <h2>Conexiones</h2>
    <InventoryWebsiteLink businessId={businessId}/>
    {!catalogOnly?<div className={styles.connectionUnit}>
     <div className={styles.connectionRow}>
      <span className={styles.connectionIcon}><MessageCircle size={19}/></span>
      <div className={styles.connectionIdentity}>
       <strong>Inventario del chat</strong>
       {agents.filter(agent=>agent.revision>0).length>1?
        <select aria-label="Seleccionar agente del chat" value={agentId}
         onChange={event=>{setAgentId(event.target.value);setEditedAgent(null);}}>
         <option value="">Seleccionar agente</option>
         {agents.filter(agent=>agent.revision>0).map(agent=>
          <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>:<small>{selectedAgent?.name||"Sin agente seleccionado"}</small>}
      </div>
      <div className={styles.connectionControls}>
       <span className={selectedAgent?.setup.cap_catalog==="Sí"?styles.connectionOnline:styles.connectionOffline}>
        {selectedAgent?.setup.cap_catalog==="Sí"?"Conectado":"Sin conectar"}
       </span>
       <button className={styles.connectionChange} type="button" disabled={busy||!selectedAgent}
        onClick={()=>void toggleCatalogRead()}>
        {busy?"Guardando…":selectedAgent?.setup.cap_catalog==="Sí"?"Desconectar":"Conectar"}
       </button>
      </div>
     </div>
    </div>:null}
    {!catalogOnly&&onManageCalls?<div className={styles.connectionUnit}>
     <div className={styles.connectionRow}>
      <span className={styles.connectionIcon}><PhoneCall size={19}/></span>
      <div className={styles.connectionIdentity}>
       <strong>Llamadas del agente</strong>
       <small>{phoneConnection?.maskedNumber||"Sin línea configurada"}</small>
      </div>
      <div className={styles.connectionControls}>
       <span className={phoneConnection?.serverEnrolled&&phoneConnection.agentId===selectedAgent?.id?
        styles.connectionOnline:styles.connectionOffline}>
        {phoneConnection?.serverEnrolled&&phoneConnection.agentId===selectedAgent?.id?
         "Conectado":phoneConnection?.agentId?"Revisar":"Sin conectar"}
       </span>
       <button className={styles.connectionChange} type="button" onClick={onManageCalls}>
        <Settings2 size={14}/> Configurar
       </button>
      </div>
     </div>
    </div>:null}
   </section>
   {!catalogOnly&&webCards.length>0?<>
    <div className={styles.heading}><h2>Productos de Web Studio</h2></div>
    <p className={styles.hint}>Revisa precio y disponibilidad antes de aprobar.</p>
    <div className={styles.items}>{webCards.map(card=>{
     const linked=items.some(item=>item.web_source_id===card.id);
     return <div key={card.id} className={styles.item}>
      <div><strong>{card.title||"Producto sin nombre"}</strong>
       <small>{card.price||"Precio sin definir"}</small>
       <small>{linked?"Importado · revisa aprobación y existencias":
        card.importable?"Precio fijo reconocible · pendiente de revisión":
        "Necesita precio fijo en USD y nombre válido"}</small></div>
      <button type="button" disabled={busy||linked||!card.importable||!selectedAgent}
       onClick={()=>void importFromWeb(card)}>
       {linked?"Vinculado":"Importar"}</button>
     </div>;})}</div>
   </>:null}
   <div className={styles.heading}><h2>{editing?"Editar producto":"Añadir producto"}</h2>
    {editing?<button type="button" onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar edición</button>:null}</div>
   <div className={styles.form}>
    <CatalogProductImageField businessId={businessId} value={form.image_path}
     onChange={path=>patch("image_path",path)} onBusy={setImageUploading} disabled={busy}/>
    <label>Nombre real aprobado<input maxLength={120} value={form.name} onChange={e=>patch("name",e.target.value)} placeholder="Nombre del producto"/></label>
    <label>Código único (SKU)<input maxLength={45} value={form.sku} onChange={e=>patch("sku",e.target.value)} placeholder="Ej. PASTEL-01"/></label>
    <label>Precio aprobado (USD)<input inputMode="decimal" value={form.price}
      onChange={e=>patch("price",e.target.value)} placeholder="0.00"/></label>
    <label>Descripción<textarea rows={2} value={form.description} onChange={e=>patch("description",e.target.value)} maxLength={700}/></label>
    <label>Control de disponibilidad<select value={form.stock_mode} onChange={e=>patch("stock_mode",e.target.value as Form["stock_mode"])}>
     <option value="manual">Confirmación humana necesaria</option>
     <option value="tracked">Cantidad verificada</option>
     <option value="unlimited">Sin límite de unidades para este producto</option>
    </select></label>
    {form.stock_mode==="tracked"?<label>Unidades disponibles<input type="number" inputMode="numeric" min={0} max={1000000} value={form.available_qty} onChange={e=>patch("available_qty",e.target.value)}/></label>:null}
    <label className={styles.check}><input type="checkbox" checked={form.approved} onChange={e=>patch("approved",e.target.checked)}/>
      <span>Confirmo que el precio y los datos del producto están aprobados por el negocio.</span></label>
    <label className={styles.check}><input type="checkbox" checked={form.active} onChange={e=>patch("active",e.target.checked)}/>
      <span>Producto disponible en el catálogo</span></label>
    <button type="button" disabled={busy||imageUploading||!form.name.trim()||!form.sku.trim()||!form.price.trim()}
      className={styles.primary} onClick={()=>void save()}><Plus size={18}/> {editing?"Guardar cambios":"Guardar producto"}</button>
   </div>
   <div className={styles.heading}><h2>Mis productos</h2></div>
   {items.length===0?<div className={styles.empty}><Package size={26}/><p>No hay productos aprobados.</p></div>:
    <div className={styles.items}>{items.map(item=><div key={item.id} className={styles.item}>
     {item.image_path&&catalogImageUrl(item.image_path)?<img className={styles.catalogThumb}
      src={catalogImageUrl(item.image_path)} alt={"Foto de "+item.name} loading="lazy"/>:null}
     <div><strong>{item.name}</strong><small>{item.sku} · {formatUsd(item.price_cents)}</small>
      <small>{item.approved?"Precio aprobado":"Pendiente de aprobación"} · {item.stock_mode==="tracked"?String(item.available_qty)+" unidades configuradas":item.stock_mode==="manual"?"Disponibilidad manual":"Sin límite configurado"}</small>
      {item.approved&&item.active&&inventoryReady?<small>{
       (()=>{const stock=verified.find(v=>v.id===item.id);
        return stock?.availability==="tracked"?String(stock.availableQuantity)+" disponibles tras apartados":
         stock?.availability==="manual"?"Confirmar existencia manualmente":
         stock?.availability==="unlimited"?"Sin límite de unidades configurado":"No ofertable";
       })()
      }</small>:null}
      {item.web_source_id?<small>Vinculado a Web Studio · cambios futuros requieren revisión</small>:null}</div>
     <button type="button" onClick={()=>beginEdit(item)}>Editar</button>
    </div>)}</div>}
  </>:tab==="orders"?<>
   <h2 className={styles.ordersTitle}>Historial de prueba</h2>
   {orders.length===0?<div className={styles.empty}><ReceiptText size={26}/><p>Todavía no hay pedidos de prueba.</p></div>:
    <div className={styles.items}>{orders.map(order=><div className={styles.item} key={order.id}>
     <div><strong>Pedido #{order.order_no}</strong>
      <small>{formatUsd(order.total_cents)} · {order.status==="awaiting_confirmation"?"Esperando aceptación":order.status==="awaiting_payment"?"Aceptado · pago pendiente":order.status}</small>
      <small>TEST · {order.payment_status==="paid"?"Pago verificado":"NO PAGADO"}</small></div>
     {order.status==="awaiting_confirmation"?<button type="button" disabled={busy} onClick={()=>void confirm(order)}>
      <CheckCircle2 size={14}/> Simular aceptación</button>:null}
     {order.status==="awaiting_payment"&&order.payment_status!=="paid"?<button type="button"
       disabled={busy} onClick={()=>void checkout(order)}>Enlace test</button>:null}
     {checkoutLinks[order.id]?<button type="button" onClick={()=>void copyCheckout(checkoutLinks[order.id])}>Copiar enlace</button>:null}
    </div>)}</div>}
   <div className={styles.warning}><ShieldCheck size={17}/><p>Los enlaces de pago requieren una cuenta verificada del negocio, independiente de VMV.</p></div>
  </>:<>
   <h2 className={styles.ordersTitle}>Solicitudes de atención humana</h2>
   <p className={styles.hint}>Solicitudes de atención humana · sin grabaciones ni transferencias confirmadas.</p>
   {human.length===0?<div className={styles.empty}><UserRoundCheck size={26}/><p>Sin solicitudes pendientes.</p></div>:
    <div className={styles.items}>{human.map(req=><article className={styles.item} key={req.id}>
      <div><strong>Solicitud del agente</strong><small>{new Date(req.created_at).toLocaleString("es-US")} · {req.status==="new"?"Nueva":req.status==="reviewed"?"Revisada":"Cerrada"}</small>
       <small>{req.summary}</small></div>
      {req.status==="new"?<button type="button" disabled={busy} onClick={()=>void markHuman(req,"reviewed")}>Revisar</button>:req.status==="reviewed"?
       <button type="button" disabled={busy} onClick={()=>void markHuman(req,"closed")}>Cerrar</button>:null}
     </article>)}</div>}
  </>}
 </div>;
}
