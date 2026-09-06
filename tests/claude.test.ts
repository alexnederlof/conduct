import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hookInputSchema, planResult, reviewClaudePlan } from '../src/claude-hook';
import { mergeClaudeSettings, shellQuote } from '../src/claude-install';
import type { Decision, Round } from '../src/model';
import type { startServer } from '../src/server';

type App = Awaited<ReturnType<typeof startServer>>;
async function fixture() {
  const directory = resolve('.temp', `claude-${crypto.randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const planFilePath = `${directory}/original-plan.md`;
  const plan = '# Launch plan\n\nLaunch in one week.\n';
  await Bun.write(planFilePath, plan);
  const input = {
    hook_event_name: 'PreToolUse',
    tool_name: 'ExitPlanMode',
    session_id: 'test-session',
    tool_use_id: 'test-tool',
    cwd: directory,
    tool_input: { plan, planFilePath, otherField: { preserve: true } },
  };
  return { directory, planFilePath, plan, input };
}
function post(app: App, path: string, body: object, token?: string) {
  const url = new URL(app.url);
  return fetch(`${url.origin}/api/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? url.hash.slice(1)}`,
      Origin: url.origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('Claude plan approval', () => {
  for (const decision of ['approved', 'changes_requested'] as const) {
    test(`waits for explicit ${decision} and delivers anchored feedback`, async () => {
      const f = await fixture();
      let snapshot: Round | undefined;
      const result = await reviewClaudePlan(f.input, {
        directory: f.directory,
        noOpen: true,
        timeout: 10,
        onReady: async (app) => {
          expect(app.store.read().mode).toBe('plan');
          expect((await post(app, 'submit', { revision: 0 })).status).toBe(400);
          expect(app.store.read().rounds).toHaveLength(0);
          expect(
            (
              await post(app, 'entries', {
                revision: 0,
                entry: {
                  kind: 'edit',
                  body: 'Allow time for the pilot.',
                  replacement: 'Launch in two weeks.',
                  anchor: {
                    exact: 'Launch in one week.',
                    prefix: 'Launch plan',
                    suffix: '',
                    start: 11,
                    end: 30,
                    selector: 'article > p',
                    sourceLine: 3,
                    sourceEndLine: 3,
                  },
                },
              })
            ).status,
          ).toBe(200);
          const url = new URL(app.url);
          const state = await (
            await fetch(`${url.origin}/api/review`, {
              headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
            })
          ).json();
          expect(
            (await post(app, 'submit', { revision: 1, decision }, state.previewToken)).status,
          ).toBe(401);
          expect(
            (await post(app, 'notes', { revision: 1, notes: 'Keep the first release small.' }))
              .status,
          ).toBe(200);
          expect((await post(app, 'submit', { revision: 2, decision })).status).toBe(200);
          expect((await post(app, 'submit', { revision: 3, decision: 'approved' })).status).toBe(
            409,
          );
          expect((await post(app, 'notes', { revision: 3, notes: 'late change' })).status).toBe(
            409,
          );
          snapshot = app.store.read().rounds[0];
        },
      });
      expect(result.hookSpecificOutput.permissionDecision).toBe(
        decision === 'approved' ? 'allow' : 'deny',
      );
      const serialized = JSON.stringify(result);
      expect(serialized).toContain('Launch in one week.');
      expect(serialized).toContain('Launch in two weeks.');
      expect(serialized).toContain('Source lines: 3');
      expect(serialized).toContain('Keep the first release small.');
      expect(snapshot?.source.content).toBe(f.plan);
      expect(snapshot?.source.path).toBe(f.planFilePath);
      expect(snapshot?.decision).toBe(decision);
      if ('updatedInput' in result.hookSpecificOutput)
        expect(result.hookSpecificOutput.updatedInput).toEqual(f.input.tool_input);
      else expect(serialized).toContain('Do not implement yet');
      expect(await Bun.file(f.planFilePath).text()).toBe(f.plan);
    });
  }
  test('a new invocation cannot reuse a previous approval', async () => {
    const f = await fixture();
    const paths: string[] = [];
    for (const decision of ['approved', 'changes_requested'] as Decision[]) {
      const result = await reviewClaudePlan(f.input, {
        directory: f.directory,
        noOpen: true,
        timeout: 10,
        onReady: async (app) => {
          paths.push(app.outputPath);
          expect(app.store.read().rounds).toHaveLength(0);
          await post(app, 'submit', { revision: 0, decision });
        },
      });
      expect(result.hookSpecificOutput.permissionDecision).toBe(
        decision === 'approved' ? 'allow' : 'deny',
      );
    }
    expect(paths[0]).not.toBe(paths[1]);
  });
  test('changed plans cannot be approved, including after the decision was recorded', async () => {
    const f = await fixture();
    const result = await reviewClaudePlan(f.input, {
      directory: f.directory,
      noOpen: true,
      timeout: 10,
      onReady: async (app) => {
        await post(app, 'submit', { revision: 0, decision: 'approved' });
        await Bun.write(f.planFilePath, '# Different plan\n');
      },
    });
    expect(result.hookSpecificOutput.permissionDecision).toBe('deny');
    const mismatch = await reviewClaudePlan(f.input, { directory: f.directory, noOpen: true });
    expect(mismatch.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(JSON.stringify(mismatch)).toContain('differs');
  });
  test('cancellation and a timeout never become approval', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const cancelled = await reviewClaudePlan(f.input, {
      directory: f.directory,
      noOpen: true,
      signal: controller.signal,
      onReady: () => controller.abort(),
    });
    expect(cancelled.hookSpecificOutput.permissionDecision).toBe('deny');
    const expired = await reviewClaudePlan(f.input, {
      directory: f.directory,
      noOpen: true,
      timeout: 0.01,
    });
    expect(expired.hookSpecificOutput.permissionDecision).toBe('deny');
  });
  test('rejects empty or wrong hook inputs and never trims the reviewed plan', async () => {
    const f = await fixture();
    expect(hookInputSchema.parse(f.input).tool_input.plan).toBe(f.plan);
    expect(hookInputSchema.safeParse({ ...f.input, tool_name: 'Bash' }).success).toBe(false);
    expect(hookInputSchema.safeParse({ ...f.input, tool_input: { plan: ' ' } }).success).toBe(
      false,
    );
    const missingDecision: Round = {
      number: 1,
      source: {
        path: f.planFilePath,
        name: 'plan.md',
        content: f.plan,
        format: 'markdown',
        hash: '',
      },
      submittedAt: '',
      entries: [],
      notes: '',
    };
    expect(
      planResult(hookInputSchema.parse(f.input), missingDecision, 'feedback.json')
        .hookSpecificOutput.permissionDecision,
    ).toBe('deny');
  });
  test('hook CLI failures emit a blocking decision, with clean JSON stdout', async () => {
    const child = Bun.spawn([process.execPath, 'src/cli.ts', 'claude-hook', '--no-open'], {
      stdin: new Blob(['{}']),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe('deny');
    const malformed = Bun.spawn([process.execPath, 'src/cli.ts', 'claude-hook', '--invalid'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await malformed.exited).toBe(2);
  });
});

describe('Claude hook settings', () => {
  test('install, reinstall and uninstall preserve unrelated settings and hooks', () => {
    const original = {
      permissions: { deny: ['Bash(rm *)'] },
      model: 'unchanged',
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'other' }] }],
        PreToolUse: [
          {
            matcher: 'ExitPlanMode',
            hooks: [{ type: 'command', command: 'audit-plan', timeout: 3 }],
          },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'audit' }] },
        ],
      },
    };
    const command = "'/path with spaces/bun' '/runtime/cli.ts' claude-hook --timeout 3540";
    const once = mergeClaudeSettings(original, command);
    expect(once.hooks.PreToolUse).toHaveLength(3);
    expect(once).toMatchObject({
      permissions: original.permissions,
      hooks: { SessionStart: original.hooks.SessionStart },
    });
    expect(mergeClaudeSettings(once, command)).toEqual(once);
    expect(mergeClaudeSettings(once)).toEqual(original);
    expect(original.hooks.PreToolUse).toHaveLength(2);
  });
  test('quotes paths containing spaces, apostrophes and shell expansion literally', async () => {
    const value = "/Users/Someone's project/$(do-not-execute)`literal`";
    const child = Bun.spawn(['sh', '-c', `printf '%s' ${shellQuote(value)}`], { stdout: 'pipe' });
    expect(await new Response(child.stdout).text()).toBe(value);
    expect(await child.exited).toBe(0);
  });
});
