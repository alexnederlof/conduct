import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { followFragment, prepareLink } from '../src/client/links';

test('external links remain navigable and open separately without an opener', () => {
  Object.assign(globalThis, {
    document: new Window().document,
    MouseEvent: new Window().MouseEvent,
  });
  document.body.innerHTML = '<a href="https://example.com" target="_top">Example</a>';
  const link = document.querySelector('a')!;
  const event = new MouseEvent('click', { cancelable: true });
  prepareLink(link);
  followFragment(link, event);
  expect(event.defaultPrevented).toBe(false);
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
});

test('fragment links scroll within the document despite the asset base URL', () => {
  Object.assign(globalThis, {
    document: new Window({ url: 'http://127.0.0.1/preview' }).document,
    MouseEvent: new Window().MouseEvent,
  });
  document.head.innerHTML = '<base href="/assets/token/">';
  document.body.innerHTML =
    '<a href="#some%20section">Section</a><h2 id="some section">Section</h2>';
  const link = document.querySelector('a')!;
  const heading = document.querySelector('h2')!;
  let scrolled = false;
  heading.scrollIntoView = () => {
    scrolled = true;
  };
  const event = new MouseEvent('click', { cancelable: true });
  prepareLink(link);
  followFragment(link, event);
  expect(link.target).toBe('');
  expect(event.defaultPrevented).toBe(true);
  expect(scrolled).toBe(true);
});
