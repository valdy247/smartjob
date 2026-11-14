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
 const firstImage=typeof imageUrl==="string"?safeWebImageUrl(imageUrl)||"":"";
 const siteLanguage=(rendered.root?.props as Record<string,unknown>|undefined)?.language==="en"?"en":"es";
 const brand=data.site_name||slug;
 const seoTitle=data.title==="Inicio"?brand:
  data.title.toLocaleLowerCase().includes(brand.toLocaleLowerCase())?data.title:data.title+" · "+brand;
 const summary=data.description||"Conoce "+brand;
 const reqHeaders=await headers();
 const isCustom=reqHeaders.get("x-vmv-custom-domain")==="1";
 const host=reqHeaders.get("host")||"";
 const canonical=isCustom&&/^[a-z0-9][a-z0-9.-]{2,250}$/i.test(host)?
  "https://"+host+(part==="home"?"/":"/"+part):undefined;
 return {title:seoTitle,
  description:summary,
  robots:{index:process.env.VERCEL_ENV==="production",follow:true},
  ...(canonical?{alternates:{canonical}}:{}),
  other:{"content-language":siteLanguage},
  openGraph:{title:seoTitle,description:summary,type:"website",locale:siteLanguage==="en"?"en_US":"es_ES",
   ...(canonical?{url:canonical}:{}),
   ...(firstImage?{images:[{url:firstImage,alt:brand}]}:{})},
  twitter:{card:firstImage?"summary_large_image":"summary",title:seoTitle,
   description:summary,
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
 const host=requestHeaders.get("host")||"";
 const verifiedHost=custom&&/^[a-z0-9][a-z0-9.-]{2,250}$/i.test(host);
 const publicUrl=verifiedHost?"https://"+host+(part==="home"?"/":"/"+part):null;
 const facts=data.content.filter(block=>block.type==="Contact")
  .map(block=>block.props||{}).find(block=>block.email||block.phone)||{};
 const organization=publicUrl?{
  "@context":"https://schema.org","@type":"Organization",
  name:siteName,url:publicUrl,
  ...(logo?{logo}:{}),
  ...(typeof facts.phone==="string"&&/^\+?[\d ()-]{7,36}$/.test(facts.phone)?{telephone:facts.phone}:{}),
  ...(typeof facts.email==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facts.email)?{email:facts.email}:{})
 }:null;
 return <WebsiteChrome siteName={siteName} baseUrl={base} menu={result.menu}
  logo={logo} family={family} language={siteLanguage} siteStyle={String(rootData.style||"light")}
  siteWidth={String(rootData.width||"regular")} socialLinks={rootData.socialLinks} visualStyle={visualStyle}>
  {organization?<script type="application/ld+json" dangerouslySetInnerHTML={{
   __html:JSON.stringify(organization).replace(/</g,"\\u003c")
  }}/>:null}
  <Render config={builderConfig} data={data}/>
  {showForm?<section className="vmv-site-inquiry" id="solicitud" aria-label="Enviar solicitud al negocio">
   <small>CONTACTA CON NOSOTROS</small>
   <h2>¿Qué necesitas?</h2>
   <RequestForm source="builder" slug={slug} business={siteName}
    categoryId={result.page.category_id||""} services={services}/>
  </section>:null}
 </WebsiteChrome>;
}
