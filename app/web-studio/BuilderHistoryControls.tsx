"use client";
import {createUsePuck} from "@puckeditor/core";
import {Redo2,Undo2} from "lucide-react";

const useStudioPuck=createUsePuck();

/** Uses Puck's own history, so image/text/section edits share the same undo stack. */
export default function BuilderHistoryControls(){
 const canUndo=useStudioPuck(s=>s.history.hasPast);
 const canRedo=useStudioPuck(s=>s.history.hasFuture);
 const goBack=useStudioPuck(s=>s.history.back);
 const goForward=useStudioPuck(s=>s.history.forward);
 return <div role="group" aria-label="Historial de cambios" style={{display:"flex",gap:5,alignItems:"center"}}>
  <button type="button" title="Deshacer" aria-label="Deshacer último cambio"
   disabled={!canUndo} onClick={()=>goBack()} style={{display:"inline-flex",alignItems:"center",gap:5,
    padding:"8px 10px",border:"1px solid #e1d6ed",borderRadius:9,fontSize:11,
    fontWeight:800,background:"#fff",color:"#714aaf",cursor:"pointer"}}>
   <Undo2 size={15}/> <span>Deshacer</span>
  </button>
  <button type="button" title="Rehacer" aria-label="Rehacer último cambio"
   disabled={!canRedo} onClick={()=>goForward()} style={{display:"inline-flex",alignItems:"center",gap:5,
    padding:"8px 10px",border:"1px solid #e1d6ed",borderRadius:9,fontSize:11,
    fontWeight:800,background:"#fff",color:"#714aaf",cursor:"pointer"}}>
   <Redo2 size={15}/> <span>Rehacer</span>
  </button>
 </div>;
}
