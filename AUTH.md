# Login

The app requires an account. Users sign in with GitHub on simpleton.io in their normal browser, then the browser hands them back to the app. The website owns the users and the database. The app only stores a token.

## Flow

```
1. App makes a random verifier and its challenge = base64url(sha256(verifier))
2. App opens https://simpleton.io/login?challenge=<challenge>&state=<random>
3. User signs in with GitHub on the website
4. Website redirects to simpleton://auth?code=<code>&state=<state>
5. App checks state, POSTs code + verifier to /api/desktop/token
6. Website returns { token, expiresAt, user }
7. App stores the token encrypted and shows the app
```

## Website endpoints (already built)

| Method | Path | Send | Get back |
|---|---|---|---|
| GET | `/login?challenge=&state=` | Open in the browser | Redirects to `simpleton://auth?code=&state=` |
| POST | `/api/desktop/token` | `{ code, verifier }` | `{ token, expiresAt, user }` or `400 { error: "invalid_grant" }` |
| GET | `/api/desktop/me` | `Authorization: Bearer <token>` | `{ user, expiresAt }` or `401` |
| POST | `/api/desktop/logout` | `Authorization: Bearer <token>` | `204` |

`user` is `{ id, name, email, image }`.

Rules the website enforces:
- `challenge` is 43 base64url characters. `state` is 16 to 128 base64url characters. `verifier` is 43 to 128 characters.
- A code works once and expires after 5 minutes. A wrong verifier burns the code.
- Tokens last 90 days and extend themselves while the app keeps using them.

## What to build in the app

### Main process

- [ ] Add `src/main/auth.ts`
- [ ] Register the scheme: `app.setAsDefaultProtocolClient("simpleton")`
- [ ] Add to `electron-builder.yml`:
  ```yaml
  protocols:
    - name: Simpleton
      schemes: [simpleton]
  ```
- [ ] Handle `app.on("open-url", ...)` and register it before `app.whenReady()`. In dev, also pass `process.execPath` and the app path to `setAsDefaultProtocolClient` so the link reaches the dev build.
- [ ] `login()`: make the verifier (32 random bytes, base64url), the challenge and the state. Keep them in memory and open the login URL with `shell.openExternal`.
- [ ] On `simpleton://auth`: check `state` matches, POST to `/api/desktop/token`, then clear the verifier and state.
- [ ] Save the token with `safeStorage.encryptString` to `userData/session.bin`. Never put it in `state.json`.
- [ ] On startup: read the token and call `/api/desktop/me`. On `401`, delete the token and show the login screen. If the network fails, keep the saved user and let them in.
- [ ] `logout()`: POST `/api/desktop/logout`, delete `session.bin`, show the login screen.
- [ ] Focus the window after a successful login (`window.show()` and `app.focus({ steal: true })`).
- [ ] Read the base URL from `SIMPLETON_WEB_URL`, defaulting to `https://simpleton.io`. Use `http://localhost:3000` in dev.

### Shared types and IPC

- [ ] Add `auth: { user: User | null; status: "loading" | "signed-out" | "signing-in" | "signed-in" }` to `AppState`, or a separate `onAuth` channel
- [ ] Add `login()` and `logout()` to `Api` and the preload bridge
- [ ] The renderer only ever gets the user. Keep the token in main.

### Renderer

- [ ] `Login.tsx`: full-window screen with the logo, "Sign in to Simpleton" and one "Continue with GitHub" button that calls `login()`
- [ ] While signing in, swap the button for "Waiting for browser" and a cancel link
- [ ] In `App.tsx`, show `Login` until `status` is `signed-in`
- [ ] Sidebar footer: avatar and name, with a menu holding "Sign out"

### Test

- [ ] Run the website on port 3000 and the app with `SIMPLETON_WEB_URL=http://localhost:3000`
- [ ] Sign in, quit, reopen: you should stay signed in
- [ ] Sign out: the login screen comes back and `/api/desktop/me` returns `401` for the old token
- [ ] Packaged build: `npm run dist:dir`, open the `.app` once so macOS registers `simpleton://`, then sign in

## Website setup (one time)

- [ ] Create a GitHub OAuth app at github.com/settings/developers
  - Homepage: `https://simpleton.io`
  - Callback: `https://simpleton.io/api/auth/callback/github`
  - Make a second one for local dev with `http://localhost:3000/api/auth/callback/github`
- [ ] Create a Postgres database (Neon or Supabase) and copy its connection string
- [ ] Set these in Vercel and in the website's `.env.local`: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- [ ] Run `npm run db:migrate` in the website repo against each database
- [ ] See signups with `select name, email, "createdAt" from "user" order by "createdAt" desc;`
