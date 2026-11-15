import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { app, net, safeStorage, shell } from "electron";
import type { Auth, User } from "@shared/types";

type Session = { token: string; expiresAt: string; user: User };

type Pending = { verifier: string; state: string };

type Listener = (auth: Auth, previous: Auth) => void;

const scheme = "simpleton";

export const baseUrl = (process.env.SIMPLETON_WEB_URL || (app.isPackaged ? "https://www.simpleton.io" : "http://localhost:3001")).replace(/\/+$/, "");

const file = () => join(app.getPath("userData"), "session.bin");

let auth: Auth = { status: "loading", user: null };
let session: Session | null = null;
let pending: Pending | null = null;
const listeners = new Set<Listener>();

function set(next: Auth) {
  const previous = auth;
  auth = next;
  listeners.forEach((listener) => listener(auth, previous));
}

export function get() {
  return auth;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerScheme() {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(scheme, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(scheme);
  }
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

export function token() {
  return session?.token ?? null;
}

export function request(path: string, init: RequestInit = {}, timeout = 15000) {
  return net.fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeout) });
}

function isUser(value: unknown): value is User {
  const user = value as User | null;
  return !!user && typeof user.id === "string" && typeof user.name === "string" && typeof user.email === "string";
}

function expired(expiresAt: string) {
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

async function save(next: Session) {
  session = next;
  if (!safeStorage.isEncryptionAvailable()) return;
  const target = file();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
}

async function read() {
  try {
    const parsed = JSON.parse(safeStorage.decryptString(await readFile(file()))) as Session;
    return typeof parsed.token === "string" && isUser(parsed.user) ? parsed : null;
  } catch {
    return null;
  }
}

async function clear() {
  session = null;
  await rm(file(), { force: true });
}

export async function restore() {
  const saved = await read();
  if (!saved || expired(saved.expiresAt)) {
    await clear();
    set({ status: "signed-out", user: null });
    return;
  }
  session = saved;

  try {
    const response = await request("/api/desktop/me", { headers: { authorization: `Bearer ${saved.token}` } }, 5000);
    if (response.status === 401) {
      await clear();
      set({ status: "signed-out", user: null });
      return;
    }
    if (response.ok) {
      const body = (await response.json()) as { user?: unknown; expiresAt?: string };
      if (isUser(body.user)) {
        await save({ token: saved.token, expiresAt: body.expiresAt ?? saved.expiresAt, user: body.user });
      }
    }
  } catch {}

  if (auth.status !== "signing-in") set({ status: "signed-in", user: session?.user ?? saved.user });
}

export async function login() {
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(24));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  pending = { verifier, state };
  set({ status: "signing-in", user: null });
  await shell.openExternal(`${baseUrl}/login?${new URLSearchParams({ challenge, state })}`);
}

export function cancel() {
  pending = null;
  if (auth.status === "signing-in") set({ status: "signed-out", user: null });
}

export async function handleUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (url.protocol !== `${scheme}:` || url.hostname !== "auth") return;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const current = pending;
  if (!current || !code || state !== current.state) return;
  pending = null;

  try {
    const response = await request("/api/desktop/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier: current.verifier }),
    });
    const body = (await response.json().catch(() => null)) as Partial<Session> | null;
    if (!response.ok || typeof body?.token !== "string" || !isUser(body.user)) {
      set({ status: "signed-out", user: null, error: "Sign in failed. Try again." });
      return;
    }
    await save({ token: body.token, expiresAt: String(body.expiresAt ?? ""), user: body.user });
    set({ status: "signed-in", user: body.user });
  } catch {
    set({ status: "signed-out", user: null, error: "Couldn't reach Simpleton. Check your connection and try again." });
  }
}

export async function logout() {
  const token = session?.token;
  pending = null;
  await clear();
  set({ status: "signed-out", user: null });
  if (token) {
    await request("/api/desktop/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
  }
}
