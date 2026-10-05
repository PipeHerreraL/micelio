/**
 * Textos de los biomas (docs/ROADMAP.md, fase 8): nombres, reglas y efectos de las adaptaciones
 * de bioma, con las cifras sacadas de los datos. Las reglas «la mitad», «el doble» y «un tercio»
 * están escritas a mano; tests/journey.test.ts falla si los datos cambian sin el texto.
 */
import type { GameState } from '../core/state.ts';
import { getBiome, getBiomeAdaptation, type BiomeAdaptationId, type BiomeId } from '../data/biomes.ts';
import type { GeneratorId } from '../data/generators.ts';
import { formatDuration, formatFactor } from '../i18n/format.ts';
import { formatCount, getLocale, hasMessage, t, tp, type MessageKey, type PluralKey } from '../i18n/index.ts';

export function biomeName(id: BiomeId): string {
  return t(`biome.${id}.name` as MessageKey);
}

export function biomeSoil(id: BiomeId): string {
  return t(`biome.${id}.soil` as MessageKey);
}

/** Reglas del bioma en el idioma activo; el natal no tiene reglas propias. */
export function biomeRules(id: BiomeId): string[] {
  const def = getBiome(id);
  switch (id) {
    case 'natal':
      return [];
    case 'taiga':
      return [
        t('biome.taiga.rule.trees', { factor: formatFactor(def.production.mycorrhiza ?? 1, getLocale()) }),
        t('biome.taiga.rule.rain'),
      ];
    case 'choco':
      return [
        t('biome.choco.rule.rain'),
        t('biome.choco.rule.fall'),
        t('biome.choco.rule.dew', { time: formatDuration(def.dewFloorSeconds, getLocale()) }),
        t('biome.choco.rule.storm'),
      ];
    case 'prairie':
      return [
        t('biome.prairie.rule.ring', { factor: formatFactor(def.production.fairyRing ?? 1, getLocale()) }),
        t('biome.prairie.rule.rain'),
      ];
    case 'tundra':
      return [
        t('biome.tundra.rule.half', { factor: formatFactor(def.productionFactor, getLocale()) }),
        t('biome.tundra.rule.rain'),
        t('biome.tundra.rule.away', { hours: formatCount(def.offlineHours) }),
        t('biome.tundra.rule.thaw', { hours: formatCount(def.thawAfterHours ?? 0) }),
      ];
  }
}

/** Etiqueta del factor del bioma actual para un generador («×5 en la taiga»), o null. */
export function biomeTag(state: GameState, id: GeneratorId): string | null {
  const biome = state.forest.biome;
  const factor = getBiome(biome).production[id];
  const key = `biome.${biome}.tag`;
  if (factor === undefined || factor === 1 || !hasMessage(key)) return null;
  return t(key, { factor: formatFactor(factor, getLocale()) });
}

/**
 * Texto con sustitución por bioma: `${key}.${bioma}` si existe. En la selva baja no hay abetos
 * ni otoño, así que el Chocó cambia seis textos (ARCHITECTURE.md §4.28); el resto es el mismo.
 */
export function biomeText(state: GameState, key: MessageKey): string {
  const local = `${key}.${state.forest.biome}`;
  return t(hasMessage(local) ? local : key);
}

export function biomeAdaptationName(id: BiomeAdaptationId): string {
  return t(`badapt.${id}.name` as MessageKey);
}

/** Descripción con la cifra por rango sacada de los datos. */
export function biomeAdaptationDesc(id: BiomeAdaptationId): string {
  const effect = getBiomeAdaptation(id).effect;
  const locale = getLocale();
  switch (effect.kind) {
    case 'generators':
    case 'dew':
      return t(`badapt.${id}.desc` as MessageKey, { factor: formatFactor(effect.perRank, locale) });
    case 'startUnits':
      return t(`badapt.${id}.desc` as MessageKey, { count: formatCount(effect.perRank) });
    case 'downpourSeconds':
      return t(`badapt.${id}.desc` as MessageKey, { time: formatDuration(effect.perRank, locale) });
    case 'offlineHours':
      return t(`badapt.${id}.desc` as MessageKey, { time: formatDuration(effect.perRank * 3600, locale) });
    case 'autoClicks':
      return t(`badapt.${id}.desc` as MessageKey);
  }
}

/** Efecto con el rango actual, o «Aún sin rangos». */
export function biomeAdaptationEffect(state: GameState, id: BiomeAdaptationId): string {
  const rank = state.biomeAdaptations[id];
  if (rank === 0) return t('adapt.none');
  const effect = getBiomeAdaptation(id).effect;
  const locale = getLocale();
  switch (effect.kind) {
    case 'generators':
    case 'dew':
      return t(`badapt.${id}.effect` as MessageKey, { factor: formatFactor(effect.perRank ** rank, locale) });
    case 'startUnits':
      return t(`badapt.${id}.effect` as MessageKey, { count: formatCount(effect.perRank * rank) });
    case 'downpourSeconds':
      return t(`badapt.${id}.effect` as MessageKey, { time: formatDuration(effect.perRank * rank, locale) });
    case 'offlineHours':
      return t(`badapt.${id}.effect` as MessageKey, {
        time: formatDuration(effect.perRank * rank * 3600, locale),
      });
    case 'autoClicks':
      return tp(`badapt.${id}.effect` as PluralKey, effect.perRank * rank);
  }
}
