import type {Config,Data} from "@puckeditor/core";
import {safeWebImageUrl} from "./web-services-site";

type ButtonProps={label?:string;url?:string};
function safeLink(value:unknown):string{
 if(typeof value!=="string"||value.length>450)return "#contacto";
 const input=value.trim();
 if(/^#[a-z0-9-]{1,60}$/i.test(input))return input;
 if(/^(mailto:[^\s<>]+@[^\s<>]+|tel:\+?[0-9 ()-]{7,25})$/i.test(input))return input;
 try{
  const u=new URL(input);
  if(["https:","http:"].includes(u.protocol)&&!u.username&&!u.password)return u.href;
 }catch{/* No offsite unsafe protocols. */}
 return "#contacto";
}
function ContactButton({label,url}:ButtonProps){
 return <a className="vmv-site-button" href={safeLink(url)}>{label||"Contáctanos"} <span>↗</span></a>;
}
export const VMV_BUILDER_BLOCKS=[
 "Hero","Heading","Text","Image","Services","Benefits","CTA","Quote","Spacer","FAQ","Contact"
] as const;
type BlockName=typeof VMV_BUILDER_BLOCKS[number];
const text=(limit:number)=>(value:unknown)=>typeof value==="string"?value.slice(0,limit):"";
const fieldSchema:Record<BlockName,Record<string,(value:unknown)=>string>>={
 Hero:{eyebrow:text(70),title:text(160),description:text(650),buttonText:text(45),buttonUrl:text(450)},
 Heading:{text:text(170),subtitle:text(350)},
 Text:{title:text(120),body:text(1800)},
 Image:{url:text(450),alt:text(140),caption:text(180)},
 Services:{title:text(120),first:text(85),second:text(85),third:text(85)},
 Benefits:{title:text(110),first:text(180),second:text(180),third:text(180)},
 CTA:{title:text(130),description:text(330),buttonText:text(45),buttonUrl:text(450)},
 Quote:{quote:text(500),author:text(90)},
 Spacer:{height:text(5)},
 FAQ:{title:text(110),q1:text(170),a1:text(450),q2:text(170),a2:text(450)},
 Contact:{title:text(110),description:text(450),email:text(180),phone:text(36),address:text(180)}
};
export function normalizeBuilderDocument(input:unknown):Data{
 const raw=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const list=Array.isArray(raw.content)?raw.content:[];
 const used=new Set<string>();
 const content=list.slice(0,75).flatMap((node,index)=>{
  if(!node||typeof node!=="object"||Array.isArray(node))return [];
  const value=node as Record<string,unknown>;
  const kind=value.type as BlockName;
  if(!VMV_BUILDER_BLOCKS.includes(kind))return [];
  const props=value.props&&typeof value.props==="object"&&!Array.isArray(value.props)?value.props as Record<string,unknown>:{};
  let id=typeof props.id==="string"&&/^[a-z0-9-]{3,80}$/i.test(props.id)?props.id:"node-"+index;
  if(used.has(id))id="node-"+index;
  used.add(id);
  const safe:Record<string,string>={id};
  for(const [field,sanitize] of Object.entries(fieldSchema[kind])){
   if(field==="url")safe[field]=safeWebImageUrl(sanitize(props[field]))||"";
   else if(field==="buttonUrl")safe[field]=safeLink(sanitize(props[field]));
   else safe[field]=sanitize(props[field]);
  }
  if(kind==="Spacer"&&!["24","48","80"].includes(safe.height))safe.height="48";
  return [{type:kind,props:safe}];
 });
 return {content,root:{props:{}}} as Data;
}
export function starterBuilderDocument(name="Mi negocio"):Data{
 return normalizeBuilderDocument({content:[
  {type:"Hero",props:{id:"hero-start",eyebrow:"BIENVENIDOS",title:"Algo extraordinario empieza aquí.",description:"Descubre lo que hace único a "+name+".",buttonText:"Contáctanos",buttonUrl:"#contacto"}},
  {type:"Services",props:{id:"services-start",title:"Nuestros servicios",first:"Servicio principal",second:"Atención personalizada",third:"Calidad que inspira"}},
  {type:"Text",props:{id:"about-start",title:"Nuestra historia",body:"Cuenta tu historia y conecta con tus clientes."}},
  {type:"Contact",props:{id:"contact-start",title:"Hablemos",description:"Será un placer atenderte.",email:"",phone:"",address:""}}
 ]});
}
const basicText={type:"text" as const};
export const builderConfig:Config={
 components:{
  Hero:{
   label:"Portada destacada",
   fields:{eyebrow:basicText,title:{type:"textarea"},description:{type:"textarea"},buttonText:basicText,buttonUrl:basicText},
   defaultProps:{eyebrow:"TU NEGOCIO",title:"Creamos algo extraordinario",description:"Una experiencia hecha para ti.",buttonText:"Hablemos",buttonUrl:"#contacto"},
   render:({eyebrow,title,description,buttonText,buttonUrl})=><section className="vmv-site-hero">
    <span className="vmv-site-kicker">{eyebrow}</span><h1>{title}</h1><p>{description}</p>
    <ContactButton label={buttonText} url={buttonUrl}/>
   </section>
  },
  Heading:{
   label:"Título",
   fields:{text:basicText,subtitle:{type:"textarea"}},
   defaultProps:{text:"Un título memorable",subtitle:"Un subtítulo breve y claro"},
   render:({text:heading,subtitle})=><section className="vmv-site-section vmv-site-heading">
    <h2>{heading}</h2>{subtitle?<p>{subtitle}</p>:null}
   </section>
  },
  Text:{
   label:"Texto",
   fields:{title:basicText,body:{type:"textarea"}},
   defaultProps:{title:"Acerca de nosotros",body:"Escribe aquí la historia de tu negocio."},
   render:({title,body})=><section className="vmv-site-section vmv-site-copy"><h2>{title}</h2><p>{body}</p></section>
  },
  Image:{
   label:"Imagen",
   fields:{url:basicText,alt:basicText,caption:basicText},
   defaultProps:{url:"",alt:"",caption:""},
   render:({url,alt,caption})=><figure className="vmv-site-image">
    {safeWebImageUrl(url)?<img src={safeWebImageUrl(url)||""} alt={alt||"Imagen del negocio"}/>:<div className="vmv-site-image-placeholder">Añade una imagen de tu biblioteca</div>}
    {caption?<figcaption>{caption}</figcaption>:null}
   </figure>
  },
  Services:{
   label:"Servicios",
   fields:{title:basicText,first:basicText,second:basicText,third:basicText},
   defaultProps:{title:"Lo que hacemos",first:"Servicio uno",second:"Servicio dos",third:"Servicio tres"},
   render:({title,first,second,third})=><section className="vmv-site-section vmv-site-services">
    <h2>{title}</h2><div>{[first,second,third].filter(Boolean).map((service:string,i:number)=><article key={i}><small>0{i+1}</small><h3>{service}</h3></article>)}</div>
   </section>
  },
  Benefits:{
   label:"Beneficios",
   fields:{title:basicText,first:{type:"textarea"},second:{type:"textarea"},third:{type:"textarea"}},
   defaultProps:{title:"¿Por qué elegirnos?",first:"Calidad superior",second:"Atención cercana",third:"Resultados a medida"},
   render:({title,first,second,third})=><section className="vmv-site-section vmv-site-benefits">
    <h2>{title}</h2><div>{[first,second,third].filter(Boolean).map((s:string,i:number)=><article key={i}><span aria-hidden="true">✳</span><p>{s}</p></article>)}</div>
   </section>
  },
  CTA:{
   label:"Llamada a la acción",
   fields:{title:basicText,description:{type:"textarea"},buttonText:basicText,buttonUrl:basicText},
   defaultProps:{title:"¿Comenzamos?",description:"Cuéntanos qué necesitas.",buttonText:"Contáctanos",buttonUrl:"#contacto"},
   render:({title,description,buttonText,buttonUrl})=><section className="vmv-site-cta"><h2>{title}</h2><p>{description}</p><ContactButton label={buttonText} url={buttonUrl}/></section>
  },
  Quote:{
   label:"Testimonio",
   fields:{quote:{type:"textarea"},author:basicText},
   defaultProps:{quote:"La experiencia fue excepcional.",author:"Cliente"},
   render:({quote,author})=><blockquote className="vmv-site-quote"><p>“{quote}”</p><footer>{author}</footer></blockquote>
  },
  Spacer:{
   label:"Separador",
   fields:{height:{type:"select",options:[{label:"Pequeño",value:"24"},{label:"Mediano",value:"48"},{label:"Grande",value:"80"}]}},
   defaultProps:{height:"48"},
   render:({height})=><div aria-hidden="true" style={{height:["24","48","80"].includes(height)?Number(height):48}}/>
  },
  FAQ:{
   label:"Preguntas frecuentes",
   fields:{title:basicText,q1:basicText,a1:{type:"textarea"},q2:basicText,a2:{type:"textarea"}},
   defaultProps:{title:"Preguntas frecuentes",q1:"¿Cómo puedo solicitar información?",a1:"Puedes escribirnos por correo.",q2:"¿Dónde nos encontramos?",a2:"Contáctanos para conocer más."},
   render:({title,q1,a1,q2,a2})=><section className="vmv-site-section vmv-site-faq">
    <h2>{title}</h2>{[[q1,a1],[q2,a2]].filter(([q])=>Boolean(q)).map(([q,a],i:number)=><details key={i}><summary>{q}</summary><p>{a}</p></details>)}
   </section>
  },
  Contact:{
   label:"Información de contacto",
   fields:{title:basicText,description:{type:"textarea"},email:basicText,phone:basicText,address:{type:"textarea"}},
   defaultProps:{title:"Conversemos",description:"Estamos aquí para ayudarte.",email:"",phone:"",address:""},
   render:({title,description,email,phone,address})=><section id="contacto" className="vmv-site-section vmv-site-contact">
    <h2>{title}</h2><p>{description}</p>
    {typeof email==="string"&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?<a href={"mailto:"+email}>{email}</a>:null}
    {typeof phone==="string"&&/^\+?[\d ()-]{7,36}$/.test(phone)?<a href={"tel:"+phone.replace(/[^\d+]/g,"")}>{phone}</a>:null}
    {address?<p>{address}</p>:null}
   </section>
  }
 }
};
