import { Router } from 'express';
import { query } from '../db.js';
import { search } from '../search/index.js';
import { sign, safeEqual } from '../security.js';
import { logEvents } from '../events.js';
import { popular, suggest } from '../keywords.js';
import rateLimit from 'express-rate-limit';

const r = Router();

r.get('/', async (req, res) => {
  res.render('home', { popular: await popular(8), meta: { fullTitle: res.locals.site.siteName + ' – ' + res.locals.ui.description, canonical: '/' }, jsonLd: true });
});

r.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), 50);
  if (!q) return res.redirect('/');

  let data = { total: 0, hits: [], ms: 0 };
  let error = null;
  try {
    data = await search(q, page);
    if (page === 1) await query('INSERT INTO queries (q, results) VALUES ($1, $2)', [q.toLowerCase(), data.total]);
    await logEvents('impression', data.hits, q);
  } catch (e) { console.error('search error:', e.message); error = req.t('err.search_busy'); }

  // Link kết quả đi qua /go để đếm click; chữ ký HMAC chống open-redirect.
  data.hits = data.hits.map(h => ({
    ...h,
    go: `/go?u=${encodeURIComponent(h.url)}&q=${encodeURIComponent(q)}&s=${sign('go' + h.url)}`,
  }));

  res.render('results', {
    q, page, error, ...data,
    pageCount: Math.min(Math.ceil(data.total / 10), 50),
    meta: {
      title: req.t('results.meta_title', { q }),
      description: req.t('results.meta_desc', { q, site: res.locals.site.siteName }),
      canonical: `/search?q=${encodeURIComponent(q)}`,
      noindex: !data.total || page > 1,
    },
  });
});

r.get('/go', async (req, res) => {
  const u = String(req.query.u || ''), q = String(req.query.q || '');
  if (!safeEqual(String(req.query.s || ''), sign('go' + u))) return res.status(400).send(req.t('err.link_invalid'));
  let url;
  try { url = new URL(u); } catch { return res.status(400).send(req.t('err.link_invalid')); }
  if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).send(req.t('err.link_invalid'));
  await logEvents('click', [{ domain: url.hostname, url: url.href }], q);
  res.redirect(302, url.href);
});

const suggestLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
r.get('/suggest', suggestLimiter, async (req, res) => {
  try {
    const items = await suggest(String(req.query.q || ''), 8);
    res.set('Cache-Control', 'public, max-age=30').json(items);
  } catch (e) { console.error('suggest:', e.message); res.json([]); }
});

export default r;
