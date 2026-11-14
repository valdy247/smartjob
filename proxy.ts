import {NextRequest,NextResponse} from "next/server";

/**
 * VMV Sites custom-domain routing.
 * Fail closed: all default app hosts and unverified domains continue unchanged.
 * Only the service-role-created public mapping can activate a customer domain.
 * This file must never affect VMV's authenticated routes on their normal host.
 */
export async function proxy(req:NextRequest){
 if(process.env.VMV_WEB_DOMAIN_CONNECTIONS_ENABLED!=="true")return NextResponse.next();
 if(req.method!=="GET"&&req.method!=="HEAD")return NextResponse.next();
 const raw=req.headers.get("host")||"";
 const host=raw.split(":")[0].toLowerCase();
 if(!host||host==="localhost"||host.endsWith(".vercel.app")||
  host.endsWith(".localhost")||host.length>253)return NextResponse.next();
 const pathname=req.nextUrl.pathname;
 if(pathname.startsWith("/api/")||pathname.startsWith("/_next/")||
  pathname.startsWith("/.well-known/")||pathname==="/favicon.ico")return NextResponse.next();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return NextResponse.next();
 try{
  const params=new URLSearchParams({select:"site_slug",hostname:"eq."+host,limit:"1"});
  const result=await fetch(url+"/rest/v1/smartjob_builder_public_domains?"+params,{
   headers:{"apikey":key,"Authorization":"Bearer "+key},
   next:{revalidate:30}
  });
  if(!result.ok)return NextResponse.next();
  const entries=await result.json() as Array<{site_slug?:string}>;
  const slug=entries?.[0]?.site_slug;
  if(!slug||!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))return NextResponse.next();
  const headers=new Headers(req.headers);
  headers.set("x-vmv-custom-domain","1");
  const path=pathname==="/"?"/":pathname;
  const target=new URL("/web/"+slug+path+req.nextUrl.search,req.url);
  return NextResponse.rewrite(target,{request:{headers}});
 }catch{return NextResponse.next();}
}
export const config={matcher:["/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml).*)"]};
