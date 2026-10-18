# Setup and Operations Guide

[![Node.js 20.11+](https://img.shields.io/badge/Node.js-20.11%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/) [![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)

[Vietnamese guide](HELP.md) | [English README](README-en.md)

This guide covers local setup, configuration, administration, deployment, and troubleshooting. Skip sections for services you do not use.

## Contents

1. [Architecture and prerequisites](#1-architecture-and-prerequisites)
2. [Run locally](#2-run-locally)
3. [Environment configuration](#3-environment-configuration)
4. [PostgreSQL](#4-postgresql)
5. [Search backend](#5-search-backend)
6. [Cloudflare Turnstile](#6-cloudflare-turnstile)
7. [Admin accounts and roles](#7-admin-accounts-and-roles)
8. [Crawling and keywords](#8-crawling-and-keywords)
9. [Site submissions and site-owner accounts](#9-site-submissions-and-site-owner-accounts)
10. [Appearance and languages](#10-appearance-and-languages)
11. [SEO](#11-seo)
12. [Production deployment](#12-production-deployment)
13. [Post-deployment checks](#13-post-deployment-checks)
14. [Backups and maintenance](#14-backups-and-maintenance)
15. [Security checklist](#15-security-checklist)
16. [Known limitations](#16-known-limitations)
17. [Troubleshooting](#17-troubleshooting)
18. [Routes and database tables](#18-routes-and-database-tables)

## 1. Architecture and prerequisites

```text
Browser -> HTTPS reverse proxy -> Node.js app
                                ├── PostgreSQL: accounts, settings, crawl sources, analytics
                                ├── Search backend: crawled documents and search
                                ├── Cloudflare Turnstile (optional)
                                └── Crawler -> websites to index
```

PostgreSQL stores system data. The search index can be rebuilt by crawling again; back up PostgreSQL. The app requires Node.js **20.11 or later**. Docker Compose is recommended for local PostgreSQL and Meilisearch.

## 2. Run locally

From the project directory:

```bash
docker compose up -d
npm ci
cp .env.example .env
```

Set a long random `SESSION_SECRET` in `.env` (for example, generate one with `openssl rand -hex 32`) and run:

```bash
npm start
```

On first startup, the log prints a one-time `/admin/setup?token=...` URL. Open it to create the first superadmin. Alternatively, run `npm run admin:create`; this command also resets an existing admin password.

Visit `http://localhost:3000/admin`, add a site under **Crawl sources**, and start a crawl. `ALLOW_PRIVATE_FETCH=true` can be used for local-only crawler testing; never enable it in production.

## 3. Environment configuration

See [`.env.example`](.env.example) for all variables. Common settings:

| Variable | Purpose |
|---|---|
| `PORT` | App port (default `3000`) |
| `BASE_URL` | Public production URL used by canonical links and sitemap |
| `SESSION_SECRET` | Secret used to sign sessions and click links; use a long random value |
| `TRUST_PROXY` | Number of trusted proxy hops: `0` direct, `1` one proxy, `2` Cloudflare plus Nginx |
| `DATABASE_URL` | PostgreSQL connection URL |
| `PG_CA_PATH`, `PG_POOL_MAX` | PostgreSQL CA certificate and maximum pool size |
| `SEARCH_PROVIDER` | `meilisearch`, `opensearch`, `elasticsearch`, `typesense`, or `postgres` |
| `MEILI_*`, `OPENSEARCH_*`, `ELASTICSEARCH_*`, `TYPESENSE_*` | Credentials and settings for the selected backend |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Set both to enable Turnstile |
| `BOT_UA`, `CRAWL_DELAY_MS` | Crawler user agent and request delay |
| `VERIFIED_MAX_PAGES` | Maximum pages for a verified site (default 200) |
| `AUTO_KEYWORDS`, `KEYWORD_MIN_COUNT` | Public keyword suggestion behavior |
| `SUBMIT_LIMIT` | Site submission rate per IP |
| `ALLOW_PRIVATE_FETCH` | Development-only private-network crawling exception |

Restart the app after changing environment variables. Do not commit `.env`, credentials, or CA certificates.

## 4. PostgreSQL

The default `docker-compose.yml` provides local PostgreSQL. For a managed service such as Aiven:

1. Create a PostgreSQL service and allow the app server's IP if IP filtering is enabled.
2. Copy its connection URL into `DATABASE_URL`.
3. Download its CA certificate, save it as `ca.pem`, and set `PG_CA_PATH=./ca.pem`.
4. Set `PG_POOL_MAX=5` if the service has a low connection limit.
5. Start the app; required tables are created automatically.

Without `PG_CA_PATH`, TLS may be encrypted without certificate verification. Configure the CA in production.

## 5. Search backend

Choose one backend with `SEARCH_PROVIDER`, set its connection variables, and restart. PostgreSQL full-text search reuses `DATABASE_URL`; other backends require their own service. Use Admin → **Engine** to diagnose connectivity and write permissions, or run `npm run engine:setup`.

For OpenSearch, give the application a dedicated least-privilege account with access to the configured index (default `pages`). `npm run engine:setup -- --create-user` can create an index, role, and user where the service permits Security API calls. If a managed provider blocks those calls, create the role and user in its dashboard. Do not use an engine administrator account for the app.

When index writes fail repeatedly, crawling stops early rather than continuing to fail. Check Admin → **Engine** and the application logs. Changing `SEARCH_PROVIDER` does not migrate existing documents; crawl the sites again.

## 6. Cloudflare Turnstile

Turnstile optionally protects site submissions, site-owner authentication, admin login, and initial admin setup. Create a widget in the Cloudflare dashboard, add the production hostname, then set both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Keep the secret key server-side.

Cloudflare test keys are documented in the Turnstile documentation and can be used locally. If only one key is configured, verification is disabled. If the verification service is unavailable, protected requests are rejected.

## 7. Admin accounts and roles

Create the first superadmin using the one-time setup URL in the server log or `npm run admin:create`. Admin passwords are not configured through `.env`. Admin login is at `/admin`.

Built-in roles include:

| Role | Access |
|---|---|
| `superadmin` | All permissions; protected from modification |
| `admin` | Most admin features, excluding sensitive account/role operations |
| `editor` | Dashboard, crawl sources, keywords, submissions, and sites |
| `viewer` | Read-only dashboard |

Use Admin → **Roles** to create roles and grant permissions. Admin → **Accounts** manages admin and site-owner accounts. Grant only the permissions each user needs. There is no email-based password reset or two-factor authentication; an admin must reset passwords manually.

## 8. Crawling and keywords

Add a source under Admin → **Crawl sources**, set its page limit, and start crawling. The crawler:

- Follows links on the same domain and respects `robots.txt`, `Crawl-delay`, `noindex`, and `nofollow`.
- Reads sitemap URLs advertised by `robots.txt` and site metadata.
- Records crawl errors for site owners to review.
- Does not execute JavaScript; JavaScript-rendered pages may have little or no indexed content.

Removing a crawl source also removes that domain's indexed pages. Use Admin → **Index** to inspect or remove individual indexed records. Admin → **Keywords** can pin public suggestions or block terms. Automatically collected suggestions require sufficient search counts, controlled by `KEYWORD_MIN_COUNT`.

## 9. Site submissions and site-owner accounts

`/submit` lets visitors request that a site be indexed. Requests are protected by rate limiting, honeypot/time checks, and Turnstile when configured. Admins review requests under **Submissions**.

Site owners register under `/account`, add a site, and verify ownership using the available meta tag, file, or DNS TXT methods. Verified owners can view indexed pages, impressions, clicks, CTR, query terms, and crawl errors; request a recrawl (limited to once every six hours); declare a sitemap; or remove their site from the index. Impression/click data is retained for 90 days.

## 10. Appearance and languages

Admin → **Appearance** configures public pages: logo, favicon, theme colors, light/dark mode, background, and default language. Image assets are stored in PostgreSQL. Public pages and admin support Vietnamese and English; the admin language is remembered separately from visitor language. Admins also get a per-browser theme customizer with system/light/dark mode, preset palettes, and a custom accent color. These admin preferences do not change the public site's theme. Site name and descriptions are configured separately under **SEO**.

The appearance page also supports an optional custom footer credit. “Design by minhduc290613” and its GitHub link are fixed attribution and are not editable in admin.

## 11. SEO

Admin → **SEO** configures the site name, description, title template, and Open Graph image. The app provides `/sitemap.xml`, `/robots.txt`, canonical links, Open Graph tags, and JSON-LD `WebSite`/`SearchAction`.

Search pages with no results and pages after the first are marked `noindex`. The sitemap includes queries that have results and are popular or pinned. Submit the sitemap in Google Search Console after verifying the site; rankings are not guaranteed.

## 12. Production deployment

For a traditional server deployment, use a Linux server with a domain pointing to it. Configure PostgreSQL, a search backend, HTTPS, and a strong session secret. Minimum environment:

```env
NODE_ENV=production
BASE_URL=https://search.example.com
SESSION_SECRET=<long-random-secret>
TRUST_PROXY=1
DATABASE_URL=<postgres-url>
PG_CA_PATH=./ca.pem
SEARCH_PROVIDER=meilisearch
TURNSTILE_SITE_KEY=<site-key>
TURNSTILE_SECRET_KEY=<secret-key>
```

### Netlify Functions

The project includes `netlify.toml` and an adapter at `netlify/functions/api.mjs`. Connect the source to a Netlify site. If the repository contains the parent directory, set the Netlify **Base directory** to `search-engine`; otherwise use the repository root. Netlify installs dependencies from `package-lock.json` and uses Node.js 22. Do not set the build command to `npm start`: Netlify invokes the app as a Function rather than running a persistent server process.

In **Site configuration → Environment variables**, configure at least the variables described in section 4: `NODE_ENV=production`, `BASE_URL` (the HTTPS Netlify or custom domain), `SESSION_SECRET`, `DATABASE_URL`, `SEARCH_PROVIDER`, and the corresponding search-backend variables. Add the Turnstile keys if enabled. Do not point `PG_CA_PATH` to a file on your local machine; package a custom CA file with the project and set its correct relative path if required. Redeploy after changing environment variables.

If secret scanning reports false positives for `BASE_URL`, `SEARCH_PROVIDER`, or `PORT`, add `SECRETS_SCAN_OMIT_KEYS` with the value `BASE_URL,SEARCH_PROVIDER,PORT` under **Site configuration → Environment variables**, then redeploy. These are public configuration values, not credentials; do not omit `DATABASE_URL`, `SESSION_SECRET`, API keys, or passwords, and do not disable secret scanning entirely.

Important serverless limitations:
- Netlify Functions are not persistent servers. Background crawl work may be stopped when a Function returns; use a separate VPS/worker for reliable or long-running crawling.
- Functions have execution and request/response size limits. Large uploads or long crawls may time out. Appearance assets and sessions are stored in PostgreSQL, not on temporary disk.
- Database and search-backend initialization happens on cold starts. Use services reachable from Netlify and limit database connections with `PG_POOL_MAX` (for example, `5`).
- The first-admin setup link is written to Function logs on startup. It may change after a cold start before an admin exists, so complete setup immediately after deployment.

After deployment, check `/`, `/admin/login`, `/sitemap.xml`, and `/robots.txt`. If you need a continuously available crawler, deploy the app on a VPS/Docker using the options below.

Install production dependencies with `npm ci --omit=dev`. Run with a process manager, for example:

```bash
npm i -g pm2
pm2 start src/server.js --name search --node-args="--env-file=.env"
pm2 save
```

Or use Docker Compose:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Place Nginx (or another trusted reverse proxy) in front of the app and configure TLS. Set `TRUST_PROXY` to the exact number of proxy hops and forward the original host, client IP, and protocol. In production, HTTPS is required for secure login cookies. Cloudflare's proxy is not required just to use Turnstile.

## 13. Post-deployment checks

- Confirm the startup log has no database or search-backend errors.
- Open the HTTPS homepage and `/admin/login`.
- In Admin → **Engine**, verify the connection and run the write/delete test.
- Crawl a site and confirm results appear in search.
- Check `/submit` validation and Turnstile if configured.
- Check `/sitemap.xml` and `/robots.txt` for the correct production domain.
- Test keyword suggestions, Vietnamese accent-insensitive search, and site-owner verification.

Managed services and production configurations should be tested in the actual target environment; local service simulations cannot guarantee provider compatibility.

## 14. Backups and maintenance

- Back up PostgreSQL regularly, for example `pg_dump "$DATABASE_URL" > backup.sql`. Search indexes can be rebuilt by crawling.
- View logs with `pm2 logs search` or `docker compose -f docker-compose.prod.yml logs -f`.
- Deploy updates with `npm ci --omit=dev` and restart the process. Schema updates run at startup.
- Impression/click events are purged after 90 days. Search query logs are not automatically purged.
- Crawling is manual or owner-requested; there is no built-in recurring crawl scheduler.

## 15. Security checklist

- [ ] Use a unique, random `SESSION_SECRET`.
- [ ] Use individual admin accounts and least-privilege roles.
- [ ] Use a least-privilege search-engine account.
- [ ] Set `NODE_ENV=production` and serve traffic over HTTPS.
- [ ] Configure Turnstile for production forms.
- [ ] Set `TRUST_PROXY` correctly.
- [ ] Do not enable `ALLOW_PRIVATE_FETCH` in production.
- [ ] Configure `PG_CA_PATH` for managed PostgreSQL.
- [ ] Do not expose search-backend ports or credentials publicly.
- [ ] Keep `.env` and `ca.pem` out of public repositories and archives.
- [ ] Limit database network access where possible.
- [ ] Grant appearance permissions only to trusted admins; those users can upload public assets.

## 16. Known limitations

- English translation is available for public pages and admin. User-submitted or crawled content is not machine-translated.
- Crawler does not run JavaScript.
- Crawler and in-memory rate limits run within the web process; multi-instance deployments need additional coordination.
- No SMTP/email delivery or two-factor authentication is currently implemented.
- Search relevance is determined by the configured backend; there is no PageRank.
- Changing search backends requires re-crawling.
- Test coverage includes simulated services; verify managed PostgreSQL, OpenSearch, Turnstile, and production deployment settings directly.

## 17. Troubleshooting

| Symptom | Likely cause and action |
|---|---|
| `Missing DATABASE_URL` | Create `.env` from `.env.example` and run from the project directory. |
| PostgreSQL `ECONNREFUSED` | Start local services with `docker compose up -d`. |
| Managed DB certificate error | Download the provider CA and set `PG_CA_PATH`. |
| Too many DB connections | Reduce `PG_POOL_MAX`, e.g. to `5`, and avoid unnecessary app instances. |
| OpenSearch `security_exception` on writes | Grant write permissions on the configured index; check Admin → Engine. |
| Search backend unavailable | Check `SEARCH_PROVIDER`, credentials, network access, and app logs. |
| `SEARCH_PROVIDER` invalid | Use `meilisearch`, `opensearch`, `elasticsearch`, `typesense`, or `postgres`. |
| Forgot admin password | Run `npm run admin:create` and reset the existing account. |
| Setup URL expired | Use the latest URL in server logs or `npm run admin:create`. |
| Admin returns 403 | Ask a superadmin to grant the required role permission. |
| Turnstile missing | Check both keys and the widget's allowed hostnames. |
| Turnstile rejects valid challenge | Check the secret key, outbound connectivity, server clock, and Turnstile error logs. |
| No suggestions | Crawl pages or pin keywords; automatic suggestions need enough searches. |
| Accent-insensitive search fails on old OpenSearch index | Recreate the index and crawl again after backing up any needed data. |
| Login redirects to login in production | Serve HTTPS and verify proxy protocol headers and `TRUST_PROXY`. |
| Crawler indexes zero pages | Check crawl errors, `robots.txt`, JavaScript-only rendering, HTTP status, and `noindex`. |
| Localhost crawl is blocked | Expected SSRF protection; only for local development, enable `ALLOW_PRIVATE_FETCH=true`. |
| CSRF token error | Reload the page and submit again; check browser cookie settings. |

Start with the application logs and Admin → **Engine** diagnostics. Do not expose credentials when sharing logs.

## 18. Routes and database tables

| Route | Purpose |
|---|---|
| `/`, `/search?q=` | Home and search results |
| `/lucky?q=` | Open the first result, if available |
| `/suggest?q=` | Search suggestions |
| `/go` | Signed outbound click tracking |
| `/submit` | Public site submission |
| `/account/*` | Site-owner registration and dashboard |
| `/admin/*` | Permission-controlled admin tools |
| `/brand/logo`, `/brand/favicon`, `/brand/background` | Uploaded public assets |
| `/lang/vi`, `/lang/en` | Change public language |
| `/admin/setup?token=` | One-time first-admin setup |
| `/sitemap.xml`, `/robots.txt` | Search-engine discovery |

Tables are created automatically. Main tables include `admins`, `roles`, `users`, `sites`, `sources`, `submissions`, `queries`, `events`, `crawl_errors`, `keywords`, `assets`, `settings`, and session storage.
