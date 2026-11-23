/** Topic-aware filtering for public regional YouTube popularity charts.
 * The region remains the video's popularity chart, not its production country.
 * A topic match is mandatory: category IDs alone are too broad (e.g. Education).
 */
import type {RadarVideo} from "./vmv-video-radar";

type Rule={category:string;terms:readonly string[]};
const rules:Record<string,Rule>={
 curiosidades:{category:"27",terms:["curiosidad","curiosidades","curious facts","did you know","fun facts","interesting facts","sabias que","datos curiosos"]},
 historia:{category:"27",terms:["historia","historico","historica","history","historical","ancient","antiguo","antigua","civilization","civilizacion","arqueologia","archaeology"]},
 ciencia:{category:"28",terms:["ciencia","scientific","science","experiment","experimento","scientist","cientifico","research","investigacion","physics","fisica","quimica","chemistry"]},
 tecnologia:{category:"28",terms:["tecnologia","technology","tech","gadgets","smartphone","computing","informatica","software","hardware","robotica","robotics","innovation","innovacion"]},
 educacion:{category:"27",terms:["educacion","education","educational","aprender","learning","tutorial","lesson","leccion","enseñanza","teaching","school","escuela"]},
 entretenimiento:{category:"24",terms:["entretenimiento","entertainment","show","espectaculo","espectaculos","performance","celebrity","famosos"]},
 negocios:{category:"22",terms:["negocios","business","empresas","empresa","entrepreneur","emprendedor","startup","comercio","business ideas"]},
 misterios:{category:"24",terms:["misterio","misterios","mystery","mysteries","unsolved","sin resolver","enigma","enigmas","paranormal"]},
 "finanzas personales":{category:"27",terms:["finanzas","finance","financial","personal finance","presupuesto","budget","ahorro","savings","deudas","debt","credit score","tarjeta de credito"]},
 emprendimiento:{category:"22",terms:["emprendimiento","emprendedor","entrepreneur","entrepreneurship","startup","startups","small business","pequeño negocio"]},
 "marketing digital":{category:"27",terms:["marketing","publicidad","advertising","ads","seo","social media strategy","mercadotecnia","conversiones","content strategy"]},
 ventas:{category:"27",terms:["ventas","sales","vender","selling","salesperson","vendedor","sell more","closing deals"]},
 inversiones:{category:"27",terms:["inversion","inversiones","investing","investments","stocks","acciones","bolsa de valores","stock market","etf"]},
 ecommerce:{category:"27",terms:["ecommerce","e commerce","online store","tienda online","tienda virtual","shopify","dropshipping","comercio electronico"]},
 productividad:{category:"27",terms:["productividad","productivity","time management","gestion del tiempo","habitos productivos","focus techniques","deep work"]},
 "inteligencia artificial":{category:"28",terms:["inteligencia artificial","artificial intelligence","ai tools","machine learning","aprendizaje automatico","chatgpt","neural network","red neuronal","generative ai"]},
 psicologia:{category:"27",terms:["psicologia","psychology","psicologo","psychologist","mental processes","cognitive","cognitivo","human behavior","comportamiento humano"]},
 idiomas:{category:"27",terms:["idiomas","languages","language learning","aprender ingles","learn spanish","ingles","english lesson","language lessons","linguistica","linguistics"]},
 matematicas:{category:"27",terms:["matematicas","math","mathematics","algebra","geometria","geometry","calculus","calculo","ecuaciones","equations"]},
 geografia:{category:"27",terms:["geografia","geography","geographic","geographical","geopolitica","geopolitics","mapa","mapas","maps","atlas","frontera","fronteras","borders","border","continentes","continents","paises","countries","capitales","capitals","oceano","ocean","oceans","desierto","desert","territorios","territory","rivers","rios","volcanes","volcanoes"]},
 naturaleza:{category:"15",terms:["naturaleza","nature","wildlife","ecosystem","ecosistema","bosques","forest","flora","fauna","biodiversidad","biodiversity"]},
 espacio:{category:"28",terms:["espacio","space exploration","outer space","astronomia","astronomy","nasa","galaxia","galaxy","universe","universo","planetas","planets","cosmos"]},
 "historias reales":{category:"22",terms:["historia real","historias reales","true story","true stories","real story","incredible story","hechos reales","relato real"]},
 "crimenes reales":{category:"24",terms:["crimenes reales","true crime","asesinato","murder","criminal case","caso criminal","serial killer","asesino serial","investigacion criminal"]},
 leyendas:{category:"24",terms:["leyenda","leyendas","legend","legends","folklore","folclore","mythology","mitologia","myths","mitos"]},
 terror:{category:"24",terms:["terror","horror","scary","miedo","haunted","embrujado","creepy","espeluznante","ghost story"]},
 biografias:{category:"27",terms:["biografia","biografias","biography","biographies","life story","vida de","who was","quien fue"]},
 "datos sorprendentes":{category:"27",terms:["datos sorprendentes","amazing facts","surprising facts","datos curiosos","fun facts","did you know","sabias que","incredible facts"]},
 animales:{category:"15",terms:["animales","animal","animals","wildlife","fauna","zoologia","zoology","species","especies"]},
 "cuentos originales":{category:"24",terms:["cuento","cuentos","short story","fairy tale","fairy tales","bedtime story","ficcion","fiction","original story"]},
 salud:{category:"27",terms:["salud","health","healthcare","bienestar fisico","medical","medicina","enfermedad","disease"]},
 fitness:{category:"17",terms:["fitness","workout","entrenamiento","ejercicio","exercise","gym","gimnasio","strength training","cardio"]},
 alimentacion:{category:"26",terms:["alimentacion","nutrition","nutricion","healthy eating","comida saludable","diet","dieta","food science"]},
 gastronomia:{category:"26",terms:["gastronomia","gastronomy","cocina","cuisine","culinary","chef","comida","food"]},
 recetas:{category:"26",terms:["recetas","recipe","recipes","cooking","cocinar","how to cook","baking","hornear"]},
 familia:{category:"22",terms:["familia","family","parenting","crianza","padres","maternidad","paternidad","children and parents"]},
 mascotas:{category:"15",terms:["mascotas","pet","pets","perro","perros","dogs","cat","cats","gatos","pet care"]},
 motivacion:{category:"22",terms:["motivacion","motivation","motivational","inspiracion","inspirational","self improvement","superacion personal"]},
 "desarrollo personal":{category:"27",terms:["desarrollo personal","personal growth","self development","self improvement","superacion personal","habitos saludables","growth mindset"]},
 relaciones:{category:"22",terms:["relaciones","relationships","pareja","couples","dating","love advice","consejos amorosos","amistad","friendship"]},
 actualidad:{category:"25",terms:["actualidad","breaking news","news","noticias","latest news","today news","politica actual","current events"]},
 deportes:{category:"17",terms:["deportes","sports","football","futbol","soccer","basketball","baloncesto","baseball","tenis","tennis","atletismo","athletics"]},
 viajes:{category:"19",terms:["viajes","travel","traveling","travelling","tourism","turismo","destino","destinations","itinerary","itinerario"]},
 "cine y series":{category:"1",terms:["cine","cinema","movie","movies","pelicula","peliculas","film review","series","tv show","television series"]},
 musica:{category:"10",terms:["musica","music","cancion","canciones","song","songs","album","music video","official audio","concierto","concert"]},
 arte:{category:"24",terms:["arte","art","artwork","painting","pintura","dibujo","drawing","sculpture","escultura","illustration","ilustracion"]},
 videojuegos:{category:"20",terms:["videojuegos","videogames","video games","gaming","gameplay","gamer","minecraft","fortnite","gta","grand theft auto"]},
 moda:{category:"26",terms:["moda","fashion","outfit","outfits","ropa","clothing","style trends","pasarela","runway fashion"]},
 humor:{category:"23",terms:["humor","comedy","comedian","comedia","chistes","jokes","funny","standup","stand up","parodia","parody"]},
 cultura:{category:"27",terms:["cultura","culture","cultural","tradiciones","traditions","heritage","patrimonio","customs","costumbres"]}
};
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const contains=(body:string,term:string)=>Boolean(term)&&body.includes(" "+term+" ");
const stopWords=new Set(["sobre","para","como","esta","este","estas","estos","todo","todos","todas","video","videos","tema","the","with","from","that","this","about","and","los","las","del","una","unos","de","con"]);
export const trendTopicCategory=(topic:string):string|undefined=>rules[normalized(topic)]?.category;
export const videoMatchesTrendTopic=(video:Pick<RadarVideo,"title"|"description">,topic:string):boolean=>{
 const key=normalized(topic);
 if(!key)return false;
 const rule=rules[key];
 const custom=key.split(" ").filter(word=>word.length>=4&&!stopWords.has(word));
 const terms=Array.from(new Set((rule?[key,...rule.terms]:[key,...custom]).map(normalized).filter(term=>term.length>=3)));
 const title=" "+normalized(video.title||"")+" ";
 const description=" "+normalized(video.description||"")+" ";
 // An explicit subject in the title qualifies; arbitrary metadata does not.
 if(terms.some(term=>contains(title,term)))return true;
 if(contains(description,key))return true;
 // Descriptions need two independent topic signals; generic hashtags alone do not.
 const matches=terms.filter(term=>contains(description,term));
 return matches.length>=2;
};
export const filterTopicTrends=(items:RadarVideo[],topic:string):RadarVideo[]=>
 items.filter(item=>videoMatchesTrendTopic(item,topic));
