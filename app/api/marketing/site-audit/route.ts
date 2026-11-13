import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";

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
 if(!website)return NextResponse.json({error:"Introduce una URL pública válida (https://...)."}, {status:400});
 const endpoint=new URL(fixedOrigin);
 const reportUrl="https://pagespeed.web.dev/?url="+encodeURIComponent(website);
 endpoint.searchParams.set("url",website);
 endpoint.searchParams.set("strategy","MOBILE");
 for(const category of ["PERFORMANCE","SEO","ACCESSIBILITY"])endpoint.searchParams.append("category",category);
 // Optional key is server-side only; without it the public free quota is used.
 if(process.env.GOOGLE_PAGESPEED_API_KEY)endpoint.searchParams.set("key",process.env.GOOGLE_PAGESPEED_API_KEY);
 try{
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(30000),next:{revalidate:3600}});
  if(!response.ok){
   const message=response.status===429?"La API gratuita alcanzó su límite. Intenta de nuevo más tarde.":"Google no pudo analizar este sitio por ahora.";
   return NextResponse.json({error:message,reportUrl}, {status:response.status===429?429:502});
  }
  const parsed=await response.json() as PsiResult;
  const lighthouse=parsed.lighthouseResult;
  if(!lighthouse?.categories)return NextResponse.json({error:"No se recibieron resultados de auditoría para este sitio."},{status:502});
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
   note:"Puntuaciones técnicas, no ventas ni ranking garantizados."
  },{headers:{"Cache-Control":"private, max-age=0"}});
 }catch{
  return NextResponse.json({error:"La auditoría tardó demasiado o la API no respondió. Prueba de nuevo más tarde."},{status:503});
 }
}
