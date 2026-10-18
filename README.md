# Node Search Engine

[![Node.js 20.11+](https://img.shields.io/badge/Node.js-20.11%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

**Ngôn ngữ:** Tiếng Việt | [English](README-en.md)  
**Hướng dẫn đầy đủ:** [HELP.md](HELP.md) | [English help](HELP-en.md)

Công cụ tìm kiếm tự host bằng Node.js, gồm crawler, trang tìm kiếm, quản trị, gửi website và tài khoản chủ web.

## Tính năng

- Tìm kiếm SSR, phân trang, highlight, autocomplete, tìm kiếm bằng giọng nói (trình duyệt hỗ trợ), lịch sử cục bộ và nút “Xem trang đầu tiên tìm được”.
- Phím tắt `/` hoặc `Ctrl+K` để focus ô tìm kiếm; lịch sử chỉ lưu trên thiết bị và có thể xóa bất cứ lúc nào.
- Crawler tôn trọng `robots.txt`, sitemap, `noindex`, `nofollow` và `Crawl-delay`.
- Năm search backend: Meilisearch, OpenSearch, Elasticsearch, Typesense và PostgreSQL full-text.
- Admin dashboard: nguồn crawl, index, từ khóa, duyệt website, tài khoản, vai trò, SEO và giao diện.
- Chủ web có thể xác minh website và xem trang đã index, lượt hiển thị/click, CTR, lỗi crawl.
- Chống SSRF, CSRF, rate limit, mật khẩu bcrypt, session PostgreSQL, CSP và Cloudflare Turnstile tùy chọn.
- Trang công khai và khu admin hỗ trợ tiếng Việt/Anh. Admin có theme riêng theo thiết bị/sáng/tối, bảng màu và màu nhấn tùy chỉnh; logo, theme, nền và credit trang public cấu hình trong Admin → Giao diện.

## Chạy nhanh

Cần Node.js >= 20.11 và Docker Compose.

```bash
docker compose up -d
npm ci
cp .env.example .env
```

Đặt `SESSION_SECRET` ngẫu nhiên trong `.env`, sau đó chạy:

```bash
npm start
```

Khi chưa có tài khoản admin, mở URL tạo tài khoản một lần được in trong log khởi động, hoặc chạy `npm run admin:create`.

- Trang chủ: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Thêm site crawl tại Admin → **Nguồn crawl**, sau đó bắt đầu crawl và tìm kiếm.

Xem [HELP.md](HELP.md) để biết hướng dẫn cấu hình database/search engine, triển khai, bảo mật và xử lý sự cố. Các biến môi trường được mô tả trong [`.env.example`](.env.example).

## Cấu trúc project

```text
.
├── src/                         Mã nguồn ứng dụng Node.js
│   ├── server.js                Khởi tạo Express, middleware và các router
│   ├── db.js                    PostgreSQL, schema và cài đặt
│   ├── routes/                  Router public, admin, SEO, submit và account
│   ├── search/                  Adapter cho 5 search backend
│   ├── i18n/                    Chuỗi dịch giao diện tiếng Việt/Anh
│   ├── crawler.js               Crawl website và sitemap
│   ├── security.js, ssrf.js     Bảo vệ request, CSRF và SSRF
│   ├── permissions.js, rbac.js  Vai trò và phân quyền admin
│   └── sites.js, events.js      Xác minh website và thống kê
├── views/                       Template EJS
│   ├── admin/                   Trang quản trị
│   ├── account/                 Trang tài khoản chủ web
│   └── partials/                Các phần giao diện dùng chung
├── public/                      CSS, JavaScript và tài nguyên tĩnh
├── scripts/                     Lệnh tạo admin và cấu hình search engine
├── README.md                    Tổng quan tiếng Việt
├── README-en.md                 Project overview in English
├── HELP.md                      Hướng dẫn tiếng Việt
└── HELP-en.md                   English setup and operations guide
```

## Kiểm thử và giới hạn

Một số luồng đã được kiểm thử tự động với database/search service giả lập; PostgreSQL full-text cũng được kiểm thử với PostgreSQL tương thích. Các dịch vụ managed và cấu hình production cần được xác nhận trên môi trường triển khai thực tế. Crawler không chạy JavaScript; ứng dụng chưa gửi email hoặc hỗ trợ 2FA. Chi tiết xem mục giới hạn trong [HELP.md](HELP.md).

## Đường dẫn chính

`/` · `/search?q=` · `/suggest?q=` · `/submit` · `/account/*` · `/admin/*` · `/sitemap.xml` · `/robots.txt`

## Sponsor me
[![Sponsor here](https://img.shields.io/badge/sponsor-here-ff69b4?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://donate.protechvn.io.vn)

## LICENSE
Under MIT License on [LICENSE](LICENSE)