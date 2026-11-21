const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {NextRequest}=require('next/server');
const uid='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
function fixture({user=uid,results=[],rpcResult={data:{ok:true},error:null}}={}){
 const calls=[],rpcCalls=[];let cursor=0;
 const db={from(table){const index=cursor++;const q={};
  for(const method of ['select','eq','order','range','limit','is','update','or'])q[method]=(...args)=>{calls.push({table,method,args});return q;};
  q.maybeSingle=async()=>results[index]||{data:null,error:null};
  q.then=(resolve,reject)=>Promise.resolve(results[index]||{data:[],error:null}).then(resolve,reject);return q;
 },async rpc(name,args){rpcCalls.push({name,args});return rpcResult;}};
 const src=fs.readFileSync(require.resolve('../app/api/support/route.ts'),'utf8');
 const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};new Function('module','exports','require',compiled)(mod,mod.exports,name=>name==='@/lib/auth-server'?{authenticatedUser:async()=>user}:name==='@/lib/vmv-billing'?{billingAdmin:()=>db}:require(name));
 return {api:mod.exports,calls,rpcCalls};
}
const req=(query='',body)=>new NextRequest('https://vmv.example/api/support'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
test('signed-out requests cannot enumerate cases, read threads or send messages',async()=>{
 const f=fixture({user:null});
 for(const view of ['list','case','thread','history','notifications'])assert.equal((await f.api.GET(req('?view='+view+'&source=marketing&id='+id))).status,401);
 assert.equal((await f.api.POST(req('',{action:'message',source:'marketing',id,message:'Hello',request_key:other}))).status,401);
 assert.equal(f.calls.length,0);assert.equal(f.rpcCalls.length,0);
});
test('case/thread/history enforce owner lookup before reading private case content',async()=>{
 for(const view of ['case','thread','history']){
  const f=fixture({results:[{data:null,error:null}]});const r=await f.api.GET(req('?view='+view+'&source=marketing&id='+id));
  assert.equal(r.status,404);assert.ok(f.calls.some(x=>x.table==='vmv_marketing_requests'&&x.method==='eq'&&x.args[0]==='owner_id'&&x.args[1]===uid));
  assert.ok(f.calls.every(x=>x.table==='vmv_marketing_requests'));
 }
});
test('customer thread excludes internal notes and shared history excludes internal events',async()=>{
 for(const [view,field,value] of [['thread','kind','message'],['history','visibility','shared']]){
  const f=fixture({results:[{data:{id,status:'received'},error:null},{data:[],error:null}]});
  const r=await f.api.GET(req('?view='+view+'&source=marketing&id='+id));assert.equal(r.status,200);
  assert.ok(f.calls.some(x=>x.method==='eq'&&x.args[0]===field&&x.args[1]===value));
  assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 }
});
test('message actor is verified session identity, never client-supplied owner or staff flag',async()=>{
 const f=fixture();const r=await f.api.POST(req('',{action:'message',source:'marketing',id,message:'Please review my profile',request_key:other,owner_id:other,p_actor:other,kind:'internal_note',staff:true}));
 assert.equal(r.status,200);assert.equal(f.rpcCalls.length,1);const c=f.rpcCalls[0];
 assert.equal(c.name,'vmv_admin_append_message');assert.equal(c.args.p_actor,uid);assert.equal(c.args.p_kind,'message');assert.equal(c.args.p_request_key,other);
 assert.equal((await r.json()).notificationSent,false);
});
test('invalid source/id and forbidden or closed cases fail without leaking database errors',async()=>{
 const f=fixture();assert.equal((await f.api.GET(req('?view=thread&source=marketing&id=invalid'))).status,400);
 assert.equal((await f.api.POST(req('',{action:'message',source:'secrets',id,message:'Hi',request_key:other}))).status,400);assert.equal(f.rpcCalls.length,0);
 for(const [message,status] of [['forbidden',403],['case_closed',409],['database connection password SECRET',503]]){
  const x=fixture({rpcResult:{data:null,error:{message}}});const r=await x.api.POST(req('',{action:'message',source:'marketing',id,message:'Hi',request_key:other}));
  assert.equal(r.status,status);assert.ok(!JSON.stringify(await r.json()).includes('SECRET'));
 }
});
