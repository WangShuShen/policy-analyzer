export interface JWTPayload {
  advisorId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  exp: number;
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function decodeBase64url(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET ?? "default-secret";
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function encodeHeader(): string {
  return base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
}

export async function signJWT(
  payload: Omit<JWTPayload, "exp">,
  expiresInSeconds = 7 * 24 * 60 * 60
): Promise<string> {
  const fullPayload: JWTPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const headerB64 = encodeHeader();
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64url(sigB64),
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;
    const payload: JWTPayload = JSON.parse(
      new TextDecoder().decode(decodeBase64url(payloadB64))
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
