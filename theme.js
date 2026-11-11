// Тёмная тема для CRM и окон DIR HELPER (кнопка ☀/☾ рядом с «?») — в стиле «ночного» Telegram с зелёными акцентами.
// Цвета — в dark-crm.css / dark-ext.css / dark-sidebar.css (генерирует tools/gen-dark.mjs), действуют при классе html.dh-dark.
// Выбор хранится в storage.local.dhTheme ('light' | 'dark' | палитра из DH_THEMES) и сразу применяется во всех вкладках и окнах.
// ---- меню тем (кнопка ☀/☾) ----
// значение storage dhTheme: 'light' | 'dark' (ночной Telegram) | ключ палитры (цвета — в dark-*.css, html[data-dh-pal])
var DH_THEMES = [
  { k: 'light',    n: 'Обычная',          c: ['#ffffff', '#eef6f1', '#d9e6de', '#22a35a', '#166534'] },
  { k: 'breeze',   n: 'Light Breeze',     c: ['#f7faff', '#e3edfc', '#c7d9f5', '#93c5fd', '#3b82f6'] },
  { k: 'skywhite', n: 'Sky White',        c: ['#ffffff', '#f3f6fb', '#e1e8f2', '#93c5fd', '#2563eb'] },
  { k: 'rose',     n: 'Rose Dream',       c: ['#fffafc', '#f8edf2', '#ecd6e0', '#d594b0', '#ad426f'] },
  { k: 'lavender', n: 'Lavender Cloud',   c: ['#fbf9ff', '#ece6fd', '#d6cbf7', '#a78bfa', '#7c3aed'] },
  { k: 'sage',     n: 'Sage Light',       c: ['#fafdf7', '#ecfdf5', '#d1fae5', '#86efac', '#22c55e'] },
  { k: 'sunny',    n: 'Sunny Glow',       c: ['#fffbeb', '#fff3cd', '#fcd34d', '#f59e0b', '#d97706'] },
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
  // Ячейки с цветной заливкой (статус, тип, время) в тёмных и светлых палитрах — «таблетка» с цветной точкой
  // вместо сплошной заливки ячейки: класс dh-lit (+ dh-pilled, если содержимое обёрнуто в span.dh-pill) и переменные
  // --st-bg/--st-fg/--st-dot; правила — в .tools/dark-crm.manual.css. Известные статусы — фиксированная гамма
  // (ST_D — тёмные, ST_L — светлые), остальные — по оттенку исходной заливки CRM.
  const ST_D = [
    [/^ожида/, '#145438', '#a1f4bf'],
    [/^в пути/, '#0c4f60', '#8eeafa'],
    [/^в работе/, '#62400c', '#ffdb87'],
    [/^гарант/, '#6a203b', '#ffc0d4'],
    [/^готов/, '#233f7a', '#bed5ff'],
    [/^повтор/, '#603b22', '#ffd0a3'],
    [/^выдан/, '#36455f', '#d8e4f8'],
    [/^впервые/, '#2d4363', '#d1e4ff'],
    [/^срочн/, '#721f2b', '#ffb8bf'],
  ];
  const ST_L = [
    [/^ожида/, '#9ee8b6', '#10542b', '#22c55e'],
    [/^в пути/, '#9fe3f2', '#07556b', '#06b6d4'],
    [/^в работе/, '#ffd28b', '#793c04', '#f59e0b'],
    [/^гарант/, '#ffb4ce', '#8c103b', '#f43f5e'],
    [/^готов/, '#b4ceff', '#183f96', '#3b82f6'],
    [/^повтор/, '#eac39f', '#6e3915', '#c8844e'],
    [/^выдан/, '#ccd6e5', '#334155', '#94a3b8'],
    [/^впервые/, '#cdddf4', '#2a466d', '#a3afc2'],
    [/^срочн/, '#ffb4bd', '#951827', '#ef4444'],
  ];
  const rgbHue = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return -1; const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60; };
  // обернуть содержимое ячейки в «таблетку» — только простой текст/ссылки (поля ввода, кнопки, картинки не трогаем)
  const pill = (td) => {
    if (td.querySelector(':scope > .dh-pill')) return true;
    if (!(td.textContent || '').trim() || td.querySelector('input,select,button,textarea,form,img,table,svg')) return false;
    const sp = document.createElement('span'); sp.className = 'dh-pill';
    while (td.firstChild) sp.appendChild(td.firstChild);
    td.appendChild(sp); return true;
  };
  let litT = 0;
  const lit = () => {
    if (isExt) return;
    const de = document.documentElement, dark = de.classList.contains('dh-dark'), light = de.classList.contains('dh-lt');
    const old = [...document.querySelectorAll('td.dh-lit,th.dh-lit')];
    old.forEach((td) => td.classList.remove('dh-lit', 'dh-pilled'));   // читаем исходную заливку CRM (без нашей подмены)
    if (!dark && !light) { if (mo) mo.takeRecords(); return; }
    // фоны самой светлой палитры — не статусы
    const own = new Set();
    if (light) { const cs = getComputedStyle(de); ['lbg0', 'lbg1', 'lbg2', 'laccbg'].forEach((k) => { const p = document.createElement('i'); p.style.color = cs.getPropertyValue('--dh-' + k).trim(); if (p.style.color) own.add(p.style.color.replace(/\s/g, '')); }); }
    const res = [];
    // текст ячейки (или вложенного элемента с текстом) исходно красный
    const redText = (td) => [td, ...td.querySelectorAll('*')].some((el) => {
      if (!(el.textContent || '').trim()) return false;
      const m = getComputedStyle(el).color.match(/[\d.]+/g); if (!m) return false;
      const [r, g, b] = m.map(Number), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return mx === r && mx - mn > 90 && g < r * 0.6 && b < r * 0.6;   // насыщенный красный
    });
    // ячейка в колонке «Время заявки» (по заголовку таблицы)
    const cols = new Map();
    const timeCol = (td) => {
      if (td.tagName !== 'TD' || !td.closest('tbody')) return false;
      const t = td.closest('table'); if (!t) return false;
      if (!cols.has(t)) { const th = [...t.querySelectorAll('thead th')].find((x) => /время заявки/i.test(x.textContent || '')); cols.set(t, th ? th.cellIndex : -1); }
      const ci = cols.get(t); return ci >= 0 && td.cellIndex === ci;
    };
    document.querySelectorAll('td,th').forEach((td) => {
      const cb = getComputedStyle(td).backgroundColor, m = cb.match(/[\d.]+/g); if (!m) return;
      const [r, g, b, a = 1] = m.map(Number);
      const txt = (td.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const st = (dark ? ST_D : ST_L).find((s) => s[0].test(txt));
      // без заливки: «таблетка», только если вся ячейка — известный статус/тип (короткий текст в строке таблицы)
      const byText = st && txt.length <= 26 && td.tagName === 'TD' && !!td.closest('tbody');
      // простая дата без заливки в колонке «Время заявки» — нейтральная таблетка
      const plainDate = () => txt.length <= 20 && /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(txt) && timeCol(td);
      // у «Срочной» CRM красит текст времени красным — сохраняем красный
      const neutral = () => res.push(redText(td) ? (dark ? [td, '#651f2b', '#ffb8bf', '#ffb8bf'] : [td, '#ffbcc5', '#951827', '#dc2626'])
        : (dark ? [td, '#30435f', '#dce8fc', '#dce8fc'] : [td, '#d3dff0', '#263e60', '#94a3b8']));
      if (!(+a > 0.5)) { if (byText) res.push([td, st[1], st[2], st[3] || st[2]]); else if (plainDate()) neutral(); return; }
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, chroma = mx - mn, sat = mx === mn ? 0 : chroma / (1 - Math.abs(2 * l - 1));
      if (dark && !byText && !((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.45 || (sat > 0.45 && l >= 0.3))) { if (plainDate()) neutral(); return; }   // тёмные фоны темы (l < .3) не трогаем
      // светлые: только заметно цветные заливки (серая — если это известный статус, напр. «Выдан»)
      if (!dark && !byText && (own.has(`rgb(${r},${g},${b})`) || !(chroma > 0.2 || (st && l < 0.85)))) { if (plainDate()) neutral(); return; }
      let bg, fg, dot;
      if (st) [, bg, fg, dot] = st;
      else {
        const h = rgbHue(r, g, b), hh = h.toFixed(0);
        if (dark) { bg = h < 0 ? '#34445c' : `hsl(${hh},58%,24%)`; fg = h < 0 ? '#dce8fc' : `hsl(${hh},90%,82%)`; }
        else { bg = h < 0 ? '#d3dff0' : `hsl(${hh},85%,81%)`; fg = h < 0 ? '#263e60' : `hsl(${hh},75%,23%)`; dot = h < 0 ? '#94a3b8' : `hsl(${hh},75%,50%)`; }
      }
      res.push([td, bg, fg, dot || fg]);
    });
    res.forEach(([td, bg, fg, dot]) => {
      td.style.setProperty('--st-bg', bg); td.style.setProperty('--st-fg', fg); td.style.setProperty('--st-dot', dot);
      td.classList.add('dh-lit'); if (pill(td)) td.classList.add('dh-pilled');
      td.classList.toggle('dh-pill-t', /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test((td.textContent || '').trim()));   // дата/время — компактно, без точки
    });
    if (mo) mo.takeRecords();   // свои правки (классы, --st-*, обёртки) — не повод запускаться снова
  };
  let mo = null;
  const litSoon = () => { clearTimeout(litT); litT = setTimeout(lit, 250); };
  const apply = (t) => {
    if (t === 'sky') t = 'breeze';
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
    // CRM перекрашивает ячейки и после загрузки (просроченное время и т.п.) — следим и за style/class
    mo = new MutationObserver(litSoon);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  try {
    browser.storage.local.get('dhTheme').then((r) => apply(r.dhTheme || 'light')).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.dhTheme) apply(ch.dhTheme.newValue || 'light'); });
  } catch (e) {}
})();

const DH_SUN = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></svg>';
const DH_MOON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>';
function dhThemeMenu(btn, cur) {
  const doc = btn.ownerDocument; const old = doc.getElementById('dh-theme-menu'); if (old) { old.dispatchEvent(new Event('dh-close')); return; }
  const m = doc.createElement('div'); m.id = 'dh-theme-menu'; m.setAttribute('role', 'menu');
  m.setAttribute('aria-label', 'Выбор темы'); btn.setAttribute('aria-expanded', 'true');
  const head = (x) => `<div class="dh-theme-heading" role="presentation">${x}</div>`;
  m.innerHTML = DH_THEMES.map((t, i) => (i === 0 ? head('Светлые') : t.k === 'dark' ? head('Тёмные') : '') +
    `<button type="button" role="menuitemradio" aria-checked="${t.k === cur}" data-k="${t.k}" tabindex="${t.k === cur ? 0 : -1}">` +
    `<span class="dh-theme-swatches" aria-hidden="true">${t.c.map((c) => `<i style="background:${c}"></i>`).join('')}</span>` +
    `<span class="dh-theme-name">${t.n}</span><span class="dh-theme-check" aria-hidden="true">${t.k === cur ? '✓' : ''}</span></button>`).join('');
  m.querySelectorAll('button').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); browser.storage.local.set({ dhTheme: b.dataset.k }).catch(() => {}); close(); };
  });
  (doc.body || doc.documentElement).appendChild(m);
  m.style.maxHeight = Math.max(80, doc.documentElement.clientHeight - 16) + 'px';
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, vw - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(r.bottom + 6 + h > vh ? r.top - 6 - h : r.bottom + 6, vh - h - 8)) + 'px';
  const onDoc = (e) => { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    else if (e.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); const all = [...m.querySelectorAll('button')], i = all.indexOf(doc.activeElement);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
      all.forEach((b, j) => b.tabIndex = j === n ? 0 : -1); all[n].focus();
    }
  };
  function close() { m.remove(); btn.setAttribute('aria-expanded', 'false'); doc.removeEventListener('mousedown', onDoc, true); doc.removeEventListener('keydown', onKey, true); }
  m.addEventListener('dh-close', close, { once: true });
  doc.addEventListener('mousedown', onDoc, true); doc.addEventListener('keydown', onKey, true);
  (m.querySelector('[aria-checked="true"]') || m.querySelector('button')).focus({ preventScroll: true });
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
