// Phục vụ logo/favicon/nền đã tải lên (lưu trong Postgres) + đổi ngôn ngữ.
import { Router } from 'express';
import { one } from '../db.js';

const r = Router();
const NAMES = new Set(['logo', 'favicon', 'background']);

r.get('/brand/:name', async (req, res) => {
  if (!NAMES.has(req.params.name)) return res.status(404).end();
  const a = await one('SELECT mime, data, etag FROM assets WHERE name = $1', [req.params.name]);
  if (!a) return res.status(404).end();
  res.set({
    'Content-Type': a.mime,
    'Cache-Control': 'public, max-age=604800',
    ETag: a.etag,
    'X-Content-Type-Options': 'nosniff',
    // SVG không được chạy script dù mở trực tiếp trên domain của site
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    // Cho phép mạng xã hội/crawler lấy ảnh (Open Graph)
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  if (req.headers['if-none-match'] === a.etag) return res.status(304).end();
  res.send(a.data);
});

r.get('/lang/:code', (req, res) => {
  const code = req.params.code;
  if (code === 'vi' || code === 'en') {
    res.cookie('lang', code, { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  }
  // Chỉ chuyển hướng về đường dẫn nội bộ (chống open redirect)
  const next = String(req.query.next || '/');
  const safe = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/[\r\n]/.test(next) ? next : '/';
  res.redirect(safe);
});

export default r;
