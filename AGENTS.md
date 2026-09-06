# Working on Conduct

Conduct is a local review space for Markdown, HTML, and React documents. People select text, leave comments or suggest edits, then submit a review for their agent to read. Keep the experience calm, legible, and focused on the document.

This file is the repository's development guide. `CLAUDE.md` is a relative symlink to it; edit `AGENTS.md` only. The distributable skill for agents **using** Conduct lives in `skills/conduct/SKILL.md`.

## Getting started

Requires Bun 1.3.14 or newer and Node.js 20+ for launcher and npm package tests. Run commands from the repository root:

```sh
bun install
bun run dev         # Markdown demo; prints a URL without opening a browser
bun run check       # TypeScript checking and Bun tests
bun run test:package # npx delivery without a global Bun installation
```

Use `bun src/cli.ts --help` for CLI options. Run `bun src/cli.ts examples/reading-room.tsx --no-open` to exercise React and the bundled components. Servers need restarting after code changes.

Use Bun for scripts, dependencies, tests, and bundling. Prefer `Bun.file()` and `Bun.write()` for file contents; Node filesystem utilities are fine for directory operations. Import Zod from `zod/v4`.

## Where things live

| Path                                              | Responsibility                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/cli.ts`                                      | Commands, arguments, output, and process lifecycle                      |
| `src/server.ts`                                   | Loopback server, authenticated API, preview and asset routes            |
| `src/render.ts`                                   | Markdown/HTML rendering, React bundling, Tailwind, source locations     |
| `src/model.ts`, `src/store.ts`, `src/feedback.ts` | Schema, persistence, submitted rounds, exports, waiting                 |
| `src/client/`                                     | Review shell, iframe bridge, selection anchors, suggested edits, styles |
| `src/ui/`                                         | Bundled shadcn components and shared theme utilities                    |
| `src/claude-hook.ts`                              | Claude Code plan review and approval decisions                          |
| `src/*install*.ts`                                | Skill/hook installation, scopes, persistent runtimes                    |
| `skills/conduct/`                                 | Instructions shipped to agents reviewing user documents                 |
| `examples/`, `tests/`, `docs/`                    | Runnable demos, Bun tests, public guides                                |

## Behaviors to preserve

- **Leave source files intact.** Edits in the UI are suggestions; the agent applies them after review.
- **Keep feedback anchored.** Exact quotes, surrounding text, selectors, headings, and available source lines identify the intended occurrence. Anchor offsets are UTF-16 positions in rendered text, not raw Markdown/HTML/JSX offsets. Never guess when an anchor is ambiguous.
- **Protect rendered structure.** Suggestion decorations must preserve React-owned text nodes and element identity. Avoid broad DOM normalization or replacing document subtrees.
- **Separate drafts from submissions.** Only an explicit submission publishes a round and wakes `wait`. Submitted rounds and their source snapshots are immutable. Changing the source must invalidate the active review and preserve earlier feedback.
- **Preserve persistence guarantees.** Keep revision checks, serialized atomic writes, and the exclusive feedback-file lock. Keep feedback schema changes compatible or provide an explicit migration.
- **Require explicit plan approval.** Only an approved, unchanged snapshot may allow `ExitPlanMode`. Changes requested, timeout, cancellation, and stale content must deny it. Preserve the original tool input in the approval response. Never submit a real user's decision on their behalf.
- **Keep previews separate from review controls.** Bind to loopback. Preserve the sandboxed iframe, separate preview capability, authenticated feedback API, origin checks, and asset-path boundaries. Arbitrary external JavaScript in a preview is an intentional feature; retain it without granting access to the review UI or feedback API.
- **Respect installed configuration.** Merge only Conduct-owned hook entries and preserve unrelated settings. Skill installation must protect existing or locally edited instructions. Keep global/project scopes and durable runtimes working without a source checkout or BunX cache.

## Making changes

- Match the surrounding TypeScript and formatting. Prefer small, clear functions; avoid `any` casts, redundant checks, and comments that only repeat the code.
- Reuse `conduct/ui` components and semantic theme tokens. Preserve locally bundled Inter, comfortable reading width, soft corners, and restrained accents.
- Use `rg` for searches. Put temporary files, browser fixtures, package archives, and review artifacts in the ignored `.temp/` directory, never in the system temporary directory.
- Add regression tests for changed behavior where they meaningfully catch failures. Run `bun run check` before handing off code changes. For UI changes, also verify the relevant flow in a real browser and check console errors.
- Test installation commands with isolated directories under `.temp/`. Do not change a contributor's real agent settings just to test an installer.
- Keep CLI help, README examples, detailed guides, and the bundled skill in sync when changing the workflow. The skill installer's command injection depends on the portable command paragraph in `SKILL.md`; update them together if that paragraph changes.
- Check `bun pm pack --destination .temp` after changing packaged files or installation. Include documentation and notices needed by the persistent runtime.
- Keep examples and screenshots public and synthetic. Never commit credentials, local review files, personal machine paths, or private organizational material. Preserve the MIT license and required third-party notices when adapting code.

For product usage, start with [README.md](README.md). For anchoring and storage details, see [the feedback reference](docs/reference.md).

## CI and distribution

CI runs all checks on Linux and macOS. External fork workflows require maintainer approval through GitHub repository settings; preserve the ordinary `pull_request` event, read-only permissions, and action SHA pins. The manual release workflow is restricted to the repository owner on `main`.

`bin/conduct.mjs` is a Node-compatible launcher for the bundled Bun dependency. Keep this entry point valid in Node without a global Bun installation. The native build embeds a production payload and uses its own runtime to load that payload. Agent installers copy the executable so deleting npm caches or downloaded binaries does not break installed skills or hooks. See [distribution details](docs/distribution.md) before changing packaging.
