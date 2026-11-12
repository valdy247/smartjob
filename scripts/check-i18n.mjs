import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const messages=JSON.parse(readFileSync(new URL("../lib/i18n/messages.json",import.meta.url),"utf8"));
const keys=new Set(Object.keys(messages.es));
assert.ok(keys.size>100,"Catalog needs meaningful coverage");
assert.deepEqual(Object.keys(messages.en).sort(),[...keys].sort(),"English/Spanish keys differ");
for(const [locale,items] of Object.entries(messages)){
 for(const [key,value] of Object.entries(items)){
  assert.equal(typeof value,"string",locale+" "+key+" must be text");
  assert.ok(value.trim(),locale+" "+key+" empty");
  assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),
    [...messages.es[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),key+" placeholders differ");
 }
}
for(const key of ["common.language","common.languageHint","settings.spokenYourLanguage","settings.callLanguages"]){
 assert.ok(keys.has(key),"Missing "+key);
}
console.log("i18n catalog:",keys.size,"complete keys per locale; placeholders match");
