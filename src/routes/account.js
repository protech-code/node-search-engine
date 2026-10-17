import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, one, many } from '../db.js';
import * as searchIndex from '../search/index.js';
import { crawlSource, isRunning } from '../crawler.js';
import { csrf, noindex } from '../security.js';
import { turnstileOk } from '../turnstile.js';
import { assertPublicUrl, UserError } from '../ssrf.js';
import { normalizeOrigin, newToken, checkVerification, ensureSource, fileName, fileBody, META_NAME } from '../sites.js';

const r = Router();
const COOLDOWN_MS = 6 * 3600 * 1000;
const MAX_SITES = 20;
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 });
const verifyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: req => `u${req.session.userId}` });
const friendly = (req, e, fallback = 'err.url_invalid') => (e instanceof UserError ? req.t(e.key, e.vars) : req.t(fallback));
// Lý do lỗi crawl được lưu dạng mã ('code:robots', 'key:err.x'); dịch khi hiển thị. Dữ liệu cũ (văn bản thuần) giữ nguyên.
const crawlReason = (t, r) => (r.startsWith('code:') ? t('crawlerr.' + r.slice(5)) : r.startsWith('key:') ? t(r.slice(4)) : r);
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

r.use(noindex('Account'));
r.use(csrf);
r.use((req, res, next) => { res.locals.flash = req.session.flash; delete req.session.flash; next(); });

// ---- đăng ký / đăng nhập ----
r.get('/login', (req, res) => res.render('account/login', { error: null }));
r.post('/login', authLimiter, async (req, res) => {
  if (!(await turnstileOk(req))) return res.status(400).render('account/login', { error: req.t('err.captcha') });
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = await one('SELECT * FROM users WHERE email = $1', [email]);
  const okPw = bcrypt.compareSync(String(req.body.password || ''), u?.password_hash || DUMMY_HASH);
  if (!u || !okPw) return res.status(401).render('account/login', { error: req.t('err.login_bad') });
  if (u.disabled) return res.status(403).render('account/login', { error: req.t('err.account_locked') });
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  req.session.regenerate(() => { req.session.userId = u.id; res.redirect('/account'); });
});

r.get('/register', (req, res) => res.render('account/register', { error: null }));
r.post('/register', registerLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  const bad = msg => res.status(400).render('account/register', { error: msg });
  if (!(await turnstileOk(req))) return bad(req.t('err.captcha'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return bad(req.t('err.email_invalid'));
  if (pw.length < 8 || pw.length > 200) return bad(req.t('err.pw_short8'));
  try {
    const u = await one('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, bcrypt.hashSync(pw, 10)]);
    req.session.regenerate(() => { req.session.userId = u.id; res.redirect('/account'); });
  } catch (e) {
    if (e.code === '23505') return bad(req.t('err.email_taken'));
    throw e;
  }
});
r.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/account/login')));

// ---- từ đây cần đăng nhập ----
r.use(async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/account/login');
  const u = await one('SELECT id, email, disabled FROM users WHERE id = $1', [req.session.userId]);
  if (!u || u.disabled) return req.session.destroy(() => res.redirect('/account/login'));
  res.locals.user = u;
  next();
});

const getSite = async req => one('SELECT * FROM sites WHERE id = $1 AND user_id = $2', [parseInt(req.params.id) || 0, req.session.userId]);
const notFound = res => res.status(404).render('404', { meta: { title: '404', noindex: true } });

r.get('/', async (req, res) => {
  const sites = await many('SELECT * FROM sites WHERE user_id = $1 ORDER BY id DESC', [req.session.userId]);
  res.render('account/sites', { sites });
});

r.post('/sites', async (req, res) => {
  try {
    const n = normalizeOrigin(req.body.url);
    await assertPublicUrl(n.origin + '/', { strictPorts: true });
    const { c } = await one('SELECT COUNT(*)::int c FROM sites WHERE user_id = $1', [req.session.userId]);
    if (c >= MAX_SITES) throw new UserError('err.max_sites', { n: MAX_SITES });
    const row = await one(
      `INSERT INTO sites (user_id, origin, host, verify_token) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, origin) DO UPDATE SET origin = EXCLUDED.origin RETURNING id`,
      [req.session.userId, n.origin, n.host, newToken()],
    );
    res.redirect('/account/sites/' + row.id);
  } catch (e) {
    flash(req, 'error', friendly(req, e));
    res.redirect('/account');
  }
});

r.get('/sites/:id', async (req, res) => {
  const site = await getSite(req);
  if (!site) return notFound(res);
  const base = { mysite: site, META_NAME, fileName: fileName(site.verify_token), fileBody: fileBody(site.verify_token) };
  if (!site.verified_at) return res.render('account/site', { ...base, d: null });

  const host = site.host;
  const source = await one('SELECT * FROM sources WHERE origin = $1 ORDER BY id LIMIT 1', [site.origin]);
  const [indexed, pageList] = await Promise.all([
    searchIndex.countByDomain(host).catch(() => 0),
    searchIndex.browseDomain(host, 50).catch(() => []),
  ]);
  const totals = await one(
    `SELECT COUNT(*) FILTER (WHERE type = 'impression')::int imp, COUNT(*) FILTER (WHERE type = 'click')::int clk
     FROM events WHERE domain = $1 AND created_at > now() - interval '28 days'`, [host]);
  const perDay = (await many(
    `SELECT to_char(created_at, 'MM-DD') d, COUNT(*) FILTER (WHERE type = 'impression')::int imp
     FROM events WHERE domain = $1 AND created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`, [host]));
  const topQueries = await many(
    `SELECT q, COUNT(*) FILTER (WHERE type = 'impression')::int imp, COUNT(*) FILTER (WHERE type = 'click')::int clk
     FROM events WHERE domain = $1 AND created_at > now() - interval '28 days' GROUP BY q ORDER BY imp DESC, clk DESC LIMIT 15`, [host]);
  const errors = (await many('SELECT url, reason FROM crawl_errors WHERE host = $1 ORDER BY id DESC LIMIT 50', [host]))
    .map(e => ({ ...e, reason: crawlReason(req.t, e.reason) }));

  const last = source?.crawl_requested_at ? new Date(source.crawl_requested_at).getTime() : 0;
  const waitMs = Math.max(0, last + COOLDOWN_MS - Date.now());
  res.render('account/site', {
    ...base,
    d: {
      source, running: source ? isRunning(source.id) : false, indexed, pageList, totals, perDay,
      max: Math.max(1, ...perDay.map(p => p.imp)), topQueries, errors, waitMin: Math.ceil(waitMs / 60000),
    },
  });
});

r.post('/sites/:id/verify', verifyLimiter, async (req, res) => {
  const site = await getSite(req);
  if (!site) return notFound(res);
  const back = '/account/sites/' + site.id;
  if (site.verified_at) return res.redirect(back);

  const method = ['meta', 'file', 'dns'].includes(req.body.method) ? req.body.method : 'meta';
  const result = await checkVerification(site, method);
  if (!result.ok) { flash(req, 'error', req.t('verify.failed', { reason: req.t(result.key, result.vars) })); return res.redirect(back); }
  try {
    await query('UPDATE sites SET verified_at = now(), verify_method = $1 WHERE id = $2', [method, site.id]);
  } catch (e) {
    if (e.code === '23505') { flash(req, 'error', req.t('flash.claimed')); return res.redirect(back); }
    throw e;
  }
  const src = await ensureSource(site);
  await query('UPDATE sources SET crawl_requested_at = now() WHERE id = $1', [src.id]);
  crawlSource(src).catch(e => console.error('crawl error:', e.message));
  flash(req, 'ok', req.t('flash.verified'));
  res.redirect(back);
});

r.post('/sites/:id/recrawl', async (req, res) => {
  const site = await getSite(req);
  if (!site || !site.verified_at) return notFound(res);
  const back = '/account/sites/' + site.id;
  const src = await ensureSource(site);
  if (isRunning(src.id)) { flash(req, 'error', req.t('flash.crawling')); return res.redirect(back); }
  const last = src.crawl_requested_at ? new Date(src.crawl_requested_at).getTime() : 0;
  if (Date.now() - last < COOLDOWN_MS) {
    flash(req, 'error', req.t('flash.cooldown', { n: Math.ceil((last + COOLDOWN_MS - Date.now()) / 60000) }));
    return res.redirect(back);
  }
  await query('UPDATE sources SET crawl_requested_at = now() WHERE id = $1', [src.id]);
  crawlSource(src).catch(e => console.error('crawl error:', e.message));
  flash(req, 'ok', req.t('flash.recrawl_ok'));
  res.redirect(back);
});

r.post('/sites/:id/sitemap', async (req, res) => {
  const site = await getSite(req);
  if (!site || !site.verified_at) return notFound(res);
  const back = '/account/sites/' + site.id;
  const src = await ensureSource(site);
  const u = String(req.body.sitemap || '').trim();
  try {
    if (u) {
      const parsed = new URL(u);
      if (parsed.hostname !== site.host) throw new UserError('err.sitemap_host');
      await assertPublicUrl(u, { strictPorts: true });
    }
    await query('UPDATE sources SET sitemap_url = $1 WHERE id = $2', [u || null, src.id]);
    flash(req, 'ok', req.t(u ? 'flash.sitemap_saved' : 'flash.sitemap_cleared'));
  } catch (e) { flash(req, 'error', friendly(req, e, 'err.sitemap_invalid')); }
  res.redirect(back);
});

r.post('/sites/:id/delete', async (req, res) => {
  const site = await getSite(req);
  if (!site) return notFound(res);
  if (site.verified_at) {
    await searchIndex.removeByDomain(site.host).catch(e => console.error(e.message));
    await query('DELETE FROM sources WHERE origin = $1', [site.origin]);
  }
  await query('DELETE FROM sites WHERE id = $1', [site.id]);
  flash(req, 'ok', req.t(site.verified_at ? 'flash.removed_purged' : 'flash.removed'));
  res.redirect('/account');
});

export default r;
