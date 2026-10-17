import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, one } from '../db.js';
import { csrf, sign, safeEqual } from '../security.js';
import { assertPublicUrl, UserError } from '../ssrf.js';
import { normalizeOrigin } from '../sites.js';
import { turnstileOk } from '../turnstile.js';

const r = Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: Number(process.env.SUBMIT_LIMIT || 5), standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('submit', form(req, { error: req.t('err.rate_limited') })) });

const timeToken = () => { const t = Date.now(); return `${t}.${sign('submit' + t)}`; };
const form = (req, extra = {}) => ({ error: null, done: false, ts: timeToken(), meta: { title: req.t('submit.meta_title'), canonical: '/submit' }, ...extra });

function validTimeToken(tok) {
  const [t, sig] = String(tok || '').split('.');
  if (!t || !sig || !safeEqual(sig, sign('submit' + t))) return false;
  const age = Date.now() - Number(t);
  return age > 3000 && age < 60 * 60 * 1000; // người thật cần >3s để điền form
}

r.use(csrf);
r.get('/', (req, res) => res.render('submit', form(req)));

r.post('/', limiter, async (req, res) => {
  // Honeypot + kiểm tra thời gian: bot thường điền ô ẩn hoặc gửi quá nhanh -> giả vờ thành công.
  if (req.body.company || !validTimeToken(req.body.ts)) return res.render('submit', form(req, { done: true }));

  if (!(await turnstileOk(req))) return res.status(400).render('submit', form(req, { error: req.t('err.captcha') }));

  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).render('submit', form(req, { error: req.t('err.email_invalid') }));
  }
  try {
    const { origin } = normalizeOrigin(req.body.url);
    const raw = String(req.body.url).trim();
    const href = await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw, { strictPorts: true });
    const url = new URL(href); url.hash = '';

    const exists = (await one('SELECT 1 AS x FROM sources WHERE origin = $1', [origin]))
      || (await one(`SELECT 1 AS x FROM submissions WHERE origin = $1 AND status IN ('pending','approved')`, [origin]));
    if (exists) return res.status(400).render('submit', form(req, { error: req.t('err.site_exists') }));

    await query('INSERT INTO submissions (url, origin, email, ip) VALUES ($1, $2, $3, $4)', [url.href, origin, email, req.ip]);
    res.render('submit', form(req, { done: true }));
  } catch (e) {
    const msg = e instanceof UserError ? req.t(e.key, e.vars) : req.t('err.url_invalid');
    res.status(400).render('submit', form(req, { error: msg }));
  }
});

export default r;
