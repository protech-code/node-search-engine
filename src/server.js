import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import { pool, initDb, getSettings, purgeOldEvents } from './db.js';
import * as searchIndex from './search/index.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import seoRoutes from './routes/seo.js';
import { turnstileSiteKey } from './turnstile.js';
import { initSetupToken } from './setup.js';
import brandRoutes from './routes/brand.js';
import { translator, pickLang } from './i18n/index.js';
import { buildUi } from './ui.js';
import fs from 'node:fs';
import submitRoutes from './routes/submit.js';
import accountRoutes from './routes/account.js';

const app = express();
const root = path.join(import.meta.dirname, '..');
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.locals.analyticsEnabled = process.env.NODE_ENV === 'production';
// Số lớp proxy phía trước app (Nginx = 1; Cloudflare + Nginx = 2). Quyết định IP thật cho rate limit.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');
app.locals.fmt = d => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');

const CF = 'https://challenges.cloudflare.com'; // Cloudflare Turnstile
app.use(helmet({ contentSecurityPolicy: { directives: {
  'script-src': ["'self'", CF], 'frame-src': [CF], 'connect-src': ["'self'", CF],
  'img-src': ["'self'", 'data:', 'https:'],
} } }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(root, 'public'), { maxAge: '7d' }));

const PgStore = connectPg(session);
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }), // session bền trong Postgres
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 3600 * 1000 },
}));

const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
app.use(async (req, res, next) => {
  const site = await getSettings();
  res.locals.site = site;
  const lang = pickLang(req, site);
  req.lang = lang; req.t = translator(lang);
  res.locals.lang = lang; res.locals.t = req.t;
  res.locals.numFmt = n => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN');
  res.locals.ui = buildUi(site, req, lang);
  res.locals.assetV = pkgVersion;
  res.locals.currentPath = req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//') ? req.originalUrl : '/';
  res.locals.baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  res.locals.meta = {};
  res.locals.jsonLd = false;
  res.locals.turnstileSiteKey = turnstileSiteKey;
  next();
});

app.use(brandRoutes);
app.use(seoRoutes);
app.use('/admin', adminRoutes);
app.use('/submit', submitRoutes);
app.use('/account', accountRoutes);
app.use(publicRoutes);
app.use((req, res) => res.status(404).render('404', { meta: { title: '404', noindex: true } }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).send('Lỗi máy chủ');
});

await initDb();
await initSetupToken();
await searchIndex.init();
purgeOldEvents().catch(() => {});
setInterval(() => purgeOldEvents().catch(() => {}), 24 * 3600 * 1000).unref();
app.listen(port, () => console.log(`Chạy tại ${process.env.BASE_URL || 'http://localhost:' + port} | search: ${searchIndex.name}`));
