import { describe, expect, test } from 'bun:test';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installOptions } from '../src/install-options';
import { configureSkill, skillLocations } from '../src/skill-install';

const cli = resolve('src/cli.ts');
async function fixture() {
  const root = resolve('.temp', `install-${crypto.randomUUID()}`);
  const context = {
    cwd: `${root}/project with spaces`,
    home: `${root}/user's home`,
    claude: `${root}/claude-config`,
  };
  await mkdir(context.cwd, { recursive: true });
  return { root, context };
}
async function run(cwd: string, args: string[], claudeConfig?: string) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...(claudeConfig ? { CLAUDE_CONFIG_DIR: claudeConfig } : {}) },
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

describe('installation commands', () => {
  test('defaults to global installation and supports explicit project scope and old aliases', () => {
    expect(installOptions(['install', 'skill'], {})).toMatchObject({
      kind: 'skill',
      agent: 'all',
      scope: 'user',
    });
    expect(installOptions(['install', 'skill', 'codex'], { project: true })).toMatchObject({
      agent: 'codex',
      scope: 'project',
    });
    expect(installOptions(['install', 'hook'], {})).toEqual({ kind: 'hook', scope: 'user' });
    expect(installOptions(['install', 'hook', 'claude'], { global: true })).toEqual({
      kind: 'hook',
      scope: 'user',
    });
    expect(installOptions(['uninstall', 'claude'], { scope: 'project' })).toEqual({
      kind: 'hook',
      scope: 'project',
    });
    expect(installOptions(['install', 'claude'], { scope: 'user' })).toEqual({
      kind: 'hook',
      scope: 'user',
    });
    expect(installOptions(['install', 'hook'], { scope: 'global' })).toEqual({
      kind: 'hook',
      scope: 'user',
    });
    for (const flags of [
      { global: true, project: true },
      { global: true, scope: 'project' },
      { project: true, scope: 'user' },
    ])
      expect(() => installOptions(['install', 'hook'], flags)).toThrow(
        'either --global or --project',
      );
    expect(() => installOptions(['install', 'hook', 'codex'], {})).toThrow('Claude Code');
    expect(() => installOptions(['install', 'skill', 'unknown'], {})).toThrow('Usage');
    expect(() => installOptions(['install', 'hook'], { force: true })).toThrow(
      'only supported for skill',
    );
  });
  test('uses the documented discovery folders without duplicate Codex and shared installs', async () => {
    const { context } = await fixture();
    expect(skillLocations('claude', 'user', context)[0].directory).toBe(
      `${context.claude}/skills/conduct`,
    );
    expect(skillLocations('codex', 'user', context)[0].directory).toBe(
      `${context.home}/.agents/skills/conduct`,
    );
    expect(skillLocations('codex', 'project', context)).toEqual(
      skillLocations('agents', 'project', context),
    );
    expect(skillLocations('all', 'project', context).map((l) => l.directory)).toEqual([
      `${context.cwd}/.claude/skills/conduct`,
      `${context.cwd}/.agents/skills/conduct`,
    ]);
  });
  test('installs runnable skills, preserves other files, and supports safe repeat installs and removal', async () => {
    const { context } = await fixture();
    const options = { agent: 'all' as const, scope: 'user' as const, context };
    const paths = await configureSkill(options);
    expect(paths).toHaveLength(2);
    const content = await Bun.file(paths[1]).text();
    expect(content).toContain('name: conduct');
    const command = content.match(/```sh\n([^\n]+)\n```/)?.[1];
    expect(command).toBeDefined();
    expect(command).toContain('/.agents/conduct/runtime/');
    const child = Bun.spawn(['sh', '-c', `${command} --version`], {
      cwd: context.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await new Response(child.stdout).text()).toBe('0.1.0\n');
    expect(await child.exited).toBe(0);
    const notes = resolve(paths[1], '../notes.md');
    await Bun.write(notes, 'My notes');
    await configureSkill(options);
    expect(await Bun.file(paths[1]).text()).toBe(content);
    expect(await Bun.file(notes).text()).toBe('My notes');
    await Bun.write(paths[1], `${content}\nMy local customization\n`);
    await expect(configureSkill(options)).rejects.toThrow('was edited');
    await expect(configureSkill({ ...options, uninstall: true })).rejects.toThrow('was edited');
    expect(await Bun.file(paths[0]).exists()).toBe(true);
    await configureSkill({ ...options, force: true });
    await configureSkill({ ...options, agent: 'codex', uninstall: true });
    expect(await Bun.file(paths[0]).exists()).toBe(true);
    expect(await Bun.file(paths[1]).exists()).toBe(false);
    expect(await Bun.file(notes).text()).toBe('My notes');
    await configureSkill({ ...options, agent: 'claude', uninstall: true });
    await configureSkill({ ...options, agent: 'claude', uninstall: true });
    expect(await Bun.file(paths[0]).exists()).toBe(false);
  }, 30_000);
  test('checks all destinations before replacing anything and refuses linked skills', async () => {
    const { context } = await fixture();
    const locations = skillLocations('all', 'project', context);
    const existing = `${locations[1].directory}/SKILL.md`;
    await Bun.write(existing, '# A different skill');
    await expect(configureSkill({ agent: 'all', scope: 'project', context })).rejects.toThrow(
      'already exists',
    );
    expect(await Bun.file(`${locations[0].directory}/SKILL.md`).exists()).toBe(false);
    expect(await Bun.file(existing).text()).toBe('# A different skill');
    await symlink(locations[1].directory, locations[0].directory);
    await expect(
      configureSkill({ agent: 'claude', scope: 'project', context, force: true }),
    ).rejects.toThrow('linked skill');
    expect(await Bun.file(existing).text()).toBe('# A different skill');
  });
  test('CLI installs skills in the current project and rejects conflicting scope flags', async () => {
    const { context } = await fixture();
    const installed = await run(context.cwd, ['install', 'skill', 'codex', '-p']);
    expect(installed.code).toBe(0);
    expect(installed.stdout).toContain(`${context.cwd}/.agents/skills/conduct/SKILL.md`);
    expect(await Bun.file(`${context.cwd}/.claude/skills/conduct/SKILL.md`).exists()).toBe(false);
    const conflict = await run(context.cwd, [
      'install',
      'skill',
      'claude',
      '--global',
      '--project',
    ]);
    expect(conflict.code).toBe(1);
    expect(conflict.stderr).toContain('either --global or --project');
    expect((await run(context.cwd, ['uninstall', 'skill', 'agents', '--project'])).code).toBe(0);
  }, 30_000);
  test('hook CLI defaults to global configuration and supports project installation and removal', async () => {
    const { context } = await fixture();
    const original = {
      permissions: { deny: ['Bash(rm *)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'audit' }] }] },
    };
    await Bun.write(`${context.claude}/settings.json`, JSON.stringify(original));
    const installed = await run(context.cwd, ['install', 'hook'], context.claude);
    expect(installed.code).toBe(0);
    const settings = await Bun.file(`${context.claude}/settings.json`).json();
    expect(settings.permissions).toEqual(original.permissions);
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[1].matcher).toBe('ExitPlanMode');
    expect(await Bun.file(`${context.cwd}/.claude/settings.local.json`).exists()).toBe(false);
    expect((await run(context.cwd, ['install', 'hook', '-g'], context.claude)).code).toBe(0);
    expect(await Bun.file(`${context.claude}/settings.json`).json()).toEqual(settings);
    const local = await run(context.cwd, ['install', 'hook', '--project'], context.claude);
    expect(local.code).toBe(0);
    expect(
      (await Bun.file(`${context.cwd}/.claude/settings.local.json`).json()).hooks.PreToolUse,
    ).toHaveLength(1);
    expect((await run(context.cwd, ['uninstall', 'hook'], context.claude)).code).toBe(0);
    expect(await Bun.file(`${context.claude}/settings.json`).json()).toEqual(original);
    expect(
      (await Bun.file(`${context.cwd}/.claude/settings.local.json`).json()).hooks.PreToolUse,
    ).toHaveLength(1);
    expect((await run(context.cwd, ['uninstall', 'hook', '-p'], context.claude)).code).toBe(0);
  }, 30_000);
});
