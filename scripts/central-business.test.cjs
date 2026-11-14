const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs"),ts=require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {centralBusinessDefaults,businessGoogleSeed,mergeGoogleWithBusiness,applyProfileEditsToGoogle,googleChangesForProfile,businessRequestSnapshot,centralBusinessWritePayload}=require("../lib/vmv-central-business.ts");

const business=(kind="storefront")=>({
 id:"5d98ee01-c48e-410d-801e-bdd0c99a595f",owner_id:"e30ea843-0a84-461f-b17d-f645bf0e36d2",
 ...centralBusinessDefaults("Test Bakery","bakery","testbakery.com"),
 kind,phone:"7065551234",description:"A local bakery",services:"Cakes",products:"Pastries",
 street:"45 Private St",city:"Columbus",region:"Georgia",postal:"31901",
 service_areas:"Columbus",logo_path:"e30ea843-0a84-461f-b17d-f645bf0e36d2/5d98ee01-c48e-410d-801e-bdd0c99a595f/logo/photo.png",
 gallery_paths:[],hours_enabled:true,hours:Array.from({length:7},(_,i)=>({closed:i>4,start:"09:00",end:"17:00"}))
});
test("Google prefills known profile data without confusing VMV industry with official Google category",()=>{
 const b=business();
 const google=businessGoogleSeed(b);
 assert.equal(google.googleCategory,"");
 assert.equal(google.phone,b.phone);
 assert.equal(google.street,b.street);
 assert.equal(google.hoursEnabled,true);
 assert.equal(google.description,b.description);
});
test("existing manual Google edits are not overwritten by incoming saved profile",()=>{
 const google=businessGoogleSeed(business());
 google.phone="+15551231234";google.googleCategory="Official cake shop";
 const updated=mergeGoogleWithBusiness(google,business());
 assert.equal(updated.phone,"+15551231234");
 assert.equal(updated.googleCategory,"Official cake shop");
});
test("service area snapshot does not disclose a private residence even when the profile stores it",()=>{
 const b=business("service_area"),g=businessGoogleSeed(b);
 const snap=businessRequestSnapshot(b,"google_profile",g);
 assert.equal(JSON.stringify(snap).includes("45 Private St"),false);
 assert.equal(snap.location.addressPublic,false);
 assert.equal(b.street,"45 Private St");
});
test("public Google storefront does not modify private central profile visibility",()=>{
 const b=business("storefront"),g=businessGoogleSeed(b);
 const snap=businessRequestSnapshot(b,"google_profile",g);
 assert.equal(snap.location.addressPublic,true);
 assert.equal(b.address_visibility,"private");
});
test("Google edits do not wipe stored private street for service-area businesses",()=>{
 const b=business("service_area"),g=businessGoogleSeed(b);
 const changes=googleChangesForProfile(b,g);
 assert.equal(Object.hasOwn(changes,"street"),false);
 assert.equal(changes.address_visibility,"private");
});
test("approved request snapshot survives subsequent profile changes",()=>{
 const b=business(),snap=businessRequestSnapshot(b,"google_profile",businessGoogleSeed(b));
 b.description="New description";b.logo_path=null;
 assert.equal(snap.description,"A local bakery");
 assert.equal(snap.mediaPaths.length,1);
});
test("editable business fields are explicitly whitelisted",()=>{
 const b={...business(),created_at:"forged",source:"agent",country:"us"};
 const payload=centralBusinessWritePayload(b);
 assert.equal(payload.country,"US");assert.equal(payload.website_url,"https://testbakery.com/");
 assert.equal(Object.hasOwn(payload,"created_at"),false);
 assert.equal(Object.hasOwn(payload,"source"),false);
 assert.equal(Object.hasOwn(payload,"owner_id"),false);
});

test("only profile fields explicitly changed in checkout overwrite corresponding Google data",()=>{
 const before=business(),after={...before,phone:"7065555678"};
 const google=businessGoogleSeed(before);google.description="Custom description for this request";
 const result=applyProfileEditsToGoogle(google,before,after);
 assert.equal(result.phone,"7065555678");
 assert.equal(result.description,"Custom description for this request");
});
