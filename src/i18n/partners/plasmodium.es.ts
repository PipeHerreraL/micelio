/**
 * Textos del plasmodio (docs/ROADMAP.md, fase 9). Llegan aparte, solo el del idioma activo
 * (src/i18n/partners/index.ts). Es el catálogo base: de sus claves sale el tipo que cumple el
 * inglés. Mismas convenciones que src/i18n/es.ts: marcadores con nombre, plurales .one/.other y
 * ciencia veraz (lo discutido, como creencia).
 */
export const plasmodiumEs = {
  // Cabecera
  name: 'Plasmodio',
  species: 'Physarum polycephalum',
  kind: 'Moho mucilaginoso. No es un hongo: es un protista.',
  plateOf: 'Placa {n} de {total}: {name}',
  trail: 'Rastro: {value}',
  'trail.label': 'Rastro',
  trailRate: '+{value} de Rastro por segundo',
  'trail.help':
    'El Rastro es la huella de mucílago que el plasmodio deja al moverse. Sale de los copos unidos y de la calidad de la red, y con él se compran sus mejoras.',
  moist: 'Agar húmedo: se adapta el doble de rápido durante {time}.',
  mapping: 'Cartografía de {name}: {done} de {total} de Rastro',
  'mapping.help':
    'El plasmodio cartografía la placa con el Rastro que deja. Cuando llega a la meta y la red cumple el objetivo durante 1 min, fructifica.',
  'mapping.done': 'Todas las placas están cartografiadas. Puedes volver a cualquiera para mejorar tu mapa.',

  // Placas
  'plate.log.name': 'Tronco caído',
  'plate.log.intro':
    'Madera húmeda del bosque, donde vive de verdad. Aquí aprende a unir la comida que le pongas.',
  'plate.log.goal':
    'Pon {foods} copos de avena y deja que el plasmodio los una con una red corta y que aguante cortes, durante {hold}.',
  'plate.maze.name': 'Laberinto',
  'plate.maze.intro':
    'Un laberinto sobre agar, con avena en la entrada y en la salida. El plasmodio lo llena entero; luego se queda con lo que sirve.',
  'plate.maze.goal': 'Que solo quede el camino más corto entre los dos copos, durante {hold}.',
  'plate.archipelago.name': 'Archipiélago',
  'plate.archipelago.intro':
    'Islas de avena alrededor de un mar de luz y una sierra iluminada, que el plasmodio rehúye. Una red barata se rompe con un corte; una red segura cuesta más.',
  'plate.archipelago.goal':
    'Une {foods} islas de avena con una red corta y que aguante cortes, durante {hold}.',
  'plate.bitterBridge.name': 'Puente amargo',
  'plate.bitterBridge.intro':
    'Un río de agar con quinina parte la placa en dos orillas. Al plasmodio no le gusta, pero puede acostumbrarse.',
  'plate.bitterBridge.goal':
    'Une las dos orillas y {foods} copos más cruzando la quinina, con una red corta y que aguante cortes, durante {hold}.',
  'plate.fusion.name': 'Fusión',
  'plate.fusion.intro':
    'Dos plasmodios en la misma placa, sembrada de sal. El de la izquierda ya cruzó puentes de sal; el de la derecha nunca la ha probado y solo aprenderá al fundirse con el otro.',
  'plate.fusion.goal':
    'Funde los dos plasmodios uniendo sus copos y {foods} más, para que el de la derecha aprenda a cruzar la sal, durante {hold}.',

  // Placa y sitios
  'plate.label': 'Placa {name}: {count} sitios',
  'plate.help':
    'Elige una herramienta y toca un sitio. Con el teclado: las flechas mueven entre sitios, Enter o Espacio usan la herramienta y 1, 2 y 3 la cambian.',
  'site.label': 'Sitio {n}, {content}: {action}',
  'site.label.suggested': 'Sitio {n}, {content}, sitio sugerido: {action}',
  'site.content.empty': 'vacío',
  'site.content.food': 'copo de avena',
  'site.content.foodFixed': 'copo de la placa',
  'site.content.lamp': 'lámpara',
  'site.content.lampFixed': 'luz de la placa',
  'site.action.placeFood': 'poner un copo de avena',
  'site.action.placeLamp': 'poner una lámpara',
  'site.action.remove': 'quitar',
  'site.action.toFood': 'cambiar por un copo de avena',
  'site.action.toLamp': 'cambiar por una lámpara',
  'site.action.noFood': 'no te quedan copos',
  'site.action.noLamp': 'no te quedan lámparas',
  'site.action.fixed': 'es de la placa y no se puede cambiar',
  'site.action.empty': 'no hay nada que quitar',
  'site.action.foodLocked': 'en esta placa la avena ya está puesta',
  'site.row': 'Sitio {n} · {position} · {content} · {tubes}',
  'site.position': 'fila {row}, columna {col}',
  'site.tubes.one': '{count} tubo vivo llega aquí',
  'site.tubes.other': '{count} tubos vivos llegan aquí',
  'site.quinine': 'toca el puente de quinina',
  'site.salt': 'toca la sal',
  'site.suggested': 'sitio sugerido',
  'site.placed.food.one': 'Copo puesto en el sitio {n}. Te queda {count}.',
  'site.placed.food.other': 'Copo puesto en el sitio {n}. Te quedan {count}.',
  'site.placed.lamp.one': 'Lámpara puesta en el sitio {n}. Te queda {count}.',
  'site.placed.lamp.other': 'Lámpara puesta en el sitio {n}. Te quedan {count}.',
  'site.removed': 'Sitio {n} vacío.',

  // Herramientas, pulso y caudal
  'tools.label': 'Herramienta',
  'tool.food': 'Copo de avena',
  'tool.lamp': 'Lámpara',
  'tool.remove': 'Quitar',
  'tool.count': '{left} de {total}',
  'tool.food.label': 'Copo de avena: te quedan {left} de {total}',
  'tool.lamp.label': 'Lámpara: te quedan {left} de {total}',
  'pulse.button': 'Dar un pulso',
  'pulse.desc':
    'El citoplasma va y viene por los tubos. Un pulso adelanta {steps} pasos de adaptación y deja {time} de Rastro. Se puede dar uno cada {cooldown}.',
  'pulse.ready': 'listo',
  'pulse.wait': 'en {time}',
  'flow.label': 'Caudal',
  'flow.low': 'Bajo',
  'flow.medium': 'Medio',
  'flow.high': 'Alto',
  'flow.desc':
    'Cuánto citoplasma mueve el plasmodio. Con más caudal sobreviven tubos de reserva: sube la tolerancia a cortes y también el coste. En el modelo de Tero y colegas, este caudal decide si la red sale como un árbol o con anillos. Se cambia en las placas ya cartografiadas; la que estás cartografiando usa el Medio, el que mejor cumple la calidad.',
  'flow.locked': 'El caudal se cambia en las placas ya cartografiadas.',

  // Vistas de la placa
  'plate.expand': 'Ampliar la placa',
  'plate.expanded.title': 'Placa: {name}',
  'plate.close': 'Cerrar la placa ampliada',
  'plate.list': 'Ver como lista',
  'plate.map': 'Ver la placa',
  'plate.narrow': 'En esta pantalla, los sitios se eligen en la lista.',
  'plate.respread': 'Extender de nuevo',
  'plate.respread.confirm': 'Confirmar: extender de nuevo',
  'plate.respread.cancel': 'Cancelar',
  'plate.respread.desc':
    'El plasmodio vuelve a cubrir toda la placa y empieza a adaptarse otra vez. Sirve si la red se atasca. Tus copos, tus lámparas, lo que aprendió y el Rastro no cambian.',

  // Resumen de la red
  'net.summary': 'La red une {joined} de {total} copos con {alive} tubos vivos.',
  'net.drying.one': '{count} tubo se está secando.',
  'net.drying.other': '{count} tubos se están secando.',
  'net.exploring':
    'El plasmodio cubre la placa y explora. Pon al menos dos copos para que empiece a decidir.',
  'net.stalled':
    'La red lleva un rato sin cambiar. Si no llega al objetivo, prueba a mover una lámpara o un copo, o a extenderla de nuevo.',
  'chemotaxis.suggest': 'La quimiotaxis sugiere el sitio {n}.',
  'chemotaxis.thinking': 'La quimiotaxis está buscando…',
  'chemotaxis.full': 'No te quedan copos: la quimiotaxis marcará dónde iría el siguiente cuando compres más.',

  // Objetivo
  'goal.title': 'Objetivo',
  'goal.line': '{text} · {state}',
  'goal.ok': 'cumple',
  'goal.missing': 'falta',
  'goal.placed': 'Copos en la placa: {placed} (objetivo: {target} o más)',
  'goal.joined': 'Copos unidos: {joined} de {total}',
  'goal.quality': 'Calidad de la red: {value} (objetivo: {target} o más)',
  'goal.shortest': 'Longitud: {value} veces el camino más corto (objetivo: {target} o menos)',
  'goal.cost': 'Coste: {value} veces el árbol mínimo',
  'goal.tolerance': 'Tolerancia a cortes: {value}',
  'goal.habituation.quinine': 'Habituación a la quinina: {value}',
  'goal.habituation.salt': 'Habituación a la sal del plasmodio de la derecha: {value}',
  'goal.fused': 'Los dos plasmodios están fundidos',
  'goal.notFused': 'Los dos plasmodios aún están separados',
  'goal.hold': 'Estabilidad: {done} de {total}',
  'goal.hold.help':
    'Se llena mientras se cumple todo y baja despacio, sin vaciarse de golpe, si algo deja de cumplirse.',
  'goal.summary': 'Objetivo: {met} de {total} cumplen',
  'goal.quality.help':
    'La calidad junta lo que mide la placa: cuanto más corta la red y más cortes aguanta, mejor. Es (1 ÷ coste) × (0,5 + 0,5 × tolerancia).',
  'goal.cost.help':
    'El coste compara la longitud de todos los tubos vivos con el árbol mínimo, la red más corta que une los copos yendo de uno a otro. Puede bajar de 1 si la red aprovecha cruces intermedios, como sabe hacer el plasmodio.',
  'goal.tolerance.help':
    'Si se corta un tubo al azar, ¿siguen unidos todos los copos? La tolerancia es el porcentaje de cortes que la red aguanta. Las redes de trenes buscan lo mismo.',
  'goal.met': 'El plasmodio cumple el objetivo.',
  'goal.lost': 'La red dejó de cumplir el objetivo.',
  linger: 'La placa {name} se prepara sola en {time}.',

  // Atlas
  'atlas.title': 'Placas',
  'atlas.intro': 'Cada placa cartografiada queda en cultivo y sigue dejando Rastro.',
  'plate.status.current': 'en curso',
  'plate.status.done': 'cartografiada',
  'plate.status.available': 'por cartografiar',
  'plate.status.locked': 'cerrada hasta cartografiar la anterior',
  'plate.entry': '{name} · {status}',
  'plate.culture': 'En cultivo: +{value} de Rastro por segundo',
  'plate.best': 'Tu mapa: {alive} tubos, coste {cost}, tolerancia {tolerance}',
  'plate.prepare': 'Preparar la placa: {name}',
  'plate.replay': 'Volver a esta placa',
  'plate.replay.label': 'Volver a la placa {name}',
  'plate.replay.desc':
    'Al cambiar de placa se guardan tus copos y lámparas; al volver, el plasmodio se extiende de nuevo.',
  'plate.reread': 'Releer la lámina',
  'plate.reread.label': 'Releer la lámina de {name}',
  'achievements.line': 'Logros del plasmodio: {count} de {total}',
  'achievements.view': 'Ver en Logros',

  // Mejoras
  'pupg.title': 'Mejoras del plasmodio',
  'pupg.intro': 'Se pagan con Rastro. Cada nivel cuesta el doble que el anterior.',
  'pupg.buy': 'Comprar: {name}',
  'pupg.level': 'nivel {level} de {max}',
  'pupg.maxed': 'Al máximo',
  'pupg.cost': '{value} de Rastro',
  'pupg.wait': 'en {time}',
  'pupg.agar.name': 'Agar nutritivo',
  'pupg.agar.desc': 'Un medio de cultivo más rico. Cada nivel multiplica el Rastro por 1,5.',
  'pupg.agar.effect': 'Rastro ×{factor}.',
  'pupg.oats.name': 'Avena',
  'pupg.oats.desc':
    'En el laboratorio se le dan copos de avena: los encuentra, los envuelve y los une. Un copo más por nivel en cada placa, salvo en el Laberinto.',
  'pupg.oats.effect.one': '+{count} copo por placa.',
  'pupg.oats.effect.other': '+{count} copos por placa.',
  'pupg.lamps.name': 'Lámpara',
  'pupg.lamps.desc':
    'El plasmodio rehúye la luz: bajo una lámpara sus tubos se secan antes. Una lámpara más por nivel.',
  'pupg.lamps.effect.one': '+{count} lámpara por placa.',
  'pupg.lamps.effect.other': '+{count} lámparas por placa.',
  'pupg.humidity.name': 'Humedad',
  'pupg.humidity.desc':
    'Sin humedad se frena, y si se seca del todo se endurece. Cada nivel le hace adaptarse un 50 % más deprisa.',
  'pupg.humidity.effect': 'La red se adapta {factor} veces más deprisa.',
  'pupg.dormancy.name': 'Latencia',
  'pupg.dormancy.desc':
    'Al secarse, el plasmodio forma un esclerocio, una costra dura que puede revivir con agua mucho tiempo después. Mientras no estás, rinde más y aguanta más.',
  'pupg.dormancy.effect': 'Mientras no estás, el plasmodio rinde al {percent} hasta {time}.',
  'pupg.chemotaxis.name': 'Quimiotaxis',
  'pupg.chemotaxis.desc':
    'Crece hacia lo que huele a comida. La placa marca el sitio donde un copo más ayudaría más.',
  'pupg.chemotaxis.effect': 'Se marca el sitio sugerido.',
  'pupg.memory.name': 'Memoria externa',
  'pupg.memory.desc':
    'El plasmodio deja un rastro de mucílago y suele evitar volver adonde ya buscó: una memoria fuera del cuerpo (Reid y colegas, 2012). En la placa, los tubos que no llevan nada se secan el doble de rápido, salvo los que tocan quinina o sal: la red poda antes y sale más barata, y también menos tolerante.',
  'pupg.memory.effect': 'La red se reorganiza antes tras un cambio.',

  // Con tu red
  'link.title': 'Con tu red',
  'link.intro': 'El plasmodio y tu red se echan una mano. Nada de esto cambia cuánto produce cada uno.',
  'link.locked': 'Se abre al cartografiar: {name}.',
  'link.active': 'Activa',
  'link.pruning.name': 'Poda',
  'link.pruning.desc':
    'El plasmodio engorda los tubos que más llevan y deja secar el resto. Tu autocompra aprende lo mismo: puede comprar lo que antes se recupera.',
  'link.shortPath.name': 'Camino corto',
  'link.shortPath.desc':
    'Como en el laberinto, cuenta lo que cuesta llegar. En Esporular verás cuántas esporas ganas por minuto de partida y cuántas con la siguiente.',
  'link.rain.name': 'Lluvia en la placa',
  'link.rain.desc':
    'Cada gota que atrapas en tu bosque, o que cae sola, humedece el agar: durante {time}, el plasmodio se adapta el doble de rápido.',

  // Láminas de placa
  'chapter.kicker': 'Placa cartografiada · {n} de {total}',
  'chapter.map': 'Tu mapa: {alive} tubos, coste {cost}, tolerancia {tolerance}.',
  'chapter.unlock': 'Desde ahora: {what}',
  'chapter.next': 'Siguiente placa: {name}.',
  'chapter.stay': 'Seguir mirando',
  'chapter.toNext': 'Ver la siguiente placa',
  'chapter.log.title': 'Fructificar',
  'chapter.log.line1':
    'Cuando se le acaba la comida y le llega la luz, el plasmodio deja de buscar y fructifica: levanta esporangios, cabezuelas sobre tallos finos llenas de esporas.',
  'chapter.log.line2':
    'Por eso se lo tomó por un hongo. Hoy se lo cuenta entre los amebozoos, más cerca de las amebas que de las setas.',
  'chapter.log.unlock':
    'la Poda llega a la autocompra de tu red, y aparecen tres mejoras del plasmodio: Lámpara, Humedad y Latencia.',
  'chapter.maze.title': 'El camino más corto',
  'chapter.maze.line1':
    'En un experimento de Nakagaki y colegas (2000), un plasmodio llenó un laberinto entero. Con avena en la entrada y en la salida, en unas horas retiró sus tubos de los callejones y dejó uno solo por el camino más corto.',
  'chapter.maze.line2':
    'No necesita cerebro: los tubos que más llevan engordan y los demás se secan. Un modelo con esa sola regla reproduce lo que hizo.',
  'chapter.maze.unlock':
    'Camino corto llega a Esporular, y aparecen el caudal, la Quimiotaxis y la Memoria externa.',
  'chapter.archipelago.title': 'Como los trenes',
  'chapter.archipelago.line1':
    'Tero y colegas (2010) pusieron copos de avena donde estarían las ciudades alrededor de Tokio y marcaron con luz las montañas y la costa, que el plasmodio evita.',
  'chapter.archipelago.line2':
    'La red que trazó se parecía a la de trenes de la región en coste, en eficiencia y en tolerancia a fallos. En el mismo artículo la tradujeron a ecuaciones para diseñar redes: son las que mueven estas placas.',
  'chapter.bitterBridge.title': 'Ya no sabe amargo',
  'chapter.bitterBridge.line1':
    'Boisseau, Vogel y Dussutour (2016) pusieron un puente con quinina o cafeína entre el plasmodio y su comida. Al principio tardaba en cruzarlo; tras varios días cruzando, dejó de hacerle caso.',
  'chapter.bitterBridge.line2':
    'Es habituación, una forma sencilla de aprendizaje, en un organismo sin neuronas. Tras un par de días sin la sustancia, volvía a evitarla.',
  'chapter.fusion.title': 'Una sola célula',
  'chapter.fusion.line1':
    'Vogel y Dussutour (2016) fundieron plasmodios habituados a la sal con otros que nunca la habían probado. La célula fundida tampoco la evitaba: lo aprendido pasó de uno a otro cuando entre ellos se formó una vena.',
  'chapter.fusion.line2': 'Dos individuos se volvieron uno, sin perder lo que uno de ellos sabía.',
  'chapter.fusion.end':
    'Ya no quedan placas nuevas en esta versión de Micelio. Puedes volver a cualquiera para mejorar tu mapa.',

  // Avisos
  'notice.fruited': 'Placa cartografiada: {name}.',
  'notice.mapImproved': 'Tu mapa de {name} mejoró.',
  'notice.plateOpened': 'Placa preparada: {name}.',
  'notice.upgrade': 'Plasmodio: {name}, nivel {level}',
  'notice.achievement': 'Logro del plasmodio: {name}',
  'notice.caughtUp': 'Mientras no estabas, el plasmodio dejó {value} de Rastro.',
  'notice.respread': 'El plasmodio cubre otra vez toda la placa.',
  'notice.reset': 'La red de la placa se reinició por un error de cálculo. Lo demás sigue igual.',
} as const;
export type PlasmodiumMessageKey = keyof typeof plasmodiumEs;
export type PlasmodiumCatalog = Record<PlasmodiumMessageKey, string>;
