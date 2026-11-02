const { ipcRenderer } = require('electron');

// Only real link clicks can open the system browser; no renderer Node API is exposed.
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    const value = link.href;
    try { const u = new URL(value); if (u.origin === location.origin && u.pathname === location.pathname && u.search === location.search) return; } catch { return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    ipcRenderer.send('officex:open-link', value);
  }, true);
});
