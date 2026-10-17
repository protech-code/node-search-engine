// Mọi request ra ngoài (crawler, xác minh site, sitemap) đều đi qua file này.
// Chặn SSRF: không cho truy cập mạng nội bộ / metadata cloud, kiểm tra ở cả mỗi lần redirect
// và ngay lúc kết nối (chống DNS rebinding).
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { Agent, request } from 'undici';
import { translator } from './i18n/index.js';
const viT = translator('vi');

// CHỈ bật khi dev local (vd crawl localhost). Không bật trên production.
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_FETCH === 'true';

export class UserError extends Error {
  // key: khóa trong từ điển i18n (route dịch theo ngôn ngữ người dùng); message = tiếng Việt để ghi log.
  constructor(key, vars) { super(viT(key, vars)); this.key = key; this.vars = vars; }
}

const bl = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) bl.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) bl.addSubnet(a, p, 'ipv6');

export function isPrivateIp(ip) {
  const fam = net.isIP(ip);
  if (!fam) return true;
  if (fam === 6) {
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return bl.check(m[1], 'ipv4');
  }
  return bl.check(ip, fam === 4 ? 'ipv4' : 'ipv6');
}

function guardedLookup(hostname, options, cb) {
  const o = typeof options === 'object' && options ? options : { family: options };
  dns.lookup(hostname, { ...o, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = ALLOW_PRIVATE ? addrs : addrs.filter(a => !isPrivateIp(a.address));
    if (!list.length) return cb(new Error('Địa chỉ bị chặn (mạng nội bộ)'));
    if (o.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({ connect: { lookup: guardedLookup, timeout: 10_000 } });
const bareHost = u => u.hostname.replace(/^\[|\]$/g, '');

function parseHttp(url) {
  let u;
  try { u = new URL(url); } catch { throw new UserError('err.url_invalid'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UserError('err.url_scheme');
  const h = bareHost(u);
  // IP literal không đi qua lookup nên phải chặn ở đây
  if (!ALLOW_PRIVATE && net.isIP(h) && isPrivateIp(h)) throw new UserError('err.url_private');
  return u;
}

// Kiểm tra trước khi nhận URL từ người dùng (trả lỗi thân thiện).
export async function assertPublicUrl(input, { strictPorts = false } = {}) {
  const u = parseHttp(input);
  if (u.username || u.password) throw new UserError('err.url_credentials');
  if (strictPorts && !ALLOW_PRIVATE && u.port && !['80', '443'].includes(u.port)) throw new UserError('err.url_port');
  if (ALLOW_PRIVATE) return u.href;
  const h = bareHost(u);
  if (net.isIP(h)) return u.href;
  if (!h.includes('.') || h.length > 253) throw new UserError('err.host_invalid');
  let addrs;
  try { addrs = await dns.promises.lookup(h, { all: true }); } catch { throw new UserError('err.host_notfound'); }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new UserError('err.host_internal');
  return u.href;
}

async function readBody(body, headers, maxBytes) {
  let stream = body;
  const enc = String(headers['content-encoding'] || '').toLowerCase();
  if (enc.includes('br')) stream = zlib.createBrotliDecompress();
  else if (enc.includes('gzip') || enc.includes('deflate')) stream = zlib.createUnzip();
  if (stream !== body) { body.on('error', e => stream.destroy(e)); body.pipe(stream); }
  const chunks = [];
  let n = 0;
  try {
    for await (const c of stream) {
      n += c.length;
      if (n > maxBytes) break;
      chunks.push(c);
    }
  } catch { /* nội dung bị cắt/lỗi giải nén: dùng phần đã đọc */ }
  if (stream !== body) {
    body.unpipe(stream);
    stream.destroy();
    await body.dump({ limit: 0 });
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchText(input, { headers = {}, maxBytes = 2_000_000, timeout = 15_000, maxRedirects = 5 } = {}) {
  let url = input;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = parseHttp(url);
    const res = await request(u.href, {
      method: 'GET', dispatcher: agent,
      headers: { 'accept-encoding': 'gzip, deflate, br', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...headers },
      headersTimeout: timeout, bodyTimeout: timeout, signal: AbortSignal.timeout(timeout * 2),
    });
    const loc = res.headers.location;
    if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
      await res.body.dump({ limit: 0 });
      url = new URL(loc, u).href;
      continue;
    }
    const text = await readBody(res.body, res.headers, maxBytes);
    return { status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: res.headers, url: u.href, text };
  }
  throw new Error('Quá nhiều lần chuyển hướng');
}
