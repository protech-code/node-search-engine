// ===== Gợi ý từ khóa (dropdown tự viết: chạy tốt trên di động, có phím mũi tên) =====
const form = document.querySelector('.searchbox');
const input = form?.querySelector('input[name="q"]');
if (form && input) {
  const historyKey = 'search-history';
  const getHistory = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
      return Array.isArray(saved) ? saved.filter(x => typeof x === 'string').slice(0, 8) : [];
    } catch { return []; }
  };
  const saveHistory = query => {
    const normalized = query.trim();
    if (!normalized) return;
    const next = [normalized, ...getHistory().filter(x => x.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
    try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch {}
    renderRecentSearches();
  };
  const recentPanel = document.querySelector('.recent-searches');
  const renderRecentSearches = () => {
    if (!recentPanel) return;
    const history = getHistory();
    const list = recentPanel.querySelector('ul');
    list.replaceChildren(...history.map(query => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '/search?q=' + encodeURIComponent(query);
      link.textContent = query;
      item.appendChild(link);
      return item;
    }));
    recentPanel.hidden = !history.length;
  };
  renderRecentSearches();
  recentPanel?.querySelector('.recent-clear')?.addEventListener('click', () => {
    try { localStorage.removeItem(historyKey); } catch {}
    renderRecentSearches();
  });

  const list = document.createElement('ul');
  list.className = 'suggest'; list.id = 'suggest-list'; list.hidden = true;
  list.setAttribute('role', 'listbox');
  (form.querySelector('.search-field') || form).appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'suggest-list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('autocomplete', 'off');

  let items = [], active = -1, timer, ctrl, seq = 0;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const go = t => { input.value = t; form.requestSubmit ? form.requestSubmit() : form.submit(); };
  const render = () => {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `suggest-option-${i}`;
      li.setAttribute('aria-selected', String(i === active));
      li.className = (it.k === 'p' ? 'page' : it.k === 'r' ? 'recent' : 'kw') + (i === active ? ' on' : '');
      li.textContent = it.t; // textContent: an toàn XSS
      li.addEventListener('pointerdown', e => { e.preventDefault(); go(it.t); });
      return li;
    }));
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `suggest-option-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const mergeSuggestions = (serverItems, query) => {
    const needle = query.trim().toLowerCase();
    const recent = getHistory()
      .filter(t => !needle || t.toLowerCase().startsWith(needle))
      .map(t => ({ t, k: 'r' }));
    const seen = new Set();
    return [...recent, ...serverItems].filter(item => {
      const key = item.t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  };
  const load = async () => {
    const query = input.value.trim();
    const my = ++seq;
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const r = await fetch('/suggest?q=' + encodeURIComponent(query), { signal: ctrl.signal });
      if (!r.ok) throw new Error('bad');
      const d = await r.json();
      if (my !== seq) return; // bỏ kết quả cũ
      items = mergeSuggestions(Array.isArray(d) ? d : [], query); active = -1; render();
    } catch (e) { if (my === seq && e.name !== 'AbortError') { items = mergeSuggestions([], query); render(); } }
  };
  const clearButton = form.querySelector('.search-clear');
  const syncClearButton = () => { if (clearButton) clearButton.hidden = !input.value; };
  syncClearButton();
  clearButton?.addEventListener('click', () => {
    input.value = '';
    syncClearButton();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.addEventListener('input', syncClearButton);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 150); });
  input.addEventListener('focus', () => { if (!input.value.trim()) load(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!list.hidden) close();
      else if (input.value) {
        input.value = '';
        syncClearButton();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(items[active].t); }
  });
  form.addEventListener('submit', () => saveHistory(input.value));

  const voiceButton = form.querySelector('.search-voice');
  const voiceStatus = form.querySelector('.search-status');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (voiceButton && SpeechRecognition) {
    voiceButton.hidden = false;
    const recognition = new SpeechRecognition();
    recognition.lang = document.documentElement.lang || 'vi';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    voiceButton.addEventListener('click', () => {
      voiceStatus.textContent = '';
      try { recognition.start(); } catch { voiceStatus.textContent = voiceButton.dataset.error; }
    });
    recognition.onstart = () => {
      voiceButton.setAttribute('aria-pressed', 'true');
      voiceStatus.textContent = voiceButton.dataset.listening;
    };
    recognition.onresult = event => {
      input.value = event.results[0][0].transcript;
      syncClearButton();
      form.requestSubmit ? form.requestSubmit() : form.submit();
    };
    recognition.onerror = () => { voiceStatus.textContent = voiceButton.dataset.error; };
    recognition.onend = () => {
      voiceButton.setAttribute('aria-pressed', 'false');
      if (voiceStatus.textContent === voiceButton.dataset.listening) voiceStatus.textContent = '';
    };
  }
}

document.addEventListener('keydown', e => {
  const searchShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
  const slashShortcut = e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (!searchShortcut && !slashShortcut) return;
  if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
  const searchInput = document.querySelector('.searchbox input[name="q"]');
  if (searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

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
