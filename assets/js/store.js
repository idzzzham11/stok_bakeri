/* StokBakeri — data layer.
 * Everything lives in this browser's localStorage. The keys match the
 * original StokBakeri page so existing data on the same domain carries over. */
(function () {
  'use strict';
  const { round, uid, today } = window.U;

  const KEYS = {
    items: 'stok_bakeri_items_v2',
    tx: 'stok_bakeri_tx_v2',
    lecturers: 'stok_bakeri_lecturers_v2',
    activeLecturer: 'stok_bakeri_active_lecturer_v2',
  };

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

  const state = { items: [], tx: [], lecturers: [], activeLecturer: '' };
  const listeners = [];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

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

  function load() {
    const items = read(KEYS.items, null);
    state.items = Array.isArray(items) ? items.map(normaliseItem) : [];
    const tx = read(KEYS.tx, []);
    state.tx = Array.isArray(tx) ? tx.map(normaliseTx) : [];
    const lec = read(KEYS.lecturers, null);
    state.lecturers = Array.isArray(lec) && lec.length ? lec.map(String) : DEFAULT_LECTURERS.slice();
    let active = '';
    try { active = localStorage.getItem(KEYS.activeLecturer) || ''; } catch (e) {}
    state.activeLecturer = state.lecturers.includes(active) ? active : state.lecturers[0];
    // First visit: start with sample data so the page isn't empty.
    if (items == null) seedSample();
  }

  let saveFailedShown = false;
  function save() {
    try {
      localStorage.setItem(KEYS.items, JSON.stringify(state.items));
      localStorage.setItem(KEYS.tx, JSON.stringify(state.tx));
      localStorage.setItem(KEYS.lecturers, JSON.stringify(state.lecturers));
      localStorage.setItem(KEYS.activeLecturer, state.activeLecturer);
      saveFailedShown = false;
    } catch (e) {
      if (!saveFailedShown) {
        saveFailedShown = true;
        window.U.toast('Data tidak dapat disimpan dalam pelayar ini (mod peribadi atau storan penuh). Muat turun sandaran.', true);
      }
    }
    listeners.forEach((fn) => fn());
  }

  function onChange(fn) { listeners.push(fn); }

  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (Object.values(KEYS).includes(e.key)) {
      load();
      listeners.forEach((fn) => fn());
    }
  });

  /* ---------- Queries ---------- */

  function item(id) { return state.items.find((i) => i.id === id); }

  function totals() {
    const map = {};
    state.items.forEach((i) => { map[i.id] = { in: 0, out: 0 }; });
    state.tx.forEach((t) => {
      const m = map[t.itemId];
      if (!m) return;
      if (t.type === 'TERIMA') m.in += t.quantity; else m.out += t.quantity;
    });
    return map;
  }

  /** Stock info for every item: { item, initial, in, out, current, status }. */
  function stock() {
    const t = totals();
    return state.items.map((i) => {
      const m = t[i.id];
      const current = round(i.initialStock + m.in - m.out);
      return { item: i, initial: i.initialStock, in: round(m.in), out: round(m.out), current, status: status(current, i.minStock) };
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

  function status(current, min) {
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

  /* ---------- Mutations ---------- */

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

  function saveItem(data) {
    const clean = normaliseItem(data);
    const existing = data.id && item(data.id);
    if (existing) Object.assign(existing, clean, { id: existing.id });
    else state.items.push(clean);
    save();
    return clean;
  }

  function deleteItem(id) {
    state.items = state.items.filter((i) => i.id !== id);
    state.tx = state.tx.filter((t) => t.itemId !== id);
    save();
  }

  function saveTx(data) {
    const clean = normaliseTx(data);
    const idx = data.id ? state.tx.findIndex((t) => t.id === data.id) : -1;
    if (idx >= 0) {
      clean.createdAt = state.tx[idx].createdAt;
      state.tx[idx] = clean;
    } else {
      clean.createdAt = Date.now();
      state.tx.push(clean);
    }
    save();
    return clean;
  }

  function addTxBatch(list) {
    const now = Date.now();
    list.forEach((d, n) => {
      const t = normaliseTx(d);
      t.createdAt = now + n;
      state.tx.push(t);
    });
    save();
  }

  function deleteTx(id) {
    state.tx = state.tx.filter((t) => t.id !== id);
    save();
  }

  function setActiveLecturer(name) {
    state.activeLecturer = name;
    save();
  }

  function addLecturer(name) {
    state.lecturers.push(name);
    save();
  }

  function removeLecturer(name) {
    state.lecturers = state.lecturers.filter((l) => l !== name);
    if (state.activeLecturer === name) state.activeLecturer = state.lecturers[0] || '';
    save();
  }

  function clearTx() { state.tx = []; save(); }
  function clearAll() { state.items = []; state.tx = []; save(); }

  function reset() {
    state.items = [];
    state.tx = [];
    state.lecturers = DEFAULT_LECTURERS.slice();
    state.activeLecturer = state.lecturers[0];
    seedSample();
  }

  /** Add or update items by code (from an Excel import). Returns counts. */
  function importItems(rows) {
    let added = 0, updated = 0;
    rows.forEach((r) => {
      const existing = r.code && state.items.find((i) => i.code.toLowerCase() === r.code.toLowerCase());
      if (existing) {
        Object.assign(existing, normaliseItem(Object.assign({}, existing, r, { id: existing.id })));
        updated++;
      } else {
        state.items.push(normaliseItem(Object.assign({ code: nextCode() }, r, { id: uid('item') })));
        added++;
      }
    });
    save();
    return { added, updated };
  }

  /* ---------- Backup ---------- */

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
    state.items = data.items.map(normaliseItem);
    state.tx = data.transactions.map(normaliseTx);
    state.lecturers = Array.isArray(data.lecturers) && data.lecturers.length ? data.lecturers.map(String) : DEFAULT_LECTURERS.slice();
    state.activeLecturer = state.lecturers.includes(data.activeLecturer) ? data.activeLecturer : state.lecturers[0];
    save();
  }

  /* ---------- Sample data ---------- */

  function seedSample() {
    const I = (id, code, name, category, unit, initialStock, minStock, location) =>
      ({ id, code, name, category, unit, initialStock, minStock, location });
    state.items = [
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
    state.tx = [
      { id: 'tx_s1', itemId: 'item_1', type: 'TERIMA', quantity: 20, date: day(6), person: 'En. Zulkifli', lecturer: 'Pn. Azlina', notes: 'Pembelian bulanan — Pembekal Maju' },
      { id: 'tx_s2', itemId: 'item_3', type: 'KELUAR', quantity: 5, date: day(4), person: 'Pelajar Tahun 2', lecturer: 'Chef Zulkifli', notes: 'Amali: Kek Chiffon' },
      { id: 'tx_s3', itemId: 'item_7', type: 'KELUAR', quantity: 3, date: day(2), person: 'Pelajar Tahun 1', lecturer: 'Chef Sarah', notes: 'Amali: Pastri & Coklat' },
      { id: 'tx_s4', itemId: 'item_6', type: 'KELUAR', quantity: 9.5, date: day(1), person: 'Pelajar Tahun 1', lecturer: 'Chef Sarah', notes: 'Amali: Cupcake' },
    ].map((t, n) => normaliseTx(Object.assign(t, { createdAt: n + 1 })));
    save();
  }

  window.Store = {
    CATEGORIES, GROUPS, UNITS, state,
    load, onChange, item, stock, stockOf, status, txSorted,
    codeTaken, nextCode, saveItem, deleteItem, saveTx, addTxBatch, deleteTx,
    setActiveLecturer, addLecturer, removeLecturer,
    clearTx, clearAll, reset, importItems, exportBackup, restoreBackup,
  };
})();
