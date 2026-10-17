// Chuẩn bị search engine và chẩn đoán lỗi (đặc biệt lỗi quyền OpenSearch/Elasticsearch).
//   npm run engine:setup                  tạo index + kiểm tra đọc/ghi
//   npm run engine:setup -- --create-user tạo thêm role + user quyền tối thiểu (cần chạy bằng tài khoản admin của engine)
import crypto from 'node:crypto';
import * as engine from '../src/search/index.js';
import { OS_PERMISSION_GUIDE, ES_PERMISSION_GUIDE } from '../src/search/errors.js';

const createUser = process.argv.includes('--create-user');
const line = (s = '') => console.log(s);

line(`Engine: ${engine.name}`);
for (const [k, v] of Object.entries(engine.describe())) line(`  ${k}: ${v}`);

line('\n1) Tạo index/collection nếu chưa có...');
try {
  if (engine.rawEngine.ensureIndex) await engine.rawEngine.ensureIndex();
  else await engine.init();
  line('   OK');
} catch (e) {
  const x = engine.explainError(e);
  line(`   LỖI: ${x.message}`);
  if (x.hint) line('\n' + x.hint);
  process.exitCode = 1;
}

if (createUser) {
  line('\n2) Tạo role + user quyền tối thiểu...');
  if (!engine.rawEngine.setupSecurity) {
    line(`   Engine "${engine.name}" không có bước này (chỉ OpenSearch/Elasticsearch).`);
  } else {
    const appUser = 'mysearch';
    const appPassword = crypto.randomBytes(18).toString('base64url') + '-Aa1!';
    try {
      await engine.rawEngine.setupSecurity({ appUser, appPassword });
      const up = engine.name.toUpperCase();
      line('   OK. Đặt vào .env (thay cho tài khoản admin) rồi khởi động lại app:\n');
      line(`   ${up}_USER=${appUser}`);
      line(`   ${up}_PASSWORD=${appPassword}`);
      line(`   (và bỏ user:mật khẩu admin khỏi ${up}_URL nếu có; mật khẩu chỉ hiện MỘT lần)`);
    } catch (e) {
      const x = engine.explainError(e);
      line(`   LỖI: ${x.message}`);
      line('   Có thể dịch vụ không cho gọi Security API bằng tài khoản này (Aiven thường quản lý user riêng).');
      line('   Hãy tạo role/user bằng giao diện theo hướng dẫn dưới:\n');
      line(engine.name === 'opensearch' ? OS_PERMISSION_GUIDE : ES_PERMISSION_GUIDE);
      process.exitCode = 1;
    }
  }
}

line('\n' + (createUser ? '3' : '2') + ') Kiểm tra ghi thử + xóa thử...');
const t = await engine.selfTest();
for (const s of t.steps) line('   ' + s);
if (t.ok) line('   Tất cả OK ✓');
else {
  line(`   LỖI: ${t.message}`);
  if (t.hint) line('\n' + t.hint);
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
