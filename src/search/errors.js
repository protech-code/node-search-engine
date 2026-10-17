// Lỗi engine: hiện đúng nguyên nhân + gợi ý cách sửa (thay vì "Request failed").
export class EngineError extends Error {
  constructor(status, body, provider) {
    super(`${provider} trả HTTP ${status}: ${reason(body)}`.slice(0, 400));
    this.status = status;
    this.body = body;
    this.provider = provider;
    this.type = typeof body?.error === 'object' ? body.error?.type : (body?.error || body?.code);
  }
}

function reason(b) {
  if (!b) return '';
  if (typeof b.error === 'string') return b.error;
  if (b.error?.type) return `${b.error.type}: ${b.error.reason || ''}`;
  if (b.message) return b.message;
  if (b.raw) return String(b.raw).slice(0, 200);
  return JSON.stringify(b).slice(0, 200);
}

export const OS_PERMISSION_GUIDE = `Tài khoản đang dùng thiếu quyền trên OpenSearch. Cách sửa (chọn một):

A) Tự động: chạy  npm run engine:setup -- --create-user  bằng tài khoản admin của OpenSearch.
   Script tạo index, role "mysearch_app" và user "mysearch" với đúng quyền tối thiểu.

B) Thủ công trong OpenSearch Dashboards → Security → Roles → Create role:
   • Cluster permissions: cluster_monitor
   • Index permissions: index pattern  pages  (đúng tên OPENSEARCH_INDEX), permissions  indices_all
   Rồi tab "Mapped users" → map user bạn đang dùng vào role đó.
   (Aiven: nếu không thấy menu Security, bật tùy chọn quản lý OpenSearch Security trong phần
   Advanced configuration của service, hoặc kiểm tra mục ACL/Users của service.)`;

export const ES_PERMISSION_GUIDE = `Tài khoản/API key đang dùng thiếu quyền trên Elasticsearch. Cách sửa:
• Chạy  npm run engine:setup -- --create-user  bằng tài khoản có quyền quản lý security, hoặc
• Kibana → Stack Management → Roles: cluster privilege "monitor", index  pages  với privilege "all";
  gán role cho user (hoặc tạo API key với quyền đó) rồi đặt vào .env.`;

const NET_HINTS = {
  ECONNREFUSED: 'Không kết nối được: kiểm tra dịch vụ đang chạy và địa chỉ/cổng trong .env.',
  ENOTFOUND: 'Không phân giải được tên máy chủ: kiểm tra lại URL trong .env.',
  EAI_AGAIN: 'Không phân giải được tên máy chủ (DNS): kiểm tra mạng của server.',
  ETIMEDOUT: 'Quá thời gian chờ: kiểm tra firewall hoặc danh sách IP được phép của dịch vụ (Aiven: Allowed IP addresses).',
  UND_ERR_CONNECT_TIMEOUT: 'Quá thời gian kết nối: kiểm tra firewall hoặc danh sách IP được phép của dịch vụ.',
  UND_ERR_HEADERS_TIMEOUT: 'Dịch vụ phản hồi quá chậm hoặc bị quá tải.',
  ECONNRESET: 'Kết nối bị ngắt: kiểm tra giao thức (http/https) và cổng trong URL.',
};
const CERT = /SELF_SIGNED|UNABLE_TO_VERIFY|CERT_|DEPTH_ZERO|ERR_TLS|self.signed|certificate/i;

export function explain(e, provider = '') {
  const code = e?.code || e?.cause?.code || '';
  const msg = String(e?.message || e).slice(0, 400);
  const status = e?.status ?? e?.httpStatus ?? e?.cause?.httpStatus;
  const type = String(e?.type || e?.code || '');
  const isEs = provider === 'opensearch' || provider === 'elasticsearch';
  let hint = '';

  if (NET_HINTS[code]) hint = NET_HINTS[code];
  else if (CERT.test(code) || CERT.test(msg)) {
    hint = 'Chứng chỉ TLS không được tin cậy: tải CA certificate của dịch vụ và đặt biến *_CA_PATH tương ứng trong .env.';
  } else if (status === 401 || /invalid_api_key|missing_authorization|unauthori[sz]ed|authentication/i.test(type + msg)) {
    hint = 'Sai thông tin xác thực: kiểm tra user/mật khẩu hoặc API key trong .env.';
  } else if (status === 403 || /security_exception|forbidden|permission|not authorized|insufficient/i.test(type + msg)) {
    if (provider === 'opensearch') hint = OS_PERMISSION_GUIDE;
    else if (provider === 'elasticsearch') hint = ES_PERMISSION_GUIDE;
    else if (provider === 'typesense') hint = 'API key không đủ quyền: dùng key có quyền collections:* và documents:* (hoặc admin key).';
    else if (provider === 'meilisearch') hint = 'Key không đủ quyền: dùng master key hoặc key có quyền indexes.create, documents.add, documents.delete, search.';
    else hint = 'Không đủ quyền thực hiện thao tác này.';
  } else if (isEs && /index_not_found/.test(type + msg)) {
    hint = 'Index chưa tồn tại: chạy  npm run engine:setup  hoặc cấp quyền tạo index (indices:admin/create) cho tài khoản.';
  } else if (isEs && /mapper_parsing|illegal_argument|strict_dynamic_mapping/.test(type + msg)) {
    hint = 'Index cũ có mapping khác: xóa index (DELETE /<tên index>) rồi khởi động lại app và crawl lại.';
  } else if (isEs && /cluster_block|index_create_block|read.only|FORBIDDEN\/12/i.test(type + msg)) {
    hint = 'Index/cluster đang bị khóa ghi (thường do ổ đĩa gần đầy): giải phóng dung lượng rồi gỡ read-only block.';
  } else if (status === 429 || /circuit_breaking|rejected_execution|too_many/i.test(type + msg)) {
    hint = 'Engine đang quá tải: giảm tốc độ crawl (CRAWL_DELAY_MS) hoặc nâng gói dịch vụ.';
  } else if (status === 413) {
    hint = 'Dữ liệu gửi lên quá lớn so với giới hạn của dịch vụ.';
  } else if (status >= 500) {
    hint = 'Engine báo lỗi nội bộ: xem log của chính dịch vụ engine.';
  }
  return { message: msg, hint };
}
