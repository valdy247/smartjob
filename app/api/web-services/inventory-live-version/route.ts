import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {publishedCatalogVersion} from "@/lib/vmv-ai-agents/public-catalog-version";

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
  .select("site_id,owner_id").eq("site_slug",slug).limit(1).maybeSingle();
 if(pageError||!page)return json({error:"not_found"},404);
 const server=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:site,error:siteError}=await server.from("smartjob_builder_sites")
  .select("inventory_business_id").eq("id",page.site_id)
  .eq("owner_id",page.owner_id).maybeSingle();
 if(siteError)return json({error:"unavailable"},503);
 if(!site?.inventory_business_id)return json({linked:false,version:null});
 const {data:business,error:businessError}=await server.from("vmv_ai_businesses")
  .select("id").eq("id",site.inventory_business_id)
  .eq("owner_id",page.owner_id).maybeSingle();
 if(businessError||!business)return json({error:"unavailable"},503);
 const {data:items,error:itemsError}=await server.from("vmv_ai_catalog_items")
  .select("id,updated_at").eq("owner_id",page.owner_id)
  .eq("business_id",business.id).eq("active",true).eq("approved",true)
  .order("id",{ascending:true}).limit(1000);
 if(itemsError)return json({error:"unavailable"},503);
 return json({linked:true,version:publishedCatalogVersion(items||[])});
}
