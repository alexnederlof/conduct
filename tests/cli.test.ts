import { expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('CLI expires cleanly and prints a working resume command with quoted paths', async () => {
  const directory = resolve('.temp', `cli-${crypto.randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const file = `${directory}/reader's draft.md`;
  const output = `${directory}/saved feedback.json`;
  await Bun.write(file, '# Resume me');
  const child = Bun.spawn(
    [process.execPath, 'src/cli.ts', file, '--out', output, '--expire', '0.001', '--no-open'],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(stderr).toContain('stopped after 0.001 idle minutes');
  const command = stderr.match(/Resume: (.+)/)![1]!;
  const resumed = Bun.spawn(['sh', '-c', `${command} --no-open`], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const resumedError = await new Response(resumed.stderr).text();
  expect(await resumed.exited).toBe(0);
  expect(resumedError).toContain('stopped after 0.001 idle minutes');
  expect(await Bun.file(output).exists()).toBe(true);
});

test('CLI rejects invalid idle durations before presenting', async () => {
  for (const value of ['-1', 'Infinity', 'no', '']) {
    const child = Bun.spawn(
      [process.execPath, 'src/cli.ts', 'missing.md', `--expire=${value}`, '--no-open'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(1);
    expect(stderr).toContain('Invalid --expire.');
  }
});
