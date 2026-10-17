import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, one, many, getSettings, saveSettings } from '../db.js';
import * as searchIndex from '../search/index.js';
import { crawlSource, isRunning } from '../crawler.js';
import { csrf, noindex } from '../security.js';
import { normalizeQ } from '../keywords.js';
import { turnstileOk, CAPTCHA_ERROR } from '../turnstile.js';
import { loadAdmin, requirePerm } from '../rbac.js';
import { flashMw, setFlash } from '../flash.js';
import { adminCount, tokenOk, clearToken, restoreToken } from '../setup.js';
import accountsRouter from './admin-accounts.js';
import engineRouter from './admin-engine.js';
import appearanceRouter from './admin-appearance.js';
import { translator } from '../i18n/index.js';
import { adminText } from '../i18n/admin.js';
import { getCookie } from '../cookies.js';
import { buildUi, THEMES } from '../ui.js';

const r = Router();
// Chỉ đếm lần đăng nhập SAI (đăng nhập đúng không bị tính vào giới hạn).
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });
const setupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const ADMIN_THEMES = { auto: 'auto', light: 'light', dark: 'dark' };

r.use(noindex('Admin'));
r.get('/lang/:code', (req, res) => {
  if (req.params.code === 'vi' || req.params.code === 'en') {
    res.cookie('admin_lang', req.params.code, {
      maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax', httpOnly: true,
      secure: process.env.NODE_ENV === 'production', path: '/admin',
    });
  }
  const target = String(req.query.return || '/admin');
  res.redirect(target.startsWith('/admin') && !target.startsWith('//') ? target : '/admin');
});
r.use((req, res, next) => {
  const lang = getCookie(req, 'admin_lang') === 'en' ? 'en' : 'vi';
  const mode = getCookie(req, 'admin_theme');
  const accent = getCookie(req, 'admin_accent');
  const themeMode = Object.hasOwn(ADMIN_THEMES, mode) ? ADMIN_THEMES[mode] : 'auto';
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : THEMES.blue;
  req.lang = lang;
  req.t = translator(lang);
  res.locals.lang = lang;
  res.locals.t = req.t;
  res.locals.at = text => adminText(lang, text);
  res.locals.adminTheme = { mode: themeMode, accent: themeColor, colors: Object.entries(THEMES) };
  res.locals.ui = buildUi(res.locals.site, req, lang, { themeMode, themeColor });
  next();
});
r.use(csrf);
r.use(flashMw);

// ---- Thiết lập admin đầu tiên (không dùng mật khẩu trong .env) ----
const setupForm = (req, extra = {}) => ({ error: null, token: String(req.query.token || req.body?.token || ''), ...extra });
r.get('/setup', async (req, res) => {
  if (await adminCount()) return res.redirect('/admin/login');
  if (!tokenOk(req.query.token)) return res.status(403).render('admin/setup-denied');
  res.render('admin/setup', setupForm(req));
});
r.post('/setup', setupLimiter, async (req, res) => {
  if (await adminCount()) return res.redirect('/admin/login');
  const token = String(req.body.token || '');
  if (!tokenOk(token)) return res.status(403).render('admin/setup-denied');
  const bad = msg => res.status(400).render('admin/setup', setupForm(req, { error: msg }));
  if (!(await turnstileOk(req))) return bad(CAPTCHA_ERROR);
  const username = String(req.body.username || '').trim();
  const pw = String(req.body.password || '');
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return bad('Tên đăng nhập 3-32 ký tự: chữ, số, . _ -');
  if (pw.length < 10 || pw.length > 200) return bad('Mật khẩu cần từ 10 ký tự');
  if (pw !== String(req.body.confirm || '')) return bad('Mật khẩu nhập lại không khớp');
  clearToken(); // vô hiệu ngay để request song song không tạo thêm
  try {
    await query(
      `INSERT INTO admins (username, password_hash, role_id) VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'superadmin'))`,
      [username, bcrypt.hashSync(pw, 10)]);
  } catch (e) { restoreToken(token); throw e; }
  setFlash(req, 'ok', 'Đã tạo quản trị viên. Hãy đăng nhập.');
  res.redirect('/admin/login');
});

// ---- Đăng nhập ----
r.get('/login', async (req, res) => res.render('admin/login', { error: null, noAdmins: (await adminCount()) === 0 }));
r.post('/login', loginLimiter, async (req, res) => {
  const fail = (code, error) => res.status(code).render('admin/login', { error, noAdmins: false });
  if (!(await turnstileOk(req))) return fail(400, CAPTCHA_ERROR);
  const u = await one('SELECT * FROM admins WHERE lower(username) = lower($1)', [String(req.body.username || '').trim()]);
  const okPw = bcrypt.compareSync(String(req.body.password || ''), u?.password_hash || DUMMY_HASH);
  if (!u || !okPw) return fail(401, 'Sai tài khoản hoặc mật khẩu');
  if (u.disabled) return fail(403, 'Tài khoản đã bị khóa');
  await query('UPDATE admins SET last_login_at = now() WHERE id = $1', [u.id]);
  req.session.regenerate(() => { req.session.admin = u.id; res.redirect('/admin'); });
});
r.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

r.use(loadAdmin);

// ---- Phân quyền theo khu vực ----
r.use('/sources', requirePerm('sources.manage'));
r.use('/index', requirePerm('index.manage'));
r.use('/keywords', requirePerm('keywords.manage'));
r.use('/submissions', requirePerm('submissions.manage'));
r.use('/sites', requirePerm('sites.manage'));
r.use('/seo', requirePerm('seo.manage'));
r.use(accountsRouter);
r.use(engineRouter);
r.use(appearanceRouter);

r.get('/', requirePerm('dashboard.view'), async (req, res) => {
  const docs = await searchIndex.count().catch(() => 0);
  const [s, q, t] = await Promise.all([
    one('SELECT COUNT(*)::int c FROM sources'),
    one('SELECT COUNT(*)::int c FROM queries'),
    one('SELECT COUNT(*)::int c FROM queries WHERE created_at::date = CURRENT_DATE'),
  ]);
  const pend = await one(`SELECT COUNT(*)::int c FROM submissions WHERE status = 'pending'`);
  const stats = { docs, sources: s.c, queries: q.c, today: t.c, pending: pend.c };
  const top = await many('SELECT q, COUNT(*)::int c, MAX(results) results FROM queries GROUP BY q ORDER BY c DESC LIMIT 10');
  const empty = await many('SELECT q, COUNT(*)::int c FROM queries WHERE results = 0 GROUP BY q ORDER BY c DESC LIMIT 10');
  const perDay = (await many(`SELECT to_char(created_at, 'YYYY-MM-DD') d, COUNT(*)::int c FROM queries GROUP BY d ORDER BY d DESC LIMIT 7`)).reverse();
  const max = Math.max(1, ...perDay.map(p => p.c));
  res.render('admin/dashboard', { stats, top, empty, perDay, max, tab: 'dashboard', provider: searchIndex.name, engineWarn: searchIndex.recentWriteFailure() });
});

r.get('/sources', async (req, res) => {
  const sources = (await many('SELECT * FROM sources ORDER BY id DESC')).map(s => ({ ...s, running: isRunning(s.id) }));
  res.render('admin/sources', { sources, tab: 'sources', error: req.query.error });
});
r.post('/sources', async (req, res) => {
  try {
    const u = new URL(String(req.body.url).trim());
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    const max = Math.min(Math.max(parseInt(req.body.max_pages) || 50, 1), 2000);
    await query('INSERT INTO sources (url, origin, max_pages) VALUES ($1, $2, $3)', [u.href, u.origin, max]);
    res.redirect('/admin/sources');
  } catch { res.redirect('/admin/sources?error=' + encodeURIComponent('URL không hợp lệ hoặc đã tồn tại')); }
});
r.post('/sources/:id/crawl', async (req, res) => {
  const s = await one('SELECT * FROM sources WHERE id = $1', [parseInt(req.params.id) || 0]);
  if (s) crawlSource(s).catch(e => console.error('crawl error:', e.message)); // chạy nền
  res.redirect('/admin/sources');
});
r.post('/sources/:id/delete', async (req, res) => {
  const s = await one('SELECT * FROM sources WHERE id = $1', [parseInt(req.params.id) || 0]);
  if (s) {
    try { await searchIndex.removeByDomain(new URL(s.url).hostname); } catch (e) { console.error(e.message); }
    await query('DELETE FROM sources WHERE id = $1', [s.id]);
  }
  res.redirect('/admin/sources');
});

// ---- Từ khóa ----
r.get('/keywords', async (req, res) => {
  const [pinned, blocked, top, empty] = await Promise.all([
    many(`SELECT * FROM keywords WHERE kind = 'pinned' ORDER BY id DESC`),
    many(`SELECT * FROM keywords WHERE kind = 'blocked' ORDER BY id DESC`),
    many(`SELECT q, COUNT(*)::int c, MAX(results) results FROM queries GROUP BY q ORDER BY c DESC, q LIMIT 30`),
    many(`SELECT q, COUNT(*)::int c FROM queries WHERE results = 0 GROUP BY q ORDER BY c DESC, q LIMIT 30`),
  ]);
  res.render('admin/keywords', { pinned, blocked, top, empty, tab: 'keywords', error: req.query.error, ok: req.query.ok });
});
r.post('/keywords', async (req, res) => {
  const q = normalizeQ(req.body.q);
  const kind = req.body.kind === 'blocked' ? 'blocked' : 'pinned';
  if (q.length < 1 || q.length > 60) return res.redirect('/admin/keywords?error=' + encodeURIComponent('Từ khóa cần từ 1 đến 60 ký tự'));
  await query(
    `INSERT INTO keywords (q, kind) VALUES ($1, $2) ON CONFLICT (q) DO UPDATE SET kind = EXCLUDED.kind`, [q, kind]);
  res.redirect('/admin/keywords?ok=' + encodeURIComponent(kind === 'pinned' ? 'Đã ghim từ khóa' : 'Đã ẩn từ khóa'));
});
r.post('/keywords/delete', async (req, res) => {
  await query('DELETE FROM keywords WHERE id = $1', [parseInt(req.body.id) || 0]);
  res.redirect('/admin/keywords');
});
r.post('/keywords/purge', async (req, res) => { // xóa toàn bộ log của một từ khóa
  const q = normalizeQ(req.body.q);
  await query('DELETE FROM queries WHERE q = $1', [q]);
  await query('DELETE FROM events WHERE q = $1', [q]);
  res.redirect('/admin/keywords?ok=' + encodeURIComponent('Đã xóa lịch sử từ khóa'));
});

// ---- Yêu cầu gửi website (mức 1) ----
r.get('/submissions', async (req, res) => {
  const rows = await many(`SELECT * FROM submissions ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200`);
  res.render('admin/submissions', { rows, tab: 'submissions' });
});
r.post('/submissions/:id/approve', async (req, res) => {
  const sub = await one(`SELECT * FROM submissions WHERE id = $1 AND status = 'pending'`, [parseInt(req.params.id) || 0]);
  if (sub) {
    const max = Math.min(Math.max(parseInt(req.body.max_pages) || 50, 1), 2000);
    await query('INSERT INTO sources (url, origin, max_pages) VALUES ($1, $2, $3) ON CONFLICT (url) DO NOTHING', [sub.url, sub.origin, max]);
    await query(`UPDATE submissions SET status = 'approved' WHERE id = $1`, [sub.id]);
    const src = await one('SELECT * FROM sources WHERE url = $1', [sub.url]);
    if (src) crawlSource(src).catch(e => console.error('crawl error:', e.message));
  }
  res.redirect('/admin/submissions');
});
r.post('/submissions/:id/reject', async (req, res) => {
  await query(`UPDATE submissions SET status = 'rejected' WHERE id = $1`, [parseInt(req.params.id) || 0]);
  res.redirect('/admin/submissions');
});
r.post('/submissions/:id/delete', async (req, res) => {
  await query('DELETE FROM submissions WHERE id = $1', [parseInt(req.params.id) || 0]);
  res.redirect('/admin/submissions');
});

// ---- Website của chủ web (mức 2) ----
r.get('/sites', async (req, res) => {
  const rows = await many(`SELECT s.*, u.email FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 300`);
  res.render('admin/sites', { rows, tab: 'sites' });
});
r.post('/sites/:id/delete', async (req, res) => {
  await query('DELETE FROM sites WHERE id = $1', [parseInt(req.params.id) || 0]);
  res.redirect('/admin/sites');
});

r.get('/index', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const hits = await searchIndex.browse(q, 30).catch(() => []);
  res.render('admin/index', { hits, q, tab: 'index' });
});
r.post('/index/delete', async (req, res) => {
  await searchIndex.remove(String(req.body.id)).catch(e => console.error(e.message));
  res.redirect('/admin/index');
});
r.post('/index/clear', async (req, res) => {
  await searchIndex.clear().catch(e => console.error(e.message));
  res.redirect('/admin/index');
});

r.get('/seo', async (req, res) => res.render('admin/seo', { s: await getSettings(), tab: 'seo', saved: req.query.saved }));
r.post('/seo', async (req, res) => { await saveSettings(req.body); res.redirect('/admin/seo?saved=1'); });

export default r;
