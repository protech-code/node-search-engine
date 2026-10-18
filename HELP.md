# Hướng dẫn từ A đến Z

[![Node.js 20.11+](https://img.shields.io/badge/Node.js-20.11%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/) [![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)

[English guide](HELP-en.md) | [README tiếng Việt](README.md) | [English README](README-en.md)

Tài liệu này đi từ con số 0 đến khi website tìm kiếm chạy thật trên internet. Làm theo thứ tự; mục nào không cần (ví dụ không dùng Aiven) thì bỏ qua.

**Mục lục**
1. [Tổng quan](#1-tổng-quan)
2. [Chuẩn bị](#2-chuẩn-bị)
3. [Chạy thử trên máy (5 phút)](#3-chạy-thử-trên-máy-5-phút)
4. [Giải thích file `.env`](#4-giải-thích-file-env)
5. [Database: Postgres local hoặc Aiven](#5-database-postgres-local-hoặc-aiven)
6. [Search engine: chọn 1 trong 5 + sửa lỗi quyền OpenSearch](#6-search-engine-chọn-1-trong-5--sửa-lỗi-quyền-opensearch)
7. [Captcha Cloudflare Turnstile](#7-captcha-cloudflare-turnstile)
8. [Tài khoản, vai trò và quản trị viên đầu tiên](#8-tài-khoản-vai-trò-và-quản-trị-viên-đầu-tiên)
9. [Crawl website](#9-crawl-website)
    - [Giao diện: logo, theme, nền, ngôn ngữ](#20-giao-diện-logo-theme-nền-và-ngôn-ngữ)
10. [Quản lý từ khóa](#10-quản-lý-từ-khóa)
11. [Cho người khác gửi website](#11-cho-người-khác-gửi-website)
12. [Tài khoản chủ web và xác minh](#12-tài-khoản-chủ-web-và-xác-minh)
13. [SEO cho chính website tìm kiếm](#13-seo-cho-chính-website-tìm-kiếm)
14. [Triển khai lên server (production)](#14-triển-khai-lên-server-production)
15. [Kiểm tra sau triển khai](#15-kiểm-tra-sau-triển-khai)
16. [Bảo trì và sao lưu](#16-bảo-trì-và-sao-lưu)
17. [Checklist bảo mật](#17-checklist-bảo-mật)
18. [Xử lý sự cố](#18-xử-lý-sự-cố)
19. [Phụ lục](#19-phụ-lục)

---

## 1. Tổng quan

```
Trình duyệt ──► Nginx (HTTPS) ──► Node.js app ──┬─► PostgreSQL   (admin, nguồn crawl, từ khóa, tài khoản, thống kê)
                                                ├─► Search engine: Meilisearch / OpenSearch / Elasticsearch / Typesense / (hoặc chính Postgres)
                                                ├─► Cloudflare Turnstile      (xác minh captcha)
                                                └─► Crawler ──► các website cần index
```

- **PostgreSQL** lưu dữ liệu hệ thống. **Search backend** lưu nội dung các trang đã crawl để tìm kiếm nhanh.
- Chỉ mục có thể dựng lại bằng cách crawl lại, còn Postgres là dữ liệu cần sao lưu.

## 2. Chuẩn bị

| Cần | Ghi chú |
|---|---|
| Node.js **≥ 20.11** | Kiểm tra: `node -v` |
| Docker (khuyên dùng khi chạy local) | Để chạy Postgres + Meilisearch nhanh |
| Tài khoản Aiven | Chỉ khi dùng Postgres/OpenSearch của Aiven |
| Tài khoản Cloudflare | Chỉ khi dùng captcha Turnstile (miễn phí tạo widget) |
| Domain + VPS | Chỉ khi đưa lên internet |

## 3. Chạy thử trên máy (5 phút)

```bash
unzip search-engine-v6.zip && cd search-engine
docker compose up -d          # Postgres (cổng 5432) + Meilisearch (cổng 7700)
npm install
cp .env.example .env
```

Mở `.env`, sửa tối thiểu một dòng:

```env
SESSION_SECRET=<chuỗi ngẫu nhiên dài>     # tạo: openssl rand -hex 32
```

Mật khẩu admin **không còn nằm trong `.env`**. Bạn tạo quản trị viên đầu tiên ở bước dưới.

Chạy:

```bash
npm start
```

Log mong đợi có một đoạn như sau (token đổi mỗi lần khởi động) rồi `Chạy tại http://localhost:3000 | search: meilisearch`:

```
[setup] Chưa có quản trị viên. Mở link sau để tạo tài khoản đầu tiên:
        http://localhost:3000/admin/setup?token=...
```

**Mở link đó** và tạo tài khoản superadmin (xem mục 8). Dòng `[turnstile] ... captcha đang TẮT` là bình thường nếu bạn chưa cấu hình captcha.

Thử ngay: vào http://localhost:3000/admin, đăng nhập bằng tài khoản vừa tạo, **Nguồn crawl** → thêm một website (ví dụ blog của bạn) → **Crawl**. Đợi vài chục giây, tải lại trang để thấy số trang tăng, rồi tìm kiếm ở trang chủ.

> Muốn crawl chính `localhost` để thử? Thêm `ALLOW_PRIVATE_FETCH=true` vào `.env`. **Chỉ dùng local**, vì nó tắt chống SSRF.

## 4. Giải thích file `.env`

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PORT` | không | Cổng app (mặc định 3000) |
| `BASE_URL` | **có** (production) | Domain thật, dùng cho sitemap/canonical. Ví dụ `https://tim.example.com` |
| `SESSION_SECRET` | **có** | Khóa ký session và link click. Đổi sang chuỗi ngẫu nhiên dài |
| `TRUST_PROXY` | khuyên | Số lớp proxy trước app: chạy thẳng `0`, Nginx `1`, Cloudflare+Nginx `2` |
| `DATABASE_URL` | **có** | Chuỗi kết nối Postgres |
| `PG_CA_PATH` | khuyên (Aiven) | Đường dẫn `ca.pem` để xác thực SSL |
| `PG_POOL_MAX` | không | Số kết nối tối đa tới Postgres (mặc định 10). Gói Aiven nhỏ có giới hạn kết nối, hãy đặt 5 |
| `SEARCH_PROVIDER` | **có** | `meilisearch` · `opensearch` · `elasticsearch` · `typesense` · `postgres` |
| `MEILI_HOST`, `MEILI_KEY` | nếu Meili | Địa chỉ và master key |
| `OPENSEARCH_URL`, `OPENSEARCH_USER`, `OPENSEARCH_PASSWORD`, `OPENSEARCH_INDEX`, `OPENSEARCH_CA_PATH` | nếu OpenSearch | URL, tài khoản (tách riêng, không cần mã hóa ký tự đặc biệt), tên index, CA tùy chọn |
| `ELASTICSEARCH_URL`, `ELASTICSEARCH_USER`/`_PASSWORD` **hoặc** `ELASTICSEARCH_API_KEY`, `_INDEX`, `_CA_PATH` | nếu Elasticsearch | Tự host hoặc Elastic Cloud |
| `TYPESENSE_URL`, `TYPESENSE_API_KEY`, `TYPESENSE_COLLECTION`, `TYPESENSE_CA_PATH` | nếu Typesense | |
| *(không có)* | nếu `postgres` | Dùng chung `DATABASE_URL`, không cần dịch vụ riêng |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | không | Đủ cả hai thì captcha tự bật |
| `BOT_UA` | khuyên | Tên bot khi crawl. Nên kèm URL trang giới thiệu để chủ web biết liên hệ |
| `CRAWL_DELAY_MS` | không | Nghỉ giữa các request (mặc định 500) |
| `VERIFIED_MAX_PAGES` | không | Số trang tối đa cho site chủ web đã xác minh (mặc định 200) |
| `AUTO_KEYWORDS` | không | `false` = chỉ hiện từ khóa admin ghim |
| `KEYWORD_MIN_COUNT` | không | Từ khóa người dùng gõ phải được tìm ≥ N lần mới hiện công khai (mặc định 3) |
| `SUBMIT_LIMIT` | không | Số lần gửi site mỗi giờ cho mỗi IP (mặc định 5) |
| `ALLOW_PRIVATE_FETCH` | không | **Chỉ dev.** Cho phép crawl mạng nội bộ |

Mọi thay đổi `.env` cần **khởi động lại** app.

## 5. Database: Postgres local hoặc Aiven

### Cách A: Postgres local (đã có trong `docker-compose.yml`)

`.env` mặc định đã khớp: `DATABASE_URL=postgres://search:search@localhost:5432/search`. Không cần làm gì thêm.

### Cách B: Aiven for PostgreSQL

1. Vào Aiven Console → **Create service** → chọn **PostgreSQL**.
2. Chọn cloud, vùng gần server của bạn và gói dịch vụ. Gói và giá thay đổi theo thời gian, hãy xem trang giá hiện tại của Aiven.
3. Bấm tạo, đợi trạng thái **Running**.
4. Mở service, tab **Overview**:
   - Copy **Service URI**, ví dụ `postgres://avnadmin:MATKHAU@pg-xxx.aivencloud.com:12345/defaultdb?sslmode=require`.
   - Tải **CA certificate** (`ca.pem`) và lưu cạnh project.
5. Điền `.env`:
   ```env
   DATABASE_URL=postgres://avnadmin:MATKHAU@pg-xxx.aivencloud.com:12345/defaultdb?sslmode=require
   PG_CA_PATH=./ca.pem
   PG_POOL_MAX=5
   ```
6. Nếu bạn bật giới hạn IP trong Aiven (**Allowed IP addresses**), nhớ thêm IP của máy chạy app.
7. Chạy `npm start`. Bảng được **tự tạo** ở lần chạy đầu.

Lưu ý: nếu không đặt `PG_CA_PATH`, kết nối vẫn mã hóa nhưng **không xác thực chứng chỉ**; log sẽ cảnh báo. Production nên có `PG_CA_PATH`.

## 6. Search engine: chọn 1 trong 5 + sửa lỗi quyền OpenSearch

Chọn **một** bằng `SEARCH_PROVIDER`, điền các biến tương ứng (mục 4) rồi khởi động lại. Vào **Admin → Engine** để xem trạng thái kết nối, cấu hình đang dùng và bấm **Ghi thử + xóa thử**.

| Engine | Khi nào hợp | Ghi chú |
|---|---|---|
| `meilisearch` | Mặc định, dễ nhất | Gõ không dấu thường ra tiếng Việt có dấu (hãy thử trên dữ liệu của bạn). Key cần quyền tạo index, thêm/xóa tài liệu, search |
| `opensearch` | Dùng Aiven OpenSearch | Tài khoản cần quyền **cluster_monitor** + **indices_all** trên index `pages` (xem dưới) |
| `elasticsearch` | Đã có Elasticsearch / Elastic Cloud | Dùng user/mật khẩu hoặc **API key** |
| `typesense` | Cần engine nhẹ, tìm tiền tố/typo nhanh | Key cần quyền collections và documents |
| `postgres` | Site nhỏ đến vừa, muốn **không thêm dịch vụ** | Tìm full-text ngay trong Postgres; bỏ dấu tiếng Việt làm trong ứng dụng nên **không cần extension** trên Aiven |

Đổi engine **không tự chuyển dữ liệu**: sau khi đổi, vào Admin → **Nguồn crawl** → **Crawl** lại. Tìm tiếng Việt không dấu đã được xử lý riêng cho OpenSearch/Elasticsearch (bộ phân tích bỏ dấu), Typesense và Postgres; nếu bạn có index OpenSearch/Elasticsearch **cũ** từ bản trước, xóa nó để app tạo lại: `curl -X DELETE "<URL>/pages"` (kèm tài khoản).

### Sửa lỗi OpenSearch "ghi dữ liệu bị lỗi" (phải chỉnh quyền)

Triệu chứng thường gặp: **đọc/kết nối được nhưng ghi (thêm trang vào index) thì lỗi**, trong log có `security_exception` ("no permissions for [indices:data/write/index]"…). Nguyên nhân: tài khoản trong `.env` thiếu quyền trên OpenSearch. Bản này hiển thị **đúng lỗi gốc** (trước đây chỉ báo chung chung) và có hai cách sửa, **không bắt buộc** phải mò trong Dashboards:

**Cách A: để app tự tạo role + user quyền tối thiểu**

```bash
# trong .env tạm thời dùng tài khoản ADMIN của OpenSearch (ví dụ avnadmin)
npm run engine:setup -- --create-user
```

Script tạo index `pages`, role `mysearch_app` (cluster_monitor + indices_all chỉ trên index `pages`) và user `mysearch` với mật khẩu ngẫu nhiên (**in ra một lần**). Sau đó đặt vào `.env`:

```env
OPENSEARCH_USER=mysearch
OPENSEARCH_PASSWORD=<mật khẩu script in ra>
```

(và bỏ tài khoản admin khỏi `OPENSEARCH_URL` nếu có). Khởi động lại, rồi vào Admin → Engine bấm **Ghi thử + xóa thử** để xác nhận.

> Script gọi Security API của OpenSearch. Một số dịch vụ (nhất là bản managed như Aiven) có thể **không cho** gọi API này bằng tài khoản của bạn; khi đó script báo lỗi và in hướng dẫn cách B. Phần này mình mới kiểm tra bằng server giả, chưa thử trên Aiven thật.

**Cách B: tạo thủ công trong OpenSearch Dashboards**

1. Dashboards → **Security** → **Roles** → **Create role**.
2. **Cluster permissions**: `cluster_monitor`.
3. **Index permissions**: index pattern `pages` (đúng `OPENSEARCH_INDEX`), permissions `indices_all`.
4. Tab **Mapped users** → thêm user bạn đang dùng trong `.env`.
5. Nếu không thấy menu Security trên Aiven, kiểm tra tùy chọn quản lý OpenSearch Security trong **Advanced configuration** của service, và mục Users/ACL.

**Khi crawl mà engine không ghi được**, crawler **dừng sớm** sau 3 lần lỗi liên tiếp (không crawl vô ích), nguồn chuyển sang trạng thái lỗi với thông báo chung; chi tiết lỗi (không lộ cho chủ web) nằm ở **Admin → Engine** và log. Trang Tổng quan hiện cảnh báo đỏ khi ghi chỉ mục lỗi trong vòng 1 giờ qua.

Các lỗi khác cũng được giải thích kèm cách sửa ở trang Engine: sai mật khẩu/API key, chứng chỉ TLS (đặt `*_CA_PATH`), IP bị chặn bởi firewall, index chưa tồn tại, mapping cũ, ổ đĩa đầy (index read-only), quá tải.

## 7. Captcha Cloudflare Turnstile

Turnstile bảo vệ 4 form: **gửi website** (`/submit`), **đăng ký** và **đăng nhập** chủ web (`/account/...`), **đăng nhập admin** (`/admin/login`) và trang **tạo admin đầu tiên** (`/admin/setup`). Trang tìm kiếm không có captcha.

### Tạo widget

1. Đăng nhập https://dash.cloudflare.com, mở mục **Turnstile**.
2. Bấm **Add widget** (tên nút có thể thay đổi).
3. Đặt tên, ở **Hostnames** thêm domain chạy website của bạn (ví dụ `tim.example.com`), chọn chế độ **Managed**, bấm tạo.
4. Copy **Site Key** và **Secret Key**. Secret Key **không được** để lộ ra frontend hay commit lên git.
5. Điền `.env` rồi khởi động lại:
   ```env
   TURNSTILE_SITE_KEY=0x4AAAA...
   TURNSTILE_SECRET_KEY=0x4AAAA...
   ```

Log khởi động sẽ **không còn** dòng `captcha đang TẮT`.

### Thử ở local bằng key test

Cloudflare cung cấp key test. Dùng khi dev (widget luôn qua):
```env
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```
Muốn thử trường hợp captcha thất bại, tra key "luôn chặn" trong tài liệu Turnstile của Cloudflare.

### Cách hoạt động

- Form hiện widget; trình duyệt gửi kèm token; server gọi Cloudflare để xác minh trước khi xử lý.
- Nếu Cloudflare **không trả lời được**, server **từ chối** (fail closed) và người dùng thấy "Vui lòng xác nhận bạn không phải robot".
- Nếu thiếu một trong hai key, captcha **tắt hoàn toàn** (log có cảnh báo). Production nên bật.
- Server đã mở CSP cho `challenges.cloudflare.com` (script, frame, connect), bạn không cần cấu hình thêm.

### Kiểm tra Turnstile hoạt động

Mở `/submit`: thấy khung captcha. Gửi form mà **không tick** thì phải báo lỗi "Vui lòng xác nhận bạn không phải robot".

## 8. Tài khoản, vai trò và quản trị viên đầu tiên

### Tạo quản trị viên đầu tiên (không dùng mật khẩu trong `.env`)

Mật khẩu admin **không còn** nằm trong `.env` (biến `ADMIN_USER`/`ADMIN_PASSWORD` bị bỏ qua; nếu còn, log nhắc bạn xóa đi). Có hai cách:

1. **Link thiết lập:** khi chưa có admin nào, log khởi động in `.../admin/setup?token=...`. Mở link, nhập tên đăng nhập (3-32 ký tự) và mật khẩu (≥ 10 ký tự). Token dùng **một lần** và đổi mỗi lần khởi động lại; chỉ người đọc được log server mới có. Tài khoản này là **superadmin**.
2. **Dòng lệnh:** `npm run admin:create` (nhập tương tác, mật khẩu được ẩn). Cách này cũng dùng để **đặt lại mật khẩu** khi bạn bị khóa ngoài: nhập tên admin đã có, nó đặt mật khẩu mới và mở khóa.

Đăng nhập tại `/admin`. Quá 10 lần đăng nhập **sai** trong 15 phút (theo IP) sẽ bị chặn tạm; đăng nhập đúng không bị tính.

### Vai trò (role) và quyền

Mỗi quản trị viên có một vai trò; vai trò quyết định họ vào được khu vực nào của Admin. Vai trò mặc định:

| Vai trò | Quyền |
|---|---|
| `superadmin` | Mọi quyền, không sửa/xóa được |
| `admin` | Mọi thứ trừ quản lý tài khoản, vai trò và chạy ghi thử engine |
| `editor` | Tổng quan, nguồn crawl, từ khóa, duyệt site gửi, chủ web |
| `viewer` | Chỉ xem tổng quan |

**Thêm vai trò:** Admin → **Vai trò** → nhập tên (chữ thường, số, `_ -`) và tick các quyền → **Tạo vai trò**. Các quyền: xem tổng quan, quản lý nguồn crawl, chỉ mục, từ khóa, duyệt site gửi, chủ web, SEO, xem/chạy kiểm tra engine, quản lý tài khoản, quản lý vai trò. Sửa quyền của vai trò có hiệu lực **ngay**, kể cả với người đang đăng nhập. Vai trò mặc định không xóa được; vai trò đang có người dùng không xóa được.

**Chống leo thang đặc quyền:** bạn chỉ trao/sửa được quyền mà chính bạn đang có. Người không phải superadmin **không** tạo/sửa/khóa/xóa/đổi mật khẩu superadmin và không gán được vai trò cao hơn mình (đã kiểm thử, kể cả gửi thẳng request).

### Quản lý tất cả tài khoản (Admin → Tài khoản)

- **Quản trị viên:** thêm (tên, mật khẩu ≥ 10, vai trò), đổi vai trò, đặt lại mật khẩu, **khóa/mở khóa**, xóa.
- **Chủ web:** tạo tài khoản, đặt lại mật khẩu (≥ 8 ký tự), khóa/mở khóa, xóa. Xóa chủ web gỡ quyền sở hữu website của họ nhưng **không** xóa trang đã index (xóa ở Nguồn crawl nếu cần).
- Khóa/xóa/đổi vai trò có hiệu lực ngay, kể cả khi người đó đang đăng nhập.
- Ràng buộc an toàn: không tự khóa/xóa/đổi vai trò chính mình; luôn còn ít nhất một superadmin hoạt động.
- Hệ thống chưa gửi email (không có SMTP), nên đặt lại mật khẩu là admin nhập mật khẩu mới rồi gửi cho người dùng. Chưa có đăng nhập 2 bước (2FA).

## 9. Crawl website

**Thêm nguồn:** Admin → **Nguồn crawl** → nhập URL và số trang tối đa → **Thêm** → **Crawl**. Crawl chạy nền; tải lại trang để xem tiến độ.

Crawler:
- Chỉ đi theo link **cùng domain**, tối đa N trang.
- Tôn trọng `robots.txt` (kể cả `Crawl-delay`), thẻ `noindex` (không index) và `nofollow` (không theo link).
- Đọc sitemap: lấy từ `Sitemap:` trong robots.txt, hoặc sitemap chủ web khai báo.
- Ghi lại lỗi từng URL (HTTP lỗi, bị robots chặn, noindex...) để chủ web xem.
- Không chạy JavaScript: trang chỉ có nội dung sau khi JS render sẽ gần như rỗng.

**Xóa dữ liệu:**
- Xóa một nguồn → xóa luôn các trang của domain đó khỏi chỉ mục.
- Admin → **Index**: tìm và xóa từng trang, hoặc xóa toàn bộ.

## 10. Quản lý từ khóa

Admin → **Từ khóa**.

**Gợi ý khi gõ** lấy từ ba nguồn, theo thứ tự:
1. Từ khóa **admin ghim** (biểu tượng ⌕).
2. Từ khóa **người dùng hay tìm** (⌕), chỉ hiện khi đã được tìm ≥ `KEYWORD_MIN_COUNT` lần (mặc định 3).
3. **Tiêu đề các trang đã index** (↗). Nguồn này giúp gợi ý hoạt động ngay cả khi website mới chưa ai tìm gì.

Ô tìm kiếm **đang trống** mà bấm vào thì hiện từ khóa phổ biến/ghim. Dropdown dùng được bằng cảm ứng và bàn phím (↑ ↓ Enter Esc).

**Các thao tác:**
- **Ghim**: luôn hiện ở "Tìm nhiều" trên trang chủ và trong gợi ý, kể cả khi chưa ai tìm. Dùng để dẫn dắt người dùng.
- **Ẩn**: không bao giờ hiện công khai (gợi ý, trang chủ, sitemap). Dùng cho từ khóa spam, nhạy cảm. Người dùng vẫn tìm được từ khóa đó bình thường.
- **Xóa log**: xoá lịch sử của một từ khóa (lượt tìm và thống kê).
- Bảng **Tìm không có kết quả** cho biết người dùng cần nội dung gì mà bạn chưa có.

**Vì sao có ngưỡng và bộ lọc?** Từ khóa do người lạ gõ, nên nếu hiện ngay ra công khai (trang chủ, sitemap) thì có thể bị lợi dụng để chèn spam/link. Hệ thống tự lọc truy vấn chứa `http`, `www.`, `@`, quá ngắn/dài, và chỉ hiện khi đủ lượt. Muốn kiểm soát tuyệt đối: đặt `AUTO_KEYWORDS=false`, khi đó **chỉ** từ khóa bạn ghim được hiện.

## 11. Cho người khác gửi website

Trang công khai `/submit` (link ở chân trang chủ).

- Người gửi nhập URL + email, qua captcha Turnstile (nếu bật).
- Bot bị chặn nhiều lớp: captcha, ô ẩn (honeypot), thời gian điền form (<3 giây coi là bot), giới hạn `SUBMIT_LIMIT` lần/giờ/IP, và token CSRF.
- Hệ thống từ chối URL nội bộ (localhost, IP riêng), cổng khác 80/443, và domain đã có trong hàng chờ.

**Duyệt:** Admin → **Yêu cầu gửi site**. Mỗi dòng có **Duyệt + crawl** (chọn số trang tối đa) hoặc **Từ chối**. Số "Site chờ duyệt" hiện trên trang Tổng quan.

Email người gửi chỉ **lưu lại** để bạn liên hệ; hệ thống chưa gửi email tự động.

## 12. Tài khoản chủ web và xác minh

Dành cho người muốn tự quản website của họ (giống Google Search Console bản nhỏ). Địa chỉ: `/account`.

### Quy trình của chủ web

1. **Đăng ký** (email + mật khẩu ≥ 8 ký tự) rồi **thêm website** (tối đa 20 website/tài khoản).
2. **Xác minh quyền sở hữu** bằng **một** trong ba cách (mỗi website có mã riêng):
   - **Thẻ meta** trong `<head>` của trang chủ:
     `<meta name="mysearch-verification" content="MÃ_CỦA_BẠN">`
   - **File** `https://domain/mysearch-MÃ.html` có nội dung **đúng một dòng**: `mysearch-verification: MÃ`
   - **DNS TXT** cho domain: `mysearch-verification=MÃ` (DNS có thể mất vài phút để cập nhật)
3. Xác minh thành công thì hệ thống **tự crawl** website.

Chỉ **một tài khoản** được xác minh cho mỗi website. Người khác không thể chiếm website đã có chủ.

### Dashboard của chủ web (sau khi xác minh)

- **Trang đã index**, trạng thái và tiến độ crawl.
- **Hiển thị / click / CTR** trong 28 ngày và biểu đồ 14 ngày. Số liệu chỉ có khi người dùng thật sự thấy/bấm site này trong kết quả tìm kiếm của bạn.
- **Từ khóa dẫn tới site**, danh sách **trang đã index**.
- **Lỗi crawl**: URL bị robots chặn, HTTP 404/500, noindex...
- **Yêu cầu crawl lại** (tối đa **6 giờ một lần**), **khai báo sitemap**, **gỡ website** (xóa dữ liệu khỏi chỉ mục).

Dữ liệu hiển thị/click được giữ 90 ngày rồi tự xóa.

### Admin quản lý

Admin → **Chủ web**: xem ai sở hữu website nào; **Thu hồi** để gỡ quyền sở hữu (không xóa dữ liệu đã index).

## 13. SEO cho chính website tìm kiếm

Admin → **SEO** cho phép chỉnh: tên site, mô tả, mẫu tiêu đề (`%s` là tiêu đề trang) và ảnh Open Graph.

Hệ thống đã có sẵn: `/sitemap.xml`, `/robots.txt`, canonical, Open Graph, JSON-LD `WebSite` + `SearchAction`.

**Đưa lên Google:**
1. Vào Google Search Console, thêm domain của bạn và xác minh.
2. Mục **Sitemaps**: gửi `https://domain-cua-ban/sitemap.xml`.

**Hiểu đúng về SEO cho trang kết quả tìm kiếm:**
- Trang kết quả có từ khóa lạ, ít nội dung thường **không có giá trị** với Google. Vì vậy trang không có kết quả hoặc từ trang 2 trở đi được gắn `noindex`.
- Sitemap chỉ chứa từ khóa **đã có kết quả** và đủ phổ biến (hoặc do bạn ghim).
- Cách hiệu quả nhất: **ghim từ khóa quan trọng**, viết mô tả site rõ ràng, và có nội dung/trang chủ đáng đọc. Không có cam kết về thứ hạng trên Google.

## 14. Triển khai lên server (production)

Ví dụ: VPS Ubuntu, domain `tim.example.com` đã trỏ A record về IP VPS.

### 14.1 Cài Node và lấy mã nguồn

```bash
# cài Node 22 (ví dụ qua nvm hoặc NodeSource), rồi:
unzip search-engine-v6.zip && cd search-engine
npm ci --omit=dev
cp .env.example .env && nano .env
```

`.env` production tối thiểu:
```env
NODE_ENV=production
BASE_URL=https://tim.example.com
SESSION_SECRET=<openssl rand -hex 32>
TRUST_PROXY=1
DATABASE_URL=...        PG_CA_PATH=./ca.pem
SEARCH_PROVIDER=...     # và biến tương ứng
TURNSTILE_SITE_KEY=...  TURNSTILE_SECRET_KEY=...
BOT_UA=MySearchBot/1.0 (+https://tim.example.com/bot)
```

### 14.2 Netlify Functions

Project có sẵn `netlify.toml` và adapter CommonJS tại `netlify/functions/api.cjs`. Đưa mã nguồn lên GitHub rồi tạo site trên Netlify. Nếu repository chứa cả thư mục cha, đặt **Base directory** là `search-engine`; nếu repository chính là nội dung thư mục này thì dùng thư mục gốc. Netlify sẽ cài dependency từ `package-lock.json` và dùng Node.js 22. Không đặt build command `npm start`: Netlify chạy app qua Function, không chạy tiến trình server liên tục.

Trong **Site configuration → Environment variables**, cấu hình tối thiểu các biến trong mục 4: `NODE_ENV=production`, `BASE_URL` (domain HTTPS của Netlify hoặc domain riêng), `SESSION_SECRET`, `DATABASE_URL`, `SEARCH_PROVIDER` và các biến tương ứng của search backend. Thêm `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` nếu bật captcha. Không dùng `PG_CA_PATH` trỏ tới file trên máy cá nhân; nếu cần CA riêng, phải đóng gói file đó trong project và đặt đường dẫn tương đối đúng. Sau khi thêm/sửa biến, deploy lại.

`netlify.toml` đã cấu hình `SECRETS_SCAN_OMIT_KEYS=BASE_URL,SEARCH_PROVIDER,PORT` để tránh scanner báo nhầm các giá trị cấu hình công khai này. Nếu log vẫn báo, kiểm tra mục **Resolved config** sau deploy có `SECRETS_SCAN_OMIT_KEYS` chưa; nếu chưa, thêm biến này trong **Site configuration → Environment variables** với cùng giá trị rồi deploy lại. Không đưa `DATABASE_URL`, `SESSION_SECRET`, API key hoặc mật khẩu vào danh sách bỏ qua và không tắt toàn bộ secret scanning.

Giới hạn cần biết:
- Netlify Functions là serverless, không phải server chạy thường trực. Các thao tác crawl khởi chạy nền có thể bị dừng khi Function kết thúc; dùng VPS/worker riêng nếu cần crawl ổn định hoặc crawl lâu.
- Function đồng bộ có giới hạn thời gian chạy và request/response; thao tác upload lớn hoặc crawl lâu có thể timeout. Nội dung ảnh giao diện và session vẫn được lưu trong PostgreSQL, không dựa vào ổ đĩa tạm.
- Khởi tạo database và search backend diễn ra khi Function khởi động lạnh; nên dùng PostgreSQL/search service có thể truy cập từ Netlify và giới hạn connection pool (`PG_POOL_MAX`, ví dụ `5`) để tránh mở quá nhiều kết nối.
- Link tạo admin đầu tiên được ghi vào log khi Function khởi động. Khi chưa có admin, link có thể đổi sau cold start; hoàn tất tạo admin ngay sau khi deploy.

Sau deploy, kiểm tra `/`, `/admin/login`, `/sitemap.xml` và `/robots.txt`. Nếu cần crawler luôn hoạt động, triển khai app trên VPS/Docker như các mục dưới.

### 14.3 Vercel

Vercel hỗ trợ Express trực tiếp qua `src/server.js`; file `vercel.json` đã cấu hình đóng gói các template EJS trong `views/`. Kết nối repository với Vercel và đặt **Root Directory** là `search-engine` nếu repository có thư mục cha. Không cần build command riêng hay adapter Vercel. Thư mục `public/` được Vercel phục vụ như static assets qua CDN.

Thêm Environment Variables theo hướng dẫn ở mục Netlify: `NODE_ENV=production`, `BASE_URL` là URL HTTPS của deployment/domain riêng, `SESSION_SECRET`, `DATABASE_URL`, `SEARCH_PROVIDER` cùng biến cho search backend. Mỗi lần đổi biến cần redeploy. Trên Vercel, app mặc định giới hạn mỗi instance tối đa 1 kết nối PostgreSQL (`PG_POOL_MAX=1`); có thể khai báo biến này tường minh trong Vercel. Nếu database vẫn báo hết slot kết nối khi tải tăng, dùng URL connection pooler/PgBouncer do nhà cung cấp database cung cấp thay cho kết nối trực tiếp.

Vercel chạy Express dưới dạng Function, không phải VPS luôn bật. Request có giới hạn thời gian theo plan; crawler chạy nền sau khi trả response không được đảm bảo hoàn tất. Dùng VPS/worker riêng cho crawl dài hoặc ổn định. Kiểm tra `/`, `/admin/login`, `/sitemap.xml`, `/robots.txt` và tài nguyên tĩnh sau deploy.

### 14.4 Chạy bằng PM2 (cách đơn giản)

```bash
npm i -g pm2
pm2 start src/server.js --name search --node-args="--env-file=.env"
pm2 save && pm2 startup        # làm theo lệnh nó in ra để tự chạy khi khởi động lại
pm2 logs search
```

### 14.5 Hoặc chạy bằng Docker

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Nếu dùng `ca.pem`, bỏ comment phần `volumes` trong file compose và đặt `PG_CA_PATH=/app/ca.pem`. App chỉ mở ở `127.0.0.1:3000`; Nginx sẽ proxy ra ngoài.

### 14.6 Nginx + HTTPS

`/etc/nginx/sites-available/search`:
```nginx
server {
  listen 80;
  server_name tim.example.com;
  client_max_body_size 3m;   # để tải logo/ảnh nền lên được
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/search /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tim.example.com      # bật HTTPS
```

### 14.7 Hai điểm dễ sai

- **Production bắt buộc HTTPS.** Với `NODE_ENV=production`, cookie đăng nhập chỉ gửi qua HTTPS. Chạy HTTP sẽ **không đăng nhập được** (đăng nhập xong lại bị đưa về trang login).
- **`TRUST_PROXY` phải đúng số lớp proxy.** Sai thì rate limit và captcha thấy sai IP (mọi người dùng có thể bị tính chung một IP). Nginx một mình = `1`; nếu bật proxy cam (đám mây) của Cloudflare phía trước Nginx = `2`.
- Cloudflare Turnstile (captcha) **không cần** bật proxy Cloudflare cho domain; hai thứ độc lập.

## 15. Kiểm tra sau triển khai

Vì bản này **chưa được thử với Aiven/Turnstile/OpenSearch thật**, hãy tự kiểm tra lần đầu:

| Bước | Mong đợi |
|---|---|
| Xem log khi khởi động | Có `Chạy tại https://... \| search: ...`, không lỗi kết nối DB, không dòng "captcha đang TẮT" (nếu đã cấu hình) |
| Mở `https://domain/` | Trang chủ hiện, ổ khóa HTTPS |
| `/admin/login` | Thấy khung captcha, đăng nhập được |
| Admin → Engine | Hiện "Kết nối được"; bấm **Ghi thử + xóa thử** ra "Thành công" |
| Thêm nguồn + Crawl | Số trang tăng, tìm kiếm ra kết quả |
| `/submit` không tick captcha | Báo "Vui lòng xác nhận bạn không phải robot" |
| `/sitemap.xml`, `/robots.txt` | Có nội dung, domain đúng `BASE_URL` |
| Gõ vào ô tìm kiếm | Có gợi ý (tiêu đề trang hoặc từ khóa ghim) |
| Thử tìm `viet nam` (không dấu) | Ra kết quả chứa `Việt Nam` |
| Đăng ký tài khoản chủ web, thêm site, xác minh | Xác minh thành công, dashboard mở được |

## 16. Bảo trì và sao lưu

- **Sao lưu Postgres:** `pg_dump "$DATABASE_URL" > backup-$(date +%F).sql`. Kiểm tra thêm tùy chọn sao lưu tự động của gói Aiven bạn dùng. Chỉ mục tìm kiếm không cần sao lưu (crawl lại được).
- **Xem log:** `pm2 logs search` hoặc `docker compose -f docker-compose.prod.yml logs -f`.
- **Cập nhật:** thay mã nguồn, `npm ci --omit=dev`, rồi `pm2 restart search`. Bảng mới/cột mới được thêm tự động khi khởi động.
- **Dọn dữ liệu:** sự kiện hiển thị/click tự xóa sau 90 ngày. Log tìm kiếm (bảng `queries`) không tự xóa; dùng nút **Xóa log** hoặc xóa bằng SQL nếu cần.
- **Crawl định kỳ:** hiện chưa có lịch tự động (chỉ crawl khi bạn bấm hoặc chủ web yêu cầu). Có thể dùng cron của hệ thống gọi lệnh riêng nếu bạn tự bổ sung.

## 17. Checklist bảo mật

- [ ] `SESSION_SECRET` là chuỗi ngẫu nhiên dài, khác mọi nơi khác
- [ ] Đã tạo admin riêng, **không** còn `ADMIN_PASSWORD` trong `.env`; mỗi người một tài khoản với vai trò tối thiểu cần thiết
- [ ] Search engine dùng tài khoản **quyền tối thiểu** (không dùng tài khoản admin của engine)
- [ ] `NODE_ENV=production`, chạy HTTPS
- [ ] Turnstile đã bật (có cả hai key)
- [ ] `TRUST_PROXY` đúng
- [ ] `ALLOW_PRIVATE_FETCH` **không** có trong `.env` production
- [ ] `PG_CA_PATH` đã đặt khi dùng Aiven
- [ ] Meilisearch không mở cổng 7700 ra internet, master key mạnh
- [ ] File `.env` và `ca.pem` không nằm trong git/zip công khai
- [ ] `BOT_UA` có URL liên hệ thật
- [ ] Đã giới hạn IP truy cập database ở Aiven (nếu có thể)
- [ ] Chỉ cấp quyền "Giao diện" cho người tin cậy (họ tải được ảnh lên domain của bạn)

## 18. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Thiếu DATABASE_URL` | Chưa có `.env` hoặc chạy sai thư mục | `cp .env.example .env`, chạy `npm start` trong thư mục project |
| `ECONNREFUSED` tới cổng 5432 | Postgres chưa chạy | `docker compose up -d` |
| Aiven báo `self-signed certificate in certificate chain` | Chưa có CA | Tải `ca.pem` từ Aiven, đặt `PG_CA_PATH` |
| Aiven báo `too many connections` | Gói nhỏ giới hạn kết nối | `PG_POOL_MAX=5`, đừng chạy nhiều instance |
| OpenSearch: đọc được nhưng **ghi/thêm trang bị lỗi**, log có `security_exception` | Tài khoản thiếu quyền ghi trên index | Mục 6: `npm run engine:setup -- --create-user` hoặc tạo role trong Dashboards; kiểm tra lại ở Admin → Engine |
| Crawl dừng với "Không ghi được vào search engine" | Engine từ chối ghi 3 lần liên tiếp | Xem chi tiết + cách sửa ở Admin → Engine (chi tiết không hiện cho chủ web) |
| `SEARCH_PROVIDER không hợp lệ` | Gõ sai tên | Dùng: meilisearch, opensearch, elasticsearch, typesense, postgres |
| Không đăng nhập admin được / quên mật khẩu | | `npm run admin:create` với tên admin đã có để đặt mật khẩu mới |
| Link `/admin/setup` báo hết hạn | Token đổi mỗi lần khởi động lại | Lấy link mới trong log hoặc dùng `npm run admin:create` |
| Trang `/admin/...` báo "Không đủ quyền" (403) | Vai trò thiếu quyền | Superadmin sửa vai trò ở Admin → Vai trò |
| Log `[meilisearch] ... has failed` | Meilisearch chưa chạy / sai `MEILI_HOST`/`MEILI_KEY` | Kiểm tra `docker compose ps`, key khớp |
| OpenSearch lỗi chứng chỉ | Thiếu CA | Đặt `OPENSEARCH_CA_PATH` |
| Tìm tiếng Việt không dấu không ra (OpenSearch) | Index cũ tạo trước khi có bộ bỏ dấu | `curl -X DELETE "$OPENSEARCH_URL/pages"`, khởi động lại, crawl lại |
| Trang kết quả báo "Dịch vụ tìm kiếm đang bận" | Search backend mất kết nối | Xem log, kiểm tra `SEARCH_PROVIDER` và biến kết nối |
| Captcha không hiện | Thiếu 1 trong 2 key, hoặc domain chưa nằm trong **Hostnames** của widget | Kiểm tra log khởi động và danh sách hostname ở Cloudflare |
| Luôn báo "Vui lòng xác nhận bạn không phải robot" dù đã tick | Sai `TURNSTILE_SECRET_KEY`, server không ra được internet tới Cloudflare, hoặc lệch giờ | Xem log `[turnstile] từ chối: ...` (có mã lỗi, ví dụ `invalid-input-secret`) |
| Gợi ý từ khóa trống | Web mới: chưa có trang index, chưa ghim, chưa ai tìm đủ 3 lần | Crawl một site (gợi ý lấy từ tiêu đề trang) hoặc ghim từ khóa ở Admin → Từ khóa |
| "Tìm nhiều" trên trang chủ trống | Chưa có từ khóa ghim và chưa có từ khóa đủ ngưỡng | Ghim từ khóa, hoặc hạ `KEYWORD_MIN_COUNT` |
| Đăng nhập xong bị đưa về trang login (production) | Chạy HTTP, hoặc `TRUST_PROXY`/header `X-Forwarded-Proto` sai | Bật HTTPS, kiểm tra cấu hình Nginx ở mục 14.4 |
| Crawl được 0 trang | Bị `robots.txt` chặn, site cần JS, HTTP lỗi, hoặc chỉ có thẻ noindex | Xem **Lỗi crawl** trong dashboard chủ web hoặc `crawl_errors` |
| Crawl localhost bị chặn | Chống SSRF | Chỉ khi dev: `ALLOW_PRIVATE_FETCH=true` |
| Gửi site báo "Không tìm thấy tên miền này" | Domain sai/chưa trỏ DNS | Kiểm tra chính tả và DNS |
| Xác minh meta/file thất bại | Trang chủ chuyển hướng sang domain khác, file sai nội dung, cache CDN | Nội dung file phải **đúng một dòng**; xóa cache CDN |
| Xác minh DNS thất bại | DNS chưa cập nhật | Đợi vài phút; kiểm tra TXT tại **đúng host** đã thêm |
| Không yêu cầu crawl lại được | Giới hạn 6 giờ/lần hoặc đang crawl | Chờ theo số phút hiển thị |
| Lỗi 403 "CSRF token không hợp lệ" | Trang mở quá lâu, hoặc cookie bị chặn | Tải lại trang rồi gửi lại |
| Cổng 3000 đang dùng | Tiến trình cũ | Đổi `PORT` hoặc dừng tiến trình cũ |

Vẫn lỗi? Xem log của app trước tiên; hầu hết thông báo đều ghi rõ nguyên nhân.

## 19. Phụ lục

### Bảng dữ liệu (tự tạo)

`admins` · `roles` · `assets` (logo/nền) · `users` · `sites` (chủ web + mã xác minh) · `sources` (nguồn crawl) · `submissions` (site được gửi) · `queries` (log tìm kiếm) · `events` (hiển thị/click) · `crawl_errors` · `keywords` (ghim/ẩn) · `settings` (SEO) · `session` (phiên đăng nhập)

### Đường dẫn

| Đường dẫn | Chức năng |
|---|---|
| `/` · `/search?q=` | Trang chủ, kết quả |
| `/lucky?q=` | Mở kết quả đầu tiên (nếu có) |
| `/suggest?q=` | API gợi ý (giới hạn 120 lượt/phút/IP) |
| `/go` | Chuyển hướng đếm click (link có chữ ký) |
| `/submit` | Gửi website |
| `/account`, `/account/sites/:id` | Chủ web |
| `/admin`, `/admin/keywords`, `/admin/submissions`, `/admin/sites`, `/admin/sources`, `/admin/index`, `/admin/seo` | Quản trị (theo quyền) |
| `/admin/accounts`, `/admin/roles`, `/admin/engine`, `/admin/appearance` | Tài khoản, vai trò, trạng thái engine, giao diện |
| `/brand/logo` · `/brand/favicon` · `/brand/background` | Ảnh đã tải lên (công khai) |
| `/lang/vi` · `/lang/en` | Đổi ngôn ngữ (cookie), chỉ chuyển về đường dẫn nội bộ |
| `/admin/setup?token=` | Tạo admin đầu tiên (một lần) |
| `/sitemap.xml`, `/robots.txt` | SEO |

### Lệnh hay dùng

```bash
npm start                                   # chạy
npm run dev                                 # chạy tự reload khi sửa code
npm run admin:create                        # tạo superadmin / đặt lại mật khẩu
npm run engine:setup                        # tạo index + kiểm tra ghi (thêm -- --create-user để tạo role/user)
```

## 20. Giao diện: logo, theme, nền và ngôn ngữ

Admin → **Giao diện** (cần quyền `appearance.manage`; superadmin và vai trò `admin` mặc định đều có). Thay đổi áp dụng cho **trang công khai** (trang chủ, kết quả, gửi website, đăng nhập/khu chủ web). Có thể đặt credit tùy chỉnh hiển thị ở chân trang. Khu admin có bộ chọn Việt/Anh và tùy chỉnh theme riêng cho từng trình duyệt admin (theo thiết bị/sáng/tối, màu preset hoặc màu nhấn tùy chọn); không thay đổi theme của khách truy cập.

### Logo, favicon, ảnh nền
- Tải ảnh lên ngay trong trang; ảnh được **lưu trong Postgres**, nên không mất khi triển khai bằng Docker hoặc đổi server.
- **Logo**: PNG/JPG/WebP/GIF/SVG, tối đa 512 KB. Có tùy chọn hiện/ẩn tên site cạnh logo và chiều cao 20–120 px.
- **Favicon**: PNG/ICO/SVG, tối đa 256 KB. Nếu không tải, hệ thống tự tạo favicon từ chữ cái đầu của tên site, tô theo màu chủ đạo.
- **Ảnh nền**: PNG/JPG/WebP, tối đa 2 MB (không nhận SVG).
- Nếu chưa đặt ảnh Open Graph ở mục SEO, logo được dùng làm ảnh chia sẻ.
- **An toàn khi upload:** file được nhận diện bằng nội dung thật (không tin tên file hay Content-Type); SVG chứa script, sự kiện `onload=`, liên kết `javascript:` hoặc tham chiếu ngoài bị từ chối; SVG khi mở trực tiếp bị đặt trong sandbox (không chạy script); upload cần quyền và token CSRF.

### Theme
- **7 bảng màu** (blue, green, purple, orange, rose, teal, slate) hoặc **màu tùy chỉnh** dạng `#RRGGBB` (giá trị khác bị từ chối để tránh chèn mã CSS). Chữ trên nút tự chuyển sáng/tối để đọc được khi bạn chọn màu rất sáng.
- **Sáng/tối**: chọn mặc định (tự động theo thiết bị / luôn sáng / luôn tối). Có thể bật nút ◐ ở chân trang cho khách tự đổi; lựa chọn của khách lưu bằng cookie nên lần sau không bị nháy sáng-tối.

### Nền
- **Không** (màu trơn), **Gradient** (5 kiểu: aurora, sunset, ocean, forest, mono, phối theo màu chủ đạo) hoặc **Ảnh** (cần tải ảnh trước).
- **Độ phủ** (0–80%) làm mờ ảnh nền để chữ dễ đọc. Khung kết quả/đăng nhập tự có nền bán trong suốt khi dùng nền.

### Ngôn ngữ (Việt/Anh)
- **Ngôn ngữ mặc định**: Tiếng Việt, English, hoặc **Tự động theo trình duyệt của khách** (đọc `Accept-Language` theo thứ tự ưu tiên; ngôn ngữ khác tiếng Việt/Anh sẽ dùng English; không có thông tin sẽ dùng tiếng Việt).
- Nút chuyển **Tiếng Việt | English** ở chân trang (tắt được). Lựa chọn của khách được ghi nhớ bằng cookie và luôn thắng cài đặt mặc định.
- Ô **Mô tả site bằng tiếng Anh** dùng cho trang chủ và thẻ meta khi khách xem bằng English (để trống thì dùng mô tả tiếng Việt).
- **Phạm vi:** tiếng Anh áp dụng cho trang công khai, khu chủ web và khu quản trị. Ngôn ngữ admin được nhớ riêng với lựa chọn ngôn ngữ của khách. Nội dung bạn tự nhập (tên site, từ khóa ghim, nội dung đã crawl) không được tự dịch.
- Thêm/sửa chữ: file `src/i18n/vi.js` và `src/i18n/en.js` (cùng khóa; test kiểm tra hai file luôn khớp nhau).

### Xử lý sự cố giao diện
| Triệu chứng | Cách xử lý |
|---|---|
| Đổi giao diện mà chưa thấy | Cài đặt được cache tối đa 30 giây; tải lại cứng (Ctrl+F5) để bỏ cache CSS/ảnh |
| Upload báo "Định dạng không hỗ trợ" | File không phải ảnh thật hoặc là SVG có script; thử xuất lại PNG/JPG |
| Upload báo "File quá lớn" | Logo ≤ 512 KB, favicon ≤ 256 KB, nền ≤ 2 MB. Nếu dùng Nginx, nhớ `client_max_body_size 3m;` |
| Không chọn được kiểu nền "Ảnh" | Phải tải ảnh nền lên trước |
| Khách vẫn thấy tiếng Việt dù đã đặt English | Khách từng chọn ngôn ngữ (cookie `lang`) sẽ ghi đè mặc định; dùng chế độ test ẩn danh |
| Logo bị méo/quá lớn | Chỉnh "Chiều cao logo"; ưu tiên PNG/SVG nền trong suốt |
