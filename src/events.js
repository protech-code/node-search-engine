import { query } from './db.js';

// Ghi nhận lượt hiển thị / lượt click theo domain (dùng cho dashboard chủ web).
export async function logEvents(type, hits, q) {
  if (!hits.length) return;
  try {
    const vals = [];
    const ph = hits.map((h, i) => {
      vals.push(h.domain, h.url, q.toLowerCase().slice(0, 200), type);
      return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
    }).join(',');
    await query(`INSERT INTO events (domain, url, q, type) VALUES ${ph}`, vals);
  } catch (e) { console.error('logEvents:', e.message); }
}
