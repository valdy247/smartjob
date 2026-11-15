import type {CSSProperties} from "react";
import {validColor} from "./web-builder-callout-style";

/** Shared, safe button colors for editor, preview and published websites. */
export function buttonAppearance(input:Record<string,unknown>){
 const background=validColor(input.buttonColor);
 const chosenText=validColor(input.buttonTextColor);
 // Use a readable foreground automatically when only the background is customized.
 const contrastText=background?(()=>{
  const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255);
  const linear=rgb.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
  const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  return luminance>.18?"#241a30":"#ffffff";
 })():"";
 const foreground=chosenText||contrastText;
 const size=typeof input.buttonFontSize==="number"&&Number.isFinite(input.buttonFontSize)&&input.buttonFontSize>=11?
  Math.min(36,Math.round(input.buttonFontSize)):0;
 return {
  style:{
   ...(background?{"--vmv-button-background":background}:{}),
   ...(foreground?{"--vmv-button-foreground":foreground}:{}),
   ...(size?{fontSize:size+"px"}:{})
  } as CSSProperties,
  hasBackground:Boolean(background),
  hasForeground:Boolean(foreground)
 };
}
