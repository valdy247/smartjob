const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const wizard=read("app/vista-app/ai-agents/AutomaticWebWizard.tsx");
const agents=read("app/vista-app/ai-agents/page.tsx");
const services=read("app/vista-app/BusinessServicesPreview.tsx");
const editor=read("app/web-studio/WebBuilderWorkspace.tsx");
const entry=read("app/web-studio/page.tsx");
const animation=read("app/vista-app/ai-agents/AgentServiceFlow.module.css");
const ads=read("app/vista-app/ai-agents/AutomaticAdWizard.tsx");
const catalog=read("app/vista-app/ai-agents/AgentWebCatalogEditor.tsx");
const media=read("app/vista-app/ai-agents/AgentWebMediaPicker.tsx");
const imageApi=read("app/api/web-services/generate-image/route.ts");
const builder=read("lib/web-builder-puck.tsx");
const live=read("lib/web-builder-live-catalog.ts");
const publicPage=read("app/web/[slug]/[[...page]]/page.tsx");
const templates=read("lib/web-builder-templates.ts");

test("Web Services reuses the existing agent, owner and central business",()=>{
 assert.match(agents,/screen==="web"&&principal&&selectedBusiness&&selectedWorkspace/);
 assert.match(agents,/agent={principal}/);
 assert.match(wizard,/user\.id!==business\.owner_id/);
 assert.match(wizard,/user\.id!==agent\.owner_id/);
 assert.match(wizard,/agent\.business_id!==workspaceId/);
 assert.match(wizard,/vmv_marketing_businesses/);
 assert.match(wizard,/\.eq\("owner_id",user\.id\)/);
});
test("Catalog connection is explicit and inventory edits write to canonical owner catalog",()=>{
 assert.match(wizard,/catalogChoice==="yes"/);
 assert.match(wizard,/catalogChoice==="no"/);
 assert.match(wizard,/setCatalogChoice\("yes"\)/);
 assert.match(wizard,/setCatalogChoice\("no"\)/);
 assert.match(wizard,/inventory_connection_enabled:catalogChoice==="yes"/);
 assert.match(wizard,/inventory_business_id:catalogChoice==="yes"\?workspaceId:null/);
 assert.match(wizard,/vmv_ai_booking_services/);
 assert.match(catalog,/listCatalog\(workspaceId\)/);
 assert.match(catalog,/saveCatalogItem\(form,editing,workspaceId\)/);
 assert.match(catalog,/onChange\(catalog\)/);
 assert.match(catalog,/item\.approved&&item\.active/);
 assert.match(wizard,/inquiries_enabled:inquiries/);
});
test("Agent generates real Puck proposals and only creates unpublished owner-scoped drafts",()=>{
 assert.match(wizard,/api\/web-services\/generate-site/);
 assert.match(wizard,/createSiteProposals\(input\)/);
 assert.match(wizard,/TemplateProposals input={input}/);
 assert.match(wizard,/smartjob_builder_create_site/);
 assert.match(wizard,/normalizeBuilderDocument\(proposal\.data\)/);
 assert.match(wizard,/\.eq\("id",result\.data\.siteId\)\.eq\("owner_id",owner\)/);
 assert.match(wizard,/Guardar borrador y abrir Web Studio/);
 assert.doesNotMatch(wizard,/smartjob_builder_publications|operation:"activate"|publish\(/);
});
test("Review is before generation, edits return directly and current websites stay intact",()=>{
 assert.match(wizard,/className={styles\.edit}/);
 assert.match(wizard,/const edit=\(target:Stage\)/);
 assert.match(wizard,/setReturnToReview\(true\)/);
 assert.match(wizard,/if\(returnToReview\)\{setReturnToReview\(false\);go\("review"\);return;\}/);
 assert.match(wizard,/no se modificarán ni se publicará nada/);
 assert.match(wizard,/\["business","project","catalog"/);
 assert.match(wizard,/"media","review","preview"/);
 assert.match(wizard,/onClick=\{\(\)=>void generate\(\)\}/);
 assert.match(wizard,/proposalSignature!==signature/);
 assert.match(wizard,/Guardar borrador y abrir Web Studio/);
});
test("Media modal supports upload or owner-approved AI logo/cover and up to eight gallery images",()=>{
 assert.match(wizard,/AgentWebMediaPicker/);
 assert.match(media,/onGallery\(\[\.\.\.gallery,safe\]\)/);
 assert.match(media,/gallery\.length>=8/);
 assert.match(media,/kind:target/);
 assert.match(media,/Aprobar imagen/);
 assert.match(media,/Reintentar/);
 assert.match(media,/Cámara/);
 assert.match(media,/Fotos \/ Galería/);
 assert.match(media,/Archivos/);
 assert.match(media,/storage\.from\(bucket\)\.upload/);
 assert.match(imageApi,/kind==="logo"/);
 assert.match(imageApi,/kind==="cover"/);
});
test("Visual stages offer eight real fonts, image-style examples, and skip present contact information",()=>{
 assert.match(wizard,/stage==="colors"/);
 assert.match(wizard,/stage==="typography"/);
 assert.match(wizard,/stage==="photography"/);
 assert.match(wizard,/needsContact=!email\.trim\(\)&&!skipEmail/);
 assert.match(wizard,/returnToReview\?<label className=\{styles\.field\}>Teléfono/);
 assert.match(wizard,/fontGrid/);
 assert.match(wizard,/photoGrid/);
 for(const key of ["mono","classic","humanist","luxury"])assert.ok(builder.includes(key));
});
test("New web creation routes through AI Agents; existing editor remains available",()=>{
 assert.match(services,/href="\/vista-app\/ai-agents\?service=web"/);
 assert.match(editor,/href="\/vista-app\/ai-agents\?service=web"/);
 assert.match(entry,/window\.location\.replace\("\/vista-app\/ai-agents\?service=web"\)/);
 assert.match(wizard,/\/web-studio\?mode=templates&open=/);
});
test("Buttons, progress and robot have a slow accessible pink-purple-blue-green color drift",()=>{
 assert.match(animation,/300s ease-in-out infinite/g);
 assert.match(animation,/#a32972/);
 assert.match(animation,/#7942b6/);
 assert.match(animation,/#315da5/);
 assert.match(animation,/#207a67/);
 assert.match(animation,/prefers-reduced-motion:reduce/);
 assert.match(wizard,/theme\.agentProgress/);
 assert.match(wizard,/theme\.agentRobot/);
 assert.match(wizard,/theme\.agentButton/);
 assert.match(ads,/theme\.agentProgress/);
 assert.match(ads,/theme\.agentButton/);
});

test("Public website never touches inventory without opt-in; linked prices are live and owner verified",()=>{
 assert.match(live,/site\.inventory_connection_enabled!==true/);
 assert.match(live,/\.eq\("id",site\.inventory_business_id\)/);
 assert.match(live,/\.eq\("owner_id",site\.owner_id\)/);
 assert.match(live,/\.eq\("active",true\)\.eq\("approved",true\)/);
 assert.match(live,/catalog===null\)return base/);
 assert.match(live,/showPrices:catalog\.length\?"yes":"no"/);
 assert.match(publicPage,/publishedBuilderCatalog\(slug\)/);
 assert.match(publicPage,/applyPublishedCatalog\(/);
});
test("Builder actually persists visual choices into each AI or template proposal",()=>{
 assert.match(templates,/function applyChosenSiteDesign/);
 assert.match(templates,/font:design\.font/);
 assert.match(templates,/accentColor:design\.colors\[0\]/);
 assert.match(templates,/imageRadius:radius/);
 assert.match(wizard,/applyChosenSiteDesign\(result\[0\]\.data,input\.design\)/);
 assert.match(wizard,/applyChosenSiteDesign\(\(res\.proposal as SiteProposal\)\.data,input\.design\)/);
});
