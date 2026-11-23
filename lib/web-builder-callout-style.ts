import type {CSSProperties} from "react";
export const CTA_SURFACES=["dark","light","soft","accent","custom"] as const;
export const CTA_SHAPES=["pill","rounded","square"] as const;
export const CTA_STYLES=["solid","outline","link"] as const;
export const CTA_ALIGN=["left","center","right"] as const;
export const CTA_SPACING=["compact","normal","spacious"] as const;
export const CTA_FONTS=["site","modern","editorial","rounded","geometric","mono"] as const;
function choice(value:unknown,options:readonly string[],fallback:string){
 return typeof value==="string"&&options.includes(value)?value:fallback;
}
export function validColor(value:unknown):string{
 return typeof value==="string"&&/^#[\da-f]{6}$/i.test(value)?value:"";
}
function number(value:unknown,defaultValue:number,min:number,max:number){
 return typeof value==="number"&&Number.isFinite(value)?Math.min(max,Math.max(min,Math.round(value))):defaultValue;
}
export function normalizeCalloutStyle(input:Record<string,unknown>):Record<string,unknown>{
 return {
  sectionSurface:choice(input.sectionSurface,CTA_SURFACES,"dark"),
  sectionBackground:validColor(input.sectionBackground),
  sectionTextColor:validColor(input.sectionTextColor),
  sectionAlign:choice(input.sectionAlign,CTA_ALIGN,"left"),
  sectionPadding:choice(input.sectionPadding,CTA_SPACING,"normal"),
  sectionRadius:number(input.sectionRadius,0,0,48),
  titleFont:choice(input.titleFont,CTA_FONTS,"site"),
  titleFontSize:number(input.titleFontSize,0,0,110),
  titleColor:validColor(input.titleColor),
  titleShadow:choice(input.titleShadow,["none","soft","strong"],"none"),
  buttonStyle:choice(input.buttonStyle,CTA_STYLES,"solid"),
  buttonShape:choice(input.buttonShape,CTA_SHAPES,"pill"),
  buttonRadius:number(input.buttonRadius,0,0,64),
  buttonColor:validColor(input.buttonColor),
  buttonTextColor:validColor(input.buttonTextColor),
  buttonBorderColor:validColor(input.buttonBorderColor),
  buttonBorderWidth:number(input.buttonBorderWidth,0,0,10),
  buttonFontSize:number(input.buttonFontSize,13,11,26)
 };
}
const fonts:Record<string,string>={
 site:"inherit",modern:"Arial, sans-serif",editorial:"Georgia, serif",
 rounded:"Trebuchet MS, sans-serif",geometric:"Avenir Next, Arial, sans-serif",mono:"ui-monospace, monospace"
};
export function calloutSectionStyles(input:Record<string,unknown>):CSSProperties{
 const p=normalizeCalloutStyle(input),surface=String(p.sectionSurface);
 const background=surface==="custom"?(p.sectionBackground||"#282137"):
  surface==="light"?"#fff":surface==="soft"?"var(--vmv-pale)":
  surface==="accent"?"var(--vmv-accent)":"#282137";
 return {
  background:String(background),
  color:String(p.sectionTextColor||(["light","soft"].includes(surface)?"#30243f":"#fff")),
  borderRadius:p.sectionRadius+"px"
 };
}
export function calloutHeadingStyles(input:Record<string,unknown>):CSSProperties{
 const p=normalizeCalloutStyle(input);
 return {
  fontFamily:fonts[String(p.titleFont)]||"inherit",
  fontSize:Number(p.titleFontSize)>=12?p.titleFontSize+"px":undefined,
  color:p.titleColor?String(p.titleColor):undefined,
  textShadow:p.titleShadow==="strong"?"0 4px 14px rgba(0,0,0,.4)":
   p.titleShadow==="soft"?"0 2px 6px rgba(0,0,0,.2)":undefined
 };
}
export function calloutButtonStyles(input:Record<string,unknown>):CSSProperties{
 const p=normalizeCalloutStyle(input),style=String(p.buttonStyle),shape=String(p.buttonShape);
 const rounding=Number(p.buttonRadius)>0?Number(p.buttonRadius):shape==="square"?0:shape==="rounded"?12:99;
 const bg=String(p.buttonColor||"var(--vmv-accent)");
 const text=String(p.buttonTextColor||((style==="solid")?"#fff":"var(--vmv-accent)"));
 const borderColor=String(p.buttonBorderColor||p.buttonColor||"var(--vmv-accent)");
 const borderWidth=Number(p.buttonBorderWidth)||((style==="outline")?2:0);
 return {
  borderRadius:rounding+"px",
  background:style==="solid"?bg:"transparent",
  color:text,
  border:style==="link"?"none":borderWidth+"px solid "+borderColor,
  fontSize:p.buttonFontSize+"px",
  padding:style==="link"?"9px 2px":undefined,
  minHeight:44,
  maxWidth:"100%",
  overflowWrap:"anywhere",
  textAlign:"center"
 };
}
