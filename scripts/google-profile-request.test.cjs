const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {googleProfileIssue,normalizeGoogleProfile,googlePhotoKey}=require('../lib/google-profile-request.ts');
const fixture=()=>({action:'create',kind:'storefront',googleCategory:'Bakery',otherCategories:'',street:'123 Main',unit:'',city:'Columbus',region:'GA',postal:'31901',country:'US',serviceAreas:'',phone:'7065551234',secondaryPhone:'',description:'Cuban bakery',services:'',products:'',bookingUrl:'',existingProfileUrl:'',openingDate:'',hoursEnabled:false,hours:Array.from({length:7},()=>({closed:true,start:'09:00',end:'17:00'}))});
test('storefront, service-area and hybrid have distinct location requirements',()=>{
 const v=fixture();assert.equal(googleProfileIssue(v),null);v.street='';assert.equal(googleProfileIssue(v).key,'address');v.kind='service_area';assert.equal(googleProfileIssue(v).key,'serviceAreas');v.serviceAreas='Columbus GA';assert.equal(googleProfileIssue(v),null);v.kind='hybrid';assert.equal(googleProfileIssue(v).key,'address');
});
test('phone normalization, private address removal and existing profile date cleanup',()=>{
 const v={...fixture(),kind:'service_area',serviceAreas:'Columbus',action:'improve',openingDate:'2020-01-01'};
 const n=normalizeGoogleProfile(v);assert.equal(n.phone,'+17065551234');assert.equal(n.street,'');assert.equal(n.city,'');assert.equal(n.openingDate,'');assert.equal(v.street,'123 Main');
});
test('hours reject malformed and identical times, allow overnight and require an open day',()=>{
 const v=fixture();v.hoursEnabled=true;assert.equal(googleProfileIssue(v).key,'hours');v.hours[0]={closed:false,start:'22:00',end:'06:00'};assert.equal(googleProfileIssue(v),null);for(const end of ['22:00','25:00','9:00']){v.hours[0].end=end;assert.equal(googleProfileIssue(v).key,'hours');}
});
test('dates, links in description, country and oversized text are rejected before submit',()=>{
 for(const [key,value,issue] of [['openingDate','2026-02-30','date'],['description','Visit https://example.com','description'],['country','United States','country'],['services','a'.repeat(901),'length']])assert.equal(googleProfileIssue({...fixture(),[key]:value}).key,issue);
});
test('photo IDs use contents, not size or last-modified; forged file types fail',async()=>{
 const png=[137,80,78,71,13,10,26,10];const a=new Blob([new Uint8Array([...png,1])],{type:'image/png'}),b=new Blob([new Uint8Array([...png,2])],{type:'image/png'});
 assert.notEqual(await googlePhotoKey(a),await googlePhotoKey(b));assert.equal(await googlePhotoKey(a),await googlePhotoKey(a));await assert.rejects(googlePhotoKey(new Blob(['not a photo'],{type:'image/png'})));
});

const {googleProfileLink}=require('../lib/google-profile-request.ts');
test('saved booking and profile links reject executable schemes and embedded credentials',()=>{
 assert.equal(googleProfileLink('https://maps.google.com/?cid=123'),'https://maps.google.com/?cid=123');
 for(const input of ['javascript:alert(1)','data:text/html,x','https://user:password@example.com','http://example.com',null,{}])assert.equal(googleProfileLink(input),null);
});

test('shared intake validation rejects unsafe booking and existing-profile URLs',()=>{
 const base=fixture();
 for(const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','not-a-url']){
  assert.equal(googleProfileIssue({...base,bookingUrl:url}).key,'booking');
  assert.equal(googleProfileIssue({...base,action:'improve',existingProfileUrl:url}).key,'existing');
 }
 assert.equal(googleProfileIssue({...base,bookingUrl:'https://example.com/book',existingProfileUrl:'https://maps.google.com/?cid=123'}),null);
});

test('switching from an existing listing to create ignores and clears a hidden stale URL',()=>{
 const stale={...fixture(),action:'improve',existingProfileUrl:'javascript:alert(1)'};
 assert.equal(googleProfileIssue(stale).key,'existing');
 const create={...stale,action:'create'};
 assert.equal(googleProfileIssue(create),null);
 assert.equal(normalizeGoogleProfile(create).existingProfileUrl,'');
 assert.equal(normalizeGoogleProfile(stale).existingProfileUrl,'javascript:alert(1)');
});

test('malformed opening-hours entries return a validation issue instead of crashing',()=>{
 const v=fixture();v.hoursEnabled=true;v.hours[0]=null;
 assert.equal(googleProfileIssue(v).key,'hours');
 v.hours[0]=undefined;
 assert.equal(googleProfileIssue(v).key,'hours');
 v.hours[0]={closed:false,start:'09:00',end:'17:00'};
 assert.equal(googleProfileIssue(v),null);
});

test('creating a profile ignores an oversized hidden URL from a previous action',()=>{
 const stale={...fixture(),action:'improve',existingProfileUrl:'x'.repeat(501)};
 assert.equal(googleProfileIssue(stale).key,'length');
 const create={...stale,action:'create'};
 assert.equal(googleProfileIssue(create),null);
 assert.equal(normalizeGoogleProfile(create).existingProfileUrl,'');
});

test('country formatting is applied before phone normalization',()=>{
 const v={...fixture(),country:' us ',phone:'7065551234',secondaryPhone:'7065555678'};
 const n=normalizeGoogleProfile(v);
 assert.equal(n.country,'US');
 assert.equal(n.phone,'+17065551234');
 assert.equal(n.secondaryPhone,'+17065555678');
 assert.equal(v.country,' us ');
});
