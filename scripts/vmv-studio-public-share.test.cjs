const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const path="lib/vmv-studio-video-sharing.ts";
const source=fs.readFileSync(path,"utf8");
const output=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const owner="3f25f16e-9798-4b46-9310-d64dd0ee55d3";
const jobId="07a3228d-3c6d-4a69-b4e6-1afdd350714b";
const token="a".repeat(64);
const dbState={
 vmv_studio_jobs:[{id:jobId,owner_id:owner,status:"completed",
  output_path:owner+"/"+jobId+"/video-final.mp4",title:"Video de prueba"}],
 vmv_studio_video_shares:[{job_id:jobId,owner_id:owner,token}]
};
let storageCalls=[];
const db={
 from(table){
  const conditions=[];
  const query={
   select(){return query;},
   eq(key,value){conditions.push([key,value]);return query;},
   async maybeSingle(){return {data:(dbState[table]||[]).find(row=>conditions.every(([k,v])=>row[k]===v))||null,error:null};}
  };
  return query;
 },
 storage:{from(name){return {
  async createSignedUrl(file,seconds,options){
   storageCalls.push({bucket:name,file,seconds,options});
   return {data:{signedUrl:"https://example.supabase.co/storage/v1/object/sign/"+name+"/"+file+"?token=temp"},error:null};
  }
 };}}
};
const moduleObj={exports:{}};
vm.runInNewContext(output,{
 module:moduleObj,exports:moduleObj.exports,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co"}},
 Buffer,require:(name)=>name==="node:crypto"?require("node:crypto"):
  name==="@/lib/vmv-video-generator"?{videoDb:()=>db,validUuid:()=>true}:
  (()=>{throw Error("Unknown module "+name)})()
},{timeout:3000});
const sharing=moduleObj.exports;

test("public tokens have 256 bits of entropy and cannot be guessed from a job UUID",()=>{
 const a=sharing.newShareToken(),b=sharing.newShareToken();
 assert.match(a,/^[a-f0-9]{64}$/);
 assert.notEqual(a,b);
 assert.equal(sharing.validVideoShareToken(""),false);
 assert.equal(sharing.validVideoShareToken(jobId),false);
 assert.equal(sharing.validVideoShareToken("../"+token),false);
 assert.equal(sharing.sharePath(a),"/v/"+a);
});
test("only completed owned MP4s can be retrieved by public share token",async()=>{
 assert.equal((await sharing.publicSharedVideo(token)).title,"Video de prueba");
 dbState.vmv_studio_jobs[0].status="failed";
 assert.equal(await sharing.publicSharedVideo(token),null);
 dbState.vmv_studio_jobs[0].status="completed";
 dbState.vmv_studio_jobs[0].output_path="outside/someone-else.mp4";
 assert.equal(await sharing.publicSharedVideo(token),null);
 dbState.vmv_studio_jobs[0].output_path=owner+"/"+jobId+"/video-final.mp4";
 assert.equal(await sharing.publicSharedVideo("b".repeat(64)),null);
});
test("private storage signed links are short-lived, and download uses attachment filename",async()=>{
 storageCalls=[];
 const link=await sharing.signedSharedVideo(token,true);
 assert.ok(link.startsWith("https://example.supabase.co/"));
 assert.equal(storageCalls.length,1);
 assert.equal(storageCalls[0].bucket,"vmv-studio-assets");
 assert.equal(storageCalls[0].seconds,600);
 assert.match(storageCalls[0].options.download,/^vmv-video-[a-f0-9]{8}\.mp4$/);
});
test("public page has no login and gives guests a player and MP4 download",()=>{
 const page=fs.readFileSync("app/v/[token]/page.tsx","utf8");
 const file=fs.readFileSync("app/api/video-studio/public/[token]/file/route.ts","utf8");
 const ownerApi=fs.readFileSync("app/api/video-studio/shares/route.ts","utf8");
 assert.doesNotMatch(page,/authenticatedUser|VMVAuthGateway|signIn\(/);
 assert.match(page,/<video/);
 assert.match(page,/\?download=1/);
 assert.match(page,/robots:\{index:false,follow:false/);
 assert.match(file,/signedSharedVideo\(token,download\)/);
 assert.match(ownerApi,/await authenticatedUser\(req\)/);
 assert.match(ownerApi,/confirmPublicSharing!==true/);
 assert.match(ownerApi,/eq\("owner_id",owner\)/);
 assert.match(ownerApi,/async function DELETE|export async function DELETE/);
 assert.match(ownerApi,/error\.code!=="23505"/);
});
test("library lets users create, copy, send and deactivate public links",()=>{
 const library=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const ui=fs.readFileSync("app/vista-app/video-studio/VideoShareControls.tsx","utf8");
 assert.match(library,/item\.status==="completed"\?<VideoShareControls/);
 assert.match(library,/jobId=\{job\.id\} request=\{api\}/);
 assert.match(ui,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(ui,/navigator\.share/);
 assert.match(ui,/confirmPublicSharing:true/);
 assert.match(ui,/request\("shares\?id="\+encodeURIComponent\(jobId\),"DELETE"\)/);
 assert.doesNotMatch(ui,/localStorage|service_role/);
});
test("SQL share table is private with row-level security and no anonymous SELECT",()=>{
 const migration=fs.readFileSync("supabase/migrations/20261124220000_vmv_studio_video_public_shares.sql","utf8");
 assert.match(migration,/alter table public\.vmv_studio_video_shares enable row level security/i);
 assert.match(migration,/revoke all on table public\.vmv_studio_video_shares from public, anon, authenticated/i);
 assert.match(migration,/grant select, insert, delete on table public\.vmv_studio_video_shares to service_role/i);
 assert.match(migration,/token text not null unique/);
});
