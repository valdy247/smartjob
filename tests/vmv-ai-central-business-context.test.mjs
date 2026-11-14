import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Transpile the actual production helper; stub only the shared categories import.
// This test does not use credentials, a database, a web request, or a phone number.
const source=readFileSync(new URL("../lib/vmv-ai-agents/central-public-context.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const exports={};
vm.runInNewContext(js,{exports,require(name){
 if(name==="@/lib/vmv-business-categories")
  return {BUSINESS_CATEGORIES:[{id:"bakery",label:"Panadería y repostería"}]};
 throw Error("Unexpected dependency: "+name);
}}, {filename:"central-public-context.js",timeout:1200});
const {approvedCentralSnapshot,publicMarketingWeek}=exports;
const sample=()=>({
 id:"central-1",name:"Authorized bakery",category_id:"bakery",
 description:"Custom orders",country:"US",city:"Columbus",region:"Georgia",
 service_areas:"Columbus",website_url:"https://example.com",
 booking_url:"https://example.com/booking",hours_enabled:true,
 hours:Array.from({length:7},(_,i)=>({closed:i>=5,start:"09:00",end:"17:00"})),
 updated_at:"2026-11-14T10:00:00Z",
 street:"SECRET HOUSE STREET",unit:"SECRET HOME UNIT",postal:"SECRET ZIP",
 legal_name:"SECRET LEGAL NAME",phone:"SECRET PERSONAL PHONE",
 email:"SECRET EMAIL",internal_notes:"SECRET STAFF NOTE"
});
test("central snapshot excludes private and administrative fields",()=>{
 const original={configuration:{channel:"Teléfono",call_disclosure:"Sí",custom_rule:"No discounts"},agent_revision:6};
 const enriched=approvedCentralSnapshot(original,sample());
 const text=JSON.stringify(enriched);
 for(const forbidden of ["SECRET HOUSE STREET","SECRET HOME UNIT","SECRET ZIP",
  "SECRET LEGAL NAME","SECRET PERSONAL PHONE","SECRET EMAIL","SECRET STAFF NOTE"])
  assert.equal(text.includes(forbidden),false);
 assert.equal(enriched.configuration.business_name,"Authorized bakery");
 assert.equal(enriched.configuration.industry,"Panadería y repostería");
 assert.equal(enriched.configuration.custom_rule,"No discounts");
 assert.equal(enriched.agent_revision,6);
 assert.equal(enriched.central_profile_version,"2026-11-14T10:00:00Z");
});
test("business hours are mapped Monday-first without inventing closed days",()=>{
 const week=publicMarketingWeek(sample());
 assert.equal(week.h_mon_active,"Sí");
 assert.equal(week.h_fri_active,"Sí");
 assert.equal(week.h_sat_active,"No");
 assert.equal(week.h_sun_active,"No");
 assert.equal(week.h_mon_open,"09:00");
 const disabled=sample();disabled.hours_enabled=false;
 assert.equal(publicMarketingWeek(disabled),null);
});
test("invalid public hours fail closed",()=>{
 const bad=sample();bad.hours[0]={closed:false,start:"25:00",end:"17:00"};
 assert.equal(publicMarketingWeek(bad),null);
});
test("unlinked legacy pilot snapshot stays unchanged",()=>{
 const original={name:"Existing phone pilot",configuration:{business_name:"Pilot"}};
 assert.equal(approvedCentralSnapshot(original,null),original);
});

test("withdrawn Marketing details are absent from the next phone snapshot",()=>{
 const original={agent_revision:8,configuration:{
  channel:"Teléfono",call_disclosure:"Sí",custom_rule:"Keep responses short",
  industry:"Old category",business_description:"Old description",
  city:"Old city",state:"Old region",service_areas:"Old area",
  website:"https://old.example",booking_url:"https://old.example/book",
  country:"Estados Unidos",h_mon_active:"Sí",
  h_mon_open:"08:00",h_mon_close:"20:00"
 }};
 const revised=sample();
 revised.category_id="other";
 revised.description=null;
 revised.city="";
 revised.region="";
 revised.service_areas="";
 revised.website_url=null;
 revised.booking_url="";
 revised.country="CA";
 revised.hours_enabled=false;
 revised.hours=null;
 const result=approvedCentralSnapshot(original,revised);
 for(const key of ["industry","business_description","city","state","service_areas",
  "website","booking_url","country","h_mon_active","h_mon_open","h_mon_close"])
  assert.equal(Object.hasOwn(result.configuration,key),false,key+" was retained");
 assert.equal(result.configuration.business_name,"Authorized bakery");
 assert.equal(result.configuration.custom_rule,"Keep responses short");
 assert.equal(result.configuration.channel,"Teléfono");
 assert.equal(result.agent_revision,8);
});
