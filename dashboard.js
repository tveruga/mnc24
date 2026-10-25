// МНЧ — Аналитика (выдвижное меню на странице CRM). Источник: Отчёты → Отчёт по городу
(async function () {
if (window.__mncDash) return;
if (window !== window.top) { let p = false; try { p = window.parent.location.hostname === location.hostname; } catch (e) {} if (p) return; }
// активация (см. content.js)
{ let act = false; try { const r = await browser.storage.local.get('dhAct'); act = !!(r.dhAct && r.dhAct.ok); if (!act) act = !!(await browser.runtime.sendMessage({ dhCheckAct: true })); } catch (e) {} if (!act) return; }

const BASE = location.origin;
const CITY_REPORT = BASE + '/admin/domain/report-city-complex/index?city=3';
let ROOT = null, view = null;
const $ = (s) => ROOT.querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dd = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

let PERIOD = 'today';
let CMP = 'day';
let CMPON = false; // «Сегодня»: сравнение со вчера — только по кнопке
let STATE = null;

// ---------- Разбор ----------
function parseNum(t) {
  t = String(t || '').replace(/ /g, ' ').trim();
  if (!t || t === '-' || t === '—') return null;
  if (!/^[-+]?\s*[\d\s]+([.,]\d+)?\s*(%|р\.?|руб\.?|₽|шт\.?)?$/i.test(t)) return null;
  return parseFloat(t.replace(/[^\d,.\-]/g, '').replace(',', '.'));
}
const cellText = (c) => c.textContent.replace(/\s+/g, ' ').trim();
function titleOf(tb) {
  let n = tb;
  for (let k = 0; k < 14 && n; k++) {
    if (n.previousElementSibling) {
      n = n.previousElementSibling;
      if (n.querySelector && n.querySelector('table')) continue;
      const t = cellText(n);
      if (t && t.length <= 90 && !/^всего\s/i.test(t)) return t;
    } else n = n.parentElement;
  }
  return '';
}
function readTable(tb) {
  const hr = [...tb.querySelectorAll('thead tr')].map((r) => [...r.cells].map(cellText));
  const heads = hr.sort((a, b) => b.filter(Boolean).length - a.filter(Boolean).length)[0] || [];
  const rows = [...tb.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map(cellText)).filter((r) => r.length >= Math.max(2, heads.length - 1));
  return { title: titleOf(tb), heads, rows, el: tb };
}
const col = (t, re) => t.heads.findIndex((h) => re.test(h));
function findTables(doc) {
  const all = [...doc.querySelectorAll('table')].map(readTable).filter((t) => t.heads.length);
  const city = all.filter((t) => col(t, /^оборот/i) >= 0 && col(t, /город/i) >= 0);
  const today = city.find((t) => /сегодня/i.test(t.title)) || (city.length > 1 ? city[0] : null);
  const period = city.find((t) => t !== today && /\d{2}\.\d{2}\.\d{4}.*по/i.test(t.title)) || city.find((t) => t !== today) || city[0] || null;
  const masters = all.find((t) => col(t, /^фио$/i) >= 0 && col(t, /^зарплата$/i) >= 0) || null;
  const reqs = all.find((t) => col(t, /^мастер(\s|$)/i) >= 0 && col(t, /^чистыми/i) >= 0 && col(t, /^город$/i) < 0) || null;
  return { today, period, masters, reqs };
}

// ---------- Загрузка отчёта: как руками — даты в поля и «Поиск» ----------
function fmtLike(sample, d) {
  const D = pad(d.getDate()), M = pad(d.getMonth() + 1), Y = String(d.getFullYear());
  let m;
  sample = String(sample || '').trim();
  if ((m = sample.match(/^\d{4}([.\-/])\d{2}\1\d{2}/))) return Y + m[1] + M + m[1] + D;
  if ((m = sample.match(/^\d{2}([.\-/])\d{2}\1(\d{2,4})/))) return D + m[1] + M + m[1] + (m[2].length === 2 ? Y.slice(2) : Y);
  return D + '-' + M + '-' + Y;
}
function dateInputs(d) {
  const ins = [...d.querySelectorAll('input')].filter((i) => !['hidden', 'checkbox', 'radio', 'submit', 'button'].includes(i.type));
  let list = ins.filter((i) => /^\d{2}[.\-/]\d{2}[.\-/]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(i.value.trim()));
  if (list.length < 2) list = ins.filter((i) => /date|дата|datepicker/i.test(i.name + ' ' + i.id + ' ' + i.className));
  return list.slice(0, 2);
}
const FRAMES = new Set();
function abortFrames() { FRAMES.forEach((f) => { try { f.__abort && f.__abort(); } catch (e) {} try { f.remove(); } catch (e) {} }); FRAMES.clear(); }
function regFrame(f, abort) { f.__abort = abort; FRAMES.add(f); }
// лёгкая проверка таблицы заявок (без разбора всех ячеек)
function hasReqsCheap(d) {
  return [...d.querySelectorAll('table thead')].some((th) => { const t = th.textContent; return /Мастер/.test(t) && /Чистыми/.test(t) && !/Город/.test(t); });
}
function loadPeriod([a, b], needReqs = true) {
  const want = `${dd(a)} по ${dd(b)}`;
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1400px;height:900px;border:0;opacity:0;pointer-events:none';
    f.src = CITY_REPORT;
    let submitted = false, finished = false, poll = null, timer = null, foundAt = 0, reqsAt = 0;
    const finish = (err) => {
      if (finished) return; finished = true;
      clearInterval(poll); clearTimeout(timer); FRAMES.delete(f);
      if (err) { f.remove(); return reject(err); }
      try {
        const html = f.contentDocument.documentElement.outerHTML, url = f.contentWindow.location.href;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const base = doc.createElement('base'); base.href = url; doc.head.prepend(base);
        resolve({ doc, url, frame: f });
      } catch (e) { f.remove(); reject(e); }
    };
    timer = setTimeout(() => finish(new Error('Отчёт не загрузился за 60 секунд')), 60000);
    regFrame(f, () => finish(new Error('cancelled')));
    const tryStep = () => {
      let d; try { d = f.contentDocument; } catch (e) { return; }
      if (!d || d.readyState === 'loading' || !d.body) return;
      try { if (/\/login/.test(f.contentWindow.location.href)) return finish(new Error('Не выполнен вход в CRM.')); } catch (e) {}
      const txt = d.body.textContent.replace(/\s+/g, ' ');
      if (txt.includes(want)) {
        if (!foundAt) {
          foundAt = Date.now();
          // раскрыть свёрнутые блоки/вкладки отчёта, если таблица заявок спрятана
          d.querySelectorAll('[data-toggle="collapse"], [data-bs-toggle="collapse"], .collapsed-box .btn-box-tool, a[data-toggle="tab"]').forEach((x) => { try { x.click(); } catch (e) {} });
        }
        const hasReqs = hasReqsCheap(d);
        if (hasReqs) { if (!reqsAt) reqsAt = Date.now(); if (Date.now() - reqsAt > 600) return finish(); }
        else if (!needReqs || Date.now() - foundAt > 6000) return finish();
        return;
      }
      if (submitted) return;
      const ins = dateInputs(d);
      if (ins.length < 2) return;
      submitted = true;
      [a, b].forEach((dt, k) => {
        const i = ins[k]; i.value = fmtLike(i.value, dt);
        i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const form = ins[0].form;
      const btn = [...d.querySelectorAll('button, input[type=submit], a.btn')].find((x) => /^поиск$/i.test((x.textContent || x.value || '').trim()));
      setTimeout(() => { if (btn) btn.click(); else if (form) form.submit(); }, 150);
    };
    f.addEventListener('load', tryStep);
    poll = setInterval(tryStep, 500);
    document.body.appendChild(f);
  });
}
async function fetchDoc(url) {
  const pf = (typeof content !== 'undefined' && content.fetch) ? content.fetch.bind(content) : fetch;
  const r = await Promise.race([pf(url, { credentials: 'include' }), new Promise((_, rej) => setTimeout(() => rej(new Error('CRM не ответила за 20 секунд')), 20000))]);
  const html = await Promise.race([r.text(), new Promise((_, rej) => setTimeout(() => rej(new Error('CRM не ответила за 20 секунд')), 20000))]);
  return new DOMParser().parseFromString(html, 'text/html');
}
// все страницы списка заявок (Чистыми 0 = отказ)
async function allRequestRows(doc, url, want, known) {
  const t0 = findTables(doc).reqs;
  if (!t0) return null;
  const iM = col(t0, /^мастер(\s|$)/i), iN = col(t0, /^чистыми/i), iId = col(t0, /^id/i);
  const take = (t) => t.rows.map((r) => ({ id: (r[iId >= 0 ? iId : 0] || '').replace(/\D/g, ''), master: r[iM] || '', net: parseNum(r[iN]) }));
  let rows = take(t0);
  const merged = new Map((known || []).map((r) => [r.id, r]));
  try {
    const summary = (doc.body.textContent.replace(/\s+/g, ' ').match(/Показаны записи\s*1\s*-\s*(\d+)\s*из\s*([\d\s]+)/i) || []);
    const perPage = +(summary[1] || t0.rows.length), total = +String(summary[2] || '0').replace(/\D/g, '');
    rows.forEach((r) => r.id && merged.set(r.id, r));
    if (known && known.length && merged.size === total) {      // всё уже есть в памяти — страницы не листаем
      const out = [...merged.values()]; out.total = total; out.partial = false; out.fromMemory = true; return out;
    }
    if (merged.size > total) merged.clear();                       // память устарела — собираем заново
    rows.forEach((r) => r.id && merged.set(r.id, r));
    if (total > rows.length) {
      // ссылки пагинации этой таблицы
      let box = t0.el.parentElement;
      while (box && box !== doc.body && !box.querySelector('.pagination')) box = box.parentElement;
      const links = box ? [...box.querySelectorAll('.pagination a[href]')].filter((x) => !/^(#|javascript:)/i.test(x.getAttribute('href'))) : [];
      const sample = links.find((x) => /page=/i.test(x.getAttribute('href')));
      if (sample) {
        const u = new URL(sample.getAttribute('href'), url);
        const key = qKeys(u).find((k) => /page$/i.test(k) && !/per-page/i.test(k)) || 'page';
        const pages = Math.ceil(total / (perPage || 50));
        const okDoc = (d) => !want || d.body.textContent.replace(/\s+/g, ' ').includes(want);
        // быстрый путь: все строки одной страницей
        try {
          const big = new URL(u.href); big.searchParams.set(key, 1);
          const ppKey = key.replace(/page$/i, 'per-page');
          big.searchParams.set(ppKey, Math.min(1000, total + 10));
          const bd = await fetchDoc(big.href);
          const bt = bd && okDoc(bd) && findTables(bd).reqs;
          if (bt && bt.rows.length > perPage) { const tk = take(bt); rows = rows.concat(tk); tk.forEach((r) => r.id && merged.set(r.id, r)); }
        } catch (e) {}
        if (merged.size >= total) { rows.partial = false; rows.total = total; throw { done: true }; }
        const urls = [];
        for (let p = 2; p <= Math.min(pages, 100); p++) { const x = new URL(u.href); x.searchParams.set(key, p); urls.push(x.href); }
        for (let i = 0; i < urls.length; i += 8) {
          const docs = await Promise.all(urls.slice(i, i + 8).map((x) => fetchDoc(x).catch(() => null)));
          docs.forEach((d) => { if (!d || !okDoc(d)) return; const t = findTables(d).reqs; if (t) { const tk = take(t); rows = rows.concat(tk); tk.forEach((r) => r.id && merged.set(r.id, r)); } });
          if (merged.size >= total) break;                         // добрали — дальше не листаем
        }
      }
      rows.partial = rows.length < total;
      rows.total = total;
    }
  } catch (e) { if (!(e && e.done)) rows.partial = true; }
  const out = merged.size ? [...merged.values()] : (() => { const seen = new Set(); return rows.filter((r) => r.id && !seen.has(r.id) && seen.add(r.id)); })();
  out.total = rows.total || out.length; out.partial = out.length < out.total;
  return out;
}
// листаем список заявок в скрытом окне отчёта: жмём 2, 3, … N и собираем строки
async function pagesInFrame(f, want) {
  const live = () => f.contentDocument;
  const reqT = () => { try { return findTables(live()).reqs; } catch (e) { return null; } };
  const t0 = reqT();
  if (!t0) return null;
  const iM = col(t0, /^мастер(\s|$)/i), iN = col(t0, /^чистыми/i), iId = col(t0, /^id/i);
  const take = (t) => t.rows.map((r) => ({ id: (r[iId >= 0 ? iId : 0] || '').replace(/\D/g, ''), master: r[iM] || '', net: parseNum(r[iN]) }));
  const firstId = () => { try { const tb = [...live().querySelectorAll('table')].find((x) => { const h = x.querySelector('thead'); return h && /Мастер/.test(h.textContent) && /Чистыми/.test(h.textContent); }); const td = tb && tb.querySelector('tbody tr td'); return td ? td.textContent.trim() : ''; } catch (e) { return ''; } };
  const pager = () => {
    const tb = reqT(); if (!tb) return null;
    let box = tb.el.parentElement;
    while (box && box !== live().body && !box.querySelector('.pagination')) box = box.parentElement;
    return box ? box.querySelector('.pagination') : null;
  };
  const txt = (live().body.textContent || '').replace(/\s+/g, ' ');
  const sm = txt.match(/Показаны записи\s*\d+\s*-\s*\d+\s*из\s*([\d\s]+?)\./i);
  const total = sm ? +sm[1].replace(/\D/g, '') : 0;
  let rows = take(t0);
  const seenPages = new Set(['1']);
  for (let guard = 0; guard < 200; guard++) {
    const pg = pager(); if (!pg) break;
    const nums = [...pg.querySelectorAll('a')].filter((a) => /^\d+$/.test(a.textContent.trim()));
    let next = nums.find((a) => !seenPages.has(a.textContent.trim()));
    if (!next) { // номера кончились на видимом отрезке — «»» / «следующая»
      const nx = pg.querySelector('li.next:not(.disabled) a, a[rel="next"]') || [...pg.querySelectorAll('a')].find((a) => /^(»|›|>|след)/i.test(a.textContent.trim()) && !a.closest('.disabled'));
      if (!nx) break;
      next = nx;
    }
    const label = next.textContent.trim();
    const before = firstId();
    next.click();
    // ждём, пока таблица сменится (pjax или перезагрузка)
    let ok = false;
    for (let w = 0; w < 100; w++) {
      await new Promise((r) => setTimeout(r, 300));
      if (!f.isConnected) return null;
      let d; try { d = live(); } catch (e) { continue; }
      if (!d || d.readyState === 'loading') continue;
      const id = firstId();
      if (id && id !== before) { ok = true; break; }
    }
    if (!ok) break;
    if (want && !(live().body.textContent || '').replace(/\s+/g, ' ').includes(want)) break; // CRM сбросила период
    const act = pager() && pager().querySelector('li.active, .active');
    seenPages.add(act ? act.textContent.trim() : label);
    rows = rows.concat(take(reqT()));
    if (total && new Set(rows.map((r) => r.id)).size >= total) break;
  }
  const seen = new Set();
  const out = rows.filter((r) => r.id && !seen.has(r.id) && seen.add(r.id));
  out.total = total || out.length;
  out.partial = out.length < out.total;
  return out;
}
// ---------- Память (browser.storage): отчёты по датам, обновление раз в час ----------
const FRESH = 60 * 60e3;
const packT = (x) => x ? { title: x.title, heads: x.heads, rows: x.rows } : null;
async function memGet(key) { try { const r = await browser.storage.local.get('mncCache'); return (r.mncCache || {})[key] || null; } catch (e) { return null; } }
// нужные сейчас периоды: сегодня, вчера, этот месяц, прошлый месяц (+ та же дата прошлого месяца)
function liveKeys() {
  const k = new Set(['salary', 'ads', 'rating', 'turnRank']);
  try {
    [ranges('today', 'day'), ranges('today', 'month'), ranges('month')].forEach((r) => { k.add(rkey(r.cur)); k.add(rkey(r.cmp)); });
  } catch (e) {}
  return k;
}
async function memSet(key, val) {
  try {
    const r = await browser.storage.local.get('mncCache'); const all = r.mncCache || {};
    all[key] = val;                                   // новая запись заменяет старую
    const live = liveKeys();
    Object.keys(all).forEach((k) => { if (!live.has(k)) delete all[k]; });   // прошедшие дни/месяцы — удаляем
    await browser.storage.local.set({ mncCache: all });
  } catch (e) {}
}
// уборка при старте: старые периоды и временные записи раздачи (после загрузки всего кода)
setTimeout(async () => {
  try {
    const r = await browser.storage.local.get(null);
    const live = liveKeys();
    const all = r.mncCache || {};
    let changed = false;
    Object.keys(all).forEach((k) => { if (!live.has(k)) { delete all[k]; changed = true; } });
    if (changed) await browser.storage.local.set({ mncCache: all });
    const junk = ['lastInfo', 'lastCopied', 'closeId'].filter((k) => k in r);
    if (r.pending && (!r.pending.t || Date.now() - r.pending.t > 864e5)) junk.push('pending');
    if (r.lastT && Date.now() - r.lastT > 864e5) junk.push('lastName', 'lastSt', 'lastT');
    if (r.closeT && Date.now() - r.closeT > 864e5) junk.push('closeIds', 'closeAsked', 'closeSelf', 'closeMaster', 'closeSt', 'closeT');
    if (junk.length) await browser.storage.local.remove(junk);
  } catch (e) {}
}, 3000);
const rkey = (range) => dd(range[0]) + '|' + dd(range[1]);
function unpack(m) {
  if (!m) return null;
  const t = { today: m.t.today, period: m.t.period, masters: m.t.masters, seen: m.t.seen || [] };
  const rr = m.reqRows ? Object.assign(m.reqRows.slice(), { total: m.reqTotal || m.reqRows.length, partial: false }) : null;
  return { t, reqRows: rr, at: m.at };
}
async function cachedAll(range) { return unpack(await memGet(rkey(range))); }
const INFLIGHT = new Map();
function loadAll(range, needReqs = true) {
  const k = rkey(range) + (needReqs ? '|r' : '');
  if (INFLIGHT.has(k)) return INFLIGHT.get(k);
  const p = loadAllRaw(range, needReqs).finally(() => INFLIGHT.delete(k));
  INFLIGHT.set(k, p);
  return p;
}
// шаблон адреса отчёта с датами (запоминается после первой загрузки через окно)
async function tplGet() { try { return (await browser.storage.local.get('cityTpl')).cityTpl || null; } catch (e) { return null; } }
function tplLearn(url, [a, b]) {
  const variants = (d) => [fmtLike('01-01-2000', d), fmtLike('01.01.2000', d), fmtLike('2000-01-01', d)].map(encodeURIComponent).concat([fmtLike('01-01-2000', d), fmtLike('01.01.2000', d), fmtLike('2000-01-01', d)]);
  let t = url, okA = false, okB = false;
  for (const v of variants(a)) if (!okA && t.includes(v)) { t = t.replace(v, '{A:' + (v.includes('-') && v.length === 10 && v[4] === '-' ? 'iso' : v.includes('.') || v.includes('%2E') ? 'dot' : 'dash') + '}'); okA = true; }
  for (const v of variants(b)) if (!okB && t.includes(v)) { t = t.replace(v, '{B:' + (v.includes('-') && v.length === 10 && v[4] === '-' ? 'iso' : v.includes('.') || v.includes('%2E') ? 'dot' : 'dash') + '}'); okB = true; }
  if (okA && okB) browser.storage.local.set({ cityTpl: t }).catch(() => {});
}
function tplFill(t, [a, b]) {
  const f = (kind, d) => kind === 'iso' ? fmtLike('2000-01-01', d) : kind === 'dot' ? fmtLike('01.01.2000', d) : fmtLike('01-01-2000', d);
  return t.replace(/\{A:(\w+)\}/, (_, k) => encodeURIComponent(f(k, a))).replace(/\{B:(\w+)\}/, (_, k) => encodeURIComponent(f(k, b)));
}
async function loadPeriodFast(range) {
  const t = await tplGet(); if (!t) return null;
  const url = tplFill(t, range);
  const want = `${dd(range[0])} по ${dd(range[1])}`;
  const doc = await fetchDoc(url).catch(() => null);
  if (!doc || !doc.body.textContent.replace(/\s+/g, ' ').includes(want)) { browser.storage.local.remove('cityTpl').catch(() => {}); return null; }
  const base = doc.createElement('base'); base.href = url; doc.head.prepend(base);
  return { doc, url, frame: null };
}
async function loadAllRaw(range, needReqs = true) {
  const key = rkey(range);
  const old = await memGet(key);
  let lp = await loadPeriodFast(range);
  if (!lp) { lp = await loadPeriod(range, needReqs); if (lp && lp.url) tplLearn(lp.url, range); }
  const { doc, url } = lp; let frame = lp.frame;
  const t = findTables(doc);
  t.seen = [...doc.querySelectorAll('table')].map(readTable).filter((x) => x.heads.length).map((x) => (x.title ? x.title + ': ' : '') + x.heads.filter(Boolean).slice(0, 8).join(', '));
  const want = `${dd(range[0])} по ${dd(range[1])}`;
  let reqRows = null;
  if (needReqs) {
    reqRows = await allRequestRows(doc, url, want, old && old.reqRows).catch(() => null);
    if (!reqRows || reqRows.partial) {
      let slow = null;
      try { if (!frame) { const lf = await loadPeriod(range, true); frame = lf.frame; } slow = await pagesInFrame(frame, want); } catch (e) { slow = null; }
      if (slow && (!reqRows || slow.length > reqRows.length)) reqRows = slow;
    }
  } else if (old && old.reqRows) reqRows = Object.assign(old.reqRows.slice(), { total: old.reqTotal });
  if (frame) frame.remove();
  const res = { t, reqRows, at: Date.now() };
  memSet(key, { t: { today: packT(t.today), period: packT(t.period), masters: packT(t.masters), seen: t.seen }, reqRows: reqRows ? reqRows.slice() : null, reqTotal: reqRows ? reqRows.total : 0, at: res.at });
  return res;
}

// ---------- Периоды ----------
function addMonths(d, k) { const x = new Date(d.getFullYear(), d.getMonth() + k, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; }
function ranges(period, cmp) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
  if (period === 'today') {
    const t = new Date(y, m, d), c = cmp === 'month' ? addMonths(t, -1) : new Date(y, m, d - 1);
    return { cur: [t, t], cmp: [c, c], curName: 'Сегодня', cmpName: cmp === 'month' ? dd(c).slice(0, 5) : 'Вчера' };
  }
  const mn = (k) => { const s = new Date(y, m + k, 1).toLocaleDateString('ru-RU', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  return { cur: [new Date(y, m, 1), new Date(y, m + 1, 0)], cmp: [new Date(y, m - 1, 1), new Date(y, m, 0)], curName: mn(0), cmpName: mn(-1) };
}

// ---------- Отрисовка ----------
const CITY = [
  ['Оборот', /^оборот/i, 'money'], ['Чистыми', /^чистыми/i, 'money'], ['Заявок принято', /принято/i, 'n'],
  ['Заявок закрыто', /заявок\s+закрыто/i, 'n'], ['Закрыто наши', /закрыто\s+наши/i, 'n'], ['Закрыто партн.', /партн/i, 'n'],
  ['Отказов', /отказ/i, 'n', true], ['Чист. ср. чек', /ср\.?\s*чек/i, 'money'], ['Цена заявки', /цена\s+заявки/i, 'money', true]
];
function cityVals(t) {
  if (!t || !t.rows.length) return null;
  const r = t.rows[0], o = {};
  CITY.forEach(([name, re]) => { const i = col(t, re); o[name] = i >= 0 ? parseNum(r[i]) : null; });
  return o;
}
function delta(a, b, invert) {
  if (a == null || b == null || b === 0) return '';
  const d = (a - b) / Math.abs(b) * 100, good = invert ? d < 0 : d > 0;
  const cls = Math.abs(d) < 0.5 ? 'eq' : good ? 'up' : 'down';
  return `<span class="dl ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${fmt(Math.abs(d))}%</span>`;
}
const money = (v) => v == null ? '—' : fmt(v) + '\u00a0₽';
const mkey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).slice(0, 2).join(' ');

function mastersOf(t, reqRows) {
  if (!t) return [];
  const iF = col(t, /^фио$/i), iQ = col(t, /количество\s+заявок/i), iSD = col(t, /^сд$/i), iNet = col(t, /^чистый\s+ср/i), iAll = col(t, /^общий\s+ср/i), iZ = col(t, /^зарплата$/i);
  const ref = new Map();
  (reqRows || []).forEach((r) => {
    const k = mkey(r.master); if (!k) return;
    const o = ref.get(k) || { total: 0, refused: 0 }; o.total++; if (r.net === 0) o.refused++; ref.set(k, o);
  });
  return t.rows.map((r) => {
    const name = r[iF] || '', rf = ref.get(mkey(name));
    return { name, q: parseNum(r[iQ]), sd: parseNum(r[iSD]), net: parseNum(r[iNet]), all: parseNum(r[iAll]), zp: parseNum(r[iZ]),
      refused: rf ? rf.refused : (reqRows ? 0 : null), rPct: null };
  }).filter((m) => m.name).map((m) => Object.assign(m, { rPct: m.refused != null && m.q ? m.refused * 100 / m.q : (m.refused != null ? 0 : null) })).sort((a, b) => (b.zp || 0) - (a.zp || 0));
}


// ---------- Мотивация директора ----------
let MOTIV = { plan: '', claims: '', cancels: '', top: '0', msk: false, newDir: false, satNet: '', satClaims: '', net: '' };
try { browser.storage.local.get('motiv').then((r) => { if (r.motiv) MOTIV = Object.assign(MOTIV, r.motiv); }); } catch (e) {}
const saveMotiv = () => { try { browser.storage.local.set({ motiv: MOTIV }); } catch (e) {} };
const num = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };

function claimsK(p, sat) {
  if (p == null) return 0;
  if (p > 5) return sat ? -2 : -3;
  if (p >= 3) return 0;
  if (p >= 1) return 1;
  return 3;
}
function motivCalc(net, closedOur, src) {
  src = src || {};
  const satNet = num(MOTIV.satNet) || 0;
  const base = (net || 0) + satNet;          // инкас спутника суммируется с основным городом
  const lines = [];
  if (base < 200000) {
    const g = base < 100000 ? 50000 : 70000;
    lines.push([`Чистый инкас ${fmt(base)} ₽ — ${base < 100000 ? 'до 100 000' : '100 000–200 000'}: оклад, с 200 000 — процент`, 'оклад ' + fmt(g) + ' ₽']);
    return { zp: g, guaranteed: true, lines, base };
  }
  const pct = base < 400000 ? 45 : base < 600000 ? 48 : 51;
  lines.push([`Процент от чистого инкаса (${base < 400000 ? '200–400 тыс.' : base < 600000 ? '400–600 тыс.' : 'от 600 тыс.'})`, pct + '%']);
  let k = 0;
  const c = closedOur || 0;
  const ordK = MOTIV.msk ? (c > 110 ? 3 : c >= 91 ? 2 : c >= 60 ? 1 : 0) : (c > 200 ? 3 : c >= 151 ? 2 : c >= 100 ? 1 : 0);
  lines.push([`Закрыто наши: ${c}${MOTIV.msk ? ' (МСК-СПБ)' : ''}`, ordK]); k += ordK;
  const plan = num(MOTIV.plan);
  if (src.planPct != null) {
    const pp = src.planPct;
    const pk = pp < 90 ? -1 : pp <= 110 ? 0 : pp < 130 ? 2 : 3;
    lines.push([`План выполнен: ${fmt(pp)}%`, pk]); k += pk;
  } else if (plan) {
    const pp = (net || 0) * 100 / plan;
    const pk = pp < 90 ? -1 : pp <= 110 ? 0 : pp < 130 ? 2 : 3;
    lines.push([`План: ${fmt(pp)}% (${fmt(net)} из ${fmt(plan)} ₽)`, pk]); k += pk;
  } else lines.push(['План: не указан', null]);
  const cl = src.claims != null ? src.claims : num(MOTIV.claims);
  if (cl != null) { const ck = claimsK(cl, false); lines.push([`Претензии: ${fmt(cl)}%`, ck]); k += ck; } else lines.push(['Претензии: не указаны', null]);
  const rank = src.rank != null ? src.rank : null;
  const topKey = rank != null ? (rank === 1 ? '1' : rank <= 10 ? '2' : rank <= 15 ? '3' : '0') : MOTIV.top;
  const tk = { '1': 3, '2': 2, '3': 1 }[topKey] || 0;
  lines.push([`ТОП РФ: ${rank != null ? '#' + rank + ' — ' : ''}${{ '0': 'не в ТОПе', '1': 'ТОП 1', '2': 'ТОП 2–10', '3': 'ТОП 11–15' }[topKey] || 'не в ТОПе'}`, tk]); k += tk;
  if (satNet) {
    const sc = num(MOTIV.satClaims);
    const sk = claimsK(sc, true);
    lines.push([`Спутник: инкас ${fmt(satNet)} ₽, претензии ${sc == null ? '—' : fmt(sc) + '%'}`, sk]); k += sk;
  }
  const cn = src.cancels != null ? src.cancels : num(MOTIV.cancels);
  const over = src.cancelsOver != null ? src.cancelsOver : Math.max(0, (cn || 0) - Math.floor((closedOur || 0) * 0.05));
  const fine = MOTIV.newDir ? 0 : 2000 * over;
  if (MOTIV.newDir) lines.push(['Отмены: первые 2 месяца — не применяются', null]);
  else lines.push([`Отмены: ${cn == null ? 'не указаны' : cn + ' шт.'}, сверх 5%: ${over} × 2 000 ₽`, fine ? '−' + fmt(fine) + ' ₽' : 'без штрафа']);
  const zp = (base - fine) * (pct + k) / 100;
  return { zp, pct, k, fine, lines, base };
}
function motivHTML(net, closedOur, isMonth) {
  const net0 = num(MOTIV.net) != null ? num(MOTIV.net) : net;
  const r = motivCalc(net0, closedOur);
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), day = now.getDate();
  const fNet = isMonth && net0 ? net0 / day * dim : null;
  const fc = isMonth && closedOur ? Math.round(closedOur / day * dim) : null;
  const f = fNet ? motivCalc(fNet, fc) : null;
  const kv = (v) => v == null ? '<span class="muted">—</span>' : typeof v === 'number' ? `<b class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${v}%</b>` : `<b>${v}</b>`;
  return `<div class="card motiv">
    <div class="ch"><div><div class="ct">ЗП директора</div><div class="cs">(Чистый инкас − штраф за отмены) × (процент + коэффициенты)</div></div></div>
    <div class="mz">
      <div class="mzv"><div class="kl">${isMonth ? 'По факту на сегодня' : 'По данным периода'}</div><div class="big">${fmt(Math.round(r.zp))} ₽</div>
        <div class="ks">${r.guaranteed ? 'оклад (чистый инкас до 200 000 ₽)' : `${r.pct}% ${r.k >= 0 ? '+' : '−'} ${Math.abs(r.k)}% = ${r.pct + r.k}%`}</div></div>
      ${f ? `<div class="mzv fc"><div class="kl">Прогноз на конец месяца</div><div class="big">${fmt(Math.round(f.zp))} ₽</div>
        <div class="ks">инкас ≈ ${fmt(Math.round(f.base))} ₽ · закрыто ≈ ${fc}</div></div>` : ''}
    </div>
    <table class="t mk"><tbody>${r.lines.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="n">${kv(v)}</td></tr>`).join('')}</tbody></table>
    <details class="mset"><summary>Данные для расчёта</summary>
      <div class="ctrl">
        <label>Чистый инкас, ₽<input data-k="net" placeholder="${fmt(net)} (из отчёта)" value="${esc(MOTIV.net)}"></label>
        <label>План на месяц, ₽<input data-k="plan" value="${esc(MOTIV.plan)}"></label>
        <label>Претензии, %<input data-k="claims" value="${esc(MOTIV.claims)}"></label>
        <label>Отмен, шт.<input data-k="cancels" value="${esc(MOTIV.cancels)}"></label>
        <label>ТОП РФ<select data-k="top">${[['0', 'не в ТОПе'], ['1', 'ТОП 1'], ['2', 'ТОП 2–10'], ['3', 'ТОП 11–15']].map(([v, t]) => `<option value="${v}"${MOTIV.top === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Инкас спутника, ₽<input data-k="satNet" value="${esc(MOTIV.satNet)}"></label>
        <label>Претензии спутника, %<input data-k="satClaims" value="${esc(MOTIV.satClaims)}"></label>
        <label class="chk"><input type="checkbox" data-k="msk"${MOTIV.msk ? ' checked' : ''}> Город МСК-СПБ</label>
        <label class="chk"><input type="checkbox" data-k="newDir"${MOTIV.newDir ? ' checked' : ''}> Первые 2 месяца работы</label>
      </div></details>
  </div>`;
}
function bindMotiv() {
  const box = view.querySelector('.motiv'); if (!box) return;
  box.querySelectorAll('[data-k]').forEach((el) => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'change';
    el.addEventListener(ev, () => {
      MOTIV[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim();
      saveMotiv();
      const open = box.querySelector('details').open;
      MODE === 'zp' ? renderSalary() : render();
      const nb = view.querySelector('.motiv details'); if (nb && open) nb.open = true;
    });
  });
}

// ---------- CRM → Зарплата Директора ----------
function salaryUrl() {
  const a = [...document.querySelectorAll('a[href]')].find((x) => /^зарплата\s+директора$/i.test(x.textContent.trim()));
  return a ? a.href : null;
}
const firstNum = (t) => { const m = String(t || '').replace(/ /g, ' ').match(/-?\d[\d ]*(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(/\s/g, '').replace(',', '.')) : null; };
const SAL_SKIP = /^(№|город|оклад|всего|к выдаче)$/i;
function parseSalary(doc) {
  const t = [...doc.querySelectorAll('table')].map(readTable).find((x) => col(x, /общий\s+инкас/i) >= 0);
  if (!t) return null;
  const iC = col(t, /^город/i);
  const row = t.rows.find((r) => /^\d+$/.test((r[0] || '').trim()) && r[iC] && !/итого|регионал/i.test(r[iC]));
  if (!row) return null;
  const g = (re) => { const i = col(t, re); return i >= 0 ? row[i] : ''; };
  const cells = t.heads.map((h, i) => [h, row[i]]).filter(([h]) => h && !SAL_SKIP.test(h.trim()));
  const claimsTxt = g(/претензи/i);
  const cm = claimsTxt.match(/(-?[\d.,]+)\s*%/);
  const rk = g(/р\/город/i).match(/#\s*(\d+)/);
  return {
    city: row[iC],
    gross: firstNum(g(/общий\s+инкас/i)),
    partners: firstNum(g(/^партнер/i)),
    turnover: firstNum(g(/^оборот/i)),
    net: (firstNum(g(/общий\s+инкас/i)) || 0) - (firstNum(g(/^партнер/i)) || 0),
    closed: firstNum(g(/бонус\s+за\s+заявки/i)),
    rank: rk ? +rk[1] : null,
    planPct: firstNum(g(/п\/оборот/i)),
    cancels: firstNum(g(/отмен/i)),
    cancelsOver: (() => { const p = String(g(/отмен/i)).split('/'); return p.length > 1 ? firstNum(p[1]) : null; })(),
    cancelsFine: (() => { const p = String(g(/отмен/i)).split('/'); return p.length > 2 ? firstNum(p[2]) : null; })(),
    claims: cm ? parseFloat(cm[1].replace(',', '.')) : null,
    cells
  };
}
// открыть страницу в скрытом окне, вписать даты и нажать «Поиск» (если есть поля дат)
function loadWithDates(url, [a, b], prep) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1600px;height:900px;border:0;opacity:0;pointer-events:none';
    f.src = url;
    let stage = 0, firstDoc = null, readyAt = 0, done = false, stage2Dated = false, t0 = 0, prepDoc = null, prepAt = 0, prepped = false, sig = '';
    const end = (err) => {
      if (done) return; done = true; clearInterval(poll); clearTimeout(timer); FRAMES.delete(f);
      if (err) { f.remove(); return reject(err); }
      try {
        const doc = new DOMParser().parseFromString(f.contentDocument.documentElement.outerHTML, 'text/html');
        doc.mncUrl = f.contentWindow.location.href; doc.mncDated = stage2Dated;
        f.remove(); resolve(doc);
      } catch (e) { f.remove(); reject(e); }
    };
    const timer = setTimeout(() => end(new Error('Страница CRM не загрузилась за 45 секунд')), 45000);
    regFrame(f, () => end(new Error('cancelled')));
    const bodySig = (d) => { const t = d.querySelector('table tbody'); return (t ? t.textContent : '').replace(/\s+/g, ' ').slice(0, 400); };
    const poll = setInterval(() => {
      let d; try { d = f.contentDocument; } catch (e) { return; }
      if (!d || d.readyState !== 'complete' || !d.body || d.location.href === 'about:blank') return;
      if (stage === 0) {
        // 1) подготовка (выбор города); если страница сама перезагрузится — ждём её
        if (prep && !prepped) {
          prepped = true;
          let changed = false; try { changed = !!prep(d); } catch (e) {}
          if (changed) { stage = 'prep'; prepDoc = d; prepAt = Date.now(); sig = bodySig(d); return; }
        }
        // 2) даты: если уже стоят нужные и город не менялся вручную — ничего не нажимаем
        const ins = dateInputs(d);
        if (ins.length < 2) { stage = 2; readyAt = Date.now(); return; }
        const want = [a, b].map((dt, k) => fmtLike(ins[k].value, dt));
        const same = ins[0].value.trim() === want[0] && ins[1].value.trim() === want[1];
        stage2Dated = true;
        if (same && !prepDoc) { stage = 2; readyAt = Date.now(); return; }
        ins.forEach((i, k) => { i.value = want[k]; i.dispatchEvent(new Event('change', { bubbles: true })); });
        const btn = [...d.querySelectorAll('button, input[type=submit], a.btn')].find((x) => /^(поиск|показать|применить|найти)$/i.test((x.textContent || x.value || '').trim()));
        firstDoc = d; sig = bodySig(d); t0 = Date.now(); stage = 1;
        setTimeout(() => { try { if (btn) btn.click(); else if (ins[0].form) ins[0].form.submit(); } catch (e) {} }, 150);
        return;
      }
      if (stage === 'prep') {
        // страница перезагрузилась или таблица обновилась сама — проверяем даты заново
        if (d !== prepDoc || bodySig(d) !== sig) { prepDoc = null; stage = 0; return; }
        if (Date.now() - prepAt > 1500) stage = 0; // не перезагрузилась — продолжаем с датами (нажмём «Поиск»)
        return;
      }
      if (stage === 1) {
        if (d !== firstDoc || bodySig(d) !== sig || Date.now() - t0 > 8000) { stage = 2; readyAt = Date.now(); }
        return;
      }
      if (stage === 2 && Date.now() - readyAt > 700) end();
    }, 250);
    document.body.appendChild(f);
  });
}
// открыть «Зарплата Директора» в скрытом окне и нажать кнопку месяца («Текущий месяц» / «Прошлый»)
function loadSalaryPage(url, which) {
  const re = which === 'prev' ? /^прошл/i : /^текущ/i;
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1600px;height:900px;border:0;opacity:0;pointer-events:none';
    f.src = url;
    let stage = 0, firstDoc = null, before = '', clickedAt = 0, readyAt = 0, done = false;
    const end = (err) => {
      if (done) return; done = true; clearInterval(poll); clearTimeout(timer); FRAMES.delete(f);
      if (err) { f.remove(); return reject(err); }
      try { const doc = new DOMParser().parseFromString(f.contentDocument.documentElement.outerHTML, 'text/html'); f.remove(); resolve(doc); }
      catch (e) { f.remove(); reject(e); }
    };
    const timer = setTimeout(() => end(new Error('Страница зарплаты не загрузилась')), 45000);
    const tableSig = (d) => { const t = [...d.querySelectorAll('table')].find((x) => /общий\s+инкас/i.test(x.textContent)); return t ? t.querySelector('tbody') ? t.querySelector('tbody').textContent.replace(/\s+/g, ' ') : '' : ''; };
    const poll = setInterval(() => {
      let d; try { d = f.contentDocument; } catch (e) { return; }
      if (!d || d.readyState !== 'complete' || !d.body || d.location.href === 'about:blank') return;
      if (stage === 0) {
        const btn = [...d.querySelectorAll('a, button, input[type=button], input[type=submit]')].find((x) => re.test((x.textContent || x.value || '').trim()));
        if (!btn) { if (which === 'cur') { stage = 2; readyAt = Date.now(); } else end(new Error('Нет кнопки «Прошлый»')); return; }
        firstDoc = d; before = tableSig(d); clickedAt = Date.now(); stage = 1;
        btn.click();
        return;
      }
      if (stage === 1) {
        // перезагрузка страницы или смена таблицы на месте; «Текущий месяц» может ничего не менять
        if (d !== firstDoc || tableSig(d) !== before || Date.now() - clickedAt > (which === 'cur' ? 2500 : 15000)) { stage = 2; readyAt = Date.now(); }
        return;
      }
      if (stage === 2 && Date.now() - readyAt > 800 && tableSig(d)) end();
    }, 250);
    document.body.appendChild(f);
  });
}
async function loadSalary() {
  const url = salaryUrl();
  if (!url) throw new Error('В меню CRM не найден пункт «Зарплата Директора»');
  const [curDoc, prevDoc] = await Promise.all([loadSalaryPage(url, 'cur'), loadSalaryPage(url, 'prev').catch(() => null)]);
  const cur = parseSalary(curDoc);
  const prev = prevDoc ? parseSalary(prevDoc) : null;
  if (!cur) throw new Error('На странице «Зарплата Директора» не найдена таблица с «Общий инкас»');
  const same = prev && JSON.stringify(prev.cells) === JSON.stringify(cur.cells);
  return { cur, prev: same ? null : prev };
}
function salaryHTML(sal) {
  const n = new Date();
  const mn = (k) => { const s = new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const calc = (x) => x ? motivCalc(x.net, x.closed, x) : null;
  const rc = calc(sal.cur), rp = calc(sal.prev);
  const kv = (v) => v == null ? '<span class="muted">—</span>' : typeof v === 'number' ? `<b class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${v}%</b>` : `<b>${v}</b>`;
  const pmap = new Map((sal.prev ? sal.prev.cells : []).map(([h, v]) => [h, v]));
  const lmap = new Map((rp ? rp.lines : []).map(([t, v], i) => [i, [t, v]]));
  return `<div class="card motiv">
    <div class="ch"><div><div class="ct">ЗП директора</div><div class="cs">из «CRM → Зарплата Директора» · ${esc(sal.cur.city)} · расчёт: (чистый инкас − штраф за отмены) × (процент + коэффициенты)</div></div></div>
    <div class="mz">
      <div class="mzv"><div class="kl">${mn(0)}</div><div class="big">${fmt(Math.round(rc.zp))} ₽ ${rp ? delta(rc.zp, rp.zp) : ''}</div>
        <div class="ks">${rc.guaranteed ? 'оклад (чистый инкас до 200 000 ₽)' : `${rc.pct}% ${rc.k >= 0 ? '+' : '−'} ${Math.abs(rc.k)}% = ${rc.pct + rc.k}%`} · инкас ${fmt(rc.base)} ₽</div></div>
      <div class="mzv fc"><div class="kl">${mn(-1)}</div><div class="big">${rp ? fmt(Math.round(rp.zp)) + ' ₽' : '—'}</div>
        <div class="ks">${rp ? (rp.guaranteed ? 'оклад (чистый инкас до 200 000 ₽)' : `${rp.pct}% ${rp.k >= 0 ? '+' : '−'} ${Math.abs(rp.k)}% = ${rp.pct + rp.k}%`) + ' · инкас ' + fmt(rp.base) + ' ₽' : 'не удалось открыть «Прошлый»'}</div></div>
    </div>
    <table class="t mk"><thead><tr><th>Коэффициент</th><th class="n">${mn(0)}</th><th class="n">${mn(-1)}</th></tr></thead><tbody>
      ${rc.lines.map(([t, v], i) => { const p = lmap.get(i); return `<tr><td>${esc(t)}${p && p[0] !== t ? `<div class="muted" style="font-size:11px">${mn(-1)}: ${esc(p[0])}</div>` : ''}</td><td class="n">${kv(v)}</td><td class="n">${p ? kv(p[1]) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
    </tbody></table>
    <details class="mset"><summary>Данные CRM «Зарплата Директора»</summary>
      <div class="scroll"><table class="t"><thead><tr><th>Столбец</th><th class="n">${mn(0)}</th><th class="n">${mn(-1)}</th></tr></thead><tbody>
      ${sal.cur.cells.map(([h, v]) => `<tr><td>${esc(h)}</td><td class="n">${esc(v)}</td><td class="n cm">${esc(pmap.get(h) || '—')}</td></tr>`).join('')}
      </tbody></table></div></details>
    <details class="mset"><summary>Настройки, которых нет в CRM</summary>
      <div class="ctrl">
        <label class="chk"><input type="checkbox" data-k="msk"${MOTIV.msk ? ' checked' : ''}> Город МСК-СПБ</label>
        <label class="chk"><input type="checkbox" data-k="newDir"${MOTIV.newDir ? ' checked' : ''}> Первые 2 месяца работы (отмены не применяются)</label>
        <label>Инкас спутника, ₽<input data-k="satNet" value="${esc(MOTIV.satNet)}"></label>
        <label>Претензии спутника, %<input data-k="satClaims" value="${esc(MOTIV.satClaims)}"></label>
      </div></details>
  </div>`;
}
let SALARY = null, SALARY_ERR = '';

function render() {
  try { renderInner(); } catch (e) { if (view) view.innerHTML = `<div class="err">Ошибка отображения: ${esc(e.message)}</div>`; }
}
function renderInner() {
  const { cur, cmp, rg } = STATE;
  const cv = cityVals(cur.t.period), pv = cmp && cityVals(cmp.t.period);
  const ms = mastersOf(cur.t.masters, cur.reqRows);
  const pms = cmp ? new Map(mastersOf(cmp.t.masters, cmp.reqRows).map((m) => [mkey(m.name), m])) : new Map();
  if (!cv && !ms.length) { view.innerHTML = '<div class="err">В отчёте нет данных за этот период.</div>'; return; }

  const kp = [['Оборот', 'money'], ['Чистыми', 'money'], ['Заявок закрыто', 'n'], ['Отказов', 'n', true]].map(([name, type, inv], k) => {
    const a = cv && cv[name], b = pv && pv[name];
    return `<div class="kpi${k === 0 ? ' main' : ''}"><div class="kl">${name}</div>
      <div class="kv">${fmt(a)}${type === 'money' ? '<small>₽</small>' : ''}${pv ? delta(a, b, inv) : ''}</div>
      <div class="ks">${pv ? esc(rg.cmpName) + ': ' + (type === 'money' ? money(b) : fmt(b)) : '&nbsp;'}</div></div>`;
  }).join('');

  const crit = CITY.map(([name, , type, inv]) => {
    const a = cv && cv[name], b = pv && pv[name];
    const mx = Math.max(1, a || 0, b || 0);
    const show = (v) => type === 'money' ? money(v) : fmt(v);
    const kind = inv ? 'out' : type === 'money' ? 'in' : 'oth';
    return `<tr class="k-${kind}">
      <td class="cr"><span class="tag ${kind}"></span>${name}</td>
      <td class="n"><b>${show(a)}</b></td>
      <td class="bar"><span class="tb two"><i class="${inv ? 'out' : 'in'}" style="width:${(a || 0) * 100 / mx}%"></i>${pv ? `<i class="prev" style="width:${(b || 0) * 100 / mx}%"></i>` : ''}</span></td>
      ${pv ? `<td class="n cm">${show(b)}</td><td class="n">${delta(a, b, inv)}</td>` : ''}</tr>`;
  }).join('');

  const zMax = Math.max(1, ...ms.map((m) => m.zp || 0));
  const mrows = ms.map((m, k) => {
    const p = pms.get(mkey(m.name));
    const bad = m.rPct != null && m.rPct > 20;
    const refusal = m.refused == null ? '—' : `<span class="rf${bad ? ' bad' : ''}">${bad ? '<i class="dot" title="Отказов больше 20% от заявок мастера"></i>' : ''}<b>${m.refused}</b> <em>${fmt(m.rPct)}%</em></span>`;
    return `<tr><td class="rn2">${k + 1}</td><td class="nm">${esc(m.name)}</td>
      <td class="n">${fmt(m.q)}</td><td class="n">${fmt(m.sd)}</td>
      <td class="n">${money(m.net)}</td><td class="n">${money(m.all)}</td>
      <td class="n">${refusal}</td>
      <td class="zp"><span class="tb"><i class="in" style="width:${(m.zp || 0) * 100 / zMax}%"></i></span><b>${money(m.zp)}</b>${p ? delta(m.zp, p.zp) : ''}</td></tr>`;
  }).join('');
  const refAll = cur.reqRows ? cur.reqRows.filter((r) => r.net === 0).length : 0;
  const cityRef = cv ? cv['Отказов'] : null;
  const check = cityRef == null ? '' : refAll === cityRef ? ` · ✓ совпадает с отчётом (${cityRef})` : ` · ⚠ в отчёте ${cityRef}`;
  const refInfo = cur.reqRows ? `отказы (Чистыми 0): ${refAll} в ${cur.reqRows.length} из ${cur.reqRows.total} заявок${check}${cur.reqRows.partial ? ` (в отчёте ${cur.reqRows.total}, часть страниц не загрузилась)` : ''}` : 'список закрытых заявок в отчёте не найден — отказы не посчитаны <button class="lnk" id="diag">скопировать для Claude, какие таблицы видны</button>';

  view.innerHTML = `
    <div class="kpis">${kp}</div>
    <div class="row2">
      <div class="card"><div class="ch"><div><div class="ct">Показатели города</div><div class="cs">${esc(rg.curName)}${pv ? ' · сравнение: ' + esc(rg.cmpName) : ''}</div></div></div>
        <table class="t rep"><thead><tr><th>Критерий</th><th class="n">${esc(rg.curName)}</th><th></th>${pv ? `<th class="n">${esc(rg.cmpName)}</th><th class="n">изм.</th>` : ''}</tr></thead><tbody>${crit}</tbody></table></div>
      <div class="card"><div class="ch"><div class="ct">Закрытие заявок</div></div><div id="donut"></div></div>
    </div>
    <div class="card big"><div class="ch"><div><div class="ct">Зарплата мастеров</div><div class="cs">${esc(rg.curName)}${pms.size ? ' и ' + esc(rg.cmpName) : ''}</div></div>
      <div class="leg"><span><i style="background:#15803d"></i>${esc(rg.curName)}</span>${pms.size ? `<span><i class="dash"></i>${esc(rg.cmpName)}</span>` : ''}</div></div>
      <div id="main"></div></div>
    <div class="card"><div class="ch"><div><div class="ct">Мастера</div><div class="cs">по зарплате, от большей к меньшей · ${refInfo}</div></div>
      <div class="leg"><span><i class="dot"></i>отказов больше 20%</span></div></div>
      <div class="scroll"><table class="t mst"><thead><tr><th>№</th><th>ФИО</th><th class="n">Заявок</th><th class="n">СД</th><th class="n">Чистый ср.чек</th><th class="n">Общий ср.чек</th><th class="n">Отказы · % от заявок</th><th class="n">Зарплата</th></tr></thead>
      <tbody>${mrows || '<tr><td colspan="8" class="muted">Нет данных по мастерам</td></tr>'}</tbody></table></div></div>`;

  if (cv) donut($('#donut'), [
    { label: 'Закрыто наши', value: cv['Закрыто наши'] || 0, color: '#15803d' },
    { label: 'Закрыто партн.', value: cv['Закрыто партн.'] || 0, color: '#5cc58a' },
    { label: 'Отказов', value: cv['Отказов'] || 0, color: '#dc6b4a' }
  ].filter((x) => x.value > 0), { centerValue: cv['Оборот'], center: 'оборот, ₽' });

  if (ms.length) {
    const series = [{ name: rg.curName, values: ms.map((m) => m.zp || 0), color: '#15803d' }];
    if (pms.size) series.push({ name: rg.cmpName, values: ms.map((m) => { const p = pms.get(mkey(m.name)); return p ? p.zp || 0 : null; }), color: '#5f7468', dashed: true });
    smoothChart($('#main'), ms.map((m) => m.name.split(' ')[0]), series, { h: 280, unit: ' ₽' });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => view.querySelectorAll('.tb').forEach((x) => x.classList.add('on'))));
  bindMotiv();
  const dg = $('#diag');
  if (dg) dg.onclick = async () => {
    const txt = 'Таблицы в отчёте:\n' + (cur.t.seen || []).join('\n');
    try { await navigator.clipboard.writeText(txt); dg.textContent = 'скопировано — вставьте в чат'; } catch (e) { dg.textContent = 'не удалось скопировать'; }
  };
}

function renderTop() {
  const rg = ranges(PERIOD, CMP);
  const span = ([a, b]) => sameDay(a, b) ? dd(a) : dd(a) + ' – ' + dd(b);
  const days = (r) => Math.round((r[1] - r[0]) / 864e5) + 1;
  ROOT.querySelectorAll('#period button').forEach((b) => b.classList.toggle('on', b.dataset.p === PERIOD));
  const mr = ranges('month').cur;
  ROOT.querySelector('#period button[data-p="month"]').textContent = `За месяц · ${dd(mr[0]).slice(0, 5)}–${dd(mr[1]).slice(0, 5)}`;
  const box = $('#cmp');
  box.innerHTML = PERIOD === 'today'
    ? `<button data-c="y" class="${CMPON ? 'on' : ''}">${CMPON ? '✓ Сравнение со вчера' : 'Сравнить со вчера'}</button>`
    : '<span>Сравнение с прошлым месяцем</span>';
  box.querySelectorAll('button').forEach((b) => b.onclick = () => { CMPON = !CMPON; safeLoad(); });
  const useCmp = PERIOD === 'month' || CMPON;
  $('#dates').innerHTML = `<b>${span(rg.cur)}</b>${PERIOD === 'month' ? ` <em>${days(rg.cur)} дн.</em>` : ''}${useCmp ? ` <span class="vs">сравнение:</span> ${span(rg.cmp)}${PERIOD === 'month' ? ` <em>${days(rg.cmp)} дн.</em>` : ''}` : ''}`;
}

function salaryMetrics(sal) {
  const c = sal.cur, p = sal.prev;
  const n = new Date();
  const mn = (k) => { const s = new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const K = [
    ['Чистый инкас', (x) => x.net, 'money', 'общий инкас − партнеры', true],
    ['Общий инкас', (x) => x.gross, 'money'],
    ['Партнеры', (x) => x.partners, 'money', '', false, true],
    ['Оборот', (x) => x.turnover, 'money'],
    ['Закрыто наши', (x) => x.closed, 'n'],
    ['План выполнен', (x) => x.planPct, 'pct'],
    ['Претензии', (x) => x.claims, 'pct', '', false, true],
    ['Место в РФ', (x) => x === c && turnoverRank() != null ? turnoverRank() : x.rank, 'rank', turnoverRank() != null ? 'рейтинг по обороту' : '', false, true]
  ];
  const show = (v, t) => v == null ? '—' : t === 'money' ? fmt(v) + ' ₽' : t === 'pct' ? fmt(v) + '%' : t === 'rank' ? '#' + v : fmt(v);
  return `<div class="kpis">${K.map(([name, f, t, sub, main, inv]) => {
    const a = f(c), b = p ? f(p) : null;
    return `<div class="kpi${main ? ' main' : ''}"><div class="kl">${name}</div>
      <div class="kv">${show(a, t)}${p ? delta(a, b, inv) : ''}</div>
      <div class="ks">${sub ? sub + ' · ' : ''}${p ? mn(-1) + ': ' + show(b, t) : ''}</div></div>`;
  }).join('')}</div>`;
}

// ---------- Калькулятор цели: сколько нужно, чтобы получить N ₽ ----------
const TIERS = [[200000, 400000, 45], [400000, 600000, 48], [600000, Infinity, 51]];
function scenK(sc) {
  const parts = [];
  const c = sc.closed || 0;
  const ord = sc.msk ? (c > 110 ? 3 : c >= 91 ? 2 : c >= 60 ? 1 : 0) : (c > 200 ? 3 : c >= 151 ? 2 : c >= 100 ? 1 : 0);
  parts.push(['Закрыто наши', ord]);
  const pp = sc.planPct;
  parts.push(['План', pp == null ? 0 : pp < 90 ? -1 : pp <= 110 ? 0 : pp < 130 ? 2 : 3]);
  parts.push(['Претензии', claimsK(sc.claims, false)]);
  const r = sc.rank;
  parts.push(['ТОП РФ', r == null ? 0 : r === 1 ? 3 : r <= 10 ? 2 : r <= 15 ? 1 : 0]);
  if (sc.satNet) parts.push(['Спутник', claimsK(sc.satClaims, true)]);
  return { k: parts.reduce((a, [, v]) => a + v, 0), parts };
}
const overOf = (sc) => sc.cancelsOver != null ? sc.cancelsOver : Math.max(0, (sc.cancels || 0) - Math.floor((sc.closed || 0) * 0.05));
const scenFine = (sc) => sc.newDir ? 0 : 2000 * overOf(sc);
function zpAt(base, sc) {
  if (base < 200000) return base < 100000 ? 50000 : 70000;
  const t = TIERS.find(([lo, hi]) => base >= lo && base < hi);
  return (base - scenFine(sc)) * (t[2] + scenK(sc).k) / 100;
}
function needBase(target, sc) {
  const k = scenK(sc).k, fine = scenFine(sc), cand = [];
  if (target <= 50000) cand.push(0);
  if (target <= 70000) cand.push(100000);
  TIERS.forEach(([lo, hi, t]) => { const p = t + k; if (p <= 0) return; const b = Math.max(lo, target * 100 / p + fine); if (b < hi) cand.push(b); });
  return cand.length ? Math.min(...cand) : null;
}
let TURN_RANK = null; // { place, at } — место в рейтинге по обороту за текущий месяц
let turnLoading = false, TURN_ERR = '', turnTried = 0;
async function ensureTurnRank(force) {
  if (turnLoading) return;
  if (!force && !TURN_RANK && Date.now() - turnTried < 10 * 60e3) return; // после неудачи не чаще раза в 10 минут
  if (!force && TURN_RANK && Date.now() - TURN_RANK.at < FRESH) return;
  if (!force) { const m = await memGet('turnRank'); if (m && Date.now() - m.at < FRESH) { TURN_RANK = m; return true; } }
  turnLoading = true; turnTried = Date.now();
  try {
    const n = new Date();
    const r = await loadContest([new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)]);
    const x = r.list.find((y) => /оборот/i.test(y.name));
    if (x && x.place != null) { TURN_RANK = { place: x.place, at: Date.now() }; TURN_ERR = ''; memSet('turnRank', TURN_RANK); return true; }
    TURN_ERR = r.list.length ? 'в «Рейтинге по обороту» нет вашего города' : 'на странице конкурса не найдены рейтинги';
  } catch (e) { TURN_ERR = e.message; } finally { turnLoading = false; }
}
function turnoverRank() {
  if (TURN_RANK && TURN_RANK.place != null) return TURN_RANK.place;
  const c = RATING && RATING.contest && RATING.contest.cur;
  if (!c || !c.list) return null;
  const x = c.list.find((r) => /оборот/i.test(r.name));
  return x && x.place != null ? x.place : null;
}
function goalHTML(sal) {
  const c = sal.cur, p = sal.prev;
  const g = MOTIV.goalSc || {};
  const base = {
    claims: g.claims != null ? g.claims : c.claims, rank: g.rank != null ? g.rank : (turnoverRank() != null ? turnoverRank() : c.rank),
    cancels: g.cancels != null ? g.cancels : c.cancels, msk: MOTIV.msk, newDir: MOTIV.newDir,
    satNet: num(MOTIV.satNet) || 0, satClaims: num(MOTIV.satClaims)
  };
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), left = dim - now.getDate() + 1;
  const curNet = c.net || 0, curT = c.turnover || 0, curClosed = c.closed || 0;
  // план в рублях = оборот / % выполнения
  const planSum = curT && c.planPct ? curT * 100 / c.planPct : (p && p.turnover && p.planPct ? p.turnover * 100 / p.planPct : null);
  // доля чистого инкаса в обороте и заявок на рубль оборота (сейчас, иначе прошлый месяц)
  const ratio = 0.5; // чистыми — половина оборота
  const perRub = curT && curClosed ? curClosed / curT : (p && p.turnover && p.closed ? p.closed / p.turnover : null);
  const scenFor = (T) => Object.assign({}, base, {
    planPct: planSum && T != null ? T * 100 / planSum : c.planPct,
    closed: perRub && T != null ? Math.max(curClosed, Math.round(T * perRub)) : curClosed
  });
  const nowSc = scenFor(curT);
  const target = num(MOTIV.goal);
  const kNow = scenK(nowSc);
  let res = '<div class="muted">Введите желаемую зарплату</div>';
  if (target) {
    // подбор: бонус → нужный инкас → оборот → план и закрытые → бонус …
    let sc = nowSc, B = null, T = curT;
    for (let i = 0; i < 12; i++) {
      B = needBase(target, sc); if (B == null) break;
      const nNet = Math.max(0, B - base.satNet);
      const T2 = curT + Math.max(0, nNet - curNet) / ratio; // недостающие чистые × 2 = добавочный оборот
      const sc2 = scenFor(T2);
      if (Math.abs(T2 - T) < 1 && scenK(sc2).k === scenK(sc).k) { T = T2; sc = sc2; break; }
      T = T2; sc = sc2;
    }
    if (B == null) res = '<div class="err">С такими коэффициентами процент ≤ 0 — цель недостижима</div>';
    else {
      const needNet = Math.max(0, B - base.satNet), gap = Math.max(0, needNet - curNet);
      const { k, parts } = scenK(sc);
      const tier = B < 200000 ? null : TIERS.find(([lo, hi]) => B >= lo && B < hi);
      const fine = scenFine(sc);
      // что ещё можно сделать (претензии, ТОП, отмены) и сколько это даёт
      const steps = [];
      const tryStep = (name, change, label) => { const s2 = Object.assign({}, sc, change); const B2 = needBase(target, s2); if (B2 != null && B2 < B - 1) steps.push([name, label, B - B2, zpAt(B, s2) - zpAt(B, sc)]); };
      const cm = sc.claims; if (cm != null) { const cn = cm > 5 ? 5 : cm >= 3 ? 2.9 : cm >= 1 ? 0.9 : null; if (cn != null) tryStep('Претензии', { claims: cn }, `${fmt(cm)}% → ${cn === 2.9 ? 'меньше 3' : cn === 0.9 ? 'меньше 1' : 'не больше 5'}%`); }
      const rk = sc.rank; const rn = rk == null || rk > 15 ? 15 : rk > 10 ? 10 : rk > 1 ? 1 : null; if (rn) tryStep('ТОП РФ', { rank: rn }, `${rk == null ? 'вне ТОПа' : '#' + rk} → #${rn}`);
      if (fine) { const allow = Math.floor((sc.closed || 0) * 0.05); tryStep('Отмены', { cancels: allow }, `${sc.cancels} → ${allow} шт. (не больше 5% от ${sc.closed} закрытых)`); }
      const kv = (v) => `<b class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${v}%</b>`;
      res = `<div class="mz">
          <div class="mzv"><div class="kl">Нужно чистого инкаса</div><div class="big">${fmt(Math.round(needNet))} ₽</div>
            <div class="ks">${tier ? `ступень ${tier[2]}% ${k >= 0 ? '+' : '−'} ${Math.abs(k)}% бонусов = ${tier[2] + k}%${fine ? ' · штраф за отмены −' + fmt(fine) + ' ₽' : ''}` : 'оклад: чистый инкас до 200 000 ₽'}</div></div>
          <div class="mzv fc"><div class="kl">Не хватает</div><div class="big">${gap ? fmt(Math.round(gap)) + ' ₽' : 'цель уже достигнута ✓'}</div>
            <div class="ks">${gap ? `≈ ${fmt(Math.round(gap / left))} ₽ чистыми в день · осталось ${left} дн.` : ''}</div></div>
        </div>
        <table class="t mk gtab"><thead><tr><th>Для цели нужно</th><th class="n">Сейчас</th><th class="n">Нужно</th><th>Следующая ступень</th><th class="n">Бонус</th></tr></thead><tbody>
          <tr><td class="nm">Оборот <span class="muted">(чистыми — половина)</span></td><td class="n">${fmt(curT)} ₽</td><td class="n"><b>${fmt(Math.round(T))} ₽</b></td><td class="muted">+${fmt(Math.round(T - curT))} ₽ оборота</td><td class="n">—</td></tr>
          <tr><td class="nm">План выполнен${planSum ? ` <span class="muted">(план ≈ ${fmt(Math.round(planSum))} ₽)</span>` : ''}</td><td class="n">${fmt(c.planPct)}%</td><td class="n"><b>${fmt(sc.planPct)}%</b></td><td>${nextStep('plan', sc.planPct, sc)}</td><td class="n">${kv(parts.find((x) => x[0] === 'План')[1])}</td></tr>
          <tr><td class="nm">Закрыто наши</td><td class="n">${curClosed}</td><td class="n"><b>${sc.closed}</b></td><td>${nextStep('closed', sc.closed, sc)}</td><td class="n">${kv(parts.find((x) => x[0] === 'Закрыто наши')[1])}</td></tr>
          <tr><td class="nm">Претензии</td><td class="n">${c.claims == null ? '—' : fmt(c.claims) + '%'}</td><td class="n"><b>${sc.claims == null ? '—' : fmt(sc.claims) + '%'}</b></td><td>${nextStep('claims', sc.claims, sc)}</td><td class="n">${kv(parts.find((x) => x[0] === 'Претензии')[1])}</td></tr>
          <tr><td class="nm">ТОП РФ <span class="muted">(рейтинг по обороту)</span></td><td class="n">${turnoverRank() != null ? '#' + turnoverRank() : (c.rank != null ? '#' + c.rank : '—')}</td><td class="n"><b>${sc.rank == null ? '—' : '#' + sc.rank}</b></td><td>${nextStep('rank', sc.rank, sc)}</td><td class="n">${kv(parts.find((x) => x[0] === 'ТОП РФ')[1])}</td></tr>
          <tr><td class="nm">Отмены</td><td class="n">${c.cancels == null ? '—' : c.cancels + ' шт.'}</td><td class="n"><b>${sc.cancels == null ? '—' : sc.cancels + ' шт.'}</b></td><td>не больше 5% = ${Math.floor((sc.closed || 0) * 0.05)} шт. из ${sc.closed}${sc.newDir ? ' (первые 2 мес. — не применяется)' : ''}</td><td class="n">${fine ? '<b class="down">−' + fmt(fine) + ' ₽</b>' : '<b class="up">без штрафа</b>'}</td></tr>
          ${parts.find((x) => x[0] === 'Спутник') ? `<tr><td class="nm">Спутник</td><td class="n" colspan="2">претензии ${base.satClaims == null ? '—' : fmt(base.satClaims) + '%'}</td><td>${nextStep('claims', base.satClaims, sc)}</td><td class="n">${kv(parts.find((x) => x[0] === 'Спутник')[1])}</td></tr>` : ''}
          <tr class="tot"><td class="nm">Итого бонусов</td><td colspan="3"></td><td class="n">${kv(k)}</td></tr>
        </tbody></table>
        ${steps.length ? `<table class="t mk" style="margin-top:12px"><thead><tr><th>Что ещё сделать</th><th>Шаг</th><th class="n">Инкаса нужно меньше</th><th class="n">+ к ЗП</th></tr></thead><tbody>
          ${steps.sort((a, b) => b[2] - a[2]).map(([n, l, d, z]) => `<tr><td class="nm">${n}</td><td>${esc(l)}</td><td class="n"><b class="up">−${fmt(Math.round(d))} ₽</b></td><td class="n"><b class="up">+${fmt(Math.round(z))} ₽</b></td></tr>`).join('')}
        </tbody></table>` : ''}`;
    }
  }
  const nf = (key, label, val, step, hint) => `<label class="nfl">${label}<div class="nf"><button type="button" data-step="${key}" data-d="-${step || 1}">−</button><input type="text" inputmode="decimal" data-g="${key}" value="${val == null ? '' : val}"><button type="button" data-step="${key}" data-d="${step || 1}">+</button></div>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  const rkHint = g.rank != null ? 'изменено вручную' : turnoverRank() != null ? 'из рейтинга по обороту' : turnLoading ? 'загружаю рейтинг…' : TURN_ERR ? 'рейтинг: ' + TURN_ERR : 'из CRM';
  return { res, now: `Сейчас: чистый инкас ${fmt(curNet)} ₽ → ЗП ${fmt(Math.round(zpAt(curNet + base.satNet, nowSc)))} ₽ · бонусы ${kNow.k > 0 ? '+' : ''}${kNow.k}%`,
    shell: () => `<div class="card motiv goal">
    <div class="ch"><div><div class="ct">Калькулятор цели</div><div class="cs">план и «закрыто наши» растут вместе с нужным оборотом · бонусы по системе мотивации</div></div></div>
    <div class="goalin"><div class="gbig"><input type="text" inputmode="numeric" data-goal value="${esc(MOTIV.goal ? fmt(num(MOTIV.goal)) : '')}" placeholder="Сколько хочу получить"><span>₽</span></div>
      <div class="chips">${[100000, 150000, 200000, 250000, 300000, 400000].map((v) => `<button type="button" data-qv="${v}" class="${num(MOTIV.goal) === v ? 'on' : ''}">${fmt(v / 1000)} тыс.</button>`).join('')}</div></div>
    <div class="cs" style="margin:10px 0 6px">Чего нет в обороте (можно менять):</div>
    <div class="nfrow">
      ${nf('claims', 'Претензии, %', base.claims, 0.1)}${nf('rank', 'Место в РФ', base.rank, 1, rkHint)}${nf('cancels', 'Отмен, шт.', base.cancels, 1)}
      <button type="button" class="btn-l" data-greset>↺ Данные CRM</button>
    </div>
    <div class="goalres">${res}</div>
    <div class="cs gnow" style="margin-top:8px"></div>
  </div>` };
}
function nextStep(kind, v, sc) {
  if (v == null) return '—';
  if (kind === 'plan') return v < 90 ? '90% → 0% (сейчас −1%)' : v <= 110 ? 'больше 110% → +2%' : v < 130 ? '130% → +3%' : 'максимум +3%';
  if (kind === 'closed') { const th = sc.msk ? [[60, 1], [91, 2], [111, 3]] : [[100, 1], [151, 2], [201, 3]]; const n = th.find(([x]) => x > v); return n ? `${n[0]} → +${n[1]}%` : 'максимум +3%'; }
  if (kind === 'claims') return v > 5 ? 'не больше 5% → 0%' : v >= 3 ? 'меньше 3% → +1%' : v >= 1 ? 'меньше 1% → +3%' : 'максимум +3%';
  if (kind === 'rank') return v > 15 ? '#15 → +1%' : v > 10 ? '#10 → +2%' : v > 1 ? '#1 → +3%' : 'максимум +3%';
  return '—';
}
function goalCard(sal) { const g = goalHTML(sal); return g.shell().replace('<div class="cs gnow" style="margin-top:8px"></div>', `<div class="cs gnow" style="margin-top:8px">${g.now}</div>`); }
function bindGoal() {
  const box = view.querySelector('.goal'); if (!box) return;
  const update = () => { const g = goalHTML(SALARY); box.querySelector('.goalres').innerHTML = g.res; box.querySelector('.gnow').innerHTML = g.now;
    box.querySelectorAll('[data-qv]').forEach((b) => b.classList.toggle('on', num(MOTIV.goal) === +b.dataset.qv)); };
  const gi = box.querySelector('[data-goal]');
  gi.addEventListener('input', () => {
    // формат «150 000» без прыжков курсора
    const digitsBefore = gi.value.slice(0, gi.selectionStart).replace(/\D/g, '').length;
    const raw = gi.value.replace(/\D/g, '');
    MOTIV.goal = raw; saveMotiv();
    gi.value = raw ? (+raw).toLocaleString('ru-RU') : '';
    let pos = 0, seen = 0; while (pos < gi.value.length && seen < digitsBefore) { if (/\d/.test(gi.value[pos])) seen++; pos++; }
    try { gi.setSelectionRange(pos, pos); } catch (e) {}
    update();
  });
  box.querySelectorAll('[data-qv]').forEach((b) => b.onclick = () => { MOTIV.goal = b.dataset.qv; saveMotiv(); gi.value = (+b.dataset.qv).toLocaleString('ru-RU'); update(); });
  const setG = (key, v) => { MOTIV.goalSc = MOTIV.goalSc || {}; MOTIV.goalSc[key] = v; saveMotiv(); update(); };
  box.querySelectorAll('[data-g]').forEach((el) => el.addEventListener('input', () => {
    const v = el.value.replace(',', '.').replace(/[^\d.]/g, '');
    setG(el.dataset.g, v === '' ? null : parseFloat(v));
  }));
  box.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
    const el = box.querySelector(`[data-g="${b.dataset.step}"]`);
    const cur = parseFloat(String(el.value).replace(',', '.')) || 0, d = parseFloat(b.dataset.d);
    let v = Math.max(0, Math.round((cur + d) * 10) / 10); if (b.dataset.step === 'rank') v = Math.max(1, v);
    el.value = String(v).replace('.', ','); setG(b.dataset.step, v);
  });
  box.querySelector('[data-greset]').onclick = () => { MOTIV.goalSc = {}; saveMotiv(); box.outerHTML = goalCard(SALARY); bindGoal(); };
}

function renderSalary() {
  if (!TURN_RANK || Date.now() - TURN_RANK.at > FRESH) if (!turnLoading && (TURN_RANK || Date.now() - turnTried > 10 * 60e3)) ensureTurnRank().then(() => { if (MODE === 'zp' && SALARY && view && ROOT) renderSalary(); });
  if (!RATING) memGet('rating').then((m) => { if (m && !RATING) { RATING = m.data; if (MODE === 'zp' && SALARY && view) renderSalary(); } });
  if (!SALARY) { view.innerHTML = SALARY_ERR ? `<div class="err">${esc(SALARY_ERR)}</div>` : '<div class="loading"><div class="spin"></div>Загружаю «Зарплата Директора» за этот и прошлый месяц…</div>'; return; }
  view.innerHTML = salaryMetrics(SALARY) + salaryHTML(SALARY) + goalCard(SALARY);
  bindMotiv();
  bindGoal();
}

// ---------- Реклама: «Реклама → Реклама» (по дням) и «Реклама → Отчет по РК» ----------
function adMenuUrl(re) {
  const tg = [...document.querySelectorAll('a')].find((a) => /^реклама$/i.test(a.textContent.trim()) && (a.classList.contains('dropdown-toggle') || /^#?$/.test(a.getAttribute('href') || '#')));
  const scope = tg ? (tg.closest('li, .dropdown') || tg.parentElement) : document;
  const a = [...scope.querySelectorAll('a[href]')].find((x) => x !== tg && re.test(x.textContent.trim()) && !/^(#|javascript:)/i.test(x.getAttribute('href')));
  return a ? a.href : null;
}
// имена параметров адреса без итераторов (в Firefox-дополнении они бывают недоступны)
const qKeys = (u) => String(u.search || '').replace(/^\?/, '').split('&').filter(Boolean).map((p) => decodeURIComponent(p.split('=')[0].replace(/\+/g, ' ')));
const DATE_RE = /^\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?(\s|$)|^\d{4}-\d{2}-\d{2}/;
// главная таблица страницы + все её страницы
async function adCollect(doc) {
  const url = doc.mncUrl || location.href;
  const tables = [...doc.querySelectorAll('table')].map(readTable).filter((t) => t.heads.length && t.rows.length);
  if (!tables.length) return null;
  const main = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
  let rows = main.rows.slice();
  const txt = doc.body.textContent.replace(/\s+/g, ' ');
  const sm = txt.match(/Показаны записи\s*1\s*-\s*(\d+)\s*из\s*([\d\s]+?)\./i);
  const total = sm ? +sm[2].replace(/\D/g, '') : rows.length;
  if (total > rows.length) try {
    let box = main.el.parentElement;
    while (box && box !== doc.body && !box.querySelector('.pagination')) box = box.parentElement;
    const link = box && [...box.querySelectorAll('.pagination a[href]')].find((x) => /page=/i.test(x.getAttribute('href')));
    if (link) {
      const u = new URL(link.getAttribute('href'), url);
      const key = qKeys(u).find((k) => /page$/i.test(k) && !/per-page/i.test(k)) || 'page';
      const pages = Math.ceil(total / (+sm[1] || 50));
      const dates0 = dateInputs(doc).map((i) => i.value).join('|');
      const urls = []; for (let p = 2; p <= Math.min(pages, 100); p++) { const x = new URL(u.href); x.searchParams.set(key, p); urls.push(x.href); }
      for (let i = 0; i < urls.length; i += 8) {
        const docs = await Promise.all(urls.slice(i, i + 8).map((x) => fetchDoc(x).catch(() => null)));
        docs.forEach((d) => {
          if (!d) return;
          if (dates0 && dateInputs(d).map((x) => x.value).join('|') !== dates0) return; // другой период — не смешиваем
          const t = [...d.querySelectorAll('table')].map(readTable).filter((x) => x.heads.join('|') === main.heads.join('|')).sort((a, b) => b.rows.length - a.rows.length)[0];
          if (t) rows = rows.concat(t.rows);
        });
      }
    }
  } catch (e) { /* догрузка страниц не удалась — считаем по тому, что есть */ }
  const seen = new Set();
  rows = rows.filter((r) => { const k = r.join('|'); return !seen.has(k) && seen.add(k); });
  return { title: main.title, heads: main.heads, rows, total, partial: rows.length < total };
}
function adAnalyze(t) {
  if (!t) return null;
  const rows = t.rows.filter((r) => !/^(итого|всего)/i.test(r[0] || '') && !/^(итого|всего)/i.test(r[1] || ''));
  const H = t.heads;
  const isNum = (i) => { const v = rows.map((r) => r[i]).filter((x) => x && x !== '-' && x !== '—'); return v.length && v.filter((x) => parseNum(x) != null).length / v.length >= .7; };
  const skip = (h) => /kpi|кпи|^№$|^id$|^#$/i.test(h || '');
  const metrics = H.map((h, i) => ({ h, i })).filter((x) => x.h && !skip(x.h) && isNum(x.i));
  const dateCol = H.findIndex((h, i) => { const v = rows.map((r) => r[i] || ''); return v.length && v.filter((x) => DATE_RE.test(x)).length / v.length > .6; });
  const textCols = H.map((h, i) => ({ h, i })).filter((x) => x.h && !skip(x.h) && x.i !== dateCol && !isNum(x.i)).filter((x) => { const n = new Set(rows.map((r) => r[x.i])).size; return n >= 2 && n <= Math.max(60, rows.length * .6); });
  const avgLike = (h) => /%|средн|ср\.|конверс|доля/i.test(h);
  const totals = {}; metrics.forEach((m) => { const v = rows.map((r) => parseNum(r[m.i])).filter((x) => x != null); totals[m.h] = v.length ? (avgLike(m.h) ? v.reduce((a, b) => a + b, 0) / v.length : v.reduce((a, b) => a + b, 0)) : null; });
  const group = (ci) => { const g = new Map(); rows.forEach((r) => { const k = (r[ci] || '—').trim(); const o = g.get(k) || {}; metrics.forEach((m) => { o[m.h] = (o[m.h] || 0) + (parseNum(r[m.i]) || 0); }); g.set(k, o); }); return g; };
  const byDay = dateCol >= 0 ? (() => { const g = new Map(); rows.forEach((r) => { const m = String(r[dateCol]).match(/^(\d{1,2})[.\-/](\d{1,2})|^\d{4}-(\d{2})-(\d{2})/); if (!m) return; const day = +(m[1] || m[4]); const o = g.get(day) || {}; metrics.forEach((mm) => { o[mm.h] = (o[mm.h] || 0) + (parseNum(r[mm.i]) || 0); }); g.set(day, o); }); return g; })() : null;
  return { title: t.title, heads: H, rows, metrics, dateCol, textCols, totals, group, byDay, total: t.total, partial: t.partial, labelCol: textCols[0] ? textCols[0].i : 0 };
}
async function loadAds() {
  const adUrl = adMenuUrl(/^реклама$/i), rkUrl = adMenuUrl(/^отч[её]т\s+по\s+рк$/i);
  if (!adUrl && !rkUrl) throw new Error('В меню CRM «Реклама» не найдены пункты «Реклама» и «Отчет по РК»');
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const cur = [new Date(y, m, 1), new Date(y, m + 1, 0)], prev = [new Date(y, m - 1, 1), new Date(y, m, 0)];
  const one = async (url, r) => { if (!url) return null; const d = await loadWithDates(url, r); const t = await adCollect(d); if (t) t.dated = !!d.mncDated; return t; };
  const [aC, aP, rC, rP] = await Promise.all([one(adUrl, cur), one(adUrl, prev).catch(() => null), one(rkUrl, cur).catch(() => null), one(rkUrl, prev).catch(() => null)]);
  const sameAs = (a, b) => a && b && JSON.stringify(a.rows) === JSON.stringify(b.rows);
  return { ad: { cur: aC, prev: sameAs(aC, aP) || (aP && !aP.dated) ? null : aP }, rk: { cur: rC, prev: sameAs(rC, rP) || (rP && !rP.dated) ? null : rP } };
}
let ADS = null, ADS_ERR = '';
function adSection(name, src, opts) {
  const n = new Date();
  const mn = (k) => { const s = new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const A = adAnalyze(src.cur), P = adAnalyze(src.prev);
  if (!A) return `<div class="card"><div class="ct">${name}</div><div class="muted">нет данных</div></div>`;
  const id = opts.id;
  const kp = A.metrics.slice(0, 8).map((m, k) => {
    const a = A.totals[m.h], b = P ? P.totals[m.h] : null;
    return `<div class="kpi${k === 0 ? ' main' : ''}"><div class="kl">${esc(m.h)}</div><div class="kv">${fmt(a)}${P ? delta(a, b) : ''}</div><div class="ks">${P ? mn(-1) + ': ' + fmt(b) : '&nbsp;'}</div></div>`;
  }).join('');
  // группировка (по РК / по промоутеру / по виду рекламы)
  const gc = opts.groupBy != null ? opts.groupBy : (A.textCols[0] ? A.textCols[0].i : -1);
  let groupHTML = '';
  if (gc >= 0) {
    const g = A.group(gc), gp = P ? P.group(P.heads.indexOf(A.heads[gc])) : new Map();
    const sortM = (opts.sortRe && A.metrics.find((m) => opts.sortRe.test(m.h))) || A.metrics[0];
    const items = [...g.entries()].sort((x, y) => (y[1][sortM.h] || 0) - (x[1][sortM.h] || 0));
    const mx = Math.max(1, ...items.map(([, o]) => o[sortM.h] || 0));
    const cols = A.metrics.slice(0, 6);
    groupHTML = `<div class="card"><div class="ch"><div><div class="ct">${esc(A.heads[gc])}</div><div class="cs">по «${esc(sortM.h)}», от большего к меньшему${P ? ' · изм. к ' + mn(-1).toLowerCase() : ''}</div></div></div>
      <div class="scroll"><table class="t mst"><thead><tr><th>№</th><th>${esc(A.heads[gc])}</th>${cols.map((c) => `<th class="n">${esc(c.h)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${items.map(([k, o], i) => { const p = gp.get(k); return `<tr><td class="rn2">${i + 1}</td><td class="nm">${esc(k)}</td>${cols.map((c) => `<td class="n">${c === sortM ? '<b>' + fmt(o[c.h]) + '</b>' : fmt(o[c.h])}${p && c === sortM ? delta(o[c.h], p[c.h]) : ''}</td>`).join('')}<td style="width:18%"><span class="tb"><i class="in" style="width:${(o[sortM.h] || 0) * 100 / mx}%"></i></span></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    if (opts.donut) setTimeout(() => { const box = view.querySelector('#' + id + '-d'); if (box) { let it = items.map(([k, o]) => ({ label: k, value: o[sortM.h] || 0 })).filter((x) => x.value > 0); if (it.length > 8) it = it.slice(0, 7).concat([{ label: 'Остальные', value: it.slice(7).reduce((a, b) => a + b.value, 0), color: '#cfe3d6' }]); donut(box, it, { center: sortM.h.length > 14 ? 'всего' : sortM.h.toLowerCase() }); } }, 0);
  }
  const chart = A.byDay ? `<div class="card big"><div class="ch"><div><div class="ct">${esc(name)} по дням</div><div class="cs">${A.metrics.slice(0, 3).map((m) => esc(m.h)).join(', ')} · ${mn(0)}${P && P.byDay ? ' и ' + mn(-1) + ' (пунктир)' : ''}</div></div></div><div id="${id}-c"></div></div>` : '';
  if (A.byDay) setTimeout(() => {
    const box = view.querySelector('#' + id + '-c'); if (!box) return;
    const dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: dim }, (_, i) => i + 1);
    const ms = A.metrics.slice(0, 3);
    const series = ms.map((m, k) => ({ name: m.h, values: days.map((d) => (A.byDay.get(d) || {})[m.h] ?? (d <= n.getDate() ? 0 : null)), color: PALETTE[k] }));
    if (P && P.byDay) series.push({ name: ms[0].h + ' · ' + mn(-1), values: days.map((d) => (P.byDay.get(d) || {})[ms[0].h] ?? null), color: '#5f7468', dashed: true });
    smoothChart(box, days.map(String), series.map((s) => Object.assign(s, { values: s.values.map((v) => v == null ? null : v) })), { h: 260 });
  }, 0);
  return `<h2 class="sec">${esc(name)}${A.partial ? ' <span class="muted">(загружены не все страницы)</span>' : ''}${!P ? ' <span class="muted">· прошлый месяц недоступен</span>' : ''}</h2>
    <div class="kpis">${kp}</div>
    ${chart}
    ${opts.donut ? `<div class="row2"><div class="card"><div class="ch"><div class="ct">Доли</div></div><div id="${id}-d"></div></div><div>${groupHTML}</div></div>` : groupHTML}`;
}
function renderAds() {
  if (!ADS) { view.innerHTML = ADS_ERR ? `<div class="err">${esc(ADS_ERR)}</div>` : '<div class="loading"><div class="spin"></div>Собираю «Реклама» и «Отчет по РК» за этот и прошлый месяц…</div>'; return; }
  view.innerHTML = adSection('Реклама: выдано и разнесено', ADS.ad, { id: 'ad' }) +
    adSection('Отчёт по РК: заявки от рекламных кампаний', ADS.rk, { id: 'rk', donut: true, sortRe: /сво|наш/i });
  requestAnimationFrame(() => requestAnimationFrame(() => view.querySelectorAll('.tb').forEach((x) => x.classList.add('on'))));
}


// ---------- Рейтинг: «Конкурсы → Конкурс городов» и «Игра → Ранги по городам» ----------
function menuUrl(toggleRe, itemRe) {
  const tg = [...document.querySelectorAll('a')].find((a) => toggleRe.test(a.textContent.trim()) && (a.classList.contains('dropdown-toggle') || /^#?$/.test(a.getAttribute('href') || '#')));
  const scope = tg ? (tg.closest('li, .dropdown') || tg.parentElement) : null;
  if (!scope) return null;
  const a = [...scope.querySelectorAll('a[href]')].find((x) => x !== tg && itemRe.test(x.textContent.trim()) && !/^(#|javascript:)/i.test(x.getAttribute('href')));
  return a ? a.href : null;
}
const normCity = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
function myCity() { return (SALARY && SALARY.cur && SALARY.cur.city) || 'Красноярск'; }
function pickCity(d) {
  const city = normCity(myCity());
  let changed = false;
  d.querySelectorAll('select').forEach((sel) => {
    const o = [...sel.options].find((x) => normCity(x.text) === city);
    if (!o) return;
    const lbl = ((sel.closest('.form-group, div') || {}).textContent || '') + ' ' + sel.name + ' ' + sel.id;
    if (!/город|city/i.test(lbl)) return;
    if (sel.value === o.value) return;
    sel.value = o.value; changed = true;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    try { const jq = d.defaultView.wrappedJSObject ? d.defaultView.wrappedJSObject.jQuery : d.defaultView.jQuery; if (jq) jq(sel.wrappedJSObject || sel).trigger('change'); } catch (e) {}
  });
  return changed;
}
function parseContest(doc) {
  const city = normCity(myCity());
  const out = [];
  [...doc.querySelectorAll('table')].map(readTable).forEach((t) => {
    const iR = col(t, /^(рейтинг|место|№)$/i), iC = col(t, /^город/i);
    if (iR < 0 || iC < 0) return;
    const row = t.rows.find((r) => normCity(r[iC]) === city);
    const name = (t.title || '').replace(/^рейтинг\s+по\s+/i, '').trim();
    const extra = t.heads.map((h, i) => [h, row ? row[i] : '']).filter(([h], i) => i !== iR && i !== iC && h);
    out.push({ name: name ? name[0].toUpperCase() + name.slice(1) : 'Рейтинг', place: row ? parseNum(row[iR]) : null, extra });
  });
  return out;
}
async function loadContest(range) {
  const url = menuUrl(/^конкурсы$/i, /город/i);
  if (!url) throw new Error('В меню «Конкурсы» не найден рейтинг по городам');
  const d = await loadWithDates(url, range, pickCity);
  return { list: parseContest(d), dated: !!d.mncDated };
}
// место города в таблице «Ранги по городам» при сортировке по столбцу (все страницы)
async function gamePlaces(doc) {
  const city = normCity(myCity());
  const tables = [...doc.querySelectorAll('table')].map(readTable).filter((t) => col(t, /^город/i) >= 0);
  const t0 = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!t0) return null;
  const iC = col(t0, /^город/i), iRank = col(t0, /^ранг/i);
  const base = doc.mncUrl || location.href;
  const placeIn = async (d) => {
    const all = await adCollect(d);
    if (!all) return null;
    const ic = col(all, /^город/i);
    const k = all.rows.findIndex((r) => normCity(r[ic]) === city);
    return { place: k >= 0 ? k + 1 : null, of: all.rows.length, row: k >= 0 ? all.rows[k] : null, heads: all.heads };
  };
  // сортировки из заголовков таблицы
  const sorts = [...t0.el.querySelectorAll('thead a[href*="sort="]')].map((a) => {
    const u = new URL(a.getAttribute('href'), base);
    const key = (u.search.match(/[?&]sort=([^&]*)/) || [])[1] || '';
    const attr = decodeURIComponent(key).replace(/^-/, '');
    const desc = u.href.replace(/([?&]sort=)[^&]*/, '$1-' + encodeURIComponent(attr));
    return { name: a.textContent.replace(/\s+/g, ' ').trim(), url: desc };
  }).filter((x) => x.name && !/^(город|ранг|трофеи)$/i.test(x.name));
  const res = [];
  const first = await placeIn(doc);
  const curSort = (t0.el.querySelector('thead a.desc, thead a.asc') || {}).textContent;
  let myRow = first && first.row, heads = first && first.heads;
  for (let i = 0; i < sorts.length; i += 4) {
    const part = await Promise.all(sorts.slice(i, i + 4).map(async (s) => {
      const d = await fetchDoc(s.url).catch(() => null); if (!d) return null;
      d.mncUrl = s.url;
      const p = await placeIn(d).catch(() => null);
      if (p && p.row && !myRow) { myRow = p.row; heads = p.heads; }
      return p ? { name: s.name, place: p.place, of: p.of } : null;
    }));
    part.forEach((x) => x && res.push(x));
  }
  if (!res.length && first) res.push({ name: (curSort || 'Сумма филиала').trim(), place: first.place, of: first.of });
  const val = (re) => { if (!myRow || !heads) return ''; const i = heads.findIndex((h) => re.test(h)); return i >= 0 ? myRow[i] : ''; };
  return { places: res, rankTitle: val(/^ранг/i), trophies: val(/^трофе/i), values: heads ? heads.map((h, i) => [h, myRow ? myRow[i] : '']).filter(([h]) => h && !/^(ранг|трофеи|город)$/i.test(h)) : [] };
}
async function loadGame(range) {
  const url = menuUrl(/^игра$/i, /ранги\s+по\s+город/i);
  if (!url) throw new Error('В меню «Игра» не найден пункт «Ранги по городам»');
  const d = await loadWithDates(url, range, pickCity);
  const g = await gamePlaces(d);
  if (g) g.dated = !!d.mncDated;
  return g;
}
async function loadRating() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const cur = [new Date(y, m, 1), new Date(y, m + 1, 0)], prev = [new Date(y, m - 1, 1), new Date(y, m, 0)];
  const [cC, cP, gC, gP] = await Promise.all([loadContest(cur).catch((e) => ({ err: e.message })), loadContest(prev).catch(() => null), loadGame(cur).catch((e) => ({ err: e.message })), loadGame(prev).catch(() => null)]);
  return { contest: { cur: cC, prev: cP && cP.dated ? cP : null }, game: { cur: gC, prev: gP && gP.dated ? gP : null } };
}
let RATING = null, RATING_ERR = '';
function placeDelta(a, b) {
  if (a == null || b == null) return '';
  const d = b - a; // меньше место — лучше
  if (!d) return '<span class="dl eq">• 0</span>';
  return `<span class="dl ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
}
function renderRating() {
  if (!RATING) { view.innerHTML = RATING_ERR ? `<div class="err">${esc(RATING_ERR)}</div>` : '<div class="loading"><div class="spin"></div>Собираю «Конкурс городов» и «Ранги по городам»…</div>'; return; }
  const n = new Date();
  const mn = (k) => { const s = new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
  const g = RATING.game.cur, gp = RATING.game.prev, c = RATING.contest.cur, cp = RATING.contest.prev;
  let html = '';
  if (g && !g.err) {
    const pm = new Map(((gp && gp.places) || []).map((x) => [x.name, x.place]));
    const main = g.places[0];
    html += `<div class="kpis">
      <div class="kpi main"><div class="kl">Место в РФ · ${esc(main ? main.name : '')}</div><div class="kv">${main && main.place ? '#' + main.place : '—'}<small> из ${main ? main.of : '—'}</small>${main ? placeDelta(main.place, pm.get(main.name)) : ''}</div><div class="ks">${esc(myCity())}${gp && main ? ' · ' + mn(-1) + ': #' + (pm.get(main.name) || '—') : ''}</div></div>
      <div class="kpi"><div class="kl">Ранг</div><div class="kv" style="font-size:22px">${esc(g.rankTitle || '—')}</div><div class="ks">Игра → Ранги по городам</div></div>
      ${g.values.slice(0, 4).map(([h, v]) => `<div class="kpi"><div class="kl">${esc(h)}</div><div class="kv" style="font-size:22px">${esc(v || '—')}</div></div>`).join('')}
    </div>
    <div class="card"><div class="ch"><div><div class="ct">Место в ТОПе по метрикам</div><div class="cs">Игра → Ранги по городам · места посчитаны по всем страницам, сортировка по каждому столбцу</div></div></div>
      <table class="t mst"><thead><tr><th>Метрика</th><th class="n">${mn(0)}</th><th></th>${gp ? `<th class="n">${mn(-1)}</th><th class="n">изм.</th>` : ''}</tr></thead><tbody>
      ${g.places.map((x) => { const w = x.place && x.of ? (x.of - x.place + 1) * 100 / x.of : 0; const p = pm.get(x.name); return `<tr><td class="nm">${esc(x.name)}</td><td class="n"><b>${x.place ? '#' + x.place : '—'}</b> <span class="muted">из ${x.of}</span></td><td style="width:30%"><span class="tb"><i class="in" style="width:${w}%"></i></span></td>${gp ? `<td class="n cm">${p ? '#' + p : '—'}</td><td class="n">${placeDelta(x.place, p)}</td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>`;
  } else html += `<div class="err">Ранги по городам: ${esc((g && g.err) || 'нет данных')}</div>`;
  if (c && !c.err) {
    const pm = new Map(((cp && cp.list) || []).map((x) => [x.name, x.place]));
    html += `<div class="card"><div class="ch"><div><div class="ct">Конкурс городов</div><div class="cs">${mn(0)}${cp ? ' в сравнении с ' + mn(-1).toLowerCase() : ''} · ${esc(myCity())}</div></div></div>
      <table class="t mst"><thead><tr><th>Рейтинг</th><th class="n">${mn(0)}</th>${cp ? `<th class="n">${mn(-1)}</th><th class="n">изм.</th>` : ''}</tr></thead><tbody>
      ${c.list.map((x) => { const p = pm.get(x.name); return `<tr><td class="nm">${esc(x.name)}</td><td class="n"><b>${x.place != null ? '#' + x.place : '—'}</b></td>${cp ? `<td class="n cm">${p != null ? '#' + p : '—'}</td><td class="n">${placeDelta(x.place, p)}</td>` : ''}</tr>`; }).join('') || '<tr><td class="muted">рейтингов не найдено</td></tr>'}
      </tbody></table></div>`;
  } else html += `<div class="err">Конкурс городов: ${esc((c && c.err) || 'нет данных')}</div>`;
  view.innerHTML = html;
  requestAnimationFrame(() => requestAnimationFrame(() => view.querySelectorAll('.tb').forEach((x) => x.classList.add('on'))));
}

let MODE = 'an';
let loadSeq = 0;
async function load(force) {
  if (!ROOT) return;
  if (!refreshing) { abortFrames(); INFLIGHT.clear(); }
  if (MODE === 'rt') {
    const seq = ++loadSeq;
    const tm = (x) => new Date(x).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (!RATING && !force) { const m = await memGet('rating'); if (m) { RATING = m.data; renderRating(); $('#upd').textContent = 'из памяти · ' + tm(m.at); if (Date.now() - m.at < FRESH) return; } }
    renderRating();
    if (RATING) $('#upd').textContent = 'обновляю…';
    try { const x = await loadRating(); RATING = x; RATING_ERR = ''; { const t = x.contest && x.contest.cur && x.contest.cur.list && x.contest.cur.list.find((y) => /оборот/i.test(y.name)); if (t && t.place != null) { TURN_RANK = { place: t.place, at: Date.now() }; memSet('turnRank', TURN_RANK); } } memSet('rating', { data: x, at: Date.now() }); } catch (e) { if (e.message === 'cancelled') return; if (!RATING) RATING_ERR = e.message; }
    if (!ROOT || seq !== loadSeq) return;
    renderRating();
    $('#upd').textContent = 'обновлено ' + tm(Date.now());
    return;
  }
  if (MODE === 'ad') {
    const seq = ++loadSeq;
    const tm = (x) => new Date(x).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (!ADS && !force) { const m = await memGet('ads'); if (m) { ADS = m.data; renderAds(); $('#upd').textContent = 'из памяти · ' + tm(m.at); if (Date.now() - m.at < FRESH) return; } }
    renderAds();
    if (!ADS || force || true) {
      if (ADS) $('#upd').textContent = 'обновляю…';
      try { const x = await loadAds(); ADS = x; ADS_ERR = ''; memSet('ads', { data: x, at: Date.now() }); } catch (e) { if (e.message === 'cancelled') return; if (!ADS) ADS_ERR = e.message; }
      if (!ROOT || seq !== loadSeq) return;
      renderAds();
      $('#upd').textContent = 'обновлено ' + tm(Date.now());
    }
    return;
  }
  if (MODE === 'zp') {
    const seq = ++loadSeq;
    $('#upd').textContent = '';
    renderSalary();
    if (!SALARY && !force) { const m = await memGet('salary'); if (m && Date.now() - m.at < FRESH) { SALARY = m.data; renderSalary(); $('#upd').textContent = 'из памяти · ' + new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); return; } }
    if (!SALARY || force) {
      try { SALARY = await loadSalary(); SALARY_ERR = ''; memSet('salary', { data: SALARY, at: Date.now() }); } catch (e) { if (e.message === 'cancelled') return; SALARY_ERR = e.message; }
      if (!ROOT || seq !== loadSeq) return;
      renderSalary();
    }
    $('#upd').textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return;
  }
  const seq = ++loadSeq;
  view.innerHTML = '<div class="loading"><div class="spin"></div>Формирую отчёт за выбранные даты…</div>';
  try {
    renderTop();
    $('#upd').textContent = '';
    const guard = setTimeout(() => { if (seq === loadSeq && view && view.querySelector('.loading')) view.innerHTML = '<div class="err">Отчёт грузится слишком долго. Нажмите ⟳.</div>'; }, 40000);
    const rg = ranges(PERIOD, 'day');
    const useCmp = PERIOD === 'month' || CMPON;
    const tm = (x) => new Date(x).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const [mc, mp] = await Promise.all([cachedAll(rg.cur), useCmp ? cachedAll(rg.cmp) : null]);
    if (mc) {
      STATE = { cur: mc, cmp: mp, rg };
      render();
      const fresh = Date.now() - mc.at < FRESH && (!useCmp || (mp && Date.now() - mp.at < FRESH));
      $('#upd').textContent = (fresh ? 'из памяти · ' : 'из памяти, обновляю… · ') + tm(mc.at);
      if (fresh && !force) return;
    }
    const cmpP = !useCmp ? Promise.resolve(null) : (mp && Date.now() - mp.at < FRESH && !force) ? Promise.resolve(mp) : loadAll(rg.cmp, false).catch(() => mp);
    const cur = (mc && Date.now() - mc.at < FRESH && !force) ? mc : await loadAll(rg.cur, true);
    if (!ROOT || seq !== loadSeq) return;
    STATE = { cur, cmp: STATE && STATE.rg === rg ? STATE.cmp : mp, rg };
    render();
    if (useCmp) $('#upd').textContent = 'загружаю сравнение…';
    const cmp = await cmpP;
    if (!ROOT || seq !== loadSeq) return;
    STATE.cmp = cmp;
    render();
    $('#upd').textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    if (e && e.message === 'cancelled') return;
    if (view && seq === loadSeq) view.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

function open(mode) {
  mode = mode || 'an';
  if (document.getElementById('mnc-dash')) { if (MODE !== mode) { MODE = mode; setMode(); safeLoad(); } return; }
  MODE = mode;
  ROOT = document.createElement('div'); ROOT.id = 'mnc-dash';
  ROOT.innerHTML = `<div class="top">
      <div class="brand"><span class="dh"><span class="dh-a">DIR</span><span class="dh-b">HELPER</span></span><span id="ttl">Аналитика</span></div>
      <div class="period" id="period"><button data-p="today" class="on">Сегодня</button><button data-p="month">За месяц</button></div>
      <button id="wide" class="ic" title="Шире / уже">⇔</button>
      <button id="reload" class="ic" title="Обновить">⟳</button>
      <button id="close" class="ic" title="Закрыть (Esc)">✕</button>
    </div>
    <div class="sub2"><div class="cmp" id="cmp"></div><span id="upd"></span></div>
    <div class="dates" id="dates"></div>
    <main id="view"></main>`;
  document.body.appendChild(ROOT);
  if (!document.getElementById('mnc-tip')) { const tp = document.createElement('div'); tp.id = 'mnc-tip'; document.body.appendChild(tp); }
  view = $('#view');
  setMode();
  ROOT.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => ROOT.classList.add('on')));
  ROOT.querySelectorAll('#period button').forEach((b) => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); PERIOD = b.dataset.p; ROOT.querySelectorAll('#period button').forEach((x) => x.classList.toggle('on', x === b)); safeLoad(); });
  $('#reload').onclick = () => { if (MODE === 'zp') { SALARY = null; SALARY_ERR = ''; TURN_RANK = null; } safeLoad(true); };
  $('#wide').onclick = () => { ROOT.classList.toggle('wide'); setTimeout(() => { if (MODE === 'zp') renderSalary(); else if (MODE === 'ad') renderAds(); else if (MODE === 'rt') renderRating(); else if (STATE) render(); }, 420); };
  $('#close').onclick = close;
  document.addEventListener('keydown', onKey);
  safeLoad();
}
function setMode() {
  const zp = MODE === 'zp' || MODE === 'ad' || MODE === 'rt';
  ROOT.classList.toggle('zp', zp);
  $('#ttl').textContent = MODE === 'zp' ? 'Зарплата директора' : MODE === 'ad' ? 'Реклама' : MODE === 'rt' ? 'Рейтинг городов' : 'Аналитика';
  if (MODE === 'rt') {
    const n = new Date(), mn0 = (k) => new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    $('#cmp').innerHTML = `<span>${mn0(0)} в сравнении с ${mn0(-1)} · Конкурсы, Игра → Ранги по городам</span>`;
    $('#dates').innerHTML = '';
  } else if (MODE === 'ad') {
    const n = new Date(), mn = (k) => new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    $('#cmp').innerHTML = `<span>${mn(0)} в сравнении с ${mn(-1)} · CRM → Реклама, Отчет по РК</span>`;
    $('#dates').innerHTML = '';
  } else if (zp) {
    const n = new Date(), mn = (k) => new Date(n.getFullYear(), n.getMonth() + k, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    $('#cmp').innerHTML = `<span>${mn(0)} в сравнении с ${mn(-1)} · CRM → Зарплата Директора</span>`;
    $('#dates').innerHTML = '';
  }
}
function safeLoad(force) {
  let p;
  try { p = load(force); } catch (e) { showErr(e); return; }
  if (p && p.catch) p.catch(showErr);
}
function showErr(e) {
  if (!e || e.message === 'cancelled' || !view) return;
  view.innerHTML = `<div class="err">Ошибка: ${esc(e.message || e)}<br><small>${esc((e.stack || '').split('\n').slice(0, 2).join(' · '))}</small></div>`;
}
function onKey(e) { if (e.key === 'Escape') close(); }
function close() {
  if (!ROOT) return;
  const r = ROOT; r.classList.remove('on'); document.removeEventListener('keydown', onKey);
  const tp = document.getElementById('mnc-tip'); if (tp) tp.style.opacity = 0;
  loadSeq++;
  if (!refreshing) { abortFrames(); INFLIGHT.clear(); }
  setTimeout(() => r.remove(), 450); ROOT = null;
}
let refreshing = false;
async function refreshAll() {
  if (refreshing || ROOT) return; refreshing = true;
  try {
    const list = [[ranges('today', 'day'), true], [ranges('month'), true]];
    const jobs = [list[0][0].cur, list[1][0].cur].map((r) => [r, true])
      .concat([ranges('today', 'day').cmp, ranges('today', 'month').cmp, ranges('month').cmp].map((r) => [r, false]));
    for (const [r, need] of jobs) {
      const m = await memGet(rkey(r));
      if (m && Date.now() - m.at < FRESH - 5 * 60e3) continue;
      await loadAll(r, need).catch(() => null);
    }
    const rm = await memGet('rating');
    if (!rm || Date.now() - rm.at > FRESH - 5 * 60e3) { const x = await loadRating().catch(() => null); if (x) memSet('rating', { data: x, at: Date.now() }); }
    await ensureTurnRank(true).catch(() => null);
    const am = await memGet('ads');
    if (!am || Date.now() - am.at > FRESH - 5 * 60e3) { const x = await loadAds().catch(() => null); if (x) memSet('ads', { data: x, at: Date.now() }); }
    const sm = await memGet('salary');
    if (!sm || Date.now() - sm.at > FRESH - 5 * 60e3) { const x = await loadSalary().catch(() => null); if (x) memSet('salary', { data: x, at: Date.now() }); }
  } finally { refreshing = false; }
}
async function tgText(m) {
  try {
    if (m.dhSalary) {
      let sal = SALARY; if (!sal) { const mm = await memGet('salary'); sal = mm && mm.data; } if (!sal) sal = SALARY = await loadSalary();
      const c = sal.cur, r = motivCalc(c.net, c.closed, c), p = sal.prev ? motivCalc(sal.prev.net, sal.prev.closed, sal.prev) : null;
      return { text: `💼 ЗП директора — текущий месяц\nЧистый инкас: ${fmt(c.net)} ₽ (общий ${fmt(c.gross)} − партнеры ${fmt(c.partners)})\nОборот: ${fmt(c.turnover)} ₽ · план ${fmt(c.planPct)}%\nЗакрыто наши: ${c.closed} · претензии ${fmt(c.claims)}%\nЗП: ${fmt(Math.round(r.zp))} ₽ ${r.guaranteed ? '(оклад)' : `(${r.pct}% ${r.k >= 0 ? '+' : '−'} ${Math.abs(r.k)}%)`}${p ? `\nПрошлый месяц: ${fmt(Math.round(p.zp))} ₽` : ''}` };
    }
    const rg = ranges(m.dhSummary === 'month' ? 'month' : 'today', 'day');
    let cur = await cachedAll(rg.cur); if (!cur || Date.now() - cur.at > FRESH) cur = await loadAll(rg.cur, true);
    const cv = cityVals(cur.t.period);
    if (!cv) return { err: 'нет данных отчёта' };
    const ms = mastersOf(cur.t.masters, cur.reqRows).slice(0, 5);
    return { text: `📊 ${m.dhSummary === 'month' ? 'Месяц' : 'Сегодня'} (${dd(rg.cur[0])}${m.dhSummary === 'month' ? ' – ' + dd(rg.cur[1]) : ''})\nОборот: ${money(cv['Оборот'])}\nЧистыми: ${money(cv['Чистыми'])}\nПринято: ${fmt(cv['Заявок принято'])} · закрыто: ${fmt(cv['Заявок закрыто'])} (наши ${fmt(cv['Закрыто наши'])})\nОтказов: ${fmt(cv['Отказов'])} · ср. чек ${money(cv['Чист. ср. чек'])}` +
      (ms.length ? '\n\n👷 Топ мастеров по ЗП:\n' + ms.map((x, i) => `${i + 1}. ${x.name.split(' ').slice(0, 2).join(' ')} — ${money(x.zp)}${x.refused != null ? ` · отказов ${x.refused}` : ''}`).join('\n') : '') };
  } catch (e) { return { err: e.message }; }
}
// оборот за сегодня: по городу и по мастерам (для общего чата мастеров)
async function dayTurn() {
  try {
    const rg = ranges('today', 'day');
    let cur = await cachedAll(rg.cur); if (!cur || Date.now() - cur.at > 10 * 60e3) cur = await loadAll(rg.cur, true);
    const cv = cityVals(cur.t.period) || {};
    const t = cur.t.masters;
    const list = [];
    if (t) {
      const iF = col(t, /^фио$/i), iO = col(t, /^оборот/i), iQ = col(t, /количество\s+заявок/i), iSD = col(t, /^сд$/i), iAll = col(t, /^общий\s+ср/i);
      t.rows.forEach((r) => {
        const name = r[iF] || ''; if (!name) return;
        const q = parseNum(r[iQ]) || 0, sd = iSD >= 0 ? parseNum(r[iSD]) || 0 : 0;
        // оборот мастера: колонка «Оборот», если есть; иначе общий ср. чек × заявки (без СД)
        const turn = iO >= 0 ? parseNum(r[iO]) : (iAll >= 0 && parseNum(r[iAll]) != null ? parseNum(r[iAll]) * Math.max(q - sd, 0) : null);
        if (turn) list.push({ name: name.replace(/\s*\(.*$/, '').trim(), turn: Math.round(turn) });
      });
    }
    list.sort((a, b) => b.turn - a.turn);
    return { total: cv['Оборот'] != null ? Math.round(cv['Оборот']) : null, masters: list };
  } catch (e) { return { err: e.message }; }
}
async function masterStat(a) {
  try {
    const rg = ranges('month');
    let cur = await cachedAll(rg.cur); if (!cur || Date.now() - cur.at > FRESH || !cur.reqRows) cur = await loadAll(rg.cur, true);
    const all = mastersOf(cur.t.masters, cur.reqRows);
    const key = mkey(String(a.name || '').replace(/\s*\(.*$/, ''));
    const me = all.find((x) => mkey(x.name) === key) || all.find((x) => mkey(x.name).split(' ')[0] === key.split(' ')[0]);
    const mon = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    if (!me) return { text: `📊 ${a.person || a.name}\n${mon}\n\nВ этом месяце заявок пока нет.` };
    const place = all.indexOf(me) + 1;
    return { text: `📊 ${a.person || me.name} — ${mon}\n\n` +
      `Заявок: ${fmt(me.q)}${me.sd ? ` · в СД: ${fmt(me.sd)}` : ''}\n` +
      `Чистый ср. чек: ${money(me.net)}\n` +
      `Общий ср. чек: ${money(me.all)}\n` +
      (me.refused != null ? `Отказов: ${me.refused} (${fmt(me.rPct)}%)${me.rPct > 20 ? ' 🔴' : ''}\n` : '') +
      `Зарплата: ${money(me.zp)}\n` +
      `Место среди мастеров: ${place} из ${all.length}` };
  } catch (e) { return { err: e.message }; }
}
window.__mncDash = { masterStat, dayTurn, tgText, refreshAll, open, close, toggle: (mode) => { mode = mode || 'an'; if (document.getElementById('mnc-dash') && MODE === mode) close(); else open(mode); } };
})();
