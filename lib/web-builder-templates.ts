import type {Data} from "@puckeditor/core";
import {normalizeBuilderDocument} from "./web-builder-puck";
import type {BusinessSocialLinks} from "./web-builder-social";

export type SiteFamily="bakery"|"construction"|"professional"|"beauty"|"creative";
export type SiteObjective="calls"|"quotes"|"bookings"|"orders";
export type SiteOffering="products"|"services"|"both";
export type SiteProduct={id:string;title:string;description:string;image:string;price:string};
export type SiteIntake={
 business:string;categoryId:string;offering:SiteOffering;objective:SiteObjective;
 phone:string;email:string;city:string;about:string;logo:string;photos:string[];
 offerings:string[];products?:SiteProduct[];socials?:BusinessSocialLinks;
};
export type SiteProposal={id:string;family:SiteFamily;name:string;subtitle:string;data:Data;layout:string;palette:string};
export const FAMILIES:{id:SiteFamily;name:string;summary:string;example:string}[]=[
 {id:"bakery",name:"Repostería y productos",summary:"Catálogo fotográfico, detalles y consultas",example:"Demo · Repostería"},
 {id:"construction",name:"Construcción y hogar",summary:"Portada potente, especialidades y proyectos",example:"Demo · Construcción"},
 {id:"professional",name:"Servicios profesionales",summary:"Presentación editorial y contacto claro",example:"Demo · Asesoría"},
 {id:"beauty",name:"Belleza y bienestar",summary:"Imágenes, servicios y solicitud de citas",example:"Demo · Estudio de belleza"},
 {id:"creative",name:"Fotografía y creatividad",summary:"Portafolio protagonista y contacto",example:"Demo · Estudio fotográfico"}
];
export function familyForCategory(category:string):SiteFamily{
 if(["bakery","restaurant","catering","food-truck","cafe","grocery","retail","fashion","jewelry","ecommerce","florist"].includes(category))return "bakery";
 if(["carpentry","general-contractor","home-builder","remodeling","plumbing","electrical","hvac","landscaping","roofing","painting","smart-home","cleaning","interior-design","furniture"].includes(category))return "construction";
 if(["barber","beauty-salon","nails","spa","fitness","wellness","pet-grooming"].includes(category))return "beauty";
 if(["photography","creative-studio","web-design","marketing-agency","music"].includes(category))return "creative";
 return "professional";
}
const messages:Record<SiteFamily,{eyebrow:string;headline:string;lead:string;offerings:string;gallery:string;contact:string}>={
 bakery:{eyebrow:"CELEBRACIONES Y SABORES",headline:"Crea un momento para recordar.",lead:"Conoce nuestras opciones y cuéntanos lo que tienes en mente.",offerings:"Explora lo que ofrecemos",gallery:"Ideas para tu ocasión",contact:"Cuéntanos tu pedido"},
 construction:{eyebrow:"ESPACIOS Y PROYECTOS",headline:"Tu próximo proyecto comienza aquí.",lead:"Descubre nuestras especialidades y conversemos sobre tu idea.",offerings:"Servicios para tu espacio",gallery:"Galería de proyectos",contact:"Solicita un presupuesto"},
 professional:{eyebrow:"ATENCIÓN PERSONALIZADA",headline:"Hablemos de lo que necesitas.",lead:"Conoce nuestros servicios y cómo ponerte en contacto.",offerings:"Áreas de servicio",gallery:"Nuestro trabajo",contact:"Inicia una conversación"},
 beauty:{eyebrow:"CUIDADO Y ESTILO",headline:"Un espacio para ti.",lead:"Descubre los servicios disponibles y solicita información.",offerings:"Servicios y tratamientos",gallery:"Nuestro espacio",contact:"Consulta una cita"},
 creative:{eyebrow:"IMÁGENES CON IDENTIDAD",headline:"Cada imagen tiene una historia.",lead:"Explora nuestro portafolio y cuéntanos tu proyecto.",offerings:"Nuestros formatos",gallery:"Portafolio seleccionado",contact:"Conversemos sobre tu idea"}
};
function cta(goal:SiteObjective,phone:string):{label:string;url:string}{
 if(goal==="calls")return {label:"Consultar por teléfono",url:/^\+?[\d ()-]{7,36}$/.test(phone)? "tel:"+phone.replace(/[^\d+]/g,""):"#solicitud"};
 if(goal==="quotes")return {label:"Solicitar presupuesto",url:"#solicitud"};
 if(goal==="bookings")return {label:"Solicitar cita",url:"#solicitud"};
 return {label:"Consultar pedido",url:"#solicitud"};
}
const node=(type:string,id:string,props:Record<string,unknown>)=>({type,props:{id,...props}});
function previewOfferings(input:SiteIntake){
 const products=(input.products||[]).filter(item=>item.title.trim()).map(item=>({
  title:item.title.trim().slice(0,120),description:item.description.slice(0,400),
  image:item.image||"",alt:item.title.trim().slice(0,120),price:item.price.slice(0,32)
 }));
 const legacy=input.offerings.map((title,i)=>({
  title:title.slice(0,120),description:"",image:input.photos[i+1]||"",alt:title.slice(0,120),price:""
 }));
 if(input.offering==="products")return (products.length?products:legacy).slice(0,30);
 if(input.offering==="both")return [...products,...legacy].slice(0,30);
 return legacy.slice(0,30);
}
function gallery(input:SiteIntake){
 return input.photos.filter(Boolean).map((image,index)=>({image,alt:"Foto "+(index+1)+" de "+input.business,caption:""}));
}
function info(input:SiteIntake,headline:string){
 return node("Contact","contact-main",{title:headline,description:"Envíanos tu consulta para conocer opciones y disponibilidad.",
  email:input.email,phone:input.phone,address:input.city});
}
function hero(input:SiteIntake,family:SiteFamily,layout:"split"|"cover"|"editorial",position:string){
 const m=messages[family],button=cta(input.objective,input.phone);
 return node("HeroVisual","intro-hero",{
  eyebrow:input.business.toUpperCase().slice(0,65),
  title:m.headline,description:input.about||m.lead,
  buttonText:button.label,buttonUrl:button.url,image:input.photos[0]||"",
  imageAlt:"Imagen principal de "+input.business,layout,align:layout==="split"?"left":"center",
  imagePosition:position,shade:"strong",height:"normal",buttonStyle:layout==="editorial"?"outline":"solid"
 });
}
function offerings(input:SiteIntake,family:SiteFamily,layout:"grid"|"mosaic"|"list",surface:string){
 const m=messages[family];
 return node("OfferingGrid","offerings-main",{
  title:m.offerings,description:"",items:previewOfferings(input),layout,padding:"normal",
  surface,columns:layout==="list"?"2":"3",
  showPrices:previewOfferings(input).some(item=>item.price)?"yes":"no"
 });
}
function portfolio(input:SiteIntake,family:SiteFamily,layout:"grid"|"mosaic"|"list",id="gallery-main"){
 return node("PhotoGallery",id,{title:messages[family].gallery,description:"",
  items:gallery(input),layout,padding:"spacious",surface:"light"});
}
function process(){
 return node("ProcessSteps","work-steps",{title:"Cómo trabajamos",items:[],padding:"normal",surface:"soft"});
}
function contact(input:SiteIntake,family:SiteFamily){return info(input,messages[family].contact);}
const variantSpecs=[
 {name:"Luminoso",subtitle:"Fotografía destacada y contenido aireado",layout:"split",palette:"rose",style:"warm",font:"rounded"},
 {name:"Inmersivo",subtitle:"Imagen protagonista y secciones amplias",layout:"cover",palette:"forest",style:"dark",font:"geometric"},
 {name:"Editorial",subtitle:"Tipografía expresiva y composición elegante",layout:"editorial",palette:"terracotta",style:"editorial",font:"editorial"}
] as const;
const familyThemes:Record<SiteFamily,readonly string[]>={
 bakery:["rose","amber","terracotta"],
 construction:["forest","charcoal","amber"],
 professional:["ocean","charcoal","ink"],
 beauty:["rose","terracotta","violet"],
 creative:["ink","forest","ocean"]
};
function assemble(input:SiteIntake,family:SiteFamily,variant:number):Data{
 const p=variantSpecs[variant],media=gallery(input);
 const blocks:Array<{type:string;props:Record<string,unknown>}>=[];
 const first=hero(input,family,p.layout,variant===1?"center":"top");
 if(family==="bakery"){
  blocks.push(first,offerings(input,family,variant===2?"list":variant===1?"mosaic":"grid","light"));
  if(media.length)blocks.push(portfolio(input,family,"mosaic"));
  blocks.push(node("CTA","order-contact",{title:"¿Tienes una idea en mente?",description:"Cuéntanos la fecha y los detalles de tu pedido.",buttonText:cta(input.objective,input.phone).label,buttonUrl:cta(input.objective,input.phone).url}),contact(input,family));
 }else if(family==="construction"){
  blocks.push(first,offerings(input,family,variant===2?"list":"grid","soft"));
  if(media.length)blocks.push(node("ProjectShowcase","projects-main",{title:"Proyectos en imágenes",items:media.map(x=>({image:x.image,title:"",description:"",alt:x.alt})),layout:"mosaic",surface:"light",padding:"spacious"}));
  blocks.push(process(),contact(input,family));
 }else if(family==="professional"){
  blocks.push(first,node("Text","intro-story",{title:"Sobre "+input.business,body:input.about||"Describe aquí tu forma de trabajar y qué servicios ofreces."}),
   offerings(input,family,variant===1?"grid":"list","light"),contact(input,family));
 }else if(family==="beauty"){
  blocks.push(first);
  if(media.length)blocks.push(portfolio(input,family,"mosaic"));
  blocks.push(offerings(input,family,variant===1?"mosaic":"grid","soft"),
   node("HoursArea","hours",{title:"Horarios y zona de atención",hours:"",area:input.city,notes:"Solicita información sobre disponibilidad.",surface:"light",padding:"normal"}),
   contact(input,family));
 }else{
  blocks.push(first);
  if(media.length)blocks.push(portfolio(input,family,variant===0?"mosaic":variant===1?"grid":"list"));
  blocks.push(offerings(input,family,"list","light"),
   node("CTA","creative-contact",{title:"¿Creamos algo juntos?",description:"Cuéntanos el proyecto que tienes en mente.",
    buttonText:cta(input.objective,input.phone).label,buttonUrl:cta(input.objective,input.phone).url}),
   contact(input,family));
 }
 const palette=familyThemes[family][variant]||"violet";
 return normalizeBuilderDocument({root:{props:{
  palette,font:p.font,style:p.style,width:variant===1?"wide":"regular",logo:input.logo,motion:"off",family,
  socialLinks:input.socials
 }},content:blocks});
}
export function createSiteProposals(input:SiteIntake,family=familyForCategory(input.categoryId)):SiteProposal[]{
 return variantSpecs.map((v,i)=>({
  id:family+"-"+i,family,name:v.name,subtitle:v.subtitle,layout:v.layout,
  palette:familyThemes[family][i],data:assemble(input,family,i)
 }));
}
export function demoSiteForFamily(family:SiteFamily):SiteIntake{
 const name=FAMILIES.find(f=>f.id===family)?.example||"Demo";
 const category:Record<SiteFamily,string>={bakery:"bakery",construction:"home-builder",
  professional:"consulting",beauty:"beauty-salon",creative:"photography"};
 const services:Record<SiteFamily,string[]>={bakery:["Pasteles a pedido","Postres","Mesas dulces"],
  construction:["Remodelaciones","Carpintería","Casas inteligentes"],
  professional:["Asesoría","Consultas","Proyectos"],
  beauty:["Corte y peinado","Cuidado personal","Maquillaje"],creative:["Retratos","Eventos","Contenido de marca"]};
 return {business:name,categoryId:category[family],offering:family==="bakery"?"products":"services",
  objective:family==="bakery"?"orders":family==="construction"?"quotes":family==="beauty"?"bookings":"calls",
  phone:"",email:"",city:"",about:"",logo:"",photos:[],offerings:services[family]};
}
