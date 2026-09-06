---
name: conduct
description: Present local Markdown, HTML, or React documents for human review, then read anchored comments and suggested edits after the reviewer sends them back. Use when the user wants to review an agent-generated document or page and give inline feedback.
---

# Conduct

Use the Conduct CLI to give the user an editable review space and receive structured, source-anchored feedback. The original file stays unchanged. A suggested edit contains the selected original text and its proposed replacement; it is not an applied source patch.

## Choose the document

- Prefer Markdown for proposals, plans, and prose. Conduct supplies locally bundled Inter, a comfortable reading width, and generous spacing. Keep the document calm: clear headings, short sections, and restrained emphasis.
- Use a self-contained `.tsx` or `.jsx` file with a default-exported React component for layouts or interactive concepts. React, React DOM, static Tailwind classes, and a curated shadcn set are provided. Import from `conduct/ui`: Button, Badge, Card (Header, Title, Description, Action, Content, Footer), Input, Textarea, Tabs (List, Trigger, Content), Accordion (Item, Trigger, Content), and `cn`. Individual imports such as `conduct/ui/button` also work, even outside a project install. See `examples/reading-room.tsx` in the package.
- Use the provided theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`) for indigo, navy, and cool neutrals. Favor white reading surfaces, soft corners, and sparse accents. Write full Tailwind class names rather than building them dynamically. HTML inherits Inter and light typography defaults; `<article class="conduct-prose">` gives HTML or React the complete Markdown-style reading layout.
- Existing `.html` files work too, including inline styles, local assets, external HTTP/HTTPS scripts, ES modules, import maps, and data requests. Add chart or display libraries from a CDN with ordinary script tags; module CDNs and data endpoints must support browser CORS. See the package’s `examples/recharts.html` for a complete CDN-loaded chart. For `.tsx` files, install libraries in the document’s project with Bun and import them normally. React and React DOM come from Conduct; other dependencies are not installed automatically.
- The preview can run arbitrary JavaScript, including runtime code generation and workers. Scripts can read the presented document and contact external sites, but the sandbox and separate preview token isolate Conduct’s review controls and feedback API. Prefer pinned library versions and keep preview content stable while the user reviews it.
- Keep reviewable text in the DOM, not in images, canvas, or CSS-generated content. Prefer stable content during a review.

## Present and wait

Use the installed `conduct` binary. From a source checkout, use `bun /absolute/path/to/conduct/src/cli.ts` instead. Keep source and feedback paths consistent across all commands.

1. Run `conduct present /absolute/path/to/document.md` as a background or persistent process. It binds to loopback and opens the browser automatically (`open` on macOS). Use `--no-open` when the agent’s own browser tool should open the printed URL. The complete URL is required, including its fragment.
2. Tell the user to select text to comment, use **Suggest** to propose replacements, and click **Send to agent** when finished. Suggestions can replace a selection or delete it with an empty replacement. **Focus** hides the sidebar for reading; saving inline feedback brings it back. **Interact** enables buttons, tabs, accordions, and other preview controls.
3. Determine the latest already-consumed round number, initially `0`. Run `conduct wait /absolute/path/to/document.md --after 0 --timeout 600` as a background/persistent command. It returns JSON only when the user submits a later round. A timeout is not approval or submission; keep the review pending or resume the wait.
4. Read the returned `rounds`, advance the cursor to the largest returned `number`, and continue the requested work. Do not process draft edits as a completed review unless the user explicitly asks.

If background execution is unavailable, run the presenter in a persistent terminal, let the user review, then use `conduct feedback /absolute/path/to/document.md`. Check `status` and `rounds`; do not infer submission from file existence. The `feedback` command includes draft state, while `wait` returns submitted rounds only.

`--out /path/review.json` overrides the default `<source-file>.feedback.json`. Pass the same `--out` to `present`, `feedback`, and `wait`. The saved JSON can also be read directly. No MCP server or provider-specific integration is required; the review does not start a new agent or send chat messages.

## Interpret inline feedback

Each submitted round contains the source path, SHA-256 hash, full source snapshot, entries, and overall notes. Each entry has an ID, kind (`comment` or `edit`), status, body, and anchor:

- `exact`, `prefix`, and `suffix` identify the reviewed text and its surrounding rendered context.
- `start` and `end` are UTF-16 offsets in the preview’s DOM text, **not offsets in the source file**. They exclude scripts, hidden HTML, and suggestion decorations. Do not splice raw Markdown, HTML, or TSX using these offsets.
- `selector` and `heading` locate the text in the rendered structure.
- `sourceLine` and `sourceEndLine`, when present, refer to one-based source lines of the containing Markdown blocks or HTML elements. They are a search scope, not an exact patch location. React feedback normally relies on quotes and selectors instead.
- An edit’s `replacement` is the requested new text. An empty string means deletion. The `body` may explain the reason.

Use open entries from the submitted round; resolved entries remain for context. Compare the current source hash with the round’s hash before applying changes. When the source differs, use its saved snapshot and surrounding context to reconcile the feedback. Do not guess at duplicate text or apply a replacement to every occurrence. Respect formatting and component structure when editing source.

After applying feedback, summarize what changed and identify any unresolved entry IDs. Stop the old presenter and present the revised file for another round if useful. Reopening after a source change starts a fresh draft, keeps previous submitted rounds, and archives any unfinished prior draft in `archivedDrafts`. Continue the round cursor rather than starting again at zero.
