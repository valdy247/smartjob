import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
import type {Agent} from "./aiAgentsData";

export type StockMode="manual"|"tracked"|"unlimited";
export type CatalogItem={
 id:string;owner_id:string;business_id:string;
 sku:string;name:string;description:string;price_cents:number;currency:"usd";
 stock_mode:StockMode;available_qty:number|null;approved:boolean;active:boolean;
 updated_at:string;variants:unknown[];extras:unknown[];
};
export type CatalogDraft={
 name:string;sku:string;description:string;price:string;stock_mode:StockMode;
 available_qty:string;approved:boolean;active:boolean;
};
export type SalesPermissions={
 channel:"Chat"|"Teléfono"|"Teléfono y chat";
 cap_sales:boolean;perm_prepare_order:boolean;perm_confirm_order:boolean;
 perm_payment_link:boolean;
};
export type SaleOrder={
 id:string;order_no:number;business_id:string;agent_id:string;
 call_sid:string|null;mode:"test"|"live";status:string;payment_status:string;
 total_cents:number;currency:string;fulfillment:string;created_at:string;
};
export type OrderLine={order_id:string;sku:string;name:string;qty:number;unit_cents:number;subtotal_cents:number};
export type OrderEvent={id:number;order_id:string;event_type:string;created_at:string};
export type MerchantStatus={provider:string;connected:boolean;testOnly:boolean};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function client(){
 if(!supabase)throw new Error("Supabase no está disponible.");
 return supabase;
}
export const usd=(cents:number)=>"$"+(cents/100).toFixed(2);
export function parsePrice(raw:string):number|null{
 const value=raw.trim();
 if(!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,decimal=""]=value.split(".");
 const cents=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>=1&&cents<=10000000?cents:null;
}
export async function getCatalog(session:Session,businessId:string):Promise<CatalogItem[]>{
 const {data,error}=await client().from("vmv_ai_catalog_items").select("*")
  .eq("owner_id",session.user.id).eq("business_id",businessId)
  .order("name",{ascending:true}).limit(100);
 if(error)throw new Error("No se pudo cargar el catálogo del negocio.");
 return (data||[]) as CatalogItem[];
}
export async function saveCatalog(session:Session,businessId:string,
 input:CatalogDraft,previous?:CatalogItem|null):Promise<void>{
 if(!uuid.test(businessId))throw new Error("Negocio inválido.");
 const name=input.name.trim().slice(0,120),sku=input.sku.trim().toUpperCase().slice(0,45);
 const price_cents=parsePrice(input.price);
 if(!name||!sku)throw new Error("Introduce un nombre y un código SKU.");
 if(price_cents===null)throw new Error("Introduce un precio válido en USD, por ejemplo 25.00.");
 const stock_mode=input.stock_mode;
 if(!["manual","tracked","unlimited"].includes(stock_mode))throw new Error("Tipo de inventario no válido.");
 const qty=stock_mode==="tracked"?Number(input.available_qty):null;
 if(stock_mode==="tracked"&&(!/^\d{1,7}$/.test(input.available_qty)||!Number.isSafeInteger(qty)||qty===null||qty>1000000))
  throw new Error("Introduce existencias verificadas en números enteros.");
 const values={
  owner_id:session.user.id,business_id:businessId,name,sku,
  description:input.description.trim().slice(0,700),price_cents,currency:"usd",
  stock_mode,available_qty:qty,approved:input.approved,active:input.active,
  updated_at:new Date().toISOString()
 };
 if(previous){
  if(previous.owner_id!==session.user.id||previous.business_id!==businessId)
   throw new Error("No tienes acceso a ese producto.");
  const {data,error}=await client().from("vmv_ai_catalog_items").update(values)
   .eq("id",previous.id).eq("owner_id",session.user.id)
   .eq("business_id",businessId).eq("updated_at",previous.updated_at)
   .select("id").maybeSingle();
  if(error)throw new Error("No se pudieron guardar los cambios. Comprueba el código SKU.");
  if(!data)throw new Error("El producto cambió en otro dispositivo. Actualiza antes de editar.");
  return;
 }
 const {error}=await client().from("vmv_ai_catalog_items").insert(values);
 if(error)throw new Error("No se pudo guardar el producto. Verifica que el SKU no esté repetido.");
}
export async function getOrders(session:Session,businessId:string):Promise<SaleOrder[]>{
 const {data,error}=await client().from("vmv_ai_orders")
  .select("id,order_no,business_id,agent_id,call_sid,mode,status,payment_status,total_cents,currency,fulfillment,created_at")
  .eq("owner_id",session.user.id).eq("business_id",businessId)
  .order("created_at",{ascending:false}).limit(40);
 if(error)throw new Error("No se pudo cargar el historial de pedidos.");
 return (data||[]) as SaleOrder[];
}
export async function getLines(session:Session,orderId:string):Promise<OrderLine[]>{
 if(!uuid.test(orderId))throw new Error("Pedido inválido.");
 const {data,error}=await client().from("vmv_ai_order_lines")
  .select("order_id,sku,name,qty,unit_cents,subtotal_cents")
  .eq("owner_id",session.user.id).eq("order_id",orderId).limit(40);
 if(error)throw new Error("No se pudo consultar el detalle del pedido.");
 return (data||[]) as OrderLine[];
}
export async function getOrderEvents(session:Session,orderId:string):Promise<OrderEvent[]>{
 if(!uuid.test(orderId))throw new Error("Pedido inválido.");
 const {data,error}=await client().from("vmv_ai_order_events")
  .select("id,order_id,event_type,created_at")
  .eq("owner_id",session.user.id).eq("order_id",orderId)
  .order("created_at",{ascending:false}).limit(30);
 if(error)throw new Error("No se pudo consultar la evidencia del pedido.");
 return (data||[]) as OrderEvent[];
}
export async function getMerchant(session:Session,businessId:string):Promise<MerchantStatus>{
 const {data,error}=await client().from("vmv_ai_merchant_payments")
  .select("provider,livemode,verified_by_server,can_accept_payments")
  .eq("owner_id",session.user.id).eq("business_id",businessId).maybeSingle();
 if(error)throw new Error("No se pudo consultar la conexión comercial.");
 return {provider:data?.provider||"",connected:Boolean(data?.verified_by_server&&data?.can_accept_payments),
  testOnly:Boolean(data&&!data.livemode)};
}
export async function saveSalesPermissions(session:Session,agent:Agent,
 values:SalesPermissions):Promise<Agent>{
 if(agent.owner_id!==session.user.id||!uuid.test(agent.id)||!uuid.test(agent.business_id))
  throw new Error("Este agente no pertenece a tu cuenta.");
 if(!["Chat","Teléfono","Teléfono y chat"].includes(values.channel))throw new Error("Canal no válido.");
 if(values.perm_confirm_order&&!values.perm_prepare_order)
  throw new Error("Para confirmar pedidos primero debes permitir prepararlos.");
 if(values.perm_prepare_order&&!values.cap_sales)
  throw new Error("Primero habilita la capacidad de ventas.");
 const phone=values.channel==="Teléfono"||values.channel==="Teléfono y chat";
 const previous=agent.configuration||{};
 const configuration:Record<string,string>={
  ...previous,channel:values.channel,
  cap_sales:values.cap_sales?"Sí":"No",
  perm_prepare_order:values.perm_prepare_order?"Sí":"No",
  perm_confirm_order:values.perm_confirm_order?"Sí":"No",
  perm_payment_link:values.perm_payment_link?"Sí":"No"
 };
 if(phone&&configuration.call_disclosure!=="Sí"&&configuration.call_consent!=="Sí")
  throw new Error("Primero autoriza en el asistente el aviso de que responde una IA.");
 const {data,error}=await client().from("vmv_ai_agents")
  .update({configuration}).eq("id",agent.id)
  .eq("owner_id",session.user.id).eq("revision",agent.revision).select("*").maybeSingle();
 if(error)throw new Error("No se pudo guardar la configuración comercial.");
 if(!data)throw new Error("El agente se modificó desde otro dispositivo. Vuelve a cargarlo.");
 return data as Agent;
}
export async function newTestQuote(session:Session,agent:Agent,item:CatalogItem,qty:number):Promise<void>{
 if(agent.owner_id!==session.user.id||item.owner_id!==session.user.id||
  agent.business_id!==item.business_id||!Number.isSafeInteger(qty)||qty<1||qty>50)
  throw new Error("Selecciona un agente y un producto del mismo negocio.");
 if(!item.approved||!item.active||item.stock_mode==="manual"||
  item.variants.length>0||item.extras.length>0)
  throw new Error("Este producto todavía no admite cotizaciones automáticas.");
 const key="ios-test-"+Date.now()+"-"+Math.random().toString(36).slice(2,18);
 const {data,error}=await client().rpc("vmv_ai_owner_test_prepare_order",{
  p_agent_id:agent.id,p_item_id:item.id,p_qty:qty,p_idempotency_key:key
 });
 if(error||typeof data!=="string")
  throw new Error("No se pudo reservar la cantidad: verifica el inventario o tus permisos.");
}
export async function simulateBuyerAcceptance(session:Session,order:SaleOrder):Promise<void>{
 if(order.mode!=="test"||order.status!=="awaiting_confirmation")
  throw new Error("Solo puedes simular la aceptación de una cotización de prueba.");
 const {data,error}=await client().rpc("vmv_ai_owner_test_confirm_order",{p_order_id:order.id});
 if(error||data!==true)
  throw new Error("El pedido no pudo pasar a pago pendiente; la reserva puede haber expirado.");
}
// The connected merchant Checkout API is intentionally test-only. A business account
// must be verified on the server; VMV SaaS billing Stripe is never used.
const commerceApi=process.env.EXPO_PUBLIC_VMV_AI_API||
 "https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app";
export async function createTestCheckout(session:Session,order:SaleOrder):Promise<string>{
 if(order.mode!=="test"||order.status!=="awaiting_payment")
  throw new Error("Primero debe aceptarse el pedido de prueba.");
 const res=await fetch(commerceApi+"/api/vmv/ai-agents/commerce/checkout",{
  method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({orderId:order.id})
 });
 let payload:{error?:string;checkoutUrl?:string;test?:boolean}={};
 try{payload=await res.json();}catch{}
 if(!res.ok)throw new Error(payload.error||"La cuenta comercial del negocio no está habilitada.");
 if(payload.test!==true||!/^https:\/\/checkout[.]stripe[.]com\//.test(payload.checkoutUrl||""))
  throw new Error("No se pudo verificar el enlace de Checkout.");
 return payload.checkoutUrl!;
}
