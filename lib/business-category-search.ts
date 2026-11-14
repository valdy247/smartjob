import {BUSINESS_CATEGORIES} from "./vmv-business-categories";
const aliases:Record<string,string>={
 bakery:"dulce dulces postre postres pastel pasteles torta tartas pan panadero repostero reposteria pasteleria bizcocho cake cakes bakery baker dessert pastry sweets cupcakes flan",
 carpentry:"carpintero carpintera madera ebanista carpinteria carpenter wood woodworking cabinets gabinetes",
 legal:"abogado abogada abogados bufete leyes legal lawyer attorney law notario notary",
 restaurant:"comida cocina cocinero restaurante restaurant chef food",cafe:"cafe coffee cafeteria espresso",catering:"banquete comida eventos catering",grocery:"mercado supermercado alimentos grocery market",
 barber:"barbero barberia pelo cabello barber haircut",'beauty-salon':"peluquera peluquero salon cabello peinado hairdresser hair salon",nails:"manicura pedicura unas nails manicure",spa:"masajista masaje spa massage",fitness:"entrenador gimnasio gym fitness trainer",wellness:"bienestar wellness",
 electrical:"electricista electricidad electrician electrical",plumbing:"plomero fontanero tuberia agua plumber plumbing",hvac:"aire acondicionado refrigeracion calefaccion ac heating cooling hvac",landscaping:"jardinero jardin cesped landscaping lawn gardener",cleaning:"limpiador limpieza aseo cleaning cleaner maid",roofing:"techador techo tejado roofing roofer",painting:"pintor pintura painting painter",remodeling:"remodelacion renovacion reforma remodeling renovation",'general-contractor':"contratista constructor contractor construction",'home-builder':"construccion vivienda casas builder homebuilding",'smart-home':"domotica automatizacion smart home",
 'real-estate':"inmobiliaria realtor bienes raices real estate",'property-management':"alquiler administracion propiedades property manager",'interior-design':"interiores decorador interior designer",furniture:"muebles mobiliario furniture decor",retail:"tienda comercio retail store",fashion:"ropa boutique moda clothing fashion",jewelry:"joyero joyas joyeria jewelry",ecommerce:"tienda online ecommerce shop",
 automotive:"mecanico taller auto mecanica mechanic garage auto repair",'car-detailing':"lavado autos detailing car wash",'car-sales':"venta carros concesionario dealership",transport:"chofer transporte camion camionero transporte trucking logistics driver",courier:"repartidor entrega mensajero delivery courier",
 software:"programador informatica software developer tech",'web-design':"pagina web disenador website web design",'marketing-agency':"publicidad anuncios marketing ads",'creative-studio':"disenador grafico creativo graphic design",photography:"fotografo fotos video photography photographer",consulting:"consultor asesoria consultoria consultant",accounting:"contador contable impuestos taxes tax accountant bookkeeping",insurance:"seguro aseguradora insurance",translation:"traductor interprete translator interpreter",
 education:"profesor maestro tutor clases teacher tutoring",'online-courses':"curso online courses",childcare:"ninera guarderia daycare babysitter childcare",healthcare:"medico doctor enfermera clinica salud medical nurse clinic",dental:"dentista dientes odontologo dentist dental",'pet-grooming':"peluqueria canina groomer grooming",veterinary:"veterinario animales veterinary vet",'pet-care':"mascotas paseador perros pet sitter dog walker",'event-planning':"fiestas boda wedding organizador eventos planner",florist:"florista flores florist flowers",music:"musico cantante dj music singer",hospitality:"hotel hospedaje alojamiento hotel lodging",'travel-agency':"viajes turismo travel tourism",nonprofit:"fundacion caridad nonprofit charity",'food-truck':"camion comida food truck"
};
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function distance(a:string,b:string){
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];
}
export function searchBusinessCategories(query:string){
 const ignored=new Set(["soy","vendo","hago","negocio","de","del","la","el","los","las","un","una","a","en","me","dedico","my","business","sell","i","am","a","an"]);
 const terms=normalize(query).split(/\s+/).filter(term=>term&&!ignored.has(term));
 if(!terms.length)return [...BUSINESS_CATEGORIES];
 return BUSINESS_CATEGORIES.map(category=>{
  const words=normalize(category.id+" "+category.label+" "+(aliases[category.id]||"")).split(" ");
  let score=0;
  for(const term of terms){
   const best=Math.max(...words.map(word=>word===term?100:word.startsWith(term)?70:term.length>=3&&word.includes(term)?45:term.length>=4&&Math.abs(word.length-term.length)<=2&&distance(term,word)<=(term.length>=7?2:1)?25:0));
   if(!best)return {category,score:0};score+=best;
  }
  return {category,score};
 }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score).map(row=>row.category);
}
