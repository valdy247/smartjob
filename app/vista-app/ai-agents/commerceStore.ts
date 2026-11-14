import {getSupabase} from "@/lib/supabase";
import type {PersistedAgent} from "./agentStore";
export type CatalogItem={
 id:string;owner_id:string;business_id:string;sku:string;name:string;description:string;
 price_cents:number;currency:"usd";stock_mode:"manual"|"tracked"|"unlimited";
 available_qty:number|null;approved:boolean;active:boolean;updated_at:string;
 variants:unknown[];extras:unknown[];web_source_id?:string|null;
};
export type TestOrder={
 id:string;order_no:number;owner_id:string;agent_id:string;status:string;
 payment_status:string;subtotal_cents:number;total_cents:number;currency:string;mode:string;
 created_at:string;idempotency_key:string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function current(){
 const client=getSupabase();if(!client)throw Error("Servicio no disponible.");
 const {data,error}=await client.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error("Inicia sesión en VMV para gestionar tu catálogo.");
 return {db:client,owner:data.user.id};
}
export function formatUsd(value:number){
 return "$"+(value/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function parseUsd(value:string){
 const m=value.trim().match(/^(\d{1,5})(?:\.(\d{1,2}))?$/);
 if(!m)return null;
 const cents=Number(m[1])*100+Number((m[2]||"").padEnd(2,"0"));
 return cents>=1&&cents<=10000000?cents:null;
}
export async function listCatalog():Promise<CatalogItem[]>{
 const {db,owner}=await current();
 const {data,error}=await db.from("vmv_ai_catalog_items").select("*")
  .eq("owner_id",owner).order("name",{ascending:true}).limit(100);
 if(error)throw Error("No se pudo consultar el catálogo.");
 return (data||[]) as CatalogItem[];
}
export async function saveCatalogItem(input:{
 name:string;sku:string;description:string;price:string;
 stock_mode:CatalogItem["stock_mode"];available_qty:string;
 approved:boolean;active:boolean;
},previous?:CatalogItem|null){
 const {db,owner}=await current();
 const {data:business}=await db.from("vmv_ai_businesses").select("id")
  .eq("owner_id",owner).maybeSingle();
 if(!business)throw Error("Primero crea un agente para abrir tu espacio de negocio.");
 const price_cents=parseUsd(input.price);
 if(price_cents===null)throw Error("Introduce un precio válido en USD.");
 const sku=input.sku.trim().toUpperCase().slice(0,45);
 const name=input.name.trim().slice(0,120);
 if(!sku||!name)throw Error("Introduce nombre y código del producto.");
 const tracked=input.stock_mode==="tracked";
 const qty=tracked?Number(input.available_qty):null;
 if(tracked&&(!Number.isSafeInteger(qty)||qty===null||qty<0||qty>1000000))
  throw Error("Indica existencias enteras verificadas.");
 const data={
  business_id:business.id,owner_id:owner,
  sku,name,description:input.description.trim().slice(0,700),
  price_cents,currency:"usd",stock_mode:input.stock_mode,
  available_qty:qty,approved:input.approved,active:input.active,
  updated_at:new Date().toISOString()
 };
 if(previous){
  const {data:updated,error}=await db.from("vmv_ai_catalog_items")
   .update(data).eq("id",previous.id).eq("owner_id",owner)
   .eq("updated_at",previous.updated_at).select("id").maybeSingle();
  if(error)throw Error("No se pudo guardar el producto. Revisa el SKU y vuelve a intentarlo.");
  if(!updated)throw Error("El producto cambió en otro dispositivo. Actualiza la lista.");
  return;
 }
 const {error}=await db.from("vmv_ai_catalog_items").insert(data);
 if(error)throw Error("No se pudo añadir el producto. Comprueba que el código SKU sea único.");
}
export async function listTestOrders():Promise<TestOrder[]>{
 const {db,owner}=await current();
 const {data,error}=await db.from("vmv_ai_orders").select("*")
  .eq("owner_id",owner).eq("mode","test").order("created_at",{ascending:false}).limit(30);
 if(error)throw Error("No se pudo consultar el historial de pedidos.");
 return (data||[]) as TestOrder[];
}
export async function prepareTestOrder(agent:PersistedAgent,item:CatalogItem,quantity:number){
 const {db,owner}=await current();
 if(agent.owner_id!==owner||item.owner_id!==owner||agent.business_id!==item.business_id)
  throw Error("El producto y el agente deben pertenecer a tu negocio.");
 if(!uuid.test(agent.id)||!uuid.test(item.id)||!Number.isSafeInteger(quantity)||quantity<1||quantity>50)
  throw Error("Datos de prueba incorrectos.");
 if(!item.active||!item.approved)throw Error("El producto necesita aprobación para las pruebas.");
 // A new user action gets a new key; server deduplicates retries of this operation.
 const idempotencyKey="vmv-ai-web-test-"+crypto.randomUUID();
 const {data,error}=await db.rpc("vmv_ai_owner_test_prepare_order",{
  p_agent_id:agent.id,p_item_id:item.id,p_qty:quantity,p_idempotency_key:idempotencyKey
 });
 if(error)throw Error("La herramienta de pedidos de prueba no está disponible.");
 if(typeof data!=="string")throw Error("Sin existencias suficientes, producto no autorizado o variantes no compatibles.");
 return data as string;
}
export async function confirmTestOrder(id:string){
 const {db}=await current();
 if(!uuid.test(id))throw Error("Pedido no válido.");
 const {data,error}=await db.rpc("vmv_ai_owner_test_confirm_order",{p_order_id:id});
 if(error||data!==true)throw Error("No fue posible registrar la aceptación de prueba. Comprueba que la reserva siga vigente.");
}

export type HumanRequest={
 id:string;owner_id:string;agent_id:string;call_sid:string;
 status:"new"|"reviewed"|"closed";summary:string;created_at:string;
};
export async function listHumanRequests():Promise<HumanRequest[]>{
 const {db,owner}=await current();
 const {data,error}=await db.from("vmv_ai_human_requests")
  .select("id,owner_id,agent_id,call_sid,status,summary,created_at")
  .eq("owner_id",owner).order("created_at",{ascending:false}).limit(30);
 if(error)throw Error("No fue posible consultar las solicitudes humanas.");
 return (data||[]) as HumanRequest[];
}
export async function updateHumanRequest(id:string,status:"reviewed"|"closed"){
 const {db,owner}=await current();
 if(!uuid.test(id))throw Error("Identificador inválido.");
 const {data,error}=await db.from("vmv_ai_human_requests")
  .update({status,updated_at:new Date().toISOString()})
  .eq("id",id).eq("owner_id",owner).select("id").maybeSingle();
 if(error||!data)throw Error("No se pudo actualizar la solicitud de atención.");
}

export async function createTestCheckout(order:TestOrder):Promise<string>{
 const {db,owner}=await current();
 if(!uuid.test(order.id)||order.owner_id!==owner||order.mode!=="test"||
   order.status!=="awaiting_payment")throw Error("Solo puede solicitar el cobro de un pedido de prueba aceptado.");
 const {data:session,error:sessionError}=await db.auth.getSession();
 if(sessionError||!session.session?.access_token)throw Error("Vuelve a iniciar sesión.");
 const response=await fetch("/api/vmv/ai-agents/commerce/checkout",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",
    Authorization:"Bearer "+session.session.access_token},
  body:JSON.stringify({orderId:order.id})
 });
 let payload:{checkoutUrl?:string;error?:string;test?:boolean}={};
 try{payload=await response.json();}catch{}
 if(!response.ok)throw Error(payload.error||"El cobro de este negocio no está disponible.");
 if(payload.test!==true||!/^https:\/\/checkout[.]stripe[.]com\//i.test(payload.checkoutUrl||""))
  throw Error("La sesión de pago no pudo verificarse.");
 return payload.checkoutUrl!;
}
export async function getTestCheckout(orderId:string):Promise<string|null>{
 const {db,owner}=await current();
 if(!uuid.test(orderId))return null;
 const {data}=await db.from("vmv_ai_payment_attempts")
  .select("checkout_url,state,mode").eq("order_id",orderId)
  .eq("owner_id",owner).eq("mode","test").eq("state","pending")
  .order("created_at",{ascending:false}).limit(1);
 const url=data?.[0]?.checkout_url;
 return typeof url==="string"&&/^https:\/\/checkout[.]stripe[.]com\//i.test(url)?url:null;
}

export type CommerceAgentPermissions={
 channel:"Chat"|"Teléfono"|"Teléfono y chat";
 cap_sales:boolean;perm_prepare_order:boolean;
 perm_confirm_order:boolean;perm_payment_link:boolean;
};
/** Only merchant capabilities. Never replace the agent's other trained knowledge. */
export async function saveCommerceAgentPermissions(agent:PersistedAgent,
 input:CommerceAgentPermissions):Promise<PersistedAgent>{
 const {db,owner}=await current();
 if(agent.owner_id!==owner||!uuid.test(agent.id)||!uuid.test(agent.business_id))
  throw Error("El agente no pertenece a tu cuenta.");
 if(!["Chat","Teléfono","Teléfono y chat"].includes(input.channel))
  throw Error("Canal de ventas no válido.");
 if(input.perm_prepare_order&&!input.cap_sales||
    input.perm_confirm_order&&!input.perm_prepare_order||
    input.perm_payment_link&&!input.perm_prepare_order)
  throw Error("Primero autoriza las capacidades y permisos anteriores.");
 const conf:Record<string,string>={...agent.setup,
  channel:input.channel,
  cap_sales:input.cap_sales?"Sí":"No",
  perm_prepare_order:input.perm_prepare_order?"Sí":"No",
  perm_confirm_order:input.perm_confirm_order?"Sí":"No",
  perm_payment_link:input.perm_payment_link?"Sí":"No"
 };
 if(input.channel!=="Chat"&&conf.call_disclosure!=="Sí"&&conf.call_consent!=="Sí")
  throw Error("Debes aprobar el aviso de inteligencia artificial en el asistente antes de usar teléfono.");
 const {data,error}=await db.from("vmv_ai_agents")
  .update({configuration:conf}).eq("id",agent.id).eq("owner_id",owner)
  .eq("business_id",agent.business_id).eq("revision",agent.revision)
  .select("id,revision,updated_at,configuration").maybeSingle();
 if(error)throw Error("No fue posible guardar los permisos comerciales.");
 if(!data)throw Error("El agente cambió en otro dispositivo. Actualiza AI Agents y vuelve a revisar.");
 return {...agent,setup:data.configuration as Record<string,string>,
  revision:data.revision,updated_at:data.updated_at};
}

/** Web Studio cards are display-only. A price may be marketing text, not a quote. */
export type WebStudioCard={id:string;title:string;description:string;price:string;importable:boolean};
export async function listWebStudioCards():Promise<WebStudioCard[]>{
 const {db,owner}=await current();
 const {data,error}=await db.from("smartjob_web_intake_products").select("items")
  .eq("owner_id",owner).maybeSingle();
 if(error)throw Error("No se pudieron consultar los productos guardados en Web Studio.");
 const raw=Array.isArray(data?.items)?data.items:[];
 return raw.slice(0,30).flatMap((value:unknown)=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return [];
  const p=value as Record<string,unknown>;
  const id=typeof p.id==="string"?p.id:"";
  if(!uuid.test(id))return [];
  const title=typeof p.title==="string"?p.title.trim().slice(0,120):"";
  const price=typeof p.price==="string"?p.price.trim().slice(0,32):"";
  return [{id,title,price,description:typeof p.description==="string"?p.description.slice(0,400):"",
   importable:!!title&&/^\$?\d{1,5}(?:\.\d{1,2})?$/.test(price)&&
    Number(price.replace("$",""))>0&&Number(price.replace("$",""))<=100000}];
 });
}
/** Import is explicit and owner-scoped in an invoker RLS RPC. Source prices and
 * inventory are NEVER made active or approved automatically. */
export async function importWebStudioCard(businessId:string,cardId:string):Promise<string>{
 if(!uuid.test(businessId)||!uuid.test(cardId))throw Error("Producto o negocio inválido.");
 const {db,owner}=await current();
 const {data:business,error}=await db.from("vmv_ai_businesses").select("id")
  .eq("id",businessId).eq("owner_id",owner).maybeSingle();
 if(error||!business)throw Error("Este negocio no pertenece a tu cuenta.");
 const {data,error:importError}=await db.rpc("vmv_ai_owner_import_web_card",{
  p_business_id:businessId,p_web_product_id:cardId
 });
 if(importError||typeof data!=="string")
  throw Error("No se pudo importar. Revisa que el producto tenga nombre y precio fijo en USD.");
 return data;
}

export type VerifiedCatalogItem={
 id:string;sku:string;name:string;priceCents:number;currency:"usd";
 availableQuantity:number|null;availability:"tracked"|"manual"|"unlimited";
 supportsSimpleOrder:boolean;sellableInTest:boolean;webSourceId:string|null;
};
export async function getVerifiedCatalog(businessId:string):Promise<VerifiedCatalogItem[]>{
 if(!uuid.test(businessId))throw Error("Negocio inválido.");
 const {db}=await current();
 const {data:auth,error}=await db.auth.getSession();
 if(error||!auth.session?.access_token)throw Error("Inicia sesión para consultar inventario.");
 const response=await fetch("/api/vmv/ai-agents/catalog?businessId="+encodeURIComponent(businessId),{
  cache:"no-store",headers:{Authorization:"Bearer "+auth.session.access_token}
 });
 let payload:{products?:VerifiedCatalogItem[];error?:string}={};
 try{payload=await response.json();}catch{throw Error("El catálogo comercial no respondió.");}
 if(!response.ok)throw Error(payload.error||"No se pudo consultar el inventario verificado.");
 return Array.isArray(payload.products)?payload.products:[];
}
