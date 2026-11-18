import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {adsMetaReady,adsOrigin,newState,stateHash,noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({error:"meta_connection_not_configured"},{status:503,headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 const origin=adsOrigin(),db=billingAdmin();
 if(!origin||!db)return NextResponse.json({error:"connection_unavailable"},{status:503,headers:noCache});
 const {count,error:countError}=await db.from("vmv_marketing_ads_oauth_states")
  .select("state_hash",{count:"exact",head:true}).eq("owner_id",owner)
  .gt("expires_at",new Date().toISOString());
 if(countError)return NextResponse.json({error:"oauth_limit_unavailable"},{status:503,headers:noCache});
 if((count||0)>=5)return NextResponse.json({error:"too_many_pending_authorizations"},{status:429,headers:noCache});
 const state=newState(),redirectUri=origin+"/api/marketing/ads/meta/callback";
 const {error}=await db.from("vmv_marketing_ads_oauth_states").insert({
  state_hash:stateHash(state),owner_id:owner,provider:"meta",redirect_uri:redirectUri,
  expires_at:new Date(Date.now()+600000).toISOString()
 });
 if(error)return NextResponse.json({error:"connection_unavailable"},{status:503,headers:noCache});
 const u=new URL("https://www.facebook.com/v27.0/dialog/oauth");
 u.searchParams.set("client_id",process.env.META_APP_ID||"");
 u.searchParams.set("redirect_uri",redirectUri);
 u.searchParams.set("state",state);
 u.searchParams.set("scope","ads_read,ads_management,business_management,pages_show_list,pages_read_engagement");
 u.searchParams.set("response_type","code");
 return NextResponse.json({url:u.toString()},{headers:noCache});
}
