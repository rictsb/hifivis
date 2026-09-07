// Publish the reviewed, self-contained exhibit without changing its bytes.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, 'listening-room', 'The Listening Room.html');
const html = readFileSync(source);
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
copyFileSync(source, join(dist, 'index.html'));
console.log(`Published The Listening Room: ${html.length.toLocaleString('en-US')} bytes`);
console.log(`SHA-256: ${createHash('sha256').update(html).digest('hex')}`);
