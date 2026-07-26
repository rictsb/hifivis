// Parallel-safe verify: builds to a private HTML file and shoots to a private
// directory, so many agents can verify at once without clobbering each other.
//
//   node verify.mjs dac                 -> shots-dac/dac.png + shots-dac/overview.png
//   node verify.mjs dac --only          -> skip the overview sanity shot
//   node verify.mjs dac --w 2000 --h 1250
//
// Retries the bundle once, because another agent may be mid-write on its own
// stage file while esbuild is reading the tree.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const only = argv.includes('--only'); if (only) argv.splice(argv.indexOf('--only'), 1);
const W = flag('w', '1600'), H = flag('h', '1000'), SETTLE = flag('settle', '2600');
const stage = argv[0];
if (!stage) { console.error('usage: node verify.mjs <stage-id> [--only] [--w N --h N]'); process.exit(64); }

const out = join(mkdtempSync(join(tmpdir(), 'hifi-')), 'v.html');
const dir = 'shots-' + stage;

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8' });
}

let r = run('node', ['build.mjs', '--out', out]);
if (r.status !== 0) {
  console.error('build failed — retrying once in 3 s (another agent may be writing)…');
  const t = Date.now(); while (Date.now() - t < 3000) {}
  r = run('node', ['build.mjs', '--out', out]);
}
if (r.status !== 0) process.exit(r.status ?? 1);

const targets = only ? [stage] : [stage, 'overview'];
const s = run('node', ['shoot.mjs', '--html', out, '--dir', dir, '--w', W, '--h', H, '--settle', SETTLE, ...targets]);
process.exit(s.status ?? 1);
