import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb} from "@/lib/vmv-video-generator";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const PACKAGES=[
 {id:"starter",credits:50,usdCents:500},
 {id:"creator",credits:120,usdCents:1200},
 {id:"studio",credits:300,usdCents:3000}
] as const;
export const creditPurchasesEnabled=()=>process.env.VERCEL_ENV==="preview"&&
 process.env.VMV_STUDIO_CREDIT_PURCHASES_ENABLED==="true"&&
 /^sk_test_/.test(process.env.STRIPE_SECRET_KEY||"")&&
 (process.env.VMV_STUDIO_STRIPE_WEBHOOK_SECRET||"").startsWith("whsec_");
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"authentication_required"},{status:401});
 try{
  const db=videoDb();
  const [w,l]=await Promise.all([
   db.from("vmv_studio_wallets").select("balance,reserved").eq("owner_id",owner).maybeSingle(),
   db.from("vmv_studio_credit_ledger").select("id,kind,balance_delta,reserved_delta,created_at")
     .eq("owner_id",owner).order("created_at",{ascending:false}).limit(30)
  ]);
  if(w.error||l.error)throw Error("unavailable");
  const balance=w.data?.balance||0,reserved=w.data?.reserved||0;
  return NextResponse.json({wallet:{balance,reserved,available:balance-reserved},
   packages:PACKAGES,purchasesEnabled:creditPurchasesEnabled(),transactions:l.data||[]},
   {headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"video_studio_wallet_unavailable"},{status:503});}
}
