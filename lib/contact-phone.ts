import {DIAL_COUNTRIES} from "./registration/options";

export function splitContactPhone(input:string){
 const compact=input.trim().replace(/[().\s-]/g,"");
 const international=compact.startsWith("+")?compact:/^1\d{10}$/.test(compact)?"+"+compact:null;
 const country=international?[...DIAL_COUNTRIES].sort((a,b)=>b.code.length-a.code.length)
  .find(item=>international.startsWith(item.code)):undefined;
 return {country:country?.country||"US",phone:country&&international?international.slice(country.code.length):input};
}

export function contactPhoneE164(input:string,country:string):string|null {
 const dial=DIAL_COUNTRIES.find(item=>item.country===country)?.code;
 const compact=input.trim().replace(/[().\s-]/g,"");
 if(!dial||!/^\+?\d+$/.test(compact))return null;
 // Pasted international numbers retain their explicit prefix. National input
 // uses the visible selector, including the common 11-digit NANP format.
 const full=compact.startsWith("+")?compact:
  dial==="+1"&&/^1\d{10}$/.test(compact)?"+"+compact:dial+compact;
 if(!/^\+[1-9]\d{7,14}$/.test(full))return null;
 if(full.startsWith("+1")&&full.length!==12)return null;
 return full;
}
