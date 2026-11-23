import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {Render} from "@puckeditor/core";
import {builderConfig} from "@/lib/web-builder-puck";
import {createSiteProposals,demoSiteForFamily,type SiteFamily} from "@/lib/web-builder-templates";
import {restyleWebsiteDocument} from "@/lib/web-builder-safe-styles";
import "../../../../web-builder-public.css";

type Props={params:Promise<{kind:string}>};
export function generateStaticParams(){return [{kind:"products"},{kind:"services"}];}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {kind}=await params;
 return {title:"DEMO · "+(kind==="products"?"Productos":"Servicios")+" · Web Studio",
  robots:{index:false,follow:false}};
}
export default async function LaunchDemo({params}:Props){
 const {kind}=await params;
 if(kind!=="products"&&kind!=="services")notFound();
 const family:SiteFamily=kind==="products"?"bakery":"construction";
 const base=demoSiteForFamily(family);
 const input={...base,business:kind==="products"?"DEMO Repostería":"DEMO Construcción",
  offerings:kind==="products"?["Pasteles","Galletas","Tartaletas","Postres","Mesas dulces"]:
   ["Carpintería","Reformas","Pintura","Interiores","Casas inteligentes"]};
 const original=createSiteProposals(input,family)[0].data;
 const revised=restyleWebsiteDocument(original,"editorial");
 const beforeItems=original.content.find(c=>c.type==="OfferingGrid")?.props?.items;
 const afterItems=revised.content.find(c=>c.type==="OfferingGrid")?.props?.items;
 if(original.content.length!==revised.content.length||JSON.stringify(beforeItems)!==JSON.stringify(afterItems)||
  !Array.isArray(afterItems)||afterItems.length!==5||
  original.content.map(c=>c.props.id).join(",")!==revised.content.map(c=>c.props.id).join(","))
  throw new Error("Visual style update lost content");
 return <main style={{fontFamily:"system-ui",padding:18,background:"#f7f4fb"}}>
  <h1 style={{fontSize:30,letterSpacing:"-.04em"}}>DEMO · {kind==="products"?"Productos":"Servicios"}</h1>
  <p>Negocios ficticios, sin ventas, solicitudes ni reservas. Comparación del mismo contenido.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,370px),1fr))",gap:16}}>
   {([{label:"Antes",data:original},{label:"Después · Otro estilo",data:revised}]).map(item=>
    <section key={item.label} style={{minWidth:0,overflow:"hidden",background:"white",borderRadius:15}}>
     <h2 style={{fontSize:16,padding:12}}>{item.label}</h2>
     <Render config={builderConfig} data={item.data}/>
    </section>)}
  </div>
 </main>;
}
