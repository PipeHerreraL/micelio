/** Noticias de los biomas en inglés: las mismas claves que news/biomes/es.ts (lo impone el tipo). */
import type { BiomeNewsKey } from './es.ts';

export const biomeNewsEn: Readonly<Record<BiomeNewsKey, string>> = {
  // Versiones de noticias del sotobosque en un destino, donde el texto del natal sería falso: en el
  // Chocó no hay coníferas (ARCHITECTURE.md §4.28) y en la pradera y la tundra no hay bosque.
  'motherTree.choco':
    'An emergent tree has visitors. Some believe it feeds the young trees in its shade; science is still debating it.',
  'motherTree.prairie':
    'A lone oak in the middle of the grass receives visitors. Some believe old trees feed their seedlings; scientists are still debating it.',
  'motherTree.tundra':
    'A dwarf birch receives visitors. Some believe old trees feed their seedlings; scientists are still debating it.',
  'pineCone.choco': 'A palm fruit lands on the network. The network adds it to its plans.',
  'pineCone.prairie': 'An acorn lands on the network. The network adds it to its plans.',
  'pineCone.tundra': 'A bilberry lands on the network. The network adds it to its plans.',
  'firstRain.prairie': 'Rain at last. The whole prairie smells of promise.',
  'firstRain.tundra': 'Rain at last. The whole tundra smells of promise.',
  // Taiga y Chocó (fase 8)
  'taiga.arrival': "Unfamiliar spores land in the taiga. The spruces don't ask where from.",
  'taiga.podzol':
    'Podzol comes from the Russian for “under the ash.” Nothing burned: the gray comes from water washing the soil for centuries.',
  'taiga.circumpolar':
    'The taiga rings the planet across the north: Scandinavia, Russia, Alaska and Canada. The network has started in one corner.',
  'taiga.ecto':
    'Spruce, pine, larch and birch: almost every tree in the taiga lives with ectomycorrhizal fungi. Nobody grows alone here.',
  'taiga.carbon':
    "A study on boreal islands in Sweden estimated that 50 to 70% of the soil's carbon came from roots and their fungi. The network keeps more than it shows.",
  'taiga.rockEating':
    "In the podzol's gray horizon, feldspar grains are riddled with tiny tunnels. Hyphae hunting for minerals are thought to bore them; geologists call it weathering, and the network calls it lunch.",
  'taiga.amanita':
    "Amanita muscaria, the red cap with white spots, partners with birches and spruces. Fairy-tale fame doesn't make it edible: it's toxic.",
  'taiga.snowMold':
    'Under the snow, close to freezing, some snow molds keep growing, helped among other things by antifreeze proteins. Not everyone hibernates.',
  'taiga.morels':
    'After a fire in the boreal forest, morels can come up by the hundreds. No forest ranger recommends the method.',
  'taiga.lichen':
    'Reindeer lichen grows a few millimeters a year. A reindeer eats decades of it in an afternoon, and the lichen holds no grudge.',
  'taiga.chaga':
    'Chaga grows on northern birches and looks like a lump of burnt charcoal. The birch disagrees with the description.',
  'taiga.permafrost':
    'In parts of Siberia, the taiga grows on ground that stays frozen all year. Roots live in the top layer, the only one that thaws in summer.',
  'choco.arrival': 'Spores reach the Chocó rainforest. Here nobody asks whether it will rain, only when.',
  'choco.forecast': 'Forecast for the Chocó today: rain. Tomorrow: same.',
  'choco.lloro':
    'In Lloró, in the Chocó, an estimated 13,000 mm of rain falls each year. It disputes the world record with a village in India.',
  'choco.endemic':
    'From the Darién in Panama to northwestern Ecuador, the biogeographic Chocó holds thousands of species found nowhere else. Almost nobody has counted the fungi.',
  'choco.leafcutter':
    "Leafcutter ants don't eat leaves: they chew them up to grow a fungus, and they eat the fungus. Farming on six legs.",
  'choco.farmers':
    "Genetic estimates suggest ants have been farming fungi for some 55 to 60 million years; humans, for about twelve thousand. The ants don't brag.",
  'choco.arbuscular':
    'Most rainforest trees live with arbuscular mycorrhizae. Fossils suggest the partnership is over 400 million years old: older than trees themselves.',
  'choco.litter':
    'In the rainforest a fallen leaf can vanish in a few months; in the taiga it takes years. Leaf litter here has no time to pile up.',
  'choco.rootMat':
    'On poor tropical soils, a mat of roots and fungi catches nutrients before the rain washes them away. In an Amazon experiment it held on to more than 99.9%.',
  'choco.splash':
    "Bird's nest fungi use every raindrop as a catapult: the impact flings their spore packets out of the cup. In the Chocó they never run out of ammunition.",
  'choco.plastic':
    'A fungus from the Ecuadorian Amazon, Pestalotiopsis microspora, can grow on polyurethane in the lab. The network still prefers leaves.',
  'choco.glow':
    'Some tropical mushrooms glow green at night. In one Brazilian species the light was found to attract insects, which may help spread its spores.',
  // Pradera y tundra (fase 10)
  'prairie.arrival': 'Spores reach the prairie. The grass sways and asks no questions.',
  'prairie.chernozem':
    'Chernozem is Russian for “black earth.” In Ukraine, that black layer can run a meter and a half deep.',
  'prairie.belfort':
    'Near Belfort, in France, a fairy ring of Infundibulicybe geotropa measures about 600 meters across. It is thought to be over 700 years old.',
  'prairie.rings':
    'A fairy ring has two edges: a greener one, fed by what the fungus breaks down, and a dry one, where the hyphae are so dense that the soil stops letting water in.',
  'prairie.bluestem':
    'Big bluestem, one of the tall grasses of the North American prairie, barely grows without its arbuscular mycorrhizal fungi. Even the grass has partners.',
  'prairie.glomalin':
    'For years glomalin, a protein from mycorrhizal fungi, was called the glue of the soil. Measuring it pulled out other substances too, and nobody knows how much it glues on its own.',
  'prairie.roots':
    'Some prairie plants send their roots down more than three meters; the compass plant, as far as four and a half. A drought has to dig deep to find them.',
  'prairie.pilobolus':
    "Cows don't graze next to their own dung. Pilobolus solves that by firing its spores onto clean grass: a cow eats them, they pass through its gut intact and sprout in the next cowpat.",
  'prairie.pseudomycelium':
    "White threads that look like hyphae run through the prairie subsoil. They're calcium carbonate, and soil scientists call them pseudomycelium. The network doesn't take it personally.",
  'prairie.marasmius':
    'The fairy ring champignon, Marasmius oreades, dries out in the sun and, when the rain comes back, revives and goes on releasing spores. A sugar, trehalose, protects it.',
  'prairie.lungworm':
    'The larvae of a cattle lungworm climb onto Pilobolus and get fired off with its spore sac onto the grass. Stowing away has its perks.',
  'prairie.waxcaps':
    "Waxcaps, smooth mushrooms the colors of wax, thrive in old grasslands that nobody plows or fertilizes. Fertilizer drives them off: that's how they tell which pastures have been left in peace.",
  'tundra.arrival': "Spores reach the tundra. Nobody's in a hurry here, least of all the soil.",
  'tundra.word':
    'The word tundra came through Russian, which took it from Kildin Sámi, on the Kola Peninsula, where it names treeless uplands.',
  'tundra.polarDesert':
    'Much of the Arctic tundra gets 150 to 250 mm of precipitation a year, like a desert. Even so, the ground turns soggy in summer: the ice below keeps the water from draining.',
  'tundra.species':
    'About 4,350 species of fungi are known from the Arctic, and 1,750 of them form lichens. Quite a crowd for a cold desert.',
  'tundra.carbon':
    'The frozen ground of the north holds about twice as much carbon as the atmosphere does today (Schuur and colleagues, 2015). As long as it stays frozen, it stays put.',
  'tundra.xanthoria':
    'After 18 months outside the space station, 84% of the fungus in the lichen Xanthoria elegans was still alive, and 71% of the alga (Brandt and colleagues, 2015). The fungus held out longer.',
  'tundra.dwarfWillow':
    'The dwarf willow, Salix herbacea, stands one to six centimeters tall. It is one of the smallest woody plants in the world, and still a willow.',
  'tundra.reindeer':
    'In late summer, reindeer and caribou go looking for mushrooms: when there are some, they can make up a tenth to a quarter of what they eat.',
  'tundra.typhula':
    'Typhula, a snow mold, needs two or three months of snow on top before it attacks the grass. Golf courses in the north know it well.',
  'tundra.silene':
    'A Silene stenophylla flowered in a Russian lab, regrown from fruits some 32,000 years old that a squirrel had stashed in its burrow, under the permafrost (Yashina and colleagues, 2012).',
  'tundra.lichenometry':
    'The map lichen, Rhizocarpon geographicum, grows less than a millimeter a year. Measuring its patches tells when a glacier left a rock out in the open.',
  'tundra.pingo':
    'Pingo means “conical hill” in Inuvialuktun: a hill with a heart of ice. Around Tuktoyaktuk, in Canada, there are some 1,350; Ibyuk, nearly 50 meters tall, still grows a few centimeters a year.',
  // Del viento, tras la primera dispersión
  'wind.rust':
    'Wheat rust spores have been documented crossing on the wind from Australia to New Zealand: some two thousand kilometers, no luggage.',
  'wind.buller':
    "Many mushrooms launch each spore with a droplet that merges in microseconds: Buller's drop. Liftoff reaches thousands of times the force of gravity.",
  'wind.altitude':
    'Fungal spores have been collected kilometers up in the atmosphere. The wind carries passengers no map shows.',
  postcard: 'The home forest gets a postcard: "All well here. Lots of rain. Will write through the network."',
  'return.mycorrhizal':
    'Seven in ten plant species live with arbuscular mycorrhizal fungi, and only 8% have no mycorrhiza of any kind (Brundrett and Tedersoo, 2018).',
  'return.rhynie':
    'In the Rhynie chert, in Scotland, a plant from about 400 million years ago holds arbuscules inside its cells: mycorrhiza is almost as old as plants on land (Remy and colleagues, 1994).',
  'return.sporeAir':
    'Fungi release some 50 million tonnes of spores into the air every year (Elbert and colleagues, 2007). Your lineage came home in a few of them.',
  'return.sugarcaneRust':
    'In 1978 sugarcane rust appeared in the Dominican Republic. Its spores probably crossed the Atlantic from Cameroon on the wind, in about nine days (Purdy and colleagues, 1985).',
  'return.oldGrowth':
    'A forest takes centuries to grow old again: Douglas-fir forests need about 175–250 years to have huge trees, standing dead trunks and fallen wood (Franklin and Spies, 1991).',
  'return.sporeBank':
    'In California, Rhizopogon spores are buried in a 99-year experiment. In the first four years they lost none of their strength: more and more woke up beside the roots of a pine (Bruns and colleagues, 2009).',
  // En la taiga y la pradera llueve la mitad; en la tundra, un tercio.
  'postcard.taiga':
    'The home forest gets a postcard: "All well here. Cold, not much rain. Will write through the network."',
  'postcard.prairie':
    'The home forest gets a postcard: "All well here. Lots of grass, not much rain. Will write through the network."',
  'postcard.tundra':
    'The home forest gets a postcard: "All well here. Cold, snow and hardly any rain. Will write through the network."',
};
