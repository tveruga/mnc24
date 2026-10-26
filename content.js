// МНЧ — Отдать мастеру, v1.2
(async function () {
  if (window.__mncExt) return;
  if (window !== window.top) {
    // скрытые окна внутри самой CRM — не трогаем; в боковой панели (родитель — расширение) — работаем
    let parentIsCrm = false;
    try { parentIsCrm = window.parent.location.hostname === location.hostname; } catch (e) { parentIsCrm = false; }
    if (parentIsCrm) return;
  }
  window.__mncExt = true;
  // активация: без токена вашего бота дополнение не работает
  let act = false;
  try { const r = await browser.storage.local.get('dhAct'); act = !!(r.dhAct && r.dhAct.ok); if (!act) act = !!(await browser.runtime.sendMessage({ dhCheckAct: true })); } catch (e) {}
  if (!act) {
    if (window === window.top && document.body) {
      const b = document.createElement('div');
      b.textContent = 'DIR HELPER не активирован — вставьте код в настройках дополнения';
      b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;background:#0f3d2b;color:#fff;font:600 13px Segoe UI,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;opacity:.92';
      b.onclick = () => { try { browser.runtime.sendMessage({ openOptions: true }); } catch (e) {} };
      document.body.appendChild(b);
    }
    return;
  }

  const EMP = '[name="CustomerRequest[employee_id]"]';
  const ST = '[name="CustomerRequest[status]"]';
  const UPD = '/admin/domain/customer-request/update?id=';
  const CHAT_NAMES = {
    'Сергин': 'МНЧ Серегин Константин',
    'Трохов': 'МНЧ Тархов Андрей Александрович',
    'Булгаков': 'МНЧ Булгаков Арсений Алексеевич'
  };
  const DEFAULT_MASTERS = [
    ['18690','Антюфеев Вадим'],['17909','Бакстов Николай'],['16779','Балашов Илья'],['19346','Бем Николай'],
    ['18618','Булгаков Аресений'],['17701','Ганжин Тимофей'],['18147','Гринаш Владислав'],['19557','Крыцын Роман'],
    ['10765','Кудашов Константин'],['19558','Кутузов Сергей'],['17673','Макаров Алексей'],['11288','Малофеев Максим'],
    ['17850','Метляев Прохор'],['18104','Никоноров Константин'],['17687','Сергин Константин'],['17522','Ткаченко Иван'],
    ['17020','Трохов Андрей'],['18286','Шмаков Иван']
  ].map(([id, name]) => ({ id, name }));

  const isUpdate = /customer-request\/update/.test(location.pathname);
  const isList = /customer-request(\/index|\/?$)/.test(location.pathname);

  const clean = (n) => n.replace(/\s*\(.*$/, '').trim();
  const chatName = (name) => { name = clean(name); const s = name.split(/\s+/)[0]; return CHAT_NAMES[s] || ('МНЧ ' + name); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      const jq = window.wrappedJSObject && window.wrappedJSObject.jQuery;
      if (jq) jq(el.wrappedJSObject || el).trigger('change');
    } catch (e) {}
  }

  async function getTgMap() {
    const map = {};
    try {
      const { tgLinks = '' } = await browser.storage.local.get('tgLinks');
      tgLinks.split('\n').forEach((line) => {
        const [k, v] = line.split('=').map((x) => (x || '').trim());
        if (k && v) map[k.toLowerCase()] = v.replace(/^@|^https?:\/\/t\.me\//, '');
      });
    } catch (e) {}
    return map;
  }
  async function openTg(name) {
    const tg = (await getTgMap())[name.split(/\s+/)[0].toLowerCase()];
    if (!tg) return;
    const a = document.createElement('a');
    a.href = 'tg://resolve?domain=' + encodeURIComponent(tg);
    document.body.appendChild(a); a.click(); a.remove();
  }

  // confirm/вопросы CRM → «Нет»; копирование кнопкой CRM разрешено без клика
  const crmMsgs = [];
  function prepPage() {
    try {
      const w = window.wrappedJSObject;
      w.confirm = exportFunction((m) => { crmMsgs.push(String(m || '')); return false; }, window);
      const privCopy = (t) => new Promise((res) => {
        navigator.clipboard.writeText(String(t)).then(() => res(true), () => {
          const ta = document.createElement('textarea'); ta.value = String(t); ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta); ta.select(); res(document.execCommand('copy')); ta.remove();
        });
      });
      if (w.navigator.clipboard) {
        w.navigator.clipboard.writeText = exportFunction((t) => new w.Promise(exportFunction((ok) => { privCopy(t).then(() => ok()); }, window)), window);
      }
      w.document.execCommand = exportFunction(function (cmd) {
        if (String(cmd).toLowerCase() === 'copy') return document.execCommand('copy');
        return Document.prototype.execCommand.apply(document, arguments);
      }, window);
    } catch (err) {}
  }
  // всплывающие окна CRM (bootstrap/sweetalert и т.п.) — жмём «Нет»
  function autoNo(ms) {
    const t = setInterval(() => {
      document.querySelectorAll('.modal.show, .modal.in, .swal2-popup, .bootbox, .jconfirm, [role=dialog]').forEach((m) => {
        if (!m.offsetParent && getComputedStyle(m).position !== 'fixed') return;
        const no = [...m.querySelectorAll('button, a.btn')].find((b) => /^(нет|no|отмена|cancel)$/i.test(b.textContent.trim()));
        if (no) { crmMsgs.push(m.textContent.replace(/\s+/g, ' ')); no.click(); }
      });
    }, 150);
    const stop = () => clearInterval(t);
    setTimeout(stop, ms);
    return stop;
  }
  function closeBanner(ids) {
    const id = [].concat(ids).join(', №');
    const o = document.createElement('div');
    o.id = 'mnc-ext-banner';
    o.innerHTML = `<div class="mnc-bn"><div class="mnc-bn-ic">!</div><div class="mnc-bn-t">Закройте заказ №${id}</div><button class="mnc-bn-ok">Понятно</button></div>`;
    document.body.appendChild(o);
    const close = () => o.remove();
    o.querySelector('.mnc-bn-ok').onclick = close;
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  }

  // Заявка того же мастера с тем же статусом в списке (кроме только что отданной)
  function findBlocking(surname, stName, selfId) {
    const table = [...document.querySelectorAll('table')].find((t) => /мастер/i.test(t.textContent) && t.querySelector('tbody tr'));
    if (!table) return [];
    const head = [...table.querySelectorAll('thead tr')].map((r) => [...r.cells].map((c) => c.textContent.trim().toLowerCase()))
      .sort((a, b) => b.filter(Boolean).length - a.filter(Boolean).length)[0] || [];
    const iSt = head.indexOf('статус'), iM = head.indexOf('мастер');
    if (iSt < 0 || iM < 0) return [];
    const sn = (surname || '').toLowerCase(), st = (stName || '').toLowerCase();
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
      const id = (tr.textContent.match(/\d{6,}/) || [''])[0];
      const cells = [...tr.cells].filter((c) => !c.classList.contains('mnc-col'));
      const m = (cells[iM] ? cells[iM].textContent : '').trim().toLowerCase();
      const s = (cells[iSt] ? cells[iSt].textContent : '').trim().toLowerCase();
      return (id && id !== selfId && m.startsWith(sn) && s === st) ? id : '';
    }).filter(Boolean);
  }

  // ---------- Панель ----------
  function makePanel(withId) {
    const p = document.createElement('div');
    p.id = 'mnc-ext-panel';
    p.className = 'mnc-min'; // при заходе на страницу — свёрнуто
    p.innerHTML = `
      <div class="mnc-h"><span class="mnc-title"><span class="dh-a">DIR</span><span class="dh-b">HELPER</span></span><span class="mnc-an" title="Аналитика по отчётам"><svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="9" width="3" height="5" rx=".5" fill="#a7dfbe"/><rect x="6.5" y="5" width="3" height="9" rx=".5" fill="#5cc58a"/><rect x="11" y="2" width="3" height="12" rx=".5" fill="#fff"/></svg></span><span class="mnc-zp" title="Зарплата директора">₽</span><span class="mnc-ad" title="Аналитика рекламы"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="#a7dfbe"/><path d="M9.5 1.5V5H13" fill="#5cc58a"/><path d="M6 8h5M6 10.2h5M6 12.4h3" stroke="#0f3d2b" stroke-width="1" stroke-linecap="round"/></svg></span><span class="mnc-top" title="Рейтинг городов">TOP</span><span class="mnc-set" title="Настройки и Telegram">⚙</span><span class="mnc-upd" title="Проверить обновление">⟳</span><span class="mnc-x" title="Развернуть / свернуть"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
      <div class="mnc-wrap"><div class="mnc-body">
        ${withId ? '<input class="mnc-id" type="text" inputmode="numeric" placeholder="№ заявки (галочка в списке)">' : ''}
        <input class="mnc-f" type="text" placeholder="Фамилия мастера…" autocomplete="off">
        <select class="mnc-s" size="6"></select>
        <label class="mnc-lbl">Статус</label><select class="mnc-st"></select>
        <button class="mnc-b" disabled>Отдать мастеру ⏎</button>
        <div class="mnc-m"></div>
      </div></div>`;
    document.body.appendChild(p);
    // версия рядом с названием
    try { const v = document.createElement('span'); v.className = 'dh-ver'; v.textContent = browser.runtime.getManifest().version; p.querySelector('.mnc-title').appendChild(v); } catch (e) {}
    // в окне расширения (боковая панель) — без нижнего меню: выдвигается сверху кнопкой в шапке окна
    p.classList.add('dh-side'); if (window === window.top) p.classList.add('dh-tab');
    const toggle = () => p.classList.toggle('mnc-min');
    p.querySelector('.mnc-x').onclick = (e) => { e.stopPropagation(); toggle(); };
    p.querySelector('.mnc-title').onclick = toggle;
    p.querySelector('.mnc-an').onclick = (e) => { e.stopPropagation(); window.__mncDash && window.__mncDash.toggle('an'); };
    p.querySelector('.mnc-upd').onclick = async (e) => {
      e.stopPropagation(); const u = e.currentTarget; u.classList.add('spin');
      const r = await browser.runtime.sendMessage({ dhUpdate: true }).catch((er) => ({ text: er.message }));
      u.classList.remove('spin'); u.title = (r && r.text) || 'Проверить обновление';
      const t = document.createElement('div'); t.className = 'dh-toast'; t.textContent = (r && r.text) || 'Ошибка проверки'; document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
    };
    p.querySelector('.mnc-set').onclick = (e) => { e.stopPropagation(); browser.runtime.sendMessage({ openOptions: true }).catch(() => {}); };
    p.querySelector('.mnc-top').onclick = (e) => { e.stopPropagation(); window.__mncDash && window.__mncDash.toggle('rt'); };
    p.querySelector('.mnc-ad').onclick = (e) => { e.stopPropagation(); window.__mncDash && window.__mncDash.toggle('ad'); };
    p.querySelector('.mnc-zp').onclick = (e) => { e.stopPropagation(); window.__mncDash && window.__mncDash.toggle('zp'); };
    return p;
  }

  // подписи из групп Telegram: «Фамилия Имя» CRM → «Имя из группы»
  let TG_PEOPLE = {};
  browser.storage.local.get('tg').then((r) => { const g = (r.tg && r.tg.groups) || {}; Object.values(g).forEach((x) => { if (x.empId) TG_PEOPLE[String(x.empId)] = x; }); }).catch(() => {});
  function wire(p, masters, go) {
    const f = p.querySelector('.mnc-f'), sel = p.querySelector('.mnc-s'), btn = p.querySelector('.mnc-b');
    const render = () => {
      const q = f.value.trim().toLowerCase();
      sel.innerHTML = '';
      masters.map((m) => { const t = TG_PEOPLE[String(m.id)]; return { id: m.id, name: t && t.how === 'free' ? `${t.person} · через ${clean(m.name)}` : (t ? `${clean(m.name)} ✈` : m.name) }; })
        .filter((m) => !q || m.name.toLowerCase().includes(q)).forEach((m) => sel.add(new Option(m.name, m.id)));
      if (sel.options.length) sel.selectedIndex = 0;
      btn.disabled = !sel.options.length;
    };
    render();
    f.addEventListener('input', render);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    sel.addEventListener('dblclick', go);
    btn.addEventListener('click', (e) => { e.preventDefault(); go(); });
    return { f, sel, btn, show: (t, c) => { const m = p.querySelector('.mnc-m'); m.textContent = t; m.className = 'mnc-m ' + (c || ''); } };
  }

  const DEFAULT_STATUSES = [{ id: '4', name: 'В пути' }];
  function fillStatuses(p, list) {
    const st = p.querySelector('.mnc-st');
    st.innerHTML = '';
    const HIDE = /^(отмена|готов( оф)?$|не оформлена$|на уточнении$|не создана$)/i;
    list.filter((o) => !HIDE.test(o.name.trim())).forEach((o) => st.add(new Option(o.name, o.id)));
    const def = list.find((o) => /в пути/i.test(o.name)) || list[0];
    if (def) st.value = def.id;
    return st;
  }
  function statusesFrom(select) {
    return [...select.options].filter((o) => o.value !== '' && o.text.trim()).map((o) => ({ id: o.value, name: o.text.trim() }));
  }
  async function loadStatuses() {
    // фильтр «Статус» в шапке списка
    const sel = [...document.querySelectorAll('thead select, select')].find((x) => [...x.options].some((o) => /в пути/i.test(o.text)) && !x.closest('#mnc-ext-panel'));
    if (sel) { const l = statusesFrom(sel); if (l.length) return l; }
    try { const { statuses } = await browser.storage.local.get('statuses'); if (statuses && statuses.length) return statuses; } catch (e) {}
    return DEFAULT_STATUSES;
  }
  async function loadMasters() {
    try { const { masters } = await browser.storage.local.get('masters'); if (masters && masters.length) return masters; } catch (e) {}
    return DEFAULT_MASTERS;
  }

  // ---------- Список заявок ----------
  async function initList() {
    const p = makePanel(true);
    const idIn = p.querySelector('.mnc-id');
    const stSel = fillStatuses(p, await loadStatuses());
    const ui = wire(p, await loadMasters(), go);
    ui.show('Отметьте галочкой заявку, затем выберите мастера');
    closeSection(p, true);
    try {
      const c = await browser.storage.local.get(['closeIds','closeAsked','closeSelf','closeMaster','closeSt','closeT']);
      if (c.closeT && Date.now() - c.closeT < 60000) {
        await browser.storage.local.remove('closeT');
        let ids = c.closeIds || [];
        if (!ids.length && c.closeAsked) ids = findBlocking(c.closeMaster, c.closeSt, c.closeSelf);
        if (ids.length) closeBanner(ids);
      }
    } catch (e) {}
    try {
      const { lastName, lastSt, lastT } = await browser.storage.local.get(['lastName','lastSt','lastT']);
      if (lastName && Date.now() - lastT < 30000) {
        await browser.storage.local.remove('lastT');
        p.classList.remove('mnc-min');
        ui.show(`Готово: ${lastName} → ${lastSt || 'В пути'}, скопировано. Чат: «${chatName(lastName)}»`, 'ok');
      }
    } catch (e) {}

    // Отдельная колонка с галочками слева от таблицы
    const addBoxes = () => {
      document.querySelectorAll('table').forEach((table) => {
        const rows = [...table.querySelectorAll('tbody tr')].filter((tr) => tr.cells[0] && /\d{5,}/.test(tr.cells[0].textContent));
        if (!rows.length) return;
        table.querySelectorAll('thead tr').forEach((tr) => {
          if (tr.querySelector('.mnc-col')) return;
          const th = document.createElement('th'); th.className = 'mnc-col'; tr.prepend(th);
        });
        table.querySelectorAll('tbody tr').forEach((tr) => {
          if (tr.querySelector('.mnc-col')) return;
          const td = document.createElement('td'); td.className = 'mnc-col';
          const m = tr.cells[0] && tr.cells[0].textContent.match(/\d{5,}/);
          tr.prepend(td);
          if (!m) return;
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.className = 'mnc-cb'; cb.dataset.id = m[0]; cb.title = 'Выбрать заявку ' + m[0];
          td.addEventListener('mousedown', (e) => e.stopPropagation());
          td.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target !== cb) cb.checked = !cb.checked;
            document.querySelectorAll('.mnc-cb').forEach((o) => { if (o !== cb) { o.checked = false; o.closest('tr').classList.remove('mnc-row'); } });
            tr.classList.toggle('mnc-row', cb.checked);
            idIn.value = cb.checked ? cb.dataset.id : '';
            if (cb.checked) { p.classList.remove('mnc-min'); ui.show('Заявка ' + cb.dataset.id + ' — выберите мастера'); ui.f.focus(); }
            else ui.show('Отметьте галочкой заявку');
          });
          td.appendChild(cb);
        });
      });
    };
    addBoxes();
    let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(addBoxes, 100); }).observe(document.body, { childList: true, subtree: true });

    async function go() {
      const id = idIn.value.trim();
      if (!/^\d+$/.test(id)) return ui.show('Укажите № заявки', 'err');
      if (!ui.sel.value) return;
      const master = { id: ui.sel.value, name: ui.sel.options[ui.sel.selectedIndex].text };
      ui.btn.disabled = true;
      const stName = stSel.options[stSel.selectedIndex] ? stSel.options[stSel.selectedIndex].text.trim() : 'В пути';
      const name = clean(master.name);
      ui.show(`Заявка ${id} → ${name}, ${stName}…`);
      try {
        const r = await bgAssign(id, master.id, stName, (m, c) => ui.show(m, c));
        browser.runtime.sendMessage({ tg: 'assigned', id, name, empId: master.id, st: stName, info: r.info }).catch(() => {});
        openTg(name);
        await browser.storage.local.set({ lastName: name, lastSt: stName, lastT: Date.now(), closeIds: r.blocking, closeAsked: r.asked, closeSelf: id, closeMaster: name.split(/\s+/)[0], closeSt: stName, closeT: Date.now() });
        ui.show(`Готово: ${name} → ${stName}${r.copied ? ', текст скопирован' : ''}. Чат: «${chatName(name)}»`, 'ok');
        setTimeout(() => location.reload(), 1200);
      } catch (e) { ui.btn.disabled = false; ui.show('Ошибка: ' + e.message, 'err'); }
    }
  }

  // ---------- Страница заявки ----------
  async function initUpdate(empSelect) {
    const masters = [...empSelect.options].filter((o) => o.value && o.text.trim()).map((o) => ({ id: o.value, name: o.text.trim() }));
    if (masters.length) browser.storage.local.set({ masters }).catch(() => {});
    const stEl = document.querySelector(ST);
    const statuses = stEl ? statusesFrom(stEl) : DEFAULT_STATUSES;
    if (stEl && statuses.length) browser.storage.local.set({ statuses }).catch(() => {});
    const p = makePanel(false);
    const stSel = fillStatuses(p, statuses);
    const ui = wire(p, masters.length ? masters : DEFAULT_MASTERS, async () => {
      if (!ui.sel.value) return;
      const m = masters.find((x) => x.id === ui.sel.value) || DEFAULT_MASTERS.find((x) => x.id === ui.sel.value);
      const name = clean(m ? m.name : ui.sel.value);
      const stName = stSel.options[stSel.selectedIndex] ? stSel.options[stSel.selectedIndex].text.trim() : 'В пути';
      ui.btn.disabled = true; ui.show(`${name} → ${stName}…`);
      try {
        const r = await bgAssign(reqId(), ui.sel.value, stName, (t, c) => ui.show(t, c));
        browser.runtime.sendMessage({ tg: 'assigned', id: reqId(), name, empId: ui.sel.value, st: stName, info: r.info }).catch(() => {});
        openTg(name);
        await browser.storage.local.set({ lastName: name, lastSt: stName, lastT: Date.now(), closeIds: r.blocking, closeAsked: r.asked, closeSelf: reqId(), closeMaster: name.split(/\s+/)[0], closeSt: stName, closeT: Date.now() });
        ui.show(`Готово: ${name} → ${stName}${r.copied ? ', текст скопирован' : ''}`, 'ok');
        setTimeout(() => { location.href = '/admin/domain/customer-request/index'; }, 1200);
      } catch (e) { ui.btn.disabled = false; ui.show('Ошибка: ' + e.message, 'err'); }
    });
    ui.show('Мастеров в списке: ' + masters.length);
    closeSection(p, false);

    async function assign(empId, auto, stId) {
      stId = String(stId || '4');
      const master = masters.find((m) => m.id === String(empId)) || DEFAULT_MASTERS.find((m) => m.id === String(empId));
      const e = document.querySelector(EMP), s = document.querySelector(ST), copyBtn = document.getElementById('copyReqInfo');
      if (!e) return ui.show('Нет поля мастера', 'err');
      if (!s) return ui.show('Нет поля статуса', 'err');
      if (!copyBtn) return ui.show('Нет кнопки «Копировать информацию»', 'err');
      ui.btn.disabled = true;
      prepPage();
      const stopNo = autoNo(6000);
      e.value = String(empId); fire(e);
      s.value = stId; fire(s);
      await sleep(300);
      if (e.value !== String(empId) || s.value !== stId) {
        ui.btn.disabled = false;
        return ui.show(`Не встало: мастер=${e.value || '—'}, статус=${s.value || '—'}`, 'err');
      }
      const name = clean(master ? master.name : String(empId));
      const stName = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text.trim() : stId;
      ui.show(`${name} → ${stName}. Нажимаю «Копировать информацию»…`, 'ok');
      await browser.storage.local.set({ lastName: name, lastSt: stName, lastT: Date.now() });
      openTg(name);

      // ждём, пока CRM покажет и мы закроем «Нет» окна смены статуса
      await sleep(900);
      stopNo();
      const reqId = new URLSearchParams(location.search).get('id') || '';
      const fromMsgs = [...new Set(crmMsgs.join(' ').match(/\d{6,}/g) || [])].filter((x) => x !== reqId);
      await browser.storage.local.set({ closeIds: fromMsgs, closeAsked: crmMsgs.length > 0, closeSelf: reqId,
        closeMaster: name.split(/\s+/)[0], closeSt: stName, closeT: Date.now() });

      // «Копировать информацию»: на «Закрыть страницу?» — ДА, CRM сама сохраняет и закрывает
      try { window.wrappedJSObject.confirm = exportFunction(() => true, window); } catch (err) {}
      copyBtn.click();
      ui.show(`${name} → ${stName}. Скопировано, CRM закрывает заявку…`, 'ok');
      await sleep(4000);
      if (document.getElementById('copyReqInfo')) {
        ui.btn.disabled = false;
        ui.show(`Мастер и статус стоят, но CRM не закрыла заявку после «Копировать информацию».`, 'err');
      }
    }

    // Пришли со списка — делаем автоматически
    try {
      const { pending } = await browser.storage.local.get('pending');
      const id = new URLSearchParams(location.search).get('id');
      if (pending && pending.id === id && Date.now() - pending.t < 60000) {
        await browser.storage.local.remove('pending');
        await sleep(300);
        let st = pending.st;
        const stEl2 = document.querySelector(ST);
        if (stEl2 && pending.stName) {
          const o = [...stEl2.options].find((x) => x.text.trim() === pending.stName);
          if (o) st = o.value;
        }
        assign(pending.emp, true, st);
      }
    } catch (e) {}
  }


  // ---------- Быстрое закрытие заявки ----------
  const reqId = () => new URLSearchParams(location.search).get('id') || '';
  function ctrlByLabel(re) {
    const lab = [...document.querySelectorAll('label, .control-label')].find((l) => re.test(l.textContent.replace(/\s+/g, ' ').trim()));
    if (!lab) return null;
    if (lab.htmlFor) { const el = document.getElementById(lab.htmlFor); if (el) return el; }
    const g = lab.closest('.form-group, .field, td, div');
    return g ? g.querySelector('select, input:not([type=hidden]):not([type=file]), textarea') : null;
  }
  function setSel(el, re) {
    if (!el || el.tagName !== 'SELECT') return false;
    const o = [...el.options].find((x) => re.test(x.text.trim()));
    if (!o) return false;
    el.value = o.value; fire(el); return true;
  }
  function setVal(el, v) { if (!el) return false; el.value = v; fire(el); return true; }
  const btnByText = (re) => [...document.querySelectorAll('button, a.btn, input[type=submit], input[type=button]')].find((b) => re.test((b.textContent || b.value || '').replace(/\s+/g, ' ').trim()) && !b.closest('#mnc-ext-panel'));
  // загрузка файлов в окно CRM по его заголовку («Договор/Чеки на услуги», «Фото отзыв» …)
  // переключить вкладку заявки («Документы» = #photo, «Информация» = #main) — быстро
  async function openTab(name, hash, ready) {
    if (ready()) return true;
    const link = document.querySelector(`a[href$="#${hash}"], [data-target="#${hash}"], [data-bs-target="#${hash}"]`) ||
      [...document.querySelectorAll('.nav a, .nav-tabs a, ul a')].find((x) => norm(x.textContent) === name);
    if (link) link.click(); else location.hash = hash;
    for (let i = 0; i < 40; i++) { await sleep(100); if (ready()) return true; }
    return ready();
  }
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  function findHead(titleRe) {
    const list = document.querySelectorAll('label, legend, h3, h4, h5, h6, b, strong, .control-label, .panel-title, .card-title');
    for (const el of list) if (titleRe.test(norm(el.textContent))) return el;
    return null;
  }
  const docsReady = () => [...document.querySelectorAll('input[type=file]')].some((i) => visible(i.closest('.file-input') || i));
  // загрузка: выбрать файлы → дождаться «Загрузить» → нажать → дождаться «Готово»
  async function uploadTo(titleRe, label, files, say) {
    if (!files || !files.length) return;
    say(`Фото: ${label} — открываю «Документы»…`);
    await openTab('Документы', 'photo', docsReady);
    const head = findHead(titleRe);
    if (!head) throw new Error(`не найдено окно «${label}»`);
    const inp = [...document.querySelectorAll('input[type=file]')].find((i) => head.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!inp) throw new Error(`нет поля выбора файла в «${label}»`);
    const box = inp.closest('.file-input') || inp.closest('.form-group') || inp.parentElement.parentElement;
    say(`Фото: ${label} — выбираю ${files.length} шт.…`);
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    inp.files = dt.files;
    fire(inp);
    // ждём кнопку «Загрузить»
    let up = null;
    for (let i = 0; i < 40 && !up; i++) {
      await sleep(150);
      up = [...box.querySelectorAll('button, a.btn')].find((x) => /загрузить/i.test(norm(x.textContent) + ' ' + (x.title || '')) && visible(x)) ||
           [...box.querySelectorAll('.fileinput-upload, .fileinput-upload-button')].find(visible) || null;
    }
    if (!up) throw new Error(`в «${label}» не появилась кнопка «Загрузить» — файл не принят`);
    say(`Фото: ${label} — загружаю…`);
    up.click();
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      const err = [...box.querySelectorAll('.kv-fileinput-error, .file-error-message')].find((e) => visible(e) && norm(e.textContent));
      if (err) throw new Error(`${label}: ${norm(err.textContent)}`);
      const txt = norm(box.textContent);
      const busy = box.querySelector('.file-upload-indicator .fa-hourglass, .file-uploading, .kv-file-loading');
      if (!busy && (/готово/i.test(txt) || box.querySelector('.file-preview-success, .file-upload-indicator .text-success, .progress-bar-success'))) { say(`Фото: ${label} — готово ✓`, 'ok'); return true; }
    }
    throw new Error(`${label}: загрузка не завершилась за 30 секунд`);
  }
  const uploadPhoto = (file, say) => uploadTo(/^договор\s*\/\s*чеки на услуги$/i, 'Договор/Чеки на услуги', [file], say);
  function sumBanner(text, copied, onDone) {
    const o = document.createElement('div');
    o.id = 'mnc-ext-banner';
    o.innerHTML = `<div class="mnc-bn"><div class="mnc-bn-ic">₽</div><div class="mnc-bn-s"></div><div class="mnc-bn-note">${copied ? 'Скопировано в буфер — вставьте мастеру (Ctrl+V)' : 'Нажмите «Скопировать»'}</div><div class="mnc-bn-btns"><button class="mnc-bn-cp">Скопировать</button><button class="mnc-bn-ok">Готово</button></div></div>`;
    o.querySelector('.mnc-bn-s').textContent = text;
    document.body.appendChild(o);
    const close = () => { o.remove(); if (onDone) onDone(); };
    o.querySelector('.mnc-bn-ok').onclick = close;
    o.querySelector('.mnc-bn-cp').onclick = async () => { await copyText(text); o.querySelector('.mnc-bn-note').textContent = 'Скопировано ✓'; };
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); const r = document.execCommand('copy'); ta.remove(); return r; } catch (e) { return false; }
  }
  const postBtn = () => { const b = btnByText(/^провести заявку$/i); return b && !b.disabled && !b.classList.contains('disabled') && visible(b) ? b : null; };
  const sumText = () => { const t = String(document.body.textContent || '').replace(/[\s\u00a0]+/g, ' '); const a = t.match(/Проведенная сумма по заявке:\s*(-?\d[\d ]*)/i); const b = t.match(/Сумма к сдаче:\s*(-?\d[\d ]*)/i); return b ? (a ? `Проведенная сумма по заявке: ${a[1].trim()} р.\n` : '') + `Сумма к сдаче: ${b[1].trim()} р.` : ''; };
  async function stepPost(say) {
    let b = null;
    for (let i = 0; i < 40 && !(b = postBtn()); i++) await sleep(250);
    if (!b) { say('нет активной кнопки «Провести заявку» — проверьте, сохранилась ли заявка', 'err'); await browser.storage.local.remove('closeJob'); return false; }
    await browser.storage.local.set({ closeJob: { id: reqId(), step: 'copy', t: Date.now() } });
    try { window.wrappedJSObject.confirm = exportFunction(() => true, window); } catch (e) {}
    say('Провожу заявку…', 'ok');
    b.click();
    // сумма может появиться без перезагрузки
    for (let i = 0; i < 40; i++) { await sleep(250); if (sumText()) return stepCopy(say); }
    return true;
  }
  async function stepCopy(say) {
    let out = '';
    for (let i = 0; i < 20 && !(out = sumText()); i++) await sleep(250);
    await browser.storage.local.remove('closeJob');
    const badge = document.getElementById('mnc-ext-badge'); if (badge) badge.remove();
    if (!out) { say('заявка проведена, но «Сумма к сдаче» не найдена', 'err'); return false; }
    const ok = await copyText(out);
    sumBanner(out, ok);
    say('Готово: сумма к сдаче скопирована ✓', 'ok');
    return true;
  }
  // шаги после перезагрузок: «провести» → «скопировать»
  async function continueClosing() {
    let job; try { job = (await browser.storage.local.get('closeJob')).closeJob; } catch (e) {}
    if (!job || job.id !== reqId() || Date.now() - job.t > 5 * 60e3) return;
    await sleep(700);
    const toast = (m, err) => { let t = document.getElementById('mnc-ext-badge'); if (!t) { t = document.createElement('div'); t.id = 'mnc-ext-badge'; document.body.appendChild(t); } t.textContent = 'DIR HELPER: ' + m; t.style.background = err ? '#dc2626' : '#166534'; };
    if (job.step === 'fill') {
      for (let i = 0; i < 20 && !ctrlByLabel(/^оплачено клиентом/i); i++) await sleep(300);
      try { await doFill(job.o, (m, c) => toast(m, c === 'err')); }
      catch (e) { toast('ошибка проведения: ' + e.message, true); await browser.storage.local.remove('closeJob'); }
      return;
    }
    const tsay = (m, c) => toast(m, c === 'err');
    if (job.step === 'post') return stepPost(tsay);
    if (job.step === 'copy') return stepCopy(tsay);
  }
  // заполнить и сохранить заявку (на странице заявки)
  const toFiles = async (list) => Promise.all((list || []).map(async (x, i) => x instanceof File ? x : new File([await (await fetch(x.data)).blob()], x.name || ('photo' + i + '.jpg'), { type: x.type || 'image/jpeg' })));
  async function doFill(o, say) {
    const rx = (t) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const infoReady = () => visible(ctrlByLabel(/^оплачено клиентом/i));
    // 1) «Информация» — заполнить поля
    await openTab('Информация', 'main', infoReady);
    const fill = async (withStatus) => {
      const fails = [];
      if (!setVal(ctrlByLabel(/^оплачено клиентом/i), o.sum)) fails.push('Оплачено клиентом');
      if (withStatus) {
        prepPage();
        const stopNo = autoNo(5000);
        if (!setSel(document.querySelector(ST), /^в работе$/i)) fails.push('Статус');
        await sleep(900); stopNo();
      }
      if (!setSel(ctrlByLabel(/^отзыв написан/i), rx(o.rev))) fails.push('Отзыв написан');
      if (!setSel(ctrlByLabel(/^наличие бсо/i), rx(o.bsoHas))) fails.push('Наличие БСО');
      if (!setSel(ctrlByLabel(/^комплектующие$/i), rx(o.parts))) fails.push('Комплектующие');
      if (o.parts === 'Есть' && o.pcost && !setVal(ctrlByLabel(/^стоим\.?\s*комплект/i), o.pcost)) fails.push('Стоим.комплектующ.');
      return fails;
    };
    say('Заполняю «Информацию»…');
    let fails = await fill(true);
    if (fails.length) throw new Error('не нашёл поля: ' + fails.join(', '));
    // 2) «Документы» — фото
    const bso = await toFiles(o.bso_ph), rev = await toFiles(o.rev_ph), chk = await toFiles(o.chk_ph);
    if (bso.length) await uploadTo(/^договор\s*\/\s*чеки на услуги$/i, 'Договор/Чеки на услуги', bso, say);
    if (o.parts === 'Есть' && chk.length) {
      await uploadTo(/^чеки на комплектующие\s*\/\s*расходы$/i, 'Чеки на комплектующие/расходы', chk, say);
      await uploadTo(/^фото запчастей\s*\/\s*комплектующих$/i, 'Фото запчастей/комплектующих', chk, say);
    }
    if (o.rev === 'Да' && rev.length) await uploadTo(/^фото отзыв/i, 'Фото отзыв', rev, say);
    // 3) назад в «Информацию», проверить поля и сохранить
    if (bso.length || rev.length || chk.length) { await openTab('Информация', 'main', infoReady); fails = await fill(false); if (fails.length) throw new Error('не нашёл поля: ' + fails.join(', ')); }
    const save = btnByText(/^сохранить$/i);
    if (!save) throw new Error('нет кнопки «Сохранить»');
    await browser.storage.local.set({ closeJob: { id: reqId(), step: 'post', t: Date.now() } });
    try { window.wrappedJSObject.confirm = exportFunction(() => true, window); } catch (e) {}
    say('Сохраняю…', 'ok');
    save.click();
    // если CRM сохранила без перезагрузки — сразу к «Провести заявку»
    for (let i = 0; i < 24; i++) { await sleep(250); if (postBtn()) return stepPost(say); }
  }
  const toDataUrl = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
  function closeSection(p, onList) {
    const body = p.querySelector('.mnc-body');
    const idIn = body.querySelector('.mnc-id');
    const give = document.createElement('div'); give.className = 'mnc-give';
    [...body.children].filter((c) => c !== idIn).forEach((c) => give.appendChild(c));
    const tabs = document.createElement('div'); tabs.className = 'mnc-tabs';
    tabs.innerHTML = '<button class="on" data-t="give">Отдать мастеру</button><button data-t="close">Проведение заявки</button>';
    const cl = document.createElement('div'); cl.className = 'mnc-close'; cl.hidden = true;
    cl.innerHTML = `
      <label class="mnc-lbl">Оплачено клиентом, ₽</label>
      <input class="mnc-sum" type="text" inputmode="numeric" placeholder="например 3000">
      <label class="mnc-lbl">Фото БСО (договор/чек)</label>
      <div class="mnc-drop" data-k="bso_ph" tabindex="0"><span>Ctrl+V — вставить фото<br>или перетащите / нажмите</span><div class="mnc-thumbs"></div></div>
      <div class="mnc-grid">
        <label class="mnc-lbl">Отзыв<select class="mnc-rev"><option>Нет возможности</option><option>Да</option><option>Нет</option></select></label>
        <label class="mnc-lbl">БСО<select class="mnc-bsohas"><option>Есть</option><option>Нет</option></select></label>
      </div>
      <div class="mnc-sub mnc-revbox" hidden>
        <label class="mnc-lbl">Фото отзыва</label>
        <div class="mnc-drop" data-k="rev_ph" tabindex="0"><span>Ctrl+V / перетащите / нажмите</span><div class="mnc-thumbs"></div></div>
      </div>
      <div class="mnc-grid">
        <label class="mnc-lbl">ЗПЧ<select class="mnc-parts"><option>Нет</option><option>Есть</option></select></label>
        <label class="mnc-lbl mnc-pc" hidden>Сумма ЗПЧ, ₽<input class="mnc-pcost" type="text" inputmode="numeric"></label>
      </div>
      <div class="mnc-sub mnc-chkbox" hidden>
        <label class="mnc-lbl">Чеки (в «Чеки на комплектующие» и «Фото запчастей»)</label>
        <div class="mnc-drop" data-k="chk_ph" tabindex="0"><span>Ctrl+V / перетащите / нажмите<br>можно несколько</span><div class="mnc-thumbs"></div></div>
      </div>
      <input class="mnc-file" type="file" accept="image/*" multiple hidden>
      <button class="mnc-b mnc-go">Провести заявку ⏎</button>
      <div class="mnc-m mnc-cm"></div>`;
    body.innerHTML = '';
    body.append(tabs);
    if (idIn) body.append(idIn);
    body.append(give, cl);
    tabs.querySelectorAll('button').forEach((b) => b.onclick = () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      give.hidden = b.dataset.t !== 'give'; cl.hidden = b.dataset.t !== 'close';
      if (!cl.hidden) cl.querySelector('.mnc-sum').focus();
    });
    const PH = { bso_ph: [], rev_ph: [], chk_ph: [] };
    let active = 'bso_ph';
    const fileIn = cl.querySelector('.mnc-file');
    const drops = [...cl.querySelectorAll('.mnc-drop')];
    const draw = (k) => {
      const d = cl.querySelector(`.mnc-drop[data-k="${k}"]`), th = d.querySelector('.mnc-thumbs');
      th.innerHTML = '';
      PH[k].forEach((f, i) => { const w = document.createElement('div'); w.className = 'mnc-th'; const im = document.createElement('img'); im.src = URL.createObjectURL(f); const x = document.createElement('b'); x.textContent = '×'; x.onclick = (e) => { e.stopPropagation(); PH[k].splice(i, 1); draw(k); }; w.append(im, x); th.appendChild(w); });
      d.querySelector('span').hidden = PH[k].length > 0;
    };
    const add = (k, files) => { files = [...files].filter((f) => f && /^image\//.test(f.type)); if (!files.length) return; if (k === 'bso_ph' || k === 'rev_ph') PH[k] = PH[k].concat(files); else PH[k] = PH[k].concat(files); draw(k); };
    const setActive = (k) => { active = k; drops.forEach((d) => d.classList.toggle('act', d.dataset.k === k)); };
    setActive('bso_ph');
    drops.forEach((d) => {
      const k = d.dataset.k;
      d.onclick = () => { setActive(k); fileIn.click(); };
      d.addEventListener('focus', () => setActive(k));
      d.addEventListener('mouseenter', () => setActive(k));
      d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('ov'); });
      d.addEventListener('dragleave', () => d.classList.remove('ov'));
      d.addEventListener('drop', (e) => { e.preventDefault(); d.classList.remove('ov'); add(k, e.dataTransfer.files); });
    });
    fileIn.onchange = () => { add(active, fileIn.files); fileIn.value = ''; };
    document.addEventListener('paste', (e) => {
      if (cl.hidden || p.classList.contains('mnc-min')) return;
      const imgs = [...((e.clipboardData || {}).items || [])].filter((x) => /^image\//.test(x.type)).map((x) => x.getAsFile());
      if (imgs.length) { e.preventDefault(); add(active, imgs); }
    });
    cl.querySelector('.mnc-rev').onchange = (e) => { const on = e.target.value === 'Да'; cl.querySelector('.mnc-revbox').hidden = !on; if (on) setActive('rev_ph'); };
    cl.querySelector('.mnc-parts').onchange = (e) => { const on = e.target.value === 'Есть'; cl.querySelector('.mnc-pc').hidden = !on; cl.querySelector('.mnc-chkbox').hidden = !on; if (on) { setActive('chk_ph'); cl.querySelector('.mnc-pcost').focus(); } };
    const pc = cl.querySelector('.mnc-pcost');
    pc.addEventListener('input', () => { const d = pc.value.replace(/\D/g, ''); pc.value = d ? (+d).toLocaleString('ru-RU') : ''; });
    const sumIn = cl.querySelector('.mnc-sum');
    sumIn.addEventListener('input', () => { const d = sumIn.value.replace(/\D/g, ''); sumIn.value = d ? (+d).toLocaleString('ru-RU') : ''; });
    sumIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const msg = cl.querySelector('.mnc-cm');
    const say = (t, c) => { msg.textContent = t; msg.className = 'mnc-m mnc-cm ' + (c || ''); };
    const goBtn = cl.querySelector('.mnc-go'); goBtn.onclick = (e) => { e.preventDefault(); go(); };
    async function go() {
      const sum = sumIn.value.replace(/\D/g, '');
      if (onList && !(idIn && /^\d+$/.test(idIn.value.trim()))) return say('Отметьте заявку галочкой в списке', 'err');
      if (!sum) return say('Введите сумму, оплаченную клиентом', 'err');
      const o = { sum, rev: cl.querySelector('.mnc-rev').value, bsoHas: cl.querySelector('.mnc-bsohas').value, parts: cl.querySelector('.mnc-parts').value, pcost: cl.querySelector('.mnc-pcost').value.replace(/\D/g, '') };
      if (o.rev === 'Да' && !PH.rev_ph.length) return say('Добавьте фото отзыва', 'err');
      if (o.parts === 'Есть' && !o.pcost) return say('Введите сумму ЗПЧ', 'err');
      goBtn.disabled = true;
      try {
        const id = onList ? idIn.value.trim() : reqId();
        Object.assign(o, PH);
        say('Заявка ' + id + ': провожу…', 'ok');
        const r = await bgClose(id, o, say);
        browser.runtime.sendMessage({ tg: 'closed', id, out: r.out, master: r.master, empId: r.empId }).catch(() => {});
        say('Готово: заявка проведена, сумма скопирована ✓', 'ok');
        sumBanner(r.out, r.copied, () => location.reload());
      } catch (e) { goBtn.disabled = false; say('Ошибка: ' + e.message, 'err'); }
    }
  }


  // ================= «За кадром»: заявка открывается в невидимом окне =================
  class HiddenPage {
    constructor(url) { this.url = url; }
    open() {
      return new Promise((res, rej) => {
        const f = document.createElement('iframe');
        f.style.cssText = 'position:fixed;left:-14000px;top:0;width:1500px;height:1000px;border:0;opacity:0;pointer-events:none';
        f.src = this.url; this.f = f;
        document.body.appendChild(f);
        this.waitReady(30000).then((ok) => ok ? res(this) : rej(new Error('заявка не открылась')));
      });
    }
    get d() { try { return this.f.contentDocument; } catch (e) { return null; } }
    get w() { return this.f.contentWindow; }
    get ww() { return this.f.contentWindow.wrappedJSObject; }
    ready(d) { return d && d.readyState === 'complete' && d.body && d.location.href !== 'about:blank'; }
    async waitReady(ms) { for (let t = 0; t < ms; t += 150) { if (this.ready(this.d)) return true; await sleep(150); } return false; }
    async waitNav(prev, ms) { for (let t = 0; t < ms; t += 150) { const d = this.d; if (d && d !== prev && this.ready(d)) { await sleep(300); return true; } await sleep(150); } return false; }
    async waitFor(fn, ms) { for (let t = 0; t < ms; t += 150) { let v; try { v = fn(this.d); } catch (e) {} if (v) return v; await sleep(150); } return null; }
    confirm(answer, log) { try { this.ww.confirm = exportFunction((m) => { if (log) log.push(String(m || '')); return answer; }, this.w); this.ww.alert = exportFunction(() => {}, this.w); } catch (e) {} }
    quietClipboard() {
      try {
        const ww = this.ww, w = this.w;
        if (ww.navigator.clipboard) ww.navigator.clipboard.writeText = exportFunction(() => new ww.Promise(exportFunction((ok) => ok(), w)), w);
        const orig = ww.document.execCommand;
        ww.document.execCommand = exportFunction(function (c) { return String(c).toLowerCase() === 'copy' ? true : orig.apply(ww.document, arguments); }, w);
      } catch (e) {}
    }
    close() { try { this.f.remove(); } catch (e) {} }
  }
  const fireIn = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try { const jq = el.ownerDocument.defaultView.wrappedJSObject.jQuery; if (jq) jq(el.wrappedJSObject || el).trigger('change'); } catch (e) {}
  };
  function labelIn(d, re) {
    const lab = [...d.querySelectorAll('label, .control-label')].find((l) => re.test(norm(l.textContent)));
    if (!lab) return null;
    if (lab.htmlFor) { const el = d.getElementById(lab.htmlFor); if (el) return el; }
    const g = lab.closest('.form-group, .field, td, div');
    return g ? g.querySelector('select, input:not([type=hidden]):not([type=file]), textarea') : null;
  }
  const selIn = (el, re) => { if (!el || el.tagName !== 'SELECT') return false; const o = [...el.options].find((x) => re.test(norm(x.text))); if (!o) return false; el.value = o.value; fireIn(el); return true; };
  const valIn = (el, v) => { if (!el) return false; el.value = v; fireIn(el); return true; };
  const btnIn = (d, re) => [...d.querySelectorAll('button, a.btn, input[type=submit], input[type=button]')].find((b) => re.test(norm(b.textContent || b.value)));
  const visIn = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  // заголовок окна загрузки — ищем сам текст, в каком бы элементе он ни стоял
  function headIn(d, re) {
    const tw = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) { const t = norm(n.nodeValue); if (t.length < 60 && re.test(t)) return n.parentElement; }
    // текст может быть разбит на части — проверяем элементы целиком
    for (const el of d.querySelectorAll('div, p, span, label, b, strong, h3, h4, h5, h6, legend')) { const t = norm(el.textContent); if (t.length < 60 && re.test(t)) return el; }
    return null;
  }
  function autoNoIn(d, ms, log) {
    const t = setInterval(() => {
      d.querySelectorAll('.modal.show, .modal.in, .swal2-popup, .bootbox, .jconfirm, [role=dialog]').forEach((m) => {
        if (!visIn(m)) return;
        const no = [...m.querySelectorAll('button, a.btn')].find((b) => /^(нет|no|отмена|cancel)$/i.test(norm(b.textContent)));
        if (no) { log && log.push(norm(m.textContent)); no.click(); }
      });
    }, 150);
    const stop = () => clearInterval(t); setTimeout(stop, ms); return stop;
  }
  async function tabIn(pg, hash, name) {
    const d = pg.d;
    const link = d.querySelector(`a[href$="#${hash}"], [data-target="#${hash}"], [data-bs-target="#${hash}"]`) || [...d.querySelectorAll('.nav a, .nav-tabs a, ul a')].find((x) => norm(x.textContent) === name);
    if (link) link.click(); else pg.w.location.hash = hash;
    await sleep(400);
  }
  // порядок окон на вкладке «Документы»
  const DOC_ORDER = { 'Договор/Чеки на услуги': 0, 'Чеки на комплектующие/расходы': 1, 'Фото запчастей/комплектующих': 2, 'Сохранная расписка': 3, 'Фото отзыв': 4 };
  async function uploadIn(pg, titleRe, label, files, say) {
    if (!files || !files.length) return;
    say(`Фото: ${label}…`);
    await tabIn(pg, 'photo', 'Документы');
    const d = pg.d;
    // ждём, пока CRM покажет окна загрузки
    await pg.waitFor((dd) => dd.querySelectorAll('input[type=file]').length >= 4, 10000);
    const inputs = [...d.querySelectorAll('input[type=file]')];
    if (!inputs.length) throw new Error('на вкладке «Документы» нет окон загрузки');
    let inp = null;
    const head = headIn(d, titleRe);
    if (head) inp = inputs.find((i) => head.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!inp) inp = inputs[DOC_ORDER[label]];
    if (!inp) throw new Error(`не найдено окно «${label}» (окон на вкладке: ${inputs.length})`);
    const box = inp.closest('.file-input') || inp.closest('.form-group') || inp.parentElement.parentElement;
    const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f));
    inp.files = dt.files; fireIn(inp);
    const up = await pg.waitFor(() => [...box.querySelectorAll('button, a.btn')].find((x) => /загрузить/i.test(norm(x.textContent) + ' ' + (x.title || '')) && visIn(x)) || [...box.querySelectorAll('.fileinput-upload, .fileinput-upload-button')].find(visIn), 6000);
    if (!up) throw new Error(`«${label}»: CRM не приняла файл (нет кнопки «Загрузить»)`);
    up.click();
    const ok = await pg.waitFor(() => {
      const err = [...box.querySelectorAll('.kv-fileinput-error, .file-error-message')].find((e) => visIn(e) && norm(e.textContent));
      if (err) throw new Error(`${label}: ${norm(err.textContent)}`);
      return /готово/i.test(norm(box.textContent)) || box.querySelector('.file-preview-success, .file-upload-indicator .text-success, .progress-bar-success');
    }, 30000);
    if (!ok) throw new Error(`${label}: загрузка не завершилась`);
    say(`Фото: ${label} — готово ✓`, 'ok');
  }
  // --- Отдать мастеру за кадром ---
  let ST_CACHE = DEFAULT_STATUSES.slice();
  browser.storage.local.get('statuses').then((r) => { if (r.statuses && r.statuses.length) ST_CACHE = r.statuses; }).catch(() => {});
  // статус «В пути» = «В пути», «В пути (Отз)» и т.п.; «Ё» = «Е»
  const stKey = (t) => norm(t).toLowerCase().replace(/ё/g, 'е').replace(/\s*\(.*\)\s*$/, '').trim();
  const stRx = (name) => ({ test: (t) => stKey(t) === stKey(name), name });
  const stOpts = (s) => [...s.options].map((o) => norm(o.text)).filter(Boolean).join(', ');
  // сначала точное совпадение, затем вариант с пометкой в скобках
  const selSt = (s, rx) => {
    if (!s) return false;
    const opts = [...s.options];
    let o = opts.find((x) => norm(x.text).toLowerCase() === rx.name.toLowerCase()) || opts.find((x) => rx.test(x.text));
    if (!o) return false;
    s.value = o.value; fireIn(s); return true;
  };
  // что реально записано в базе по заявке
  async function readReq(id) {
    // открываем заявку заново в скрытой вкладке (поля статуса и мастера заполняет скрипт CRM, в «сыром» HTML их нет)
    let pg = null;
    try {
      pg = await new HiddenPage(UPD + id).open();
      const got = await pg.waitFor((d) => {
        const ss = d && d.querySelector(ST), es = d && d.querySelector(EMP);
        const t = ss && ss.selectedOptions && ss.selectedOptions[0] ? norm(ss.selectedOptions[0].text) : '';
        return t ? { st: t, emp: es ? String(es.value || '') : '' } : null;
      }, 10000);
      if (got) return got;
    } catch (e) {} finally { if (pg) pg.close(); }
    // запасной путь — статус из списка заявок
    try {
      const r = await fetch('/admin/domain/customer-request/index', { credentials: 'include', cache: 'no-store' });
      const x = new DOMParser().parseFromString(await r.text(), 'text/html');
      const table = [...x.querySelectorAll('table')].find((t) => /статус/i.test((t.querySelector('thead') || {}).textContent || ''));
      const heads = [...table.querySelectorAll('thead tr')].map((tr) => [...tr.cells].map((c) => norm(c.textContent))).sort((p, q) => q.filter(Boolean).length - p.filter(Boolean).length)[0] || [];
      const iSt = heads.findIndex((h) => /^статус$/i.test(h));
      const tr = [...table.querySelectorAll('tbody tr')].find((row) => (norm(row.cells[0] && row.cells[0].textContent).match(/\d{5,}/) || [])[0] === String(id));
      if (tr && iSt >= 0) return { st: norm(tr.cells[iSt].textContent), emp: '' };
    } catch (e) {}
    return null;
  }
  async function bgAssign(id, empId, stName, say) {
    const pg = await new HiddenPage(UPD + id).open();
    try {
      const d = pg.d;
      const e = d.querySelector(EMP), s = d.querySelector(ST), copyBtn = d.getElementById('copyReqInfo');
      if (!e || !s || !copyBtn) throw new Error('в заявке нет поля мастера/статуса или кнопки «Копировать информацию»');
      const log = [];
      pg.confirm(false, log);
      const stopNo = autoNoIn(d, 6000, log);
      e.value = String(empId); fireIn(e);
      // CRM после смены мастера сама сбрасывает статус — ждём и ставим статус после неё
      await sleep(1200);
      const stRe = stRx(stName);
      const stNow = () => norm(((s.selectedOptions || [])[0] || {}).text || '');
      let okSt = false;
      for (let k = 0; k < 4 && !okSt; k++) {
        if (!selSt(s, stRe)) throw new Error('нет статуса «' + stName + '» (есть: ' + stOpts(s) + ')');
        await sleep(700);
        okSt = stRe.test(stNow());
      }
      stopNo();
      if (e.value !== String(empId)) throw new Error('мастер не встал');
      if (!okSt) throw new Error(`CRM сбросила статус на «${stNow()}» вместо «${stName}»`);
      const info = (d.getElementById('reqInfo') || {}).value || '';
      const copied = info ? await copyText(info) : false;
      pg.confirm(true); pg.quietClipboard();
      say('Сохраняю и закрываю заявку…', 'ok');
      const prev = d; copyBtn.click();
      const left = await pg.waitNav(prev, 15000);
      if (!left) throw new Error('CRM не закрыла заявку после «Копировать информацию»');
      const blocking = [...new Set(log.join(' ').match(/\d{6,}/g) || [])].filter((x) => x !== id);
      // проверка по базе: статус и мастер должны реально записаться, иначе мастеру не отдаём
      const real = await readReq(id);
      if (!real || !stRe.test(real.st)) throw new Error(`статус не поменялся (в CRM «${(real && real.st) || '?'}») — мастеру не отправлено` + (blocking.length ? `. Закройте заказ №${blocking.join(', №')}` : ''));
      if (real.emp && real.emp !== String(empId)) throw new Error('мастер в CRM не сохранился — мастеру не отправлено');
      return { copied, info, blocking, asked: log.length > 0 };
    } finally { pg.close(); }
  }
  // --- Снять мастера («Выберите мастера») и сохранить — заявка уходит в «Ожидает» ---
  async function bgUnassign(id) {
    const pg = await new HiddenPage(UPD + id).open();
    try {
      const d = pg.d, e = d.querySelector(EMP);
      if (!e) throw new Error('в заявке нет поля мастера');
      const log = [];
      pg.confirm(false, log);
      const stopNo = autoNoIn(d, 5000, log);
      const empty = [...e.options].find((o) => o.value === '') || [...e.options].find((o) => /выберите/i.test(o.text));
      if (!empty) { stopNo(); throw new Error('нет пункта «Выберите мастера»'); }
      e.value = empty.value; fireIn(e);
      await sleep(1200); stopNo();
      pg.confirm(true); pg.quietClipboard();
      await tabIn(pg, 'main', 'Информация').catch(() => {});
      const save = btnIn(d, /^сохранить$/i);
      const prev = d;
      if (save) save.click(); else { const f = e.form; if (!f) throw new Error('нет кнопки «Сохранить»'); f.submit(); }
      await pg.waitNav(prev, 10000);
    } finally { pg.close(); }
    const real = await readReq(id);
    if (!real || stKey(real.st) !== 'ожидает') throw new Error(`после снятия мастера заявка не ушла в «Ожидает» (сейчас «${(real && real.st) || '?'}»)`);
  }
  // --- Сменить только статус (В пути / В работе) за кадром ---
  async function bgStatus(id, stName) {
    const pg = await new HiddenPage(UPD + id).open();
    try {
      const d = pg.d;
      const s = d.querySelector(ST), e = d.querySelector(EMP);
      if (!s) throw new Error('в заявке нет поля статуса');
      const cur = norm(((s.selectedOptions || [])[0] || {}).text || '');
      if (/^(готов|отказ|отмен)/i.test(cur)) throw new Error(`заявка в статусе «${cur}» — менять нельзя`);
      const master = e && e.selectedOptions && e.selectedOptions[0] && e.value ? clean(norm(e.selectedOptions[0].text)) : '';
      const stRe = stRx(stName);
      if (stRe.test(cur)) return { same: true, cur, master };
      // нужного статуса нет в списке (например, «В пути» у заявки «В работе»):
      // «Выберите мастера» → Сохранить (заявка падает в «Ожидает») → вернуть мастера + нужный статус
      if (![...s.options].some((o) => stRe.test(o.text))) {
        const empId = e ? String(e.value || '') : '';
        if (!empId) throw new Error(`нет статуса «${stName}», а мастер не назначен — сначала отдайте заявку мастеру`);
        pg.close();
        await bgUnassign(id);
        const r = await bgAssign(id, empId, stName, () => {});
        return { ok: true, cur, master, blocking: r.blocking, via: true };
      }
      const log = [];
      pg.confirm(false, log);
      const stopNo = autoNoIn(d, 6000, log);
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        if (!selSt(s, stRe)) { stopNo(); throw new Error('нет статуса «' + stName + '» (есть: ' + stOpts(s) + ')'); }
        await sleep(700);
        ok = stRe.test(norm(((s.selectedOptions || [])[0] || {}).text || ''));
      }
      stopNo();
      if (!ok) throw new Error('CRM не дала поставить статус «' + stName + '»');
      pg.confirm(true); pg.quietClipboard();
      // сохраняем обычной кнопкой «Сохранить», потом проверяем, что статус реально записался
      const stOf = async () => ((await readReq(id)) || {}).st || '';
      await tabIn(pg, 'main', 'Информация').catch(() => {});
      const save = btnIn(d, /^сохранить$/i);
      if (save) { const prev = d; save.click(); await pg.waitNav(prev, 8000); }
      let now = await stOf();
      if (!stRe.test(now)) {
        const d2 = pg.d, s2 = d2 && d2.querySelector(ST), cb = d2 && d2.getElementById('copyReqInfo');
        if (s2 && cb) { pg.confirm(true); pg.quietClipboard(); if (!stRe.test(norm(((s2.selectedOptions || [])[0] || {}).text || ''))) selSt(s2, stRe); await sleep(500); const prev = d2; cb.click(); await pg.waitNav(prev, 10000); now = await stOf(); }
      }
      if (!stRe.test(now)) throw new Error(`CRM не сохранила статус (сейчас «${now || cur}»)` + (log.length ? ' · ' + log.join(' ').slice(0, 150) : ''));
      const blocking = [...new Set(log.join(' ').match(/\d{6,}/g) || [])].filter((x) => x !== id);
      return { ok: true, cur, master, blocking };
    } finally { pg.close(); }
  }
  // --- Провести заявку за кадром ---
  async function bgClose(id, o, say) {
    const pg = await new HiddenPage(UPD + id).open();
    try {
      let d = pg.d;
      const es0 = d.querySelector(EMP); const masterAtStart = es0 && es0.selectedOptions && es0.selectedOptions[0] ? norm(es0.selectedOptions[0].text) : '';
      const rx = (t) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
      say('Заполняю поля…');
      const fails = [];
      if (!valIn(labelIn(d, /^оплачено клиентом/i), o.sum)) fails.push('Оплачено клиентом');
      const log = [];
      pg.confirm(false, log);
      const stopNo = autoNoIn(d, 5000, log);
      if (!selIn(d.querySelector(ST), /^в работе$/i)) fails.push('Статус');
      await sleep(900); stopNo();
      if (!selIn(labelIn(d, /^отзыв написан/i), rx(o.rev))) fails.push('Отзыв написан');
      if (!selIn(labelIn(d, /^наличие бсо/i), rx(o.bsoHas))) fails.push('Наличие БСО');
      if (!selIn(labelIn(d, /^комплектующие$/i), rx(o.parts))) fails.push('Комплектующие');
      if (o.parts === 'Есть' && o.pcost && !valIn(labelIn(d, /^стоим\.?\s*комплект/i), o.pcost)) fails.push('Стоим.комплектующ.');
      if (fails.length) throw new Error('не нашёл поля: ' + fails.join(', '));
      const bso = await toFiles(o.bso_ph), rev = await toFiles(o.rev_ph), chk = await toFiles(o.chk_ph);
      if (bso.length) await uploadIn(pg, /договор.{0,4}чеки на услуги/i, 'Договор/Чеки на услуги', bso, say);
      if (o.parts === 'Есть' && chk.length) {
        await uploadIn(pg, /^чеки на комплектующие/i, 'Чеки на комплектующие/расходы', chk, say);
        await uploadIn(pg, /^фото запчастей/i, 'Фото запчастей/комплектующих', chk, say);
      }
      if (o.rev === 'Да' && rev.length) await uploadIn(pg, /^фото отзыв/i, 'Фото отзыв', rev, say);
      await tabIn(pg, 'main', 'Информация');
      const save = btnIn(d, /^сохранить$/i);
      if (!save) throw new Error('нет кнопки «Сохранить»');
      pg.confirm(true);
      say('Сохраняю…', 'ok');
      let prev = d; save.click();
      await pg.waitNav(prev, 6000); // перезагрузка после сохранения (если CRM сохраняет без неё — идём дальше)
      d = pg.d;
      const postB = await pg.waitFor((dd) => { const b = btnIn(dd, /^провести заявку$/i); return b && !b.disabled && !b.classList.contains('disabled') ? b : null; }, 15000);
      if (!postB) throw new Error('кнопка «Провести заявку» не активна — CRM не сохранила заявку');
      pg.confirm(true);
      say('Провожу заявку…', 'ok');
      prev = pg.d; postB.click();
      const sumOf = (dd) => { const t = String(dd.body.textContent || '').replace(/[\s\u00a0]+/g, ' '); const a = t.match(/Проведенная сумма по заявке:\s*(-?\d[\d ]*)/i); const b = t.match(/Сумма к сдаче:\s*(-?\d[\d ]*)/i); return b ? (a ? `Проведенная сумма по заявке: ${a[1].trim()} р.\n` : '') + `Сумма к сдаче: ${b[1].trim()} р.` : ''; };
      const out = await pg.waitFor((dd) => pg.ready(dd) && sumOf(dd), 20000);
      if (!out) throw new Error('заявка проведена? «Сумма к сдаче» не появилась');
      const copied = await copyText(out);
      const md = pg.d; const es = md.querySelector(EMP); const master = es && es.selectedOptions && es.selectedOptions[0] ? norm(es.selectedOptions[0].text) : (norm(((labelIn(md, /^мастер/i) || {}).value) || '') || masterAtStart);
      const empIdNow = es && es.value ? es.value : (es0 ? es0.value : '');
      return { out, copied, master, empId: empIdNow };
    } finally { pg.close(); }
  }

  window.addEventListener('message', (e) => {
    if (!e.data || !/^moz-extension:/.test(e.origin)) return;
    if (e.data.dirHelper === 'panel') { const pp = document.getElementById('mnc-ext-panel'); if (pp) pp.classList.toggle('mnc-min'); return; }
    if (e.data.dirHelper !== 'toggle') return;
    window.__mncDash && window.__mncDash.toggle(e.data.mode || 'an');
  });
  if (window === window.top) browser.runtime.onMessage.addListener((m) => {
    if (m && m.dhAssign) return (async () => {
      const a = m.dhAssign;
      let list = []; try { list = (await browser.storage.local.get('masters')).masters || []; } catch (e) {}
      if (!list.length) list = DEFAULT_MASTERS;
      const sur = String(a.surname || '').toLowerCase().replace(/ё/g, 'е');
      const found = a.empId ? list.filter((x) => String(x.id) === String(a.empId)) : list.filter((x) => clean(x.name).toLowerCase().replace(/ё/g, 'е').startsWith(sur));
      if (found.length !== 1) return { err: found.length ? 'несколько мастеров: ' + found.map((x) => clean(x.name)).join(', ') : 'мастер «' + (a.surname || a.empId) + '» не найден' };
      const name = clean(found[0].name);
      const st = a.st.trim().replace(/^./, (c) => c.toUpperCase());
      try {
        const r = await bgAssign(a.id, found[0].id, st, () => {});
        browser.runtime.sendMessage({ tg: 'assigned', id: a.id, name, empId: found[0].id, st, info: r.info }).catch(() => {});
        return { ok: true };
      } catch (e) { return { err: e.message }; }
    })();
    if (m && m.dhClose) return (async () => {
      // проведение заявки из бота — тот же алгоритм, что и в панели «Проведение заявки»
      const { id, o } = m.dhClose;
      try {
        const r = await bgClose(String(id), o, () => {});
        browser.runtime.sendMessage({ tg: 'closed', id: String(id), out: r.out, master: r.master, empId: r.empId }).catch(() => {});
        return { ok: true, out: r.out, master: clean(r.master || '') };
      } catch (e) { return { err: e.message }; }
    })();
    if (m && m.dhInfo) return (async () => {
      // открыть заявку за кадром, взять «информацию» (как «Копировать информацию»), закрыть — ничего не меняя
      let pg = null;
      try {
        pg = await new HiddenPage(UPD + m.dhInfo.id).open();
        const info = await pg.waitFor((d) => { const t = d && d.getElementById('reqInfo'); return t && String(t.value || t.textContent || '').trim(); }, 10000);
        return info ? { info } : { err: 'в заявке нет «информации»' };
      } catch (e) { return { err: e.message }; } finally { if (pg) pg.close(); }
    })();
    if (m && m.dhStatus) return bgStatus(String(m.dhStatus.id), m.dhStatus.st).catch((e) => ({ err: e.message }));
    if (m && m.dhDayTurn) return (window.__mncDash && window.__mncDash.dayTurn ? window.__mncDash.dayTurn() : Promise.resolve({ err: 'аналитика не загружена' }));
    if (m && m.dhMasterStat) return (window.__mncDash && window.__mncDash.masterStat ? window.__mncDash.masterStat(m.dhMasterStat) : Promise.resolve({ err: 'аналитика не загружена' }));
    if (m && (m.dhSummary || m.dhSalary)) return (window.__mncDash && window.__mncDash.tgText ? window.__mncDash.tgText(m) : Promise.resolve({ err: 'аналитика не загружена' }));
  });

  // ---------- Шапка DIR HELPER на вкладке CRM (в окне расширения шапка своя) ----------
  function makeTopBar() {
    if (window !== window.top || document.getElementById('dh-topbar')) return;
    const bar = document.createElement('header');
    bar.id = 'dh-topbar'; bar.className = 'dhb';
    let ver = ''; try { ver = browser.runtime.getManifest().version; } catch (e) {}
    bar.innerHTML = `<div class="dhb-brand"><b>DIR</b><span>HELPER</span><i>${ver}</i></div><div class="dhb-tools">
      <button data-a="give" class="dhb-main" title="Выдача и проведение заявки" aria-label="Выдача и проведение заявки"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c.6-2.8 2.6-4.2 5-4.2s4.4 1.4 5 4.2"/></svg><span class="dhb-l">Выдача</span></button><button data-a="an" class="" title="Аналитика" aria-label="Аналитика"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 13V9M8 13V5M12 13V2.5"/></svg><span class="dhb-l">Аналитика</span></button><button data-a="zp" class="" title="Зарплата директора" aria-label="Зарплата директора">₽<span class="dhb-l">Зарплата</span></button><button data-a="ad" class="" title="Реклама" aria-label="Реклама"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 1.8h5.4L12.5 5v9.2H4z"/><path d="M6 8.5h4.5M6 11h3"/></svg><span class="dhb-l">Реклама</span></button><button data-a="rt" title="Рейтинг городов" aria-label="Рейтинг городов">TOP</button><span class="dhb-sep"></span><button data-a="bot" class="dhb-bot" title="Telegram-бот на этом компьютере: включить / выключить" aria-label="Telegram-бот"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="5" width="11" height="8" rx="2"/><path d="M8 2.5V5M6 9h.01M10 9h.01"/></svg><span class="dhb-l">Бот</span><i class="dhb-dot"></i></button><button data-a="set" class="" title="Настройки и Telegram" aria-label="Настройки и Telegram"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg></button><button data-a="upd" class="" title="Проверить обновление" aria-label="Проверить обновление"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2M11.5 2v2.5H9"/></svg></button>
    </div>`;
    document.body.prepend(bar);
    document.documentElement.classList.add('dh-has-bar');
    // закреплённые сверху элементы CRM сдвигаем под шапку
    const shift = () => document.querySelectorAll('body *').forEach((el) => {
      if (el === bar || bar.contains(el) || el.dataset.dhShift) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && parseFloat(cs.top) < 8 && el.getBoundingClientRect().height < 200 && el.id !== 'mnc-ext-panel') { el.style.top = (parseFloat(cs.top) + 48) + 'px'; el.dataset.dhShift = '1'; }
    });
    setTimeout(shift, 300); setTimeout(shift, 1500);
    const toast = (t) => { const d = document.createElement('div'); d.className = 'dh-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 4500); };
    const mark = () => { const p = document.getElementById('mnc-ext-panel'); bar.querySelector('[data-a="give"]').classList.toggle('on', !!(p && !p.classList.contains('mnc-min'))); };
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'list') location.href = '/admin/domain/customer-request/index';
      else if (a === 'give') { const p = document.getElementById('mnc-ext-panel'); if (!p) return toast('Выдача работает на списке заявок и на странице заявки'); p.classList.toggle('mnc-min'); mark(); }
      else if (a === 'set') browser.runtime.sendMessage({ openOptions: true }).catch(() => {});
      else if (a === 'bot') { const r = await browser.storage.local.get('tgHere'); const on = r.tgHere === false; if (!on && !confirm('Выключить Telegram-бота на этом компьютере?\nКоманды бота, уведомления и напоминания перестанут работать, пока не включите снова.')) return; await browser.storage.local.set({ tgHere: on }); toast(on ? '🟢 Бот включён на этом компьютере' : '⚪ Бот выключен на этом компьютере'); }
      else if (a === 'upd') { b.classList.add('spin'); const r = await browser.runtime.sendMessage({ dhUpdate: true }).catch((er) => ({ text: er.message })); b.classList.remove('spin'); toast((r && r.text) || 'Ошибка проверки'); }
      else if (a) window.__mncDash && window.__mncDash.toggle(a);
    });
    new MutationObserver(mark).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // кнопка «Бот»: включает/выключает Telegram-бота на этом компьютере
    const botBtn = bar.querySelector('[data-a="bot"]');
    const botShow = (on) => { botBtn.classList.toggle('bot-on', on); botBtn.title = on ? 'Бот работает на этом компьютере — нажмите, чтобы выключить' : 'Бот выключен на этом компьютере — нажмите, чтобы включить'; };
    browser.storage.local.get('tgHere').then((r) => botShow(r.tgHere !== false)).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.tgHere) botShow(ch.tgHere.newValue !== false); });
  }

  // ---------- Запуск ----------
  try { makeTopBar(); } catch (e) {}
  if (isUpdate) {
    continueClosing();
    const start = () => { const e = document.querySelector(EMP); if (e && !document.getElementById('mnc-ext-panel')) { initUpdate(e); return true; } };
    if (!start()) {
      const mo = new MutationObserver(() => { if (start()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { if (!document.getElementById('mnc-ext-panel')) { const b = document.createElement('div'); b.id = 'mnc-ext-badge'; b.textContent = 'МНЧ-расширение: поле мастера не найдено'; document.body.appendChild(b); } }, 5000);
    }
  } else if (isList) {
    initList();
    try { browser.runtime.sendMessage({ seenList: true }); } catch (e) {}
  }
})();
