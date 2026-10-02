/**
 * Catálogo base en español. De sus claves sale el tipo `Catalog`: cualquier otro idioma
 * debe tener exactamente las mismas, o no compila.
 *
 * Convenciones:
 * - Marcadores con nombre: `{count}`, `{name}`, `{value}`. Nunca armes frases pegando trozos.
 * - Plurales: claves hermanas `.one` y `.other` que se eligen con Intl.PluralRules (ver
 *   index.ts). Si un idioma necesita más categorías (`few`, `many`), cae en `.other`.
 * - Los datos sobre hongos son veraces; lo discutido se presenta como creencia o folclore.
 */
export const es = {
  // Página
  'meta.title': 'Micelio',
  'meta.titleWithValue': '{value}\u00a0N · Micelio',
  'meta.description':
    'Un juego idle tranquilo: eres una red de hongos que crece bajo el suelo del bosque, incluso mientras no miras.',
  'app.skipToGame': 'Saltar al juego',

  // Contador y núcleo
  'hud.nutrients': '{value}\u00a0N',
  'hud.nutrients.label': 'Nutrientes',
  'hud.perSecond': '{value}\u00a0N/s',
  'hud.perSecond.label': 'Producción por segundo',
  'core.label': 'Absorber nutrientes (+{value}\u00a0N)',
  'core.hint': 'Toca para absorber nutrientes',
  'core.keyHint': 'También con Espacio o Enter',

  // Efectos activos
  'effects.title': 'Efectos activos',
  'effect.downpour.name': 'Aguacero',
  'effect.downpour.desc': 'Producción ×5',
  'effect.storm.name': 'Tormenta eléctrica',
  'effect.storm.desc': 'Clic ×500',
  'effect.dew.name': 'Rocío',
  // Concuerda con el efecto, no con {time}: «quedan 1 s» rompía la concordancia.
  'effect.remaining': 'termina en {time}',

  // Pestañas
  'tabs.label': 'Secciones del juego',
  'tab.generators': 'Generadores',
  'tab.upgrades': 'Mejoras',
  'tab.sporulate': 'Esporular',
  'tab.mutations': 'Mutaciones',
  'tab.achievements': 'Logros',
  'tab.chronicle': 'Crónica',
  'tab.stats': 'Estadísticas',
  'tab.settings': 'Ajustes',
  'tab.newBadge': 'novedad',

  // Selector de cantidad
  'buy.amount.label': 'Cantidad a comprar',
  'buy.amount.1': '×1',
  'buy.amount.10': '×10',
  'buy.amount.100': '×100',
  'buy.amount.milestone': 'Hito',
  'buy.amount.max': 'Máx',

  // Generadores
  'gen.hypha.name': 'Hifa',
  'gen.hypha.unit.one': 'Hifa',
  'gen.hypha.unit.other': 'Hifas',
  'gen.hypha.flavor': 'Un filamento más fino que un cabello. Todo empieza aquí.',
  'gen.rhizomorph.name': 'Rizomorfo',
  'gen.rhizomorph.unit.one': 'Rizomorfo',
  'gen.rhizomorph.unit.other': 'Rizomorfos',
  'gen.rhizomorph.flavor': 'Cordones de hifas que viajan lejos en busca de alimento.',
  'gen.primordium.name': 'Primordio',
  'gen.primordium.unit.one': 'Primordio',
  'gen.primordium.unit.other': 'Primordios',
  'gen.primordium.flavor': 'El botón diminuto que un día será seta.',
  'gen.mushroom.name': 'Seta',
  'gen.mushroom.unit.one': 'Seta',
  'gen.mushroom.unit.other': 'Setas',
  'gen.mushroom.flavor': 'Lo único que el mundo ve de ti.',
  'gen.fairyRing.name': 'Anillo de hadas',
  'gen.fairyRing.unit.one': 'Anillo de hadas',
  'gen.fairyRing.unit.other': 'Anillos de hadas',
  'gen.fairyRing.flavor': 'Un círculo de setas que el folclore atribuye a las hadas.',
  'gen.mycorrhiza.name': 'Red micorrícica',
  'gen.mycorrhiza.unit.one': 'Red micorrícica',
  'gen.mycorrhiza.unit.other': 'Redes micorrícicas',
  'gen.mycorrhiza.flavor': 'Azúcares de las raíces a cambio de agua y minerales.',
  'gen.motherTree.name': 'Árbol madre',
  'gen.motherTree.unit.one': 'Árbol madre',
  'gen.motherTree.unit.other': 'Árboles madre',
  'gen.motherTree.flavor': 'Un abeto viejo en el centro de la red. La ciencia aún discute cuánto comparte.',
  'gen.ancientForest.name': 'Bosque milenario',
  'gen.ancientForest.unit.one': 'Bosque milenario',
  'gen.ancientForest.unit.other': 'Bosques milenarios',
  'gen.ancientForest.flavor': 'Ya no se sabe dónde termina el bosque y dónde empiezas tú.',
  'gen.malheur.name': 'Gigante de Malheur',
  'gen.malheur.unit.one': 'Gigante de Malheur',
  'gen.malheur.unit.other': 'Gigantes de Malheur',
  'gen.malheur.flavor': 'Como el Armillaria ostoyae de Oregón: kilómetros de un solo individuo.',
  'gen.planetary.name': 'Red planetaria',
  'gen.planetary.unit.one': 'Red planetaria',
  'gen.planetary.unit.other': 'Redes planetarias',
  'gen.planetary.flavor': 'Bajo cada pradera y cada bosque, un mismo pulso.',

  'gen.buy': 'Comprar {count} {unit}',
  'gen.cost': '{value}\u00a0N',
  'gen.wait': 'en {time}',
  'gen.waitNoIncome': 'sin producción aún',
  'gen.owned': '×{count}',
  'gen.owned.label': 'Tienes {count}',
  'gen.unitProduction': '{value}\u00a0N/s por unidad',
  'gen.totalProduction': '{value}\u00a0N/s en total',
  'gen.share': '{percent} del total',
  'gen.milestone': 'Hito en {next}: producción ×2',
  'gen.milestone.label': 'Progreso hacia el hito de {next} unidades',
  'gen.milestone.done': 'Todos los hitos alcanzados',
  'gen.hidden': '???',
  'gen.hidden.hint': 'Algo se mueve más abajo. Sigue absorbiendo.',
  'gen.hidden.label': 'Más información sobre un generador por descubrir',
  'gen.autobuy.label': 'Autocompra de {name}',
  'gen.autobuy.on': 'Auto',
  'generators.title': 'Generadores',

  // Mejoras de generador (cuatro por generador)
  'upg.hypha.u1.name': 'Quitina flexible',
  'upg.hypha.u1.flavor': 'Paredes que se doblan sin romperse.',
  'upg.hypha.u2.name': 'Punta de crecimiento',
  'upg.hypha.u2.flavor': 'Las hifas solo crecen por la punta, y ahora más deprisa.',
  'upg.hypha.u3.name': 'Anastomosis',
  'upg.hypha.u3.flavor': 'Filamentos que se fusionan y comparten lo que llevan.',
  'upg.hypha.u4.name': 'Hifas aéreas',
  'upg.hypha.u4.flavor': 'Algunas se atreven a asomarse al aire.',
  'upg.rhizomorph.u1.name': 'Corteza melanizada',
  'upg.rhizomorph.u1.flavor': 'Una piel oscura que protege el cordón.',
  'upg.rhizomorph.u2.name': 'Conducto central',
  'upg.rhizomorph.u2.flavor': 'Un canal hueco para mover agua y alimento.',
  'upg.rhizomorph.u3.name': 'Cordones trenzados',
  'upg.rhizomorph.u3.flavor': 'Cien hifas juntas tiran más que una.',
  'upg.rhizomorph.u4.name': 'Fuego de zorro',
  'upg.rhizomorph.u4.flavor': 'Los cordones de Armillaria emiten un brillo tenue en la madera húmeda.',
  'upg.primordium.u1.name': 'Nudo hifal',
  'upg.primordium.u1.flavor': 'Todo primordio empieza como un ovillo apretado.',
  'upg.primordium.u2.name': 'Velo universal',
  'upg.primordium.u2.flavor': 'Una envoltura que lo protege mientras crece.',
  'upg.primordium.u3.name': 'Presión de turgencia',
  'upg.primordium.u3.flavor': 'Agua a presión: así empuja la tierra hacia arriba.',
  'upg.primordium.u4.name': 'Estirón nocturno',
  'upg.primordium.u4.flavor': 'Lo que de día era un botón, al amanecer es un tallo.',
  'upg.mushroom.u1.name': 'Laminillas apretadas',
  'upg.mushroom.u1.flavor': 'Más superficie bajo el sombrero, más esporas.',
  'upg.mushroom.u2.name': 'Esporada',
  'upg.mushroom.u2.flavor': 'El dibujo que deja un sombrero sobre un papel.',
  'upg.mushroom.u3.name': 'Sombrero amplio',
  'upg.mushroom.u3.flavor': 'Un buen paraguas también sirve de anuncio.',
  'upg.mushroom.u4.name': 'Corros tras la lluvia',
  'upg.mushroom.u4.flavor': 'Un día no hay nada; al siguiente, un prado entero.',
  'upg.fairyRing.u1.name': 'Hierba más verde',
  'upg.fairyRing.u1.flavor': 'El anillo se nota en la hierba antes que en las setas.',
  'upg.fairyRing.u2.name': 'Paso de hadas',
  'upg.fairyRing.u2.flavor': 'El folclore dice que bailan dentro. Mejor no comprobarlo.',
  'upg.fairyRing.u3.name': 'Anillo en expansión',
  'upg.fairyRing.u3.flavor': 'Cada año el círculo crece un poco hacia fuera.',
  'upg.fairyRing.u4.name': 'Siglos de círculo',
  'upg.fairyRing.u4.flavor': 'Hay anillos que llevan siglos ensanchándose.',
  'upg.mycorrhiza.u1.name': 'Red de Hartig',
  'upg.mycorrhiza.u1.flavor': 'Hifas que se cuelan entre las células de la raíz.',
  'upg.mycorrhiza.u2.name': 'Manto radical',
  'upg.mycorrhiza.u2.flavor': 'Una funda de hongo envuelve cada raicilla.',
  'upg.mycorrhiza.u3.name': 'Arbúsculos',
  'upg.mycorrhiza.u3.flavor': 'Árboles diminutos dentro de la raíz, para intercambiar mejor.',
  'upg.mycorrhiza.u4.name': 'Trueque de fósforo',
  'upg.mycorrhiza.u4.flavor': 'Fósforo para el árbol, azúcar para la red. Trato justo.',
  'upg.motherTree.u1.name': 'Raíces profundas',
  'upg.motherTree.u1.flavor': 'Más raíz, más red.',
  'upg.motherTree.u2.name': 'Señales de alarma',
  'upg.motherTree.u2.flavor': 'Hay quien cree que los árboles se avisan de plagas a través de la red.',
  'upg.motherTree.u3.name': 'Sombra generosa',
  'upg.motherTree.u3.flavor': 'Bajo un abeto viejo crecen los jóvenes.',
  'upg.motherTree.u4.name': 'Memoria del abeto',
  'upg.motherTree.u4.flavor': 'Cuatrocientos años de raíces recuerdan dónde hay agua.',
  'upg.ancientForest.u1.name': 'Sotobosque',
  'upg.ancientForest.u1.flavor': 'Helechos, musgos y un millar de vecinos.',
  'upg.ancientForest.u2.name': 'Madera muerta',
  'upg.ancientForest.u2.flavor': 'Lo que cae, la red lo devuelve al suelo.',
  'upg.ancientForest.u3.name': 'Musgo y liquen',
  'upg.ancientForest.u3.flavor': 'El liquen ya es un hongo con socio.',
  'upg.ancientForest.u4.name': 'Tiempo geológico',
  'upg.ancientForest.u4.flavor': 'Mil años no es nada para un bosque.',
  'upg.malheur.u1.name': 'Montañas Azules',
  'upg.malheur.u1.flavor': 'El gigante de Oregón vive en las Blue Mountains.',
  'upg.malheur.u2.name': 'Bajo la corteza',
  'upg.malheur.u2.flavor': 'Armillaria avanza bajo la corteza de los árboles que encuentra.',
  'upg.malheur.u3.name': 'Paciencia milenaria',
  'upg.malheur.u3.flavor': 'Se estima que el gigante tiene miles de años.',
  'upg.malheur.u4.name': 'Casi diez kilómetros cuadrados',
  'upg.malheur.u4.flavor': 'Lo que ocupa un solo individuo de Armillaria en Malheur.',
  'upg.planetary.u1.name': 'Pulso común',
  'upg.planetary.u1.flavor': 'Todas las redes laten a la vez.',
  'upg.planetary.u2.name': 'Bajo las praderas',
  'upg.planetary.u2.flavor': 'Donde hay raíces, hay hongos.',
  'upg.planetary.u3.name': 'Bajo el hielo',
  'upg.planetary.u3.flavor': 'Hasta en la tundra hay micorrizas.',
  'upg.planetary.u4.name': 'Un solo organismo',
  'upg.planetary.u4.flavor': 'Ya no se distingue una red de otra.',

  // Mejoras de clic, globales y sinergias
  'upg.sensitiveTouch.name': 'Tacto sensible',
  'upg.sensitiveTouch.flavor': 'La red aprende a notar cada roce.',
  'upg.chemotropism.name': 'Quimiotropismo',
  'upg.chemotropism.flavor': 'Crecer hacia lo que huele a comida.',
  'upg.fertileHumus.name': 'Humus fértil',
  'upg.fertileHumus.flavor': 'Tierra oscura, rica y tranquila.',
  'upg.electricImpulses.name': 'Impulsos eléctricos',
  'upg.electricImpulses.flavor': 'Se han medido picos eléctricos en hifas. Qué significan, se discute.',
  'upg.autumnLitter.name': 'Hojarasca de otoño',
  'upg.autumnLitter.flavor': 'Cada hoja que cae es una comida pendiente.',
  'upg.witchesRing.name': 'Corro de brujas',
  'upg.witchesRing.flavor': 'Así llaman en muchos pueblos a los anillos de setas.',
  'upg.witchesRing.effect': 'Cada Seta da +{percent} a los Anillos de hadas',
  'upg.voraciousAbsorption.name': 'Absorción voraz',
  'upg.voraciousAbsorption.flavor': 'Las enzimas digieren fuera y la red absorbe dentro.',
  'upg.ancestralCompost.name': 'Compost ancestral',
  'upg.ancestralCompost.flavor': 'Capas y capas de bosque convertidas en suelo.',
  'upg.sugarExchange.name': 'Intercambio de azúcares',
  'upg.sugarExchange.flavor': 'Los árboles pagan en carbono; la red, en minerales.',
  'upg.sugarExchange.effect': 'Cada Árbol madre da +{percent} a las Redes micorrícicas',
  'upg.carbonCycle.name': 'Ciclo del carbono',
  'upg.carbonCycle.flavor': 'Sin hongos, el bosque se ahogaría en su propia hojarasca.',

  'upgEffect.generator': 'Producción de {name} ×2',
  'upgEffect.click': 'Clic ×{multiplier}',
  'upgEffect.clickPercent': 'Cada clic suma {percent} de tu N/s',
  'upgEffect.global': 'Producción global ×{multiplier}',
  'upg.gainProduction': '+{value}\u00a0N/s',
  'upg.gainClick': '+{value}\u00a0N por clic',
  'upg.buy': 'Comprar {name}',
  'upg.bought': 'Comprada',
  'upgrades.title': 'Mejoras',
  'upgrades.empty': 'No hay mejoras disponibles. Aparecen al comprar generadores y al ganar nutrientes.',

  // Esporular
  'sporulate.title': 'Esporular',
  'sporulate.intro':
    'Al madurar, la red libera esporas y vuelve a empezar. Cada nivel de esporas da +1 % de producción mientras tu linaje viva en este bosque.',
  'sporulate.gain.one': 'Esporularías ahora: {count} espora',
  'sporulate.gain.other': 'Esporularías ahora: {count} esporas',
  'sporulate.next': 'Faltan {value}\u00a0N en este bosque para la siguiente espora',
  'sporulate.requirement': 'Necesitas {value}\u00a0N ganados en esta partida',
  'sporulate.progress': 'Progreso hacia esporular: {percent}',
  'sporulate.level': 'Nivel de esporas: {level} (+{percent} de producción)',
  'sporulate.available.one': '{count} espora disponible',
  'sporulate.available.other': '{count} esporas disponibles',
  'sporulate.button': 'Esporular',
  'sporulate.confirm.title': '¿Esporular ahora?',
  'sporulate.confirm.gain.one': 'Ganarás {count} espora.',
  'sporulate.confirm.gain.other': 'Ganarás {count} esporas.',
  'sporulate.confirm.bonus': 'Bono de producción: +{current} ahora, +{next} después.',
  'sporulate.confirm.lose': 'Se pierden: nutrientes, generadores, mejoras, hitos y efectos activos.',
  'sporulate.confirm.keep':
    'Se conservan: nivel y esporas, mutaciones, adaptaciones, logros, estadísticas de vida y ajustes.',
  'sporulate.confirm.yes': 'Esporular',
  'sporulate.confirm.no': 'Seguir creciendo',
  'sporulate.done.one': 'Esporulaste: +{count} espora',
  'sporulate.done.other': 'Esporulaste: +{count} esporas',

  // Mutaciones
  'mutations.title': 'Mutaciones',
  'mutations.intro': 'Mutaciones permanentes. Se pagan con esporas disponibles; gastarlas no baja tu nivel.',
  'mut.soilMemory.name': 'Memoria del suelo',
  'mut.soilMemory.desc': 'Empiezas cada partida con 100 N y 10 Hifas.',
  'mut.lightChitin.name': 'Quitina ligera',
  'mut.lightChitin.desc': 'Generadores un 10 % más baratos.',
  'mut.deepAbsorption.name': 'Absorción profunda',
  'mut.deepAbsorption.desc': 'Cada clic suma un 3 % más de tu N/s.',
  'mut.rainScent.name': 'Olfato de lluvia',
  'mut.rainScent.desc': 'La lluvia aparece un 30 % más seguido.',
  'mut.winterSleep.name': 'Sueño invernal',
  'mut.winterSleep.desc': 'Progreso offline al 100 % (base 50 %) y hasta 24 h (base 8 h).',
  'mut.instinct.name': 'Instinto',
  'mut.instinct.desc': 'Autocompra de generadores.',
  'mut.perfectStorm.name': 'Tormenta perfecta',
  'mut.perfectStorm.desc': 'Los efectos de la lluvia duran un 50 % más.',
  'mut.ancientSymbiosis.name': 'Simbiosis antigua',
  'mut.ancientSymbiosis.desc': 'Cada logro da +2 % en vez de +1 %.',
  'mut.beyondForest.name': 'Más allá del bosque',
  'mut.beyondForest.desc': 'Desbloquea la Red planetaria.',
  'mut.wingedSpores.name': 'Esporas aladas',
  'mut.wingedSpores.desc': '+25 % de esporas al esporular.',
  'mut.higherInstinct.name': 'Instinto superior',
  'mut.higherInstinct.desc': 'Autocompra de mejoras.',
  'mut.inheritance.name': 'Herencia',
  'mut.inheritance.desc': 'Empiezas cada partida con 10 unidades de los cuatro primeros generadores.',
  'mut.cost.one': '{count} espora',
  'mut.cost.other': '{count} esporas',
  'mut.requires': 'Requiere: {names}',
  'mut.owned': 'Adquirida',
  'mut.owned.label': '{name}, adquirida',
  'mut.buy': 'Mutar: {name}',
  'mut.locked': 'Bloqueada',
  'mut.locked.label': '{name}, bloqueada',
  'mut.done': 'Mutaste: {name}',

  // Madurez de la red y adaptaciones (fase 7)
  'sporulate.maturity':
    'Madurez de la red: hasta el nivel {threshold} cada nivel da +1 %; por encima, cada nivel aporta menos.',
  'adapt.title': 'Adaptaciones',
  'adapt.intro':
    'Con el árbol completo, las esporas sobrantes se invierten en adaptaciones. Se pueden subir varias veces.',
  'adapt.buy': 'Adaptar: {name}',
  'adapt.rank': 'rango {rank}',
  'adapt.rankOf': 'rango {rank} de {max}',
  'adapt.maxed': 'Al máximo',
  'adapt.none': 'Aún sin rangos.',
  'adapt.done': 'Adaptaste: {name}, rango {rank}',
  'adapt.apicalBody.name': 'Cuerpo apical',
  'adapt.apicalBody.desc':
    'En la punta de cada hifa, un orgánulo diminuto decide hacia dónde crecer. Sube el umbral de madurez un 10 % por rango.',
  'adapt.apicalBody.effect': 'Umbral de madurez: nivel {threshold}.',
  'adapt.sclerotium.name': 'Esclerocio',
  'adapt.sclerotium.desc':
    'Una masa de micelio endurecido que guarda reservas durante años. Cada partida empieza con más nutrientes.',
  'adapt.sclerotium.effect': 'Cada partida empieza con {value} N.',
  'adapt.hydraulicLift.name': 'Redistribución hidráulica',
  'adapt.hydraulicLift.desc':
    'Las hifas llevan agua del suelo húmedo al seco. La gota de lluvia tarda 2 s más en evaporarse por rango.',
  'adapt.hydraulicLift.effect': 'La gota dura {time}.',
  'adapt.deepTorpor.name': 'Letargo profundo',
  'adapt.deepTorpor.desc': 'La red aguanta más tiempo sin ti. El progreso offline cuenta 6 h más por rango.',
  'adapt.deepTorpor.effect': 'Offline hasta {time} ({extra} más).',
  'adapt.foxfire.name': 'Fuego de zorro',
  'adapt.foxfire.desc':
    'Algunos hongos brillan en la madera podrida. Solo cambia cómo se ve: los pulsos de la red brillan más.',
  'adapt.foxfire.effect': 'Los pulsos brillan más.',
  'hint.adaptations': 'Árbol completo. Las esporas que sobren ahora se invierten en adaptaciones.',

  // Viento de esporas (fase 8): biomas, reglas y cartela
  'biome.natal.name': 'Bosque natal',
  'biome.natal.soil': 'suelo pardo',
  'biome.natal.here': 'Tu linaje vive en el bosque natal.',
  'biome.taiga.name': 'Taiga',
  'biome.taiga.soil': 'podzol',
  'biome.taiga.here': 'Tu linaje vive en la taiga.',
  'biome.taiga.go': 'Dispersar hacia la taiga',
  'biome.taiga.style': 'Para quien deja crecer: los árboles trabajan solos.',
  'biome.taiga.tag': '×{factor} en la taiga',
  'biome.taiga.rule.trees': 'La Red micorrícica y el Árbol madre rinden ×{factor}.',
  'biome.taiga.rule.rain': 'Llueve la mitad: entre gota y gota pasa el doble de tiempo.',
  'biome.choco.name': 'Selva del Chocó',
  'biome.choco.soil': 'ultisol',
  'biome.choco.here': 'Tu linaje vive en la selva del Chocó.',
  'biome.choco.go': 'Dispersar hacia la selva del Chocó',
  'biome.choco.style': 'Para quien está atento: la lluvia premia a quien la atrapa.',
  'biome.choco.rule.rain': 'Llueve el doble: entre gota y gota pasa la mitad de tiempo.',
  'biome.choco.rule.fall':
    'Mientras el juego está abierto, las gotas que no atrapas caen solas antes de evaporarse, y su efecto llega igual.',
  'biome.choco.rule.dew': 'El Rocío da al menos {time} de producción.',
  'biome.choco.rule.storm':
    'Cada gota trae Tormenta eléctrica la mitad de veces: por hora, las mismas tormentas que en el bosque natal.',
  'biome.progress': 'Colonización: nivel\u00a0{level} de\u00a0{goal}',
  'biome.colonized': 'Bioma colonizado · nivel {level}',
  'biome.actOne': 'Acto I cumplido · nivel {level}',
  'caption.place': '{name} · {soil}',
  'caption.compact': '{name} · {level}/{goal}',
  'caption.compactDone': '{name} · nivel {level}',
  // Viento de esporas: la sección de Esporular y su confirmación
  'wind.title': 'Viento de esporas',
  'wind.intro':
    'Dispersar lleva tu linaje a otro bioma, con otras reglas. Allí el nivel de esporas empieza en 0; las esporas disponibles, las mutaciones y las adaptaciones viajan contigo.',
  'wind.lineage.one': 'Linaje: tu producción es ×{factor} en todos los biomas, por {count} bioma colonizado.',
  'wind.lineage.other':
    'Linaje: tu producción es ×{factor} en todos los biomas, por {count} biomas colonizados.',
  'wind.cost.one': 'El viaje cuesta {count} espora.',
  'wind.cost.other': 'El viaje cuesta {count} esporas.',
  'wind.destinations': 'Destinos',
  'wind.needColonize': 'Antes hay que colonizar este bioma: nivel {goal}.',
  'wind.needSpores.one': 'Falta {count} espora para el viaje.',
  'wind.needSpores.other': 'Faltan {count} esporas para el viaje.',
  'wind.last': 'Este es el último bioma de esta versión de Micelio: colonízalo para cerrar el viaje.',
  'wind.none':
    'No quedan biomas nuevos adonde viajar en esta versión de Micelio. Tu red puede seguir creciendo aquí, sin prisa.',
  'wind.confirm.title': '¿Dispersar tu linaje?',
  'wind.confirm.destination': 'Destino: {name}, {soil}.',
  'wind.confirm.gain.one': 'Esta partida termina esporulando: ganarás {count} espora.',
  'wind.confirm.gain.other': 'Esta partida termina esporulando: ganarás {count} esporas.',
  'wind.confirm.noGain': 'Esta partida aún no puede esporular: sus nutrientes no darán esporas.',
  'wind.confirm.cost.one': 'El viaje cuesta {cost} esporas; te quedará {count} espora.',
  'wind.confirm.cost.other': 'El viaje cuesta {cost} esporas; te quedarán {count} esporas.',
  'wind.confirm.bonus': 'Bono del nivel de esporas que dejas: +{current}; al llegar, +0 %.',
  'wind.confirm.lose':
    'Se pierden: el nivel de esporas de este bioma y todo lo de la partida (nutrientes, generadores, mejoras, hitos y efectos activos).',
  'wind.confirm.keep':
    'Viajan contigo: esporas disponibles, mutaciones, adaptaciones, linaje, logros, autocompra, estadísticas de vida y ajustes.',
  'wind.confirm.oneWay':
    'En esta versión no se puede volver a un bioma que dejaste. Quedará escrito en la Crónica.',
  'wind.confirm.yes': 'Dispersar',
  'wind.confirm.no': 'Quedarme aquí',
  'wind.leaving': 'El viento se lleva tu linaje. Destino: {name}.',
  'wind.gained.one': 'Esporulaste antes de partir: +{count} espora.',
  'wind.gained.other': 'Esporulaste antes de partir: +{count} esporas.',
  'wind.colonized': 'Bioma colonizado: {name}. Tu linaje produce ×{factor} en todos los biomas.',
  'actOne.announce': 'Fin del Acto I. El viento de esporas ya puede llevarte a otros biomas.',
  'hint.wind':
    'Dispersar no tiene prisa: puedes quedarte aquí lo que quieras. En un bioma nuevo, las partidas vuelven a durar lo que al principio, con reglas nuevas.',
  // Láminas del viaje
  'chapter.close': 'Seguir creciendo',
  'chapter.toWind': 'Ver el viento',
  'chapter.begin': 'Empezar a crecer',
  'chapter.toAdaptations': 'Ver las adaptaciones',
  'chapter.rules': 'Reglas de este bioma',
  'chapter.goal': 'Tu nivel de esporas empieza en 0. Llega al nivel {goal} para colonizar este bioma.',
  'chapter.adaptHint':
    'En Mutaciones puedes aprender tres adaptaciones de este bioma; lo que aprendas viaja contigo.',
  'chapter.lineage': 'Desde ahora tu linaje produce ×{factor} en todos los biomas.',
  'chapter.next': 'El viento sigue soplando. Cuando quieras, puede llevarte más lejos.',
  'chapter.act1.kicker': 'Fin del Acto I',
  'chapter.act1.title': 'El bosque completo',
  'chapter.act1.line1': 'Doce mutaciones y una red que late bajo cada pradera y cada bosque.',
  'chapter.act1.line2': 'Ya no se sabe dónde termina el bosque y dónde empiezas tú.',
  'chapter.act1.line3':
    'Pero un bosque completo no tiene adónde crecer. Las setas maduran todas a la vez y el viento empieza a soplar.',
  'chapter.act1.line4': 'Las esporas llevan lo que eres. El suelo se queda: ese habrá que ganarlo otra vez.',
  'chapter.act2.kicker': 'Acto II · Viento de esporas',
  'chapter.colonize.kicker': 'Bioma colonizado',
  'chapter.taiga.arrive.title': 'La taiga',
  'chapter.taiga.arrive.line1':
    'El viento te deja en el norte, entre píceas, pinos y abedules. Bajo la hojarasca de acículas, el suelo guarda una franja gris como la ceniza: un podzol.',
  'chapter.taiga.arrive.line2': 'Aquí casi todos los árboles viven con hongos, y llueve poco.',
  'chapter.choco.arrive.title': 'La selva del Chocó',
  'chapter.choco.arrive.line1':
    'El viento cruza montañas y baja hacia el Pacífico. Aquí llueve casi todos los días, y el suelo, lavado durante milenios, es rojo de hierro.',
  'chapter.choco.arrive.line2': 'Una hoja que cae dura poco: la selva la recicla en meses.',
  'chapter.taiga.colonize.title': 'Bajo la ceniza',
  'chapter.taiga.colonize.line1':
    'En la franja gris del podzol, tus hifas abren túneles en la roca para dar de comer a las píceas, como se cree que hacen las de verdad.',
  'chapter.taiga.colonize.line2': 'La taiga ya forma parte de tu linaje.',
  'chapter.choco.colonize.title': 'Lo que la lluvia no se lleva',
  'chapter.choco.colonize.line1':
    'La lluvia intenta llevarse cada nutriente hacia el río. Tu red lo atrapa antes, entre las raíces de la superficie.',
  'chapter.choco.colonize.line2': 'El Chocó ya forma parte de tu linaje.',
  // Crónica
  'chronicle.title': 'Crónica',
  'chronicle.intro': 'Cada bioma que habita tu linaje queda escrito aquí.',
  'chronicle.entry': '{name} · {status}',
  'chronicle.status.actOne': 'Acto I',
  'chronicle.status.colonized': 'colonizado',
  'chronicle.status.current': 'en curso',
  'chronicle.since': 'Desde el {date}',
  'chronicle.arrived': 'Llegada: {date}',
  'chronicle.left': 'Se fue con el viento el {date}',
  'chronicle.actOne.one': 'Acto I en {count} partida y {time} de juego',
  'chronicle.actOne.other': 'Acto I en {count} partidas y {time} de juego',
  'chronicle.colonizedIn.one': 'Colonizado el {date}, en {count} partida y {time} de juego',
  'chronicle.colonizedIn.other': 'Colonizado el {date}, en {count} partidas y {time} de juego',
  'chronicle.here.one': 'Aquí: {count} partida y {time} de juego',
  'chronicle.here.other': 'Aquí: {count} partidas y {time} de juego',
  'chronicle.level': 'Nivel de esporas alcanzado: {level}',
  'chronicle.adaptations': 'Adaptaciones de este bioma: {count} de {total}',
  'chronicle.current': 'Aquí vive tu linaje.',
  'chronicle.reread.act1': 'Releer: Fin del Acto I',
  'chronicle.reread.arrive': 'Releer la llegada',
  'chronicle.reread.arrive.label': 'Releer la llegada: {name}',
  'chronicle.reread.colonize': 'Releer la colonización',
  'chronicle.reread.colonize.label': 'Releer la colonización: {name}',
  'hint.chronicle': 'Las láminas que cierres se pueden releer aquí.',
  // Adaptaciones de bioma
  'adapt.group.network': 'De la red',
  'badapt.group.taiga': 'Aprendidas en la taiga',
  'badapt.group.choco': 'Aprendidas en la selva del Chocó',
  'badapt.needLevel.taiga': 'El siguiente rango se abre en el nivel {level} de la taiga, o al colonizarla.',
  'badapt.needLevel.choco':
    'El siguiente rango se abre en el nivel {level} de la selva del Chocó, o al colonizarla.',
  'hint.biomeAdaptations': 'Lo que tu linaje aprende en un bioma viaja con él a todos los demás.',
  'badapt.rockEating.name': 'Hongos que comen roca',
  'badapt.rockEating.desc':
    'En el horizonte gris de los podzoles se han hallado granos de feldespato con túneles de pocas micras; se cree que los abren hifas micorrícicas para sacar minerales para sus árboles (Jongmans y colegas, 1997). La Red micorrícica y el Árbol madre rinden ×{factor} por rango.',
  'badapt.rockEating.effect': 'Red micorrícica y Árbol madre ×{factor}.',
  'badapt.seedlingNetwork.name': 'Plántulas conectadas',
  'badapt.seedlingNetwork.desc':
    'En un bosque de abetos de Douglas, árboles jóvenes y viejos llevaban en sus raíces el mismo individuo de hongo, lo que sugiere que la red los une (Beiler y colegas, 2010); si esa unión dura y cuánto ayuda se discute. Cada partida empieza con {count} Redes micorrícicas más por rango.',
  'badapt.seedlingNetwork.effect': 'Cada partida empieza con {count} Redes micorrícicas más.',
  'badapt.trehalose.name': 'Trehalosa',
  'badapt.trehalose.desc':
    'Muchos hongos acumulan trehalosa, un azúcar que protege sus células del frío y de la sequía. Tu red la guarda para que cada aguacero le dure más: el Aguacero dura {time} más por rango.',
  'badapt.trehalose.effect': 'El Aguacero dura {time} más.',
  'badapt.gongylidia.name': 'Gongilidios',
  'badapt.gongylidia.desc':
    'El hongo que cultivan las hormigas cortadoras, Leucoagaricus gongylophorus, hincha las puntas de sus hifas con nutrientes para alimentarlas: son los gongilidios. Tus anillos aprenden a engordar igual: el Anillo de hadas rinde ×{factor} por rango.',
  'badapt.gongylidia.effect': 'Anillo de hadas ×{factor}.',
  'badapt.leafcutters.name': 'Hormigas cortadoras',
  'badapt.leafcutters.desc':
    'Las hormigas cortadoras llevan trozos de hoja a su hongo y lo cuidan día y noche. Cada rango suma un clic automático por segundo; la Tormenta eléctrica no lo multiplica.',
  'badapt.leafcutters.effect.one': '{count} clic automático por segundo.',
  'badapt.leafcutters.effect.other': '{count} clics automáticos por segundo.',
  'badapt.rootMat.name': 'Estera de raíces',
  'badapt.rootMat.desc':
    'En suelos tropicales pobres, una alfombra de raíces finas y hongos atrapa los nutrientes antes de que la lluvia los lave; en un experimento en la Amazonía retuvo más del 99,9 % (Stark y Jordan, 1978). El Rocío rinde ×{factor} por rango.',
  'badapt.rootMat.effect': 'Rocío ×{factor}.',
  // Estadísticas del viaje
  'stats.biome': 'Bioma actual',
  'stats.dispersals': 'Dispersiones',
  'stats.history.rowIn.one': 'Partida {n} ({biome}): {time}, +{count} espora',
  'stats.history.rowIn.other': 'Partida {n} ({biome}): {time}, +{count} esporas',
  // Textos que cambian en el Chocó: en la selva baja no hay abetos ni otoño
  'gen.motherTree.flavor.choco':
    'Un árbol emergente que asoma sobre el dosel. Si comparte azúcar por la red, en la selva se ha estudiado todavía menos.',
  'upg.motherTree.u3.flavor.choco': 'Bajo un árbol viejo crecen los jóvenes, esperando que se abra un claro.',
  'upg.motherTree.u4.name.choco': 'Memoria del árbol',
  'upg.motherTree.u4.flavor.choco': 'Siglos de raíces saben dónde no se encharca el suelo.',
  'upg.autumnLitter.name.choco': 'Hojarasca de todo el año',
  'news.motherTree.choco':
    'Un árbol emergente recibe visitas. Hay quien cree que alimenta a los árboles jóvenes de su sombra; la ciencia aún lo discute.',
  'dev.actOne': 'Cerrar el Acto I',
  'dev.colonize': 'Colonizar este bioma',
  // Noticias de los biomas y del viento
  'news.taiga.arrival': 'Llegan esporas desconocidas a la taiga. Las píceas no preguntan de dónde.',
  'news.taiga.podzol':
    'Podzol viene del ruso: «bajo la ceniza». Nadie quemó nada: el gris sale del agua que lava el suelo durante siglos.',
  'news.taiga.circumpolar':
    'La taiga rodea el planeta por el norte: Escandinavia, Rusia, Alaska y Canadá. La red ha empezado por una esquina.',
  'news.taiga.ecto':
    'Píceas, pinos, alerces y abedules: casi todos los árboles de la taiga viven con hongos ectomicorrícicos. Aquí nadie crece solo.',
  'news.taiga.carbon':
    'Un estudio en islas boreales de Suecia estimó que entre el 50 y el 70 % del carbono del suelo venía de las raíces y de sus hongos. La red guarda más de lo que enseña.',
  'news.taiga.rockEating':
    'En el horizonte gris del podzol hay granos de feldespato con túneles finísimos. Se cree que los abren hifas en busca de minerales; los geólogos lo llaman meteorización, y la red, almuerzo.',
  'news.taiga.amanita':
    'La Amanita muscaria, la del sombrero rojo con motas blancas, vive asociada a abedules y píceas. Su fama de cuento no la vuelve comestible: es tóxica.',
  'news.taiga.snowMold':
    'Bajo la nieve, cerca de cero grados, algunos mohos de las nieves siguen creciendo, entre otras cosas, gracias a proteínas anticongelantes. No todos hibernan.',
  'news.taiga.morels':
    'Tras un incendio en el bosque boreal, las colmenillas pueden brotar por cientos. Ningún guardabosques lo recomienda como método.',
  'news.taiga.lichen':
    'El liquen de los renos crece unos pocos milímetros al año. Un reno se come décadas de liquen en una tarde, y el liquen no guarda rencor.',
  'news.taiga.chaga':
    'En los abedules del norte asoma el chaga, un hongo que parece un trozo de carbón quemado. El abedul no está de acuerdo con la descripción.',
  'news.taiga.permafrost':
    'En partes de Siberia, la taiga crece sobre suelo helado todo el año. Las raíces viven en la capa de arriba, la única que se deshiela en verano.',
  'news.choco.arrival':
    'Llegan esporas a la selva del Chocó. Aquí nadie pregunta si va a llover, sino cuándo.',
  'news.choco.forecast': 'Pronóstico para hoy en el Chocó: lluvia. Para mañana: también.',
  'news.choco.lloro':
    'En Lloró, en el Chocó, se estima que caen unos 13.000 mm de lluvia al año. Le disputa el récord mundial a un pueblo de la India.',
  'news.choco.endemic':
    'Del Darién, en Panamá, al noroeste de Ecuador, el Chocó biogeográfico guarda miles de especies que no viven en ningún otro lugar. De los hongos, casi nadie ha hecho la cuenta.',
  'news.choco.leafcutter':
    'Las hormigas cortadoras no comen hojas: las mastican para cultivar un hongo, y se comen el hongo. Agricultura con seis patas.',
  'news.choco.farmers':
    'Según estimaciones genéticas, las hormigas cultivan hongos desde hace unos 55 a 60 millones de años; los humanos, desde hace unos doce mil. Ellas no presumen.',
  'news.choco.arbuscular':
    'La mayoría de los árboles de la selva vive con micorrizas arbusculares. Según los fósiles, esa alianza tiene más de 400 millones de años: es más antigua que los propios árboles.',
  'news.choco.litter':
    'En la selva, una hoja caída puede desaparecer en pocos meses; en la taiga tarda años. Aquí la hojarasca no tiene tiempo de amontonarse.',
  'news.choco.rootMat':
    'En suelos tropicales pobres, una alfombra de raíces y hongos atrapa los nutrientes antes de que la lluvia los lave. En un experimento en la Amazonía retuvo más del 99,9 %.',
  'news.choco.splash':
    'Los hongos nido de pájaro usan cada gota de lluvia como catapulta: el golpe lanza fuera de la copa sus paquetes de esporas. En el Chocó no les falta munición.',
  'news.choco.plastic':
    'Un hongo de la Amazonía de Ecuador, Pestalotiopsis microspora, puede crecer comiendo poliuretano en el laboratorio. La red, de momento, prefiere hojas.',
  'news.choco.glow':
    'Algunas setas tropicales brillan de noche con luz verde. En una especie de Brasil se vio que la luz atrae insectos, que podrían ayudar a repartir sus esporas.',
  'news.wind.rust':
    'Se ha documentado que esporas de la roya del trigo cruzaron con el viento de Australia a Nueva Zelanda: unos dos mil kilómetros sin equipaje.',
  'news.wind.buller':
    'Muchas setas lanzan cada espora con una gotita que se fusiona en microsegundos, la gota de Buller. El despegue alcanza miles de veces la gravedad.',
  'news.wind.altitude':
    'Se han recogido esporas de hongos a kilómetros de altura en la atmósfera. El viento lleva pasajeros que no salen en los mapas.',

  // Autocompra
  'autobuy.title': 'Autocompra',
  'autobuy.threshold': 'Comprar si cuesta menos del {percent} de tus nutrientes',
  'autobuy.threshold.label': 'Umbral de autocompra',
  'autobuy.upgrades': 'Autocompra de mejoras',
  'autobuy.allOn': 'Activar todos',
  'autobuy.allOff': 'Desactivar todos',

  // Logros
  'achievements.title': 'Logros',
  'achievements.progress': '{count} de {total} · +{percent} de producción',
  'achievements.secret': 'Logro secreto',
  'achievements.secret.hint': 'Se revela al conseguirlo.',
  'achievements.status.done': 'Conseguido',
  'achievements.status.locked': 'Pendiente',
  'achievement.unlocked': 'Logro: {name}',
  'achDesc.owned.one': 'Ten {count} {unit}',
  'achDesc.owned.other': 'Ten {count} {unit}',
  'achDesc.lifetime': 'Gana {value}\u00a0N en toda tu vida',
  'achDesc.production': 'Produce {value}\u00a0N/s',
  'achDesc.clicks': 'Absorbe con {count} clics',
  'achDesc.drops.one': 'Atrapa {count} gota de lluvia',
  'achDesc.drops.other': 'Atrapa {count} gotas de lluvia',
  'achDesc.sporulations.one': 'Esporula {count} vez',
  'achDesc.sporulations.other': 'Esporula {count} veces',
  'ach.own.hypha.1.name': 'Primer filamento',
  'ach.own.hypha.50.name': 'Maraña',
  'ach.own.hypha.100.name': 'Cabellera de la tierra',
  'ach.own.rhizomorph.1.name': 'Cordón umbilical',
  'ach.own.rhizomorph.50.name': 'Red de caminos',
  'ach.own.rhizomorph.100.name': 'Cordones de bota',
  'ach.own.primordium.1.name': 'Algo asoma',
  'ach.own.primordium.50.name': 'Guardería',
  'ach.own.primordium.100.name': 'Promesas por cumplir',
  'ach.own.mushroom.1.name': 'Asomar la cabeza',
  'ach.own.mushroom.50.name': 'Temporada de setas',
  'ach.own.mushroom.100.name': 'Prado moteado',
  'ach.own.fairyRing.1.name': 'Círculo cerrado',
  'ach.own.fairyRing.50.name': 'Baile de hadas',
  'ach.own.fairyRing.100.name': 'Prohibido pisar el césped',
  'ach.own.mycorrhiza.1.name': 'Apretón de raíces',
  'ach.own.mycorrhiza.50.name': 'Mercado subterráneo',
  'ach.own.mycorrhiza.100.name': 'Internet del bosque',
  'ach.own.motherTree.1.name': 'Abrazo de abeto',
  'ach.own.motherTree.50.name': 'Consejo de ancianos',
  'ach.own.motherTree.100.name': 'Matriarcado verde',
  'ach.own.ancientForest.1.name': 'Mil años de sombra',
  'ach.own.ancientForest.50.name': 'Dónde acaba el bosque',
  'ach.own.ancientForest.100.name': 'Todo es bosque',
  'ach.own.malheur.1.name': 'Pariente de Oregón',
  'ach.own.malheur.50.name': 'Kilómetros de ti',
  'ach.own.malheur.100.name': 'El individuo más grande',
  'ach.own.planetary.1.name': 'Pulso compartido',
  'ach.own.planetary.50.name': 'Bajo cada pradera',
  'ach.own.planetary.100.name': 'Un planeta con raíces',
  'ach.lifetime.1.name': 'Primer bocado',
  'ach.lifetime.2.name': 'Despensa llena',
  'ach.lifetime.3.name': 'Banquete subterráneo',
  'ach.lifetime.4.name': 'Riqueza del humus',
  'ach.lifetime.5.name': 'Economía geológica',
  'ach.production.1.name': 'Goteo constante',
  'ach.production.2.name': 'Arroyo de nutrientes',
  'ach.production.3.name': 'Río subterráneo',
  'ach.production.4.name': 'Marea de fósforo',
  'ach.production.5.name': 'Corriente continental',
  'ach.clicks.1.name': 'Dedos curiosos',
  'ach.clicks.2.name': 'Tacto de jardinero',
  'ach.clicks.3.name': 'Lombriz honoraria',
  'ach.drops.1.name': 'Primera gota',
  'ach.drops.2.name': 'Temporada de lluvias',
  'ach.drops.3.name': 'Monzón',
  'ach.sporulations.1.name': 'Nube de esporas',
  'ach.sporulations.2.name': 'Ciclo de vida',
  'ach.sporulations.3.name': 'Viejo conocido del viento',
  'ach.secret.patience.name': 'Paciencia de hongo',
  'ach.secret.patience.desc': 'Pasa 10 minutos con el juego abierto sin hacer clic.',
  'ach.secret.noRush.name': 'Sin prisa',
  'ach.secret.noRush.desc': 'Vuelve después de 8 horas o más.',
  // Logros de Viento de esporas (fase 8): no se ven hasta el Acto I.
  'ach.disperse.1.name': 'Pasajero del viento',
  'ach.disperse.1.desc': 'Dispersa tu linaje por primera vez.',
  'ach.colonize.taiga.name': 'Raíces boreales',
  'ach.colonize.taiga.desc': 'Coloniza la taiga.',
  'ach.colonize.choco.name': 'Trece metros de lluvia',
  'ach.colonize.choco.desc': 'Coloniza la selva del Chocó.',
  'ach.adapt.biomeFull.name': 'Aclimatación',
  'ach.adapt.biomeFull.desc': 'Lleva al máximo las tres adaptaciones de un bioma.',
  'ach.biomeLevel.1.name': 'Echar raíces',
  'ach.biomeLevel.1.desc': 'Llega al nivel de esporas {level} en un bioma lejos del natal.',

  // Lluvia
  'rain.drop.label': 'Atrapar la gota de lluvia',
  'rain.spawn': 'Empieza a llover: atrapa la gota antes de que se evapore.',
  'rain.expired': 'La gota se evaporó.',
  // El aviso repite el verbo del botón «Atrapar la gota de lluvia» (PROMPT.md §13).
  'rain.caught.downpour': 'Atrapaste la gota: Aguacero, producción ×5 durante {time}.',
  'rain.caught.dew': 'Atrapaste la gota: Rocío, +{value}\u00a0N.',
  'rain.caught.storm': 'Atrapaste la gota: Tormenta eléctrica, clic ×500 durante {time}.',
  'rain.fell.downpour': 'La gota cayó sola: Aguacero, producción ×5 durante {time}.',
  'rain.fell.dew': 'La gota cayó sola: Rocío, +{value}\u00a0N.',
  'rain.fell.storm': 'La gota cayó sola: Tormenta eléctrica, clic ×500 durante {time}.',
  'rain.storm.fact':
    'En Japón se ha experimentado con descargas eléctricas para aumentar la cosecha de setas.',
  'rain.ended.downpour': 'Terminó el Aguacero.',
  'rain.ended.storm': 'Terminó la Tormenta eléctrica.',

  // Estadísticas
  'stats.title': 'Estadísticas',
  'stats.runEarned': 'Nutrientes de esta partida',
  'stats.lifetimeEarned': 'Nutrientes de toda la vida',
  'stats.maxNps': 'N/s máximo',
  'stats.clicks': 'Clics',
  'stats.drops': 'Gotas atrapadas',
  'stats.sporulations': 'Esporulaciones',
  'stats.sporeLevel': 'Nivel de esporas',
  'stats.achievements': 'Logros',
  'stats.runTime': 'Tiempo en esta partida',
  'stats.totalTime': 'Tiempo jugado en total',
  'stats.startedAt': 'Fecha de inicio',

  'stats.history.title': 'Últimas partidas',
  'stats.history.empty': 'Aún no has esporulado. Aquí quedará cada partida terminada.',
  'stats.history.row.one': 'Partida {n}: {time}, +{count} espora',
  'stats.history.row.other': 'Partida {n}: {time}, +{count} esporas',
  // Ajustes
  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.language.es': 'Español',
  'settings.language.en': 'English',
  'settings.notation': 'Notación de números',
  'settings.notation.names': 'Nombres (1,5 millones)',
  'settings.notation.suffix': 'Sufijos (1,5 M)',
  'settings.notation.scientific': 'Científica (1,5e6)',
  'settings.notation.engineering': 'Ingeniería (1,5e6, exponentes de 3 en 3)',
  'settings.sound': 'Sonido',
  'settings.sound.on': 'Activado',
  'settings.sound.off': 'Silenciado',
  'settings.volume': 'Volumen',
  'settings.reducedMotion': 'Reducir movimiento',
  'settings.reducedMotion.hint': 'Quita partículas y sacudidas y acorta las transiciones.',
  'settings.save.title': 'Partida',
  'settings.export': 'Exportar partida',
  'settings.export.hint': 'Copia este texto y guárdalo donde quieras.',
  'settings.export.copy': 'Copiar',
  'settings.export.copied': 'Copiado',
  'settings.export.copyFailed': 'No se pudo copiar: selecciona el texto y cópialo a mano.',
  'settings.import': 'Importar partida',
  'settings.import.hint': 'Pega aquí un texto exportado.',
  'settings.import.button': 'Revisar e importar',
  'settings.import.error.empty': 'Pega primero el texto de una partida exportada.',
  'settings.import.error.tooLarge': 'El texto es demasiado largo para ser una partida.',
  'settings.import.error.base64':
    'El texto no es una partida exportada: tiene caracteres que no corresponden.',
  'settings.import.error.encoding': 'El texto está dañado y no se puede leer.',
  'settings.import.error.json': 'El texto está dañado y no se puede leer.',
  'settings.import.error.shape': 'El texto no tiene la forma de una partida de Micelio.',
  'settings.import.error.version': 'La partida es de una versión de Micelio que este juego no reconoce.',
  'settings.import.error.migration': 'La partida es de una versión antigua que no se pudo actualizar.',
  'settings.import.error.invalid': 'La partida tiene valores imposibles y no se puede cargar.',
  'settings.import.confirm.title': '¿Reemplazar tu partida?',
  'settings.import.confirm.lifetime': 'Nutrientes de toda la vida: {value}',
  'settings.import.confirm.level': 'Nivel de esporas: {level}',
  'settings.import.confirm.biome': 'Bioma: {name}',
  'settings.import.confirm.date': 'Guardada el {date}',
  'settings.import.confirm.warning': 'Tu partida actual se perderá.',
  'settings.import.confirm.yes': 'Reemplazar partida',
  'settings.import.done': 'Partida importada.',
  'settings.wipe': 'Borrar partida',
  'settings.wipe.hint': 'Empieza de cero. No se puede deshacer.',
  'settings.wipe.prompt': 'Escribe {word} para confirmar',
  'settings.wipe.word': 'BORRAR',
  'settings.wipe.button': 'Borrar partida',
  'settings.wipe.done': 'Partida borrada. La red vuelve a empezar.',

  // Offline
  'offline.title': 'Mientras no estabas…',
  // Nada concuerda en género ni número con {time} o {cap}: «1 h» y «1 d» son singulares y
  // «Pasaron 1 h» o «las primeras 1 d» sonaban mal.
  'offline.body': 'Tiempo fuera: {time}. Tu red absorbió {value}\u00a0N.',
  'offline.capped': 'Solo cuenta un máximo de {cap}.',
  'offline.efficiency': 'Eficiencia offline: {percent}.',
  'offline.flavor.1': 'La red siguió creciendo en la oscuridad, como siempre.',
  'offline.flavor.2': 'Mientras dormías, las hifas hicieron horas extra.',
  'offline.flavor.3': 'El suelo no lleva reloj, pero sí cuentas.',
  'offline.flavor.4': 'Ninguna lombriz notó tu ausencia. La red sí, y la aprovechó.',
  'offline.flavor.5': 'Lo que pasa cuando no miras: kilómetros de filamento.',
  'offline.close': 'Seguir creciendo',

  // Guardado
  'save.unavailable': 'Este navegador no deja guardar: la partida se perderá al cerrar la pestaña.',
  'save.corrupt': 'El guardado estaba dañado. Hicimos una copia de respaldo y empezamos una partida nueva.',
  'save.corruptNoBackup':
    'El guardado estaba dañado y no había espacio para una copia de respaldo. No guardaremos nada hasta que decidas empezar de nuevo.',
  'save.startFresh': 'Empezar de nuevo',
  'save.otherTab': 'Micelio se abrió en otra pestaña. Esta dejó de guardar para no pisarla.',
  'save.invalid':
    'La partida tiene un valor imposible y no se guardó, para no estropear el último guardado bueno.',
  'save.reload': 'Recargar',

  // Avisos de primera vez
  'hint.generators': 'Compra una Hifa: absorbe por ti, también cuando no miras.',
  'hint.upgrades': 'Hay una mejora disponible. Las mejoras multiplican, no suman.',
  'hint.milestone': 'Al llegar a 25 unidades, la producción de un generador se duplica.',
  'hint.rain': 'Una gota de lluvia. Tócala antes de que se evapore.',
  'hint.achievements': 'Cada logro suma un 1 % a toda tu producción.',
  'hint.sporulate': 'Al esporular empiezas de nuevo, pero con esporas que te hacen más fuerte.',
  'hint.mutations': 'Gasta esporas en mutaciones. Son para siempre.',
  'hint.autobuy': 'Instinto: activa la autocompra en cada generador.',
  'hint.dismiss': 'Entendido',

  // Noticias del sotobosque
  'news.label': 'Noticias del sotobosque',
  'news.worm': 'Una lombriz denuncia que el suelo está sospechosamente organizado.',
  'news.fairyStep': 'Se recomienda no pisar los anillos de hadas. Por si acaso.',
  'news.quietSoil': 'Hoy en el suelo: humedad, oscuridad y un silencio muy productivo.',
  'news.firstThread': 'Un filamento solitario declara que esto va para largo.',
  'news.beetle': 'Un escarabajo pide cita para visitar la red. Le dicen que vuelva en primavera.',
  'news.hairWidth':
    'Una hifa mide unas pocas micras de ancho; un cabello humano, unas setenta. Tú ganas en número.',
  'news.kilometers': 'Se calcula que un gramo de suelo de bosque puede guardar cientos de metros de hifas.',
  'news.rhizoHighway': 'Los rizomorfos inauguran una autopista subterránea. Peaje: un poco de glucosa.',
  'news.molePetition': 'Un topo presenta una queja formal: los túneles ya estaban ocupados.',
  'news.button': 'Asoma un primordio. Su familia lo llama «el botón» y a él no le hace gracia.',
  'news.pickers': 'Recolectores reportan setas en lugares imposibles. Las setas no hacen comentarios.',
  'news.sporePrint':
    'Un sombrero apoyado sobre un papel deja un dibujo de esporas. Los micólogos lo llaman esporada.',
  'news.brainNotFound':
    'Hay investigadores que comparan las redes de micelio con redes de transporte. El micelio no pidió el cumplido.',
  'news.fairyAdvice':
    'Según el folclore, quien entra en un anillo de hadas baila hasta el amanecer. Se recomienda calzado cómodo.',
  'news.ringGrowth': 'Un anillo de hadas crece hacia fuera cada año. Algunos llevan siglos ensanchándose.',
  'news.oakDeal': 'Los robles del norte cierran un acuerdo: azúcar a cambio de fósforo.',
  'news.ninetyPercent':
    'La gran mayoría de las plantas terrestres vive en simbiosis con hongos micorrícicos. Las demás se lo pierden.',
  'news.woodWideWeb': 'La prensa la llamó «Wood Wide Web». Los hongos prefieren no ponerse nombres.',
  'news.motherTree':
    'Un abeto viejo recibe visitas. Hay quien cree que alimenta a sus plántulas; la ciencia aún lo discute.',
  'news.debate':
    'Congreso de ecología: tres horas debatiendo cuánto comparten los árboles. Nadie preguntó a los hongos.',
  'news.ancientForest': 'Un bosque milenario cuenta su edad en anillos. Tú la cuentas en kilómetros.',
  'news.squirrelLawyer': 'Una ardilla contrata abogado: alega que las trufas enterradas eran suyas.',
  'news.readyToSpore': 'Rumores en el sotobosque: algo grande se prepara para esporular.',
  'news.firstRain': 'Llueve. Todo el bosque huele a promesa.',
  'news.petrichor':
    'Tras la lluvia, las setas brotan en horas: el agua infla estructuras que ya estaban listas.',
  'news.lightning':
    'Hay quien jura que tras las tormentas salen más setas. En Japón lo han probado con descargas eléctricas.',
  'news.sporeCloud':
    'Una sola seta puede soltar miles de millones de esporas. Basta con que una llegue lejos.',
  'news.trillions': 'El viento reporta un aumento inusual de pasajeros microscópicos.',
  'news.deja': 'Sensación de déjà vu en el sotobosque. Esta vez la red sabe dónde estaba el agua.',
  'news.malheur':
    'En el bosque nacional de Malheur, en Oregón, un solo Armillaria ostoyae ocupa casi diez kilómetros cuadrados.',
  'news.oldest':
    'Se estima que el gigante de Oregón tiene entre dos mil y ocho mil años. Nadie le pidió el carné.',
  'news.planetary': 'Bajo cada pradera, un mismo pulso. Las lombrices empiezan a llevar el ritmo.',
  'news.glow': 'Algunos hongos brillan en la madera podrida. En inglés lo llaman foxfire: fuego de zorro.',
  'news.kingdom': 'Recordatorio: los hongos no son plantas. Son parientes más cercanos de los animales.',
  'news.lichen': 'Un liquen es un hongo y un alga viviendo juntos. Ninguno recuerda quién lo propuso.',
  'news.penicillin': 'En 1928, un moho estropeó un cultivo de Alexander Fleming. Así empezó la penicilina.',
  'news.cordyceps':
    'Un hongo del género Ophiocordyceps manipula hormigas. La red promete no intentarlo con nadie.',
  'news.truffle':
    'Los cerdos encuentran trufas por el olor, pero se las comen. Por eso hoy se prefieren perros.',
  'news.radiation':
    'En Chernóbil se hallaron hongos que crecen hacia la radiación. Hay quien sospecha que la aprovechan.',
  'news.patience': 'Ocho esporulaciones después, la red ya no tiene prisa. Nunca la tuvo.',
  'news.undergroundWeather': 'Parte del tiempo subterráneo: oscuro, húmedo y con probabilidad alta de setas.',
  'news.snailAssembly': 'Un caracol pide la palabra en la asamblea del suelo. La asamblea sigue esperando.',
  'news.chitin':
    'Las paredes de las hifas llevan quitina, el mismo material que el caparazón de un escarabajo.',
  'news.yeast': 'La levadura del pan y de la cerveza es un hongo. Lleva miles de años trabajando sin cobrar.',
  'news.pineCone': 'Cae una piña sobre la red. La red la incluye en sus planes.',
  // En el Chocó no hay coníferas (ARCHITECTURE.md §4.28).
  'news.pineCone.choco': 'Cae un fruto de palma sobre la red. La red lo incluye en sus planes.',
  'news.asphalt': 'Una seta levanta el asfalto de un camino. No empuja a golpes: empuja con agua, sin prisa.',
  'news.rootsGossip': 'Las raíces se quejan: la red se entera de todo antes que ellas.',
  'news.ownWind':
    'Algunas setas fabrican su propio viento: al evaporar agua enfrían el aire y las esporas salen flotando.',
  'news.puffball':
    'Un solo bejín gigante puede soltar billones de esporas. Casi ninguna llega a nada, y no importa.',
  'news.species':
    'Se han descrito unas 150.000 especies de hongos. Se calcula que quedan millones por nombrar.',
  'news.stinkhorn':
    'El falo hediondo huele a carroña a propósito: las moscas que acuden se llevan sus esporas.',
  'news.rootMeeting': 'Reunión de raíces: nadie sabe quién la convocó, pero todas llegaron por la red.',
  'news.blueCheese': 'Las vetas del queso azul son un moho, Penicillium roqueforti. Nadie se queja.',
  'news.employee': 'La red, nombrada empleada del mes por enésima vez. Pide que el premio sea en azúcar.',
  'news.prototaxites':
    'Hace unos 400 millones de años, Prototaxites, quizá un hongo o algo aún más raro, se alzaba hasta 8 metros.',
  'news.lostSpore': 'Se busca espora perdida. Responde a cualquier nombre y a ninguno.',
  'news.pilobolus':
    'El hongo Pilobolus dispara su cápsula de esporas a más de 2 metros, con una aceleración de unas 20.000 g.',
  'news.termites':
    'Algunas termitas cultivan hongos en sus nidos desde hace millones de años. Mucho antes que nosotros.',
  'news.carboniferous':
    'Una hipótesis: en el Carbonífero se acumuló tanto carbón porque aún no había hongos que digirieran la lignina.',
  'news.birdsNest':
    'Los hongos nido de pájaro esperan la lluvia: cada gota que cae en su copa lanza fuera sus «huevos» de esporas.',
  'news.cloudSpores':
    'Hay esporas que suben hasta las nubes, y algunas pueden ayudar a que se formen gotas. La lluvia vuelve.',
  'news.oysterHunter':
    'La seta de ostra caza gusanos microscópicos cuando le falta nitrógeno. Por fuera parece tan tranquila.',
  'news.noose': 'Hay hongos que atrapan nematodos con lazos que se cierran en una décima de segundo.',
  'news.myceliumBricks':
    'Ya se fabrican embalajes y ladrillos de micelio. La red pregunta si cobra derechos.',
  'news.postcard':
    'El bosque natal recibe una postal: «Aquí todo bien. Mucha lluvia. Os escribo por la red».',
  // En la taiga llueve la mitad.
  'news.postcard.taiga':
    'El bosque natal recibe una postal: «Aquí todo bien. Frío y poca lluvia. Os escribo por la red».',

  // Números
  // Tooltip de un número grande: la cifra entera y, con sufijos cortos, el nombre.
  'num.tooltip': '{exact} · {long}',
  'num.countOf': '{count} de',
  'num.percent': '{value}\u00a0%',
  // Nombres de los órdenes de magnitud (escala larga, la del español): 1e9 son mil millones.
  'num.name.M.one': 'millón',
  'num.name.M.other': 'millones',
  'num.name.B.one': 'mil millones',
  'num.name.B.other': 'mil millones',
  'num.name.T.one': 'billón',
  'num.name.T.other': 'billones',
  'num.name.Qa.one': 'mil billones',
  'num.name.Qa.other': 'mil billones',
  'num.name.Qi.one': 'trillón',
  'num.name.Qi.other': 'trillones',
  'num.name.Sx.one': 'mil trillones',
  'num.name.Sx.other': 'mil trillones',
  'num.name.Sp.one': 'cuatrillón',
  'num.name.Sp.other': 'cuatrillones',
  'num.name.Oc.one': 'mil cuatrillones',
  'num.name.Oc.other': 'mil cuatrillones',
  'num.name.No.one': 'quintillón',
  'num.name.No.other': 'quintillones',
  'num.name.Dc.one': 'mil quintillones',
  'num.name.Dc.other': 'mil quintillones',
  'num.name.Ud.one': 'sextillón',
  'num.name.Ud.other': 'sextillones',
  'num.name.Dd.one': 'mil sextillones',
  'num.name.Dd.other': 'mil sextillones',
  'num.name.Td.one': 'septillón',
  'num.name.Td.other': 'septillones',
  'num.name.Qad.one': 'mil septillones',
  'num.name.Qad.other': 'mil septillones',
  'num.name.Qid.one': 'octillón',
  'num.name.Qid.other': 'octillones',
  'num.name.Sxd.one': 'mil octillones',
  'num.name.Sxd.other': 'mil octillones',
  'num.name.Spd.one': 'nonillón',
  'num.name.Spd.other': 'nonillones',
  'num.name.Ocd.one': 'mil nonillones',
  'num.name.Ocd.other': 'mil nonillones',
  'num.name.Nod.one': 'decillón',
  'num.name.Nod.other': 'decillones',
  'num.name.Vg.one': 'mil decillones',
  'num.name.Vg.other': 'mil decillones',

  // Comunes
  'common.close': 'Cerrar',
  'common.cancel': 'Cancelar',
  'common.more': 'Más información sobre {name}',
  'live.region': 'Avisos del juego',

  // Panel de desarrollo (no llega al build de producción)
  'dev.title': 'Desarrollo',
  'dev.speed': 'Velocidad ×{factor}',
  'dev.skipHour': 'Avanzar 1 h',
  'dev.give': 'Sumar ×10 nutrientes',
  'dev.drop': 'Forzar gota',

  // Socios (fase 9)
  'tab.partners': 'Socios',
  'partners.title': 'Socios',
  'partners.intro':
    'Otros organismos que viven cerca de tu red. Cada uno juega a su manera y con su propia moneda; lo que hagan no le quita nada a tu red.',
  'partners.loading': 'Preparando la placa…',
  'partners.loadFailed':
    'No se pudo cargar este socio. Puede que haya una versión nueva del juego o que falle la conexión.',
  'partners.reload': 'Recargar la página',
  'hint.partners': 'El plasmodio sigue adaptándose aunque cambies de pestaña, y también mientras no estás.',
  'save.partnerReset':
    'El estado del plasmodio no se pudo recuperar y empieza de nuevo. Tu red no ha perdido nada, y el guardado anterior quedó en la copia de respaldo.',
  'save.partnerRestored':
    'El plasmodio tenía un valor imposible y volvió a su último estado guardado. Tu red se guardó con normalidad.',
  'settings.import.confirm.partnerReset':
    'El plasmodio de este guardado no se pudo recuperar: empezará de nuevo.',
  'partners.loadingTitle': 'Plasmodio',

  // Llegada del plasmodio
  'chapter.partner.kicker': 'Un socio',
  'chapter.later': 'Ahora no',
  'chapter.toPlate': 'Ver la placa',
  'chapter.plasmodium.arrive.title': 'Un vecino amarillo',
  'chapter.plasmodium.arrive.line1':
    'Sobre un tronco caído avanza algo amarillo, como mucho unos centímetros por hora. Parece un hongo, durante mucho tiempo se clasificó entre ellos y los micólogos lo siguen estudiando.',
  'chapter.plasmodium.arrive.line2':
    'Sin cerebro, une la comida que encuentra con redes que se han comparado con la de los trenes de Tokio.',
  'chapter.plasmodium.arrive.line3':
    'Es Physarum polycephalum, un moho mucilaginoso: un protista, una sola célula con muchos núcleos.',
  'chapter.plasmodium.arrive.line4':
    'En la pestaña Socios puedes darle copos de avena y mirar cómo decide. Lo que haga no le quita nada a tu red.',
  'plasmodium.announce': 'Un socio nuevo: el plasmodio. Vive en la pestaña Socios.',

  // Logros del plasmodio (no suman al bono)
  'achievements.partner.plasmodium.title': 'Del plasmodio',
  'achievements.partner.intro': 'Estos logros son del plasmodio: no suman al bono de producción de tu red.',
  'achievements.partner.progress': '{count} de {total}',
  'pach.firstOat.name': 'Primer copo',
  'pach.firstOat.desc': 'Pon tu primer copo de avena.',
  'pach.log.name': 'Esporangios',
  'pach.log.desc': 'Cartografía el Tronco caído.',
  'pach.maze.name': 'Sin cerebro y sin rodeos',
  'pach.maze.desc': 'Cartografía el Laberinto.',
  'pach.archipelago.name': 'Cercanías',
  'pach.archipelago.desc': 'Cartografía el Archipiélago.',
  'pach.bitter.name': 'Ya no sabe amargo',
  'pach.bitter.desc': 'Cartografía el Puente amargo.',
  'pach.fusion.name': 'Una sola célula',
  'pach.fusion.desc': 'Cartografía la Fusión.',
  'pach.cutProof.name': 'A prueba de cortes',
  'pach.cutProof.desc': 'Une tres copos o más con la red estable y una tolerancia a cortes del 100 %.',
  'pach.noPulse.name': 'Paciencia de protista',
  'pach.noPulse.desc': 'Cartografía una placa, o mejora su mapa, sin dar ni un pulso desde que la abriste.',

  // Poda (autocompra)
  'autobuy.mode.label': 'Cómo elige la autocompra',
  'autobuy.mode.threshold': 'Por umbral',
  'autobuy.mode.payback': 'Lo que antes se amortiza',
  'autobuy.payback.desc':
    'Poda, un regalo del plasmodio: cada segundo compra, entre los generadores activados (y las mejoras, si están activadas), lo que antes recupera su coste con lo que produce. Si lo mejor aún no alcanza, espera a poder pagarlo.',
  'autobuy.payback.saving': 'Ahorrando para: {name} ({time})',
  'autobuy.payback.idle': 'Nada que comprar entre lo activado.',

  // Camino corto (Esporular)
  'sporulate.rate': 'Ahora ganas {value} esporas por minuto de partida.',
  'sporulate.rate.next': 'Con la siguiente espora, dentro de {time}, serían {value} por minuto.',
  'sporulate.rate.none': 'Aún no ganas esporas en esta partida.',
  'sporulate.rate.source': 'Camino corto, un regalo del plasmodio.',

  // Offline y estadísticas
  'offline.plasmodium': 'El plasmodio siguió adaptándose durante {time}, al {percent}.',
  'stats.plasmodium': 'Plasmodio',
  'stats.plasmodium.trailEarned': 'Rastro ganado',
  'stats.plasmodium.plates': 'Placas cartografiadas',
  'stats.plasmodium.pulses': 'Pulsos dados',

  // Noticias del plasmodio (Apéndice B: condiciones)
  'news.plasmodium.notFungus':
    'Aclaración del sotobosque: el moho amarillo del tronco no es un hongo. Los micólogos lo estudian igual, y él no se queja.',
  'news.plasmodium.speed': 'Última hora: el plasmodio avanzó unos centímetros. A su escala, es una carrera.',
  'news.plasmodium.shuttle':
    'Su citoplasma va y viene por los tubos y cambia de sentido cada uno o dos minutos. Lo llaman flujo de vaivén.',
  'news.plasmodium.mating':
    'Se dice que Physarum tiene unos 720 tipos de apareamiento. Organizar una cita es complicado.',
  'news.plasmodium.sclerotium':
    'Si se seca, el plasmodio se vuelve una costra dura, el esclerocio. Con agua, despierta como si nada.',
  'news.plasmodium.blob':
    'En 2019, el zoológico de París lo exhibió con el apodo de «le blob». Él siguió comiendo avena.',
  'news.plasmodium.space':
    'En 2021, plasmodios dormidos viajaron a la Estación Espacial Internacional para un experimento escolar. Despertaron con agua, como siempre.',
  'news.plasmodium.maze': 'Un moho resuelve un laberinto. Pide que no se lo cuenten al topo.',
  'news.plasmodium.trains':
    'Un moho trazó con avena una red parecida a la de los trenes de Tokio. En el sotobosque se dice que los ingenieros ferroviarios miran la avena con desconfianza.',
  'news.plasmodium.slime':
    'El plasmodio suele evitar pasar por donde ya dejó mucílago: así no pierde tiempo donde ya buscó (Reid y colegas, 2012).',
  'news.plasmodium.quinine':
    'Tras varios días cruzando puentes con quinina, unos plasmodios de un laboratorio francés dejaron de hacerle ascos. Sin neuronas.',
  'news.plasmodium.fusion':
    'Dos plasmodios que se tocan pueden fundirse en una sola célula. Lo que uno aprendió, el otro lo hereda.',

  // Panel de desarrollo
  'dev.partner': 'Traer al plasmodio',
  'dev.plate': 'Cartografiar esta placa',
} as const;

export type MessageKey = keyof typeof es;
export type Catalog = Record<MessageKey, string>;
