// Build: bundle src/main.js (+ three) into one IIFE, inline CSS + fonts, emit a
// single self-contained hifi-system.html with zero external requests.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const out = oi !== -1 ? argv[oi + 1] : join(root, 'hifi-system.html');

const result = await esbuild.build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome120', 'safari17', 'firefox120'],
  minify: true,
  legalComments: 'none',
  write: false,
  loader: { '.glsl': 'text' },
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const css = readFileSync(join(root, 'src/app.css'), 'utf8');
const b64 = (p) => readFileSync(join(root, p)).toString('base64');
const fontCss = `
@font-face{font-family:'Inter';font-style:normal;font-weight:300 700;font-display:block;
src:url(data:font/woff2;base64,${b64('vendor/inter.woff2')}) format('woff2');}
@font-face{font-family:'JBMono';font-style:normal;font-weight:400 600;font-display:block;
src:url(data:font/woff2;base64,${b64('vendor/jbmono.woff2')}) format('woff2');}
`;

const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*__FONTS__*/', fontCss)
  .replace('/*__CSS__*/', css)
  .replace('//__JS__', () => js);

writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n  → ${out}  ${kb} KB  (self-contained)`);

// Static hosts publish a DIRECTORY, so emit dist/index.html as well. The file
// is entirely self-contained, so the directory needs nothing else in it.
if (oi === -1) {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), html);
  console.log(`  → dist/index.html  ${kb} KB  (deploy this directory)\n`);
} else {
  console.log('');
}
