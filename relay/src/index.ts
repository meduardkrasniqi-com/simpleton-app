import { DurableObject } from "cloudflare:workers";
import { CONNECT_PATH, decode, encode, type TunnelRequest, type TunnelResponse } from "./protocol";

type Env = {
  TUNNEL: DurableObjectNamespace<Tunnel>;
  SHARE_DOMAIN: string;
  RELAY_SECRET: string;
};

const TIMEOUT_MS = 30_000;
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type Pending = { resolve: (response: Response) => void; timer: ReturnType<typeof setTimeout> };

export class Tunnel extends DurableObject<Env> {
  private pending = new Map<string, Pending>();

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === CONNECT_PATH) return this.attach();
    return this.forward(request, url);
  }

  private attach() {
    this.ctx.getWebSockets().forEach((ws) => ws.close(4000, "Replaced by a new connection"));
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async forward(request: Request, url: URL) {
    const socket = this.ctx.getWebSockets()[0];
    if (!socket) return new Response("This link is not live right now.", { status: 502 });

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
        resolve(new Response("The app did not respond in time.", { status: 504 }));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      socket.send(JSON.stringify(message));
    });
  }

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    const message = JSON.parse(raw) as TunnelResponse;
    if (message.type !== "response") return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    entry.resolve(new Response(message.body ? decode(message.body) : null, { status: message.status, headers: message.headers }));
  }

  async webSocketClose() {
    this.pending.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve(new Response("The app disconnected.", { status: 502 }));
    });
    this.pending.clear();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === CONNECT_PATH) {
      if (request.headers.get("Authorization") !== `Bearer ${env.RELAY_SECRET}`) return new Response("Unauthorized", { status: 401 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const name = url.searchParams.get("name") ?? "";
      if (!NAME.test(name)) return new Response("Invalid name", { status: 400 });
      return env.TUNNEL.get(env.TUNNEL.idFromName(name)).fetch(request);
    }

    const suffix = `.${env.SHARE_DOMAIN}`;
    if (!url.hostname.endsWith(suffix)) return new Response("Not found", { status: 404 });
    const name = url.hostname.slice(0, -suffix.length);
    if (!NAME.test(name)) return new Response("Not found", { status: 404 });
    return env.TUNNEL.get(env.TUNNEL.idFromName(name)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
