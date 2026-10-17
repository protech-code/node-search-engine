// Bỏ dấu tiếng Việt GIỮ NGUYÊN độ dài chuỗi (để cắt đoạn trích/tô sáng trên văn bản gốc).
export function fold(s) {
  return Array.from(String(s ?? '').normalize('NFC'), ch => {
    if (ch === 'đ') return 'd';
    if (ch === 'Đ') return 'D';
    const n = ch.normalize('NFD');
    return n.length > 1 && /\p{M}/u.test(n.slice(1)) ? n[0] : ch;
  }).join('');
}

// Tách từ khóa: chữ thường, bỏ dấu, chỉ giữ chữ/số.
export const tokens = q => fold(q).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

const isWord = c => c !== undefined && /[\p{L}\p{N}]/u.test(c);

// Trả về đoạn trích từ văn bản gốc, bọc từ khớp bằng [[ ]] (không phân biệt dấu/hoa thường).
export function markTerms(text, terms, { window = 200 } = {}) {
  const orig = String(text ?? '').normalize('NFC');
  const f = fold(orig).toLowerCase();
  if (!terms.length || f.length !== orig.length) return orig.slice(0, window);

  const ranges = [];
  for (const t of terms) {
    let i = 0;
    while ((i = f.indexOf(t, i)) !== -1 && ranges.length < 300) {
      if (!isWord(f[i - 1])) ranges.push([i, i + t.length]);
      i += t.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const start = ranges.length ? Math.max(0, ranges[0][0] - 50) : 0;
  const end = Math.min(orig.length, start + window);

  let out = '', pos = start;
  for (const [a, b] of ranges) {
    if (b <= pos || a >= end) continue;
    const s = Math.max(a, pos), e = Math.min(b, end);
    out += orig.slice(pos, s) + '[[' + orig.slice(s, e) + ']]';
    pos = e;
  }
  out += orig.slice(pos, end);
  return (start > 0 ? '…' : '') + out + (end < orig.length ? '…' : '');
}
