import type {CSSProperties} from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {normalizeWebContent,paletteStyles,webEmail,webPhone,webServices} from "@/lib/web-services-site";
import "./site.css";

export const dynamic="force-dynamic";
type Props={params:Promise<{slug:string}>};

async function lookupPublishedSite(slug:string){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>64)return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return null;
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await supabase.from("smartjob_web_publications")
  .select("content").eq("slug",slug).maybeSingle();
 return !error&&data?normalizeWebContent(data.content):null;
}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug}=await params;
 const content=await lookupPublishedSite(slug);
 if(!content)return {title:"Sitio no disponible",robots:{index:false,follow:false}};
 return {
  title:content.business||"Mi negocio",
  description:content.intro||content.headline||content.business,
  robots:{index:true,follow:true},
  openGraph:{title:content.business,description:content.intro||content.headline,type:"website"}
 };
}
export default async function PublishedBusinessWebsite({params}:Props){
 const {slug}=await params;
 const page=await lookupPublishedSite(slug);
 if(!page||!page.business||!page.headline)notFound();
 const palette=paletteStyles[page.palette];
 const custom={"--ws-color":palette.accent,"--ws-surface":palette.light,"--ws-ink":palette.ink} as CSSProperties;
 const services=webServices(page);
 const email=webEmail(page);
 const phone=webPhone(page);
 return <div className={"ws-public ws-public--"+page.template} style={custom}>
  <header className="ws-public-nav">
   <a className="ws-public-mark" href="#inicio" aria-label={page.business}>{page.business}<span>.</span></a>
   <nav aria-label="Navegación"><a href="#servicios">Servicios</a><a href="#nosotros">Nosotros</a><a href="#contacto">Contacto</a></nav>
  </header>
  <main>
   <section id="inicio" className="ws-public-hero">
    <span className="ws-public-eyebrow">{page.eyebrow||"SERVICIOS · EXPERIENCIAS"}</span>
    <h1>{page.headline}</h1>
    {page.intro?<p>{page.intro}</p>:null}
    <a className="ws-public-button" href="#contacto">{page.action||"Contáctanos"} <span aria-hidden="true">↗</span></a>
    <div className="ws-public-graphic" aria-hidden="true">✳</div>
   </section>
   <section id="servicios" className="ws-public-section">
    <small>01 / SERVICIOS</small>
    <h2>Lo que hacemos<span>.</span></h2>
    <div className="ws-public-service-grid">
     {services.length?services.map((name,i)=><article key={i}>
       <span>{"0"+(i+1)}</span><h3>{name}</h3><span aria-hidden="true">↗</span>
      </article>):<article><h3>{page.business}</h3></article>}
    </div>
   </section>
   <section id="nosotros" className="ws-public-section ws-public-about">
    <small>02 / NOSOTROS</small><h2>Conócenos<span>.</span></h2>
    <p>{page.about||page.intro||page.headline}</p>
   </section>
   <section id="contacto" className="ws-public-section ws-public-contact">
    <small>03 / CONTACTO</small><h2>Hablemos<span>.</span></h2>
    <div className="ws-public-contacts">
     {email?<a href={"mailto:"+email}>{email}</a>:null}
     {phone?<a href={"tel:"+phone}>{page.phone}</a>:null}
     {page.address?<p>{page.address}</p>:null}
    </div>
   </section>
  </main>
  <footer className="ws-public-footer"><span>{page.business}</span><span>© {new Date().getUTCFullYear()}</span></footer>
 </div>;
}
