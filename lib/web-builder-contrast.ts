/** Site colors are validated on the server and used for readable UI on every viewport.
 * Preserve the customer's hue, but darken overly pale accents on light surfaces. */
export const COLOR_HEX=/^#[0-9a-f]{6}$/i;
const channel=(c:number)=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
export function luminance(hex:string):number{
 if(!COLOR_HEX.test(hex))return 0;
 const n=parseInt(hex.slice(1),16);
 return 0.2126*channel((n>>16)&255)+0.7152*channel((n>>8)&255)+0.0722*channel(n&255);
}
export function contrast(a:string,b:string):number{
 const l1=luminance(a),l2=luminance(b);
 return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function darken(hex:string,factor:number):string{
 const n=parseInt(hex.slice(1),16);
 return "#"+[(n>>16)&255,(n>>8)&255,n&255]
  .map(v=>Math.max(0,Math.min(255,Math.round(v*factor))).toString(16).padStart(2,"0")).join("");
}
export function accessibleAccent(value:string,fallback="#6c398f"):string{
 const original=COLOR_HEX.test(value)?value:fallback;
 if(contrast(original,"#ffffff")>=4.5)return original;
 let lo=0,hi=1;
 for(let i=0;i<18;i++){
  const m=(lo+hi)/2;
  if(contrast(darken(original,m),"#ffffff")>=4.5)lo=m;else hi=m;
 }
 return darken(original,lo);
}
export function onAccent(hex:string):"#ffffff"|"#17151d"{
 return contrast(hex,"#ffffff")>=contrast(hex,"#17151d")?"#ffffff":"#17151d";
}
export function colorsAreDistinct(colors:string[]):boolean{
 return colors.length===3&&colors.every(c=>COLOR_HEX.test(c))&&new Set(colors.map(c=>c.toLowerCase())).size===3;
}
