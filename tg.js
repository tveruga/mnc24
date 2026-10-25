// ================= Telegram-бот DIR HELPER =================
// Хранит: tg = { token, owner, chats: { фамилия: { id, title } }, offset, opts: { notifyNew, toMaster, sumToMaster } }
const TG_ALIAS = { 'сергин': 'серегин', 'трохов': 'тархов', 'аресений': 'арсений' };
const tgNorm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
let TG = { token: '', owner: null, chats: {}, offset: 0, opts: { notifyNew: true, toMaster: true, sumToMaster: true } };
let tgPolling = false;
// несколько копий DIR HELPER на одном боте: работает одна «главная», остальные молчат
let tgOkSince = 0, tgLastConflict = 0, tgConflicts = [];
const tgLeader = () => tgOkSince && Date.now() - tgOkSince > 120000;
// бот (приём команд, уведомления, напоминания) работает только на компьютере, где это включено в настройках
let TG_HERE = true;
browser.storage.local.get('tgHere').then((r) => { TG_HERE = r.tgHere !== false; }).catch(() => {});
browser.storage.onChanged.addListener((ch) => { if (ch.tgHere) TG_HERE = ch.tgHere.newValue !== false; });
const tgActive = () => TG_HERE && Date.now() - tgLastConflict > 15 * 60e3;

// бот и владелец, указанные при сборке (можно поменять в настройках ⚙)
const TG_DEFAULT = { token: '' /* токен хранится только в настройках Firefox */, owner: 7191750835, users: [7191750835, 7892790601] };
async function tgLoad() {
  const r = await browser.storage.local.get('tg');
  if (r.tg && r.tg.chats && !r.tg.groups) { r.tg.groups = {}; Object.values(r.tg.chats).forEach((c) => { r.tg.groups[c.id] = { title: c.title, person: c.title.replace(/^мнч\s+/i, '') }; }); }
  const saved = r.tg || {};
  if (!saved.token) saved.token = TG_DEFAULT.token;
  if (!saved.owner) saved.owner = TG_DEFAULT.owner;
  saved.users = [...new Set([...(saved.users || []), ...TG_DEFAULT.users, saved.owner].filter(Boolean).map(Number))];
  const off = Math.max(TG.offset || 0, saved.offset || 0); TG = Object.assign(TG, saved); TG.offset = off; TG.opts = Object.assign({ notifyNew: true, toMaster: true, sumToMaster: true }, TG.opts || {}); return TG; }
const tgSave = () => browser.storage.local.set({ tg: TG });
async function tgApi(method, params) {
  if (!TG.token) throw new Error('нет токена бота');
  const r = await fetch(`https://api.telegram.org/bot${TG.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}) });
  const j = await r.json();
  if (!j.ok && j.error_code === 409) { const e = new Error('бот одновременно запущен в другом Firefox (другой компьютер или вторая копия расширения) — оставьте DIR HELPER только в одном месте'); e.conflict = true; throw e; }
  if (!j.ok) { const e = new Error(j.description || 'ошибка Telegram'); e.code = j.error_code; e.params = j.parameters || {}; throw e; }
  if (!j.ok) throw new Error(j.error_code === 409 ? 'бот одновременно запущен в другом Firefox (другой компьютер или вторая копия расширения) — оставьте DIR HELPER только в одном месте' : (j.description || 'ошибка Telegram'));
  return j.result;
}
const MENU = { keyboard: [[{ text: '⏳ Ждут' }, { text: '📊 Сегодня' }, { text: '📅 Месяц' }], [{ text: '🔄 Статус' }, { text: '✅ Провести' }, { text: '💰 Сдача' }], [{ text: '👥 Группы' }, { text: '⚙️ Настройки' }, { text: '❓ Помощь' }]], resize_keyboard: true, is_persistent: true };
const tgSend = (chat_id, text, markup) => tgApi('sendMessage', Object.assign({ chat_id, text: String(text).slice(0, 4000), disable_web_page_preview: true }, markup ? { reply_markup: markup } : {})).catch(() => null);
async function tgToGroup(chatId, text) {
  const send = (id) => tgApi('sendMessage', { chat_id: id, text: String(text).slice(0, 4000), disable_web_page_preview: true });
  try { await send(chatId); return { ok: true }; }
  catch (e) {
    const nid = e.params && e.params.migrate_to_chat_id;
    if (nid) {                                   // группа стала супергруппой — новый номер
      TG.groups = TG.groups || {};
      if (TG.groups[chatId]) { TG.groups[nid] = TG.groups[chatId]; delete TG.groups[chatId]; await tgSave(); }
      try { await send(nid); return { ok: true }; } catch (e2) { return { ok: false, err: e2.message }; }
    }
    const why = /not enough rights|have no rights/i.test(e.message) ? 'у бота нет права писать в группе — сделайте его админом с правом «Отправка сообщений»'
      : /kicked|not a member|chat not found/i.test(e.message) ? 'бота нет в группе (удалён) — добавьте заново и напишите /start'
      : e.message;
    return { ok: false, err: why };
  }
}
const tgUsers = () => (TG.users && TG.users.length ? TG.users : [TG.owner]).filter(Boolean);
const tgOwner = (text, markup) => Promise.all(tgUsers().map((u) => tgSend(u, text, markup)));
let REPLY_TO = null; // кому отвечаем на команду
const tgReply = (text, markup) => REPLY_TO ? tgSend(REPLY_TO, text, markup) : tgOwner(text, markup);

// чат мастера по фамилии (из названия группы «МНЧ Фамилия Имя …»)
// ---- группы мастеров ↔ мастера CRM ----
// TG.groups = { chatId: { title, person, empId, how: 'name'|'free'|'manual' } }
const GROUP_SKIP = /красноярск|электроярск|дисп|админ|групп|офис|team|команд|мастера|общ|чат/i;
const cyr = (t) => tgNorm(t).replace(/[^a-zа-я ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
}
// насколько имя группы похоже на мастера CRM (0 — не похоже)
function nameScore(person, crmName) {
  const A = cyr(person).split(' ').filter(Boolean), B = cyr(crmName).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  const near = (x, y) => { x = TG_ALIAS[x] || x; y = TG_ALIAS[y] || y; if (x === y) return 1; if (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4))) && lev(x, y) <= 3) return 0.85; return lev(x, y) <= (Math.min(x.length, y.length) > 5 ? 2 : 1) ? 0.8 : 0; };
  let best = 0;
  for (const a of A) for (const b of B) { const sc = near(a, b); if (sc && a.length >= 3) best = Math.max(best, sc + (B.indexOf(b) === 0 ? 0.3 : 0)); }
  if (!best) return 0;
  // второе слово (имя) совпало — ещё увереннее
  const rest = A.filter((x) => B.some((y) => near(x, y))).length;
  return best + (rest >= 2 ? 0.5 : 0);
}
// запоминаем Telegram-аккаунт мастера в его группе (кто пишет в группе, кроме директора и ботов)
const IGNORE_USERS = ['tveruga'];
// кто может вызывать /тест в группах мастеров
const tgTester = (from) => !!(from && (tgUsers().includes(from.id) || (from.username && String(from.username).toLowerCase() === 'tveruga')));
const tgIgnored = (from) => !!(from && from.username && IGNORE_USERS.includes(String(from.username).toLowerCase()));
function tgLearnMember(chat, from) {
  if (!chat || !from || from.is_bot || tgUsers().includes(from.id) || tgIgnored(from)) return;
  const g = TG.groups && TG.groups[chat.id];
  if (!g) return;
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
  const score = nameScore(g.person, name + ' ' + (from.username || ''));
  const cur = g.tgUser;
  // перезаписываем, только если новый человек похож на мастера по имени не хуже прежнего
  if (cur && cur.id !== from.id && (cur.score || 0) > score) return;
  if (cur && cur.id === from.id && cur.username === from.username && cur.name === name) return;
  g.tgUser = { id: from.id, username: from.username || '', name, score };
  tgSave(); tgPushGroups();
}
// тегнуть мастера в группе: «@ник, Пиши принял»
async function tgAskAccept(chatId, customTail, reqId) {
  const g = (TG.groups || {})[chatId] || {};
  if (g.tgUser && tgIgnored(g.tgUser)) { delete g.tgUser; tgSave(); }
  const u = g.tgUser;
  const tail = customTail || cfg().tAccept;
  const kb = reqId ? { reply_markup: { inline_keyboard: [[{ text: '✅ Принял', callback_data: 'ac:' + reqId }]] } } : {};
  try {
    if (u && u.username) return await tgApi('sendMessage', Object.assign({ chat_id: chatId, text: `@${u.username} ${tail}` }, kb));
    if (u && u.id) { const nm = u.name || g.person || 'Мастер'; return await tgApi('sendMessage', Object.assign({ chat_id: chatId, text: `${nm} ${tail}`, entities: [{ type: 'text_mention', offset: 0, length: nm.length, user: { id: u.id } }] }, kb)); }
    return await tgApi('sendMessage', Object.assign({ chat_id: chatId, text: tail }, kb));
  } catch (e) { return null; }
}
// ===== /тест в группе мастера: кнопки проверки реакций бота (CRM не меняется) =====
const TEST_KB = { inline_keyboard: [
  [{ text: '📨 Заявка мастеру', callback_data: 't:req' }, { text: '✅ Принял', callback_data: 't:acc' }],
  [{ text: '🔧 В работе', callback_data: 't:work' }, { text: '💵 Сдал 1000', callback_data: 't:paid' }],
  [{ text: '☀️ Утро', callback_data: 't:morn' }, { text: '⏰ Напоминание', callback_data: 't:rem' }],
  [{ text: '📊 /стат', callback_data: 't:stat' }, { text: '💰 /сдача', callback_data: 't:sd' }]] };
async function tgTestPanel(chat) {
  const g = (TG.groups || {})[chat.id];
  const who = g ? g.person + (g.tgUser ? ` · тег: ${g.tgUser.username ? '@' + g.tgUser.username : g.tgUser.name}` : ' · тег: не известен') : ((TG.common || {})[chat.id] ? 'общий чат' : 'группа не привязана');
  return tgSend(chat.id, `🧪 Проверка бота — ${who}\nКнопки показывают, что ответит бот. В CRM ничего не меняется.`, TEST_KB);
}
async function tgTestCb(q) {
  const chat = q.message.chat.id, a = q.data, g = (TG.groups || {})[chat] || {};
  tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  const T = (t, kb) => tgSend(chat, '🧪 ' + t, kb);
  if (a === 't:req') { const id = (g.lastReq && g.lastReq.id) || '1000000'; const tag = g.tgUser ? (g.tgUser.username ? '@' + g.tgUser.username : g.tgUser.name) : 'мастер'; return T(`Так мастер получает заявку №${id} (текст из CRM), затем сообщение:\n«${tag} Пиши принял» (в тесте мастер не тегается)`, { inline_keyboard: [[{ text: '✅ Принял', callback_data: 'ta:acc' }]] }); }
  if (a === 't:acc' || a === 'ta:acc') return T(cfg().tWork);
  if (a === 't:work') {
    const rows = await listRows().catch(() => []);
    const mine = rows.filter((r) => /^в пути/i.test(r.st) && r.master && g.person && nameScore(g.person, r.master) >= 1);
    const last = g.lastReq && g.lastReq.id;
    const id = last && (!rows.find((r) => r.id === last) || /^в пути/i.test((rows.find((r) => r.id === last) || {}).st)) ? last : (mine.length === 1 ? mine[0].id : null);
    return T(id ? `На «В работе» бот поставил бы заявку №${id} и ответил: ✅ №${id} — статус «В работе»` : (mine.length > 1 ? `Несколько заявок «В пути» (${mine.map((r) => '№' + r.id).join(', ')}) — бот попросит номер` : 'Заявки «В пути» у этого мастера нет — бот попросит номер'));
  }
  if (a === 't:paid') return T('🕓 Сдача 1 000 р. — ждёт подтверждения директора\n(директору пришли бы кнопки «Подтвердить» / «Не сдал»)');
  if (a === 't:morn') return T(cfg().tMorning);
  if (a === 't:rem') return T(`Через 10 мин без «Принял»: «№… — Пиши принял» с кнопкой, через 20 мин — сообщение директору`);
  if (a === 't:stat') return (TG.common || {})[chat] ? tgDayStat({ id: chat }) : tgGroupStat(q.message.chat);
  if (a === 't:sd') return tgGroupSdacha(q.message.chat);
}
// мастер нажал «✅ Принял» под заявкой в своей группе
async function tgAcceptBtn(q) {
  const id = q.data.slice(3), chat = q.message.chat.id;
  const who = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ') || q.from.username || 'мастер';
  const g = (TG.groups || {})[chat] || {};
  tgApi('answerCallbackQuery', { callback_query_id: q.id, text: '✅ Принято' }).catch(() => {});
  tgApi('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: `✅ ${who} принял заявку №${id}` }).catch(() => {});
  await ctlAccepted(chat).catch(() => {});
  if (g.lastReq) { g.lastReq.acc = Date.now(); tgSave(); }
  tgSend(chat, cfg().tWork);
}
function tgLearnChat(chat, announce) {
  if (!chat || !chat.title || chat.type === 'private' || chat.type === 'channel') return;
  const person = chat.title.replace(/^\s*мнч[\s_\-:|.]*/i, '').trim();
  if ((TG.common || {})[chat.id]) { if (announce) tgSend(chat.id, 'ℹ️ Общий чат мастеров: /стат — статистика за день.'); return; }
  if (!person || GROUP_SKIP.test(person)) { if (announce) tgSend(chat.id, 'ℹ️ Общий чат мастеров: /стат — статистика за день.\n(Если это группа одного мастера — назовите её «МНЧ Фамилия Имя».)'); return; }
  TG.groups = TG.groups || {};
  const g = TG.groups[chat.id] || {};
  const isNew = !TG.groups[chat.id];
  if (g.title !== chat.title) { if (g.how !== 'manual') { delete g.empId; delete g.how; } }
  TG.groups[chat.id] = Object.assign(g, { title: chat.title, person });
  tgSave();
  tgRelink().then(async () => {
    if (!(announce || isNew)) return;
    const ms = await tgMasters();
    const gg = TG.groups[chat.id] || {};
    const crm = (ms.find((m) => String(m.id) === String(gg.empId)) || {}).name;
    tgSend(chat.id, `✅ DIR HELPER: группа привязана — ${person}` + (crm ? (gg.how === 'free' ? `\nВ CRM: свободный аккаунт «${crm}»` : `\nВ CRM: ${crm}`) : '\n(мастер CRM подберётся, когда в CRM откроют любую заявку)'));
  });
}
// ---- общая память групп для всех копий DIR HELPER: закреплённое служебное сообщение у владельца ----
const SYNC_MARK = '📌 DIR HELPER · группы мастеров (служебное, не удаляйте)';
let syncPulledAt = 0, syncPushT = null;
async function tgPullGroups(force) {
  if (!TG.owner || (!force && Date.now() - syncPulledAt < 60000)) return;
  syncPulledAt = Date.now();
  try {
    const ch = await tgApi('getChat', { chat_id: TG.owner });
    const pm = ch.pinned_message;
    if (!pm || !pm.text || !pm.text.startsWith(SYNC_MARK)) return;
    TG.syncMsg = pm.message_id;
    const data = JSON.parse(pm.text.slice(pm.text.indexOf('{')));
    TG.groups = TG.groups || {};
    Object.entries(data).forEach(([cid, v]) => {
      const g = TG.groups[cid] || {};
      if (!g.title) g.title = v.t; if (!g.person) g.person = v.p;
      if (v.e && (!g.empId || v.h === 'manual')) { g.empId = String(v.e); g.how = v.h || g.how || 'name'; }
      TG.groups[cid] = g;
    });
    await tgSave();
  } catch (e) {}
}
function tgPushGroups() {
  clearTimeout(syncPushT);
  syncPushT = setTimeout(async () => {
    if (!TG.owner) return;
    const data = {}; Object.entries(TG.groups || {}).forEach(([cid, g]) => { data[cid] = { t: g.title, p: g.person, e: g.empId || '', h: g.how || '' }; });
    const text = SYNC_MARK + '\n' + JSON.stringify(data);
    try {
      if (TG.syncMsg) { try { await tgApi('editMessageText', { chat_id: TG.owner, message_id: TG.syncMsg, text }); return; } catch (e) { if (/not modified/i.test(e.message)) return; } }
      const m = await tgApi('sendMessage', { chat_id: TG.owner, text, disable_notification: true });
      TG.syncMsg = m.message_id; await tgSave();
      await tgApi('pinChatMessage', { chat_id: TG.owner, message_id: m.message_id, disable_notification: true }).catch(() => {});
    } catch (e) {}
  }, 1500);
}
// автопривязка: похожее имя → этот мастер; нет в базе → свободный мастер без группы
async function tgRelink() {
  await tgPullGroups();
  const ms = await tgMasters(); if (!ms.length) return;
  TG.groups = TG.groups || {};
  const G = Object.entries(TG.groups);
  const taken = new Set(G.filter(([, g]) => g.empId && (g.how === 'manual' || g.how === 'name')).map(([, g]) => String(g.empId)));
  // 1) по имени
  const pairs = [];
  G.forEach(([cid, g]) => { if (g.how === 'manual' || g.how === 'name') return; ms.forEach((m) => { const sc = nameScore(g.person, m.name); if (sc >= 1) pairs.push([sc, cid, m]); }); });
  pairs.sort((a, b) => b[0] - a[0]).forEach(([, cid, m]) => { const g = TG.groups[cid]; if ((g.how === 'name') || taken.has(String(m.id))) return; g.empId = String(m.id); g.how = 'name'; taken.add(String(m.id)); });
  // 2) свободные мастера — тем, кого нет в базе
  G.forEach(([, g]) => { if (g.how === 'free' && g.empId && !taken.has(String(g.empId))) taken.add(String(g.empId)); });
  const free = ms.filter((m) => !taken.has(String(m.id)));
  G.forEach(([, g]) => { if (g.empId && g.how) return; const f = free.shift(); if (f) { g.empId = String(f.id); g.how = 'free'; taken.add(String(f.id)); } });
  await tgSave();
  tgPushGroups();
}
// группа, куда слать текст заявки: по ID мастера CRM (или по имени)
function tgMasterChat(name, empId) {
  const G = Object.entries(TG.groups || {});
  let hit = empId ? G.find(([, g]) => String(g.empId) === String(empId)) : null;
  if (!hit && name) { let best = null, bs = 0; G.forEach(([cid, g]) => { const sc = nameScore(g.person, name); if (sc > bs) { bs = sc; best = [cid, g]; } }); if (bs >= 1) hit = best; }
  return hit ? { id: Number(hit[0]), title: hit[1].title, person: hit[1].person } : null;
}

// ---- команды из личного чата директора ----
async function crmTab() {
  let tabs = await browser.tabs.query({ url: '*://*.mnc-lead-centre.ru/*' });
  let t = tabs.find((x) => !x.discarded) || tabs[0];
  if (!t) {
    t = await browser.tabs.create({ url: 'https://mnc-lead-centre.ru/admin/domain/customer-request/index', active: false });
    await new Promise((res) => { const h = (id, info) => { if (id === t.id && info.status === 'complete') { browser.tabs.onUpdated.removeListener(h); res(); } }; browser.tabs.onUpdated.addListener(h); setTimeout(res, 20000); });
    await new Promise((r) => setTimeout(r, 1500));
  }
  return t;
}
async function crmCall(msg, ms = 120000) {
  const t = await crmTab();
  const go = () => Promise.race([browser.tabs.sendMessage(t.id, msg), new Promise((_, rej) => setTimeout(() => rej(new Error('CRM не ответила за ' + Math.round(ms / 1000) + ' с')), ms))]);
  try {
    const r = await go();
    if (r === undefined) throw new Error('no-receiver');
    return r;
  } catch (e) {
    // вкладка CRM открыта со старой версией расширения — перезагружаем её и повторяем
    if (!/receiving end|no-receiver|could not establish/i.test(e.message)) throw e;
    await browser.tabs.reload(t.id);
    await new Promise((res) => { const h = (id, info) => { if (id === t.id && info.status === 'complete') { browser.tabs.onUpdated.removeListener(h); res(); } }; browser.tabs.onUpdated.addListener(h); setTimeout(res, 20000); });
    await new Promise((r) => setTimeout(r, 2000));
    const r = await go();
    if (r === undefined) throw new Error('вкладка CRM не отвечает — обновите её (F5)');
    return r;
  }
}
const LOCKED = /^(готов|отказ|отмен)/i;   // эти статусы менять нельзя
const ST_NAMES = { 0: 'Ожидает', 1: 'В пути', 2: 'В работе' };
const stBtn = (id, st) => ({ inline_keyboard: [[{ text: '⏳ Ожидает', callback_data: `c:${id}:0` }, { text: '🚕 В пути', callback_data: `c:${id}:1` }, { text: '🔧 В работе', callback_data: `c:${id}:2` }], [{ text: 'ℹ️ Инфо', callback_data: 'i:' + id }].concat(/^[^а-яё]*в\s*работе/i.test(String(st || '').replace(/[\u00a0\u200b-\u200f]/g, ' ')) ? [{ text: '✅ Провести заказ', callback_data: 'w:s:' + id }] : [])] });
const HELP = `DIR HELPER — кнопки внизу чата или команды:
/статус — сменить статус заявок на сегодня (Ожидает / В пути / В работе)
/статус 1087478 — сменить статус конкретной заявки
/группы — привязанные группы мастеров
/версия — какая версия отвечает
/стат — статистика мастера за месяц
/сдача — сколько каждый мастер должен сдать за сегодня
/настройки — тексты, время, напоминания
Поиск: просто напишите адрес, телефон, фамилию клиента или номер заявки
/провести — провести (закрыть) заявку: сумма, фото БСО, отзыв, ЗПЧ
/провести 1087208 — провести конкретную заявку

В группе мастера: /стат — его статистика, /сдача — его сдача за сегодня, «Сдал 3000» — сдача денег (вы подтверждаете)
/ждет — ожидающие заявки на сегодня
/сегодня — показатели за сегодня
/месяц — показатели за месяц`;

// заявка на сегодня? (по «Время заявки»: 23.10.26 10:00)
function isToday(time) {
  const t = String(time || '');
  const n = new Date();
  let m = t.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return +m[1] === n.getDate() && +m[2] === n.getMonth() + 1 && y === n.getFullYear(); }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return +m[3] === n.getDate() && +m[2] === n.getMonth() + 1 && +m[1] === n.getFullYear();
  return false;
}
const assignBtn = (id) => ({ inline_keyboard: [[{ text: '👷 Отдать мастеру', callback_data: 'a:' + id }, { text: 'ℹ️ Инфо', callback_data: 'i:' + id }]] });
async function tgMasters() {
  const r = await browser.storage.local.get(['masters', 'mastersAt']);
  let list = r.masters || [];
  if (!list.length || !r.mastersAt || Date.now() - r.mastersAt > 6 * 3600e3) {
    try {
      const lr = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/index', { credentials: 'include', cache: 'no-store' });
      const ld = new DOMParser().parseFromString(await lr.text(), 'text/html');
      const id = ((ld.querySelector('table tbody tr td') || {}).textContent || '').match(/\d{5,}/);
      if (id) {
        const ur = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/update?id=' + id[0], { credentials: 'include', cache: 'no-store' });
        const ud = new DOMParser().parseFromString(await ur.text(), 'text/html');
        const sel = ud.querySelector('[name="CustomerRequest[employee_id]"]');
        const got = sel ? [...sel.options].filter((o) => o.value && o.text.trim()).map((o) => ({ id: o.value, name: o.text.trim() })) : [];
        if (got.length) { list = got; await browser.storage.local.set({ masters: got, mastersAt: Date.now() }); }
      }
    } catch (e) {}
  }
  return list.map((m) => ({ id: m.id, name: String(m.name).replace(/\s*\(.*$/, '').trim() })).filter((m) => m.name);
}
async function tgCommand(text) {
  const t = text.trim();
  if (/^\/(start|help|помощь)|^❓/i.test(t)) return tgReply(HELP, MENU);
  if (/^\/(ждет|ждёт|ожидает)|^⏳/i.test(t)) {
    const all = await waitingRows();
    const rows = all.filter((r) => isToday(r.time));
    const other = all.length - rows.length;
    if (!rows.length) return tgReply('На сегодня ожидающих заявок нет ✓' + (other ? `\n(на другие дни ожидает: ${other})` : ''), MENU);
    await tgReply(`⏳ Ожидает сегодня: ${rows.length}` + (other ? ` · на другие дни: ${other}` : ''), MENU);
    for (const r of rows.slice(0, 15)) await tgReply(`№${r.id}${r.time ? ' · 🕒 ' + r.time : ''}${r.type ? ' · ' + r.type : ''}${r.addr ? '\n📍 ' + r.addr : ''}${r.client ? '\n👤 ' + r.client : ''}`, assignBtn(r.id));
    return;
  }
  let m;
  if ((m = t.match(/^(?:\/(?:статус|status)(?:@\w+)?|🔄\s*статус)(?:\s+(\d{5,}))?\s*$/i))) {
    if (m[1]) { const cur = await reqStatus(m[1]); return tgReply(`🔄 №${m[1]} · ${cur || '?'}\n\nКакой статус поставить? (Готов, Отказ и Отмена не меняются)`, stBtn(m[1], cur)); }
    const rows = (await listRows()).filter((r) => isToday(r.time) && !LOCKED.test(r.st));
    if (!rows.length) return tgReply('На сегодня нет заявок, которым можно сменить статус.\nДругой день: /статус 1087478', MENU);
    await tgReply(`🔄 Заявки на сегодня: ${rows.length}\nГотов, Отказ и Отмена не показаны — их менять нельзя.`, MENU);
    const show = rows.slice(0, 20);
    await Promise.all(show.filter((r) => !r.master).map(async (r) => { r.master = await reqMaster(r.id); }));
    for (const r of show) await tgReply(`№${r.id} · ${r.st || '—'}\n👷 ${r.master || 'мастер не назначен'}${r.time ? '\n🕒 ' + r.time : ''}${r.addr ? '\n📍 ' + r.addr : ''}`, stBtn(r.id, r.st));
    return;
  }
  if ((m = t.match(/^(?:\/(?:провести|закрыть|close)(?:@\w+)?|✅\s*провести)(?:\s+(\d{5,}))?\s*$/i))) {
    if (m[1]) return wizStartChecked(REPLY_TO || TG.owner, m[1]);
    const rows = (await todayRows()).filter((r) => /^в работе/i.test(r.st));
    if (!rows.length) return tgReply('Нет сегодняшних заявок «В работе».\nДругая заявка: /провести 1087208', MENU);
    await tgReply(`✅ Какую заявку провести? (${rows.length})`, MENU);
    for (const r of rows.slice(0, 20)) await tgReply(`№${r.id} · ${r.st}${r.master ? '\n👷 ' + r.master : ''}${r.addr ? '\n📍 ' + r.addr : ''}`, { inline_keyboard: [[{ text: '✅ Провести заказ', callback_data: 'w:s:' + r.id }, { text: 'ℹ️ Инфо', callback_data: 'i:' + r.id }]] });
    return;
  }
  if (/^\/(сдача|sdacha)(@\w+)?(\s|$)|^💰/i.test(t)) {
    tgReply('⏳ Считаю сдачу за сегодня…');
    return tgReply(await ctlCashReport(), MENU);
  }
  if (/^\/(стат|stat)(\s|$)/i.test(t)) {
    await tgRelink();
    const people = Object.values(TG.groups || {}).filter((g) => g.empId).sort((x, y) => x.person.localeCompare(y.person, 'ru'));
    const list = people.length ? people.map((g) => ({ id: g.empId, name: g.person })) : (await tgMasters());
    if (!list.length) return tgReply('Список мастеров пуст', MENU);
    const rows = []; for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).map((x) => ({ text: x.name.split(' ').slice(0, 2).join(' '), callback_data: 'st:' + x.id })));
    return tgReply('📊 Чью статистику за месяц показать?', { inline_keyboard: rows });
  }
  if (/^\/(код|code)(@\w+)?\s*$/i.test(t)) {
    const code = 'DH1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ token: TG.token, owner: TG.owner, users: TG.users, opts: TG.opts }))));
    const to = REPLY_TO || TG.owner;
    await tgReply('🔑 Код настроек для другого компьютера. Там: about:addons → DIR HELPER → Настройки → «Перенос на другой компьютер» → вставить → «Применить».\nКод содержит токен бота — никому не пересылайте. Это сообщение удалится через 5 минут.');
    const m = await tgSend(to, code);
    if (m) setTimeout(() => tgApi('deleteMessage', { chat_id: to, message_id: m.message_id }).catch(() => {}), 5 * 60e3);
    return;
  }
  if (/^\/(версия|version)/i.test(t)) {
    let inst = (await browser.storage.local.get('dhInstance')).dhInstance;
    if (!inst) { inst = Math.random().toString(36).slice(2, 7).toUpperCase(); browser.storage.local.set({ dhInstance: inst }); }
    return tgReply(`DIR HELPER ${browser.runtime.getManifest().version} · компьютер ${inst}\n(бот отвечает с этого компьютера)`, MENU);
  }
  if (/^\/(группы|groups)|^👥/i.test(t)) {
    await tgRelink();
    const ms = await tgMasters();
    const G = Object.values(TG.groups || {});
    if (!G.length) return tgReply('👥 Бот пока не знает ни одной группы мастера.\n\nЧто сделать:\n1) @BotFather → /mybots → бот → Bot Settings → Group Privacy → Turn off\n2) удалите бота из группы мастера и добавьте заново\n3) напишите в группе /start — бот ответит «✅ группа привязана»', MENU);
    const how = { name: '', free: ' · свободный аккаунт', manual: ' · вручную' };
    return tgReply('👥 Группы мастеров:\n\n' + G.map((g) => { const crm = (ms.find((m) => String(m.id) === String(g.empId)) || {}).name; return `• ${g.person} → ${crm ? crm + (how[g.how] || '') : 'нет мастера CRM'}\n   тег: ${g.tgUser ? (g.tgUser.username ? '@' + g.tgUser.username : g.tgUser.name) : '— (мастеру написать любое сообщение в группе)'}`; }).join('\n'), MENU);
  }
  if (/^\/(сегодня|месяц)|^📊|^📅/i.test(t)) {
    const month = /месяц|📅/i.test(t);
    tgReply('⏳ Собираю отчёт…');
    const r = await crmCall({ dhSummary: month ? 'month' : 'today' }).catch((e) => ({ err: e.message }));
    return tgReply(r && r.text ? r.text : '❌ ' + ((r && r.err) || 'нет данных'), MENU);
  }
  const cr = await cfgCommand(t); if (cr !== null) return cr;
  if (!/^\//.test(t)) return tgSearch(t);
  return tgReply('Не понял. Нажмите кнопку внизу или ❓ Помощь.', MENU);
}
// «ℹ️ Инфо»: текст заявки (как «Копировать информацию») во всплывающем окне
async function tgInfo(q) {
  const id = (q.data.match(/^i:(\d+)/) || [])[1];
  const r = await crmCall({ dhInfo: { id } }, 40000).catch((e) => ({ err: e.message }));
  const text = r && r.info ? r.info.trim() : '';
  if (!text) return tgApi('answerCallbackQuery', { callback_query_id: q.id, text: '❌ ' + ((r && r.err) || 'нет информации по заявке'), show_alert: true }).catch(() => {});
  // окно Telegram вмещает 200 символов — длинный текст дополнительно присылаем сообщением
  const short = text.length <= 200 ? text : text.slice(0, 196) + '…';
  await tgApi('answerCallbackQuery', { callback_query_id: q.id, text: short, show_alert: true }).catch(() => {});
  if (text.length > 200) tgApi('sendMessage', { chat_id: q.message.chat.id, text: `ℹ️ №${id}\n${text}`.slice(0, 4000), reply_to_message_id: q.message.message_id, allow_sending_without_reply: true, disable_web_page_preview: true }).catch(() => {});
}
// нажатия на кнопки под сообщениями
async function tgCallback(q) {
  // одно и то же нажатие никогда не выполняется дважды (даже после перезапуска Firefox)
  try {
    const st = (await browser.storage.local.get('tgCbDone')).tgCbDone || {};
    if (st[q.id]) return;
    st[q.id] = Date.now();
    Object.keys(st).forEach((k) => { if (Date.now() - st[k] > 2 * 864e5) delete st[k]; });
    await browser.storage.local.set({ tgCbDone: st });
  } catch (e) {}
  const chat = q.message.chat.id, mid = q.message.message_id, data = q.data || '';
  if (/^i:/.test(data)) return tgInfo(q);
  if (/^cf:/.test(data)) return cfgCallback(q);
  if (/^p[dn]:/.test(data)) { tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {}); return ctlPaidCb(q, (text, kb) => tgApi('editMessageText', Object.assign({ chat_id: q.message.chat.id, message_id: q.message.message_id, text }, kb ? { reply_markup: kb } : {})).catch(() => {})); }
  if (/^w:s:\d+$/.test(data)) { tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {}); return wizStartChecked(q.message.chat.id, data.slice(4)); }
  if (/^w:/.test(data)) { tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {}); return wizCallback(q, (text, kb) => tgApi('editMessageText', Object.assign({ chat_id: q.message.chat.id, message_id: q.message.message_id, text }, kb ? { reply_markup: kb } : {})).catch(() => {})); }
  tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  const edit = (text, kb) => tgApi('editMessageText', Object.assign({ chat_id: chat, message_id: mid, text }, kb ? { reply_markup: kb } : {})).catch(() => {});
  const base = q.message.text.split('\n\n👷')[0];
  let m;
  if ((m = data.match(/^a:(\d+)$/))) {
    await tgRelink();
    const ms = await tgMasters();
    const people = Object.values(TG.groups || {}).filter((g) => g.empId).map((g) => ({ id: g.empId, name: g.person })).sort((x, y) => x.name.localeCompare(y.name, 'ru'));
    const list = people.length ? people : ms;
    if (!list.length) return edit(base + '\n\n⚠️ Список мастеров ещё не загружен — откройте любую заявку в CRM');
    // загрузка: 🚕 в пути, 🔧 в работе; свободные — первыми
    let ld = null; if (cfg().onLoad) { await edit(base + '\n\n👷 Смотрю загрузку мастеров…'); ld = await masterLoad().catch(() => null); }
    const items = list.map((x) => { const l = ld ? ld(x.name) : null; const busy = l ? l.way + l.work : 0; return { x, l, busy }; });
    if (ld) items.sort((p, q2) => p.busy - q2.busy || p.x.name.localeCompare(q2.x.name, 'ru'));
    const lbl = ({ x, l }) => x.name.split(' ').slice(0, 2).join(' ') + (l ? (l.way || l.work ? ` · ${l.way ? '🚕' + l.way : ''}${l.work ? '🔧' + l.work : ''}` : ' · ✅') : '');
    const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map((it) => ({ text: lbl(it), callback_data: `m:${m[1]}:${it.x.id}` })));
    rows.push([{ text: '✕ Отмена', callback_data: 'x:' + m[1] }]);
    return edit(base + '\n\n👷 Кому отдать?' + (ld ? '\n✅ свободен · 🚕 в пути · 🔧 в работе' : ''), { inline_keyboard: rows });
  }
  if ((m = data.match(/^m:(\d+):(\d+)$/))) {
    const ms = await tgMasters(); const ch = tgMasterChat('', m[2]); const who = ch ? ch.person : ((ms.find((x) => x.id === m[2]) || {}).name || m[2]);
    return edit(base + `\n\n👷 ${who} — статус?`, { inline_keyboard: [[{ text: '⏳ Ожидает', callback_data: `s:${m[1]}:${m[2]}:0` }, { text: '🚕 В пути', callback_data: `s:${m[1]}:${m[2]}:1` }, { text: '🔧 В работе', callback_data: `s:${m[1]}:${m[2]}:2` }], [{ text: '← Назад', callback_data: 'a:' + m[1] }]] });
  }
  if ((m = data.match(/^s:(\d+):(\d+):(\d)$/))) {
    const st = ST_NAMES[m[3]] || 'В пути';
    if (tgBusy[m[1]] && Date.now() - tgBusy[m[1]] < 3 * 60e3) return; // уже отдаётся
    tgBusy[m[1]] = Date.now();
    const ms = await tgMasters(); const ch = tgMasterChat('', m[2]); const who = ch ? ch.person : ((ms.find((x) => x.id === m[2]) || {}).name || m[2]);
    await edit(base + `\n\n⏳ Отдаю: ${who}, ${st}…`);
    REPLY_TO = chat;
    const r = await crmCall({ dhAssign: { id: m[1], empId: m[2], st } }).catch((e) => ({ err: e.message }));
    delete tgBusy[m[1]];
    return edit(base + (r && r.err ? `\n\n❌ ${r.err}` : `\n\n✅ Отдано: ${who}, ${st}`), r && r.err ? assignBtn(m[1]) : stBtn(m[1], st));
  }
  if ((m = data.match(/^c:(\d+):(\d)$/))) {
    // сначала спрашиваем подтверждение — статус меняется только по явному «Да»
    const st = ST_NAMES[m[2]] || 'В пути';
    const head = q.message.text.split('\n\n')[0];
    return edit(head + `\n\n❓ Поставить заявке №${m[1]} статус «${st}»?`, { inline_keyboard: [[{ text: `✅ Да, «${st}»`, callback_data: `cc:${m[1]}:${m[2]}` }, { text: '✕ Нет', callback_data: `cn:${m[1]}` }]] });
  }
  if ((m = data.match(/^cn:(\d+)$/))) { const head = q.message.text.split('\n\n')[0]; const cur = (head.match(/·\s*([^\n]+)/) || [])[1] || ''; return edit(head, stBtn(m[1], cur)); }
  if ((m = data.match(/^cc:(\d+):(\d)$/))) {
    const st = ST_NAMES[m[2]] || 'В пути';
    const key = 'c' + m[1];
    if (tgBusy[key] && Date.now() - tgBusy[key] < 3 * 60e3) return;
    tgBusy[key] = Date.now();
    const who = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ') || q.from.username || q.from.id;
    const head = q.message.text.split('\n\n')[0];
    await edit(head + `\n\n⏳ Ставлю «${st}»… (нажал: ${who})`);
    let r = await crmCall({ dhStatus: { id: m[1], st } }).catch((e) => ({ err: e.message }));
    // итоговая проверка по списку заявок CRM (независимо от расширения)
    const real = await reqStatus(m[1]);
    if ((!r || r.err) && real && stKey(real) === stKey(st)) r = { ok: true, cur: '', master: '' };
    if (r && !r.err && real && stKey(real) !== stKey(st)) r = { err: `CRM не сохранила: в списке заявок статус «${real}»` };
    delete tgBusy[key];
    if (!r || r.err) return edit(head + `\n\n❌ ${(r && r.err) || 'нет ответа от CRM'}`, r && r.err && /менять нельзя/.test(r.err) ? null : stBtn(m[1], real));
    if (r.same) return edit(head + `\n\n✅ Уже «${r.cur}»`, stBtn(m[1], r.cur));
    const extra = (r.via ? '\n(через «Выберите мастера» → «Ожидает», мастер возвращён)' : '') + (r.blocking && r.blocking.length ? `\n⚠️ CRM просит закрыть заказ №${r.blocking.join(', №')}` : '');
    if (String(q.from.id) !== String(TG.owner)) tgOwner(`ℹ️ ${who} поменял статус №${m[1]} → «${st}»`);
    return edit(head + `\n\n✅ №${m[1]}: ${r.cur ? r.cur + ' → ' : ''}${st}${r.master ? ' · ' + r.master : ''} (нажал: ${who})${extra}`, stBtn(m[1], st));
  }
  if ((m = data.match(/^x:(\d+)$/))) return edit(base, assignBtn(m[1]));
  if ((m = data.match(/^st:(\d+)$/))) {
    const ms = await tgMasters(); const crm = (ms.find((x) => String(x.id) === m[1]) || {}).name || '';
    const g = Object.values(TG.groups || {}).find((x) => String(x.empId) === m[1]);
    await edit('⏳ Считаю статистику…');
    const r = await crmCall({ dhMasterStat: { empId: m[1], name: crm, person: g ? g.person : crm } }).catch((e) => ({ err: e.message }));
    return edit(r && r.text ? r.text : '❌ ' + ((r && r.err) || 'нет данных'));
  }
}

const tgSeen = new Set();
const tgBusy = {};   // заявки, которые сейчас отдаются
async function tgPoll() {
  if (tgPolling) return; tgPolling = true;
  while (true) {
    await tgLoad();
    if (!TG.token || !TG_HERE) { await new Promise((r) => setTimeout(r, 10000)); continue; }
    try {
      const ups = await tgApi('getUpdates', { offset: TG.offset || 0, timeout: 25, allowed_updates: ['message', 'my_chat_member', 'channel_post', 'callback_query'] });
      if (!tgOkSince) tgOkSince = Date.now();
      // сразу запоминаем, что эти обновления получены — Telegram не пришлёт их повторно
      if (ups.length) { TG.offset = Math.max(TG.offset || 0, ups[ups.length - 1].update_id + 1); await tgSave(); }
      for (const u of ups) {
        if (tgSeen.has(u.update_id)) continue; tgSeen.add(u.update_id); if (tgSeen.size > 500) tgSeen.delete(tgSeen.values().next().value);
        if (u.callback_query && /^(t|ta):/.test(u.callback_query.data || '')) { if (tgTester(u.callback_query.from)) tgTestCb(u.callback_query).catch(() => {}); else tgApi('answerCallbackQuery', { callback_query_id: u.callback_query.id, text: '⛔ Только для директора' }).catch(() => {}); continue; }
        if (u.callback_query && /^ac:\d+$/.test(u.callback_query.data || '')) { if (!tgIgnored(u.callback_query.from)) tgAcceptBtn(u.callback_query).catch(() => {}); else tgApi('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {}); continue; }
        if (u.callback_query && /^(c|cc|cn|i|w|pd|pn):/.test(u.callback_query.data || '')) { if (tgUsers().includes(u.callback_query.from.id)) tgCallback(u.callback_query).catch(() => {}); continue; }
        if (u.callback_query) { if (tgUsers().includes(u.callback_query.from.id)) { REPLY_TO = u.callback_query.message.chat.id; await tgCallback(u.callback_query).catch(() => {}); REPLY_TO = null; } continue; }
        const msg = u.message || u.channel_post;
        if (u.my_chat_member) { const st = u.my_chat_member.new_chat_member && u.my_chat_member.new_chat_member.status; if (/left|kicked/.test(st || '')) { if (TG.groups) { delete TG.groups[u.my_chat_member.chat.id]; await tgSave(); tgPushGroups(); } } else tgLearnChat(u.my_chat_member.chat, true); }
        if (!msg) continue;
        if (msg.new_chat_title || msg.migrate_to_chat_id) { if (msg.migrate_to_chat_id && TG.groups && TG.groups[msg.chat.id]) { TG.groups[msg.migrate_to_chat_id] = TG.groups[msg.chat.id]; delete TG.groups[msg.chat.id]; await tgSave(); } }
        if (msg.chat && msg.chat.type !== 'private') {
          // @tveruga: обычные сообщения в группах мастеров игнорируем, команды (/…) выполняем
          if (/^\/(тест|test)(@\w+)?(\s|$)/i.test(msg.text || '')) { if (tgTester(msg.from)) tgTestPanel(msg.chat).catch(() => {}); continue; } // остальным — молчим
          if (tgIgnored(msg.from) && !/^\s*\//.test(msg.text || '')) continue;
          tgLearnMember(msg.chat, msg.from);
          if (msg.from && !msg.from.is_bot && TG.groups && TG.groups[msg.chat.id] && /^\s*сдал[аи]?\s+(\d[\d\s.,]*)/i.test(msg.text || '')) { const amt = sdNum((msg.text.match(/^\s*сдал[аи]?\s+(\d[\d\s.,]*)/i) || [])[1]); if (amt > 0) { ctlPaidMsg(msg, amt).catch(() => {}); continue; } }
          if (msg.from && !msg.from.is_bot && TG.groups && TG.groups[msg.chat.id] && /^\s*(принял|в\s*работе)/i.test(msg.text || '')) { tgGroupWork(msg).catch((e) => tgSend(msg.chat.id, '❌ ' + e.message)); continue; }
          // /общий — директор отмечает чат как общий (не группа мастера)
          if (/^\/(общий|common)(@\w+)?(\s|$)/i.test(msg.text || '') && tgUsers().includes(msg.from && msg.from.id)) { TG.common = TG.common || {}; TG.common[msg.chat.id] = msg.chat.title || true; if (TG.groups) delete TG.groups[msg.chat.id]; await tgSave(); tgPushGroups(); tgSend(msg.chat.id, '✅ Это общий чат мастеров. /стат — статистика за день.'); continue; }
          if ((TG.common || {})[msg.chat.id]) { if (/^\/(стат|stat)(@\w+)?(\s|$)/i.test(msg.text || '')) tgDayStat(msg.chat).catch((e) => tgSend(msg.chat.id, '❌ ' + e.message)); continue; }
          if (/^\/(сдача|sdacha)(@\w+)?(\s|$)/i.test(msg.text || '')) { tgGroupSdacha(msg.chat).catch((e) => tgSend(msg.chat.id, '❌ ' + e.message)); continue; }
          if (/^\/(стат|stat)(@\w+)?(\s|$)/i.test(msg.text || '')) { await tgGroupStat(msg.chat).catch((e) => tgSend(msg.chat.id, '❌ ' + e.message)); continue; }
          tgLearnChat(msg.chat, /^\/(start|привязать|bind)/i.test(msg.text || '')); continue;
        }
        if (!TG.owner && /^\/start/.test(msg.text || '')) { TG.owner = msg.chat.id; await tgSave(); await tgSend(TG.owner, '✅ DIR HELPER привязан к этому чату.\n\n' + HELP); continue; }
        if (!tgUsers().includes(msg.from && msg.from.id)) { await tgSend(msg.chat.id, '⛔ У вас нет доступа к этому боту.'); continue; }
        if (await wizMsg(msg).catch(() => false)) continue;
        REPLY_TO = msg.chat.id;
        if (msg.text) await tgCommand(msg.text).catch((e) => tgReply('❌ ' + e.message));
        REPLY_TO = null;
      }
      await tgSave();
      browser.storage.local.set({ tgDiag: { ok: Date.now(), err: '' } });
    } catch (e) {
      if (e.conflict) {
        if (tgLeader()) { await new Promise((r) => setTimeout(r, 300)); continue; } // главная — продолжает
        tgConflicts = tgConflicts.filter((t) => Date.now() - t < 5 * 60e3).concat(Date.now());
        if (tgConflicts.length >= 3) { tgLastConflict = Date.now(); tgOkSince = 0; } // постоянный конфликт — значит, есть другая копия
        browser.storage.local.set({ tgDiag: { ok: 0, err: e.message, at: Date.now() } });
        await new Promise((r) => setTimeout(r, tgConflicts.length >= 3 ? 60e3 : 3000));
        continue;
      }
      browser.storage.local.set({ tgDiag: { ok: 0, err: e.message, at: Date.now() } }); await new Promise((r) => setTimeout(r, 5000));
    }
  }
}


// ================= Проведение заявки через бота (пошагово) =================
const WIZ = {}; // chatId → { id, step, o, msg }
const WX = { text: '✕ Отмена', callback_data: 'w:x' };
const wizKb = (rows) => ({ inline_keyboard: rows.concat([[WX]]) });
const wizNum = (t) => String(t || '').replace(/[^\d]/g, '');
async function tgFileData(fileId) {
  const f = await tgApi('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${TG.token}/${f.file_path}`);
  const b = await r.blob();
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  const name = (f.file_path.split('/').pop() || 'photo.jpg');
  return { data, name: /\.(jpe?g|png|webp|heic)$/i.test(name) ? name : name + '.jpg', type: b.type && /^image\//.test(b.type) ? b.type : 'image/jpeg' };
}
const PH_STEP = { bso: ['bso_ph', '📄 Фото БСО'], revph: ['rev_ph', '⭐ Фото отзыва'], chk: ['chk_ph', '🧾 Фото чеков на ЗПЧ'] };
function wizAsk(chat) {
  const w = WIZ[chat]; if (!w) return;
  const h = `✅ Проведение №${w.id}\n\n`;
  const nxt = [[{ text: '➡️ Дальше', callback_data: 'w:n' }]];
  const ph = (k) => { const [key, title] = PH_STEP[k]; return tgSend(chat, h + `${title}: пришлите фото (можно несколько), затем «Дальше».\nДобавлено: ${w.o[key].length}`, wizKb(nxt)); };
  switch (w.step) {
    case 'sum': return tgSend(chat, h + '💳 Сколько оплатил клиент? Напишите число.', wizKb([]));
    case 'bso': return ph('bso');
    case 'bsohas': return tgSend(chat, h + '📄 БСО есть?', wizKb([[{ text: 'Есть', callback_data: 'w:b1' }, { text: 'Нет', callback_data: 'w:b0' }]]));
    case 'rev': return tgSend(chat, h + '⭐ Отзыв написан?', wizKb([[{ text: 'Да', callback_data: 'w:r1' }, { text: 'Нет', callback_data: 'w:r0' }, { text: 'Нет возможности', callback_data: 'w:r2' }]]));
    case 'revph': return ph('revph');
    case 'parts': return tgSend(chat, h + '🔩 Запчасти (ЗПЧ)?', wizKb([[{ text: 'Есть', callback_data: 'w:p1' }, { text: 'Нет', callback_data: 'w:p0' }]]));
    case 'pcost': return tgSend(chat, h + '🔩 Сумма ЗПЧ? Напишите число.', wizKb([]));
    case 'chk': return ph('chk');
    case 'confirm': {
      const o = w.o;
      const t = h + `Проверьте:\n💳 Оплачено клиентом: ${(+o.sum).toLocaleString('ru-RU')} р.\n📄 Фото БСО: ${o.bso_ph.length} · БСО: ${o.bsoHas}\n⭐ Отзыв: ${o.rev}${o.rev === 'Да' ? ` · фото: ${o.rev_ph.length}` : ''}\n🔩 ЗПЧ: ${o.parts}${o.parts === 'Есть' ? ` · ${(+o.pcost).toLocaleString('ru-RU')} р. · чеков: ${o.chk_ph.length}` : ''}`;
      return tgSend(chat, t, wizKb([[{ text: '✅ Провести', callback_data: 'w:go' }]]));
    }
  }
}
// провести можно только заявку в статусе «В работе»
async function wizStartChecked(chat, id) {
  const st = await reqStatus(id);
  if (!/^в работе/i.test(st)) return tgSend(chat, `⛔ №${id}: провести можно только заявку «В работе»` + (st ? ` (сейчас «${st}»)` : ' (не нашёл её в списке CRM)'));
  return wizStart(chat, id);
}
function wizStart(chat, id) {
  WIZ[chat] = { id: String(id), step: 'sum', o: { sum: '', bso_ph: [], rev_ph: [], chk_ph: [], bsoHas: 'Есть', rev: 'Нет', parts: 'Нет', pcost: '' } };
  return wizAsk(chat);
}
// текст или фото во время мастера проведения; true — сообщение обработано
async function wizMsg(msg) {
  const chat = msg.chat.id, w = WIZ[chat];
  if (!w) return false;
  const text = String(msg.text || '').trim();
  if (text && (/^\//.test(text) || /^(⏳|📊|📅|🔄|💰|👥|❓|✅ Провести)/.test(text))) { delete WIZ[chat]; return false; } // другая команда — выходим из мастера
  const photo = msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : (msg.document && /^image\//.test(msg.document.mime_type || '') ? msg.document.file_id : null);
  if (photo) {
    const st = PH_STEP[w.step];
    if (!st) { tgSend(chat, 'Сейчас фото не нужно — ответьте на вопрос выше.'); return true; }
    try { w.o[st[0]].push(await tgFileData(photo)); } catch (e) { tgSend(chat, '❌ Не скачал фото: ' + e.message); return true; }
    // одно сообщение-счётчик вместо ответа на каждое фото
    const t = `📷 ${st[1]}: добавлено ${w.o[st[0]].length}`;
    if (w.cnt && w.cnt.step === w.step) tgApi('editMessageText', { chat_id: chat, message_id: w.cnt.mid, text: t, reply_markup: wizKb([[{ text: '➡️ Дальше', callback_data: 'w:n' }]]) }).catch(() => {});
    else { const m = await tgSend(chat, t, wizKb([[{ text: '➡️ Дальше', callback_data: 'w:n' }]])); if (m) w.cnt = { step: w.step, mid: m.message_id }; }
    return true;
  }
  if (w.step === 'sum' || w.step === 'pcost') {
    const n = wizNum(text);
    if (!n) { tgSend(chat, 'Нужно число, например 3500'); return true; }
    if (w.step === 'sum') { w.o.sum = n; w.step = 'bso'; } else { w.o.pcost = n; w.step = 'chk'; }
    wizAsk(chat); return true;
  }
  tgSend(chat, 'Ответьте кнопками под вопросом выше или пришлите фото.');
  return true;
}
async function wizCallback(q, edit) {
  const chat = q.message.chat.id, w = WIZ[chat], a = q.data.slice(2);
  if (a === 'x') { delete WIZ[chat]; return edit(q.message.text + '\n\n✕ Проведение отменено'); }
  if (!w) return edit(q.message.text + '\n\n(устарело — начните заново)');
  const done = (t) => edit(q.message.text + (t ? '\n\n→ ' + t : ''));
  if (a === 'n') {
    if (w.step === 'bso') { done('дальше'); w.step = 'bsohas'; }
    else if (w.step === 'revph') { if (!w.o.rev_ph.length) return tgSend(chat, 'Пришлите хотя бы одно фото отзыва.'); done('дальше'); w.step = 'parts'; }
    else if (w.step === 'chk') { done('дальше'); w.step = 'confirm'; }
    else return;
    w.cnt = null; return wizAsk(chat);
  }
  if (/^b[01]$/.test(a) && w.step === 'bsohas') { w.o.bsoHas = a === 'b1' ? 'Есть' : 'Нет'; done(w.o.bsoHas); w.step = 'rev'; return wizAsk(chat); }
  if (/^r[012]$/.test(a) && w.step === 'rev') { w.o.rev = { r1: 'Да', r0: 'Нет', r2: 'Нет возможности' }[a]; done(w.o.rev); w.step = w.o.rev === 'Да' ? 'revph' : 'parts'; return wizAsk(chat); }
  if (/^p[01]$/.test(a) && w.step === 'parts') { w.o.parts = a === 'p1' ? 'Есть' : 'Нет'; done(w.o.parts); w.step = w.o.parts === 'Есть' ? 'pcost' : 'confirm'; return wizAsk(chat); }
  if (a === 'go' && w.step === 'confirm') {
    delete WIZ[chat];
    await edit(q.message.text + '\n\n⏳ Провожу заявку… (до 1–2 минут)');
    const r = await crmCall({ dhClose: { id: w.id, o: w.o } }, 240000).catch((e) => ({ err: e.message }));
    if (!r || r.err) return tgSend(chat, `❌ №${w.id} не проведена: ${(r && r.err) || 'нет ответа CRM'}`, { inline_keyboard: [[{ text: '🔁 Заново', callback_data: 'w:s:' + w.id }]] });
    return tgSend(chat, `✅ №${w.id} проведена${r.master ? ' · ' + r.master : ''}\n\n${r.out || ''}`);
  }
}

// ---- события из расширения ----
browser.runtime.onMessage.addListener(async (m) => {
  if (!m || !m.tg) return;
  await tgLoad();
  if (m.tg === 'assigned') {
    // мастеру заявка уходит только при статусе «В пути»
    if (!/^в пути/i.test(String(m.st || '').trim())) {
      (REPLY_TO ? tgReply : tgOwner)(`✅ №${m.id} → ${m.name}, ${m.st}\n(статус «${m.st}» — мастеру не отправлено)`);
      return { sent: false, waiting: true };
    }
    // одна и та же заявка тому же мастеру — только один раз за 30 минут
    const key = m.id + ':' + m.empId;
    const sentA = (await browser.storage.local.get('tgAssignSent')).tgAssignSent || {};
    Object.keys(sentA).forEach((k) => { if (Date.now() - sentA[k] > 864e5) delete sentA[k]; });
    if (sentA[key] && Date.now() - sentA[key] < 30 * 60e3) return { sent: true, dup: true };
    sentA[key] = Date.now(); await browser.storage.local.set({ tgAssignSent: sentA });
    await tgRelink();
    let chat = tgMasterChat(m.name, m.empId);
    if (!chat) { await tgPullGroups(true); await tgRelink(); chat = tgMasterChat(m.name, m.empId); }
    let res = { ok: false, err: chat ? '' : 'группа мастера не найдена — напишите в его группе /start (см. «👥 Группы»)' };
    if (TG.opts.toMaster && chat && m.info) res = await tgToGroup(chat.id, m.info);
    if (res.ok) { const c2 = tgMasterChat(m.name, m.empId) || chat; if (TG.groups[c2.id]) { TG.groups[c2.id].lastReq = { id: String(m.id), t: Date.now() }; tgSave(); } await tgAskAccept(c2.id, null, String(m.id)); ctlAssigned(String(m.id), c2.id, (TG.groups[c2.id] || {}).person || m.name).catch(() => {}); }
    if (!res.ok) { delete sentA[key]; await browser.storage.local.set({ tgAssignSent: sentA }); }
    const who = chat ? chat.person + (tgNorm(chat.person).split(' ')[0] !== tgNorm(m.name).split(' ')[0] ? ` (в CRM: ${m.name})` : '') : m.name;
    (REPLY_TO ? tgReply : tgOwner)(`✅ №${m.id} → ${who}, ${m.st}` + (TG.opts.toMaster ? (res.ok ? `\n📨 заявка отправлена в «${chat.title}»` : `\n⚠️ не отправлено мастеру: ${res.err}`) : ''));
    return { sent: res.ok };
  }
  if (m.tg === 'closed') return tgSumToMaster(m.id, m.out, m.master, m.empId);
  if (m.tg === 'relink') { await tgRelink(); return { ok: true }; }
  if (m.tg === 'setLink') { TG.groups = TG.groups || {}; const g = TG.groups[m.chatId]; if (g) { if (m.empId) { g.empId = String(m.empId); g.how = 'manual'; } else { delete g.empId; delete g.how; } await tgSave(); await tgRelink(); tgPushGroups(); } return { ok: true }; }
  if (m.tg === 'test') { try { const me = await tgApi('getMe'); return { ok: true, name: me.username }; } catch (e) { return { ok: false, err: e.message }; } }
});

// мастер в своей группе: «Принял» → подсказка; «В работе» → статус «В пути» → «В работе»
const tgWorkBusy = {};
async function tgGroupWork(msg) {
  const chatId = msg.chat.id, text = String(msg.text || '');
  const say = (t) => tgApi('sendMessage', { chat_id: chatId, text: t, reply_to_message_id: msg.message_id, allow_sending_without_reply: true }).catch(() => null);
  if (/^\s*принял/i.test(text)) { ctlAccepted(chatId).catch(() => {}); return say(cfg().tWork); }
  if (tgWorkBusy[chatId] && Date.now() - tgWorkBusy[chatId] < 2 * 60e3) return;
  tgWorkBusy[chatId] = Date.now();
  try {
    await tgRelink();
    const g = TG.groups[chatId] || {};
    const ms = await tgMasters();
    const crm = (ms.find((x) => String(x.id) === String(g.empId)) || {}).name || '';
    // какая заявка: номер в сообщении → последняя отправленная в группу → единственная «В пути» у этого мастера
    let id = (text.match(/\d{6,}/) || [])[0];
    const rows = await listRows();
    const mine = rows.filter((r) => /^в пути/i.test(r.st) && r.master && (nameScore(g.person, r.master) >= 1 || (crm && nameScore(crm, r.master) >= 1)));
    if (!id) {
      const last = g.lastReq && Date.now() - g.lastReq.t < 24 * 3600e3 ? g.lastReq.id : null;
      const lastRow = last && rows.find((r) => r.id === last);
      if (last && (!lastRow || /^в пути/i.test(lastRow.st))) id = last;
      else if (mine.length === 1) id = mine[0].id;
      else if (mine.length > 1) return say(`У тебя несколько заявок «В пути»: ${mine.map((r) => '№' + r.id).join(', ')}\nНапиши: В работе 1087208`);
      else return say('Не нашёл твою заявку в статусе «В пути». Напиши номер: В работе 1087208');
    }
    let r = await crmCall({ dhStatus: { id, st: 'В работе' } }).catch((e) => ({ err: e.message }));
    if (!r || r.err) { const real = await reqStatus(id); if (stKey(real) === 'в работе') r = { ok: true }; }
    if (!r || r.err) { tgOwner(`⚠️ ${g.person}: «В работе» по №${id} не поставлено — ${(r && r.err) || 'нет ответа CRM'}`); return say(`❌ Не получилось поставить «В работе» по №${id}. Директор в курсе.`); }
    if (r.same) { ctlWorking(String(id)).catch(() => {}); return say(`✅ №${id} уже «В работе»`); }
    ctlWorking(String(id)).catch(() => {});
    tgOwner(`🔧 №${id} → «В работе» (написал ${g.person})`);
    return say(`✅ №${id} — статус «В работе»`);
  } finally { delete tgWorkBusy[chatId]; }
}
// /стат в группе мастера — его статистика за месяц
// общий чат мастеров: /стат — статистика за день по всем мастерам (без заявок «Работа СД»)
async function tgDayStat(chat) {
  await tgSend(chat.id, '⏳ Считаю статистику за день…');
  // оборот за сегодня (из «Отчёта по городу») — параллельно со списком заявок
  const turnP = crmCall({ dhDayTurn: true }, 90000).catch((e) => ({ err: e.message }));
  const rows = (await todayRows()).filter((r) => !/работа\s*сд/i.test(r.st) && r.master);
  const tr = await turnP;
  const rub = (v) => Math.round(v).toLocaleString('ru-RU') + ' ₽';
  const turnTxt = tr && !tr.err && (tr.total != null || (tr.masters || []).length)
    ? `\n\n💰 Оборот за день: ${tr.total != null ? rub(tr.total) : '—'}` + ((tr.masters || []).length ? '\n' + tr.masters.map((x, i) => `${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${x.name} — ${rub(x.turn)}`).join('\n') : '')
    : `\n\n💰 Оборот: нет данных${tr && tr.err ? ' (' + tr.err + ')' : ''}`;
  const d = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!rows.length) return tgSend(chat.id, `📊 Статистика за ${d}\n\nЗаявок пока нет.` + turnTxt);
  const by = {};
  rows.forEach((r) => {
    const k = r.master.replace(/\s*\(.*$/, '').trim();
    const o = by[k] = by[k] || { all: 0, done: 0, work: 0, way: 0, wait: 0, ref: 0 };
    o.all++;
    if (/^готов/i.test(r.st)) o.done++; else if (/^в работе/i.test(r.st)) o.work++; else if (/^в пути/i.test(r.st)) o.way++; else if (/^ожидает/i.test(r.st)) o.wait++; else if (/^(отказ|отмен)/i.test(r.st)) o.ref++;
  });
  const names = Object.keys(by).sort((a, b) => by[b].done - by[a].done || by[b].all - by[a].all);
  const T = names.reduce((t, k) => { Object.keys(by[k]).forEach((x) => { t[x] = (t[x] || 0) + by[k][x]; }); return t; }, {});
  const medal = ['🥇', '🥈', '🥉'];
  const line = (k, i) => { const o = by[k]; const parts = [`✅ ${o.done}`]; if (o.work) parts.push(`🔧 ${o.work}`); if (o.way) parts.push(`🚕 ${o.way}`); if (o.wait) parts.push(`⏳ ${o.wait}`); if (o.ref) parts.push(`❌ ${o.ref}`); return `${medal[i] || (i + 1) + '.'} ${k} — ${o.all} заяв. · ${parts.join(' · ')}`; };
  return tgSend(chat.id, `📊 Статистика за ${d}\n\nВсего заявок: ${T.all} · проведено ✅ ${T.done} · в работе 🔧 ${T.work || 0} · в пути 🚕 ${T.way || 0}${T.ref ? ` · отказ ❌ ${T.ref}` : ''}\n\n` + names.map(line).join('\n') + '\n\n✅ проведено · 🔧 в работе · 🚕 в пути · ⏳ ожидает · ❌ отказ/отмена' + turnTxt);
}
async function tgGroupStat(chat) {
  TG.groups = TG.groups || {};
  if (!TG.groups[chat.id]) tgLearnChat(chat);
  await tgRelink();
  const g = TG.groups[chat.id];
  if (!g || !g.empId) return tgDayStat(chat); // не группа конкретного мастера — общий чат, статистика за день
  const ms = await tgMasters();
  const crm = (ms.find((m) => String(m.id) === String(g.empId)) || {}).name || '';
  await tgSend(chat.id, '⏳ Считаю статистику за месяц…');
  const r = await crmCall({ dhMasterStat: { empId: g.empId, name: crm, person: g.person } }).catch((e) => ({ err: e.message }));
  return tgSend(chat.id, r && r.text ? r.text : '❌ ' + ((r && r.err) || 'нет данных'));
}
// «Проведенная сумма» и «Сумма к сдаче» из текста страницы (число ищем после подписи, через пробелы/переносы)
function tgSums(text) {
  const t = String(text || '').replace(/[\s\u00a0]+/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : null; };
  const done = num(/Проведенная сумма по заявке:\s*(-?\d[\d ]*)/i);
  const give = num(/Сумма к сдаче:\s*(-?\d[\d ]*)/i);
  if (give == null) return null;
  return { done, give, text: (done != null ? `Проведенная сумма по заявке: ${done} р.\n` : '') + `Сумма к сдаче: ${give} р.` };
}
// «Сумма к сдаче» → в группу мастера (один раз на заявку)
async function tgSumToMaster(id, out, master, empId) {
  await tgLoad();
  const sums = tgSums(out);
  if (!sums) return { sent: false, noSum: true };   // суммы ещё нет — не шлём пустое
  out = sums.text;
  const sent = (await browser.storage.local.get('tgSumSent')).tgSumSent || {};
  if (sent[id]) return { sent: true, dup: true };
  sent[id] = Date.now();
  Object.keys(sent).forEach((k) => { if (Date.now() - sent[k] > 14 * 864e5) delete sent[k]; });
  await browser.storage.local.set({ tgSumSent: sent });
  await tgRelink();
  let chat = master || empId ? tgMasterChat(master, empId) : null;
  if (!chat && (master || empId)) { await tgPullGroups(true); await tgRelink(); chat = tgMasterChat(master, empId); }
  const sumLine = `Сумма к сдаче: ${sums.give} р.`;
  let res = { ok: false, err: chat ? '' : `группа мастера «${master || empId || '?'}» не найдена` };
  if (TG.opts.sumToMaster && chat) res = await tgToGroup(chat.id, `💰 Заявка №${id} проведена\n${sumLine || out}`);
  tgOwner(`💰 №${id} проведена${chat ? ' · ' + chat.person : (master ? ' · ' + master : '')}\n${out}` + (TG.opts.sumToMaster ? (res.ok ? `\n📨 сумма к сдаче отправлена в «${chat.title}»` : `\n⚠️ мастеру не отправлено: ${res.err}`) : ''));
  return { sent: res.ok };
}
// заявка закрыта (в CRM руками или расширением) — прочитать сумму со страницы заявки
async function tgCheckClosed(id, masterHint) {
  try {
    const r = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/update?id=' + id, { credentials: 'include', cache: 'no-store' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const sums = tgSums(d.body.textContent || '');
    if (!sums) return false;
    const es = d.querySelector('[name="CustomerRequest[employee_id]"]');
    const opt = es && es.querySelector('option[selected]');
    const master = opt ? opt.textContent.replace(/\s*\(.*$/, '').trim() : masterHint;
    const res = await tgSumToMaster(id, sums.text, master, es ? es.value : '');
    return !res.noSum;
  } catch (e) { return false; }
}
const stKey = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s*\(.*\)\s*$/, '').trim();
// статус заявки, реально записанный в CRM
async function reqStatus(id) {
  // статус берём из списка заявок (в HTML самой заявки его заполняет скрипт)
  for (let p = 1; p <= 5; p++) {
    const rows = await listRows(p).catch(() => []);
    if (!rows.length) break;
    const r = rows.find((x) => x.id === String(id));
    if (r) return r.st;
  }
  return '';
}
// все заявки за сегодня (по страницам списка)
async function todayRows(maxPages = 12) {
  const all = [], seen = new Set();
  for (let p = 1; p <= maxPages; p++) {
    const rows = await listRows(p).catch(() => []);
    const fresh = rows.filter((r) => !seen.has(r.id));
    if (!fresh.length) break;
    fresh.forEach((r) => { seen.add(r.id); all.push(r); });
    // страница целиком из других дней и сегодняшние уже были — дальше не листаем
    if (p > 1 && !fresh.some((r) => isToday(r.time)) && all.some((r) => isToday(r.time))) break;
  }
  return all.filter((r) => isToday(r.time));
}
const sdNum = (x) => { const v = parseFloat(String(x || '').replace(/[\s\u00a0]/g, '').replace(',', '.')); return isNaN(v) ? 0 : v; };
const sdFmt = (v) => Math.round(v).toLocaleString('ru-RU') + ' р.';
// сдача за сегодня: { мастер: { sum, items:[{id, give}] } }
async function tgSdacha() {
  const rows = (await todayRows()).filter((r) => /^готов/i.test(r.st) || /провед/i.test(r.st));
  const res = {};
  await Promise.all(rows.map(async (r) => {
    try {
      const x = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/update?id=' + r.id, { credentials: 'include', cache: 'no-store' });
      const d = new DOMParser().parseFromString(await x.text(), 'text/html');
      const sm = tgSums(d.body.textContent || '');
      if (!sm) return;
      let who = r.master;
      if (!who) { const es = d.querySelector('[name="CustomerRequest[employee_id]"]'); const o = es && es.querySelector('option[selected]'); who = o ? o.textContent.replace(/\s*\(.*$/, '').trim() : '—'; }
      (res[who] = res[who] || { sum: 0, items: [] });
      res[who].sum += sdNum(sm.give); res[who].items.push({ id: r.id, give: sm.give });
    } catch (e) {}
  }));
  return res;
}
const sdLines = (it) => it.items.sort((a, b) => a.id.localeCompare(b.id)).map((x) => `  №${x.id} — ${x.give} р.`).join('\n');
// /сдача в группе мастера — только его сумма
async function tgGroupSdacha(chat) {
  await tgRelink();
  const g = (TG.groups || {})[chat.id];
  if (!g) return tgSend(chat.id, '⚠️ Группа не привязана к мастеру. Напишите /start и попробуйте снова.');
  const ms = await tgMasters();
  const crm = (ms.find((x) => String(x.id) === String(g.empId)) || {}).name || '';
  tgSend(chat.id, '⏳ Считаю сдачу за сегодня…');
  const all = await tgSdacha();
  const keys = Object.keys(all).filter((k) => nameScore(g.person, k) >= 1 || (crm && nameScore(crm, k) >= 1));
  if (!keys.length) return tgSend(chat.id, `💰 ${g.person}: за сегодня проведённых заявок нет — сдавать нечего.`);
  const sum = keys.reduce((a, k) => a + all[k].sum, 0);
  const items = { items: keys.flatMap((k) => all[k].items) };
  const paid = await ctlPaidToday(chat.id);
  return tgSend(chat.id, `💰 ${g.person} — к сдаче за сегодня: ${sdFmt(sum)}${paid ? `\nСдано: ${sdFmt(paid)} · осталось: ${sdFmt(Math.max(sum - paid, 0))}` : ''}\nЗаявок: ${items.items.length}\n${sdLines(items)}\n\nСдал деньги — напиши: Сдал 3000`);
}
// мастер из самой заявки (если в списке колонки нет или она пустая)
async function reqMaster(id) {
  try {
    const r = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/update?id=' + id, { credentials: 'include', cache: 'no-store' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const es = d.querySelector('[name="CustomerRequest[employee_id]"]');
    const opt = es && (es.querySelector('option[selected]') || (es.value ? es.querySelector(`option[value="${es.value}"]`) : null));
    return opt && opt.value ? opt.textContent.replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim() : '';
  } catch (e) { return ''; }
}
// ожидающие заявки (для /ждет и уведомлений)
async function waitingRows() { return (await listRows()).filter((r) => /^ожидает/i.test(r.st)); }
async function listRows(page) {
  const r = await fetch('https://mnc-lead-centre.ru/admin/domain/customer-request/index' + (page > 1 ? '?page=' + page : ''), { credentials: 'include', cache: 'no-store' });
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const table = [...doc.querySelectorAll('table')].find((t) => /статус/i.test((t.querySelector('thead') || {}).textContent || ''));
  if (!table) return [];
  const n = (x) => String(x || '').replace(/\s+/g, ' ').trim();
  const heads = [...table.querySelectorAll('thead tr')].map((tr) => [...tr.cells].map((c) => n(c.textContent))).sort((a, b) => b.filter(Boolean).length - a.filter(Boolean).length)[0] || [];
  const ix = (re) => heads.findIndex((h) => re.test(h));
  const iSt = ix(/^статус$/i), iT = ix(/^время заявки|^дата и время заявки|^время$/i), iA = ix(/^адрес/i), iTp = ix(/^тип$/i), iN = ix(/имя клиента/i), iM = ix(/мастер|исполнитель|сотрудник/i);
  return [...table.querySelectorAll('tbody tr')].map((tr) => {
    const c = (i) => (i >= 0 && tr.cells[i] ? n(tr.cells[i].textContent) : '');
    const rowTxt = n(tr.textContent);
    const time = c(iT) || ((rowTxt.match(/\d{1,2}\.\d{1,2}\.\d{2,4}(\s+\d{1,2}:\d{2})?/) || [''])[0]);
    return { id: (c(0).match(/\d{5,}/) || [])[0], st: c(iSt), time, addr: c(iA), type: c(iTp), client: c(iN), master: c(iM), txt: rowTxt };
  }).filter((r) => r.id);
}
tgLoad().then(async () => {
  const r = await browser.storage.local.get(['tgHello', 'tgHello9']);
  if ((!r.tgHello || !r.tgHello9) && TG.token && TG.owner) {
    const res = await tgOwner('✅ DIR HELPER подключён.\n\n' + HELP, MENU);
    if (res.some(Boolean)) browser.storage.local.set({ tgHello: true, tgHello9: true });
  }
  tgPoll();
});

// ================= 9:00 — пожелание доброго утра в группы мастеров =================
const MORNING_TEXT_DEF = 'Доброе утро, дорогой мастер, сегодня у тебя все получится';
async function tgMorning() {
  try {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const st = hm(cfg().atMorning); if (!cfg().onMorning || mins < st || mins > st + 120) return; // с заданного времени; если компьютер включили позже — ещё 2 часа
    const day = now.toDateString();
    const r = await browser.storage.local.get('tgMorningDay');
    if (r.tgMorningDay === day) return;
    await tgLoad();
    if (!TG.token || !tgActive()) return;
    await browser.storage.local.set({ tgMorningDay: day }); // сразу отмечаем, чтобы не было повторов
    const ids = Object.keys(TG.groups || {}).filter((id) => !(TG.common || {})[id]);
    for (const id of ids) { await tgToGroup(id, cfg().tMorning).catch(() => {}); await new Promise((res) => setTimeout(res, 400)); }
  } catch (e) {}
}
browser.alarms.create('dh-morning', { delayInMinutes: 1, periodInMinutes: 1 });
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'dh-morning') tgMorning(); });

// ================= Контроль: «Принял», «В работе», сдача денег, сводки, сбой CRM =================
const CTL_KEY = 'tgCtl';
async function ctlGet() { const r = await browser.storage.local.get(CTL_KEY); const c = r[CTL_KEY] || {}; c.acc = c.acc || {}; c.way = c.way || {}; c.paid = c.paid || {}; c.pend = c.pend || {}; return c; }
const ctlSet = (c) => browser.storage.local.set({ [CTL_KEY]: c });
const todayKey = () => new Date().toDateString();
// заявка ушла мастеру «В пути»: ждём «Принял» и «В работе»
async function ctlAssigned(id, chatId, person) {
  const c = await ctlGet();
  c.acc[id] = { chat: String(chatId), person, t: Date.now(), step: 0 };
  c.way[id] = { chat: String(chatId), person, t: Date.now(), warned: false };
  await ctlSet(c);
}
async function ctlAccepted(chatId) {
  const c = await ctlGet(); let n = 0;
  Object.keys(c.acc).forEach((id) => { if (c.acc[id].chat === String(chatId)) { delete c.acc[id]; n++; } });
  if (n) await ctlSet(c);
}
async function ctlWorking(id) { const c = await ctlGet(); delete c.acc[id]; delete c.way[id]; await ctlSet(c); }
// раз в минуту
async function ctlTick() {
  if (!TG.token || !tgActive()) return;
  const c = await ctlGet(); const now = Date.now(); let changed = false;
  // 1) «Принял»: 10 мин — напоминание мастеру, 20 мин — директору
  for (const [id, a] of Object.entries(c.acc)) {
    const m = (now - a.t) / 60e3;
    if (m > 180) { delete c.acc[id]; changed = true; continue; }
    if (!cfg().onAccept) { delete c.acc[id]; changed = true; continue; }
    if (a.step === 0 && m >= cfg().mAccRemind) { a.step = 1; changed = true; await tgAskAccept(a.chat, `№${id} — ${cfg().tAccept}`, id); }
    else if (a.step === 1 && m >= cfg().mAccOwner) { a.step = 2; changed = true; tgOwner(`⏰ ${a.person}: заявку №${id} не принял (${cfg().mAccOwner} мин без «Принял»)`); delete c.acc[id]; }
  }
  // 2) «В работе»: больше часа «В пути» — сообщить директору (сверяем статус в CRM)
  const late = cfg().onWay ? Object.entries(c.way).filter(([, w]) => !w.warned && now - w.t >= cfg().mWay * 60e3) : [];
  const old = Object.entries(c.way).filter(([, w]) => now - w.t > 8 * 3600e3);
  old.forEach(([id]) => { delete c.way[id]; changed = true; });
  if (late.length) {
    const rows = await listRows(1).catch(() => []);
    for (const [id, w] of late) {
      const r = rows.find((x) => x.id === id); const st = r ? r.st : await reqStatus(id);
      if (st && !/^в пути/i.test(st)) { delete c.way[id]; changed = true; continue; }
      w.warned = true; changed = true;
      tgOwner(`⚠️ ${w.person}: №${id} уже больше ${cfg().mWay} мин «В пути», «В работе» не было.\nВозможно, опаздывает или клиент отменил.`);
    }
  }
  if (changed) await ctlSet(c);
}
// 6) «Сдал 3000» в группе мастера → директор подтверждает → учёт за день
async function ctlPaidMsg(msg, amount) {
  const g = TG.groups[msg.chat.id]; if (!g) return;
  const c = await ctlGet();
  const key = String(msg.chat.id) + ':' + msg.message_id;
  c.pend[key] = { chat: String(msg.chat.id), person: g.person, amount, day: todayKey(), t: Date.now() };
  await ctlSet(c);
  tgSend(msg.chat.id, `🕓 Сдача ${sdFmt(amount)} — ждёт подтверждения директора`);
  tgOwner(`💵 ${g.person} пишет: сдал ${sdFmt(amount)}`, { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'pd:' + key }, { text: '✕ Не сдал', callback_data: 'pn:' + key }]] });
}
async function ctlPaidCb(q, edit) {
  const m = q.data.match(/^(pd|pn):(.+)$/); if (!m) return;
  const c = await ctlGet(); const p = c.pend[m[2]];
  if (!p) return edit(q.message.text + '\n\n(уже обработано)');
  delete c.pend[m[2]];
  if (m[1] === 'pd') {
    const day = c.paid[p.day] = c.paid[p.day] || {};
    (day[p.chat] = day[p.chat] || []).push({ amount: p.amount, t: Date.now() });
    Object.keys(c.paid).forEach((d) => { if (Date.now() - new Date(d).getTime() > 40 * 864e5) delete c.paid[d]; });
    await ctlSet(c);
    tgSend(p.chat, `✅ Сдача ${sdFmt(p.amount)} подтверждена`);
    return edit(q.message.text + '\n\n✅ Подтверждено');
  }
  await ctlSet(c);
  tgSend(p.chat, `❌ Сдача ${sdFmt(p.amount)} не подтверждена директором`);
  return edit(q.message.text + '\n\n✕ Не подтверждено');
}
async function ctlPaidToday(chatId) { const c = await ctlGet(); return ((c.paid[todayKey()] || {})[String(chatId)] || []).reduce((a, x) => a + x.amount, 0); }
// к сдаче по мастеру из результата tgSdacha
function sdFor(all, g, crm) {
  const keys = Object.keys(all).filter((k) => nameScore(g.person, k) >= 1 || (crm && nameScore(crm, k) >= 1));
  return { sum: keys.reduce((a, k) => a + all[k].sum, 0), items: keys.flatMap((k) => all[k].items), keys };
}
// сводка по сдаче: к сдаче / сдал / осталось по каждому мастеру
async function ctlCashReport() {
  await tgRelink();
  const all = await tgSdacha(); const ms = await tgMasters(); const used = new Set();
  const lines = []; let tDue = 0, tPaid = 0;
  for (const [chat, g] of Object.entries(TG.groups || {})) {
    if ((TG.common || {})[chat]) continue;
    const crm = (ms.find((x) => String(x.id) === String(g.empId)) || {}).name || '';
    const d = sdFor(all, g, crm); d.keys.forEach((k) => used.add(k));
    const paid = await ctlPaidToday(chat);
    if (!d.sum && !paid) continue;
    tDue += d.sum; tPaid += paid;
    const left = d.sum - paid;
    lines.push(`${left > 0 ? '🔴' : '🟢'} ${g.person}: к сдаче ${sdFmt(d.sum)} · сдал ${sdFmt(paid)}${left > 0 ? ` · осталось ${sdFmt(left)}` : ''}`);
  }
  Object.keys(all).filter((k) => !used.has(k)).forEach((k) => { tDue += all[k].sum; lines.push(`⚪ ${k}: к сдаче ${sdFmt(all[k].sum)} (нет группы)`); });
  if (!lines.length) return '💵 За сегодня сдавать нечего.';
  return `💵 Сдача за сегодня\nК сдаче: ${sdFmt(tDue)} · сдано: ${sdFmt(tPaid)} · осталось: ${sdFmt(Math.max(tDue - tPaid, 0))}\n\n` + lines.join('\n');
}
// 8) утренняя сводка директору
async function ctlMorningReport() {
  await tgRelink();
  const rows = await todayRows().catch(() => []);
  const act = rows.filter((r) => !/^(отказ|отмен|работа\s*сд)/i.test(r.st));
  const wait = act.filter((r) => /^ожидает/i.test(r.st));
  const busyNames = act.filter((r) => /^(в пути|в работе)/i.test(r.st) && r.master).map((r) => r.master);
  const groups = Object.entries(TG.groups || {}).filter(([id]) => !(TG.common || {})[id]).map(([, g]) => g.person);
  const free = groups.filter((p) => !busyNames.some((b) => nameScore(p, b) >= 1));
  let txt = `☀️ Доброе утро! Сводка на ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}\n\n📋 Заявок на сегодня: ${act.length}\n⏳ Ждут раздачи: ${wait.length}` + (free.length ? `\n👷 Свободны (${free.length}): ${free.join(', ')}` : '');
  const mon = await crmCall({ dhSummary: 'month' }, 90000).catch(() => null);
  if (mon && mon.text) txt += '\n\n' + mon.text;
  return txt;
}
async function ctlSchedule() {
  if (!TG.token || !tgActive()) return;
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes(), day = todayKey();
  const r = await browser.storage.local.get(['ctlMorningDay', 'ctlEveningDay']);
  if (cfg().onReport && mins >= hm(cfg().atReport) && mins <= hm(cfg().atReport) + 120 && r.ctlMorningDay !== day) { await browser.storage.local.set({ ctlMorningDay: day }); tgOwner(await ctlMorningReport().catch((e) => '❌ Утренняя сводка: ' + e.message), MENU); }
  if (cfg().onCash && mins >= hm(cfg().atCash) && mins <= hm(cfg().atCash) + 90 && r.ctlEveningDay !== day) { await browser.storage.local.set({ ctlEveningDay: day }); tgOwner(await ctlCashReport().catch((e) => '❌ Сдача: ' + e.message)); }
}
// 15) CRM недоступна — сообщить один раз, и когда снова заработает
let crmDownSince = 0, crmDownSent = false;
async function ctlCrmState(ok, why) {
  if (ok) { if (crmDownSent) tgOwner('✅ CRM снова доступна, бот работает.'); crmDownSince = 0; crmDownSent = false; return; }
  if (!crmDownSince) crmDownSince = Date.now();
  if (!crmDownSent && Date.now() - crmDownSince > 5 * 60e3 && TG.token && tgActive()) { crmDownSent = true; tgOwner(`⚠️ CRM недоступна: ${why}.\nБот не сможет раздавать и проводить заявки, пока это не исправить.`); }
}
browser.alarms.create('dh-ctl', { delayInMinutes: 1, periodInMinutes: 1 });
browser.alarms.onAlarm.addListener(async (a) => { if (a.name !== 'dh-ctl') return; try { await tgLoad(); await ctlTick(); await ctlSchedule(); } catch (e) {} });
// код компьютера (показывается в /версия и в настройках)
browser.storage.local.get('dhInstance').then((r) => { if (!r.dhInstance) browser.storage.local.set({ dhInstance: Math.random().toString(36).slice(2, 7).toUpperCase() }); }).catch(() => {});

// новая установка (не обновление) — бот по умолчанию выключен: включается галочкой в настройках на главном компьютере
browser.runtime.onInstalled.addListener(async (d) => {
  if (d.reason !== 'install') return;
  const r = await browser.storage.local.get(['tg', 'tgHere']);
  if (r.tgHere === undefined && !(r.tg && r.tg.token)) browser.storage.local.set({ tgHere: false });
});


// ================= /настройки — тексты, время, напоминания без новой версии =================
const CFG_DEF = {
  tMorning: MORNING_TEXT_DEF, tAccept: 'Пиши принял', tWork: 'Как зайдешь в квартиру пиши "В работе"',
  atMorning: '9:00', atReport: '9:00', atCash: '22:00',
  mAccRemind: 10, mAccOwner: 20, mWay: 60, mWait: 15,
  onMorning: true, onReport: true, onCash: true, onAccept: true, onWay: true, onWait: true, onLoad: true,
};
const cfg = () => Object.assign({}, CFG_DEF, TG.cfg || {});
const hm = (t) => { const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; };
const CFG_TOG = [['onMorning', '☀️ Утро мастерам'], ['onReport', '📋 Утренняя сводка мне'], ['onCash', '💵 Сводка сдачи'], ['onAccept', '✅ Контроль «Принял»'], ['onWay', '🚕 Контроль «В пути»'], ['onWait', '⏳ Неразданные заявки'], ['onLoad', '👷 Загрузка мастеров']];
function cfgText() {
  const c = cfg();
  return `⚙️ Настройки бота\n\n` +
    `Тексты:\n• утро: «${c.tMorning}»\n• принял: «${c.tAccept}»\n• работа: «${c.tWork}»\n\n` +
    `Время:\n• утро мастерам: ${c.atMorning}\n• сводка мне: ${c.atReport}\n• сдача: ${c.atCash}\n\n` +
    `Минуты:\n• напомнить «Принял»: ${c.mAccRemind}\n• сообщить мне «не принял»: ${c.mAccOwner}\n• долго «В пути»: ${c.mWay}\n• не раздана заявка: ${c.mWait}\n\n` +
    `Изменить:\n/текст утро Новый текст\n/текст принял Новый текст\n/текст работа Новый текст\n/время утро 9:30 · /время сводка 9:00 · /время сдача 22:00\n/минуты принял 10 · /минуты директор 20 · /минуты впути 60 · /минуты ожидает 15\n/сброс — вернуть всё как было\n\nВкл/выкл — кнопками:`;
}
const cfgKb = () => { const c = cfg(); const b = CFG_TOG.map(([k, n]) => ({ text: (c[k] ? '🟢 ' : '⚪ ') + n, callback_data: 'cf:' + k })); const rows = []; for (let i = 0; i < b.length; i += 2) rows.push(b.slice(i, i + 2)); return { inline_keyboard: rows }; };
async function cfgSet(patch) { TG.cfg = Object.assign({}, TG.cfg || {}, patch); await tgSave(); }
async function cfgCommand(t) {
  let m;
  if (/^\/(настройки|settings)(@\w+)?\s*$|^⚙/i.test(t)) return tgReply(cfgText(), cfgKb());
  if (/^\/сброс\s*$/i.test(t)) { TG.cfg = {}; await tgSave(); return tgReply('✅ Настройки сброшены', cfgKb()); }
  if ((m = t.match(/^\/текст\s+(утро|принял|работа)\s+([\s\S]+)$/i))) { const k = { утро: 'tMorning', принял: 'tAccept', работа: 'tWork' }[m[1].toLowerCase()]; await cfgSet({ [k]: m[2].trim().slice(0, 500) }); return tgReply(`✅ Текст «${m[1]}» сохранён:\n${m[2].trim()}`); }
  if ((m = t.match(/^\/время\s+(утро|сводка|сдача)\s+(\d{1,2})[:.](\d{2})\s*$/i))) { if (+m[2] > 23 || +m[3] > 59) return tgReply('Время в формате 9:30'); const k = { утро: 'atMorning', сводка: 'atReport', сдача: 'atCash' }[m[1].toLowerCase()]; await cfgSet({ [k]: `${+m[2]}:${m[3]}` }); return tgReply(`✅ Время «${m[1]}»: ${+m[2]}:${m[3]}`); }
  if ((m = t.match(/^\/минуты\s+(принял|директор|впути|в пути|ожидает)\s+(\d{1,3})\s*$/i))) { const k = { принял: 'mAccRemind', директор: 'mAccOwner', впути: 'mWay', 'в пути': 'mWay', ожидает: 'mWait' }[m[1].toLowerCase()]; await cfgSet({ [k]: Math.max(1, +m[2]) }); return tgReply(`✅ «${m[1]}»: ${+m[2]} мин`); }
  if (/^\/(текст|время|минуты)/i.test(t)) return tgReply('Не понял. Примеры есть в /настройки');
  return null;
}
async function cfgCallback(q) {
  const k = q.data.slice(3);
  tgApi('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (!(k in CFG_DEF)) return;
  await cfgSet({ [k]: !cfg()[k] });
  return tgApi('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: cfgText(), reply_markup: cfgKb() }).catch(() => {});
}

// ================= 2. Неразданные заявки: «Ожидает» дольше N минут =================
async function ctlWaiting() {
  if (!TG.token || !tgActive() || !cfg().onWait) return;
  const rows = await waitingRows().catch(() => null); if (!rows) return;
  const today = rows.filter((r) => isToday(r.time));
  const c = await ctlGet(); c.wait = c.wait || {}; const now = Date.now(); let ch = false;
  Object.keys(c.wait).forEach((id) => { if (!today.find((r) => r.id === id)) { delete c.wait[id]; ch = true; } });
  for (const r of today) {
    const w = c.wait[r.id] || (c.wait[r.id] = { t: now, sent: false }, ch = true, c.wait[r.id]);
    if (!w.sent && now - w.t >= cfg().mWait * 60e3) {
      w.sent = true; ch = true;
      tgOwner(`⏳ Заявка №${r.id} ждёт раздачи уже ${Math.round((now - w.t) / 60e3)} мин${r.time ? '\n🕒 ' + r.time : ''}${r.addr ? '\n📍 ' + r.addr : ''}`, assignBtn(r.id));
    }
  }
  if (ch) await ctlSet(c);
}
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'dh-ctl') ctlWaiting().catch(() => {}); });

// ================= 3. Загрузка мастеров для «Отдать мастеру» =================
async function masterLoad() {
  const rows = await todayRows(4).catch(() => []);
  const load = {};
  rows.forEach((r) => { if (!r.master) return; const k = r.master.replace(/\s*\(.*$/, '').trim(); const o = load[k] = load[k] || { way: 0, work: 0, done: 0 }; if (/^в пути/i.test(r.st)) o.way++; else if (/^в работе/i.test(r.st)) o.work++; else if (/^готов/i.test(r.st)) o.done++; });
  return (name) => { let best = null, sc = 0; Object.keys(load).forEach((k) => { const v = nameScore(name, k); if (v > sc) { sc = v; best = k; } }); return sc >= 1 ? load[best] : { way: 0, work: 0, done: 0 }; };
}

// ================= 4. Поиск заявки по адресу / телефону / фамилии / номеру =================
async function tgSearch(q) {
  const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const digits = q.replace(/\D/g, '');
  const words = norm(q).split(' ').filter((w) => w.length >= 2);
  if (!words.length && digits.length < 4) return tgReply('Напишите адрес, телефон, фамилию клиента или номер заявки (хотя бы 3 буквы).', MENU);
  tgReply('🔎 Ищу…');
  const found = []; const seen = new Set();
  for (let p = 1; p <= 8 && found.length < 6; p++) {
    const rows = await listRows(p).catch(() => []); if (!rows.length) break;
    rows.forEach((r) => {
      if (seen.has(r.id)) return; seen.add(r.id);
      const txt = norm(r.txt); const d = String(r.txt || '').replace(/\D/g, '');
      const ok = (digits.length >= 4 && (r.id.includes(digits) || d.includes(digits.slice(-7)))) || (words.length && words.every((w) => txt.includes(w)));
      if (ok && found.length < 6) found.push(r);
    });
  }
  if (!found.length) return tgReply('Ничего не нашёл в последних заявках. Уточните запрос.', MENU);
  for (const r of found) {
    const kb = /^ожидает/i.test(r.st) ? assignBtn(r.id) : (!LOCKED.test(r.st) ? stBtn(r.id, r.st) : { inline_keyboard: [[{ text: 'ℹ️ Инфо', callback_data: 'i:' + r.id }]] });
    await tgReply(`№${r.id} · ${r.st || '—'}${r.master ? '\n👷 ' + r.master : ''}${r.time ? '\n🕒 ' + r.time : ''}${r.addr ? '\n📍 ' + r.addr : ''}${r.client ? '\n👤 ' + r.client : ''}`, kb);
  }
}

// ================= 11. Активация: дополнение работает только с токеном вашего бота =================
const DH_BOT_ID = 8824067385;
async function dhCheckAct() {
  try {
    const r = await browser.storage.local.get(['tg', 'dhAct']); const tok = r.tg && r.tg.token;
    if (!tok) { await browser.storage.local.set({ dhAct: { ok: false, at: Date.now() } }); return false; }
    if (String(tok).split(':')[0] !== String(DH_BOT_ID)) { await browser.storage.local.set({ dhAct: { ok: false, at: Date.now() } }); return false; }
    const res = await fetch(`https://api.telegram.org/bot${tok}/getMe`).then((x) => x.json()).catch(() => null);
    if (!res) return r.dhAct ? !!r.dhAct.ok : true; // нет сети — оставляем как было (новый токен своего бота — пускаем)
    const ok = !!(res.ok && res.result && res.result.id === DH_BOT_ID);
    await browser.storage.local.set({ dhAct: { ok, at: Date.now() } });
    return ok;
  } catch (e) { return false; }
}
dhCheckAct();
browser.storage.onChanged.addListener((ch) => { if (ch.tg && (!ch.tg.oldValue || !ch.tg.newValue || ch.tg.oldValue.token !== ch.tg.newValue.token)) dhCheckAct(); });
browser.runtime.onMessage.addListener((m) => { if (m && m.dhCheckAct) return dhCheckAct(); });
browser.alarms.create('dh-act', { delayInMinutes: 30, periodInMinutes: 360 });
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'dh-act') dhCheckAct(); });
