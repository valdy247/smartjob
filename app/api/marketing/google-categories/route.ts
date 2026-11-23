import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers});
export async function GET(request:NextRequest){
 const {searchParams}=new URL(request.url);
 const q=(searchParams.get("q")||"").trim();
 const country=(searchParams.get("country")||"US").toUpperCase();
 const language=searchParams.get("lang")==="en"?"en":"es";
 if(q.length<2||q.length>80||!/^[A-Z]{2}$/.test(country))return reply({error:"invalid_search"},400);
 // This endpoint deliberately never returns hardcoded or AI-guessed categories.
 // A Google Business Profile authorized OAuth token is required. Never expose it to browsers.
 const token=process.env.GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN;
 if(!token)return reply({error:"google_categories_not_connected",categories:[]},503);
 const url=new URL("https://mybusinessbusinessinformation.googleapis.com/v1/categories");
 url.searchParams.set("regionCode",country);
 url.searchParams.set("languageCode",language);
 url.searchParams.set("view","BASIC");
 url.searchParams.set("pageSize","50");
 url.searchParams.set("filter","displayName="+q);
 try{
  const res=await fetch(url,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(9500),cache:"no-store"});
  if(!res.ok)return reply({error:res.status===401||res.status===403?"google_authorization_required":"google_categories_unavailable",categories:[]},503);
  const json=await res.json() as {categories?:{name?:string;displayName?:string}[]};
  const categories=(json.categories||[]).filter(x=>typeof x.name==="string"&&typeof x.displayName==="string")
   .slice(0,30).map(x=>({id:x.name,label:x.displayName}));
  return reply({source:"Google Business Profile API",categories});
 }catch{return reply({error:"google_categories_unavailable",categories:[]},503);}
}
