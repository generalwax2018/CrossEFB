/**
 * End-to-end encrypted sync.
 *
 * A sync code is 128 random bits shown as base32 groups. From it the device
 * derives (1) a row id = SHA-256("crossefb-sync-id:" + code) and (2) an AES-GCM
 * key = SHA-256("crossefb-sync-key:" + code). Only the id and ciphertext reach
 * the server, so the server cannot read plans, logbook, or anything else.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I, L, O, U, 0, 1

export function newSyncCode(): string {
  // 26 symbols from a 30-letter alphabet ≈ 127 bits. Rejection sampling keeps it unbiased.
  let out = "";
  while (out.length < 26) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    for (const v of b) {
      if (v < 240 && out.length < 26) out += ALPHABET[v % 30];
    }
  }
  return out.match(/.{1,4}/g)!.join("-");
}

export function normalizeCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 26 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return raw.match(/.{1,4}/g)!.join("-");
}

const enc = new TextEncoder();

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function syncId(code: string): Promise<string> {
  return toHex(await sha256(`crossefb-sync-id:${code}`));
}

async function syncKey(code: string): Promise<CryptoKey> {
  const raw = await sha256(`crossefb-sync-key:${code}`);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealState(code: string, state: unknown): Promise<string> {
  const key = await syncKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = enc.encode(JSON.stringify({ v: 1, at: new Date().toISOString(), state }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, body));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function openState(code: string, blob: string): Promise<{ at: string; state: Record<string, unknown> }> {
  const key = await syncKey(code);
  const bytes = fromB64(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) as BufferSource }, key, bytes.slice(12) as BufferSource);
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as { at: string; state: Record<string, unknown> };
  return parsed;
}

type WithId = { id?: string; profileId?: string };

function unionBy<T extends WithId>(a: T[] | undefined, b: T[] | undefined, key: (x: T) => string | undefined): T[] {
  const map = new Map<string, T>();
  for (const x of [...(b ?? []), ...(a ?? [])]) {
    const k = key(x);
    if (k && !map.has(k)) map.set(k, x);
  }
  return [...map.values()];
}

/**
 * Merge remote into local. Settings and the active plan follow whichever copy is
 * newer; lists that only grow (logbook, saved plans, own aircraft) are unioned by
 * id so an edit on one device never deletes an entry made on another.
 */
export function mergeStates(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  remoteIsNewer: boolean,
): Record<string, unknown> {
  const base = remoteIsNewer ? { ...local, ...remote } : { ...remote, ...local };
  const pick = <T extends WithId>(k: string, key: (x: T) => string | undefined) => {
    const a = (remoteIsNewer ? remote[k] : local[k]) as T[] | undefined;
    const b = (remoteIsNewer ? local[k] : remote[k]) as T[] | undefined;
    return unionBy(a, b, key);
  };
  base.logbook = pick("logbook", (x) => x.id);
  base.plans = pick("plans", (x) => x.id);
  base.myAircraft = pick("myAircraft", (x) => x.profileId);
  return base;
}

/** State keys that stay on this device. */
export const LOCAL_ONLY = ["syncKey", "chartMode"];
