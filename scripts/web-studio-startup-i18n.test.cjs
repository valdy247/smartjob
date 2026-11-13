const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app/web-studio/WebBuilderWorkspace.tsx'),'utf8');
const catalog=require('../lib/i18n/messages.json');

test('Puck startup dictionary retains dynamic placeholders in Spanish and English',()=>{
 const tokensSource=source.match(/const puckTokens=\[([\s\S]*?)\] as const;/);
 assert.ok(tokensSource,'a Puck dictionary must be defined');
 const tokens=[...tokensSource[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]);
 assert.ok(tokens.length>50,'the dictionary must cover the editor');
 const variablesSource=source.match(/const puckVariables=\{([\s\S]*?)\};/);
 assert.ok(variablesSource,'Puck translation placeholders must be preserved');
 const variables=Object.fromEntries([...variablesSource[1].matchAll(/([a-z]+):"\{([a-z]+)\}"/g)]
  .map(([,name,placeholder])=>[name,'{'+placeholder+'}']));
 assert.match(source,/interfaceText\(language,`puck\.\$\{token\}`,puckVariables\)/,
  'Do not interpolate Puck labels before the editor supplies title/count/zoom');
 for(const language of ['es','en']){
  const messages=catalog[language];
  for(const token of tokens){
   const template=messages['puck.'+token];
   assert.equal(typeof template,'string',language+' '+token);
   const dynamic=[...template.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match=>match[1]);
   for(const key of dynamic)assert.equal(variables[key],'{'+key+'}',language+' '+token+' '+key);
   const interpolated=template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (_,name)=>Object.hasOwn(variables,name)?variables[name]:(()=>{throw Error('Missing: '+name)})());
   assert.equal(interpolated,template,language+' '+token+' dynamic labels must remain intact');
  }
 }
});
test('logged-out Web Studio links to VMV login with an allow-listed return destination',()=>{
 assert.match(source,/href="\/vista-app\?returnTo=web-studio"/);
 const login=fs.readFileSync(path.join(root,'app/vista-app/page.tsx'),'utf8');
 assert.match(login,/destination==="web-studio"&&phase==="signed_in"&&user/);
 assert.match(login,/window\.location\.replace\("\/web-studio"\)/);
});
