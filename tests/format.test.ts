import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import {
  formatDate,
  formatDay,
  formatDuration,
  formatExact,
  formatFactor,
  formatInteger,
  formatNumber,
  formatPercent,
  formatScientific,
  suffixFor,
} from '../src/i18n/format.ts';
import {
  detectLocale,
  fmt,
  getLocale,
  interpolate,
  numberTooltip,
  pseudoCatalog,
  pseudoize,
  setLocale,
  setNotation,
  tp,
  type Catalog,
} from '../src/i18n/index.ts';

// Entre la cifra y el nombre va un espacio de no separación: «1 M» nunca se parte en dos líneas.
const NBSP = ' ';

/**
 * Los separadores que pone Intl (unidades, porcentaje) dependen de los datos de ICU de cada
 * versión: unas usan espacio normal y otras de no separación. Para esas pruebas se igualan.
 */
function plainSpaces(text: string): string {
  return text.replace(/\s/gu, ' ');
}

/** Marcadores de una plantilla, en orden: «Hola {name}» → ['{name}']. */
function placeholders(text: string): string[] {
  return text.match(/\{\w+\}/g) ?? [];
}

// index.ts guarda idioma y notación en el módulo: cada prueba deja los valores de partida.
afterEach(() => {
  setLocale('es');
  setNotation('names');
});

describe('formatNumber: valores pequeños', () => {
  it('el cero se escribe sin decimales', () => {
    expect(formatNumber(0, 'en')).toBe('0');
  });

  it('por debajo de 1 se muestran hasta dos decimales', () => {
    expect(formatNumber(0.1, 'en')).toBe('0.1');
    // 0.005 con dos decimales: Math.round(0.5) / 100 = 0.01
    expect(formatNumber(0.005, 'en')).toBe('0.01');
  });

  it('entre 1 y 100 se muestra un decimal', () => {
    // 12.34 con un decimal: 12.3
    expect(formatNumber(12.34, 'en')).toBe('12.3');
    expect(formatNumber(12.34, 'es')).toBe('12,3');
  });

  it('un valor que redondea a 100 pierde el decimal en vez de mostrar «100.0»', () => {
    // 99.96 con un decimal es 100.0; los ceros finales no se muestran
    expect(formatNumber(99.96, 'en')).toBe('100');
  });

  it('desde 100 se muestran enteros', () => {
    // 1234.5 → 1235 (redondeo hacia arriba en .5)
    expect(formatNumber(1234.5, 'en')).toBe('1,235');
  });

  it('999 999 se muestra completo, con separadores de miles del idioma', () => {
    expect(formatNumber(999999, 'en')).toBe('999,999');
    expect(formatNumber(999999, 'es')).toBe('999.999');
  });

  it('999 999.4 sigue mostrándose completo porque redondea a 999 999', () => {
    expect(formatNumber(999999.4, 'en')).toBe('999,999');
  });

  it('los negativos llevan el signo menos tipográfico (U+2212)', () => {
    expect(formatNumber(-12.34, 'en')).toBe('−12.3');
  });
});

describe('formatNumber: nombres desde 1e6 (estilo idle, notación por defecto)', () => {
  // Misma regla que index.ts: singular solo para la mantisa 1.
  const nameEs = (suffix: string, mantissa: number): string => {
    const one: Record<string, string> = { M: 'millón', T: 'billón' };
    const other: Record<string, string> = { M: 'millones', B: 'mil millones', T: 'billones' };
    return (mantissa === 1 ? one[suffix] : undefined) ?? other[suffix] ?? suffix;
  };

  it('999 999.6 redondea a un millón y ya se escribe con nombre', () => {
    expect(formatNumber(999999.6, 'es', 'names', nameEs)).toBe(`1${NBSP}millón`);
  });

  it('sin ceros de relleno: 1.5e6 es «1,5 millones» y 2e9 «2 mil millones»', () => {
    expect(formatNumber(1.5e6, 'es', 'names', nameEs)).toBe(`1,5${NBSP}millones`);
    expect(formatNumber(2e9, 'es', 'names', nameEs)).toBe(`2${NBSP}mil${NBSP}millones`);
  });

  it('la mantisa conserva hasta tres cifras significativas: 1,23 / 12,3 / 123', () => {
    expect(formatNumber(1.234e6, 'es', 'names', nameEs)).toBe(`1,23${NBSP}millones`);
    expect(formatNumber(12.34e6, 'es', 'names', nameEs)).toBe(`12,3${NBSP}millones`);
    expect(formatNumber(123.4e6, 'es', 'names', nameEs)).toBe(`123${NBSP}millones`);
  });

  it('sin función de nombres, la notación de nombres cae en los sufijos cortos', () => {
    expect(formatNumber(1.5e9, 'en', 'names')).toBe(`1.5${NBSP}B`);
  });
});

describe('formatNumber: sufijos cortos', () => {
  it('un millón exacto se escribe «1 M», sin ceros de relleno', () => {
    expect(formatNumber(1e6, 'en', 'suffix')).toBe(`1${NBSP}M`);
    expect(formatNumber(999999.6, 'en', 'suffix')).toBe(`1${NBSP}M`);
  });

  it('la mantisa conserva tres cifras significativas: 1.23 B, 12.3 M y 123 M', () => {
    // 1.234e9 / 1e9 = 1.234 → 1.23; 12.34e6 / 1e6 = 12.34 → 12.3; 123.4e6 → 123
    expect(formatNumber(1.234e9, 'en', 'suffix')).toBe(`1.23${NBSP}B`);
    expect(formatNumber(12.34e6, 'en', 'suffix')).toBe(`12.3${NBSP}M`);
    expect(formatNumber(123.4e6, 'en', 'suffix')).toBe(`123${NBSP}M`);
  });

  it('999.996 M redondea hacia arriba y pasa al sufijo siguiente: 1 B', () => {
    expect(formatNumber(999.996e6, 'en', 'suffix')).toBe(`1${NBSP}B`);
  });

  it('cada potencia de mil desde 1e6 hasta 1e63 lleva su sufijo', () => {
    const expected = [
      'M',
      'B',
      'T',
      'Qa',
      'Qi',
      'Sx',
      'Sp',
      'Oc',
      'No',
      'Dc',
      'Ud',
      'Dd',
      'Td',
      'Qad',
      'Qid',
      'Sxd',
      'Spd',
      'Ocd',
      'Nod',
      'Vg',
    ];
    expected.forEach((suffix, i) => {
      expect(formatNumber(10 ** (6 + 3 * i), 'en', 'suffix')).toBe(`1${NBSP}${suffix}`);
    });
  });

  it('en español la mantisa usa coma decimal: «1,23 M»', () => {
    expect(formatNumber(1.234e6, 'es', 'suffix')).toBe(`1,23${NBSP}M`);
  });

  it('un negativo grande lleva el signo delante de la mantisa', () => {
    expect(formatNumber(-1.5e6, 'en', 'suffix')).toBe(`−1.5${NBSP}M`);
  });
});

describe('formatNumber: científica desde 1e66', () => {
  it('9.999e65 redondea a 1e66 y, al no quedar nombres, se escribe en científica', () => {
    expect(formatNumber(9.999e65, 'en', 'suffix')).toBe('1e66');
  });

  it('1.23e70 se escribe en científica en cualquier notación', () => {
    expect(formatNumber(1.234e70, 'en', 'suffix')).toBe('1.23e70');
    expect(formatNumber(1.234e70, 'en', 'names')).toBe('1.23e70');
    expect(formatNumber(1.234e70, 'en', 'engineering')).toBe('1.23e70');
  });

  it('la científica en español usa coma decimal', () => {
    expect(formatNumber(1.234e70, 'es', 'suffix')).toBe('1,23e70');
  });
});

describe('formatNumber: notaciones científica e ingeniería', () => {
  it('en científica 1.5e6 se escribe «1.5e6»', () => {
    expect(formatNumber(1.5e6, 'en', 'scientific')).toBe('1.5e6');
  });

  it('la científica corrige el redondeo a 10: 9.996e6 pasa a 1e7', () => {
    expect(formatNumber(9.996e6, 'en', 'scientific')).toBe('1e7');
  });

  it('en ingeniería 1.5e7 se escribe «15e6» (exponente múltiplo de 3)', () => {
    expect(formatNumber(1.5e7, 'en', 'engineering')).toBe('15e6');
  });

  it('en ingeniería 999.6e6 pasa a 1e9 en vez de mostrar «1000e6»', () => {
    expect(formatNumber(999.6e6, 'en', 'engineering')).toBe('1e9');
  });

  it('la notación elegida no afecta a valores por debajo de 1e6', () => {
    expect(formatNumber(12345, 'en', 'scientific')).toBe('12,345');
    expect(formatNumber(12345, 'en', 'engineering')).toBe('12,345');
  });
});

describe('formatNumber: valores no finitos', () => {
  it('NaN se muestra como una raya', () => {
    expect(formatNumber(Number.NaN, 'en')).toBe('—');
  });

  it('infinito se muestra con su símbolo y su signo', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY, 'en')).toBe('∞');
    expect(formatNumber(Number.NEGATIVE_INFINITY, 'en')).toBe('−∞');
  });
});

describe('suffixFor', () => {
  it('devuelve el sufijo de la escala del valor', () => {
    expect(suffixFor(1e6)).toBe('M');
    expect(suffixFor(1.234e9)).toBe('B');
    expect(suffixFor(1e33)).toBe('Dc');
    expect(suffixFor(1e63)).toBe('Vg');
  });

  it('no hay sufijo por debajo de 1e6 ni desde 1e66', () => {
    expect(suffixFor(999999)).toBeNull();
    expect(suffixFor(1e66)).toBeNull();
    expect(suffixFor(9.999e65)).toBeNull();
    expect(suffixFor(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('999.996 M lleva el sufijo B, el mismo que muestra el formato', () => {
    expect(suffixFor(999.996e6)).toBe('B');
  });

  // BUG-JOURNAL #1: formatNumber escribe 999 999.6 como «1 M», y suffixFor lo descartaba
  // antes de redondear, así que ese «1 M» se quedaba sin tooltip.
  it('el sufijo de 999 999.6 coincide con el «M» que muestra el formato', () => {
    expect(suffixFor(999999.6)).toBe('M');
  });
});

describe('formatScientific y formatExact', () => {
  it('da la notación científica con el separador del idioma', () => {
    expect(formatScientific(1.5e9, 'es')).toBe('1,5e9');
    expect(formatScientific(1.5e9, 'en')).toBe('1.5e9');
  });

  it('los negativos llevan el signo menos tipográfico', () => {
    expect(formatScientific(-2.5e7, 'en')).toBe('−2.5e7');
  });

  it('la cifra exacta se escribe entera con separadores hasta 1e21', () => {
    expect(formatExact(1234567890, 'en')).toBe('1,234,567,890');
    expect(formatExact(1234567890, 'es')).toBe('1.234.567.890');
    expect(formatExact(2.5e21, 'en')).toBe('2.5e21');
  });
});

describe('formatInteger', () => {
  it('trunca hacia abajo y agrupa los miles según el idioma', () => {
    // 1 234 567.9 → 1 234 567
    expect(formatInteger(1234567.9, 'en')).toBe('1,234,567');
    expect(formatInteger(1234567.9, 'es')).toBe('1.234.567');
  });
});

describe('formatPercent', () => {
  it('0.125 es 12.5 % con el separador decimal del idioma', () => {
    // 0.125 × 100 = 12.5
    expect(formatPercent(0.125, 'en')).toBe('12.5%');
    expect(plainSpaces(formatPercent(0.125, 'es'))).toBe('12,5 %');
  });

  it('respeta el máximo de decimales pedido', () => {
    // 0.12344 × 100 = 12.344 → con dos decimales 12.34
    expect(formatPercent(0.12344, 'en', 2)).toBe('12.34%');
    // 0.2 × 100 = 20, sin decimales
    expect(formatPercent(0.2, 'en', 0)).toBe('20%');
  });

  it('la fracción entera es el cien por cien', () => {
    expect(formatPercent(1, 'en')).toBe('100%');
  });
});

describe('formatDuration', () => {
  it('80 segundos son «1 min 20 sec» en inglés y «1 min 20 s» en español', () => {
    // 80 = 1 × 60 + 20
    expect(plainSpaces(formatDuration(80, 'en'))).toBe('1 min 20 sec');
    expect(plainSpaces(formatDuration(80, 'es'))).toBe('1 min 20 s');
  });

  it('una hora exacta se escribe con una sola unidad', () => {
    // 3600 = 1 h y 0 min: la segunda unidad se omite por ser cero
    expect(plainSpaces(formatDuration(3600, 'es'))).toBe('1 h');
    expect(plainSpaces(formatDuration(3600, 'en'))).toBe('1 hr');
  });

  it('solo se muestran las dos unidades más grandes y contiguas', () => {
    // 3661 = 1 h 1 min 1 s → los segundos se descartan
    expect(plainSpaces(formatDuration(3661, 'es'))).toBe('1 h 1 min');
    // 90 061 = 86 400 + 3600 + 60 + 1 → 1 d 1 h
    expect(plainSpaces(formatDuration(90061, 'es'))).toBe('1 d 1 h');
  });

  it('menos de un segundo se muestra como un segundo, nunca como cero', () => {
    expect(plainSpaces(formatDuration(0.2, 'en'))).toBe('1 sec');
    expect(plainSpaces(formatDuration(0.2, 'es'))).toBe('1 s');
    expect(plainSpaces(formatDuration(0, 'es'))).toBe('1 s');
  });

  it('las fracciones de segundo redondean hacia arriba', () => {
    // 59.1 → 60 s = 1 min
    expect(plainSpaces(formatDuration(59.1, 'es'))).toBe('1 min');
  });

  it('una espera infinita se muestra con el símbolo de infinito', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY, 'es')).toBe('∞');
  });
});

describe('formatDate', () => {
  it('la fecha incluye el año en cualquier zona horaria', () => {
    // 15 de junio de 2026 a mediodía UTC: entre UTC−12 y UTC+14 sigue siendo 2026
    expect(formatDate(Date.UTC(2026, 5, 15, 12), 'es')).toContain('2026');
  });
});

describe('detectLocale', () => {
  it('el idioma guardado gana a los del navegador', () => {
    expect(detectLocale('en', ['es-ES'])).toBe('en');
    expect(detectLocale('es', ['en-US'])).toBe('es');
  });

  it('sin idioma guardado, toma el primero del navegador por prefijo', () => {
    // «en-GB» → en
    expect(detectLocale(null, ['en-GB', 'es'])).toBe('en');
    expect(detectLocale(null, ['pt-BR', 'es-MX', 'en'])).toBe('es');
  });

  it('el prefijo se compara sin distinguir mayúsculas', () => {
    expect(detectLocale(null, ['fr-FR', 'EN-us'])).toBe('en');
  });

  it('sin coincidencias, el idioma es español', () => {
    expect(detectLocale(null, ['fr', 'de'])).toBe('es');
    expect(detectLocale(null, [])).toBe('es');
  });
});

describe('interpolate', () => {
  it('sustituye los marcadores conocidos y deja intactos los desconocidos', () => {
    expect(interpolate('Hola {name}, {missing}', { name: 'Ana' })).toBe('Hola Ana, {missing}');
  });

  it('sin parámetros devuelve la plantilla tal cual', () => {
    expect(interpolate('x {y}')).toBe('x {y}');
  });

  it('un marcador repetido se sustituye todas las veces', () => {
    expect(interpolate('{a}{a}', { a: 3 })).toBe('33');
  });

  it('el valor cero se escribe, no se toma como ausente', () => {
    expect(interpolate('{n} esporas', { n: 0 })).toBe('0 esporas');
  });
});

describe('tp', () => {
  // Catálogo de prueba: así la elección de .one/.other no depende de la traducción real.
  function withPluralProbe(base: Catalog): Catalog {
    return { ...base, 'sporulate.gain.one': 'ONE:{count}', 'sporulate.gain.other': 'OTHER:{count}' };
  }

  it('en inglés, 1 elige .one y 2 elige .other', () => {
    setLocale('en', withPluralProbe(en));
    expect(getLocale()).toBe('en');
    expect(tp('sporulate.gain', 1)).toBe('ONE:1');
    expect(tp('sporulate.gain', 2)).toBe('OTHER:2');
  });

  it('en inglés, el cero va en plural', () => {
    setLocale('en', withPluralProbe(en));
    expect(tp('sporulate.gain', 0)).toBe('OTHER:0');
  });

  it('el recuento se formatea con los separadores del idioma activo', () => {
    setLocale('en', withPluralProbe(en));
    expect(tp('sporulate.gain', 12345)).toBe('OTHER:12,345');
    setLocale('es', withPluralProbe(es));
    expect(tp('sporulate.gain', 12345)).toBe('OTHER:12.345');
  });

  it('en español, la categoría «many» de un millón cae en .other', () => {
    setLocale('es', withPluralProbe(es));
    expect(tp('sporulate.gain', 1)).toBe('ONE:1');
    expect(tp('sporulate.gain', 1e6)).toBe('OTHER:1.000.000');
  });

  it('con el catálogo inglés real, 1 usa la plantilla .one y 2 la .other', () => {
    setLocale('en');
    expect(tp('sporulate.gain', 1)).toBe(en['sporulate.gain.one'].replace('{count}', '1'));
    expect(tp('sporulate.gain', 2)).toBe(en['sporulate.gain.other'].replace('{count}', '2'));
  });
});

describe('fmt', () => {
  it('por defecto escribe el nombre del orden de magnitud en el idioma activo', () => {
    setLocale('es');
    setNotation('names');
    expect(fmt(1.5e6)).toBe(`1,5${NBSP}millones`);
    expect(fmt(1e6)).toBe(`1${NBSP}millón`);
    expect(fmt(2.3e9)).toBe(`2,3${NBSP}mil${NBSP}millones`);
    expect(fmt(4e12)).toBe(`4${NBSP}billones`);
    setLocale('en');
    expect(fmt(1.5e6)).toBe(`1.5${NBSP}Million`);
    expect(fmt(2.3e9)).toBe(`2.3${NBSP}Billion`);
    expect(fmt(1e63)).toBe(`1${NBSP}Vigintillion`);
  });

  it('respeta la notación elegida', () => {
    setLocale('es');
    setNotation('engineering');
    expect(fmt(1.5e7)).toBe('15e6');
    setLocale('en');
    setNotation('suffix');
    expect(fmt(1.5e9)).toBe(`1.5${NBSP}B`);
  });
});

describe('numberTooltip', () => {
  it('con nombres, el tooltip da la cifra entera', () => {
    setLocale('es');
    setNotation('names');
    expect(numberTooltip(1.5e9)).toBe('1.500.000.000');
  });

  it('con sufijos cortos, da la cifra entera y el nombre largo «mil millones»', () => {
    setLocale('es');
    setNotation('suffix');
    expect(numberTooltip(1.5e9)).toBe('1.500.000.000 · mil millones');
    setLocale('en');
    expect(numberTooltip(1.5e9)).toBe(`1,500,000,000 · ${en['num.name.B.other']}`);
  });

  it('el último nombre, el de 1e63, también existe', () => {
    setLocale('es');
    setNotation('suffix');
    expect(numberTooltip(1e63)).toBe('1e63 · mil decillones');
  });

  it('no hay tooltip para números que se muestran completos ni en científica', () => {
    setLocale('es');
    expect(numberTooltip(999999)).toBeNull();
    expect(numberTooltip(1e66)).toBeNull();
  });
});

describe('pseudoize', () => {
  it('conserva los marcadores intactos y en orden', () => {
    const pseudo = pseudoize('Hola {name}, tienes {count} esporas');
    expect(placeholders(pseudo)).toEqual(['{name}', '{count}']);
  });

  it('el texto queda al menos un 40 % más largo', () => {
    const text = 'Hola {name}, tienes {count} esporas';
    // 5 + 6 + 2 + 7 + 7 + 8 = 35 caracteres; 35 × 1.4 = 49
    expect(text.length).toBe(35);
    expect(pseudoize(text).length).toBeGreaterThanOrEqual(49);
  });

  it('acentúa las vocales fuera de los marcadores', () => {
    expect(pseudoize('casa')).toContain('cásá');
  });

  it('el pseudocatálogo conserva los marcadores y alarga cada clave un 40 % como mínimo', () => {
    const pseudo = pseudoCatalog(es);
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect(placeholders(pseudo[key])).toEqual(placeholders(es[key]));
      expect(pseudo[key].length).toBeGreaterThanOrEqual(es[key].length * 1.4);
    }
  });
});

describe('factores y días (fase 8)', () => {
  it('un factor se escribe sin «×», con hasta dos decimales y la coma del idioma', () => {
    expect(formatFactor(1.25, 'es')).toBe('1,25');
    expect(formatFactor(1.953125, 'es')).toBe('1,95');
    expect(formatFactor(0.5, 'es')).toBe('0,5');
    expect(formatFactor(5, 'en')).toBe('5');
    expect(formatFactor(1.5, 'en')).toBe('1.5');
  });

  it('un día de la Crónica se escribe sin hora', () => {
    expect(formatDay(Date.UTC(2026, 9, 3, 12), 'es', 'UTC')).toBe('3 de octubre de 2026');
    expect(formatDay(Date.UTC(2026, 9, 3, 12), 'en', 'UTC')).toBe('October 3, 2026');
  });
});
