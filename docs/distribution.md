# Installation, versions, and releases

[← Back to Conduct](../README.md)

## Run directly from GitHub

With Node.js 20+ and npm, you can use the current default branch without installing Bun:

```sh
npx --yes --package github:alexnederlof/conduct conduct ./proposal.md
```

The package installs the official Bun runtime as a dependency. A small Node launcher starts Conduct with that runtime. npm's optional dependencies and install scripts must be enabled. This installs Bun inside the package's dependencies; it does not require a global Bun installation.

If you already use Bun:

```sh
bunx --bun --package github:alexnederlof/conduct conduct ./proposal.md
```

Neither GitHub command requires a release. An omitted ref selects the repository's default branch (`main`). To select it explicitly, use `github:alexnederlof/conduct#main`. For reproducible use, append `#v0.1.0` for a published tag or `#<full-commit-sha>` for a commit. Quote a specifier containing `#` if your shell requires it.

Both package managers cache downloads. An unversioned GitHub command is convenient for trying Conduct; an explicit commit or release tag is the reliable way to choose an exact version. `latest` is not a special Git branch or an instruction to pick the newest GitHub release.

## Download an executable

[GitHub Releases](https://github.com/alexnederlof/conduct/releases) provide:

| Platform             | File                   |
| -------------------- | ---------------------- |
| macOS, Apple Silicon | `conduct-darwin-arm64` |
| macOS, Intel         | `conduct-darwin-x64`   |
| Linux, x64           | `conduct-linux-x64`    |
| Linux, ARM64         | `conduct-linux-arm64`  |

Download the matching file, rename it to `conduct`, and make it executable:

```sh
chmod +x ./conduct
./conduct ./proposal.md
```

These executables include Bun, the presenter, fonts, and production dependencies. Neither Node.js nor Bun needs to be installed. On first launch, the embedded files are unpacked into a versioned directory under `~/.cache/conduct/`. Set `CONDUCT_CACHE_DIR` to choose another directory. No dependency download is needed to present a self-contained document. External libraries in a document can still require a network connection.

Each release includes `SHA256SUMS`, license notices, and `conduct.tgz`. The latter is the npm-compatible source package, which can also be run without Git installed:

```sh
npx --yes --package https://github.com/alexnederlof/conduct/releases/latest/download/conduct.tgz conduct ./proposal.md
```

Here, `releases/latest/download` is a **GitHub release redirect**. To pin a release, replace `latest/download` with `download/v0.1.0`.

The current binary release targets macOS and Linux. Linux binaries target glibc; Alpine/musl users should use the npm or Bun package. Windows binaries and Windows agent installation are not currently part of the tested release matrix.

## npm's `latest` tag

The npm package name is **`@alexnederlof/conduct`**; the executable is still **`conduct`**. The unscoped npm package `conduct` belongs to an unrelated project.

Once a version is published to the npm registry, these commands become available:

```sh
npx @alexnederlof/conduct@latest ./proposal.md
npx @alexnederlof/conduct@0.1.0 ./proposal.md
npm install --global @alexnederlof/conduct
conduct ./proposal.md
```

`latest` is an npm distribution tag pointing to a published version. A normal stable `npm publish` updates it; a GitHub release alone does not. Until the initial npm publication, use the working GitHub commands above.

## Installed agent runtimes

`install skill` and `install hook` copy a persistent runtime **including the executable** into the chosen agent configuration directory. They continue working after the original executable is moved or the npm/BunX cache is removed. They do not update themselves: rerun the installer with the new Conduct version to upgrade them.

Initial skill or hook installation can download production dependencies. Uninstall removes Conduct's instructions or hook entries while preserving cached runtimes and review history.

## CI and contributor approval

[CI](https://github.com/alexnederlof/conduct/blob/main/.github/workflows/ci.yml) runs strict TypeScript checking, every Bun test, and a packaged `npx` review smoke test on Linux and macOS, with Bun 1.3.14 and 1.4.2. The smoke test exercises Markdown, HTML, React, submission, waiting for feedback, and an installed skill after its npm cache is removed.

Pushes to `main` run automatically. Fork pull requests use the ordinary `pull_request` event, a read-only token, and no repository secrets. GitHub's repository setting is configured to **require approval for all external contributors**, including people who have contributed before. This setting lives in GitHub, not in the workflow YAML.

To approve a contribution:

1. Open the pull request and inspect its changes, including any workflow, script, or dependency changes.
2. Open **Awaiting approval** in the merge/checks panel.
3. Choose **Approve workflows to run**.

Approval starts the tests; it does not approve or merge the pull request. GitHub allows maintainers with write access to approve runs. Currently the repository owner is the only maintainer; adding other writers gives them this ability too. If you move or fork the repository, set this under **Settings → Actions → General → Approval for running fork pull request workflows from contributors**.

## Make a release

The [Build and release workflow](https://github.com/alexnederlof/conduct/blob/main/.github/workflows/release.yml) is manual and checks that the actor is the repository owner and the selected branch is `main`. It runs tests, builds and smoke-tests all four executables, then publishes a GitHub release only if every build succeeds. No pull request triggers this workflow.

1. Choose a new stable version in `package.json` and commit it with the lockfile changes, if any.
2. Push to `main` and wait for CI to pass.
3. Open **Actions → Build and release → Run workflow** with `main` selected.
4. The workflow creates `v<package-version>` at that exact commit and attaches executables, the source package, checksums, and notices. An existing release is never overwritten.

This workflow publishes to GitHub. To publish the npm package, sign into the npm account that owns the `@alexnederlof` scope and run from a clean, tested checkout:

```sh
npm login
bun run check
bun run test:package
bun publish --access public
```

npm may require a one-time code for publication. Keep authentication outside the repository. For a future automated npm workflow, configure npm trusted publishing for this repository instead of storing a long-lived registry token.

To build or test locally:

```sh
bun run build:binary
bun scripts/test-binary.ts dist/conduct-darwin-arm64
bun run test:package
```

Build on the target operating system and architecture; the payload contains a native Tailwind dependency. The release workflow provides those hosts. `scripts/build-binary.ts` packs the public source, installs production dependencies in `.temp/`, and embeds them into a Bun executable. Bun's source and linked-library notices are in [the runtime license](licenses/BUN-LICENSE.md).

References: [Bun executables](https://bun.com/docs/bundler/executables), [bunx](https://bun.com/docs/pm/bunx), [npm package specifiers](https://docs.npmjs.com/cli/v11/using-npm/package-spec/), [GitHub workflow approvals](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks).
