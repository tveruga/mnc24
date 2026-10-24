const $ = (id) => document.getElementById(id);
let TG = {};
async function load() {
  const r = await browser.storage.local.get(['tg', 'tgLinks']);
  TG = r.tg || {}; TG.opts = Object.assign({ notifyNew: true, toMaster: true, sumToMaster: true }, TG.opts || {});
  $('t').value = r.tgLinks || '';
  $('tok').value = TG.token || '';
  $('o1').checked = TG.opts.notifyNew; $('o2').checked = TG.opts.toMaster; $('o3').checked = TG.opts.sumToMaster;
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
$('tsave').onclick = async () => {
  await save({ token: $('tok').value.trim() });
  $('tmsg').textContent = 'проверяю…'; $('tmsg').className = 'muted';
  const r = await browser.runtime.sendMessage({ tg: 'test' }).catch((e) => ({ ok: false, err: e.message }));
  $('tmsg').textContent = r && r.ok ? `✓ бот @${r.name} работает` : '✕ ' + ((r && r.err) || 'ошибка');
  $('tmsg').className = r && r.ok ? 'ok' : 'err';
  load();
};
['o1', 'o2', 'o3'].forEach((id, i) => $(id).onchange = async () => { const r = await browser.storage.local.get('tg'); const t = r.tg || {}; t.opts = Object.assign({ notifyNew: true, toMaster: true, sumToMaster: true }, t.opts || {}); t.opts[['notifyNew', 'toMaster', 'sumToMaster'][i]] = $(id).checked; await browser.storage.local.set({ tg: t }); });
$('reset').onclick = async () => { await save({ owner: null }); load(); };
$('b').onclick = async () => { await browser.storage.local.set({ tgLinks: $('t').value }); $('m').textContent = 'Сохранено'; };
let lt = 0; browser.storage.onChanged.addListener(() => { clearTimeout(lt); lt = setTimeout(load, 500); });
load();
