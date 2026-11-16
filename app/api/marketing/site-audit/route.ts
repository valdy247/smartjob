import {NextRequest,NextResponse} from "next/server";
import {publishedVmvBasicAudit} from "@/lib/marketing/vmv-basic-site-audit";

export const runtime="nodejs";
export const maxDuration=120;

const fixedOrigin="https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
function safePublicWebsite(raw:string){
 if(!raw||raw.length>500)return null;
 try{
  const parsed=new URL(raw);
  if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)return null;
  const host=parsed.hostname.toLowerCase();
  if(!host.includes(".")||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))return null;
  if(/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)||host==="::1"||host.startsWith("[")||/^\d+(?:\.\d+){3}$/.test(host))return null;
  return parsed.toString();
 }catch{return null;}
}
type Audit={title?:string;description?:string;score?:number|null;scoreDisplayMode?:string};
type PsiResult={
 lighthouseResult?:{
  categories?:Record<string,{score?:number}>;
  audits?:Record<string,Audit>;
  finalDisplayedUrl?:string;
 };
 error?:{message?:string};
};
function roundScore(score?:number){return typeof score==="number"&&Number.isFinite(score)?Math.round(score*100):null;}

export async function GET(req:NextRequest){
 const website=safePublicWebsite(req.nextUrl.searchParams.get("url")||"");
 const locale=req.nextUrl.searchParams.get("lang")==="en"?"en":"es";
 const errorCopy=(es:string,en:string)=>locale==="en"?en:es;
 if(!website)return NextResponse.json({error:errorCopy("Introduce una URL pública válida (https://...).","Enter a valid public website URL (https://...).")}, {status:400});
 const normalized=new URL(website);
 // Tracking parameters are not part of the published page being measured.
 for(const k of [...normalized.searchParams.keys()]){
  if(/^utm_|^(fbclid|gclid|msclkid)$/i.test(k))normalized.searchParams.delete(k);
 }
 const measuredUrl=normalized.toString();
 const endpoint=new URL(fixedOrigin);
 const reportUrl="https://pagespeed.web.dev/?url="+encodeURIComponent(measuredUrl);
 endpoint.searchParams.set("url",measuredUrl);
 endpoint.searchParams.set("strategy","MOBILE");
 endpoint.searchParams.set("locale",locale);
 for(const category of ["PERFORMANCE","SEO","ACCESSIBILITY"])endpoint.searchParams.append("category",category);
 // Optional key is server-side only; without it the public free quota is used.
 if(process.env.GOOGLE_PAGESPEED_API_KEY)endpoint.searchParams.set("key",process.env.GOOGLE_PAGESPEED_API_KEY);
 try{
  // A temporary VMV preview may be inaccessible to Google's external crawler.
  // Fail over to explicitly limited, evidence-based DB checks for our own site.
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(95000),next:{revalidate:86400}});
  if(!response.ok){
   const fallback=await publishedVmvBasicAudit(measuredUrl,locale).catch(()=>null);
   if(fallback)return NextResponse.json(fallback,{headers:{"Cache-Control":"no-store"}});
   const message=response.status===429?errorCopy("Google alcanzó su límite de consultas. Intenta más tarde.","Google's quota was reached. Try again later."):errorCopy("Google no pudo analizar esta dirección. Comprueba que la página sea pública y vuelve a intentarlo.","Google could not analyze this URL. Check that the page is public and try again.");
   return NextResponse.json({error:message,reportUrl}, {status:response.status===429?429:502});
  }
  const parsed=await response.json() as PsiResult;
  const lighthouse=parsed.lighthouseResult;
  if(!lighthouse?.categories){
   const fallback=await publishedVmvBasicAudit(measuredUrl,locale).catch(()=>null);
   if(fallback)return NextResponse.json(fallback,{headers:{"Cache-Control":"no-store"}});
   return NextResponse.json({error:errorCopy("Google no devolvió mediciones para este sitio.","Google returned no measurements for this website.")},{status:502});
  }
  const priorityAudits=[
   "largest-contentful-paint","render-blocking-resources","modern-image-formats","uses-optimized-images",
   "uses-responsive-images","unused-javascript","total-blocking-time",
   "meta-description","document-title","crawlable-anchors","robots-txt","viewport"
  ];
  const recommendations=priorityAudits
   .map(key=>({key,title:lighthouse.audits?.[key]?.title||"",score:lighthouse.audits?.[key]?.score,
    mode:lighthouse.audits?.[key]?.scoreDisplayMode}))
   .filter(a=>a.title&&a.mode!=="notApplicable"&&typeof a.score==="number"&&a.score<0.9)
   .sort((a,b)=>(a.score??1)-(b.score??1))
   .slice(0,4).map(a=>a.title);
  const findings=Object.entries(lighthouse.audits||{})
    .filter(([key,audit])=>audit?.title&&typeof audit.score==="number"&&audit.score<0.9&&audit.scoreDisplayMode!=="notApplicable"&&!key.includes("screenshot"))
    .sort(([,a],[,b])=>(a.score??1)-(b.score??1))
    .slice(0,25)
    .map(([id,audit])=>({id,title:audit.title||id,description:(audit.description||"").replace(/<[^>]*>/g,"").slice(0,380),score:audit.score??null}));
  return NextResponse.json({
   source:"Google PageSpeed Insights API",website:measuredUrl,reportUrl,findings,
   scores:{
    performance:roundScore(lighthouse.categories.performance?.score),
    seo:roundScore(lighthouse.categories.seo?.score),
    accessibility:roundScore(lighthouse.categories.accessibility?.score)
   },
   recommendations,
   analyzedAt:new Date().toISOString(),
   note:errorCopy("Puntuaciones técnicas, no ventas ni ranking garantizados.","Technical scores do not guarantee sales or search rankings.")
  },{headers:{"Cache-Control":"private, max-age=0"}});
 }catch{
  const fallback=await publishedVmvBasicAudit(measuredUrl,locale).catch(()=>null);
  if(fallback)return NextResponse.json(fallback,{headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({error:errorCopy("Google tardó demasiado o el enlace no es accesible públicamente. Intenta más tarde o utiliza tu dominio definitivo.","Google timed out or the URL is not publicly accessible. Try again later or use your final domain.")},{status:503});
 }
}
