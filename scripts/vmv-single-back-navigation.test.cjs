const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const modulePath='app/vista-app/ai-agents/';
test('AI Agents renders exactly one phone-header back arrow and delegates internal actions',()=>{
 const page=read(modulePath+'page.tsx');
 assert.equal((page.match(/className=\{styles\.backIcon\}/g)||[]).length,1);
 assert.match(page,/onClick=\{headerBack\}/);
 assert.match(page,/registeredBack\.current\(\)/);
 assert.doesNotMatch(page,/<a href="\/vista-app" className=\{styles\.returnLink\}/);
 assert.match(page,/AgentHeaderBackContext\.Provider/);
});
test('embedded chat screens expose their back actions only through parent header',()=>{
 const page=read(modulePath+'ChatWebHub.tsx');
 assert.match(page,/useAgentHeaderBack\(/);
 assert.match(page,/if\(section==="conversations"&&chosen\)/);
 assert.match(page,/!useSharedHeader\?<header/);
 assert.ok(page.includes("!useSharedHeader?<button")&&page.includes("Chats recientes</button>:null"));
 assert.ok(page.includes("Conversaciones</button>:null"));
});
test('other nested AI Agents screens register their own one-level history',()=>{
 for(const name of ['AgentQualityLab','AgentLiveTest','AgentSetupWizard','CommerceStudio','BookingStudio','CallControl']){
  const code=read(modulePath+name+'.tsx');
  assert.match(code,/useAgentHeaderBack\(/,name+' must register its back action');
  assert.match(code,/!useSharedHeader\?/,name+' must not display its redundant local arrow when hosted');
 }
 const commerce=read(modulePath+'CommerceStudio.tsx');
 assert.match(commerce,/catalogView==="add"/);
 assert.match(commerce,/catalogView==="list"/);
 const setup=read(modulePath+'AgentSetupWizard.tsx');
 assert.match(setup,/if\(step===0\)onCancel\(\);else setStep\(x=>x-1\)/);
});
test('video generator and marketing use page-header back for nested wizard steps',()=>{
 const video=read('app/vista-app/video-generator/page.tsx');
 const wizard=read('app/vista-app/video-generator/AutopilotWizard.tsx');
 assert.match(video,/registerHeaderBack=\{registerPilotBack\}/);
 assert.match(video,/pilotBack\.current\(\)/);
 assert.ok(wizard.includes("registerHeaderBack?:(callback:"));
 assert.match(wizard,/!registerHeaderBack\?<button/);
 const marketing=read('app/vista-app/marketing/page.tsx');
 const actions=read('app/vista-app/marketing/MarketingActionCenter.tsx');
 assert.match(marketing,/registerHeaderBack=\{registerActionBack\}/);
 assert.match(actions,/headerActionRef\.current/);
 assert.match(actions,/!registerHeaderBack\?<button/);
 assert.match(actions,/hideBack=\{Boolean\(registerHeaderBack\)\}/);
});
test('VMV service details and support tickets have one contextual header back',()=>{
 const app=read('app/vista-app/page.tsx');
 assert.match(app,/className=\{styles\.headerBack\}/);
 assert.equal((app.match(/className=\{styles\.back\}/g)||[]).length,0);
 const support=read('app/vista-app/soporte/page.tsx');
 assert.match(support,/mobile==="detail"\?/);
 assert.doesNotMatch(support,/className=\{styles\.backMobile\}/);
});

test('Web Studio removes second mobile return arrow and preserves the editor destination',()=>{
 const studio=read('app/web-studio/WebBuilderWorkspace.tsx');
 assert.equal((studio.match(/className=\\{styles\\.mobileBack\\}/g)||[]).length,1);
 assert.doesNotMatch(studio,/className=\\{styles\\.mobileEditorReturn\\}/);
 assert.match(studio,/view==="editor"\\?"Volver a mis sitios":"Volver al editor"/);
});
test('Web Services nested pages give their back action to the main header',()=>{
 const preview=read('app/vista-app/BusinessServicesPreview.tsx');
 assert.match(preview,/registerHeaderBack/);
 assert.match(preview,/hideBack=\\{Boolean\\(registerHeaderBack\\)\\}/);
 const app=read('app/vista-app/page.tsx');
 assert.match(app,/registerHeaderBack=\\{registerWebBack\\}/);
 assert.match(app,/webBack\\.current\\(\\)/);
 for(const screen of ['WebServicesStudio','WebServicesInbox']){
  const code=read('app/vista-app/'+screen+'.tsx');
  assert.match(code,/hideBack=false/);
  assert.match(code,/!hideBack\\?<button/);
 }
});
test('campaign creator uses its one header back arrow for each Ads Studio step',()=>{
 const page=read('app/vista-app/marketing/ads/create/page.tsx');
 const ads=read('app/vista-app/marketing/ads/AdsStudio.tsx');
 assert.match(page,/registerHeaderBack=\\{registerWizardBack\\}/);
 assert.match(page,/wizardBack\\.current\\?\\.\\(\\)/);
 assert.match(ads,/registerHeaderBack/);
 assert.match(ads,/step>0&&!registerHeaderBack/);
});
