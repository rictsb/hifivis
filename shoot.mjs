// Screenshot harness. Loads the built single-file HTML in headless Chrome with
// WebGL, drives it to named stages, captures PNGs, and reports console errors.
//
//   node shoot.mjs                       -> all stages, 1600x1000
//   node shoot.mjs dac power             -> just those stages
//   node shoot.mjs --w 2400 --h 1500 dac -> custom size
//   node shoot.mjs --settle 4000         -> longer animation settle
//
// Exits non-zero if the page threw or WebGL failed. Writes to shots/.
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i === -1) return d;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const W = +flag('w', 1600);
const H = +flag('h', 1000);
const SETTLE = +flag('settle', 2600);
const DIR = flag('dir', 'shots');
const HTML = flag('html', null);
const outDir = DIR.startsWith('/') ? DIR : join(root, DIR);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text',
    '--no-sandbox', '--font-render-hinting=none',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ' ' + m.text());
});

await page.goto(pathToFileURL(HTML || join(root, 'hifi-system.html')).href, { waitUntil: 'load', timeout: 60000 });

try {
  await page.waitForFunction('window.HIFI && window.HIFI.ready === true', { timeout: 45000 });
} catch (e) {
  const diag = await page.evaluate(() => ({ boot: window.HIFI?.bootError || null, has: !!window.HIFI }));
  console.error('APP DID NOT BECOME READY.', JSON.stringify(diag));
  errors.forEach((e) => console.error(e));
  await browser.close();
  process.exit(2);
}

const all = await page.evaluate(() => window.HIFI.stages.map((s) => s.id));
const targets = argv.length ? argv.filter((a) => all.includes(a)) : all;
if (argv.length && targets.length !== argv.length) {
  console.error('Unknown stage(s):', argv.filter((a) => !all.includes(a)).join(', '), '\nAvailable:', all.join(', '));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];
for (const id of targets) {
  await page.evaluate((s) => window.HIFI.goTo(s, { instant: false }), id);
  await wait(SETTLE);
  const f = join(outDir, `${id}.png`);
  await page.screenshot({ path: f });
  shots.push(f);
  const fps = await page.evaluate(() => window.HIFI.fps);
  console.log(`  ✓ ${id.padEnd(14)} ${fps ? fps.toFixed(0).padStart(3) + ' fps' : ''}  ${f}`);
}

const perf = await page.evaluate(() => ({
  fps: window.HIFI.fps, calls: window.HIFI.info?.calls, tris: window.HIFI.info?.triangles,
}));
writeFileSync(join(outDir, '_report.json'), JSON.stringify({ perf, errors, shots }, null, 2));

await browser.close();
if (errors.length) {
  console.error('\n--- CONSOLE / PAGE ERRORS (' + errors.length + ') ---');
  errors.slice(0, 40).forEach((e) => console.error(e));
  process.exit(1);
}
console.log(`\n  ${perf.fps?.toFixed(0)} fps · ${perf.calls} draw calls · ${(perf.tris / 1000).toFixed(0)}k tris · clean console\n`);
