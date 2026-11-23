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

// Validate literal translation references throughout the source, including native screens.
const {readdirSync}=await import("node:fs");
const ts=(await import("typescript")).default;
let references=0;
function scan(directory){
 for(const item of readdirSync(new URL("../"+directory,import.meta.url),{withFileTypes:true})){
  if(item.name==="node_modules"||item.name.startsWith("."))continue;
  const relative=directory+"/"+item.name;
  if(item.isDirectory()){scan(relative);continue;}
  if(!/\.tsx?$/.test(item.name))continue;
  const source=ts.createSourceFile(relative,readFileSync(new URL("../"+relative,import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
  function visit(node){
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&["t","translate"].includes(node.expression.text)){
    const first=node.arguments[0],second=node.arguments[1];
    const key=first&&ts.isStringLiteral(first)&&first.text.includes(".")?first:second&&ts.isStringLiteral(second)&&second.text.includes(".")?second:null;
    if(key){assert.ok(keys.has(key.text),relative+": missing translation "+key.text);references++;}
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
}
for(const directory of ["app","components","lib","apps/ios"])scan(directory);
console.log("i18n references:",references,"literal keys validated");
