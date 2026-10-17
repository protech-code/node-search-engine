import crypto from 'node:crypto';

const secret = () => process.env.SESSION_SECRET || 'change-me';
export const sign = v => crypto.createHmac('sha256', secret()).update(String(v)).digest('hex').slice(0, 32);
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// CSRF theo session: tạo token cho view và kiểm tra mọi POST.
export function csrf(req, res, next) {
  req.session.csrf ||= crypto.randomBytes(16).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (req.method === 'POST') {
    if (req.is('multipart/form-data')) {
      // Body chưa được parse ở đây: chỉ cho phép đúng route upload, và BẮT BUỘC kiểm tra sau bằng csrfAfterBody.
      if (!req.originalUrl.startsWith('/admin/appearance/upload/')) return res.status(400).send('multipart không được hỗ trợ');
      return next();
    }
    if (!safeEqual(req.body?._csrf ?? '', req.session.csrf)) return res.status(403).send('CSRF token không hợp lệ');
  }
  next();
}

export function csrfAfterBody(req, res, next) {
  if (!safeEqual(req.body?._csrf ?? '', req.session.csrf ?? '')) return res.status(403).send('CSRF token không hợp lệ');
  next();
}

export const noindex = title => (req, res, next) => { res.locals.meta = { noindex: true, title }; next(); };
