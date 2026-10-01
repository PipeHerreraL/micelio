/**
 * Entrada del trozo «runtime» del plasmodio: el modelo que avanza su estado. Llega aparte con
 * import() (src/partners/registry.ts); Node y Vitest lo importan directamente y lo registran con
 * registerPartnerRuntime. Puro: sin DOM ni reloj.
 */
import type { PartnerRuntime } from '../types.ts';
import { advancePlasmodium } from './advance.ts';

export const plasmodiumRuntime: PartnerRuntime = {
  id: 'plasmodium',
  advance: advancePlasmodium,
  // Los avisos llegan con el catálogo de textos del socio (src/i18n/partners/).
  notice: () => null,
};
