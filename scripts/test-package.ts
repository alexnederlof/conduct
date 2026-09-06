import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { run, smoke } from './smoke';

const root = resolve(import.meta.dir, '..');
await mkdir(resolve(root, '.temp'), { recursive: true });
const fixture = await mkdtemp(resolve(root, '.temp/package-test-'));
const project = resolve(fixture, 'project');
const tools = resolve(fixture, 'tools');
await mkdir(project);
await mkdir(tools);
const node = Bun.which('node');
const npx = Bun.which('npx');
if (!node || !npx) throw new Error('Package tests require Node.js and npx');
await symlink(node, resolve(tools, 'node'));
const cache = resolve(fixture, 'npm-cache');
const env = { ...process.env, PATH: `${tools}:/usr/bin:/bin`, npm_config_cache: cache };
const archive = resolve(fixture, 'conduct.tgz');
await run([process.execPath, 'pm', 'pack', '--filename', archive], root);
const version = (await Bun.file(resolve(root, 'package.json')).json()).version;
if (
  (await run([npx, '--yes', '--package', archive, 'conduct', '--version'], project, env)).trim() !==
  version
)
  throw new Error('npx did not run the packaged CLI');
const packages = [
  ...new Bun.Glob('**/node_modules/@alexnederlof/conduct/bin/conduct.mjs').scanSync({
    cwd: cache,
    onlyFiles: true,
  }),
];
if (packages.length !== 1) throw new Error('Could not locate the npx-installed CLI');
const command = [node, resolve(cache, packages[0])];
await smoke(command, project, env);
await run([...command, 'install', 'skill', 'codex', '--project'], project, env);
const instructions = await Bun.file(resolve(project, '.agents/skills/conduct/SKILL.md')).text();
const installed = instructions.match(/```sh\n([^\n]+)\n```/)?.[1];
if (!installed) throw new Error('Installed skill command missing');
await rm(cache, { recursive: true, force: true });
if ((await run(['/bin/sh', '-c', `${installed} --version`], project, env)).trim() !== version)
  throw new Error('Installed skill depends on npx cache');
console.log('npx works without a global Bun; installed runtime survives deleting the npx cache.');
