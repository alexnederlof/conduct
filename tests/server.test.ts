import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from '../src/server';
import type { EntryInput, PublicReview } from '../src/model';

const apps: Awaited<ReturnType<typeof startServer>>[] = [];
async function fixture(content = '# Review\n\nHello **world**.', extension = 'md') {
  const directory = resolve('.temp', `server-${crypto.randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const file = `${directory}/draft.${extension}`;
  await Bun.write(file, content);
  const app = await startServer({ file });
  apps.push(app);
  const url = new URL(app.url);
  const token = url.hash.slice(1);
  const origin = url.origin;
  const get = (path: string) =>
    fetch(origin + path, { headers: { Authorization: `Bearer ${token}` } });
  const post = (path: string, body: unknown, options: { token?: string; origin?: string } = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token ?? token}`,
        Origin: options.origin ?? origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const state: PublicReview = await (await get('/api/review')).json();
  return { ...app, token, previewToken: state.previewToken, origin, file, directory, get, post };
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
const input: EntryInput = {
  kind: 'edit',
  anchor: {
    exact: 'Hello',
    prefix: 'Review\n',
    suffix: ' world.',
    start: 7,
    end: 12,
    selector: 'article > p',
    sourceLine: 3,
    sourceEndLine: 3,
  },
  body: 'Friendlier',
  replacement: 'Hi',
};

describe('local presenter', () => {
  test('persists a complete review and never modifies the original', async () => {
    const app = await fixture();
    const original = await Bun.file(app.file).text();
    const state: PublicReview = await (await app.get('/api/review')).json();
    expect(state.source).not.toHaveProperty('content');
    const add = await app.post('/api/entries', { revision: state.revision, entry: input });
    expect(add.status).toBe(200);
    expect(
      (await app.post('/api/notes', { revision: 1, notes: 'Ready for the next draft.' })).status,
    ).toBe(200);
    expect((await app.post('/api/submit', { revision: 2 })).status).toBe(200);
    const exported = await (await app.get('/api/export')).json();
    expect(exported.rounds[0].entries[0].anchor.exact).toBe('Hello');
    expect(exported.rounds[0].entries[0].replacement).toBe('Hi');
    expect(exported.rounds[0].notes).toBe('Ready for the next draft.');
    expect(await Bun.file(app.file).text()).toBe(original);
    expect((await Bun.file(app.outputPath).json()).status).toBe('submitted');
  });
  test('blocks unauthorized reads, cross-origin writes, and malformed anchors', async () => {
    const app = await fixture();
    expect((await fetch(app.origin + '/api/review')).status).toBe(401);
    expect((await app.post('/api/submit', { revision: 0 }, { token: 'wrong' })).status).toBe(401);
    expect(
      (await app.post('/api/submit', { revision: 0 }, { origin: 'https://untrusted.example' }))
        .status,
    ).toBe(403);
    expect((await app.post('/api/submit', { revision: 0 }, { origin: 'null' })).status).toBe(403);
    expect(
      (
        await app.post('/api/entries', {
          revision: 0,
          entry: { ...input, anchor: { ...input.anchor, end: 3 } },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.post('/api/entries', {
          revision: 0,
          entry: { kind: 'comment', anchor: input.anchor, body: ' ' },
        })
      ).status,
    ).toBe(400);
    expect(app.store.read().revision).toBe(0);
  });
  test('detects changed sources and rejects feedback against the wrong version', async () => {
    const app = await fixture();
    await Bun.write(app.file, '# Changed\nNew text');
    expect((await (await app.get('/api/review')).json()).stale).toBe(true);
    expect((await app.post('/api/entries', { revision: 0, entry: input })).status).toBe(409);
    expect((await app.post('/api/submit', { revision: 0 })).status).toBe(409);
    expect(app.store.read().entries).toHaveLength(0);
  });
  test('renders Markdown tables, source lines, and a sandbox-ready bridge', async () => {
    const app = await fixture('# Review\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    const response = await app.get('/preview');
    const html = await response.text();
    expect(html).toContain('<table');
    expect(html).toContain('data-source-line="3"');
    expect(html).toContain('/__app/frame.js');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox allow-scripts;');
    expect(await (await fetch(app.origin + '/')).text()).toContain('/__app/app.js');
  });
  test('compiles React in the browser with React and Tailwind available outside this project', async () => {
    const app = await fixture(
      'export default function App(){ return <div className="bg-lime-900 p-8">Hello React</div> }',
      'tsx',
    );
    const response = await app.get('/__preview/preview.js');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Hello React');
    const css = await (await app.get('/__preview/tailwind.css')).text();
    expect(css).toContain('.bg-lime-900');
    expect(css).toContain('.p-8');
    expect(await (await app.get('/preview')).text()).toContain('preview-root');
  });
  test('allows explicit local assets but rejects hidden paths, symlinks outside the source folder, and documents', async () => {
    const app = await fixture();
    await Bun.write(`${app.directory}/image.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await symlink(resolve('package.json'), `${app.directory}/outside.css`);
    expect((await app.get('/assets/image.svg')).status).toBe(200);
    expect((await app.get('/assets/.secret.css')).status).toBe(403);
    expect((await app.get('/assets/draft.md')).status).toBe(403);
    expect((await app.get('/assets/outside.css')).status).toBe(403);
  });
  test('provides shadcn components and their styles without a document project install', async () => {
    const app = await fixture(
      `import { Card, CardContent, Tabs, TabsList, TabsTrigger } from 'conduct/ui';
       import { Button } from 'conduct/ui/button';
       export default function App() { return <Card><CardContent><Tabs defaultValue="one"><TabsList><TabsTrigger value="one">One</TabsTrigger></TabsList></Tabs><Button variant="outline">Built in</Button></CardContent></Card> }`,
      'tsx',
    );
    const js = await (await app.get('/__preview/preview.js')).text();
    expect(js).toContain('Built in');
    expect(js).toContain('tabs-trigger');
    const css = await (await app.get('/__preview/tailwind.css')).text();
    expect(css).toContain('.bg-primary');
    expect(css).toContain('.rounded-xl');
    expect(css).toContain('var(--primary)');
    expect(css).toContain('[data-state="active"]');
    expect(css).toContain('[data-state=open] > svg');
  });
  test('serves bundled Inter fonts to both the shell and sandbox without a remote font service', async () => {
    const app = await fixture();
    const response = await fetch(`${app.origin}/__app/preview.css`);
    const css = await response.text();
    expect(css).toContain('Inter Variable');
    const fontPath = css.match(/url\((\/__app\/fonts\/[^)]+)\)/)?.[1];
    expect(fontPath).toBeDefined();
    const font = await fetch(app.origin + fontPath);
    expect(font.headers.get('Content-Type')).toBe('font/woff2');
    expect(font.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
  test('prevents using the source file as feedback output', async () => {
    const app = await fixture();
    await expect(startServer({ file: app.file, out: app.file })).rejects.toThrow('overwrite');
  });
  test('preserves HTML source locations and resolves local relative assets through the session', async () => {
    const app = await fixture(
      '<!doctype html><html><head><base href="https://example.com/"></head><body>\n<h1>My review</h1>\n<img src="photo.svg"><link rel="stylesheet" href="/theme.css"></body></html>',
      'html',
    );
    await Bun.write(`${app.directory}/photo.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const html = await (await app.get('/preview')).text();
    expect(html).toContain(`base href="/assets/${app.previewToken}/"`);
    expect(html).not.toContain('https://example.com/');
    expect(html).toContain('h1 data-source-line="2" data-source-end-line="2"');
    expect(html).toContain(`href="/assets/${app.previewToken}/theme.css"`);
    expect((await fetch(`${app.origin}/assets/${app.previewToken}/photo.svg`)).status).toBe(200);
    expect((await fetch(`${app.origin}/assets/wrong/photo.svg`)).status).toBe(401);
  });
  test('bundles a React component’s imported stylesheet and exposes it through the authenticated preview path', async () => {
    const directory = resolve('.temp', `react-css-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    await Bun.write(`${directory}/theme.css`, '.special { color: rebeccapurple; }');
    await Bun.write(
      `${directory}/card.tsx`,
      'import "./theme.css"; export default function Card(){return <h1 className="special">Styled</h1>}',
    );
    const app = await startServer({ file: `${directory}/card.tsx` });
    apps.push(app);
    const url = new URL(app.url);
    const state: PublicReview = await (
      await fetch(`${url.origin}/api/review`, {
        headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
      })
    ).json();
    const html = await (await fetch(`${url.origin}/preview?token=${state.previewToken}`)).text();
    expect(html).toContain(`/__preview/${state.previewToken}/preview.css`);
    const css = await fetch(`${url.origin}/__preview/${state.previewToken}/preview.css`);
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('.special');
  });
  test('allows external scripts and modules inside the preview while the review shell stays restricted', async () => {
    const app = await fixture(
      '<script src="https://cdn.example.com/chart.js" crossorigin="anonymous"></script><script type="module">import chart from "https://modules.example.com/chart.js";</script>',
      'html',
    );
    const response = await app.get('/preview');
    const html = await response.text();
    expect(html).toContain('src="https://cdn.example.com/chart.js"');
    expect(html).toContain('type="module"');
    expect(html).toContain('https://modules.example.com/chart.js');
    const policy = response.headers.get('Content-Security-Policy')!;
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' http: https: data: blob:");
    expect(policy).toContain('connect-src http: https: ws: wss: data: blob:');
    expect(policy).toContain('worker-src http: https: blob:');
    expect(policy).not.toContain('allow-same-origin');
    const shell = await fetch(app.origin);
    expect(shell.headers.get('Content-Security-Policy')).toContain("script-src 'self';");
  });
  test('the token exposed to document scripts cannot read or change reviews', async () => {
    const app = await fixture();
    expect(app.previewToken).not.toBe(app.token);
    const preview = await fetch(`${app.origin}/preview?token=${app.previewToken}`);
    const html = await preview.text();
    expect(preview.status).toBe(200);
    expect(html).not.toContain(app.token);
    expect(html).toContain(`data-channel="${app.previewToken}"`);
    for (const path of ['/api/review', '/api/export']) {
      expect((await fetch(`${app.origin}${path}?token=${app.previewToken}`)).status).toBe(401);
      expect(
        (
          await fetch(`${app.origin}${path}`, {
            headers: { Authorization: `Bearer ${app.previewToken}` },
          })
        ).status,
      ).toBe(401);
    }
    expect(
      (await app.post('/api/submit', { revision: 0 }, { token: app.previewToken })).status,
    ).toBe(401);
    expect(app.store.read().revision).toBe(0);
  });
});
