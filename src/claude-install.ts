import { cp, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod/v4';
import { claudeDirectory } from './claude-hook';
import { hash } from './render';
import { acquireLock } from './store';

const statusMessage = 'Conduct: review the plan';
const commandSchema = z.looseObject({
  type: z.string(),
  command: z.string().optional(),
  statusMessage: z.string().optional(),
});
const matcherSchema = z.looseObject({
  matcher: z.string().optional(),
  hooks: z.array(commandSchema),
});
const settingsSchema = z.looseObject({
  hooks: z.looseObject({ PreToolUse: z.array(matcherSchema).optional() }).optional(),
});

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function mergeClaudeSettings(raw: unknown, command?: string) {
  const settings = settingsSchema.parse(raw);
  const groups = (settings.hooks?.PreToolUse ?? []).flatMap((group) => {
    if (group.matcher !== 'ExitPlanMode') return [group];
    const hooks = group.hooks.filter(
      (hook) =>
        !(
          hook.type === 'command' &&
          hook.statusMessage === statusMessage &&
          hook.command?.includes(' claude-hook ')
        ),
    );
    return hooks.length ? [{ ...group, hooks }] : [];
  });
  if (command)
    groups.push({
      matcher: 'ExitPlanMode',
      hooks: [{ type: 'command', command, statusMessage, timeout: 3600 }],
    });
  return { ...settings, hooks: { ...settings.hooks, PreToolUse: groups } };
}

async function installRuntime(directory: string) {
  const root = resolve(import.meta.dir, '..');
  const paths = ['package.json', 'bun.lock'];
  for (const folder of ['src', 'skills']) {
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
  if (!(await ready.exists())) {
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    await Bun.write(resolve(directory, 'conduct/runtime/.gitignore'), '*\n');
    for (const folder of ['src', 'skills'])
      await cp(resolve(root, folder), resolve(runtime, folder), { recursive: true });
    for (const path of ['package.json', 'bun.lock'])
      await Bun.write(resolve(runtime, path), Bun.file(resolve(root, path)));
    console.error('Conduct: Installing a persistent runtime for Claude Code…');
    const install = Bun.spawn(
      [process.execPath, 'install', '--production', '--frozen-lockfile', '--ignore-scripts'],
      {
        cwd: runtime,
        stdout: 'ignore',
        stderr: 'inherit',
      },
    );
    if ((await install.exited) !== 0)
      throw new Error('Could not install Conduct. Claude settings were not changed.');
    await Bun.write(ready, fingerprint);
  }
  return `${shellQuote(process.execPath)} ${shellQuote(`${runtime}/src/cli.ts`)} claude-hook --timeout 3540`;
}

export async function configureClaude(options: {
  scope: 'user' | 'project';
  uninstall?: boolean;
  directory?: string;
}) {
  if (process.platform === 'win32')
    throw new Error('Claude hook installation currently supports macOS and Linux.');
  const directory =
    options.directory ?? (options.scope === 'user' ? claudeDirectory() : resolve('.claude'));
  const path = resolve(
    directory,
    options.scope === 'user' ? 'settings.json' : 'settings.local.json',
  );
  const release = await acquireLock(`${path}.conduct`);
  try {
    const file = Bun.file(path);
    const original = (await file.exists()) ? await file.text() : undefined;
    const parsed: unknown = original === undefined ? {} : JSON.parse(original);
    const settings = settingsSchema.parse(parsed);
    if (!options.uninstall && settings.disableAllHooks === true)
      throw new Error(
        'Hooks are disabled in this settings file. Enable hooks in Claude Code before installing Conduct.',
      );
    if (options.uninstall && original === undefined) return path;
    const command = options.uninstall ? undefined : await installRuntime(directory);
    const next = mergeClaudeSettings(parsed, command);
    if (((await file.exists()) ? await file.text() : undefined) !== original)
      throw new Error('Claude settings changed during installation. Run the installer again.');
    const temporary = resolve('.temp', `claude-settings-${crypto.randomUUID()}.json`);
    await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
    try {
      await Bun.write(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return path;
  } finally {
    await release();
  }
}
