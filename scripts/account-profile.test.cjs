const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {initialAccountProfile}=require('../lib/account-profile.ts');
const metadata={first_name:' Valdy ',last_name:'Mena',phone:'+17065550123',occupation:'Bakery',business_name:'Mayuli Bakery',website_url:'https://example.com',account_type:'business',occupation_code:'bakery',use_case:'business',theme_color:'violet',appearance:'dark',font_scale:'large',reduce_motion:true};
test('first native and web login preserve the same business registration and preferences',()=>{
 const profile=initialAccountProfile('owner',metadata);
 assert.equal(profile.id,'owner');assert.equal(profile.first_name,'Valdy');
 for(const key of ['business_name','website_url','account_type','occupation_code','use_case','theme_color','appearance','font_scale','reduce_motion'])assert.equal(profile[key],metadata[key],key);
});
test('incomplete shared-auth identities do not create partial VMV accounts',()=>{
 for(const key of ['first_name','last_name','phone','occupation'])assert.equal(initialAccountProfile('owner',{...metadata,[key]:' '}),null);
 assert.equal(initialAccountProfile('owner',{...metadata,phone:{number:'untrusted'}}),null);
});
test('user metadata cannot grant a plan, credits, permissions or verified phone status',()=>{
 const profile=initialAccountProfile('owner',{...metadata,id:'other',preferred_plan:'premium',plan_prompt_seen:true,line_setup_completed:true,credits:1000,role:'admin',phone_verified_at:'now'});
 assert.equal(profile.id,'owner');assert.equal(profile.preferred_plan,null);
 assert.equal(profile.plan_prompt_seen,false);assert.equal(profile.line_setup_completed,false);
 for(const key of ['credits','role','phone_verified_at'])assert.equal(key in profile,false);
});
test('interface language cannot change spoken call languages',()=>{
 const profile=initialAccountProfile('owner',{...metadata,ui_language:'en',owner_language:'es',customer_language:'en'});
 assert.equal(profile.owner_language,'es');assert.equal(profile.customer_language,'en');
});
