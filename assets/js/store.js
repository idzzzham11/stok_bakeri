/* StokBakeri — data layer.
 *
 * Every change is an operation ({ op: 'putItem', item }, …). An operation is
 * applied to the local copy straight away, kept in localStorage, and — when
 * the site is served with the /api/data backend — queued and sent to the shared
 * database. Changes made by other people are pulled in every few seconds.
 * Without a backend (static hosting, opened as a file, or embedded) the data
 * simply stays on this device, as before.
 *
 * The localStorage keys match the original StokBakeri page so existing data on
 * the same domain carries over. */
(function () {
  'use strict';
  const { round, uid, today, toast } = window.U;

  const KEYS = {
    items: 'stok_bakeri_items_v2',
    tx: 'stok_bakeri_tx_v2',
    lecturers: 'stok_bakeri_lecturers_v2',
    activeLecturer: 'stok_bakeri_active_lecturer_v2',
    outbox: 'stok_bakeri_outbox_v1',
    serverVersion: 'stok_bakeri_server_version_v1',
    password: 'stok_bakeri_password_v1',
  };
  const API = 'api/data';
  const POLL_MS = 10000;

  // group: which section of the practical-usage form the category belongs to.
  const CATEGORIES = [
    { name: 'Tepung & Serbuk', group: 'bahan' },
    { name: 'Mentega & Tenusu', group: 'bahan' },
    { name: 'Gula & Pemanis', group: 'bahan' },
    { name: 'Coklat & Hiasan', group: 'bahan' },
    { name: 'Perisa & Pewarna', group: 'bahan' },
    { name: 'Kacang & Buah Kering', group: 'bahan' },
    { name: 'Peralatan & Acuan', group: 'peralatan' },
    { name: 'Pembungkusan & Kotak', group: 'pembungkusan' },
    { name: 'Lain-Lain', group: 'bahan' },
  ];
  const GROUPS = [
    { key: 'bahan', label: 'Bahan bakeri & pastri' },
    { key: 'peralatan', label: 'Peralatan & acuan' },
    { key: 'pembungkusan', label: 'Pembungkusan & kotak' },
  ];
  const UNITS = [
    ['kg', 'kg (kilogram)'], ['g', 'g (gram)'], ['liter', 'liter'], ['ml', 'ml (mililiter)'],
    ['paket', 'paket'], ['botol', 'botol'], ['tin', 'tin'], ['biji', 'biji / unit'], ['set', 'set'],
  ];
  const DEFAULT_LECTURERS = ['Pn. Azlina', 'Chef Zulkifli', 'Chef Sarah', 'Dr. Faridah'];

  const state = { items: [], tx: [], lecturers: DEFAULT_LECTURERS.slice(), activeLecturer: DEFAULT_LECTURERS[0] };
  const listeners = [];
  const statusListeners = [];

  /* ---------- localStorage ---------- */

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  /* ---------- normalising ---------- */

  function normaliseItem(i) {
    return {
      id: String(i.id || uid('item')),
      code: String(i.code || '').trim(),
      name: String(i.name || '').trim(),
      category: String(i.category || 'Lain-Lain'),
      unit: String(i.unit || 'unit'),
      initialStock: round(i.initialStock),
      minStock: i.minStock === '' || i.minStock == null || isNaN(Number(i.minStock)) ? 5 : round(i.minStock),
      location: String(i.location || '').trim(),
    };
  }
  function normaliseTx(t) {
    return {
      id: String(t.id || uid('tx')),
      itemId: String(t.itemId || ''),
      type: t.type === 'KELUAR' ? 'KELUAR' : 'TERIMA',
      quantity: round(t.quantity),
      date: String(t.date || today()),
      person: String(t.person || '').trim(),
      lecturer: String(t.lecturer || '').trim(),
      notes: String(t.notes || '').trim(),
      createdAt: Number(t.createdAt) || 0,
    };
  }
  function setLecturerList(list) {
    state.lecturers = Array.isArray(list) && list.length ? list.map(String) : DEFAULT_LECTURERS.slice();
    if (!state.lecturers.includes(state.activeLecturer)) state.activeLecturer = state.lecturers[0];
  }

  /* ---------- operations ---------- */

  function applyOp(op) {
    switch (op.op) {
      case 'putItem': {
        const idx = state.items.findIndex((i) => i.id === op.item.id);
        if (idx >= 0) state.items[idx] = normaliseItem(op.item); else state.items.push(normaliseItem(op.item));
        break;
      }
      case 'delItem':
        state.items = state.items.filter((i) => i.id !== op.id);
        state.tx = state.tx.filter((t) => t.itemId !== op.id);
        break;
      case 'putTx': {
        const idx = state.tx.findIndex((t) => t.id === op.tx.id);
        if (idx >= 0) state.tx[idx] = normaliseTx(op.tx); else state.tx.push(normaliseTx(op.tx));
        break;
      }
      case 'delTx': state.tx = state.tx.filter((t) => t.id !== op.id); break;
      case 'setLecturers': setLecturerList(op.list); break;
      case 'clearTx': state.tx = []; break;
      case 'clearAll': state.items = []; state.tx = []; break;
      case 'replaceAll':
        state.items = (op.data.items || []).map(normaliseItem);
        state.tx = (op.data.tx || []).map(normaliseTx);
        setLecturerList(op.data.lecturers);
        break;
    }
  }

  let saveFailedShown = false;
  function persist() {
    try {
      write(KEYS.items, state.items);
      write(KEYS.tx, state.tx);
      write(KEYS.lecturers, state.lecturers);
      write(KEYS.activeLecturer, state.activeLecturer);
      write(KEYS.outbox, sync.outbox);
      write(KEYS.serverVersion, String(sync.version));
      saveFailedShown = false;
    } catch (e) {
      if (!saveFailedShown) {
        saveFailedShown = true;
        toast('Data tidak dapat disimpan dalam pelayar ini (mod peribadi atau storan penuh).', true);
      }
    }
  }
  function notify() { listeners.forEach((fn) => fn()); }

  /** Apply operations locally, save, and send them to the shared database. */
  function commit(ops) {
    ops.forEach(applyOp);
    if (sync.mode !== 'local') sync.outbox.push(...ops);
    persist();
    notify();
    flush();
  }

  /* ---------- sync with /api/data ---------- */

  // mode: 'local'   — no backend, data stays on this device
  //       'connecting' — first contact with the server not finished yet
  //       'online'  — in sync with the shared database
  //       'offline' — server unreachable, changes are queued
  //       'auth'    — the server needs the shared password
  const sync = { mode: 'local', outbox: [], version: 0, busy: false, timer: null };

  function setMode(mode) {
    if (sync.mode === mode) return;
    sync.mode = mode;
    statusListeners.forEach((fn) => fn(status()));
  }
  function status() {
    return { mode: sync.mode, pending: sync.outbox.length };
  }

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    let pw = '';
    try { pw = localStorage.getItem(KEYS.password) || ''; } catch (e) {}
    if (pw) h['x-app-password'] = pw;
    return h;
  }

  /** Handle a non-OK response; returns true if sync should stop for now. */
  function handleFailure(res) {
    if (res.status === 401) { setMode('auth'); return true; }
    if (res.status === 404 || res.status === 503) {
      // No backend on this host, or no database connected yet: work locally.
      sync.outbox = [];
      setMode('local');
      persist();
      return true;
    }
    setMode('offline');
    return true;
  }

  async function pull() {
    if (sync.mode === 'local' && sync.started) return;
    let res;
    try {
      // Version 0 means this device has never synced, so always fetch everything.
      const query = sync.version ? '?v=' + encodeURIComponent(sync.version) : '';
      res = await fetch(API + query, { headers: headers(), cache: 'no-store' });
    } catch (e) {
      setMode('offline');
      return;
    }
    if (!res.ok) { handleFailure(res); return; }
    const data = await res.json();
    if (!data.unchanged) {
      if (!data.initialized) {
        // Empty shared database: upload what this device has (or the sample data).
        if (!state.items.length && !state.tx.length) seedSample(true);
        sync.outbox.unshift({ op: 'replaceAll', data: { items: state.items, tx: state.tx, lecturers: state.lecturers } });
      } else {
        state.items = (data.items || []).map(normaliseItem);
        state.tx = (data.tx || []).map(normaliseTx);
        setLecturerList(data.lecturers);
        // Keep this device's unsent changes on top of the server copy.
        sync.outbox.forEach(applyOp);
      }
      sync.version = data.version;
      persist();
      notify();
    }
    setMode('online');
    statusListeners.forEach((fn) => fn(status()));
    if (sync.outbox.length) flush();
  }

  async function flush() {
    if (sync.busy || !sync.outbox.length || sync.mode === 'local' || sync.mode === 'auth' || sync.mode === 'connecting') return;
    sync.busy = true;
    const batch = sync.outbox.slice(0, 200);
    try {
      const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ ops: batch }) });
      if (res.ok) {
        sync.outbox.splice(0, batch.length);
        persist();
        setMode('online');
      } else if (res.status === 400) {
        // The server rejected these changes; drop them so the queue doesn't stall.
        sync.outbox.splice(0, batch.length);
        persist();
        toast('Sebahagian perubahan ditolak oleh pelayan dan tidak disimpan.', true);
      } else {
        handleFailure(res);
      }
    } catch (e) {
      setMode('offline');
    } finally {
      sync.busy = false;
      statusListeners.forEach((fn) => fn(status()));
    }
    if (sync.mode === 'online') {
      if (sync.outbox.length) flush();
      else pull();
    }
  }

  function startSync(hadLocal) {
    sync.started = true;
    setMode('connecting');
    pull().then(() => {
      if (sync.mode === 'local' && !hadLocal && !state.items.length && !state.tx.length) {
        seedSample(false);
        notify();
      }
    });
    const tick = () => {
      if (document.visibilityState !== 'visible' || sync.mode === 'local') return;
      // pull() first when reconnecting; it sends queued changes once it succeeds.
      if (sync.mode === 'online' && sync.outbox.length) flush(); else pull();
    };
    sync.timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('focus', tick);
  }

  function setPassword(pw) {
    try { write(KEYS.password, pw); } catch (e) {}
    setMode('connecting');
    return pull();
  }

  /* ---------- load ---------- */

  function loadLocal() {
    const items = read(KEYS.items, null);
    state.items = Array.isArray(items) ? items.map(normaliseItem) : [];
    const tx = read(KEYS.tx, []);
    state.tx = Array.isArray(tx) ? tx.map(normaliseTx) : [];
    let active = '';
    try { active = localStorage.getItem(KEYS.activeLecturer) || ''; } catch (e) {}
    state.activeLecturer = active;
    setLecturerList(read(KEYS.lecturers, null));
    const outbox = read(KEYS.outbox, []);
    sync.outbox = Array.isArray(outbox) ? outbox : [];
    sync.version = Number(read(KEYS.serverVersion, 0)) || 0;
    return items != null;
  }

  /** @param {boolean} useServer try the shared database at /api/data */
  function load(useServer) {
    const hadLocal = loadLocal();
    if (useServer) {
      startSync(hadLocal);
    } else {
      sync.outbox = [];
      // First visit: start with sample data so the page isn't empty.
      if (!hadLocal) seedSample(false);
    }
  }

  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if ([KEYS.items, KEYS.tx, KEYS.lecturers].includes(e.key)) {
      loadLocal();
      notify();
    }
  });

  /* ---------- queries ---------- */

  function onChange(fn) { listeners.push(fn); }
  function onStatus(fn) { statusListeners.push(fn); }
  function item(id) { return state.items.find((i) => i.id === id); }

  /** Stock info for every item: { item, initial, in, out, current, status }. */
  function stock() {
    const map = {};
    state.items.forEach((i) => { map[i.id] = { in: 0, out: 0 }; });
    state.tx.forEach((t) => {
      const m = map[t.itemId];
      if (!m) return;
      if (t.type === 'TERIMA') m.in += t.quantity; else m.out += t.quantity;
    });
    return state.items.map((i) => {
      const m = map[i.id];
      const current = round(i.initialStock + m.in - m.out);
      return { item: i, initial: i.initialStock, in: round(m.in), out: round(m.out), current, status: stockStatus(current, i.minStock) };
    });
  }

  function stockOf(id, ignoreTxId) {
    const i = item(id);
    if (!i) return 0;
    let n = i.initialStock;
    state.tx.forEach((t) => {
      if (t.itemId !== id || t.id === ignoreTxId) return;
      n += t.type === 'TERIMA' ? t.quantity : -t.quantity;
    });
    return round(n);
  }

  function stockStatus(current, min) {
    if (current <= 0) return 'habis';
    if (current <= min) return 'rendah';
    return 'cukup';
  }

  /** Transactions newest first (by date, then by when they were entered). */
  function txSorted() {
    return state.tx
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => (b.t.date.localeCompare(a.t.date)) || (b.t.createdAt - a.t.createdAt) || (b.idx - a.idx))
      .map((x) => x.t);
  }

  function codeTaken(code, exceptId) {
    const c = code.trim().toLowerCase();
    return state.items.some((i) => i.code.toLowerCase() === c && i.id !== exceptId);
  }

  function nextCode() {
    let n = state.items.length + 1;
    let code;
    do { code = 'BK-' + String(n++).padStart(3, '0'); } while (codeTaken(code));
    return code;
  }

  /* ---------- changes ---------- */

  function saveItem(data) {
    const clean = normaliseItem(Object.assign({}, data, { id: data.id || uid('item') }));
    commit([{ op: 'putItem', item: clean }]);
    return clean;
  }

  function deleteItem(id) { commit([{ op: 'delItem', id }]); }

  function saveTx(data) {
    const existing = data.id && state.tx.find((t) => t.id === data.id);
    const clean = normaliseTx(Object.assign({}, data, {
      id: data.id || uid('tx'),
      createdAt: existing ? existing.createdAt : Date.now(),
    }));
    commit([{ op: 'putTx', tx: clean }]);
    return clean;
  }

  function addTxBatch(list) {
    const now = Date.now();
    commit(list.map((d, n) => ({ op: 'putTx', tx: normaliseTx(Object.assign({}, d, { id: uid('tx'), createdAt: now + n })) })));
  }

  function deleteTx(id) { commit([{ op: 'delTx', id }]); }

  function setActiveLecturer(name) {
    state.activeLecturer = name;
    persist();
    notify();
  }

  function addLecturer(name) { commit([{ op: 'setLecturers', list: state.lecturers.concat(name) }]); }

  function removeLecturer(name) { commit([{ op: 'setLecturers', list: state.lecturers.filter((l) => l !== name) }]); }

  function clearTx() { commit([{ op: 'clearTx' }]); }
  function clearAll() { commit([{ op: 'clearAll' }]); }

  function reset() {
    const data = sampleData();
    commit([{ op: 'replaceAll', data: { items: data.items, tx: data.tx, lecturers: DEFAULT_LECTURERS } }]);
  }

  /** Add or update items by code (from an Excel import). Returns counts. */
  function importItems(rows) {
    let added = 0, updated = 0;
    const ops = [];
    const codes = new Set(state.items.map((i) => i.code.toLowerCase()));
    let n = state.items.length + 1;
    const freshCode = () => {
      let c;
      do { c = 'BK-' + String(n++).padStart(3, '0'); } while (codes.has(c.toLowerCase()));
      codes.add(c.toLowerCase());
      return c;
    };
    rows.forEach((r) => {
      const existing = r.code && state.items.find((i) => i.code.toLowerCase() === r.code.toLowerCase());
      if (existing) {
        ops.push({ op: 'putItem', item: normaliseItem(Object.assign({}, existing, r, { id: existing.id })) });
        updated++;
      } else {
        const code = r.code || freshCode();
        codes.add(code.toLowerCase());
        ops.push({ op: 'putItem', item: normaliseItem(Object.assign({}, r, { code, id: uid('item') })) });
        added++;
      }
    });
    commit(ops);
    return { added, updated };
  }

  /* ---------- backup ---------- */

  function exportBackup() {
    return {
      app: 'StokBakeri',
      version: 3,
      exportedAt: new Date().toISOString(),
      items: state.items,
      transactions: state.tx,
      lecturers: state.lecturers,
      activeLecturer: state.activeLecturer,
    };
  }

  function restoreBackup(data) {
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.transactions)) {
      throw new Error('Fail sandaran tidak sah.');
    }
    commit([{ op: 'replaceAll', data: {
      items: data.items.map(normaliseItem),
      tx: data.transactions.map(normaliseTx),
      lecturers: Array.isArray(data.lecturers) ? data.lecturers : DEFAULT_LECTURERS,
    } }]);
    if (state.lecturers.includes(data.activeLecturer)) setActiveLecturer(data.activeLecturer);
  }

  /* ---------- sample data ---------- */

  function sampleData() {
    const I = (id, code, name, category, unit, initialStock, minStock, location) =>
      ({ id, code, name, category, unit, initialStock, minStock, location });
    const items = [
      I('item_1', 'TPG-001', 'Tepung Gandum High Protein (Blue Key)', 'Tepung & Serbuk', 'kg', 50, 10, 'Rak A1'),
      I('item_2', 'TPG-002', 'Tepung Gandum Serbaguna (Faiza)', 'Tepung & Serbuk', 'kg', 40, 10, 'Rak A1'),
      I('item_3', 'TNS-001', 'Anchor Unsalted Butter', 'Mentega & Tenusu', 'kg', 25, 5, 'Peti Sejuk 1'),
      I('item_4', 'TNS-002', 'Susu Pekat Manis (F&N)', 'Mentega & Tenusu', 'tin', 15, 4, 'Rak B2'),
      I('item_5', 'GLA-001', 'Gula Pasir Halus', 'Gula & Pemanis', 'kg', 30, 8, 'Rak A2'),
      I('item_6', 'GLA-002', 'Gula Icing (Powdered Sugar)', 'Gula & Pemanis', 'kg', 12, 3, 'Rak A2'),
      I('item_7', 'CHO-001', 'Beryls Dark Chocolate Compound', 'Coklat & Hiasan', 'kg', 20, 5, 'Peti Sejuk 2'),
      I('item_8', 'PRS-001', 'Esen Vanilla Perisa Asli', 'Perisa & Pewarna', 'botol', 8, 2, 'Rak C1'),
      I('item_9', 'ALT-001', 'Acuan Kek Chiffon Aluminium 9 inci', 'Peralatan & Acuan', 'biji', 12, 2, 'Stor Alat 1'),
      I('item_10', 'ALT-002', 'Loyang Bakar 10x10 inci', 'Peralatan & Acuan', 'biji', 10, 2, 'Stor Alat 1'),
      I('item_11', 'BOX-001', 'Kotak Kek Kraf Tingkap (9 inci)', 'Pembungkusan & Kotak', 'biji', 50, 10, 'Rak Kotak'),
      I('item_12', 'BOX-002', 'Plastik Pembungkus Roti Bun', 'Pembungkusan & Kotak', 'paket', 200, 30, 'Rak Kotak'),
    ].map(normaliseItem);
    const d = new Date();
    const day = (n) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    };
    const tx = [
      { id: 'tx_s1', itemId: 'item_1', type: 'TERIMA', quantity: 20, date: day(6), person: 'En. Zulkifli', lecturer: 'Pn. Azlina', notes: 'Pembelian bulanan — Pembekal Maju' },
      { id: 'tx_s2', itemId: 'item_3', type: 'KELUAR', quantity: 5, date: day(4), person: 'Pelajar Tahun 2', lecturer: 'Chef Zulkifli', notes: 'Amali: Kek Chiffon' },
      { id: 'tx_s3', itemId: 'item_7', type: 'KELUAR', quantity: 3, date: day(2), person: 'Pelajar Tahun 1', lecturer: 'Chef Sarah', notes: 'Amali: Pastri & Coklat' },
      { id: 'tx_s4', itemId: 'item_6', type: 'KELUAR', quantity: 9.5, date: day(1), person: 'Pelajar Tahun 1', lecturer: 'Chef Sarah', notes: 'Amali: Cupcake' },
    ].map((t, n) => normaliseTx(Object.assign(t, { createdAt: n + 1 })));
    return { items, tx };
  }

  /** Fill the local copy with sample data without sending it anywhere. */
  function seedSample(quiet) {
    const data = sampleData();
    state.items = data.items;
    state.tx = data.tx;
    if (!quiet) persist();
  }

  window.Store = {
    CATEGORIES, GROUPS, UNITS, state,
    load, onChange, onStatus, status, setPassword, item, stock, stockOf, txSorted,
    codeTaken, nextCode, saveItem, deleteItem, saveTx, addTxBatch, deleteTx,
    setActiveLecturer, addLecturer, removeLecturer,
    clearTx, clearAll, reset, importItems, exportBackup, restoreBackup,
  };
})();
