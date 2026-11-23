"use client";
import {useState} from "react";
import type {CallMenu} from "@/lib/vmv-ai-agents/call-policy";
import {PHONE_VOICE_CATALOG} from "@/lib/vmv-ai-agents/phone-voices";
import css from "./SmartCallMenuEditor.module.css";
type Props={menu:CallMenu;onChange:(next:CallMenu)=>void;agentEnabled:boolean;translationEnabled:boolean;mode?:"voices"|"menu"};
const menuKeys=["spanish_digit","english_digit","agent_digit"] as const;
const digitNames:Record<typeof menuKeys[number],string>={
 spanish_digit:"Hablar con una persona en español (sin IA ni traducción)",
 english_digit:"Hablar con una persona usando traducción al inglés",
 agent_digit:"Conversar con Mi agente IA"
};
const messageNames:Record<"greeting_es"|"greeting_en"|"human_es"|"human_en"|"agent_message",string>={
 greeting_es:"Saludo inicial en español",greeting_en:"Saludo inicial en inglés",
 human_es:"Después de elegir atención directa en español",human_en:"Después de elegir traducción",
 agent_message:"Después de elegir Mi agente IA"
};
export default function SmartCallMenuEditor({menu,onChange,agentEnabled,translationEnabled,mode="menu"}:Props){
 const [sample,setSample]=useState<string|null>(null);
 const update=<K extends keyof CallMenu>(key:K,value:CallMenu[K])=>onChange({...menu,[key]:value});
 const options=menuKeys.filter(k=>k==="spanish_digit"||k==="english_digit"&&translationEnabled||
   k==="agent_digit"&&agentEnabled);
 const duplicate=new Set(options.map(k=>menu[k])).size!==options.length;
 const current=PHONE_VOICE_CATALOG.find(v=>v.id===sample);
 return <div className={css.root}>
  {mode==="menu"?<><div className={css.toggleRow}><span><strong>Menú de bienvenida</strong>
    <small>El cliente puede elegir cómo quiere comunicarse.</small></span>
   <label className={css.switch}><input type="checkbox" checked={menu.enabled}
    onChange={e=>update("enabled",e.target.checked)}/><span>{menu.enabled?"Activo":"Desactivado"}</span></label>
  </div>
  {menu.enabled?<div className={css.section}>
    <p className={css.caption}>Asigna una tecla a cada opción. Si un servicio está desactivado, el menú no lo anunciará.</p>
    {options.map(key=><label className={css.option} key={key}><span>{digitNames[key]}</span>
     <select value={menu[key]} onChange={e=>update(key,e.target.value)}>
      {Array.from({length:10},(_,i)=>String(i)).map(d=><option key={d} value={d}>Marcar {d}</option>)}
     </select></label>)}
    {duplicate?<p className={css.error} role="alert">Cada servicio debe tener una tecla diferente.</p>:null}
  </div>:<p className={css.caption}>Sin menú, el sistema seguirá la prioridad seleccionada anteriormente.</p>}
  <div className={css.section}><strong>Personaliza cada mensaje</strong>
   {(Object.keys(messageNames) as (keyof typeof messageNames)[]).filter(k=>(
     k!=="human_en"||translationEnabled)&& (k!=="agent_message"||agentEnabled)).map(key=>
    <label className={css.field} key={key}>{messageNames[key]}
     <textarea rows={2} maxLength={180} value={menu[key]} onChange={e=>update(key,e.target.value)}/></label>)}
  </div>
  </>:null}
  {mode==="voices"?<div className={css.section}><strong>Voces reales · ElevenLabs</strong>
   <p className={css.caption}>Disponibles para las pruebas de todos los planes. Escucha antes de elegir. La compatibilidad con Twilio se comprobará en las pruebas telefónicas.</p>
   {(["es","en"] as const).map(lang=><div key={lang} className={css.voiceGroup}>
    <label className={css.field}>Voz para {lang==="es"?"español":"inglés"}
     <select value={menu[lang==="es"?"voice_es":"voice_en"]}
      onChange={e=>update(lang==="es"?"voice_es":"voice_en",e.target.value)}>
      {PHONE_VOICE_CATALOG.filter(v=>v.lang===lang||v.lang==="both").map(v=>
       <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
    <button type="button" className={css.sample} onClick={()=>setSample(menu[lang==="es"?"voice_es":"voice_en"])}
     disabled={menu[lang==="es"?"voice_es":"voice_en"]==="default"}>Escuchar muestra</button>
   </div>)}
   {current?.preview?<audio key={current.id} className={css.audio} src={current.preview} controls autoPlay preload="none"/>:null}
  </div>:null}
  {mode==="menu"?<div className={css.section}><strong>Así escuchará las opciones el cliente</strong>
   <p className={css.readback}>{menu.greeting_es}</p>
   <p className={css.readback}>{menu.greeting_en}</p>
   {menu.enabled?<div className={css.previewOptions}>
    {options.map(key=><span key={key}><b>{menu[key]}</b> {digitNames[key]}</span>)}
    <span><b>—</b> Sin marcar: atención directa en español</span>
   </div>:null}
  </div>:null}
 </div>;
}
