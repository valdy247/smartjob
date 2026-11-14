const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,path);
const {t}=require('../lib/i18n.ts');
const {centralBusinessDefaults,businessGoogleSeed}=require('../lib/vmv-central-business.ts');
const source=fs.readFileSync(require.resolve('../app/vista-app/marketing/GoogleProfileWizard.tsx'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const mod={exports:{}};
new Function('module','exports','require',js)(mod,mod.exports,name=>{
 if(name==='@/lib/i18n-web')return {useInterfaceLanguage:()=>({language:'es',translate:(key,args)=>t('es',key,args)})};
 if(name==='@/components/BusinessPhoneInput')return {__esModule:true,default:props=>React.createElement('input',{value:props.value,readOnly:true})};
 if(name==='./GoogleCategoryLookup')return {__esModule:true,default:()=>React.createElement('label',null,'Categoría principal en Google')};
 if(name.endsWith('.module.css'))return {};
 if(name.startsWith('@/'))return require('../'+name.slice(2));
 return require(name);
});
const Wizard=mod.exports.default;
const fixture=()=>({id:'a',owner_id:'owner',...centralBusinessDefaults('Mayuli Bakery','bakery'),phone:'+17065551234',street:'123 Main',city:'Columbus',region:'GA',postal:'31901',description:'Cuban bakery'});
const render=(b,step,editLoaded=false)=>{const seed=businessGoogleSeed(b);return renderToStaticMarkup(React.createElement(Wizard,{step,data:seed,loadedData:seed,editLoaded,business:b.name,website:'https://example.com',onData:()=>{},onMedia:()=>{},media:{logo:null,cover:null,photos:[]}}));};
test('loaded business name and activity are not repeated as required input questions',()=>{
 const html=render(fixture(),0);assert.ok(!html.includes('value="Mayuli Bakery"'));assert.ok(!html.includes('value="Panadería y repostería"'));assert.ok(html.includes('VMV comprobará'));assert.ok(html.includes('Crear un perfil'));
});
test('partial location requests missing city while hiding already loaded street/country',()=>{
 const html=render({...fixture(),city:''},1);assert.ok(html.includes('Ciudad'));assert.ok(!html.includes('value="123 Main"'));assert.ok(!html.includes('value="US"'));assert.ok(!html.includes('hasSaved('));
});
test('explicit Edit opens the already populated fields',()=>{
 const html=render(fixture(),1,true);assert.ok(html.includes('value="123 Main"'));assert.ok(html.includes('value="Columbus"'));
});
test('unknown activity remains a genuine missing category, and invalid saved description remains editable',()=>{
 assert.ok(render({...fixture(),category_id:'other'},0).includes('Categoría principal en Google'));
 const html=render({...fixture(),description:'Visit https://example.com'},4);assert.ok(html.includes('Visit https://example.com'));
});
