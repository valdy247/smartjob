const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
for(const file of ["lib/business-diagnostic.ts","app/vista-app/BusinessDiagnostic.tsx","apps/ios/BusinessDiagnostic.tsx","apps/ios/App.tsx"]){
 test(file+" parses as TypeScript/TSX",()=>{
  const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),"utf8"),
   ts.ScriptTarget.Latest,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(source.parseDiagnostics.length,0,source.parseDiagnostics.map(item=>item.messageText).join("; "));
 });
}
const source=fs.readFileSync(path.join(root,"lib/business-diagnostic.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleHolder={exports:{}};
vm.runInNewContext(compiled,{module:moduleHolder,exports:moduleHolder.exports});
const {getDiagnosticQuestions,diagnosticComplete,normalizeDiagnosticAnswers,getDiagnosticRecommendations,
 makeDiagnosticRecord,readDiagnosticRecord,DIAGNOSTIC_METADATA_KEY}=moduleHolder.exports;

const base={
 phone:"yes",missed:"no",web:"yes",webGood:"yes",google:"yes",googleGood:"yes",
 agents:"no",marketing:"yes",goal:"customers"
};
test("a business with working existing services gets no duplicate recommendations",()=>{
 assert.equal(diagnosticComplete(base),true);
 assert.equal(getDiagnosticRecommendations(base).length,0);
});
test("phone and website follow-up questions are conditional",()=>{
 assert.equal(getDiagnosticQuestions(base).some(q=>q.id==="missed"),true);
 assert.equal(getDiagnosticQuestions(base).some(q=>q.id==="webGood"),true);
 const changed={...base,phone:"no",web:"no",webGoal:"orders"};
 const ids=getDiagnosticQuestions(changed).map(q=>q.id);
 assert.equal(ids.includes("missed"),false);
 assert.equal(ids.includes("webGood"),false);
 assert.equal(ids.includes("webGoal"),true);
 assert.equal(diagnosticComplete(changed),true);
 assert.equal(normalizeDiagnosticAnswers(changed).missed,undefined);
});
test("recommendations are capped at three and reflect requested service types",()=>{
 const input={phone:"no",web:"no",webGoal:"orders",google:"no",agents:"yes",marketing:"no",goal:"presence"};
 assert.equal(diagnosticComplete(input),true);
 const rec=getDiagnosticRecommendations(input);
 assert.ok(rec.length>0&&rec.length<=3);
 assert.ok(rec.some(r=>r.id==="web-services"));
 assert.ok(rec.some(r=>r.id==="google-business"));
});
test("an existing phone with missed calls suggests service, not a second line",()=>{
 const rec=getDiagnosticRecommendations({...base,missed:"yes"});
 assert.equal(rec[0].id,"smart-call");
 assert.ok(rec[0].reason.es.includes("sin comprar otra línea"));
});
test("opting out produces no commercial recommendations",()=>{
 assert.equal(getDiagnosticRecommendations({...base,goal:"none"}).length,0);
});
test("saved answers only load for the matching business id",()=>{
 const saved=makeDiagnosticRecord("business-1",base);
 assert.ok(readDiagnosticRecord({[DIAGNOSTIC_METADATA_KEY]:saved},"business-1"));
 assert.equal(readDiagnosticRecord({[DIAGNOSTIC_METADATA_KEY]:saved},"business-2"),null);
 assert.equal(readDiagnosticRecord({[DIAGNOSTIC_METADATA_KEY]:{...saved,answers:{...base,web:"broken"}}},"business-1"),null);
});

test("AI Agents stays in the Home navigation even when diagnosis does not recommend it",()=>{
 const web=fs.readFileSync(path.join(root,"app/vista-app/page.tsx"),"utf8");
 const native=fs.readFileSync(path.join(root,"apps/ios/App.tsx"),"utf8");
 assert.ok(web.includes('data-vmv-shortcut-id="ai-agents" onClick={()=>window.location.assign("/vista-app/ai-agents")}'));
 assert.ok(native.includes('<Pressable accessibilityRole="button" accessibilityLabel="AI Agents" style={[styles.conceptTile,styles.conceptLavender]}'));
 assert.ok(!web.includes('showHomeOffer("ai-agents")?'));
 assert.ok(!native.includes('showHomeOffer("ai-agents")?'));
});
