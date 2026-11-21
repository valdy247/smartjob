const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=path=>fs.readFileSync(require("node:path").join(__dirname,"..",path),"utf8");
const helper=read("lib/vmv-finances/connect.ts");
const action=read("app/api/vmv/finanzas/connect/route.ts");
const status=read("app/api/vmv/finanzas/status/route.ts");
const page=read("app/vista-app/finanzas/page.tsx");

test("Connect only runs in isolated Preview/test merchant mode",()=>{
 assert.match(helper,/merchantTestEnabled\(\)/);
 assert.match(action,/if\(!testAvailable\(\)\)/);
 assert.match(helper,/VMV_AI_COMMERCE_STRIPE_SECRET_KEY/);
 assert.doesNotMatch(helper,/SMARTJOB_STRIPE_SECRET_KEY/);
});
test("Connected account belongs to the authenticated business owner",()=>{
 assert.match(helper,/client\.auth\.getUser\(token\)/);
 assert.match(helper,/\.eq\("id",businessId\)\.eq\("owner_id",user\.id\)/);
 assert.match(helper,/vmv_ai_workspace_for_central_business/);
 assert.match(helper,/meta\.vmv_owner_id!==owner\|\|meta\.vmv_business_id!==businessId/);
 assert.match(action,/vmv-finance-test-/);
});
test("Stripe-hosted KYC is explicit and uses merchant account",()=>{
 assert.match(action,/type:"express"/);
 assert.match(action,/type:"account_onboarding"/);
 assert.match(action,/stripePlatform\("account_links","POST"/);
 assert.match(action,/"metadata\[vmv_business_id\]":businessId/);
 assert.match(action,/"capabilities\[card_payments\]\[requested\]":"true"/);
 assert.match(action,/"capabilities\[transfers\]\[requested\]":"true"/);
 assert.match(action,/connect\\\.stripe\\\.com/);
});
test("Readiness is server-verified and does not mean live payments",()=>{
 assert.match(helper,/a\.charges_enabled===true&&a\.details_submitted===true/);
 assert.match(helper,/a\.payouts_enabled===true/);
 assert.match(helper,/verified_by_server:state\.ready,can_accept_payments:state\.ready/);
 assert.match(status,/checkedAccount\(id,ctx\.owner,ctx\.business\.id\)/);
 assert.match(status,/Cache-Control":"no-store"/);
 assert.match(page,/!status\.configured/);
});

test("Signed Stripe account updates require Stripe re-verification before readiness changes",()=>{
 const hook=read("app/api/vmv/ai-agents/commerce/stripe-webhook/route.ts");
 assert.match(hook,/verifiedStripeWebhook\(raw/);
 assert.match(hook,/type==="account.updated"/);
 assert.match(hook,/checkedAccount\(id,merchant\.owner_id,workspace\.central_business_id\)/);
 assert.match(hook,/verified_by_server:state\.ready,can_accept_payments:state\.ready/);
});
