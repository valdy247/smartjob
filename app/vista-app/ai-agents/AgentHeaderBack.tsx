"use client";
import {createContext,useContext,useEffect,useRef} from "react";

/** The phone frame owns navigation. Inner tools register their current back
 * action so the one visible header arrow preserves their step hierarchy. */
export type HeaderBackController={
 enabled:boolean;
 register:(callback:(()=>void)|null)=>void;
};
export const AgentHeaderBackContext=createContext<HeaderBackController|null>(null);

/** Returns true only while an AI Agents host header is displayed. Standalone
 * screens keep their normal local back action outside that host. */
export function useAgentHeaderBack(callback:()=>void):boolean{
 const controller=useContext(AgentHeaderBackContext);
 const latest=useRef(callback);
 latest.current=callback;
 useEffect(()=>{
  if(!controller?.enabled)return;
  const run=()=>latest.current();
  controller.register(run);
  return()=>controller.register(null);
 },[controller]);
 return controller?.enabled===true;
}
