/**
 * Noticias del sotobosque en español (src/data/news.ts). Llegan aparte con import() y solo las
 * del idioma activo: son más de cien frases y no cabían en el JS inicial (ARCHITECTURE.md §7).
 * La clave es el id de la noticia; con `.<bioma>`, su versión para ese bioma.
 */
export const newsEs = {
  'motherTree.choco':
    'Un árbol emergente recibe visitas. Hay quien cree que alimenta a los árboles jóvenes de su sombra; la ciencia aún lo discute.',
  // Noticias de los biomas y del viento
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
  'wind.rust':
    'Se ha documentado que esporas de la roya del trigo cruzaron con el viento de Australia a Nueva Zelanda: unos dos mil kilómetros sin equipaje.',
  'wind.buller':
    'Muchas setas lanzan cada espora con una gotita que se fusiona en microsegundos, la gota de Buller. El despegue alcanza miles de veces la gravedad.',
  'wind.altitude':
    'Se han recogido esporas de hongos a kilómetros de altura en la atmósfera. El viento lleva pasajeros que no salen en los mapas.',
  worm: 'Una lombriz denuncia que el suelo está sospechosamente organizado.',
  fairyStep: 'Se recomienda no pisar los anillos de hadas. Por si acaso.',
  quietSoil: 'Hoy en el suelo: humedad, oscuridad y un silencio muy productivo.',
  firstThread: 'Un filamento solitario declara que esto va para largo.',
  beetle: 'Un escarabajo pide cita para visitar la red. Le dicen que vuelva en primavera.',
  hairWidth: 'Una hifa mide unas pocas micras de ancho; un cabello humano, unas setenta. Tú ganas en número.',
  kilometers: 'Se calcula que un gramo de suelo de bosque puede guardar cientos de metros de hifas.',
  rhizoHighway: 'Los rizomorfos inauguran una autopista subterránea. Peaje: un poco de glucosa.',
  molePetition: 'Un topo presenta una queja formal: los túneles ya estaban ocupados.',
  button: 'Asoma un primordio. Su familia lo llama «el botón» y a él no le hace gracia.',
  pickers: 'Recolectores reportan setas en lugares imposibles. Las setas no hacen comentarios.',
  sporePrint:
    'Un sombrero apoyado sobre un papel deja un dibujo de esporas. Los micólogos lo llaman esporada.',
  brainNotFound:
    'Hay investigadores que comparan las redes de micelio con redes de transporte. El micelio no pidió el cumplido.',
  fairyAdvice:
    'Según el folclore, quien entra en un anillo de hadas baila hasta el amanecer. Se recomienda calzado cómodo.',
  ringGrowth: 'Un anillo de hadas crece hacia fuera cada año. Algunos llevan siglos ensanchándose.',
  oakDeal: 'Los robles del norte cierran un acuerdo: azúcar a cambio de fósforo.',
  ninetyPercent:
    'La gran mayoría de las plantas terrestres vive en simbiosis con hongos micorrícicos. Las demás se lo pierden.',
  woodWideWeb: 'La prensa la llamó «Wood Wide Web». Los hongos prefieren no ponerse nombres.',
  motherTree:
    'Un abeto viejo recibe visitas. Hay quien cree que alimenta a sus plántulas; la ciencia aún lo discute.',
  debate:
    'Congreso de ecología: tres horas debatiendo cuánto comparten los árboles. Nadie preguntó a los hongos.',
  ancientForest: 'Un bosque milenario cuenta su edad en anillos. Tú la cuentas en kilómetros.',
  squirrelLawyer: 'Una ardilla contrata abogado: alega que las trufas enterradas eran suyas.',
  readyToSpore: 'Rumores en el sotobosque: algo grande se prepara para esporular.',
  firstRain: 'Llueve. Todo el bosque huele a promesa.',
  petrichor: 'Tras la lluvia, las setas brotan en horas: el agua infla estructuras que ya estaban listas.',
  lightning:
    'Hay quien jura que tras las tormentas salen más setas. En Japón lo han probado con descargas eléctricas.',
  sporeCloud: 'Una sola seta puede soltar miles de millones de esporas. Basta con que una llegue lejos.',
  trillions: 'El viento reporta un aumento inusual de pasajeros microscópicos.',
  deja: 'Sensación de déjà vu en el sotobosque. Esta vez la red sabe dónde estaba el agua.',
  malheur:
    'En el bosque nacional de Malheur, en Oregón, un solo Armillaria ostoyae ocupa casi diez kilómetros cuadrados.',
  oldest: 'Se estima que el gigante de Oregón tiene entre dos mil y ocho mil años. Nadie le pidió el carné.',
  planetary: 'Bajo cada pradera, un mismo pulso. Las lombrices empiezan a llevar el ritmo.',
  glow: 'Algunos hongos brillan en la madera podrida. En inglés lo llaman foxfire: fuego de zorro.',
  kingdom: 'Recordatorio: los hongos no son plantas. Son parientes más cercanos de los animales.',
  lichen: 'Un liquen es un hongo y un alga viviendo juntos. Ninguno recuerda quién lo propuso.',
  penicillin: 'En 1928, un moho estropeó un cultivo de Alexander Fleming. Así empezó la penicilina.',
  cordyceps: 'Un hongo del género Ophiocordyceps manipula hormigas. La red promete no intentarlo con nadie.',
  truffle: 'Los cerdos encuentran trufas por el olor, pero se las comen. Por eso hoy se prefieren perros.',
  radiation:
    'En Chernóbil se hallaron hongos que crecen hacia la radiación. Hay quien sospecha que la aprovechan.',
  patience: 'Ocho esporulaciones después, la red ya no tiene prisa. Nunca la tuvo.',
  undergroundWeather: 'Parte del tiempo subterráneo: oscuro, húmedo y con probabilidad alta de setas.',
  snailAssembly: 'Un caracol pide la palabra en la asamblea del suelo. La asamblea sigue esperando.',
  chitin: 'Las paredes de las hifas llevan quitina, el mismo material que el caparazón de un escarabajo.',
  yeast: 'La levadura del pan y de la cerveza es un hongo. Lleva miles de años trabajando sin cobrar.',
  pineCone: 'Cae una piña sobre la red. La red la incluye en sus planes.',
  // En el Chocó no hay coníferas (ARCHITECTURE.md §4.28).
  'pineCone.choco': 'Cae un fruto de palma sobre la red. La red lo incluye en sus planes.',
  asphalt: 'Una seta levanta el asfalto de un camino. No empuja a golpes: empuja con agua, sin prisa.',
  rootsGossip: 'Las raíces se quejan: la red se entera de todo antes que ellas.',
  ownWind:
    'Algunas setas fabrican su propio viento: al evaporar agua enfrían el aire y las esporas salen flotando.',
  puffball:
    'Un solo bejín gigante puede soltar billones de esporas. Casi ninguna llega a nada, y no importa.',
  species: 'Se han descrito unas 150.000 especies de hongos. Se calcula que quedan millones por nombrar.',
  stinkhorn: 'El falo hediondo huele a carroña a propósito: las moscas que acuden se llevan sus esporas.',
  rootMeeting: 'Reunión de raíces: nadie sabe quién la convocó, pero todas llegaron por la red.',
  blueCheese: 'Las vetas del queso azul son un moho, Penicillium roqueforti. Nadie se queja.',
  employee: 'La red, nombrada empleada del mes por enésima vez. Pide que el premio sea en azúcar.',
  prototaxites:
    'Hace unos 400 millones de años, Prototaxites, quizá un hongo o algo aún más raro, se alzaba hasta 8 metros.',
  lostSpore: 'Se busca espora perdida. Responde a cualquier nombre y a ninguno.',
  pilobolus:
    'El hongo Pilobolus dispara su cápsula de esporas a más de 2 metros, con una aceleración de unas 20.000 g.',
  termites:
    'Algunas termitas cultivan hongos en sus nidos desde hace millones de años. Mucho antes que nosotros.',
  carboniferous:
    'Una hipótesis: en el Carbonífero se acumuló tanto carbón porque aún no había hongos que digirieran la lignina.',
  birdsNest:
    'Los hongos nido de pájaro esperan la lluvia: cada gota que cae en su copa lanza fuera sus «huevos» de esporas.',
  cloudSpores:
    'Hay esporas que suben hasta las nubes, y algunas pueden ayudar a que se formen gotas. La lluvia vuelve.',
  oysterHunter:
    'La seta de ostra caza gusanos microscópicos cuando le falta nitrógeno. Por fuera parece tan tranquila.',
  noose: 'Hay hongos que atrapan nematodos con lazos que se cierran en una décima de segundo.',
  myceliumBricks: 'Ya se fabrican embalajes y ladrillos de micelio. La red pregunta si cobra derechos.',
  postcard: 'El bosque natal recibe una postal: «Aquí todo bien. Mucha lluvia. Os escribo por la red».',
  // En la taiga llueve la mitad.
  'postcard.taiga':
    'El bosque natal recibe una postal: «Aquí todo bien. Frío y poca lluvia. Os escribo por la red».',
  // Noticias del plasmodio (Apéndice B: condiciones)
  'plasmodium.notFungus':
    'Aclaración del sotobosque: el moho amarillo del tronco no es un hongo. Los micólogos lo estudian igual, y él no se queja.',
  'plasmodium.speed': 'Última hora: el plasmodio avanzó unos centímetros. A su escala, es una carrera.',
  'plasmodium.shuttle':
    'Su citoplasma va y viene por los tubos y cambia de sentido cada uno o dos minutos. Lo llaman flujo de vaivén.',
  'plasmodium.mating':
    'Se dice que Physarum tiene unos 720 tipos de apareamiento. Organizar una cita es complicado.',
  'plasmodium.sclerotium':
    'Si se seca, el plasmodio se vuelve una costra dura, el esclerocio. Con agua, despierta como si nada.',
  'plasmodium.blob':
    'En 2019, el zoológico de París lo exhibió con el apodo de «le blob». Él siguió comiendo avena.',
  'plasmodium.space':
    'En 2021, plasmodios dormidos viajaron a la Estación Espacial Internacional para un experimento escolar. Despertaron con agua, como siempre.',
  'plasmodium.maze': 'Un moho resuelve un laberinto. Pide que no se lo cuenten al topo.',
  'plasmodium.trains':
    'Un moho trazó con avena una red parecida a la de los trenes de Tokio. En el sotobosque se dice que los ingenieros ferroviarios miran la avena con desconfianza.',
  'plasmodium.slime':
    'El plasmodio suele evitar pasar por donde ya dejó mucílago: así no pierde tiempo donde ya buscó (Reid y colegas, 2012).',
  'plasmodium.quinine':
    'Tras varios días cruzando puentes con quinina, unos plasmodios de un laboratorio francés dejaron de hacerle ascos. Sin neuronas.',
  'plasmodium.fusion':
    'Dos plasmodios que se tocan pueden fundirse en una sola célula. Lo que uno aprendió, el otro lo hereda.',
};

export type NewsKey = keyof typeof newsEs;
