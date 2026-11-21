/** VMV Marketing display labels; business/category IDs never change on locale switch. */
import {t,type MessageKey,type InterfaceLanguage} from "@/lib/i18n";
import {categoryById} from "@/lib/vmv-business-categories";
const groupKey=(group:string)=>group.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
export function marketingCategoryLabel(language:InterfaceLanguage,id:string,fallback=""){
 if(id==="unsure")return t(language,"marketing.category.unsure");
 const found=categoryById(id);
 return found?t(language,("marketing.category."+found.id) as MessageKey):fallback;
}
export function marketingGroupLabel(language:InterfaceLanguage,group:string){
 return t(language,("marketing.group."+groupKey(group)) as MessageKey);
}
