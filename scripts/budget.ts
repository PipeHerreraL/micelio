/**
 * Presupuesto de JS y CSS (ARCHITECTURE.md §7), comprobado tras `npm run build` con el manifiesto
 * de Vite (dist/.vite/manifest.json). Atribuye cada archivo a un paquete por cómo se importa, no por
 * su nombre (crítica de la fase 9, hallazgo 11: un trozo compartido con nombre de módulo escapaba a
 * un tope por nombre):
 *
 * - inicial: la entrada y todo lo que importa de forma estática;
 * - plasmodio: lo alcanzable desde las importaciones dinámicas de src/partners/ que no es inicial;
 * - catálogos del plasmodio: cada src/i18n/partners/plasmodium.*.ts por separado.
 *
 * Falla si un paquete pasa de su tope o si un archivo .js no queda atribuido a ninguno.
 *
 * Uso: npm run budget (después de npm run build)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

type Manifest = Record<string, ManifestChunk>;

/**
 * Topes en kB (1000 bytes, como informa Vite) comprimidos con gzip (ARCHITECTURE.md §7). Son
 * guardas por paquete dentro del presupuesto del proyecto (< 150 kB de JS en total).
 */
const LIMITS = {
  // Medido 89,5 kB en la v1.4.0: los datos de las placas y el núcleo de los socios van aquí.
  initialJs: 95,
  initialCss: 9,
  // Medido 18,6 kB en la v1.4.0 (la estimación de la fase 9 era ~15): la vista y el lienzo pesan más.
  plasmodiumJs: 20,
  plasmodiumCss: 3,
  catalog: 7,
};

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8')) as Manifest;

const gzipKb = (file: string): number => gzipSync(readFileSync(new URL(file, dist))).length / 1000;

/** Claves alcanzables por importaciones estáticas desde `key` (incluida). */
function staticClosure(key: string, out = new Set<string>()): Set<string> {
  if (out.has(key)) return out;
  out.add(key);
  for (const next of manifest[key]?.imports ?? []) staticClosure(next, out);
  return out;
}

const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry === true);
if (entries.length !== 1) throw new Error(`Se esperaba una sola entrada y hay ${entries.length}.`);
const entryKey = entries[0]?.[0] ?? '';
const initial = staticClosure(entryKey);

// Catálogos que llegan aparte: los textos del plasmodio y las noticias del sotobosque (v1.5.0).
const isCatalog = (key: string): boolean =>
  /src\/i18n\/partners\/plasmodium\.\w+\.ts$/.test(key) || /src\/i18n\/news\/\w+\.ts$/.test(key);
const isPartner = (key: string): boolean => key.startsWith('src/partners/');

const dynamicKeys = Object.keys(manifest).filter((key) => manifest[key]?.isDynamicEntry === true);
const plasmodium = new Set<string>();
const catalogs: string[] = [];
for (const key of dynamicKeys) {
  if (isCatalog(key)) catalogs.push(key);
  else if (isPartner(key)) for (const k of staticClosure(key)) if (!initial.has(k)) plasmodium.add(k);
}

const filesOf = (keys: Iterable<string>, kind: 'js' | 'css'): string[] => {
  const out = new Set<string>();
  for (const key of keys) {
    const chunk = manifest[key];
    if (!chunk) continue;
    if (kind === 'js' && chunk.file.endsWith('.js')) out.add(chunk.file);
    if (kind === 'css') for (const css of chunk.css ?? []) out.add(css);
  }
  return [...out];
};

const sum = (files: readonly string[]): number => files.reduce((total, file) => total + gzipKb(file), 0);

const initialJs = filesOf(initial, 'js');
const initialCss = filesOf(initial, 'css');
const plasmodiumJs = filesOf(plasmodium, 'js');
const plasmodiumCss = filesOf(plasmodium, 'css').filter((file) => !initialCss.includes(file));

const rows: { name: string; kb: number; limit: number }[] = [
  { name: 'JS inicial', kb: sum(initialJs), limit: LIMITS.initialJs },
  { name: 'CSS inicial', kb: sum(initialCss), limit: LIMITS.initialCss },
  { name: 'JS del plasmodio (modelo, acciones y vista)', kb: sum(plasmodiumJs), limit: LIMITS.plasmodiumJs },
  { name: 'CSS del plasmodio', kb: sum(plasmodiumCss), limit: LIMITS.plasmodiumCss },
  ...catalogs.map((key) => ({
    name: `Catálogo ${key.replace(/^src\/i18n\/(partners\/)?/, '')}`,
    kb: sum(filesOf([key], 'js')),
    limit: LIMITS.catalog,
  })),
];

// Cada .js del build debe pertenecer a algún paquete (las herramientas de desarrollo no llegan).
const attributed = new Set([
  ...initialJs,
  ...plasmodiumJs,
  ...catalogs.flatMap((key) => filesOf([key], 'js')),
]);
const assets = readdirSync(new URL('assets/', dist)).map((name) => `assets/${name}`);
const loose = assets.filter((file) => file.endsWith('.js') && !attributed.has(file));

let failed = false;
for (const r of rows) {
  const ok = r.kb <= r.limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'PASA'} ${r.name}: ${r.kb.toFixed(1)} kB de ${r.limit} kB`);
}
if (loose.length > 0) {
  failed = true;
  console.log(`Sin atribuir: ${loose.join(', ')}`);
}
if (failed) process.exitCode = 1;
