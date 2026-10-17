import { createRestEngine } from './rest-engine.js';
const e = createRestEngine({
  provider: 'elasticsearch',
  url: process.env.ELASTICSEARCH_URL,
  user: process.env.ELASTICSEARCH_USER, password: process.env.ELASTICSEARCH_PASSWORD,
  apiKey: process.env.ELASTICSEARCH_API_KEY,
  caPath: process.env.ELASTICSEARCH_CA_PATH,
  index: process.env.ELASTICSEARCH_INDEX || 'pages',
});
export const { name, describe, init, health, search, add, remove, removeByDomain, clear, count, countByDomain,
  browse, browseDomain, suggest, setupSecurity, ensureIndex } = e;
