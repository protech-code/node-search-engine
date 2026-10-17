// Tạo quản trị viên (superadmin) hoặc đặt lại mật khẩu — KHÔNG cần mật khẩu trong .env.
//   npm run admin:create                      (nhập tương tác, mật khẩu được ẩn)
//   npm run admin:create -- <tên> [mật khẩu]  (đối số mật khẩu có thể lưu trong lịch sử shell)
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { query, pool, initDb } from '../src/db.js';

function askHidden(label) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin });
      rl.question(label).then(a => { rl.close(); resolve(a); });
      return;
    }
    process.stdout.write(label);
    let s = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const onData = chunk => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
          process.stdout.write('\n'); return resolve(s);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') s = s.slice(0, -1); else s += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

let [user, pass] = process.argv.slice(2);
if (!user) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  user = (await rl.question('Tên đăng nhập [admin]: ')).trim() || 'admin';
  rl.close();
}
if (!/^[A-Za-z0-9._-]{3,32}$/.test(user)) { console.error('Tên đăng nhập 3-32 ký tự: chữ, số, . _ -'); process.exit(1); }
if (!pass) {
  pass = await askHidden('Mật khẩu mới (từ 10 ký tự): ');
  const again = await askHidden('Nhập lại mật khẩu: ');
  if (pass !== again) { console.error('Mật khẩu nhập lại không khớp.'); process.exit(1); }
}
if (pass.length < 10) { console.error('Mật khẩu cần từ 10 ký tự.'); process.exit(1); }

try {
  await initDb(); // đảm bảo bảng + vai trò tồn tại
  await query(
    `INSERT INTO admins (username, password_hash, role_id, disabled)
     VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'superadmin'), false)
     ON CONFLICT (lower(username)) DO UPDATE SET password_hash = EXCLUDED.password_hash,
       role_id = EXCLUDED.role_id, disabled = false`,
    [user, bcrypt.hashSync(pass, 10)]);
  console.log(`Đã tạo/cập nhật superadmin "${user}".`);
} catch (e) {
  console.error('Lỗi:', e.message);
  process.exitCode = 1;
}
await pool.end();
