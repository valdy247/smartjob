import ts from "typescript";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const main=read("app/vista-app/page.tsx");
const homeBegin=main.indexOf('{ready&&tab==="home"?<div className=');
const servicesBegin=main.indexOf('{ready&&tab==="services"&&!open?');
const servicesEnd=main.indexOf('{ready&&tab==="calls"?',servicesBegin);
if(homeBegin<0||servicesBegin<=homeBegin||servicesEnd<=servicesBegin)
 throw Error("Home/Services route boundaries changed; review audit scope");
const home=main.slice(homeBegin,servicesBegin);
const route=main.slice(servicesBegin,servicesEnd);
const preview=read("app/vista-app/BusinessServicesPreview.tsx");
const catalog=JSON.parse(read("lib/i18n/messages.json"));
const sources=[
 {name:"Home dashboard",text:"const HomeAudited=()=> <main>"+home+"</main>;"},
 {name:"Services route",text:"const ServicesAudited=()=> <main>"+route+"</main>;"},
 {name:"BusinessServicesPreview",text:preview}
];
const allowed=[
 /^VMV(?: BUSINESS| Business)?\s*\/?$/i,/^Smart Call$/i,/^AI Agents$/i,
 /^Web Services$/i,/^Web Care$/i,/^Smart Booking$/i,/^Marketing$/i,
 /^Google Business Profile$/i,/^Beta$/i,/^SEO$/i,
 /^App iPhone$/i,/^English$/i,/^Español$/i,
 /^\d+$/, /^min$/i,/^USD(?:\s*·)?$/i,/^TEST$/i,
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
const refs=[...new Set([...home.matchAll(/translate\("([\w.-]+)"\)/g),
 ...route.matchAll(/translate\("([\w.-]+)"\)/g),
 ...preview.matchAll(/translate\("([\w.-]+)"\)/g)].map(x=>x[1]))];
const missing=refs.filter(key=>!catalog.es[key]||!catalog.en[key]);
const regressions=[];
if(!home.includes("dashboardCallCard")||!home.includes("dashboardActivity")||
 !home.includes("dashboard.quickActions")||!home.includes("calls.slice(0,2)"))
 regressions.push("Home must show authenticated business activity and quick actions");
if(home.includes("{featuredSmartCall}")||home.includes("{featuredServices}"))
 regressions.push("Home must not duplicate the Services product catalog");
if(!route.includes("catalogSearch")||!route.includes("catalogFilters")||
 !route.includes("filteredCatalog.map(")||!route.includes("BusinessServicesPreview"))
 regressions.push("Services must contain a searchable categorized catalog");
if(route.includes("{featuredSmartCall}")||route.includes("{featuredServices}"))
 regressions.push("Services must not render the former duplicated Home layout");
for(const [source,expected] of [
 [home,["dashboard.callCenter","dashboard.lineStatus","dashboard.minutes","dashboard.activity","dashboard.emptyActivity"]],
 [route,["catalog.search","catalog.all","catalog.communication","catalog.digital","catalog.growth"]],
 [preview,["services.inPlans","services.oneTime","services.serviceType","services.status.saved","services.offer.reviews"]]
]){
 for(const key of expected)if(!source.includes('"'+key+'"'))regressions.push("Missing UI translation "+key);
}
if(!preview.includes('const {language,translate}=useInterfaceLanguage()'))
 regressions.push("Services not using VMV account language");
if(!preview.includes('role="group" aria-label={translate("services.serviceType")}'))
 regressions.push("Services segmented control aria label not translated");
if(!preview.includes('const [draft,setDraft]=useState<Draft>({...empty})')||
 !preview.includes('window.localStorage.setItem(key,JSON.stringify(draft))')||
 !preview.includes('},[key]);'))regressions.push("Saved business draft state unexpectedly changed");
if(!main.includes('const lineState=line?.connectedToApp?translate('))
 regressions.push("Smart Call status ignores account language");
if(missing.length)regressions.push("Missing catalog keys: "+missing.join(", "));
console.error("SERVICES_I18N_AUDIT="+JSON.stringify({visibleLiteralCandidates:findings.length,missingCatalogKeys:missing.length,regressions}));
if(findings.length)console.error(JSON.stringify(findings,null,2));
if(findings.length||regressions.length)process.exitCode=1;
