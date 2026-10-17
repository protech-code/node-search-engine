// Nhận diện ảnh bằng "magic bytes" (không tin Content-Type do client gửi).
export function sniffImage(buf, { svg = false, ico = false } = {}) {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (ico && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  if (svg) {
    const t = buf.toString('utf8');
    const looksSvg = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t);
    // SVG có thể chứa script: từ chối mọi thứ chủ động/ngoại vi (và route phục vụ còn có CSP sandbox).
    const dangerous = /<script|<foreignObject|<iframe|<object|<embed|<!ENTITY|<!DOCTYPE|\son[a-z]+\s*=|javascript:|data:text\/html|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(t);
    if (looksSvg && !dangerous) return 'image/svg+xml';
  }
  return null;
}
