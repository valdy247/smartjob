const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {centralDirectoryProfile}=require('../lib/central-directory-profile.ts');
const {centralBusinessDefaults}=require('../lib/vmv-central-business.ts');
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
test('saved central fields and Monday-first hours populate the directory profile',()=>{
 const b={id:'a',owner_id:'owner',...centralBusinessDefaults('Bakery','bakery','https://bakery.example'),phone:'+17065551234',city:'Columbus',region:'GA',description:'Cuban cakes',hours_enabled:true,hours:days.map((_,i)=>({closed:i>4,start:'09:00',end:'17:00'}))};
 const p=centralDirectoryProfile(b,'Bakery',days,'Closed');assert.equal(p.business,'Bakery');assert.equal(p.phone,b.phone);assert.equal(p.city,b.city);assert.equal(p.description,b.description);assert.match(p.hours,/Mon: 09:00–17:00/);assert.match(p.hours,/Sun: Closed/);
});
test('private and service-area addresses never populate exportable street or postal fields',()=>{
 const b={id:'a',owner_id:'owner',...centralBusinessDefaults('Business','bakery'),street:'Private home',unit:'2',postal:'12345'};
 for(const patch of [{address_visibility:'private',kind:'storefront'},{address_visibility:'public',kind:'service_area'}]){
  const p=centralDirectoryProfile({...b,...patch},'Bakery',days,'Closed');assert.equal(p.address,'');assert.equal(p.postal,'');
 }
 assert.equal(centralDirectoryProfile({...b,address_visibility:'public'},'Bakery',days,'Closed').address,'Private home, 2');
});
test('profiles stay isolated; missing hours and unspecified activity are not fabricated',()=>{
 const a={id:'a',owner_id:'owner',...centralBusinessDefaults('Bakery','bakery'),phone:'111'};
 const b={id:'b',owner_id:'owner',...centralBusinessDefaults('Carpentry'),phone:'222'};
 const pa=centralDirectoryProfile(a,'Bakery',days,'Closed'),pb=centralDirectoryProfile(b,'Other',days,'Closed');
 assert.equal(pa.phone,'111');assert.equal(pb.phone,'222');assert.equal(pb.hours,'');assert.equal(pb.industry,'');pa.business='Edited draft';assert.equal(a.name,'Bakery');assert.equal(pb.business,'Carpentry');
});
