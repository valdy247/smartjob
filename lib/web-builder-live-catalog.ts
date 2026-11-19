import type {Data} from "@puckeditor/core";
import {billingAdmin} from "@/lib/vmv-billing";
import {normalizeBuilderDocument} from "@/lib/web-builder-puck";
import {safeWebImageUrl} from "@/lib/web-services-site";

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
   .select("id,name,description,price_cents,currency,image_path")
   .eq("business_id",workspace.id).eq("owner_id",site.owner_id)
   .eq("active",true).eq("approved",true).eq("currency","usd")
   .order("name",{ascending:true}).limit(60);
  if(error)return [];
  return (data||[]).filter(x=>typeof x.name==="string"&&x.name.trim()&&
   Number.isSafeInteger(x.price_cents)&&x.price_cents>=1&&x.price_cents<=10000000)
   .map(x=>({
    id:x.id,title:x.name.trim().slice(0,120),description:String(x.description||"").slice(0,400),
    price:"$"+(x.price_cents/100).toFixed(2),
    image:(()=>{
     const safe=safeWebImageUrl(typeof x.image_path==="string"?x.image_path:"");
     return safe&&safe.includes("/smartjob-web-images/"+site.owner_id+"/")?safe:"";
    })(),alt:x.name.trim().slice(0,120)
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

/** Booking services are the canonical services managed by AI Agents.
 * Published pages read the latest approved active rows on every request. */
export async function publishedBuilderServices(slug:string):Promise<DisplayProduct[]|null>{
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>64)return null;
 const db=billingAdmin();if(!db)return null;
 try{
  const {data:site,error}=await db.from("smartjob_builder_sites")
   .select("owner_id,services_connection_enabled,services_business_id")
   .eq("slug",slug).maybeSingle();
  if(error||!site||site.services_connection_enabled!==true||!site.services_business_id)return null;
  const {data:workspace,error:check}=await db.from("vmv_ai_businesses")
   .select("id").eq("id",site.services_business_id).eq("owner_id",site.owner_id).maybeSingle();
  if(check||!workspace)return [];
  const {data,error:serviceError}=await db.from("vmv_ai_booking_services")
   .select("id,name,description,price_cents,currency")
   .eq("business_id",workspace.id).eq("owner_id",site.owner_id)
   .eq("active",true).eq("approved",true).eq("currency","usd")
   .order("name",{ascending:true}).limit(60);
  if(serviceError)return [];
  return (data||[]).filter(item=>typeof item.name==="string"&&item.name.trim())
   .map(item=>({
    id:item.id,title:String(item.name).trim().slice(0,120),
    description:String(item.description||"").slice(0,400),
    price:typeof item.price_cents==="number"&&item.price_cents>=0?
     "$"+(item.price_cents/100).toFixed(2):"",
    image:"",alt:String(item.name).trim().slice(0,120)
   }));
 }catch{return [];}
}

/** Explicitly identified new blocks are updated independently. Older sites keep
 * the original product-only behavior without accidentally replacing services. */
export function applyPublishedConnections(document:Data,products:DisplayProduct[]|null,
 services:DisplayProduct[]|null):Data{
 const base=normalizeBuilderDocument(document);
 if(products===null&&services===null)return base;
 const hasSpecific=base.content.some(block=>block.type==="OfferingGrid"&&
  ["connected-catalog","connected-services"].includes(String(block.props?.id||"")));
 if(!hasSpecific&&services===null)return applyPublishedCatalog(base,products);
 let hadProducts=false,hadServices=false;
 const content=base.content.map(block=>{
  if(block.type!=="OfferingGrid")return block;
  const id=String(block.props?.id||"");
  if(id==="connected-catalog"&&products!==null){
   hadProducts=true;
   return {...block,props:{...block.props,items:products,
    showPrices:products.length?"yes":"no"}};
  }
  if(id==="connected-services"&&services!==null){
   hadServices=true;
   return {...block,props:{...block.props,items:services,
    showPrices:services.some(s=>s.price)?"yes":"no"}};
  }
  return block;
 });
 if(products!==null&&!hadProducts&&products.length)content.push({type:"OfferingGrid",props:{
  id:"connected-catalog",title:"Nuestros productos",description:"",items:products,
  layout:"grid",padding:"normal",surface:"light",columns:"3",showPrices:"yes"
 }});
 if(services!==null&&!hadServices&&services.length)content.push({type:"OfferingGrid",props:{
  id:"connected-services",title:"Servicios",description:"",items:services,
  layout:"grid",padding:"normal",surface:"light",columns:"3",
  showPrices:services.some(s=>s.price)?"yes":"no"
 }});
 return normalizeBuilderDocument({...base,content});
}
