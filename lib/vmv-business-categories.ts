/** VMV-wide stable business taxonomy (not Google’s official category list).
 * Reuse the IDs across Web Services, GBP intake and future modules.
 * Never authorize billing or sensitive access based on category IDs. */
export type BusinessCategory={id:string;label:string;group:string};
export const BUSINESS_CATEGORIES:readonly BusinessCategory[]=[
 {id:"bakery",label:"Panadería y repostería",group:"Alimentos y bebidas"},
 {id:"restaurant",label:"Restaurante",group:"Alimentos y bebidas"},
 {id:"cafe",label:"Cafetería",group:"Alimentos y bebidas"},
 {id:"catering",label:"Catering y eventos gastronómicos",group:"Alimentos y bebidas"},
 {id:"food-truck",label:"Food truck",group:"Alimentos y bebidas"},
 {id:"grocery",label:"Tienda de alimentos",group:"Alimentos y bebidas"},
 {id:"barber",label:"Barbería",group:"Belleza y bienestar"},
 {id:"beauty-salon",label:"Salón de belleza",group:"Belleza y bienestar"},
 {id:"nails",label:"Uñas y estética",group:"Belleza y bienestar"},
 {id:"spa",label:"Spa y masajes",group:"Belleza y bienestar"},
 {id:"fitness",label:"Gimnasio y entrenamiento",group:"Belleza y bienestar"},
 {id:"wellness",label:"Bienestar y cuidado personal",group:"Belleza y bienestar"},
 {id:"carpentry",label:"Carpintería",group:"Construcción y hogar"},
 {id:"general-contractor",label:"Contratista general",group:"Construcción y hogar"},
 {id:"home-builder",label:"Construcción de viviendas",group:"Construcción y hogar"},
 {id:"remodeling",label:"Remodelación y renovaciones",group:"Construcción y hogar"},
 {id:"electrical",label:"Electricidad",group:"Construcción y hogar"},
 {id:"plumbing",label:"Plomería",group:"Construcción y hogar"},
 {id:"hvac",label:"Climatización y HVAC",group:"Construcción y hogar"},
 {id:"landscaping",label:"Jardinería y paisajismo",group:"Construcción y hogar"},
 {id:"cleaning",label:"Limpieza profesional",group:"Construcción y hogar"},
 {id:"smart-home",label:"Domótica y casas inteligentes",group:"Construcción y hogar"},
 {id:"roofing",label:"Techos y cubiertas",group:"Construcción y hogar"},
 {id:"painting",label:"Pintura residencial y comercial",group:"Construcción y hogar"},
 {id:"real-estate",label:"Bienes raíces",group:"Hogar y propiedades"},
 {id:"property-management",label:"Administración de propiedades",group:"Hogar y propiedades"},
 {id:"interior-design",label:"Diseño de interiores",group:"Hogar y propiedades"},
 {id:"furniture",label:"Muebles y decoración",group:"Hogar y propiedades"},
 {id:"retail",label:"Tienda minorista",group:"Comercio"},
 {id:"fashion",label:"Moda y ropa",group:"Comercio"},
 {id:"jewelry",label:"Joyería y accesorios",group:"Comercio"},
 {id:"ecommerce",label:"Comercio electrónico",group:"Comercio"},
 {id:"automotive",label:"Taller automotriz",group:"Automoción y transporte"},
 {id:"car-detailing",label:"Lavado y detallado de autos",group:"Automoción y transporte"},
 {id:"car-sales",label:"Venta de vehículos",group:"Automoción y transporte"},
 {id:"transport",label:"Transporte y logística",group:"Automoción y transporte"},
 {id:"courier",label:"Mensajería y entregas",group:"Automoción y transporte"},
 {id:"software",label:"Software y tecnología",group:"Servicios digitales"},
 {id:"web-design",label:"Diseño web",group:"Servicios digitales"},
 {id:"marketing-agency",label:"Agencia de marketing",group:"Servicios digitales"},
 {id:"creative-studio",label:"Estudio creativo",group:"Servicios digitales"},
 {id:"photography",label:"Fotografía y video",group:"Servicios digitales"},
 {id:"consulting",label:"Consultoría empresarial",group:"Servicios profesionales"},
 {id:"accounting",label:"Contabilidad e impuestos",group:"Servicios profesionales"},
 {id:"legal",label:"Servicios legales",group:"Servicios profesionales"},
 {id:"insurance",label:"Seguros",group:"Servicios profesionales"},
 {id:"translation",label:"Traducción e interpretación",group:"Servicios profesionales"},
 {id:"education",label:"Educación y tutorías",group:"Educación"},
 {id:"online-courses",label:"Cursos en línea",group:"Educación"},
 {id:"childcare",label:"Cuidado infantil",group:"Educación"},
 {id:"healthcare",label:"Salud y atención médica",group:"Salud"},
 {id:"dental",label:"Odontología",group:"Salud"},
 {id:"pet-grooming",label:"Peluquería de mascotas",group:"Mascotas"},
 {id:"veterinary",label:"Veterinaria",group:"Mascotas"},
 {id:"pet-care",label:"Cuidado de mascotas",group:"Mascotas"},
 {id:"event-planning",label:"Organización de eventos",group:"Eventos y entretenimiento"},
 {id:"florist",label:"Floristería",group:"Eventos y entretenimiento"},
 {id:"music",label:"Música y entretenimiento",group:"Eventos y entretenimiento"},
 {id:"hospitality",label:"Hotel y alojamiento",group:"Viajes y hospedaje"},
 {id:"travel-agency",label:"Agencia de viajes",group:"Viajes y hospedaje"},
 {id:"nonprofit",label:"Organización sin fines de lucro",group:"Comunidad"},
 {id:"other",label:"Otro tipo de negocio",group:"Otros"}
] as const;
export const CATEGORY_GROUPS:readonly string[]=[...new Set(BUSINESS_CATEGORIES.map(c=>c.group))];
export function categoryById(id:string):BusinessCategory|undefined{
 return BUSINESS_CATEGORIES.find(c=>c.id===id);
}
export function categoryIdFromLabel(input:string):string{
 const val=input.trim().toLocaleLowerCase("es");
 return BUSINESS_CATEGORIES.find(c=>c.id===val||c.label.toLocaleLowerCase("es")===val)?.id||"";
}
export function categoryLabel(id:string, fallback=""):string{
 return categoryById(id)?.label||fallback;
}
