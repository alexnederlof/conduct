import type { Anchor } from '../model';

export function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest(
        'script, style, noscript, template, [data-mf-ui], [hidden], [aria-hidden="true"]',
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

export function textContent(root: Node) {
  return textNodes(root)
    .map((node) => node.data)
    .join('');
}

function selectorFor(element: Element, root: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const siblings: Element[] = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current!.tagName,
        )
      : [];
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = current.parentElement;
  }
  return parts.join(' > ') || ':scope';
}

export function captureAnchor(root: Element, range: Range): Anchor | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer) || range.collapsed)
    return null;
  const nodes = textNodes(root);
  const all = nodes.map((node) => node.data).join('');
  let offset = 0;
  let start: number | undefined;
  let end: number | undefined;
  for (const node of nodes) {
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += node.length;
  }
  // Element-boundary selections (for example Select All) use DOM range comparisons.
  if (start === undefined || end === undefined) {
    const before = root.ownerDocument.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    start = textContent(before.cloneContents()).length;
    before.setEnd(range.endContainer, range.endOffset);
    end = textContent(before.cloneContents()).length;
  }
  const exact = all.slice(start, end);
  if (!exact.trim()) return null;
  const element =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement!;
  const source = element.closest('[data-source-line]');
  const endElement =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as Element)
      : range.endContainer.parentElement;
  const endSource = endElement?.closest('[data-source-line]');
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const heading =
    headings
      .filter(
        (h) =>
          h === element ||
          h.contains(element) ||
          Boolean(h.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
      )
      .at(-1)?.textContent ?? undefined;
  return {
    exact,
    prefix: all.slice(Math.max(0, start - 80), start),
    suffix: all.slice(end, end + 80),
    start,
    end,
    selector: selectorFor(element, root),
    heading,
    ...(source
      ? {
          sourceLine: Number(source.getAttribute('data-source-line')),
          sourceEndLine: Number(
            endSource?.getAttribute('data-source-end-line') ??
              source.getAttribute('data-source-end-line'),
          ),
        }
      : {}),
  };
}

export function locateAnchor(text: string, anchor: Anchor): { start: number; end: number } | null {
  const contextMatches = (start: number) =>
    text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix &&
    text.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length) ===
      anchor.suffix;
  if (text.slice(anchor.start, anchor.end) === anchor.exact && contextMatches(anchor.start))
    return { start: anchor.start, end: anchor.end };
  const candidates: { start: number; end: number }[] = [];
  let position = text.indexOf(anchor.exact);
  while (position !== -1) {
    if (contextMatches(position))
      candidates.push({ start: position, end: position + anchor.exact.length });
    position = text.indexOf(anchor.exact, position + 1);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function rangeFor(root: Element, start: number, end: number): Range | null {
  const range = root.ownerDocument.createRange();
  let offset = 0;
  let begun = false;
  for (const node of textNodes(root)) {
    if (!begun && start < offset + node.length) {
      range.setStart(node, start - offset);
      begun = true;
    }
    if (begun && end <= offset + node.length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += node.length;
  }
  return null;
}
