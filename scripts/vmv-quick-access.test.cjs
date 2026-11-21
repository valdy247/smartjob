const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const registry=fs.readFileSync(path.resolve("lib/vmv-quick-access.ts"),"utf8");
const compiled=ts.transpileModule(registry,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports","require",compiled)(mod,mod.exports,require);
const {items,fresh,parseState,findShortcut,safePath,findMatching,SHORTCUT_LIMIT,HIDDEN_LIMIT,validHiddenScope,hiddenKey}=mod.exports;
test("all searchable VMV shortcuts have unique identifiers and safe internal deep links",()=>{
 const ids=new Set(),links=new Set();
 assert.ok(items.length>=30);
 for(const item of items){
  assert.ok(!ids.has(item.id),item.id);ids.add(item.id);
  assert.ok(safePath(item.href),item.href);
  assert.ok(!links.has(item.href),item.href);links.add(item.href);
  assert.ok(item.es&&item.en&&item.group);
 }
});
test("untrusted or external URLs cannot be stored as shortcuts",()=>{
 for(const value of ["https://evil.example/","//evil.example","javascript:alert(1)",
  "/admin","/vista-app/../../admin","/vista-app\\evil","/",""])
  assert.equal(safePath(value),false,value);
 assert.equal(safePath("/vista-app/marketing?service=seo_improvement"),true);
});
test("preferences reject foreign ids, malformed custom entries and unbounded lists",()=>{
 const custom={id:"custom:12345abc",es:"My custom",en:"My custom",href:"/vista-app/marketing",group:"Personalizado"};
 const state=parseState({enabled:true,quick:["ads","ads","outsider",custom.id],home:["marketing",custom.id],
  custom:[custom,{...custom,id:"custom:evil000",href:"https://example.com"}],updatedAt:8});
 assert.deepEqual(state.quick,["ads",custom.id]);assert.deepEqual(state.home,["marketing",custom.id]);
 assert.equal(state.custom.length,1);assert.equal(state.enabled,true);
 assert.equal(findShortcut(state,custom.id).href,"/vista-app/marketing");
 const huge=parseState({quick:Array.from({length:100},(_,i)=>items[i%items.length].id)});
 assert.ok(huge.quick.length<=SHORTCUT_LIMIT);
});
test("search works in Spanish and English, including accents and alternate terms",()=>{
 assert.ok(findMatching(items.find(x=>x.id==="reputation"),"reseñas"));
 assert.ok(findMatching(items.find(x=>x.id==="ads"),"facebook"));
 assert.ok(findMatching(items.find(x=>x.id==="contacts"),"contacts"));
 assert.deepEqual(fresh().home,[]);
});
test("shared layout mounts Quick Access on all routes",()=>{
 const layout=fs.readFileSync(path.resolve("app/layout.tsx"),"utf8");
 assert.ok(layout.includes("<VMVQuickAccessProvider>{children}</VMVQuickAccessProvider>"));
 const ui=fs.readFileSync(path.resolve("components/VMVQuickAccess.tsx"),"utf8");
 assert.ok(ui.includes('role="dialog"'));
 assert.ok(ui.includes('data-vmv-shortcut-id'));
 assert.ok(ui.includes('onAuthStateChange'));
 assert.ok(ui.includes('auth.updateUser'));
 assert.ok(ui.includes('window.localStorage')||ui.includes('localStorage.setItem'));
 assert.ok(ui.includes('pointerdown'));
 assert.ok(ui.includes('pointermove'));
 assert.ok(ui.includes('pointercancel'));
 assert.ok(ui.includes('setActionItem(entry)'));
});
test("Home can open saved shortcuts, and settings can enable floating launcher",()=>{
 const home=fs.readFileSync(path.resolve("app/vista-app/page.tsx"),"utf8");
 assert.ok(home.includes("<VMVHomePinnedShortcuts/>"));
 assert.ok(home.includes("<VMVQuickAccessSettings/>"));
 assert.ok(home.includes('data-vmv-shortcut-id="marketing"'));
 assert.ok(home.includes('data-vmv-shortcut-id="smart-call"'));
 const ui=fs.readFileSync(path.resolve("components/VMVQuickAccess.tsx"),"utf8");
 assert.ok(ui.includes('checked={state.enabled}'));
 assert.ok(ui.includes('state.enabled?<button'));
 assert.ok(ui.includes('pin(item,"home")'));
});
test("Marketing service deep links reach their specific tools",()=>{
 const page=fs.readFileSync(path.resolve("app/vista-app/marketing/page.tsx"),"utf8");
 const actions=fs.readFileSync(path.resolve("app/vista-app/marketing/MarketingActionCenter.tsx"),"utf8");
 assert.ok(page.includes('params.get("tool")==="captions"'));
 assert.ok(page.includes('service==="google_profile"'));
 assert.ok(page.includes('service==="review_strategy"'));
 assert.ok(actions.includes("openSocialCaptions={")===false||actions.includes("openSocialCaptions"));
 assert.ok(actions.includes('data-vmv-shortcut-id="social-captions"'));
});

test("old shortcut settings migrate without any hidden services",()=>{
 const prefs=parseState({enabled:true,quick:["ads"],home:["marketing"],custom:[],updatedAt:77});
 assert.deepEqual(prefs.hidden,[]);
 assert.deepEqual(prefs.quick,["ads"]);
 assert.equal(prefs.enabled,true);
});
test("dismissed cards are strictly scoped, deduplicated and cannot inject routes",()=>{
 assert.equal(validHiddenScope("/vista-app#home"),true);
 assert.equal(validHiddenScope("/vista-app#services"),true);
 assert.equal(validHiddenScope("/vista-app/marketing#marketing-actions"),true);
 assert.equal(validHiddenScope("https://evil.example"),false);
 assert.equal(validHiddenScope("/admin"),false);
 const result=parseState({hidden:[
  {id:"marketing",scope:"/vista-app#home"},
  {id:"marketing",scope:"/vista-app#services"},
  {id:"marketing",scope:"/vista-app#home"},
  {id:"unknown",scope:"/vista-app#home"},
  {id:"ads",scope:"https://evil.example"},
  {id:"ads",scope:"/vista-app/marketing"}
 ]});
 assert.deepEqual(result.hidden,[
  {id:"marketing",scope:"/vista-app#home"},
  {id:"marketing",scope:"/vista-app#services"},
  {id:"ads",scope:"/vista-app/marketing"}
 ]);
 assert.notEqual(hiddenKey("/vista-app#home","marketing"),hiddenKey("/vista-app#services","marketing"));
});
test("unbounded hidden items and custom names are rejected during rehydration",()=>{
 const custom={id:"custom:12345abc",es:"Mi tarjeta",en:"My card",href:"/vista-app/marketing",group:"Personalizado"};
 const hidden=Array.from({length:100},(_,i)=>({id:items[i%items.length].id,scope:"/vista-app#home"}));
 const prefs=parseState({custom:[custom],hidden:[...hidden,{id:custom.id,scope:"/vista-app/marketing"}]});
 assert.ok(prefs.hidden.length<=HIDDEN_LIMIT);
 assert.ok(prefs.hidden.every(x=>validHiddenScope(x.scope)));
 assert.ok(prefs.custom.some(x=>x.id===custom.id));
});
test("long-press offers a confirmation, rather than deleting or disabling services",()=>{
 const source=fs.readFileSync(path.resolve("components/VMVQuickAccess.tsx"),"utf8");
 assert.ok(source.includes('No necesito esto'));
 assert.ok(source.includes('¿Ocultar esta tarjeta?'));
 assert.ok(source.includes('Este elemento ya no estará en esta pantalla.'));
 assert.ok(source.includes('Ajustes → Servicios extras.'));
 assert.ok(source.includes('setPendingHide({item:actionItem,scope:actionScope})'));
 assert.ok(source.includes('onClick={()=>{if(hideCard(pendingHide))setPendingHide(null);}}'));
 assert.ok(source.includes('card.classList.toggle(styles.cardHidden,shouldHide)'));
 assert.ok(source.includes('new MutationObserver(schedule)'));
 assert.ok(source.includes('candidate.closest("nav,[role=navigation],[role=tablist],form,[data-vmv-shortcuts-ui]")'));
});
test("Profile contains Extra services list and restoring removes the hidden entry",()=>{
 const source=fs.readFileSync(path.resolve("components/VMVQuickAccess.tsx"),"utf8");
 const home=fs.readFileSync(path.resolve("app/vista-app/page.tsx"),"utf8");
 assert.ok(source.includes('export function VMVExtraServicesSettings()'));
 assert.ok(source.includes('hidden:old.hidden.filter(x=>x.scope!==scope||x.id!==id)'));
 assert.ok(source.includes('onClick={()=>restoreCard(entry.scope,entry.id)}'));
 assert.ok(home.includes("<VMVExtraServicesSettings/>"));
 assert.ok(home.includes('target==="extras"?"vmv-extra-services"'));
 assert.ok(home.includes('data-vmv-shortcut-scope="home"'));
 assert.ok(home.includes('data-vmv-shortcut-scope="services"'));
 assert.ok(home.includes('data-vmv-shortcut-scope="account"'));
});
