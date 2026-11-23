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
test("Services card launches Smart Quote; Instagram stays disabled and video opens unified Studio",()=>{
 const card=service.split('id:"smart-quote"')[1];
 assert.ok(card&&card.slice(0,450).includes('state:translate("catalog.beta")'));
 assert.ok(card&&card.slice(0,450).includes('window.location.assign("/vista-app/ai-agents?service=quote")'));
 assert.ok(service.includes('disabled={item.id==="instagram-connect"}'));
 assert.ok(service.includes('action:()=>window.location.assign("/vista-app/video-generator")'));
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

test("Catalog creation respects restricted column permissions",()=>{
 assert.ok(page.includes('await db.from("vmv_smart_quote_catalog").insert({owner_id:owner,business_id:businessId,...payload})'));
 const start=page.indexOf("const payload={name:product.name.trim()");
 const end=page.indexOf("const result=productId?",start);
 assert.ok(start>=0&&end>start);
 assert.ok(!page.slice(start,end).includes("updated_at:"));
 assert.ok(sql.includes("grant insert (owner_id,business_id,name,description,unit_name,unit_price_cents,active)"));
});
test("Approved quotes offer a printable document without inventing payment events",()=>{
 assert.ok(page.includes("setPrintableQuote(q)"));
 assert.ok(page.includes("window.print()"));
 assert.ok(page.includes("printableQuote.status")||page.includes("printableQuote.customer_name"));
 assert.ok(page.includes('styles.printSheet'));
});

test("Smart Quote starts with a minimal, tappable business choice and no Next button",()=>{
 const wizard=readFileSync("app/vista-app/ai-agents/AutomaticQuoteWizard.tsx","utf8");
 const parsed=ts.createSourceFile("AutomaticQuoteWizard.tsx",wizard,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[]);
 assert.match(wizard,/business:"Primero, tu negocio"/);
 assert.match(wizard,/Seguir con <strong>\{business.name\}<\/strong>/);
 assert.match(wizard,/onClick=\{\(\)=>\{setBusinessConfirmed\(true\);setError\(""\);/);
 assert.match(wizard,/setStep\("services"\)/);
 assert.match(wizard,/step!=="business"\?<div className=\{styles.robot/);
 assert.match(wizard,/owner&&step!=="business"\?<div className=\{styles.footer\}/);
 assert.match(wizard,/Cambiar negocio/);
 assert.match(wizard,/aria-expanded=\{showBusinesses\}/);
 assert.match(wizard,/onChooseBusiness\(b.id\)/);
 const agentPage=readFileSync("app/vista-app/ai-agents/page.tsx","utf8");
 assert.match(agentPage,/quoteAdvanceAfterSwitch\?"services":"business"/);
 assert.match(agentPage,/setQuoteAdvanceAfterSwitch\(true\)/);
 assert.ok(agentPage.includes("setChosenBusiness(id)"));
});


test("Smart Quote syncs original AI Agents product/service catalogs without duplicate price authority",()=>{
 const wizard=readFileSync("app/vista-app/ai-agents/AutomaticQuoteWizard.tsx","utf8");
 const sync=readFileSync("supabase/sql/vmv_smart_quote_agent_catalog_sync_20261119.sql","utf8");
 const parsed=ts.createSourceFile("AutomaticQuoteWizard.tsx",wizard,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[]);
 assert.match(wizard,/Conectar inventario/);
 assert.match(wizard,/Conectar servicios/);
 assert.match(wizard,/vmv_ai_catalog_items/);
 assert.match(wizard,/vmv_ai_booking_services/);
 assert.match(wizard,/source_kind,source_id/);
 assert.match(wizard,/central_business_id/);
 assert.match(wizard,/await reloadCatalog\(owner\)/);
 assert.match(wizard,/p_items:chosen\.map/);
 assert.match(sync,/ON CONFLICT \(owner_id,business_id,source_kind,source_id\)/);
 assert.match(sync,/AFTER INSERT OR UPDATE OR DELETE ON public\.vmv_ai_catalog_items/);
 assert.match(sync,/AFTER INSERT OR UPDATE OR DELETE ON public\.vmv_ai_booking_services/);
 assert.match(sync,/approved AND NEW\.active/);
 assert.match(sync,/Edit linked products and services in AI Agents/);
 assert.match(sync,/JOIN public\.vmv_marketing_businesses b ON b\.id=w\.central_business_id AND b\.owner_id=/);
});
