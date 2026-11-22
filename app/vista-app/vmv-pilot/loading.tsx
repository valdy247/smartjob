import {Clapperboard,LoaderCircle} from "lucide-react";
import css from "./page.module.css";

export default function PilotLoading(){
 return <main className={css.page}>
  <div className={css.transitionOverlay} role="status" aria-live="polite">
   <div className={css.transitionCard}>
    <span className={css.transitionIcon}><Clapperboard size={26}/></span>
    <LoaderCircle size={34} className={css.spin}/>
    <strong>Preparando VMV Pilot</strong>
    <p>Estamos abriendo tu proyecto.</p>
   </div>
  </div>
 </main>;
}
