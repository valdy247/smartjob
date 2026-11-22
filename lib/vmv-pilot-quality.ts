export type PilotQuality="turbo"|"high"|"compare";
export type PilotVariant="turbo"|"high";
export const pilotQualityOptions=[
 {id:"turbo",name:"Turbo",model:"gen4_turbo",centsPerSecond:5},
 {id:"high",name:"Alta",model:"gen4.5",centsPerSecond:12},
 {id:"compare",name:"Probar ambas",model:"both",centsPerSecond:17}
] as const;
export const validPilotQuality=(value:unknown):value is PilotQuality=>
 value==="turbo"||value==="high"||value==="compare";
export const variantsForQuality=(value:PilotQuality):PilotVariant[]=>
 value==="compare"?["turbo","high"]:[value];
export const animationCostCents=(seconds:15|30|60,quality:PilotQuality)=>
 seconds*(quality==="compare"?17:quality==="high"?12:5);
export const priceUSD=(cents:number)=>"$"+(cents/100).toFixed(2);
