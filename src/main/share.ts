import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { Share } from "@shared/types";
import * as auth from "./auth";
import * as store from "./store";

type TunnelRequest = { type: "request"; id: string; method: string; path: string; headers: [string, string][]; body: string | null };

type TunnelResponse = { type: "response"; id: string; status: number; headers: [string, string][]; body: string | null };

type Tunnel = { socket: WebSocket | null; retry?: NodeJS.Timeout; heartbeat?: NodeJS.Timeout; attempts: number; closed: boolean };

const domain = process.env.SIMPLETON_SHARE_DOMAIN || "simpleton.live";
const relay = (name: string) => (process.env.SIMPLETON_RELAY_URL || `wss://${name}.${domain}`).replace(/\/+$/, "");
const CONNECT_PATH = "/_simpleton/connect";
const PING = "ping";
const PONG = "pong";
const PAGE_HEADER = "x-simpleton-page";
const CLOSE = { replaced: 4000, unauthorized: 4001, invalidName: 4002, taken: 4009 };
const HEARTBEAT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_BODY = 20 * 1024 * 1024;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const VERBS = new Set(["fix", "add", "update", "make", "create", "implement", "change", "remove", "refactor", "build", "improve", "support", "use", "set", "move", "rename", "delete", "new"]);
const dropRequest = new Set(["host", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "accept-encoding", "content-length"]);
const dropResponse = new Set(["connection", "keep-alive", "transfer-encoding", "content-length"]);

class ShareError extends Error {
  constructor(
    message: string,
    readonly fatal = false,
  ) {
    super(message);
  }
}

const tunnels = new Map<string, Tunnel>();

const shareUrl = (name: string) => `https://${name}.${domain}`;

function newName(branch: string) {
  const words = (branch.split("/").pop() ?? branch).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const meaningful = words.filter((word) => !VERBS.has(word));
  const base = (meaningful.length ? meaningful : words).slice(0, 2).join("-").slice(0, 20).replace(/-+$/, "") || "app";
  const suffix = [...randomBytes(4)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `${base}-${suffix}`;
}

function patch(id: string, change: Partial<Share>) {
  return store.update((s) => {
    const current = s.shares[id];
    if (!current) return s;
    return { ...s, shares: { ...s.shares, [id]: { ...current, ...change } } };
  });
}

async function ticket(name: string) {
  const token = auth.token();
  if (!token) throw new ShareError("Sign in to share", true);
  let response: Response;
  try {
    response = await auth.request("/api/desktop/relay-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch {
    throw new ShareError("Can't reach Simpleton");
  }
  if (response.status === 401) throw new ShareError("Sign in again to share", true);
  const body = (await response.json().catch(() => null)) as { ticket?: unknown } | null;
  if (!response.ok || typeof body?.ticket !== "string") throw new ShareError("Can't reach Simpleton");
  return body.ticket;
}

function schedule(id: string) {
  const tunnel = tunnels.get(id);
  if (!tunnel || tunnel.closed) return;
  clearTimeout(tunnel.retry);
  const delay = Math.min(30_000, 1000 * 2 ** tunnel.attempts);
  tunnel.attempts++;
  tunnel.retry = setTimeout(() => connect(id), delay);
}

function fail(id: string, error: ShareError) {
  if (error.fatal) shut(id);
  patch(id, { status: "error", error: error.message });
  if (!error.fatal) schedule(id);
}

async function rename(id: string) {
  const tunnel = tunnels.get(id);
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!tunnel || tunnel.closed || !workspace) return;
  if (tunnel.attempts++ >= 3) return fail(id, new ShareError("Couldn't start sharing", true));
  const name = newName(workspace.branch);
  await patch(id, { name, url: shareUrl(name), status: "connecting", error: undefined });
  connect(id);
}

async function connect(id: string) {
  const tunnel = tunnels.get(id);
  const share = store.get().shares[id];
  if (!tunnel || tunnel.closed || !share) return;

  let value: string;
  try {
    value = await ticket(share.name);
  } catch (error) {
    return fail(id, error instanceof ShareError ? error : new ShareError("Can't reach Simpleton"));
  }
  if (tunnel.closed) return;

  const socket = new WebSocket(`${relay(share.name)}${CONNECT_PATH}?name=${share.name}`, { headers: { authorization: `Bearer ${value}` } });
  tunnel.socket = socket;
  let opened = false;
  let finished = false;
  let lastPong = Date.now();

  const finish = (code: number) => {
    if (finished) return;
    finished = true;
    clearInterval(tunnel.heartbeat);
    if (tunnel.socket === socket) tunnel.socket = null;
    if (tunnel.closed) return;
    if (code === CLOSE.replaced) return fail(id, new ShareError("Shared from another window", true));
    if (code === CLOSE.taken || code === CLOSE.invalidName) return rename(id);
    if (code === CLOSE.unauthorized) return fail(id, new ShareError("Couldn't start sharing"));
    if (!opened) return fail(id, new ShareError("Can't reach the share server"));
    patch(id, { status: "connecting" });
    schedule(id);
  };

  socket.addEventListener("open", () => {
    opened = true;
    tunnel.attempts = 0;
    lastPong = Date.now();
    patch(id, { status: "live", error: undefined });
    tunnel.heartbeat = setInterval(() => {
      if (Date.now() - lastPong > HEARTBEAT_MS * 3) {
        socket.close();
        return finish(1006);
      }
      socket.send(PING);
    }, HEARTBEAT_MS);
  });

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    if (event.data === PONG) {
      lastPong = Date.now();
      return;
    }
    handle(id, socket, event.data);
  });

  socket.addEventListener("close", (event) => finish(event.code));
}

function handle(id: string, socket: WebSocket, raw: string) {
  let message: TunnelRequest;
  try {
    message = JSON.parse(raw) as TunnelRequest;
  } catch {
    return;
  }
  if (message.type !== "request") return;
  forward(id, message).then((response) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(response));
  });
}

function text(id: string, status: number, body: string): TunnelResponse {
  return { type: "response", id, status, headers: [["content-type", "text/plain; charset=utf-8"], ["cache-control", "no-store"]], body: Buffer.from(body).toString("base64") };
}

function signal(id: string, state: "stopped" | "starting" | "unreachable" | "timeout", status: number): TunnelResponse {
  return { type: "response", id, status, headers: [[PAGE_HEADER, state]], body: null };
}

function decompress(body: Buffer, encoding: string) {
  if (encoding === "gzip" || encoding === "x-gzip") return gunzipSync(body);
  if (encoding === "br") return brotliDecompressSync(body);
  if (encoding === "deflate") return inflateSync(body);
  return null;
}

function forward(workspaceId: string, message: TunnelRequest) {
  const { previews, shares } = store.get();
  const preview = previews[workspaceId];
  const share = shares[workspaceId];
  if (!share || !preview || (preview.state !== "running" && preview.state !== "starting")) return Promise.resolve(signal(message.id, "stopped", 503));
  const starting = preview.state === "starting";

  const host = `${share.name}.${domain}`;
  const local = new RegExp(`^https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1?\\]):${preview.port}(?=/|$)`, "i");
  const body = message.body ? Buffer.from(message.body, "base64") : null;
  const headers: Record<string, string> = {};
  for (const [key, value] of message.headers) if (!dropRequest.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
  headers.host = `localhost:${preview.port}`;
  headers["x-forwarded-host"] = host;
  headers["x-forwarded-proto"] = "https";
  headers["accept-encoding"] = "identity";
  if (body) headers["content-length"] = String(body.length);

  return new Promise<TunnelResponse>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (response: TunnelResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };

    const req = httpRequest({ host: "localhost", port: preview.port, method: message.method, path: message.path, headers }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          done(text(message.id, 502, "This response is too large to share."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on("error", () => done(text(message.id, 502, "The app closed the connection.")));
      res.on("end", () => {
        let payload = Buffer.concat(chunks);
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let decoded = false;
        if (encoding && encoding !== "identity" && !payload.length) decoded = true;
        else if (encoding && encoding !== "identity") {
          try {
            const plain = decompress(payload, encoding);
            if (plain) {
              payload = plain;
              decoded = true;
            }
          } catch {
            return done(text(message.id, 502, "The app sent a response that couldn't be read."));
          }
        }
        const out: [string, string][] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          const key = res.rawHeaders[i];
          const lower = key.toLowerCase();
          let value = res.rawHeaders[i + 1];
          if (dropResponse.has(lower) || (decoded && lower === "content-encoding")) continue;
          if (lower === "location") value = value.replace(local, `https://${host}`);
          if (lower === "set-cookie") value = value.replace(/;\s*domain=[^;]*/gi, "");
          out.push([key, value]);
        }
        const status = res.statusCode && res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 502;
        done({ type: "response", id: message.id, status, headers: out, body: payload.length ? payload.toString("base64") : null });
      });
    });

    req.on("error", () => done(starting ? signal(message.id, "starting", 503) : signal(message.id, "unreachable", 502)));
    timer = setTimeout(() => {
      done(starting ? signal(message.id, "starting", 503) : signal(message.id, "timeout", 504));
      req.destroy();
    }, REQUEST_TIMEOUT_MS);
    req.end(body ?? undefined);
  });
}

function open(id: string) {
  shut(id);
  tunnels.set(id, { socket: null, attempts: 0, closed: false });
  connect(id);
}

function shut(id: string) {
  const tunnel = tunnels.get(id);
  if (!tunnel) return;
  tunnel.closed = true;
  clearTimeout(tunnel.retry);
  clearInterval(tunnel.heartbeat);
  tunnel.socket?.close(1000);
  tunnels.delete(id);
}

export async function start(id: string) {
  const { workspaces, shares } = store.get();
  const workspace = workspaces.find((w) => w.id === id);
  if (!workspace) throw new Error("Unknown workspace");
  const name = shares[id]?.name ?? newName(workspace.branch);
  await store.update((s) => ({ ...s, shares: { ...s.shares, [id]: { name, url: shareUrl(name), status: "connecting" } } }));
  open(id);
}

export async function stop(id: string) {
  shut(id);
  if (!store.get().shares[id]) return;
  await store.update((s) => {
    const shares = { ...s.shares };
    delete shares[id];
    return { ...s, shares };
  });
}

export function resume() {
  for (const id of Object.keys(store.get().shares)) if (!tunnels.has(id)) open(id);
}

export function suspend() {
  for (const id of [...tunnels.keys()]) shut(id);
  for (const id of Object.keys(store.get().shares)) patch(id, { status: "error", error: "Sign in to share" });
}

export function shutdown() {
  for (const id of [...tunnels.keys()]) shut(id);
}
