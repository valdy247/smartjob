const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const ts=require("typescript");
const page=readFileSync("app/vista-app/smart-quote/page.tsx","utf8");
const service=readFileSync("app/vista-app/page.tsx","utf8");
const sql=readFileSync("supabase/sql/vmv_smart_quote_owner_pilot_20261118.sql","utf8");
test("Smart Quote page parses cleanly as TypeScript/JSX",()=>{
 const file=ts.createSourceFile("smart-quote/page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(file.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n")),[]);
});
test("Services card opens Smart Quote, while unfinished modules stay disabled",()=>{
 assert.match(service,/id:"smart-quote"[^\\n]*catalog\\.beta[^\\n]*\/vista-app\/smart-quote/);
 assert.match(service,/disabled=\\{item\\.id==="video-generator"\\|\\|item\\.id==="instagram-connect"\\}/);
});
test("SQL isolates both catalog and quotes by business owner under RLS",()=>{
 for(const name of ["vmv_smart_quote_catalog","vmv_smart_quotes","vmv_smart_quote_events"]){
  assert.ok(sql.includes("alter table public."+name+" enable row level security"));
 }
 assert.match(sql,/auth\\.uid\\(\\)/);
 assert.match(sql,/b\\.id=business_id and b\\.owner_id=\\(select auth\\.uid\\(\\)\\)/);
 assert.match(sql,/revoke all on public\\.vmv_smart_quote_catalog,public\\.vmv_smart_quotes,public\\.vmv_smart_quote_events from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete) on public\\.vmv_smart_quotes to authenticated/i);
});
test("Quote totals are calculated from server-owned catalog, not client amounts",()=>{
 assert.match(sql,/from public\\.vmv_smart_quote_catalog/);
 assert.match(sql,/product\\.unit_price_cents::bigint\\*qty/);
 assert.match(sql,/subtotal-p_discount_cents\\+tax_total\\+p_delivery_cents/);
 assert.match(sql,/if p_discount_cents>subtotal/);
 assert.doesNotMatch(sql,/p_total_cents|p_unit_price_cents/);
});
test("Draft approval and manual sending are explicit, with no fake payment state",()=>{
 assert.match(sql,/p_action='approve' and q\\.status='draft'/);
 assert.match(sql,/p_action='mark_sent' and q\\.status='approved'/);
 assert.match(sql,/p_action='cancel' and q\\.status in/);
 assert.match(page,/status!=="approved"&&q\\.status!=="sent"/);
 assert.match(page,/navigator\\.clipboard\\.writeText/);
 assert.doesNotMatch(sql,/status in \\([^\\n]*'paid'/);
 assert.doesNotMatch(page,/stripe\\.com\\/v1|squareup\\.com\\/v2/);
});
