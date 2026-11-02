const maxMaterialBytes = 1024 * 1024;
interface Node { tag: number; start: number; end: number; next: number }
function node(bytes: Uint8Array, offset: number, limit = bytes.length): Node {
  const tag = bytes[offset++];
  let length = bytes[offset++];
  if (tag === undefined || length === undefined || (tag & 31) === 31) throw new Error('Invalid DER');
  if (length & 128) {
    const count = length & 127;
    if (!count || count > 4 || offset + count > limit || bytes[offset] === 0) throw new Error('Invalid DER length');
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
    if (length < 128) throw new Error('Invalid DER length');
  }
  const end = offset + length;
  if (end > limit) throw new Error('Truncated DER');
  return { tag, start: offset, end, next: end };
}
function children(bytes: Uint8Array, parent: Node): Node[] {
  const nodes: Node[] = [];
  let offset = parent.start;
  while (offset < parent.end) {
    if (nodes.length > 10000) throw new Error('Too many DER nodes');
    const child = node(bytes, offset, parent.end);
    nodes.push(child); offset = child.next;
  }
  return nodes;
}
function expectTags(nodes: Node[], tags: number[]) {
  if (nodes.length !== tags.length || nodes.some((value, i) => value.tag !== tags[i])) throw new Error('Invalid structure');
}
function root(bytes: Uint8Array): Node[] {
  const outer = node(bytes, 0);
  if (outer.tag !== 48 || outer.end !== bytes.length) throw new Error('Invalid root');
  const parts = children(bytes, outer);
  expectTags(parts, [48, 48, 3]);
  if (parts[2].end - parts[2].start < 2 || bytes[parts[2].start] !== 0) throw new Error('Invalid signature');
  const algorithm = children(bytes, parts[1]);
  if (!algorithm.length || algorithm[0].tag !== 6) throw new Error('Invalid algorithm');
  return parts;
}
function publicKey(bytes: Uint8Array, key: Node) {
  const parts = children(bytes, key);
  expectTags(parts, [48, 3]);
  if (parts[1].end - parts[1].start < 2 || bytes[parts[1].start] !== 0) throw new Error('Invalid key');
}
function request(bytes: Uint8Array) {
  const parts = root(bytes);
  const info = children(bytes, parts[0]);
  expectTags(info, [2, 48, 48, 160]);
  if (info[0].end - info[0].start !== 1 || bytes[info[0].start] !== 0) throw new Error('Invalid CSR version');
  children(bytes, info[1]); publicKey(bytes, info[2]); children(bytes, info[3]);
}
function authority(bytes: Uint8Array) {
  const parts = root(bytes);
  const tbs = children(bytes, parts[0]);
  if (tbs[0]?.tag !== 160) throw new Error('CA requires v3');
  const version = children(bytes, tbs[0]);
  expectTags(version, [2]);
  if (version[0].end - version[0].start !== 1 || bytes[version[0].start] !== 2) throw new Error('CA requires v3');
  if (tbs.length < 8) throw new Error('Invalid certificate');
  expectTags(tbs.slice(1, 7), [2, 48, 48, 48, 48, 48]);
  const dates = children(bytes, tbs[4]);
  if (dates.length !== 2 || dates.some(date => date.tag !== 23 && date.tag !== 24)) throw new Error('Invalid validity');
  children(bytes, tbs[3]); children(bytes, tbs[5]); publicKey(bytes, tbs[6]);
  const extensions = tbs.find(part => part.tag === 163);
  if (!extensions) throw new Error('Missing CA constraints');
  const wrapper = children(bytes, extensions);
  expectTags(wrapper, [48]);
  const seen = new Set<string>();
  let ca = false;
  for (const extension of children(bytes, wrapper[0])) {
    if (extension.tag !== 48) throw new Error('Invalid extension');
    const values = children(bytes, extension);
    if (values[0]?.tag !== 6 || (values.length !== 2 && values.length !== 3) || values.at(-1)?.tag !== 4 || (values.length === 3 && values[1].tag !== 1)) throw new Error('Invalid extension');
    const oid = Array.from(bytes.subarray(values[0].start, values[0].end)).join('.');
    if (seen.has(oid)) throw new Error('Duplicate extension');
    seen.add(oid);
    if (oid === '85.29.19') {
      const octets = values[values.length - 1];
      const constraints = node(bytes, octets.start, octets.end);
      if (constraints.tag !== 48 || constraints.end !== octets.end) throw new Error('Invalid constraints');
      const fields = children(bytes, constraints);
      ca = fields[0]?.tag === 1 && fields[0].end - fields[0].start === 1 && bytes[fields[0].start] === 255;
      if (fields.length > 2 || (fields.length === 2 && fields[1].tag !== 2)) throw new Error('Invalid constraints');
    }
  }
  if (!ca) throw new Error('Not a CA certificate');
}
export type MaterialResult = { valid: true; value: string; count: number } | { valid: false; error: string };
/** Structural checks only. API admission remains authoritative for signatures and X.509 policy. */
export function parseMaterial(text: string, kind: 'request' | 'trust'): MaterialResult {
  const error = kind === 'request' ? 'Attach one PEM CERTIFICATE REQUEST. Invalid or unsupported material was not applied.' : 'Attach unique PEM CA certificates with CA basic constraints. Invalid material was not applied.';
  if (!text || new TextEncoder().encode(text).length > maxMaterialBytes) return { valid: false, error: 'Material must be nonempty and at most 1 MiB.' };
  try {
    const pattern = /-----BEGIN (CERTIFICATE REQUEST|CERTIFICATE)-----\s*([A-Za-z0-9+/=\r\n\t ]+)\s*-----END \1-----/g;
    const seen = new Set<string>();
    let end = 0;
    let count = 0;
    for (const match of text.matchAll(pattern)) {
      if (text.slice(end, match.index).trim() || match[1] !== (kind === 'request' ? 'CERTIFICATE REQUEST' : 'CERTIFICATE')) throw new Error('Invalid PEM');
      const encoded = match[2].replace(/\s/g, '');
      const raw = atob(encoded);
      if (btoa(raw) !== encoded || seen.has(encoded)) throw new Error('Invalid or duplicate PEM');
      seen.add(encoded);
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      if (kind === 'request') request(bytes); else authority(bytes);
      end = (match.index ?? 0) + match[0].length; count++;
    }
    if (!count || text.slice(end).trim() || (kind === 'request' && count !== 1)) throw new Error('Invalid PEM');
    return { valid: true, value: kind === 'request' ? btoa(text) : text, count };
  } catch { return { valid: false, error }; }
}
