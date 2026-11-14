import type {GoogleData,GoogleHour} from "./google-profile-request";
import {websiteAddress} from "./website-address";

export type CentralBusiness={
 id:string;owner_id:string;name:string;legal_name:string;category_id:string;
 website_url:string|null;description:string;country:string;street:string;unit:string;
 city:string;region:string;postal:string;address_visibility:"private"|"public";
 kind:"storefront"|"service_area"|"hybrid";service_areas:string;
 phone:string;secondary_phone:string;email:string;social_links:Record<string,string>;
 booking_url:string;hours_enabled:boolean;hours:GoogleHour[];
 logo_path:string|null;cover_path:string|null;gallery_paths:string[];
 services:string;products:string;source_system?:string|null;source_record_id?:string|null;
};
export const centralBusinessDefaults=(name="",category_id="other",website_url:string|null=null):Omit<CentralBusiness,"id"|"owner_id">=>({
 name,legal_name:"",category_id,website_url,description:"",country:"US",
 street:"",unit:"",city:"",region:"",postal:"",address_visibility:"private",
 kind:"storefront",service_areas:"",phone:"",secondary_phone:"",email:"",
 social_links:{},booking_url:"",hours_enabled:false,hours:[],
 logo_path:null,cover_path:null,gallery_paths:[],services:"",products:"",
 source_system:null,source_record_id:null
});
export function businessGoogleSeed(b:CentralBusiness,action:GoogleData["action"]="create"):GoogleData{
 return {
  action,kind:b.kind,googleCategory:"",otherCategories:"",
  street:b.kind==="service_area"?"":b.street,unit:b.kind==="service_area"?"":b.unit,
  city:b.kind==="service_area"?"":b.city,region:b.kind==="service_area"?"":b.region,
  postal:b.kind==="service_area"?"":b.postal,country:b.country||"US",
  serviceAreas:b.service_areas||"",phone:b.phone||"",secondaryPhone:b.secondary_phone||"",
  description:b.description||"",services:b.services||"",products:b.products||"",
  bookingUrl:b.booking_url||"",existingProfileUrl:"",openingDate:"",hoursEnabled:b.hours_enabled,
  hours:b.hours?.length===7?b.hours:Array.from({length:7},()=>({closed:true,start:"09:00",end:"17:00"}))
 };
}
export function mergeGoogleWithBusiness(current:GoogleData,b:CentralBusiness):GoogleData{
 const seed=businessGoogleSeed(b,current.action);
 const filled=(v:string|undefined,fallback:string)=>v?.trim()?v:fallback;
 return {...current,
  kind:b.kind,country:seed.country,
  street:filled(current.street,seed.street),unit:filled(current.unit,seed.unit),
  city:filled(current.city,seed.city),region:filled(current.region,seed.region),
  postal:filled(current.postal,seed.postal),serviceAreas:filled(current.serviceAreas,seed.serviceAreas),
  phone:filled(current.phone,seed.phone),secondaryPhone:filled(current.secondaryPhone,seed.secondaryPhone),
  description:filled(current.description,seed.description),services:filled(current.services,seed.services),
  products:filled(current.products,seed.products),bookingUrl:filled(current.bookingUrl,seed.bookingUrl),
  hoursEnabled:current.hoursEnabled||seed.hoursEnabled,
  hours:current.hoursEnabled?current.hours:seed.hours
 };
}
export function googleChangesForProfile(b:CentralBusiness,g:GoogleData){
 return {
  description:g.description,kind:g.kind,service_areas:g.serviceAreas,
  phone:g.phone,secondary_phone:g.secondaryPhone,booking_url:g.bookingUrl,
  hours_enabled:g.hoursEnabled,hours:g.hours,
  // A private home address is kept in the central profile when a service-area
  // customer requests a listing without a public storefront.
  ...(g.kind==="service_area"?{address_visibility:"private" as const}:{
   street:g.street,unit:g.unit,city:g.city,region:g.region,postal:g.postal,country:g.country
  })
 };
}
export function businessRequestSnapshot(b:CentralBusiness,service:"google_profile"|"other",g?:GoogleData){
 const mediaPaths=[b.logo_path,b.cover_path,...b.gallery_paths].filter((x):x is string=>typeof x==="string"&&x.length>0);
 return {
  version:1,id:b.id,name:b.name,category_id:b.category_id,
  website_url:websiteAddress(b.website_url||""),
  kind:service==="google_profile"&&g?g.kind:b.kind,
  // Do not copy a residential address into a request meant for a service area.
  location:(service==="google_profile"&&g?.kind==="service_area")||b.kind==="service_area"?
   {country:g?.country||b.country,serviceAreas:g?.serviceAreas||b.service_areas,addressPublic:false}:
   {country:g?.country||b.country,street:g?.street??b.street,unit:g?.unit??b.unit,
    city:g?.city??b.city,region:g?.region??b.region,postal:g?.postal??b.postal,
    serviceAreas:g?.serviceAreas||b.service_areas,addressPublic:service==="google_profile"&&g?true:b.address_visibility==="public"},
  phone:g?.phone||b.phone,secondaryPhone:g?.secondaryPhone||b.secondary_phone,
  email:b.email,description:g?.description??b.description,
  services:g?.services??b.services,products:g?.products??b.products,
  hoursEnabled:g?.hoursEnabled??b.hours_enabled,hours:g?.hours??b.hours,
  bookingUrl:g?.bookingUrl??b.booking_url,mediaPaths
 };
}
export function validCentralBusiness(b:Pick<CentralBusiness,"name"|"country"|"website_url"|"email"|"kind">){
 if(b.name.trim().length<2||b.name.length>150)return "Business name must have 2 to 150 characters.";
 if(!/^[a-z]{2}$/i.test(b.country.trim()))return "Country must be a two-letter code.";
 if(b.website_url&&!websiteAddress(b.website_url))return "Please enter a valid website URL.";
 if(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))return "Please check your business email.";
 return "";
}
