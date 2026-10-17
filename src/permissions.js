// Danh mục quyền (permission) và vai trò mặc định.
export const PERMISSIONS = {
  'dashboard.view': 'Xem tổng quan',
  'sources.manage': 'Quản lý nguồn crawl',
  'index.manage': 'Quản lý chỉ mục (xóa trang)',
  'keywords.manage': 'Quản lý từ khóa',
  'submissions.manage': 'Duyệt website được gửi',
  'sites.manage': 'Quản lý chủ web (thu hồi sở hữu)',
  'seo.manage': 'Cấu hình SEO',
  'appearance.manage': 'Giao diện (logo, theme, nền, ngôn ngữ)',
  'appearance.manage': 'Giao diện (logo, theme, nền, ngôn ngữ)',
  'engine.view': 'Xem trạng thái search engine',
  'engine.manage': 'Chạy kiểm tra ghi thử engine',
  'accounts.manage': 'Quản lý tài khoản (admin + chủ web)',
  'roles.manage': 'Quản lý vai trò',
};

const ALL = Object.keys(PERMISSIONS);
export const DEFAULT_ROLES = [
  { name: 'superadmin', permissions: ['*'] },
  { name: 'admin', permissions: ALL.filter(p => !['accounts.manage', 'roles.manage', 'engine.manage'].includes(p)) },
  { name: 'editor', permissions: ['dashboard.view', 'keywords.manage', 'submissions.manage', 'sources.manage', 'sites.manage'] },
  { name: 'viewer', permissions: ['dashboard.view'] },
];

export const has = (perms, p) => perms.includes('*') || perms.includes(p);
export const isSuper = perms => perms.includes('*');
// Người thao tác chỉ được trao quyền mà chính họ đang có (chống leo thang đặc quyền).
export const subset = (actor, wanted) => isSuper(actor) || wanted.every(p => actor.includes(p));
// '*' chỉ do hệ thống đặt, không nhận từ form.
export const cleanPerms = arr => [...new Set([].concat(arr || []))].filter(p => Object.hasOwn(PERMISSIONS, p));
