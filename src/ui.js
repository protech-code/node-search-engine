// Tính toán giao diện (theme, logo, nền, favicon) từ cài đặt. Mọi giá trị chèn vào CSS đều được kiểm tra chặt.
import { getCookie } from './cookies.js';

export const THEMES = { blue: '#1a73e8', green: '#0f9d58', purple: '#7c4dff', orange: '#f57c00', rose: '#e91e63', teal: '#00897b', slate: '#455a64' };
export const GRADIENTS = ['aurora', 'sunset', 'ocean', 'forest', 'mono'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = h => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ink = h => (lum(h) > 0.45 ? '#111111' : '#ffffff');
const digits = v => String(v || '').replace(/\D/g, '').slice(0, 16);
const clamp = (v, lo, hi, d) => { const n = parseInt(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function baseColor(s) {
  if (s.themePreset === 'custom' && HEX.test(s.themeColor || '')) return s.themeColor;
  return THEMES[s.themePreset] || THEMES.blue;
}

export function buildUi(s, req, lang, overrides = {}) {
  const base = HEX.test(overrides.themeColor || '') ? overrides.themeColor : baseColor(s);
  const dark = mix(base, '#ffffff', 0.35);
  const canToggle = s.themeToggle === '1';
  const cookieTheme = getCookie(req, 'theme');
  const dataTheme = ['auto', 'light', 'dark'].includes(overrides.themeMode)
    ? overrides.themeMode
    : canToggle && (cookieTheme === 'light' || cookieTheme === 'dark')
    ? cookieTheme : (s.themeMode === 'light' || s.themeMode === 'dark' ? s.themeMode : 'auto');

  const logoV = digits(s.logoV), faviconV = digits(s.faviconV), bgV = digits(s.bgV);
  const overlay = (clamp(s.bgOverlay, 0, 80, 35) / 100).toFixed(2);
  let css = `:root{--brand:${base};--brand-ink:${ink(base)};--logo-h:${clamp(s.logoHeight, 20, 120, 40)}px;--overlay:${overlay}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--brand:${dark};--brand-ink:${ink(dark)}}}`
    + `:root[data-theme="dark"]{--brand:${dark};--brand-ink:${ink(dark)}}`;

  let bgClass = '';
  if (s.bgMode === 'image' && bgV) { css += `:root{--bg-image:url(/brand/background?v=${bgV})}`; bgClass = 'has-bg bg-image'; }
  else if (s.bgMode === 'gradient' && GRADIENTS.includes(s.bgGradient)) bgClass = `has-bg bg-${s.bgGradient}`;

  const letter = (String(s.siteName || 'S').trim()[0] || 'S').toUpperCase();
  const safeLetter = /[A-Z0-9]/.test(letter) ? letter : '•';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${base}"/>`
    + `<text x="32" y="45" font-size="38" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="${ink(base)}">${safeLetter}</text></svg>`;

  const en = lang === 'en' && String(s.siteDescriptionEn || '').trim();
  return {
    css, dataTheme, bgClass, canToggle, themeColor: base,
    langSwitch: s.langSwitch === '1',
    showName: s.logoShowName === '1',
    logoUrl: logoV ? `/brand/logo?v=${logoV}` : '',
    faviconHref: faviconV ? `/brand/favicon?v=${faviconV}` : 'data:image/svg+xml,' + encodeURIComponent(svg),
    ogImage: s.ogImage || '',
    description: en || s.siteDescription,
  };
}
