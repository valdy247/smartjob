/** Editorial themes for short-form creator stories. Names remain user-editable via Otro. */
export const VIDEO_STUDIO_TOPIC_GROUPS=[
 {id:"popular",label:"Populares",topics:["Curiosidades","Historia","Ciencia","Tecnología","Educación","Entretenimiento","Negocios","Misterios"]},
 {id:"business",label:"Dinero y negocios",topics:["Finanzas personales","Emprendimiento","Marketing digital","Ventas","Inversiones","Ecommerce","Productividad","Inteligencia artificial"]},
 {id:"learning",label:"Aprender",topics:["Historia","Ciencia","Tecnología","Educación","Psicología","Idiomas","Matemáticas","Geografía","Naturaleza","Espacio"]},
 {id:"stories",label:"Historias",topics:["Historias reales","Misterios","Crímenes reales","Leyendas","Terror","Biografías","Datos sorprendentes","Animales","Cuentos originales"]},
 {id:"life",label:"Vida y bienestar",topics:["Salud","Fitness","Alimentación","Gastronomía","Recetas","Familia","Mascotas","Motivación","Desarrollo personal","Relaciones"]},
 {id:"culture",label:"Cultura y actualidad",topics:["Actualidad","Deportes","Viajes","Cine y series","Música","Arte","Videojuegos","Moda","Humor","Cultura"]},
] as const;
export const VIDEO_STUDIO_ALL_TOPICS=Array.from(new Set(
 VIDEO_STUDIO_TOPIC_GROUPS.flatMap(group=>group.topics)
));
export const searchStudioTopics=(text:string,category:string)=>{
 const normalized=(value:string)=>value.normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase("es");
 const query=normalized(text.trim());
 const group=VIDEO_STUDIO_TOPIC_GROUPS.find(item=>item.id===category)||VIDEO_STUDIO_TOPIC_GROUPS[0];
 return (query?VIDEO_STUDIO_ALL_TOPICS:group.topics).filter(topic=>normalized(topic).includes(query));
};
