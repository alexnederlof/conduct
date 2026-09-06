import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ReviewStore, acquireLock } from '../src/store';
import { hash } from '../src/render';
import { waitForReview } from '../src/cli';
import type { EntryInput, Source } from '../src/model';

async function fixture() {
  const directory = resolve('.temp', `store-${crypto.randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const source: Source = {
    path: `${directory}/draft.md`,
    name: 'draft.md',
    content: '# Draft\nHello world',
    format: 'markdown',
    hash: hash('# Draft\nHello world'),
  };
  const path = `${source.path}.feedback.json`;
  return { directory, source, path, store: await ReviewStore.open(path, source) };
}
const input: EntryInput = {
  kind: 'comment',
  body: 'Be more specific.',
  anchor: { exact: 'Hello', prefix: 'Draft', suffix: ' world', start: 5, end: 10, selector: 'p' },
};

describe('durable review handoff', () => {
  test('only submitted rounds wake wait, and later edits cannot change delivered feedback', async () => {
    const { store, path } = await fixture();
    await store.add(0, input);
    const controller = new AbortController();
    const waiting = waitForReview(path, 0, 3, controller.signal);
    let delivered = false;
    void waiting.then(() => {
      delivered = true;
    });
    await Bun.sleep(350);
    expect(delivered).toBe(false);
    await store.submit(1);
    const result = await waiting;
    expect(result.rounds[0].entries[0].body).toBe(input.body);
    await store.update(2, (draft) => {
      draft.entries[0].body = 'Revised';
      draft.status = 'draft';
    });
    expect(store.read().rounds[0].entries[0].body).toBe(input.body);
    expect((await ReviewStore.open(path, store.read().source)).read().entries[0].body).toBe(
      'Revised',
    );
  });
  test('rejects conflicting saves without losing either committed state or the next valid save', async () => {
    const { store } = await fixture();
    const results = await Promise.allSettled([store.add(0, input), store.add(0, input)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(store.read().entries).toHaveLength(1);
    await store.add(1, { ...input, body: 'Another comment' });
    expect(store.read().entries).toHaveLength(2);
  });
  test('preserves source revisions, submitted history, and unfinished older drafts', async () => {
    const { store, source, path } = await fixture();
    await store.add(0, input);
    await store.submit(1);
    await store.add(2, input);
    const content = 'A new document';
    const reopened = await ReviewStore.open(path, { ...source, content, hash: hash(content) });
    expect(reopened.read().rounds[0].source.content).toBe(source.content);
    expect(reopened.read().archivedDrafts[0].entries).toHaveLength(2);
    expect(reopened.read().entries).toHaveLength(0);
    expect(reopened.read().status).toBe('draft');
    expect(reopened.read().source.content).toBe(content);
  });
  test('supports deletions but rejects overlapping or unchanged replacement suggestions', async () => {
    const { store } = await fixture();
    await expect(store.add(0, { ...input, kind: 'edit', replacement: 'Hello' })).rejects.toThrow(
      'unchanged',
    );
    await store.add(0, { ...input, kind: 'edit', replacement: '' });
    await expect(store.add(1, { ...input, kind: 'edit', replacement: 'Hi' })).rejects.toThrow(
      'overlapping',
    );
    expect(store.read().entries[0].replacement).toBe('');
  });
  test('wait resumes after a known round without redelivering it', async () => {
    const { store, path } = await fixture();
    await store.submit(0);
    await store.add(1, input);
    await store.submit(2);
    const result = await waitForReview(path, 1, 1);
    expect(result.rounds.map((round) => round.number)).toEqual([2]);
    await expect(waitForReview(path, 2, 1)).rejects.toThrow('Timed out');
  });
  test('uses an exclusive lock and refuses to reuse another document’s output', async () => {
    const { path, source } = await fixture();
    const release = await acquireLock(path);
    await expect(acquireLock(path)).rejects.toThrow('already open');
    await release();
    const releaseAgain = await acquireLock(path);
    await releaseAgain();
    await expect(ReviewStore.open(path, { ...source, path: '/different.md' })).rejects.toThrow(
      'another document',
    );
  });
});
