import {NextRequest} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";
import {merchantTestEnabled,validConnectedAccount} from "@/lib/vmv-ai-agents/stripe-commerce";

export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type FinanceContext=NonNullable<Awaited<ReturnType<typeof financeContext>>>;
export type StripeMerchant={
 id:string;charges_enabled:boolean;payouts_enabled:boolean;details_submitted:boolean;
 country?:string;livemode?:boolean;metadata?:Record<string,string>;
 requirements?:{currently_due?:string[];past_due?:string[];disabled_reason?:string|null};
 capabilities?:Record<string,string>;
};
export const testAvailable=()=>merchantTestEnabled();
export const safeOrigin=()=>{
 const origin=process.env.VMV_AI_TEST_BASE_URL||"";
 return /^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin)?origin:null;
};
export async function financeContext(req:NextRequest,businessId:string,provision=false){
 if(!uuid.test(businessId))return null;
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key||!token)return null;
 const client=createClient(url,key,{
  global:{headers:{Authorization:"Bearer "+token}},
  auth:{autoRefreshToken:false,persistSession:false}
 });
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user||user.is_anonymous)return null;
 const admin=billingAdmin();if(!admin)return null;
 const {data:business,error:businessError}=await admin.from("vmv_marketing_businesses")
  .select("id,owner_id,name,country").eq("id",businessId).eq("owner_id",user.id).maybeSingle();
 if(businessError||!business)return null;
 let {data:workspace,error:workspaceError}=await admin.from("vmv_ai_businesses")
  .select("id,owner_id,central_business_id").eq("central_business_id",businessId)
  .eq("owner_id",user.id).maybeSingle();
 if(workspaceError)return null;
 if(provision&&!workspace){
  // Authorized invoker RPC, identical to agent provisioning. No new business identity.
  const made=await client.rpc("vmv_ai_workspace_for_central_business",{
   p_central_business_id:businessId
  });
  if(made.error||typeof made.data!=="string"||!uuid.test(made.data))return null;
  const fetched=await admin.from("vmv_ai_businesses").select("id,owner_id,central_business_id")
   .eq("id",made.data).eq("owner_id",user.id).eq("central_business_id",businessId).maybeSingle();
  if(fetched.error||!fetched.data)return null;
  workspace=fetched.data;
 }
 return {owner:user.id,business,workspace,admin};
}
/** Platform-level API key, independent of VMV subscription billing Stripe. */
export async function stripePlatform(path:string,method:"GET"|"POST"="GET",
 fields?:URLSearchParams,idempotencyKey?:string):Promise<Record<string,unknown>>{
 if(!testAvailable())throw Error("Stripe Connect test is not configured");
 const secret=process.env.VMV_AI_COMMERCE_STRIPE_SECRET_KEY||"";
 const headers:Record<string,string>={Authorization:"Bearer "+secret};
 if(method==="POST")headers["Content-Type"]="application/x-www-form-urlencoded";
 if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
 const response=await fetch("https://api.stripe.com/v1/"+path,{
  method,headers,body:method==="POST"?fields?.toString():undefined,
  cache:"no-store",signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error("Stripe Connect did not complete this request");
 return response.json() as Promise<Record<string,unknown>>;
}
export async function checkedAccount(account:string,owner:string,businessId:string){
 if(!validConnectedAccount(account))throw Error("Invalid connected account");
 const result=await stripePlatform("accounts/"+encodeURIComponent(account));
 if(result.id!==account||result.livemode!==false)throw Error("Unexpected Stripe account");
 const meta=(result.metadata||{}) as Record<string,string>;
 if(meta.vmv_owner_id!==owner||meta.vmv_business_id!==businessId)
  throw Error("Stripe account business ownership mismatch");
 return result as unknown as StripeMerchant;
}
export const stripeStatus=(a:StripeMerchant)=>{
 const canCharge=a.charges_enabled===true&&a.details_submitted===true&&
  a.capabilities?.card_payments==="active";
 const canPayout=a.payouts_enabled===true&&a.capabilities?.transfers==="active";
 return {
  connected:true,ready:canCharge&&canPayout,chargesEnabled:canCharge,payoutsEnabled:canPayout,
  detailsSubmitted:a.details_submitted===true,
  pendingRequirements:(a.requirements?.currently_due||[]).length+
   (a.requirements?.past_due||[]).length,
  needsAttention:Boolean(a.requirements?.disabled_reason),
  mode:"test" as const
 };
};
export async function merchantRow(ctx:FinanceContext){
 if(!ctx.workspace)return null;
 const {data,error}=await ctx.admin.from("vmv_ai_merchant_payments")
  .select("business_id,owner_id,provider,provider_account_id,livemode")
  .eq("business_id",ctx.workspace.id).eq("owner_id",ctx.owner).maybeSingle();
 if(error)throw Error("Could not load merchant profile");
 if(data&&(data.provider!=="stripe_connect"||data.livemode!==false))
  throw Error("Existing merchant connection requires manual review");
 return data;
}
export async function synchronize(ctx:FinanceContext,account:StripeMerchant){
 if(!ctx.workspace)throw Error("No workspace");
 const state=stripeStatus(account);
 const {error}=await ctx.admin.from("vmv_ai_merchant_payments")
  .update({verified_by_server:state.ready,can_accept_payments:state.ready,updated_at:new Date().toISOString()})
  .eq("business_id",ctx.workspace.id).eq("owner_id",ctx.owner)
  .eq("provider","stripe_connect").eq("provider_account_id",account.id).eq("livemode",false);
 if(error)throw Error("Could not save Stripe verification state");
 return state;
}
