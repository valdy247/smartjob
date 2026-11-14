/**
 * Visible VMV-owned UI copy audit. The catalog-key check does not cover these
 * literals. Run npm run i18n:coverage and review every reported source location.
 * Existing debt is reported (not silently treated as translated); strict mode
 * can be enabled with I18N_COVERAGE_STRICT=1 once the backlog is cleared.
 */
import {readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import ts from "typescript";

const root=process.cwd();
const scopes=["app/vista-app","app/web-studio","components","apps/ios"];
const publicPrefixes=["app/web/","app/sites/","app/web-studio/demos/"];
const brandExceptions=[
 /^VMV(?: Business)?$/, /^Smart Call$/, /^AI Agents$/, /^Web Services$/,
 /^Web Studio$/, /^Starter$/, /^Pro$/, /^Premium$/, /^API$/, /^SMS$/, /^CRM$/,
 /^URL$/, /^SEO$/, /^Google$/, /^Instagram$/, /^Facebook$/, /^WhatsApp$/,
 /^Stripe$/, /^Twilio$/, /^iPhone$/, /^iOS$/, /^USD$/, /^EIN$/,
 /^https?:\/\//, /^\$?[\d.,%+\-/ ]+$/, /^[\p{P}\p{S}\s]+$/u
];
const isExempt=(text)=>brandExceptions.some(re=>re.test(text));
const reports=[];
function walk(dir){
 for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){
  if(entry.name.startsWith(".")||entry.name==="node_modules")continue;
  const file=path.posix.join(dir,entry.name);
  if(publicPrefixes.some(p=>file.startsWith(p)))continue;
  if(entry.isDirectory()){walk(file);continue;}
  if(!/\.tsx$/.test(file)||file.endsWith(".test.tsx"))continue;
  const source=readFileSync(path.join(root,file),"utf8");
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const add=(node,kind,value)=>{
   const text=value.replace(/\s+/g," ").trim();
   if(text.length<3||isExempt(text)||!/[\p{L}]/u.test(text))return;
   const line=ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1;
   reports.push({file,line,kind,text:text.slice(0,130)});
  };
  function visit(node){
   if(ts.isJsxText(node)){
    const text=node.getText(ast).trim();
    if(text)add(node,"jsx",text);
   }
   if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)){
    const name=node.name.text;
    if(["placeholder","title","aria-label","alt","aria-description"].includes(name))
     add(node,"attribute:"+name,node.initializer.text);
   }
   if(ts.isJsxExpression(node)&&node.expression&&ts.isStringLiteral(node.expression)){
    add(node,"jsx-expression",node.expression.text);
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
}
for(const dir of scopes)walk(dir);
reports.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
const byFile=Object.entries(reports.reduce((acc,r)=>{(acc[r.file]??=[]).push(r);return acc;},{}))
 .map(([file,items])=>({file,count:items.length}))
 .sort((a,b)=>b.count-a.count);
const moduleFor=file=>file.startsWith("app/vista-app/ai-agents/")||file.startsWith("apps/ios/AIAgent")||file.startsWith("apps/ios/AIAgents")?"AI Agents":
 file.startsWith("app/vista-app/marketing/")?"Marketing":
 file.startsWith("app/web-studio/")||file.includes("WebServicesStudio")?"Web Studio":
 file.includes("Contact")?"Contactos":
 file.includes("Billing")?"Facturación":
 file.includes("Smart")||file.includes("Call")||file.includes("LivePanel")?"Smart Call":
 file.startsWith("apps/ios/")?"iPhone / otros":
 file==="app/vista-app/page.tsx"?"Home VMV":
 file.startsWith("components/")?"Bloque A / componentes compartidos":"Otros";
const byModule=Object.entries(reports.reduce((acc,r)=>{const key=moduleFor(r.file);acc[key]=(acc[key]||0)+1;return acc;},{}))
 .map(([module,count])=>({module,count})).sort((a,b)=>b.count-a.count);
console.log(JSON.stringify({total:reports.length,byModule,byFile,...(process.env.I18N_COVERAGE_DETAILS==="1"?{findings:reports}:{})},null,2));
console.error("I18N_COVERAGE_SUMMARY="+JSON.stringify({total:reports.length,byModule}));
console.error("i18n visible-copy audit:",reports.length,"candidate untranslated strings across",byFile.length,"files");
if(process.env.I18N_COVERAGE_STRICT==="1"&&reports.length)process.exitCode=1;
