/**
 * Strict, Marketing-only regression gate for untranslated JSX and accessibility strings.
 * Existing translations are catalog-based; published customer content is out of scope.
 * This covers static JSX/props only, NOT runtime API errors, user content, or dependencies.
 */
import ts from "typescript";
import {readdirSync,readFileSync} from "node:fs";
import path from "node:path";
const scope="app/vista-app/marketing";
const root=process.cwd();
const neutral=[
 /^VMV(?: Business)?$/i,/^VMV Business · Marketing Studio$/i,
 /^Google Business Profile$/i,/^PageSpeed Insights$/i,
 /^Google$/i,/^SEO$/i,/^ROAS$/i,/^WhatsApp$/i,
 /^GitHub$/i,/^GitLab$/i,/^Bitbucket$/i,
 /^Apple Maps$/i,/^Bing Places$/i,/^Yelp$/i,/^Logo$/i,
 /^Columbus$/i,/^Georgia$/i,/^US$/i,/^USA$/i,
 /^https?:\/\//i,/^www\./i,/^\+?[\d\s().:/#%–—+-]+$/u,
 /^[\p{P}\p{S}\s]+$/u
];
const allow=(str)=>str.length<3||neutral.some(re=>re.test(str))||!/[\p{L}]/u.test(str);
const candidates=[];
function walk(dir){
 for(const item of readdirSync(path.join(root,dir),{withFileTypes:true})){
  const file=path.posix.join(dir,item.name);
  if(item.isDirectory()){walk(file);continue;}
  if(!item.name.endsWith(".tsx")||item.name.endsWith(".test.tsx"))continue;
  const code=readFileSync(path.join(root,file),"utf8"),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function add(node,kind,source){
   const value=source.replace(/\s+/g," ").trim();
   if(allow(value))return;
   candidates.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,kind,value:value.slice(0,150)});
  }
  function visit(node){
   if(ts.isJsxText(node))add(node,"visible",node.getText(ast));
   if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)&&
       ["placeholder","title","aria-label","aria-description","alt","label","hint"].includes(node.name.text))
       add(node,"attribute:"+node.name.text,node.initializer.text);
   if(ts.isJsxExpression(node)&&node.expression&&ts.isStringLiteral(node.expression))add(node,"visible-expression",node.expression.text);
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
}
walk(scope);
const byFile=Object.entries(candidates.reduce((acc,x)=>{acc[x.file]=(acc[x.file]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);
console.log(JSON.stringify({module:"Marketing",untranslatedStaticCandidates:candidates.length,byFile,findings:candidates},null,2));
console.error("MARKETING_I18N_AUDIT="+JSON.stringify({total:candidates.length,byFile}));

/** Guard the exact customer-facing areas that previously mixed ES/EN. */
const catalog=JSON.parse(readFileSync(path.join(root,"lib/i18n/messages.json"),"utf8"));
const action=readFileSync(path.join(root,scope,"MarketingActionCenter.tsx"),"utf8");
const homepage=readFileSync(path.join(root,scope,"page.tsx"),"utf8");
const mixedLanguageRegressionKeys=[
 "marketing.ui.requestFree","marketing.ui.tracking","marketing.ui.requests",
 "marketing.ui.refresh","marketing.ui.loginEmpty","marketing.ui.loading",
 "marketing.ui.empty","marketing.ui.emptyHint","marketing.ui.external",
 "marketing.ui.moreTools","marketing.ui.footer",
 "marketing.service.google_profile.name","marketing.service.seo_improvement.name",
 "marketing.service.review_strategy.name"
];
const regressions=[];
for(const key of mixedLanguageRegressionKeys){
 const source=key==="marketing.ui.moreTools"||key==="marketing.ui.footer"?homepage:action;
 for(const locale of ["es","en"]){
  if(typeof catalog[locale]?.[key]!=="string"||!catalog[locale][key].trim())
   regressions.push(key+": missing "+locale+" translation");
 }
 if(!source.includes('translate("'+key+'")'))
  regressions.push(key+": translated reference missing from customer-facing UI");
}
if(/const errorMessage\s*=\s*[^;]*\.message/.test(action))
 regressions.push("API exception messages may leak an untranslated server-language error");
if(!action.includes("const [contentLanguage]=useState(language)")||
   !homepage.includes("const [contentLanguage]=useState(language)"))
 regressions.push("Customer-facing draft language should remain independent of UI switch");
console.error("MARKETING_I18N_REGRESSIONS="+JSON.stringify(regressions));
if(regressions.length)process.exitCode=1;

// New untranslated static UI copy in Marketing is a CI/build regression.
// This scope is clean; debt in other VMV modules remains separately tracked.
if(candidates.length)process.exitCode=1;
