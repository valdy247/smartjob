import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Alert,Pressable,ScrollView,Share,StyleSheet,
 Switch,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {Session} from "@supabase/supabase-js";
import type {Agent} from "./aiAgentsData";
import {createTestCheckout,getCatalog,getLines,getMerchant,getOrderEvents,getOrders,
 newTestQuote,saveCatalog,saveSalesPermissions,simulateBuyerAcceptance,usd,
 type CatalogDraft,type CatalogItem,type MerchantStatus,type OrderEvent,
 type OrderLine,type SaleOrder,type SalesPermissions} from "./aiAgentsCommerceData";

const C={
 ink:"#29223D",purple:"#8858E6",deep:"#643BBA",paper:"#FFFFFF",bg:"#FAF8FE",
 line:"#E9E1F5",muted:"#827992",mint:"#E0F7EB",blue:"#E2F1FF",
 pink:"#FBE4F0",yellow:"#FFF1C8",red:"#B24C6E",green:"#27775B"
};
type Tab="setup"|"catalog"|"orders";
type IconName=React.ComponentProps<typeof Ionicons>["name"];
type Props={
 session:Session;agents:Agent[];phoneAgentId:string|null;onBack:()=>void;
 onAgentUpdated:(agent:Agent)=>void;
};
const blank:CatalogDraft={
 name:"",sku:"",description:"",price:"",stock_mode:"manual",available_qty:"",
 approved:false,active:true
};
const defaultPerms:SalesPermissions={
 channel:"Chat",cap_sales:false,perm_prepare_order:false,
 perm_confirm_order:false,perm_payment_link:false
};
const labelFor=(s:string)=>{
 const labels:Record<string,string>={
  awaiting_confirmation:"Esperando aceptación",awaiting_payment:"Aceptado · pago pendiente",
  requires_review:"Revisión humana",paid:"Pago verificado",cancelled:"Cancelado",
  expired:"Reserva vencida",not_started:"Sin iniciar",pending:"Pago pendiente",
  failed:"Pago fallido",refunded:"Reembolsado"
 };
 return labels[s]||s;
};
function SmallButton({label,icon,onPress,disabled=false,solid=false}:{
 label:string;icon?:IconName;onPress:()=>void;disabled?:boolean;solid?:boolean
}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label}
  disabled={disabled} onPress={onPress}
  style={[styles.btn,solid?styles.btnSolid:styles.btnLine,disabled?{opacity:0.45}:null]}>
  {icon?<Ionicons name={icon} size={16} color={solid?"#FFF":C.deep}/>:null}
  <Text style={[styles.btnText,solid?{color:"#FFF"}:null]}>{label}</Text>
 </Pressable>;
}
function RowField({label,value,onChange,placeholder="",keyboardType="default",multiline=false}:{
 label:string;value:string;onChange:(v:string)=>void;placeholder?:string;
 keyboardType?:"default"|"decimal-pad"|"number-pad";multiline?:boolean;
}){
 return <View style={styles.field}>
  <Text style={styles.label}>{label}</Text>
  <TextInput value={value} onChangeText={onChange} placeholder={placeholder}
   placeholderTextColor="#AAA0BB" keyboardType={keyboardType} multiline={multiline}
   maxLength={multiline?700:120} style={[styles.input,multiline?{height:85,textAlignVertical:"top"}:null]}/>
 </View>;
}
function Pick({text,selected,onPress}:{text:string;selected:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  style={[styles.pill,selected?styles.pillActive:null]}>
  <Text style={[styles.pillLabel,selected?{color:C.deep}:null]}>{text}</Text>
 </Pressable>;
}
function Toggle({title,detail,value,onChange,disabled=false}:{
 title:string;detail:string;value:boolean;onChange:(v:boolean)=>void;disabled?:boolean
}){
 return <View style={styles.toggle}>
  <View style={{flex:1,gap:3}}><Text style={styles.toggleTitle}>{title}</Text>
   <Text style={styles.detail}>{detail}</Text></View>
  <Switch value={value} onValueChange={onChange} disabled={disabled}
   trackColor={{false:"#DED5E8",true:"#C3A6F5"}} thumbColor={value?C.purple:"#F8F6FA"}/>
 </View>;
}
function Title({children,caption}:{children:React.ReactNode;caption?:string}){
 return <View style={{gap:5,marginBottom:12}}>
  <Text style={styles.sectionTitle}>{children}</Text>
  {caption?<Text style={styles.detail}>{caption}</Text>:null}
 </View>;
}
const moneyNote="El precio se calcula en el servidor. No permitimos que la IA lo modifique.";
export function AIAgentsCommerceStudio({session,agents,phoneAgentId,onBack,onAgentUpdated}:Props){
 const [tab,setTab]=useState<Tab>("setup");
 const [agentId,setAgentId]=useState(phoneAgentId||agents[0]?.id||"");
 const [perms,setPerms]=useState<SalesPermissions>(defaultPerms);
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [orders,setOrders]=useState<SaleOrder[]>([]);
 const [merchant,setMerchant]=useState<MerchantStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const [showForm,setShowForm]=useState(false);
 const [editing,setEditing]=useState<CatalogItem|null>(null);
 const [draft,setDraft]=useState<CatalogDraft>(blank);
 const [productId,setProductId]=useState("");
 const [quantity,setQuantity]=useState("1");
 const [expandedOrder,setExpandedOrder]=useState<string|null>(null);
 const [lines,setLines]=useState<OrderLine[]>([]);
 const [events,setEvents]=useState<OrderEvent[]>([]);
 const agent=agents.find(a=>a.id===agentId)||null;
 const businessId=agent?.business_id||"";
 const permission=agent?.configuration||{};

 useEffect(()=>{
  if(!agent)return;
  const current=agent.configuration||{};
  setPerms({
   channel:current.channel==="Teléfono"||current.channel==="Teléfono y chat"?
    current.channel:"Chat",
   cap_sales:current.cap_sales==="Sí",
   perm_prepare_order:current.perm_prepare_order==="Sí",
   perm_confirm_order:current.perm_confirm_order==="Sí",
   perm_payment_link:current.perm_payment_link==="Sí"
  });
 },[agent?.id,agent?.revision]);

 const refresh=useCallback(async()=>{
  if(!businessId){setItems([]);setOrders([]);setMerchant(null);setLoading(false);return;}
  setLoading(true);
  try{
   const [catalog,history,merchantStatus]=await Promise.all([
    getCatalog(session,businessId),getOrders(session,businessId),getMerchant(session,businessId)
   ]);
   setItems(catalog);setOrders(history);setMerchant(merchantStatus);
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo consultar tu negocio.");}
  finally{setLoading(false);}
 },[businessId,session.user.id]);
 useEffect(()=>{void refresh();},[refresh]);

 const patch=<K extends keyof CatalogDraft>(key:K,value:CatalogDraft[K])=>
  setDraft(old=>({...old,[key]:value}));
 const commitPerms=async()=>{
  if(!agent||busy)return;
  setBusy(true);
  try{
   const updated=await saveSalesPermissions(session,agent,perms);
   onAgentUpdated(updated);
   setNotice("Permisos guardados para la próxima llamada. No alteran una conversación ya iniciada.");
  }catch(e){Alert.alert("No se pudo guardar",e instanceof Error?e.message:"Inténtalo otra vez.");}
  finally{setBusy(false);}
 };
 const commitItem=async()=>{
  if(!agent||busy)return;
  setBusy(true);
  try{
   await saveCatalog(session,agent.business_id,draft,editing);
   await refresh();
   setDraft(blank);setEditing(null);setShowForm(false);
   setNotice("Producto guardado en tu catálogo. Solo se podrá cotizar por teléfono si está aprobado y tiene disponibilidad verificada.");
  }catch(e){Alert.alert("Producto no guardado",e instanceof Error?e.message:"Verifica los datos.");}
  finally{setBusy(false);}
 };
 const beginEdit=(item:CatalogItem)=>{
  setEditing(item);
  setDraft({name:item.name,sku:item.sku,description:item.description,
   price:(item.price_cents/100).toFixed(2),stock_mode:item.stock_mode,
   available_qty:item.available_qty==null?"":String(item.available_qty),
   approved:item.approved,active:item.active});
  setShowForm(true);
 };
 const quote=async()=>{
  const item=items.find(x=>x.id===productId);
  const qty=Number(quantity);
  if(!agent||!item)return;
  setBusy(true);
  try{
   await newTestQuote(session,agent,item,qty);
   await refresh();setTab("orders");
   setNotice("Cotización de PRUEBA creada. No hay cobro ni aceptación real del comprador.");
  }catch(e){Alert.alert("Cotización",e instanceof Error?e.message:"No se pudo crear.");}
  finally{setBusy(false);}
 };
 const accept=async(order:SaleOrder)=>{
  if(order.call_sid){Alert.alert("Pedido telefónico","La aceptación debe hacerla el comprador durante la llamada.");return;}
  Alert.alert("Solo simulación","Esta acción simula la aceptación del comprador en un pedido de prueba, no una venta ni un cobro.",[
   {text:"Cancelar",style:"cancel"},
   {text:"Simular",onPress:()=>{void(async()=>{
    setBusy(true);
    try{await simulateBuyerAcceptance(session,order);await refresh();
      setNotice("Aceptación simulada. Pago todavía PENDIENTE.");}
    catch(e){Alert.alert("Sin confirmar",e instanceof Error?e.message:"No se pudo actualizar.");}
    finally{setBusy(false);}
   })();}}
  ]);
 };
 const checkout=async(order:SaleOrder)=>{
  if(!merchant?.connected||!merchant.testOnly){setNotice("No existe un proveedor comercial de PRUEBA conectado y verificado.");return;}
  setBusy(true);
  try{
   const url=await createTestCheckout(session,order);
   Alert.alert("Enlace de prueba listo","El pedido sigue pendiente hasta que Stripe confirme el pago.");
   await Share.share({message:"ENLACE DE PAGO DE PRUEBA · NO ES UN COBRO REAL\n"+url});
   await refresh();
  }catch(e){Alert.alert("Checkout no disponible",e instanceof Error?e.message:"No se pudo abrir.");}
  finally{setBusy(false);}
 };
 const inspectOrder=async(order:SaleOrder)=>{
  if(expandedOrder===order.id){setExpandedOrder(null);return;}
  setExpandedOrder(order.id);setLines([]);setEvents([]);
  try{
   const [details,history]=await Promise.all([
    getLines(session,order.id),getOrderEvents(session,order.id)
   ]);
   setLines(details);setEvents(history);
  }catch(e){Alert.alert("Pedido",e instanceof Error?e.message:"No se pudo cargar el detalle.");}
 };
 const approved=items.filter(item=>item.approved&&item.active&&item.stock_mode!=="manual"&&
  item.variants.length===0&&item.extras.length===0);
 const selectedForPhone=phoneAgentId===agentId;
 const phoneReady=perms.channel!=="Chat"&&perms.cap_sales&&perms.perm_prepare_order&&
  (permission.call_disclosure==="Sí"||permission.call_consent==="Sí");

 return <View style={styles.root}>
  <View style={styles.hero}>
   <Pressable accessibilityRole="button" accessibilityLabel="Volver a AI Agents" onPress={onBack}
    style={styles.back}><Ionicons name="arrow-back" size={20} color={C.deep}/></Pressable>
   <View style={{flex:1}}><Text style={styles.eyebrow}>AI AGENTS · COMERCIO</Text>
    <Text style={styles.title}>Ventas por teléfono</Text>
    <Text style={styles.heroCaption}>Prepara tu agente para vender sin inventar precios.</Text></View>
   <Ionicons name="bag-handle" size={27} color="#E9D9FF"/>
  </View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
   style={styles.tabScroller} contentContainerStyle={styles.tabs}>
   {([["setup","1 · Agente","settings-outline"],["catalog","2 · Catálogo","cube-outline"],
     ["orders","3 · Pedidos","receipt-outline"]] as const).map(([value,label,icon])=>
    <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}}
     onPress={()=>setTab(value)} style={[styles.tab,tab===value?styles.tabOn:null]}>
     <Ionicons name={icon} size={16} color={tab===value?C.deep:C.muted}/>
     <Text style={[styles.tabText,tab===value?{color:C.deep}:null]}>{label}</Text>
    </Pressable>)}
  </ScrollView>

  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
   <View style={[styles.notice,{backgroundColor:C.yellow}]}>
    <Ionicons name="flask-outline" size={18} color="#987120"/>
    <Text style={styles.noticeText}>MODO PRUEBA. Los pedidos de este piloto no generan cobros reales. Una venta solo estará pagada tras validación del proveedor.</Text>
   </View>
   {notice?<View style={styles.notice}><Ionicons name="information-circle-outline" size={17} color={C.deep}/>
    <Text style={styles.noticeText}>{notice}</Text></View>:null}
   {loading?<ActivityIndicator size="small" color={C.purple}/>:null}

   {tab==="setup"?<>
    <Title caption="Elige el agente que recibirá permisos de venta. Puedes hacerlo sin crear otro.">Agente para vender</Title>
    {!agents.length?<View style={styles.empty}><Ionicons name="alert-circle-outline" size={24} color={C.purple}/>
     <Text style={styles.detail}>Primero crea y guarda un agente en AI Agents.</Text></View>:
     <View style={styles.agentList}>{agents.map(a=><Pressable key={a.id} accessibilityRole="button"
      accessibilityState={{selected:agentId===a.id}} onPress={()=>setAgentId(a.id)}
      style={[styles.agentChoice,agentId===a.id?styles.agentChoiceOn:null]}>
      <Ionicons name={a.kind==="calls"?"call-outline":"sparkles-outline"} size={20}
       color={agentId===a.id?C.deep:C.muted}/>
      <View style={{flex:1}}><Text style={styles.agentName}>{a.name}</Text>
       <Text style={styles.detail}>{a.kind==="calls"?"Agente de llamadas":"Agente de "+a.kind}
        {phoneAgentId===a.id?" · ELEGIDO PARA LA LÍNEA":""}</Text></View>
      <Ionicons name={agentId===a.id?"checkmark-circle":"ellipse-outline"}
       size={20} color={agentId===a.id?C.purple:C.muted}/>
     </Pressable>)}</View>}
    {agent?<View style={styles.panel}>
     <View style={styles.panelHead}><Ionicons name="call-outline" size={20} color={C.purple}/>
      <Text style={styles.panelTitle}>Capacidades del agente</Text></View>
     <Text style={styles.detail}>Canal de atención</Text>
     <View style={styles.choiceRow}>{(["Chat","Teléfono","Teléfono y chat"] as const).map(x=>
      <Pick key={x} text={x} selected={perms.channel===x}
       onPress={()=>setPerms(prev=>({...prev,channel:x}))}/>)}</View>
     <Toggle title="Vender a clientes" detail="Consultar productos aprobados y explicar precios."
      value={perms.cap_sales} onChange={v=>setPerms(p=>({...p,
       cap_sales:v,perm_prepare_order:v?p.perm_prepare_order:false,
       perm_confirm_order:v?p.perm_confirm_order:false,perm_payment_link:v?p.perm_payment_link:false
      }))}/>
     <Toggle title="Preparar pedidos" detail="Crear cotizaciones en Supabase con precios e inventario verificados."
      value={perms.perm_prepare_order} disabled={!perms.cap_sales}
      onChange={v=>setPerms(p=>({...p,perm_prepare_order:v,
       perm_confirm_order:v?p.perm_confirm_order:false,perm_payment_link:v?p.perm_payment_link:false}))}/>
     <Toggle title="Confirmar tras aceptación del comprador"
      detail="Solo pedidos de PRUEBA que el cliente acepte expresamente."
      value={perms.perm_confirm_order} disabled={!perms.cap_sales||!perms.perm_prepare_order}
      onChange={v=>setPerms(p=>({...p,perm_confirm_order:v}))}/>
     <Toggle title="Enlace de cobro verificado" detail="No funciona sin una cuenta de cobros comercial conectada. Nunca pedir tarjetas por teléfono."
      value={perms.perm_payment_link} disabled={!perms.cap_sales||!perms.perm_prepare_order}
      onChange={v=>setPerms(p=>({...p,perm_payment_link:v}))}/>
     {perms.channel!=="Chat"&&permission.call_disclosure!=="Sí"&&permission.call_consent!=="Sí"?
      <Text style={styles.warning}>Falta autorizar en el asistente la presentación como IA antes de habilitar ventas telefónicas.</Text>:null}
     <SmallButton icon="save-outline" label={busy?"Guardando…":"Guardar permisos para la siguiente llamada"}
      solid disabled={busy} onPress={()=>void commitPerms()}/>
    </View>:null}
    <View style={[styles.notice,{backgroundColor:phoneReady?C.mint:C.blue}]}>
     <Ionicons name={phoneReady?"checkmark-circle-outline":"shield-outline"}
      size={19} color={phoneReady?C.green:C.deep}/>
     <Text style={styles.noticeText}>{selectedForPhone?
      "Este agente está seleccionado para el número piloto. Los permisos nuevos entran en vigor en la siguiente llamada.":
      "Este no es el agente seleccionado para tu teléfono. Elige el agente desde la pantalla principal de AI Agents."}</Text>
    </View>
    <SmallButton label="Continuar al catálogo" icon="arrow-forward-outline" solid
     onPress={()=>setTab("catalog")}/>
   </>:null}

   {tab==="catalog"?<>
    <Title caption="Añade solo productos reales, precios y disponibilidad aprobados por el negocio.">Catálogo del negocio</Title>
    <View style={[styles.notice,{backgroundColor:C.mint}]}>
     <Ionicons name="shield-checkmark-outline" size={19} color={C.green}/>
     <Text style={styles.noticeText}>{moneyNote} Los productos con inventario manual se derivan a una persona.</Text>
    </View>
    <SmallButton label={showForm?"Cerrar formulario":"Añadir producto"} icon={showForm?"close-outline":"add-outline"}
     solid onPress={()=>{setShowForm(v=>!v);setEditing(null);setDraft(blank);}}/>
    {showForm?<View style={styles.panel}>
     <Text style={styles.panelTitle}>{editing?"Editar producto":"Producto nuevo"}</Text>
     <RowField label="Nombre aprobado" value={draft.name} onChange={v=>patch("name",v)}
      placeholder="Nombre del producto"/>
     <RowField label="Código único del producto (SKU)" value={draft.sku}
      onChange={v=>patch("sku",v)} placeholder="Ej. PRODUCTO-01"/>
     <RowField label="Precio confirmado (USD)" value={draft.price}
      onChange={v=>patch("price",v)} keyboardType="decimal-pad" placeholder="0.00"/>
     <RowField label="Descripción (opcional)" value={draft.description}
      onChange={v=>patch("description",v)} multiline placeholder="Presentación, detalles y condiciones"/>
     <Text style={styles.label}>¿Cómo se verifica la disponibilidad?</Text>
     <View style={styles.choiceRow}>
      <Pick text="Consultar al dueño" selected={draft.stock_mode==="manual"}
       onPress={()=>patch("stock_mode","manual")}/>
      <Pick text="Unidades verificadas" selected={draft.stock_mode==="tracked"}
       onPress={()=>patch("stock_mode","tracked")}/>
      <Pick text="Sin límite" selected={draft.stock_mode==="unlimited"}
       onPress={()=>patch("stock_mode","unlimited")}/>
     </View>
     {draft.stock_mode==="tracked"?<RowField label="Unidades disponibles verificadas"
      value={draft.available_qty} onChange={v=>patch("available_qty",v)}
      keyboardType="number-pad" placeholder="0"/>:null}
     {draft.stock_mode==="unlimited"?<Text style={styles.warning}>
      Usa «Sin límite» solamente para servicios con capacidad ilimitada realmente autorizada. Para productos físicos, selecciona unidades verificadas.</Text>:null}
     <Toggle title="Aprobar producto y precio" detail="Confirma que la información es vigente y autorizada."
      value={draft.approved} onChange={v=>patch("approved",v)}/>
     <Toggle title="Disponible en el catálogo" detail="Puedes desactivarlo sin borrar el historial."
      value={draft.active} onChange={v=>patch("active",v)}/>
     <SmallButton label={busy?"Guardando…":"Guardar producto"} icon="save-outline"
      solid disabled={busy||!draft.name.trim()||!draft.sku.trim()||!draft.price.trim()}
      onPress={()=>void commitItem()}/>
    </View>:null}
    {items.length===0?<View style={styles.empty}>
     <Ionicons name="cube-outline" size={30} color={C.purple}/>
     <Text style={styles.emptyTitle}>Todavía no hay productos</Text>
     <Text style={[styles.detail,{textAlign:"center"}]}>Cuando apruebes un producto, el agente podrá consultarlo en una nueva llamada.</Text>
    </View>:items.map(item=><View key={item.id} style={styles.product}>
     <View style={[styles.square,{backgroundColor:item.approved?C.mint:C.pink}]}>
      <Ionicons name="cube-outline" size={21} color={item.approved?C.green:C.red}/></View>
     <View style={{flex:1,gap:4}}>
      <Text style={styles.productName}>{item.name}</Text>
      <Text style={styles.detail}>{item.sku} · {usd(item.price_cents)}</Text>
      <Text style={styles.detail}>{item.approved?"Aprobado":"Sin aprobar"} · {
       !item.active?"Inactivo":item.stock_mode==="tracked"?item.available_qty+" disponibles":
        item.stock_mode==="manual"?"Confirmación manual":"Sin límite autorizado"}</Text>
     </View>
     <SmallButton icon="create-outline" label="Editar" onPress={()=>beginEdit(item)}/>
    </View>)}
    <Title caption="También puedes preparar un pedido ficticio desde el iPhone para revisar los totales antes de llamar.">Prueba de cálculo</Title>
    <View style={styles.panel}>
     <Text style={styles.detail}>Producto disponible para cotización de prueba</Text>
     {approved.length===0?<Text style={styles.warning}>Necesitas un producto aprobado con unidades verificadas para continuar.</Text>:
      <View style={styles.choiceRow}>{approved.map(item=>
       <Pick key={item.id} text={item.name+" · "+usd(item.price_cents)}
        selected={productId===item.id} onPress={()=>setProductId(item.id)}/>)}</View>}
     <RowField label="Cantidad (1 a 50)" value={quantity} keyboardType="number-pad"
      onChange={setQuantity} placeholder="1"/>
     <SmallButton label="Preparar pedido de PRUEBA" icon="flask-outline"
      solid disabled={!agent||!productId||busy} onPress={()=>void quote()}/>
     <Text style={styles.detail}>Solo se crean cotizaciones. No se descuenta definitivamente el inventario ni se cobra al comprador.</Text>
    </View>
    <SmallButton label="Ver pedidos registrados" icon="receipt-outline"
     onPress={()=>{void refresh();setTab("orders");}}/>
   </>:null}

   {tab==="orders"?<>
    <Title caption="Aquí aparecen también los pedidos creados durante una llamada telefónica real al agente.">Pedidos y pagos</Title>
    <View style={[styles.notice,{backgroundColor:merchant?.connected&&merchant.testOnly?C.mint:C.pink}]}>
     <Ionicons name="card-outline" size={20} color={merchant?.connected?C.green:C.red}/>
     <Text style={styles.noticeText}>{merchant?.connected&&merchant.testOnly?
      "Checkout comercial de prueba conectado. El pago se valida en el servidor.":
      "No hay una cuenta de cobros del negocio verificada para esta prueba. Los pedidos permanecen SIN PAGAR."}</Text>
    </View>
    <SmallButton label="Actualizar pedidos después de la llamada" icon="refresh-outline"
     onPress={()=>void refresh()} disabled={busy}/>
    {orders.length===0?<View style={styles.empty}>
     <Ionicons name="receipt-outline" size={30} color={C.purple}/>
     <Text style={styles.emptyTitle}>Sin pedidos todavía</Text>
     <Text style={[styles.detail,{textAlign:"center"}]}>
      Configura un producto y llama al agente. Pide una unidad, cambia la cantidad y acepta el total de prueba.</Text>
    </View>:orders.map(order=><View key={order.id} style={styles.order}>
     <Pressable accessibilityRole="button" onPress={()=>void inspectOrder(order)}
      style={styles.orderTop}>
      <View style={[styles.square,{backgroundColor:order.call_sid?C.blue:C.yellow}]}>
       <Ionicons name={order.call_sid?"call-outline":"flask-outline"} size={22}
        color={order.call_sid?"#3673AB":"#A17B24"}/></View>
      <View style={{flex:1,gap:3}}><Text style={styles.productName}>Pedido #{order.order_no}</Text>
       <Text style={styles.detail}>{order.call_sid?"Origen: llamada":"Origen: simulación"} · {
        order.mode==="test"?"MODO PRUEBA":"MODO REAL"}</Text>
       <Text style={styles.detail}>{new Date(order.created_at).toLocaleString()}</Text>
      </View>
      <View style={{alignItems:"flex-end",gap:4}}>
       <Text style={styles.price}>{usd(order.total_cents)}</Text>
       <Ionicons name={expandedOrder===order.id?"chevron-up":"chevron-down"}
        color={C.purple} size={17}/></View>
     </Pressable>
     <View style={styles.orderStatus}><Text style={styles.orderState}>{labelFor(order.status)}</Text>
      <Text style={[styles.paymentTag,order.payment_status==="paid"?{color:C.green}:null]}>
       {order.payment_status==="paid"?"PAGO VERIFICADO":labelFor(order.payment_status).toUpperCase()+" · NO PAGADO"}</Text></View>
     {expandedOrder===order.id?<View style={styles.orderDetails}>
      <Text style={styles.label}>Detalle verificable</Text>
      {lines.map((l,i)=><Text key={i} style={styles.detail}>
       {l.qty} × {l.name} ({l.sku}): {usd(l.subtotal_cents)}</Text>)}
      {events.map(e=><Text key={e.id} style={styles.audit}>
       {new Date(e.created_at).toLocaleString()} · {e.event_type}</Text>)}
      {order.status==="awaiting_confirmation"&&!order.call_sid?
       <SmallButton label="Simular aceptación del comprador" icon="checkmark-circle-outline"
        disabled={busy} onPress={()=>void accept(order)}/>:null}
      {order.status==="awaiting_payment"&&order.mode==="test"&&
        merchant?.connected&&merchant.testOnly?
       <SmallButton label="Crear enlace de pago de PRUEBA" icon="card-outline"
        disabled={busy} solid onPress={()=>void checkout(order)}/>:null}
      {order.call_sid&&order.status==="awaiting_confirmation"?
       <Text style={styles.warning}>El comprador debe confirmar el pedido durante la llamada; no lo marques como aceptado desde la app.</Text>:null}
     </View>:null}
    </View>)}
    <View style={[styles.notice,{backgroundColor:C.mint}]}>
     <Ionicons name="shield-checkmark-outline" color={C.green} size={20}/>
     <Text style={styles.noticeText}>La confirmación de pago nunca depende de lo que diga el cliente. Requiere la verificación del proveedor y deja evidencia en Supabase.</Text>
    </View>
   </>:null}

   <View style={styles.nextSteps}><Ionicons name="call-outline" size={21} color={C.deep}/>
    <View style={{flex:1,gap:4}}><Text style={styles.panelTitle}>Ensayo de venta por teléfono</Text>
     <Text style={styles.detail}>1. Guarda permisos de venta en el agente elegido para la línea.</Text>
     <Text style={styles.detail}>2. Aprueba un producto con precio y existencias confirmadas.</Text>
     <Text style={styles.detail}>3. Desde otro teléfono, marca 2. Pide el producto, corrige la cantidad y acepta el total.</Text>
     <Text style={styles.detail}>4. Actualiza Pedidos. La venta seguirá pendiente hasta verificar un pago de prueba.</Text>
    </View>
   </View>
  </ScrollView>
 </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg},
 hero:{paddingHorizontal:16,paddingVertical:16,backgroundColor:C.purple,
  flexDirection:"row",alignItems:"center",gap:10},
 back:{width:37,height:37,borderRadius:13,backgroundColor:"#F1E9FF",
  alignItems:"center",justifyContent:"center"},
 eyebrow:{fontSize:9,color:"#EDDEFF",fontWeight:"900",letterSpacing:1.3},
 title:{fontSize:21,color:"#FFF",fontWeight:"900",letterSpacing:-0.7,marginTop:4},
 heroCaption:{fontSize:10,color:"#F5EAFE",marginTop:5},
 tabScroller:{flexGrow:0,backgroundColor:C.paper,borderBottomWidth:1,borderBottomColor:C.line},
 tabs:{padding:9,gap:7,alignItems:"center"},
 tab:{flexDirection:"row",alignItems:"center",gap:6,borderRadius:12,
  paddingHorizontal:12,paddingVertical:10,backgroundColor:"#F7F3FD"},
 tabOn:{backgroundColor:"#EDE3FF",borderWidth:1,borderColor:"#CCB0FB"},
 tabText:{fontSize:11,fontWeight:"800",color:C.muted},
 scroll:{padding:16,paddingBottom:80,gap:14},
 notice:{flexDirection:"row",alignItems:"flex-start",gap:10,
  padding:12,borderRadius:15,backgroundColor:"#F0E9FF"},
 noticeText:{fontSize:11,color:"#544365",lineHeight:17,flex:1,fontWeight:"600"},
 sectionTitle:{fontSize:19,fontWeight:"900",color:C.ink,letterSpacing:-0.4},
 detail:{fontSize:11,lineHeight:17,color:C.muted},
 warning:{color:"#956041",fontSize:11,lineHeight:17},
 panel:{backgroundColor:C.paper,padding:14,borderRadius:18,borderWidth:1,
  borderColor:C.line,gap:13},
 panelHead:{flexDirection:"row",alignItems:"center",gap:8},
 panelTitle:{fontSize:14,fontWeight:"900",color:C.ink},
 agentList:{gap:9},
 agentChoice:{padding:12,backgroundColor:C.paper,borderRadius:15,
  borderWidth:1,borderColor:C.line,flexDirection:"row",gap:10,alignItems:"center"},
 agentChoiceOn:{borderColor:"#B18AEF",backgroundColor:"#F7F1FF"},
 agentName:{fontSize:13,fontWeight:"900",color:C.ink},
 choiceRow:{flexDirection:"row",flexWrap:"wrap",gap:7},
 pill:{borderRadius:14,borderWidth:1,borderColor:C.line,
  backgroundColor:"#FCFAFE",paddingHorizontal:11,paddingVertical:9},
 pillActive:{backgroundColor:"#EEE4FF",borderColor:"#BD9AF2"},
 pillLabel:{fontSize:11,fontWeight:"800",color:C.muted},
 toggle:{flexDirection:"row",alignItems:"center",gap:10,
  paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#F1EBF7"},
 toggleTitle:{fontSize:12,fontWeight:"800",color:C.ink},
 btn:{paddingHorizontal:12,paddingVertical:11,borderRadius:12,flexDirection:"row",
  justifyContent:"center",alignItems:"center",gap:6},
 btnSolid:{backgroundColor:C.purple},
 btnLine:{borderWidth:1,borderColor:C.line,backgroundColor:C.paper},
 btnText:{fontWeight:"900",color:C.deep,fontSize:11,textAlign:"center"},
 field:{gap:6},
 label:{fontSize:11,fontWeight:"800",color:"#493959"},
 input:{padding:12,borderWidth:1,borderColor:"#E4D9F1",borderRadius:12,
  backgroundColor:"#FFF",color:C.ink,fontSize:13,minHeight:44},
 empty:{gap:8,borderRadius:18,padding:24,backgroundColor:C.paper,
  borderWidth:1,borderColor:C.line,alignItems:"center"},
 emptyTitle:{fontSize:14,fontWeight:"900",color:C.ink},
 product:{flexDirection:"row",gap:9,padding:12,borderRadius:16,backgroundColor:C.paper,
  borderWidth:1,borderColor:C.line,alignItems:"center"},
 productName:{fontSize:13,fontWeight:"900",color:C.ink},
 square:{width:44,height:44,borderRadius:13,alignItems:"center",justifyContent:"center"},
 price:{fontSize:15,fontWeight:"900",color:C.deep},
 order:{backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:17,padding:12,gap:9},
 orderTop:{flexDirection:"row",alignItems:"center",gap:9},
 orderStatus:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:7},
 orderState:{fontSize:10,fontWeight:"900",color:C.deep},
 paymentTag:{fontSize:9,fontWeight:"900",color:C.red},
 orderDetails:{gap:10,paddingTop:8,borderTopWidth:1,borderTopColor:C.line},
 audit:{fontSize:9,color:C.muted},
 nextSteps:{backgroundColor:"#EFE7FF",borderRadius:17,padding:15,
  flexDirection:"row",alignItems:"flex-start",gap:11}
});
