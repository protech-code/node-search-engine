// Search ngay trong PostgreSQL (full-text search): KHÔNG cần dịch vụ search riêng.
// Bỏ dấu tiếng Việt thực hiện trong ứng dụng nên không cần extension (unaccent) trên Aiven.
import { query, many, one } from '../db.js';
import { fold, tokens, markTerms } from './fold.js';
import { hl } from './util.js';

export const name = 'postgres';
const T = 'search_pages';
export const describe = () => ({ Bảng: T, 'Kiểu tìm': "to_tsvector('simple') + bỏ dấu trong ứng dụng", 'Kết nối': 'dùng chung DATABASE_URL' });

export async function init() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ${T} (
        id TEXT PRIMARY KEY, url TEXT NOT NULL, domain TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
        title_f TEXT NOT NULL DEFAULT '', crawled_at BIGINT NOT NULL DEFAULT 0, tsv tsvector
      );
      CREATE INDEX IF NOT EXISTS idx_${T}_tsv ON ${T} USING GIN (tsv);
      CREATE INDEX IF NOT EXISTS idx_${T}_domain ON ${T} (domain);
    `);
  } catch (e) { console.warn('[postgres] init:', e.message); }
}

export async function health() {
  const [c, v] = await Promise.all([one(`SELECT COUNT(*)::int c FROM ${T}`), one('SHOW server_version')]);
  return { 'Số trang trong bảng': c.c, 'Phiên bản Postgres': v.server_version };
}

// "xin chao" -> 'xin & chao:*' (từ cuối khớp tiền tố). Chỉ chứa chữ/số nên an toàn cho to_tsquery.
const tsq = terms => terms.slice(0, 10).map((t, i, a) => (i === a.length - 1 ? `${t}:*` : t)).join(' & ');

export async function search(q, page = 1, perPage = 10) {
  const terms = tokens(q);
  if (!terms.length) return { total: 0, ms: 0, hits: [] };
  const t0 = Date.now();
  const rows = await many(
    `SELECT url, domain, title, description, left(content, 8000) AS content,
            ts_rank_cd(tsv, tq) AS rank, COUNT(*) OVER() AS total
     FROM ${T}, to_tsquery('simple', $1) tq
     WHERE tsv @@ tq ORDER BY rank DESC, crawled_at DESC LIMIT $2 OFFSET $3`,
    [tsq(terms), perPage, (page - 1) * perPage]);
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    ms: Date.now() - t0,
    hits: rows.map(r => ({
      url: r.url, domain: r.domain,
      title: hl(markTerms(r.title || r.url, terms, { window: 300 })),
      snippet: hl(markTerms(r.content || r.description, terms)),
    })),
  };
}

export async function add(doc) {
  const title = doc.title || '', desc = doc.description || '', content = doc.content || '';
  await query(
    `INSERT INTO ${T} (id, url, domain, title, description, content, title_f, crawled_at, tsv)
     VALUES ($1, $2, $3, $4::text, $5::text, $6::text, $7::text, $8,
       setweight(to_tsvector('simple', $7::text), 'A') || setweight(to_tsvector('simple', $9::text), 'B') || setweight(to_tsvector('simple', $10::text), 'C'))
     ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, domain = EXCLUDED.domain, title = EXCLUDED.title,
       description = EXCLUDED.description, content = EXCLUDED.content, title_f = EXCLUDED.title_f,
       crawled_at = EXCLUDED.crawled_at, tsv = EXCLUDED.tsv`,
    [doc.id, doc.url, doc.domain, title, desc, content, fold(title), doc.crawledAt || Date.now(), fold(desc), fold(content)]);
}

export const remove = id => query(`DELETE FROM ${T} WHERE id = $1`, [id]);
export const removeByDomain = domain => query(`DELETE FROM ${T} WHERE domain = $1`, [domain]);
export const clear = () => query(`TRUNCATE ${T}`);
export const count = async () => (await one(`SELECT COUNT(*)::int c FROM ${T}`)).c;
export const countByDomain = async d => (await one(`SELECT COUNT(*)::int c FROM ${T} WHERE domain = $1`, [d])).c;

export async function browse(q, limit = 30) {
  const terms = tokens(q);
  if (!terms.length) return many(`SELECT id, url, title, domain FROM ${T} ORDER BY crawled_at DESC LIMIT $1`, [limit]);
  return many(`SELECT id, url, title, domain FROM ${T} WHERE tsv @@ to_tsquery('simple', $1) LIMIT $2`, [tsq(terms), limit]);
}
export const browseDomain = (d, limit = 50) =>
  many(`SELECT id, url, title FROM ${T} WHERE domain = $1 ORDER BY crawled_at DESC LIMIT $2`, [d, limit]);

export async function suggest(q, limit = 5) {
  const p = fold(q).toLowerCase().replace(/[%_\\]/g, '');
  if (!p) return [];
  const rows = await many(`SELECT title FROM ${T} WHERE lower(title_f) LIKE $1 ORDER BY crawled_at DESC LIMIT $2`, ['%' + p + '%', limit * 2]);
  return rows.map(r => r.title);
}
