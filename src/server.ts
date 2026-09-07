import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { z } from 'zod/v4';
import { ConflictError, ReviewStore, acquireLock } from './store';
import { clientAssets, hash, previewHtml, readSource, renderSource } from './render';
import { decisionSchema, entryInputSchema, type Review, type PublicReview } from './model';

const mutationSchema = z.object({ revision: z.number().int().nonnegative() });
const assetsAllowed = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.js',
  '.mjs',
]);
const shell =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Conduct</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/__app/app.css"></head><body><div id="root"></div><script src="/__app/app.js"></script></body></html>';

export async function startServer(options: {
  file: string;
  out?: string;
  port?: number;
  expire?: number;
  resumeCommand?: string;
  onExpire?: () => void;
  mode?: Review['mode'];
  originalPath?: string;
  isSourceCurrent?: () => Promise<boolean>;
}) {
  const expire = options.expire ?? 30;
  if (!Number.isFinite(expire) || expire < 0) throw new Error('Invalid --expire.');
  const sourcePath = await realpath(resolve(options.file));
  const outputPath = resolve(options.out ?? `${resolve(options.file)}.feedback.json`);
  if (
    outputPath === sourcePath ||
    (await realpath(outputPath).catch(() => outputPath)) === sourcePath
  )
    throw new Error('The feedback output cannot overwrite the source document.');
  const release = await acquireLock(outputPath);
  try {
    const source = await readSource(sourcePath);
    if (options.originalPath) {
      source.path = options.originalPath;
      source.name = options.originalPath.split(/[\\/]/).at(-1)!;
    }
    const [rendered, client] = await Promise.all([renderSource(source), clientAssets()]);
    const store = await ReviewStore.open(outputPath, source, options.mode);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const previewToken =
      crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const sourceDirectory = dirname(source.path);
    const stale = async () =>
      hash(await Bun.file(sourcePath).text()) !== source.hash ||
      (options.isSourceCurrent ? !(await options.isSourceCurrent()) : false);
    const publicState = async (state: Review): Promise<PublicReview> => {
      const { content, ...sourceInfo } = state.source;
      const { rounds, archivedDrafts, source: _, ...rest } = state;
      return {
        ...rest,
        source: sourceInfo,
        roundCount: rounds.length,
        stale: await stale().catch(() => true),
        outputPath,
        previewToken,
        resumeCommand: options.resumeCommand,
        decision: rounds.at(-1)?.decision,
      };
    };
    let lastActivity = performance.now();
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: options.port ?? 0,
      idleTimeout: 30,
      maxRequestBodySize: 256 * 1024,
      async fetch(request, server) {
        const url = new URL(request.url);
        const origin = `http://127.0.0.1:${server.port}`;
        const headers: Record<string, string> = {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        };
        const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
        if (url.host !== `127.0.0.1:${server.port}`) return json({ error: 'Invalid host' }, 403);
        try {
          if (request.method === 'GET' && url.pathname === '/')
            return new Response(shell, {
              headers: {
                ...headers,
                'Content-Type': 'text/html',
                'Content-Security-Policy':
                  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
              },
            });
          const clientFiles: Record<string, [string, string]> = {
            '/__app/app.js': [client.app, 'text/javascript'],
            '/__app/frame.js': [client.frame, 'text/javascript'],
            '/__app/app.css': [client.css, 'text/css'],
            '/__app/preview.css': [client.previewCss, 'text/css'],
          };
          if (request.method === 'GET' && clientFiles[url.pathname]) {
            const [body, type] = clientFiles[url.pathname];
            return new Response(body, { headers: { ...headers, 'Content-Type': type } });
          }
          if (request.method === 'GET' && url.pathname.startsWith('/__app/fonts/')) {
            const font = client.fonts.get(url.pathname.slice('/__app/fonts/'.length));
            if (font)
              return new Response(font, {
                headers: {
                  ...headers,
                  'Content-Type': 'font/woff2',
                  'Access-Control-Allow-Origin': '*',
                },
              });
          }
          const reviewAuthorized = request.headers.get('authorization') === `Bearer ${token}`;
          const previewAuthorized =
            request.method === 'GET' &&
            (url.searchParams.get('token') === previewToken ||
              url.pathname.startsWith(`/assets/${previewToken}/`) ||
              url.pathname.startsWith(`/__preview/${previewToken}/`));
          if (!reviewAuthorized && (url.pathname.startsWith('/api/') || !previewAuthorized))
            return json({ error: 'Open the complete review URL printed in your terminal.' }, 401);
          if (request.method !== 'GET' && request.headers.get('origin') !== origin)
            return json({ error: 'Invalid origin' }, 403);
          if (reviewAuthorized && request.method === 'POST') lastActivity = performance.now();
          if (request.method === 'POST' && url.pathname === '/api/activity')
            return json({ ok: true });
          if (request.method === 'GET' && url.pathname === '/api/review')
            return json(await publicState(store.read()));
          if (request.method === 'GET' && url.pathname === '/api/export') return json(store.read());
          if (request.method === 'GET' && url.pathname === '/preview') {
            return new Response(previewHtml(rendered.html, previewToken), {
              headers: {
                ...headers,
                'Content-Type': 'text/html',
                'Content-Security-Policy': `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' http: https: data: blob:; style-src 'unsafe-inline' http: https:; img-src http: https: data: blob:; font-src http: https: data:; media-src http: https: blob:; connect-src http: https: ws: wss: data: blob:; worker-src http: https: blob:; frame-src 'none'; base-uri ${origin}; form-action 'none'`,
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
          if (request.method === 'GET' && url.pathname.startsWith('/__preview/')) {
            const prefix = url.pathname.startsWith(`/__preview/${previewToken}/`)
              ? `/__preview/${previewToken}/`
              : '/__preview/';
            const asset = rendered.assets.get(url.pathname.slice(prefix.length));
            if (asset)
              return new Response(asset.body, {
                headers: {
                  ...headers,
                  'Content-Type': asset.type,
                  'Access-Control-Allow-Origin': '*',
                },
              });
          }
          if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
            if (await stale().catch(() => true))
              return json(
                {
                  error:
                    'The source file changed. Restart the presenter to review the new version. Your feedback is saved.',
                },
                409,
              );
            const body = await request.json();
            const { revision } = mutationSchema.parse(body);
            let state: Review;
            if (url.pathname === '/api/entries')
              state = await store.add(revision, entryInputSchema.parse(body.entry));
            else if (url.pathname === '/api/entry') {
              const input = z
                .object({ id: z.string(), action: z.enum(['resolve', 'reopen', 'delete']) })
                .parse(body);
              state = await store.update(revision, (draft) => {
                const entry = draft.entries.find((item) => item.id === input.id);
                if (!entry) throw new Error('Feedback item no longer exists.');
                if (input.action === 'delete')
                  draft.entries = draft.entries.filter((item) => item.id !== input.id);
                else {
                  entry.status = input.action === 'resolve' ? 'resolved' : 'open';
                  entry.updatedAt = new Date().toISOString();
                }
                draft.status = 'draft';
              });
            } else if (url.pathname === '/api/notes') {
              const { notes } = z.object({ notes: z.string().max(30_000) }).parse(body);
              state = await store.update(revision, (draft) => {
                draft.notes = notes;
                draft.status = 'draft';
              });
            } else if (url.pathname === '/api/submit')
              state = await store.submit(revision, decisionSchema.optional().parse(body.decision));
            else return json({ error: 'Not found' }, 404);
            return json(await publicState(state));
          }
          if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
            const prefix = url.pathname.startsWith(`/assets/${previewToken}/`)
              ? `/assets/${previewToken}/`
              : '/assets/';
            const name = decodeURIComponent(url.pathname.slice(prefix.length));
            if (
              name.split('/').some((part) => part.startsWith('.') || part === 'node_modules') ||
              !assetsAllowed.has(extname(name).toLowerCase())
            )
              return json({ error: 'Asset is not allowed' }, 403);
            const path = await realpath(resolve(sourceDirectory, name));
            const rel = relative(sourceDirectory, path);
            if (rel.startsWith('..') || isAbsolute(rel))
              return json({ error: 'Asset outside document directory' }, 403);
            return new Response(Bun.file(path), {
              headers: { ...headers, 'Access-Control-Allow-Origin': '*' },
            });
          }
          return json({ error: 'Not found' }, 404);
        } catch (error) {
          if (error instanceof z.ZodError)
            return json({ error: error.issues.map((issue) => issue.message).join('; ') }, 400);
          if (error instanceof ConflictError) return json({ error: error.message }, 409);
          if (error instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400);
          return json({ error: error instanceof Error ? error.message : 'Request failed' }, 400);
        }
      },
    });
    let closing: Promise<void> | undefined;
    const close = () => {
      closing ??= (async () => {
        clearInterval(idleTimer);
        await server.stop();
        await release();
      })();
      return closing;
    };
    const idleTimer =
      expire > 0
        ? setInterval(
            () => {
              if (performance.now() - lastActivity >= expire * 60_000)
                void close().then(() => options.onExpire?.());
            },
            Math.min(expire * 60_000, 1000),
          )
        : undefined;
    return {
      server,
      store,
      url: `http://127.0.0.1:${server.port}/#${token}`,
      outputPath,
      close,
    };
  } catch (error) {
    await release();
    throw error;
  }
}
