// ===== Gợi ý từ khóa (dropdown tự viết: chạy tốt trên di động, có phím mũi tên) =====
const form = document.querySelector('.searchbox');
const input = form?.querySelector('input[name="q"]');
if (form && input) {
  const list = document.createElement('ul');
  list.className = 'suggest'; list.id = 'suggest-list'; list.hidden = true;
  list.setAttribute('role', 'listbox');
  form.appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'suggest-list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');

  let items = [], active = -1, timer, ctrl, seq = 0;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const go = t => { input.value = t; form.requestSubmit ? form.requestSubmit() : form.submit(); };
  const render = () => {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = (it.k === 'p' ? 'page' : 'kw') + (i === active ? ' on' : '');
      li.textContent = it.t; // textContent: an toàn XSS
      li.addEventListener('pointerdown', e => { e.preventDefault(); go(it.t); });
      return li;
    }));
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
  };
  const load = async () => {
    const my = ++seq;
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const r = await fetch('/suggest?q=' + encodeURIComponent(input.value.trim()), { signal: ctrl.signal });
      if (!r.ok) throw new Error('bad');
      const d = await r.json();
      if (my !== seq) return; // bỏ kết quả cũ
      items = Array.isArray(d) ? d : []; active = -1; render();
    } catch (e) { if (my === seq && e.name !== 'AbortError') { items = []; render(); } }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 150); });
  input.addEventListener('focus', () => { if (!input.value.trim()) load(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(items[active].t); }
    else if (e.key === 'Escape') close();
  });
}

// ===== Đổi sáng/tối (lưu cookie để server render đúng ngay lần sau, không bị nháy) =====
document.querySelector('.theme-toggle')?.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur === 'dark' || (cur !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
});

// ===== Per-admin appearance preferences =====
const adminMode = document.querySelector('[data-admin-theme-mode]');
const adminAccent = document.querySelector('[data-admin-accent-input]');
if (adminMode && adminAccent) {
  const root = document.documentElement;
  const setPreference = (name, value) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/admin; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  };
  const inkFor = color => {
    const channels = color.match(/[0-9a-f]{2}/gi)?.map(v => parseInt(v, 16) / 255) || [];
    const luminance = channels.reduce((sum, v, i) => {
      const linear = v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][i];
    }, 0);
    return luminance > 0.45 ? '#111111' : '#ffffff';
  };
  const applyAccent = color => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    root.style.setProperty('--brand', color);
    root.style.setProperty('--brand-ink', inkFor(color));
    adminAccent.value = color;
    setPreference('admin_accent', color);
  };
  adminMode.addEventListener('change', () => {
    const mode = ['auto', 'light', 'dark'].includes(adminMode.value) ? adminMode.value : 'auto';
    root.dataset.theme = mode;
    setPreference('admin_theme', mode);
  });
  adminAccent.addEventListener('input', () => applyAccent(adminAccent.value));
  document.querySelectorAll('[data-admin-accent]').forEach(button => {
    button.addEventListener('click', () => applyAccent(button.dataset.adminAccent));
  });
}

// ===== Xác nhận cho nút nguy hiểm =====
document.querySelectorAll('[data-confirm]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (confirm(btn.dataset.confirm)) btn.form.submit();
  });
});
