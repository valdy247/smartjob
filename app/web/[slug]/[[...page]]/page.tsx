import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {Render} from "@puckeditor/core";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import "../../public.css";

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
   .select("site_name,title,description,document,site_slug,page_slug")
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
 return {title:(data.title==="Inicio"?data.site_name:data.title+" · "+data.site_name),
  description:data.description||"Conoce "+data.site_name,
  openGraph:{title:data.title==="Inicio"?data.site_name:data.title,description:data.description||data.site_name,type:"website"}
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
 return <div className="vmv-site">
  <header className="vmv-site-nav">
   <a className="vmv-site-mark" href={base||"/"}>{siteName}<span>.</span></a>
   <nav aria-label="Páginas del sitio">
    {result.menu.map(item=><a key={item.page_slug} href={item.page_slug==="home"?(base||"/"):(base+"/"+item.page_slug)}>
     {item.page_slug==="home"?"Inicio":item.title}</a>)}
   </nav>
  </header>
  <main><Render config={builderConfig} data={data}/></main>
  <footer className="vmv-site-footer"><span>{siteName}</span><span>© {new Date().getUTCFullYear()}</span></footer>
 </div>;
}
