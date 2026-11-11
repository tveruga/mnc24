// Окно DIR HELPER поверх обычной вкладки (не CRM): справа, страница остаётся видна слева.
// Открывается «джинном» — вытекает из угла, где значок дополнения, и разворачивается; закрывается обратно в значок.
(() => {
  if (window.__dhOv) { window.__dhOv(); return; }
  const SRC = browser.runtime.getURL('sidebar.html') + '#ov';
  const ORIGIN = new URL(SRC).origin;
  let box = null, busy = false;
  function open() {
    box = document.createElement('div');
    box.id = 'dh-overlay';
    box.style.cssText = 'all:initial;position:fixed;top:0;right:0;width:min(100vw,min(1280px,max(520px,62vw)));height:100vh;z-index:2147483647;background:#fff;box-shadow:-14px 0 40px rgba(0,0,0,.35);';
    const fr = document.createElement('iframe');
    fr.src = SRC;
    fr.setAttribute('allow', 'clipboard-write');
    fr.style.cssText = 'all:initial;display:block;width:100%;height:100%;border:0;background:#fff;';
    box.appendChild(fr);
    document.documentElement.appendChild(box);
    busy = true;
    const animation = dhGenie(box);
    animation.onfinish = () => { animation.cancel(); busy = false; };
  }
  function close() {
    if (!box || busy) return;
    busy = true;
    const b = box;
    dhGenie(b, true).onfinish = () => { b.remove(); if (box === b) box = null; busy = false; };
  }
  window.__dhOv = () => (box ? close() : open());
  // ✕ внутри окна
  window.addEventListener('message', (e) => { if (e.origin === ORIGIN && box && e.source === box.firstChild.contentWindow && e.data && e.data.dhOv === 'close') close(); });
  open();
})();
