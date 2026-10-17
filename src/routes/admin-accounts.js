// Quản lý tài khoản (quản trị viên + chủ web) và vai trò.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, many } from '../db.js';
import { requirePerm } from '../rbac.js';
import { setFlash } from '../flash.js';
import { PERMISSIONS, isSuper, subset, cleanPerms } from '../permissions.js';

const r = Router();
const id = req => parseInt(req.params.id) || 0;
const back = (res, path = '/admin/accounts') => res.redirect(path);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_RE = /^[A-Za-z0-9._-]{3,32}$/;

// ---- helper ----
const getRole = rid => one('SELECT id, name, permissions FROM roles WHERE id = $1', [rid]);
const getAdmin = aid => one(
  `SELECT a.id, a.username, a.disabled, a.role_id, COALESCE(r.permissions, '{}') AS perms
   FROM admins a LEFT JOIN roles r ON r.id = a.role_id WHERE a.id = $1`, [aid]);
const otherEnabledSupers = async excludeId => (await one(
  `SELECT COUNT(*)::int c FROM admins a JOIN roles r ON r.id = a.role_id
   WHERE '*' = ANY(r.permissions) AND NOT a.disabled AND a.id <> $1`, [excludeId])).c;

// Chỉ superadmin được đụng tới tài khoản superadmin.
const touchesSuper = (actor, targetPerms, newPerms = []) =>
  (isSuper(targetPerms) || isSuper(newPerms)) && !isSuper(actor.perms);

const pwOk = pw => typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;

// =============== TÀI KHOẢN ===============
r.use('/accounts', requirePerm('accounts.manage'));

r.get('/accounts', async (req, res) => {
  const [admins, users, roles] = await Promise.all([
    many(`SELECT a.id, a.username, a.disabled, a.created_at, a.last_login_at, a.role_id, r.name AS role, COALESCE(r.permissions, '{}') AS perms
          FROM admins a LEFT JOIN roles r ON r.id = a.role_id ORDER BY a.id`),
    many(`SELECT u.id, u.email, u.disabled, u.created_at, u.last_login_at,
                 (SELECT COUNT(*)::int FROM sites s WHERE s.user_id = u.id) AS sites
          FROM users u ORDER BY u.id DESC LIMIT 500`),
    many('SELECT id, name, permissions FROM roles ORDER BY id'),
  ]);
  // Chỉ liệt kê vai trò mà người thao tác được phép gán
  const assignable = roles.filter(ro => subset(req.admin.perms, ro.permissions));
  res.render('admin/accounts', { admins, users, roles, assignable, tab: 'accounts' });
});

r.post('/accounts/admins', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const pw = String(req.body.password || '');
  const role = await getRole(parseInt(req.body.role_id) || 0);
  if (!USER_RE.test(username)) { setFlash(req, 'error', 'Tên đăng nhập 3-32 ký tự: chữ, số, . _ -'); return back(res); }
  if (!pwOk(pw)) { setFlash(req, 'error', 'Mật khẩu cần từ 10 ký tự'); return back(res); }
  if (!role) { setFlash(req, 'error', 'Vai trò không tồn tại'); return back(res); }
  if (!subset(req.admin.perms, role.permissions)) { setFlash(req, 'error', 'Bạn không thể gán vai trò có quyền cao hơn quyền của mình'); return back(res); }
  if (await one('SELECT 1 AS x FROM admins WHERE lower(username) = lower($1)', [username])) { setFlash(req, 'error', 'Tên đăng nhập đã tồn tại'); return back(res); }
  try {
    await query('INSERT INTO admins (username, password_hash, role_id) VALUES ($1, $2, $3)', [username, bcrypt.hashSync(pw, 10), role.id]);
    setFlash(req, 'ok', `Đã tạo quản trị viên "${username}"`);
  } catch (e) {
    if (e.code === '23505') setFlash(req, 'error', 'Tên đăng nhập đã tồn tại'); else throw e;
  }
  back(res);
});

r.post('/accounts/admins/:id/role', async (req, res) => {
  const t = await getAdmin(id(req));
  const role = await getRole(parseInt(req.body.role_id) || 0);
  if (!t || !role) { setFlash(req, 'error', 'Không tìm thấy tài khoản hoặc vai trò'); return back(res); }
  if (t.id === req.admin.id) { setFlash(req, 'error', 'Không thể tự đổi vai trò của chính mình'); return back(res); }
  if (touchesSuper(req.admin, t.perms, role.permissions)) { setFlash(req, 'error', 'Chỉ superadmin được thao tác với tài khoản/vai trò superadmin'); return back(res); }
  if (!subset(req.admin.perms, role.permissions)) { setFlash(req, 'error', 'Bạn không thể gán vai trò có quyền cao hơn quyền của mình'); return back(res); }
  if (isSuper(t.perms) && !isSuper(role.permissions) && !t.disabled && (await otherEnabledSupers(t.id)) === 0) {
    setFlash(req, 'error', 'Phải còn ít nhất một superadmin đang hoạt động'); return back(res);
  }
  await query('UPDATE admins SET role_id = $1 WHERE id = $2', [role.id, t.id]);
  setFlash(req, 'ok', `Đã đổi vai trò của "${t.username}" thành ${role.name}`);
  back(res);
});

r.post('/accounts/admins/:id/password', async (req, res) => {
  const t = await getAdmin(id(req));
  const pw = String(req.body.password || '');
  if (!t) { setFlash(req, 'error', 'Không tìm thấy tài khoản'); return back(res); }
  if (touchesSuper(req.admin, t.perms)) { setFlash(req, 'error', 'Chỉ superadmin được đổi mật khẩu superadmin'); return back(res); }
  if (!pwOk(pw)) { setFlash(req, 'error', 'Mật khẩu cần từ 10 ký tự'); return back(res); }
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(pw, 10), t.id]);
  setFlash(req, 'ok', `Đã đặt lại mật khẩu cho "${t.username}"`);
  back(res);
});

r.post('/accounts/admins/:id/toggle', async (req, res) => {
  const t = await getAdmin(id(req));
  if (!t) { setFlash(req, 'error', 'Không tìm thấy tài khoản'); return back(res); }
  if (t.id === req.admin.id) { setFlash(req, 'error', 'Không thể tự khóa chính mình'); return back(res); }
  if (touchesSuper(req.admin, t.perms)) { setFlash(req, 'error', 'Chỉ superadmin được thao tác với superadmin'); return back(res); }
  if (!t.disabled && isSuper(t.perms) && (await otherEnabledSupers(t.id)) === 0) {
    setFlash(req, 'error', 'Phải còn ít nhất một superadmin đang hoạt động'); return back(res);
  }
  await query('UPDATE admins SET disabled = NOT disabled WHERE id = $1', [t.id]);
  setFlash(req, 'ok', t.disabled ? `Đã mở khóa "${t.username}"` : `Đã khóa "${t.username}"`);
  back(res);
});

r.post('/accounts/admins/:id/delete', async (req, res) => {
  const t = await getAdmin(id(req));
  if (!t) { setFlash(req, 'error', 'Không tìm thấy tài khoản'); return back(res); }
  if (t.id === req.admin.id) { setFlash(req, 'error', 'Không thể tự xóa chính mình'); return back(res); }
  if (touchesSuper(req.admin, t.perms)) { setFlash(req, 'error', 'Chỉ superadmin được xóa superadmin'); return back(res); }
  if (isSuper(t.perms) && !t.disabled && (await otherEnabledSupers(t.id)) === 0) {
    setFlash(req, 'error', 'Phải còn ít nhất một superadmin đang hoạt động'); return back(res);
  }
  await query('DELETE FROM admins WHERE id = $1', [t.id]);
  setFlash(req, 'ok', `Đã xóa quản trị viên "${t.username}"`);
  back(res);
});

// ---- tài khoản chủ web ----
r.post('/accounts/users', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) { setFlash(req, 'error', 'Email không hợp lệ'); return back(res); }
  if (pw.length < 8 || pw.length > 200) { setFlash(req, 'error', 'Mật khẩu chủ web cần từ 8 ký tự'); return back(res); }
  if (await one('SELECT 1 AS x FROM users WHERE email = $1', [email])) { setFlash(req, 'error', 'Email đã được đăng ký'); return back(res); }
  try {
    await query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, bcrypt.hashSync(pw, 10)]);
    setFlash(req, 'ok', `Đã tạo tài khoản chủ web ${email}`);
  } catch (e) {
    if (e.code === '23505') setFlash(req, 'error', 'Email đã được đăng ký'); else throw e;
  }
  back(res);
});
r.post('/accounts/users/:id/password', async (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 8 || pw.length > 200) { setFlash(req, 'error', 'Mật khẩu chủ web cần từ 8 ký tự'); return back(res); }
  const u = await one('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email', [bcrypt.hashSync(pw, 10), id(req)]);
  setFlash(req, u ? 'ok' : 'error', u ? `Đã đặt lại mật khẩu cho ${u.email}` : 'Không tìm thấy tài khoản');
  back(res);
});
r.post('/accounts/users/:id/toggle', async (req, res) => {
  const u = await one('UPDATE users SET disabled = NOT disabled WHERE id = $1 RETURNING email, disabled', [id(req)]);
  setFlash(req, u ? 'ok' : 'error', u ? (u.disabled ? `Đã khóa ${u.email}` : `Đã mở khóa ${u.email}`) : 'Không tìm thấy tài khoản');
  back(res);
});
r.post('/accounts/users/:id/delete', async (req, res) => {
  const u = await one('DELETE FROM users WHERE id = $1 RETURNING email', [id(req)]);
  setFlash(req, u ? 'ok' : 'error', u ? `Đã xóa ${u.email} (website họ đã xác minh vẫn còn trong chỉ mục; xóa ở Nguồn crawl nếu cần)` : 'Không tìm thấy tài khoản');
  back(res);
});

// =============== VAI TRÒ ===============
r.use('/roles', requirePerm('roles.manage'));

r.get('/roles', async (req, res) => {
  const roles = await many(
    `SELECT r.id, r.name, r.permissions, r.builtin, (SELECT COUNT(*)::int FROM admins a WHERE a.role_id = r.id) AS members
     FROM roles r ORDER BY r.id`);
  res.render('admin/roles', { roles, PERMISSIONS, tab: 'roles', isSuper, subset, actor: req.admin.perms });
});

r.post('/roles', async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  const perms = cleanPerms(req.body.perm);
  const to = '/admin/roles';
  if (!/^[a-z0-9_-]{2,30}$/.test(name)) { setFlash(req, 'error', 'Tên vai trò 2-30 ký tự: a-z, 0-9, _ -'); return back(res, to); }
  if (!perms.length) { setFlash(req, 'error', 'Chọn ít nhất một quyền'); return back(res, to); }
  if (!subset(req.admin.perms, perms)) { setFlash(req, 'error', 'Bạn chỉ được trao quyền mà bạn đang có'); return back(res, to); }
  if (await one('SELECT 1 AS x FROM roles WHERE name = $1', [name])) { setFlash(req, 'error', 'Tên vai trò đã tồn tại'); return back(res, to); }
  try {
    await query('INSERT INTO roles (name, permissions) VALUES ($1, $2::text[])', [name, perms]);
    setFlash(req, 'ok', `Đã tạo vai trò "${name}"`);
  } catch (e) {
    if (e.code === '23505') setFlash(req, 'error', 'Tên vai trò đã tồn tại'); else throw e;
  }
  back(res, to);
});

r.post('/roles/:id', async (req, res) => {
  const to = '/admin/roles';
  const role = await getRole(id(req));
  const perms = cleanPerms(req.body.perm);
  if (!role) { setFlash(req, 'error', 'Không tìm thấy vai trò'); return back(res, to); }
  if (isSuper(role.permissions)) { setFlash(req, 'error', 'Không thể sửa vai trò superadmin'); return back(res, to); }
  if (!perms.length) { setFlash(req, 'error', 'Chọn ít nhất một quyền'); return back(res, to); }
  if (!subset(req.admin.perms, role.permissions) || !subset(req.admin.perms, perms)) {
    setFlash(req, 'error', 'Bạn chỉ được sửa vai trò nằm trong phạm vi quyền của mình'); return back(res, to);
  }
  await query('UPDATE roles SET permissions = $1::text[] WHERE id = $2', [perms, role.id]);
  setFlash(req, 'ok', `Đã cập nhật vai trò "${role.name}" (có hiệu lực ngay)`);
  back(res, to);
});

r.post('/roles/:id/delete', async (req, res) => {
  const to = '/admin/roles';
  const role = await one('SELECT id, name, permissions, builtin FROM roles WHERE id = $1', [id(req)]);
  if (!role) { setFlash(req, 'error', 'Không tìm thấy vai trò'); return back(res, to); }
  if (role.builtin) { setFlash(req, 'error', 'Không thể xóa vai trò mặc định'); return back(res, to); }
  if (!subset(req.admin.perms, role.permissions)) { setFlash(req, 'error', 'Vai trò này vượt quá phạm vi quyền của bạn'); return back(res, to); }
  const used = (await one('SELECT COUNT(*)::int c FROM admins WHERE role_id = $1', [role.id])).c;
  if (used) { setFlash(req, 'error', `Còn ${used} tài khoản đang dùng vai trò này`); return back(res, to); }
  await query('DELETE FROM roles WHERE id = $1', [role.id]);
  setFlash(req, 'ok', `Đã xóa vai trò "${role.name}"`);
  back(res, to);
});

export default r;
