// Мини-CRM в боковой панели Firefox
const crm = document.getElementById('crm');
const BASE = 'https://mnc-lead-centre.ru';
let zoom = 0.7;
try { const z = parseFloat(localStorage.getItem('dhZoom')); if (z) zoom = z; } catch (e) {}
function applyZoom() {
  zoom = Math.min(1, Math.max(0.4, Math.round(zoom * 20) / 20));
  crm.style.transform = `scale(${zoom})`;
  crm.style.width = (100 / zoom) + '%';
  crm.style.height = (100 / zoom) + '%';
  document.getElementById('zv').textContent = Math.round(zoom * 100) + '%';
  try { localStorage.setItem('dhZoom', zoom); } catch (e) {}
}
applyZoom();
document.querySelectorAll('[data-z]').forEach((b) => b.onclick = () => { zoom += b.dataset.z === '+' ? 0.05 : -0.05; applyZoom(); });
document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
  try { crm.contentWindow.postMessage({ dirHelper: 'toggle', mode: b.dataset.mode }, BASE); } catch (e) {}
});
const goList = document.querySelector('[data-go="list"]'); if (goList) goList.onclick = () => { crm.src = BASE + '/admin/domain/customer-request/index'; };
document.getElementById('tab').onclick = () => {
  let url = BASE + '/admin/domain/customer-request/index';
  try { url = crm.contentWindow.location.href; } catch (e) {}
  browser.tabs.create({ url });
};

// версия рядом с названием
try { document.getElementById('ver').textContent = browser.runtime.getManifest().version; } catch (e) {}
// выдвинуть панель выдачи заявки внутри окна
document.getElementById('give').onclick = () => { try { crm.contentWindow.postMessage({ dirHelper: 'panel' }, BASE); } catch (e) {} };

// ⟳ — проверить обновление и сразу обновиться
const upd = document.getElementById('upd');
upd.onclick = async () => {
  upd.classList.add('spin'); upd.title = 'Проверяю…';
  const r = await browser.runtime.sendMessage({ dhUpdate: true }).catch((e) => ({ text: e.message }));
  upd.classList.remove('spin');
  upd.title = (r && r.text) || 'Проверить обновление';
  toast((r && r.text) || 'Ошибка проверки');
};
function toast(t) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 4000);
}
