#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { startServer } from './server';
import { reviewSchema, type Round } from './model';

const help = `
  Conduct — a local review space for agent-generated work

  conduct <file> [options]
  conduct present <file> [options]
  conduct feedback <file> [--out <path>] [--format json|markdown]
  conduct wait <file> [--after <round>] [--timeout <seconds>]
  conduct skill

  Formats      .md, .markdown, .html, .htm, .tsx, .jsx
  --port       Port to listen on (default: available port)
  --out        Feedback JSON path (default: <file>.feedback.json)
  --no-open    Do not launch the browser
  --after      Wait for a submitted round after this number (default: 0)
  --timeout    Stop waiting after this many seconds (default: 0, unlimited)
  --format     Output format for feedback or wait (default: json)
  --help       Show this help
  --version    Show version

  Examples
    conduct proposal.md
    conduct concept.tsx --no-open
    conduct wait proposal.md --after 0 --timeout 600
    conduct feedback proposal.md --format markdown

  Select text → comment or suggest an edit → Send to agent.
  Feedback is saved locally. Original files are never modified.
`;

function markdown(rounds: Round[]) {
  return rounds
    .map(
      (round) =>
        `# Review round ${round.number}\n\nSource: ${round.source.path}\nSHA-256: ${round.source.hash}\nSubmitted: ${round.submittedAt}\n\n${round.entries
          .map(
            (entry, index) =>
              `## ${index + 1}. ${entry.kind === 'edit' ? 'Suggested edit' : 'Comment'} [${entry.status}]\n\nID: ${entry.id}\n${entry.anchor.sourceLine ? `Source lines: ${entry.anchor.sourceLine}–${entry.anchor.sourceEndLine ?? entry.anchor.sourceLine}\n` : ''}Heading: ${entry.anchor.heading ?? '(none)'}\nSelector: ${entry.anchor.selector}\nText offsets: ${entry.anchor.start}–${entry.anchor.end}\n\nSelected text:\n${entry.anchor.exact
                .split('\n')
                .map((line) => '> ' + line)
                .join('\n')}\n\n${
                entry.kind === 'edit'
                  ? `Replacement (empty means deletion):\n${(entry.replacement ?? '')
                      .split('\n')
                      .map((line) => '> ' + line)
                      .join('\n')}\n\n`
                  : ''
              }${entry.body}\n`,
          )
          .join('\n')}${round.notes ? `## Overall feedback\n\n${round.notes}\n` : ''}`,
    )
    .join('\n---\n\n');
}

export async function waitForReview(path: string, after = 0, timeout = 0, signal?: AbortSignal) {
  const started = Date.now();
  while (!signal?.aborted) {
    const file = Bun.file(path);
    if (await file.exists()) {
      const state = reviewSchema.parse(await file.json());
      const rounds = state.rounds.filter((round) => round.number > after);
      if (rounds.length) return { schemaVersion: 1, reviewId: state.id, rounds };
    }
    if (timeout && Date.now() - started >= timeout * 1000)
      throw new Error('Timed out waiting for a submitted review. Draft feedback is still saved.');
    await Bun.sleep(300);
  }
  throw new Error('Waiting cancelled.');
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      out: { type: 'string' },
      'no-open': { type: 'boolean' },
      after: { type: 'string' },
      timeout: { type: 'string' },
      format: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log('0.1.0');
    return;
  }
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const first = positionals[0];
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
  const app = await startServer({ file, out: values.out, port: number('port', 0) });
  console.error(
    `\n  Conduct\n\n  Review   ${app.url}\n  Feedback ${app.outputPath}\n\n  Waiting for your review. Press Ctrl+C to stop.\n`,
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
    const args =
      process.platform === 'darwin'
        ? ['open', app.url]
        : process.platform === 'win32'
          ? ['rundll32.exe', 'url.dll,FileProtocolHandler', app.url]
          : ['xdg-open', app.url];
    try {
      const child = Bun.spawn(args, { stdout: 'ignore', stderr: 'ignore' });
      if ((await child.exited) !== 0)
        console.error('  Browser could not open automatically. Open the review URL above.');
    } catch {
      console.error('  Browser could not open automatically. Open the review URL above.');
    }
  }
}
if (import.meta.main)
  main().catch((error) => {
    console.error(`Conduct: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
