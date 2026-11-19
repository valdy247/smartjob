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
/** Shift lightness rather than RGB channels: pale brand pink stays pink, not grey. */
function darken(hex:string,factor:number):string{
 const n=parseInt(hex.slice(1),16),rgb=[(n>>16)&255,(n>>8)&255,n&255].map(v=>v/255);
 const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
 const light=(max+min)/2;
 const saturation=delta===0?0:delta/(1-Math.abs(2*light-1));
 let hue=0;
 if(delta){
  switch(max){
   case rgb[0]:hue=((rgb[1]-rgb[2])/delta+6)%6;break;
   case rgb[1]:hue=(rgb[2]-rgb[0])/delta+2;break;
   default:hue=(rgb[0]-rgb[1])/delta+4;
  }
  hue*=60;
 }
 const l=light*factor;
 const c=(1-Math.abs(2*l-1))*saturation;
 const x=c*(1-Math.abs((hue/60)%2-1));
 const m=l-c/2;
 const [r,g,b]=hue<60?[c,x,0]:hue<120?[x,c,0]:
  hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];
 return "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round((v+m)*255)))
  .toString(16).padStart(2,"0")).join("");
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
