# TODO

## Run it locally

- [ ] `npm install`
- [ ] In the VS Code terminal, run `unset ELECTRON_RUN_AS_NODE` first
- [ ] `npm run dev`
- [ ] Add a repo and start a task to check it works

## Accounts and setup

- [ ] Install the `claude` and `codex` CLIs and log in to both
- [ ] Check Anthropic's terms on using Claude subscription login inside a third-party app
- [ ] Make sure you own `simpleton.io` and add it to Cloudflare

## Live links relay

- [ ] `cd relay && npm install`
- [ ] `npx wrangler login`
- [ ] `npx wrangler secret put RELAY_SECRET` and pick a long random string
- [ ] `npm run deploy`

## Signing and release

- [ ] Join the Apple Developer Program
- [ ] Create a "Developer ID Application" certificate in Xcode and export it as a `.p12`
- [ ] Create an app-specific password at appleid.apple.com
- [ ] Set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- [ ] `npm run dist` and open the DMG to test
- [ ] Upload the build to GitHub Releases
- [ ] Point `simpleton.io/download` at the latest DMG
- [ ] Create a `homebrew-tap` repo with a `simpleton` cask

## Build next

- [x] Run Claude Code and Codex inside a workspace and stream their steps
- [ ] Show agent questions with answer buttons
- [ ] One-click PR with an agent-written description
- [ ] Start a dev server per workspace and connect it to the relay
- [ ] Auto-update
