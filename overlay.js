// Окно DIR HELPER поверх обычной вкладки (не CRM): справа, страница остаётся видна слева.
// Открывается «джинном» — вытекает из угла, где значок дополнения, и разворачивается; закрывается обратно в значок.
(() => {
  if (window.__dhOv) { window.__dhOv(); return; }
  const SRC = browser.runtime.getURL('sidebar.html') + '#ov';
  const ORIGIN = new URL(SRC).origin;
  // точки: верх-лево, верх-право, низ-право, низ-лево, середина левого края (даёт изгиб, как у «джинна»)
  const GENIE = [
    { clipPath: 'polygon(97% 0%, 100% 0%, 100% 1%, 97% 1%, 97% 0.5%)', opacity: 0.25 },
    { clipPath: 'polygon(90% 0%, 100% 0%, 100% 45%, 55% 45%, 84% 20%)', opacity: 1, offset: 0.38 },
    { clipPath: 'polygon(45% 0%, 100% 0%, 100% 92%, 4% 92%, 28% 46%)', offset: 0.7 },
    { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 50%)', opacity: 1 },
  ];
  let box = null, busy = false;
  function open() {
    box = document.createElement('div');
    box.id = 'dh-overlay';
    box.style.cssText = 'all:initial;position:fixed;top:0;right:0;width:min(1280px,max(520px,62vw));height:100vh;z-index:2147483647;background:#fff;box-shadow:-14px 0 40px rgba(0,0,0,.35);';
    const fr = document.createElement('iframe');
    fr.src = SRC;
    fr.setAttribute('allow', 'clipboard-write');
    fr.style.cssText = 'all:initial;display:block;width:100%;height:100%;border:0;background:#fff;';
    box.appendChild(fr);
    document.documentElement.appendChild(box);
    busy = true;
    box.animate(GENIE, { duration: 650, easing: 'cubic-bezier(.2,.8,.25,1)' }).onfinish = () => { busy = false; };
  }
  function close() {
    if (!box || busy) return;
    busy = true;
    const b = box;
    b.animate(GENIE, { duration: 420, easing: 'cubic-bezier(.55,0,.85,.35)', direction: 'reverse', fill: 'forwards' }).onfinish = () => { b.remove(); if (box === b) box = null; busy = false; };
  }
  window.__dhOv = () => (box ? close() : open());
  // ✕ внутри окна
  window.addEventListener('message', (e) => { if (e.origin === ORIGIN && e.data && e.data.dhOv === 'close') close(); });
  open();
})();
