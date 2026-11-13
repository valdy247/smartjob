// Test-only phone commerce: the model proposes an intent; trusted database RPCs
// own all price, stock, order IDs, buyer acceptance and payment state.
import type {SupabaseClient} from "@supabase/supabase-js";
import {askAiAgent} from "@/lib/vmv-ai-agents/model";
export type VoiceCommerceSession={
 call_sid:string;owner_id:string;agent_id:string;order_id?:string|null;
 agent_snapshot:Record<string,unknown>;
 turns:{role:"user"|"assistant";content:string}[];
};
type Catalog={
 id:string;sku:string;name:string;description:string;price_cents:number;
 currency:string;stock_mode:string;available_qty:number|null;
};
const money=(cents:number)=>"$"+(cents/100).toFixed(2);
const single=(s:unknown,max=600)=>typeof s==="string"?s.trim().slice(0,max):"";
const intentSchema={
 action:"none|catalog|quote|change_quantity|accept|payment|human",
 sku:"an exact SKU from the supplied catalog or empty",
 quantity:"integer number of units or null",
 fulfillment:"pickup|delivery|unspecified",
 reply:"one brief conversational answer, no invented prices or completed actions"
};
function explicitAcceptance(s:string){
 const normalized=s.toLowerCase().trim();
 if(/^(no|nope|cancel|cancela|todav[ií]a no|not yet|esp[eé]rate)\b/.test(normalized))return false;
 return /^(s[ií](,|\b)|yes\b|confirmo\b|acepto\b|i confirm\b|i accept\b)/.test(normalized);
}
function salesPermitted(s:VoiceCommerceSession){
 const cfg=(s.agent_snapshot.configuration||{}) as Record<string,string>;
 return cfg.cap_sales==="Sí"&&cfg.perm_prepare_order==="Sí"&&
   cfg.channel!=="Chat";
}
async function catalogForCall(db:SupabaseClient,s:VoiceCommerceSession):Promise<Catalog[]>{
 const {data:agent}=await db.from("vmv_ai_agents").select("business_id")
  .eq("id",s.agent_id).eq("owner_id",s.owner_id).maybeSingle();
 if(!agent)return [];
 const {data,error}=await db.from("vmv_ai_catalog_items")
  .select("id,sku,name,description,price_cents,currency,stock_mode,available_qty,variants,extras")
  .eq("business_id",agent.business_id).eq("owner_id",s.owner_id)
  .eq("approved",true).eq("active",true).limit(30);
 if(error||!data)return [];
 return data.filter(x=>Array.isArray(x.variants)&&x.variants.length===0&&
   Array.isArray(x.extras)&&x.extras.length===0).map(x=>({
    id:x.id,sku:x.sku,name:x.name,description:x.description||"",
    price_cents:x.price_cents,currency:x.currency,
    stock_mode:x.stock_mode,available_qty:x.available_qty
   }));
}
function fallback(lang:"es"|"en",what:"missing"|"pending"|"human"){
 if(lang==="es"){
  if(what==="missing")return "No tengo un catálogo de productos verificado para confirmar precios o existencias. El negocio debe configurarlo.";
  if(what==="pending")return "Todavía no puedo confirmar ese pedido. Necesito verificar el producto y la cantidad.";
  return "Por ahora, alguien del negocio tendrá que revisar tu solicitud.";
 }
 if(what==="missing")return "I do not have an approved catalog to confirm products, prices or stock.";
 if(what==="pending")return "I cannot confirm that order yet. I need to verify the product and quantity.";
 return "A person at the business will need to review your request.";
}
export async function phoneCommerceTurn(db:SupabaseClient,session:VoiceCommerceSession,
 speech:string,lang:"es"|"en",turn:number):Promise<string|null>{
 if(!salesPermitted(session))return null;
 const products=await catalogForCall(db,session);
 if(!products.length)return fallback(lang,"missing");
 const prior=Array.isArray(session.turns)?session.turns.filter(x=>
  x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-10):[];
 const account=await db.from("vmv_ai_orders").select("id,order_no,status,total_cents")
  .eq("id",session.order_id||"00000000-0000-0000-0000-000000000000")
  .eq("owner_id",session.owner_id).maybeSingle();
 const current=account.data||null;
 const prompt=[
  "You are the INTENT EXTRACTOR for a merchant's phone order. Return only JSON.",
  "You must NOT set prices, claim payment, or call any service. Do not invent stock.",
  "Permitted action shapes: "+JSON.stringify(intentSchema),
  "If uncertain choose none or human. sku must exactly match provided catalog.",
  "Only set accept when the caller clearly ACCEPTS the quoted total. Never accept a negative response.",
  "Only use pickup; delivery requires separate authorized rules. If delivery requested choose human.",
  "Previous quote: "+JSON.stringify(current),
  "Approved catalog (all amounts in cents, authoritative data): "+JSON.stringify(
   products.map(p=>({sku:p.sku,name:p.name,description:p.description.slice(0,240),
    price_cents:p.price_cents,currency:p.currency,stock_mode:p.stock_mode,
    available_qty:p.stock_mode==="tracked"?p.available_qty:null}))),
  "Caller dialogue so far: "+JSON.stringify(prior),
  "Return a brief speech reply in "+(lang==="es"?"Spanish":"English")+
   ". For actions quote/change/accept/payment do NOT claim completion; server will speak the result."
 ].join("\n");
 let proposal:Record<string,unknown>={action:"none",reply:""};
 try{
  const text=await askAiAgent({
   system:prompt,
   messages:[{role:"user",content:speech}],
   maxOutputTokens:230,temperature:0,timeoutMs:7000
  });
  proposal=JSON.parse(text) as Record<string,unknown>;
 }catch{return fallback(lang,"human");}
 const action=single(proposal.action,30),sku=single(proposal.sku,45).toUpperCase();
 const quantity=Number(proposal.quantity);
 const fulfillment=single(proposal.fulfillment,30);
 const generic=single(proposal.reply);
 if(action==="catalog"){
  const limited=products.slice(0,4).map(p=>p.name+" ("+p.sku+"): "+money(p.price_cents)+
   (p.stock_mode==="manual"?" (requiere confirmar disponibilidad)":""));
  return lang==="es"?"Estos son algunos productos con precio aprobado: "+limited.join("; ")+
    ". ¿Cuál te interesa?":"Here are verified catalog prices: "+limited.join("; ")+". Which would you like?";
 }
 if(action==="payment")return lang==="es"?
  "El pedido no se considera pagado hasta que Stripe confirme el cobro. No puedo recibir tarjetas por teléfono.":
  "The order is not paid until the provider verifies it. I cannot take card numbers over the phone.";
 if(action==="human"||fulfillment==="delivery")return fallback(lang,"human");
 if(action==="none"){
  // Never allow an unverified generated statement to masquerade as payment, stock or a quote.
  if(/\$\s*\d|paid|pagad[oa]|reservad[oa]|confirmed|confirmad[oa]|in stock|disponible ahora/i.test(generic))
   return fallback(lang,"pending");
  return generic||fallback(lang,"human");
 }
 if(action==="quote"){
  if(session.order_id)return fallback(lang,"pending");
  const chosen=products.find(p=>p.sku.toUpperCase()===sku);
  if(!chosen||chosen.stock_mode==="manual"||!Number.isSafeInteger(quantity)||quantity<1||quantity>50)
   return fallback(lang,"pending");
  const {data:id,error}=await db.rpc("vmv_ai_phone_test_quote",{
   p_call_sid:session.call_sid,p_item_id:chosen.id,p_qty:quantity,
   p_key:"phone-"+session.call_sid+"-"+turn+"-new"
  });
  if(error||typeof id!=="string")return lang==="es"?
   "No hay disponibilidad confirmada suficiente para preparar esa cotización.":"I can't verify enough availability for that quote.";
  const {data:order}=await db.from("vmv_ai_orders").select("order_no,total_cents")
   .eq("id",id).eq("owner_id",session.owner_id).maybeSingle();
  if(!order)return fallback(lang,"human");
  return lang==="es"?
   "Prueba: "+quantity+" unidad(es) de "+chosen.name+". Total de prueba "+
    money(order.total_cents)+", recogida en el negocio. Pedido número "+order.order_no+
    ". ¿Aceptas esta cotización?":
   "Test quote: "+quantity+" unit(s) of "+chosen.name+", total "+money(order.total_cents)+
    " for pickup. Test order "+order.order_no+". Do you accept this quote?";
 }
 if(action==="change_quantity"){
  if(!session.order_id||!Number.isSafeInteger(quantity)||quantity<1||quantity>50)
   return fallback(lang,"pending");
  const {data:id,error}=await db.rpc("vmv_ai_phone_test_change_quantity",{
   p_call_sid:session.call_sid,p_qty:quantity,p_key:"phone-"+session.call_sid+"-"+turn+"-change"
  });
  if(error||typeof id!=="string")return fallback(lang,"pending");
  const {data:order}=await db.from("vmv_ai_orders").select("order_no,total_cents")
   .eq("id",id).eq("owner_id",session.owner_id).maybeSingle();
  if(!order)return fallback(lang,"human");
  return lang==="es"?"Cantidad corregida a "+quantity+". Nuevo total de prueba "+
    money(order.total_cents)+", pedido "+order.order_no+". ¿Lo confirmas?":
   "Quantity changed to "+quantity+". New test total "+money(order.total_cents)+
    ", order "+order.order_no+". Do you accept?";
 }
 if(action==="accept"){
  if(!session.order_id||!explicitAcceptance(speech))return fallback(lang,"pending");
  const config=(session.agent_snapshot.configuration||{}) as Record<string,string>;
  if(config.perm_confirm_order!=="Sí")return fallback(lang,"human");
  const {data:ok,error}=await db.rpc("vmv_ai_phone_test_accept",{p_call_sid:session.call_sid});
  if(error||ok!==true)return fallback(lang,"pending");
  const {data:order}=await db.from("vmv_ai_orders").select("order_no,status,total_cents,payment_status")
    .eq("id",session.order_id).eq("owner_id",session.owner_id).maybeSingle();
  if(!order||order.payment_status==="paid")return fallback(lang,"human");
  return lang==="es"?"Registré tu aceptación del pedido de PRUEBA número "+order.order_no+
    ", total "+money(order.total_cents)+". Aún NO está pagado ni confirmado para entrega.":
   "Your TEST order "+order.order_no+" was accepted for "+money(order.total_cents)+
    ". It is NOT paid and fulfillment is not confirmed.";
 }
 return fallback(lang,"human");
}
