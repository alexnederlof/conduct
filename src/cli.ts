#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { startServer } from './server';
import { reviewSchema } from './model';
import { markdown, waitForReview } from './feedback';
import { openBrowser } from './browser';
import { installOptions } from './install-options';
import { shellQuote } from './install-runtime';
export { waitForReview } from './feedback';

const help = `
  Conduct — a local review space for agent-generated work

  conduct <file> [options]
  conduct present <file> [options]
  conduct feedback <file> [--out <path>] [--format json|markdown]
  conduct wait <file> [--after <round>] [--timeout <seconds>]
  conduct skill
  conduct install skill [claude|codex|agents|all] [--global|--project]
  conduct install hook [--global|--project]
  conduct uninstall skill [claude|codex|agents|all] [--global|--project]
  conduct uninstall hook [--global|--project]

  Formats      .md, .markdown, .html, .htm, .tsx, .jsx
  --port       Port to listen on (default: available port)
  --out        Feedback JSON path (default: <file>.feedback.json)
  --no-open    Do not launch the browser
  --expire     Shut down after idle minutes (default: 30; 0: unlimited)
  --after      Wait for a submitted round after this number (default: 0)
  --timeout    Stop waiting after this many seconds (default: 0, unlimited)
  --format     Output format for feedback or wait (default: json)
  --global, -g Install for all projects (default)
  --project, -p Install only in the current project directory
  --force      Replace an existing or edited skill (skill commands only)
  --help       Show this help
  --version    Show version

  Examples
    conduct proposal.md
    conduct concept.tsx --no-open
    conduct wait proposal.md --after 0 --timeout 600
    conduct feedback proposal.md --format markdown
    conduct install skill all
    conduct install skill codex --project
    conduct install hook
    conduct install hook --project

  Skill target defaults to all: Claude Code + the shared .agents folder.
  Codex and agents use the same .agents/skills location.
  Hook installation handles Claude Code's plan approval.
  Legacy install/uninstall claude --scope user|project commands still work.

  Select text → comment or suggest an edit → Send to agent.
  Feedback is saved locally. Original files are never modified.
`;

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      expire: { type: 'string' },
      out: { type: 'string' },
      'no-open': { type: 'boolean' },
      after: { type: 'string' },
      timeout: { type: 'string' },
      format: { type: 'string' },
      scope: { type: 'string' },
      global: { type: 'boolean', short: 'g' },
      project: { type: 'boolean', short: 'p' },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log((await Bun.file(resolve(import.meta.dir, '../package.json')).json()).version);
    return;
  }
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const first = positionals[0];
  if (first === 'claude-hook') {
    const { runClaudeHook } = await import('./claude-hook');
    await runClaudeHook({
      noOpen: values['no-open'],
      timeout: values.timeout === undefined ? undefined : Number(values.timeout),
    });
    return;
  }
  if (first === 'install' || first === 'uninstall') {
    const options = installOptions(positionals, values);
    const uninstall = first === 'uninstall';
    if (options.kind === 'skill') {
      const { configureSkill } = await import('./skill-install');
      const paths = await configureSkill({ ...options, uninstall });
      console.log(
        `Conduct skill ${uninstall ? 'removed from' : 'installed at'}:\n${paths.map((path) => `  ${path}`).join('\n')}`,
      );
      if (!uninstall)
        console.log(
          'Available to your agent on its next turn. Restart the agent if it does not appear.',
        );
      return;
    }
    const { configureClaude } = await import('./claude-install');
    const path = await configureClaude({
      scope: options.scope,
      uninstall,
    });
    console.log(
      `Conduct plan review ${first === 'install' ? 'enabled' : 'disabled'} in ${path}.\nRestart Claude Code to load the updated hooks.`,
    );
    return;
  }
  const command = ['present', 'feedback', 'wait', 'skill'].includes(first) ? first : 'present';
  if (command === 'skill') {
    console.log(await Bun.file(resolve(import.meta.dir, '../skills/conduct/SKILL.md')).text());
    return;
  }
  const file = command === first ? positionals[1] : first;
  if (!file) throw new Error(`A source file is required for ${command}.`);
  if (positionals.length > (command === first ? 2 : 1))
    throw new Error('Review one source file per session.');
  if (values.format && !['json', 'markdown'].includes(values.format))
    throw new Error('--format must be json or markdown.');
  const output = resolve(values.out ?? `${resolve(file)}.feedback.json`);
  const number = (name: 'after' | 'timeout' | 'port', fallback: number) => {
    const value = values[name] === undefined ? fallback : Number(values[name]);
    if (!Number.isSafeInteger(value) || value < 0 || (name === 'port' && value > 65535))
      throw new Error(`Invalid --${name}.`);
    return value;
  };
  if (command === 'feedback') {
    if (!(await Bun.file(output).exists())) throw new Error(`No feedback yet: ${output}`);
    const state = reviewSchema.parse(await Bun.file(output).json());
    if (values.format === 'markdown') {
      const drafts = {
        number: state.rounds.length + 1,
        submittedAt: '(draft, not sent)',
        source: state.source,
        entries: state.entries,
        notes: state.notes,
      };
      console.log(markdown(state.status === 'draft' ? [...state.rounds, drafts] : state.rounds));
    } else console.log(JSON.stringify(state, null, 2));
    return;
  }
  if (command === 'wait') {
    const result = await waitForReview(output, number('after', 0), number('timeout', 0));
    console.log(
      values.format === 'markdown' ? markdown(result.rounds) : JSON.stringify(result, null, 2),
    );
    return;
  }
  const expire = values.expire === undefined ? 30 : Number(values.expire);
  if (!Number.isFinite(expire) || expire < 0 || values.expire?.trim() === '')
    throw new Error('Invalid --expire.');
  const resumeCommand =
    'BUN_BE_BUN=1 ' +
    [
      process.execPath,
      resolve(Bun.argv[1]!),
      'present',
      resolve(file),
      '--out',
      output,
      '--expire',
      String(expire),
      ...(values.port ? ['--port', values.port] : []),
    ]
      .map(shellQuote)
      .join(' ');
  const app = await startServer({
    file,
    out: values.out,
    port: number('port', 0),
    expire,
    resumeCommand,
    onExpire: () => {
      console.error(
        `\nConduct stopped after ${expire} idle minutes. Saved feedback is preserved.\nResume: ${resumeCommand}\n`,
      );
      process.exit(0);
    },
  });
  console.error(
    `\n  Conduct\n\n  Review   ${app.url}\n  Feedback ${app.outputPath}\n\n  Waiting for your review. Press Ctrl+C to stop.\n  ${expire ? `Expires after ${expire} idle minutes.` : 'Idle expiry disabled.'}\n  Resume: ${resumeCommand}\n`,
  );
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (!values['no-open']) {
    await openBrowser(app.url);
  }
}
if (import.meta.main)
  main().catch((error) => {
    console.error(`Conduct: ${error instanceof Error ? error.message : error}`);
    process.exitCode = Bun.argv[2] === 'claude-hook' ? 2 : 1;
  });
