// Engine tương thích Elasticsearch/OpenSearch (cùng REST + Query DSL). Dùng chung cho cả hai.
import { createHttp } from './http.js';
import { hl, PRE, POST } from './util.js';
import { fold } from './fold.js';

export function createRestEngine({ provider, url, user, password, apiKey, caPath, index }) {
  if (!url) throw new Error(`Thiếu URL cho ${provider} (xem .env)`);
  const u = new URL(url);
  // Cho phép nhúng user:pass trong URL, hoặc tách riêng (không cần mã hóa ký tự đặc biệt).
  const authUser = user || decodeURIComponent(u.username || '');
  const authPass = password || decodeURIComponent(u.password || '');
  u.username = ''; u.password = '';
  const headers = {};
  if (apiKey) headers.authorization = `ApiKey ${apiKey}`;
  else if (authUser) headers.authorization = 'Basic ' + Buffer.from(`${authUser}:${authPass}`).toString('base64');

  const { api } = createHttp({ provider, baseUrl: u.href, headers, caPath });
  const I = '/' + encodeURIComponent(index);

  const mapping = {
    // Bỏ dấu tiếng Việt khi lập chỉ mục & tìm kiếm: gõ "viet nam" vẫn ra "Việt Nam".
    settings: { analysis: {
      filter: { fold: { type: 'asciifolding', preserve_original: true } },
      analyzer: { vi_fold: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'fold'] } },
    } },
    mappings: { properties: {
      url: { type: 'keyword' }, domain: { type: 'keyword' },
      title: { type: 'text', analyzer: 'vi_fold' },
      description: { type: 'text', analyzer: 'vi_fold' },
      content: { type: 'text', analyzer: 'vi_fold' },
      crawledAt: { type: 'long' },
    } },
  };

  let ready = false;
  // Tạo index nếu chưa có. Gọi lại được: lỗi quyền lúc khởi động không làm app kẹt vĩnh viễn.
  async function ensureIndex() {
    if (ready) return;
    const r = await api('HEAD', I, undefined, { ok404: true });
    if (r.status === 404) await api('PUT', I, mapping);
    ready = true;
  }
  const missing = e => e?.status === 404 && /index_not_found/.test(String(e.type));

  return {
    name: provider,
    describe: () => ({
      'Địa chỉ': `${u.origin}${u.pathname === '/' ? '' : u.pathname}`, Index: index,
      'Xác thực': apiKey ? 'API key' : authUser ? `Basic (user: ${authUser})` : 'không',
      'CA tùy chỉnh': caPath ? 'có' : 'không',
    }),
    ensureIndex,

    async init() { try { await ensureIndex(); } catch (e) { console.warn(`[${provider}] init:`, e.message); } },

    async health() {
      const info = (await api('GET', '/')).body;
      await ensureIndex();
      const n = (await api('POST', `${I}/_count`, { query: { match_all: {} } })).body.count;
      return { 'Phiên bản': info.version?.number || '?', 'Số trang trong index': n };
    },

    async search(q, page = 1, perPage = 10) {
      let body;
      try {
        body = (await api('POST', `${I}/_search`, {
          from: (page - 1) * perPage, size: perPage, track_total_hits: true,
          query: { multi_match: { query: q, fields: ['title^3', 'description^2', 'content'], fuzziness: 'AUTO' } },
          highlight: { pre_tags: [PRE], post_tags: [POST],
            fields: { title: { number_of_fragments: 0 }, content: { fragment_size: 200, number_of_fragments: 1 } } },
        })).body;
      } catch (e) { if (missing(e)) return { total: 0, ms: 0, hits: [] }; throw e; }
      return {
        total: body.hits.total.value, ms: body.took,
        hits: body.hits.hits.map(h => {
          const s = h._source, hi = h.highlight || {};
          return { url: s.url, domain: s.domain, title: hl(hi.title?.[0] || s.title || s.url),
            snippet: hl(hi.content?.[0] || s.description || (s.content || '').slice(0, 200)) };
        }),
      };
    },

    async add({ id, ...doc }, { refresh = false } = {}) {
      await ensureIndex();
      await api('PUT', `${I}/_doc/${encodeURIComponent(id)}`, doc, refresh ? { query: { refresh: 'wait_for' } } : undefined);
    },
    remove: id => api('DELETE', `${I}/_doc/${encodeURIComponent(id)}`, undefined, { ok404: true }),
    removeByDomain: domain => api('POST', `${I}/_delete_by_query`, { query: { term: { domain } } }, { query: { refresh: 'true', conflicts: 'proceed' } }),
    clear: () => api('POST', `${I}/_delete_by_query`, { query: { match_all: {} } }, { query: { refresh: 'true', conflicts: 'proceed' } }),
    async count() { await ensureIndex(); return (await api('POST', `${I}/_count`, { query: { match_all: {} } })).body.count; },
    async countByDomain(domain) { return (await api('POST', `${I}/_count`, { query: { term: { domain } } })).body.count; },

    async browse(q, limit = 30) {
      const { body } = await api('POST', `${I}/_search`, {
        size: limit, _source: ['url', 'title', 'domain'],
        query: q ? { multi_match: { query: q, fields: ['title^3', 'description', 'content'] } } : { match_all: {} },
      });
      return body.hits.hits.map(h => ({ id: h._id, ...h._source }));
    },
    async browseDomain(domain, limit = 50) {
      const { body } = await api('POST', `${I}/_search`, { size: limit, _source: ['url', 'title'], query: { term: { domain } } });
      return body.hits.hits.map(h => ({ id: h._id, ...h._source }));
    },
    async suggest(q, limit = 5) {
      const { body } = await api('POST', `${I}/_search`, {
        size: limit * 2, _source: ['title'], query: { match_phrase_prefix: { title: { query: q } } },
      });
      return body.hits.hits.map(h => h._source.title);
    },

    // ---- dùng cho scripts/engine-setup.js ----
    async setupSecurity({ appUser, appPassword }) {
      const role = 'mysearch_app';
      if (provider === 'opensearch') {
        await api('PUT', `/_plugins/_security/api/roles/${role}`, {
          cluster_permissions: ['cluster_monitor'],
          index_permissions: [{ index_patterns: [index], allowed_actions: ['indices_all'] }],
        });
        await api('PUT', `/_plugins/_security/api/internalusers/${appUser}`, { password: appPassword, backend_roles: [], attributes: {} });
        await api('PUT', `/_plugins/_security/api/rolesmapping/${role}`, { users: [appUser] });
      } else {
        await api('PUT', `/_security/role/${role}`, { cluster: ['monitor'], indices: [{ names: [index], privileges: ['all'] }] });
        await api('PUT', `/_security/user/${appUser}`, { password: appPassword, roles: [role] });
      }
    },
  };
}
