const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){return resolve.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...rest)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
}).outputText,file);
require.extensions['.css']=(mod)=>{mod.exports={}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
const {normalizeBuilderDocument,builderConfig}=require('../lib/web-builder-puck.tsx');
const {patchBuilderImage,normalizeImageSettings,imageSettingsStyle,imageTargets,moveBuilderImage,imageDestinations}=require('../lib/web-builder-images.ts');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {Render}=require('@puckeditor/core');
const photo='https://test.supabase.co/storage/v1/object/public/smartjob-web-images/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.jpg';
const settings={imageWidth:62,imageWidthMobile:93,imageRadius:38,imageOpacity:27,imageBorder:4,borderColor:'#D6557B',imageMoveX:245,imageMoveY:19,imageMoveXMobile:0,imageMoveYMobile:7,imageAlign:'center',imageAlignMobile:'right'};
const block=(type,id,props={})=>({type,props:{id,...props}});
const roundtrip=data=>normalizeBuilderDocument(JSON.parse(JSON.stringify(normalizeBuilderDocument(data))));
test('all supported image placements retain styles across serialization and normalization',()=>{
 const data=roundtrip({content:[block('Image','legacy',{url:photo,...settings}),block('HeroVisual','cover',{image:photo,...settings}),block('ComposeImage','compose',{image:photo,...settings}),
  ...['OfferingGrid','PhotoGallery','ProjectShowcase','TeamGrid'].map((type,i)=>block(type,'grid-'+i,{items:[{image:photo,...settings}]})),
  block('BeforeAfter','compare',{beforeImage:photo,afterImage:photo,beforeImageSettings:settings,afterImageSettings:{...settings,imageWidth:44}})]});
 for(const node of data.content){
  for(const target of imageTargets(node.type,node.props)){
   const props=target.index!==undefined?node.props.items[target.index]:target.field==='beforeImage'?node.props.beforeImageSettings:target.field==='afterImage'?node.props.afterImageSettings:node.props;
   for(const key of Object.keys(settings))assert.equal(props[key],key==='imageWidth'&&target.field==='afterImage'?44:settings[key],node.type+' '+key);
  }
 }
 assert.deepEqual(roundtrip(data),data);
});
test('removing one reused product photo does not affect its neighbor, cover, or gallery',()=>{
 const original=roundtrip({content:[block('HeroVisual','cover',{image:photo}),block('OfferingGrid','offers',{items:[{title:'First',image:photo},{title:'Second',image:photo}]}),block('PhotoGallery','gallery',{items:[{image:photo}]})]});
 const changed=roundtrip(patchBuilderImage(original,'offers',{field:'image',index:0},{image:''}));
 assert.equal(changed.content[1].props.items[0].image,'');
 assert.equal(changed.content[1].props.items[1].image,photo);
 assert.equal(changed.content[0].props.image,photo);
 assert.equal(changed.content[2].props.items[0].image,photo);
 assert.equal(original.content[1].props.items[0].image,photo,'existing/public snapshot stays immutable');
});
test('before/after edits and removals address only the chosen side',()=>{
 const original=roundtrip({content:[block('BeforeAfter','comparison',{beforeImage:photo,afterImage:photo})]});
 const changed=roundtrip(patchBuilderImage(original,'comparison',{field:'afterImage'},{afterImage:'',imageWidthMobile:70,imageRadius:25}));
 assert.equal(changed.content[0].props.beforeImage,photo);
 assert.equal(changed.content[0].props.afterImage,'');
 assert.equal(changed.content[0].props.afterImageSettings.imageWidthMobile,70);
 assert.equal(changed.content[0].props.beforeImageSettings.imageRadius,16);
});
test('move legacy photo between nested columns, preserve the file and text, reset offsets',()=>{
 const original=roundtrip({content:[block('SectionLayout','section',{content:[block('ColumnsLayout','columns',{columns:'2',left:[block('Image','photo',{url:photo,...settings})],right:[block('ComposeText','text',{text:'Keep this'})],third:[]})]})]});
 const moved=roundtrip(moveBuilderImage(original,'photo','columns','right'));
 const columns=moved.content[0].props.content[0].props;
 assert.equal(columns.left.length,0);
 assert.equal(columns.right[0].props.text,'Keep this');
 assert.equal(columns.right[1].props.url,photo);
 assert.equal(columns.right[1].props.imageMoveX,0);
 assert.equal(columns.right[1].props.imageWidthMobile,93);
 assert.equal(original.content[0].props.content[0].props.left.length,1);
 assert.equal(imageDestinations(original).some(d=>d.slot==='third'),false);
 assert.equal(moveBuilderImage(original,'photo','columns','third'),original);
 assert.equal(moveBuilderImage(original,'photo','missing','content'),original);
});
test('normalization rejects unsafe values and defaults mobile offsets independently',()=>{
 const p=normalizeImageSettings({imageWidth:Infinity,imageMoveX:NaN,borderColor:'url(javascript:bad)',imageAlign:'bad',imageWidthMobile:-10,imageMoveYMobile:90000});
 assert.equal(p.imageWidth,100);assert.equal(p.imageMoveX,0);assert.equal(p.borderColor,'#30243F');
 assert.equal(p.imageAlign,'left');assert.equal(p.imageWidthMobile,25);assert.equal(p.imageMoveYMobile,2000);
 const style=imageSettingsStyle({imageMoveX:300,imageOpacity:100});
 assert.equal(style['--image-x'],'300px');assert.equal(style['--image-x-mobile'],'0px');assert.equal(style['--image-opacity'],0);
});
test('public renderer uses shared frames, preserves settings and hides removed-photo placeholders',()=>{
 const data=roundtrip({content:[block('Image','legacy',{url:photo,...settings}),block('PhotoGallery','gallery',{items:[{image:photo,...settings},{image:''}]})]});
 const html=renderToStaticMarkup(React.createElement(Render,{config:builderConfig,data}));
 assert.equal((html.match(/class="vmv-managed-image /g)||[]).length,2);
 assert.equal((html.match(/<img /g)||[]).length,2);
 assert.match(html,/--image-width-mobile:93%/);assert.match(html,/--image-x:245px/);
 assert.doesNotMatch(html,/Agregar fotografía|Añade una imagen|vmv-image-tools/);
});
