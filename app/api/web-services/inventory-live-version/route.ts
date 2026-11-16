import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {publishedCatalogVersion} from "@/lib/vmv-ai-agents/public-catalog-version";
import {resolveInventoryForPublishedSite} from "@/lib/vmv-ai-agents/site-inventory-resolution";
import {resolveServicesForPublishedSite} from "@/lib/vmv-ai-agents/site-services-resolution";

export const dynamic="force-dynamic";
const validSlug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function json(body:Record<string,unknown>,status=200){
 return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}

/** Public revision only. No raw private catalog rows, owner IDs, product data,
 * service role credentials or unpublished site content leave this route. */
export async function GET(request:NextRequest){
 const slug=request.nextUrl.searchParams.get("site")||"";
 if(slug.length>64||!validSlug.test(slug))return json({error:"invalid_site"},400);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.SUPABASE_SECRET_KEY;
 if(!url||!publicKey||!secret)return json({error:"unavailable"},503);
 const anon=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:page,error:pageError}=await anon.from("smartjob_builder_public_pages")
  .select("site_id,owner_id,site_name").eq("site_slug",slug).limit(1).maybeSingle();
 if(pageError||!page)return json({error:"not_found"},404);
 const server=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const [businessId,servicesId]=await Promise.all([
  resolveInventoryForPublishedSite(server,page.site_id,page.owner_id,page.site_name||""),
  resolveServicesForPublishedSite(server,page.site_id,page.owner_id)
 ]);
 if(!businessId&&!servicesId)return json({linked:false,version:null});
 const [productResult,serviceResult]=await Promise.all([
  businessId?server.from("vmv_ai_catalog_items")
   .select("id,updated_at").eq("owner_id",page.owner_id)
   .eq("business_id",businessId).eq("active",true).eq("approved",true)
   .order("name",{ascending:true}).limit(40):Promise.resolve({data:[],error:null}),
  servicesId?server.from("vmv_ai_services")
   .select("id,updated_at").eq("owner_id",page.owner_id)
   .eq("business_id",servicesId).eq("active",true).eq("approved",true)
   .order("name",{ascending:true}).limit(40):Promise.resolve({data:[],error:null})
 ]);
 if(productResult.error||serviceResult.error)return json({error:"unavailable"},503);
 const revision=[
  ...(productResult.data||[]).map(item=>({id:"p:"+item.id,updated_at:item.updated_at})),
  ...(serviceResult.data||[]).map(item=>({id:"s:"+item.id,updated_at:item.updated_at}))
 ];
 return json({linked:true,version:publishedCatalogVersion(revision)});
}
