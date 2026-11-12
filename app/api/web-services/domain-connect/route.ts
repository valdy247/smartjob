import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const maxDuration=30;
const valid=(v:string)=>v.length>=4&&v.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(v);
function reply(body:Record<string,unknown>,status=200){
 return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
}
function config(){
 return {
  supabase:process.env.NEXT_PUBLIC_SUPABASE_URL||"",
  publishable:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"",
  secret:process.env.SUPABASE_SECRET_KEY||"",
  vercelToken:process.env.VMV_VERCEL_DOMAINS_TOKEN||"",
  project:process.env.VMV_WEB_VERCEL_PROJECT_ID||"prj_yeVaibe69wH77tUM2ZXphTHjzwfx",
  team:process.env.VMV_WEB_VERCEL_TEAM_ID||"",
  enabled:process.env.VMV_WEB_DOMAIN_CONNECTIONS_ENABLED==="true"&&process.env.VERCEL_ENV==="production"
 };
}
function domainAPI(path:string,team:string){
 return "https://api.vercel.com"+path+(team?"?teamId="+encodeURIComponent(team):"");
}
export async function POST(req:NextRequest){
 const cfg=config();
 if(!cfg.enabled||!cfg.vercelToken||!cfg.secret||!cfg.supabase||!cfg.publishable)
  return reply({error:"La conexión de dominios estará disponible tras habilitar el alojamiento en producción"},503);
 let input:{action?:unknown;domain?:unknown;siteId?:unknown};
 try{input=await req.json();}catch{return reply({error:"Solicitud inválida"},400);}
 const action=input.action;
 const domain=typeof input.domain==="string"?input.domain.trim().toLowerCase():"";
 const siteId=typeof input.siteId==="string"?input.siteId:"";
 if(!["connect","verify"].includes(String(action))||!valid(domain)||!(/^[0-9a-f-]{36}$/i.test(siteId)))
  return reply({error:"Dominio o sitio inválidos"},400);
 const header=req.headers.get("authorization")||"";
 const token=header.startsWith("Bearer ")?header.slice(7):"";
 if(!token||token.length>8000)return reply({error:"Inicia sesión"},401);
 const client=createClient(cfg.supabase,cfg.publishable,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:"Bearer "+token}}
 });
 const {data:auth,error:authError}=await client.auth.getUser(token);
 if(authError||!auth.user||auth.user.is_anonymous)return reply({error:"Sesión inválida"},403);
 const {data:site,error:siteError}=await client.from("smartjob_builder_sites")
  .select("id,slug,owner_id").eq("id",siteId).eq("owner_id",auth.user.id).maybeSingle();
 if(siteError||!site)return reply({error:"No puedes administrar este sitio"},403);
 const admin=createClient(cfg.supabase,cfg.secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:existing}=await admin.from("smartjob_builder_domains")
  .select("id,owner_id,state").eq("hostname",domain).maybeSingle();
 if(existing&&existing.owner_id!==auth.user.id)return reply({error:"Dominio asociado a otra cuenta"},409);
 if(action==="connect"){
  const {count,error:countError}=await admin.from("smartjob_builder_domains")
   .select("id",{count:"exact",head:true}).eq("owner_id",auth.user.id);
  if(countError)return reply({error:"No se pudo comprobar el límite"},503);
  if(!existing&&(count||0)>=5)return reply({error:"Límite de cinco dominios por cuenta en esta etapa"},429);
 }
 try{
  const project=encodeURIComponent(cfg.project);
  let result:Record<string,unknown>={};
  if(action==="connect"){
   const response=await fetch(domainAPI("/v10/projects/"+project+"/domains",cfg.team),{
    method:"POST",
    headers:{"Authorization":"Bearer "+cfg.vercelToken,"Content-Type":"application/json"},
    body:JSON.stringify({name:domain}),signal:AbortSignal.timeout(18000),cache:"no-store"
   });
   const info=await response.json().catch(()=>({})) as Record<string,unknown>;
   if(!response.ok&&response.status!==409)return reply({error:"Vercel no aceptó el dominio. Verifica que lo administras o que no esté asociado a otro proyecto."},502);
   result=info;
  }
  const statusResponse=await fetch(domainAPI("/v9/projects/"+project+"/domains/"+encodeURIComponent(domain),cfg.team),{
   headers:{"Authorization":"Bearer "+cfg.vercelToken},signal:AbortSignal.timeout(10000),cache:"no-store"
  });
  if(!statusResponse.ok)return reply({error:"El registrador no pudo verificar el dominio todavía"},502);
  const data=await statusResponse.json() as {verified?:boolean;verification?:unknown};
  const configResponse=await fetch(domainAPI("/v6/domains/"+encodeURIComponent(domain)+"/config",cfg.team)+(cfg.team?"&":"?")+"projectId="+project,{
   headers:{"Authorization":"Bearer "+cfg.vercelToken},signal:AbortSignal.timeout(10000),cache:"no-store"
  });
  const dns=configResponse.ok?await configResponse.json() as {misconfigured?:boolean;configuredBy?:string}:null;
  const isReady=data.verified===true&&dns!==null&&dns.misconfigured===false;
  const verification=Array.isArray(data.verification)?data.verification.slice(0,5):[];
  const row={hostname:domain,owner_id:auth.user.id,site_id:site.id,
   state:isReady?"active":"verifying",verification:{records:verification,dns:dns?{misconfigured:dns.misconfigured,configuredBy:dns.configuredBy}:{pending:true}},
   last_error:"",last_checked_at:new Date().toISOString()};
  const {error:saveError}=await admin.from("smartjob_builder_domains").upsert(row,{onConflict:"hostname"});
  if(saveError)return reply({error:"No se pudo registrar la verificación"},503);
  if(isReady){
   const {error:routeError}=await admin.from("smartjob_builder_public_domains")
    .upsert({hostname:domain,site_slug:site.slug,active_at:new Date().toISOString()},{onConflict:"hostname"});
   if(routeError)return reply({error:"Dominio verificado, pero el enrutamiento no está listo"},503);
  }else{
   await admin.from("smartjob_builder_public_domains").delete().eq("hostname",domain);
  }
  return reply({domain,verified:data.verified===true,connected:isReady,state:row.state,
   verification:row.verification,warning:isReady?null:"Completa los registros DNS solicitados y verifica nuevamente."});
 }catch{return reply({error:"No se pudo conectar el dominio ahora"},503);}
}
