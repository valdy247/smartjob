import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers});
type Component={longText?:string;shortText?:string;types?:string[]};
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const validCountry=(s:string)=>/^[A-Z]{2}$/.test(s)&&!["ZZ","EU","UN","XK"].includes(s);
const has=(cs:Component[],type:string)=>cs.find(c=>c.types?.includes(type));
const rate=new Map<string,{count:number;reset:number}>();
function limited(request:NextRequest){
 const ip=(request.headers.get("x-vercel-forwarded-for")||request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,64);
 const now=Date.now(),state=rate.get(ip)||{count:0,reset:now+60000};
 if(now>state.reset){state.reset=now+60000;state.count=0;}
 state.count++;rate.set(ip,state);return state.count>35;
}
async function details(key:string,placeId:string){
 if(!/^[A-Za-z0-9_-]{6,250}$/.test(placeId))return null;
 const response=await fetch("https://places.googleapis.com/v1/places/"+encodeURIComponent(placeId),{
  headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":"id,types,addressComponents,displayName"},
  signal:AbortSignal.timeout(7500),cache:"no-store"
 });
 if(!response.ok)return null;
 const json=await response.json() as {id?:string;addressComponents?:Component[];types?:string[]};
 return json.id===placeId?json:null;
}
function placeRegion(cs:Component[],country:string){
 if(has(cs,"country")?.shortText?.toUpperCase()!==country)return null;
 const part=has(cs,"administrative_area_level_1");
 if(!part?.longText||!part.shortText)return null;
 return {region:part.longText,regionCode:part.shortText,country};
}
function placeCity(cs:Component[],country:string,region:string){
 const state=placeRegion(cs,country);
 if(!state||!region||![state.region,state.regionCode].some(v=>normalize(v)===normalize(region)))return null;
 const found=has(cs,"locality")||has(cs,"postal_town")||has(cs,"administrative_area_level_3")||has(cs,"sublocality_level_1");
 if(!found?.longText)return null;
 return {...state,city:found.longText};
}
export async function POST(req:NextRequest){
 if(limited(req))return respond({error:"too_many_requests"},429);
 const key=process.env.GOOGLE_PLACES_API_KEY;
 if(!key)return respond({error:"places_not_connected"},503);
 let data:Record<string,unknown>;
 try{const body=await req.text();if(body.length>1400)return respond({error:"invalid_input"},400);
  data=JSON.parse(body) as Record<string,unknown>;
 }catch{return respond({error:"invalid_input"},400);}
 const action=String(data.action||"");
 const country=String(data.country||"").toUpperCase();
 if(!validCountry(country))return respond({error:"invalid_country"},400);
 const region=String(data.region||"").trim().slice(0,100);
 try{
  if(action==="searchRegion"||action==="searchCity"){
   const input=String(data.input||"").trim();
   if(input.length<2||input.length>80||!/^[\p{L}\p{N} .'’-]{2,80}$/u.test(input))
    return respond({error:"invalid_input"},400);
   if(action==="searchCity"&&!region)return respond({error:"region_required"},400);
   const r=await fetch("https://places.googleapis.com/v1/places:autocomplete",{
    method:"POST",cache:"no-store",signal:AbortSignal.timeout(7500),
    headers:{"Content-Type":"application/json","X-Goog-Api-Key":key},
    body:JSON.stringify({
     input:action==="searchCity"?input+", "+region:input,
     includedRegionCodes:[country.toLowerCase()],
     includedPrimaryTypes:[action==="searchCity"?"(cities)":"(regions)"],
     languageCode:data.lang==="en"?"en":"es"
    })
   });
   if(!r.ok)return respond({error:"google_places_unavailable"},503);
   const j=await r.json() as {suggestions?:{placePrediction?:{placeId?:string;text?:{text?:string};structuredFormat?:{mainText?:{text?:string};secondaryText?:{text?:string}}}}[]};
   const results=(j.suggestions||[]).flatMap(item=>{
    const p=item.placePrediction;
    return p?.placeId?[{id:p.placeId,label:p.structuredFormat?.mainText?.text||p.text?.text||"",
     secondary:p.structuredFormat?.secondaryText?.text||""}]:[];
   }).filter(x=>x.label).slice(0,10);
   return respond({results,source:"Google Places"});
  }
  if(["detailsRegion","detailsCity","validateCity"].includes(action)){
   const regionId=String(data.regionPlaceId||"");
   const cityId=String(data.cityPlaceId||"");
   if(action==="detailsRegion"){
    const p=await details(key,regionId);
    const verified=p?placeRegion(p.addressComponents||[],country):null;
    if(!verified)return respond({error:"region_not_verified"},422);
    return respond({verified:true,...verified,placeId:regionId});
   }
   const p=await details(key,cityId);
   const verified=p?placeCity(p.addressComponents||[],country,region):null;
   if(!verified)return respond({error:"city_not_verified"},422);
   if(action==="validateCity"){
    const selectedRegion=await details(key,regionId);
    const state=selectedRegion?placeRegion(selectedRegion.addressComponents||[],country):null;
    if(!state||normalize(state.region)!==normalize(verified.region)||
     normalize(String(data.city||""))!==normalize(verified.city)||
     normalize(String(data.region||""))!==normalize(verified.region))return respond({error:"location_mismatch"},422);
   }
   return respond({verified:true,...verified,placeId:cityId});
  }
  return respond({error:"invalid_action"},400);
 }catch{return respond({error:"google_places_unavailable"},503);}
}
