import { basename, dirname, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import MarkdownIt from 'markdown-it';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { compile } from 'tailwindcss';
import { Scanner } from '@tailwindcss/oxide';
import type { Source } from './model';

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dir, '..');
const uiNames = ['button', 'card', 'badge', 'input', 'textarea', 'tabs', 'accordion'];
const uiModules = new Map([
  ['conduct/ui', resolve(packageRoot, 'src/ui/index.ts')],
  ...uiNames.map(
    (name) => [`conduct/ui/${name}`, resolve(packageRoot, `src/ui/${name}.tsx`)] as const,
  ),
]);
const uiSource = () =>
  Promise.all(uiNames.map((name) => Bun.file(uiModules.get(`conduct/ui/${name}`)!).text()));
export const hash = (content: string | Uint8Array) =>
  new Bun.CryptoHasher('sha256').update(content).digest('hex');

export async function readSource(path: string): Promise<Source> {
  const extension = extname(path).toLowerCase();
  const format = ['.md', '.markdown'].includes(extension)
    ? 'markdown'
    : ['.html', '.htm'].includes(extension)
      ? 'html'
      : ['.tsx', '.jsx'].includes(extension)
        ? 'react'
        : null;
  if (!format) throw new Error('Choose a .md, .markdown, .html, .htm, .tsx, or .jsx file.');
  const content = await Bun.file(path).text();
  return { path, name: basename(path), format, content, hash: hash(content) };
}

async function tailwind(content: string) {
  const css = await Promise.all(
    ['theme.css', 'preflight.css', 'utilities.css'].map((file) =>
      Bun.file(require.resolve(`tailwindcss/${file}`)).text(),
    ),
  );
  const compiler = await compile(
    `@layer theme, base, components, utilities;\n@layer theme {${css[0]}}\n@layer base {${css[1]}}\n${css[2]}\n${await Bun.file(resolve(packageRoot, 'src/ui/tailwind.css')).text()}`,
  );
  const candidates = new Scanner({}).scanFiles([{ content, extension: 'tsx' }]);
  return compiler.build(candidates);
}

export async function bundle(entrypoint: string) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: 'browser',
    format: 'iife',
    minify: true,
  });
  if (!result.success) throw new Error(result.logs.join('\n'));
  return result.outputs[0].text();
}

export async function renderSource(source: Source) {
  let html: string;
  const assets = new Map<string, { body: string | Blob; type: string }>();
  let scanContent = source.content;
  if (source.format === 'markdown') {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    md.core.ruler.push('source-lines', (state) => {
      for (const token of state.tokens) {
        if (
          token.map &&
          (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block')
        ) {
          token.attrSet('data-source-line', String(token.map[0] + 1));
          token.attrSet('data-source-end-line', String(token.map[1]));
        }
      }
    });
    const fence = md.renderer.rules.fence!;
    md.renderer.rules.fence = (tokens, index, options, env, renderer) =>
      fence(tokens, index, options, env, renderer).replace(
        '<pre>',
        `<pre ${renderer.renderAttrs(tokens[index])}>`,
      );
    html = `<!doctype html><html><head><meta charset="utf-8"></head><body class="mf-markdown"><article>${md.render(source.content)}</article></body></html>`;
  } else if (source.format === 'react') {
    const sourceTexts: string[] = [];
    const result = await Bun.build({
      entrypoints: ['conduct:entry'],
      target: 'browser',
      format: 'iife',
      minify: true,
      naming: 'preview.[ext]',
      plugins: [
        {
          name: 'preview',
          setup(build) {
            build.onResolve({ filter: /^conduct:entry$/ }, () => ({
              path: 'entry',
              namespace: 'preview',
            }));
            build.onLoad({ filter: /.*/, namespace: 'preview' }, () => ({
              contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from ${JSON.stringify(source.path)}; createRoot(document.getElementById('preview-root')).render(React.createElement(App));`,
              loader: 'tsx',
              resolveDir: dirname(source.path),
            }));
            build.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
              path: require.resolve(args.path),
            }));
            build.onResolve({ filter: /^conduct\/ui(?:\/.*)?$/ }, (args) => {
              const path = uiModules.get(args.path);
              if (!path) throw new Error(`Unknown built-in component: ${args.path}`);
              return { path };
            });
            build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
              if (args.path.includes('/node_modules/')) return;
              const contents = await Bun.file(args.path).text();
              sourceTexts.push(contents);
              return {
                contents,
                loader: extname(args.path).slice(1) as 'js' | 'jsx' | 'ts' | 'tsx',
              };
            });
          },
        },
      ],
    });
    if (!result.success)
      throw new Error(`React preview could not compile:\n${result.logs.join('\n')}`);
    scanContent += '\n' + sourceTexts.join('\n');
    for (const output of result.outputs)
      assets.set(basename(output.path), { body: output, type: output.type });
    const stylesheet = assets.has('preview.css')
      ? '<link rel="stylesheet" href="/__preview/preview.css">'
      : '';
    html = `<!doctype html><html><head><meta charset="utf-8">${stylesheet}</head><body><div id="preview-root"></div><script src="/__preview/preview.js"></script></body></html>`;
  } else {
    const doc = parse(source.content, { sourceCodeLocationInfo: true });
    const annotate = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node && node.sourceCodeLocation) {
        node.attrs = node.attrs.filter((attr) => !attr.name.startsWith('data-source-'));
        node.attrs.push(
          { name: 'data-source-line', value: String(node.sourceCodeLocation.startLine) },
          { name: 'data-source-end-line', value: String(node.sourceCodeLocation.endLine) },
        );
      }
      if ('childNodes' in node) node.childNodes.forEach(annotate);
    };
    annotate(doc);
    html = serialize(doc);
  }
  assets.set('tailwind.css', {
    body: await tailwind(scanContent + '\n' + (await uiSource()).join('\n')),
    type: 'text/css',
  });
  return { html, assets };
}

export async function clientAssets() {
  const [app, frame, css, previewCss, theme, fontCss, componentCss] = await Promise.all([
    bundle(resolve(packageRoot, 'src/client/app.tsx')),
    bundle(resolve(packageRoot, 'src/client/frame.ts')),
    Bun.file(resolve(packageRoot, 'src/client/app.css')).text(),
    Bun.file(resolve(packageRoot, 'src/client/preview.css')).text(),
    Bun.file(resolve(packageRoot, 'src/client/theme.css')).text(),
    Promise.all(
      ['wght.css', 'wght-italic.css'].map((name) =>
        Bun.file(require.resolve(`@fontsource-variable/inter/${name}`)).text(),
      ),
    ).then((parts) => parts.join('\n')),
    uiSource().then(async (parts) =>
      tailwind(
        parts.join('\n') +
          '\n' +
          (await Bun.file(resolve(packageRoot, 'src/client/app.tsx')).text()),
      ),
    ),
  ]);
  const fonts = new Map<string, Blob>();
  const fontStyles = fontCss.replaceAll(/\.\/files\/([^)]*)/g, (_, name: string) => {
    fonts.set(name, Bun.file(require.resolve(`@fontsource-variable/inter/files/${name}`)));
    return `/__app/fonts/${name}`;
  });
  return {
    app,
    frame,
    fonts,
    css: componentCss + '\n' + fontStyles + '\n' + theme + '\n' + css,
    previewCss: fontStyles + '\n' + theme + '\n' + previewCss,
  };
}

export function previewHtml(html: string, token: string) {
  const doc = parse(html);
  const prepare = (node: DefaultTreeAdapterMap['node']) => {
    if ('childNodes' in node) {
      node.childNodes = node.childNodes.filter(
        (child) =>
          !(
            'tagName' in child &&
            (child.tagName === 'base' ||
              (child.tagName === 'meta' &&
                child.attrs.some(
                  (attr) => attr.name === 'http-equiv' && attr.value.toLowerCase() === 'refresh',
                )))
          ),
      );
      node.childNodes.forEach(prepare);
    }
    if ('attrs' in node) {
      for (const attr of node.attrs) {
        if (['src', 'href'].includes(attr.name) && attr.value.startsWith('/__preview/'))
          attr.value = attr.value.replace('/__preview/', `/__preview/${token}/`);
        if (
          (['src', 'poster'].includes(attr.name) ||
            (attr.name === 'href' && node.tagName === 'link')) &&
          attr.value.startsWith('/') &&
          !attr.value.startsWith('//') &&
          !attr.value.startsWith('/__')
        ) {
          attr.value = `/assets/${token}/${attr.value.slice(1)}`;
        }
      }
    }
  };
  prepare(doc);
  const head = doc.childNodes
    .flatMap((node) => ('childNodes' in node ? node.childNodes : []))
    .find((node) => 'tagName' in node && node.tagName === 'head');
  const inject = `<base href="/assets/${token}/"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/__preview/${token}/tailwind.css"><link rel="stylesheet" href="/__app/preview.css"><script src="/__app/frame.js" data-channel="${token}"></script>`;
  // Parse the head additions so malformed source markup cannot swallow the bridge.
  const additions = parse(`<html><head>${inject}</head></html>`)
    .childNodes.flatMap((node) => ('childNodes' in node ? node.childNodes : []))
    .find((node) => 'tagName' in node && node.tagName === 'head');
  if (head && 'childNodes' in head && additions && 'childNodes' in additions)
    head.childNodes.unshift(...additions.childNodes);
  return serialize(doc);
}
