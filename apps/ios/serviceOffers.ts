/**
 * Internal service merchandising metadata only. Never use this catalog for
 * entitlement checks, Stripe prices, paid activation or fulfillment status.
 * Prices and plan membership require a verified server-side offering.
 */
export type OfferCharge="subscription"|"one_time";
export type OfferDelivery="automatic"|"assisted";
export type OfferState="pilot"|"planned";
export type OfferId=
  |"smart-call"|"site-care"|"ai-agents"|"local-seo"|"reviews"|"smart-booking"
  |"website-design"|"google-business-profile"|"seo-setup"|"domain-setup";

export type ServiceOffer={
  id:OfferId;
  name:string;
  charge:OfferCharge;
  delivery:OfferDelivery;
  state:OfferState;
  icon:string;
  accent:string;
  background:string;
};

export const SERVICE_OFFERS:readonly ServiceOffer[]=[
  {id:"smart-call",name:"Smart Call",charge:"subscription",delivery:"automatic",state:"pilot",
   icon:"call-outline",accent:"#64399A",background:"#E3D4FF"},
  {id:"site-care",name:"Web Care",charge:"subscription",delivery:"automatic",state:"planned",
   icon:"globe-outline",accent:"#855215",background:"#FFE5A3"},
  {id:"ai-agents",name:"AI Agents",charge:"subscription",delivery:"automatic",state:"planned",
   icon:"hardware-chip-outline",accent:"#30628A",background:"#C4E8FF"},
  {id:"local-seo",name:"SEO Local",charge:"subscription",delivery:"assisted",state:"planned",
   icon:"search-outline",accent:"#196956",background:"#BAEEDC"},
  {id:"reviews",name:"Reseñas",charge:"subscription",delivery:"assisted",state:"planned",
   icon:"star-outline",accent:"#9A4B76",background:"#FFD5E7"},
  {id:"smart-booking",name:"Smart Booking",charge:"subscription",delivery:"automatic",state:"planned",
   icon:"calendar-outline",accent:"#6E55AA",background:"#E3D9FF"},
  {id:"website-design",name:"Diseño web",charge:"one_time",delivery:"automatic",state:"planned",
   icon:"browsers-outline",accent:"#8D5C1F",background:"#FFE29A"},
  {id:"google-business-profile",name:"Google Business Profile",charge:"one_time",delivery:"assisted",state:"planned",
   icon:"location-outline",accent:"#6941A1",background:"#DED0FF"},
  {id:"seo-setup",name:"SEO inicial",charge:"one_time",delivery:"assisted",state:"planned",
   icon:"analytics-outline",accent:"#275E7B",background:"#C2E6FF"},
  {id:"domain-setup",name:"Dominio",charge:"one_time",delivery:"assisted",state:"planned",
   icon:"link-outline",accent:"#186C57",background:"#C4F0DE"},
];

export const offersFor=(charge:OfferCharge):readonly ServiceOffer[] =>
  SERVICE_OFFERS.filter(item=>item.charge===charge);

/** Non-transactional labels: actual plans, fees and automation come from backend. */
export const deliveryLabel=(delivery:OfferDelivery):string=>
  delivery==="automatic"?"Auto":"Asistido";
