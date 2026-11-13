import type {Config} from "@puckeditor/core";
import type {CSSProperties} from "react";
import BuilderImageField from "@/app/web-studio/BuilderImageField";
import {colorEditorField,fontEditorField,numericEditorField} from "@/app/web-studio/BuilderContextFields";
import {MovableContent} from "@/app/web-studio/BuilderPositionDrag";
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
 if(s==="/web-studio"||/^\/web\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(s))return s;
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
const fonts:Record<string,string>={
 site:"inherit",modern:"Arial, ui-sans-serif, sans-serif",
 editorial:"Georgia, serif",rounded:"Trebuchet MS, ui-sans-serif, sans-serif",
 geometric:"Avenir Next, ui-sans-serif, sans-serif",mono:"ui-monospace, monospace"
};
const textShadow:Record<string,string>={
 none:"none",soft:"0 2px 6px rgba(16,12,32,.22)",strong:"0 4px 12px rgba(16,12,32,.44)"
};
const styleText=(font:string,color:string,shadow:string,weight:string,italic:string,fontSize:number,letterSpacing:number):React.CSSProperties=>({
 fontFamily:fonts[font]||"inherit",
 color:/^#[\da-f]{6}$/i.test(color)?color:undefined,
 textShadow:textShadow[shadow]||"none",
 fontWeight:weight==="heavy"?850:weight==="light"?400:700,
 fontStyle:italic==="yes"?"italic":"normal",
 ...(fontSize>=12?{fontSize:fontSize+"px"}:{}),
 letterSpacing:letterSpacing+"px"
});
const typographyFields={
 font:fontEditorField,
 textColor:colorEditorField("Color del texto"),
 textShadow:{type:"radio" as const,options:[
  {label:"Sin sombra",value:"none"},{label:"Suave",value:"soft"},{label:"Marcada",value:"strong"}
 ]},
 weight:{type:"radio" as const,options:[
  {label:"Ligero",value:"light"},{label:"Normal",value:"normal"},{label:"Negrita",value:"heavy"}
 ]},
 italic:{type:"radio" as const,options:[{label:"Normal",value:"no"},{label:"Cursiva",value:"yes"}]},
 fontSize:numericEditorField("fontSize"),
 letterSpacing:numericEditorField("letterSpacing"),
 moveX:numericEditorField("textMoveX"),
 moveY:numericEditorField("textMoveY"),
 linkUrl:{type:"text" as const}
};
const numericTypography=(source:Record<string,unknown>)=>({
 font:select(["site","modern","editorial","rounded","geometric","mono"],"site")(source.font),
 textColor:typeof source.textColor==="string"&&/^#[\da-f]{6}$/i.test(source.textColor)?source.textColor:"",
 textShadow:select(["none","soft","strong"],"none")(source.textShadow),
 weight:select(["light","normal","heavy"],"normal")(source.weight),
 italic:select(["yes","no"],"no")(source.italic),
 fontSize:numberField(source.fontSize,0,0,110),
 letterSpacing:numberField(source.letterSpacing,0,-3,12),
 moveX:numberField(source.moveX,0,-150,150),
 moveY:numberField(source.moveY,0,-150,150),
 linkUrl:source.linkUrl?safeButtonLink(source.linkUrl):""
});

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
 return <details className="vmv-compose-settings" open={title==="Contenido"?true:undefined}>
  <summary>{title}</summary><div className="vmv-compose-settings-fields">{children}</div>
 </details>;
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
  label:"Título editable",
  fields:{
   title:{type:"text",contentEditable:true,placeholder:"Escribe tu título"},
   level:{type:"radio",options:[{label:"Principal",value:"h2"},{label:"Secundario",value:"h3"}]},
   sizeDesktop:{type:"radio",options:[{label:"Mediano",value:"medium"},{label:"Grande",value:"large"},{label:"Impactante",value:"huge"}]},
   sizeMobile:{type:"radio",options:[{label:"Compacto",value:"small"},{label:"Normal",value:"medium"},{label:"Grande",value:"large"}]},
   ...typographyFields,
   alignDesktop:fields.alignment,alignMobile:fields.alignment,
   visibility:fields.visibility
  },
  defaultProps:{title:"Escribe tu título",level:"h2",sizeDesktop:"large",sizeMobile:"medium",
   font:"site",textColor:"",textShadow:"none",weight:"normal",italic:"no",
   fontSize:0,letterSpacing:0,moveX:0,moveY:0,linkUrl:"",
   alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Texto y enlace">{f.title}{f.level}{f.linkUrl}</SettingsGroup>
   <SettingsGroup title="Fuente, color y sombra">{f.font}{f.fontSize}{f.textColor}{f.weight}{f.italic}{f.textShadow}{f.letterSpacing}</SettingsGroup>
   <SettingsGroup title="Mover y alinear">{f.moveX}{f.moveY}{f.alignDesktop}{f.alignMobile}</SettingsGroup>
   <SettingsGroup title="Por dispositivo">{f.sizeDesktop}{f.sizeMobile}{f.visibility}</SettingsGroup>
  </>,
  render:({id,title,level,sizeDesktop,sizeMobile,alignDesktop,alignMobile,visibility,
    font,textColor,textShadow:shadow,weight,italic,fontSize,letterSpacing,moveX,moveY,linkUrl,puck})=>{
   const Tag=level==="h3"?"h3":"h2";
   const inner=<Tag className="vmv-compose-heading" data-size-desktop={sizeDesktop||"large"}
    data-size-mobile={sizeMobile||"medium"} data-align-desktop={alignDesktop||"left"}
    data-align-mobile={alignMobile||"left"} data-mobile-visibility={visibility||"all"}
    style={styleText(font,textColor,shadow,weight,italic,Number(fontSize)||0,Number(letterSpacing)||0)}>{title}</Tag>;
   return <MovableContent id={id} editing={puck.isEditing} x={Number(moveX)||0} y={Number(moveY)||0}
    xKey="moveX" yKey="moveY">
    {linkUrl&&!puck.isEditing?<a className="vmv-compose-text-link" href={safeButtonLink(linkUrl)}>{inner}</a>:inner}
   </MovableContent>;
  }
 },
 ComposeText:{
  label:"Texto editable",
  fields:{
   text:{type:"textarea",contentEditable:true,placeholder:"Escribe aquí"},
   size:{type:"radio",options:[{label:"Pequeño",value:"small"},{label:"Normal",value:"medium"},{label:"Destacado",value:"large"}]},
   ...typographyFields,
   alignDesktop:fields.alignment,alignMobile:fields.alignment,visibility:fields.visibility
  },
  defaultProps:{text:"Escribe aquí",size:"medium",font:"site",textColor:"",
   textShadow:"none",weight:"normal",italic:"no",fontSize:0,letterSpacing:0,
   moveX:0,moveY:0,linkUrl:"",alignDesktop:"left",alignMobile:"left",visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Texto y enlace">{f.text}{f.linkUrl}</SettingsGroup>
   <SettingsGroup title="Fuente, color y sombra">{f.font}{f.fontSize}{f.textColor}{f.weight}{f.italic}{f.textShadow}{f.letterSpacing}</SettingsGroup>
   <SettingsGroup title="Mover y alinear">{f.moveX}{f.moveY}{f.alignDesktop}{f.alignMobile}</SettingsGroup>
   <SettingsGroup title="Por dispositivo">{f.size}{f.visibility}</SettingsGroup>
  </>,
  render:({id,text,size,alignDesktop,alignMobile,visibility,font,textColor,
    textShadow:shadow,weight,italic,fontSize,letterSpacing,moveX,moveY,linkUrl,puck})=>{
   const content=<p className="vmv-compose-copy" data-size={size||"medium"}
    data-align-desktop={alignDesktop||"left"} data-align-mobile={alignMobile||"left"}
    data-mobile-visibility={visibility||"all"}
    style={styleText(font,textColor,shadow,weight,italic,Number(fontSize)||0,Number(letterSpacing)||0)}>{text}</p>;
   return <MovableContent id={id} editing={puck.isEditing} x={Number(moveX)||0} y={Number(moveY)||0}
    xKey="moveX" yKey="moveY">
    {linkUrl&&!puck.isEditing?<a className="vmv-compose-text-link" href={safeButtonLink(linkUrl)}>{content}</a>:content}
   </MovableContent>;
  }
 },
 ComposeImage:{
  label:"Imagen editable",
  fields:{
   image:ImageField,alt:{type:"text"},
   imageWidth:numericEditorField("imageWidth"),
   imageRadius:numericEditorField("imageRadius"),
   imageOpacity:numericEditorField("imageOpacity"),
   imageBorder:numericEditorField("imageBorder"),
   borderColor:colorEditorField("Color del borde"),
   imageMoveX:numericEditorField("imageMoveX"),
   imageMoveY:numericEditorField("imageMoveY"),
   ratio:{type:"radio",options:[{label:"Cuadrada",value:"square"},{label:"Vertical",value:"portrait"},
    {label:"Horizontal",value:"landscape"},{label:"Panorámica",value:"wide"}]},
   position:{type:"radio",options:[{label:"Centro",value:"center"},{label:"Arriba",value:"top"},{label:"Abajo",value:"bottom"},
    {label:"Izquierda",value:"left"},{label:"Derecha",value:"right"}]},
   visibility:fields.visibility
  },
  defaultProps:{image:"",alt:"",ratio:"landscape",position:"center",radius:"soft",
   imageWidth:100,imageRadius:16,imageOpacity:0,imageBorder:0,borderColor:"#30243F",
   imageMoveX:0,imageMoveY:0,visibility:"all"},
  renderFields:({fields:f})=><>
   <SettingsGroup title="Reemplazar o quitar">{f.image}{f.alt}</SettingsGroup>
   <SettingsGroup title="Tamaño y marco">{f.imageWidth}{f.imageRadius}{f.imageBorder}{f.borderColor}{f.ratio}</SettingsGroup>
   <SettingsGroup title="Transparencia y encuadre">{f.imageOpacity}{f.position}</SettingsGroup>
   <SettingsGroup title="Mover imagen">{f.imageMoveX}{f.imageMoveY}</SettingsGroup>
   <SettingsGroup title="Visibilidad">{f.visibility}</SettingsGroup>
  </>,
  render:({id,image,alt,ratio,position,radius,visibility,
   imageWidth,imageRadius,imageOpacity,imageBorder,borderColor,imageMoveX,imageMoveY,puck})=>{
   const width=numberField(imageWidth,100,25,100);
   const round=numberField(imageRadius,radius==="round"?30:radius==="none"?0:16,0,80);
   const transparency=numberField(imageOpacity,0,0,100);
   const border=numberField(imageBorder,0,0,12);
   const borderPaint=typeof borderColor==="string"&&/^#[\da-f]{6}$/i.test(borderColor)?borderColor:"#30243F";
   return <MovableContent id={id} editing={puck.isEditing}
    x={numberField(imageMoveX,0,-150,150)} y={numberField(imageMoveY,0,-150,150)}
    xKey="imageMoveX" yKey="imageMoveY" className="vmv-compose-photo-box"
    style={{width:width+"%"}}>
    <figure className="vmv-compose-picture"
     data-ratio={ratio||"landscape"} data-position={position||"center"}
     data-mobile-visibility={visibility||"all"}
     style={{borderRadius:round+"px",borderWidth:border+"px",
      borderStyle:border?"solid":"none",borderColor:borderPaint,opacity:(100-transparency)/100}}>
     {safeWebImageUrl(image)?
      <img src={safeWebImageUrl(image)||""} alt={alt||""} loading="lazy"/>:
      puck.isEditing?<div className="vmv-compose-picture-empty"><span aria-hidden="true">▧</span>
       <small>Selecciona esta imagen para agregar una foto</small></div>:null}
    </figure>
   </MovableContent>;
  }
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
  Object.assign(props,numericTypography(source));
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 if(kind==="ComposeText"){
  props.text=str(source.text,2400);
  props.size=select(["small","medium","large"],"medium")(source.size);
  Object.assign(props,numericTypography(source));
  for(const key of ["alignDesktop","alignMobile"])props[key]=select(alignment,"left")(source[key]);
 }
 if(kind==="ComposeImage"){
  props.image=imageUrl(source.image);
  props.alt=str(source.alt,180);
  props.ratio=select(ratios,"landscape")(source.ratio);
  props.position=select(["center","top","bottom","left","right"],"center")(source.position);
  props.radius=select(["none","soft","round"],"soft")(source.radius);
  props.imageWidth=numberField(source.imageWidth,100,25,100);
  props.imageRadius=numberField(source.imageRadius,props.radius==="round"?30:props.radius==="none"?0:16,0,80);
  props.imageOpacity=numberField(source.imageOpacity,0,0,100);
  props.imageBorder=numberField(source.imageBorder,0,0,12);
  props.borderColor=typeof source.borderColor==="string"&&/^#[\da-f]{6}$/i.test(source.borderColor)?source.borderColor:"#30243F";
  props.imageMoveX=numberField(source.imageMoveX,0,-150,150);
  props.imageMoveY=numberField(source.imageMoveY,0,-150,150);
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
