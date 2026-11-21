/* Smart Quote PDF renderer: no external PDF dependency, no payment/invoice assertions. */
export type QuoteTemplate="modern"|"elegant"|"classic";
export const validTemplate=(value:unknown):value is QuoteTemplate=>
 value==="modern"||value==="elegant"||value==="classic";
type Line={name:string;description?:string;unit_name:string;quantity:number;unit_price_cents:number;line_total_cents:number};
export type QuotePdfData={
 id:string;revision:number;customer_name:string;customer_email:string;customer_phone:string;
 valid_until:string;lines:Line[];subtotal_cents:number;discount_cents:number;
 delivery_cents:number;tax_bps:number;tax_cents:number;deposit_bps:number;
 deposit_cents:number;total_cents:number;notes:string;status:string;
 pdf_business_contact?:Partial<Record<"email"|"website"|"phone"|"address",string>>;
};
const price=(n:number)=>"$"+(n/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pdfText=(v:unknown)=>String(v??"").normalize("NFC")
 .replace(/[\u2010-\u2015]/g,"-").replace(/[\u2018\u2019]/g,"'")
 .replace(/[\u201C\u201D]/g,'"').replace(/[\u2022]/g,"-")
 .replace(/[^\x20-\x7e\xa0-\xff]/g,"?")
 .replace(/[\\()]/g,c=>"\\"+c);
const rgb=(hex:string)=>[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(3)).join(" ");
function sheet(data:QuotePdfData,business:string,template:QuoteTemplate,part:number,count:number){
 const main=template==="modern"?"#7853ba":template==="elegant"?"#a36b4d":"#285c73";
 const accent=rgb(main),text="0.18 0.14 0.23",muted="0.48 0.45 0.53",paper="0.98 0.97 1.00";
 const ops:string[]=[];
 const rect=(x:number,y:number,w:number,h:number,color:string)=>ops.push(color+" rg "+x+" "+y+" "+w+" "+h+" re f");
 const label=(v:unknown,x:number,y:number,size=11,bold=false,color=text,max=80)=>
  ops.push(color+" rg BT /"+(bold?"FB":"FR")+" "+size+" Tf 1 0 0 1 "+x+" "+y+" Tm ("+pdfText(String(v??"").slice(0,max))+") Tj ET");
 rect(0,0,612,792,"1 1 1");
 if(template==="modern"){rect(0,735,612,57,accent);label(business,37,759,17,true,"1 1 1",55);}
 else if(template==="elegant"){rect(35,732,542,2,accent);label(business,40,759,21,true,accent,55);}
 else {rect(0,748,612,44,accent);label(business,36,764,17,true,"1 1 1",55);}
 const contact=data.pdf_business_contact;
 const details=[contact?.email,contact?.website,contact?.phone,contact?.address]
  .filter((value):value is string=>typeof value==="string"&&Boolean(value.trim()));
 const contactLines=details.flatMap(value=>value.match(/.{1,100}/g)||[]);
 contactLines.forEach((value,i)=>label(value,38,126-i*9,7,false,muted,100));
 label("COTIZACION",38,704,22,true,accent);
 label("#"+data.id.slice(0,8).toUpperCase()+"  |  Revision "+data.revision,38,683,10,false,muted);
 label("Valida hasta: "+data.valid_until,394,683,10,false,muted,34);
 rect(36,618,540,50,paper);label("CLIENTE",47,650,9,true,accent);
 label(data.customer_name,47,634,12,true,text,70);
 label(data.customer_email,318,646,10,false,muted,44);
 label(data.customer_phone,318,631,10,false,muted,44);
 rect(36,586,540,22,accent);
 label("DESCRIPCION",44,593,10,true,"1 1 1");
 label("CANT.",345,593,10,true,"1 1 1");
 label("PRECIO",420,593,10,true,"1 1 1");
 label("IMPORTE",510,593,10,true,"1 1 1");
 const rows=data.lines.slice(part*14,(part+1)*14);
 rows.forEach((line,i)=>{
  const y=564-i*25;
  if(i%2===0)rect(36,y-11,540,25,paper);
  label(line.name,44,y,10,i===0,text,43);
  label(String(line.quantity),348,y,10,false,text,6);
  label(price(line.unit_price_cents),416,y,10,false,text,14);
  label(price(line.line_total_cents),504,y,10,false,text,14);
 });
 if(part===count-1){
  const y=part===0?178:Math.min(205,544-rows.length*25-30);
  rect(307,y-31,269,138,paper);
  label("Subtotal",320,y+84,10,false,muted);label(price(data.subtotal_cents),483,y+84,10,true,text,15);
  label("Descuento",320,y+64,10,false,muted);label("-"+price(data.discount_cents),483,y+64,10,false,text,15);
  label("Entrega",320,y+44,10,false,muted);label(price(data.delivery_cents),483,y+44,10,false,text,15);
  label("Impuestos ("+(data.tax_bps/100)+"%)",320,y+24,10,false,muted);
  label(price(data.tax_cents),483,y+24,10,false,text,15);
  rect(307,y-28,269,28,accent);
  label("TOTAL",320,y-18,13,true,"1 1 1");label(price(data.total_cents),464,y-18,13,true,"1 1 1",15);
  if(data.deposit_bps)label("Deposito propuesto: "+price(data.deposit_cents),320,y-44,9,false,muted,45);
  if(data.notes)label("Condiciones: "+data.notes,38,139,9,false,muted,100);
 }
 rect(36,50,540,1,"0.87 0.84 0.90");
 label("Cotizacion comercial. No es factura fiscal ni comprobante de pago.",38,34,8,false,muted,97);
 label("Pagina "+(part+1)+" de "+count,522,34,8,false,muted,20);
 return ops.join("\n")+"\n";
}
export function renderQuotePdf(data:QuotePdfData,business:string,template:QuoteTemplate):Buffer{
 const pages=Math.max(1,Math.ceil(data.lines.length/14));
 const objs:string[]=[""];
 const add=(v:string)=>{objs.push(v);return objs.length-1;};
 const font=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
 const bold=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
 const pagesId=add("");
 const catalogId=add("");
 const refs:number[]=[];
 for(let p=0;p<pages;p++){
  const stream=sheet(data,business,template,p,pages);
  const content=add("<< /Length "+Buffer.byteLength(stream,"latin1")+" >>\nstream\n"+stream+"endstream");
  const page=add("<< /Type /Page /Parent "+pagesId+" 0 R /MediaBox [0 0 612 792] /Resources << /Font << /FR "+font+" 0 R /FB "+bold+" 0 R >> >> /Contents "+content+" 0 R >>");
  refs.push(page);
 }
 objs[pagesId]="<< /Type /Pages /Count "+pages+" /Kids ["+refs.map(id=>id+" 0 R").join(" ")+"] >>";
 objs[catalogId]="<< /Type /Catalog /Pages "+pagesId+" 0 R >>";
 let out="%PDF-1.4\n";const offsets:number[]=[0];
 for(let i=1;i<objs.length;i++){offsets.push(Buffer.byteLength(out,"latin1"));out+=i+" 0 obj\n"+objs[i]+"\nendobj\n";}
 const xref=Buffer.byteLength(out,"latin1");
 out+="xref\n0 "+objs.length+"\n0000000000 65535 f \n";
 for(const n of offsets.slice(1))out+=String(n).padStart(10,"0")+" 00000 n \n";
 out+="trailer\n<< /Size "+objs.length+" /Root "+catalogId+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
 return Buffer.from(out,"latin1");
}
