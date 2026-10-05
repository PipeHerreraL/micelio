import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { GameState } from '../../src/core/state.ts';
import { exportSave } from '../../src/systems/save.ts';
import { isMobile, savedState, seedSave, stateWith } from './helpers.ts';

/**
 * El inglés de la interfaz llega aparte (fase 10, src/i18n/index.ts): el juego lo espera antes de
 * montarse y, si no llega, se juega en español con un aviso.
 */

/** Ruta del trozo con el catálogo inglés en el build que sirve la prueba (lo construye webServer). */
function englishChunk(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../dist/.vite/manifest.json', import.meta.url), 'utf8'),
  ) as Record<string, { file: string } | undefined>;
  const file = manifest['src/i18n/en.ts']?.file;
  if (!file) throw new Error('El build no tiene el catálogo inglés aparte.');
  return file;
}

function englishGame(): GameState {
  return stateWith((s) => {
    s.nutrients = 50;
    s.owned.hypha = 2;
    s.settings.locale = 'en';
  });
}

test('con el inglés guardado, el juego se monta en inglés', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seedSave(page, englishGame());
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: /Generators/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Settings/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('si el inglés no llega, se juega en español con un aviso y la partida sigue pidiendo inglés', async ({
  page,
}, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  const chunk = englishChunk();
  await page.route(
    (url) => url.pathname.endsWith(`/${chunk}`),
    (route) => route.abort(),
  );
  await seedSave(page, englishGame());
  await page.goto('./');
  await expect(page.locator('.toast--sticky')).toContainText('No se pudo cargar el inglés');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('tab', { name: /Generadores/ })).toBeVisible();
  // La elección del jugador no se pisa: con conexión, la próxima vez llega.
  expect((await savedState(page)).settings.locale).toBe('en');
});

test('importar una partida en inglés pone la interfaz en inglés', async ({ page }, info) => {
  test.skip(isMobile(info.project.name), 'Basta con un perfil por motor.');
  await seedSave(
    page,
    stateWith((s) => {
      s.nutrients = 50;
      s.owned.hypha = 2;
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: /Ajustes/ }).click();
  await page.locator('#setting-import-text').fill(exportSave(englishGame(), Date.now()));
  await page.getByRole('button', { name: 'Revisar e importar' }).click();
  await page.getByRole('button', { name: 'Reemplazar partida' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: /Settings/ })).toBeVisible();
});
