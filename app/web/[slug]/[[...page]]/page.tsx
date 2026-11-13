import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {Render} from "@puckeditor/core";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {familyForCategory} from "@/lib/web-builder-templates";
import {WebsiteChrome,websiteVisualStyle} from "@/lib/web-site-chrome";
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
 const image=rendered.content.find(item=>item.type==="Image"||item.type==="HeroVisual"||item.type==="ComposeImage");
 const imageUrl=image?.type==="Image"?image.props?.url:image?.props?.image;
 const firstImage=typeof imageUrl==="string"?imageUrl:"";
 const siteLanguage=(rendered.root?.props as Record<string,unknown>|undefined)?.language==="en"?"en":"es";
 return {title:(data.title==="Inicio"?data.site_name:data.title+" · "+data.site_name),
  description:data.description||"Conoce "+data.site_name,
  robots:{index:process.env.VERCEL_ENV==="production",follow:true},
  other:{"content-language":siteLanguage},
  openGraph:{title:data.title==="Inicio"?data.site_name:data.title,description:data.description||data.site_name,type:"website",locale:siteLanguage==="en"?"en_US":"es_ES",
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
 const siteLanguage=rootData.language==="en"?"en":"es";
 const logo=safeWebImageUrl(typeof rootData.logo==="string"?rootData.logo:"");
 const visualStyle=websiteVisualStyle(rootData.palette,rootData.accentColor);
 const family=typeof rootData.family==="string"&&["bakery","construction","professional","beauty","creative"].includes(rootData.family)?rootData.family:familyForCategory(result.page.category_id||"");
 const showForm=part==="home"&&result.page.inquiries_enabled===true;
 return <WebsiteChrome siteName={siteName} baseUrl={base} menu={result.menu}
  logo={logo} family={family} language={siteLanguage} siteStyle={String(rootData.style||"light")}
  siteWidth={String(rootData.width||"regular")} visualStyle={visualStyle}>
  <Render config={builderConfig} data={data}/>
  {showForm?<section className="vmv-site-inquiry" id="solicitud" aria-label="Enviar solicitud al negocio">
   <small>CONTACTA CON NOSOTROS</small>
   <h2>¿Qué necesitas?</h2>
   <RequestForm source="builder" slug={slug} business={siteName}
    categoryId={result.page.category_id||""} services={services}/>
  </section>:null}
 </WebsiteChrome>;
}
