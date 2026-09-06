import { resolve } from 'node:path';

export async function run(command: string[], cwd: string, env = process.env, input?: string) {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${command[0]} exited ${code}: ${stderr}\n${stdout}`);
  return stdout;
}

export async function smoke(command: string[], directory: string, env = process.env) {
  for (const [extension, content] of Object.entries({
    md: '# Packaged review\n\nReady for feedback.',
    html: '<h1 class="text-3xl">Packaged review</h1>',
    tsx: 'import {Card} from "conduct/ui"; export default function App(){return <Card className="p-8">Packaged review</Card>}',
  })) {
    const source = resolve(directory, `proposal.${extension}`);
    await Bun.write(source, content);
    const child = Bun.spawn([...command, source, '--no-open'], {
      cwd: directory,
      env,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    });
    let timer: ReturnType<typeof setTimeout>;
    const url = new Promise<URL>((resolveURL, reject) => {
      timer = setTimeout(
        () => reject(new Error('Presenter did not start within 30 seconds')),
        30_000,
      );
      (async () => {
        let output = '';
        for await (const chunk of child.stderr) {
          output += new TextDecoder().decode(chunk);
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#[a-f0-9]+/);
          if (match) resolveURL(new URL(match[0]));
        }
        reject(new Error(`Presenter exited before startup: ${output}`));
      })().catch(reject);
    });
    try {
      const location = await url;
      const headers = { Authorization: `Bearer ${location.hash.slice(1)}` };
      const get = (path: string) => fetch(`${location.origin}${path}`, { headers });
      const preview = await get(extension === 'tsx' ? '/__preview/preview.js' : '/preview');
      if (!preview.ok || !(await preview.text()).includes('Packaged review'))
        throw new Error(`${extension} preview failed`);
      const styles = await get('/__preview/tailwind.css');
      if (!styles.ok || !(await styles.text()).includes('--primary'))
        throw new Error('Tailwind assets missing');
      const state = await (await get('/api/review')).json();
      const submitted = await fetch(`${location.origin}/api/submit`, {
        method: 'POST',
        headers: { ...headers, Origin: location.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: state.revision }),
      });
      if (!submitted.ok) throw new Error(`Submission failed: ${await submitted.text()}`);
      const feedback = JSON.parse(
        await run([...command, 'wait', source, '--timeout', '2'], directory, env),
      );
      if (feedback.rounds.length !== 1 || feedback.rounds[0].source.content !== content)
        throw new Error('Feedback handoff lost the source snapshot');
    } finally {
      clearTimeout(timer!);
      child.kill('SIGTERM');
      await child.exited;
    }
    console.log(`Verified ${extension} rendering and submitted feedback.`);
  }
}
