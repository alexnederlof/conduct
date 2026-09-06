import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const metadata = await Bun.file(resolve(root, 'package.json')).json();
const temporary = resolve(root, '.temp');
await mkdir(temporary, { recursive: true });
const build = await mkdtemp(resolve(temporary, 'binary-'));
const source = resolve(build, 'package');
async function run(args: string[], cwd = root) {
  const child = Bun.spawn(args, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if ((await child.exited) !== 0) throw new Error(`${args[0]} failed`);
}
await run([process.execPath, 'pm', 'pack', '--filename', resolve(build, 'package.tgz')]);
await new Bun.Archive(await Bun.file(resolve(build, 'package.tgz')).bytes()).extract(build);
await run(
  [process.execPath, 'install', '--production', '--frozen-lockfile', '--ignore-scripts'],
  source,
);
const payload = resolve(build, 'payload.tgz');
await run([
  'tar',
  '--exclude=./node_modules/bun',
  '--exclude=./node_modules/@oven',
  '--exclude=./node_modules/.bin',
  '-czf',
  payload,
  '-C',
  source,
  '.',
]);
const digest = new Bun.CryptoHasher('sha256').update(await Bun.file(payload).bytes()).digest('hex');
const entrypoint = resolve(build, 'entry.ts');
await Bun.write(
  entrypoint,
  `import payload from './payload.tgz' with { type: 'file' };\nimport { launch } from ${JSON.stringify(resolve(import.meta.dir, 'standalone.ts'))};\nlaunch(Bun.file(payload), ${JSON.stringify(`${metadata.version}-${process.platform}-${process.arch}-${digest.slice(0, 20)}`)}).catch(error => { console.error('Conduct:', error.message); process.exitCode = Bun.argv[2] === 'claude-hook' ? 2 : 1; });\n`,
);
const extension = process.platform === 'win32' ? '.exe' : '';
const filename = `conduct-${process.platform}-${process.arch}${extension}`;
await mkdir(resolve(root, 'dist'), { recursive: true });
const result = await Bun.build({
  entrypoints: [entrypoint],
  compile: {
    outfile: resolve(root, 'dist', filename),
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  minify: true,
});
if (!result.success) throw new Error(result.logs.join('\n'));
console.log(`Built dist/${filename}`);
