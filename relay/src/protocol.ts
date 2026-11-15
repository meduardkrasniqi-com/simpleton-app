export const CONNECT_PATH = "/_simpleton/connect";

export const PING = "ping";
export const PONG = "pong";

export const PAGE_HEADER = "x-simpleton-page";

export const CLOSE = { replaced: 4000, unauthorized: 4001, invalidName: 4002, taken: 4009 } as const;

export type TunnelRequest = {
  type: "request";
  id: string;
  method: string;
  path: string;
  headers: [string, string][];
  body: string | null;
};

export type TunnelResponse = {
  type: "response";
  id: string;
  status: number;
  headers: [string, string][];
  body: string | null;
};

export function encode(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decode(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
