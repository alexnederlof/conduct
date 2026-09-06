import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Textarea } from '../ui';
import type { Anchor, Decision, Entry, FrameMessage, PublicReview } from '../model';

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    comment: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    edit: (
      <>
        <path d="m16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 14l-1 7Z" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    focus: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />,
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M15 4v16" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    mouse: (
      <>
        <path d="m4 3 7 18 2-8 8-2L4 3Z" />
      </>
    ),
    link: (
      <>
        <path
          d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 0-6-6L7 5"
          transform="translate(2 2)"
        />
      </>
    ),
    undo: (
      <>
        <path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -3)" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.comment}
    </svg>
  );
}

type Selection = { anchor: Anchor; x: number; y: number };
const fragmentToken = location.hash.slice(1);
if (fragmentToken) {
  sessionStorage.setItem('mf-token', fragmentToken);
  history.replaceState(null, '', location.pathname);
}
const token = fragmentToken || sessionStorage.getItem('mf-token') || '';

function App() {
  const [review, setReview] = useState<PublicReview | null>(null);
  const reviewRef = useRef<PublicReview | null>(null);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [mode, setMode] = useState<'comment' | 'edit' | 'browse'>('comment');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draftKind, setDraftKind] = useState<'comment' | 'edit'>('comment');
  const [body, setBody] = useState('');
  const [replacement, setReplacement] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>('open');
  const [orphaned, setOrphaned] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const notesDirty = useRef(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (selectionRef.current || notesDirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const accept = useCallback((state: PublicReview) => {
    reviewRef.current = state;
    setReview(state);
    if (!notesDirty.current) setNotes(state.notes);
  }, []);
  const request = useCallback(async (path: string, data?: unknown): Promise<PublicReview> => {
    const response = await fetch(path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Could not save feedback.');
    return value;
  }, []);
  const refresh = useCallback(async () => {
    const state = await request('/api/review');
    if (
      !reviewRef.current ||
      state.revision !== reviewRef.current.revision ||
      state.stale !== reviewRef.current.stale
    )
      accept(state);
  }, [request, accept]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (reviewRef.current?.mode === 'plan' && reviewRef.current.status === 'submitted') return;
      if (!busyRef.current) refresh().catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  const postFrame = useCallback(
    (message: object) =>
      iframe.current?.contentWindow?.postMessage(
        { ...message, channel: reviewRef.current?.previewToken },
        '*',
      ),
    [],
  );
  useEffect(() => {
    if (ready && review)
      postFrame({
        type: 'sync',
        entries: review.entries,
        active,
        mode: review.mode === 'plan' && review.status === 'submitted' ? 'browse' : mode,
      });
  }, [review, active, mode, ready, postFrame]);
  const focusEntry = useCallback(
    (id: string) => {
      setFocused(false);
      setActive(id);
      postFrame({ type: 'scroll', id });
      requestAnimationFrame(() =>
        document
          .getElementById(`entry-${id}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      );
    },
    [postFrame],
  );
  useEffect(() => {
    const receive = (event: MessageEvent<FrameMessage & { channel: string }>) => {
      if (
        !reviewRef.current ||
        event.source !== iframe.current?.contentWindow ||
        event.data?.channel !== reviewRef.current.previewToken
      )
        return;
      const message = event.data;
      if (message.type === 'ready') setReady(true);
      if (message.type === 'preview-error') setPreviewError(message.message);
      if (message.type === 'focus') focusEntry(message.id);
      if (message.type === 'locations') setOrphaned(message.orphaned);
      if (
        message.type === 'selection' &&
        !selectionRef.current &&
        !reviewRef.current?.stale &&
        !(reviewRef.current.mode === 'plan' && reviewRef.current.status === 'submitted')
      ) {
        const rect = iframe.current!.getBoundingClientRect();
        setSelection({
          anchor: message.anchor,
          x: Math.min(Math.max(rect.left + message.rect.x, 16), innerWidth - 380),
          y: Math.min(Math.max(rect.top + message.rect.bottom + 12, 90), innerHeight - 440),
        });
        setDraftKind(mode === 'edit' ? 'edit' : 'comment');
        setBody('');
        setReplacement(message.anchor.exact);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [mode, focusEntry]);
  useEffect(() => {
    if (selection) composer.current?.focus();
  }, [selection, draftKind]);
  const dismiss = useCallback(() => {
    if (busyRef.current) return;
    setSelection(null);
    postFrame({ type: 'clear-selection' });
  }, [postFrame]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss]);

  async function mutate(path: string, data: object) {
    const state = await request(path, { ...data, revision: reviewRef.current!.revision });
    accept(state);
    return state;
  }
  async function act(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong.');
      await refresh().catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const save = () =>
    act(async () => {
      if (!selection) return;
      const state = await mutate('/api/entries', {
        entry: {
          kind: draftKind,
          anchor: selection.anchor,
          body,
          ...(draftKind === 'edit' ? { replacement } : {}),
        },
      });
      setFocused(false);
      setFilter('open');
      setActive(state.entries.at(-1)!.id);
      setSelection(null);
      postFrame({ type: 'clear-selection' });
    });
  const send = (decision?: Decision) =>
    act(async () => {
      if (notesDirty.current) {
        await mutate('/api/notes', { notes });
        notesDirty.current = false;
      }
      await mutate('/api/submit', { decision });
    });
  const updateEntry = (entry: Entry, action: string) =>
    act(async () => {
      await mutate('/api/entry', { id: entry.id, action });
    });
  const download = async () => {
    try {
      const response = await fetch('/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not export feedback.');
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${review!.source.name}.feedback.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };
  if (!review)
    return (
      <div className="loading">
        <div className="brand-mark">C</div>
        <h1>Conduct</h1>
        <p>{error || 'Preparing your review space…'}</p>
        {error && (
          <button onClick={() => refresh().catch((e) => setError(e.message))}>Try again</button>
        )}
      </div>
    );
  const open = review.entries.filter((entry) => entry.status === 'open');
  const shown = review.entries.filter((entry) => filter === 'all' || entry.status === filter);
  const commentCount = open.filter((entry) => entry.kind === 'comment').length;
  const editCount = open.length - commentCount;
  const sent = review.status === 'submitted' && !notesDirty.current;
  const plan = review.mode === 'plan';
  const complete = plan && review.status === 'submitted';
  const title = review.source.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  return (
    <div className={`app ${plan ? 'plan-review' : ''} ${focused ? 'is-focused' : ''}`}>
      <header className="app-header">
        <div className="header-document">
          <a
            className="brand"
            href="#"
            onClick={(event) => event.preventDefault()}
            aria-label="Conduct"
          >
            <span className="brand-mark">C</span>
            <span className="brand-name">Conduct</span>
          </a>
          <span className="header-divider" />
          <h1 title={review.source.name}>{title}</h1>
        </div>
        <div className="header-actions">
          <span className="review-status" role="status">
            {review.stale
              ? 'Source changed'
              : busy
                ? 'Saving…'
                : sent
                  ? complete
                    ? 'Review complete'
                    : `Round ${review.roundCount} sent`
                  : notesDirty.current || selection
                    ? 'Draft in progress'
                    : 'Saved locally'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="focus-toggle"
            aria-label={focused ? 'Show feedback' : 'Focus'}
            aria-pressed={focused}
            disabled={!!selection}
            onClick={() => setFocused(!focused)}
            title={focused ? 'Show feedback sidebar' : 'Hide the sidebar for focused reading'}
          >
            <Icon name={focused ? 'panel' : 'focus'} size={16} />
            <span>{focused ? 'Show feedback' : 'Focus'}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="export"
            aria-label="Export feedback as JSON"
            title="Export feedback as JSON"
            onClick={download}
            disabled={complete}
          >
            <Icon name="download" size={17} />
          </Button>
          {plan && !complete && (
            <Button
              variant="outline"
              className="request-changes"
              disabled={busy || review.stale || !!selection}
              onClick={() => send('changes_requested')}
            >
              Request changes
            </Button>
          )}
          <Button
            className={`send ${sent ? 'sent' : ''}`}
            disabled={busy || review.stale || !!selection || sent}
            onClick={() => send(plan ? 'approved' : undefined)}
          >
            {plan
              ? complete
                ? review.decision === 'approved'
                  ? 'Approved'
                  : 'Changes requested'
                : 'Approve plan'
              : sent
                ? 'Sent to agent'
                : 'Send to agent'}
            {!sent && open.length > 0 && <span className="button-count">{open.length}</span>}
            <Icon name={sent ? 'check' : 'arrow'} size={16} />
          </Button>
        </div>
      </header>
      {plan && (
        <div className="plan-status" role="status">
          <Icon name={complete ? 'check' : 'file'} size={16} />
          <span>
            {complete
              ? review.decision === 'approved'
                ? 'Approval recorded. You can return to Claude.'
                : 'Changes requested. Your inline feedback is returning to Claude for revision.'
              : 'Claude is waiting for your review. Read, leave feedback, then approve or request changes.'}
          </span>
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {review.stale && (
        <div className="banner warning" role="alert">
          The source file has changed. Your feedback is saved. Restart the presenter to review the
          new version.
        </div>
      )}
      {previewError && (
        <div className="banner error" role="alert">
          Preview error: {previewError}
        </div>
      )}
      <main className={`workspace ${focused ? 'focused' : ''}`}>
        <section className="document-panel" aria-label="Document preview">
          <div className="document-toolbar">
            <span className="document-label">
              <Icon name="file" size={16} />
              <span>{review.source.name}</span>
            </span>
            <div className="mode-switch" aria-label="Review mode">
              {(['comment', 'edit', 'browse'] as const).map((item) => (
                <button
                  key={item}
                  disabled={complete}
                  aria-pressed={mode === item}
                  title={
                    item === 'browse'
                      ? 'Interact with the preview'
                      : item === 'edit'
                        ? 'Select text to suggest a replacement'
                        : 'Select text to comment'
                  }
                  onClick={() => {
                    setMode(item);
                  }}
                  className={mode === item ? 'selected' : ''}
                >
                  <Icon name={item === 'browse' ? 'mouse' : item} size={15} />
                  <span>
                    {item === 'comment' ? 'Comment' : item === 'edit' ? 'Suggest' : 'Interact'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="iframe-wrap">
            <iframe
              ref={iframe}
              src={`/preview?token=${review.previewToken}`}
              title="Review document"
              sandbox="allow-scripts"
            />
          </div>
          <div className="document-footer">
            <span>
              <Icon
                name={mode === 'edit' ? 'edit' : mode === 'browse' ? 'mouse' : 'mouse'}
                size={14}
              />
              {complete
                ? 'Review complete · you can close this tab'
                : mode === 'browse'
                  ? 'Preview interactions enabled'
                  : mode === 'edit'
                    ? 'Select text to suggest a change'
                    : 'Select any text to leave a comment'}
            </span>
            <span>Original file preserved</span>
          </div>
        </section>
        <aside className="feedback-panel" aria-label="Feedback" hidden={focused}>
          <div className="feedback-heading">
            <h2>
              Feedback <span>{review.entries.length}</span>
            </h2>
            <button
              className="icon-button"
              aria-label="Hide feedback sidebar"
              onClick={() => setFocused(true)}
            >
              <Icon name="panel" size={17} />
            </button>
          </div>
          <div className="feedback-tabs">
            {(['open', 'resolved', 'all'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={filter === item ? 'active' : ''}
              >
                {item === 'open' ? 'Open' : item === 'resolved' ? 'Resolved' : 'All'}
                <span>
                  {item === 'all'
                    ? review.entries.length
                    : review.entries.filter((entry) => entry.status === item).length}
                </span>
              </button>
            ))}
          </div>
          <div className="feedback-list">
            {shown.length === 0 ? (
              <div className="empty-state">
                <Icon name="comment" size={23} />
                <h3>
                  {filter === 'resolved'
                    ? 'Nothing resolved yet'
                    : review.entries.length
                      ? 'You’re all caught up'
                      : 'Space for your thoughts'}
                </h3>
                <p>
                  {filter === 'resolved'
                    ? 'Resolved feedback will appear here.'
                    : review.entries.length
                      ? 'Switch to All to revisit your feedback.'
                      : 'Select text as you read to leave a comment or suggest a change.'}
                </p>
              </div>
            ) : (
              shown.map((entry) => (
                <article
                  id={`entry-${entry.id}`}
                  key={entry.id}
                  className={`feedback-card ${active === entry.id ? 'focused' : ''} ${entry.status === 'resolved' ? 'resolved' : ''}`}
                  onClick={() => focusEntry(entry.id)}
                >
                  <div className="card-top">
                    <div className={`avatar ${entry.kind}`}>
                      <Icon name={entry.kind} size={15} />
                    </div>
                    <strong>{entry.kind === 'edit' ? 'Suggested edit' : 'Comment'}</strong>
                    <span className="entry-number">
                      {String(review.entries.indexOf(entry) + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <blockquote>{entry.anchor.exact}</blockquote>
                  {entry.kind === 'edit' && (
                    <div className="replacement">
                      {entry.replacement || <em>Delete selected text</em>}
                    </div>
                  )}
                  {entry.body && <p className="comment-body">{entry.body}</p>}
                  {orphaned.includes(entry.id) && entry.status === 'open' && (
                    <p className="orphaned">
                      Text moved in this preview. The original anchor is preserved.
                    </p>
                  )}
                  <div className="card-bottom">
                    <span>
                      {entry.anchor.sourceLine
                        ? `Line ${entry.anchor.sourceLine}${entry.anchor.sourceEndLine && entry.anchor.sourceEndLine !== entry.anchor.sourceLine ? `–${entry.anchor.sourceEndLine}` : ''}`
                        : entry.anchor.heading || 'Selected text'}
                    </span>
                    <div>
                      <button
                        title={entry.status === 'open' ? 'Resolve feedback' : 'Reopen feedback'}
                        aria-label={`${entry.status === 'open' ? 'Resolve' : 'Reopen'} feedback ${review.entries.indexOf(entry) + 1}`}
                        disabled={busy || review.stale || complete}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateEntry(entry, entry.status === 'open' ? 'resolve' : 'reopen');
                        }}
                      >
                        <Icon name={entry.status === 'open' ? 'check' : 'undo'} size={15} />
                      </button>
                      <button
                        title="Delete feedback"
                        aria-label={`Delete feedback ${review.entries.indexOf(entry) + 1}`}
                        disabled={busy || review.stale || complete}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateEntry(entry, 'delete');
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="general-notes">
            <button
              className="notes-toggle"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen(!notesOpen)}
            >
              <Icon name="edit" size={15} /> A final thought <span>{notesOpen ? '−' : '+'}</span>
            </button>
            {notesOpen && (
              <div className="notes-editor">
                <Textarea
                  aria-label="Overall feedback"
                  placeholder="Anything else your agent should know?"
                  value={notes}
                  disabled={busy || review.stale || complete}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    notesDirty.current = true;
                  }}
                />
                <button
                  disabled={busy || review.stale || complete || !notesDirty.current}
                  onClick={() =>
                    act(async () => {
                      await mutate('/api/notes', { notes });
                      notesDirty.current = false;
                    })
                  }
                >
                  Save note
                </button>
              </div>
            )}
          </div>
          <div className="feedback-summary">
            <span>
              {commentCount} comment{commentCount !== 1 ? 's' : ''}
            </span>
            <i />
            <span>
              {editCount} suggested edit{editCount !== 1 ? 's' : ''}
            </span>
          </div>
        </aside>
      </main>
      {selection && (
        <div
          className="composer"
          role="dialog"
          aria-label="Add inline feedback"
          style={{ left: Math.max(8, selection.x), top: Math.max(90, selection.y) }}
        >
          <div className="composer-top">
            <div className="composer-tabs">
              <button
                className={draftKind === 'comment' ? 'active' : ''}
                onClick={() => setDraftKind('comment')}
              >
                <Icon name="comment" size={15} />
                Comment
              </button>
              <button
                className={draftKind === 'edit' ? 'active' : ''}
                onClick={() => setDraftKind('edit')}
              >
                <Icon name="edit" size={15} />
                Suggest edit
              </button>
            </div>
            <button className="icon-button" aria-label="Close feedback draft" onClick={dismiss}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <blockquote>{selection.anchor.exact}</blockquote>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <label htmlFor="feedback-text">
              {draftKind === 'edit' ? 'Replace with' : 'Your feedback'}
            </label>
            <Textarea
              id="feedback-text"
              disabled={busy}
              ref={composer}
              placeholder={
                draftKind === 'edit'
                  ? 'Replacement text (leave empty to delete)'
                  : 'What’s on your mind?'
              }
              value={draftKind === 'edit' ? replacement : body}
              onChange={(event) =>
                draftKind === 'edit'
                  ? setReplacement(event.target.value)
                  : setBody(event.target.value)
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  if (
                    (draftKind === 'comment' && body.trim()) ||
                    (draftKind === 'edit' && replacement !== selection.anchor.exact)
                  )
                    save();
                }
              }}
            />
            {draftKind === 'edit' && (
              <Textarea
                className="edit-reason"
                disabled={busy}
                aria-label="Reason for suggested edit"
                placeholder="Why this change? (optional)"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            )}
            <div className="composer-bottom">
              <span>⌘ ↵ to save · Esc to close</span>
              <Button
                className="composer-submit"
                type="submit"
                disabled={
                  busy ||
                  review.stale ||
                  (draftKind === 'comment' ? !body.trim() : replacement === selection.anchor.exact)
                }
              >
                {busy ? 'Saving…' : draftKind === 'edit' ? 'Suggest change' : 'Add comment'}
                <Icon name="arrow" size={15} />
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
