"use client";

import {useEffect,useRef,useState} from "react";
import {useGetPuck,type Data} from "@puckeditor/core";
import {createPortal} from "react-dom";
import {
 AlignLeft,ArrowLeftRight,BookOpen,Check,Clock,Columns2,
 Contact,HelpCircle,Image,Images,LayoutTemplate,ListOrdered,
 MessageSquare,Minus,MousePointerClick,Package,Plus,Search,
 ShoppingBag,ShoppingCart,Square,Type,Users,Workflow,X
} from "lucide-react";
import {builderConfig,validateBuilderDocument} from "@/lib/web-builder-puck";
import styles from "./BuilderQuickAdd.module.css";

type AvailableType=
 "ComposeHeading"|"ComposeText"|"ComposeImage"|"ComposeButton"|
 "HeroVisual"|"OfferingGrid"|"PhotoGallery"|"ProjectShowcase"|
 "ProcessSteps"|"HoursArea"|"TeamGrid"|"PricingList"|"BeforeAfter"|
 "FAQList"|"Contact"|"CTA"|"SectionLayout"|"ColumnsLayout"|"Spacer";
type Shortcut={type:AvailableType;title:string;hint:string;icon:typeof Plus;
 category:"Contenido"|"Negocio"|"Diseño";preset?:Record<string,unknown>};
const shortcuts:Shortcut[]=[
 {type:"ComposeHeading",title:"Título",hint:"Texto grande editable",icon:Type,category:"Contenido"},
 {type:"ComposeText",title:"Descripción",hint:"Párrafo de texto",icon:AlignLeft,category:"Contenido"},
 {type:"ComposeImage",title:"Imagen",hint:"Foto o ilustración",icon:Image,category:"Contenido"},
 {type:"ComposeButton",title:"Botón",hint:"Texto, color y enlace",icon:MousePointerClick,category:"Contenido"},
 {type:"HeroVisual",title:"Portada",hint:"Texto e imagen destacada",icon:LayoutTemplate,category:"Contenido"},
 {type:"OfferingGrid",title:"Productos",hint:"Catálogo, fotos y precios opcionales",icon:ShoppingBag,category:"Negocio",
  preset:{title:"Productos",description:"",items:[],showPrices:"yes"}},
 {type:"OfferingGrid",title:"Servicios",hint:"Lista visual de servicios",icon:Package,category:"Negocio",
  preset:{title:"Servicios",description:"",items:[],showPrices:"no"}},
 {type:"PhotoGallery",title:"Galería",hint:"Fotos en cuadrícula",icon:Images,category:"Negocio"},
 {type:"ProjectShowcase",title:"Proyectos",hint:"Trabajos realizados",icon:BookOpen,category:"Negocio"},
 {type:"ProcessSteps",title:"Proceso",hint:"Cómo trabajamos",icon:Workflow,category:"Negocio"},
 {type:"HoursArea",title:"Horarios",hint:"Horario y zona de atención",icon:Clock,category:"Negocio"},
 {type:"PricingList",title:"Precios",hint:"Lista editable, sin pagos",icon:ListOrdered,category:"Negocio"},
 {type:"FAQList",title:"Preguntas",hint:"Preguntas frecuentes",icon:HelpCircle,category:"Negocio"},
 {type:"TeamGrid",title:"Equipo",hint:"Personas del negocio",icon:Users,category:"Negocio"},
 {type:"BeforeAfter",title:"Antes / Después",hint:"Comparación de fotos",icon:ArrowLeftRight,category:"Negocio"},
 {type:"Contact",title:"Contacto",hint:"Correo, teléfono y dirección",icon:Contact,category:"Negocio"},
 {type:"CTA",title:"Llamada a la acción",hint:"Invitar a solicitar información",icon:MessageSquare,category:"Negocio",
  preset:{title:"¿Hablamos?",description:"",buttonText:"Contactar",buttonUrl:"#contacto"}},
 {type:"SectionLayout",title:"Contenedor",hint:"Agrupa elementos a tu gusto",icon:Square,category:"Diseño"},
 {type:"ColumnsLayout",title:"2 columnas",hint:"Distribución adaptable",icon:Columns2,category:"Diseño",
  preset:{columns:"2",left:[],right:[],third:[]}},
 {type:"Spacer",title:"Espacio",hint:"Separación entre secciones",icon:Minus,category:"Diseño"}
];
const sections=["Contenido","Negocio","Diseño"] as const;
function makeComponent(entry:Shortcut){
 const componentConfig=(builderConfig.components as Record<string,{defaultProps?:Record<string,unknown>}>)[entry.type];
 const defaults=JSON.parse(JSON.stringify(componentConfig?.defaultProps||{})) as Record<string,unknown>;
 return {type:entry.type,props:{...defaults,...entry.preset,id:crypto.randomUUID()}};
}
export default function BuilderQuickAdd({enabled=true,compact=false}:{enabled?:boolean;compact?:boolean}){
 const [opened,setOpened]=useState(false);
 const [mounted,setMounted]=useState(false);
 const [filter,setFilter]=useState("");
 const [error,setError]=useState("");
 const [added,setAdded]=useState("");
 const [pendingSelection,setPendingSelection]=useState<string|null>(null);
 const menuRef=useRef<HTMLDivElement>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);
 const getPuck=useGetPuck();
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{if(!enabled)setOpened(false);},[enabled]);
 useEffect(()=>{
  if(!opened)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){
    setOpened(false);
    triggerRef.current?.focus();
   }
  };
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  document.addEventListener("keydown",onKey);
  const focus=window.setTimeout(()=>menuRef.current?.querySelector<HTMLInputElement>("input")?.focus(),0);
  return()=>{window.clearTimeout(focus);document.removeEventListener("keydown",onKey);document.body.style.overflow=previousOverflow;};
 },[opened]);
 useEffect(()=>{if(!added)return;const timeout=window.setTimeout(()=>setAdded(""),3800);return()=>window.clearTimeout(timeout);},[added]);
 useEffect(()=>{
  if(!pendingSelection)return;
  let attempts=0,frame=0,cancelled=false;
  const select=()=>{
   if(cancelled)return;
   const api=getPuck();
   const selector=api.getSelectorForId(pendingSelection);
   if(selector){
    // Only select after the new node is known to Puck. Never dispatch a
    // speculative selector while the editor is still reconciling its data.
    api.dispatch({type:"setUi",ui:{itemSelector:selector}});
    setPendingSelection(null);
   }else if(++attempts<8)frame=requestAnimationFrame(select);
   else setPendingSelection(null);
  };
  frame=requestAnimationFrame(select);
  return()=>{cancelled=true;cancelAnimationFrame(frame);};
 },[pendingSelection,getPuck]);
 function add(entry:Shortcut){
  try{
   const api=getPuck();
   const existing=api.appState.data;
   const node=makeComponent(entry);
   // Add into the root page. The original data and nested slot references remain untouched.
   const next:Data={...existing,content:[...existing.content,node]};
   const issue=validateBuilderDocument(next);
   if(issue)throw new Error(issue);
   api.dispatch({type:"setData",data:next});
   setPendingSelection(node.props.id);

   setAdded(entry.title+" añadido. Selecciónalo para editarlo.");
   setOpened(false);setFilter("");setError("");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo agregar el elemento.");}
 }
 return enabled&&mounted?createPortal(<>
  <button type="button" className={compact?styles.fab+" "+styles.compactFab:styles.fab} ref={triggerRef}
   aria-label="Agregar un elemento o sección" aria-expanded={opened}
   aria-controls="vmv-quick-add-panel"
   onClick={()=>{setOpened(v=>!v);setError("");}}>
   <Plus size={22} strokeWidth={2.5} aria-hidden="true"/>
   <span>Añadir</span>
  </button>
  {added&&!opened?<span className={styles.toast} role="status">
   <Check size={13} aria-hidden="true"/> {added}
  </span>:null}
  {opened?<div className={compact?styles.backdrop+" "+styles.compactBackdrop:styles.backdrop}
   onMouseDown={e=>{if(e.target===e.currentTarget)setOpened(false);}}>
   <div ref={menuRef} role="dialog" aria-modal="true" aria-label="Agregar a mi web"
    id="vmv-quick-add-panel" className={compact?styles.sheet+" "+styles.compactSheet:styles.sheet}>
    <header className={styles.heading}>
     <div><small>WEB STUDIO</small><strong>¿Qué quieres agregar?</strong></div>
     <button type="button" aria-label="Cerrar" onClick={()=>{setOpened(false);triggerRef.current?.focus();}}>
      <X size={19}/>
     </button>
    </header>
    <label className={styles.search}>
     <Search size={16} aria-hidden="true"/>
     <input type="search" placeholder="Buscar título, imagen, producto…" value={filter}
      onChange={e=>setFilter(e.target.value)} aria-label="Buscar elementos"/>
    </label>
    <div className={styles.contents}>
     {sections.map(section=>{
      const list=shortcuts.filter(item=>item.category===section &&
       (item.title+" "+item.hint).toLocaleLowerCase("es").includes(filter.toLocaleLowerCase("es").trim()));
      return list.length?<section key={section}>
       <h3>{section}</h3>
       <div className={styles.grid}>
        {list.map((item,index)=>{
         const Icon=item.icon;
         return <button type="button" key={item.type+":"+item.title}
          onClick={()=>add(item)} className={styles.tile}>
          <span className={styles.icon}><Icon size={19} aria-hidden="true"/></span>
          <strong>{item.title}</strong><small>{item.hint}</small>
         </button>;
        })}
       </div>
      </section>:null;
     })}
     {(!filter||"carrito compras tienda".includes(filter.toLocaleLowerCase("es").trim()))?
      <section className={styles.unavailable}>
       <h3>Comercio</h3>
       <div className={styles.commerce}>
        <ShoppingCart size={19} aria-hidden="true"/>
        <div><strong>Carrito de compras</strong>
         <small>Próximamente. El catálogo ya permite mostrar productos; pagos y pedidos requieren integración.</small>
        </div>
       </div>
      </section>:null}
     {filter&&!shortcuts.some(item=>(item.title+" "+item.hint).toLocaleLowerCase("es").includes(filter.toLocaleLowerCase("es").trim()))&&
      !"carrito compras tienda".includes(filter.toLocaleLowerCase("es").trim())?
      <p className={styles.empty}>No hay elementos con ese nombre.</p>:null}
    </div>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <p className={styles.note}>Se añade al final de esta página. Puedes moverlo después con Puck y editarlo tocándolo. No se publica automáticamente.</p>
   </div>
  </div>:null}
 </>,document.body):null;
}
