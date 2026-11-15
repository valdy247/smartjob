"use client";
import {useEffect,type RefObject} from "react";

const HOLD_MS=520;
const MOVE_TOLERANCE=11;
const CONTENT_SELECTOR=".vmv-site,.vmv-site-editor-canvas,.vmv-compose-section,.vmv-visual-section,.vmv-managed-image";
const TOOL_SELECTOR=".vmv-image-tools,.vmv-move-handle,.vmv-context-action-panel,.vmv-context-mobile-sheet,input,textarea,select,[contenteditable=true],[role=slider]";

/**
 * Puck keeps its editable content inside an iframe. Intercept trusted touch
 * presses there (not toolbar/keyboard/mouse interactions) and forward one
 * synthetic selection gesture only once the finger has held still.
 */
export default function useMobileCanvasLongPress(root:RefObject<HTMLElement|null>,enabled:boolean){
 useEffect(()=>{
  const container=root.current;
  if(!enabled||!container)return;
  const attached=new Map<Document,()=>void>();
  const loading=new Map<HTMLIFrameElement,()=>void>();
  function attach(doc:Document){
   if(attached.has(doc))return;
   let gesture:null|{id:number;target:Element;x:number;y:number;timer:number;held:boolean}=null;
   let suppressUntil=0;
   const reset=()=>{
    if(gesture)window.clearTimeout(gesture.timer);
    gesture=null;
   };
   const down=(event:PointerEvent)=>{
    if(event.pointerType!=="touch"||event.button!==0||!event.isTrusted)return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||!target.closest(CONTENT_SELECTOR)||target.closest(TOOL_SELECTOR))return;
    reset();
    const state={id:event.pointerId,target,x:event.clientX,y:event.clientY,timer:0,held:false};
    gesture=state;
    // Let the finger scroll the document, but do not select Puck blocks on a tap.
    event.stopPropagation();
    state.timer=window.setTimeout(()=>{
     if(gesture!==state||!state.target.isConnected)return;
     state.held=true;
     suppressUntil=performance.now()+1100;
     try{
      const base={bubbles:true,cancelable:true,composed:true,clientX:state.x,clientY:state.y,button:0};
      state.target.dispatchEvent(new PointerEvent("pointerdown",{...base,pointerType:"mouse",pointerId:1,isPrimary:true}));
      state.target.dispatchEvent(new PointerEvent("pointerup",{...base,pointerType:"mouse",pointerId:1,isPrimary:true}));
      state.target.dispatchEvent(new MouseEvent("click",base));
     }catch{
      // Older WebViews may not expose the PointerEvent constructor.
      state.target.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,composed:true}));
     }
    },HOLD_MS);
   };
   const move=(event:PointerEvent)=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_TOLERANCE)reset();
   };
   const up=(event:PointerEvent)=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    suppressUntil=performance.now()+850;
    if(gesture.held)event.preventDefault();
    event.stopPropagation();
    reset();
   };
   const cancel=()=>reset();
   const click=(event:MouseEvent)=>{
    if(!event.isTrusted||event.detail===0||performance.now()>suppressUntil)return;
    const target=event.target instanceof Element?event.target:null;
    if(!target?.closest(CONTENT_SELECTOR)||target.closest(TOOL_SELECTOR))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
   };
   const context=(event:MouseEvent)=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest(CONTENT_SELECTOR)&&!target.closest(TOOL_SELECTOR))event.preventDefault();
   };
   doc.addEventListener("pointerdown",down,true);
   doc.addEventListener("pointermove",move,true);
   doc.addEventListener("pointerup",up,true);
   doc.addEventListener("pointercancel",cancel,true);
   doc.addEventListener("click",click,true);
   doc.addEventListener("contextmenu",context,true);
   const stylesheet=doc.createElement("style");
   stylesheet.textContent="@media (pointer:coarse){.vmv-site-editor-canvas :is(img,h1,h2,h3,h4,p){-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}}";
   (doc.head||doc.documentElement).appendChild(stylesheet);
   attached.set(doc,()=>{
    reset();
    stylesheet.remove();
    doc.removeEventListener("pointerdown",down,true);
    doc.removeEventListener("pointermove",move,true);
    doc.removeEventListener("pointerup",up,true);
    doc.removeEventListener("pointercancel",cancel,true);
    doc.removeEventListener("click",click,true);
    doc.removeEventListener("contextmenu",context,true);
   });
  }
  function inspect(){
   attach(container.ownerDocument);
   for(const frame of Array.from(container.querySelectorAll("iframe"))){
    if(!loading.has(frame)){
     const fn=()=>{try{if(frame.contentDocument)attach(frame.contentDocument);}catch{/* Cross-origin frame */}};
     frame.addEventListener("load",fn);
     loading.set(frame,()=>frame.removeEventListener("load",fn));
    }
    try{if(frame.contentDocument)attach(frame.contentDocument);}catch{/* Other-origin frame */}
   }
  }
  inspect();
  const observer=new MutationObserver(inspect);
  observer.observe(container,{subtree:true,childList:true});
  return()=>{
   observer.disconnect();
   for(const release of loading.values())release();
   for(const release of attached.values())release();
  };
 },[root,enabled]);
}
