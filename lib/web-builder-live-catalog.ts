import type {Data} from "@puckeditor/core";
import {billingAdmin} from "@/lib/vmv-billing";
import {normalizeBuilderDocument} from "@/lib/web-builder-puck";

type DisplayProduct={id:string;title:string;description:string;price:string;image:string;alt:string};
/** Called ONLY after the public publication view has returned a published page.
 * null means catalog access is off; [] means connected but nothing is approved.
 * Never expose draft inventory, costs, quantities, variants or payment authority. */
export async function publishedBuilderCatalog(slug:string):Promise<DisplayProduct[]|null>{
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>64)return null;
 const db=billingAdmin();if(!db)return null;
 try{
  const {data:site,error:siteError}=await db.from("smartjob_builder_sites")
   .select("owner_id,inventory_connection_enabled,inventory_business_id")
   .eq("slug",slug).maybeSingle();
  if(siteError||!site||site.inventory_connection_enabled!==true||!site.inventory_business_id)
   return null;
  const {data:workspace,error:workspaceError}=await db.from("vmv_ai_businesses")
   .select("id").eq("id",site.inventory_business_id)
   .eq("owner_id",site.owner_id).maybeSingle();
  if(workspaceError||!workspace)return [];
  const {data,error}=await db.from("vmv_ai_catalog_items")
   .select("id,name,description,price_cents,currency")
   .eq("business_id",workspace.id).eq("owner_id",site.owner_id)
   .eq("active",true).eq("approved",true).eq("currency","usd")
   .order("name",{ascending:true}).limit(60);
  if(error)return [];
  return (data||[]).filter(x=>typeof x.name==="string"&&x.name.trim()&&
   Number.isSafeInteger(x.price_cents)&&x.price_cents>=1&&x.price_cents<=10000000)
   .map(x=>({
    id:x.id,title:x.name.trim().slice(0,120),description:String(x.description||"").slice(0,400),
    price:"$"+(x.price_cents/100).toFixed(2),image:"",alt:x.name.trim().slice(0,120)
   }));
 }catch{return [];}
}
export function applyPublishedCatalog(document:Data,catalog:DisplayProduct[]|null):Data{
 const base=normalizeBuilderDocument(document);
 if(catalog===null)return base;
 let updated=false;
 const content=base.content.map(block=>{
  if(block.type!=="OfferingGrid")return block;
  updated=true;
  return {...block,props:{...block.props,items:catalog,
   showPrices:catalog.length?"yes":"no"}};
 });
 // AI-generated compositions can omit an offering block. When the owner
 // connected inventory, always render the current approved catalog.
 if(!updated&&catalog.length)content.push({type:"OfferingGrid",props:{
  id:"connected-catalog",title:"Nuestros productos",description:"",
  items:catalog,layout:"grid",padding:"normal",surface:"light",columns:"3",
  showPrices:"yes"
 }});
 return normalizeBuilderDocument({...base,content});
}
