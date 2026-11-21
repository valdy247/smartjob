"use client";

import {Bot,ChevronRight} from "lucide-react";
import styles from "./AccountBusinessAgent.module.css";

type SharedAgentCardProps={
 name:string;
 description:string;
 label:string;
 href?:string;
 onClick?:()=>void;
 disabled?:boolean;
};

/** The same saved-agent entry is shown in Profile and AI Agents; all editing stays in Profile. */
export default function AgentSettingsEntry({name,description,label,href,onClick,disabled=false}:SharedAgentCardProps){
 const content=<>
  <span className={styles.agentIcon}><Bot size={23}/></span>
  <span className={styles.copy}>
   <small>{label}</small>
   <strong>{name}</strong>
   <span>{description}</span>
  </span>
  <ChevronRight size={18}/>
 </>;
 return href?
  <a className={styles.card} href={href} style={{textDecoration:"none"}}>{content}</a>:
  <button type="button" className={styles.card} disabled={disabled} onClick={onClick}>{content}</button>;
}
