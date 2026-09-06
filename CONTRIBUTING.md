# Contributing to Conduct

Conduct helps people read an agent's work, respond to the exact passage that needs attention, and hand that feedback back to the agent. Contributions should make that conversation easier and keep the reading experience calm.

Bug reports, documentation fixes, accessibility improvements, and small, thoughtful features are all welcome. You do not need to be an expert in Bun or agent tooling to help.

## Find a place to start

- **Something broke?** [Open an issue](https://github.com/alexnederlof/conduct/issues/new) with the steps to reproduce it, what you expected, and what happened. Include your Conduct version, operating system, browser, and installation method. A small, synthetic Markdown, HTML, or React example is especially helpful.
- **Something was confusing?** Tell us where you got stuck, or send a documentation fix directly.
- **Have an idea?** Describe the problem and the workflow it would improve. For larger features, new dependencies, or changes to the feedback format, open an issue before investing in the implementation.

Search existing issues and pull requests first. Keep private documents, credentials, local review files, and personal information out of reports, fixtures, and screenshots.

## Run it locally

Install **Bun 1.3.14+** and **Node.js 20+ with npm**. Bun runs the project; Node and npm are needed to test the launcher and `npx` installation path.

Fork [alexnederlof/conduct](https://github.com/alexnederlof/conduct), then clone your fork and create a branch:

```sh
git clone https://github.com/YOUR-USERNAME/conduct.git
cd conduct
git switch -c improve-reading-view
bun install
bun run dev
```

Open the local review URL printed in your terminal. The development command serves the bundled Markdown example without opening a browser automatically. Stop it with `Ctrl+C`. Restart the server after source changes; there is no hot reload.

Try the other formats with:

```sh
bun src/cli.ts examples/reading-room.tsx --no-open
bun src/cli.ts examples/recharts.html --no-open
```

Use **Interact** in the left sidebar to try buttons and charts, then **Comment** or **Suggest** to leave feedback. Review files are ignored by Git. Put other temporary files in `.temp/` at the repository root.

## Make a focused change

[AGENTS.md](AGENTS.md) is the development guide: it maps the codebase, explains the review lifecycle, and documents the behaviors to preserve. `CLAUDE.md` links to that same file; edit `AGENTS.md` when updating the guide.

Keep a pull request centered on one problem. Match the surrounding TypeScript, use Bun for development commands, and reuse the shared components and semantic color tokens. Avoid unrelated formatting, new dependencies without a clear need, and type casts that hide errors.

These details matter especially:

- Suggestions must leave the original source intact, and feedback must identify the intended occurrence of selected text.
- Drafts and submitted reviews must remain distinct. Plan approval must always reflect an explicit user decision.
- HTML and React previews intentionally support external JavaScript. Preserve their separation from the review controls and feedback API.
- Skill and hook installers must preserve unrelated agent configuration. Test them in isolated directories under `.temp/`, not in your real agent settings.

Update CLI help, examples, public guides, and the bundled skill when a change affects how people or agents use Conduct. AI-assisted contributions are welcome; understand the code you submit and verify its behavior.

## Check your work

Run the standard checks for code changes:

```sh
bun run check
```

This runs TypeScript checking and the Bun test suite. Add regression tests when they meaningfully demonstrate a bug or protect new behavior.

| Change                                         | Additional verification                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading interface or browser behavior          | Try the affected flow in a real browser, check console errors, and check desktop and narrow-screen layouts. Include a screenshot or short recording in the PR when it helps explain the change. |
| CLI, dependencies, packaging, skills, or hooks | Run `bun run test:package`. It checks a real `npx` installation and the review handoff without a global Bun installation.                                                                       |
| Files shipped in the package                   | Run `mkdir -p .temp` followed by `bun pm pack --destination .temp` and inspect the listed files.                                                                                                |
| Native executable distribution                 | Follow the platform build and smoke-test instructions in [the distribution guide](docs/distribution.md#make-a-release).                                                                         |
| Documentation only                             | Check commands, relative links, and formatting.                                                                                                                                                 |

Format the files you touched with `bunx prettier --write <files>`. Keep generated packages, caches, and test output out of your commit. If you cannot run a relevant check, say which one and why in the PR.

## Send a pull request

Push your branch to your fork and open a pull request against `main`. Explain:

1. The problem and the resulting behavior.
2. How to reproduce or try the change.
3. What you tested, including any limitations.

Draft pull requests are welcome when you want early feedback. Respond to review comments and keep the description aligned with the final change.

External contributors' GitHub Actions runs wait for maintainer approval, including repeat contributors. **Awaiting approval is expected**; a maintainer will inspect the changes and approve the workflow run. You do not need repository secrets or additional permissions. Approval to run tests is separate from accepting the contribution.

`main` requires a pull request, all four CI matrix checks, an up-to-date branch, and resolved review conversations. These rules apply to administrators too. Force-pushes and branch deletion are blocked. No additional approving reviewer is required while the project has a single maintainer; the maintainer still decides which contributions to merge. Contributors do not need to publish packages or create releases.

Conduct uses the [MIT license](LICENSE). Preserve the existing license and [third-party notices](THIRD_PARTY_NOTICES.md), and include any attribution required by code or assets you contribute. Please keep discussion patient, specific, and respectful.
