export type InstallScope = 'user' | 'project';
export type SkillAgent = 'claude' | 'codex' | 'agents' | 'all';

export function installOptions(
  positionals: string[],
  flags: {
    global?: boolean;
    project?: boolean;
    scope?: string;
    force?: boolean;
  },
) {
  if (flags.scope !== undefined && !['user', 'global', 'project'].includes(flags.scope))
    throw new Error('--scope must be user, global, or project.');
  const requested = [
    ...(flags.global ? ['user'] : []),
    ...(flags.project ? ['project'] : []),
    ...(flags.scope ? [flags.scope === 'global' ? 'user' : flags.scope] : []),
  ];
  if (new Set(requested).size > 1)
    throw new Error('Choose either --global or --project, not both.');
  const scope: InstallScope = requested.includes('project') ? 'project' : 'user';
  const [, kind, target] = positionals;
  if (kind === 'skill') {
    const agent = target ?? 'all';
    if (!['claude', 'codex', 'agents', 'all'].includes(agent) || positionals.length > 3)
      throw new Error(
        'Usage: conduct install skill [claude|codex|agents|all] [--global|--project]',
      );
    return {
      kind: 'skill' as const,
      agent: agent as SkillAgent,
      scope,
      force: flags.force ?? false,
    };
  }
  if (
    (kind === 'hook' && (target === undefined || target === 'claude') && positionals.length <= 3) ||
    (kind === 'claude' && positionals.length === 2)
  ) {
    if (flags.force) throw new Error('--force is only supported for skill installation.');
    return { kind: 'hook' as const, scope };
  }
  throw new Error(
    'Usage: conduct install skill [claude|codex|agents|all], or conduct install hook [--global|--project] (Claude Code plan approval).',
  );
}
