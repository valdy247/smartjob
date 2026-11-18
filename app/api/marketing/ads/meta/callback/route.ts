import {NextRequest,NextResponse} from "next/server";
import {billingAdmin} from "@/lib/vmv-billing";
import {adsMetaReady,adsOrigin,encryptMetaToken,metaGet,stateHash} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const redirect=(origin:string,status:string)=>NextResponse.redirect(origin+
 "/vista-app/marketing/ads?meta="+encodeURIComponent(status),{status:303,headers:{"Cache-Control":"no-store"}});
async function exchange(code:string,redirectUri:string){
 const u=new URL("https://graph.facebook.com/v27.0/oauth/access_token");
 u.searchParams.set("client_id",process.env.META_APP_ID||"");
 u.searchParams.set("client_secret",process.env.META_APP_SECRET||"");
 u.searchParams.set("redirect_uri",redirectUri);u.searchParams.set("code",code);
 const response=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||typeof data?.access_token!=="string")throw Error("exchange_failed");
 const long=new URL("https://graph.facebook.com/v27.0/oauth/access_token");
 long.searchParams.set("grant_type","fb_exchange_token");
 long.searchParams.set("client_id",process.env.META_APP_ID||"");
 long.searchParams.set("client_secret",process.env.META_APP_SECRET||"");
 long.searchParams.set("fb_exchange_token",data.access_token);
 const lr=await fetch(long,{cache:"no-store",signal:AbortSignal.timeout(15000)});
 const result=await lr.json().catch(()=>null);
 // Do not persist a short-lived access token if long-lived exchange fails.
 if(!lr.ok||typeof result?.access_token!=="string"||!Number.isFinite(Number(result.expires_in))||
   Number(result.expires_in)<3600)throw Error("long_lived_exchange_failed");
 return {token:result.access_token,expiresAt:new Date(Date.now()+Number(result.expires_in)*1000).toISOString()};
}
export async function GET(req:NextRequest){
 const origin=adsOrigin();
 if(!origin||!adsMetaReady())return new NextResponse("Meta Ads connection not configured",{status:503});
 const url=new URL(req.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(state)||code.length<10||code.length>4096)
  return redirect(origin,"canceled");
 const db=billingAdmin();if(!db)return redirect(origin,"unavailable");
 // Consume the state atomically, once, before exchanging any OAuth code.
 const {data:pending,error}=await db.from("vmv_marketing_ads_oauth_states")
  .delete().eq("state_hash",stateHash(state)).eq("provider","meta")
  .gt("expires_at",new Date().toISOString()).select("owner_id,redirect_uri").maybeSingle();
 if(error||!pending||pending.redirect_uri!==origin+"/api/marketing/ads/meta/callback")
  return redirect(origin,"expired");
 try{
  const {token,expiresAt}=await exchange(code,pending.redirect_uri);
  const profile=await metaGet("me",token,{fields:"id,name"});
  if(typeof profile.id!=="string"||!/^\d{5,30}$/.test(profile.id))throw Error("invalid_meta_user");
  const {data:connection,error:writeError}=await db.from("vmv_marketing_ads_connections")
   .upsert({owner_id:pending.owner_id,provider:"meta",provider_user_id:profile.id,
    provider_name:String(profile.name||"").slice(0,120),connected_at:new Date().toISOString(),
    token_expires_at:expiresAt,disconnected_at:null,
    selected_ad_account_id:null,selected_ad_account_name:null},{onConflict:"owner_id,provider"})
   .select("id").single();
  if(writeError||!connection)throw Error("connection_save_failed");
  const {error:tokenError}=await db.from("vmv_marketing_ads_credentials")
   .upsert({connection_id:connection.id,encrypted_access_token:encryptMetaToken(token),
     updated_at:new Date().toISOString()},{onConflict:"connection_id"});
  if(tokenError){
   await db.from("vmv_marketing_ads_connections").update({disconnected_at:new Date().toISOString()})
    .eq("id",connection.id).eq("owner_id",pending.owner_id);
   throw Error("credential_save_failed");
  }
  return redirect(origin,"connected");
 }catch{return redirect(origin,"failed");}
}
