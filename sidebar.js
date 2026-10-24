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
document.querySelector('[data-go="list"]').onclick = () => { crm.src = BASE + '/admin/domain/customer-request/index'; };
document.getElementById('tab').onclick = () => {
  let url = BASE + '/admin/domain/customer-request/index';
  try { url = crm.contentWindow.location.href; } catch (e) {}
  browser.tabs.create({ url });
};
