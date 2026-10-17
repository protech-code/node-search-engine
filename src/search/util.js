export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Escape HTML trước, sau đó mới đổi marker [[ ]] thành <mark> -> an toàn XSS.
export const hl = s => esc(s).replaceAll('[[', '<mark>').replaceAll(']]', '</mark>');
export const PRE = '[[';
export const POST = ']]';
