import ts from "typescript";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(path,"utf8");
const main=read("app/vista-app/page.tsx");
const begin=main.indexOf('{ready&&tab==="services"&&!open?');
const end=main.indexOf('{ready&&tab==="calls"?',begin);
if(begin<0||end<=begin)throw Error("Services route boundaries changed; review audit scope");
const route=main.slice(begin,end);
const preview=read("app/vista-app/BusinessServicesPreview.tsx");
const catalog=JSON.parse(read("lib/i18n/messages.json"));
const sources=[
 {name:"Services route",text:"const ServicesAudited=()=> <main>"+route+"</main>;"},
 {name:"BusinessServicesPreview",text:preview}
];
const allowed=[
 /^VMV(?: BUSINESS| Business)?$/i,/^Smart Call$/i,/^AI Agents$/i,
 /^Web Services$/i,/^Web Care$/i,/^Smart Booking$/i,
 /^Google Business Profile$/i,/^Beta$/i,/^SEO$/i,
 /^App iPhone$/i,/^English$/i,/^Español$/i,
 /^\d+$/, /^min$/i,/^USD$/i,/^TEST$/i,
 /^[\p{P}\p{S}\s\d]+$/u
];
const findings=[];
function check(source,node,value,kind){
 const text=value.replace(/\s+/g," ").trim();
 if(text.length<2||allowed.some(re=>re.test(text)))return;
 const line=source.ast.getLineAndCharacterOfPosition(node.getStart(source.ast)).line+1;
 findings.push({module:source.name,line,kind,text:text.slice(0,120)});
}
for(const item of sources){
 const ast=ts.createSourceFile(item.name+".tsx",item.text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(ast.parseDiagnostics.length)throw Error(item.name+" failed TSX parse: "+ast.parseDiagnostics[0].messageText);
 const source={...item,ast};
 const visit=node=>{
  if(ts.isJsxText(node))check(source,node,node.getText(ast),"jsx");
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)&&
   ["title","aria-label","aria-description","alt","placeholder"].includes(node.name.text))
   check(source,node,node.initializer.text,"attribute");
  if(ts.isJsxExpression(node)&&node.expression&&ts.isStringLiteral(node.expression))
   check(source,node,node.expression.text,"jsx-expression");
  ts.forEachChild(node,visit);
 };
 visit(ast);
}
const refs=[...new Set([...route.matchAll(/translate\("(services\.[\w.-]+)"\)/g),
 ...preview.matchAll(/translate\("(services\.[\w.-]+)"\)/g)].map(x=>x[1]))];
const missing=refs.filter(key=>!catalog.es[key]||!catalog.en[key]);
const regressions=[];
for(const [source,expected] of [[route,["home.moreServices","home.pilot","home.minutesToTranslate","services.openService"]],
 [preview,["services.inPlans","services.oneTime","services.serviceType","services.status.saved","services.offer.reviews"]]]){
 for(const key of expected)if(!source.includes('"'+key+'"'))regressions.push("Missing UI translation "+key);
}
if(!preview.includes('const {language,translate}=useInterfaceLanguage()'))regressions.push("Services not using VMV account language");
if(!preview.includes('role="group" aria-label={translate("services.serviceType")}'))regressions.push("Services segmented control aria label not translated");
if(!preview.includes('const [draft,setDraft]=useState<Draft>({...empty})')||
 !preview.includes('window.localStorage.setItem(key,JSON.stringify(draft))')||
 !preview.includes('},[key]);'))regressions.push("Saved business draft state unexpectedly changed");
if(!main.includes('const lineState=line?.connectedToApp?translate('))regressions.push("Smart Call status ignores account language");
if(missing.length)regressions.push("Missing catalog keys: "+missing.join(", "));
console.error("SERVICES_I18N_AUDIT="+JSON.stringify({visibleLiteralCandidates:findings.length,missingCatalogKeys:missing.length,regressions}));
if(findings.length){console.error(JSON.stringify(findings,null,2));process.exitCode=1;}
if(regressions.length)process.exitCode=1;
