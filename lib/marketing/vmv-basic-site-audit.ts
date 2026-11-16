import {createClient} from "@supabase/supabase-js";

type PublishedPage={
 title:string|null;description:string|null;site_name:string|null;
 published_at:string|null;document:unknown;
};
const trustedVercelDeployment=/^smartjob-[a-z0-9-]+-valdys-projects-b97fc7a6\.vercel\.app$/;
const validSlug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** This checks an existing published VMV page in the public database.
 * It is NOT a Lighthouse run: no invented speed, accessibility or SEO scores.
 * Only support this project's recognized Vercel domains and published routes.
 * No user-provided URL is fetched by this fallback. */
export async function publishedVmvBasicAudit(raw:string,locale:"es"|"en"){
 const target=new URL(raw);
 const page=target.pathname.match(/^\/web\/([a-z0-9-]+)\/?$/);
 if(!trustedVercelDeployment.test(target.hostname)||!page||!validSlug.test(page[1])||
  page[1].length>64)return null;
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)return null;
 const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from("smartjob_builder_public_pages")
  .select("title,description,site_name,published_at,document")
  .eq("site_slug",page[1]).eq("page_slug","home").maybeSingle();
 if(error||!data)return null;
 const published=data as PublishedPage;
 const name=(published.site_name||page[1]).slice(0,140);
 const title=(published.title||"").trim();
 const summary=(published.description||"").trim();
 const hasContent=Boolean(published.document&&
  typeof published.document==="object"&&
  Array.isArray((published.document as {content?:unknown}).content)&&
  (published.document as {content:unknown[]}).content.length>0);
 const isEnglish=locale==="en";
 const findings=[
  {id:"published",title:isEnglish?"Published website found":"Web publicada encontrada",
   description:isEnglish?"The page exists in VMV Business.":"La página existe en VMV Business.",score:null},
  {id:"title",title:isEnglish?(title?"Page title configured":"Page title missing"):(title?"Título configurado":"Falta el título"),
   description:title?title.slice(0,160):(isEnglish?"Add a descriptive page title.":"Añade un título descriptivo."),score:null},
  {id:"description",title:isEnglish?(summary?"Description configured":"Description missing"):(summary?"Descripción configurada":"Falta la descripción"),
   description:summary?summary.slice(0,250):(isEnglish?"Add a search engine description.":"Añade una descripción para buscadores."),score:null},
  {id:"sections",title:isEnglish?(hasContent?"Page sections found":"Review page content"):(hasContent?"Secciones de la página encontradas":"Revisar contenido de la página"),
   description:isEnglish?"Structural check only, not a quality or ranking score.":"Comprobación estructural; no es una puntuación de calidad.",score:null}
 ];
 const recommendations:string[]=[];
 if(!title)recommendations.push(isEnglish?"Add a page title.":"Añadir un título a la página.");
 if(!summary)recommendations.push(isEnglish?"Add a search description.":"Añadir una descripción para buscadores.");
 if(!hasContent)recommendations.push(isEnglish?"Review the published content.":"Revisar el contenido publicado.");
 recommendations.push(isEnglish?
  "Measure speed and accessibility with Google PageSpeed after enabling public access or using the final domain.":
  "Medir velocidad y accesibilidad con Google PageSpeed cuando la URL sea pública o uses el dominio definitivo.");
 return {
  source:"VMV Business · "+(isEnglish?"Basic published-page check":"Revisión básica de página publicada"),
  website:raw,analyzedAt:new Date().toISOString(),
  scores:{performance:null,seo:null,accessibility:null},
  recommendations,findings,status:"partial" as const,
  explanation:isEnglish?
   "We verified this VMV page is published and checked its title, description and structure. Google PageSpeed did not return measurements for this Vercel preview. No performance, accessibility or SEO score has been estimated.":
   "Verificamos que esta página de VMV está publicada y revisamos su título, descripción y estructura. Google PageSpeed no devolvió mediciones para este enlace de Vercel. No se han estimado puntuaciones de velocidad, accesibilidad ni SEO.",
  explanationSource:"automatic" as const,name
 };
}
