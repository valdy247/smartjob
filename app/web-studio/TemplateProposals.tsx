"use client";
import {Component,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {Render} from "@puckeditor/core";
import {createPortal} from "react-dom";
import {Monitor,Smartphone} from "lucide-react";
import {ArrowLeft,ArrowRight,Check,LayoutTemplate} from "lucide-react";
import {builderConfig} from "@/lib/web-builder-puck";
import {createSiteProposals,FAMILIES,familyForCategory,type SiteFamily,type SiteIntake,type SiteProposal} from "@/lib/web-builder-templates";
import styles from "./TemplateProposals.module.css";

class SafePreview extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  return this.state.failed?<div role="status" style={{padding:24,textAlign:"center",color:"#79658c",fontSize:13,lineHeight:1.6}}>
   La vista previa no se pudo dibujar, pero tu propuesta sigue disponible. Puedes abrirla en el editor para revisarla.
  </div>:this.props.children;
 }
}
/** A real iframe viewport: media queries run at the selected phone/desktop width,
 * unlike scaling desktop markup inside a small container. */
function ResponsiveProposal({proposal,viewport}:{proposal:SiteProposal;viewport:"desktop"|"mobile"}){
 const frame=useRef<HTMLIFrameElement>(null);
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  const iframe=frame.current,doc=iframe?.contentDocument;
  if(!iframe||!doc)return;
  doc.open();
  doc.write('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>');
  doc.close();
  const original=document.head.querySelectorAll('link[rel="stylesheet"],style');
  for(const sheet of Array.from(original))doc.head.appendChild(sheet.cloneNode(true));
  const base=doc.createElement("style");
  base.textContent="html,body{margin:0;padding:0;overflow-x:hidden}body{min-width:0}.vmv-site{min-height:100vh!important}";
  doc.head.appendChild(base);
  setHost(doc.body);
  return()=>setHost(null);
 },[viewport]);
 return <div className={styles.responsivePreview} data-viewport={viewport}>
  <iframe key={viewport} ref={frame} title={"Vista previa "+(viewport==="mobile"?"móvil":"escritorio")}
   className={styles.previewIframe} loading="eager"/>
  {host?createPortal(<SafePreview><Render config={builderConfig} data={proposal.data}/></SafePreview>,host):null}
 </div>;
}
type Props={input:SiteIntake;familyOverride?:SiteFamily;generated?:SiteProposal|null;busy:boolean;onBack:()=>void;onChoose:(proposal:SiteProposal)=>void};
export default function TemplateProposals({input,familyOverride,generated,busy,onBack,onChoose}:Props){
 const family=familyOverride||familyForCategory(input.categoryId);
 const proposals=useMemo(()=>generated?[generated]:createSiteProposals(input,family),[input,family,generated]);
 const activeFamily=FAMILIES.find(item=>item.id===family);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 const [index,setIndex]=useState(0);
 const [viewport,setViewport]=useState<"desktop"|"mobile">("desktop");
 useEffect(()=>{setIndex(0);scrollRef.current?.scrollTo({left:0,behavior:"instant"});},[input,generated]);
 function move(next:number){
  const bounded=Math.max(0,Math.min(proposals.length-1,next));
  setIndex(bounded);
  const container=scrollRef.current,card=container?.children.item(bounded) as HTMLElement|null;
  if(container&&card)container.scrollTo({left:card.offsetLeft-container.offsetLeft,behavior:"smooth"});
 }
 function onScroll(){
  const container=scrollRef.current;if(!container)return;
  const cards=Array.from(container.children) as HTMLElement[];
  const nearest=cards.reduce((best,card,i)=>
   Math.abs(card.offsetLeft-container.offsetLeft-container.scrollLeft)<Math.abs(cards[best].offsetLeft-container.offsetLeft-container.scrollLeft)?i:best,0);
  setIndex(nearest);
 }
 return <section className={styles.root} aria-label="Propuestas de diseño de tu web">
  <button className={styles.back} type="button" onClick={onBack}><ArrowLeft size={16}/> Datos del negocio</button>
  <header className={styles.heading}>
   <span><LayoutTemplate size={16}/> {activeFamily?.name||"Diseño web"}</span>
   <h2>{generated?(generated.aiGenerated?"Tu web creada con IA. Lista para revisar.":"Tu propuesta está lista para revisar."):"Tres estilos. Tu identidad."}</h2>
   <p>{generated?"Revisa los datos y fotos antes de publicar.":"Diseños editables con tus datos, sin inventar precios ni reseñas."}</p>
   {generated?<div className={styles.viewportControls} role="group" aria-label="Vista previa por dispositivo">
    <button type="button" aria-pressed={viewport==="desktop"} onClick={()=>setViewport("desktop")}><Monitor size={16}/> Escritorio</button>
    <button type="button" aria-pressed={viewport==="mobile"} onClick={()=>setViewport("mobile")}><Smartphone size={16}/> Móvil</button>
   </div>:null}
  </header>
  <div className={styles.carousel} data-single={Boolean(generated)} ref={scrollRef} onScroll={onScroll}>
   {proposals.map((proposal,i)=><article key={proposal.id} className={styles.card}>
    <div className={styles.cardTitle}>
     <span className={styles.index}>{String(i+1).padStart(2,"0")}</span>
     <div><h3>{proposal.name}</h3><p>{proposal.subtitle}</p></div>
    </div>
    {proposal.seoTitle?<div className={styles.seoPreview}>
     <strong>Vista SEO · título</strong><span>{proposal.seoTitle}</span>
     <small>{proposal.seoDescription}</small>
    </div>:null}
    <div className={styles.websiteFrame} data-responsive={Boolean(generated)}>
     {generated?<ResponsiveProposal proposal={proposal} viewport={viewport}/>:
      <div className={styles.scale}><SafePreview><Render config={builderConfig} data={proposal.data}/></SafePreview></div>}
    </div>
    <div className={styles.cardFooter}>
     <span><Check size={14}/> Personalizable</span>
     <button type="button" disabled={busy} onClick={()=>onChoose(proposal)}>
      {busy?"Creando…":generated?"Abrir mi web editable":"Elegir este diseño"} <ArrowRight size={16}/>
     </button>
    </div>
   </article>)}
  </div>
  <div className={styles.bottom}>
   {!generated?<><div className={styles.dots} aria-label="Posición de las propuestas">
    {proposals.map((p,i)=><button key={p.id} type="button"
     aria-label={"Ir a propuesta "+(i+1)} aria-current={index===i?"step":undefined}
     onClick={()=>move(i)} />)}
   </div>
   <div className={styles.nav}>
    <button type="button" aria-label="Propuesta anterior" disabled={index===0} onClick={()=>move(index-1)}><ArrowLeft size={17}/></button>
    <span>{index+1} de {proposals.length}</span>
    <button type="button" aria-label="Propuesta siguiente" disabled={index===proposals.length-1} onClick={()=>move(index+1)}><ArrowRight size={17}/></button>
   </div></>:null}
  </div>
  <p className={styles.note}>Podrás editar todo antes de publicar. Sin publicación automática.</p>
 </section>;
}
