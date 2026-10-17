// Chọn search engine bằng SEARCH_PROVIDER: meilisearch | opensearch | elasticsearch | typesense | postgres
import { explain } from './errors.js';

const LOADERS = {
  meilisearch: () => import('./meili.js'),
  opensearch: () => import('./opensearch.js'),
  elasticsearch: () => import('./elasticsearch.js'),
  typesense: () => import('./typesense.js'),
  postgres: () => import('./postgres.js'),
};
export const PROVIDERS = Object.keys(LOADERS);

const provider = (process.env.SEARCH_PROVIDER || 'meilisearch').toLowerCase();
if (!LOADERS[provider]) throw new Error(`SEARCH_PROVIDER không hợp lệ: "${provider}". Hợp lệ: ${PROVIDERS.join(', ')}`);
const impl = await LOADERS[provider]();

export const { name, init, search, remove, removeByDomain, clear, count, browse, countByDomain, browseDomain, suggest } = impl;
export const describe = () => impl.describe();
export const rawEngine = impl; // cho scripts/engine-setup.js

// ---- theo dõi lỗi ghi chỉ mục ----
const state = { failures: 0, lastError: null, lastErrorAt: 0, lastOkAt: 0 };
export async function add(doc, opts) {
  try {
    await impl.add(doc, opts);
    state.lastOkAt = Date.now();
  } catch (e) {
    const x = explain(e, name);
    state.failures++; state.lastError = x; state.lastErrorAt = Date.now();
    throw e;
  }
}
export const writeStatus = () => ({ ...state });
export function recentWriteFailure() {
  const recent = state.lastErrorAt > state.lastOkAt && Date.now() - state.lastErrorAt < 3600_000;
  return recent ? { ...state.lastError, at: state.lastErrorAt } : null;
}

export async function health() {
  try { return { ok: true, details: await impl.health() }; }
  catch (e) { return { ok: false, ...explain(e, name) }; }
}

// Ghi thử + xóa một tài liệu: kiểm tra đúng quyền ghi/xóa (lỗi quyền thường chỉ lộ ra ở bước ghi).
export async function selfTest() {
  const doc = { id: '__mysearch_selftest__', url: 'http://selftest.invalid/', domain: 'selftest.invalid', title: 'selftest', description: '', content: 'selftest', crawledAt: Date.now() };
  const steps = [];
  try {
    await add(doc, { refresh: true }); steps.push('Ghi tài liệu: OK');
    await impl.remove(doc.id); steps.push('Xóa tài liệu: OK');
    return { ok: true, steps };
  } catch (e) { return { ok: false, steps, ...explain(e, name) }; }
}
export const explainError = e => explain(e, name);
