# Login

The app requires an account. Users sign in with Google on simpleton.io in their normal browser, then the browser hands them back to the app. The website owns the users and the database. The app only stores a token.

## Flow

```
1. App makes a random verifier and its challenge = base64url(sha256(verifier))
2. App opens https://www.simpleton.io/login?challenge=<challenge>&state=<random>
3. User signs in with Google on the website
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
| POST | `/api/desktop/relay-ticket` | `Authorization: Bearer <token>`, `{ name }` | `{ ticket, expiresAt }`, `400 { error: "invalid_name" }` or `401` |

`user` is `{ id, name, email, image }`.

Rules the website enforces:
- `challenge` is 43 base64url characters. `state` is 16 to 128 base64url characters. `verifier` is 43 to 128 characters.
- A code works once and expires after 5 minutes. A wrong verifier burns the code.
- Tokens last 90 days and extend themselves while the app keeps using them.

## What to build in the app

### Main process

- [x] Add `src/main/auth.ts`
- [x] Register the scheme: `app.setAsDefaultProtocolClient("simpleton")`
- [x] Add to `electron-builder.yml`:
  ```yaml
  protocols:
    - name: Simpleton
      schemes: [simpleton]
  ```
- [x] Handle `app.on("open-url", ...)` and register it before `app.whenReady()`. In dev, also pass `process.execPath` and the app path to `setAsDefaultProtocolClient` so the link reaches the dev build.
- [x] `login()`: make the verifier (32 random bytes, base64url), the challenge and the state. Keep them in memory and open the login URL with `shell.openExternal`.
- [x] On `simpleton://auth`: check `state` matches, POST to `/api/desktop/token`, then clear the verifier and state.
- [x] Save the token with `safeStorage.encryptString` to `userData/session.bin`. Never put it in `state.json`.
- [x] On startup: read the token and call `/api/desktop/me`. On `401`, delete the token and show the login screen. If the network fails, keep the saved user and let them in.
- [x] `logout()`: POST `/api/desktop/logout`, delete `session.bin`, show the login screen.
- [x] Focus the window after a successful login (`window.show()` and `app.focus({ steal: true })`).
- [x] Read the base URL from `SIMPLETON_WEB_URL`, defaulting to `https://www.simpleton.io`. Use `http://localhost:3001` in dev.

### Shared types and IPC

- [x] Add `auth: { user: User | null; status: "loading" | "signed-out" | "signing-in" | "signed-in" }` as a separate `auth` / `onAuth` channel
- [x] Add `login()`, `cancelLogin()` and `logout()` to `Api` and the preload bridge
- [x] The renderer only ever gets the user. Keep the token in main.

### Renderer

- [x] `Login.tsx`: full-window screen with the logo, "Sign in to Simpleton" and one "Continue with Google" button that calls `login()`
- [x] While signing in, swap the button for "Waiting for browser" and a cancel link
- [x] In `App.tsx`, show `Login` until `status` is `signed-in`
- [x] Sidebar footer: avatar and name, with a menu holding "Sign out"

### Test

- [ ] Run the website on port 3001 and the app with `SIMPLETON_WEB_URL=http://localhost:3001`
- [ ] Sign in, quit, reopen: you should stay signed in
- [ ] Sign out: the login screen comes back and `/api/desktop/me` returns `401` for the old token
- [ ] Packaged build: `npm run dist:dir`, open the `.app` once so macOS registers `simpleton://`, then sign in

## Website setup (one time)

- [ ] Create a Google OAuth client at console.cloud.google.com under APIs & Services
  - Set up the OAuth consent screen (External, app name Simpleton, scopes `openid`, `email`, `profile`) and publish it
  - Credentials, Create OAuth client ID, type Web application
  - Authorized JavaScript origins: `https://www.simpleton.io` and `http://localhost:3001`
  - Authorized redirect URIs: `https://www.simpleton.io/api/auth/callback/google` and `http://localhost:3001/api/auth/callback/google`
- [ ] Create a Postgres database (Neon or Supabase) and copy its connection string
- [ ] Set these in Vercel and in the website's `.env.local`: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Run `npm run db:migrate` in the website repo against each database
- [ ] See signups with `select name, email, "createdAt" from "user" order by "createdAt" desc;`
