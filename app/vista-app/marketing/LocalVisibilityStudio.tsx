"use client";
import {useEffect,useState} from "react";
import {ArrowUpRight,CheckCircle2,ChevronDown,ClipboardCopy,ExternalLink,Globe2,MapPinned,RefreshCw,Search,ShieldCheck,TrendingUp} from "lucide-react";
import styles from "./LocalVisibilityStudio.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";


export type LocalProfile={
 business:string;industry:string;website:string;phone:string;address:string;
 city:string;region:string;postal:string;hours:string;description:string;
};
type EditableKey=Exclude<keyof LocalProfile,"industry">;
type ListingStatus="not_started"|"in_progress"|"self_reported";
type Audit={scores:{performance:number|null;seo:number|null;accessibility:number|null};
 recommendations:string[];source:string;website:string;analyzedAt:string;note:string};
const directories=[
 {id:"google",name:"Google Business Profile",url:"https://business.google.com/add",note:"Búsqueda y Google Maps · Requiere reclamar y verificar el negocio",method:"Sincronización futura con Web Services: API sujeta a aprobación"},
 {id:"bing",name:"Bing Places",url:"https://www.bing.com/forbusiness",note:"Bing y Bing Maps · Puede importar datos desde Google",method:"Registro y verificación gratuitos en Bing"},
 {id:"apple",name:"Apple Business Connect",url:"https://businessconnect.apple.com/",note:"Apple Maps y Siri · Registro empresarial gratuito",method:"Edición desde Apple; APIs avanzadas para socios autorizados"},
 {id:"yelp",name:"Yelp for Business",url:"https://biz.yelp.com/",note:"Directorio y reputación local · Reclama tu ficha",method:"Publicación mediante portal; integración de gestión exige acuerdo con Yelp"}
] as const;
const serviceCodeByDirectory={google:"google_profile",bing:"bing_places",apple:"apple_maps",yelp:"yelp_profile"} as const;

function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}){
 return <label className={styles.field}><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={250}/></label>;
}


export default function LocalVisibilityStudio({profile,onChange,onRequestHelp}:{
 profile:LocalProfile;onChange:(key:EditableKey,value:string)=>void;
 onRequestHelp?:(service:"google_profile"|"bing_places"|"apple_maps"|"yelp_profile")=>void;
}){
 const {language,translate}=useInterfaceLanguage();
  const [hideAddress,setHideAddress]=useState(true);
 const [listingStatus,setListingStatus]=useState<Record<string,ListingStatus>>({});
 const statusLabels:Record<ListingStatus,string>={not_started:translate("marketing.visibility.not_started"),in_progress:translate("marketing.visibility.in_progress"),self_reported:translate("marketing.visibility.completed_self_reported")};
 const [notice,setNotice]=useState("");
 const [audit,setAudit]=useState<Audit|null>(null);
 const [auditError,setAuditError]=useState("");
 const [auditing,setAuditing]=useState(false);
 useEffect(()=>{setNotice("");setAuditError("");},[language]);
 const details=[
  ["Nombre",profile.business.trim()],["Sector",profile.industry.trim()&&profile.industry!==translate("marketing.visibility.not_specified")?profile.industry:""],
  ["Teléfono",profile.phone.trim()],["Ciudad",profile.city.trim()],["Estado / región",profile.region.trim()],
  ["Horario",profile.hours.trim()],["Descripción",profile.description.trim()]
 ];
 const ready=details.filter(([,value])=>Boolean(value)).length;
 const exportText=[
  "FICHA EMPRESARIAL · VMV BUSINESS",
  translate("marketing.visibility.export_name")+(profile.business.trim()||translate("marketing.visibility.not_specified")),
  translate("marketing.visibility.export_industry")+profile.industry,
  translate("marketing.visibility.export_phone")+(profile.phone.trim()||translate("marketing.visibility.not_specified")),
  translate("marketing.visibility.export_location")+(hideAddress?translate("marketing.visibility.export_service_area"):([profile.address.trim(),profile.city.trim(),profile.region.trim(),profile.postal.trim()].filter(Boolean).join(", ")||translate("marketing.visibility.not_specified"))),
  translate("marketing.visibility.export_hours")+(profile.hours.trim()||translate("marketing.visibility.not_specified")),
  translate("marketing.visibility.export_website")+(profile.website.trim()||translate("marketing.visibility.not_specified")),
  translate("marketing.visibility.export_description")+(profile.description.trim()||translate("marketing.visibility.not_specified"))
 ].join("\n");
 const copyProfile=async()=>{
  try{await navigator.clipboard.writeText(exportText);setNotice(translate("marketing.visibility.business_profile_copied_review_the_details_before_su"));}
  catch{setNotice(translate("marketing.visibility.couldn_t_copy_select_and_copy_the_information_manual"));}
 };
 const auditSite=async()=>{
  setAudit(null);setAuditError("");
  if(!profile.website.trim()){setAuditError(translate("marketing.visibility.enter_your_public_website_address_to_analyze_it"));return;}
  let parsed:URL;
  try{parsed=new URL(profile.website.trim());if(!["http:","https:"].includes(parsed.protocol))throw new Error();}
  catch{setAuditError(translate("marketing.visibility.enter_the_full_website_url_for_example_https_mybusin"));return;}
  setAuditing(true);
  try{
   const response=await fetch("/api/marketing/site-audit?url="+encodeURIComponent(parsed.toString())+"&lang="+language);
   const result=await response.json() as Audit&{error?:string};
   if(!response.ok)throw new Error(result.error||translate("marketing.visibility.couldn_t_analyze_the_website"));
   setAudit(result);
  }catch(err){setAuditError(err instanceof Error?err.message:translate("marketing.visibility.couldn_t_analyze_the_website"));}
  finally{setAuditing(false);}
 };
 return <div className={styles.root}>
  <header className={styles.header}>
   <span className={styles.overline}><MapPinned size={16}/> {translate("marketing.visibility.local_visibility_pilot")}</span>
   <h2>{translate("marketing.visibility.help_customers_find_your_business")}</h2>
   <p>{translate("marketing.visibility.a_consistent_business_listing_for_search_engines_and")}</p>
  </header>
  <div className={styles.summary}>
   <div><strong>{ready} de {details.length}</strong><span>{translate("marketing.visibility.essential_details_completed")}</span></div>
   <div><strong>{Object.values(listingStatus).filter(v=>v==="in_progress"||v==="self_reported").length} de {directories.length}</strong><span>{translate("marketing.visibility.directories_started_self_reported")}</span></div>
  </div>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>{translate("marketing.visibility.01_one_business_profile")}</span><h3>{translate("marketing.visibility.information_for_directories")}</h3></div><button type="button" onClick={()=>void copyProfile()} className={styles.copy}><ClipboardCopy size={16}/> {translate("marketing.visibility.copy_business_profile")}</button></div>
   <p className={styles.muted}>{translate("marketing.visibility.use_the_same_official_business_name_phone_and_locati")}</p>
   <div className={styles.grid}>
    <Field label={translate("marketing.visibility.business_name")} value={profile.business} onChange={v=>onChange("business",v)} placeholder={translate("marketing.visibility.your_official_business_name")}/>
    <div className={styles.readonlyField}><span>{translate("marketing.visibility.industry")}</span><strong>{profile.industry||translate("marketing.visibility.not_specified")}</strong><small>{translate("marketing.visibility.selected_in_diagnosis")}</small></div>
    <Field label={translate("marketing.visibility.business_phone")} value={profile.phone} onChange={v=>onChange("phone",v)} placeholder="+1 555 123 4567"/>
    <Field label={translate("marketing.visibility.city")} value={profile.city} onChange={v=>onChange("city",v)} placeholder={translate("marketing.visibility.city_where_you_operate")}/>
    <Field label={translate("marketing.visibility.state_or_region")} value={profile.region} onChange={v=>onChange("region",v)} placeholder="Georgia"/>
    <Field label={translate("marketing.visibility.website_optional")} value={profile.website} onChange={v=>{onChange("website",v);setAudit(null);setAuditError("");}} placeholder="https://tusitio.com"/>
   </div>
   <details className={styles.extras}>
    <summary><span><strong>{translate("marketing.visibility.hours_address_and_description")}</strong><small>{translate("marketing.visibility.optional_details_finish_them_later")}</small></span><ChevronDown size={18}/></summary>
    <div className={styles.extraBody}>
     <Field label={translate("marketing.visibility.business_hours")} value={profile.hours} onChange={v=>onChange("hours",v)} placeholder={translate("marketing.visibility.hoursExample")}/>
     <div className={styles.hoursPresets} aria-label={translate("marketing.visibility.typical_hours")}>
      {([
       ["Lun–Vie","Lun–Vie 9:00–17:00"],["Todos los días","Lun–Dom 9:00–17:00"],["Con cita","Solo con cita previa"]
      ] as const).map(([label,value])=><button type="button" key={label} onClick={()=>onChange("hours",value)} aria-pressed={profile.hours===value}>{label}</button>)}
     </div>
     <Field label={translate("marketing.visibility.zip_code")} value={profile.postal} onChange={v=>onChange("postal",v)} placeholder="31901"/>
     <label className={styles.privacy}><input type="checkbox" checked={hideAddress} onChange={e=>setHideAddress(e.target.checked)}/><span>{translate("marketing.visibility.my_address_is_private_do_not_include_it_in_copied_di")}</span></label>
     {!hideAddress?<Field label={translate("marketing.visibility.public_business_address")} value={profile.address} onChange={v=>onChange("address",v)} placeholder={translate("marketing.visibility.only_if_you_serve_customers_at_this_address")}/>:null}
     <label className={styles.description}><span>{translate("marketing.visibility.short_business_description")}</span><textarea value={profile.description} onChange={e=>onChange("description",e.target.value)} maxLength={500} rows={3} placeholder={translate("marketing.visibility.what_you_offer_whom_you_help_and_where_you_serve_cus")}/><small>{translate("marketing.visibility.describe_real_services_without_fabricated_claims")}</small></label>
    </div>
   </details>
   {notice?<p className={styles.notice} role="status">{notice}</p>:null}
  </section>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>{translate("marketing.visibility.02_free_directories")}</span><h3>{translate("marketing.visibility.be_where_customers_search")}</h3></div></div>
   <p className={styles.muted}>{translate("marketing.visibility.before_creating_a_listing_check_whether_one_already_")}</p>
   <div className={styles.directories}>
    {directories.map(item=><article key={item.id} className={styles.directory}>
     <div className={styles.dirHeading}><div><strong>{item.name}</strong><p>{({google:translate("marketing.visibility.google_search_and_maps_claim_and_verify_your_busines"),bing:translate("marketing.visibility.bing_and_bing_maps_may_import_details_from_google"),apple:translate("marketing.visibility.apple_maps_and_siri_free_business_listing"),yelp:translate("marketing.visibility.local_directory_and_reputation_claim_your_listing")} as Record<string,string>)[item.id]}</p></div><span className={styles.status}>{statusLabels[listingStatus[item.id]||"not_started"]}</span></div>
     <small>{({google:translate("marketing.visibility.future_sync_with_web_services_api_subject_to_approva"),bing:translate("marketing.visibility.free_listing_and_verification_on_bing"),apple:translate("marketing.visibility.editing_through_apple_advanced_apis_for_approved_par"),yelp:translate("marketing.visibility.publish_via_portal_management_integration_requires_a")} as Record<string,string>)[item.id]}</small>
     <div className={styles.directoryActions}>
      {onRequestHelp?<button type="button" className={styles.requestHelp} onClick={()=>onRequestHelp(serviceCodeByDirectory[item.id])}>{translate("marketing.visibility.request_vmv_assistance")}</button>:null}
      <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> {translate("marketing.visibility.open_official_portal")}</a>
      <select aria-label={translate("marketing.visibility.status_of")+" "+item.name} value={listingStatus[item.id]||"not_started"} onChange={e=>setListingStatus(prev=>({...prev,[item.id]:e.target.value as ListingStatus}))}>
       <option value="not_started">{translate("marketing.visibility.not_started")}</option>
       <option value="in_progress">{translate("marketing.visibility.in_progress")}</option>
       <option value="self_reported">{translate("marketing.visibility.i_completed_it")}</option>
      </select>
     </div>
    </article>)}
   </div>
   <p className={styles.fine}>{translate("marketing.visibility.statuses_are_shown_only_in_this_trial_session_they_d")}</p>
  </section>
  <section className={styles.panel}>
   <div className={styles.sectionHeader}><div><span>{translate("marketing.visibility.03_free_api")}</span><h3>{translate("marketing.visibility.technical_website_audit")}</h3></div><span className={styles.apiTag}><Globe2 size={14}/> PageSpeed Insights</span></div>
   <p className={styles.muted}>{translate("marketing.visibility.we_analyze_technical_seo_and_mobile_speed_opportunit")}</p>
   <button type="button" className={styles.auditButton} disabled={auditing} onClick={()=>void auditSite()}><Search size={17}/>{auditing?translate("marketing.visibility.analyzing_website"):translate("marketing.visibility.analyze_my_site_for_free")}{auditing?<RefreshCw className={styles.spin} size={15}/>:<ArrowUpRight size={15}/>}</button>
   {auditError?<div className={styles.auditFallback} role="alert"><p className={styles.error}>{auditError}</p>
    <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> {translate("marketing.visibility.open_free_google_pagespeed")}</a>
   </div>:null}
   {audit?<div className={styles.auditResult}>
    <div className={styles.scores}>
     {([[translate("marketing.visibility.mobile_speed"),audit.scores.performance],[translate("marketing.visibility.technical_seo"),audit.scores.seo],[translate("marketing.visibility.accessibility"),audit.scores.accessibility]] as const).map(([label,value])=><div key={label}><strong>{value===null?"—":value+"/100"}</strong><span>{label}</span><small>{value===null?translate("marketing.visibility.no_data"):value>=90?translate("marketing.visibility.good"):value>=50?translate("marketing.visibility.needs_improvement"):translate("marketing.visibility.priority")}</small></div>)}
    </div>
    {audit.recommendations.length>0?<div className={styles.opportunities}><strong><TrendingUp size={16}/> {translate("marketing.visibility.potential_improvements_found")}</strong><ul>{audit.recommendations.map((r,i)=><li key={i}>{r}</li>)}</ul></div>:<p className={styles.muted}><CheckCircle2 size={16}/> {translate("marketing.visibility.no_alerts_were_found_in_the_selected_basic_checks")}</p>}
    <p className={styles.fine}><ShieldCheck size={14}/> {translate("marketing.visibility.source")} {audit.source}. {translate("marketing.visibility.export_results_vary")}</p>
   </div>:null}
  </section>
 </div>;
}
