import type {Data} from "@puckeditor/core";
import {normalizeBuilderDocument,validateBuilderDocument} from "./web-builder-puck";
import {createSiteProposals,familyForCategory,type SiteIntake,type SiteProposal} from "./web-builder-templates";

/** AI writes bounded copy and chooses a verified design; it never writes executable HTML. */
type AIText=Record<string,unknown>;
const record=(v:unknown):AIText=>v&&typeof v==="object"&&!Array.isArray(v)?v as AIText:{};
const copy=(value:unknown,max:number)=>typeof value==="string"?
 value.replace(/<[^>]*>/g,"").replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";
function picked(value:unknown,max:number,backup:string){return copy(value,max)||copy(backup,max);}
function titleForSearch(value:unknown,input:SiteIntake){
 const name=copy(input.business,70);
 const suggested=copy(value,75);
 if(!suggested)return name;
 if(suggested.toLocaleLowerCase("es").includes(name.toLocaleLowerCase("es")))return suggested;
 return (suggested+" | "+name).slice(0,80);
}
function descriptionForSearch(value:unknown,input:SiteIntake){
 const offerings=[...(input.products||[]).map(p=>p.title),...input.offerings].filter(Boolean).slice(0,3).join(", ");
 const location=input.city?" en "+input.city:"";
 const backup=input.about||("Conoce "+(offerings||"los servicios")+" de "+input.business+location+". Consulta opciones y ponte en contacto.");
 return picked(value,160,backup).slice(0,160);
}
function ctaLink(input:SiteIntake){
 if(input.objective==="calls"&&/^\+?[\d ()-]{7,36}$/.test(input.phone))
  return "tel:"+input.phone.replace(/[^\d+]/g,"");
 return "#solicitud";
}
function safeString(value:unknown,max:number,backup:string){return picked(value,max,backup);}
export function buildAiSiteProposal(input:SiteIntake,result:unknown):SiteProposal{
 const raw=record(result);
 if(!raw.hero||!raw.seo||!raw.design)throw new Error("La IA no devolvió un diseño válido.");
 const hero=record(raw.hero),seo=record(raw.seo),sections=record(raw.sections),design=record(raw.design);
 const family=familyForCategory(input.categoryId);
 const variant=["luminous","immersive","editorial"].indexOf(String(design.variant||""));
 if(variant<0)throw new Error("La IA no eligió un estilo disponible.");
 const base=createSiteProposals(input,family)[variant];
 const cta=ctaLink(input);
 const offerings=[...(input.products||[]).map(p=>p.title),...input.offerings].filter(Boolean).slice(0,5);
 const contactLabel=input.objective==="calls"?"Llámanos":input.objective==="bookings"?"Solicitar cita":
  input.objective==="quotes"?"Solicitar presupuesto":"Consultar pedido";
 const content=(base.data.content as Array<{type:string;props:Record<string,unknown>}>).map(item=>{
  const props={...item.props};
  switch(item.type){
   case "HeroVisual":
    props.eyebrow=safeString(hero.eyebrow,62,input.business.toUpperCase());
    props.title=safeString(hero.title,104,input.business);
    props.description=safeString(hero.description,260,input.about||"Descubre nuestras opciones y cuéntanos qué necesitas.");
    props.buttonText=safeString(hero.button,44,contactLabel);
    props.buttonUrl=cta;
    props.imageAlt=props.image?"Imagen principal de "+input.business:"";
    break;
   case "OfferingGrid":
    props.title=safeString(sections.offeringsTitle,85,"Lo que ofrecemos");
    props.description=safeString(sections.offeringsDescription,220,"Conoce las opciones disponibles y consulta los detalles.");
    // Preserve owner-provided item IDs, images, names, descriptions and prices.
    break;
   case "PhotoGallery":case "ProjectShowcase":
    props.title=safeString(sections.galleryTitle,85,"Nuestro trabajo");
    break;
   case "CTA":
    props.title=safeString(sections.ctaTitle,110,"¿Hablamos de tu idea?");
    props.description=safeString(sections.ctaDescription,230,"Cuéntanos qué necesitas y te responderemos.");
    props.buttonText=safeString(hero.button,44,contactLabel);
    props.buttonUrl=cta;
    break;
   case "Contact":
    props.title=safeString(sections.contactTitle,85,"Ponte en contacto");
    props.description=safeString(sections.contactDescription,220,"Envíanos tu consulta.");
    props.email=input.email;props.phone=input.phone;props.address=input.city;
    break;
  }
  return {...item,props};
 });
 const about=copy(input.about,500);
 if(about&&content.every(block=>block.type!=="Text")){
  content.splice(1,0,{type:"Text",props:{id:"ai-about",title:safeString(sections.aboutTitle,110,"Conoce "+input.business),
   body:safeString(sections.aboutBody,700,about)}});
 }
 // Only offer factual FAQs; an LLM must not invent hours, policies or guarantees.
 const faqs:Array<{id:string;question:string;answer:string}>=[];
 if(input.email||input.phone){
  faqs.push({id:"ai-faq-contact",question:"¿Cómo puedo comunicarme?",
   answer:"Puedes contactarnos "+[input.phone?"por teléfono al "+input.phone:"",input.email?"por correo a "+input.email:""].filter(Boolean).join(" o ")+ "."});
 }
 if(offerings.length){
  faqs.push({id:"ai-faq-offerings",question:"¿Qué opciones ofrecen?",
   answer:"Entre nuestras opciones están "+offerings.join(", ")+". Escríbenos para consultar los detalles."});
 }
 if(faqs.length){
  const pos=content.findIndex(item=>item.type==="Contact");
  content.splice(pos<0?content.length:pos,0,{type:"FAQList",props:{
   id:"ai-faq",title:"Preguntas frecuentes",items:faqs,padding:"normal",surface:"soft"
  }});
 }
 const data=normalizeBuilderDocument({root:base.data.root,content});
 const issue=validateBuilderDocument(data);
 if(issue)throw new Error(issue);
 const seoTitle=titleForSearch(seo.title,input);
 const seoDescription=descriptionForSearch(seo.description,input);
 return {...base,id:"ai-"+family+"-"+variant,name:"Diseño con IA",
  subtitle:"Un sitio editable con textos originales y estructura optimizada",
  data:data as Data,seoTitle,seoDescription,aiGenerated:true};
}
export function buildAiPageProposal(input:SiteIntake,result:unknown,pageName:string):SiteProposal{
 const whole=buildAiSiteProposal(input,result);
 const name=copy(pageName,80);
 if(name.length<2)throw new Error("La página necesita un nombre.");
 const lower=name.toLocaleLowerCase("es");
 const isContact=/contact|contacto|ubicaci[oó]n|cita|reserv/.test(lower);
 const isAbout=/nosotros|sobre|equipo|historia|acerca|about/.test(lower);
 const isPortfolio=/galer[ií]a|portafolio|proyectos|trabajos|fotos|portfolio/.test(lower);
 const isServices=/servicios|productos|cat[aá]logo|men[uú]|precios|services|products/.test(lower);
 const keep=new Set(isContact?["HeroVisual","Contact"]:
  isAbout?["HeroVisual","Text","Contact"]:
  isPortfolio?["HeroVisual","PhotoGallery","ProjectShowcase","Contact"]:
  isServices?["HeroVisual","OfferingGrid","PricingList","FAQList","Contact"]:
  ["HeroVisual","OfferingGrid","Text","FAQList","Contact"]);
 let content=(whole.data.content as Array<{type:string;props:Record<string,unknown>}>)
  .filter(item=>keep.has(item.type));
 if(!content.some(item=>item.type==="Contact")){
  content=[...content,{type:"Contact",props:{id:"ai-page-contact",title:"Contacto",description:"",
   email:input.email,phone:input.phone,address:input.city}}];
 }
 if(content.some(x=>x.type==="HeroVisual"))content=content.map(item=>item.type==="HeroVisual"?
  {...item,props:{...item.props,buttonUrl:"#contacto"}}:item);
 // A subpage does not embed the home-only request form. All CTAs must be live.
 content=content.map(item=>item.type==="CTA"?{...item,props:{...item.props,buttonUrl:"#contacto"}}:item);
 // When a relevant block has no verified content, omit rather than invent it.
 content=content.filter(item=>!["PhotoGallery","ProjectShowcase"].includes(item.type)||
  (Array.isArray(item.props.items)&&item.props.items.length>0));
 const data=normalizeBuilderDocument({root:whole.data.root,content});
 const problem=validateBuilderDocument(data);if(problem)throw new Error(problem);
 let seoTitle=whole.seoTitle||"";
 const brand=input.business;
 if(!seoTitle.toLocaleLowerCase("es").includes(name.toLocaleLowerCase("es"))){
  seoTitle=(name+" | "+brand).slice(0,80);
 }
 return {...whole,id:"ai-page-"+name.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g,"-"),
  name:"Página con IA · "+name,subtitle:"Página enfocada en "+name+" · editable",
  data,seoTitle,seoDescription:whole.seoDescription};
}
export function aiSiteRequestContext(input:SiteIntake,creativeDirection:string,pageName=""){
 // The model receives facts, not URLs, upload tokens or arbitrary component code.
 return {
  business:input.business.slice(0,100),categoryId:input.categoryId.slice(0,60),
  offering:input.offering,objective:input.objective,
  city:input.city.slice(0,150),about:input.about.slice(0,500),
  hasPhone:Boolean(input.phone),hasEmail:Boolean(input.email),
  offerings:input.offerings.slice(0,16).map(x=>x.slice(0,120)),
  products:(input.products||[]).slice(0,24).map(x=>({name:x.title.slice(0,120),
   description:x.description.slice(0,320)})),
  imagesAvailable:input.photos.filter(Boolean).length,
  direction:creativeDirection.slice(0,400),pageName:pageName.slice(0,80)
 };
}
export function parseAiSiteResponse(raw:string):unknown{
 const unwrapped=raw.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
 const json=unwrapped.slice(unwrapped.indexOf("{"),unwrapped.lastIndexOf("}")+1);
 if(json.length<30||json.length>12000)throw new Error("La respuesta de diseño llegó incompleta.");
 return JSON.parse(json) as unknown;
}
