import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import crypto from 'node:crypto';
import { query } from './db.js';
import * as searchIndex from './search/index.js';
import { fetchText, UserError } from './ssrf.js';
import { BOT_UA as UA } from './sites.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const running = new Set();
class FatalCrawl extends Error {}
export const isRunning = id => running.has(id);

function normalize(u, base) {
  try {
    const url = new URL(u, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

async function getRobots(origin) {
  const url = `${origin}/robots.txt`;
  try {
    const r = await fetchText(url, { headers: { 'user-agent': UA }, maxBytes: 500_000, timeout: 8000 });
    return robotsParser(url, r.status === 200 ? r.text : '');
  } catch { return robotsParser(url, ''); }
}

// Đọc sitemap (hỗ trợ sitemap index 1 cấp), chỉ lấy URL cùng host.
async function readSitemap(url, host, depth = 0, out = new Set()) {
  if (depth > 1 || out.size >= 5000) return out;
  try {
    const r = await fetchText(url, { headers: { 'user-agent': UA }, maxBytes: 5_000_000 });
    if (!r.ok) return out;
    const $ = cheerio.load(r.text, { xmlMode: true });
    const subs = $('sitemap > loc').map((_, e) => $(e).text().trim()).get().slice(0, 10);
    for (const s of subs) {
      try { if (new URL(s).hostname === host) await readSitemap(s, host, depth + 1, out); } catch { /* bỏ qua */ }
    }
    $('url > loc').each((_, e) => {
      const n = normalize($(e).text().trim());
      if (n && out.size < 5000 && new URL(n).hostname === host) out.add(n);
    });
  } catch { /* bỏ qua */ }
  return out;
}

function extract($, url) {
  $('script, style, noscript, nav, footer, header, form, iframe, svg').remove();
  const title = ($('title').first().text() || $('h1').first().text() || url).trim().slice(0, 200);
  const description = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 300);
  const content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
  return { title, description, content };
}

export async function crawlSource(source) {
  if (running.has(source.id)) return;
  running.add(source.id);
  const set = async (fields) => {
    const keys = Object.keys(fields); // khóa do code nội bộ đặt, không lấy từ người dùng
    await query(
      `UPDATE sources SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
      [...Object.values(fields), source.id],
    );
  };

  let errCount = 0, host = '';
  const logErr = async (url, reason) => {
    if (errCount++ < 100) await query('INSERT INTO crawl_errors (host, url, reason) VALUES ($1, $2, $3)', [host, url, reason]).catch(() => {});
  };

  try {
    await set({ status: 'running', pages_crawled: 0, last_error: null });
    const start = new URL(source.url);
    host = start.hostname;
    await query('DELETE FROM crawl_errors WHERE host = $1', [host]);

    const robots = await getRobots(start.origin);
    const seeds = new Set();
    const sitemapUrls = source.sitemap_url ? [source.sitemap_url] : robots.getSitemaps().slice(0, 3);
    for (const sm of sitemapUrls) await readSitemap(sm, host, 0, seeds);

    const queue = [normalize(source.url), ...seeds].filter(Boolean);
    const seen = new Set(queue);
    const delay = Math.min(Math.max(Number(process.env.CRAWL_DELAY_MS || 500), (robots.getCrawlDelay(UA) || 0) * 1000), 10_000);
    let count = 0, idxFail = 0;

    while (queue.length && count < source.max_pages) {
      const url = queue.shift();
      if (!robots.isAllowed(url, UA)) { await logErr(url, 'code:robots'); continue; }
      try {
        const res = await fetchText(url, { headers: { 'user-agent': UA }, maxBytes: 2_000_000 });
        if (!res.ok) { await logErr(url, `HTTP ${res.status}`); continue; }
        if (!String(res.headers['content-type'] || '').includes('text/html')) { await logErr(url, 'code:nothtml'); continue; }

        const $ = cheerio.load(res.text);
        const robotsMeta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
        const links = [];
        if (!robotsMeta.includes('nofollow')) {
          $('a[href]').each((_, a) => {
            const n = normalize($(a).attr('href'), url);
            if (n) links.push(n);
          });
        }
        // Đưa link vào hàng đợi trước, để lỗi ghi index tạm thời không làm mất việc khám phá link.
        for (const n of links) {
          if (!seen.has(n) && new URL(n).hostname === host) { seen.add(n); queue.push(n); }
        }
        if (robotsMeta.includes('noindex')) {
          await logErr(url, 'code:noindex');
        } else {
          const doc = extract($, url);
          try {
            await searchIndex.add({
              id: crypto.createHash('sha1').update(url).digest('hex'),
              url, domain: new URL(url).hostname, ...doc, crawledAt: Date.now(),
            });
            idxFail = 0;
          } catch (e) {
            // Chi tiết lỗi engine chỉ ghi log + trang Admin → Engine (không lộ cho chủ web).
            console.error('[index] ghi thất bại:', searchIndex.explainError(e).message);
            if (++idxFail >= 3) throw new FatalCrawl('Không ghi được vào search engine. Quản trị viên cần kiểm tra Admin → Engine.');
            await logErr(url, 'code:indexfail');
            continue;
          }
          count++;
          await set({ pages_crawled: count });
        }
      } catch (e) {
        if (e instanceof FatalCrawl) throw e;
        await logErr(url, e instanceof UserError ? `key:${e.key}` : e.message.slice(0, 200));
      }
      await sleep(delay);
    }
    await set({ status: 'idle', last_crawled_at: new Date().toISOString() });
  } catch (e) {
    await set({ status: 'error', last_error: e.message }).catch(() => {});
  } finally {
    running.delete(source.id);
  }
}
