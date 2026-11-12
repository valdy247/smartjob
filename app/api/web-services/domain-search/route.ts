import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const maxDuration=15;
const out=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
const validDomain=(value:string)=>value.length>=4&&value.length<=253&&
 /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(value);
export async function GET(req:NextRequest){
 const domain=(req.nextUrl.searchParams.get("domain")||"").trim().toLowerCase();
 if(!validDomain(domain))return out({error:"Dominio inválido"},400);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token||token.length>8000)return out({error:"Inicia sesión"},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return out({error:"No disponible"},503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);
 if(error||!data.user||data.user.is_anonymous)return out({error:"Sesión inválida"},403);
 try{
  const response=await fetch("https://api.vercel.com/v1/registrar/domains/search",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({domains:[domain]}),signal:AbortSignal.timeout(11000),cache:"no-store"
  });
  if(!response.ok)return out({error:"El registrador no está disponible ahora"},503);
  const json=await response.json() as {results?:Array<{domain:string;available:boolean;price?:number;renewalPrice?:number;years?:number;premium?:boolean}>};
  const result=json.results?.find(v=>v.domain===domain);
  if(!result||typeof result.available!=="boolean")return out({error:"Sin cotización verificable"},503);
  const amount=typeof result.price==="number"&&Number.isFinite(result.price)?result.price:null;
  const renewal=typeof result.renewalPrice==="number"&&Number.isFinite(result.renewalPrice)?result.renewalPrice:null;
  const dollars=(n:number|null)=>n===null?"Precio pendiente":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
  return out({
   domain,available:result.available,premium:result.premium===true,years:result.years||1,
   price:amount,renewalPrice:renewal,priceDisplay:dollars(amount),
   renewalDisplay:dollars(renewal),provider:"Vercel Registrar",
   note:"Precios de registro y renovación distintos; impuestos y cargos adicionales pueden aplicar. No se ha comprado el dominio."
  });
 }catch{
  return out({error:"No se pudo comprobar el dominio"},503);
 }
}
