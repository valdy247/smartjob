/** Field definitions shared by the public request form and owner inbox. */
import {categoryLabel} from "./vmv-business-categories";

export type InquiryDetailKey="eventDate"|"servings"|"flavor"|"budget"|"projectType"|"timeframe"|"referenceLink";
export type InquiryKind="bakery"|"construction"|"event"|"general";
export type InquiryDetailField={key:InquiryDetailKey;label:string;inputType:"text"|"date"|"url";placeholder?:string};
export const INQUIRY_DETAIL_LABELS:Record<InquiryDetailKey,string>={
 eventDate:"Fecha",servings:"Porciones / invitados",flavor:"Sabor o detalles",
 budget:"Presupuesto",projectType:"Tipo de proyecto",timeframe:"Plazo",
 referenceLink:"Enlace de referencia"
};
export function inquiryKind(categoryId:string):InquiryKind{
 if(["bakery","catering","food-truck"].includes(categoryId))return "bakery";
 if(["carpentry","general-contractor","home-builder","remodeling","electrical","plumbing","hvac","landscaping","roofing","painting","smart-home","interior-design"].includes(categoryId))return "construction";
 if(["event-planning","florist","photography","music"].includes(categoryId))return "event";
 return "general";
}
const fields:Record<InquiryKind,InquiryDetailField[]>={
 bakery:[
  {key:"eventDate",label:"Fecha del pedido",inputType:"date"},
  {key:"servings",label:"Cantidad de porciones",inputType:"text",placeholder:"Ej. 20 personas"},
  {key:"flavor",label:"Sabor / decoración",inputType:"text",placeholder:"Ej. chocolate, tema floral"},
  {key:"referenceLink",label:"Foto de referencia (enlace)",inputType:"url",placeholder:"https://"}
 ],
 construction:[
  {key:"projectType",label:"Tipo de trabajo",inputType:"text",placeholder:"Ej. remodelar la cocina"},
  {key:"budget",label:"Presupuesto aproximado",inputType:"text",placeholder:"Ej. $5,000–$10,000"},
  {key:"timeframe",label:"Cuándo lo necesitas",inputType:"text",placeholder:"Ej. próximo mes"}
 ],
 event:[
  {key:"eventDate",label:"Fecha del evento",inputType:"date"},
  {key:"servings",label:"Personas / invitados",inputType:"text"},
  {key:"budget",label:"Presupuesto aproximado",inputType:"text"}
 ],
 general:[{key:"timeframe",label:"Cuándo lo necesitas",inputType:"text"}]
};
export const inquiryFields=(categoryId:string):InquiryDetailField[]=>fields[inquiryKind(categoryId)];
export const inquiryCategoryLabel=(categoryId:string)=>categoryLabel(categoryId,"Servicio");
export function safeReferenceLink(value:string):string|null{
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.port)return null;
  return u.href;
 }catch{return null;}
}
