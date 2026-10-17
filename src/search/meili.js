import { MeiliSearch } from 'meilisearch';
import { hl, PRE, POST } from './util.js';

export const name = 'meilisearch';
export const describe = () => ({ 'Địa chỉ': process.env.MEILI_HOST || 'http://localhost:7700', Index: 'pages', 'Xác thực': process.env.MEILI_KEY ? 'master key / API key' : 'không có key' });
export async function health() {
  const h = await meili.health();
  const st = await pages.getStats().catch(() => null);
  return { 'Trạng thái': h.status, 'Số trang trong index': st ? st.numberOfDocuments : '(chưa có index)' };
}
const meili = new MeiliSearch({ host: process.env.MEILI_HOST || 'http://localhost:7700', apiKey: process.env.MEILI_KEY });
const pages = meili.index('pages');

export async function init() {
  try {
    await meili.createIndex('pages', { primaryKey: 'id' });
    await pages.updateSettings({
      searchableAttributes: ['title', 'description', 'content'],
      filterableAttributes: ['domain'],
      sortableAttributes: ['crawledAt'],
    });
  } catch (e) { console.warn('[meilisearch]', e.message); }
}

export async function search(q, page = 1, perPage = 10) {
  const r = await pages.search(q, {
    limit: perPage, offset: (page - 1) * perPage,
    attributesToHighlight: ['title', 'description', 'content'],
    attributesToCrop: ['content'], cropLength: 35,
    highlightPreTag: PRE, highlightPostTag: POST,
  });
  return {
    total: r.estimatedTotalHits ?? r.hits.length,
    ms: r.processingTimeMs,
    hits: r.hits.map(h => ({
      url: h.url, domain: h.domain,
      title: hl(h._formatted?.title || h.title || h.url),
      snippet: hl(h._formatted?.content || h._formatted?.description || ''),
    })),
  };
}

export const add = doc => pages.addDocuments([doc]);
export const remove = id => pages.deleteDocument(id);
export const removeByDomain = domain => pages.deleteDocuments({ filter: `domain = "${domain}"` });
export const clear = () => pages.deleteAllDocuments();
export const count = async () => (await pages.getStats()).numberOfDocuments;
export async function browse(q, limit = 30) {
  const r = await pages.search(q, { limit, attributesToRetrieve: ['id', 'url', 'title', 'domain'] });
  return r.hits;
}

// Gợi ý theo tiêu đề trang (tìm tiền tố trong title)
export async function suggest(q, limit = 5) {
  const r = await pages.search(q, { limit: limit * 2, attributesToRetrieve: ['title'], attributesToSearchOn: ['title'] });
  return r.hits.map(h => h.title);
}

const safeDomain = d => String(d).replace(/[^a-z0-9.-]/gi, '');
export async function countByDomain(domain) {
  const r = await pages.search('', { filter: `domain = "${safeDomain(domain)}"`, hitsPerPage: 1 });
  return r.totalHits ?? 0;
}
export async function browseDomain(domain, limit = 50) {
  const r = await pages.search('', { filter: `domain = "${safeDomain(domain)}"`, limit, attributesToRetrieve: ['id', 'url', 'title'] });
  return r.hits;
}
