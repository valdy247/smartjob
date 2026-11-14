import {NextRequest,NextResponse} from "next/server";

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
 const endpoint=new URL(fixedOrigin);
 const reportUrl="https://pagespeed.web.dev/?url="+encodeURIComponent(website);
 endpoint.searchParams.set("url",website);
 endpoint.searchParams.set("strategy","MOBILE");
 endpoint.searchParams.set("locale",locale);
 for(const category of ["PERFORMANCE","SEO","ACCESSIBILITY"])endpoint.searchParams.append("category",category);
 // Optional key is server-side only; without it the public free quota is used.
 if(process.env.GOOGLE_PAGESPEED_API_KEY)endpoint.searchParams.set("key",process.env.GOOGLE_PAGESPEED_API_KEY);
 try{
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(95000),next:{revalidate:86400}});
  if(!response.ok){
   const message=response.status===429?errorCopy("La API gratuita alcanzó su límite. Intenta de nuevo más tarde.","The free API quota has been reached. Please try again later."):errorCopy("Google no pudo analizar este sitio por ahora.","Google could not analyze this website right now.");
   return NextResponse.json({error:message,reportUrl}, {status:response.status===429?429:502});
  }
  const parsed=await response.json() as PsiResult;
  const lighthouse=parsed.lighthouseResult;
  if(!lighthouse?.categories)return NextResponse.json({error:errorCopy("No se recibieron resultados de auditoría para este sitio.","No audit results were received for this website.")},{status:502});
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
   source:"Google PageSpeed Insights API",website,reportUrl,findings,
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
  return NextResponse.json({error:errorCopy("El análisis de Google tardó más de lo esperado. No significa que tu web esté dañada; puedes volver a intentarlo o solicitar revisión técnica.","Google took longer than expected. This does not mean your website is broken; retry or request a technical review.")},{status:503});
 }
}
