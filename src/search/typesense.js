import { createHttp } from './http.js';
import { PRE, POST, hl } from './util.js';
import { fold, tokens, markTerms } from './fold.js';

export const name = 'typesense';
const url = process.env.TYPESENSE_URL;
const C = process.env.TYPESENSE_COLLECTION || 'pages';
if (!url) throw new Error('Thiếu TYPESENSE_URL (xem .env)');
const { api } = createHttp({
  provider: 'typesense', baseUrl: url,
  headers: { 'x-typesense-api-key': process.env.TYPESENSE_API_KEY || '' },
  caPath: process.env.TYPESENSE_CA_PATH,
});
const D = `/collections/${encodeURIComponent(C)}`;
const safe = d => String(d).replace(/[^a-z0-9.-]/gi, '');
const missing = e => e?.status === 404;

export const describe = () => ({ 'Địa chỉ': new URL(url).origin, Collection: C, 'Xác thực': process.env.TYPESENSE_API_KEY ? 'API key' : 'không có key' });

const schema = {
  name: C,
  fields: [
    { name: 'url', type: 'string' }, { name: 'domain', type: 'string' },
    { name: 'title', type: 'string' }, { name: 'title_f', type: 'string' },
    { name: 'description', type: 'string', optional: true },
    { name: 'content', type: 'string' }, { name: 'content_f', type: 'string' },
    { name: 'crawledAt', type: 'int64' },
  ],
};
let ready = false;
export async function ensureIndex() {
  if (ready) return;
  const r = await api('GET', D, undefined, { ok404: true });
  if (r.status === 404) await api('POST', '/collections', schema);
  ready = true;
}
export async function init() { try { await ensureIndex(); } catch (e) { console.warn('[typesense] init:', e.message); } }

export async function health() {
  await api('GET', '/health');
  await ensureIndex();
  const c = (await api('GET', D)).body;
  return { Collection: c.name, 'Số trang': c.num_documents };
}

const BY = 'title,title_f,description,content,content_f';
async function find(params) {
  return (await api('GET', `${D}/documents/search`, undefined, { query: { query_by: BY, query_by_weights: '4,4,2,1,1', prefix: 'true', num_typos: '1', ...params } })).body;
}
const hlOf = (h, f) => h.highlight?.[f]?.snippet ?? h.highlights?.find(x => x.field === f)?.snippet;

export async function search(q, page = 1, perPage = 10) {
  let b;
  try {
    b = await find({ q, page, per_page: perPage, highlight_start_tag: PRE, highlight_end_tag: POST, highlight_full_fields: 'title', highlight_affix_num_tokens: 12 });
  } catch (e) { if (missing(e)) return { total: 0, ms: 0, hits: [] }; throw e; }
  const terms = tokens(q);
  return {
    total: b.found, ms: b.search_time_ms ?? 0,
    hits: b.hits.map(h => {
      const d = h.document;
      // Không có highlight (vd khớp qua trường bỏ dấu) -> tự tô sáng trên văn bản gốc
      return {
        url: d.url, domain: d.domain,
        title: hl(hlOf(h, 'title') || markTerms(d.title || d.url, terms, { window: 300 })),
        snippet: hl(hlOf(h, 'content') || markTerms(d.content || d.description || '', terms)),
      };
    }),
  };
}

export async function add({ id, ...doc }) {
  await ensureIndex();
  await api('POST', `${D}/documents`, {
    id, ...doc, description: doc.description || '',
    title_f: fold(doc.title || ''), content_f: fold(doc.content || ''),
  }, { query: { action: 'upsert' } });
}
export const remove = id => api('DELETE', `${D}/documents/${encodeURIComponent(id)}`, undefined, { ok404: true });
export const removeByDomain = domain => api('DELETE', `${D}/documents`, undefined, { query: { filter_by: `domain:=\`${safe(domain)}\`` } });
export async function clear() { await api('DELETE', D, undefined, { ok404: true }); ready = false; await ensureIndex(); }
export async function count() { await ensureIndex(); return (await api('GET', D)).body.num_documents; }
export async function countByDomain(domain) { return (await find({ q: '*', per_page: 1, filter_by: `domain:=\`${safe(domain)}\`` })).found; }
export async function browse(q, limit = 30) {
  const b = await find({ q: q || '*', per_page: limit });
  return b.hits.map(h => ({ id: h.document.id, url: h.document.url, title: h.document.title, domain: h.document.domain }));
}
export async function browseDomain(domain, limit = 50) {
  const b = await find({ q: '*', per_page: limit, filter_by: `domain:=\`${safe(domain)}\`` });
  return b.hits.map(h => ({ id: h.document.id, url: h.document.url, title: h.document.title }));
}
export async function suggest(q, limit = 5) {
  const b = await find({ q, per_page: limit * 2, query_by: 'title,title_f', query_by_weights: '2,2' });
  return b.hits.map(h => h.document.title);
}
