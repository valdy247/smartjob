"use client";
import {useRef,useState,type FormEvent} from "react";
import {CheckCircle2,LoaderCircle,ShoppingBag} from "lucide-react";
import css from "./VMVChatOrderCard.module.css";

export type OrderProduct={id:string;name:string;priceCents:number};
export type OrderRequest={productId:string;quantity:number;name:string;email:string;
 phone:string;requestId:string;acceptOrder:true};
export default function VMVChatOrderCard({products,onSubmit,mode="live"}:{
 products:OrderProduct[];mode?:"test"|"live";
 onSubmit:(request:OrderRequest)=>Promise<{orderNo:number;totalCents:number}>;
}){
 const [productId,setProductId]=useState(products[0]?.id||"");
 const [quantity,setQuantity]=useState("1");
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState("");
 const [agree,setAgree]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [complete,setComplete]=useState<{orderNo:number;totalCents:number}|null>(null);
 const nonce=useRef<string>("");
 const chosen=products.find(x=>x.id===productId);
 const qty=Number(quantity);
 const validQty=Number.isInteger(qty)&&qty>=1&&qty<=50;
 const canSubmit=Boolean(chosen&&validQty&&name.trim().length>=2&&
  (email.trim()||phone.trim())&&agree&&!busy);
 async function submit(event:FormEvent){
  event.preventDefault();if(!canSubmit||!chosen)return;
  setBusy(true);setError("");
  try{
   if(!nonce.current)nonce.current=crypto.randomUUID();
   const outcome=await onSubmit({productId:chosen.id,quantity:qty,name:name.trim(),
    email:email.trim(),phone:phone.trim(),requestId:nonce.current,acceptOrder:true});
   setComplete(outcome);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo registrar el pedido.");}
  finally{setBusy(false);}
 }
 if(complete)return <div className={css.done} role="status">
  <CheckCircle2 size={24}/>
  <strong>Pedido #{complete.orderNo} recibido</strong>
  <span>{(complete.totalCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</span>
  <small>{mode==="test"?"Pedido de prueba · ":""}Pendiente de revisión y pago. El negocio confirmará los siguientes pasos.</small>
 </div>;
 return <form className={css.card} onSubmit={e=>void submit(e)}>
  <div className={css.heading}><ShoppingBag size={18}/><strong>Preparar pedido{mode==="test"?" de prueba":""}</strong></div>
  <label>Producto
   <select value={productId} onChange={e=>{setProductId(e.target.value);nonce.current="";}} required>
    {products.map(x=><option key={x.id} value={x.id}>{x.name} · {"$"+(x.priceCents/100).toFixed(2)}</option>)}
   </select>
  </label>
  <label>Cantidad<input type="number" min="1" max="50" step="1" inputMode="numeric"
   value={quantity} onChange={e=>{setQuantity(e.target.value);nonce.current="";}} required/></label>
  {chosen&&validQty?<strong className={css.total}>Subtotal: {"$"+((chosen.priceCents*qty)/100).toFixed(2)}</strong>:null}
  <label>Nombre<input autoComplete="name" value={name} maxLength={80} required
   onChange={e=>{setName(e.target.value);nonce.current="";}} placeholder="Tu nombre"/></label>
  <label>Teléfono<input type="tel" autoComplete="tel" value={phone} maxLength={35}
   onChange={e=>{setPhone(e.target.value);nonce.current="";}} placeholder="+1…"/></label>
  <label>Correo<input type="email" autoComplete="email" value={email} maxLength={180}
   onChange={e=>{setEmail(e.target.value);nonce.current="";}} placeholder="nombre@correo.com"/></label>
  <small>Indica teléfono o correo. Recogida en el negocio; horario por confirmar.</small>
  <label className={css.consent}><input type="checkbox" checked={agree}
   onChange={e=>setAgree(e.target.checked)}/>
   <span>Solicito este pedido y acepto compartir mis datos con el negocio para gestionarlo. Entiendo que no está pagado ni confirmado.</span>
  </label>
  {error?<p className={css.error} role="alert">{error}</p>:null}
  <button type="submit" disabled={!canSubmit}>
   {busy?<LoaderCircle size={16} className={css.spin}/>:<ShoppingBag size={16}/>}
   {busy?"Registrando…":"Enviar pedido"}
  </button>
 </form>;
}
