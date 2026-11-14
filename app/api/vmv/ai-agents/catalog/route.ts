import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {ownerCatalogSnapshot} from "@/lib/vmv-ai-agents/catalog-snapshot";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{
 status,headers:{"Cache-Control":"private, no-store"}
});
/** Authenticated owner-only catalog read for VMV Web Services editors.
 * NOT a public storefront endpoint, and NOT a checkout price lock. */
export async function GET(req:NextRequest){
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!key)return reply({error:"Inicia sesión en VMV Business."},401);
 const businessId=req.nextUrl.searchParams.get("businessId")||"";
 if(!uuid.test(businessId))return reply({error:"Identificador del negocio inválido."},400);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:"Bearer "+token}}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user||data.user.is_anonymous)return reply({error:"Sesión no válida."},401);
 try{
  const products=await ownerCatalogSnapshot(db,data.user.id,businessId);
  return reply({businessId,source:"vmv_ai_catalog_items",mode:"verified_owner_preview",
   products,count:products.length,
   note:"Catálogo aprobado para mostrar al propietario. El precio y las existencias se vuelven a validar al crear pedidos."});
 }catch{
  // Do not leak cross-tenant existence or product details.
  return reply({error:"No está disponible el catálogo autorizado para esta cuenta."},403);
 }
}
