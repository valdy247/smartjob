import type {Config,Data} from "@puckeditor/core";
import BuilderEditableImage from "@/app/web-studio/BuilderEditableImage";
import {normalizeImageSettings} from "./web-builder-images";
import type {CSSProperties} from "react";
import {safeWebImageUrl,webPrimaryContact,type WebSiteContent} from "./web-services-site";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {numericEditorField,colorEditorField,fontEditorField} from "@/app/web-studio/BuilderContextFields";
import {BuilderSectionTargets} from "@/app/web-studio/BuilderSectionTargets";
import {normalizeCalloutStyle,calloutButtonStyles,calloutSectionStyles,calloutHeadingStyles} from "./web-builder-callout-style";
import ThemeSwatches,{AccentPicker} from "@/app/web-studio/ThemeSwatches";
import {visualBlocks,VISUAL_BLOCK_NAMES,normalizeVisualProps,type VisualBlockName} from "./web-builder-visual-blocks";
import {compositionBlocks,COMPOSE_BLOCK_NAMES,COMPOSE_SLOTS,normalizeComposeProps,type ComposeBlockName} from "./web-builder-composition";

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
 "Hero","Heading","Text","Image","Services","Benefits","CTA","Quote","Spacer","FAQ","Contact",...VISUAL_BLOCK_NAMES,...COMPOSE_BLOCK_NAMES
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
/** Reject oversized or unsupported nested layouts before saving, rather than silently trimming slots. */
export function validateBuilderDocument(input:unknown):string|null{
 try{
  const json=JSON.stringify(input);
  if(json.length>90000)return "Esta página supera el tamaño disponible. Divide el contenido en varias páginas.";
  const root=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
  let count=0;
  const validate=(items:unknown,depth:number):string|null=>{
   if(!Array.isArray(items))return "Una sección contiene datos inválidos.";
   if(depth>7)return "La composición supera siete niveles de anidamiento.";
   if(items.length>100)return "Esta composición contiene más de 100 elementos. Divídela antes de guardar.";
   for(const node of items){
    if(!node||typeof node!=="object"||Array.isArray(node))return "Se encontró un bloque inválido.";
    const item=node as Record<string,unknown>;
    if(typeof item.type!=="string"||!VMV_BUILDER_BLOCKS.includes(item.type as BlockName))
     return "Existe un bloque que este editor no reconoce. No se sobrescribirá el borrador.";
    count++;
    if(count>350)return "La página contiene demasiados elementos. Divídela en varias páginas.";
    const slots=COMPOSE_SLOTS[item.type as ComposeBlockName]||[];
    const props=item.props&&typeof item.props==="object"&&!Array.isArray(item.props)?
     item.props as Record<string,unknown>:{};
    for(const slot of slots){
     const problem=validate(props[slot]||[],depth+1);
     if(problem)return problem;
    }
   }
   return null;
  };
  return validate(root.content||[],0);
 }catch{return "Los cambios no pudieron verificarse. Se conservan sin publicarse.";}
}
export function normalizeBuilderDocument(input:unknown):Data{
 const raw=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const seen=new Set<string>();
 let generated=0;
 // Slot content is recursive Puck data, not an ordinary string field.
 // Validate it with the same allowlist as top-level blocks so nested edits survive save, reload and publish.
 const normalizeNodes=(items:unknown,depth:number):Array<{type:BlockName;props:Record<string,unknown>}>=>{
  if(!Array.isArray(items)||depth>7)return [];
  return items.slice(0,100).flatMap((node)=>{
   if(!node||typeof node!=="object"||Array.isArray(node))return [];
   const value=node as Record<string,unknown>;
   if(typeof value.type!=="string"||!VMV_BUILDER_BLOCKS.includes(value.type as BlockName))return [];
   const kind=value.type as BlockName;
   const source=value.props&&typeof value.props==="object"&&!Array.isArray(value.props)?
    value.props as Record<string,unknown>:{};
   let id=typeof source.id==="string"&&/^[a-z0-9-]{3,80}$/i.test(source.id)?source.id:"node-"+generated++;
   while(seen.has(id))id="node-"+generated++;
   seen.add(id);
   if(COMPOSE_BLOCK_NAMES.includes(kind as ComposeBlockName)){
    const props:Record<string,unknown>={id,...normalizeComposeProps(kind as ComposeBlockName,source)};
    for(const slot of COMPOSE_SLOTS[kind as ComposeBlockName]||[]){
     props[slot]=normalizeNodes(source[slot],depth+1);
    }
    return [{type:kind,props}];
   }
   if(VISUAL_BLOCK_NAMES.includes(kind as VisualBlockName)){
    return [{type:kind,props:{id,...normalizeVisualProps(kind as VisualBlockName,source)}}];
   }
   const safe:Record<string,unknown>={id};
   for(const [field,sanitize] of Object.entries(fieldSchema[kind]||{})){
    if(field==="url")safe[field]=safeWebImageUrl(sanitize(source[field]))||"";
    else if(field==="buttonUrl")safe[field]=safeLink(sanitize(source[field]));
    else safe[field]=sanitize(source[field]);
   }
   if(kind==="Image")Object.assign(safe,normalizeImageSettings(source,23));
   if(kind==="CTA")Object.assign(safe,normalizeCalloutStyle(source));
   if(kind==="Spacer"&&!["24","48","80"].includes(String(safe.height)))safe.height="48";
   return [{type:kind,props:safe}];
  });
 };
 const content=normalizeNodes(raw.content,0);
 const sourceRoot=raw.root&&typeof raw.root==="object"?raw.root as Record<string,unknown>:{};
 const rawProps=sourceRoot.props&&typeof sourceRoot.props==="object"?sourceRoot.props as Record<string,unknown>:{};
 const palette=["violet","mint","amber","ink","rose","forest","ocean","terracotta","charcoal"].includes(String(rawProps.palette))?String(rawProps.palette):"violet";
 const font=["modern","editorial","rounded","geometric"].includes(String(rawProps.font))?String(rawProps.font):"modern";
 const style=["light","dark","warm","editorial","bold"].includes(String(rawProps.style))?String(rawProps.style):"light";
 const width=["regular","wide"].includes(String(rawProps.width))?String(rawProps.width):"regular";
 const motion=rawProps.motion==="subtle"?"subtle":"off";
 const accent=typeof rawProps.accentColor==="string"&&/^#[0-9a-f]{6}$/i.test(rawProps.accentColor)?rawProps.accentColor:"";
 const logo=safeWebImageUrl(String(rawProps.logo||""))||"";
 const family=["bakery","construction","professional","beauty","creative"].includes(String(rawProps.family))?String(rawProps.family):"";
 const language=rawProps.language==="en"?"en":"es";
 return {content,root:{props:{palette,font,style,width,motion,accentColor:accent,logo,family,language}}} as Data;
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
 categories:{
  composition:{title:"Composición libre",components:["SectionLayout","ColumnsLayout"],defaultExpanded:true},
  elements:{title:"Elementos editables",components:["ComposeHeading","ComposeText","ComposeImage","ComposeButton"],defaultExpanded:true},
  sections:{title:"Secciones completas",components:[
   "HeroVisual","OfferingGrid","PhotoGallery","ProjectShowcase","ProcessSteps",
   "HoursArea","TeamGrid","PricingList","BeforeAfter","FAQList"
  ],defaultExpanded:false},
  legacy:{title:"Bloques anteriores",components:[
   "Hero","Heading","Text","Image","Services","Benefits","CTA","Quote","Spacer","FAQ","Contact"
  ],defaultExpanded:false}
 },
 root:{
  fields:{
   language:{type:"select",options:[{label:"Español",value:"es"},{label:"English",value:"en"}]},
   palette:{type:"custom",render:({value,onChange})=><ThemeSwatches value={value} onChange={onChange}/>},
   font:{type:"select",options:[
    {label:"Moderna",value:"modern"},{label:"Editorial",value:"editorial"},
    {label:"Redondeada",value:"rounded"},{label:"Geométrica",value:"geometric"}
   ]},
   style:{type:"select",options:[
    {label:"Claro",value:"light"},{label:"Oscuro",value:"dark"},
    {label:"Cálido",value:"warm"},{label:"Editorial",value:"editorial"},{label:"Atrevido",value:"bold"}
   ]},
   width:{type:"select",options:[{label:"Cómodo",value:"regular"},{label:"Amplio",value:"wide"}]},
   accentColor:{type:"custom",render:({value,onChange})=><AccentPicker value={value} onChange={onChange}/>},
   motion:{type:"select",options:[{label:"Sin animaciones",value:"off"},{label:"Suaves",value:"subtle"}]},
   logo:{type:"custom",render:({value,onChange})=><BuilderImageField value={typeof value==="string"?value:""} onChange={onChange}/>}

  },
  defaultProps:{palette:"violet",font:"modern",style:"light",width:"regular",motion:"off",accentColor:"",logo:"",language:"es"},
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
   render:({id,url,alt,caption,puck,...settings})=>!url&&!puck.isEditing?<></>:<figure className="vmv-site-image">
    <BuilderEditableImage id={id} target={{field:"url"}} src={url} alt={alt||"Imagen del negocio"}
     settings={settings} radius={23} editing={puck.isEditing}/>
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
   fields:{
    title:{type:"text",contentEditable:true},description:{type:"textarea"},
    buttonText:{type:"text"},buttonUrl:{type:"text"},
    buttonStyle:{type:"radio",options:[{label:"Sólido",value:"solid"},{label:"Contorno",value:"outline"},{label:"Enlace",value:"link"}]},
    buttonShape:{type:"radio",options:[{label:"Píldora",value:"pill"},{label:"Redondeado",value:"rounded"},{label:"Recto",value:"square"}]},
    buttonRadius:numericEditorField("imageRadius"),
    buttonFontSize:numericEditorField("fontSize"),
    buttonColor:colorEditorField("Fondo del botón"),
    buttonTextColor:colorEditorField("Texto del botón"),
    buttonBorderColor:colorEditorField("Borde del botón"),
    buttonBorderWidth:numericEditorField("imageBorder"),
    titleFont:fontEditorField,
    titleFontSize:numericEditorField("fontSize"),
    titleColor:colorEditorField("Color del título"),
    titleShadow:{type:"radio",options:[{label:"Ninguna",value:"none"},{label:"Suave",value:"soft"},{label:"Marcada",value:"strong"}]},
    sectionSurface:{type:"radio",options:[
     {label:"Oscuro",value:"dark"},{label:"Claro",value:"light"},
     {label:"Suave",value:"soft"},{label:"Marca",value:"accent"},{label:"Personalizado",value:"custom"}]},
    sectionBackground:colorEditorField("Fondo personalizado"),
    sectionTextColor:colorEditorField("Color general del texto"),
    sectionAlign:{type:"radio",options:[
     {label:"Izquierda",value:"left"},{label:"Centro",value:"center"},{label:"Derecha",value:"right"}]},
    sectionPadding:{type:"radio",options:[
     {label:"Compacto",value:"compact"},{label:"Normal",value:"normal"},{label:"Amplio",value:"spacious"}]},
    sectionRadius:numericEditorField("imageRadius")
   },
   defaultProps:{
    title:"¿Comenzamos?",description:"Cuéntanos qué necesitas.",buttonText:"Contáctanos",buttonUrl:"#contacto",
    ...normalizeCalloutStyle({})
   },
   renderFields:({fields:f})=><>
    <fieldset className="vmv-puck-field-group"><legend>Contenido de la sección</legend>
     {f.title}{f.description}{f.buttonText}{f.buttonUrl}</fieldset>
    <fieldset className="vmv-puck-field-group"><legend>Botón · Forma y color</legend>
     {f.buttonStyle}{f.buttonShape}{f.buttonRadius}{f.buttonColor}{f.buttonTextColor}
     {f.buttonBorderColor}{f.buttonBorderWidth}{f.buttonFontSize}</fieldset>
    <fieldset className="vmv-puck-field-group"><legend>Título · Diseño</legend>
     {f.titleFont}{f.titleFontSize}{f.titleColor}{f.titleShadow}</fieldset>
    <fieldset className="vmv-puck-field-group"><legend>Sección · Fondo y espacio</legend>
     {f.sectionSurface}{f.sectionBackground}{f.sectionTextColor}{f.sectionAlign}
     {f.sectionPadding}{f.sectionRadius}</fieldset>
   </>,
   render:({id,title,description,buttonText,buttonUrl,puck,...settings})=>
    <BuilderSectionTargets id={id} editing={puck.isEditing} className="vmv-site-cta"
     kind="CTA" style={calloutSectionStyles(settings)}>
     <div className="vmv-cta-inner" data-align={settings.sectionAlign||"left"}
      data-spacing={settings.sectionPadding||"normal"}>
      <h2 data-vmv-edit-target="title" style={calloutHeadingStyles(settings)}>{title}</h2>
      {description?<p data-vmv-edit-target="title">{description}</p>:null}
      <a data-vmv-edit-target="button" href={safeLink(buttonUrl)}
       className="vmv-site-button vmv-cta-button" style={calloutButtonStyles(settings)}>
       {buttonText||"Contáctanos"} <span aria-hidden="true">↗</span>
      </a>
     </div>
    </BuilderSectionTargets>
  },
  Quote:{
   label:"Testimonio",
   fields:{quote:{type:"textarea"},author:basicText},
   defaultProps:{quote:"",author:""},
   render:({quote,author})=>quote?<blockquote className="vmv-site-quote"><p>“{quote}”</p>{author?<footer>{author}</footer>:null}</blockquote>:<></>
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
  ...visualBlocks,
  ...compositionBlocks
 }
};
