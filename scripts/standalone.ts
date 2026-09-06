import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export async function launch(archive: Blob, id: string) {
  const root = resolve(process.env.CONDUCT_CACHE_DIR ?? resolve(homedir(), '.cache/conduct'));
  const runtime = resolve(root, id);
  const ready = Bun.file(resolve(runtime, '.ready'));
  if (!(await ready.exists())) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stage = await mkdtemp(resolve(root, '.extract-'));
    try {
      await new Bun.Archive(await archive.arrayBuffer()).extract(stage);
      await Bun.write(resolve(stage, '.ready'), id);
      try {
        await rename(stage, runtime);
      } catch (error) {
        if (!(await ready.exists())) throw error;
      }
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  const child = Bun.spawn(
    [process.execPath, resolve(runtime, 'src/cli.ts'), ...Bun.argv.slice(2)],
    {
      env: { ...process.env, BUN_BE_BUN: '1' },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  process.exitCode = await child.exited;
}
