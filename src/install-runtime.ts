import { chmod, cp, mkdir } from 'node:fs/promises';
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
    'AGENTS.md',
    'CONTRIBUTING.md',
    'THIRD_PARTY_NOTICES.md',
  ];
  const folders = ['bin', 'src', 'skills', 'examples', 'docs'];
  const paths = [...packageFiles];
  for (const folder of folders) {
    for await (const path of new Bun.Glob(`${folder}/**/*`).scan({ cwd: root, onlyFiles: true }))
      paths.push(path);
  }
  paths.sort();
  const fingerprint = hash(
    `${Bun.version}/${process.platform}/${process.arch}\n` +
      (
        await Promise.all(
          paths.map(
            async (path) => `${path}\n${hash(await Bun.file(resolve(root, path)).bytes())}`,
          ),
        )
      ).join('\n'),
  );
  const runtime = resolve(directory, 'conduct/runtime', fingerprint.slice(0, 20));
  const executable = resolve(runtime, process.platform === 'win32' ? 'bun.exe' : 'bun');
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
      await Bun.write(executable, Bun.file(process.execPath));
      await chmod(executable, 0o700);
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
    command: `BUN_BE_BUN=1 ${shellQuote(executable)} ${shellQuote(`${runtime}/src/cli.ts`)}`,
  };
}
