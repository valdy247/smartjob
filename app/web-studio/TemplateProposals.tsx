"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Render} from "@puckeditor/core";
import {ArrowLeft,ArrowRight,Check,LayoutTemplate} from "lucide-react";
import {builderConfig} from "@/lib/web-builder-puck";
import {createSiteProposals,FAMILIES,familyForCategory,type SiteFamily,type SiteIntake,type SiteProposal} from "@/lib/web-builder-templates";
import styles from "./TemplateProposals.module.css";

type Props={input:SiteIntake;familyOverride?:SiteFamily;generated?:SiteProposal|null;busy:boolean;onBack:()=>void;onChoose:(proposal:SiteProposal)=>void};
export default function TemplateProposals({input,familyOverride,generated,busy,onBack,onChoose}:Props){
 const family=familyOverride||familyForCategory(input.categoryId);
 const proposals=useMemo(()=>generated?[generated]:createSiteProposals(input,family),[input,family,generated]);
 const activeFamily=FAMILIES.find(item=>item.id===family);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 const [index,setIndex]=useState(0);
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
   <h2>{generated?"Tu web creada con IA. Lista para revisar.":"Tres estilos. Tu identidad."}</h2>
   <p>{generated?"Textos, diseño y SEO personalizados sobre componentes rápidos y editables. Comprueba la información y las fotos antes de publicar.":"Diseños editables con el contenido que acabas de proporcionar. Ningún precio, reseña o dato comercial se ha inventado."}</p>
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
    <div className={styles.websiteFrame}>
     <div className={styles.scale}><Render config={builderConfig} data={proposal.data}/></div>
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
  <p className={styles.note}>Puedes cambiar títulos, fotografías, distribución y colores en el siguiente paso. La web no se publica hasta que lo autorices.</p>
 </section>;
}
