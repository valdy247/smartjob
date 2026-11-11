import test from "node:test";
import assert from "node:assert/strict";
import {directTranslationReady,translateDirect,numbersPreserved} from "./direct-translate.mjs";

const key="sk-"+"T".repeat(32);
const successful=response=>async (_url,options)=>({
 ok:true,
 json:async()=>({choices:[{message:{content:JSON.stringify({translation:response})}}]}),
 request:JSON.parse(options.body)
});
test("bridge refuses to announce healthy without its Render OpenAI key",()=>{
 assert.equal(directTranslationReady({}),false);
 assert.equal(directTranslationReady({OPENAI_API_KEY:""}),false);
 assert.equal(directTranslationReady({OPENAI_API_KEY:key}),true);
});
test("English customer speech translates to Spanish over direct OpenAI request",async()=>{
 let observed=null;
 const result=await translateDirect("Good morning","en-US","es-ES",{
  key,fetcher:async (url,options)=>{
   observed={url,model:JSON.parse(options.body).model,system:JSON.parse(options.body).messages[0].content};
   return successful("Buenos días")(url,options);
  }
 });
 assert.equal(result.translation,"Buenos días");
 assert.equal(observed.url,"https://api.openai.com/v1/chat/completions");
 assert.equal(observed.model,"gpt-4.1-mini");
 assert.match(observed.system,/English into Spanish/);
});
test("Spanish owner translates back to English",async()=>{
 const result=await translateDirect("Hola, ¿cómo estás?","es-ES","en-US",{key,fetcher:successful("Hello, how are you?")});
 assert.equal(result.translation,"Hello, how are you?");
});
test("missing Render credentials never calls model or announces success",async()=>{
 let called=false;
 const result=await translateDirect("Hello","en-US","es-ES",{
  key:"",fetcher:async()=>{called=true;throw Error("should never call");}
 });
 assert.equal(result.translation,null);
 assert.equal(result.reason,"missing_key");
 assert.equal(called,false);
});
test("provider errors, malformed JSON and numerical drift fail closed",async()=>{
 const provider=await translateDirect("Hi","en-US","es-ES",{key,fetcher:async()=>({ok:false,status:401})});
 assert.equal(provider.reason,"provider_http_401");
 const mismatch=await translateDirect("Two cakes cost $25","en-US","es-ES",{key,fetcher:successful("Dos pasteles cuestan $35")});
 assert.equal(mismatch.reason,"number_mismatch");
 const malformed=await translateDirect("Hi","en-US","es-ES",{key,fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:"invalid"}}]})})});
 assert.equal(malformed.reason,"invalid_json_response");
 assert.equal(numbersPreserved("Price $25.00","Precio $25,00"),true);
});
test("invalid language combinations and oversized speech never spend",async()=>{
 for(const [src,dst,original] of [["en-US","en-US","hello"],["de-DE","es-ES","Hallo"],["en-US","es-ES","X".repeat(501)]]){
  const result=await translateDirect(original,src,dst,{key,fetcher:async()=>{throw Error("must not call")}});
  assert.equal(result.reason,"invalid_input");
 }
});
