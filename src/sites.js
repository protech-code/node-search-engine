import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { query, one } from './db.js';
import { fetchText, UserError } from './ssrf.js';

export const META_NAME = 'mysearch-verification';
export const VERIFIED_MAX_PAGES = Number(process.env.VERIFIED_MAX_PAGES || 200);
export const BOT_UA = process.env.BOT_UA || 'MySearchBot/1.0 (+https://example.com/bot)';
export const newToken = () => crypto.randomBytes(18).toString('hex');
export const fileName = t => `mysearch-${t}.html`;
export const fileBody = t => `${META_NAME}: ${t}`;

export function normalizeOrigin(input) {
  const raw = String(input || '').trim();
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { throw new UserError('err.url_invalid'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UserError('err.url_scheme');
  return { origin: u.origin, host: u.hostname };
}

const ok = { ok: true };
const fail = (key, vars) => ({ ok: false, key, vars });
const sameSite = (finalUrl, host) => {
  try { return new URL(finalUrl).hostname.replace(/^www\./, '') === host.replace(/^www\./, ''); } catch { return false; }
};

export async function checkVerification(site, method) {
  const t = site.verify_token;
  const opts = { maxBytes: 1_000_000, headers: { 'user-agent': BOT_UA } };
  try {
    if (method === 'meta') {
      const r = await fetchText(site.origin + '/', opts);
      if (!r.ok) return fail('verify.home_http', { status: r.status });
      if (!sameSite(r.url, site.host)) return fail('verify.home_redirect');
      const $ = cheerio.load(r.text);
      const found = $(`meta[name="${META_NAME}"]`).map((_, e) => $(e).attr('content')).get();
      return found.includes(t) ? ok : fail('verify.meta_missing');
    }
    if (method === 'file') {
      const r = await fetchText(`${site.origin}/${fileName(t)}`, opts);
      if (!r.ok) return fail('verify.file_http', { status: r.status });
      if (!sameSite(r.url, site.host)) return fail('verify.file_redirect');
      // So khớp CHÍNH XÁC nội dung: tránh trang 404 "dội" lại URL (chứa token) bị tính là hợp lệ.
      return r.text.trim() === fileBody(t) ? ok : fail('verify.file_content');
    }
    if (method === 'dns') {
      const recs = (await dns.resolveTxt(site.host)).map(a => a.join(''));
      return recs.includes(`${META_NAME}=${t}`) ? ok : fail('verify.dns_missing');
    }
  } catch (e) {
    return fail('verify.unreachable', { why: e.code || e.message });
  }
  return fail('verify.bad_method');
}

// Đảm bảo có 1 "source" để crawl cho origin đã xác minh.
export async function ensureSource(site) {
  await query(
    'INSERT INTO sources (url, origin, max_pages) VALUES ($1, $2, $3) ON CONFLICT (url) DO NOTHING',
    [site.origin + '/', site.origin, VERIFIED_MAX_PAGES],
  );
  return one('SELECT * FROM sources WHERE origin = $1 ORDER BY id LIMIT 1', [site.origin]);
}
