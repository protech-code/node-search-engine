# Node Search Engine

[![Node.js 20.11+](https://img.shields.io/badge/Node.js-20.11%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

**Language:** [Tiếng Việt](README.md) | English  
**Full guides:** [Vietnamese help](HELP.md) | [English help](HELP-en.md)

A self-hosted search engine built with Node.js. It includes a web crawler, public search pages, an admin dashboard, site submissions, and verified site-owner accounts.

## Features

- Server-rendered search results with pagination, highlighting, suggestions, and accent-insensitive Vietnamese search.
- A crawler that respects `robots.txt`, sitemaps, `noindex`, `nofollow`, and `Crawl-delay`.
- Five search backends: Meilisearch, OpenSearch, Elasticsearch, Typesense, and PostgreSQL full-text search.
- Admin tools for crawl sources, the search index, keywords, submitted sites, accounts, roles, SEO, and appearance.
- Site-owner verification and dashboards for indexed pages, impressions, clicks, CTR, and crawl errors.
- SSRF and CSRF protections, rate limiting, bcrypt password hashes, PostgreSQL sessions, CSP, and optional Cloudflare Turnstile.
- Vietnamese/English interfaces for public pages and admin. Admins get a separate system/light/dark theme, preset palettes, and a custom accent color. Public logo, theme, background, and footer credit remain configurable under Admin → Appearance. The “Design by minhduc290613” attribution remains fixed.

## Quick start

Requirements: Node.js >= 20.11 and Docker Compose.

```bash
docker compose up -d
npm ci
cp .env.example .env
```

Set a random `SESSION_SECRET` in `.env`, then start the app:

```bash
npm start
```

If no admin account exists, open the one-time setup URL printed in the startup log, or run `npm run admin:create`.

- Home: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Add a crawl source under Admin → **Crawl sources**, then start crawling and search.

See [HELP-en.md](HELP-en.md) for database/search-engine setup, deployment, security, and troubleshooting. Environment variables are documented in [`.env.example`](.env.example).

## Project structure

```text
.
├── src/                         Node.js application source
│   ├── server.js                Express setup, middleware, and routers
│   ├── db.js                    PostgreSQL schema and settings
│   ├── routes/                  Public, admin, SEO, submit, and account routes
│   ├── search/                  Adapters for the five search backends
│   ├── i18n/                    Vietnamese and English UI strings
│   ├── crawler.js               Website and sitemap crawler
│   ├── security.js, ssrf.js     Request security, CSRF, and SSRF protections
│   ├── permissions.js, rbac.js  Admin roles and authorization
│   └── sites.js, events.js      Site verification and search analytics
├── views/                       EJS templates
│   ├── admin/                   Admin pages
│   ├── account/                 Site-owner account pages
│   └── partials/                Shared UI components
├── public/                      CSS, JavaScript, and static assets
├── scripts/                     Admin creation and search-engine setup tools
├── README.md                    Vietnamese project overview
├── README-en.md                 English project overview
├── HELP.md                      Vietnamese user and operations guide
└── HELP-en.md                   English setup and operations guide
```

## Testing and known limitations

Some workflows have been tested against simulated database/search services; PostgreSQL full-text search has also been tested with a compatible PostgreSQL instance. Managed services and production configurations should be verified in the target environment. The crawler does not execute JavaScript, and the application does not currently send email or support 2FA. See [HELP-en.md](HELP-en.md) for details.

## Main routes

`/` · `/search?q=` · `/suggest?q=` · `/submit` · `/account/*` · `/admin/*` · `/sitemap.xml` · `/robots.txt`

## Sponsor me
[![Sponsor here](https://img.shields.io/badge/sponsor-here-ff69b4?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://donate.protechvn.io.vn)

## LICENSE
Under MIT License on [LICENSE](LICENSE)