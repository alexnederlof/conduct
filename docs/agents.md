# Working with agents

[← Back to Conduct](../README.md)

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

Installed instructions include an absolute command pointing to a persistent runtime with a copy of the executable, production dependencies, and the bundled examples. They work without a global `conduct` binary and after clearing BunX’s cache or moving the source checkout. The runtime is under the selected agent directory’s `conduct/runtime/` (`.agents` for an `all` installation). Rerun the installer when upgrading or setting up the project on another machine. Generated instructions refer to this machine’s runtime; the original skill in the package remains portable. Agents discover the skill on their next turn; restart if it does not appear.

Reinstallation updates a Conduct-managed skill. If a different skill already exists or you edited the installed instructions, the installer preserves it and asks you to use `--force` to replace it. Linked skill folders are never overwritten. Other files in the skill directory are preserved.

```sh
conduct install skill all --force
conduct uninstall skill claude
conduct uninstall skill all --project
```

Uninstall removes the installed instructions and their ownership marker, preserving other files and cached runtimes that hooks or other skill installations may still use. Edited instructions also require `--force` for removal. This skill installation is independent of the plan approval hook below.

The CLI still prints the portable skill with `conduct skill`. The skill explains format selection, background presentation, waiting for submission, round cursors, exact anchors, and source editing.

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

With `--project`, run the command from the project root. The installer merges a synchronous `PreToolUse` hook matching only `ExitPlanMode` into `~/.claude/settings.json` (user scope), or `.claude/settings.local.json` (project scope). It preserves other settings and hooks and is safe to rerun. `CLAUDE_CONFIG_DIR` is respected for user configuration and review storage. A private, persistent runtime with production dependencies is copied under the selected settings directory’s `conduct/runtime/`, so Bun’s cache and the original checkout are no longer needed. The executable is copied into the installed runtime, so the original Bun installation or downloaded executable can be moved or removed. Rerun the installer after upgrading Conduct. The same installer works from a BunX package.

Review artifacts live under `~/.claude/conduct/reviews/<unique-id>/`: `plan.md`, `invocation.json`, `session.json` (the private browser URL and expiry), `feedback.json`, and the returned `result.json` after a completed handoff. These are local files containing your plan and comments. Sessions are independent across terminals and projects. Old reviews and runtime versions are retained; remove them manually when no review is running if you no longer need them.

To disable the integration without removing your review history:

```sh
bun src/cli.ts uninstall hook
# Or: bun src/cli.ts uninstall hook --project
```

This integration uses Claude Code’s documented [PreToolUse decision protocol](https://code.claude.com/docs/en/hooks#pretooluse-decision-control). Approval returns both `permissionDecision: "allow"` and the original `updatedInput`; the latter is required to satisfy `ExitPlanMode`’s interaction requirement. Change requests return `"deny"` with the inline feedback. Hook stdout contains only the JSON decision; launch details go to stderr. Implementation permissions are unchanged, and approval does not clear the conversation.

Use a current Claude Code version that supplies `tool_input.plan` and `tool_input.planFilePath` to hooks. Existing deny/ask rules and other hooks can still require a native prompt. If hooks are disabled, blocked by managed settings, cannot launch, or are forcibly killed by Claude, its native permission flow applies. The installer’s one-hour hook deadline leaves a minute for Conduct to deny its own expired review. A skill alone cannot reliably intercept the native gate; no skill invocation is needed once this hook is installed. The full request-changes → revised plan → approval loop was verified in interactive Claude Code 2.1.260. Its headless `-p` mode disabled `ExitPlanMode` in our test, so interactive plan mode is the verified integration.
