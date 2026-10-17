// Cloudflare Turnstile: bật khi có đủ TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY.
const SITE = process.env.TURNSTILE_SITE_KEY || '';
const SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const VERIFY_URL = process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileEnabled = Boolean(SITE && SECRET);
export const turnstileSiteKey = turnstileEnabled ? SITE : '';
export const CAPTCHA_ERROR = 'Vui lòng xác nhận bạn không phải robot rồi thử lại.';

if (!turnstileEnabled) console.warn('[turnstile] Chưa cấu hình TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY: captcha đang TẮT.');

// Trả true nếu captcha tắt hoặc token hợp lệ. Lỗi mạng => false (fail closed).
export async function turnstileOk(req) {
  if (!turnstileEnabled) return true;
  const token = String(req.body?.['cf-turnstile-response'] || '');
  if (!token || token.length > 2048) return false;
  try {
    const r = await fetch(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: SECRET, response: token, remoteip: req.ip || '' }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    if (!j.success) console.warn('[turnstile] từ chối:', (j['error-codes'] || []).join(','));
    return j.success === true;
  } catch (e) {
    console.error('[turnstile] lỗi xác minh:', e.message);
    return false;
  }
}
