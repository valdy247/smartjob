const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"lib/marketing-request-progress.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports","require",compiled)(mod,mod.exports,require);
const {marketingRequestProgress:progress}=mod.exports;

test("each real workflow stage advances the visible bar without claiming exact completion",()=>{
 const stages=["received","quoted","approved","in_progress","verified"];
 const values=stages.map(stage=>progress(stage));
 assert.deepEqual(values,[16,36,60,82,100]);
 assert.ok(values.every((v,i)=>i===0||v>values[i-1]));
});
test("quote acceptance advances an otherwise quoted case to the approved milestone",()=>{
 assert.equal(progress("quoted",true),60);
 assert.equal(progress("received",true),60);
});
test("waiting for a customer does not erase the last actual milestone",()=>{
 assert.equal(progress("needs_customer"),16);
 assert.equal(progress("needs_customer",false,[{status:"received"},{status:"in_progress"}]),82);
 assert.equal(progress("needs_customer",false,[{status:"received"},{status:"quoted"}]),36);
});
test("cancelled cases are not shown as ongoing and only verified cases show 100%",()=>{
 assert.equal(progress("cancelled",true,[{status:"approved"}]),0);
 assert.equal(progress("verified"),100);
 assert.ok(progress("in_progress")<100);
});
test("history excludes invalid terminal or waiting milestones from accidental progress inflation",()=>{
 assert.equal(progress("received",false,[{status:"cancelled"},{status:"needs_customer"},{status:"verified"}]),16);
});
test("request actions use authenticated support messages rather than deleting submitted cases",()=>{
 const view=fs.readFileSync(path.join(root,"app/vista-app/marketing/MarketingActionCenter.tsx"),"utf8");
 assert.ok(view.includes('action:"message",source:"marketing"'));
 assert.ok(view.includes('message:titles[caseAction.kind]'));
 assert.ok(view.includes('caseAction.kind==="delete"&&!window.confirm'));
 assert.ok(view.includes('req.owner_id!==user.id'));
 assert.ok(!view.includes('from("vmv_marketing_requests").delete('));
 assert.ok(view.includes('marketingRequestProgress(req.status,approved,req.activity_history)'));
});
test("timeline remains accessible and there is a visible status-dependent progress bar",()=>{
 const view=fs.readFileSync(path.join(root,"app/vista-app/marketing/MarketingActionCenter.tsx"),"utf8");
 assert.ok(view.includes('role="progressbar"'));
 assert.ok(view.includes('aria-valuenow={progress}'));
 assert.ok(view.includes('aria-expanded={expanded}'));
 assert.ok(view.includes('requestMenuPanel'));
 assert.ok(view.includes('progress+"%"'));
});
