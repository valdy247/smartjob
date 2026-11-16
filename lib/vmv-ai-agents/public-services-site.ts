import type {Data} from "@puckeditor/core";
import {canonicalCatalogImageUrl} from "@/lib/vmv-ai-agents/public-catalog-site";

export type ApprovedBusinessService={
 id:string;name:string;description:string|null;price_cents:number|null;currency:string;
 image_path:string|null;updated_at:string;
};
export function applyPublishedServices(
 document:Data,services:ApprovedBusinessService[],
 owner:string,business:string,supabaseUrl:string
):Data{
 const approved=services.filter(s=>s.name&&s.currency==="usd"&&
  (s.price_cents===null||Number.isInteger(s.price_cents)&&s.price_cents>0))
  .slice(0,40).map(s=>({
   id:"service-"+s.id,title:s.name.slice(0,120),description:(s.description||"").slice(0,400),
   price:s.price_cents===null?"":"$"+(s.price_cents/100).toFixed(2),
   alt:s.name.slice(0,120),image:canonicalCatalogImageUrl(s.image_path,owner,business,supabaseUrl),
   catalogOriginal:true,imageRadius:0,imageBorder:0,imageOpacity:0,imageMoveX:0,
   imageMoveY:0,imageMoveXMobile:0,imageMoveYMobile:0
  }));
 let replaced=false;
 const content=document.content.map(node=>{
  if(node.type!=="OfferingGrid"||replaced)return node;
  replaced=true;
  const existing=Array.isArray(node.props?.items)?node.props.items:[];
  const others=existing.filter((item:unknown)=>{
   if(!item||typeof item!=="object")return false;
   const id=(item as {id?:unknown}).id;
   return typeof id!=="string"||!/^service-(?:\d{1,2}|[0-9a-f-]{36})$/i.test(id);
  });
  const hasPrice=[...others,...approved].some(x=>x&&typeof x==="object"&&
   typeof (x as {price?:unknown}).price==="string"&&Boolean((x as {price:string}).price));
  return {...node,props:{...node.props,
   items:[...others,...approved].slice(0,40),showPrices:hasPrice?"yes":"no"}};
 });
 if(!replaced&&approved.length){
  const contactIndex=content.findIndex(node=>node.type==="Contact");
  content.splice(contactIndex<0?content.length:contactIndex,0,{
   type:"OfferingGrid",props:{
    id:"linked-services",title:"Nuestros servicios",description:"",
    items:approved,layout:"grid",padding:"normal",surface:"light",columns:"3",
    showPrices:approved.some(x=>x.price)?"yes":"no"
   }
  });
  replaced=true;
 }
 return replaced?{...document,content}:document;
}
