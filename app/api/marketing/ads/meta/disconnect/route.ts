import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 const db=billingAdmin();if(!db)return NextResponse.json({error:"database_unavailable"},{status:503,headers:noCache});
 const {data:conn,error:readError}=await db.from("vmv_marketing_ads_connections")
 .select("id").eq("owner_id",owner).eq("provider","meta").is("disconnected_at",null).maybeSingle();
 if(readError)return NextResponse.json({error:"database_unavailable"},{status:503,headers:noCache});
 if(!conn)return NextResponse.json({disconnected:true},{headers:noCache});
 const {error:deleteError}=await db.from("vmv_marketing_ads_credentials").delete().eq("connection_id",conn.id);
 if(deleteError)return NextResponse.json({error:"credential_removal_failed"},{status:503,headers:noCache});
 const {error:updateError}=await db.from("vmv_marketing_ads_connections").update({
  disconnected_at:new Date().toISOString(),selected_ad_account_id:null,selected_ad_account_name:null
 }).eq("owner_id",owner).eq("id",conn.id);
 if(updateError)return NextResponse.json({error:"connection_update_failed"},{status:503,headers:noCache});
 return NextResponse.json({disconnected:true},{headers:noCache});
}
