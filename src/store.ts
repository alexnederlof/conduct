import { mkdir, rename, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { entryInputSchema, reviewSchema, type EntryInput, type Review, type Source } from './model';

export class ConflictError extends Error {}
export class ReviewStore {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    public readonly path: string,
    private state: Review,
  ) {}

  static async open(path: string, source: Source) {
    const file = Bun.file(path);
    const now = new Date().toISOString();
    let state: Review;
    if (await file.exists()) {
      state = reviewSchema.parse(await file.json());
      if (state.source.path !== source.path)
        throw new Error(
          'This feedback file belongs to another document. Choose a different --out path.',
        );
      if (state.source.hash !== source.hash) {
        if (state.status === 'draft' && (state.entries.length || state.notes)) {
          state.archivedDrafts.push({
            source: state.source,
            entries: state.entries,
            notes: state.notes,
            archivedAt: now,
          });
        }
        state = {
          ...state,
          source,
          entries: [],
          notes: '',
          status: 'draft',
          revision: state.revision + 1,
          updatedAt: now,
        };
      }
    } else {
      state = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        revision: 0,
        source,
        entries: [],
        notes: '',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        rounds: [],
        archivedDrafts: [],
      };
    }
    const store = new ReviewStore(path, state);
    await store.persist(state);
    return store;
  }

  read() {
    return structuredClone(this.state);
  }

  private async persist(state: Review) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${crypto.randomUUID()}.tmp`;
    try {
      await Bun.write(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  update(revision: number, change: (draft: Review) => void) {
    const operation = this.queue.then(async () => {
      if (revision !== this.state.revision)
        throw new ConflictError(
          'This review changed in another tab. Your draft is kept; please try again.',
        );
      const next = this.read();
      change(next);
      next.revision++;
      next.updatedAt = new Date().toISOString();
      await this.persist(next);
      this.state = next;
      return this.read();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  add(revision: number, input: EntryInput) {
    const value = entryInputSchema.parse(input);
    return this.update(revision, (state) => {
      if (value.kind === 'edit') {
        if (value.replacement === value.anchor.exact)
          throw new Error('The replacement is unchanged.');
        if (
          state.entries.some(
            (entry) =>
              entry.kind === 'edit' &&
              entry.status === 'open' &&
              entry.anchor.start < value.anchor.end &&
              value.anchor.start < entry.anchor.end,
          )
        ) {
          throw new ConflictError(
            'This text already has a suggested edit. Resolve or remove it before adding an overlapping edit.',
          );
        }
      }
      const now = new Date().toISOString();
      state.entries.push({
        ...value,
        id: crypto.randomUUID(),
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      state.status = 'draft';
    });
  }

  submit(revision: number) {
    return this.update(revision, (state) => {
      if (state.status === 'submitted')
        throw new ConflictError('This review has already been sent.');
      state.rounds.push({
        number: state.rounds.length + 1,
        submittedAt: new Date().toISOString(),
        source: structuredClone(state.source),
        entries: structuredClone(state.entries),
        notes: state.notes,
      });
      state.status = 'submitted';
    });
  }
}

export async function acquireLock(path: string) {
  const lock = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lock, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await unlink(lock).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      const pid = Number(await Bun.file(lock).text());
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error(
          `Invalid review lock: ${lock}. Remove it only after stopping the other server.`,
        );
      try {
        process.kill(pid, 0);
      } catch (probe) {
        if (probe instanceof Error && 'code' in probe && probe.code === 'ESRCH') {
          await unlink(lock);
          continue;
        }
        throw probe;
      }
      throw new Error(
        `This review is already open in process ${pid}. Stop that server or choose another --out path.`,
      );
    }
  }
  throw new Error('Could not acquire review lock.');
}
