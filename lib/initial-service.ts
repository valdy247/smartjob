/** Presentation preference only; never grants access to a paid service. */
export const INITIAL_SERVICES=[
 {id:"translation",label:"setup.translation",href:"/vista-app"},
 {id:"agent",label:"setup.agent",href:"/vista-app/ai-agents"},
 {id:"website",label:"setup.website",href:"/web-studio"},
 {id:"marketing",label:"setup.marketing",href:"/vista-app/marketing"}
] as const;
export type InitialService=typeof INITIAL_SERVICES[number]["id"];
export function initialService(value:unknown):InitialService|null{
 return INITIAL_SERVICES.find(item=>item.id===value)?.id||null;
}
