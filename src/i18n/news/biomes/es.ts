/**
 * Noticias de los biomas en español (src/data/news.ts): las que solo pueden salir tras dispersar una
 * vez (las de cada destino, las del viento y la postal) y las versiones de las del sotobosque para
 * cada destino. Llegan aparte y solo entonces (news/index.ts): con la pradera y la tundra, un solo
 * catálogo de noticias pasaba de su tope (ARCHITECTURE.md §7). La clave es el id de la noticia; con
 * `.<destino>`, su versión para ese destino.
 */
export const biomeNewsEs = {
  // Versiones de noticias del sotobosque en un destino, donde el texto del natal sería falso: en el
  // Chocó no hay coníferas (ARCHITECTURE.md §4.28) y en la pradera y la tundra no hay bosque.
  'motherTree.choco':
    'Un árbol emergente recibe visitas. Hay quien cree que alimenta a los árboles jóvenes de su sombra; la ciencia aún lo discute.',
  'motherTree.prairie':
    'Un roble solo en mitad de la hierba recibe visitas. Hay quien cree que los árboles viejos alimentan a sus plántulas; la ciencia aún lo discute.',
  'motherTree.tundra':
    'Un abedul enano recibe visitas. Hay quien cree que los árboles viejos alimentan a sus plántulas; la ciencia aún lo discute.',
  'pineCone.choco': 'Cae un fruto de palma sobre la red. La red lo incluye en sus planes.',
  'pineCone.prairie': 'Cae una bellota sobre la red. La red la incluye en sus planes.',
  'pineCone.tundra': 'Cae un arándano sobre la red. La red lo incluye en sus planes.',
  'firstRain.prairie': 'Llueve. Toda la pradera huele a promesa.',
  'firstRain.tundra': 'Llueve. Toda la tundra huele a promesa.',
  // Taiga y Chocó (fase 8)
  'taiga.arrival': 'Llegan esporas desconocidas a la taiga. Las píceas no preguntan de dónde.',
  'taiga.podzol':
    'Podzol viene del ruso: «bajo la ceniza». Nadie quemó nada: el gris sale del agua que lava el suelo durante siglos.',
  'taiga.circumpolar':
    'La taiga rodea el planeta por el norte: Escandinavia, Rusia, Alaska y Canadá. La red ha empezado por una esquina.',
  'taiga.ecto':
    'Píceas, pinos, alerces y abedules: casi todos los árboles de la taiga viven con hongos ectomicorrícicos. Aquí nadie crece solo.',
  'taiga.carbon':
    'Un estudio en islas boreales de Suecia estimó que entre el 50 y el 70 % del carbono del suelo venía de las raíces y de sus hongos. La red guarda más de lo que enseña.',
  'taiga.rockEating':
    'En el horizonte gris del podzol hay granos de feldespato con túneles finísimos. Se cree que los abren hifas en busca de minerales; los geólogos lo llaman meteorización, y la red, almuerzo.',
  'taiga.amanita':
    'La Amanita muscaria, la del sombrero rojo con motas blancas, vive asociada a abedules y píceas. Su fama de cuento no la vuelve comestible: es tóxica.',
  'taiga.snowMold':
    'Bajo la nieve, cerca de cero grados, algunos mohos de las nieves siguen creciendo, entre otras cosas, gracias a proteínas anticongelantes. No todos hibernan.',
  'taiga.morels':
    'Tras un incendio en el bosque boreal, las colmenillas pueden brotar por cientos. Ningún guardabosques lo recomienda como método.',
  'taiga.lichen':
    'El liquen de los renos crece unos pocos milímetros al año. Un reno se come décadas de liquen en una tarde, y el liquen no guarda rencor.',
  'taiga.chaga':
    'En los abedules del norte asoma el chaga, un hongo que parece un trozo de carbón quemado. El abedul no está de acuerdo con la descripción.',
  'taiga.permafrost':
    'En partes de Siberia, la taiga crece sobre suelo helado todo el año. Las raíces viven en la capa de arriba, la única que se deshiela en verano.',
  'choco.arrival': 'Llegan esporas a la selva del Chocó. Aquí nadie pregunta si va a llover, sino cuándo.',
  'choco.forecast': 'Pronóstico para hoy en el Chocó: lluvia. Para mañana: también.',
  'choco.lloro':
    'En Lloró, en el Chocó, se estima que caen unos 13.000 mm de lluvia al año. Le disputa el récord mundial a un pueblo de la India.',
  'choco.endemic':
    'Del Darién, en Panamá, al noroeste de Ecuador, el Chocó biogeográfico guarda miles de especies que no viven en ningún otro lugar. De los hongos, casi nadie ha hecho la cuenta.',
  'choco.leafcutter':
    'Las hormigas cortadoras no comen hojas: las mastican para cultivar un hongo, y se comen el hongo. Agricultura con seis patas.',
  'choco.farmers':
    'Según estimaciones genéticas, las hormigas cultivan hongos desde hace unos 55 a 60 millones de años; los humanos, desde hace unos doce mil. Ellas no presumen.',
  'choco.arbuscular':
    'La mayoría de los árboles de la selva vive con micorrizas arbusculares. Según los fósiles, esa alianza tiene más de 400 millones de años: es más antigua que los propios árboles.',
  'choco.litter':
    'En la selva, una hoja caída puede desaparecer en pocos meses; en la taiga tarda años. Aquí la hojarasca no tiene tiempo de amontonarse.',
  'choco.rootMat':
    'En suelos tropicales pobres, una alfombra de raíces y hongos atrapa los nutrientes antes de que la lluvia los lave. En un experimento en la Amazonía retuvo más del 99,9 %.',
  'choco.splash':
    'Los hongos nido de pájaro usan cada gota de lluvia como catapulta: el golpe lanza fuera de la copa sus paquetes de esporas. En el Chocó no les falta munición.',
  'choco.plastic':
    'Un hongo de la Amazonía de Ecuador, Pestalotiopsis microspora, puede crecer comiendo poliuretano en el laboratorio. La red, de momento, prefiere hojas.',
  'choco.glow':
    'Algunas setas tropicales brillan de noche con luz verde. En una especie de Brasil se vio que la luz atrae insectos, que podrían ayudar a repartir sus esporas.',
  // Pradera y tundra (fase 10)
  'prairie.arrival': 'Llegan esporas a la pradera. La hierba se mece y no hace preguntas.',
  'prairie.chernozem':
    'Chernozem viene del ruso: «tierra negra». En Ucrania, esa capa negra llega a medir metro y medio de hondo.',
  'prairie.belfort':
    'Cerca de Belfort, en Francia, un anillo de hadas de Infundibulicybe geotropa mide unos 600 metros de lado a lado. Se cree que tiene más de 700 años.',
  'prairie.rings':
    'Un anillo de hadas tiene dos bordes: uno más verde, abonado por lo que el hongo descompone, y otro seco, donde hay tantas hifas que el suelo ya no deja entrar el agua.',
  'prairie.bluestem':
    'Andropogon gerardii, una de las hierbas altas de las praderas de Norteamérica, apenas crece sin sus hongos micorrícicos arbusculares. La hierba también tiene socios.',
  'prairie.glomalin':
    'Durante años se dijo que la glomalina, una proteína de los hongos micorrícicos, era el pegamento del suelo. Al medirla salían también otras sustancias, y hoy no se sabe cuánto pega ella sola.',
  'prairie.roots':
    'Las raíces de algunas plantas de pradera bajan más de tres metros; las de la planta brújula, hasta unos cuatro y medio. Para encontrarlas, la sequía tiene que cavar mucho.',
  'prairie.pilobolus':
    'Las vacas no pastan junto a sus boñigas. Pilobolus lo resuelve disparando sus esporas a la hierba limpia: una vaca se las come, cruzan su intestino intactas y germinan en la boñiga siguiente.',
  'prairie.pseudomycelium':
    'En el subsuelo de la pradera asoman hilos blancos que parecen hifas. Son carbonato de calcio, y los edafólogos los llaman pseudomicelio. La red no se da por aludida.',
  'prairie.marasmius':
    'La senderuela, Marasmius oreades, se seca al sol y, cuando vuelve a llover, revive y sigue soltando esporas. La protege un azúcar, la trehalosa.',
  'prairie.lungworm':
    'Las larvas de un gusano pulmonar del ganado trepan por Pilobolus y salen disparadas con su saco de esporas hasta la hierba. Viajar de polizón tiene sus ventajas.',
  'prairie.waxcaps':
    'Los higróforos, setas lisas con colores de cera, abundan en las praderas viejas que nadie ara ni abona. El abono los espanta: por eso sirven para saber qué pastos han vivido tranquilos.',
  'tundra.arrival': 'Llegan esporas a la tundra. Aquí nadie tiene prisa, y el suelo menos.',
  'tundra.word':
    'La palabra tundra llegó por el ruso, que la tomó del sami de Kildin, en la península de Kola: allí nombra las tierras altas sin árboles.',
  'tundra.polarDesert':
    'En buena parte de la tundra ártica caen entre 150 y 250 mm al año, como en un desierto. Aun así, en verano el suelo se encharca: el hielo de debajo no deja bajar el agua.',
  'tundra.species':
    'En el Ártico se conocen unas 4.350 especies de hongos, y 1.750 de ellas forman líquenes. Mucha gente para un desierto frío.',
  'tundra.carbon':
    'El suelo helado del norte guarda unas dos veces el carbono que hay hoy en la atmósfera (Schuur y colegas, 2015). Mientras siga helado, ahí se queda.',
  'tundra.xanthoria':
    'Tras año y medio fuera de la Estación Espacial, en el liquen Xanthoria elegans seguía vivo el 84 % del hongo y el 71 % del alga (Brandt y colegas, 2015). El hongo aguantó más.',
  'tundra.dwarfWillow':
    'El sauce enano, Salix herbacea, mide entre uno y seis centímetros. Es una de las plantas leñosas más pequeñas del mundo, y aun así es un sauce.',
  'tundra.reindeer':
    'Al final del verano, renos y caribúes buscan setas con ganas: cuando las hay, pueden ser entre una décima y una cuarta parte de lo que comen.',
  'tundra.typhula':
    'Typhula, un moho de nieve, necesita dos o tres meses de nieve encima para atacar la hierba. En los campos de golf del norte lo conocen bien.',
  'tundra.silene':
    'Una Silene stenophylla floreció en un laboratorio ruso, regenerada de frutos de hace unos 32.000 años que una ardilla guardó en su madriguera, bajo el permafrost (Yashina y colegas, 2012).',
  'tundra.lichenometry':
    'El liquen geográfico, Rhizocarpon geographicum, crece menos de un milímetro al año. Midiendo sus manchas se fecha cuándo un glaciar dejó al aire una roca.',
  'tundra.pingo':
    'Pingo significa «colina cónica» en inuvialuktun: es una colina con el corazón de hielo. Cerca de Tuktoyaktuk, en Canadá, hay unos 1.350; Ibyuk, de casi 50 metros, aún crece unos centímetros al año.',
  // Del viento, tras la primera dispersión
  'wind.rust':
    'Se ha documentado que esporas de la roya del trigo cruzaron con el viento de Australia a Nueva Zelanda: unos dos mil kilómetros sin equipaje.',
  'wind.buller':
    'Muchas setas lanzan cada espora con una gotita que se fusiona en microsegundos, la gota de Buller. El despegue alcanza miles de veces la gravedad.',
  'wind.altitude':
    'Se han recogido esporas de hongos a kilómetros de altura en la atmósfera. El viento lleva pasajeros que no salen en los mapas.',
  postcard: 'El bosque natal recibe una postal: «Aquí todo bien. Mucha lluvia. Os escribo por la red».',
  // De vuelta en el natal (El regreso y el ciclo libre)
  'return.mycorrhizal':
    'Siete de cada diez especies de plantas viven con hongos micorrícicos arbusculares, y solo un 8 % no tiene micorriza de ninguna clase (Brundrett y Tedersoo, 2018).',
  'return.rhynie':
    'En el sílex de Rhynie, en Escocia, una planta de hace unos 400 millones de años guarda arbúsculos dentro de sus células: la micorriza es casi tan vieja como las plantas de tierra firme (Remy y colegas, 1994).',
  'return.sporeAir':
    'Los hongos sueltan al aire unos 50 millones de toneladas de esporas al año (Elbert y colegas, 2007). Tu linaje volvió a casa en unas pocas.',
  'return.sugarcaneRust':
    'En 1978 la roya de la caña de azúcar apareció en la República Dominicana. Sus esporas habrían cruzado el Atlántico desde Camerún con el viento, en unos nueve días (Purdy y colegas, 1985).',
  'return.oldGrowth':
    'Un bosque tarda siglos en volver a ser viejo: los de abeto de Douglas necesitan unos 175–250 años para tener árboles enormes, troncos muertos en pie y madera caída (Franklin y Spies, 1991).',
  'return.sporeBank':
    'En California hay esporas de Rhizopogon enterradas en un experimento de 99 años. En los cuatro primeros no perdieron fuerza: cada vez más despertaban junto a las raíces de un pino (Bruns y colegas, 2009).',
  // En la taiga y la pradera llueve la mitad; en la tundra, un tercio.
  'postcard.taiga':
    'El bosque natal recibe una postal: «Aquí todo bien. Frío y poca lluvia. Os escribo por la red».',
  'postcard.prairie':
    'El bosque natal recibe una postal: «Aquí todo bien. Mucha hierba y poca lluvia. Os escribo por la red».',
  'postcard.tundra':
    'El bosque natal recibe una postal: «Aquí todo bien. Frío, nieve y casi nada de lluvia. Os escribo por la red».',
};

export type BiomeNewsKey = keyof typeof biomeNewsEs;
