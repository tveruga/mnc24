// Значок на панели Firefox:
//  • на вкладке CRM — открыть/закрыть аналитику;
//  • на любой другой вкладке — боковая панель с мини-CRM.
browser.browserAction.onClicked.addListener((tab) => {
  if (tab && /mnc-lead-centre\.ru/.test(tab.url || '')) {
    browser.tabs.executeScript(tab.id, { code: 'window.__mncDash && window.__mncDash.toggle();' }).catch(() => {});
  } else {
    browser.sidebarAction.toggle();
  }
});

// CRM запрещает показывать себя внутри других страниц — разрешаем только для боковой панели DIR HELPER
const EXT = browser.runtime.getURL('');
browser.webRequest.onHeadersReceived.addListener((d) => {
  const from = d.frameAncestors && d.frameAncestors.length ? d.frameAncestors[d.frameAncestors.length - 1].url : (d.documentUrl || d.originUrl || '');
  if (!from || !from.startsWith(EXT)) return {};
  const headers = d.responseHeaders.filter((h) => {
    const n = h.name.toLowerCase();
    if (n === 'x-frame-options') return false;
    if (n === 'content-security-policy') h.value = h.value.replace(/frame-ancestors[^;]*;?/gi, '');
    return true;
  });
  return { responseHeaders: headers };
}, { urls: ['*://*.mnc-lead-centre.ru/*'], types: ['sub_frame'] }, ['blocking', 'responseHeaders']);

// Раз в час — тихое обновление отчётов в памяти через открытую вкладку CRM
browser.alarms.create('mnc-refresh', { delayInMinutes: 1, periodInMinutes: 60 });
browser.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'mnc-refresh') return;
  const tabs = await browser.tabs.query({ url: '*://*.mnc-lead-centre.ru/*' });
  const tab = tabs.find((t) => !t.discarded) || tabs[0];
  if (tab) browser.tabs.executeScript(tab.id, { code: 'window.__mncDash && window.__mncDash.refreshAll();' }).catch(() => {});
});

// ================= Новые заявки: индикатор на значке + звук =================
const LIST_URL = 'https://mnc-lead-centre.ru/admin/domain/customer-request/index';
const sound = new Audio(browser.runtime.getURL('new.mp3'));
let known = null;          // заявки «Ожидает», которые уже видели
let unseen = 0;            // сколько новых с последнего просмотра
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

let checking = null;
function checkNew() { if (!checking) checking = checkNewRaw().finally(() => { checking = null; }); return checking; }
async function checkNewRaw() {
  try {
    const r = await fetch(LIST_URL, { credentials: 'include', cache: 'no-store' });
    if (/\/login/.test(r.url)) { setBadge('!', '#9aa5b1', 'DIR HELPER: войдите в CRM'); try { ctlCrmState(false, 'вышли из CRM — войдите в CRM в Firefox'); } catch (e) {} return; }
    try { ctlCrmState(r.ok, 'CRM отвечает ошибкой ' + r.status); } catch (e) {}
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const table = [...doc.querySelectorAll('table')].find((t) => /статус/i.test((t.querySelector('thead') || {}).textContent || ''));
    if (!table) return;
    const heads = [...table.querySelectorAll('thead tr')].map((tr) => [...tr.cells].map((c) => norm(c.textContent)))
      .sort((a, b) => b.filter(Boolean).length - a.filter(Boolean).length)[0] || [];
    const iSt = heads.findIndex((h) => /^статус$/i.test(h));
    const iM = heads.findIndex((h) => /^мастер$/i.test(h));
    const iC = heads.findIndex((h) => /^закрыто/i.test(h));
    // «02.11.26 20:33» → время
    const when = (s) => { const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/); return m ? new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0; };
    // слежение за заявками в работе: ушла в «Готов» или пропала — проверить «Сумму к сдаче»
    const now0 = {};
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const id = (norm(tr.cells[0] && tr.cells[0].textContent).match(/\d{5,}/) || [])[0];
      if (!id) return;
      now0[id] = { st: iSt >= 0 && tr.cells[iSt] ? norm(tr.cells[iSt].textContent) : '', m: iM >= 0 && tr.cells[iM] ? norm(tr.cells[iM].textContent) : '', cl: iC >= 0 && tr.cells[iC] ? when(tr.cells[iC].textContent) : 0 };
    });
    try {
      const prevT = (await browser.storage.local.get('tgTrack')).tgTrack || {};
      const track = {};
      Object.entries(now0).forEach(([id, v]) => { if (/^в пути|^в работе/i.test(v.st)) track[id] = { m: v.m, t: Date.now() }; });
      const done = Object.keys(prevT).filter((id) => !track[id] && (!now0[id] || /готов|выполн|закрыт/i.test(now0[id].st)));
      if (!tgActive()) { if (done.length) await tgSumMark(done); } // бот работает на другом компьютере — сдачу шлёт он; здесь только запоминаем, ничего не копим
      else for (const id of done) {
        if (await tgSumDone(id)) continue;                         // по этой заявке сдача уже была
        const st = now0[id] ? now0[id].st : await reqStatus(id).catch(() => '');
        if (!/готов|выполн|закрыт/i.test(st)) continue;            // не проведена (отказ, вернули в «Ожидает», ушла далеко из списка) — не шлём
        const cl = now0[id] && now0[id].cl;
        if (cl && Date.now() - cl > 864e5) { await tgSumMark(id); continue; } // закрыта больше суток назад — старая, не шлём
        const ok = await tgCheckClosed(id, prevT[id].m);
        if (!ok && Date.now() - prevT[id].t < 30 * 60e3) track[id] = prevT[id]; // сумма ещё не появилась — проверим позже
      }
      await browser.storage.local.set({ tgTrack: track });
    } catch (e) {}
    const waiting = new Set();
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const id = (norm(tr.cells[0] && tr.cells[0].textContent).match(/\d{5,}/) || [])[0];
      const st = iSt >= 0 && tr.cells[iSt] ? norm(tr.cells[iSt].textContent) : '';
      if (id && /^ожидает/i.test(st)) waiting.add(id);
    });
    const wasKnown = known !== null || !!((await browser.storage.local.get('knownWaiting')).knownWaiting);
    const saved = known || new Set(((await browser.storage.local.get('knownWaiting')).knownWaiting) || []);
    const fresh = [...waiting].filter((id) => !saved.has(id));
    known = new Set([...waiting]);
    await browser.storage.local.set({ knownWaiting: [...known] });
    if (saved !== null && fresh.length && wasKnown) {
      unseen += fresh.length;
      try {
        await tgLoad();
        if (TG.opts.notifyNew && TG.owner && tgActive()) {
          const rows = await waitingRows();
          // уже отправленные — не повторяем (храним 3 дня)
          const st = (await browser.storage.local.get('tgNotified')).tgNotified || {};
          const now = Date.now();
          Object.keys(st).forEach((k) => { if (now - st[k] > 3 * 864e5) delete st[k]; });
          const toSend = fresh.filter((id) => !st[id]);
          toSend.forEach((id) => { st[id] = now; });
          await browser.storage.local.set({ tgNotified: st });
          toSend.forEach((id) => { const r = rows.find((x) => x.id === id); if (!r || !isToday(r.time)) return; tgOwner(`🆕 Новая заявка №${id}${r.time ? '\n🕒 ' + r.time : ''}${r.type ? ' · ' + r.type : ''}${r.addr ? '\n📍 ' + r.addr : ''}${r.client ? '\n👤 ' + r.client : ''}`, assignBtn(id)); });
        }
      } catch (e) {}
      try { sound.currentTime = 0; await sound.play(); } catch (e) {}
    }
    const n = waiting.size;
    if (unseen) setBadge(String(unseen), '#e5484d', `DIR HELPER: новых заявок — ${unseen}, ожидает — ${n}`);
    else setBadge(n ? String(n) : '', '#15803d', n ? `DIR HELPER: ожидает — ${n}` : 'DIR HELPER');
  } catch (e) { try { ctlCrmState(false, 'нет связи с CRM (интернет?)'); } catch (e2) {} }
}
function setBadge(text, color, title) {
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
  try { browser.browserAction.setBadgeTextColor({ color: '#fff' }); } catch (e) {}
  browser.browserAction.setTitle({ title });
}
// просмотрели — сбросить «новые» (нажатие на значок или открытый список заявок)
browser.browserAction.onClicked.addListener(() => { unseen = 0; checkNew(); });
browser.runtime.onMessage.addListener((m) => { if (m && m.seenList) { unseen = 0; checkNew(); } });
checkNew();
setInterval(checkNew, 45000);

browser.runtime.onMessage.addListener((m) => { if (m && m.openOptions) browser.runtime.openOptionsPage(); });

// ================= Проверка обновлений (кнопка ⟳) =================
// Firefox сам проверяет обновления раз в сутки; кнопка — проверить сейчас и сразу перезапустить дополнение с новой версией
browser.runtime.onUpdateAvailable.addListener((d) => {
  browser.storage.local.set({ dhUpdating: { v: d && d.version, at: Date.now() } }).finally(() => browser.runtime.reload());
});
async function dhUpdateCheck() {
  try {
    const [status, det] = await browser.runtime.requestUpdateCheck();
    const cur = browser.runtime.getManifest().version;
    if (status === 'update_available') return { status, cur, next: det && det.version, text: `Найдена ${det && det.version ? 'версия ' + det.version : 'новая версия'} — обновляю…` };
    if (status === 'throttled') return { status, cur, text: 'Проверка недавно уже была — попробуйте через минуту' };
    return { status, cur, text: `Установлена последняя версия ${cur}` };
  } catch (e) { return { status: 'error', text: 'Не удалось проверить: ' + e.message }; }
}
browser.runtime.onMessage.addListener((m) => { if (m && m.dhUpdate) return dhUpdateCheck(); });
