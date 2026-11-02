// Тёмная тема для CRM и окон DIR HELPER (кнопка ☀/☾ рядом с «?»).
// Работает инверсией цветов всей страницы — так темнеет и CRM, и панели дополнения; картинки и видео возвращаются как были.
// Выбор хранится в storage.local.dhTheme ('dark' | 'light') и сразу применяется во всех вкладках и окнах.
(function () {
  if (window.__dhTheme) return; window.__dhTheme = true;
  const isExt = location.protocol === 'moz-extension:';
  // кто красит: верхняя страница CRM и страница дополнения — целиком; CRM внутри окна дополнения — только возвращает цвета картинок
  // (её уже затемняет окно-родитель); скрытые окна CRM внутри CRM — ничего
  let mode = 'full';
  if (!isExt && window !== window.top) {
    let parentIsCrm = false; try { parentIsCrm = window.parent.location.hostname === location.hostname; } catch (e) {}
    mode = parentIsCrm ? 'none' : 'media';
  }
  if (mode === 'none') return;
  const MEDIA = 'html.dh-dark img,html.dh-dark video,html.dh-dark picture,html.dh-dark [style*="background-image"]{filter:invert(1) hue-rotate(180deg)}';
  const css = (mode === 'full' ? 'html{transition:filter .25s ease}html.dh-dark{filter:invert(.9) hue-rotate(180deg);background:#fff}' : '') + MEDIA;
  const put = () => { if (document.getElementById('dh-theme-css')) return; const st = document.createElement('style'); st.id = 'dh-theme-css'; st.textContent = css; (document.head || document.documentElement).appendChild(st); };
  const apply = (t) => { document.documentElement.classList.toggle('dh-dark', t === 'dark'); try { localStorage.setItem('dhTheme', t); } catch (e) {} };
  // сразу из localStorage (без вспышки светлой страницы), потом — точное значение из настроек дополнения
  put(); try { const t = localStorage.getItem('dhTheme'); if (t) apply(t); } catch (e) {}
  if (!document.head) document.addEventListener('DOMContentLoaded', put, { once: true });
  try {
    browser.storage.local.get('dhTheme').then((r) => apply(r.dhTheme || 'light')).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.dhTheme) apply(ch.dhTheme.newValue || 'light'); });
  } catch (e) {}
})();

// кнопка темы: в тёмной теме — луна, в светлой — солнце
const DH_SUN = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></svg>';
const DH_MOON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>';
function dhThemeButton(btn) {
  const show = (t) => { const dark = t === 'dark'; btn.innerHTML = dark ? DH_MOON : DH_SUN; btn.title = dark ? 'Тёмная тема — нажмите, чтобы включить светлую' : 'Светлая тема — нажмите, чтобы включить тёмную'; btn.setAttribute('aria-label', btn.title); };
  show(document.documentElement.classList.contains('dh-dark') ? 'dark' : 'light');
  try {
    browser.storage.local.get('dhTheme').then((r) => show(r.dhTheme || 'light')).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.dhTheme) show(ch.dhTheme.newValue || 'light'); });
  } catch (e) {}
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await browser.storage.local.get('dhTheme');
    await browser.storage.local.set({ dhTheme: r.dhTheme === 'dark' ? 'light' : 'dark' });
  });
}
