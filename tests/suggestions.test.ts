import { beforeAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { insertSuggestion } from '../src/client/suggestions';
import { rangeFor, textContent } from '../src/client/anchors';

beforeAll(() => {
  const window = new Window();
  Object.assign(globalThis, {
    document: window.document,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
});

test('suggestions retain original text node identities, including adjacent nodes owned by React', () => {
  const root = document.createElement('p');
  const label = document.createTextNode('Clicks: ');
  const count = document.createTextNode('0');
  root.append(label, count);
  const remove = insertSuggestion(rangeFor(root, 0, 6)!, 'Visits', 'one');
  expect(textContent(root)).toBe('Clicks: 0');
  remove();
  expect(root.childNodes).toHaveLength(2);
  expect(root.firstChild).toBe(label);
  expect(root.lastChild).toBe(count);
  count.data = '1';
  expect(root.textContent).toBe('Clicks: 1');
});

test('redrawing after React changes annotated text does not append stale text fragments', () => {
  const root = document.createElement('p');
  const original = document.createTextNode('The old label');
  root.append(original);
  const remove = insertSuggestion(rangeFor(root, 4, 7)!, 'new', 'one');
  original.data = 'A replacement from React';
  remove();
  expect(root.textContent).toBe('A replacement from React');
  expect(root.firstChild).toBe(original);
  expect(root.childNodes).toHaveLength(1);
});

test('multiple suggestions in one original text node restore in reverse insertion order', () => {
  const root = document.createElement('p');
  const original = document.createTextNode('One two three');
  root.append(original);
  const removeLast = insertSuggestion(rangeFor(root, 8, 13)!, 'third', 'last');
  const removeFirst = insertSuggestion(rangeFor(root, 0, 3)!, 'first', 'first');
  expect(textContent(root)).toBe('One two three');
  removeFirst();
  removeLast();
  expect(root.textContent).toBe('One two three');
  expect(root.childNodes).toHaveLength(1);
  expect(root.firstChild).toBe(original);
});
