/**
 * Textos del plasmodio en inglés (Estados Unidos, como src/i18n/en.ts). Deben tener exactamente
 * las claves de plasmodium.es.ts (lo impone el tipo PlasmodiumCatalog).
 */
import type { PlasmodiumCatalog } from './plasmodium.es.ts';

export const plasmodiumEn: PlasmodiumCatalog = {
  name: 'Plasmodium',
  species: 'Physarum polycephalum',
  kind: 'A slime mold. Not a fungus: a protist.',
  plateOf: 'Plate {n} of {total}: {name}',
  trail: 'Trail: {value}',
  'trail.label': 'Trail',
  trailRate: '+{value} Trail per second',
  'trail.help':
    "Trail is the slime the plasmodium leaves behind as it moves. It comes from the linked flakes and the network's quality, and it buys the plasmodium's upgrades.",
  moist: 'Moist agar: it adapts twice as fast for {time}.',
  mapping: 'Mapping {name}: {done} of {total} Trail',
  'mapping.help':
    'The plasmodium maps the plate with the Trail it leaves. When it reaches the goal and the network meets the target for 1 min, it fruits.',
  'mapping.done': 'All plates are mapped. You can return to any of them to improve your map.',

  'plate.log.name': 'Fallen log',
  'plate.log.intro': 'Damp forest wood, where it really lives. Here it learns to link the food you give it.',
  'plate.log.goal':
    'Place {foods} oat flakes and let the plasmodium link them with a short network that survives cuts, for {hold}.',
  'plate.maze.name': 'Maze',
  'plate.maze.intro':
    'A maze on agar, with oats at the entrance and at the exit. The plasmodium fills all of it, then keeps what is useful.',
  'plate.maze.goal': 'Leave only the shortest path between the two flakes, for {hold}.',
  'plate.archipelago.name': 'Archipelago',
  'plate.archipelago.intro':
    'Oat islands around a sea of light and a lit ridge, which the plasmodium avoids. A cheap network breaks with one cut; a safe one costs more.',
  'plate.archipelago.goal': 'Link {foods} oat islands with a short network that survives cuts, for {hold}.',
  'plate.bitterBridge.name': 'Bitter bridge',
  'plate.bitterBridge.intro':
    'A river of agar laced with quinine splits the plate into two shores. The plasmodium dislikes it, but it can get used to it.',
  'plate.bitterBridge.goal':
    'Link both shores and {foods} more flakes across the quinine, with a short network that survives cuts, for {hold}.',
  'plate.fusion.name': 'Fusion',
  'plate.fusion.intro':
    'Two plasmodia on the same plate, sprinkled with salt. The one on the left has crossed salt bridges before; the one on the right has never tasted salt and will only learn by fusing with the other.',
  'plate.fusion.goal':
    'Fuse the two plasmodia by linking their flakes and {foods} more, so the one on the right learns to cross the salt, for {hold}.',

  'plate.label': 'Plate {name}: {count} sites',
  'plate.help':
    'Pick a tool and tap a site. With the keyboard: arrow keys move between sites, Enter or Space use the tool, and 1, 2 and 3 switch tools.',
  'site.label': 'Site {n}, {content}: {action}',
  'site.label.suggested': 'Site {n}, {content}, suggested site: {action}',
  'site.content.empty': 'empty',
  'site.content.food': 'oat flake',
  'site.content.foodFixed': "plate's oat flake",
  'site.content.lamp': 'lamp',
  'site.content.lampFixed': "plate's light",
  'site.action.placeFood': 'place an oat flake',
  'site.action.placeLamp': 'place a lamp',
  'site.action.remove': 'remove',
  'site.action.toFood': 'swap for an oat flake',
  'site.action.toLamp': 'swap for a lamp',
  'site.action.noFood': 'no oat flakes left',
  'site.action.noLamp': 'no lamps left',
  'site.action.fixed': 'part of the plate, cannot be changed',
  'site.action.empty': 'nothing to remove',
  'site.action.foodLocked': 'the oats are already set on this plate',
  'site.row': 'Site {n} · {position} · {content} · {tubes}',
  'site.position': 'row {row}, column {col}',
  'site.tubes.one': '{count} living tube reaches here',
  'site.tubes.other': '{count} living tubes reach here',
  'site.quinine': 'touches the quinine bridge',
  'site.salt': 'touches the salt',
  'site.suggested': 'suggested site',
  'site.placed.food.one': 'Oat flake placed on site {n}. {count} left.',
  'site.placed.food.other': 'Oat flake placed on site {n}. {count} left.',
  'site.placed.lamp.one': 'Lamp placed on site {n}. {count} left.',
  'site.placed.lamp.other': 'Lamp placed on site {n}. {count} left.',
  'site.removed': 'Site {n} is empty.',

  'tools.label': 'Tool',
  'tool.food': 'Oat flake',
  'tool.lamp': 'Lamp',
  'tool.remove': 'Remove',
  'tool.count': '{left} of {total}',
  'tool.food.label': 'Oat flake: {left} of {total} left',
  'tool.lamp.label': 'Lamp: {left} of {total} left',
  'pulse.button': 'Send a pulse',
  'pulse.desc':
    'Cytoplasm flows back and forth through the tubes. A pulse runs {steps} adaptation steps at once and leaves {time} of Trail. You can send one every {cooldown}.',
  'pulse.ready': 'ready',
  'pulse.wait': 'in {time}',
  'flow.label': 'Flow',
  'flow.low': 'Low',
  'flow.medium': 'Medium',
  'flow.high': 'High',
  'flow.desc':
    'How much cytoplasm the plasmodium moves. With more flow, backup tubes survive: cut tolerance goes up, and so does cost. In the model by Tero and colleagues, this flow decides whether the network comes out as a tree or with loops. It can be changed on plates you have already mapped; the one you are mapping uses Medium, which best meets the quality goal.',
  'flow.locked': 'Flow can be changed on plates you have already mapped.',

  'plate.expand': 'Enlarge the plate',
  'plate.expanded.title': 'Plate: {name}',
  'plate.close': 'Close the enlarged plate',
  'plate.list': 'View as list',
  'plate.map': 'View the plate',
  'plate.narrow': 'On this screen, sites are chosen from the list.',
  'plate.respread': 'Spread again',
  'plate.respread.confirm': 'Confirm: spread again',
  'plate.respread.cancel': 'Cancel',
  'plate.respread.desc':
    'The plasmodium covers the whole plate again and starts adapting from scratch. Useful if the network gets stuck. Your flakes, your lamps, what it learned and your Trail stay as they are.',

  'net.summary': 'The network links {joined} of {total} flakes with {alive} living tubes.',
  'net.drying.one': '{count} tube is drying out.',
  'net.drying.other': '{count} tubes are drying out.',
  'net.exploring':
    'The plasmodium covers the plate and explores. Place at least two flakes so it starts deciding.',
  'net.stalled':
    'The network has not changed for a while. If it does not reach the goal, try moving a lamp or a flake, or spreading it again.',
  'chemotaxis.suggest': 'Chemotaxis suggests site {n}.',
  'chemotaxis.thinking': 'Chemotaxis is searching…',
  'chemotaxis.full': 'No flakes left: chemotaxis will mark where the next one goes once you buy more.',

  'goal.title': 'Goal',
  'goal.line': '{text} · {state}',
  'goal.ok': 'met',
  'goal.missing': 'not yet',
  'goal.placed': 'Flakes on the plate: {placed} (goal: {target} or more)',
  'goal.joined': 'Flakes linked: {joined} of {total}',
  'goal.quality': 'Network quality: {value} (goal: {target} or more)',
  'goal.shortest': 'Length: {value} times the shortest path (goal: {target} or less)',
  'goal.cost': 'Cost: {value} times the minimum tree',
  'goal.tolerance': 'Cut tolerance: {value}',
  'goal.habituation.quinine': 'Quinine habituation: {value}',
  'goal.habituation.salt': 'Salt habituation of the plasmodium on the right: {value}',
  'goal.fused': 'The two plasmodia have fused',
  'goal.notFused': 'The two plasmodia are still apart',
  'goal.hold': 'Stability: {done} of {total}',
  'goal.hold.help':
    'Fills while everything is met, and drains slowly, not all at once, if something stops being met.',
  'goal.summary': 'Goal: {met} of {total} met',
  'goal.quality.help':
    'Quality combines what the plate measures: the shorter the network and the more cuts it survives, the better. It is (1 ÷ cost) × (0.5 + 0.5 × tolerance).',
  'goal.cost.help':
    'Cost compares the length of all living tubes with the minimum tree, the shortest network linking the flakes by going from one to another. It can drop below 1 if the network uses junctions in between, which the plasmodium is good at.',
  'goal.tolerance.help':
    'If one tube is cut at random, are all flakes still linked? Tolerance is the share of cuts the network survives. Rail networks aim for the same thing.',
  'goal.met': 'The plasmodium meets the goal.',
  'goal.lost': 'The network no longer meets the goal.',
  linger: 'The {name} plate prepares itself in {time}.',

  'atlas.title': 'Plates',
  'atlas.intro': 'Every mapped plate stays in culture and keeps leaving Trail.',
  'plate.status.current': 'in progress',
  'plate.status.done': 'mapped',
  'plate.status.available': 'to be mapped',
  'plate.status.locked': 'locked until the previous one is mapped',
  'plate.entry': '{name} · {status}',
  'plate.culture': 'In culture: +{value} Trail per second',
  'plate.best': 'Your map: {alive} tubes, cost {cost}, tolerance {tolerance}',
  'plate.prepare': 'Prepare the plate: {name}',
  'plate.replay': 'Return to this plate',
  'plate.replay.label': 'Return to the {name} plate',
  'plate.replay.desc':
    'Switching plates keeps your flakes and lamps; when you come back, the plasmodium spreads again.',
  'plate.reread': 'Read the plate again',
  'plate.reread.label': 'Read the {name} plate again',
  'achievements.line': 'Plasmodium achievements: {count} of {total}',
  'achievements.view': 'See in Achievements',

  'pupg.title': 'Plasmodium upgrades',
  'pupg.intro': 'Paid with Trail. Each level costs twice the previous one.',
  'pupg.buy': 'Buy: {name}',
  'pupg.level': 'level {level} of {max}',
  'pupg.maxed': 'Maxed',
  'pupg.cost': '{value} Trail',
  'pupg.wait': 'in {time}',
  'pupg.agar.name': 'Nutrient agar',
  'pupg.agar.desc': 'A richer culture medium. Each level multiplies Trail by 1.5.',
  'pupg.agar.effect': 'Trail ×{factor}.',
  'pupg.oats.name': 'Oats',
  'pupg.oats.desc':
    'In the lab it is fed oat flakes: it finds them, engulfs them and links them. One more flake per level on every plate except the Maze.',
  'pupg.oats.effect.one': '+{count} flake per plate.',
  'pupg.oats.effect.other': '+{count} flakes per plate.',
  'pupg.lamps.name': 'Lamp',
  'pupg.lamps.desc':
    'The plasmodium shuns light: under a lamp its tubes dry sooner. One more lamp per level.',
  'pupg.lamps.effect.one': '+{count} lamp per plate.',
  'pupg.lamps.effect.other': '+{count} lamps per plate.',
  'pupg.humidity.name': 'Humidity',
  'pupg.humidity.desc':
    'Without moisture it slows down, and if it dries out completely it hardens. Each level makes it adapt 50% faster.',
  'pupg.humidity.effect': 'The network adapts {factor} times as fast.',
  'pupg.dormancy.name': 'Dormancy',
  'pupg.dormancy.desc':
    'When it dries, the plasmodium forms a sclerotium, a hard crust that can revive with water long afterward. While you are away, it works better and longer.',
  'pupg.dormancy.effect': 'While you are away, the plasmodium works at {percent} for up to {time}.',
  'pupg.chemotaxis.name': 'Chemotaxis',
  'pupg.chemotaxis.desc':
    'It grows toward whatever smells like food. The plate marks the site where one more flake would help most.',
  'pupg.chemotaxis.effect': 'The suggested site is marked.',
  'pupg.memory.name': 'External memory',
  'pupg.memory.desc':
    'The plasmodium leaves a slime trail and tends to avoid returning where it already searched: a memory outside its body (Reid and colleagues, 2012). On the plate, tubes that carry nothing dry twice as fast, except those touching quinine or salt: the network prunes sooner and comes out cheaper, and also less tolerant.',
  'pupg.memory.effect': 'The network reorganizes sooner after a change.',

  'link.title': 'With your network',
  'link.intro':
    'The plasmodium and your network lend each other a hand. None of this changes how much either one produces.',
  'link.locked': 'Opens when you map: {name}.',
  'link.active': 'Active',
  'link.pruning.name': 'Pruning',
  'link.pruning.desc':
    'The plasmodium thickens the tubes that carry most and lets the rest dry. Your autobuy learns the same: it can buy whatever pays itself back first.',
  'link.shortPath.name': 'Short path',
  'link.shortPath.desc':
    'As in the maze, it counts what it takes to get there. In Sporulate you will see how many spores you earn per minute of run, and how many with the next one.',
  'link.rain.name': 'Rain on the plate',
  'link.rain.desc':
    'Every drop you catch in your forest, or that falls on its own, moistens the agar: for {time}, the plasmodium adapts twice as fast.',

  'chapter.kicker': 'Plate mapped · {n} of {total}',
  'chapter.map': 'Your map: {alive} tubes, cost {cost}, tolerance {tolerance}.',
  'chapter.unlock': 'From now on: {what}',
  'chapter.next': 'Next plate: {name}.',
  'chapter.stay': 'Keep watching',
  'chapter.toNext': 'See the next plate',
  'chapter.log.title': 'Fruiting',
  'chapter.log.line1':
    'When food runs out and light reaches it, the plasmodium stops searching and fruits: it raises sporangia, tiny heads on thin stalks, full of spores.',
  'chapter.log.line2':
    'That is why it was taken for a fungus. Today it is placed among the Amoebozoa, closer to amoebas than to mushrooms.',
  'chapter.log.unlock':
    "Pruning comes to your network's autobuy, and three plasmodium upgrades appear: Lamp, Humidity and Dormancy.",
  'chapter.maze.title': 'The shortest path',
  'chapter.maze.line1':
    'In an experiment by Nakagaki and colleagues (2000), a plasmodium filled an entire maze. With oats at the entrance and the exit, within hours it pulled its tubes out of the dead ends and kept a single one along the shortest path.',
  'chapter.maze.line2':
    'It needs no brain: tubes that carry more grow thicker and the rest dry out. A model with that single rule reproduces what it did.',
  'chapter.maze.unlock': 'Short path comes to Sporulate, and flow, Chemotaxis and External memory appear.',
  'chapter.archipelago.title': 'Like the trains',
  'chapter.archipelago.line1':
    'Tero and colleagues (2010) placed oat flakes where the cities around Tokyo would be and used light to mark mountains and coastline, which the plasmodium avoids.',
  'chapter.archipelago.line2':
    "The network it drew resembled the region's rail network in cost, efficiency and fault tolerance. In the same paper they turned it into equations for designing networks: the ones that run these plates.",
  'chapter.bitterBridge.title': 'No longer bitter',
  'chapter.bitterBridge.line1':
    'Boisseau, Vogel and Dussutour (2016) placed a bridge laced with quinine or caffeine between the plasmodium and its food. At first it was slow to cross; after several days of crossing, it stopped caring.',
  'chapter.bitterBridge.line2':
    'That is habituation, a simple form of learning, in an organism without neurons. After a couple of days without the substance, it avoided it again.',
  'chapter.fusion.title': 'A single cell',
  'chapter.fusion.line1':
    'Vogel and Dussutour (2016) fused plasmodia habituated to salt with others that had never met it. The fused cell did not avoid salt either: what one had learned passed to the other once a vein formed between them.',
  'chapter.fusion.line2': 'Two individuals became one, without losing what one of them knew.',
  'chapter.fusion.end':
    'There are no new plates left in this version of Micelio. You can return to any of them to improve your map.',

  'notice.fruited': 'Plate mapped: {name}.',
  'notice.mapImproved': 'Your {name} map improved.',
  'notice.plateOpened': 'Plate prepared: {name}.',
  'notice.upgrade': 'Plasmodium: {name}, level {level}',
  'notice.achievement': 'Plasmodium achievement: {name}',
  'notice.caughtUp': 'While you were away, the plasmodium left {value} Trail.',
  'notice.respread': 'The plasmodium covers the whole plate again.',
  'notice.reset': "The plate's network was reset after a calculation error. Everything else is unchanged.",
};
