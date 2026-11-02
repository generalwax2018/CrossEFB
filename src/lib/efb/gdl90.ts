/**
 * GDL 90 decoder (Garmin 560-1058-00 Rev A), the open data format sent over
 * Wi-Fi UDP port 4000 by Stratux, Sentry, Stratus, and similar ADS-B receivers.
 *
 * Frame: 0x7E | id | payload | CRC lo | CRC hi | 0x7E, with 0x7D-escaping.
 * CRC: CRC-16-CCITT (poly 0x1021, init 0) over id + payload.
 */

const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = (i << 8) & 0xffff;
    for (let b = 0; b < 8; b++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
    t[i] = crc;
  }
  return t;
})();

export function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = (CRC_TABLE[crc >> 8] ^ ((crc << 8) & 0xffff) ^ b) & 0xffff;
  return crc;
}

/** Split a UDP datagram into unescaped, CRC-checked messages (id + payload). */
export function deframe(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let cur: number[] | null = null;
  let esc = false;
  for (const byte of data) {
    if (byte === 0x7e) {
      if (cur && cur.length >= 3) {
        const msg = Uint8Array.from(cur.slice(0, -2));
        const fcs = cur[cur.length - 2] | (cur[cur.length - 1] << 8);
        if (crc16(msg) === fcs) out.push(msg);
      }
      cur = [];
      esc = false;
      continue;
    }
    if (!cur) continue;
    if (byte === 0x7d) {
      esc = true;
      continue;
    }
    cur.push(esc ? byte ^ 0x20 : byte);
    esc = false;
  }
  return out;
}

/** Build a framed message. Used by tests and the simulator. */
export function frame(msg: Uint8Array): Uint8Array {
  const crc = crc16(msg);
  const body = [...msg, crc & 0xff, crc >> 8];
  const out = [0x7e];
  for (const b of body) {
    if (b === 0x7e || b === 0x7d) out.push(0x7d, b ^ 0x20);
    else out.push(b);
  }
  out.push(0x7e);
  return Uint8Array.from(out);
}

export type Heartbeat = { kind: "heartbeat"; gpsValid: boolean; uatInitialized: boolean };

export type TrafficTarget = {
  kind: "ownship" | "traffic";
  alert: boolean;
  addrType: number;
  address: string;
  lat: number;
  lon: number;
  /** Pressure altitude, ft, or null if invalid. */
  altFt: number | null;
  airborne: boolean;
  nic: number;
  nacp: number;
  gsKt: number | null;
  vsFpm: number | null;
  /** True track or heading in degrees, or null. */
  track: number | null;
  emitter: number;
  callsign: string;
  emergency: number;
};

export type GeoAltitude = { kind: "geoalt"; altFt: number; vfom: number | null };

export type Gdl90Message = Heartbeat | TrafficTarget | GeoAltitude;

function signed24(a: number, b: number, c: number): number {
  let v = (a << 16) | (b << 8) | c;
  if (v & 0x800000) v -= 0x1000000;
  return v;
}

function report(kind: "ownship" | "traffic", p: Uint8Array): TrafficTarget | null {
  if (p.length < 27) return null;
  const altRaw = (p[10] << 4) | (p[11] >> 4);
  const misc = p[11] & 0x0f;
  const hv = (p[13] << 4) | (p[14] >> 4);
  let vv = ((p[14] & 0x0f) << 8) | p[15];
  const vvValid = vv !== 0x800;
  if (vv & 0x800) vv -= 0x1000;
  const trackType = misc & 0x03;
  return {
    kind,
    alert: p[0] >> 4 === 1,
    addrType: p[0] & 0x0f,
    address: ((p[1] << 16) | (p[2] << 8) | p[3]).toString(16).toUpperCase().padStart(6, "0"),
    lat: (signed24(p[4], p[5], p[6]) * 180) / 0x800000,
    lon: (signed24(p[7], p[8], p[9]) * 180) / 0x800000,
    altFt: altRaw === 0xfff ? null : altRaw * 25 - 1000,
    airborne: Boolean(misc & 0x08),
    nic: p[12] >> 4,
    nacp: p[12] & 0x0f,
    gsKt: hv === 0xfff ? null : hv,
    vsFpm: vvValid ? vv * 64 : null,
    track: trackType === 0 ? null : (p[16] * 360) / 256,
    emitter: p[17],
    callsign: String.fromCharCode(...p.slice(18, 26)).replace(/[^\x20-\x7e]/g, "").trim(),
    emergency: p[26] >> 4,
  };
}

/** Decode one unframed message (id + payload). Unknown ids return null. */
export function decode(msg: Uint8Array): Gdl90Message | null {
  const id = msg[0];
  const p = msg.subarray(1);
  switch (id) {
    case 0:
      if (p.length < 2) return null;
      return { kind: "heartbeat", gpsValid: Boolean(p[0] & 0x80), uatInitialized: Boolean(p[0] & 0x01) };
    case 10:
      return report("ownship", p);
    case 20:
      return report("traffic", p);
    case 11: {
      if (p.length < 4) return null;
      let alt = (p[0] << 8) | p[1];
      if (alt & 0x8000) alt -= 0x10000;
      const vfomRaw = ((p[2] & 0x7f) << 8) | p[3];
      return { kind: "geoalt", altFt: alt * 5, vfom: vfomRaw === 0x7fff ? null : vfomRaw };
    }
    default:
      return null;
  }
}

export function decodeDatagram(data: Uint8Array): Gdl90Message[] {
  return deframe(data)
    .map(decode)
    .filter((m): m is Gdl90Message => m !== null);
}

/** A position is usable when it is non-zero and the integrity category is above zero. */
export function hasPosition(t: TrafficTarget): boolean {
  return t.nic > 0 && !(t.lat === 0 && t.lon === 0);
}
