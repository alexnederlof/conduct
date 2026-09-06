import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const node = Bun.which('node');
if (!node) throw new Error('Launcher tests require Node.js');
const launcher = resolve('bin/conduct.mjs');
async function invoke(args: string[], input?: string) {
  const child = Bun.spawn([node!, launcher, ...args], {
    env: { ...process.env, PATH: '' },
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  return { code, stdout };
}

test('Node launcher uses the packaged runtime without Bun on PATH', async () => {
  const result = await invoke(['--version']);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe((await Bun.file('package.json').json()).version);
});

test('Node launcher forwards hook input and preserves a structured denial', async () => {
  const result = await invoke(['claude-hook', '--no-open'], '{}');
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
});

test('Node launcher preserves the blocking hook exit code for malformed arguments', async () => {
  expect((await invoke(['claude-hook', '--invalid'])).code).toBe(2);
  expect((await invoke(['--invalid'])).code).toBe(1);
});
