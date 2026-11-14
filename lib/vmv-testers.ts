export const TESTERS_PROJECT_ID="prj_yeVaibe69wH77tUM2ZXphTHjzwfx";
export const TESTERS_BRANCH="feat/vmv-smart-call-control-center";
export const TESTERS_TEAM_ID="team_8nteHLnX79fizQnfvEnSL4su";
export const TESTERS_PROJECT_NAME="smartjob";

export type TesterDeployment={id:string;url:string;sha:string;message:string;createdAt:number;state:string};
export type TesterPreview={ready:TesterDeployment|null;building:TesterDeployment|null;protected:boolean|null;protectionNotes:string[];projectVerified:boolean};
type VercelDeployment={id?:string;name?:string;url?:string|null;created?:number;createdAt?:number;state?:string;readyState?:string;target?:string|null;projectId?:string;meta?:Record<string,string|undefined>;gitSource?:{ref?:string;sha?:string;org?:string;repo?:string}};
const apiToken=()=>process.env.VERCEL_API_TOKEN||"";
const timeout=()=>AbortSignal.timeout(10000);
async function vercel(path:string){
 if(!apiToken())throw Error("VERCEL_API_TOKEN_NOT_CONFIGURED");
 const res=await fetch("https://api.vercel.com"+path,{cache:"no-store",headers:{Authorization:"Bearer "+apiToken(),Accept:"application/json"},signal:timeout()});
 if(!res.ok)throw Error("VERCEL_API_UNAVAILABLE_"+res.status);
 return res.json() as Promise<Record<string,unknown>>;
}
const isPreview=(d:VercelDeployment)=>d.target===null||d.target===undefined||d.target==="preview";
const isBranch=(d:VercelDeployment)=>(d.meta?.githubCommitRef===TESTERS_BRANCH||d.gitSource?.ref===TESTERS_BRANCH)
 &&(d.meta?.githubRepo==="smartjob"||d.gitSource?.repo==="smartjob")
 &&(d.meta?.githubOrg==="valdy247"||d.gitSource?.org==="valdy247");
const validSha=(s:unknown):s is string=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
function normalize(d:VercelDeployment):TesterDeployment|null{
 const sha=d.meta?.githubCommitSha||d.gitSource?.sha;
 if(!d.id||!d.url||!validSha(sha)||!isPreview(d)||!isBranch(d)||d.name!==TESTERS_PROJECT_NAME)return null;
 try{
  const u=new URL("https://"+d.url.replace(/^https:\/\//,""));
  if(u.protocol!=="https:"||!u.hostname.endsWith(".vercel.app"))return null;
  return {id:d.id,url:u.toString(),sha,message:String(d.meta?.githubCommitMessage||"").slice(0,250),
   createdAt:Number(d.createdAt||d.created||0),state:String(d.readyState||d.state||"")};
 }catch{return null;}
}
function protection(project:Record<string,unknown>){
 const notes:string[]=[];let known=0;
 for(const key of ["passwordProtection","ssoProtection","trustedIps"]){
  const value=project[key];
  if(value!==undefined){known++;if(value===true||(value&&typeof value==="object"&&(value as {enabled?:boolean}).enabled))notes.push(key);}
 }
 return {protected:notes.length>0?true:known===3?false:null,protectionNotes:notes};
}
export async function getLatestTesterPreview():Promise<TesterPreview>{
 const project=await vercel("/v9/projects/"+encodeURIComponent(TESTERS_PROJECT_ID)+"?teamId="+TESTERS_TEAM_ID);
 if(project.id!==TESTERS_PROJECT_ID||project.name!==TESTERS_PROJECT_NAME||project.accountId!==TESTERS_TEAM_ID)throw Error("VERCEL_PROJECT_MISMATCH");
 const params=new URLSearchParams({projectId:TESTERS_PROJECT_ID,branch:TESTERS_BRANCH,limit:"100"});
 params.set("teamId",TESTERS_TEAM_ID);
 const result=await vercel("/v7/deployments?"+params.toString());
 const items=Array.isArray(result.deployments)?result.deployments as VercelDeployment[]:[];
 const deployments=items.map(normalize).filter((d):d is TesterDeployment=>Boolean(d)).sort((a,b)=>b.createdAt-a.createdAt);
 const ready=deployments.find(d=>d.state==="READY")||null;
 const newest=deployments[0]||null;
 const building=newest&&["BUILDING","QUEUED","INITIALIZING"].includes(newest.state)&&(!ready||newest.createdAt>ready.createdAt)?newest:null;
 return {ready,building,projectVerified:true,...protection(project)};
}
export async function verifyTesterDeployment(id:string){
 if(!/^dpl_[A-Za-z0-9]{8,100}$/.test(id))throw Error("INVALID_DEPLOYMENT");
 const preview=await getLatestTesterPreview();
 const raw=await vercel("/v13/deployments/"+encodeURIComponent(id)+"?teamId="+TESTERS_TEAM_ID);
 const deployment=normalize(raw as VercelDeployment);
 if(!deployment||deployment.state!=="READY"||raw.projectId!==TESTERS_PROJECT_ID||preview.protected!==false)
  throw Error("DEPLOYMENT_NOT_SENDABLE");
 return {deployment,preview};
}
export type DeliveryChannel="email"|"sms";
export type SendResult={state:"accepted"|"failed"|"unknown";provider:string;providerId:string|null;error:string|null};
export type DeliverySnapshot={id:string;channel:DeliveryChannel;address:string;name:string};
export const channelReadiness=()=>({
 email:Boolean(process.env.RESEND_API_KEY&&process.env.VMV_TESTER_FROM_EMAIL&&process.env.VMV_TESTER_FROM_VERIFIED==="true"),
 sms:Boolean(process.env.VMV_TESTER_SMS_ENABLED==="true"&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN
   &&(process.env.TWILIO_TESTER_SMS_FROM||process.env.TWILIO_MESSAGING_SERVICE_SID))
});
const htmlEscape=(s:string)=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
export const previewText=(d:TesterDeployment)=>"VMV Business · Nueva versión para probar\nYa puedes probar la actualización:\n"+d.url
 +"\n\nVersión: "+d.sha.slice(0,8)+"\n\nEsta es una versión de prueba; READY no garantiza ausencia de errores.";
export async function sendTesterPreview(delivery:DeliverySnapshot,deployment:TesterDeployment,attemptKey:string):Promise<SendResult>{
 if(!channelReadiness()[delivery.channel])return {state:"failed",provider:delivery.channel,providerId:null,error:"channel_not_configured"};
 try{
  if(delivery.channel==="email"){
   const html='<div style="font-family:Arial,sans-serif;max-width:540px;color:#203028"><h2>VMV Business · Nueva versión para probar</h2><p>Hola '
    +htmlEscape(delivery.name)+',</p><p>Ya puedes probar la actualización:</p><p><a href="'+htmlEscape(deployment.url)
    +'" style="display:inline-block;padding:13px 20px;background:#c2ef9c;color:#18301b;border-radius:10px;text-decoration:none;font-weight:bold">Abrir versión de prueba</a></p><p><a href="'
    +htmlEscape(deployment.url)+'">'+htmlEscape(deployment.url)+'</a></p><p>Versión: '+htmlEscape(deployment.sha.slice(0,8))
    +'</p><p style="font-size:12px;color:#69786c">READY indica que el despliegue terminó, no que esté libre de errores.</p></div>';
   const res=await fetch("https://api.resend.com/emails",{method:"POST",signal:timeout(),
    headers:{Authorization:"Bearer "+String(process.env.RESEND_API_KEY),"Content-Type":"application/json","Idempotency-Key":"vmv-tester-"+attemptKey},
    body:JSON.stringify({from:process.env.VMV_TESTER_FROM_EMAIL,to:[delivery.address],
     subject:"VMV Business · Nueva versión para probar",text:previewText(deployment),html})});
   const data=await res.json().catch(()=>({})) as {id?:string};
   if(!res.ok)return {state:"failed",provider:"resend",providerId:null,error:"resend_http_"+res.status};
   return data.id?{state:"accepted",provider:"resend",providerId:data.id,error:null}:
    {state:"unknown",provider:"resend",providerId:null,error:"provider_response_without_id"};
  }
  const sid=String(process.env.TWILIO_ACCOUNT_SID),auth=String(process.env.TWILIO_AUTH_TOKEN);
  const form=new URLSearchParams({To:delivery.address,Body:"VMV Business: nueva versión "+deployment.sha.slice(0,8)+": "+deployment.url+"\nResponde STOP para dejar de recibir SMS."});
  if(process.env.TWILIO_MESSAGING_SERVICE_SID)form.set("MessagingServiceSid",process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From",String(process.env.TWILIO_TESTER_SMS_FROM));
  const callback=process.env.VMV_TESTER_PUBLIC_BASE_URL;
  if(callback){try{const url=new URL(callback);if(url.protocol==="https:")form.set("StatusCallback",new URL("/api/admin/testers/webhooks/twilio",url).toString());}catch{}}
  const res=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",
   {method:"POST",signal:timeout(),headers:{Authorization:"Basic "+Buffer.from(sid+":"+auth).toString("base64"),
    "Content-Type":"application/x-www-form-urlencoded"},body:form.toString()});
  const data=await res.json().catch(()=>({})) as {sid?:string};
  if(!res.ok)return {state:"failed",provider:"twilio",providerId:null,error:"twilio_http_"+res.status};
  return data.sid?{state:"accepted",provider:"twilio",providerId:data.sid,error:null}:
   {state:"unknown",provider:"twilio",providerId:null,error:"provider_response_without_id"};
 }catch{return {state:"unknown",provider:delivery.channel==="email"?"resend":"twilio",providerId:null,error:"provider_response_unknown"};}
}
