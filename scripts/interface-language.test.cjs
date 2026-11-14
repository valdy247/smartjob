const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,path);
const {visitorLanguage,interfaceLanguage,formatInterfaceCurrency:formatMoney,t:translate,authErrorKey}=require('../lib/i18n.ts');
const detectLanguage=locale=>visitorLanguage(null,locale);
const resolveLanguage=(account,local,locale)=>interfaceLanguage(account)||visitorLanguage(local,locale);
const catalog=require('../lib/i18n/messages.json');
const messages=Object.fromEntries(Object.keys(catalog.es).map(key=>[key,{es:catalog.es[key],en:catalog.en[key]}]));
const {LanguagePreference}=require('../lib/i18n-preference.ts');
function fixture({account,local=null,locale='en-US',signedIn=true,failSave=false}={}){
 let user=signedIn?{id:'a',user_metadata:{owner_language:'es',customer_language:'en',business_name:'Mi Bakery',...(account?{ui_language:account}:{})}}:null;
 let stored=local;const writes=[];
 const auth={getUser:async()=>({data:{user},error:null}),updateUser:async({data})=>{
  writes.push(data);if(failSave)return {data:{user},error:Error('offline')};
  user={...user,user_metadata:{...user.user_metadata,...data}};return {data:{user},error:null};
 }};
 const storage={read:async()=>stored,write:async value=>{stored=value;}};
 return {preference:new LanguagePreference(auth,storage,locale),auth,storage,writes,user:()=>user,setUser:value=>{user=value;},stored:()=>stored};
}
test('all Spanish variants resolve to Spanish; other locales to English',()=>{
 for(const locale of ['es','es-US','es-419','ES_es'])assert.equal(detectLanguage(locale),'es');
 for(const locale of ['en-US','pt','fr-CA',null])assert.equal(detectLanguage(locale),'en');
});
test('account preference has priority over local choice and locale',()=>{
 assert.equal(resolveLanguage('en','es','es-CU'),'en');
 assert.equal(resolveLanguage(undefined,'es','en-US'),'es');
 assert.equal(resolveLanguage('fr',null,'es-CU'),'es');
});
test('catalog has both languages and matching interpolation variables',()=>{
 for(const [key,entry] of Object.entries(messages)){
  assert.deepEqual(Object.keys(entry).sort(),['en','es'],key);
  for(const language of ['es','en'])assert.ok(entry[language].trim(),key);
  const vars=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  assert.deepEqual(vars(entry.es),vars(entry.en),key);
 }
});
test('missing keys and variables fail validation, not a visible key fallback',()=>{
 assert.throws(()=>translate('en','missing.key'),/Missing interface translation/);
 assert.throws(()=>translate('en','signup.progress'),/Missing translation variable/);
 assert.equal(translate('en','signup.progress',{step:2,total:4}),'Step 2 of 4');
});
test('money formatting never converts amounts or currencies',()=>{
 for(const language of ['es','en'])assert.equal(formatMoney(language,1234.50,'USD'),'$1,234.50');
});
test('visitor language persists with no account writes',async()=>{
 const f=fixture({signedIn:false,locale:'es-CU'});await f.preference.refresh();
 assert.equal(f.preference.getSnapshot().language,'es');
 await f.preference.choose('en');await f.preference.refresh();
 assert.equal(f.preference.getSnapshot().language,'en');assert.equal(f.writes.length,0);
});
test('existing account initializes once, without changing speech or user content',async()=>{
 const f=fixture({local:'en',locale:'es'});await f.preference.refresh();await f.preference.refresh();
 assert.deepEqual(f.writes,[{ui_language:'en'}]);
 assert.equal(f.user().user_metadata.owner_language,'es');assert.equal(f.user().user_metadata.business_name,'Mi Bakery');
});
test('saved account wins on another device and after reload',async()=>{
 const f=fixture({account:'es',local:'en'});await f.preference.refresh();await f.preference.choose('en');
 const other=new LanguagePreference(f.auth,{read:async()=>'es',write:async()=>{}},'es-CU');
 await other.refresh();assert.equal(other.getSnapshot().language,'en');
});
test('rapid selections serialize and the last explicit selection wins',async()=>{
 const f=fixture({account:'es'});await f.preference.refresh();
 await Promise.all([f.preference.choose('en'),f.preference.choose('es'),f.preference.choose('en')]);
 assert.equal(f.preference.getSnapshot().language,'en');assert.equal(f.user().user_metadata.ui_language,'en');
 assert.equal(f.preference.getSnapshot().saving,false);
});
test('failed account save is visible and does not pretend to persist',async()=>{
 const f=fixture({account:'es',failSave:true});await f.preference.refresh();await f.preference.choose('en');
 assert.equal(f.preference.getSnapshot().language,'en');assert.equal(f.preference.getSnapshot().error,'save');
 assert.equal(f.user().user_metadata.ui_language,'es');
});
test('storage failure does not block a valid account preference',async()=>{
 const f=fixture({account:'es'});const p=new LanguagePreference(f.auth,{read:async()=>{throw Error();},write:async()=>{throw Error();}},'en');
 await p.refresh();assert.equal(p.getSnapshot().ready,true);assert.equal(p.getSnapshot().language,'es');
});
test('failed account lookup keeps interface gated instead of flashing local language',async()=>{
 const p=new LanguagePreference({getUser:async()=>({data:{user:null},error:Error('offline')}),updateUser:async()=>{throw Error();}},{read:async()=>'en',write:async()=>{}},'es');
 await p.refresh();assert.equal(p.getSnapshot().ready,false);assert.equal(p.getSnapshot().error,'load');
});
test('late account reads cannot overwrite an explicit selection',async()=>{
 const f=fixture({account:'es'});await f.preference.refresh();
 let finish;const original=f.auth.getUser;f.auth.getUser=()=>new Promise(resolve=>{finish=resolve;});
 const refresh=f.preference.refresh();await new Promise(resolve=>setImmediate(resolve));
 f.auth.getUser=original;await f.preference.choose('en');finish({data:{user:{id:'a',user_metadata:{ui_language:'es'}}},error:null});await refresh;
 assert.equal(f.preference.getSnapshot().language,'en');
});
test('technical authentication errors map to comprehensible keys',()=>{
 assert.equal(authErrorKey({code:'invalid_credentials'}),'auth.invalidCredentials');
 assert.equal(authErrorKey({message:'secret stack trace'}),'auth.error');
});
test('sign-out and sign-in keep the account preference authoritative',async()=>{
 const f=fixture({account:'es'});await f.preference.refresh();await f.preference.choose('en');
 const account=f.user();f.setUser(null);await f.preference.signedOut();
 assert.equal(f.preference.getSnapshot().language,'en');
 f.setUser(account);await f.preference.refresh();assert.equal(f.preference.getSnapshot().language,'en');
});
test('switching accounts gates the previous account language until the new read finishes',async()=>{
 const f=fixture({account:'es'});await f.preference.refresh();
 f.preference.accountChanged('b');assert.equal(f.preference.getSnapshot().ready,false);
 f.setUser({id:'b',user_metadata:{ui_language:'en'}});await f.preference.refresh();
 assert.equal(f.preference.getSnapshot().language,'en');assert.equal(f.preference.getSnapshot().ready,true);
});
test('slow local storage writes cannot leave an older visitor choice as the final value',async()=>{
 let stored=null;let release;
 const p=new LanguagePreference(null,{read:async()=>stored,write:async value=>{
  if(value==='es')await new Promise(resolve=>{release=resolve;});stored=value;
 }},'en');
 await p.refresh();const first=p.choose('es');const last=p.choose('en');
 await new Promise(resolve=>setImmediate(resolve));release();await Promise.all([first,last]);
 assert.equal(stored,'en');assert.equal(p.getSnapshot().language,'en');
});

test('Smart Call signed-out screen uses the account locale for all entry copy',()=>{
 const page=fs.readFileSync(require('node:path').join(__dirname,'../app/vista-app/page.tsx'),'utf8');
 const login=page.split('{phase==="signed_out"?')[1]?.split('{phase==="signed_in"&&!profile?')[0];
 assert.ok(login,'signed-out screen must exist');
 for(const key of ['native.secureAccess','native.signInExplanation','native.emailPlaceholder',
  'native.passwordPlaceholder','native.signInPrivacy','native.registerPrompt','common.loginError']){
  assert.ok(login.includes('translate("'+key+'")'),key+' must render via the shared language controller');
 }
 for(const raw of ['ACCESO SEGURO','Inicia sesión con la misma cuenta','Tu contraseña',
  'Sesión protegida por Supabase','¿No tienes cuenta? Abrir registro']){
  assert.ok(!login.includes(raw),'untranslated signed-out copy: '+raw);
 }
 assert.ok(login.includes('value={email}')&&login.includes('value={password}'),
  'language toggles must not replace controlled credentials');
 assert.ok(!login.includes('<InterfaceLanguagePicker'), 'language control must not occupy a form card');
});
test('Smart Call header owns the compact accessible flag switch',()=>{
 const page=fs.readFileSync(require('node:path').join(__dirname,'../app/vista-app/page.tsx'),'utf8');
 const picker=fs.readFileSync(require('node:path').join(__dirname,'../components/InterfaceLanguagePicker.tsx'),'utf8');
 const header=page.split('styles.appHeaderIdentity')[1]?.split('<div className={styles.scrollArea}')[0];
 assert.ok(header?.includes('<InterfaceLanguagePicker compact/>'),'flag switch must be beside the brand in header');
 assert.match(picker,/role="radiogroup"/);
 assert.match(picker,/role="radio"/);
 assert.match(picker,/<svg /,'flags must render as actual graphics, not unsupported emoji glyphs');
 assert.ok(!picker.includes('localStorage.setItem'),'picker must use VMV account preference');
 assert.ok(!page.includes('key={language}'),'language switching must not remount the input form');
});
test('Smart Call first-screen catalog has distinct Spanish and English copy',()=>{
 const catalog=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../lib/i18n/messages.json'),'utf8'));
 const keys=['native.secureAccess','native.signInExplanation','native.signInPrivacy','native.registerPrompt',
  'native.checkingSession','native.supabaseMissing','native.profileLoading','native.profileError',
  'native.introLead','native.introMinutesTitle','native.introDisclaimer'];
 for(const key of keys){
  assert.equal(typeof catalog.es[key],'string',key+' Spanish');
  assert.equal(typeof catalog.en[key],'string',key+' English');
  assert.notEqual(catalog.es[key],catalog.en[key],key+' must not reuse the wrong language');
  assert.equal(translate('es',key),catalog.es[key]);
  assert.equal(translate('en',key),catalog.en[key]);
 }
});
