const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {searchBusinessCategories}=require('../lib/business-category-search.ts');
const {websiteAddress}=require('../lib/website-address.ts');
test('business terms and professions resolve to stable category IDs in Spanish and English',()=>{
 for(const [q,id] of [['vendo dulces','bakery'],['soy carpintero','carpentry'],['dulce','bakery'],['dulces','bakery'],['carpintero','carpentry'],['abogado','legal'],['electricista','electrical'],['fontanero','plumbing'],['dentista','dental'],['accountant','accounting'],['lawyer','legal'],['cake','bakery'],['carpinteroo','carpentry'],['repostería','bakery']])assert.equal(searchBusinessCategories(q)[0]?.id,id,q);
});
test('unknown input is not silently converted into an unrelated category',()=>{
 assert.equal(searchBusinessCategories('zzzzzzzqqqqq').length,0);
 assert.ok(searchBusinessCategories('').length>50);
});
test('website input accepts bare domains and preserves explicit http and paths',()=>{
 assert.equal(websiteAddress(' tusitio.com '),'https://tusitio.com/');
 assert.equal(websiteAddress('www.tusitio.com/contacto'),'https://www.tusitio.com/contacto');
 assert.equal(websiteAddress('http://tusitio.com'),'http://tusitio.com/');
 for(const value of ['','javascript:alert(1)','ftp://example.com','user:pass@example.com','https://user:pass@example.com','hello world','//example.com'])assert.equal(websiteAddress(value),null,value);
});

const {contactPhoneE164,splitContactPhone}=require('../lib/contact-phone.ts');
test('national numbers receive the selected prefix without duplicating pasted international prefixes',()=>{
 assert.equal(contactPhoneE164('7065551234','US'),'+17065551234');
 assert.equal(contactPhoneE164('17065551234','US'),'+17065551234');
 assert.equal(contactPhoneE164('+17065551234','US'),'+17065551234');
 assert.equal(contactPhoneE164('612345678','ES'),'+34612345678');
 assert.equal(contactPhoneE164('+34612345678','US'),'+34612345678');
 assert.equal(contactPhoneE164('+1','US'),null);
 assert.equal(splitContactPhone('+34612345678').country,'ES');
});
