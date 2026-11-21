const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const paths=[
 "app/vista-app/ai-agents/AgentLiveTest.tsx",
 "app/vista-app/ai-agents/ChatWebHub.tsx",
 "app/web-studio/WebChatLauncher.tsx",
 "app/vista-app/ContactBook.tsx",
 "components/VMVChatHandoffNotifications.tsx",
 "app/api/vmv/public-chat/route.ts",
 "app/api/vmv/public-chat/action/route.ts",
 "app/api/vmv/web-chat-owner/route.ts",
 "lib/vmv-web-chat-session.ts"
];
const source=Object.fromEntries(paths.map(p=>[p,read(p)]));
test("Web chat handoff and contacts source parse as TS/TSX",()=>{
 for(const file of paths){
  const parsed=ts.createSourceFile(file,source[file],ts.ScriptTarget.Latest,true,
   file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],file);
 }
});
test("Fullscreen owner preview hides inventory/history and speaks to owner like customer",()=>{
 const preview=source["app/vista-app/ai-agents/AgentLiveTest.tsx"];
 const sim=read("app/api/vmv/ai-agents/simulate/route.ts");
 const css=read("app/vista-app/ai-agents/AgentLiveTest.module.css");
 const parent=read("app/vista-app/ai-agents/page.tsx");
 assert.match(preview,/if\(webMode\)return <section className=\{styles\.webFullscreen\}/);
 assert.match(preview,/Hola\{ownerFirstName/);
 assert.match(preview,/webComposer/);
 assert.match(preview,/webGreeting/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/\.webComposer/);
 assert.match(parent,/screen==="test"&&testFromChatWeb/);
 assert.match(sim,/warm\+"%"/);
 assert.match(sim,/formal\+"%"/);
 assert.match(sim,/sin suponer que es el dueño ni evaluador/);
});
test("Contact capture is voluntary, owner-scoped, validated and visible in VMV Contacts",()=>{
 const api=source["app/api/vmv/public-chat/action/route.ts"];
 const widget=source["app/web-studio/WebChatLauncher.tsx"];
 const contacts=source["app/vista-app/ContactBook.tsx"];
 const ddl=read("supabase/sql/vmv_chat_web_handoff_leads_20261120.sql");
 const fix=read("supabase/sql/vmv_web_chat_lead_validation_fix_20261120.sql");
 assert.match(api,/body\.consent!==true/);
 assert.match(api,/visitorSession\(req,body\.kind,body\.slug\)/);
 assert.match(api,/vmv_web_chat_save_lead/);
 assert.match(widget,/leadConsent/);
 assert.match(widget,/action:"lead"/);
 assert.match(widget,/Compartir datos/);
 assert.match(contacts,/vmv_web_chat_leads/);
 assert.match(contacts,/Contactos Chat web/);
 assert.match(ddl,/ENABLE ROW LEVEL SECURITY/);
 assert.match(fix,/chat_lead_invalid/);
 assert.match(fix,/ON CONFLICT\(owner_id,phone_e164\) DO NOTHING/);
});
test("Every handoff creates a notification and owner can reply through a verified session",()=>{
 const pub=source["app/api/vmv/public-chat/route.ts"];
 const action=source["app/api/vmv/public-chat/action/route.ts"];
 const owner=source["app/api/vmv/web-chat-owner/route.ts"];
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 const global=source["components/VMVChatHandoffNotifications.tsx"];
 const ddl=read("supabase/sql/vmv_chat_web_handoff_leads_20261120.sql");
 assert.match(pub,/vmv_web_chat_handoff/);
 assert.match(pub,/ai_unavailable/);
 assert.match(pub,/handoff_status/);
 assert.match(pub,/current\.handoff_status/);
 assert.match(action,/action==="handoff"/);
 assert.match(ddl,/vmv_web_chat_alerts/);
 assert.match(ddl,/GRANT SELECT,UPDATE\(read_at\)/);
 assert.match(ddl,/supabase_realtime/);
 assert.match(owner,/auth\.getUser\(bearer\)/);
 assert.match(owner,/\.eq\("owner_id",user\.id\)/);
 assert.match(owner,/role:"human"/);
 assert.match(hub,/humanAction/);
 assert.match(hub,/postgres_changes/);
 assert.match(global,/Atender ahora/);
 assert.match(global,/chatWeb=conversations/);
 assert.match(read("app/layout.tsx"),/VMVChatHandoffNotifications/);
});
test("Tone uses server-validated 1-100 percent sliders, not five discrete levels",()=>{
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 const sql=read("supabase/sql/vmv_chat_web_handoff_leads_20261120.sql");
 const pub=source["app/api/vmv/public-chat/route.ts"];
 assert.match(hub,/max=\{100\} step=\{1\}/);
 assert.match(hub,/settings\.warmth\}%/);
 assert.match(hub,/settings\.formality\}%/);
 assert.match(sql,/warmth BETWEEN 1 AND 100/);
 assert.match(sql,/formality BETWEEN 1 AND 100/);
 assert.match(pub,/c\.settings\.warmth\+"%"/);
 assert.match(pub,/c\.settings\.formality\+"%"/);
});
