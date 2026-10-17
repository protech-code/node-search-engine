import { Router } from 'express';
import { requirePerm } from '../rbac.js';
import { setFlash } from '../flash.js';
import * as searchIndex from '../search/index.js';

const r = Router();

const GUIDES = [
  { id: 'meilisearch', title: 'Meilisearch', env: 'MEILI_HOST, MEILI_KEY', note: 'Đơn giản, bỏ dấu sẵn. Cần master key hoặc key có quyền indexes.create, documents.add, documents.delete, search.' },
  { id: 'opensearch', title: 'OpenSearch (Aiven OpenSearch)', env: 'OPENSEARCH_URL, OPENSEARCH_USER, OPENSEARCH_PASSWORD, OPENSEARCH_INDEX, OPENSEARCH_CA_PATH', note: 'Tài khoản cần: cluster_monitor + indices_all trên index "pages". Chạy npm run engine:setup -- --create-user để tạo role/user tự động.' },
  { id: 'elasticsearch', title: 'Elasticsearch', env: 'ELASTICSEARCH_URL, ELASTICSEARCH_USER/PASSWORD hoặc ELASTICSEARCH_API_KEY, ELASTICSEARCH_INDEX', note: 'Quyền: cluster "monitor" + index "pages" privilege "all". Hỗ trợ Elastic Cloud (API key).' },
  { id: 'typesense', title: 'Typesense', env: 'TYPESENSE_URL, TYPESENSE_API_KEY, TYPESENSE_COLLECTION', note: 'Cần key có quyền collections:* và documents:* (hoặc admin key).' },
  { id: 'postgres', title: 'PostgreSQL full-text', env: '(không cần thêm biến)', note: 'Không cần dịch vụ search riêng, dùng chung DATABASE_URL. Phù hợp site nhỏ đến vừa.' },
];

r.get('/engine', requirePerm('engine.view'), async (req, res) => {
  const test = req.session.engineTest; delete req.session.engineTest;
  res.render('admin/engine', {
    test,
    status: await searchIndex.health(), info: searchIndex.describe(), provider: searchIndex.name,
    writes: searchIndex.writeStatus(), guides: GUIDES, tab: 'engine',
  });
});

r.post('/engine/test', requirePerm('engine.manage'), async (req, res) => {
  const t = await searchIndex.selfTest();
  req.session.engineTest = t; // hiện chi tiết ở trang engine
  setFlash(req, t.ok ? 'ok' : 'error', t.ok ? 'Ghi thử + xóa thử thành công.' : 'Ghi thử thất bại, xem chi tiết bên dưới.');
  res.redirect('/admin/engine');
});

export default r;
