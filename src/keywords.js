// Quản lý từ khóa: ghim (pinned), ẩn (blocked), gợi ý tự động từ lịch sử + tiêu đề trang.
import { many } from './db.js';
import * as searchIndex from './search/index.js';

// Từ khóa người dùng gõ chỉ hiện công khai khi đã được tìm >= MIN lần (chống spam/lộ truy vấn riêng).
const MIN = Math.max(1, Number(process.env.KEYWORD_MIN_COUNT || 3));
// AUTO_KEYWORDS=false: chỉ hiện từ khóa admin ghim.
const AUTO = process.env.AUTO_KEYWORDS !== 'false';

export const normalizeQ = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Lọc truy vấn không nên hiện công khai: URL, email, quá dài/ngắn, hoặc bị admin ẩn.
const CLEAN = `q NOT LIKE '%@%' AND q NOT LIKE '%http%' AND q NOT LIKE '%www.%'
  AND length(q) BETWEEN 2 AND 60 AND q NOT IN (SELECT q FROM keywords WHERE kind = 'blocked')`;

const uniq = arr => {
  const seen = new Set();
  return arr.filter(x => { const k = x.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

async function autoList(limit, prefix) {
  if (!AUTO) return [];
  const params = [MIN, limit];
  let like = '';
  if (prefix) { params.push(prefix + '%'); like = 'AND q LIKE $3'; }
  const rows = await many(
    `SELECT q FROM queries WHERE results > 0 AND ${CLEAN} ${like} GROUP BY q HAVING COUNT(*) >= $1 ORDER BY COUNT(*) DESC LIMIT $2`, params);
  return rows.map(r => r.q);
}

export async function popular(limit = 8) {
  const pinned = (await many(`SELECT q FROM keywords WHERE kind = 'pinned' ORDER BY id DESC LIMIT $1`, [limit])).map(r => r.q);
  const auto = await autoList(limit);
  return uniq([...pinned, ...auto].map(t => ({ t }))).map(x => x.t).slice(0, limit);
}

// Gợi ý khi gõ: ghim -> lịch sử phổ biến -> tiêu đề trang đã index. Trả [{t, k}] (k: 'k' từ khóa, 'p' trang).
export async function suggest(input, limit = 8) {
  const p = normalizeQ(input).replace(/[%_\\]/g, '').slice(0, 100);
  if (!p) return (await popular(limit)).map(t => ({ t, k: 'k' }));

  const pinned = (await many(
    `SELECT q FROM keywords WHERE kind = 'pinned' AND q LIKE $1 ORDER BY id DESC LIMIT $2`, [p + '%', limit])).map(r => r.q);
  const auto = await autoList(limit, p);
  let titles = [];
  if (p.length >= 2) {
    titles = (await searchIndex.suggest(p, limit).catch(() => []))
      .map(t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean);
  }
  return uniq([
    ...pinned.map(t => ({ t, k: 'k' })),
    ...auto.map(t => ({ t, k: 'k' })),
    ...titles.map(t => ({ t, k: 'p' })),
  ]).slice(0, limit);
}

// Từ khóa đưa vào sitemap: phổ biến (có kết quả) + ghim (có kết quả), trừ từ bị ẩn.
export async function sitemapKeywords(limit = 1000) {
  const pinnedSql = `q IN (SELECT q FROM keywords WHERE kind = 'pinned')`;
  const having = AUTO ? `COUNT(*) >= $1 OR ${pinnedSql}` : pinnedSql;
  const params = AUTO ? [MIN, limit] : [limit];
  return many(
    `SELECT q, to_char(MAX(created_at), 'YYYY-MM-DD') AS lastmod FROM queries
     WHERE results > 0 AND ${CLEAN} GROUP BY q HAVING ${having} ORDER BY COUNT(*) DESC LIMIT $${params.length}`, params);
}
