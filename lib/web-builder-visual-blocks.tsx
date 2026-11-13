import type {Config} from "@puckeditor/core";
import {FieldGroup} from "@puckeditor/core";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {safeWebImageUrl} from "./web-services-site";

export type VisualBlockName="HeroVisual"|"OfferingGrid"|"PhotoGallery"|"ProcessSteps"|"ProjectShowcase"|"HoursArea"|"TeamGrid"|"PricingList"|"BeforeAfter"|"FAQList";
type VisualProps=Record<string,unknown>;
const heading=(value:unknown)=>typeof value==="string"?value:"";
const photo=(url:unknown)=>typeof url==="string"?safeWebImageUrl(url):null;
const imgField={type:"custom" as const,render:({value,onChange}:{value?:unknown;onChange:(url:string)=>void})=>
 <BuilderImageField value={typeof value==="string"?value:""} onChange={onChange}/>};
const styleFields={
 layout:{type:"select" as const,options:[{label:"Cuadrícula",value:"grid"},{label:"Mosaico",value:"mosaic"},{label:"Lista",value:"list"}]},
 padding:{type:"select" as const,options:[{label:"Compacto",value:"compact"},{label:"Normal",value:"normal"},{label:"Amplio",value:"spacious"}]},
 surface:{type:"select" as const,options:[{label:"Claro",value:"light"},{label:"Suave",value:"soft"},{label:"Oscuro",value:"dark"}]}
};
const imageAlt=(value:string,description?:string)=>description?.trim()||value||"Imagen del negocio";
const emptyItem=(value:unknown)=>Boolean(value&&typeof value==="object");
const toList=(value:unknown)=>Array.isArray(value)?value.filter(emptyItem).slice(0,40) as VisualProps[]:[];
function ItemImage({src,alt,style}:{src:unknown;alt:string;style?:React.CSSProperties}){
 const url=photo(src);
 return <div className="vmv-visual-media" style={style}>{url?<img src={url} alt={alt} loading="lazy"/>:
 <div className="vmv-media-empty" aria-label="Imagen pendiente"><span aria-hidden="true">✧</span><small>Agregar fotografía</small></div>}</div>;
}
function Section({children,mode,padding,className=""}:{children:React.ReactNode;mode?:string;padding?:string;className?:string}){
 return <section className={"vmv-visual-section "+className} data-surface={["light","soft","dark"].includes(mode||"")?mode:"light"}
  data-padding={["compact","normal","spacious"].includes(padding||"")?padding:"normal"}>{children}</section>;
}
const titleField={type:"text" as const};
const textArea={type:"textarea" as const};
const listItemFields={
 title:titleField,description:textArea,image:imgField,alt:titleField,price:titleField
};
export const visualBlocks:Config["components"]={
 HeroVisual:{
  label:"Portada con fotografía",
  fields:{
   layout:{type:"select",options:[{label:"Dividida",value:"split"},{label:"Fondo completo",value:"cover"},{label:"Editorial",value:"editorial"}]},
   eyebrow:titleField,title:textArea,description:textArea,buttonText:titleField,buttonUrl:titleField,
   image:imgField,imageAlt:titleField,
   align:{type:"select",options:[{label:"Izquierda",value:"left"},{label:"Centro",value:"center"}]},
   imagePosition:{type:"select",options:[{label:"Centro",value:"center"},{label:"Arriba",value:"top"},{label:"Abajo",value:"bottom"},{label:"Izquierda",value:"left"},{label:"Derecha",value:"right"}]},
   shade:{type:"select",options:[{label:"Suave",value:"soft"},{label:"Medio",value:"medium"},{label:"Alto contraste",value:"strong"}]},
   height:{type:"select",options:[{label:"Normal",value:"normal"},{label:"Alta",value:"tall"}]},
   buttonStyle:{type:"select",options:[{label:"Sólido",value:"solid"},{label:"Contorno",value:"outline"},{label:"Enlace",value:"link"}]}
  },
  defaultProps:{layout:"split",eyebrow:"",title:"Presenta tu negocio",description:"",buttonText:"Contactar",buttonUrl:"#contacto",image:"",imageAlt:"",align:"left",imagePosition:"center",shade:"medium",height:"normal",buttonStyle:"solid"},
  renderFields:({fields})=><>
   <FieldGroup label="Contenido">{fields.eyebrow}{fields.title}{fields.description}{fields.buttonText}{fields.buttonUrl}</FieldGroup>
   <FieldGroup label="Diseño">{fields.layout}{fields.align}{fields.height}{fields.buttonStyle}</FieldGroup>
   <FieldGroup label="Imagen">{fields.image}{fields.imageAlt}{fields.imagePosition}{fields.shade}</FieldGroup>
  </>,
  render:({layout,eyebrow,title,description,buttonText,buttonUrl,image,imageAlt,align,imagePosition,shade,height,buttonStyle})=>{
   const href=typeof buttonUrl==="string"&&(buttonUrl.startsWith("#")||buttonUrl.startsWith("mailto:")||buttonUrl.startsWith("tel:"))?buttonUrl:"#contacto";
   const position=["top","bottom","left","right"].includes(imagePosition)?imagePosition:"center";
   const media=photo(image);
   return <section className="vmv-hero-visual" data-layout={layout||"split"} data-align={align||"left"}
    data-shade={shade||"medium"} data-height={height||"normal"}>
    {layout==="cover"?<div className="vmv-hero-cover" style={media?{backgroundImage:"url('"+media.replaceAll("'","%27")+"')",backgroundPosition:position}:undefined} aria-hidden="true"/>:null}
    <div className="vmv-hero-content">
     {eyebrow?<span className="vmv-hero-eyebrow">{eyebrow}</span>:null}
     <h1>{title||"Presenta tu negocio"}</h1>
     {description?<p>{description}</p>:null}
     <a className="vmv-site-button" data-button-style={buttonStyle||"solid"} href={href}>{buttonText||"Contactar"} <span aria-hidden="true">↗</span></a>
    </div>
    {layout!=="cover"?<div className="vmv-hero-image"><ItemImage src={image} alt={imageAlt||imageAlt("Portada",heading(title))}
     style={{"--vmv-image-position":position} as React.CSSProperties}/></div>:null}
   </section>;
  }
 },
 OfferingGrid:{
  label:"Productos y servicios",
  fields:{
   title:titleField,description:textArea,
   items:{type:"array",arrayFields:listItemFields,defaultItemProps:{title:"",description:"",image:"",alt:"",price:""},
    getItemSummary:(item)=>item.title||"Nuevo elemento"},
   layout:styleFields.layout,padding:styleFields.padding,surface:styleFields.surface,
   columns:{type:"select",options:[{label:"Dos columnas",value:"2"},{label:"Tres columnas",value:"3"}]},
   showPrices:{type:"radio",options:[{label:"Ocultar",value:"no"},{label:"Mostrar si se informan",value:"yes"}]}
  },
  defaultProps:{title:"Lo que ofrecemos",description:"",items:[],layout:"grid",padding:"normal",surface:"light",columns:"3",showPrices:"no"},
  renderFields:({fields})=><>
   <FieldGroup label="Contenido">{fields.title}{fields.description}{fields.items}</FieldGroup>
   <FieldGroup label="Diseño">{fields.layout}{fields.columns}{fields.padding}{fields.surface}{fields.showPrices}</FieldGroup>
  </>,
  render:({title,description,items,layout,padding,surface,columns,showPrices})=><Section mode={surface} padding={padding} className="vmv-offerings">
   <div className="vmv-section-heading"><h2>{title}</h2>{description?<p>{description}</p>:null}</div>
   <div className="vmv-offerings-items" data-layout={layout||"grid"} data-columns={columns||"3"}>
    {toList(items).map((item,index)=><article key={index} className="vmv-offering-card">
     <ItemImage src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))}/>
     <div className="vmv-offering-copy">{item.title?<h3>{heading(item.title)}</h3>:<h3>Nuevo elemento</h3>}
      {item.description?<p>{heading(item.description)}</p>:null}
      {showPrices==="yes"&&item.price?<strong className="vmv-offering-price">{heading(item.price)}</strong>:null}
     </div>
    </article>)}
   </div>
  </Section>
 },
 PhotoGallery:{
  label:"Galería visual",
  fields:{
   title:titleField,description:textArea,
   items:{type:"array",arrayFields:{image:imgField,alt:titleField,caption:titleField},
    defaultItemProps:{image:"",alt:"",caption:""},getItemSummary:(item)=>item.caption||"Fotografía"},
   layout:styleFields.layout,padding:styleFields.padding,surface:styleFields.surface
  },
  defaultProps:{title:"Una mirada a nuestro trabajo",description:"",items:[],layout:"mosaic",padding:"normal",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.description}{fields.items}</FieldGroup>
   <FieldGroup label="Diseño">{fields.layout}{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,description,items,layout,padding,surface})=><Section mode={surface} padding={padding} className="vmv-gallery-section">
   <div className="vmv-section-heading"><h2>{title}</h2>{description?<p>{description}</p>:null}</div>
   <div className="vmv-gallery-items" data-layout={layout||"mosaic"}>{toList(items).map((item,index)=><figure key={index}>
    <ItemImage src={item.image} alt={imageAlt(heading(item.caption),heading(item.alt))}/>
    {item.caption?<figcaption>{heading(item.caption)}</figcaption>:null}
   </figure>)}</div>
  </Section>
 },
 ProcessSteps:{
  label:"Proceso de trabajo",
  fields:{title:titleField,
   items:{type:"array",arrayFields:{title:titleField,description:textArea},
    defaultItemProps:{title:"Paso",description:""},getItemSummary:(item)=>item.title||"Paso"},
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Cómo trabajamos",items:[],padding:"normal",surface:"soft"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.items}</FieldGroup><FieldGroup label="Diseño">{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,items,padding,surface})=><Section mode={surface} padding={padding} className="vmv-process">
   <h2>{title}</h2><ol>{toList(items).map((item,index)=><li key={index}>
    <span>{String(index+1).padStart(2,"0")}</span><h3>{heading(item.title)}</h3><p>{heading(item.description)}</p>
   </li>)}</ol>
  </Section>
 },
 ProjectShowcase:{
  label:"Proyectos realizados",
  fields:{title:titleField,
   items:{type:"array",arrayFields:{title:titleField,description:textArea,image:imgField,alt:titleField},
    defaultItemProps:{title:"",description:"",image:"",alt:""},getItemSummary:(item)=>item.title||"Proyecto"},
   layout:styleFields.layout,padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Proyectos",items:[],layout:"mosaic",padding:"spacious",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.items}</FieldGroup><FieldGroup label="Diseño">{fields.layout}{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,items,layout,padding,surface})=><Section mode={surface} padding={padding} className="vmv-gallery-section">
   <h2>{title}</h2><div className="vmv-gallery-items" data-layout={layout||"mosaic"}>{toList(items).map((item,i)=><figure key={i}>
    <ItemImage src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))}/>
    {item.title||item.description?<figcaption><strong>{heading(item.title)}</strong><p>{heading(item.description)}</p></figcaption>:null}
   </figure>)}</div>
  </Section>
 },
 HoursArea:{
  label:"Horarios y zona",
  fields:{title:titleField,hours:textArea,area:textArea,notes:textArea,
   surface:styleFields.surface,padding:styleFields.padding},
  defaultProps:{title:"Horario y zona de atención",hours:"",area:"",notes:"",surface:"soft",padding:"normal"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.hours}{fields.area}{fields.notes}</FieldGroup><FieldGroup label="Diseño">{fields.surface}{fields.padding}</FieldGroup></>,
  render:({title,hours,area,notes,surface,padding})=><Section mode={surface} padding={padding} className="vmv-hours">
   <h2>{title}</h2><div><article><small>HORARIO</small><p>{hours||"Consulta disponibilidad"}</p></article>
    <article><small>ZONA</small><p>{area||"Consulta nuestra área de atención"}</p></article></div>
   {notes?<p>{notes}</p>:null}
  </Section>
 },
 TeamGrid:{
  label:"Equipo",
  fields:{title:titleField,items:{type:"array",arrayFields:{title:titleField,description:textArea,image:imgField,alt:titleField},
   defaultItemProps:{title:"",description:"",image:"",alt:""},getItemSummary:(item)=>item.title||"Integrante"},
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Nuestro equipo",items:[],padding:"normal",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.items}</FieldGroup><FieldGroup label="Diseño">{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,items,padding,surface})=><Section mode={surface} padding={padding} className="vmv-team">
   <h2>{title}</h2><div>{toList(items).map((item,i)=><article key={i}>
    <ItemImage src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))}/>
    <h3>{heading(item.title)}</h3><p>{heading(item.description)}</p>
   </article>)}</div>
  </Section>
 },
 PricingList:{
  label:"Lista de precios",
  fields:{title:titleField,
   items:{type:"array",arrayFields:{title:titleField,description:textArea,price:titleField},
    defaultItemProps:{title:"",description:"",price:""},getItemSummary:(item)=>item.title||"Concepto"},
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Precios",items:[],padding:"normal",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.items}</FieldGroup><FieldGroup label="Diseño">{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,items,padding,surface})=><Section mode={surface} padding={padding} className="vmv-price-list">
   <h2>{title}</h2><dl>{toList(items).map((item,i)=><div key={i}>
    <dt>{heading(item.title)}{item.description?<small>{heading(item.description)}</small>:null}</dt>
    <dd>{heading(item.price)||"Consultar"}</dd>
   </div>)}</dl>
  </Section>
 },
 BeforeAfter:{
  label:"Antes y después",
  fields:{title:titleField,beforeImage:imgField,afterImage:imgField,beforeAlt:titleField,afterAlt:titleField,
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Antes y después",beforeImage:"",afterImage:"",beforeAlt:"Antes",afterAlt:"Después",padding:"normal",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}</FieldGroup>
   <FieldGroup label="Imagen">{fields.beforeImage}{fields.beforeAlt}{fields.afterImage}{fields.afterAlt}</FieldGroup>
   <FieldGroup label="Diseño">{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,beforeImage,afterImage,beforeAlt,afterAlt,padding,surface})=><Section mode={surface} padding={padding} className="vmv-before-after">
   <h2>{title}</h2><div><figure><ItemImage src={beforeImage} alt={heading(beforeAlt)||"Antes"}/><figcaption>Antes</figcaption></figure>
    <figure><ItemImage src={afterImage} alt={heading(afterAlt)||"Después"}/><figcaption>Después</figcaption></figure></div>
  </Section>
 },
 FAQList:{
  label:"Preguntas frecuentes",
  fields:{title:titleField,items:{type:"array",arrayFields:{question:titleField,answer:textArea},
   defaultItemProps:{question:"",answer:""},getItemSummary:(item)=>item.question||"Pregunta"},
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Preguntas frecuentes",items:[],padding:"normal",surface:"light"},
  renderFields:({fields})=><><FieldGroup label="Contenido">{fields.title}{fields.items}</FieldGroup>
   <FieldGroup label="Diseño">{fields.padding}{fields.surface}</FieldGroup></>,
  render:({title,items,padding,surface})=><Section mode={surface} padding={padding} className="vmv-site-faq">
   <h2>{title}</h2>{toList(items).map((item,i)=><details key={i}><summary>{heading(item.question)}</summary>
    <p>{heading(item.answer)}</p></details>)}
  </Section>
 }
};
const SCHEMA:Record<VisualBlockName,{strings:string[];images:string[];arrays?:Record<string,{strings:string[];images:string[]}>}>={
 HeroVisual:{strings:["layout","eyebrow","title","description","buttonText","buttonUrl","imageAlt","align","imagePosition","shade","height","buttonStyle"],images:["image"]},
 OfferingGrid:{strings:["title","description","layout","padding","surface","columns","showPrices"],images:[],arrays:{items:{strings:["title","description","alt","price"],images:["image"]}}},
 PhotoGallery:{strings:["title","description","layout","padding","surface"],images:[],arrays:{items:{strings:["alt","caption"],images:["image"]}}},
 ProcessSteps:{strings:["title","padding","surface"],images:[],arrays:{items:{strings:["title","description"],images:[]}}},
 ProjectShowcase:{strings:["title","layout","padding","surface"],images:[],arrays:{items:{strings:["title","description","alt"],images:["image"]}}},
 HoursArea:{strings:["title","hours","area","notes","padding","surface"],images:[]},
 TeamGrid:{strings:["title","padding","surface"],images:[],arrays:{items:{strings:["title","description","alt"],images:["image"]}}},
 PricingList:{strings:["title","padding","surface"],images:[],arrays:{items:{strings:["title","description","price"],images:[]}}},
 BeforeAfter:{strings:["title","padding","surface","beforeAlt","afterAlt"],images:["beforeImage","afterImage"]},
 FAQList:{strings:["title","padding","surface"],images:[],arrays:{items:{strings:["question","answer"],images:[]}}}
};
export const VISUAL_BLOCK_NAMES=Object.keys(SCHEMA) as VisualBlockName[];
export function normalizeVisualProps(type:VisualBlockName,props:Record<string,unknown>):Record<string,unknown>{
 const schema=SCHEMA[type];const safe:Record<string,unknown>={};
 for(const field of schema.strings){
  const max=["description","answer","hours","notes"].includes(field)?1200:field==="title"?180:field==="buttonUrl"?450:250;
  let value=typeof props[field]==="string"?props[field].slice(0,max):"";
  if(field==="buttonUrl"&&value&&!/^(#[a-z0-9-]{1,70}|mailto:[^<> ]+|tel:\+?[\d ()-]{7,36})$/i.test(value))value="#contacto";
  safe[field]=value;
 }
 for(const field of schema.images)safe[field]=photo(props[field])||"";
 if(schema.arrays)for(const [key,itemFields] of Object.entries(schema.arrays)){
  const items=Array.isArray(props[key])?props[key].slice(0,40):[];
  safe[key]=items.filter((x:unknown)=>x&&typeof x==="object"&&!Array.isArray(x)).map((raw:Record<string,unknown>)=>{
   const item:Record<string,string>={};
   for(const field of itemFields.strings)item[field]=typeof raw[field]==="string"?raw[field].slice(0,700):"";
   for(const field of itemFields.images)item[field]=photo(raw[field])||"";
   return item;
  });
 }
 return safe;
}
