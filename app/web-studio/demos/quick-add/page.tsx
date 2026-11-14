import type {Metadata} from "next";
import type {Data} from "@puckeditor/core";
import {Render} from "@puckeditor/core";
import {builderConfig,normalizeBuilderDocument,validateBuilderDocument} from "@/lib/web-builder-puck";
import "../../../web-builder-public.css";

export const metadata:Metadata={
 title:"QA · Bloques de Web Studio",
 description:"Prueba de compatibilidad de los bloques del menú flotante.",
 robots:{index:false,follow:false}
};
// The same block identifiers offered in the floating picker are validated and
// rendered with the production public configuration. No real account data.
const offers=[
 "ComposeHeading","ComposeText","ComposeImage","ComposeButton","HeroVisual",
 "OfferingGrid","PhotoGallery","ProjectShowcase","ProcessSteps","HoursArea",
 "PricingList","FAQList","TeamGrid","BeforeAfter","Contact","CTA",
 "SectionLayout","ColumnsLayout","Spacer"
] as const;
const content=offers.map((type,i)=>{
 const config=builderConfig.components[type] as {defaultProps?:Record<string,unknown>};
 if(!config)throw new Error("Quick add block not registered: "+type);
 return {type,props:{...(config.defaultProps||{}),id:"qa-quick-"+i}};
});
const raw={root:{props:{palette:"violet",language:"es"}},
 content} as unknown as Data;
const issue=validateBuilderDocument(raw);
if(issue)throw new Error("Quick add source is not accepted: "+issue);
const normalized=normalizeBuilderDocument(raw);
if(normalized.content.length!==offers.length)throw new Error("Quick add lost components");
for(let i=0;i<offers.length;i++){
 if(normalized.content[i].type!==offers[i]||
 normalized.content[i].props.id!=="qa-quick-"+i)
  throw new Error("Quick add changed component type or order at "+i);
}
const reloaded=normalizeBuilderDocument(JSON.parse(JSON.stringify(normalized)));
if(JSON.stringify(reloaded)!==JSON.stringify(normalized))
 throw new Error("Quick add failed JSON save/reload roundtrip");
export default function QuickAddDemo(){
 return <main style={{padding:"18px clamp(12px,3vw,36px)",background:"#f8f5fa",fontFamily:"system-ui"}}>
  <h1 style={{fontSize:24,color:"#4d3569",marginBottom:7}}>QA · Menú +</h1>
  <p style={{fontSize:12,color:"#81748c",lineHeight:1.5}}>
   {offers.length} tipos admitidos por el normalizador y el render público.
   No es un negocio real ni admite compras.
  </p>
  <Render config={builderConfig} data={normalized}/>
 </main>;
}
