import Link from "next/link";
import {Bot,LockKeyhole,ShieldCheck,Trash2} from "lucide-react";
export const metadata={title:"Privacidad del chat IA · VMV Business",
 description:"Información sobre el uso y conservación de conversaciones del chat público de VMV Business."};
export default function WebChatPrivacy(){
 return <main style={{minHeight:"100vh",background:"#faf8fd",color:"#342846",padding:"24px 15px 64px",fontFamily:"Inter,system-ui,-apple-system,sans-serif"}}>
  <article style={{maxWidth:690,margin:"0 auto",display:"grid",gap:15}}>
   <header style={{display:"flex",gap:14,alignItems:"center",marginBottom:10}}>
    <span style={{width:58,height:58,borderRadius:19,background:"#e8ddfb",color:"#7d50aa",display:"grid",placeItems:"center"}}>
     <Bot size={29}/></span>
    <div><small style={{color:"#936fba",letterSpacing:".12em",fontSize:10,fontWeight:900}}>VMV BUSINESS · CHAT IA</small>
     <h1 style={{margin:"5px 0 0",fontSize:"clamp(22px,5vw,32px)",letterSpacing:"-.04em"}}>Privacidad del chat</h1></div>
   </header>
   <section style={{background:"#fff",border:"1px solid #e9e0ef",padding:21,borderRadius:18,lineHeight:1.7,fontSize:13}}>
    <h2 style={{fontSize:17,margin:"0 0 7px"}}>Qué es</h2>
    Hablas con un <strong>agente de inteligencia artificial</strong> configurado por el negocio que administra el sitio.
    Sus respuestas son automáticas y pueden equivocarse. No puede confirmar pedidos, reservas ni cobrar dinero.
    Si necesitas ayuda personal, usa el formulario o los datos públicos de contacto del negocio.
   </section>
   <section style={{background:"#fff",border:"1px solid #e9e0ef",padding:21,borderRadius:18,lineHeight:1.7,fontSize:13}}>
    <h2 style={{fontSize:17,margin:"0 0 7px"}}>Qué se guarda</h2>
    Guardamos los mensajes enviados, respuestas del agente, la web y el negocio correspondiente, fechas y un
    identificador aleatorio de sesión. Para controlar el abuso usamos un identificador derivado de la dirección IP,
    sin almacenar su dirección en texto plano. Una cookie segura y de acceso exclusivo al servidor permite
    recuperar la conversación desde el mismo navegador.
   </section>
   <section style={{background:"#fff",border:"1px solid #e9e0ef",padding:21,borderRadius:18,lineHeight:1.7,fontSize:13}}>
    <h2 style={{fontSize:17,margin:"0 0 7px"}}>Quién puede ver los mensajes</h2>
    El propietario autorizado del negocio puede consultar sus conversaciones desde Chat web en VMV Business.
    Para generar respuestas, enviamos el mensaje y contexto limitado al proveedor de IA utilizado por VMV.
    El chat no comparte conversaciones con otros negocios.
   </section>
   <section style={{background:"#fff",border:"1px solid #e9e0ef",padding:21,borderRadius:18,lineHeight:1.7,fontSize:13}}>
    <h2 style={{fontSize:17,margin:"0 0 7px"}}>Tiempo de conservación</h2>
    Las sesiones y mensajes se eliminan automáticamente antes de cumplir <strong>30 días</strong>.
    Las cuotas de uso se eliminan por separado. Puedes cerrar el chat en cualquier momento y comunicarte
    directamente con el negocio para solicitar ayuda relacionada con una conversación.
   </section>
   <section style={{background:"#fff",border:"1px solid #e9e0ef",padding:21,borderRadius:18,lineHeight:1.7,fontSize:13}}>
    <h2 style={{fontSize:17,margin:"0 0 7px"}}>Datos de contacto (opcional)</h2>
    Solo cuando completas el formulario y aceptas compartirlos, guardamos tu nombre y teléfono o correo
    en los contactos del negocio. Los números de teléfono también pueden incorporarse a su agenda VMV,
    que el negocio administra independientemente de los mensajes del chat y que no se borra
    automáticamente al caducar la conversación. Puedes pedir al negocio que elimine tus datos de contacto.
   </section>
   <section style={{background:"#edf8f3",border:"1px solid #d7eade",padding:18,borderRadius:16,
     display:"flex",gap:10,alignItems:"flex-start",color:"#4b7862",fontSize:12,lineHeight:1.65}}>
    <ShieldCheck size={23} style={{flexShrink:0}}/>
    <span>No compartas contraseñas, datos de tarjetas, identificaciones oficiales ni información médica o financiera sensible.</span>
   </section>
   <footer style={{textAlign:"center",color:"#988ba1",fontSize:11,lineHeight:1.6}}>
    VMV Business · Noviembre de 2026 · Puedes regresar a la web desde la pestaña anterior.
   </footer>
  </article>
 </main>;
}
