/** Exact catalog matches only: no inferred products or prices. */
export type BuyerTurn={id:string;role:"user"|"assistant";content:string};
export type BuyerProduct={id:string;name:string;priceCents:number};
export type RequestedItem={id:string;qty:number;name:string;priceCents:number};
export type BuyerOrder={intentId:string;items:RequestedItem[];name:string;phone:string;email:string};

const clean=(value:string)=>value.toLowerCase().normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const escape=(value:string)=>value.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
const buyWords=/(?:\bquiero\b|\bquisiera\b|\bcomprar\b|\bcompro\b|\bpedido\b|\bordenar\b|\bencargar\b|\bme llevo\b|\bnecesito\b|\bsolicito\b|\bbuy\b|\bpurchase\b|\border\b|\bi'll take\b)/i;
const quantities:Record<string,number>={un:1,una:1,uno:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5};
function itemsFromText(value:string,products:BuyerProduct[]){
 const text=clean(value),selected:RequestedItem[]=[];
 for(const product of products){
  const base=clean(product.name);
  if(!base||!product.id||product.priceCents<1)continue;
  const pattern=new RegExp("(?:^|[^a-z0-9])(?:(\\d{1,2}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five)\\s+(?:de\\s+)?)?"+
    "("+escape(base)+"(?:s|es)?)(?=$|[^a-z0-9])","gi");
  const found=[...text.matchAll(pattern)];
  if(!found.length)continue;
  const counts=found.map(m=>m[1]?(quantities[m[1]]??Number(m[1])):1);
  if(counts.some(q=>!Number.isInteger(q)||q<1||q>50))return [];
  const qty=counts.reduce((a,b)=>a+b,0);
  if(qty>50)return [];
  selected.push({id:product.id,qty,name:product.name,priceCents:product.priceCents});
 }
 return selected;
}
function contactFromText(value:string){
 const name=value.match(/(?:mi nombre (?:es|:)\s*|me llamo\s*|my name is\s*)([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ' -]{1,65}?)(?=\s+(?:y\s+)?(?:mi\s+)?(?:numero|número|telefono|teléfono|celular|whatsapp|correo|email|my phone)\b|[.,;]|$)/i)?.[1]?.trim()||"";
 const phone=value.match(/(?:n[uú]mero(?: de tel[eé]fono)?|tel[eé]fono|celular|whatsapp|phone(?: number)?)\s*(?:(?:de contacto)?\s*(?:es|is|:))?\s*(\+?\d[\d ().-]{6,23})/i)?.[1]?.trim()||"";
 const email=value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]||"";
 return {name,phone:phone.replace(/\s+/g," ").trim(),email};
}
export function conversationalOrder(turns:BuyerTurn[],products:BuyerProduct[]):BuyerOrder|null{
 if(!products.length)return null;
 const recent=turns.filter(t=>t.role==="user").slice(-18);
 let index=-1,items:RequestedItem[]=[];
 for(let i=recent.length-1;i>=0;i--){
  const text=clean(recent[i].content);
  if(!buyWords.test(text))continue;
  const possible=itemsFromText(text,products);
  if(possible.length){index=i;items=possible;break;}
 }
 if(index<0||items.length>8||items.reduce((n,item)=>n+item.qty,0)>50)return null;
 let name="",phone="",email="";
 for(const turn of recent.slice(index)){
  const found=contactFromText(turn.content);
  if(found.name)name=found.name;
  if(found.phone)phone=found.phone;
  if(found.email)email=found.email;
 }
 return {intentId:recent[index].id,items,name,phone,email};
}
