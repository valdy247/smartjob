const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const ts=require("typescript");
const page=readFileSync("app/vista-app/smart-quote/page.tsx","utf8");
const service=readFileSync("app/vista-app/page.tsx","utf8");
const sql=readFileSync("supabase/sql/vmv_smart_quote_owner_pilot_20261118.sql","utf8");
test("Smart Quote workspace parses as TypeScript/JSX",()=>{
 const file=ts.createSourceFile("smart-quote/page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(file.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[]);
});
test("Services card launches Smart Quote; future services remain disabled",()=>{
 const card=service.split('id:"smart-quote"')[1];
 assert.ok(card&&card.slice(0,450).includes('state:translate("catalog.beta")'));
 assert.ok(card&&card.slice(0,450).includes('window.location.assign("/vista-app/smart-quote")'));
 assert.ok(service.includes('disabled={item.id==="video-generator"||item.id==="instagram-connect"}'));
});
test("Catalog, quotes and audit are owner-only with RLS",()=>{
 for(const name of ["vmv_smart_quote_catalog","vmv_smart_quotes","vmv_smart_quote_events"])
  assert.ok(sql.includes("alter table public."+name+" enable row level security"));
 assert.ok(sql.includes("auth.uid()"));
 assert.ok(sql.includes("b.owner_id=(select auth.uid())"));
 assert.ok(sql.includes("revoke all on public.vmv_smart_quote_catalog,public.vmv_smart_quotes,public.vmv_smart_quote_events from public,anon,authenticated"));
 assert.ok(!sql.includes("grant update on public.vmv_smart_quotes to authenticated"));
 assert.ok(!sql.includes("grant insert on public.vmv_smart_quotes to authenticated"));
});
test("Server derives totals from approved catalog prices",()=>{
 assert.ok(sql.includes("from public.vmv_smart_quote_catalog"));
 assert.ok(sql.includes("product.unit_price_cents::bigint*qty"));
 assert.ok(sql.includes("subtotal-p_discount_cents+tax_total+p_delivery_cents"));
 assert.ok(sql.includes("if p_discount_cents>subtotal"));
 assert.ok(!sql.includes("p_total_cents"));
});
test("Owner approval and sending are separate from actual payments",()=>{
 assert.ok(sql.includes("p_action='approve' and q.status='draft'"));
 assert.ok(sql.includes("p_action='mark_sent' and q.status='approved'"));
 assert.ok(sql.includes("p_action='cancel' and q.status in"));
 assert.ok(page.includes('navigator.clipboard.writeText(text)'));
 assert.ok(!sql.includes("'paid'"));
 assert.ok(!page.includes("stripe.com/v1"));
});
