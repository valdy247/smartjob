import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:noStore});
const normalized=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
type Component={long_name:string;short_name:string;types:string[]};
function component(c:Component[],type:string){return c.find(x=>x.types.includes(type));}
function matches(actual:Component|undefined,requested:string){
 if(!requested.trim())return true;
 if(!actual)return false;
 const q=normalized(requested);
 return [actual.short_name,actual.long_name].some(v=>normalized(v)===q);
}
export async function GET(request:NextRequest){
 const q=new URL(request.url).searchParams;
 const country=(q.get("country")||"").toUpperCase();
 const city=(q.get("city")||"").trim();
 const region=(q.get("region")||"").trim();
 const postal=(q.get("postal")||"").trim();
 if(!/^[A-Z]{2}$/.test(country)||city.length<2||city.length>100||region.length>100||postal.length>25||
  !/^[\p{L} .'-]{2,100}$/u.test(city)||!/^[\p{L}\p{N} .'-]{0,100}$/u.test(region)||
  !/^[\p{L}\p{N} -]{0,25}$/u.test(postal))return reply({error:"invalid_location"},400);
 const key=process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
 if(!key){
  // Postal cross-check is useful today, but is NOT Google verification.
  // Never return verified:true here or imply a street address was checked.
  if(!postal)return reply({error:"google_location_not_connected",verified:false},503);
  try{
   const url="https://api.zippopotam.us/"+encodeURIComponent(country.toLowerCase())+"/"+encodeURIComponent(postal);
   const response=await fetch(url,{signal:AbortSignal.timeout(6500),next:{revalidate:86400}});
   if(response.status===404)return reply({error:"postal_not_found",verified:false},422);
   if(!response.ok)return reply({error:"postal_lookup_unavailable",verified:false},503);
   const json=await response.json() as {places?:{"place name":string;state:string;"state abbreviation":string}[];"country abbreviation"?:string};
   const match=(json.places||[]).some(place=>normalized(place["place name"])===normalized(city)&&
    (!region||[place.state,place["state abbreviation"]].some(v=>normalized(v)===normalized(region))));
   if(!match||json["country abbreviation"]?.toUpperCase()!==country)return reply({error:"postal_city_mismatch",verified:false},422);
   return reply({verified:false,postalMatched:true,source:"Zippopotam.us / GeoNames",error:"google_location_not_connected"},200);
  }catch{return reply({error:"postal_lookup_unavailable",verified:false},503);}
 }
 const url=new URL("https://maps.googleapis.com/maps/api/geocode/json");
 url.searchParams.set("address",[city,region,postal,country].filter(Boolean).join(", "));
 url.searchParams.set("components","country:"+country);
 url.searchParams.set("key",key);
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(9000),cache:"no-store"});
  if(!response.ok)return reply({error:"google_location_unavailable",verified:false},503);
  const json=await response.json() as {status?:string;results?:{partial_match?:boolean;formatted_address?:string;address_components:Component[];types?:string[]}[]};
  if(json.status!=="OK")return reply({error:json.status==="ZERO_RESULTS"?"location_not_found":"google_location_unavailable",verified:false},json.status==="ZERO_RESULTS"?422:503);
  const matched=(json.results||[]).find(r=>{
   const c=r.address_components||[];
   if(r.partial_match||!matches(component(c,"country"),country))return false;
   const locality=["locality","postal_town","sublocality_level_1","administrative_area_level_3"].map(t=>component(c,t));
   if(!locality.some(x=>matches(x,city)&&x))return false;
   if(region&&!matches(component(c,"administrative_area_level_1"),region))return false;
   if(postal&&!matches(component(c,"postal_code"),postal))return false;
   return true;
  });
  if(!matched)return reply({error:"location_mismatch",verified:false},422);
  return reply({verified:true,source:"Google Maps Geocoding",formatted:matched.formatted_address||"",country,city,region,postal});
 }catch{return reply({error:"google_location_unavailable",verified:false},503);}
}
