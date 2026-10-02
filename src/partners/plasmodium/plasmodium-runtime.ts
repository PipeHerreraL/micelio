/**
 * Entrada del trozo «runtime» del plasmodio: el modelo que avanza su estado y redacta sus avisos.
 * Llega aparte con import() (src/ui/partner-loader.ts); Node y Vitest lo importan directamente y
 * lo registran con registerPartnerRuntime. Sin DOM ni reloj.
 */
import type { PartnerRuntime } from '../types.ts';
import { advancePlasmodium } from './advance.ts';
import { plasmodiumNotice } from './notices.ts';

export const plasmodiumRuntime: PartnerRuntime = {
  id: 'plasmodium',
  advance: advancePlasmodium,
  notice: plasmodiumNotice,
};
