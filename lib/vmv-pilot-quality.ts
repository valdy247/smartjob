export type PilotQuality="turbo"|"high"|"compare";
export type PilotVariant="turbo"|"high";
export const pilotQualityOptions=[
 {id:"turbo",name:"Turbo",model:"seedance-v1.0-pro-fast",centsPerSecond:2.06},
 {id:"high",name:"Alta",model:"seedance-v1.0-pro",centsPerSecond:5.15},
 {id:"compare",name:"Probar ambas",model:"both",centsPerSecond:7.21}
] as const;
export const validPilotQuality=(value:unknown):value is PilotQuality=>
 value==="turbo"||value==="high"||value==="compare";
export const variantsForQuality=(value:PilotQuality):PilotVariant[]=>
 value==="compare"?["turbo","high"]:[value];
export const animationCostCents=(seconds:15|30|60,quality:PilotQuality)=>
 Math.ceil(seconds*(quality==="compare"?7.21:quality==="high"?5.15:2.06));
export const priceUSD=(cents:number)=>"$"+(cents/100).toFixed(2);
