import { beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { captureAnchor, locateAnchor, rangeFor, textContent } from '../src/client/anchors';
import type { Anchor } from '../src/model';

beforeAll(() => {
  const window = new Window();
  Object.assign(globalThis, {
    document: window.document,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
});
function content(html: string) {
  const root = document.createElement('article');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe('text anchors', () => {
  test('captures a selection spanning bold, links, and multiple paragraphs', () => {
    const root = content(
      '<h1 data-source-line="1" data-source-end-line="1">Plan</h1><p data-source-line="3" data-source-end-line="3">Build <strong>something useful</strong> with <a>care</a>.</p><p data-source-line="5" data-source-end-line="5">Then share it.</p>',
    );
    const range = document.createRange();
    range.setStart(root.querySelector('strong')!.firstChild!, 4);
    range.setEnd(root.querySelectorAll('p')[1].firstChild!, 4);
    const anchor = captureAnchor(root, range)!;
    expect(anchor.exact).toBe('thing useful with care.Then');
    expect(anchor.heading).toBe('Plan');
    expect(anchor.sourceLine).toBe(3);
    expect(anchor.sourceEndLine).toBe(5);
    expect(rangeFor(root, anchor.start, anchor.end)!.toString()).toBe(anchor.exact);
  });
  test('keeps repeated text distinct and relocates it by context', () => {
    const root = content('<p>The first launch is soon.</p><p>The second launch is later.</p>');
    const node = root.lastChild!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 11);
    range.setEnd(node, 17);
    const anchor = captureAnchor(root, range)!;
    const text = textContent(root);
    expect(anchor.exact).toBe('launch');
    expect(locateAnchor(text, anchor)?.start).toBe(text.lastIndexOf('launch'));
    const shifted: Anchor = { ...anchor, prefix: 'The second ' };
    expect(locateAnchor('New section.' + text, shifted)?.start).toBe(
      text.lastIndexOf('launch') + 12,
    );
    expect(locateAnchor('The second launch is different.', shifted)).toBeNull();
  });
  test('does not guess when the context is ambiguous', () => {
    expect(
      locateAnchor('a word b a word b', {
        exact: 'word',
        prefix: 'a ',
        suffix: ' b',
        start: 99,
        end: 103,
        selector: 'p',
      }),
    ).toBeNull();
  });
  test('ignores scripts, hidden content, and replacement decorations in offsets', () => {
    const root = content(
      '<p>Hello <ins data-mf-ui="edit">better </ins><b>world</b>.</p><script>secret</script><style>p{}</style><p hidden>hidden</p>',
    );
    expect(textContent(root)).toBe('Hello world.');
    const range = rangeFor(root, 6, 11)!;
    expect(range.toString()).toBe('world');
    expect(captureAnchor(root, range)?.start).toBe(6);
  });
  test('supports element boundaries, unicode, and selections ending at a node boundary', () => {
    const root = content('<p>A 🌱 grows <strong>here</strong>.</p>');
    const range = document.createRange();
    range.selectNodeContents(root);
    const anchor = captureAnchor(root, range)!;
    expect(anchor.exact).toBe('A 🌱 grows here.');
    expect(rangeFor(root, 2, 4)!.toString()).toBe('🌱');
    expect(rangeFor(root, 11, 15)!.toString()).toBe('here');
  });
  test('ignores collapsed and outside selections', () => {
    const root = content('<p>text</p>');
    const range = document.createRange();
    range.setStart(root.firstChild!.firstChild!, 0);
    range.collapse(true);
    expect(captureAnchor(root, range)).toBeNull();
    const outside = document.createTextNode('outside');
    document.body.append(outside);
    range.selectNodeContents(outside);
    expect(captureAnchor(root, range)).toBeNull();
  });
});
