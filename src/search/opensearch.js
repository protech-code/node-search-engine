import { createRestEngine } from './rest-engine.js';
const e = createRestEngine({
  provider: 'opensearch',
  url: process.env.OPENSEARCH_URL,
  user: process.env.OPENSEARCH_USER, password: process.env.OPENSEARCH_PASSWORD,
  caPath: process.env.OPENSEARCH_CA_PATH,
  index: process.env.OPENSEARCH_INDEX || 'pages',
});
export const { name, describe, init, health, search, add, remove, removeByDomain, clear, count, countByDomain,
  browse, browseDomain, suggest, setupSecurity, ensureIndex } = e;
