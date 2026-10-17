// Thiết lập quản trị viên đầu tiên: không còn mật khẩu trong .env.
// Khi chưa có admin, server in link kèm token một lần ra log; chỉ ai đọc được log mới tạo được.
import crypto from 'node:crypto';
import { one } from './db.js';
import { safeEqual } from './security.js';

let token = null;
export const adminCount = async () => (await one('SELECT COUNT(*)::int c FROM admins')).c;

export async function initSetupToken() {
  if (process.env.ADMIN_PASSWORD || process.env.ADMIN_USER) {
    console.warn('[setup] ADMIN_USER/ADMIN_PASSWORD trong .env KHÔNG còn được dùng. Hãy xóa chúng khỏi .env.');
  }
  if ((await adminCount()) > 0) { token = null; return; }
  token = crypto.randomBytes(24).toString('hex');
  const base = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  console.log(`\n[setup] Chưa có quản trị viên. Mở link sau để tạo tài khoản đầu tiên:\n        ${base}/admin/setup?token=${token}\n        (hoặc chạy: npm run admin:create)\n`);
}
export const tokenOk = t => Boolean(token) && safeEqual(String(t || ''), token);
export const clearToken = () => { token = null; };
export const restoreToken = t => { token = t; };
