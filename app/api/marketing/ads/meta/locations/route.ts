import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {activeMeta,adsMetaReady,metaGet,metaId,noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({error:"meta_unavailable"},{status:503,headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 const q=new URL(req.url).searchParams.get("q")?.trim()||"";
 if(q.length<3||q.length>80||!/[A-Za-z]/.test(q))
  return NextResponse.json({error:"city_name_required"},{status:400,headers:noCache});
 try{
  const active=await activeMeta(owner);
  if(!active||!active.connection.selected_ad_account_id)
   return NextResponse.json({error:"select_ad_account_first"},{status:409,headers:noCache});
  const result=await metaGet("search",active.token,{
   type:"adgeolocation",location_types:JSON.stringify(["city"]),q,limit:"100"
  });
  const places=(Array.isArray(result.data)?result.data:[]).filter((x:any)=>
   metaId(x.key)&&x.country_code==="US"&&x.type==="city")
   .slice(0,100).map((x:any)=>({key:String(x.key),name:String(x.name||""),
    region:String(x.region||""),countryCode:"US"}));
  return NextResponse.json({places},{headers:noCache});
 }catch{return NextResponse.json({error:"meta_location_search_unavailable"},{status:502,headers:noCache});}
}
