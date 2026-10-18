import pg from 'pg';
import fs from 'node:fs';
import { DEFAULT_ROLES } from './permissions.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env');

function build() {
  const url = new URL(process.env.DATABASE_URL);
  const sslmode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode'); // tự cấu hình SSL bên dưới để tránh xung đột với pg
  let ssl;
  if (process.env.PG_CA_PATH) {
    ssl = { ca: fs.readFileSync(process.env.PG_CA_PATH, 'utf8'), rejectUnauthorized: true };
  } else if (sslmode && sslmode !== 'disable') {
    ssl = { rejectUnauthorized: false };
    console.warn('[db] SSL bật nhưng chưa xác thực chứng chỉ. Đặt PG_CA_PATH=ca.pem (từ Aiven) cho production.');
  }
  const serverless = Boolean(process.env.VERCEL || process.env.NETLIFY);
  return {
    connectionString: url.href,
    ssl,
    max: Number(process.env.PG_POOL_MAX || (serverless ? 1 : 10)),
  };
}

export const pool = new pg.Pool(build());
// Kết nối nhàn rỗi bị phía server ngắt (Aiven làm việc này định kỳ) không được làm sập app.
pool.on('error', e => console.error('[db] lỗi kết nối nhàn rỗi:', e.message));
export const query = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0];
export const many = async (text, params) => (await pool.query(text, params)).rows;

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sources (
      id SERIAL PRIMARY KEY, url TEXT UNIQUE NOT NULL, max_pages INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'idle', pages_crawled INTEGER NOT NULL DEFAULT 0,
      last_crawled_at TEXT, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS queries (
      id BIGSERIAL PRIMARY KEY, q TEXT NOT NULL, results INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_queries_q ON queries(q);
    CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at);
    CREATE TABLE IF NOT EXISTS settings ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL);
  `);

  await query(`
    ALTER TABLE sources ADD COLUMN IF NOT EXISTS origin TEXT;
    ALTER TABLE sources ADD COLUMN IF NOT EXISTS sitemap_url TEXT;
    ALTER TABLE sources ADD COLUMN IF NOT EXISTS crawl_requested_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_sources_origin ON sources(origin);

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin TEXT NOT NULL, host TEXT NOT NULL, verify_token TEXT NOT NULL,
      verified_at TIMESTAMPTZ, verify_method TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, origin)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_verified_origin ON sites(origin) WHERE verified_at IS NOT NULL;
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY, url TEXT NOT NULL, origin TEXT NOT NULL, email TEXT NOT NULL, ip TEXT,
      status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status, created_at);
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY, domain TEXT NOT NULL, url TEXT NOT NULL, q TEXT NOT NULL,
      type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain, created_at);
    CREATE TABLE IF NOT EXISTS crawl_errors (
      id BIGSERIAL PRIMARY KEY, host TEXT NOT NULL, url TEXT NOT NULL, reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_errors_host ON crawl_errors(host);
    CREATE TABLE IF NOT EXISTS assets (
      name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, etag TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS keywords (
      id SERIAL PRIMARY KEY, q TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('pinned', 'blocked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  for (const s of await many('SELECT id, url FROM sources WHERE origin IS NULL')) {
    try { await query('UPDATE sources SET origin = $1 WHERE id = $2', [new URL(s.url).origin, s.id]); } catch { /* bỏ qua */ }
  }

  // Vai trò & phân quyền
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, permissions TEXT[] NOT NULL DEFAULT '{}',
      builtin BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_admin_username_lower ON admins (lower(username));
  `);
  for (const r of DEFAULT_ROLES) {
    await query('INSERT INTO roles (name, permissions, builtin) VALUES ($1, $2::text[], true) ON CONFLICT (name) DO NOTHING', [r.name, r.permissions]);
  }
  await query(`UPDATE roles SET permissions = ARRAY['*'], builtin = true WHERE name = 'superadmin'`);
  // Một lần: cấp quyền giao diện mới cho vai trò admin mặc định của bản cài cũ
  if (!(await one(`SELECT 1 AS x FROM settings WHERE "key" = 'migr_appearance_perm'`))) {
    await query(`UPDATE roles SET permissions = array_append(permissions, 'appearance.manage') WHERE name = 'admin' AND builtin AND NOT ('appearance.manage' = ANY(permissions))`);
    await query(`INSERT INTO settings ("key", "value") VALUES ('migr_appearance_perm', '1') ON CONFLICT DO NOTHING`);
  }
  // Admin cũ (bản trước chưa có vai trò) -> superadmin
  await query(`UPDATE admins SET role_id = (SELECT id FROM roles WHERE name = 'superadmin') WHERE role_id IS NULL`);
}

const DEFAULTS = {
  siteName: 'MySearch',
  siteDescription: 'Công cụ tìm kiếm nhanh, gọn và riêng tư.',
  siteCredit: '',
  titleTemplate: '%s – MySearch',
  ogImage: '',
  siteDescriptionEn: '',
  themePreset: 'blue', themeColor: '', themeMode: 'auto', themeToggle: '1',
  logoV: '', logoShowName: '1', logoHeight: '40', faviconV: '',
  bgMode: 'none', bgGradient: 'aurora', bgV: '', bgOverlay: '35',
  defaultLang: 'vi', langSwitch: '1',
};

let cache = null, cacheAt = 0;
export async function getSettings() {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  const rows = await many('SELECT "key", "value" FROM settings');
  cache = { ...DEFAULTS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
  cacheAt = Date.now();
  return cache;
}

export async function saveSettings(obj) {
  for (const k of Object.keys(DEFAULTS)) {
    if (k in obj) {
      await query(
        'INSERT INTO settings ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"',
        [k, String(obj[k]).slice(0, 500)],
      );
    }
  }
  cache = null;
}

export const purgeOldEvents = () => query(`DELETE FROM events WHERE created_at < now() - interval '90 days'`);
