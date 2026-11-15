import { DurableObject } from "cloudflare:workers";
import { isPageState, page } from "./pages";
import { CLOSE, CONNECT_PATH, decode, encode, PAGE_HEADER, PING, PONG, type TunnelRequest, type TunnelResponse } from "./protocol";

type Env = {
  TUNNEL: DurableObjectNamespace<Tunnel>;
  SHARE_DOMAIN: string;
  RELAY_TICKET_SECRET: string;
};

type Ticket = { sub: string; name: string; aud: string; exp: number };

const TIMEOUT_MS = 30_000;
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const OWNER_HEADER = "X-Simpleton-Owner";
const RESERVED = new Set(["www", "api", "app", "admin", "auth", "login", "mail", "docs", "help", "support", "status", "blog", "dashboard", "relay", "static", "assets", "cdn"]);

const text = new TextEncoder();

function bytes(base64url: string) {
  return decode(base64url.replace(/-/g, "+").replace(/_/g, "/"));
}

function json<T>(base64url: string) {
  return JSON.parse(new TextDecoder().decode(bytes(base64url))) as T;
}

async function verifyTicket(token: string, secret: string) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  try {
    const key = await crypto.subtle.importKey("raw", text.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, bytes(signature), text.encode(`${header}.${payload}`)))) return null;
    if (json<{ alg?: string }>(header).alg !== "HS256") return null;
    const ticket = json<Ticket>(payload);
    if (ticket.aud !== "relay" || typeof ticket.sub !== "string" || !ticket.sub || typeof ticket.name !== "string") return null;
    if (!(typeof ticket.exp === "number" && ticket.exp * 1000 > Date.now())) return null;
    return ticket;
  } catch {
    return null;
  }
}

function claimable(name: string) {
  return NAME.test(name) && !RESERVED.has(name);
}

function refuse(code: number, reason: string) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

type Pending = { request: Request; resolve: (response: Response) => void; timer: ReturnType<typeof setTimeout> };

export class Tunnel extends DurableObject<Env> {
  private pending = new Map<string, Pending>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === CONNECT_PATH) return this.attach(request);
    return this.forward(request, url);
  }

  private async attach(request: Request) {
    const user = request.headers.get(OWNER_HEADER);
    if (!user) return refuse(CLOSE.unauthorized, "Unauthorized");
    const owner = await this.ctx.storage.get<string>("owner");
    if (owner && owner !== user) return refuse(CLOSE.taken, "This name belongs to someone else");
    if (!owner) await this.ctx.storage.put("owner", user);
    this.ctx.getWebSockets().forEach((ws) => ws.close(CLOSE.replaced, "Replaced by a new connection"));
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async forward(request: Request, url: URL) {
    const socket = this.ctx.getWebSockets()[0];
    if (!socket) return page((await this.ctx.storage.get<string>("owner")) ? "offline" : "missing", request);

    const id = crypto.randomUUID();
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const message: TunnelRequest = {
      type: "request",
      id,
      method: request.method,
      path: url.pathname + url.search,
      headers: [...request.headers],
      body: hasBody ? encode(await request.arrayBuffer()) : null,
    };

    return new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(page("timeout", request));
      }, TIMEOUT_MS);
      this.pending.set(id, { request, resolve, timer });
      socket.send(JSON.stringify(message));
    });
  }

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let message: TunnelResponse;
    try {
      message = JSON.parse(raw) as TunnelResponse;
    } catch {
      return;
    }
    if (message.type !== "response") return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    const state = message.headers.find(([key]) => key.toLowerCase() === PAGE_HEADER)?.[1] ?? null;
    if (isPageState(state)) return entry.resolve(page(state, entry.request));
    try {
      entry.resolve(new Response(message.body ? decode(message.body) : null, { status: message.status, headers: message.headers }));
    } catch {
      entry.resolve(page("unreachable", entry.request));
    }
  }

  async webSocketClose() {
    this.pending.forEach(({ request, resolve, timer }) => {
      clearTimeout(timer);
      resolve(page("offline", request));
    });
    this.pending.clear();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === CONNECT_PATH) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const name = url.searchParams.get("name") ?? "";
      if (!claimable(name)) return refuse(CLOSE.invalidName, "Invalid name");
      const authorization = request.headers.get("Authorization") ?? "";
      const ticket = authorization.startsWith("Bearer ") ? await verifyTicket(authorization.slice(7).trim(), env.RELAY_TICKET_SECRET) : null;
      if (!ticket || ticket.name !== name) return refuse(CLOSE.unauthorized, "Unauthorized");
      const headers = new Headers(request.headers);
      headers.set(OWNER_HEADER, ticket.sub);
      return env.TUNNEL.get(env.TUNNEL.idFromName(name)).fetch(new Request(request, { headers }));
    }

    const suffix = `.${env.SHARE_DOMAIN}`;
    if (!url.hostname.endsWith(suffix)) return new Response("Not found", { status: 404 });
    const name = url.hostname.slice(0, -suffix.length);
    if (!claimable(name)) return page("missing", request);
    return env.TUNNEL.get(env.TUNNEL.idFromName(name)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
