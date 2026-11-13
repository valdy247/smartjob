import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {Render} from "@puckeditor/core";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {familyForCategory} from "@/lib/web-builder-templates";
import type {CSSProperties} from "react";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import "../../../web-builder-public.css";

export const dynamic="force-dynamic";
type Props={params:Promise<{slug:string;page?:string[]}>};
const valid=(value:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)&&value.length<=64;
async function findPage(slug:string,part:string){
 if(!valid(slug)||!valid(part))return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return null;
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const [page,menu]=await Promise.all([
  client.from("smartjob_builder_public_pages")
   .select("site_name,title,description,document,site_slug,page_slug,inquiries_enabled,category_id")
   .eq("site_slug",slug).eq("page_slug",part).maybeSingle(),
  client.from("smartjob_builder_public_pages")
   .select("title,page_slug").eq("site_slug",slug).order("page_slug")
 ]);
 if(page.error||menu.error||!page.data)return null;
 return {page:page.data,menu:menu.data||[]};
}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug,page=[]}=await params;
 const part=page.length===0?"home":page.length===1?page[0]:"";
 const result=await findPage(slug,part);
 if(!result)return {title:"Sitio no disponible",robots:{index:false,follow:false}};
 const data=result.page;
 const rendered=normalizeBuilderDocument(data.document);
 const image=rendered.content.find(item=>item.type==="Image");
 const firstImage=typeof image?.props?.url==="string"?image.props.url:"";
 return {title:(data.title==="Inicio"?data.site_name:data.title+" · "+data.site_name),
  description:data.description||"Conoce "+data.site_name,
  robots:{index:process.env.VERCEL_ENV==="production",follow:true},
  openGraph:{title:data.title==="Inicio"?data.site_name:data.title,description:data.description||data.site_name,type:"website",
   ...(firstImage?{images:[{url:firstImage,alt:data.site_name}]}:{})},
  twitter:{card:firstImage?"summary_large_image":"summary",title:data.site_name,
   description:data.description||data.site_name,
   ...(firstImage?{images:[firstImage]}:{})}
 };
}
export default async function VMVPublishedPage({params}:Props){
 const {slug,page=[]}=await params;
 const part=page.length===0?"home":page.length===1?page[0]:"";
 const result=await findPage(slug,part);
 if(!result)notFound();
 const requestHeaders=await headers();
 const custom=requestHeaders.get("x-vmv-custom-domain")==="1";
 const base=custom?"":"/web/"+slug;
 const siteName=result.page.site_name||slug.replace(/-/g," ");
 const data=normalizeBuilderDocument(result.page.document);
 const classicServices=data.content.filter(b=>b.type==="Services").flatMap(b=>
  ["first","second","third"].map(k=>b.props?.[k]).filter((s):s is string=>typeof s==="string"&&Boolean(s.trim())));
 const visualServices=data.content.filter(b=>b.type==="OfferingGrid").flatMap(b=>
  Array.isArray(b.props?.items)?b.props.items.flatMap((item:unknown)=>
   item&&typeof item==="object"&&typeof (item as {title?:unknown}).title==="string"?[(item as {title:string}).title]:[]):[]);
 const services=Array.from(new Set([...classicServices,...visualServices])).slice(0,30);
 const rootData=(data.root?.props||{}) as Record<string,unknown>;
 const logo=safeWebImageUrl(typeof rootData.logo==="string"?rootData.logo:"");
 const palette=typeof rootData.palette==="string"?rootData.palette:"violet";
 const colorMap:Record<string,[string,string]>={
  violet:["#8e5de4","#f0e9fd"],mint:["#198d74","#e5f8f0"],amber:["#a97b26","#fff4d8"],
  ink:["#30283a","#eae8ed"],rose:["#b64b70","#fff0f4"],forest:["#367457","#e9f4eb"],
  ocean:["#267a9c","#e8f6fb"],terracotta:["#af6242","#fbede2"],charcoal:["#24232b","#efedf2"]
 };
 const colors=colorMap[palette]||colorMap.violet;
 const accent=typeof rootData.accentColor==="string"&&/^#[0-9a-f]{6}$/i.test(rootData.accentColor)?
  rootData.accentColor:colors[0];
 const visualStyle={ "--vmv-accent":accent,"--vmv-pale":colors[1] } as CSSProperties;
 const family=familyForCategory(result.page.category_id||"");
 const showForm=part==="home"&&result.page.inquiries_enabled===true;
 return <div className="vmv-site" data-site-style={rootData.style||"light"}
  data-site-family={family} style={visualStyle}>
  <header className="vmv-site-nav" data-header-family={family}>
   <a className="vmv-site-mark" href={base||"/"}>
    {logo?<img src={logo} width="52" height="52" alt={"Logo de "+siteName} />:null}
    <span className="vmv-site-brand-name">{siteName}<span>.</span></span>
   </a>
   <nav aria-label="Páginas del sitio">
    {result.menu.map(item=><a key={item.page_slug} href={item.page_slug==="home"?(base||"/"):(base+"/"+item.page_slug)}>
     {item.page_slug==="home"?"Inicio":item.title}</a>)}
   </nav>
  </header>
  <main><Render config={builderConfig} data={data}/>
   {showForm?<section className="vmv-site-inquiry" id="solicitud" aria-label="Enviar solicitud al negocio">
    <small>CONTACTA CON NOSOTROS</small>
    <h2>¿Qué necesitas?</h2>
    <RequestForm source="builder" slug={slug} business={siteName}
     categoryId={result.page.category_id||""} services={services}/>
   </section>:null}
  </main>
  <footer className="vmv-site-footer"><span>{siteName}</span><span>© {new Date().getUTCFullYear()}</span></footer>
 </div>;
}
