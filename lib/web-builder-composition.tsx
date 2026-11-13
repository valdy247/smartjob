import type {Config,Slot} from "@puckeditor/core";
import type {CSSProperties} from "react";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {safeWebImageUrl} from "./web-services-site";

export const COMPOSE_BLOCK_NAMES=["SectionLayout","ColumnsLayout","ComposeHeading","ComposeText","ComposeImage","ComposeButton"] as const;
export type ComposeBlockName=(typeof COMPOSE_BLOCK_NAMES)[number];
export const COMPOSE_SLOTS:Partial<Record<ComposeBlockName,readonly string[]>>={
 SectionLayout:["content"],ColumnsLayout:["left","right","third"]
};
export type ComposerNode={type:string;props:Record<string,unknown>};
const select=(choices:readonly string[],fallback:string)=>(v:unknown)=>typeof v==="string"&&choices.includes(v)?v:fallback;
const numberField=(v:unknown,fallback:number,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)?Math.max(min,Math.min(max,Math.round(v))):fallback;
const str=(v:unknown,limit:number)=>typeof v==="string"?v.slice(0,limit):"";
const imageUrl=(v:unknown)=>safeWebImageUrl(str(v,450))||"";
const safeButtonLink=(v:unknown)=>{
 const s=str(v,450).trim();
 if(/^#[a-z0-9-]{1,70}$/i.test(s))return s;
 if(/^mailto:[^\s<>]+@[^\s<>]+$/i.test(s))return s;
 if(/^tel:\+?[\d ()-]{7,36}$/.test(s))return s;
 if(s.startsWith("/web/")&&/^\/web\/[a-z0-9-/]{1,120}$/.test(s))return s;
 try{
  const url=new URL(s);
  return url.protocol==="https:"&&!url.username&&!url.password?url.href:"#solicitud";
 }catch{return "#solicitud";}
};
const spacing=["compact","normal","airy"] as const;
const surfaces=["transparent","light","soft","dark","accent"] as const;
const alignment=["left","center","right"] as const;
const visibility=["all","desktop","mobile"] as const;
const ratios=["square","portrait","landscape","wide"] as const;

const slotChildren=["SectionLayout","ColumnsLayout","ComposeHeading","ComposeText","ComposeImage","ComposeButton"] as const;
const innerChildren=["ComposeHeading","ComposeText","ComposeImage","ComposeButton","SectionLayout","ColumnsLayout"] as const;
const fields={
 alignment:{type:"radio" as const,options:[
  {label:"Izquierda",value:"left"},{label:"Centro",value:"center"},{label:"Derecha",value:"right"}
 ]},
 visibility:{type:"radio" as const,options:[
  {label:"Todos",value:"all"},{label:"Solo escritorio",value:"desktop"},{label:"Solo móvil",value:"mobile"}
 ]},
 gap:{type:"radio" as const,options:[
  {label:"Compacto",value:"compact"},{label:"Normal",value:"normal"},{label:"Amplio",value:"airy"}
 ]},
 surface:{type:"radio" as const,options:[
  {label:"Sin fondo",value:"transparent"},{label:"Blanco",value:"light"},
  {label:"Suave",value:"soft"},{label:"Oscuro",value:"dark"},{label:"Marca",value:"accent"}
 ]}
};
const ImageField={
 type:"custom" as const,
 render:({value,onChange}:{value?:unknown;onChange:(url:string)=>void})=>
  <BuilderImageField value={typeof value==="string"?value:""} onChange={onChange}/>
};
function SettingsGroup({title,children}:{title:string;children:React.ReactNode}){
 return <fieldset className="vmv-compose-settings"><legend>{title}</legend>{children}</fieldset>;
}
function BlockSlot({field:Content,className}:{field:Slot;className:string}){
 return <Content className={className} minEmptyHeight={100} collisionAxis="dynamic"/>;
}
export const compositionBlocks:Config["components"]={
 SectionLayout:{
  label:"Contenedor libre",
  fields:{
   content:{type:"slot",allow:[...slotChildren]},
   surface:fields.surface,
   width:{type:"radio",options:[{label:"Estrecho",value:"narrow"},{label:"Normal",value:"normal"},{label:"Ancho",value:"wide"}]},
   paddingDesktop:fields.gap,paddingMobile:fields.gap,
   gapDesktop:fields.gap,gapMobile:fields.gap,
   alignDesktop:fields.alignment,alignMobile:fields.alignment,
   visibility:fields.visibility
  },
  defaultProps:{content:[],surface:"transparent",width:"normal",paddingDesktop:"normal",paddingMobile:"normal",
   gapDesktop:"normal",gapMobile:"compact",alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Contenido">{f.content}</SettingsGroup>
   <SettingsGroup title="Diseño">{f.surface}{f.width}{f.visibility}</SettingsGroup>
   <SettingsGroup title="Escritorio">{f.paddingDesktop}{f.gapDesktop}{f.alignDesktop}</SettingsGroup>
   <SettingsGroup title="Móvil">{f.paddingMobile}{f.gapMobile}{f.alignMobile}</SettingsGroup>
  </>,
  render:({content:Content,surface,width,paddingDesktop,paddingMobile,gapDesktop,gapMobile,alignDesktop,alignMobile,visibility})=>
   <section className="vmv-compose-section" data-surface={surface||"transparent"}
    data-width={width||"normal"} data-mobile-visibility={visibility||"all"}
    data-padding-desktop={paddingDesktop||"normal"} data-padding-mobile={paddingMobile||"normal"}
    data-gap-desktop={gapDesktop||"normal"} data-gap-mobile={gapMobile||"compact"}
    data-align-desktop={alignDesktop||"left"} data-align-mobile={alignMobile||"left"}>
    <Content className="vmv-compose-stack" minEmptyHeight={110} collisionAxis="y"/>
   </section>
 },
 ColumnsLayout:{
  label:"Columnas flexibles",
  fields:{
   left:{type:"slot",allow:[...innerChildren]},
   right:{type:"slot",allow:[...innerChildren]},
   third:{type:"slot",allow:[...innerChildren]},
   columns:{type:"radio",options:[{label:"2 columnas",value:"2"},{label:"3 columnas",value:"3"}]},
   proportion:{type:"radio",options:[
    {label:"Mitad y mitad",value:"equal"},{label:"Izquierda amplia",value:"left-wide"},{label:"Derecha amplia",value:"right-wide"}]},
   mobileOrder:{type:"radio",options:[
    {label:"Izquierda primero",value:"normal"},{label:"Derecha primero",value:"reverse"}]},
   mobileColumns:{type:"radio",options:[{label:"Apilar",value:"stack"},{label:"Dos columnas",value:"two"}]},
   gapDesktop:fields.gap,gapMobile:fields.gap,
   alignDesktop:{type:"radio",options:[{label:"Arriba",value:"start"},{label:"Centro",value:"center"},{label:"Estirar",value:"stretch"}]},
   visibility:fields.visibility
  },
  defaultProps:{left:[],right:[],third:[],columns:"2",proportion:"equal",mobileOrder:"normal",mobileColumns:"stack",
   gapDesktop:"normal",gapMobile:"compact",alignDesktop:"start",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Contenido">{f.left}{f.right}{f.third}</SettingsGroup>
   <SettingsGroup title="Distribución">{f.columns}{f.proportion}{f.alignDesktop}{f.visibility}</SettingsGroup>
   <SettingsGroup title="Escritorio">{f.gapDesktop}</SettingsGroup>
   <SettingsGroup title="Móvil">{f.mobileColumns}{f.mobileOrder}{f.gapMobile}</SettingsGroup>
  </>,
  render:({left:Left,right:Right,third:Third,columns,proportion,mobileOrder,mobileColumns,gapDesktop,gapMobile,alignDesktop,visibility})=>
   <div className="vmv-compose-columns" data-columns={columns||"2"}
    data-proportion={proportion||"equal"} data-mobile-order={mobileOrder||"normal"}
    data-mobile-columns={mobileColumns||"stack"}
    data-gap-desktop={gapDesktop||"normal"} data-gap-mobile={gapMobile||"compact"}
    data-valign={alignDesktop||"start"} data-mobile-visibility={visibility||"all"}>
    <Left className="vmv-compose-column vmv-compose-left" minEmptyHeight={112} collisionAxis="y"/>
    <Right className="vmv-compose-column vmv-compose-right" minEmptyHeight={112} collisionAxis="y"/>
    {columns==="3"?<Third className="vmv-compose-column vmv-compose-third" minEmptyHeight={112} collisionAxis="y"/>:null}
   </div>
 },
 ComposeHeading:{
  label:"Título en composición",
  fields:{
   title:{type:"text",contentEditable:true,placeholder:"Escribe tu título"},
   level:{type:"radio",options:[{label:"Principal",value:"h2"},{label:"Secundario",value:"h3"}]},
   sizeDesktop:{type:"radio",options:[
    {label:"Mediano",value:"medium"},{label:"Grande",value:"large"},{label:"Impactante",value:"huge"}]},
   sizeMobile:{type:"radio",options:[
    {label:"Compacto",value:"small"},{label:"Normal",value:"medium"},{label:"Grande",value:"large"}]},
   alignDesktop:fields.alignment,alignMobile:fields.alignment,
   visibility:fields.visibility
  },
  defaultProps:{title:"Escribe tu título",level:"h2",sizeDesktop:"large",sizeMobile:"medium",
   alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Contenido">{f.title}{f.level}</SettingsGroup>
   <SettingsGroup title="Escritorio">{f.sizeDesktop}{f.alignDesktop}</SettingsGroup>
   <SettingsGroup title="Móvil">{f.sizeMobile}{f.alignMobile}{f.visibility}</SettingsGroup>
  </>,
  render:({title,level,sizeDesktop,sizeMobile,alignDesktop,alignMobile,visibility})=>{
   const Tag=level==="h3"?"h3":"h2";
   return <Tag className="vmv-compose-heading" data-size-desktop={sizeDesktop||"large"}
    data-size-mobile={sizeMobile||"medium"} data-align-desktop={alignDesktop||"left"}
    data-align-mobile={alignMobile||"left"} data-mobile-visibility={visibility||"all"}>{title}</Tag>;
  }
 },
 ComposeText:{
  label:"Párrafo en composición",
  fields:{
   text:{type:"textarea",contentEditable:true,placeholder:"Escribe aquí"},
   size:{type:"radio",options:[{label:"Pequeño",value:"small"},{label:"Normal",value:"medium"},{label:"Destacado",value:"large"}]},
   alignDesktop:fields.alignment,alignMobile:fields.alignment,visibility:fields.visibility
  },
  defaultProps:{text:"Escribe aquí",size:"medium",alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Contenido">{f.text}</SettingsGroup>
   <SettingsGroup title="Diseño">{f.size}{f.visibility}</SettingsGroup>
   <SettingsGroup title="Escritorio">{f.alignDesktop}</SettingsGroup>
   <SettingsGroup title="Móvil">{f.alignMobile}</SettingsGroup>
  </>,
  render:({text,size,alignDesktop,alignMobile,visibility})=><p className="vmv-compose-copy"
   data-size={size||"medium"} data-align-desktop={alignDesktop||"left"} data-align-mobile={alignMobile||"left"}
   data-mobile-visibility={visibility||"all"}>{text}</p>
 },
 ComposeImage:{
  label:"Imagen en composición",
  fields:{
   image:ImageField,alt:{type:"text"},
   ratio:{type:"radio",options:[{label:"Cuadrada",value:"square"},{label:"Vertical",value:"portrait"},
    {label:"Horizontal",value:"landscape"},{label:"Panorámica",value:"wide"}]},
   position:{type:"radio",options:[{label:"Centro",value:"center"},{label:"Arriba",value:"top"},{label:"Abajo",value:"bottom"},
    {label:"Izquierda",value:"left"},{label:"Derecha",value:"right"}]},
   radius:{type:"radio",options:[{label:"Recto",value:"none"},{label:"Suave",value:"soft"},{label:"Redondo",value:"round"}]},
   visibility:fields.visibility
  },
  defaultProps:{image:"",alt:"",ratio:"landscape",position:"center",radius:"soft",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Imagen">{f.image}{f.alt}{f.ratio}{f.position}</SettingsGroup>
   <SettingsGroup title="Diseño">{f.radius}{f.visibility}</SettingsGroup>
  </>,
  render:({image,alt,ratio,position,radius,visibility})=><figure className="vmv-compose-picture"
   data-ratio={ratio||"landscape"} data-position={position||"center"}
   data-radius={radius||"soft"} data-mobile-visibility={visibility||"all"}>
   {safeWebImageUrl(image)?
    <img src={safeWebImageUrl(image)||""} alt={alt||""} loading="lazy"/>:
    <div className="vmv-compose-picture-empty"><span aria-hidden="true">▧</span><small>Imagen pendiente</small></div>}
  </figure>
 },
 ComposeButton:{
  label:"Botón en composición",
  fields:{
   label:{type:"text",contentEditable:true,placeholder:"Texto del botón"},
   url:{type:"text"},
   style:{type:"radio",options:[{label:"Sólido",value:"solid"},{label:"Contorno",value:"outline"},{label:"Enlace",value:"link"}]},
   alignDesktop:fields.alignment,alignMobile:fields.alignment,visibility:fields.visibility
  },
  defaultProps:{label:"Solicitar información",url:"#solicitud",style:"solid",alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Contenido">{f.label}{f.url}</SettingsGroup>
   <SettingsGroup title="Diseño">{f.style}{f.visibility}</SettingsGroup>
   <SettingsGroup title="Escritorio">{f.alignDesktop}</SettingsGroup>
   <SettingsGroup title="Móvil">{f.alignMobile}</SettingsGroup>
  </>,
  render:({label,url,style,alignDesktop,alignMobile,visibility})=><div className="vmv-compose-button-wrap"
   data-align-desktop={alignDesktop||"left"} data-align-mobile={alignMobile||"left"}
   data-mobile-visibility={visibility||"all"}>
   <a href={safeButtonLink(url)} className="vmv-site-button" data-button-style={style||"solid"}>{label||"Contactar"}</a>
  </div>
 }
};

/** Strictly validate compositional properties. Slots are normalized recursively by the parent document. */
export function normalizeComposeProps(kind:ComposeBlockName,source:Record<string,unknown>):Record<string,unknown>{
 const props:Record<string,unknown>={};
 if(kind==="SectionLayout"){
  props.surface=select(surfaces,"transparent")(source.surface);
  props.width=select(["narrow","normal","wide"],"normal")(source.width);
  for(const key of ["gapDesktop","gapMobile","paddingDesktop","paddingMobile"])
   props[key]=select(spacing,"normal")(source[key]);
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 if(kind==="ColumnsLayout"){
  props.columns=select(["2","3"],"2")(source.columns);
  props.proportion=select(["equal","left-wide","right-wide"],"equal")(source.proportion);
  props.mobileOrder=select(["normal","reverse"],"normal")(source.mobileOrder);
  props.mobileColumns=select(["stack","two"],"stack")(source.mobileColumns);
  props.gapDesktop=select(spacing,"normal")(source.gapDesktop);
  props.gapMobile=select(spacing,"compact")(source.gapMobile);
  props.alignDesktop=select(["start","center","stretch"],"start")(source.alignDesktop);
 }
 if(kind==="ComposeHeading"){
  props.title=str(source.title,180);
  props.level=select(["h2","h3"],"h2")(source.level);
  props.sizeDesktop=select(["medium","large","huge"],"large")(source.sizeDesktop);
  props.sizeMobile=select(["small","medium","large"],"medium")(source.sizeMobile);
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 if(kind==="ComposeText"){
  props.text=str(source.text,2400);
  props.size=select(["small","medium","large"],"medium")(source.size);
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 if(kind==="ComposeImage"){
  props.image=imageUrl(source.image);
  props.alt=str(source.alt,180);
  props.ratio=select(ratios,"landscape")(source.ratio);
  props.position=select(["center","top","bottom","left","right"],"center")(source.position);
  props.radius=select(["none","soft","round"],"soft")(source.radius);
 }
 if(kind==="ComposeButton"){
  props.label=str(source.label,90);
  props.url=safeButtonLink(source.url);
  props.style=select(["solid","outline","link"],"solid")(source.style);
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 props.visibility=select(visibility,"all")(source.visibility);
 return props;
}
