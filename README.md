# Simpleton

Mac app for running Claude Code and Codex in parallel. Every task gets its own git worktree and branch, a live link, and a one-click pull request.

## Layout

```
src/main       Electron main process: state, git worktrees, IPC
src/preload    Typed bridge exposed to the UI as window.simpleton
src/renderer   React + Tailwind UI
src/shared     Types and IPC channel names used by all three
relay          Cloudflare Worker that serves *.simpleton.io live links
```

## Develop

```bash
npm install
npm run dev
```

Running from the VS Code terminal? Electron inherits `ELECTRON_RUN_AS_NODE` there and starts as plain Node. Run `unset ELECTRON_RUN_AS_NODE` first.

State lives in `~/Library/Application Support/Simpleton/state.json`. Worktrees go in `worktrees/` next to it, and chat transcripts go in `transcripts/`.

## Agents

Simpleton runs the user's own `claude` and `codex` CLIs, so tasks use their existing Claude and ChatGPT subscriptions. There are no API keys. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CODEX_API_KEY` are removed from the agent's environment so a stray key never overrides the subscription.

The binaries are found on the login shell's `PATH` first. If that fails, Simpleton checks the usual install folders, the Claude Code extension bundled with VS Code, Cursor or Windsurf, and the Codex CLI bundled with ChatGPT.app.

Each message is one CLI run inside the workspace's worktree:

- Claude Code: `claude -p --output-format stream-json --verbose --permission-mode auto`, then `--resume <session>` for follow-ups
- Codex: `codex exec --json --sandbox workspace-write` with network access on, then `resume <thread>` for follow-ups

The code is in `src/main/agents`. `claude.ts` and `codex.ts` turn each CLI's JSON events into transcript entries.

## Terminal and Run

Each workspace has a terminal in its worktree and a Run button for the app. Both use `node-pty` (`src/main/terminals.ts`). The postinstall step makes node-pty's `spawn-helper` executable, because the published prebuild ships without the exec bit.

Run (`src/main/apps.ts`) picks the `dev`, `start` or `serve` script from `package.json`. It detects the package manager from the lockfile and picks a free random port between 4000 and 9000. The port is passed as `PORT`, and also as `--port` for tools that ignore `PORT`, such as Vite, Next, Astro and Nuxt. If the project has dependencies and the worktree has no `node_modules`, Run installs them first. The header link uses the URL the server prints, or the port once it starts accepting connections.

New worktrees get copies of the repo's root `.env*` files, because git does not check out ignored files.

## Pull requests

Create PR (`src/main/pr.ts`) works without a GitHub token. It commits any uncommitted work, using the task's first line as the message, and pushes the branch with the user's own git credentials. If `gh` is installed, it then opens the PR with the agent's last message as the body. Otherwise it opens GitHub's new pull request page with the title and body filled in. Once a PR exists, the button becomes Commit & push, which commits new work and pushes it to the same branch. Share copies a placeholder `https://<branch>.simpleton.io` link until the relay is wired up.

## Ship

```bash
npm run dist
```

Signing and notarization read the usual electron-builder variables: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## Relay

```bash
cd relay
npm install
npx wrangler secret put RELAY_SECRET
npm run deploy
```

The app opens a WebSocket to `wss://<name>.simpleton.io/_simpleton/connect?name=<name>` with `Authorization: Bearer <RELAY_SECRET>`. Requests to `https://<name>.simpleton.io` are sent down that socket as `request` messages and answered with `response` messages. The message shapes are in `relay/src/protocol.ts`. The single shared secret is a placeholder until per-user tokens exist.

## Roadmap

1. Agent sessions: local Claude Code and Codex CLIs, streamed steps, statuses
2. Questions from agents with answer buttons
3. One-click PR with an agent-written description
4. Per-workspace dev servers and live links through the relay
5. Signed DMG, auto-update, Homebrew tap
