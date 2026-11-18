"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./AdsStudio.module.css";

type Account={id:string;name:string;currency:string;status:number;timezone:string};
type Page={id:string;name:string;instagramId:string|null;instagramUsername:string};
type Connected={id:string;providerName:string;expiresAt:string|null;selectedAccountId:string|null;selectedAccountName:string|null};
type Campaign={id:string;ad_account_id:string;status:string;draft:{
 name:string;headline:string;message:string;destination:string;totalBudgetCents:number;
 durationDays:number;placements:string};provider_campaign_id:string|null;provider_ad_id:string|null;
 error_code:string|null;created_at:string};
type AccountsResponse={configured:boolean;connected:boolean;connection?:Connected;accounts:Account[];
 pages:Page[];error?:string};
const initial={name:"",headline:"",message:"",destination:"",pageId:"",
 dailyBudget:"10",durationDays:"7",placements:"facebook_instagram" as "facebook"|"facebook_instagram",
 specialCategoriesAcknowledged:false};
const platforms=[
 {name:"Meta Ads",description:"Facebook e Instagram",available:true},
 {name:"Google Ads",description:"Búsqueda, YouTube y Display",available:false},
 {name:"TikTok Ads",description:"Videos y anuncios TikTok",available:false},
 {name:"Pinterest Ads",description:"Pins promocionados",available:false},
 {name:"LinkedIn Ads",description:"Anuncios profesionales",available:false},
 {name:"Snapchat Ads",description:"Anuncios Snapchat",available:false}
];
export default function AdsStudio(){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const localized=(es:string,english:string)=>en?english:es;
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [meta,setMeta]=useState<AccountsResponse>({configured:false,connected:false,accounts:[],pages:[]});
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [selectedAccount,setSelectedAccount]=useState("");
 const [form,setForm]=useState(initial);
 const [image,setImage]=useState<File|null>(null);
 const [imageHash,setImageHash]=useState("");
 const [draftKey,setDraftKey]=useState(()=>crypto.randomUUID());
 const [draftId,setDraftId]=useState("");
 const [insights,setInsights]=useState<Record<string,any[]>>({});
 const [publishReady,setPublishReady]=useState(false);
 const total=useMemo(()=>Math.round(Number(form.dailyBudget)*100)*Number(form.durationDays),[form.dailyBudget,form.durationDays]);
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const patch=(name:keyof typeof initial,value:string|boolean)=>{
  setForm(v=>({...v,[name]:value}));setDraftId("");setDraftKey(crypto.randomUUID());setError("");
 };
 const api=async(path:string,method="GET",payload?:unknown,formData=false)=>{
  const client=getSupabase();if(!client)throw Error("sign_in_required");
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw Error("sign_in_required");
  const response=await fetch(path,{
   method,cache:"no-store",
   headers:{"Authorization":"Bearer "+session.access_token,...(formData?{}:method==="POST"?{"Content-Type":"application/json"}:{})},
   ...(method==="POST"?{body:formData?payload as FormData:JSON.stringify(payload)}:{})
  });
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(typeof value?.error==="string"?value.error:"request_failed");
  return value;
 };
 const reload=useCallback(async()=>{
  setLoading(true);
  try{
   const accounts=(await api("/api/marketing/ads/meta/accounts")) as AccountsResponse;
   setMeta(accounts);setSelectedAccount(accounts.connection?.selectedAccountId||"");
   const list=await api("/api/marketing/ads/meta/campaigns");
   setCampaigns(list.campaigns||[]);
   setPublishReady(list.publishReady===true);
   if(accounts.error)setError(accounts.error);
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  const status=new URLSearchParams(window.location.search).get("meta");
  if(status==="connected")setNotice(localized("Cuenta Meta conectada. Selecciona tu cuenta publicitaria.","Meta connected. Choose your ad account."));
  else if(status)setError(localized("No pudimos completar la conexión con Meta. Inténtalo de nuevo.","Meta authorization did not finish. Please retry."));
  void reload();
 },[reload]);
 const run=async(label:string,fn:()=>Promise<void>)=>{
  setBusy(label);setError("");setNotice("");
  try{await fn();}
  catch(e){setError(e instanceof Error?e.message:"operation_failed");}
  finally{setBusy("");}
 };
 const connect=()=>run("connect",async()=>{
  const result=await api("/api/marketing/ads/meta/start","POST",{});
  if(typeof result.url!=="string"||!result.url.startsWith("https://www.facebook.com/"))throw Error("unsafe_auth_url");
  window.location.assign(result.url);
 });
 const chooseAccount=()=>run("account",async()=>{
  await api("/api/marketing/ads/meta/accounts","POST",{accountId:selectedAccount});
  setNotice(localized("Cuenta publicitaria seleccionada.","Ad account selected."));
  await reload();
 });
 const disconnect=()=>{
  if(!window.confirm(localized("¿Desconectar Meta y revocar el acceso desde VMV? Puedes revocar también la app en Meta.","Disconnect Meta and remove VMV's access token? You can revoke the app in Meta as well.")))return;
  void run("disconnect",async()=>{
   await api("/api/marketing/ads/meta/disconnect","POST",{});
   setImageHash("");setDraftId("");
   await reload();setNotice(localized("Meta desconectado.","Meta disconnected."));
  });
 };
 const upload=()=>run("image",async()=>{
  if(!image)throw Error("select_image");
  const f=new FormData();f.set("image",image);
  const result=await api("/api/marketing/ads/meta/image","POST",f,true);
  setImageHash(result.imageHash);
  setNotice(localized("Imagen enviada de forma segura a Meta.","Image uploaded securely to Meta."));
 });
 const saveDraft=()=>run("draft",async()=>{
  const daily=Math.round(Number(form.dailyBudget)*100),days=Number(form.durationDays);
  if(!Number.isInteger(daily)||daily<500||daily>25000||!Number.isInteger(days)||days<1||days>30)
   throw Error("budget_must_be_5_to_250_usd_per_day_and_1_to_30_days");
  if(!imageHash)throw Error("upload_image_first");
  const result=await api("/api/marketing/ads/meta/campaigns","POST",{
   operation:"draft",clientKey:draftKey,draft:{
    name:form.name,headline:form.headline,message:form.message,destination:form.destination,
    imageHash,pageId:form.pageId,placements:form.placements,
    dailyBudgetCents:daily,durationDays:days,
    specialCategoriesAcknowledged:form.specialCategoriesAcknowledged
   }
  });
  setDraftId(result.campaign.id);
  setNotice(localized("Borrador guardado. Revisa el presupuesto antes de crear objetos pausados.","Draft saved. Review the budget before creating paused objects."));
  await reload();
 });
 const createPaused=(campaignId:string,budget:number)=>{
  if(!window.confirm(localized(
   "Confirmo el diseño y un presupuesto máximo de "+money(budget)+". Crear campaña, conjunto y anuncio PAUSADOS en Meta (sin publicar ni gastar).",
   "I approve the creative and maximum budget of "+money(budget)+". Create PAUSED campaign, ad set and ad in Meta (no publishing or spend).")))return;
  void run("paused:"+campaignId,async()=>{
   const response=await api("/api/marketing/ads/meta/campaigns","POST",{
    operation:"create_paused",campaignId,confirmPaused:true,approvedTotalCents:budget
   });
   setNotice(localized("Anuncio creado y pausado en Meta. No se ha gastado presupuesto.","Ad created in Meta in paused state. No ad spend was triggered."));
   await reload();
  });
 };
 const publish=(c:Campaign)=>{
  const phrase=window.prompt(localized(
   "PUBLICAR puede generar gastos en tu cuenta Meta hasta "+money(c.draft.totalBudgetCents)+". Escribe PUBLICAR para autorizar.",
   "Publishing can spend up to "+money(c.draft.totalBudgetCents)+" in your Meta account. Type PUBLICAR to authorize."));
  if(phrase!=="PUBLICAR")return;
  void run("publish:"+c.id,async()=>{
   await api("/api/marketing/ads/meta/campaigns","POST",{operation:"activate",
    campaignId:c.id,confirmSpend:true,approvedTotalCents:c.draft.totalBudgetCents,
    confirmationText:phrase});
   setNotice(localized("Meta confirmó la activación. Supervisa el gasto en tu cuenta publicitaria.","Meta confirmed activation. Monitor spend in your ad account."));
   await reload();
  });
 };
 const pause=(c:Campaign)=>{
  if(!window.confirm(localized("¿Pausar esta campaña en Meta?","Pause this Meta campaign?")))return;
  void run("pause:"+c.id,async()=>{
   await api("/api/marketing/ads/meta/campaigns","POST",{operation:"pause",campaignId:c.id});
   setNotice(localized("Meta confirmó la pausa de la campaña.","Meta confirmed the campaign pause."));
   await reload();
  });
 };
 const metrics=(c:Campaign)=>run("metrics:"+c.id,async()=>{
  const r=await api("/api/marketing/ads/meta/insights?campaignId="+encodeURIComponent(c.id));
  setInsights(prev=>({...prev,[c.id]:r.rows||[]}));
 });
 const selectedPage=meta.pages.find(x=>x.id===form.pageId);
 const noBusinessCategories=form.specialCategoriesAcknowledged;
 return <div className={styles.workspace}>
  <section className={styles.hero}>
   <span className={styles.eyebrow}>VMV BUSINESS · ADS CONTROL CENTER</span>
   <h1>{localized("Conecta. Diseña. Aprueba.","Connect. Create. Approve.")}</h1>
   <p>{localized("Crea anuncios desde VMV, usando cuentas publicitarias autorizadas. Las primeras pruebas crean anuncios pausados; la publicación requiere una aprobación adicional.","Build ads in VMV with authorized ad accounts. The initial tests create paused ads; publishing requires additional approval.")}</p>
   <div className={styles.heroActions}><a href="/vista-app/marketing">{localized("Volver a Marketing","Back to Marketing")}</a>
    <a href="/vista-app/marketing/requests">{localized("Mis solicitudes y pagos","Requests & payments")}</a></div>
  </section>
  {notice?<p className={styles.success} role="status">{notice}</p>:null}
  {error?<p className={styles.warning} role="alert">{localized("Operación pendiente o no disponible: ","Unable to complete operation: ")}{error}</p>:null}
  <section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>01 · {localized("PLATAFORMAS","CHANNELS")}</span><h2>{localized("Dónde anunciar","Where to advertise")}</h2></div>
    <span className={styles.help}>{localized("Cada plataforma requiere su propia autorización.","Each platform requires separate authorization.")}</span></div>
   <div className={styles.platformGrid}>{platforms.map(item=><div key={item.name} className={styles.platform}>
    <strong>{item.name}</strong><small>{item.description}</small>
    <span className={item.available?styles.pilot:styles.planned}>{item.available?localized("Integración piloto","Pilot integration"):localized("API y permisos pendientes","API access pending")}</span>
   </div>)}</div>
  </section>
  <section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>02 · META</span><h2>{localized("Conectar cuenta de anuncios","Connect an ad account")}</h2></div>
    {meta.connected?<span className={styles.connected}>{localized("Conectada","Connected")}</span>:null}</div>
   {loading?<p>{localized("Verificando conexiones…","Checking connections…")}</p>:
    !meta.configured?<div className={styles.setup}>
     <strong>{localized("Configuración de Meta pendiente","Meta app setup required")}</strong>
     <p>{localized("El equipo VMV debe registrar la app con Meta Developers, configurar credenciales privadas y obtener los permisos necesarios. Nunca te pediremos tu contraseña de Facebook.","VMV must register an app with Meta Developers, configure private credentials, and obtain the required permissions. We will never ask for your Facebook password.")}</p>
    </div>:
    !meta.connected?<div className={styles.setup}>
     <p>{localized("Autoriza el acceso en la página oficial de Facebook. Puedes desconectar cuando quieras.","Authorize in Facebook's official login screen. Disconnect at any time.")}</p>
     <button disabled={!!busy} className={styles.primary} onClick={connect}>{localized("Conectar con Meta","Connect with Meta")}</button>
    </div>:<div className={styles.connectedGrid}>
     <div><strong>{meta.connection?.providerName||"Meta"}</strong>
      <p className={styles.muted}>{localized("Acceso autorizado hasta: ","Access expires: ")}{meta.connection?.expiresAt?new Date(meta.connection.expiresAt).toLocaleDateString():"—"}</p>
      <button className={styles.secondary} disabled={!!busy} onClick={disconnect}>{localized("Desconectar","Disconnect")}</button>
     </div>
     <div className={styles.fields}>
      <label>{localized("Cuenta publicitaria","Ad account")}<select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>
       <option value="">{localized("Seleccionar cuenta autorizada","Select authorized account")}</option>
       {meta.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.id}{a.status!==1?" (inactiva)":""}</option>)}
      </select></label>
      <button className={styles.primary} disabled={!!busy||!selectedAccount||selectedAccount===meta.connection?.selectedAccountId} onClick={chooseAccount}>{localized("Confirmar cuenta","Confirm account")}</button>
      <small>{localized("El piloto admite cuentas activas en USD. Meta cobra el presupuesto directamente al negocio.","The pilot supports active USD accounts. Meta bills ad spend directly to the business.")}</small>
     </div>
    </div>}
  </section>
  {meta.connected&&meta.connection?.selectedAccountId?<section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>03 · {localized("CREACIÓN","CREATION")}</span><h2>{localized("Crear anuncio de tráfico web","Create a website traffic ad")}</h2></div></div>
   <p className={styles.muted}>{localized("Para empezar, solo tráfico web hacia una URL HTTPS, audiencia general de Estados Unidos y máximo 30 días. Otros objetivos y audiencias requieren validación adicional.","Initial support: website traffic to an HTTPS URL, broad US audiences and up to 30 days. Other objectives and audiences require additional validation.")}</p>
   <div className={styles.fieldsGrid}>
    <label>{localized("Nombre de la campaña","Campaign name")}<input maxLength={80} value={form.name} onChange={e=>patch("name",e.target.value)} placeholder="Promoción de noviembre"/></label>
    <label>{localized("Página de Facebook autorizada","Authorized Facebook Page")}<select value={form.pageId} onChange={e=>patch("pageId",e.target.value)}>
     <option value="">{localized("Seleccionar página","Choose Page")}</option>{meta.pages.map(p=><option key={p.id} value={p.id}>{p.name}{p.instagramUsername?" · @"+p.instagramUsername:""}</option>)}
    </select></label>
    <label>{localized("Plataformas Meta","Meta placements")}<select value={form.placements} onChange={e=>patch("placements",e.target.value)}>
     <option value="facebook">Facebook</option><option value="facebook_instagram" disabled={!selectedPage?.instagramId}>Facebook + Instagram</option>
    </select></label>
    <label>{localized("Página de destino HTTPS","HTTPS destination URL")}<input inputMode="url" value={form.destination} onChange={e=>patch("destination",e.target.value)} placeholder="https://tunegocio.com/oferta"/></label>
    <label>{localized("Título del anuncio","Ad headline")}<input maxLength={80} value={form.headline} onChange={e=>patch("headline",e.target.value)} placeholder={localized("Descubre nuestra oferta","Discover our offer")}/></label>
    <label>{localized("Presupuesto diario (USD)","Daily ad budget (USD)")}<input type="number" min="5" max="250" step="0.01" value={form.dailyBudget} onChange={e=>patch("dailyBudget",e.target.value)}/></label>
    <label>{localized("Días de duración","Duration (days)")}<input type="number" min="1" max="30" value={form.durationDays} onChange={e=>patch("durationDays",e.target.value)}/></label>
    <label className={styles.wide}>{localized("Texto del anuncio","Ad message")}<textarea maxLength={500} rows={4} value={form.message} onChange={e=>patch("message",e.target.value)} placeholder={localized("Escribe qué ofreces y por qué visitar tu web","Describe your offer and why visitors should click")}/></label>
    <div className={styles.wide}>
     <label>{localized("Imagen del anuncio (JPG/PNG, máximo 3 MB)","Ad image (JPG/PNG, up to 3 MB)")}<input type="file" accept="image/jpeg,image/png" onChange={e=>{
      setImage(e.target.files?.[0]||null);setImageHash("");setDraftId("");setDraftKey(crypto.randomUUID());
     }}/></label>
     <div className={styles.inlineActions}><button disabled={!!busy||!image} onClick={upload} className={styles.secondary}>{busy==="image"?localized("Subiendo…","Uploading…"):localized("Subir a Meta","Upload to Meta")}</button>
      {imageHash?<span className={styles.connected}>{localized("Imagen preparada","Image ready")}</span>:null}</div>
    </div>
   </div>
   <label className={styles.permission}><input type="checkbox" checked={noBusinessCategories} onChange={e=>patch("specialCategoriesAcknowledged",e.target.checked)}/>
    <span>{localized("Confirmo que esta campaña no promociona vivienda, empleo, crédito ni otra categoría especial o regulada. Es mi responsabilidad declarar correctamente esas categorías y cumplir las políticas de Meta.","I confirm this campaign does not promote housing, employment, credit or other regulated/special categories. I am responsible for correct declarations and Meta policy compliance.")}</span></label>
   <div className={styles.budget}>
    <div><small>{localized("Presupuesto publicitario máximo definido","Defined maximum advertising budget")}</small><strong>{Number.isInteger(total)&&total>0?money(total):"—"}</strong></div>
    <p>{localized("No se cobra ahora. Meta cobrará a tu cuenta únicamente si autorizas la publicación y la plataforma comienza a mostrar anuncios. La tarifa de VMV se cobra por separado.","No charge now. Meta will bill your ad account only after you authorize publishing and ads are delivered. VMV's fee is separate.")}</p>
   </div>
   <button className={styles.primary} disabled={!!busy||!imageHash||!form.specialCategoriesAcknowledged||!form.pageId} onClick={saveDraft}>{busy==="draft"?localized("Guardando…","Saving…"):localized("Guardar propuesta de anuncio","Save ad proposal")}</button>
  </section>:null}
  <section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>04 · {localized("CONTROL","CONTROL")}</span><h2>{localized("Campañas preparadas","Prepared campaigns")}</h2></div>
    <button className={styles.secondary} disabled={!!busy||loading} onClick={()=>void reload()}>{localized("Actualizar","Refresh")}</button></div>
   {campaigns.length===0?<p className={styles.muted}>{localized("Todavía no hay campañas creadas en VMV.","No VMV campaigns created yet.")}</p>:
   <div className={styles.history}>{campaigns.map(c=><div key={c.id} className={styles.historyCard}>
    <div className={styles.historyHead}><div><strong>{c.draft.name}</strong><small>{new Date(c.created_at).toLocaleDateString()} · {c.ad_account_id}</small></div>
     <span className={c.status==="active"?styles.live:styles.pilot}>{c.status.toUpperCase()}</span></div>
    <p>{c.draft.headline} · {c.draft.placements==="facebook"?"Facebook":"Facebook + Instagram"}</p>
    <p>{localized("Presupuesto máximo: ","Maximum budget: ")}<strong>{money(c.draft.totalBudgetCents)}</strong> · {c.draft.durationDays} {localized("días","days")}</p>
    <div className={styles.inlineActions}>
     {c.status==="draft"?<button disabled={!!busy} className={styles.primary} onClick={()=>createPaused(c.id,c.draft.totalBudgetCents)}>{localized("Aprobar y crear PAUSADA","Approve and create PAUSED")}</button>:null}
     {c.status==="paused"&&publishReady?<button disabled={!!busy} className={styles.primary} onClick={()=>publish(c)}>{localized("Autorizar publicación y gasto","Authorize publishing and spend")}</button>:null}
     {["active","activation_pending","paused"].includes(c.status)?<button disabled={!!busy} className={styles.secondary} onClick={()=>pause(c)}>{localized("Pausar en Meta","Pause in Meta")}</button>:null}
     {c.provider_campaign_id?<button disabled={!!busy} className={styles.secondary} onClick={()=>void metrics(c)}>{localized("Métricas reales (7 días)","Real metrics (7 days)")}</button>:null}
    </div>
    {c.error_code?<p className={styles.warning}>{localized("Revisión necesaria: ","Review required: ")}{c.error_code}</p>:null}
    {insights[c.id]?<div className={styles.insights}>{insights[c.id].length?
     insights[c.id].map((v,i)=><p key={i}>{localized("Gasto","Spend")}: {v.spend||"0"} · {localized("Impresiones","Impressions")}: {v.impressions||"0"} · {localized("Clics","Clicks")}: {v.clicks||"0"}</p>):
     <p>{localized("Meta no ha informado resultados para este periodo.","No metrics reported by Meta in this period.")}</p>}</div>:null}
   </div>)}</div>}
  </section>
  <p className={styles.foot}>{localized("VMV no recopila tu contraseña de Facebook. Todas las campañas se crean pausadas; la publicación de pago está desactivada hasta completar verificación de permisos y pruebas de cobro.","VMV never asks for your Facebook password. All ads are created paused; paid publishing is disabled until permissions and billing tests are complete.")}</p>
 </div>;
}
