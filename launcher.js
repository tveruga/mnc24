// Popup grants activeTab on every click, including restricted Firefox pages.
(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url || '';
  let host = ''; try { host = new URL(url).hostname; } catch (_) {}
  const crm = host === 'mnc-lead-centre.ru' || host.endsWith('.mnc-lead-centre.ru');
  const denied = /(^|\.)(addons.mozilla.org|accounts.firefox.com|support.mozilla.org|accounts-static.cdn.mozilla.net)$/.test(host);
  if (tab && /^https?:/i.test(url) && !denied) {
    try {
      const bg = await browser.runtime.getBackgroundPage();
      if (!crm) {
        await bg.dhPartCookies(url);
        await browser.tabs.executeScript(tab.id, { file: 'genie.js' });
      }
      await browser.tabs.executeScript(tab.id, crm
        ? { code: 'window.__mncDash && window.__mncDash.toggle();' }
        : { file: 'overlay.js' });
      window.close();
      return;
    } catch (_) { /* Other protected domains use the toolbar popup too. */ }
  }
  location.replace(browser.runtime.getURL('sidebar.html') + '#popup');
})();
