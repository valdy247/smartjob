const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...rest){
 return resolve.call(this,id.startsWith('@/')?path.join(root,id.slice(2)):id,parent,...rest);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
   jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
 }).outputText,file
);
require.extensions['.css']=(mod)=>{mod.exports={}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
const {buildAiSiteProposal,parseAiSiteResponse,aiSiteRequestContext}=require('../lib/web-builder-ai-site.ts');
const {normalizeBuilderDocument,validateBuilderDocument,builderConfig}=require('../lib/web-builder-puck.tsx');
const {Render}=require('@puckeditor/core');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const photo='https://test.supabase.co/storage/v1/object/public/smartjob-web-images/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp';
const intake={
 business:"Mayuli's Bakery",categoryId:"bakery",offering:"products",objective:"orders",
 phone:"+1 555 222 3333",email:"contact@example.com",city:"Columbus, Georgia",
 about:"Pasteles personalizados y postres por encargo para celebraciones.",
 logo:photo,photos:[photo],offerings:[],
 products:[{id:"product-chocoflan",title:"Choco flan",image:"",description:"Postre con flan y chocolate",price:""},
 {id:"product-cakes",title:"Pasteles personalizados",image:photo,description:"Diseños a pedido",price:""}],
 socials:{instagram:"https://www.instagram.com/mayuli",facebook:"",tiktok:"",youtube:""}
};
const generated={
 design:{variant:"editorial"},seo:{title:"Postres a pedido",description:"Explora pasteles personalizados y postres por encargo de Mayuli's Bakery en Columbus, Georgia. Consulta detalles y pedidos personalizados."},
 hero:{eyebrow:"MAYULI'S BAKERY",title:"Pasteles únicos para tus momentos especiales",description:"Conoce nuestros pasteles personalizados y postres por encargo.",button:"Consultar pedido"},
 sections:{offeringsTitle:"Postres y pasteles",offeringsDescription:"Encuentra opciones para tu celebración.",
 galleryTitle:"Creaciones recientes",aboutTitle:"Sobre nuestra repostería",
 aboutBody:"Preparamos pasteles personalizados y postres por encargo para celebraciones.",
 ctaTitle:"Cuéntanos tu celebración",ctaDescription:"Comparte la fecha y lo que tienes en mente.",
 contactTitle:"Hablemos de tu pedido",contactDescription:"Consulta nuestras opciones."}
};
test('AI generates editable premium draft with unique searchable metadata and no public placeholders',()=>{
 const result=buildAiSiteProposal(intake,generated);
 assert.equal(result.aiGenerated,true);
 assert.ok(result.seoTitle.includes("Mayuli's Bakery"));
 assert.ok(result.seoDescription.includes("Columbus"));
 assert.ok(result.seoDescription.length<=160);
 const normalized=normalizeBuilderDocument(result.data);
 assert.equal(validateBuilderDocument(normalized),null);
 assert.equal(normalized.content.filter(node=>node.type==="HeroVisual").length,1);
 const html=renderToStaticMarkup(React.createElement(Render,{config:builderConfig,data:normalized}));
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.match(html,/Pasteles únicos para tus momentos especiales/);
 assert.doesNotMatch(html,/Agregar fotografía|Nuevo elemento|vmv-image-tools|<script/);
 const contact=normalized.content.find(node=>node.type==="Contact");
 assert.equal(contact.props.phone,intake.phone);
 assert.equal(contact.props.email,intake.email);
 const faq=normalized.content.find(node=>node.type==="FAQList");
 assert.ok(faq&&faq.props.items.length>=1);
});
test('AI keeps catalog photo, text, prices and stable product IDs without positional reuse',()=>{
 const result=buildAiSiteProposal(intake,generated);
 const offers=result.data.content.find(item=>item.type==="OfferingGrid");
 assert.equal(offers.props.items[0].id,"product-chocoflan");
 assert.equal(offers.props.items[0].image,"");
 assert.equal(offers.props.items[1].id,"product-cakes");
 assert.equal(offers.props.items[1].image,photo);
 assert.equal(offers.props.items[1].title,intake.products[1].title);
 assert.equal(result.data.root.props.logo,photo);
 assert.equal(result.data.root.props.socialLinks.instagram,intake.socials.instagram);
 assert.equal(intake.products[0].image,"","owner input is immutable");
});
test('unknown AI design and malformed output cannot silently become a site',()=>{
 assert.throws(()=>buildAiSiteProposal(intake,{seo:{},hero:{},design:{variant:"unknown"}}),/estilo/);
 assert.throws(()=>buildAiSiteProposal(intake,{}),/válido/);
 assert.throws(()=>parseAiSiteResponse("not json"),/incompleta/);
 const value=parseAiSiteResponse('\\`\\`\\`json\n'+JSON.stringify(generated)+'\n\\`\\`\\`');
 assert.equal(value.hero.title,generated.hero.title);
});
test('site generation sends only necessary facts, never image URLs or credentials to the model',()=>{
 const facts=aiSiteRequestContext(intake,"Moderno y claro");
 const payload=JSON.stringify(facts);
 assert.ok(!payload.includes(photo));
 assert.ok(!payload.includes("contact@example.com"));
 assert.ok(!payload.includes("+1 555"));
 assert.ok(payload.includes("Choco flan"));
 assert.equal(facts.direction,"Moderno y claro");
});
test('untrusted text is bounded and HTML is not accepted as Puck source',()=>{
 const raw=structuredClone(generated);
 raw.hero.title="<script>alert(1)</script>"+("A".repeat(450));
 raw.sections.ctaDescription="<p>Consulta el pedido</p>";
 const result=buildAiSiteProposal(intake,raw);
 const hero=result.data.content.find(x=>x.type==="HeroVisual");
 assert.ok(!hero.props.title.includes("<"));
 assert.ok(hero.props.title.length<=104);
 assert.ok(!JSON.stringify(result.data).includes("<script"));
});
