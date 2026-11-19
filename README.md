# Simpleton

Mac app for running Claude Code and Codex in parallel. Every task gets its own git worktree and branch, a live link, and a one-click pull request.

## Layout

```
src/main       Electron main process: state, git worktrees, IPC
src/preload    Typed bridge exposed to the UI as window.simpleton
src/renderer   React + Tailwind UI
src/shared     Types and IPC channel names used by all three
relay          Cloudflare Worker that serves *.simpleton.live live links
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

Run (`src/main/apps.ts`) picks the `dev`, `start` or `serve` script from `package.json`. It detects the package manager from the lockfile and picks a free random port between 4000 and 9000. The port is passed as `PORT`, and also as `--port` for tools that ignore `PORT`, such as Vite, Next, Astro and Nuxt. New worktrees install dependencies in the background right after they are created, in the Setup tab of the terminal panel. Run waits for that install if it is still going and never installs on its own terminal. The header link uses the URL the server prints, or the port once it starts accepting connections.

New worktrees get copies of the repo's root `.env*` files, because git does not check out ignored files.

## Pull requests

Create PR (`src/main/pr.ts`) works without a GitHub token. It commits any uncommitted work, using the task's first line as the message, and pushes the branch with the user's own git credentials. If `gh` is installed, it then opens the PR with the agent's last message as the body. Otherwise it opens GitHub's new pull request page with the title and body filled in. Once a PR exists, the button becomes Commit & push, which commits new work and pushes it to the same branch.

## Reports

Reports (`src/main/reports.ts`) shows an activity heatmap and short daily and weekly summaries. `src/main/activity.ts` logs each task, agent run, opened PR and merge to `activity.json`, with the prompt and an excerpt of the agent's last reply. The log outlives deleted workspaces. On first launch it is backfilled from existing workspaces. `src/main/commits.ts` adds the user's own commits from every added repo, matched on `git config user.email` across all branches, so work done outside Simpleton counts too. The heatmap counts agent runs plus commits.

Every 15 minutes and on wake, Simpleton writes any missing daily report for the last 7 days and the weekly report for the last full Sunday to Saturday week, so the weekly report appears on Sunday. Each report is one `claude -p --model claude-sonnet-5-5` call with a JSON schema, run on the user's subscription. Without Claude Code it falls back to one line per task. Reports are saved in `reports.json`. Clicking a day in the heatmap opens its report, or offers to write one, which also works for today.

## Ship

```bash
npm run dist
```

Signing and notarization read the usual electron-builder variables: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## Relay

```bash
cd relay
npm install
npx wrangler secret put RELAY_TICKET_SECRET
npm run deploy
```

`RELAY_TICKET_SECRET` is shared by the website and the relay only. The app never sees it. Set the same value in the website's environment.

To share a workspace, the app asks the website for a ticket with `POST /api/desktop/relay-ticket`, sending `{ name }` and its login token. The website returns `{ ticket, expiresAt }`. The ticket is an HS256 JWT with `{ sub: userId, name, aud: "relay", exp }`, signed with `RELAY_TICKET_SECRET`, and it expires after 5 minutes. The app fetches a fresh one each time it connects.

The app then opens a WebSocket to `wss://<name>.simpleton.live/_simpleton/connect?name=<name>` with `Authorization: Bearer <ticket>`. The relay checks the signature, the expiry and that the ticket's name matches. The first user to connect to a name owns it, and connects from anyone else get `409`. Names like `www`, `api` and `admin` are reserved.

Requests to `https://<name>.simpleton.live` are sent down that socket as `request` messages and answered with `response` messages. The message shapes are in `relay/src/protocol.ts`. When the relay refuses a connection, it accepts the socket and closes it with a code: `4001` bad ticket, `4002` invalid name, `4009` name taken, `4000` replaced by a newer connection.

## Share

Share (`src/main/share.ts`) gives each workspace a stable name: the branch plus six random characters, saved in `state.json`. It fetches a ticket, connects to the relay and reconnects with a fresh ticket when the connection drops. A `ping` every 25 seconds keeps the socket open. The relay answers it with `pong` without waking up.

Each request goes to the workspace's Run port on `localhost`. The app sets `Host` to `localhost:<port>` so dev servers like Vite accept it, and passes the public host in `X-Forwarded-Host`. It asks for uncompressed responses and unpacks any that come back compressed. It rewrites `Location` headers that point at localhost and drops `Domain` from cookies. Responses are capped at 20 MB and 25 seconds. When the app can't answer, it replies with an `x-simpleton-page` header instead of a body, and the relay shows a branded page from `relay/src/pages.ts`. The states are `stopped`, `starting`, `unreachable` and `timeout`. The relay shows `offline` when no app is connected and `missing` for names nobody has claimed. While Run is starting, requests still go through as soon as the server accepts them. Until then visitors see a page that reloads itself every 3 seconds. Create share link starts Run when the app isn't running.

Stopping a share deletes its name, so the old link stops working for good.

`SIMPLETON_SHARE_DOMAIN` changes the share domain. `SIMPLETON_RELAY_URL` points the app at another relay, such as `ws://localhost:8787` for `wrangler dev`.

## Roadmap

1. Agent sessions: local Claude Code and Codex CLIs, streamed steps, statuses
2. Questions from agents with answer buttons
3. One-click PR with an agent-written description
4. Per-workspace dev servers and live links through the relay
5. Signed DMG, auto-update, Homebrew tap

## License

[MIT](LICENSE)
