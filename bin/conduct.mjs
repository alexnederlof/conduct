#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const failureCode = args[0] === 'claude-hook' ? 2 : 1;
const require = createRequire(import.meta.url);

try {
  const executable = process.versions.bun ? process.execPath : require.resolve('bun/bin/bun.exe');
  const child = spawn(
    executable,
    [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), ...args],
    {
      stdio: 'inherit',
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => {
    console.error(`Conduct: Could not start the bundled Bun runtime: ${error.message}`);
    process.exitCode = failureCode;
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    } else process.exitCode = code ?? failureCode;
  });
} catch (error) {
  console.error(
    `Conduct: Bundled runtime missing. Reinstall with optional dependencies and install scripts enabled.\n${error.message}`,
  );
  process.exitCode = failureCode;
}
