// Fail-closed guard for anything that spends on Twilio or a paid AI provider.
// Preview Stripe checkouts use TEST currency and are never proof of real payment.
import {balance,eligible,getBillingAccount,type BillingAccount} from "@/lib/vmv-billing";

export type PaidCapability="direct_call"|"translated_call"|"ai";

export function realBillingConfigured():boolean {
 return process.env.SMARTJOB_STRIPE_MODE==="live" &&
  /^sk_live_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY||"") &&
  process.env.SMARTJOB_PAID_SERVICES_ENABLED==="true";
}
export function confirmedSubscription(account:BillingAccount|null):boolean {
 return Boolean(account&&eligible(account)&&
  /^cus_[A-Za-z0-9]+$/.test(account.stripe_customer_id||"")&&
  /^sub_[A-Za-z0-9]+$/.test(account.stripe_subscription_id||"")&&
  ["starter","pro","premium"].includes(account.plan_code));
}
export function allowSpendWithAccount(account:BillingAccount|null,capability:PaidCapability):boolean {
 if(!realBillingConfigured()||!confirmedSubscription(account))return false;
 return capability==="direct_call"||balance(account)>0;
}
export async function paidServiceAllowed(uid:string,capability:PaidCapability):Promise<boolean> {
 if(!realBillingConfigured()||!/^[a-f\d-]{36}$/i.test(uid))return false;
 return allowSpendWithAccount(await getBillingAccount(uid),capability);
}
