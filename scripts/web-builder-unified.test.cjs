const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),oldResolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...extra){return oldResolve.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...extra);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
  jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=(mod)=>{mod.exports={};};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
const {normalizeBuilderDocument}=require('../lib/web-builder-puck.tsx');
const {applyPublishedConnections}=require('../lib/web-builder-live-catalog.ts');
const {accessibleAccent,onAccent,contrast,colorsAreDistinct}=require('../lib/web-builder-contrast.ts');
const {applyChosenSiteDesign,createSiteProposals}=require('../lib/web-builder-templates.ts');
const sharedImage='https://test.supabase.co/storage/v1/object/public/smartjob-web-images/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';
const node=(id,title,items)=>({type:'OfferingGrid',props:{id,title,items,showPrices:'no'}});
const product=(id,title,image='')=>({id,title,description:'',image,alt:title,price:'$12.00'});
const doc=()=>normalizeBuilderDocument({content:[
 node('connected-catalog','Productos',[product('p1','Chocolate'),product('p2','Bocaditos')]),
 node('connected-services','Servicios',[product('s1','Catering')])
]});
test('live catalog updates only its own cards by stable IDs',()=>{
 const source=doc();
 const result=applyPublishedConnections(source,[product('p2','Bocaditos'),product('p1','Chocolate',sharedImage)],
  [product('s1','Catering'),product('s2','Entregas')]);
 const [products,services]=result.content.map(x=>x.props);
 assert.deepEqual(products.items.map(x=>x.id),['p2','p1']);
 assert.equal(products.items[1].image,sharedImage);
 assert.deepEqual(services.items.map(x=>x.id),['s1','s2']);
 assert.deepEqual(source.content[0].props.items.map(x=>x.id),['p1','p2'],
  'a new publication view must not modify the editor draft');
});
test('deletion of one product never removes another occurrence or a service',()=>{
 const original=doc();
 const result=applyPublishedConnections(original,[product('p2','Bocaditos')],[product('s1','Catering')]);
 assert.deepEqual(result.content[0].props.items.map(x=>x.id),['p2']);
 assert.equal(result.content[1].props.items[0].id,'s1');
 assert.equal(original.content[0].props.items.length,2);
});
test('services can be connected without products and preserve original sections',()=>{
 const source=normalizeBuilderDocument({content:[node('connected-services','Servicios',[])]});
 const result=applyPublishedConnections(source,null,[product('s1','Servicio nuevo')]);
 assert.equal(result.content.length,1);
 assert.equal(result.content[0].props.items[0].title,'Servicio nuevo');
});
test('duplicate colors are rejected and every chosen accent has readable foreground',()=>{
 assert.equal(colorsAreDistinct(['#FFFFFF','#000000','#ff0000']),true);
 assert.equal(colorsAreDistinct(['#ffffff','#FFFFFF','#ff0000']),false);
 for(const color of ['#ffffff','#f8eacf','#ffdd00','#c0ddea','#000000','#ff0000','#50ed9f']){
  const chosen=accessibleAccent(color);
  assert.ok(contrast(chosen,'#ffffff')>=4.49,color+' must be legible on light sections');
  assert.ok(contrast(chosen,onAccent(chosen))>=4.49,color+' must keep CTA text readable');
 }
});
test('customer visual choices are applied to one editable proposal without changing owner catalog',()=>{
 const intake={business:'Repostería de prueba',categoryId:'bakery',offering:'both',objective:'orders',
  phone:'',email:'',city:'',about:'',logo:'',photos:[],socials:{},
  offerings:['Servicio A'],products:[product('p1','Producto A')],
  design:{colors:['#fbe0d5','#f3c2ab','#523a60'],font:'luxury',imageStyle:'square',
   features:{inventory:true,booking:false,chat:true},chatMode:'inbox'}};
 const proposal=createSiteProposals(intake)[0];
 const result=applyChosenSiteDesign(proposal.data,intake.design);
 assert.equal(result.root.props.font,'luxury');
 assert.equal(result.root.props.chatMode,'inbox');
 assert.equal(result.root.props.accentColor,'#fbe0d5');
 assert.equal(intake.products[0].id,'p1');
});
test('web creation persists both connection flags for the selected workspace',()=>{
 const source=fs.readFileSync(path.join(root,'app/web-studio/WebBuilderWorkspace.tsx'),'utf8');
 assert.match(source,/inventory_connection_enabled:Boolean\(intake\.connectInventory/);
 assert.match(source,/services_connection_enabled:Boolean\(intake\.connectServices/);
 assert.match(source,/workspace\.central_business_id!==intake\.sourceBusinessId/);
 const page=fs.readFileSync(path.join(root,'app/web/[slug]/[[...page]]/page.tsx'),'utf8');
 assert.match(page,/publishedBuilderServices\(slug\)/);
 assert.match(page,/applyPublishedConnections/);
});
