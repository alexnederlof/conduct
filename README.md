# Conduct

A local review space for agent-generated work. Open a Markdown document, HTML page, or React component. Select text, leave a comment, suggest better wording, then send the whole review back to your agent.

Built with Bun. No account, cloud service, database server, or agent-specific integration.

## Try it locally

Requires **Bun 1.3 or newer** and a modern browser with the CSS Custom Highlight API (current Chrome, Safari, Firefox, and Edge).

```sh
bun install
bun run start examples/launch-plan.md
```

The CLI opens your default browser automatically (`open` on macOS). It chooses an available port, listens on `127.0.0.1`, and prints the review URL and feedback path.

```sh
bun run start examples/brief.html
bun run start examples/landing-page.tsx
bun run start examples/reading-room.tsx
bun run start /path/to/proposal.md --port 4317 --no-open
```

## Review a document

1. **Select text.** A comment composer opens immediately. Selections can span paragraphs, bold text, links, lists, and table cells.
2. **Leave a comment or suggest an edit.** Choose Suggest to replace selected text. An empty replacement requests a deletion. The document shows the original text struck through and the suggested replacement alongside it.
3. **Review in the sidebar.** Click a card to return to its selection. Resolve, reopen, or delete feedback. Add overall context under “A final thought.”
4. **Send to agent.** This publishes an immutable review round. A waiting agent command returns that round as structured JSON. The browser remains available for further feedback.

`⌘ Enter` / `Ctrl Enter` saves a comment or suggestion. `Escape` closes its composer. **Interact** enables controls in React and HTML previews.

**Focus** hides the feedback sidebar and centers the document for uninterrupted reading. Selection still opens a comment or suggestion; saving it brings the sidebar back. **Show feedback** restores it at any time.

### Reading defaults

Inter is bundled and served locally, including italic and international character subsets. Markdown uses 18px text (17px on narrow screens), generous line spacing, and a measure capped at 65 characters. HTML inherits the same font and a light typography baseline; authored styles and Tailwind utilities can override it. Use `<article class="conduct-prose">…</article>` for the complete reading layout in HTML or React.

The palette uses indigo, navy, and cool neutrals, with soft corners and a quiet layout. Shared CSS variables and Tailwind tokens include `bg-primary`, `text-foreground`, `text-muted-foreground`, `bg-background`, and `border-border`. Fonts, Tailwind, and the built-in components require no CDN connection.

Saving a card writes it to disk immediately. Text still being composed is a draft until saved. Overall notes save with “Save note” or automatically when sending. Reloading restores saved feedback. The source file is never edited by the presenter.

## Agent handoff

A filesystem-backed protocol makes this work with any agent that can run a shell command or read a file. **Send to agent** publishes data; it does not invoke an LLM, start a new conversation, or require access to an agent provider.

From a checkout, substitute `bun /path/to/conduct/src/cli.ts` for the binary below:

```sh
# Start in a persistent/background terminal. Opens the review for the user.
conduct present /path/to/proposal.md

# Run independently. Prints JSON when the user clicks Send to agent.
conduct wait /path/to/proposal.md --after 0 --timeout 600

# Inspect saved drafts and submitted history at any time.
conduct feedback /path/to/proposal.md
conduct feedback /path/to/proposal.md --format markdown
```

The default output is `/path/to/proposal.md.feedback.json`. Override it with `--out`, using the same path for all commands. `wait` polls that file; it keeps working if the browser disconnects or the server stops after submission. It returns every submitted round after the requested cursor. Store the highest returned round number and use it as the next `--after` value. No round is consumed or deleted by reading it.

A timeout exits nonzero. An unsent draft never wakes a waiting agent. An empty submitted review is valid and signals that the reviewer is done.

### Install the agent skill

Use the CLI to install the bundled skill. Global installation is the default; add `--project` to install only in the current directory. From this checkout, replace `conduct` with `bun /absolute/path/to/conduct/src/cli.ts`.

```sh
conduct install skill          # All supported agents, globally
conduct install skill claude   # Claude Code only
conduct install skill codex    # Codex via the shared .agents folder
conduct install skill agents   # Other agents that read .agents/skills
conduct install skill all --project
```

| Target              | Global location (default)           | Project location                  |
| ------------------- | ----------------------------------- | --------------------------------- |
| `claude`            | `~/.claude/skills/conduct/SKILL.md` | `.claude/skills/conduct/SKILL.md` |
| `codex` or `agents` | `~/.agents/skills/conduct/SKILL.md` | `.agents/skills/conduct/SKILL.md` |
| `all` (default)     | Both locations above                | Both locations above              |

Codex and `agents` are aliases for the same shared installation, so `all` installs two skills without duplicating Codex entries. The paths follow [Codex’s local skill discovery](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) and [Claude Code’s skill locations](https://code.claude.com/docs/en/skills#where-skills-live). `CLAUDE_CONFIG_DIR` overrides Claude’s global directory. Run project installation from the project root. `--global` (`-g`) and `--project` (`-p`) work for both install and uninstall; conflicting scope flags are rejected.

Installed instructions include an absolute command pointing to a persistent runtime with production dependencies and the bundled examples. They work without a global `conduct` binary and after clearing BunX’s cache or moving the source checkout. The runtime is under the selected agent directory’s `conduct/runtime/` (`.agents` for an `all` installation). Rerun the installer when upgrading, moving Bun, or setting up the project on another machine. Generated instructions refer to this machine’s runtime; the original skill in the package remains portable. Agents discover the skill on their next turn; restart if it does not appear.

Reinstallation updates a Conduct-managed skill. If a different skill already exists or you edited the installed instructions, the installer preserves it and asks you to use `--force` to replace it. Linked skill folders are never overwritten. Other files in the skill directory are preserved.

```sh
conduct install skill all --force
conduct uninstall skill claude
conduct uninstall skill all --project
```

Uninstall removes the installed instructions and their ownership marker, preserving other files and cached runtimes that hooks or other skill installations may still use. Edited instructions also require `--force` for removal. This skill installation is independent of the plan approval hook below.

The CLI still prints the portable skill with `conduct skill`. The skill explains format selection, background presentation, waiting for submission, round cursors, exact anchors, and source editing.

## Formats

| Input              | Rendering                                                             | Source context                                                                |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.md`, `.markdown` | Markdown with tables, fenced code, raw HTML, and a reading stylesheet | Exact quote, nearby text, DOM selector, heading, containing source lines      |
| `.html`, `.htm`    | Your page, with Tailwind available                                    | Exact quote, nearby text, DOM selector, heading, containing HTML source lines |
| `.tsx`, `.jsx`     | Default-exported React component, bundled by Bun for the browser      | Exact quote, nearby text, DOM selector, heading                               |

Choose Markdown for prose. Choose React when reusable components, lists, or interactions help express a design. JSX can reduce repetitive markup, but plain prose is usually more concise in Markdown.

### React and Tailwind

No app scaffolding or Tailwind configuration is needed:

```tsx
import { useState } from 'react';
import { Button } from 'conduct/ui';

export default function Proposal() {
  const [expanded, setExpanded] = useState(false);
  return (
    <main className="mx-auto max-w-3xl bg-background p-12 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">A thought worth sharing</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed">
        Select any part of this paragraph to leave inline feedback.
      </p>
      <Button className="mt-8" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Less detail' : 'More detail'}
      </Button>
      {expanded && <p className="mt-4">A little more context.</p>}
    </main>
  );
}
```

React, React DOM, and `conduct/ui` resolve from the presenter, so the document can live outside an existing JavaScript project. Other npm imports must already be installed in the document’s project. Relative JS/TS component imports are bundled; their literal Tailwind class names are scanned too. Use complete class names (`bg-primary`), not interpolated names (`bg-${color}-900`). Tailwind compiles locally using its official class scanner, including arbitrary values and state variants.

Local images, stylesheets, browser scripts, fonts, and media can be referenced relative to the document. Assets must stay inside its directory; hidden paths, arbitrary source files, and symlinks escaping that directory are blocked. Self-contained documents and components give the most reproducible reviews.

### Built-in shadcn components

React previews include a curated set adapted from [shadcn/ui](https://ui.shadcn.com/docs/components). Their dependencies, styles, and shared theme are already available. No setup command or document-level install is needed:

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from 'conduct/ui';
// Individual imports also work: import { Button } from 'conduct/ui/button';

export default function Proposal() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>A small, considered step</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Badge variant="secondary">Ready to review</Badge>
          <p className="leading-relaxed">Bring the open questions closer to the work.</p>
          <Button variant="outline">Explore the idea</Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

Included: **Button**, **Badge**, **Card** (Header, Title, Description, Action, Content, Footer), **Input**, **Textarea**, **Tabs** (List, Trigger, Content), **Accordion** (Item, Trigger, Content), and `cn` for class merging. Interactive components use Radix primitives. See [examples/reading-room.tsx](examples/reading-room.tsx) for a complete example with stateful buttons, tabs, an accordion, and inputs. Enable **Interact** to try the controls.

This is a starter set, not the entire shadcn registry. Additional components can be added as local source files with their dependencies installed using Bun. HTML can use the shared Tailwind tokens and `conduct-prose`; React components require a `.tsx`/`.jsx` preview. Attribution and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### External JavaScript and chart libraries

HTML previews support scripts from any HTTP/HTTPS site, inline JavaScript, ES modules and import maps, dynamic imports, workers, and network requests. There is no CDN allowlist or extra flag. Libraries that compile templates or generate code at runtime can use `eval` and `new Function` inside the preview. Browser CORS rules still apply to modules, fonts, and data requests.

Include libraries as you would in an ordinary HTML page:

```html
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/react-is@18.3.1/umd/react-is.production.min.js"
></script>
<script
  crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/recharts@3.10.1/umd/Recharts.js"
></script>
```

[examples/recharts.html](examples/recharts.html) is a complete interactive chart using these CDN scripts. It requires no npm install in the document’s directory:

```sh
bun run start examples/recharts.html
```

Select **Interact** to switch chart metrics and use other controls; select **Comment** or **Suggest** to review its text. This HTML document supplies its own React version, independently of Conduct’s review UI. For modules, use `<script type="module">` with a CDN that sends appropriate CORS headers.

For a `.tsx` document, install dependencies in the document’s project and use normal package imports:

```sh
bun add recharts react-is@19.2.8
```

```tsx
import { Area, AreaChart } from 'recharts';
```

Conduct bundles these imports with its provided React runtime (currently 19.2.8). Use HTML modules for direct CDN imports; the TSX bundler resolves installed packages and local files.

## Claude Code plan approval

Conduct can replace Claude Code’s normal plan approval prompt. Install once on macOS or Linux:

```sh
# From this checkout; use your absolute checkout path from another directory
bun src/cli.ts install hook           # Global by default; --global is also accepted

# Or enable it only for the current project
bun src/cli.ts install hook --project
```

The hook command installs Claude Code’s plan approval integration. `conduct install hook claude` is also accepted. The older `conduct install claude --scope user|project` and matching uninstall commands remain aliases; their default scope is now global too. Skill installation does not enable a hook.

Restart Claude Code after installation, then enter plan mode as usual. When Claude calls `ExitPlanMode`, the browser opens automatically and Claude waits for your decision:

- **Approve plan** records explicit approval of that snapshot and lets Claude continue in the same conversation. Any open comments and suggested edits accompany the approval.
- **Request changes** returns the selected quotes, source locations, comments, replacements, and overall feedback to Claude. Claude stays in plan mode, revises its plan, and presents a fresh review.

Saving a comment, closing the browser, or leaving a review idle never approves it. A review expires after 59 minutes; timeout, cancellation, missing content, and changed plan files produce a denial. Every invocation has its own snapshot and feedback file, so previous approvals cannot approve a new plan. Suggestions never rewrite the source automatically. Once a decision is recorded, the review becomes read-only and its server closes; the loaded page can be read until you close it.

With `--project`, run the command from the project root. The installer merges a synchronous `PreToolUse` hook matching only `ExitPlanMode` into `~/.claude/settings.json` (user scope), or `.claude/settings.local.json` (project scope). It preserves other settings and hooks and is safe to rerun. `CLAUDE_CONFIG_DIR` is respected for user configuration and review storage. A private, persistent runtime with production dependencies is copied under the selected settings directory’s `conduct/runtime/`, so Bun’s cache and the original checkout are no longer needed. Bun itself must remain installed at its configured path. Rerun the installer after upgrading Conduct or moving Bun. The same installer works from a BunX package once published.

Review artifacts live under `~/.claude/conduct/reviews/<unique-id>/`: `plan.md`, `invocation.json`, `session.json` (the private browser URL and expiry), `feedback.json`, and the returned `result.json` after a completed handoff. These are local files containing your plan and comments. Sessions are independent across terminals and projects. Old reviews and runtime versions are retained; remove them manually when no review is running if you no longer need them.

To disable the integration without removing your review history:

```sh
bun src/cli.ts uninstall hook
# Or: bun src/cli.ts uninstall hook --project
```

This integration uses Claude Code’s documented [PreToolUse decision protocol](https://code.claude.com/docs/en/hooks#pretooluse-decision-control). Approval returns both `permissionDecision: "allow"` and the original `updatedInput`; the latter is required to satisfy `ExitPlanMode`’s interaction requirement. Change requests return `"deny"` with the inline feedback. Hook stdout contains only the JSON decision; launch details go to stderr. Implementation permissions are unchanged, and approval does not clear the conversation.

Use a current Claude Code version that supplies `tool_input.plan` and `tool_input.planFilePath` to hooks. Existing deny/ask rules and other hooks can still require a native prompt. If hooks are disabled, blocked by managed settings, cannot launch, or are forcibly killed by Claude, its native permission flow applies. The installer’s one-hour hook deadline leaves a minute for Conduct to deny its own expired review. A skill alone cannot reliably intercept the native gate; no skill invocation is needed once this hook is installed. The full request-changes → revised plan → approval loop was verified in interactive Claude Code 2.1.260. Its headless `-p` mode disabled `ExitPlanMode` in our test, so interactive plan mode is the verified integration.

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

## Distribution

This checkout is package-ready; no GitHub repository or npm release has been published yet. It ships its TypeScript sources and bundles the browser code at startup, so GitHub installs need no build or lifecycle script.

Once the repository exists, replace `OWNER` with its actual owner:

```sh
bunx --bun --package github:OWNER/conduct conduct /path/to/proposal.md
```

A tagged release can use `github:OWNER/conduct#v0.1.0`. After publishing to npm under an available package name, users can use `bunx conduct /path/to/proposal.md`. These remote commands require the corresponding repository/release to exist.

To inspect the distributable locally:

```sh
bun pm pack --destination .temp
```

Bun documents [package executables and `bunx --package`](https://bun.com/docs/pm/bunx) and [GitHub dependency specifiers](https://bun.com/guides/install/add-git).

## Development

```sh
bun install
bun run dev
bun run check
```

`bun run check` runs strict TypeScript checking and Bun tests for anchors, source snapshots, persistence, submission, wait cursors, concurrent saves, renderer compilation, API boundaries, skill installation and removal, and global/project hook settings. Test fixtures are retained under ignored `.temp/` for inspection. Restart the server and reload the browser after code changes.

The core lives in `src/server.ts`, `src/render.ts`, and `src/store.ts`; the review shell and selection bridge are in `src/client/`. The UI is React, the server and bundler are Bun, and Tailwind generates preview styles locally. The annotation implementation is original code and does not depend on Agentation.

MIT licensed.
