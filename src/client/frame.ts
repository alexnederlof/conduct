import { captureAnchor, locateAnchor, rangeFor, textContent } from './anchors';
import { insertSuggestion } from './suggestions';
import { followFragment, prepareLink } from './links';
import type { Entry, FrameMessage } from '../model';

const channel = document.currentScript?.getAttribute('data-channel') ?? '';
const parentOrigin = location.origin;
const send = (message: FrameMessage) => parent.postMessage({ channel, ...message }, parentOrigin);
let entries: Entry[] = [];
let active: string | null = null;
let mode = 'comment';
let ranges = new Map<string, Range>();
let observer: MutationObserver;
let paintTimer: ReturnType<typeof setTimeout>;
let removeInsertions: Array<() => void> = [];

function paint() {
  if (!document.body) return;
  observer?.disconnect();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) prepareLink(link);
  for (const remove of removeInsertions.reverse()) remove();
  removeInsertions = [];
  const text = textContent(document.body);
  const comments: Range[] = [];
  const edits: Range[] = [];
  const focused: Range[] = [];
  const orphaned: string[] = [];
  ranges = new Map();
  for (const entry of entries.filter((entry) => entry.status === 'open')) {
    const match = locateAnchor(text, entry.anchor);
    const range = match && rangeFor(document.body, match.start, match.end);
    if (!range) {
      orphaned.push(entry.id);
      continue;
    }
    ranges.set(entry.id, range);
    (entry.kind === 'edit' ? edits : comments).push(range);
    if (entry.id === active) focused.push(range);
  }
  if (CSS.highlights) {
    CSS.highlights.set('mf-comments', new Highlight(...comments));
    CSS.highlights.set('mf-edits', new Highlight(...edits));
    CSS.highlights.set('mf-active', new Highlight(...focused));
  }
  for (const entry of [...entries].sort((a, b) => b.anchor.start - a.anchor.start)) {
    const range = ranges.get(entry.id);
    if (!range || entry.kind !== 'edit' || !entry.replacement) continue;
    removeInsertions.push(insertSuggestion(range, entry.replacement, entry.id));
  }
  const locations = Object.fromEntries(
    [...ranges].map(([id, range]) => [id, range.getBoundingClientRect().top]),
  );
  send({ type: 'locations', locations, orphaned });
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function capture() {
  if (mode === 'browse') return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (
    range.startContainer.parentElement?.closest('[data-mf-ui], input, textarea, [contenteditable]')
  )
    return;
  const anchor = captureAnchor(document.body, range);
  if (!anchor || anchor.exact.length > 30_000) return;
  const rect = range.getBoundingClientRect();
  send({ type: 'selection', anchor, rect: { x: rect.x, y: rect.y, bottom: rect.bottom } });
}

window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel)
    return;
  if (event.data.type === 'sync') {
    entries = event.data.entries;
    active = event.data.active;
    mode = event.data.mode;
    paint();
  }
  if (event.data.type === 'clear-selection') window.getSelection()?.removeAllRanges();
  if (event.data.type === 'scroll') {
    const range = ranges.get(event.data.id);
    if (range)
      window.scrollBy({ top: range.getBoundingClientRect().top - 140, behavior: 'smooth' });
  }
});
window.addEventListener('error', (event) =>
  send({ type: 'preview-error', message: event.message }),
);
window.addEventListener('unhandledrejection', (event) =>
  send({ type: 'preview-error', message: String(event.reason) }),
);
document.addEventListener('mouseup', () => setTimeout(capture, 0));
document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' || event.key.startsWith('Arrow')) capture();
});
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (link) {
      prepareLink(link);
      followFragment(link, event);
      return;
    }
    if (mode !== 'browse' && target.closest('button, input, select, textarea, form')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (!window.getSelection()?.isCollapsed) return;
    const inserted = target.closest<HTMLElement>('[data-mf-ui]');
    if (inserted) {
      send({ type: 'focus', id: inserted.dataset.mfUi! });
      return;
    }
    for (const [id, range] of ranges) {
      if (
        [...range.getClientRects()].some(
          (rect) =>
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom,
        )
      ) {
        send({ type: 'focus', id });
        return;
      }
    }
  },
  true,
);
document.addEventListener('DOMContentLoaded', () => {
  observer = new MutationObserver(() => {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(paint, 120);
  });
  paint();
  send({ type: 'ready' });
});

let lastActivity = -Infinity;
for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(
    type,
    (event) => {
      if (!event.isTrusted || performance.now() - lastActivity < 1000) return;
      lastActivity = performance.now();
      send({ type: 'activity' });
    },
    { capture: true, passive: true },
  );
}
