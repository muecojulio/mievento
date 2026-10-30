const PREFIX = "ME1";

export function randomId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function signBody(secret: string, body: string): Promise<string> {
  const bytes = b64urlToBytes(secret);
  const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return b64url(new Uint8Array(mac).slice(0, 16));
}

export async function makeToken(secret: string, eventId: string, guestId: string): Promise<string> {
  const body = `${PREFIX}.${eventId}.${guestId}`;
  const sig = await signBody(secret, body);
  return `${body}.${sig}`;
}

export function extractToken(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  try {
    if (text.startsWith("http://") || text.startsWith("https://")) {
      const url = new URL(text);
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const params = new URLSearchParams(hash || url.search.slice(1));
      const fromLink = params.get("t");
      if (fromLink) return fromLink.trim();
    }
  } catch {
    /* not a url */
  }
  const match = text.match(/ME1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return match ? match[0] : text;
}

export function parseToken(raw: string): { eventId: string; guestId: string; sig: string; token: string } | null {
  const token = extractToken(raw);
  const match = /^ME1\.([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16,64})$/.exec(token);
  if (!match) return null;
  return {
    eventId: match[1],
    guestId: match[2],
    sig: match[3],
    token: `ME1.${match[1]}.${match[2]}.${match[3]}`,
  };
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
