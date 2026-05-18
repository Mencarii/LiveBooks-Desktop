/**
 * Deterministic system COA account ids (UUID v5).
 *
 * Same language-neutral seed path yields the same UUID on every machine,
 * so system default accounts reconcile across locales after translation.
 *
 * Implementation note: this module runs in both the Electron main process
 * (Node) and the renderer (Vite browser). To stay portable we avoid Node's
 * `crypto` and `Buffer` modules and ship a small pure-JS SHA-1 instead.
 */

/** LiveBooks COA namespace bytes (frozen). Preserved verbatim from the
 * original implementation to keep generated ids stable across releases. */
const LIVEBOOKS_COA_NAMESPACE = new Uint8Array([
  0x6b, 0x1b, 0x5c, 0x10, 0x9d, 0xad, 0x41, 0xd1, 0xa8, 0x0b, 0x44, 0x00, 0xc0,
  0x4f, 0xd4, 0x30, 0xc8,
]);

const TEXT_ENCODER = new TextEncoder();

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Pure-JS SHA-1 (RFC 3174) over a byte sequence. */
function sha1(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const ml = bytes.length;
  const bitLen = ml * 8;
  const paddedLen = ((ml + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[ml] = 0x80;
  const dv = new DataView(padded.buffer);
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  dv.setUint32(paddedLen - 8, high, false);
  dv.setUint32(paddedLen - 4, low, false);

  const w = new Uint32Array(80);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunk + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((v << 1) | (v >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + (e >>> 0) + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0, false);
  odv.setUint32(4, h1, false);
  odv.setUint32(8, h2, false);
  odv.setUint32(12, h3, false);
  odv.setUint32(16, h4, false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * UUID v5 (SHA-1) per RFC 4122.
 */
export function uuidV5(name: string, namespaceBytes: Uint8Array): string {
  const nameBytes = TEXT_ENCODER.encode(name);
  const hash = sha1(concatBytes(namespaceBytes, nameBytes));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @param seedPath Language-neutral dotted path, e.g. `asset.current_assets.cash`.
 */
export function systemAccountId(seedPath: string): string {
  const normalized = seedPath.trim().toLowerCase().replace(/\s+/g, '_');
  return uuidV5(`livebooks.coa.${normalized}`, LIVEBOOKS_COA_NAMESPACE);
}

/**
 * Build a seed path segment from COA tree walk (English keys from fixture structure).
 */
export function coaSeedSegment(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function buildCoaSeedPath(segments: string[]): string {
  return segments.map(coaSeedSegment).filter(Boolean).join('.');
}
