import type {SupabaseClient} from "@supabase/supabase-js";

/** Canonical merchant inventory and price snapshot, suitable for the authenticated
 * Web Services editor and VMV Agents. Display cards are NEVER price authority.
 * At checkout, the transactional database RPC revalidates price and stock. */
export type CommerceCatalogProduct={
 id:string;sku:string;name:string;description:string;priceCents:number;
 currency:"usd";availableQuantity:number|null;availability:"tracked"|"manual"|"unlimited";
 supportsSimpleOrder:boolean;sellableInTest:boolean;webSourceId:string|null;
};
type Item={
 id:string;sku:string;name:string;description:string|null;price_cents:number;
 currency:string;stock_mode:string;available_qty:number|null;
 variants:unknown;extras:unknown;web_source_id:string|null;
};
export function buildCatalogSnapshot(items:Item[],holds:{item_id:string;qty:number}[]):CommerceCatalogProduct[]{
 const reserved=new Map<string,number>();
 for(const h of holds)if(h.item_id&&Number.isInteger(h.qty)&&h.qty>0)
  reserved.set(h.item_id,(reserved.get(h.item_id)||0)+h.qty);
 return items.filter(x=>x.currency==="usd"&&Number.isInteger(x.price_cents)&&x.price_cents>0)
  .map(item=>{
   const tracked=item.stock_mode==="tracked";
   const available=tracked?
    Math.max(0,(item.available_qty||0)-(reserved.get(item.id)||0)):null;
   const compatible=Array.isArray(item.variants)&&item.variants.length===0&&
    Array.isArray(item.extras)&&item.extras.length===0;
   const stock=item.stock_mode==="unlimited"?"unlimited":tracked?"tracked":"manual";
   return {
    id:item.id,sku:item.sku,name:item.name,description:item.description||"",
    priceCents:item.price_cents,currency:"usd" as const,
    availableQuantity:available,availability:stock,
    supportsSimpleOrder:compatible,
    sellableInTest:compatible&&stock!=="manual"&&(!tracked||(available!==null&&available>0)),
    webSourceId:item.web_source_id||null
   };
  });
}
export async function ownerCatalogSnapshot(db:SupabaseClient,owner:string,businessId:string){
 const {data:business,error:ownershipError}=await db.from("vmv_ai_businesses").select("id")
  .eq("id",businessId).eq("owner_id",owner).maybeSingle();
 if(ownershipError||!business)throw Error("No tienes acceso al catálogo de ese negocio.");
 const {data,error}=await db.from("vmv_ai_catalog_items")
  .select("id,sku,name,description,price_cents,currency,stock_mode,available_qty,variants,extras,web_source_id")
  .eq("business_id",businessId).eq("owner_id",owner)
  .eq("active",true).eq("approved",true).order("name").limit(100);
 if(error)throw Error("No se pudo consultar el catálogo verificado.");
 const items=(data||[]) as Item[];
 const ids=items.filter(i=>i.stock_mode==="tracked").map(x=>x.id);
 let holds:{item_id:string;qty:number}[]=[];
 if(ids.length){
  const {data:rows,error:holdError}=await db.from("vmv_ai_inventory_holds")
   .select("item_id,qty").eq("owner_id",owner)
   .in("item_id",ids).eq("state","held")
   .gt("expires_at",new Date().toISOString()).limit(1000);
  if(holdError)throw Error("No se pudo comprobar las reservas de inventario.");
  if((rows||[]).length>=1000)throw Error("Demasiadas reservas de inventario para confirmar disponibilidad.");
  holds=(rows||[]) as {item_id:string;qty:number}[];
 }
 return buildCatalogSnapshot(items,holds);
}
