const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
function compile(file,mocks={}){
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>{
  if(name in mocks)return mocks[name];
  if(name.endsWith('.module.css'))return {default:new Proxy({},{get:(_,key)=>key})};
  if(name.startsWith('@/'))return compile(path.join(__dirname,'..',name.slice(2)+'.ts'),mocks);
  return require(name);
 });return mod.exports;
}
const {centralPrefill}=compile(path.join(__dirname,'../app/vista-app/ai-agents/centralBusiness.ts'),{'@/lib/supabase':{getSupabase:()=>null}});
const business=()=>({id:'business',updated_at:'today',name:'Bakery',category_id:'bakery',country:'US',city:'Columbus',region:'Georgia',phone:'+17065551234',description:'Cakes',website_url:'https://bakery.example',hours_enabled:true,hours:Array.from({length:7},(_,i)=>({closed:i>4,start:'09:00',end:'17:00'})),street:'PRIVATE',email:'PRIVATE'});
const draft=()=>({name:'Luna',kind:'support',purpose:'Help customers',personality:'Friendly',language:'Español',instructions:'Keep these rules',knowledge:'Approved FAQ',setup:{central_business_id:'business',city:'Old city',state:'Old region',contact:'Old contact',cap_catalog:'Sí',human_review:'Ask owner'}});
test('existing agents reload current central data, preserving identity and capability permissions',()=>{
 const result=centralPrefill(business(),draft());
 assert.equal(result.setup.city,'Columbus');assert.equal(result.setup.state,'Georgia');assert.equal(result.setup.contact,'+17065551234');
 assert.equal(result.name,'Luna');assert.equal(result.instructions,'Keep these rules');assert.equal(result.setup.cap_catalog,'Sí');
 assert.ok(result.setup.central_prefill_fields.includes('city'));assert.ok(result.setup.central_prefill_fields.includes('hours'));
 assert.equal(result.setup.h_mon_open,'09:00');assert.equal(result.setup.h_sun_active,'No');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('deleted profile data and malformed hours do not survive as stale agent facts',()=>{
 const previous=centralPrefill(business(),draft());
 const result=centralPrefill({...business(),city:'',region:'',phone:'',hours:[{closed:false,start:'10:00',end:'11:00'}]},previous);
 assert.equal(result.setup.city,undefined);assert.equal(result.setup.state,undefined);assert.equal(result.setup.contact,undefined);assert.equal(result.setup.hours_mode,undefined);assert.equal(result.setup.h_mon_active,undefined);
});
test('linked agents skip the duplicate business questionnaire but keep agent policies',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {default:Wizard}=compile(path.join(__dirname,'../app/vista-app/ai-agents/AgentSetupWizard.tsx'),{
  './AgentConnections':()=>null,'./VoiceSample':()=>null
 });
 const initial=centralPrefill(business(),draft());
 const identity=renderToStaticMarkup(React.createElement(Wizard,{initial,onSave:()=>{},onCancel:()=>{}}));
 assert.match(identity,/1 \/ 4/);assert.doesNotMatch(identity,/Conoce tu negocio/);assert.doesNotMatch(identity,/¿En qué ciudad atiendes/);
 const rules=renderToStaticMarkup(React.createElement(Wizard,{initial,initialStep:3,onSave:()=>{},onCancel:()=>{}}));
 assert.match(rules,/reglas de cambios o cancelaciones/);assert.doesNotMatch(rules,/¿Qué teléfono o correo/);
});
test('phone voice samples use the matching explicit provider voice, never a fake account default',()=>{
 const {phoneVoice}=compile(path.join(__dirname,'../lib/vmv-ai-agents/voice-options.ts'));
 assert.equal(phoneVoice('female','es').voice,'Polly.Lupe');assert.equal(phoneVoice('male','es').voice,'Polly.Miguel');
 assert.equal(phoneVoice('female','en').voice,'Polly.Joanna');assert.equal(phoneVoice('male','en').voice,'Polly.Matthew');
 assert.equal(phoneVoice('default','es'),null);
 for(const lang of ['es','en'])for(const preset of ['female','male'])assert.equal(new URL(phoneVoice(preset,lang).sample).host,'d1.awsstatic.com');
});
test('read-only phone catalog uses the authenticated owner and cannot create orders',async()=>{
 let queried=0;
 const {phoneCommerceTurn}=compile(path.join(__dirname,'../lib/vmv-ai-agents/voice-commerce.ts'),{
  '@/lib/vmv-ai-agents/model':{askAiAgent:()=>{throw Error('No model actions allowed');}},
  '@/lib/vmv-ai-agents/catalog-snapshot':{ownerCatalogSnapshot:async(db,owner,business)=>{queried++;assert.equal(owner,'owner');assert.equal(business,'workspace');return [{id:'cake',sku:'CAKE',name:'Pastel',description:'Cake',priceCents:2500,currency:'usd',supportsSimpleOrder:true,availability:'tracked',availableQuantity:3}];}}
 });
 const db={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{business_id:'workspace'}})})})})})};
 const session={owner_id:'owner',agent_id:'agent',agent_snapshot:{configuration:{cap_catalog:'Sí',channel:'Teléfono'}},turns:[]};
 const reply=await phoneCommerceTurn(db,session,'¿Qué productos tienen?','es');assert.match(reply,/25.00 USD/);assert.match(reply,/3 unidades/);assert.equal(queried,1);
 session.agent_snapshot.configuration.cap_catalog='No';assert.equal(await phoneCommerceTurn(db,session,'productos','es'),null);assert.equal(queried,1);
});
test('runtime snapshots refresh the business contact and remove deleted contact details',()=>{
 const {approvedCentralSnapshot}=compile(path.join(__dirname,'../lib/vmv-ai-agents/central-public-context.ts'));
 const original={configuration:{contact:'Old number',cap_catalog:'Sí'}};
 const updated=approvedCentralSnapshot(original,business());assert.equal(updated.configuration.contact,business().phone);assert.equal(updated.configuration.cap_catalog,'Sí');
 assert.equal(approvedCentralSnapshot(original,{...business(),phone:''}).configuration.contact,undefined);
});
