import type {Config,Data} from "@puckeditor/core";
import type {CSSProperties} from "react";
import {safeWebImageUrl,webPrimaryContact,type WebSiteContent} from "./web-services-site";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {visualBlocks,VISUAL_BLOCK_NAMES,normalizeVisualProps,type VisualBlockName} from "./web-builder-visual-blocks";

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
 "Hero","Heading","Text","Image","Services","Benefits","CTA","Quote","Spacer","FAQ","Contact",...VISUAL_BLOCK_NAMES
] as const;
type BlockName=typeof VMV_BUILDER_BLOCKS[number];
const text=(limit:number)=>(value:unknown)=>typeof value==="string"?value.slice(0,limit):"";
const fieldSchema:Partial<Record<BlockName,Record<string,(value:unknown)=>string>>>= {
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
  if(VISUAL_BLOCK_NAMES.includes(kind as VisualBlockName)){
   return [{type:kind,props:{id,...normalizeVisualProps(kind as VisualBlockName,props)}}];
  }
  const safe:Record<string,string>={id};
  for(const [field,sanitize] of Object.entries(fieldSchema[kind]||{})){
   if(field==="url")safe[field]=safeWebImageUrl(sanitize(props[field]))||"";
   else if(field==="buttonUrl")safe[field]=safeLink(sanitize(props[field]));
   else safe[field]=sanitize(props[field]);
  }
  if(kind==="Spacer"&&!["24","48","80"].includes(safe.height))safe.height="48";
  return [{type:kind,props:safe}];
 });
 const sourceRoot=raw.root&&typeof raw.root==="object"?raw.root as Record<string,unknown>:{};
 const rawProps=sourceRoot.props&&typeof sourceRoot.props==="object"?sourceRoot.props as Record<string,unknown>:{};
 const palette=["violet","mint","amber","ink","rose","forest","ocean","terracotta","charcoal"].includes(String(rawProps.palette))?String(rawProps.palette):"violet";
 const font=["modern","editorial","rounded","geometric"].includes(String(rawProps.font))?String(rawProps.font):"modern";
 const style=["light","dark","warm","editorial","bold"].includes(String(rawProps.style))?String(rawProps.style):"light";
 const width=["regular","wide"].includes(String(rawProps.width))?String(rawProps.width):"regular";
 const motion=rawProps.motion==="subtle"?"subtle":"off";
 const accent=typeof rawProps.accentColor==="string"&&/^#[0-9a-f]{6}$/i.test(rawProps.accentColor)?rawProps.accentColor:"";
 const logo=safeWebImageUrl(String(rawProps.logo||""))||"";
 return {content,root:{props:{palette,font,style,width,motion,accentColor:accent,logo}}} as Data;
}
export function starterBuilderDocument(name="Mi negocio",categoryId=""):Data{
 const bakery=["bakery","catering","cafe","restaurant","food-truck"].includes(categoryId);
 const home=["carpentry","general-contractor","home-builder","remodeling","smart-home","plumbing","electrical","roofing","landscaping","painting"].includes(categoryId);
 const hero=bakery?"Momentos dulces que recordarás siempre.":home?"Construimos espacios para vivir mejor.":"Algo extraordinario empieza aquí.";
 const services=bakery?["Pasteles personalizados","Eventos especiales","Pedidos a medida"]:
  home?["Proyectos residenciales","Renovaciones","Atención personalizada"]:
  ["Servicio principal","Atención personalizada","Calidad que inspira"];
 return normalizeBuilderDocument({content:[
  {type:"Hero",props:{id:"hero-start",eyebrow:"BIENVENIDOS",title:hero,description:"Descubre lo que hace único a "+name+".",buttonText:"Contáctanos",buttonUrl:"#contacto"}},
  {type:"Services",props:{id:"services-start",title:"Nuestros servicios",first:services[0],second:services[1],third:services[2]}},
  {type:"Text",props:{id:"about-start",title:"Nuestra historia",body:"Cuenta tu historia y conecta con tus clientes."}},
  {type:"Contact",props:{id:"contact-start",title:"Hablemos",description:"Será un placer atenderte.",email:"",phone:"",address:""}}
 ]});
}
/** Bring an owner's classic Web Services draft into Puck without changing the original site. */
export function importLegacyBuilderDocument(legacy:WebSiteContent):Data{
 const items:Array<{type:string;props:Record<string,string>}>=[];
 const add=(type:string,id:string,props:Record<string,string>)=>items.push({type,props:{id,...props}});
 add("Hero","legacy-hero",{
  eyebrow:legacy.eyebrow||"BIENVENIDOS",title:legacy.headline||legacy.business,
  description:legacy.intro,buttonText:legacy.action||"Contáctanos",
  buttonUrl:webPrimaryContact(legacy).href
 });
 if(legacy.heroImage)add("Image","legacy-cover",{url:legacy.heroImage,alt:"Portada de "+legacy.business,caption:""});
 const services=legacy.services.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 for(let i=0;i<services.length;i+=3){
  add("Services","legacy-services-"+i,{
   title:i===0?"Nuestros servicios":"Más servicios",
   first:services[i]||"",second:services[i+1]||"",third:services[i+2]||""
  });
 }
 if(legacy.about)add("Text","legacy-about",{title:"Sobre nosotros",body:legacy.about});
 legacy.gallery.forEach((url,i)=>add("Image","legacy-gallery-"+i,{url,alt:"Galería de "+legacy.business,caption:""}));
 add("Contact","legacy-contact",{title:"Contáctanos",description:legacy.intro,
  email:legacy.email,phone:legacy.phone,address:legacy.address});
 const normalized=normalizeBuilderDocument({content:items});
 return {...normalized,root:{props:{palette:legacy.palette,font:"modern"}}} as Data;
}
const basicText={type:"text" as const};
export const builderConfig:Config={
 root:{
  fields:{
   palette:{type:"select",options:[
    {label:"Lavanda",value:"violet"},{label:"Menta",value:"mint"},
    {label:"Dorado",value:"amber"},{label:"Grafito",value:"ink"},
    {label:"Rosa suave",value:"rose"},{label:"Bosque",value:"forest"},
    {label:"Océano",value:"ocean"},{label:"Terracota",value:"terracotta"},
    {label:"Carbón",value:"charcoal"}
   ]},
   font:{type:"select",options:[
    {label:"Moderna",value:"modern"},{label:"Editorial",value:"editorial"},
    {label:"Redondeada",value:"rounded"},{label:"Geométrica",value:"geometric"}
   ]},
   style:{type:"select",options:[
    {label:"Claro",value:"light"},{label:"Oscuro",value:"dark"},
    {label:"Cálido",value:"warm"},{label:"Editorial",value:"editorial"},{label:"Atrevido",value:"bold"}
   ]},
   width:{type:"select",options:[{label:"Cómodo",value:"regular"},{label:"Amplio",value:"wide"}]},
   accentColor:{type:"text"},
   motion:{type:"select",options:[{label:"Sin animaciones",value:"off"},{label:"Suaves",value:"subtle"}]},
   logo:{type:"custom",render:({value,onChange})=><BuilderImageField value={typeof value==="string"?value:""} onChange={onChange}/>}

  },
  defaultProps:{palette:"violet",font:"modern",style:"light",width:"regular",motion:"off",accentColor:"",logo:""},
  render:({children,palette,font,style,width,motion,accentColor}:{children?:React.ReactNode;palette?:string;font?:string;style?:string;width?:string;motion?:string;accentColor?:string})=>{
   const colors:Record<string,{accent:string,pale:string}>={
    violet:{accent:"#8e5de4",pale:"#f0e9fd"},mint:{accent:"#198d74",pale:"#e5f8f0"},
    amber:{accent:"#a97b26",pale:"#fff4d8"},ink:{accent:"#30283a",pale:"#eae8ed"},
    rose:{accent:"#b64b70",pale:"#fff0f4"},forest:{accent:"#367457",pale:"#e9f4eb"},
    ocean:{accent:"#267a9c",pale:"#e8f6fb"},terracotta:{accent:"#af6242",pale:"#fbede2"},
    charcoal:{accent:"#24232b",pale:"#efedf2"}
   };
   const color=colors[palette||"violet"]||colors.violet;
   const fontFamily:Record<string,string>={
    modern:'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',
    editorial:'Georgia,"Times New Roman",serif',
    rounded:'"Trebuchet MS",ui-sans-serif,system-ui,sans-serif',
    geometric:'"Avenir Next",Montserrat,ui-sans-serif,system-ui,sans-serif'
   };
   const css={"--vmv-accent":/^#[0-9a-f]{6}$/i.test(accentColor||"")?accentColor:color.accent,
    "--vmv-pale":color.pale,fontFamily:fontFamily[font||"modern"]||fontFamily.modern
   } as CSSProperties;
   return <div className="vmv-site vmv-site-editor-canvas" data-site-style={style||"light"}
    data-site-width={width||"regular"} data-motion={motion||"off"} style={css}>{children}</div>;
  }
 },
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
   fields:{url:{type:"custom",render:({value,onChange})=><BuilderImageField value={typeof value==="string"?value:""} onChange={onChange}/>},alt:basicText,caption:basicText},
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
   defaultProps:{quote:"",author:""},
   render:({quote,author})=>quote?<blockquote className="vmv-site-quote"><p>“{quote}”</p>{author?<footer>{author}</footer>:null}</blockquote>:null
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
  },
  ...visualBlocks
 }
};
