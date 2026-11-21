import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {Render} from "@puckeditor/core";
import {builderConfig} from "@/lib/web-builder-puck";
import {FAMILIES,createSiteProposals,demoSiteForFamily,type SiteFamily} from "@/lib/web-builder-templates";
import "../../../web-builder-public.css";

type Props={params:Promise<{family:string}>};
export function generateStaticParams(){return FAMILIES.map(x=>({family:x.id}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {family}=await params;
 const selected=FAMILIES.find(v=>v.id===family);
 return {title:selected?"DEMO · "+selected.name+" · VMV Web Studio":"Demo no disponible",
  description:"Demostración visual del constructor VMV, sin negocio real ni compras activas.",
  robots:{index:false,follow:false}};
}
export default async function DemoFamilyPage({params}:Props){
 const {family}=await params;
 const selected=FAMILIES.find(v=>v.id===family);
 if(!selected)notFound();
 const demo=demoSiteForFamily(family as SiteFamily);
 const proposal=createSiteProposals(demo,family as SiteFamily)[0];
 return <>
  <aside style={{position:"sticky",top:0,zIndex:50,display:"flex",justifyContent:"space-between",
   gap:15,alignItems:"center",flexWrap:"wrap",padding:"11px 5%",fontFamily:"system-ui",
   background:"#322440",color:"white",fontSize:12}}>
   <span><strong>DEMO VMV · {selected.name}</strong> — Ejemplo visual. No representa un negocio real ni recibe pedidos.</span>
   <a style={{color:"#e8d7fc",fontWeight:800}} href="/web-studio">Crear mi propia web</a>
  </aside>
  <div className="vmv-site">
   <header className="vmv-site-nav">
    <a className="vmv-site-mark" href={"#inicio"}>{demo.business}<span>.</span></a>
    <nav><a href="#servicios">Servicios</a><a href="#contacto">Contacto</a></nav>
   </header>
   <main id="inicio"><Render config={builderConfig} data={proposal.data}/></main>
   <footer className="vmv-site-footer">{demo.business} · DEMOSTRACIÓN, SIN INFORMACIÓN COMERCIAL VERIFICADA</footer>
  </div>
 </>;
}
