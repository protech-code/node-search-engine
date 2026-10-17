import { Router } from 'express';
import { sitemapKeywords } from '../keywords.js';

const r = Router();
const base = () => (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const x = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

r.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /go\nDisallow: /lang\nDisallow: /suggest\n\nSitemap: ${base()}/sitemap.xml\n`);
});

r.get('/sitemap.xml', async (req, res) => {
  const rows = await sitemapKeywords(1000);
  const urls = [`<url><loc>${base()}/</loc><priority>1.0</priority></url>`,
    ...rows.map(row => `<url><loc>${x(`${base()}/search?q=${encodeURIComponent(row.q)}`)}</loc><lastmod>${row.lastmod}</lastmod></url>`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});

export default r;
