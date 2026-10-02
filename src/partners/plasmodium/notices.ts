/**
 * Avisos de los eventos del plasmodio (va en el trozo que llega aparte, con su catálogo de
 * textos). main.ts los convierte en avisos flotantes, anuncios y sonidos. Sin catálogo todavía
 * (no debería pasar: se conserva el anterior al cambiar de idioma) no hay aviso.
 */
import { formatDuration } from '../../i18n/format.ts';
import { fmt, getLocale, t, type MessageKey } from '../../i18n/index.ts';
import { partnerText } from '../../i18n/partners/index.ts';
import { PLATES } from '../../data/plasmodium-plates.ts';
import type { PartnerNotice } from '../types.ts';
import type { PlasmodiumEvent } from './events.ts';

const pt = (key: string, params?: Record<string, string | number>): string =>
  partnerText('plasmodium', key, params);

export function plateName(index: number): string {
  const def = PLATES[index];
  return def ? pt(`plate.${def.id}.name`) : '';
}

function quiet(text: string): PartnerNotice | null {
  return text ? { text, title: null, tone: null, cue: null, announce: true } : null;
}

export function plasmodiumNotice(event: PlasmodiumEvent): PartnerNotice | null {
  switch (event.kind) {
    case 'goal':
      // Solo anuncio: el panel ya lo dice con texto y no hace falta un aviso flotante.
      return quiet(pt(event.met ? 'goal.met' : 'goal.lost'));
    case 'fruited': {
      const text = pt('notice.fruited', { name: plateName(event.plate) });
      return text ? { text, title: null, tone: 'spore', cue: 'chord', announce: true } : null;
    }
    case 'mapImproved': {
      const text = pt('notice.mapImproved', { name: plateName(event.plate) });
      return text ? { text, title: null, tone: 'info', cue: null, announce: true } : null;
    }
    case 'plateOpened': {
      // Abrirla a mano no necesita aviso: el jugador lo acaba de hacer.
      if (!event.auto) return null;
      const text = pt('notice.plateOpened', { name: plateName(event.plate) });
      return text ? { text, title: null, tone: 'info', cue: null, announce: true } : null;
    }
    case 'achievement': {
      const name = t(`pach.${event.id}.name` as MessageKey);
      const title = pt('notice.achievement', { name });
      return title
        ? {
            text: t(`pach.${event.id}.desc` as MessageKey),
            title,
            tone: 'achievement',
            cue: 'chord',
            announce: true,
          }
        : null;
    }
    case 'caughtUp': {
      if (!(event.gained > 0)) return null;
      const text = pt('notice.caughtUp', { value: fmt(event.gained) });
      return text ? { text, title: null, tone: 'info', cue: null, announce: true } : null;
    }
    case 'reset': {
      const text = pt('notice.reset');
      return text ? { text, title: null, tone: 'info', cue: null, announce: true } : null;
    }
    case 'pulse':
      return null;
  }
}

/** Duración en el idioma activo (para los marcadores {time} y {hold} de los textos). */
export function duration(seconds: number): string {
  return formatDuration(seconds, getLocale());
}
