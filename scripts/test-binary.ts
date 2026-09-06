import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { run, smoke } from './smoke';

if (!Bun.argv[2]) throw new Error('Usage: bun scripts/test-binary.ts <binary>');
const binary = resolve(Bun.argv[2]);
await mkdir('.temp', { recursive: true });
const fixture = await mkdtemp(resolve('.temp/binary-test-'));
const env = { ...process.env, PATH: '', CONDUCT_CACHE_DIR: resolve(fixture, 'cache') };
const version = (await Bun.file(resolve(import.meta.dir, '../package.json')).json()).version;
if ((await run([binary, '--version'], fixture, env)).trim() !== version)
  throw new Error('Binary version mismatch');
await smoke([binary], fixture, env);
console.log('Standalone executable runs without Node.js or Bun on PATH.');
