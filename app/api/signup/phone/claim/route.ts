import {NextRequest} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";
import {response,validPhone,originOk,ticketHash} from "@/lib/signup-phone";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!originOk(req))return response({error:"invalid_origin"},403);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!key)return response({error:"unauthorized"},401);
 const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await auth.auth.getUser(token);
 if(error||!data.user||data.user.is_anonymous)return response({error:"unauthorized"},401);
 let payload:unknown;try{payload=await req.json();}catch{return response({error:"invalid_request"},400);}
 const args=payload&&typeof payload==="object"?payload as Record<string,unknown>:{};
 if(!validPhone(args.phone)||typeof args.ticket!=="string"||
    !/^[A-Za-z0-9_-]{38,50}$/.test(args.ticket))return response({error:"invalid_request"},400);
 const profilePhone=String(data.user.user_metadata?.phone||"");
 if(profilePhone!==args.phone)return response({error:"phone_mismatch"},409);
 const db=billingAdmin();if(!db)return response({error:"verification_unavailable"},503);
 const {data:linked,error:linkError}=await db.rpc("vmv_claim_signup_phone_ticket",{
  p_uid:data.user.id,p_phone:args.phone,p_ticket_hash:ticketHash(args.ticket)
 });
 if(linkError)return response({error:"verification_unavailable"},503);
 if(linked!==true)return response({error:"expired_or_used_ticket"},409);
 return response({verified:true});
}
