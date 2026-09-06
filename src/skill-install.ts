import { lstat, mkdir, readdir, rmdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod/v4';
import { claudeDirectory } from './claude-hook';
import { installRuntime } from './install-runtime';
import type { InstallScope, SkillAgent } from './install-options';
import { hash } from './render';
import { acquireLock } from './store';

const manifestSchema = z.object({
  installer: z.literal('conduct'),
  version: z.literal(1),
  skillHash: z.string(),
});
const manifestName = '.conduct-install.json';

export function skillLocations(
  agent: SkillAgent,
  scope: InstallScope,
  context = {
    cwd: process.cwd(),
    home: homedir(),
    claude: claudeDirectory(),
  },
) {
  const roots = agent === 'all' ? ['claude', 'agents'] : [agent];
  return roots.map((target) => {
    const base =
      target === 'claude'
        ? scope === 'user'
          ? context.claude
          : resolve(context.cwd, '.claude')
        : resolve(scope === 'user' ? context.home : context.cwd, '.agents');
    return { base, directory: resolve(base, 'skills/conduct') };
  });
}

async function inspect(directory: string, force: boolean) {
  for (const path of [directory, `${directory}/SKILL.md`, `${directory}/${manifestName}`]) {
    const stat = await lstat(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Refusing to overwrite a linked skill: ${path}`);
  }
  const file = Bun.file(`${directory}/SKILL.md`);
  const manifest = Bun.file(`${directory}/${manifestName}`);
  const content = (await file.exists()) ? await file.text() : undefined;
  const owner = (await manifest.exists())
    ? manifestSchema.safeParse(await manifest.json())
    : undefined;
  if (content !== undefined && !force) {
    if (!owner?.success)
      throw new Error(
        `A skill already exists at ${directory}. Use --force to replace its SKILL.md.`,
      );
    if (hash(content) !== owner.data.skillHash)
      throw new Error(`The installed skill was edited: ${directory}. Use --force to replace it.`);
  }
}

export function installedSkill(content: string, command: string) {
  const instruction =
    'Use the installed `conduct` binary. From a source checkout, use `bun /absolute/path/to/conduct/src/cli.ts` instead. Keep source and feedback paths consistent across all commands.';
  if (!content.includes(instruction))
    throw new Error('The bundled skill is missing its CLI instructions.');
  return content.replace(
    instruction,
    `Use the following installed command wherever these instructions show \`conduct\`. It works from any working directory and does not depend on BunX’s cache or a global \`conduct\` binary. Keep source and feedback paths consistent across all commands.\n\n\`\`\`sh\n${command}\n\`\`\``,
  );
}

export async function configureSkill(options: {
  agent: SkillAgent;
  scope: InstallScope;
  force?: boolean;
  uninstall?: boolean;
  context?: Parameters<typeof skillLocations>[2];
}) {
  const locations = skillLocations(options.agent, options.scope, options.context);
  const releases: (() => Promise<void>)[] = [];
  try {
    for (const { directory } of locations) releases.push(await acquireLock(`${directory}.install`));
    for (const { directory } of locations) await inspect(directory, options.force ?? false);
    if (options.uninstall) {
      for (const { directory } of locations) {
        for (const name of ['SKILL.md', manifestName])
          await unlink(`${directory}/${name}`).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        const remaining = await readdir(directory).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
          return undefined;
        });
        if (remaining?.length === 0) await rmdir(directory);
      }
    } else {
      const template = await Bun.file(
        resolve(import.meta.dir, '../skills/conduct/SKILL.md'),
      ).text();
      const base = locations.at(-1)!.base;
      const runtime = await installRuntime(base);
      const content = installedSkill(template, runtime.command);
      for (const { directory } of locations) await inspect(directory, options.force ?? false);
      for (const { directory } of locations) {
        await mkdir(directory, { recursive: true });
        await Bun.write(`${directory}/SKILL.md`, content);
        await Bun.write(
          `${directory}/${manifestName}`,
          JSON.stringify({ installer: 'conduct', version: 1, skillHash: hash(content) }, null, 2) +
            '\n',
        );
      }
    }
    return locations.map(({ directory }) => resolve(directory, 'SKILL.md'));
  } finally {
    for (const release of releases.reverse()) await release();
  }
}
