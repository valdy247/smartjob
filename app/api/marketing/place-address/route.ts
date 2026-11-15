import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Item={placeId:string;description:string;main:string;secondary:string};
const limits=new Map<string,{until:number;count:number}>();
const json=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const safe=(v:unknown,max=120)=>typeof v==="string"?v.trim().slice(0,max):"";
const name=(items:{longText:string;shortText:string;types:string[]}[],type:string,short=false)=>items.find(x=>x.types.includes(type))?.[short?"shortText":"longText"]||"";
export async function POST(req:NextRequest){
 const bearer=req.headers.get("authorization")||"";
 const token=bearer.startsWith("Bearer ")?bearer.slice(7):"";
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!supabaseUrl||!supabaseKey)return json({error:"sign_in_required"},401);
 const client=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user||user.is_anonymous)return json({error:"sign_in_required"},401);
 const key=process.env.GOOGLE_PLACES_API_KEY;
 if(!key)return json({error:"places_not_connected"},503);
 let body:Record<string,unknown>;
 try{body=await req.json();}catch{return json({error:"invalid_request"},400);}
 const action=body.action;
 const country=safe(body.country,2).toUpperCase();
 const language=body.language==="en"?"en":"es";
 const sessionToken=safe(body.sessionToken,64);
 if(!/^[A-Z]{2}$/.test(country)||!/^[-a-zA-Z0-9]{20,64}$/.test(sessionToken))return json({error:"invalid_request"},400);
 const now=Date.now();
 const rec=limits.get(user.id);
 const bucket=rec&&rec.until>now?rec:{until:now+3600000,count:0};
 if(bucket.count>=90)return json({error:"rate_limited"},429);
 bucket.count++;limits.set(user.id,bucket);
 try{
  if(action==="search"){
   const input=safe(body.input,120);
   if(input.length<4||input.length>120)return json({error:"invalid_input"},400);
   const response=await fetch("https://places.googleapis.com/v1/places:autocomplete",{
    method:"POST",cache:"no-store",signal:AbortSignal.timeout(8000),
    headers:{"Content-Type":"application/json","X-Goog-Api-Key":key},
    body:JSON.stringify({input,sessionToken,languageCode:language,includedRegionCodes:[country.toLowerCase()],includeQueryPredictions:false})
   });
   if(!response.ok)return json({error:"places_unavailable"},503);
   const payload=await response.json() as {suggestions?:{placePrediction?:{placeId?:string;text?:{text?:string};structuredFormat?:{mainText?:{text?:string};secondaryText?:{text?:string}}}}[]};
   const results:Item[]=(payload.suggestions||[]).flatMap(x=>{
    const p=x.placePrediction;if(!p?.placeId||!p.text?.text)return [];
    return [{placeId:p.placeId,description:p.text.text,main:p.structuredFormat?.mainText?.text||p.text.text,secondary:p.structuredFormat?.secondaryText?.text||""}];
   }).slice(0,6);
   return json({results,source:"Google Places"});
  }
  if(action==="details"){
   const placeId=safe(body.placeId,180);
   if(!/^[A-Za-z0-9_-]{10,180}$/.test(placeId))return json({error:"invalid_place"},400);
   const url=new URL("https://places.googleapis.com/v1/places/"+encodeURIComponent(placeId));
   url.searchParams.set("sessionToken",sessionToken);
   url.searchParams.set("languageCode",language);
   const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(8000),
    headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":"id,formattedAddress,addressComponents"}});
   if(!response.ok)return json({error:"places_unavailable"},503);
   const payload=await response.json() as {id?:string;formattedAddress?:string;addressComponents?:{longText:string;shortText:string;types:string[]}[]};
   const c=payload.addressComponents||[];
   if(name(c,"country",true).toUpperCase()!==country)return json({error:"country_mismatch"},422);
   const street=[name(c,"street_number"),name(c,"route")].filter(Boolean).join(" ");
   const city=name(c,"locality")||name(c,"postal_town")||name(c,"administrative_area_level_3");
   if(!street||!city)return json({error:"incomplete_address"},422);
   return json({address:{street,city,region:name(c,"administrative_area_level_1",true),postal:name(c,"postal_code"),country:name(c,"country",true),formatted:payload.formattedAddress||""},source:"Google Places"});
  }
  return json({error:"invalid_action"},400);
 }catch{return json({error:"places_unavailable"},503);}
}
