import type {CommerceCatalogProduct} from "./catalog-snapshot";

/** AI-facing storefront data: no stock counts, SKU, cost data or internal holds. */
export function customerCatalog(items:CommerceCatalogProduct[]){
 return items.map(item=>({
  id:item.id,name:item.name,description:item.description,
  priceCents:item.priceCents,currency:item.currency,
  availability:item.availability==="manual"?"por confirmar":
   item.sellableInTest?"a verificar al solicitar":"consultar con el negocio"
 }));
}

/** Defense in depth when model wording unexpectedly includes inventory quantities. */
export function hideStockCounts(reply:string){
 return reply
  .replace(/\b(?:stock|existencias|disponibilidad)\s*:\s*\d+\b/gi,
   "disponibilidad por confirmar")
  .replace(/\b(?:con\s+|hay\s+|tenemos\s+|quedan\s+)?\d{1,8}\s*(?:unidades?(?:\s+disponibles?)?|units?(?:\s+(?:available|in stock))?|disponibles?\s+en\s+stock)\b/gi,
   "disponibilidad por confirmar")
  .replace(/\b(?:hay|tenemos|quedan|stock|existencias|available|remaining|left)\s*[:=]?\s*\d{1,8}\b/gi,
   "disponibilidad por confirmar")
  .replace(/\b\d{1,8}\s+(?:disponibles?|en\s+stock|in\s+stock|remaining|left)\b/gi,
   "disponibilidad por confirmar")
  .replace(/\b(?:in stock|available):?\s*\d+\b/gi,
   "availability to be confirmed");
}
