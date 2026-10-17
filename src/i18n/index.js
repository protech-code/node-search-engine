import vi from './vi.js';
import en from './en.js';
import { getCookie } from '../cookies.js';

export const LANGS = { vi: 'Tiếng Việt', en: 'English' };
const dicts = { vi, en };

export const viText = key => vi[key] ?? key;

export function translator(lang) {
  const d = dicts[lang] || vi;
  return (key, vars) => {
    const s = d[key] ?? vi[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}

// Thứ tự: cookie người dùng chọn -> cài đặt mặc định của site -> (nếu "auto") Accept-Language.
export function pickLang(req, settings) {
  const c = getCookie(req, 'lang');
  if (c === 'vi' || c === 'en') return c;
  const d = settings.defaultLang;
  if (d === 'vi' || d === 'en') return d;
  return fromAcceptLanguage(req.headers['accept-language']);
}

// Đọc Accept-Language theo thứ tự ưu tiên q: vi/en thắng; "*" hoặc không có = không ưu tiên (vi);
// chỉ có ngôn ngữ khác (fr, ja...) -> English.
export function fromAcceptLanguage(header) {
  const tags = String(header || '').toLowerCase().split(',').map(p => {
    const [tag, ...params] = p.trim().split(';');
    const q = Number((params.find(x => x.trim().startsWith('q=')) || 'q=1').split('=')[1]);
    return { tag: tag.trim(), q: Number.isFinite(q) ? q : 1 };
  }).filter(x => x.tag && x.q > 0).sort((a, b) => b.q - a.q);
  let other = false;
  for (const { tag } of tags) {
    if (tag === '*') continue;
    if (tag === 'vi' || tag.startsWith('vi-')) return 'vi';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    other = true;
  }
  return other ? 'en' : 'vi';
}
