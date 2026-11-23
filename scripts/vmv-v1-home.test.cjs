const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8");

const recommendations=(()=>{
 const source=read("lib/vmv-v1-recommendations.ts");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,Object,Date,Set,Map});
 return exports;
})();

test("V1 preserves original Home layout, personalized four cards and six-service catalog",()=>{
 const ui=read("app/vista-app/VMVV1Shell.tsx");
 const oldCss=read("app/vista-app/vista-app.module.css");
 const css=read("app/vista-app/VMVV1Shell.module.css");
 const original=read("app/vista-app/page.tsx");
 assert.match(original,/return <VMVV1Shell\/>/);
 for(const className of ["stage","layout","phoneFrame","device","scrollArea","homeConcept","homeIdentity","homeHello","homeGrowHero","homeRocketArt","homeServiceTiles","bottomNav"]){
  assert.ok(ui.includes("homeStyles."+className),"missing original layout: "+className);
  assert.ok(oldCss.includes("."+className),"missing original CSS: "+className);
 }
 for(const name of ["Web Services","AI Agents","Video Studio","Smart Quote","Marketing","Ads Studio"])
  assert.match(ui,new RegExp('name:"'+name+'"'));
 assert.match(ui,/suggestedServices\.map\(service=>/);
 assert.match(ui,/<section className=\{homeStyles\.homeGrowHero\}/);
 assert.doesNotMatch(ui,/!hasAssessment\?<section className=\{homeStyles\.homeGrowHero\}/);
 assert.doesNotMatch(ui,/className=\{homeStyles\.homeSummaryCard\}/);
 assert.match(ui,/recommendV1Services\(needsAnswers,legacyAnswers\)/);
 assert.match(ui,/readV1Needs\(who\.user_metadata,businessId\)/);
 assert.match(ui,/readDiagnosticRecord\(who\.user_metadata,businessId\)/);
 assert.match(ui,/styles\.catalogTiles/);
 assert.match(css,/\.catalogTiles\{display:grid;grid-template-columns:repeat\(2/);
 assert.doesNotMatch(ui,/useSmartCallAccount|VMVHomePinnedShortcuts/);
 assert.doesNotMatch(ui,/(Smart Call|Traductor|Instagram Connect)/);
});

test("navigation centers three buttons and labels the last one Settings",()=>{
 const ui=read("app/vista-app/VMVV1Shell.tsx");
 const css=read("app/vista-app/VMVV1Shell.module.css");
 assert.match(ui,/styles\.v1BottomNav/);
 assert.match(ui,/name:L\("Configuración","Settings"\),Icon:Settings2/);
 assert.match(css,/\.v1BottomNav\.v1BottomNav\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.ok(ui.includes('id:"home"')&&ui.includes('id:"services"')&&ui.includes('id:"account"'));
 assert.doesNotMatch(ui,/id:"calls"|id:"translator"/);
});

test("recommendations use real answers and always contain four unique V1 services",()=>{
 const recommend=recommendations.recommendV1Services;
 const ids=["web","agents","video","quote","marketing","ads"];
 assert.equal(recommend(null).length,4);
 assert.ok(recommend(null).every(id=>ids.includes(id)));
 const examples=[
  {goal:"time",web:"yes",support:"yes",marketing:"yes",quotes:"often",videos:"no"},
  {goal:"presence",web:"no",support:"no",marketing:"unsure",quotes:"never",videos:"yes"},
  {goal:"customers",web:"yes",support:"no",marketing:"no",quotes:"sometimes",videos:"yes"}
 ];
 for(const example of examples){
  const result=recommend(example);
  assert.equal(result.length,4);assert.equal(new Set(result).size,4);
  assert.ok(result.every(id=>ids.includes(id)));
 }
 assert.ok(recommend(examples[0]).includes("agents")&&recommend(examples[0]).includes("quote"));
 assert.ok(recommend(examples[1]).includes("web"));
 assert.ok(recommend(examples[2]).includes("marketing")&&recommend(examples[2]).includes("video"));
 assert.ok(recommend(null,{goal:"presence",web:"no",agents:"yes"}).includes("web"));
});

test("stored V1 needs belong to this business and contain valid answers",()=>{
 const readNeeds=recommendations.readV1Needs;
 const key=recommendations.VMV_V1_NEEDS_KEY;
 const answers={goal:"customers",web:"no",support:"yes",marketing:"no",quotes:"sometimes",videos:"yes"};
 const saved={[key]:{version:1,businessId:"business-1",answers,completedAt:"2026-11-23T03:00:00.000Z"}};
 assert.ok(readNeeds(saved,"business-1"));
 assert.equal(readNeeds(saved,"business-2"),null);
 assert.equal(readNeeds({[key]:{...saved[key],answers:{...answers,web:"whatever"}}},"business-1"),null);
 assert.equal(readNeeds(null,"business-1"),null);
});
