import type {Config} from "@puckeditor/core";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {numericEditorField,colorEditorField} from "@/app/web-studio/BuilderContextFields";
import BuilderEditableImage from "@/app/web-studio/BuilderEditableImage";
import {imageSettingsField} from "@/app/web-studio/BuilderImageControls";
import {normalizeImageSettings} from "./web-builder-images";
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
const visualItemId=(item:VisualProps,index:number)=>typeof item.id==="string"&&/^[a-z0-9_-]{3,80}$/i.test(item.id)?item.id:"legacy-"+index;
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
   eyebrow:titleField,title:{type:"textarea",contentEditable:true},description:textArea,buttonText:titleField,buttonUrl:titleField,
   titleFont:{type:"select",options:[{label:"Fuente de la web",value:"site"},{label:"Moderna",value:"modern"},
    {label:"Editorial",value:"editorial"},{label:"Redondeada",value:"rounded"},
    {label:"Geométrica",value:"geometric"},{label:"Monoespaciada",value:"mono"}]},
   titleColor:colorEditorField("Color del título"),titleFontSize:numericEditorField("fontSize"),
   titleShadow:{type:"radio",options:[{label:"Sin sombra",value:"none"},
    {label:"Suave",value:"soft"},{label:"Marcada",value:"strong"}]},
   titleWeight:{type:"radio",options:[{label:"Ligera",value:"light"},{label:"Normal",value:"normal"},
    {label:"Negrita",value:"heavy"}]},
   titleItalic:{type:"radio",options:[{label:"Normal",value:"no"},{label:"Cursiva",value:"yes"}]},
   titleLink:{type:"text"},

   image:imgField,imageAlt:titleField,
   imageWidth:numericEditorField("imageWidth"),
   imageRadius:numericEditorField("imageRadius"),
   imageOpacity:numericEditorField("imageOpacity"),
   imageBorder:numericEditorField("imageBorder"),
   borderColor:colorEditorField("Color del borde"),
   imageMoveX:numericEditorField("imageMoveX"),
   imageMoveY:numericEditorField("imageMoveY"),
   align:{type:"select",options:[{label:"Izquierda",value:"left"},{label:"Centro",value:"center"}]},
   imagePosition:{type:"select",options:[{label:"Centro",value:"center"},{label:"Arriba",value:"top"},{label:"Abajo",value:"bottom"},{label:"Izquierda",value:"left"},{label:"Derecha",value:"right"}]},
   shade:{type:"select",options:[{label:"Suave",value:"soft"},{label:"Medio",value:"medium"},{label:"Alto contraste",value:"strong"}]},
   height:{type:"select",options:[{label:"Normal",value:"normal"},{label:"Alta",value:"tall"}]},
   buttonStyle:{type:"select",options:[{label:"Sólido",value:"solid"},{label:"Contorno",value:"outline"},{label:"Enlace",value:"link"}]}
  },
  defaultProps:{layout:"split",eyebrow:"",title:"Presenta tu negocio",description:"",buttonText:"Contactar",buttonUrl:"#contacto",image:"",imageAlt:"",align:"left",imagePosition:"center",shade:"medium",height:"normal",buttonStyle:"solid",imageWidth:100,imageRadius:0,imageOpacity:0,imageBorder:0,borderColor:"#30243F",imageMoveX:0,imageMoveY:0,titleFont:"site",titleColor:"",titleFontSize:0,titleShadow:"none",titleWeight:"normal",titleItalic:"no",titleLink:""},
  renderFields:({fields})=><>
   <fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.eyebrow}{fields.title}{fields.description}{fields.buttonText}{fields.buttonUrl}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Estilo del título</legend>{fields.titleFont}{fields.titleColor}
    {fields.titleFontSize}{fields.titleShadow}{fields.titleWeight}{fields.titleItalic}{fields.titleLink}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.layout}{fields.align}{fields.height}{fields.buttonStyle}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Imagen · Reemplazar y ajustar</legend>
    {fields.image}{fields.imageAlt}{fields.imageWidth}{fields.imageRadius}{fields.imageOpacity}
    {fields.imageBorder}{fields.borderColor}{fields.imageMoveX}{fields.imageMoveY}
    {fields.imagePosition}{fields.shade}</fieldset>
  </>,
  render:({id,layout,eyebrow,title,description,buttonText,buttonUrl,image,imageAlt,align,imagePosition,shade,height,buttonStyle,imageWidth,imageRadius,imageOpacity,imageBorder,borderColor,imageMoveX,imageMoveY,titleFont,titleColor,titleFontSize,titleShadow,titleWeight,titleItalic,titleLink,puck,...responsive})=>{
   const href=typeof buttonUrl==="string"&&(buttonUrl.startsWith("#")||buttonUrl.startsWith("mailto:")||buttonUrl.startsWith("tel:"))?buttonUrl:"#contacto";
   const position=["top","bottom","left","right"].includes(imagePosition)?imagePosition:"center";
   const media=photo(image);
   const settings={imageWidth,imageRadius,imageOpacity,imageBorder,borderColor,imageMoveX,imageMoveY,...responsive};
   const titleFonts:Record<string,string>={site:"inherit",modern:"Arial,sans-serif",editorial:"Georgia,serif",
    rounded:"Trebuchet MS,sans-serif",geometric:"Avenir Next,Arial,sans-serif",mono:"ui-monospace,monospace"};
   const titleStyle:React.CSSProperties={
    fontFamily:titleFonts[titleFont]||"inherit",
    color:typeof titleColor==="string"&&/^#[\da-f]{6}$/i.test(titleColor)?titleColor:undefined,
    fontSize:typeof titleFontSize==="number"&&titleFontSize>=12?titleFontSize+"px":undefined,
    textShadow:titleShadow==="strong"?"0 4px 14px rgba(0,0,0,.52)":
     titleShadow==="soft"?"0 2px 6px rgba(0,0,0,.25)":"none",
    fontWeight:titleWeight==="light"?400:titleWeight==="heavy"?850:undefined,
    fontStyle:titleItalic==="yes"?"italic":"normal"
   };
   const safeTitleLink=typeof titleLink==="string"&&
    /^(#[a-z0-9-]{1,70}|https:\/\/[^\s<>]+|mailto:[^\s<>]+|tel:\+?[\d ()-]{7,36})$/i.test(titleLink)?
    titleLink:"";
   return <section className="vmv-hero-visual" data-layout={layout||"split"} data-align={align||"left"}
    data-shade={shade||"medium"} data-height={height||"normal"} data-has-image={Boolean(media)||Boolean(puck.isEditing)}>
    {layout==="cover"?<div className="vmv-hero-cover">
     <BuilderEditableImage id={id} src={image} alt={imageAlt||"Imagen de portada"} settings={settings}
      radius={0} editing={puck.isEditing} position={position}/>
    </div>:null}
    <div className="vmv-hero-content">
     {eyebrow?<span className="vmv-hero-eyebrow">{eyebrow}</span>:null}
     <h1 style={titleStyle}>{safeTitleLink&&!puck.isEditing?
      <a href={safeTitleLink} style={{color:"inherit",textDecoration:"inherit"}}>{title||"Presenta tu negocio"}</a>:
      title||"Presenta tu negocio"}</h1>
     {description?<p>{description}</p>:null}
     <a className="vmv-site-button" data-button-style={buttonStyle||"solid"} href={href}>{buttonText||"Contactar"} <span aria-hidden="true">↗</span></a>
    </div>
    {layout!=="cover"&&(media||puck.isEditing)?<div className="vmv-hero-image">
     <BuilderEditableImage id={id} src={image} alt={imageAlt||"Imagen de portada"} settings={settings}
      radius={0} editing={puck.isEditing} position={position}/>
    </div>:null}
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
   <fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.description}{fields.items}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.layout}{fields.columns}{fields.padding}{fields.surface}{fields.showPrices}</fieldset>
  </>,
  render:({id,title,description,items,layout,padding,surface,columns,showPrices,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-offerings">
   <div className="vmv-section-heading"><h2>{title}</h2>{description?<p>{description}</p>:null}</div>
   <div className="vmv-offerings-items" data-layout={layout||"grid"} data-columns={columns||"3"}>
    {toList(items).map((item,index)=>!(item.title||item.description||item.price||photo(item.image))&&!puck.isEditing?null:<article key={visualItemId(item,index)} className="vmv-offering-card" data-has-photo={Boolean(photo(item.image))}>
     <BuilderEditableImage id={id} target={{field:"image",index,itemId:typeof item.id==="string"?item.id:undefined}} src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))} settings={item} editing={puck.isEditing}/>
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
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.description}{fields.items}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.layout}{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,description,items,layout,padding,surface,puck})=>!toList(items).some(item=>photo(item.image))&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-gallery-section">
   <div className="vmv-section-heading"><h2>{title}</h2>{description?<p>{description}</p>:null}</div>
   <div className="vmv-gallery-items" data-layout={layout||"mosaic"}>{toList(items).map((item,index)=><figure key={visualItemId(item,index)}>
    <BuilderEditableImage id={id} target={{field:"image",index,itemId:typeof item.id==="string"?item.id:undefined}} src={item.image} alt={imageAlt(heading(item.caption),heading(item.alt))} settings={item} editing={puck.isEditing}/>
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
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.items}</fieldset><fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,items,padding,surface,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-process">
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
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.items}</fieldset><fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.layout}{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,items,layout,padding,surface,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-gallery-section">
   <h2>{title}</h2><div className="vmv-gallery-items" data-layout={layout||"mosaic"}>{toList(items).map((item,index)=><figure key={visualItemId(item,index)}>
    <BuilderEditableImage id={id} target={{field:"image",index,itemId:typeof item.id==="string"?item.id:undefined}} src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))} settings={item} editing={puck.isEditing}/>
    {item.title||item.description?<figcaption><strong>{heading(item.title)}</strong><p>{heading(item.description)}</p></figcaption>:null}
   </figure>)}</div>
  </Section>
 },
 HoursArea:{
  label:"Horarios y zona",
  fields:{title:titleField,hours:textArea,area:textArea,notes:textArea,
   surface:styleFields.surface,padding:styleFields.padding},
  defaultProps:{title:"Horario y zona de atención",hours:"",area:"",notes:"",surface:"soft",padding:"normal"},
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.hours}{fields.area}{fields.notes}</fieldset><fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.surface}{fields.padding}</fieldset></>,
  render:({title,hours,area,notes,surface,padding,puck})=>!(hours||area||notes)&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-hours">
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
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.items}</fieldset><fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,items,padding,surface,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-team">
   <h2>{title}</h2><div>{toList(items).map((item,index)=><article key={visualItemId(item,index)}>
    <BuilderEditableImage id={id} target={{field:"image",index,itemId:typeof item.id==="string"?item.id:undefined}} src={item.image} alt={imageAlt(heading(item.title),heading(item.alt))} settings={item} editing={puck.isEditing}/>
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
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.items}</fieldset><fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,items,padding,surface,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-price-list">
   <h2>{title}</h2><dl>{toList(items).map((item,i)=><div key={i}>
    <dt>{heading(item.title)}{item.description?<small>{heading(item.description)}</small>:null}</dt>
    <dd>{heading(item.price)||"Consultar"}</dd>
   </div>)}</dl>
  </Section>
 },
 BeforeAfter:{
  label:"Antes y después",
  fields:{title:titleField,beforeImage:imgField,afterImage:imgField,beforeAlt:titleField,afterAlt:titleField,
   beforeImageSettings:imageSettingsField,afterImageSettings:imageSettingsField,
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Antes y después",beforeImage:"",afterImage:"",beforeAlt:"Antes",afterAlt:"Después",padding:"normal",surface:"light"},
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Imagen</legend>{fields.beforeImage}{fields.beforeAlt}{fields.beforeImageSettings}{fields.afterImage}{fields.afterAlt}{fields.afterImageSettings}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,beforeImage,afterImage,beforeAlt,afterAlt,beforeImageSettings,afterImageSettings,padding,surface,puck})=>!photo(beforeImage)&&!photo(afterImage)&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-before-after">
   <h2>{title}</h2><div><figure><BuilderEditableImage id={id} target={{field:"beforeImage"}} src={beforeImage} settings={beforeImageSettings} alt={heading(beforeAlt)||"Antes"} editing={puck.isEditing}/><figcaption>Antes</figcaption></figure>
    <figure><BuilderEditableImage id={id} target={{field:"afterImage"}} src={afterImage} settings={afterImageSettings} alt={heading(afterAlt)||"Después"} editing={puck.isEditing}/><figcaption>Después</figcaption></figure></div>
  </Section>
 },
 FAQList:{
  label:"Preguntas frecuentes",
  fields:{title:titleField,items:{type:"array",arrayFields:{question:titleField,answer:textArea},
   defaultItemProps:{question:"",answer:""},getItemSummary:(item)=>item.question||"Pregunta"},
   padding:styleFields.padding,surface:styleFields.surface},
  defaultProps:{title:"Preguntas frecuentes",items:[],padding:"normal",surface:"light"},
  renderFields:({fields})=><><fieldset className="vmv-puck-field-group"><legend>Contenido</legend>{fields.title}{fields.items}</fieldset>
   <fieldset className="vmv-puck-field-group"><legend>Diseño</legend>{fields.padding}{fields.surface}</fieldset></>,
  render:({id,title,items,padding,surface,puck})=>!toList(items).length&&!puck.isEditing?<></>:<Section mode={surface} padding={padding} className="vmv-site-faq">
   <h2>{title}</h2>{toList(items).map((item,i)=><details key={i}><summary>{heading(item.question)}</summary>
    <p>{heading(item.answer)}</p></details>)}
  </Section>
 }
};
const SCHEMA:Record<VisualBlockName,{strings:string[];images:string[];arrays?:Record<string,{strings:string[];images:string[]}>}>={
 HeroVisual:{strings:["layout","eyebrow","title","description","buttonText","buttonUrl","imageAlt","align","imagePosition","shade","height","buttonStyle","titleFont","titleColor","titleShadow","titleWeight","titleItalic","titleLink"],images:["image"]},
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
 if(type==="HeroVisual"){
  safe.titleFontSize=typeof props.titleFontSize==="number"&&Number.isFinite(props.titleFontSize)?
   Math.max(0,Math.min(110,Math.round(props.titleFontSize))):0;
  safe.titleFont=["site","modern","editorial","rounded","geometric","mono"].includes(String(safe.titleFont))?
   safe.titleFont:"site";
  safe.titleShadow=["none","soft","strong"].includes(String(safe.titleShadow))?safe.titleShadow:"none";
  safe.titleWeight=["light","normal","heavy"].includes(String(safe.titleWeight))?safe.titleWeight:"normal";
  safe.titleItalic=safe.titleItalic==="yes"?"yes":"no";
  safe.titleColor=typeof safe.titleColor==="string"&&/^#[\da-f]{6}$/i.test(safe.titleColor)?safe.titleColor:"";
  safe.titleLink=typeof safe.titleLink==="string"&&
   /^(#[a-z0-9-]{1,70}|https:\/\/[^\s<>]+|mailto:[^\s<>]+|tel:\+?[\d ()-]{7,36})$/i.test(safe.titleLink)?safe.titleLink:"";
  Object.assign(safe,normalizeImageSettings(props,0));
 }
 for(const field of schema.images)safe[field]=photo(props[field])||"";
 if(schema.arrays)for(const [key,itemFields] of Object.entries(schema.arrays)){
  const items=Array.isArray(props[key])?props[key].slice(0,40):[];
  safe[key]=items.filter((x:unknown)=>x&&typeof x==="object"&&!Array.isArray(x)).map((raw:Record<string,unknown>,index:number)=>{
   const storedId=typeof raw.id==="string"&&/^[a-z0-9_-]{3,80}$/i.test(raw.id)?raw.id:"";
   const fallback="item-"+String(props.id||type).replace(/[^a-z0-9-]/gi,"").slice(0,55)+"-"+index;
   const item:Record<string,unknown>={id:storedId||fallback};
   for(const field of itemFields.strings)item[field]=typeof raw[field]==="string"?raw[field].slice(0,700):"";
   for(const field of itemFields.images)item[field]=photo(raw[field])||"";
   if(itemFields.images.length)Object.assign(item,normalizeImageSettings(raw));
   return item;
  });
 }
 if(type==="BeforeAfter")for(const key of ["beforeImageSettings","afterImageSettings"]){
  const value=props[key];
  safe[key]=normalizeImageSettings(value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{});
 }
 return safe;
}
