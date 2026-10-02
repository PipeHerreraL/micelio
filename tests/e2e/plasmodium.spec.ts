import { readFileSync } from 'node:fs';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  createPlasmodium,
  spreadConductivity,
  startHabituation,
} from '../../src/partners/plasmodium/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { isMobile, savedState, seedRawSave, seedSave, windState } from './helpers.ts';

/** El plasmodio (docs/ROADMAP.md, fase 9) en el navegador. */

const MAP = { score: 2, quality: 0.7, cost: 1.2, tolerance: 0.8, alive: 9, joined: 3 };

/** Partida con el Acto I y el plasmodio ya llegado, su lámina vista. `plate` = placa abierta. */
function plasmodiumState(mutate: (s: GameState) => void = () => undefined, plate = 0): GameState {
  return windState((s) => {
    const p = createPlasmodium(9);
    for (let i = 0; i < plate; i += 1) Object.assign(p.plates[i] ?? {}, { map: { ...MAP } });
    p.plate = plate;
    p.conductivity = spreadConductivity(p, plate);
    p.habituation = startHabituation(plate);
    s.partners.plasmodium = p;
    s.seen.push('chapter.partner.plasmodium', 'hint.partners');
    for (let i = 0; i < plate; i += 1)
      s.seen.push(`chapter.plate.${['log', 'maze', 'archipelago', 'bitterBridge'][i]}`);
    mutate(s);
  });
}

/** Archivos .js que no son del paquete inicial, según el manifiesto del build que se prueba. */
function lazyChunks(): string[] {
  const manifest = JSON.parse(
    readFileSync(new URL('../../dist/.vite/manifest.json', import.meta.url), 'utf8'),
  ) as Record<string, { file: string; isEntry?: boolean; imports?: string[] }>;
  const initial = new Set<string>();
  const visit = (key: string): void => {
    if (initial.has(key)) return;
    initial.add(key);
    for (const next of manifest[key]?.imports ?? []) visit(next);
  };
  for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);
  return Object.entries(manifest)
    .filter(([key, chunk]) => !initial.has(key) && chunk.file.endsWith('.js'))
    .map(([, chunk]) => chunk.file);
}

async function openPartners(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /Socios/ }).click();
  await expect(page.locator('#partner-plasmodium-title')).toHaveText('Plasmodio');
  await expect(page.locator('.plate__site').first()).toBeVisible();
}

/**
 * Cuánto se sale la placa por la derecha: del panel de Socios, de la página y de la ventana. Todo
 * a 0 cuando la placa cabe.
 */
function plateOverflow(page: Page): Promise<{ panel: number; page: number; frame: number }> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('#panel-partners');
    const frame = document.querySelector<HTMLElement>('.plate__home .plate__frame');
    const root = document.documentElement;
    return {
      panel: panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : -1,
      page: Math.max(0, root.scrollWidth - root.clientWidth),
      frame: frame ? Math.max(0, Math.round(frame.getBoundingClientRect().right - root.clientWidth)) : -1,
    };
  });
}

test('una partida sin el plasmodio no descarga su código', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const lazy = lazyChunks();
  expect(lazy.length).toBeGreaterThan(0);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await seedSave(page, windState());
  await page.goto('./');
  await expect(page.getByRole('tab', { name: /Crónica/ })).toBeVisible();
  // Más que el plazo de la precarga en reposo (2 s).
  await page.waitForTimeout(2500);
  for (const file of lazy)
    expect(
      requested.some((url) => url.endsWith(file)),
      file,
    ).toBe(false);
  await expect(page.getByRole('tab', { name: /Socios/ })).toBeHidden();
});

test('al abrir Socios carga la placa y se pone un copo con las flechas y Enter', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'El teclado se prueba en escritorio.');
  await seedSave(page, plasmodiumState());
  await page.goto('./');
  await openPartners(page);
  const first = page.locator('.plate__site').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.plate__site').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.plate__site').nth(1)).toHaveAttribute(
    'aria-label',
    'Sitio 2, copo de avena: quitar',
  );
  const saved = await savedState(page);
  expect(saved.partners.plasmodium?.plates[0]?.foods).toEqual([1]);
});

test('en 360 × 800 cada sitio mide 44 px como mínimo y ningún par se solapa', async ({ page }, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await page.setViewportSize({ width: 360, height: 800 });
  await seedSave(
    page,
    plasmodiumState(() => undefined, 1),
  );
  await page.goto('./');
  await openPartners(page);
  const boxes = await page.locator('.plate__site').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.w).toBeGreaterThanOrEqual(44);
    expect(b.h).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a && b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(44);
    }
  }
});

test('en 320 px una placa que no cabe abre la lista y sus sitios no son interactivos', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await page.setViewportSize({ width: 320, height: 640 });
  // El Archipiélago pide celdas de 76 px: en 288 px de ancho no cabe en ninguna orientación.
  await seedSave(
    page,
    plasmodiumState(() => undefined, 2),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Socios/ }).click();
  await expect(page.getByText('En esta pantalla, los sitios se eligen en la lista.')).toBeVisible();
  await expect(page.locator('.plate__site')).toHaveCount(0);
  await expect(page.locator('.plate__list .plate__row').first()).toBeVisible();
});

test('con reducir movimiento, dos fotos seguidas de la placa son iguales', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await seedSave(
    page,
    plasmodiumState((s) => {
      s.settings.reducedMotion = true;
      Object.assign(s.partners.plasmodium?.plates[0] ?? {}, { foods: [7, 1, 16, 18] });
    }),
  );
  await page.goto('./');
  await openPartners(page);
  await page.clock.runFor(2000);
  // Un paso del modelo por segundo rehace la red (como mucho 250 ms después): una pareja de fotos
  // puede caer encima. Con el movimiento reducido, alguna de cuatro ventanas de 150 ms queda
  // quieta; un lienzo que se redibujara solo en cada frame fallaría las cuatro.
  const snap = (): Promise<string> =>
    page.locator('.plate__canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  let still = false;
  for (let attempt = 0; attempt < 4 && !still; attempt += 1) {
    const first = await snap();
    await page.clock.runFor(150);
    still = (await snap()) === first;
    await page.clock.runFor(110);
  }
  expect(still).toBe(true);
});

test('la lámina de llegada sale una vez, también tras el offline, y «Ver la placa» lleva a Socios', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const state = plasmodiumState((s) => {
    s.seen = s.seen.filter((k) => k !== 'chapter.partner.plasmodium');
  });
  await seedSave(page, state, Date.now() - 2 * 3600 * 1000);
  await page.goto('./');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Mientras no estabas…' })).toBeVisible();
  await expect(dialog.getByText(/El plasmodio siguió adaptándose durante/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Seguir creciendo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Un vecino amarillo' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Ahora no' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Ver la placa' }).click();
  await expect(page.getByRole('tab', { name: /Socios/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#partner-plasmodium-title')).toBeFocused();
  await savedState(page);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(dialog).toBeHidden();
});

test('una partida de la 1.3 en un bioma recibe al plasmodio y la pestaña Socios a los 5 min de partida', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const state = windState((s) => {
    s.forest = {
      biome: 'taiga',
      leg: 1,
      earned: 0,
      arrivedAt: Date.now() - 1000,
      arrivalSporulations: 9,
      arrivalPlayTime: 12_000,
    };
    s.chronicle[0] = {
      ...s.chronicle[0],
      leftAt: Date.now() - 1000,
      levelReached: 1941,
    } as GameState['chronicle'][number];
    s.spores = { level: 0, available: 1725 };
    s.stats.runTime = 297;
    s.seen.push('chapter.arrive.taiga');
  });
  const { partners: _p, ...rest } = state;
  const { mode: _m, ...autobuy } = state.autobuy;
  await seedRawSave(page, JSON.stringify({ version: 5, savedAt: Date.now(), state: { ...rest, autobuy } }));
  await page.goto('./');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Un vecino amarillo' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Ahora no' }).click();
  await expect(page.getByRole('tab', { name: /Socios/ })).toBeVisible();
  const saved = await savedState(page);
  expect(saved.partners.plasmodium).not.toBeNull();
  expect(saved.forest.biome).toBe('taiga');
});

test('tras recargar, el tiempo apuntado mientras el código no estaba se aplica y el pendiente vuelve a 0', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(
    page,
    plasmodiumState((s) => {
      const p = s.partners.plasmodium;
      if (p) p.pendingMs = 120_000;
    }),
  );
  await page.goto('./');
  await expect
    .poll(async () => (await savedState(page)).partners.plasmodium?.pendingMs, { timeout: 10_000 })
    .toBe(0);
  const saved = await savedState(page);
  expect(saved.partners.plasmodium?.stats.modelSeconds ?? 0).toBeGreaterThanOrEqual(120);
});

test('si el código del plasmodio no llega, el panel lo dice y ofrece recargar', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  for (const file of lazyChunks()) await page.route(`**/${file}`, (route) => route.abort());
  await seedSave(page, plasmodiumState());
  await page.goto('./');
  await page.getByRole('tab', { name: /Socios/ }).click();
  await expect(page.getByText(/No se pudo cargar este socio/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recargar la página' })).toBeVisible();
});

/** Desliza el dedo `dy` píxeles hacia arriba desde (x, y). */
async function swipeUp(cdp: CDPSession, x: number, y: number, dy: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - (dy * i) / 12 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('en el móvil, deslizar sobre la placa desplaza la página', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'El toque simulado usa el protocolo de Chromium.');
  await seedSave(
    page,
    plasmodiumState(() => undefined, 1),
  );
  await page.goto('./');
  await openPartners(page);
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
  const box = await page.locator('.plate__frame').boundingBox();
  if (!box) throw new Error('Sin placa');
  const before = await page.evaluate(() => window.scrollY);
  await swipeUp(cdp, box.x + box.width / 2, Math.min(box.y + box.height / 2, 600), 200);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 50);
});

test('ampliar la placa y cerrarla la devuelve al ancho del panel, con el foco en «Ampliar»', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'La placa ampliada se prueba en escritorio.');
  await seedSave(page, plasmodiumState());
  await page.goto('./');
  await openPartners(page);
  const expand = page.getByRole('button', { name: 'Ampliar la placa' });
  await expand.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.plate__site').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // El lienzo vuelve con el tamaño ampliado: si ensanchara la columna, relayout() mediría ese
  // ancho y la placa se quedaría desbordando el panel, con «Ampliar» oculto y el foco en <body>.
  await expect.poll(() => plateOverflow(page)).toEqual({ panel: 0, page: 0, frame: 0 });
  await expect(expand).toBeFocused();
});

test('al estrechar la ventana, la placa se encoge con el panel', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seedSave(page, plasmodiumState());
  await page.goto('./');
  await openPartners(page);
  await page.setViewportSize({ width: 1280, height: 760 });
  await expect.poll(() => plateOverflow(page)).toEqual({ panel: 0, page: 0, frame: 0 });
});

for (const { plate, name, width, height } of [
  // A 1280 × 760 el Archipiélago va en lista en el panel: «Ampliar» es la forma de jugarlo con
  // sitios (revisión de la fase 9, UI-6).
  { plate: 2, name: 'Archipiélago', width: 1280, height: 760 },
  // El Puente ampliado mide 672 px: más que los 32rem de un diálogo normal (UI-2).
  { plate: 3, name: 'Puente amargo', width: 1440, height: 900 },
]) {
  test(`a ${width} × ${height}, el ${name} se puede ampliar y ampliado cabe en el diálogo`, async ({
    page,
  }, info) => {
    test.skip(isMobile(info.project.name), 'La placa ampliada se prueba en escritorio.');
    await page.setViewportSize({ width, height });
    await seedSave(
      page,
      plasmodiumState(() => undefined, plate),
    );
    await page.goto('./');
    await page.getByRole('tab', { name: /Socios/ }).click();
    await expect(page.locator('.plate__frame')).toBeVisible();
    await page.getByRole('button', { name: 'Ampliar la placa' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.plate__site').first()).toBeVisible();
    // Cabe sin desplazarse en horizontal y la placa se ve al tamaño para el que se dispuso: ni
    // cortada por la derecha ni estrujada por el diálogo (que movería los sitios entre sí).
    await expect
      .poll(() =>
        dialog.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const frame = node.querySelector<HTMLElement>('.plate__frame');
          const pulse = node.querySelector('.plasmodium__pulse');
          const frameBox = frame?.getBoundingClientRect();
          return {
            scroll: node.scrollWidth - node.clientWidth,
            frameInside: frameBox !== undefined && frameBox.right <= box.right,
            frameAsLaidOut:
              frameBox !== undefined &&
              Math.abs(frameBox.width - Number.parseFloat(frame?.style.width ?? '0')) < 1,
            pulseInside: (pulse?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY) <= box.right,
          };
        }),
      )
      .toEqual({ scroll: 0, frameInside: true, frameAsLaidOut: true, pulseInside: true });
  });
}

test('con el foco en un sitio, si la ventana se estrecha hasta la lista, el foco pasa a la lista', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'El teclado se prueba en escritorio.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSave(
    page,
    plasmodiumState(() => undefined, 2),
  );
  await page.goto('./');
  await openPartners(page);
  await page.locator('.plate__site').first().focus();
  // A 1100 × 600 el Archipiélago (celdas de 76 px) no cabe en el panel en ninguna orientación.
  await page.setViewportSize({ width: 1100, height: 600 });
  await expect(page.locator('.plate__list')).toBeVisible();
  await expect(page.locator('.plate__list .plate__row-button').first()).toBeFocused();
});

test('en el móvil, la barra pegajosa queda bajo la cabecera y «Copo de avena» recibe el toque', async ({
  page,
}, info) => {
  test.skip(!isMobile(info.project.name), 'Solo en móvil.');
  await page.setViewportSize({ width: 360, height: 800 });
  await seedSave(page, plasmodiumState());
  await page.goto('./');
  await openPartners(page);
  // La placa sube hasta 20 px del borde: la barra de herramientas, que va encima, queda pegada.
  await page.evaluate(() => {
    const home = document.querySelector('.plate__home');
    if (home) window.scrollTo(0, home.getBoundingClientRect().top + window.scrollY - 20);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hud = document.querySelector('.layout__hud')?.getBoundingClientRect();
        const food = document.querySelector('.plasmodium__tool')?.getBoundingClientRect();
        if (!hud || !food) return null;
        const hit = document.elementFromPoint(food.left + food.width / 2, food.top + food.height / 2);
        return { underHud: food.top >= hud.bottom - 1, onFood: Boolean(hit?.closest('.plasmodium__tool')) };
      }),
    )
    .toEqual({ underHud: true, onFood: true });
});
