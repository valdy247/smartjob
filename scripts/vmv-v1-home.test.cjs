const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");

test("V1 preserves the preexisting Home visual layout while showing six launch modules",()=>{
 const ui=read("app/vista-app/VMVV1Shell.tsx");
 const css=read("app/vista-app/vista-app.module.css");
 const original=read("app/vista-app/page.tsx");
 assert.match(original,/return <VMVV1Shell\/>/);
 for(const className of ["stage","layout","phoneFrame","device","scrollArea","homeConcept","homeIdentity","homeHello","homeGrowHero","homeRocketArt","homeServiceTiles","homeBusinessArea","homeSummaryCard","bottomNav"]){
  assert.ok(ui.includes("homeStyles."+className),"missing legacy layout: "+className);
  assert.ok(css.includes("."+className),"missing original CSS: "+className);
 }
 const tokens=[..."Web Services|AI Agents|Video Studio|Smart Quote|Marketing|Ads Studio".split("|")];
 for(const name of tokens)assert.ok(ui.includes("<strong>"+name+"</strong>"),"missing module: "+name);
 assert.doesNotMatch(ui,/return <main className=\{styles\.page\}>/);
 assert.doesNotMatch(ui,/useSmartCallAccount/);
 assert.doesNotMatch(ui,/VMVHomePinnedShortcuts/);
 assert.doesNotMatch(ui,/(Smart Call|Traductor|Instagram Connect)/);
 const main=ui.slice(ui.indexOf("return <main className={homeStyles.stage}>"));
 assert.equal((main.match(/data-vmv-shortcut-id="(web|ai-agents|agent-video|agent-quote|marketing|ads)"/g)||[]).length,6);
});
test("V1 shell has three navigation entries and no call or translator startup",()=>{
 const ui=read("app/vista-app/VMVV1Shell.tsx");
 assert.ok(ui.includes('id:"home"')&&ui.includes('id:"services"')&&ui.includes('id:"account"'));
 assert.ok(!ui.includes('id:"calls"')&&!ui.includes('id:"translator"'));
 assert.ok(!ui.includes("/api/vista-app/smart-call"));
 assert.ok(!ui.includes("/api/vista-app/callback"));
});
