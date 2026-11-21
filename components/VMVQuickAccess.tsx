"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {ArrowUpRight,Check,EyeOff,House,Link2,Plus,RotateCcw,Search,Settings2,Star,Trash2,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {SHORTCUTS_META_KEY,SHORTCUT_LIMIT,HIDDEN_LIMIT,hiddenKey,validHiddenScope,items,fresh,parseState,findShortcut,labelFor,findMatching,safePath,type Shortcut,type ShortcutState} from "@/lib/vmv-quick-access";
import styles from "./VMVQuickAccess.module.css";

type Destination="quick"|"home";
type HiddenRequest={item:Shortcut;scope:string};
type AccessContext={ready:boolean;state:ShortcutState;saveEnabled:(flag:boolean)=>void;pin:(item:Shortcut,dest:Destination)=>boolean;unpin:(id:string,dest:Destination)=>void;hideCard:(entry:HiddenRequest)=>boolean;restoreCard:(scope:string,id:string)=>void;openPicker:()=>void;openMenu:()=>void};
const Context=createContext<AccessContext|null>(null);
const cacheKey=(uid:string)=>"vmv-quick-access:"+uid;
const isAppPath=(path:string)=>path==="/vista-app"||path.startsWith("/vista-app/");
/** Only actual navigable cards can be dismissed, never navigation, forms or destructive controls. */
function hideableCard(node:Element):HTMLElement|null{
 const candidate=node.closest<HTMLElement>("[data-vmv-shortcut-id]")||node.closest<HTMLElement>("button,a[href]");
 if(!candidate||candidate.closest("nav,[role=navigation],[role=tablist],form,[data-vmv-shortcuts-ui]"))return null;
 if(candidate.matches(":disabled")||candidate.getAttribute("aria-disabled")==="true")return null;
 if(!/(?:card|tile|module|feature|catalog|service)/i.test(typeof candidate.className==="string"?candidate.className:""))return null;
 return candidate;
}
function cardScope(card:HTMLElement,pathname:string):string{
 const name=card.closest<HTMLElement>("[data-vmv-shortcut-scope]")?.dataset.vmvShortcutScope||"";
 const suffix=/^[a-z0-9_-]{1,38}$/.test(name)?"#"+name:"";
 return pathname+suffix;
}
function findPressItem(element:Element,pathname:string):Shortcut|null{
 if(element.closest("[data-vmv-shortcuts-ui],input,textarea,select,[contenteditable=true],[role=dialog]"))return null;
 const card=element.closest<HTMLElement>("[data-vmv-shortcut-id],a[href],button");
 if(!card||card.matches(":disabled")||card.getAttribute("aria-disabled")==="true")return null;
 const id=card.closest<HTMLElement>("[data-vmv-shortcut-id]")?.dataset.vmvShortcutId;
 if(id){const known=items.find(x=>x.id===id);if(known)return known;}
 const link=card.closest<HTMLAnchorElement>("a[href]");
 if(link){
  const u=new URL(link.href,window.location.origin);
  if(u.origin!==window.location.origin)return null;
  const href=u.pathname+u.search;
  if(!safePath(href))return null;
  const existing=items.find(x=>x.href===href||x.href.split("?")[0]===href);
  if(existing)return existing;
  const title=(link.getAttribute("aria-label")||link.textContent||"").trim().replace(/\s+/g," ").slice(0,72);
  if(!title)return null;
  const slug=Array.from(href+" "+title).reduce((hash,ch)=>((hash*33)^ch.charCodeAt(0))>>>0,5381).toString(16).padStart(8,"0");
  return {id:"custom:"+slug,es:title,en:title,href,group:"Personalizado"};
 }
 const button=card.closest<HTMLButtonElement>("button");
 if(!button)return null;
 const title=(button.getAttribute("aria-label")||button.textContent||"").trim().replace(/\s+/g," ").slice(0,72);
 if(!title||/^(delete|eliminar|cancelar|cancel|cerrar|close|salir|logout|pagar|pay|confirmar|confirm)$/i.test(title))return null;
 const normalized=title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const found=items.find(x=>[x.es,x.en].some(t=>t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()===normalized));
 if(found)return found;
 // Internal action buttons cannot be replayed safely on another page. Only card-style
 // controls may link back to their actual screen without executing an unintended action.
 const className=typeof button.className==="string"?button.className:"";
 if(!/card|tile|catalog|feature|service/i.test(className)||!safePath(pathname))return null;
 const href=pathname+window.location.search;
 const slug=Array.from(href+" "+title).reduce((hash,ch)=>((hash*33)^ch.charCodeAt(0))>>>0,5381).toString(16).padStart(8,"0");
 return {id:"custom:"+slug,es:title,en:title,href,group:"Personalizado"};
}
export function useVMVQuickAccess(){
 const context=useContext(Context);
 if(!context)throw new Error("VMV Quick Access context missing");
 return context;
}
export function VMVQuickAccessProvider({children}:{children:ReactNode}){
 const pathname=usePathname();
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const [uid,setUid]=useState<string|null>(null);
 const uidRef=useRef<string|null>(null);
 const [state,setState]=useState<ShortcutState>(fresh);
 const stateRef=useRef<ShortcutState>(fresh());
 const [view,setView]=useState<"closed"|"list"|"picker">("closed");
 const [query,setQuery]=useState("");
 const [actionItem,setActionItem]=useState<Shortcut|null>(null);
 const [actionScope,setActionScope]=useState<string|null>(null);
 const [pendingHide,setPendingHide]=useState<HiddenRequest|null>(null);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const queue=useRef<Promise<void>>(Promise.resolve());
 const active=isAppPath(pathname||"");
 useEffect(()=>{
  const client=getSupabase();
  if(!client)return;
  let alive=true;
  const apply=(session:{user?:{id:string;is_anonymous?:boolean;user_metadata?:Record<string,unknown>}}|null)=>{
   if(!alive)return;
   const u=session?.user;
   if(!u||u.is_anonymous){
    uidRef.current=null;setUid(null);stateRef.current=fresh();setState(fresh());setView("closed");setActionItem(null);return;
   }
   if(uidRef.current===u.id)return;
   uidRef.current=u.id;setUid(u.id);
   const cloud=parseState(u.user_metadata?.[SHORTCUTS_META_KEY]);
   let local=fresh();
   try{local=parseState(JSON.parse(window.localStorage.getItem(cacheKey(u.id))||"null"));}catch{}
   const value=local.updatedAt>cloud.updatedAt?local:cloud;
   stateRef.current=value;setState(value);
  };
  const {data:sub}=client.auth.onAuthStateChange((_evt,session)=>apply(session));
  void client.auth.getSession().then(({data})=>apply(data.session)).catch(()=>{});
  const onStorage=(event:StorageEvent)=>{
   if(!uidRef.current||event.key!==cacheKey(uidRef.current))return;
   try{
    const latest=parseState(event.newValue?JSON.parse(event.newValue):null);
    stateRef.current=latest;setState(latest);
   }catch{/* Ignore invalid storage updates from unrelated scripts. */}
  };
  window.addEventListener("storage",onStorage);
  return()=>{alive=false;sub.subscription.unsubscribe();window.removeEventListener("storage",onStorage);};
 },[]);
 const mutate=useCallback((fn:(prev:ShortcutState)=>ShortcutState)=>{
  const user=uidRef.current;
  if(!user)return;
  const next=parseState({...fn(stateRef.current),updatedAt:Date.now()});
  stateRef.current=next;setState(next);setError("");
  try{localStorage.setItem(cacheKey(user),JSON.stringify(next));}
  catch{setError(en?"Can't save shortcuts in this browser.":"No se pudieron guardar los accesos en este navegador.");}
  const client=getSupabase();
  if(client){
   queue.current=queue.current.catch(()=>{}).then(async()=>{
    if(uidRef.current!==user)return;
    const {error:writeError}=await client.auth.updateUser({data:{[SHORTCUTS_META_KEY]:next}});
    if(writeError&&uidRef.current===user)setError(en?"Saved on this device; cloud sync failed.":"Guardado en este dispositivo; falló la sincronización con la cuenta.");
   }).catch(()=>{if(uidRef.current===user)setError(en?"Cloud sync unavailable.":"La sincronización no está disponible.");});
  }
 },[en]);
 const pin=useCallback((item:Shortcut,dest:Destination):boolean=>{
  if(!safePath(item.href))return false;
  if(!uidRef.current)return false;
  const prev=stateRef.current;
  const existing=findShortcut(prev,item.id);
  const array=prev[dest];
  if(array.includes(item.id))return true;
  if(array.length>=SHORTCUT_LIMIT){setError(en?"You reached the shortcut limit.":"Alcanzaste el límite de accesos directos.");return false;}
  const custom=existing||items.some(x=>x.id===item.id)?prev.custom:[...prev.custom,item];
  mutate(old=>({...old,custom,[dest]:[...old[dest],item.id]}));
  setSuccess(en?"Added successfully.":"Acceso añadido.");
  return true;
 },[mutate,en]);
 const unpin=useCallback((id:string,dest:Destination)=>{
  mutate(old=>({...old,[dest]:old[dest].filter(v=>v!==id),
   custom:old.custom.filter(v=>v.id!==id||old.quick.includes(v.id)&&dest==="home"||old.home.includes(v.id)&&dest==="quick"||old.hidden.some(x=>x.id===v.id))}));
 },[mutate]);
 const hideCard=useCallback(({item,scope}:HiddenRequest):boolean=>{
  if(!uidRef.current||!validHiddenScope(scope)||!safePath(item.href))return false;
  const old=stateRef.current;
  if(old.hidden.some(x=>x.scope===scope&&x.id===item.id))return true;
  if(old.hidden.length>=HIDDEN_LIMIT){setError(en?"Too many hidden services. Restore one first.":"Hay demasiados elementos ocultos. Restaura uno primero.");return false;}
  if(!findShortcut(old,item.id)&&old.custom.length>=HIDDEN_LIMIT){setError(en?"Your personalized list is full.":"Tu lista personalizada está llena.");return false;}
  mutate(previous=>({...previous,
   custom:findShortcut(previous,item.id)?previous.custom:[...previous.custom,item],
   hidden:[...previous.hidden,{id:item.id,scope}]
  }));
  setSuccess(en?"Moved to Extra services.":"Movido a Servicios extras.");
  return true;
 },[mutate,en]);
 const restoreCard=useCallback((scope:string,id:string)=>{
  mutate(old=>({...old,hidden:old.hidden.filter(x=>x.scope!==scope||x.id!==id)}));
  setSuccess(en?"Card restored.":"Tarjeta restaurada.");
 },[mutate,en]);
 const openPicker=()=>{setView("picker");setQuery("");setError("");setActionItem(null);};
 const openMenu=()=>{setView("list");setError("");setActionItem(null);};
 useEffect(()=>{
  if(!active||!uid)return;
  const listener=(e:Event)=>{const detail=(e as CustomEvent).detail;if(detail==="picker")openPicker();else openMenu();};
  window.addEventListener("vmv:shortcuts-open",listener);
  return()=>window.removeEventListener("vmv:shortcuts-open",listener);
 },[active,uid]);
 useEffect(()=>{
  if(!active||!uid)return;
  let pressTimer:ReturnType<typeof setTimeout>|null=null;
  let start={x:0,y:0};
  let target:HTMLElement|null=null;
  let fired:HTMLElement|null=null;
  let firedAt=0;
  const clear=()=>{if(pressTimer!==null){clearTimeout(pressTimer);pressTimer=null;}};
  const down=(event:PointerEvent)=>{
   clear();target=null;
   if(event.button!==0)return;
   const element=event.target instanceof Element?event.target:null;
   if(!element)return;
   const entry=findPressItem(element,pathname);
   if(!entry)return;
   target=element.closest<HTMLElement>("[data-vmv-shortcut-id],a[href],button");
   if(!target)return;
   start={x:event.clientX,y:event.clientY};
   pressTimer=setTimeout(()=>{
    fired=target;firedAt=Date.now();
    const card=target?hideableCard(target):null;
    setActionScope(card?cardScope(card,pathname):null);
    setActionItem(entry);setView("closed");setSuccess("");clear();
   },570);
  };
  const move=(event:PointerEvent)=>{if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>13)clear();};
  const click=(event:MouseEvent)=>{
   if(!fired||Date.now()-firedAt>900)return;
   const node=event.target;
   if(node instanceof Node&&fired.contains(node)){event.preventDefault();event.stopImmediatePropagation();fired=null;}
  };
  const contextMenu=(event:MouseEvent)=>{
   const element=event.target instanceof Element?event.target:null;
   if(!element)return;
   const entry=findPressItem(element,pathname);
   if(!entry)return;
   event.preventDefault();
   clear();
   fired=element.closest<HTMLElement>("[data-vmv-shortcut-id],a[href],button");
   firedAt=Date.now();
   const card=hideableCard(element);
   setActionScope(card?cardScope(card,pathname):null);
   setActionItem(entry);setView("closed");setSuccess("");
  };
  document.addEventListener("pointerdown",down,true);
  document.addEventListener("pointermove",move,true);
  document.addEventListener("pointerup",clear,true);
  document.addEventListener("pointercancel",clear,true);
  document.addEventListener("click",click,true);
  document.addEventListener("contextmenu",contextMenu,true);
  return()=>{clear();document.removeEventListener("pointerdown",down,true);document.removeEventListener("pointermove",move,true);document.removeEventListener("pointerup",clear,true);document.removeEventListener("pointercancel",clear,true);document.removeEventListener("click",click,true);document.removeEventListener("contextmenu",contextMenu,true);};
 },[active,uid,pathname]);
 // Hidden cards stay out of this screen as lists load and React re-renders.
 useEffect(()=>{
  if(!active||!uid)return;
  const hidden=new Set(state.hidden.map(x=>hiddenKey(x.scope,x.id)));
  let scheduled=false;
  let frame=0;
  const apply=()=>{
   scheduled=false;
   document.querySelectorAll<HTMLElement>("[data-vmv-shortcut-id],button,a[href]").forEach(node=>{
    const card=hideableCard(node);
    if(!card||card!==node)return;
    const item=findPressItem(card,pathname);
    if(!item)return;
    const shouldHide=hidden.has(hiddenKey(cardScope(card,pathname),item.id));
    if(shouldHide!==card.hasAttribute("data-vmv-hidden-card")){
     if(shouldHide)card.setAttribute("data-vmv-hidden-card","true");
     else card.removeAttribute("data-vmv-hidden-card");
    }
   });
  };
  const schedule=()=>{
   if(scheduled)return;
   scheduled=true;frame=window.requestAnimationFrame(apply);
  };
  apply();
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  return()=>{observer.disconnect();window.cancelAnimationFrame(frame);};
 },[active,uid,pathname,state.hidden]);
 useEffect(()=>{
  if(!active||!uid||(view==="closed"&&!actionItem&&!pendingHide))return;
  const dialog=document.querySelector<HTMLElement>("[data-vmv-shortcuts-ui] [role=dialog]");
  if(!dialog)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const focusables=()=>Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input:not([disabled])"));
  (dialog.querySelector<HTMLElement>('input[type="search"]')||focusables()[0])?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setView("closed");setActionItem(null);setPendingHide(null);return;}
   if(event.key!=="Tab")return;
   const elements=focusables();if(!elements.length)return;
   const first=elements[0],last=elements[elements.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",key);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",key);previous?.focus();};
 },[active,uid,view,actionItem,pendingHide]);
 const all=[...items,...state.custom];
 const filtered=all.filter(item=>findMatching(item,query)).slice(0,80);
 const quick=state.quick.map(id=>findShortcut(state,id)).filter((v):v is Shortcut=>!!v);
 return <Context.Provider value={{ready:!!uid,state,saveEnabled:(flag)=>mutate(v=>({...v,enabled:flag})),pin,unpin,hideCard,restoreCard,openPicker,openMenu}}>
  {children}
  {active&&!!uid&&state.enabled?<button type="button" className={styles.fab} aria-label={en?"Open shortcuts":"Abrir accesos directos"}
   title={en?"Shortcuts":"Accesos directos"} data-vmv-shortcuts-ui onClick={openMenu}><Link2 size={23}/><span className={styles.fabPlus}>+</span></button>:null}
  {active&&!!uid&&view!=="closed"?<div className={styles.overlay} data-vmv-shortcuts-ui onMouseDown={e=>{if(e.target===e.currentTarget)setView("closed");}}>
   <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="vmv-shortcuts-title">
    <div className={styles.sheetHeading}><div><span className={styles.eyebrow}>VMV BUSINESS</span><h2 id="vmv-shortcuts-title">{view==="picker"?(en?"Add shortcut":"Agregar acceso directo"):(en?"Shortcuts":"Accesos directos")}</h2></div>
     <button type="button" className={styles.close} onClick={()=>setView("closed")} aria-label={en?"Close":"Cerrar"}><X size={19}/></button></div>
    {view==="list"?<>
     <div className={styles.sectionHeading}><strong>{en?"Your shortcuts":"Tus accesos"}</strong><small>{state.quick.length}/{SHORTCUT_LIMIT}</small></div>
     <div className={styles.savedList}>{quick.length?quick.map(item=><div className={styles.savedRow} key={item.id}>
      <a href={item.href}><span className={styles.bubble}><ArrowUpRight size={18}/></span><strong>{labelFor(item,en)}</strong></a>
      <button type="button" onClick={()=>unpin(item.id,"quick")} title={en?"Remove":"Quitar"} aria-label={(en?"Remove ":"Quitar ")+labelFor(item,en)}><Trash2 size={16}/></button>
     </div>):<p className={styles.empty}>{en?"Add your first shortcut to access it from any page.":"Añade tu primer acceso para abrirlo desde cualquier página."}</p>}</div>
     <button type="button" className={styles.addButton} onClick={openPicker}><Plus size={18}/>{en?"Add shortcut":"Agregar acceso directo"}</button>
     <a className={styles.settingsLink} href="/vista-app?tab=account&settings=shortcuts"><Settings2 size={16}/>{en?"Shortcut settings":"Configurar accesos directos"}</a>
    </>:<>
     <label className={styles.search}><Search size={17}/><input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder={en?"Search features, services and cards":"Buscar funciones, servicios y tarjetas"} autoComplete="off"/></label>
     <div className={styles.catalog} role="list">
      {filtered.map(item=><div className={styles.catalogItem} role="listitem" key={item.id}>
       <a href={item.href}><span className={styles.bubble}><ArrowUpRight size={18}/></span><span><strong>{labelFor(item,en)}</strong><small>{item.group}</small></span></a>
       <button type="button" className={state.quick.includes(item.id)?styles.added:styles.itemAdd}
        aria-label={(state.quick.includes(item.id)?en?"Remove ":"Quitar ":en?"Add ":"Agregar ")+labelFor(item,en)}
        onClick={()=>state.quick.includes(item.id)?unpin(item.id,"quick"):pin(item,"quick")}>{state.quick.includes(item.id)?<Check size={19}/>:<Plus size={19}/>}</button>
       <button type="button" className={state.home.includes(item.id)?styles.addedHome:styles.homeAdd}
        aria-label={(state.home.includes(item.id)?en?"Remove from Home ":"Quitar de Home ":en?"Add to Home ":"Agregar a Home ")+labelFor(item,en)}
        title={en?"Add to Home":"Agregar a Home"}
        onClick={()=>state.home.includes(item.id)?unpin(item.id,"home"):pin(item,"home")}><House size={17}/></button>
      </div>)}
      {!filtered.length?<p className={styles.empty}>{en?"No matching features.":"No hay funciones con ese nombre."}</p>:null}
     </div>
    </>}
    {error?<p className={styles.error} role="alert">{error}</p>:null}
   </section>
  </div>:null}
  {active&&!!uid&&actionItem?<div className={styles.overlay} data-vmv-shortcuts-ui onMouseDown={e=>{if(e.target===e.currentTarget)setActionItem(null);}}>
   <section className={styles.actionDialog} role="dialog" aria-modal="true" aria-labelledby="vmv-longpress-title">
    <div className={styles.sheetHeading}><div><span className={styles.eyebrow}>{en?"CARD OPTIONS":"OPCIONES DE TARJETA"}</span>
     <h2 id="vmv-longpress-title">{labelFor(actionItem,en)}</h2></div>
     <button type="button" className={styles.close} onClick={()=>setActionItem(null)} aria-label={en?"Close":"Cerrar"}><X size={18}/></button></div>
    <button type="button" className={styles.actionRow} onClick={()=>{if(pin(actionItem,"quick"))setActionItem(null);}}><Link2 size={19}/>{state.quick.includes(actionItem.id)?en?"Already in shortcuts":"Ya está en accesos":en?"Agregar a acceso directo":"Agregar a acceso directo"}<ArrowUpRight size={16}/></button>
    <button type="button" className={styles.actionRow} onClick={()=>{if(pin(actionItem,"home"))setActionItem(null);}}><House size={19}/>{state.home.includes(actionItem.id)?en?"Already on Home":"Ya está en Home":en?"Agregar a Home":"Agregar a Home"}<ArrowUpRight size={16}/></button>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {actionItem.group==="Personalizado"?<p className={styles.smallHint}>{en?"This shortcut opens the section containing this card.":"Este acceso abre la sección donde se encuentra la tarjeta."}</p>:null}
   </section>
  </div>:null}
  {active&&!!uid&&success?<div className={styles.toast} role="status" onAnimationEnd={()=>setSuccess("")}>{success}</div>:null}
 </Context.Provider>;
}
export function VMVQuickAccessSettings(){
 const {language}=useInterfaceLanguage();const en=language==="en";
 const {state,saveEnabled,openPicker,openMenu}=useVMVQuickAccess();
 return <section className={styles.settingsCard} data-vmv-shortcuts-ui>
  <div className={styles.settingHeader}><span className={styles.settingIcon}><Link2 size={22}/></span>
   <div><h3>{en?"Shortcuts":"Acceso directo"}</h3><p>{en?"Open your favorite tools from anywhere in VMV.":"Abre tus herramientas favoritas desde cualquier pantalla de VMV."}</p></div></div>
  <label className={styles.switchRow}><span><strong>{en?"Floating shortcut button":"Botón flotante de accesos"}</strong><small>{en?"Show it at the bottom right.":"Mostrarlo en la esquina inferior derecha."}</small></span>
   <input type="checkbox" checked={state.enabled} onChange={e=>saveEnabled(e.target.checked)}/><span className={styles.switchUi}/></label>
  <div className={styles.settingActions}>
   <button type="button" onClick={openPicker}><Plus size={16}/>{en?"Add shortcut":"Agregar acceso directo"}</button>
   <button type="button" onClick={openMenu}><Star size={16}/>{en?"Manage shortcuts":"Administrar accesos"}</button>
  </div>
  <small className={styles.smallHint}>{en?"Tip: press and hold any navigable card to add it to Shortcuts or Home.":"Consejo: mantén pulsada una tarjeta navegable para añadirla a Acceso directo o Home."}</small>
 </section>;
}
export function VMVHomePinnedShortcuts(){
 const {language}=useInterfaceLanguage();const en=language==="en";
 const {state,unpin,openPicker}=useVMVQuickAccess();
 const selected=state.home.map(id=>findShortcut(state,id)).filter((x):x is Shortcut=>!!x);
 if(!selected.length)return null;
 return <section className={styles.homeSection}>
  <div className={styles.homeHeading}><h3>{en?"My shortcuts":"Mis accesos"}</h3><button type="button" onClick={openPicker} aria-label={en?"Edit Home shortcuts":"Editar accesos de Home"}><Plus size={17}/>{en?"Edit":"Editar"}</button></div>
  <div className={styles.homeGrid}>{selected.map(item=><div className={styles.homePinnedCard} key={item.id} data-vmv-shortcut-id={item.id}>
   <a href={item.href}><span className={styles.homePinnedIcon}><ArrowUpRight size={19}/></span><strong>{labelFor(item,en)}</strong></a>
   <button type="button" className={styles.homePinnedRemove} onClick={()=>unpin(item.id,"home")} aria-label={(en?"Remove from Home ":"Quitar de Home ")+labelFor(item,en)}><X size={13}/></button>
  </div>)}</div>
 </section>;
}
