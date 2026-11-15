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

State lives in `~/Library/Application Support/Simpleton/state.json`. Worktrees go in `worktrees/` next to it.

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

1. Agent sessions: Claude Agent SDK and Codex SDK, streamed steps, statuses
2. Questions from agents with answer buttons
3. One-click PR with an agent-written description
4. Per-workspace dev servers and live links through the relay
5. Signed DMG, auto-update, Homebrew tap
