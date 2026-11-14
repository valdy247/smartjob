"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,CheckCircle2,ClipboardList,Package,Plus,ReceiptText,ShieldCheck,ShoppingBag,UserRoundCheck,PhoneCall,Save} from "lucide-react";
import type {PersistedAgent} from "./agentStore";
import {confirmTestOrder,createTestCheckout,formatUsd,listCatalog,listTestOrders,listHumanRequests,updateHumanRequest,prepareTestOrder,saveCatalogItem,saveCommerceAgentPermissions,listWebStudioCards,importWebStudioCard,getVerifiedCatalog,
 type CatalogItem,type TestOrder,type HumanRequest,type CommerceAgentPermissions,type WebStudioCard,type VerifiedCatalogItem} from "./commerceStore";
import styles from "./CommerceStudio.module.css";

type Form={
 name:string;sku:string;description:string;price:string;stock_mode:CatalogItem["stock_mode"];
 available_qty:string;approved:boolean;active:boolean;
};
const empty:Form={name:"",sku:"",description:"",price:"",stock_mode:"manual",available_qty:"",
 approved:false,active:true};
export default function CommerceStudio({agents,onClose,initialAgentId="",onAgentUpdated}:{agents:PersistedAgent[];onClose:()=>void;initialAgentId?:string;onAgentUpdated?:(agent:PersistedAgent)=>void}){
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [webCards,setWebCards]=useState<WebStudioCard[]>([]);
 const [verified,setVerified]=useState<VerifiedCatalogItem[]>([]);
 const [inventoryReady,setInventoryReady]=useState(false);
 const [orders,setOrders]=useState<TestOrder[]>([]);
 const [human,setHuman]=useState<HumanRequest[]>([]);
 const [editing,setEditing]=useState<CatalogItem|null>(null);
 const [form,setForm]=useState<Form>(empty);
 const [agentId,setAgentId]=useState(initialAgentId);
 const [testItemId,setTestItemId]=useState("");
 const [qty,setQty]=useState(1);
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
  if(!selectedAgent?.business_id){setVerified([]);return;}
  void getVerifiedCatalog(selectedAgent.business_id).then(products=>{
   if(live){setVerified(products);setInventoryReady(true);}
  }).catch(e=>{if(live){setVerified([]);setNotice(e instanceof Error?e.message:"No se pudo verificar inventario.");}});
  return()=>{live=false;};
 },[selectedAgent?.business_id,items]);
 useEffect(()=>{
  const conf=selectedAgent?.setup||{};
  setPermissions({
   channel:conf.channel==="Teléfono"||conf.channel==="Teléfono y chat"?conf.channel:"Chat",
   cap_sales:conf.cap_sales==="Sí",perm_prepare_order:conf.perm_prepare_order==="Sí",
   perm_confirm_order:conf.perm_confirm_order==="Sí",perm_payment_link:conf.perm_payment_link==="Sí"
  });
 },[selectedAgent?.id,selectedAgent?.revision]);
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

 const [tab,setTab]=useState<"setup"|"catalog"|"orders"|"human">(initialAgentId?"setup":"catalog");
 const refresh=async()=>{
  const [catalog,history,requests,cards]=await Promise.all([listCatalog(),listTestOrders(),listHumanRequests(),listWebStudioCards()]);
  setItems(catalog);setOrders(history);setHuman(requests);setWebCards(cards);
 };
 useEffect(()=>{let live=true;
  void Promise.all([listCatalog(),listTestOrders(),listHumanRequests(),listWebStudioCards()])
   .then(([cat,history,requests,cards])=>{if(live){setItems(cat);setOrders(history);setHuman(requests);setWebCards(cards);}})
   .catch(e=>{if(live)setNotice(e instanceof Error?e.message:"Inicia sesión para consultar tu negocio.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[]);
 const patch=<K extends keyof Form>(key:K,value:Form[K])=>setForm(prev=>({...prev,[key]:value}));
 const save=async()=>{
  if(busy)return;
  setBusy(true);try{
   await saveCatalogItem(form,editing);await refresh();
   setEditing(null);setForm(empty);setNotice("Producto guardado en tu negocio. Se compartirá con los agentes de esta cuenta.");
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
   available_qty:String(item.available_qty??""),approved:item.approved,active:item.active});
 };
 const quote=async()=>{
  const a=agents.find(x=>x.id===agentId),item=items.find(x=>x.id===testItemId);
  if(!a||!item){setNotice("Selecciona un agente y un producto aprobado.");return;}
  setBusy(true);try{
   await prepareTestOrder(a,item,qty);await refresh();setTab("orders");
   setNotice("Cotización de prueba creada. Falta aceptación del comprador y un proveedor de pago.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo preparar el pedido.");}
  finally{setBusy(false);}
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
 const approved=items.filter(x=>verified.some(v=>v.id===x.id&&v.sellableInTest));
 return <div className={styles.root}>
  <button type="button" onClick={onClose} className={styles.back}><ArrowLeft size={17}/> AI Agents</button>
  <div className={styles.hero}><div><small>COMERCIO INTELIGENTE · TEST</small>
   <h1>Productos y pedidos</h1>
   <p>Precios verificables. Pedidos trazables. Cero pagos ficticios.</p></div><ShoppingBag size={28}/></div>
  <div className={styles.warning}><ShieldCheck size={17}/>
   <p>Este laboratorio crea únicamente pedidos de <strong>prueba</strong>. No cobra dinero, no confirma reservas reales ni altera la configuración de Smart Call.</p></div>
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {loading?<p className={styles.hint}>Cargando catálogo y pedidos…</p>:null}
  <div className={styles.tabs}>
   <button type="button" className={tab==="setup"?styles.on:styles.off} onClick={()=>setTab("setup")}><PhoneCall size={15}/> Ventas</button>
   <button type="button" className={tab==="catalog"?styles.on:styles.off} onClick={()=>setTab("catalog")}><Package size={15}/> Catálogo ({items.length})</button>
   <button type="button" className={tab==="orders"?styles.on:styles.off} onClick={()=>setTab("orders")}><ReceiptText size={15}/> Pedidos ({orders.length})</button>
   <button type="button" className={tab==="human"?styles.on:styles.off} onClick={()=>setTab("human")}><UserRoundCheck size={15}/> Humano ({human.filter(x=>x.status==="new").length})</button>
  </div>
  {tab==="setup"?<>
   <div className={styles.heading}><h2>Preparar al agente para vender</h2></div>
   <div className={styles.form}>
    <label>Agente que atenderá las ventas
     <select value={agentId} onChange={e=>{setAgentId(e.target.value);setEditedAgent(null);}}>
      <option value="">Elige tu agente</option>
      {agents.filter(a=>a.revision>0).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
     </select>
    </label>
    {selectedAgent?<><p className={styles.hint}>Habilitar ventas no cambia qué agente atiende el teléfono. Debes mantener seleccionado el agente correcto para tu línea.</p>
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
    <p>Importante: un 97 % de configuración general no significa que el agente tenga productos autorizados. Tu siguiente paso es añadir al menos un producto con precio y unidades verificadas en <strong>Catálogo</strong>.</p>
   </div>
   <button type="button" className={styles.primary} onClick={()=>setTab("catalog")}><Package size={16}/> Ir al catálogo</button>
  </>:tab==="catalog"?<>
   <div className={styles.heading}><h2>Productos de Web Studio</h2></div>
   <div className={styles.warning}><ShieldCheck size={17}/><p>
    Las fichas web son informativas. Importarlas no autoriza ventas ni crea existencias:
    revisa el precio fijo y la disponibilidad antes de aprobarlas. Los cambios futuros
    en Web Studio requieren revisión para evitar datos contradictorios.</p></div>
   {webCards.length===0?<p className={styles.hint}>Aún no hay fichas de productos guardadas en Web Studio.</p>:
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
     </div>;})}</div>}
   <div className={styles.heading}><h2>{editing?"Editar producto":"Añadir producto"}</h2>
    {editing?<button type="button" onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar edición</button>:null}</div>
   <div className={styles.form}>
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
    <button type="button" disabled={busy||!form.name.trim()||!form.sku.trim()||!form.price.trim()}
      className={styles.primary} onClick={()=>void save()}><Plus size={18}/> {editing?"Guardar cambios":"Guardar producto"}</button>
   </div>
   <div className={styles.heading}><h2>Mis productos</h2></div>
   {items.length===0?<div className={styles.empty}><Package size={26}/><p>Tu catálogo está vacío. No añadiré productos o precios inventados.</p></div>:
    <div className={styles.items}>{items.map(item=><div key={item.id} className={styles.item}>
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
   <div className={styles.heading}><h2>Cotización de prueba</h2></div>
   <div className={styles.form}>
    <label>Agente que preparará el pedido<select value={agentId} onChange={e=>setAgentId(e.target.value)}>
      <option value="">Selecciona agente</option>{agents.filter(a=>a.revision>0).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
    <label>Producto aprobado<select value={testItemId} onChange={e=>setTestItemId(e.target.value)}>
     <option value="">Selecciona producto</option>{approved.map(p=><option key={p.id} value={p.id}>{p.name} · {formatUsd(p.price_cents)}</option>)}
    </select></label>
    <label>Cantidad<input min={1} max={50} type="number" value={qty} onChange={e=>setQty(Number(e.target.value)||1)}/></label>
    <button type="button" className={styles.primary} disabled={busy||!inventoryReady||!agentId||!testItemId}
      onClick={()=>void quote()}><ClipboardList size={17}/> Preparar cotización de prueba</button>
    <p className={styles.hint}>El total se calcula en Supabase usando el precio aprobado, no desde la interfaz ni el modelo de IA.</p>
   </div>
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
   <div className={styles.warning}><ShieldCheck size={17}/><p>No se ofrece un enlace de pago hasta conectar y verificar una cuenta del negocio distinta de la facturación de VMV.</p></div>
  </>:<>
   <h2 className={styles.ordersTitle}>Solicitudes de atención humana</h2>
   <p className={styles.hint}>Registro de llamadas que pidieron una persona. No contiene grabaciones ni confirma que se realizó una transferencia.</p>
   {human.length===0?<div className={styles.empty}><UserRoundCheck size={26}/><p>No hay solicitudes pendientes del agente telefónico.</p></div>:
    <div className={styles.items}>{human.map(req=><article className={styles.item} key={req.id}>
      <div><strong>Solicitud del agente</strong><small>{new Date(req.created_at).toLocaleString("es-US")} · {req.status==="new"?"Nueva":req.status==="reviewed"?"Revisada":"Cerrada"}</small>
       <small>{req.summary}</small></div>
      {req.status==="new"?<button type="button" disabled={busy} onClick={()=>void markHuman(req,"reviewed")}>Revisar</button>:req.status==="reviewed"?
       <button type="button" disabled={busy} onClick={()=>void markHuman(req,"closed")}>Cerrar</button>:null}
     </article>)}</div>}
  </>}
 </div>;
}
