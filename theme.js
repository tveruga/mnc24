// Тёмная тема для CRM и окон DIR HELPER (кнопка ☀/☾ рядом с «?») — в стиле «ночного» Telegram с зелёными акцентами.
// Цвета — в dark-crm.css / dark-ext.css / dark-sidebar.css (генерирует tools/gen-dark.mjs), действуют при классе html.dh-dark.
// Выбор хранится в storage.local.dhTheme ('light' | 'dark' | палитра из DH_THEMES) и сразу применяется во всех вкладках и окнах.
// ---- меню тем (кнопка ☀/☾) ----
// значение storage dhTheme: 'light' | 'dark' (ночной Telegram) | ключ палитры (цвета — в dark-*.css, html[data-dh-pal])
var DH_THEMES = [
  { k: 'light',    n: 'Обычная',          c: ['#ffffff', '#eef6f1', '#d9e6de', '#22a35a', '#166534'] },
  { k: 'sky',      n: 'Sky Breeze',       c: ['#f8fafc', '#eef2ff', '#cbd5e1', '#93c5fd', '#3b82f6'] },
  { k: 'sage',     n: 'Sage Light',       c: ['#fafdf7', '#ecfdf5', '#d1fae5', '#86efac', '#22c55e'] },
  { k: 'rose',     n: 'Rose Dream',       c: ['#fff7fa', '#fce7f3', '#f9a8d4', '#f472b6', '#ec4899'] },
  { k: 'sunny',    n: 'Sunny Glow',       c: ['#fffbeb', '#fff3cd', '#fcd34d', '#f59e0b', '#d97706'] },
  { k: 'lavender', n: 'Lavender Sky',     c: ['#faf5ff', '#f3e8ff', '#d8b4fe', '#a855f7', '#7c3aed'] },
  { k: 'dark',     dark: 1, n: 'Ночной Telegram',  c: ['#0e1621', '#17212b', '#263445', '#22a35a', '#5fd08a'] },
  { k: 'midnight', dark: 1, n: 'Midnight',         c: ['#0b0f14', '#1a1f26', '#2b323c', '#4a5568', '#8a94a6'] },
  { k: 'forest', dark: 1,   n: 'Forest Night',     c: ['#0b120d', '#1b2a1f', '#2e4d34', '#6ca36a', '#a8d5a2'] },
  { k: 'obsidian', dark: 1, n: 'Obsidian',         c: ['#0a0a0a', '#1c1c1e', '#2f2f33', '#5a5a5f', '#9a9aa0'] },
  { k: 'emerald', dark: 1,  n: 'Emerald Shadow',   c: ['#0a0f0d', '#142821', '#1f4d3a', '#3fbf97', '#7fd9b6'] },
  { k: 'purple', dark: 1,   n: 'Purple Eclipse',   c: ['#0d0b14', '#1a1525', '#2e1f44', '#6a3d9a', '#b78cff'] },
];
(function () {
  if (window.__dhTheme) return; window.__dhTheme = true;
  const isExt = location.protocol === 'moz-extension:';
  // скрытые окна CRM внутри самой CRM не трогаем
  if (!isExt && window !== window.top) {
    let parentIsCrm = false; try { parentIsCrm = window.parent.location.hostname === location.hostname; } catch (e) {}
    if (parentIsCrm) return;
  }
  // ячейки таблиц с яркой заливкой (статус, тип, время) — помечаем, чтобы текст в них был тёмным
  let litT = 0;
  const lit = () => {
    if (isExt || !document.documentElement.classList.contains('dh-dark')) return;
    document.querySelectorAll('td,th').forEach((td) => {
      const m = getComputedStyle(td).backgroundColor.match(/[\d.]+/g); if (!m) return;
      const [r, g, b, a = 1] = m.map(Number);
      td.classList.toggle('dh-lit', +a > 0.5 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.45);
    });
  };
  const litSoon = () => { clearTimeout(litT); litT = setTimeout(lit, 250); };
  const apply = (t) => {
    const de = document.documentElement, th = DH_THEMES.find((x) => x.k === t) || DH_THEMES[0];
    de.classList.toggle('dh-dark', !!th.dark);
    de.classList.toggle('dh-lt', !th.dark && th.k !== 'light');                         // светлые палитры
    if (th.k !== 'light' && th.k !== 'dark') de.dataset.dhPal = th.k; else delete de.dataset.dhPal;   // палитра: переменные --dh-* в dark-*.css
    try { localStorage.setItem('dhTheme', t); } catch (e) {} litSoon();
  };
  // сразу из localStorage (без вспышки светлой страницы), потом — точное значение из настроек дополнения
  try { const t = localStorage.getItem('dhTheme'); if (t) apply(t); } catch (e) {}
  if (!isExt) {
    document.addEventListener('DOMContentLoaded', litSoon);
    new MutationObserver(litSoon).observe(document.documentElement, { childList: true, subtree: true });
  }
  try {
    browser.storage.local.get('dhTheme').then((r) => apply(r.dhTheme || 'light')).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.dhTheme) apply(ch.dhTheme.newValue || 'light'); });
  } catch (e) {}
})();

const DH_SUN = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></svg>';
const DH_MOON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>';
function dhThemeMenu(btn, cur) {
  const doc = btn.ownerDocument; const old = doc.getElementById('dh-theme-menu'); if (old) { old.remove(); return; }
  const m = doc.createElement('div'); m.id = 'dh-theme-menu'; m.setAttribute('role', 'menu');
  m.style.cssText = 'position:fixed;z-index:2147483647;min-width:230px;padding:6px;border-radius:12px;background:#1c1f24;color:#eef0f3;box-shadow:0 14px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.08);font:13px "Segoe UI",system-ui,sans-serif';
  const head = (x) => `<div style="padding:8px 10px 4px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.6">${x}</div>`;
  m.innerHTML = DH_THEMES.map((t, i) => (i === 0 ? head('Светлые') : t.k === 'dark' ? head('Тёмные') : '') +
    `<button type="button" role="menuitemradio" aria-checked="${t.k === cur}" data-k="${t.k}" style="display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:${t.k === cur ? 'rgba(255,255,255,.1)' : 'transparent'};color:inherit;font:inherit;text-align:left;cursor:pointer">` +
    `<span style="display:flex;border-radius:5px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.18);flex:none">${t.c.map((c) => `<i style="display:block;width:13px;height:18px;background:${c}"></i>`).join('')}</span>` +
    `<span style="flex:1">${t.n}</span><span style="width:14px;flex:none">${t.k === cur ? '✓' : ''}</span></button>`).join('');
  m.querySelectorAll('button').forEach((b) => {
    b.onmouseenter = () => { if (b.dataset.k !== cur) b.style.background = 'rgba(255,255,255,.06)'; };
    b.onmouseleave = () => { if (b.dataset.k !== cur) b.style.background = 'transparent'; };
    b.onclick = (e) => { e.stopPropagation(); browser.storage.local.set({ dhTheme: b.dataset.k }).catch(() => {}); close(); };
  });
  (doc.body || doc.documentElement).appendChild(m);
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, vw - w - 8)) + 'px';
  m.style.top = (r.bottom + 6 + h > vh && r.top - 6 - h > 0 ? r.top - 6 - h : r.bottom + 6) + 'px';
  const onDoc = (e) => { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { m.remove(); doc.removeEventListener('mousedown', onDoc, true); doc.removeEventListener('keydown', onKey, true); }
  setTimeout(() => { doc.addEventListener('mousedown', onDoc, true); doc.addEventListener('keydown', onKey, true); }, 0);
}
function dhThemeButton(btn) {
  let cur = 'light';
  const show = (t) => {
    cur = t || 'light'; const th = DH_THEMES.find((x) => x.k === cur) || DH_THEMES[0];
    btn.innerHTML = th.dark ? DH_MOON : DH_SUN;
    btn.title = `Тема: ${th.n} — нажмите, чтобы выбрать`; btn.setAttribute('aria-label', btn.title); btn.setAttribute('aria-haspopup', 'menu');
  };
  { const de = document.documentElement; show(de.dataset.dhPal || (de.classList.contains('dh-dark') ? 'dark' : 'light')); }
  try {
    browser.storage.local.get('dhTheme').then((r) => show(r.dhTheme)).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.dhTheme) show(ch.dhTheme.newValue); });
  } catch (e) {}
  btn.addEventListener('click', (e) => { e.stopPropagation(); dhThemeMenu(btn, cur); });
}
