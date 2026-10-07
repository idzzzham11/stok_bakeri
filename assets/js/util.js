/* StokBakeri — small helpers shared by store.js and app.js */
(function () {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Escape text for safe use inside HTML. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  /** Round to 3 decimals to hide floating point noise (0.1 + 0.2). */
  function round(n) {
    return Math.round((Number(n) || 0) * 1000) / 1000;
  }

  const numFmt = new Intl.NumberFormat('ms-MY', { maximumFractionDigits: 3 });
  function fmt(n) {
    return numFmt.format(round(n));
  }

  /** Today's date as YYYY-MM-DD in the device's own time zone. */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const dateFmt = new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return esc(iso || '-');
    const [y, m, d] = iso.split('-').map(Number);
    return dateFmt.format(new Date(y, m - 1, d));
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, isError) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.innerHTML = '<svg class="i"><use href="#' + (isError ? 'i-alert' : 'i-check') + '"/></svg><span>' + esc(message) + '</span>';
    box.appendChild(el);
    setTimeout(() => el.remove(), isError ? 5000 : 3200);
  }

  /** Load a script once (used for the Excel library, only when needed). */
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete loaded[src]; reject(new Error('Gagal memuat ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  window.U = { esc, round, fmt, today, fmtDate, uid, download, toast, loadScript };
})();
