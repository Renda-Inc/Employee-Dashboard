// RFC 6238 time-based one-time passwords (30-second steps, 6 digits, SHA-1), as used by authenticator apps.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += B32.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function totpCode(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = (h[h.length - 1] ?? 0) & 15;
  const bin =
    (((h[offset] ?? 0) & 127) << 24) |
    ((h[offset + 1] ?? 0) << 16) |
    ((h[offset + 2] ?? 0) << 8) |
    (h[offset + 3] ?? 0);
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Accepts the current code and one step either side to tolerate clock drift. */
export async function verifyTotp(secret: string, code: string, at = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(at / 30_000);
  for (const d of [-1, 0, 1]) if ((await totpCode(secret, counter + d)) === code) return true;
  return false;
}

export const otpauthUri = (secret: string, account: string, issuer = "Renda Admin") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
