// «Что нового» — краткие патчноуты для админов (кнопка «?» справа в шапке).
// При выпуске версии: добавить запись СВЕРХУ, коротко и понятным языком — что появилось и как этим пользоваться.
var DH_CHANGELOG = [
  { v: '14.7', d: '03.11.2026', items: [
    'В меню темы (кнопка ☀/☾) добавлены светлые палитры: Sky Breeze, Sage Light, Rose Dream, Sunny Glow, Lavender Sky. «Обычная» — прежний вид без изменений.',
  ] },
  { v: '14.6', d: '03.11.2026', items: [
    'Выбор темы: нажмите кнопку ☀/☾ рядом с «?» — откроется меню. Светлая, «Ночной Telegram» и 5 новых тёмных: Midnight, Forest Night, Obsidian, Emerald Shadow, Purple Eclipse. Тема сразу меняется во всех вкладках и окнах.',
  ] },
  { v: '14.5', d: '03.11.2026', items: [
    '«⟳ Обновить» теперь работает: если вышла новая версия, появится ссылка «⬇ Установить» — нажмите её, затем в окне Firefox «Продолжить установку» и «Добавить». Настройки сохранятся.',
    'Когда выходит новая версия, на кнопке «?» загорается красная точка.',
  ] },
  { v: '14.4', d: '03.11.2026', items: [
    'Новая тёмная тема — в стиле ночного Telegram: тёмно-синий фон, светлый текст, зелёные кнопки. Цветные статусы заявок остаются цветными, текст в них читается.',
  ] },
  { v: '14.3', d: '03.11.2026', items: [
    '«⟳ Обновить» ставит новую версию через Firefox: появится окно — нажмите «Продолжить установку» и «Добавить». Вкладка закроется сама.',
    'При запуске Firefox DIR HELPER сам проверяет обновления и, если вышла новая версия, сразу предлагает обновиться.',
  ] },
  { v: '14.2', d: '03.11.2026', items: [
    'Тёмная тема для CRM и DIR HELPER: кнопка рядом с «?» (☀ — сейчас светлая, ☾ — тёмная). Включается сразу во всех вкладках и окнах, фото в заявках остаются в обычных цветах.',
  ] },
  { v: '14.1', d: '03.11.2026', items: [
    'Кнопка «⟳ Обновить» в «?» работает: если вышла новая версия, откроется её установка — нажмите «Разрешить» и «Добавить». Настройки сохраняются.',
  ] },
  { v: '14.0', d: '03.11.2026', items: [
    'Из шапки окна DIR HELPER убрана кнопка ⟳. Обновиться: «?» → «⟳ Обновить».',
  ] },
  { v: '13.9', d: '03.11.2026', items: [
    'Исправлено: кнопки «⟳ Обновить» и ⟳ писали «Не удалось проверить» — теперь проверяют и ставят обновление.',
  ] },
  { v: '13.8', d: '02.11.2026', items: [
    'Когда выходит новая версия DIR HELPER, бот присылает «🆕 Доступно обновление» — обновиться можно через «?» → «⟳ Обновить».',
  ] },
  { v: '13.7', d: '02.11.2026', items: [
    'Кнопка «Выдача» в шапке переименована в «Раздача» — открывает панель раздачи и проведения заявок, как и раньше.',
  ] },
  { v: '13.6', d: '02.11.2026', items: [
    'В «Что нового» кнопка «⟳ Обновить» — проверяет и сразу ставит новую версию DIR HELPER.',
  ] },
  { v: '13.5', d: '02.11.2026', items: [
    'Кнопка «?» справа в шапке — здесь кратко описано, что появилось в новых версиях. Красная точка на ней — есть непрочитанные новости.',
  ] },
  { v: '13.4', d: '02.11.2026', items: [
    'Значок DIR HELPER на любом сайте открывает CRM в окне справа, страница остаётся слева. Закрыть — ✕ или ещё раз на значок.',
    'Бот: кнопка «⏯ Бот вкл/выкл» — выключить и включить бота может только @tveruga.',
    'Бот после включения не выполняет старые команды и не рассылает накопившееся.',
    'Настройки бота (тексты, время, кнопки в ⚙️) меняет только @tveruga.',
  ] },
  { v: '13.3', d: '02.11.2026', items: [
    'Бот работает на любом включённом компьютере: если главный выключили, через несколько минут бота подхватывает другой.',
    'Сумма к сдаче по проведённой заявке уходит мастеру один раз — по старым заказам повторов больше нет.',
  ] },
  { v: '13.2', d: '02.11.2026', items: [
    'Боковая панель: кнопки меню начинаются слева, лишний логотип убран.',
  ] },
  { v: '13.1', d: '27.10.2026', items: [
    'Уведомление о неразданной заявке — за 30 минут до времени заказа.',
  ] },
  { v: '13.0', d: '27.10.2026', items: [
    'Аналитика и Реклама: сравнение с прошлой неделей.',
  ] },
  { v: '12.8', d: '26.10.2026', items: [
    'Служебные сообщения бота удаляются сами, чтобы не засорять чат.',
    'Шапка DIR HELPER больше не наезжает на страницу CRM.',
  ] },
  { v: '12.6', d: '26.10.2026', items: [
    'Кнопка «Бот» в шапке — включить/выключить бота на этом компьютере.',
  ] },
  { v: '12.1', d: '25.10.2026', items: [
    'Кнопка ⟳ — проверить обновление и сразу установить.',
  ] },
];

// окно «Что нового»
function dhShowNews(doc) {
  doc = doc || document;
  if (doc.getElementById('dh-news')) return;
  if (!doc.getElementById('dh-news-css')) {
    const st = doc.createElement('style'); st.id = 'dh-news-css';
    st.textContent = `
#dh-news{position:fixed;inset:0;z-index:2147483646;background:rgba(15,35,26,.35);display:flex;align-items:flex-start;justify-content:flex-end;padding:56px 14px 14px;box-sizing:border-box;font:13px "Segoe UI",system-ui,sans-serif;color:#10231a;animation:dhNewsFade .18s ease}
#dh-news .dhn-card{background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(11,46,32,.3),0 0 0 1px #dbe8df;width:min(420px,100%);max-height:calc(100vh - 80px);display:flex;flex-direction:column;overflow:hidden;transform-origin:100% 0;animation:dhNewsPop .22s cubic-bezier(.2,.8,.25,1)}
#dh-news .dhn-head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 10px 16px;border-bottom:1px solid #e6efe9}
#dh-news .dhn-head b{font:700 15px "Segoe UI",sans-serif;color:#0f3d2b}
#dh-news .dhn-x{all:unset;cursor:pointer;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font-size:15px;color:#4f6b5c}
#dh-news .dhn-x:hover{background:#eaf5ee}
#dh-news .dhn-body{overflow:auto;padding:6px 16px 14px}
#dh-news .dhn-ver{margin-top:12px}
#dh-news .dhn-ver h4{margin:0 0 6px;font:700 13px "Segoe UI",sans-serif;color:#166534;display:flex;gap:8px;align-items:baseline}
#dh-news .dhn-ver h4 span{font-weight:400;color:#6b8577;font-size:12px}
#dh-news .dhn-ver h4 em{font-style:normal;font-size:10px;font-weight:700;background:#166534;color:#fff;border-radius:6px;padding:1px 6px}
#dh-news .dhn-foot{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid #e6efe9;background:#f7fbf8}
#dh-news .dhn-upd{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:8px;background:#166534;color:#fff;font:600 13px "Segoe UI",sans-serif;white-space:nowrap}
#dh-news .dhn-upd:hover{background:#14532d}
#dh-news .dhn-upd[disabled]{opacity:.6;cursor:default}
#dh-news .dhn-msg{font-size:12px;color:#4f6b5c;line-height:1.4}
#dh-news .dhn-msg a{color:#166534;cursor:pointer;text-decoration:underline}
#dh-news ul{margin:0;padding-left:18px}
#dh-news li{margin:3px 0;line-height:1.45}
@keyframes dhNewsFade{from{opacity:0}}
@keyframes dhNewsPop{from{opacity:0;transform:scale(.92)}}`;
    (doc.head || doc.documentElement).appendChild(st);
  }
  let cur = ''; try { cur = browser.runtime.getManifest().version; } catch (e) {}
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const w = doc.createElement('div'); w.id = 'dh-news';
  w.innerHTML = `<div class="dhn-card" role="dialog" aria-label="Что нового"><div class="dhn-head"><b>Что нового в DIR HELPER</b><button class="dhn-x" title="Закрыть" aria-label="Закрыть">✕</button></div><div class="dhn-body">` +
    DH_CHANGELOG.map((r) => `<div class="dhn-ver"><h4>Версия ${esc(r.v)} <span>${esc(r.d)}</span>${r.v === cur ? '<em>у вас</em>' : ''}</h4><ul>${r.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('') + '</div>' +
    `<div class="dhn-foot"><button class="dhn-upd" title="Проверить и установить новую версию">⟳ Обновить</button><span class="dhn-msg">Сейчас у вас версия ${esc(cur)}</span></div></div>`;
  // «Обновить»: то же, что about:addons → ⚙ → «Проверить наличие обновлений» (саму about:addons дополнениям открывать Firefox не даёт)
  const ub = w.querySelector('.dhn-upd'), um = w.querySelector('.dhn-msg');
  ub.onclick = async () => {
    ub.disabled = true; um.textContent = 'Проверяю…';
    const r = await browser.runtime.sendMessage({ dhUpdate: true }).catch((e) => ({ status: 'error', text: e.message }));
    ub.disabled = false;
    um.textContent = (r && r.text) || 'Не удалось проверить';
    if (r && r.link) um.append(' · ', dhUpdLink(doc, r, () => { um.textContent = 'Firefox спросит про установку: «Продолжить установку» → «Добавить». Настройки сохранятся.'; }));
    if (!r || r.status === 'error') {
      const a = doc.createElement('a'); a.textContent = 'Обновить вручную';
      a.title = 'Скопирует адрес about:addons — вставьте его в адресную строку, затем ⚙ → «Проверить наличие обновлений»';
      a.onclick = async () => { try { await navigator.clipboard.writeText('about:addons'); } catch (e) {} um.textContent = 'Адрес about:addons скопирован: вставьте его в адресную строку (Ctrl+V, Enter), затем ⚙ → «Проверить наличие обновлений».'; };
      um.append(' · ', a);
    }
  };
  // уже известно, что вышла новая версия, — сразу показываем ссылку «Установить»
  try { browser.storage.local.get('dhUpdAvail').then((r) => { if (r.dhUpdAvail && r.dhUpdAvail !== cur) ub.onclick(); }).catch(() => {}); } catch (e) {}
  const close = () => { w.remove(); doc.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('.dhn-x')) close(); });
  doc.addEventListener('keydown', onKey, true);
  (doc.body || doc.documentElement).appendChild(w);
  try { browser.storage.local.set({ dhNewsSeen: DH_CHANGELOG[0].v }); } catch (e) {}
}
// ссылка «⬇ Установить X» на подписанный .xpi. Firefox ставит дополнение, только если переход начат кликом
// человека — поэтому ставим не сами (tabs.create), а этой ссылкой. r — ответ dhUpdate: { next, link }.
function dhUpdLink(doc, r, onGo) {
  const a = doc.createElement('a');
  a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; a.className = 'dh-upd-go';
  a.textContent = `⬇ Установить ${r.next}`;
  a.title = 'Firefox спросит про установку — нажмите «Продолжить установку» и «Добавить». Настройки и токен сохранятся.';
  a.style.cssText = 'font-weight:600;cursor:pointer;text-decoration:underline';
  a.addEventListener('click', (e) => { e.stopPropagation(); if (onGo) setTimeout(onGo, 0); });
  return a;
}
// всплывашка внизу справа; если вышла новая версия — со ссылкой «Установить» (живёт дольше, чтобы успеть нажать)
function dhUpdToast(doc, r) {
  const t = doc.createElement('div'); t.className = 'dh-toast';
  t.textContent = (r && r.text) || 'Ошибка проверки';
  if (r && r.link) { t.append(' · ', dhUpdLink(doc, r, () => t.remove())); t.style.color = '#fff'; t.querySelector('a').style.color = '#8ff0b5'; }
  (doc.body || doc.documentElement).appendChild(t); setTimeout(() => t.remove(), r && r.link ? 20000 : 4500);
}
// красная точка на кнопке, пока последние новости не открывали или пока есть неустановленное обновление
function dhNewsDot(btn) {
  let seen = '', avail = '';
  const upd = () => {
    let cur = ''; try { cur = browser.runtime.getManifest().version; } catch (e) {}
    const hasUpd = !!avail && avail !== cur;
    btn.classList.toggle('dhb-new-unseen', seen !== DH_CHANGELOG[0].v || hasUpd);
    if (hasUpd) btn.title = `Вышла версия ${avail} — нажмите, затем «⟳ Обновить»`;
  };
  try {
    browser.storage.local.get(['dhNewsSeen', 'dhUpdAvail']).then((r) => { seen = r.dhNewsSeen; avail = r.dhUpdAvail || ''; upd(); }).catch(() => {});
    browser.storage.onChanged.addListener((ch) => {
      if (ch.dhNewsSeen) seen = ch.dhNewsSeen.newValue;
      if (ch.dhUpdAvail) avail = ch.dhUpdAvail.newValue || '';
      if (ch.dhNewsSeen || ch.dhUpdAvail) upd();
    });
  } catch (e) {}
}
