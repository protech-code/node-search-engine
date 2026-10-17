// Admin → Giao diện: logo, favicon, theme, nền, ngôn ngữ.
import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { query, getSettings, saveSettings } from '../db.js';
import { requirePerm } from '../rbac.js';
import { setFlash } from '../flash.js';
import { csrfAfterBody } from '../security.js';
import { sniffImage } from '../images.js';
import { THEMES, GRADIENTS } from '../ui.js';

const r = Router();
const HEX = /^#[0-9a-fA-F]{6}$/;
const LIMITS = { logo: 512 * 1024, favicon: 256 * 1024, background: 2 * 1024 * 1024 };
const SETTING_KEY = { logo: 'logoV', favicon: 'faviconV', background: 'bgV' };
const back = res => res.redirect('/admin/appearance');
const num = (v, lo, hi, d) => { const n = parseInt(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);

r.use('/appearance', requirePerm('appearance.manage'));

r.get('/appearance', async (req, res) => {
  res.render('admin/appearance', { s: await getSettings(), THEMES, GRADIENTS, tab: 'appearance' });
});

r.post('/appearance', async (req, res) => {
  const b = req.body, cur = await getSettings();
  const preset = pick(b.themePreset, [...Object.keys(THEMES), 'custom'], 'blue');
  if (preset === 'custom' && !HEX.test(String(b.themeColor || ''))) { setFlash(req, 'error', 'Màu tùy chỉnh phải dạng #RRGGBB'); return back(res); }
  const bgMode = pick(b.bgMode, ['none', 'gradient', 'image'], 'none');
  if (bgMode === 'image' && !cur.bgV) { setFlash(req, 'error', 'Hãy tải ảnh nền lên trước khi chọn chế độ "Ảnh"'); return back(res); }
  await saveSettings({
    themePreset: preset,
    themeColor: preset === 'custom' ? b.themeColor : cur.themeColor,
    themeMode: pick(b.themeMode, ['auto', 'light', 'dark'], 'auto'),
    themeToggle: b.themeToggle ? '1' : '',
    logoShowName: b.logoShowName ? '1' : '',
    logoHeight: String(num(b.logoHeight, 20, 120, 40)),
    bgMode, bgGradient: pick(b.bgGradient, GRADIENTS, 'aurora'),
    bgOverlay: String(num(b.bgOverlay, 0, 80, 35)),
    defaultLang: pick(b.defaultLang, ['vi', 'en', 'auto'], 'vi'),
    langSwitch: b.langSwitch ? '1' : '',
    siteDescriptionEn: String(b.siteDescriptionEn || '').slice(0, 300),
    siteCredit: String(b.siteCredit || '').trim().slice(0, 200),
  });
  setFlash(req, 'ok', 'Đã lưu giao diện');
  back(res);
});

// ---- upload (multipart): multer đọc body rồi mới kiểm tra CSRF ----
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.background, files: 1, fields: 4, parts: 6 } });
const parse = (req, res, next) => up.single('file')(req, res, err => {
  if (err) { setFlash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'File quá lớn' : 'Không đọc được file tải lên'); return back(res); }
  next();
});

r.post('/appearance/upload/:name', parse, csrfAfterBody, async (req, res) => {
  const name = req.params.name;
  if (!Object.hasOwn(LIMITS, name)) return res.status(404).end();
  const f = req.file;
  if (!f) { setFlash(req, 'error', 'Chưa chọn file'); return back(res); }
  if (f.size > LIMITS[name]) { setFlash(req, 'error', `File quá lớn (tối đa ${Math.round(LIMITS[name] / 1024)} KB)`); return back(res); }
  const mime = sniffImage(f.buffer, { svg: name !== 'background', ico: name === 'favicon' });
  if (!mime) { setFlash(req, 'error', 'Định dạng không hỗ trợ (PNG, JPG, WebP, GIF' + (name === 'background' ? '' : ', SVG') + (name === 'favicon' ? ', ICO' : '') + ')'); return back(res); }
  const etag = '"' + crypto.createHash('sha1').update(f.buffer).digest('hex').slice(0, 20) + '"';
  await query(
    `INSERT INTO assets (name, mime, data, etag) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, etag = EXCLUDED.etag, updated_at = now()`,
    [name, mime, f.buffer, etag]);
  const upd = { [SETTING_KEY[name]]: String(Date.now()) };
  if (name === 'background') upd.bgMode = 'image';
  await saveSettings(upd);
  setFlash(req, 'ok', 'Đã tải lên ' + { logo: 'logo', favicon: 'favicon', background: 'ảnh nền' }[name]);
  back(res);
});

r.post('/appearance/remove/:name', async (req, res) => {
  const name = req.params.name;
  if (!Object.hasOwn(LIMITS, name)) return res.status(404).end();
  await query('DELETE FROM assets WHERE name = $1', [name]);
  const upd = { [SETTING_KEY[name]]: '' };
  if (name === 'background' && (await getSettings()).bgMode === 'image') upd.bgMode = 'none';
  await saveSettings(upd);
  setFlash(req, 'ok', 'Đã xóa');
  back(res);
});

export default r;
