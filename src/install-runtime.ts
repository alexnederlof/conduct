import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from './render';
import { acquireLock } from './store';

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function installRuntime(directory: string) {
  const root = resolve(import.meta.dir, '..');
  const packageFiles = [
    'package.json',
    'bun.lock',
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
  ];
  const folders = ['src', 'skills', 'examples'];
  const paths = [...packageFiles];
  for (const folder of folders) {
    for await (const path of new Bun.Glob(`${folder}/**/*`).scan({ cwd: root, onlyFiles: true }))
      paths.push(path);
  }
  paths.sort();
  const fingerprint = hash(
    (
      await Promise.all(
        paths.map(async (path) => `${path}\n${await Bun.file(resolve(root, path)).text()}`),
      )
    ).join('\n'),
  );
  const runtime = resolve(directory, 'conduct/runtime', fingerprint.slice(0, 20));
  const ready = Bun.file(`${runtime}/ready`);
  const release = await acquireLock(runtime);
  try {
    if (!(await ready.exists())) {
      await mkdir(runtime, { recursive: true, mode: 0o700 });
      await Bun.write(resolve(directory, 'conduct/runtime/.gitignore'), '*\n');
      for (const folder of folders)
        await cp(resolve(root, folder), resolve(runtime, folder), { recursive: true });
      for (const path of packageFiles)
        await Bun.write(resolve(runtime, path), Bun.file(resolve(root, path)));
      console.error('Conduct: Installing a persistent runtime…');
      const install = Bun.spawn(
        [process.execPath, 'install', '--production', '--frozen-lockfile', '--ignore-scripts'],
        {
          cwd: runtime,
          stdout: 'ignore',
          stderr: 'inherit',
        },
      );
      if ((await install.exited) !== 0) throw new Error('Could not install the Conduct runtime.');
      await Bun.write(ready, fingerprint);
    }
  } finally {
    await release();
  }
  return {
    directory: runtime,
    command: `${shellQuote(process.execPath)} ${shellQuote(`${runtime}/src/cli.ts`)}`,
  };
}
