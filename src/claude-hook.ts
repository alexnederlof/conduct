import { mkdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod/v4';
import { openBrowser } from './browser';
import { markdown } from './feedback';
import { hash } from './render';
import { startServer } from './server';
import type { Round } from './model';

export const hookInputSchema = z.object({
  hook_event_name: z.literal('PreToolUse'),
  tool_name: z.literal('ExitPlanMode'),
  session_id: z.string().min(1),
  tool_use_id: z.string().optional(),
  cwd: z.string().refine(isAbsolute, 'Claude must provide an absolute working directory.'),
  tool_input: z.looseObject({
    plan: z
      .string()
      .min(1)
      .max(5_000_000)
      .refine((plan) => plan.trim().length > 0, 'The plan is empty.'),
    planFilePath: z.string().optional(),
  }),
});
export type HookInput = z.infer<typeof hookInputSchema>;
export const claudeDirectory = () =>
  resolve(process.env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`);

export function denyPlan(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'deny' as const,
      permissionDecisionReason: `Conduct did not approve this plan. ${reason}`,
    },
  };
}

export function planResult(input: HookInput, round: Round, outputPath: string) {
  const feedback = `Review file: ${outputPath}\n\n${markdown([round])}`;
  if (round.decision === 'changes_requested')
    return denyPlan(
      `The user requested changes. Stay in plan mode, address the open inline comments and suggested edits, update the plan, then call ExitPlanMode again for a new Conduct review. Do not implement yet.\n\n${feedback}`,
    );
  if (round.decision !== 'approved' || round.source.content !== input.tool_input.plan)
    return denyPlan('The review does not contain explicit approval of this exact plan.');
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'allow' as const,
      permissionDecisionReason: 'The user approved this plan in Conduct.',
      // ExitPlanMode also requires updatedInput to skip its native approval chooser.
      updatedInput: input.tool_input,
      additionalContext: `The user approved this plan in Conduct. Continue in this conversation using the existing tool permissions. Consider the open inline feedback below while implementing; suggestions have not changed the source file.\n\n${feedback}`,
    },
  };
}

export async function reviewClaudePlan(
  rawInput: unknown,
  options: {
    directory?: string;
    timeout?: number;
    noOpen?: boolean;
    signal?: AbortSignal;
    onReady?: (app: Awaited<ReturnType<typeof startServer>>) => void | Promise<void>;
  } = {},
) {
  const input = hookInputSchema.parse(rawInput);
  const timeout = options.timeout ?? 3540;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3540)
    throw new Error('Plan review timeout must be between 0 and 3540 seconds.');
  const deadline = Date.now() + timeout * 1000;
  const directory = resolve(
    options.directory ?? `${claudeDirectory()}/conduct/reviews`,
    crypto.randomUUID(),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = `${directory}/plan.md`;
  const outputPath = `${directory}/feedback.json`;
  const originalPath = input.tool_input.planFilePath
    ? resolve(input.cwd, input.tool_input.planFilePath)
    : undefined;
  const content = input.tool_input.plan;
  const current = async () =>
    !options.signal?.aborted &&
    Date.now() < deadline &&
    (!originalPath || (await Bun.file(originalPath).text()) === content);
  if (!(await current()))
    return denyPlan(
      'The plan file differs from the plan supplied by Claude. Present the current plan again.',
    );
  await Bun.write(file, content, { mode: 0o600 });
  await Bun.write(
    `${directory}/invocation.json`,
    JSON.stringify(
      {
        sessionId: input.session_id,
        toolUseId: input.tool_use_id,
        cwd: input.cwd,
        originalPath,
        sourceHash: hash(content),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  const app = await startServer({
    file,
    out: outputPath,
    mode: 'plan',
    originalPath,
    isSourceCurrent: current,
  });
  try {
    await Bun.write(
      `${directory}/session.json`,
      JSON.stringify(
        { url: app.url, feedbackPath: outputPath, expiresAt: new Date(deadline).toISOString() },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    console.error(
      `\nConduct: Review Claude’s plan\n${app.url}\nFeedback: ${outputPath}\nWaiting for Approve plan or Request changes (up to ${Math.ceil(timeout / 60)} minutes).\n`,
    );
    if (!options.noOpen) await openBrowser(app.url);
    await options.onReady?.(app);
    while (await current()) {
      const round = app.store.read().rounds.at(-1);
      if (round) {
        const result = planResult(input, round, outputPath);
        await Bun.sleep(400);
        if (!(await current())) break;
        await Bun.write(`${directory}/result.json`, JSON.stringify(result, null, 2) + '\n', {
          mode: 0o600,
        });
        return result;
      }
      await Bun.sleep(200);
    }
    return denyPlan(
      'Review was cancelled, expired, or the plan file changed. Feedback remains saved. Ask the user before presenting another review.',
    );
  } finally {
    await app.close();
  }
}

export async function runClaudeHook(options: { timeout?: number; noOpen?: boolean }) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const raw: unknown = JSON.parse(await Bun.stdin.text());
    console.log(
      JSON.stringify(await reviewClaudePlan(raw, { ...options, signal: controller.signal })),
    );
  } catch (error) {
    console.log(
      JSON.stringify(denyPlan(error instanceof Error ? error.message : 'Plan review failed.')),
    );
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
