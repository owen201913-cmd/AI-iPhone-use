// JSON byte accounting without copying large base64 images into a second JSON
// string. For anything outside the exact image shape, use normal JSON semantics.
// This measures content only, not structuredContent, transport framing or tokens.
export function mcpContentBytes(content) {
  if (!Array.isArray(content)) return null;
  let bytes = 2; // []
  for (let index = 0; index < content.length; index++) {
    const item = content[index];
    if (index) bytes++;
    const plain = item && [Object.prototype, null].includes(Object.getPrototypeOf(item));
    const keys = plain ? Object.keys(item) : [];
    if (plain && !('toJSON' in item) && keys.length === 3 &&
        keys.every(key => ['type', 'mimeType', 'data'].includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(item, key), 'value')) &&
        item.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string' &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) {
      bytes += Buffer.byteLength(JSON.stringify({ type: 'image', mimeType: item.mimeType, data: '' })) + item.data.length;
    } else {
      // JSON array entries undefined/function/symbol become null, just as in
      // JSON.stringify(content). Cycles and BigInt correctly remain errors.
      const serialized = JSON.stringify(item);
      bytes += Buffer.byteLength(serialized === undefined ? 'null' : serialized);
    }
  }
  return bytes;
}
