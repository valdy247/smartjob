const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {agentSetupDestination}=require('../lib/agent-capability-access.ts');
const complete=()=>({name:'Luna',kind:'support',purpose:'Help bakery customers',personality:'Friendly',language:'Español',instructions:'',knowledge:'',setup:{business_name:'Bakery',industry:'Bakery',country:'Estados Unidos',city:'Columbus',state:'Georgia',human_review:'Transfer to owner',data_scope:'Contact details',support_topics:'We offer Cuban cakes'}});
test('missing agent opens Account setup for the selected business',()=>{
 const url=new URL(agentSetupDestination(null,'business-a'),'https://vmv.example');
 assert.equal(url.pathname,'/vista-app');assert.equal(url.searchParams.get('tab'),'account');assert.equal(url.searchParams.get('setup'),'agent');assert.equal(url.searchParams.get('business'),'business-a');
});
test('a named but incomplete agent still requires setup',()=>{
 const agent=complete();delete agent.setup.human_review;assert.ok(agentSetupDestination(agent,'business-a'));
 agent.setup.human_review='Ask owner';delete agent.setup.support_topics;assert.ok(agentSetupDestination(agent,'business-a'));
});
test('a configured agent enters capabilities without requiring telephone activation',()=>{
 assert.equal(agentSetupDestination(complete(),'business-a'),null);
});
test('without a central business, setup starts in Account and cannot introduce an external redirect',()=>{
 assert.equal(new URL(agentSetupDestination(complete(),null),'https://vmv.example').searchParams.has('business'),false);
 const url=new URL(agentSetupDestination(null,'x&returnTo=https://evil.example'),'https://vmv.example');
 assert.equal(url.origin,'https://vmv.example');assert.equal(url.searchParams.has('returnTo'),false);
});
