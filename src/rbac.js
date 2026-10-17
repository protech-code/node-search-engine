import { one } from './db.js';
import { has } from './permissions.js';

// Tải admin + vai trò MỖI request: khóa tài khoản / đổi vai trò có hiệu lực ngay.
export async function loadAdmin(req, res, next) {
  const id = req.session.admin;
  if (!id) return res.redirect('/admin/login');
  const a = await one(
    `SELECT a.id, a.username, a.disabled, r.name AS role, r.permissions AS perms
     FROM admins a LEFT JOIN roles r ON r.id = a.role_id WHERE a.id = $1`, [id]);
  if (!a || a.disabled) return req.session.destroy(() => res.redirect('/admin/login'));
  const perms = a.perms || [];
  req.admin = { id: a.id, username: a.username, role: a.role, perms };
  res.locals.admin = req.admin;
  res.locals.can = p => has(perms, p);
  next();
}

export const requirePerm = p => (req, res, next) =>
  has(req.admin.perms, p) ? next() : res.status(403).render('admin/forbidden', { tab: '', need: p });
