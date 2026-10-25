const $ = (id) => document.getElementById(id);
let TG = {};
let TOK_DIRTY = false;
async function load() {
  const r = await browser.storage.local.get(['tg', 'tgLinks']);
  TG = r.tg || {}; TG.opts = Object.assign({ notifyNew: true, toMaster: true, sumToMaster: true }, TG.opts || {});
  $('t').value = r.tgLinks || '';
  // поле токена не перезаписываем, пока его редактируют
  if (!TOK_DIRTY && document.activeElement !== $('tok')) $('tok').value = TG.token || '';
  const lc = await browser.storage.local.get(['tgHere', 'dhInstance']);
  $('here').checked = lc.tgHere !== false;
  $('hereinfo').textContent = `Код этого компьютера: ${lc.dhInstance || '—'} (его показывает бот на /версия). Включайте только на ОДНОМ компьютере. На остальных снимите галочку — там панель и аналитика работают как обычно.`;
  $('o1').checked = TG.opts.notifyNew; $('o2').checked = TG.opts.toMaster; $('o3').checked = TG.opts.sumToMaster;
  const ac = (await browser.storage.local.get('dhAct')).dhAct;
  $('act').innerHTML = ac && ac.ok ? '🟢 <b>DIR HELPER активирован</b>' : '🔴 <b>Не активирован</b> — вставьте код из бота (/код) в блок «Перенос на другой компьютер»';
  const dg = (await browser.storage.local.get('tgDiag')).tgDiag;
  $('diag').textContent = dg ? (dg.ok ? '🟢 связь с Telegram есть (' + new Date(dg.ok).toLocaleTimeString('ru-RU') + ')' : '🔴 ошибка Telegram: ' + dg.err) : '';
  $('owner').textContent = TG.owner ? '✅ Бот привязан к вашему чату' : (TG.token ? '⏳ Напишите боту /start' : '');
  await browser.runtime.sendMessage({ tg: 'relink' }).catch(() => {});
  const r2 = await browser.storage.local.get(['tg', 'masters']);
  const G = Object.entries((r2.tg && r2.tg.groups) || {});
  const ms = (r2.masters || []).map((m) => ({ id: String(m.id), name: String(m.name).replace(/\s*\(.*$/, '').trim() }));
  const how = { name: 'по имени', free: 'свободный аккаунт', manual: 'вручную' };
  $('chats').innerHTML = G.length ? '<tr><td class="muted">Группа Telegram</td><td class="muted">Мастер в CRM</td><td></td></tr>' + G.map(([cid, g]) => `<tr><td>${g.title}</td><td><select data-c="${cid}"><option value="">— авто —</option>${ms.map((m) => `<option value="${m.id}"${String(g.empId) === m.id ? ' selected' : ''}>${m.name}</option>`).join('')}</select></td><td class="muted">${g.empId ? how[g.how] || '' : 'нет свободных'}</td></tr>`).join('') : '<tr><td class="muted">Пока нет — добавьте бота в группы мастеров и напишите там /start</td></tr>';
  document.querySelectorAll('select[data-c]').forEach((sel) => sel.onchange = async () => { await browser.runtime.sendMessage({ tg: 'setLink', chatId: sel.dataset.c, empId: sel.value || null }); load(); });
}
async function save(patch) { const r = await browser.storage.local.get('tg'); const t = Object.assign(r.tg || {}, patch); await browser.storage.local.set({ tg: t }); }
$('tok').addEventListener('input', () => { TOK_DIRTY = true; });
$('tsave').onclick = async () => {
  const tok = $('tok').value.trim();
  if (!tok) { $('tmsg').textContent = '✕ вставьте токен'; $('tmsg').className = 'err'; return; }
  await save({ token: tok });
  TOK_DIRTY = false;
  $('tmsg').textContent = 'проверяю…'; $('tmsg').className = 'muted';
  const r = await browser.runtime.sendMessage({ tg: 'test' }).catch((e) => ({ ok: false, err: e.message }));
  $('tmsg').textContent = r && r.ok ? `✓ бот @${r.name} работает` : '✕ ' + ((r && r.err) || 'ошибка');
  $('tmsg').className = r && r.ok ? 'ok' : 'err';
  load();
};
['o1', 'o2', 'o3'].forEach((id, i) => $(id).onchange = async () => { const r = await browser.storage.local.get('tg'); const t = r.tg || {}; t.opts = Object.assign({ notifyNew: true, toMaster: true, sumToMaster: true }, t.opts || {}); t.opts[['notifyNew', 'toMaster', 'sumToMaster'][i]] = $(id).checked; await browser.storage.local.set({ tg: t }); });
$('here').onchange = () => browser.storage.local.set({ tgHere: $('here').checked });
$('reset').onclick = async () => { await save({ owner: null }); load(); };
$('b').onclick = async () => { await browser.storage.local.set({ tgLinks: $('t').value }); $('m').textContent = 'Сохранено'; };
let lt = 0; browser.storage.onChanged.addListener(() => { clearTimeout(lt); lt = setTimeout(load, 500); });
load();

// ---- перенос настроек ----
const pack = (o) => 'DH1:' + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const unpack = (c) => JSON.parse(decodeURIComponent(escape(atob(String(c).trim().replace(/^DH1:/, '')))));
$('exp').onclick = async () => {
  const r = await browser.storage.local.get('tg'); const t = r.tg || {};
  if (!t.token) { $('expmsg').textContent = 'на этом компьютере нет токена'; return; }
  const code = pack({ token: t.token, owner: t.owner, users: t.users, opts: t.opts, cfg: t.cfg, groups: t.groups, common: t.common });
  try { await navigator.clipboard.writeText(code); $('expmsg').textContent = '✓ код скопирован — вставьте его на другом компьютере'; }
  catch (e) { $('imp').value = code; $('expmsg').textContent = 'скопируйте код из поля ниже'; }
};
$('impb').onclick = async () => {
  let o; try { o = unpack($('imp').value); } catch (e) { $('impmsg').textContent = '✕ неверный код'; $('impmsg').className = 'err'; return; }
  if (!o || !o.token) { $('impmsg').textContent = '✕ в коде нет токена'; $('impmsg').className = 'err'; return; }
  const r = await browser.storage.local.get('tg'); const t = Object.assign(r.tg || {}, o);
  await browser.storage.local.set({ tg: t, tgHere: false });
  $('impmsg').textContent = '✓ настройки перенесены, бот на этом компьютере выключен'; $('impmsg').className = 'ok';
  $('imp').value = ''; TOK_DIRTY = false; load();
};
