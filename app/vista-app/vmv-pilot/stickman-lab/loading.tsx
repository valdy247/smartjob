import {Clapperboard,LoaderCircle} from "lucide-react";
import css from "./page.module.css";

export default function MotionLoading(){
 return <main className={css.page}>
  <div className={css.loadingScreen} role="status" aria-live="polite">
   <span className={css.loadingLogo}><Clapperboard size={26}/></span>
   <LoaderCircle size={35} className={css.spin}/>
   <strong>Abriendo VMV Motion</strong>
   <span>Preparando el editor y tus proyectos…</span>
  </div>
 </main>;
}
