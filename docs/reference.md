# Feedback and API reference

[← Back to Conduct](../README.md)

## Feedback format

The JSON has `schemaVersion: 1`, `mode: "feedback" | "plan"`, a current draft, a monotonic revision, immutable submitted `rounds`, and archived unfinished drafts from older source versions. Each round saves the full source snapshot and SHA-256 hash. Plan rounds also require `decision: "approved" | "changes_requested"`; a normal feedback submission is not plan approval.

An entry looks like this:

```json
{
  "id": "a-stable-entry-id",
  "kind": "edit",
  "status": "open",
  "anchor": {
    "exact": "ten thousand signups",
    "prefix": "Our goal is ",
    "suffix": " in the first month.",
    "start": 540,
    "end": 560,
    "selector": "article:nth-of-type(1) > p:nth-of-type(4)",
    "heading": "What success looks like",
    "sourceLine": 42,
    "sourceEndLine": 42
  },
  "replacement": "twenty teams using it every week",
  "body": "Measure sustained usefulness instead of registrations.",
  "createdAt": "2026-09-06T10:00:00.000Z",
  "updatedAt": "2026-09-06T10:00:00.000Z"
}
```

`start` and `end` are UTF-16 offsets in the preview’s text stream, **not source-file offsets**. Source lines identify containing blocks/elements. Agents should use the exact quote, context, and source snapshot to locate the intended occurrence and preserve Markdown/JSX/HTML syntax. The renderer does not guess when a quote becomes ambiguous or its context changes.

If the source changes while a review is open, submission is blocked and the UI asks you to restart the presenter. Reopening creates a fresh draft against the new source, keeps all submitted rounds, and archives any unfinished old draft. Current source detection covers the entry file; restart after modifying imported components or local assets as well.

## Local API

The server prints a URL ending in a random capability token. Browser API calls authenticate with `Authorization: Bearer <token>`. Write requests also require the exact local `Origin` and the last observed `revision`; stale concurrent writes return `409`. The preview receives a separate token that grants access only to the document and its assets. That token cannot read or submit feedback.

| Endpoint            | Purpose                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `GET /api/review`   | Current browser state, source metadata, stale status                         |
| `GET /api/export`   | Full saved state and submitted rounds                                        |
| `POST /api/entries` | `{ revision, entry }`, with a comment or edit anchor                         |
| `POST /api/entry`   | `{ revision, id, action }`, where action is `resolve`, `reopen`, or `delete` |
| `POST /api/notes`   | `{ revision, notes }`                                                        |
| `POST /api/submit`  | `{ revision, decision? }`, publishing the next immutable round               |

Prefer the CLI or feedback file for agents. Writes are serialized and atomically replace the JSON file. One presenter can own each feedback path at a time. Graceful shutdown removes the lock; a later run recovers a lock whose owning process has exited.

## Scope and boundaries

- Reviews are local and single-user. Multiple tabs are supported through revision checks; this is not a collaborative editing server.
- Edits are **suggestions**, not a rich-text editor or automatic patch applicator. Your agent applies them to the source after review.
- HTML and React run in a sandboxed iframe without same-origin privileges. External scripts, modules, images, fonts, media, and network requests are allowed. Scripts can read the presented document and communicate with external sites, so use documents and libraries you trust. They cannot access Conduct’s parent UI, browser storage, or feedback API. The preview response also enforces sandboxing when opened directly. Forms, popups, nested frames, and navigation of the parent window remain disabled. Conduct itself has no telemetry or cloud service.
- Interactive views can change or remove selected text. Feedback retains the original anchor and flags an unlocatable selection instead of attaching it to unrelated text. Keep content stable during review.
- Single-entry documents and components are the supported input. This does not run an existing Next.js/Vite application, execute server components, support MDX, annotate canvas/images, or provide a mobile-native editing experience.
- Saved review JSON contains the document and feedback. Keep it out of source control unless you intentionally want to share it.
