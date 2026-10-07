/* StokBakeri — pages, forms and reports */
(function () {
  'use strict';
  const { esc, fmt, round, today, fmtDate, toast, download, loadScript } = window.U;
  const S = window.Store;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // STOK_EMBED is set when the page runs inside a sandboxed viewer that blocks downloads.
  const EMBED = !!window.STOK_EMBED;
  const XLSX_SRC = EMBED
    ? 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    : 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

  const STATUS = {
    cukup: { label: 'Mencukupi', cls: 'b-ok' },
    rendah: { label: 'Stok rendah', cls: 'b-low' },
    habis: { label: 'Tiada stok', cls: 'b-out' },
  };
  const TITLES = { papan: 'Papan Utama', bahan: 'Senarai Bahan', transaksi: 'Log Transaksi', data: 'Laporan & Data' };

  const badge = (st) => `<span class="badge ${STATUS[st].cls}">${STATUS[st].label}</span>`;
  const typeBadge = (type) => type === 'TERIMA'
    ? '<span class="badge b-in">Terima</span>'
    : '<span class="badge b-use">Keluar</span>';
  const qty = (t, unit) => `<span class="${t.type === 'TERIMA' ? 'q-in' : 'q-out'}">${t.type === 'TERIMA' ? '+' : '−'}${fmt(t.quantity)} ${esc(unit)}</span>`;
  const iconBtn = (icon, label, attrs) =>
    `<button type="button" class="btn btn-ghost icon-only" title="${label}" aria-label="${label}" ${attrs}><svg class="i"><use href="#i-${icon}"/></svg></button>`;

  /* ---------------- Routing ---------------- */

  let view = 'papan';
  function route() {
    const path = location.hash.replace(/^#\/?/, '') || 'papan';
    view = TITLES[path] ? path : 'papan';
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    $$('.nav-links a').forEach((a) => {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#page-title').textContent = TITLES[view];
    document.title = TITLES[view] + ' — StokBakeri';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- Rendering ---------------- */

  function render() {
    renderChrome();
    if (view === 'papan') renderDashboard();
    else if (view === 'bahan') renderItems();
    else if (view === 'transaksi') renderTx();
  }

  function renderChrome() {
    const { lecturers, activeLecturer, items } = S.state;
    $('#active-lecturer').innerHTML = lecturers
      .map((l) => `<option${l === activeLecturer ? ' selected' : ''}>${esc(l)}</option>`).join('');
    $('#lecturer-options').innerHTML = lecturers.map((l) => `<option value="${esc(l)}">`).join('');
    $('#nav-count').textContent = items.length + ' bahan berdaftar';
  }

  function renderDashboard() {
    const rows = S.stock();
    const low = rows.filter((r) => r.status === 'rendah');
    const out = rows.filter((r) => r.status === 'habis');
    const month = today().slice(0, 7);
    const monthTx = S.state.tx.filter((t) => t.date.startsWith(month));
    $('#kpi-items').textContent = rows.length;
    $('#kpi-low').textContent = low.length;
    $('#kpi-out').textContent = out.length;
    $('#kpi-month').textContent = monthTx.length;
    const nIn = monthTx.filter((t) => t.type === 'TERIMA').length;
    $('#kpi-month-sub').textContent = `${nIn} terima · ${monthTx.length - nIn} keluar`;

    const attention = out.concat(low.sort((a, b) => a.current / (a.item.minStock || 1) - b.current / (b.item.minStock || 1)));
    $('#attention-list').innerHTML = attention.length
      ? attention.slice(0, 6).map((r) => `
        <li>
          <div class="li-main"><div class="li-title">${esc(r.item.name)}</div><div class="li-sub">${esc(r.item.code)} · minima ${fmt(r.item.minStock)} ${esc(r.item.unit)}</div></div>
          <div class="li-end"><div class="${r.status === 'habis' ? 't-bad' : 't-warn'}"><strong>${fmt(r.current)}</strong> ${esc(r.item.unit)}</div>${badge(r.status)}</div>
        </li>`).join('')
      : '<li class="empty-li">Semua stok mencukupi.</li>';

    const recent = S.txSorted().slice(0, 6);
    $('#recent-list').innerHTML = recent.length
      ? recent.map((t) => {
        const it = S.item(t.itemId);
        return `
        <li>
          <div class="li-main"><div class="li-title">${esc(it ? it.name : 'Bahan dipadam')}</div><div class="li-sub">${esc(t.person)} · ${esc(t.lecturer)}</div></div>
          <div class="li-end">${qty(t, it ? it.unit : '')}<div class="li-sub">${fmtDate(t.date)}</div></div>
        </li>`;
      }).join('')
      : '<li class="empty-li">Tiada pergerakan stok lagi.</li>';

    $('#stock-tbody').innerHTML = rows.length
      ? rows.map((r) => `
        <tr>
          <td class="full" data-label="Bahan"><span class="strong">${esc(r.item.name)}</span><span class="sub">${esc(r.item.code)}</span></td>
          <td class="hide-m" data-label="Kategori">${esc(r.item.category)}</td>
          <td class="num hide-m" data-label="Awal">${fmt(r.initial)}</td>
          <td class="num hide-m ${r.in ? 'q-in' : 'muted'}" data-label="+ Terima">${r.in ? '+' + fmt(r.in) : '0'}</td>
          <td class="num hide-m ${r.out ? 'q-out' : 'muted'}" data-label="− Keluar">${r.out ? '−' + fmt(r.out) : '0'}</td>
          <td class="num strong" data-label="Semasa">${fmt(r.current)} ${esc(r.item.unit)}</td>
          <td data-label="Status">${badge(r.status)}</td>
        </tr>`).join('')
      : '<tr><td class="full empty" colspan="7">Belum ada bahan. Klik "Tambah bahan" untuk mula.</td></tr>';
  }

  function renderItems() {
    const q = $('#item-search').value.trim().toLowerCase();
    const cat = $('#item-cat').value;
    const st = $('#item-status').value;
    const rows = S.stock().filter((r) => {
      const i = r.item;
      if (cat && i.category !== cat) return false;
      if (st === 'rendah' && r.status === 'cukup') return false;
      if (st && st !== 'rendah' && r.status !== st) return false;
      return !q || [i.code, i.name, i.location, i.category].some((v) => v.toLowerCase().includes(q));
    });
    $('#items-empty').hidden = rows.length > 0;
    $('#items-tbody').innerHTML = rows.map((r) => `
      <tr>
        <td class="code" data-label="Kod">${esc(r.item.code)}</td>
        <td class="full" data-label="Nama"><span class="strong">${esc(r.item.name)}</span><span class="sub m-only">${esc(r.item.category)}</span></td>
        <td class="hide-m" data-label="Kategori">${esc(r.item.category)}</td>
        <td data-label="Unit">${esc(r.item.unit)}</td>
        <td class="num strong" data-label="Semasa">${fmt(r.current)}</td>
        <td class="num" data-label="Minima">${fmt(r.item.minStock)}</td>
        <td data-label="Status">${badge(r.status)}</td>
        <td data-label="Lokasi">${esc(r.item.location || '-')}</td>
        <td class="actions">
          ${iconBtn('swap', 'Rekod stok', `data-tx-for="${esc(r.item.id)}"`)}
          ${iconBtn('edit', 'Kemaskini', `data-edit-item="${esc(r.item.id)}"`)}
          ${iconBtn('trash', 'Padam', `data-del-item="${esc(r.item.id)}"`)}
        </td>
      </tr>`).join('');
  }

  function filteredTx() {
    const q = $('#tx-search').value.trim().toLowerCase();
    const type = $('#tx-type').value;
    const from = $('#tx-from').value;
    const to = $('#tx-to').value;
    return S.txSorted().filter((t) => {
      if (type && t.type !== type) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (!q) return true;
      const it = S.item(t.itemId);
      return [it ? it.name : '', it ? it.code : '', t.person, t.lecturer, t.notes].some((v) => v.toLowerCase().includes(q));
    });
  }

  function renderTx() {
    const list = filteredTx();
    $('#tx-empty').hidden = list.length > 0;
    $('#tx-tbody').innerHTML = list.map((t) => {
      const it = S.item(t.itemId);
      return `
      <tr>
        <td data-label="Tarikh">${fmtDate(t.date)}</td>
        <td data-label="Jenis">${typeBadge(t.type)}</td>
        <td class="full" data-label="Bahan"><span class="strong">${esc(it ? it.name : 'Bahan dipadam')}</span></td>
        <td class="num" data-label="Kuantiti">${qty(t, it ? it.unit : '')}</td>
        <td data-label="Oleh">${esc(t.person)}</td>
        <td data-label="Pensyarah">${esc(t.lecturer)}</td>
        <td class="wrap full" data-label="Catatan">${esc(t.notes)}</td>
        <td class="actions">
          ${iconBtn('edit', 'Kemaskini', `data-edit-tx="${esc(t.id)}"`)}
          ${iconBtn('trash', 'Padam', `data-del-tx="${esc(t.id)}"`)}
        </td>
      </tr>`;
    }).join('');
    const nIn = list.filter((t) => t.type === 'TERIMA').length;
    $('#tx-summary').textContent = list.length
      ? `${list.length} rekod dipaparkan · ${nIn} terima · ${list.length - nIn} keluar`
      : '';
  }

  /* ---------------- Dialog helpers ---------------- */

  function openDialog(dlg) {
    $('.form-error', dlg) && ($('.form-error', dlg).textContent = '');
    $$('[aria-invalid]', dlg).forEach((el) => el.removeAttribute('aria-invalid'));
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  function formError(form, msg, field) {
    $('.form-error', form).textContent = msg;
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    return false;
  }
  /** Check required fields; returns false and shows a message on the first problem. */
  function checkRequired(form) {
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    for (const el of $$('input[required], select[required]', form)) {
      if (!String(el.value).trim()) {
        const label = el.closest('label')?.querySelector('span')?.textContent.replace(' *', '') || 'Medan';
        return formError(form, `Sila isi: ${label}.`, el);
      }
    }
    return true;
  }

  function confirmDialog(title, desc, okLabel) {
    const dlg = $('#dlg-confirm');
    $('#confirm-title').textContent = title;
    $('#confirm-desc').textContent = desc;
    $('#confirm-ok').textContent = okLabel || 'Padam';
    openDialog(dlg);
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    });
  }

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeDialog(closer.closest('dialog'));
  });
  // Close when tapping the backdrop.
  $$('dialog').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); }));

  function fillSelect(sel, options, value) {
    sel.innerHTML = options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
    if (value != null) {
      if (!options.some(([v]) => v === value)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`);
      sel.value = value;
    }
  }

  /* ---------------- Item form ---------------- */

  const itemForm = $('#form-item');
  function openItem(id) {
    const it = id ? S.item(id) : null;
    itemForm.reset();
    $('#dlg-item-title').textContent = it ? 'Kemaskini bahan' : 'Tambah bahan';
    fillSelect(itemForm.category, S.CATEGORIES.map((c) => [c.name, c.name]), it ? it.category : S.CATEGORIES[0].name);
    fillSelect(itemForm.unit, S.UNITS, it ? it.unit : 'kg');
    itemForm.id.value = it ? it.id : '';
    itemForm.code.value = it ? it.code : S.nextCode();
    itemForm.name.value = it ? it.name : '';
    itemForm.initialStock.value = it ? it.initialStock : 0;
    itemForm.minStock.value = it ? it.minStock : 5;
    itemForm.location.value = it ? it.location : '';
    openDialog($('#dlg-item'));
    setTimeout(() => itemForm.name.focus(), 50);
  }
  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkRequired(itemForm)) return;
    const f = itemForm;
    if (S.codeTaken(f.code.value, f.id.value)) return formError(f, 'Kod item ini sudah digunakan.', f.code);
    for (const el of [f.initialStock, f.minStock]) {
      if (!(Number(el.value) >= 0)) return formError(f, 'Nilai stok mestilah nombor 0 atau lebih.', el);
    }
    const isEdit = !!f.id.value;
    S.saveItem({
      id: f.id.value, code: f.code.value, name: f.name.value, category: f.category.value, unit: f.unit.value,
      initialStock: Number(f.initialStock.value), minStock: Number(f.minStock.value), location: f.location.value,
    });
    closeDialog($('#dlg-item'));
    toast(isEdit ? 'Bahan dikemaskini.' : 'Bahan baru ditambah.');
  });

  /* ---------------- Transaction form ---------------- */

  const txForm = $('#form-tx');
  function itemOptions(filterFn) {
    return S.stock()
      .filter((r) => !filterFn || filterFn(r.item))
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
      .map((r) => [r.item.id, `${r.item.name} (${r.item.code}) — ${fmt(r.current)} ${r.item.unit}`]);
  }
  function openTx(opts) {
    opts = opts || {};
    if (!S.state.items.length) { toast('Tambah bahan dahulu sebelum merekod stok.', true); return; }
    const t = opts.id ? S.state.tx.find((x) => x.id === opts.id) : null;
    txForm.reset();
    $('#dlg-tx-title').textContent = t ? 'Kemaskini rekod stok' : 'Rekod pergerakan stok';
    const opt = [['', 'Pilih bahan…']].concat(itemOptions());
    fillSelect(txForm.itemId, opt, t ? (S.item(t.itemId) ? t.itemId : '') : (opts.itemId || ''));
    txForm.id.value = t ? t.id : '';
    txForm.type.value = t ? t.type : (opts.type || 'TERIMA');
    txForm.quantity.value = t ? t.quantity : '';
    txForm.date.value = t ? t.date : today();
    txForm.person.value = t ? t.person : '';
    txForm.lecturer.value = t ? t.lecturer : S.state.activeLecturer;
    txForm.notes.value = t ? t.notes : '';
    updateTxHint();
    openDialog($('#dlg-tx'));
  }
  function txAvailable() {
    return S.stockOf(txForm.itemId.value, txForm.id.value || undefined);
  }
  function updateTxHint() {
    const hint = $('#tx-stock-hint');
    const it = S.item(txForm.itemId.value);
    if (!it) { hint.textContent = ''; hint.className = 'hint'; return; }
    const avail = txAvailable();
    const q = Number(txForm.quantity.value) || 0;
    const after = round(txForm.type.value === 'TERIMA' ? avail + q : avail - q);
    hint.textContent = `Stok semasa: ${fmt(avail)} ${it.unit}` + (q ? ` → selepas rekod: ${fmt(after)} ${it.unit}` : '');
    hint.className = 'hint' + (after < 0 ? ' warn' : '');
  }
  txForm.addEventListener('input', updateTxHint);
  txForm.addEventListener('change', updateTxHint);
  txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkRequired(txForm)) return;
    const f = txForm;
    const q = Number(f.quantity.value);
    if (!(q > 0)) return formError(f, 'Kuantiti mestilah lebih daripada 0.', f.quantity);
    if (f.type.value === 'KELUAR' && q > txAvailable()) {
      const it = S.item(f.itemId.value);
      return formError(f, `Kuantiti melebihi stok semasa (${fmt(txAvailable())} ${it.unit}).`, f.quantity);
    }
    const isEdit = !!f.id.value;
    S.saveTx({
      id: f.id.value, itemId: f.itemId.value, type: f.type.value, quantity: q, date: f.date.value,
      person: f.person.value, lecturer: f.lecturer.value, notes: f.notes.value,
    });
    closeDialog($('#dlg-tx'));
    toast(isEdit ? 'Rekod dikemaskini.' : (f.type.value === 'TERIMA' ? 'Stok terima direkod.' : 'Stok keluar direkod.'));
  });

  /* ---------------- Practical-usage (amali) form ---------------- */

  const amaliForm = $('#form-amali');
  const groupOf = (item) => (S.CATEGORIES.find((c) => c.name === item.category) || { group: 'bahan' }).group;

  function openAmali() {
    if (!S.state.items.length) { toast('Tambah bahan dahulu.', true); return; }
    amaliForm.reset();
    amaliForm.lecturer.value = S.state.activeLecturer;
    amaliForm.date.value = today();
    $('#amali-groups').innerHTML = S.GROUPS.map((g) => `
      <div class="amali-group" data-group="${g.key}">
        <div class="amali-group-head"><h3>${esc(g.label)}</h3>
          <button type="button" class="btn btn-soft sm" data-add-row="${g.key}"><svg class="i"><use href="#i-plus"/></svg>Tambah</button></div>
        <div class="amali-rows"></div>
      </div>`).join('');
    addAmaliRow('bahan');
    openDialog($('#dlg-amali'));
  }
  function addAmaliRow(group) {
    const box = $(`.amali-group[data-group="${group}"] .amali-rows`, amaliForm);
    const opts = itemOptions((i) => groupOf(i) === group);
    if (!opts.length) {
      if (!$('.muted', box)) box.insertAdjacentHTML('beforeend', '<p class="muted small">Tiada bahan dalam kumpulan ini.</p>');
      return;
    }
    const row = document.createElement('div');
    row.className = 'amali-row';
    row.innerHTML = `
      <select class="a-item" aria-label="Bahan"><option value="">Pilih…</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
      <input class="a-qty" type="number" inputmode="decimal" step="any" min="0" placeholder="Kuantiti" aria-label="Kuantiti">
      ${iconBtn('x', 'Buang baris', 'data-remove-row')}
      <span class="left"></span>`;
    box.appendChild(row);
  }
  function amaliRows() {
    return $$('.amali-row', amaliForm).map((row) => ({
      row, itemId: $('.a-item', row).value, qty: Number($('.a-qty', row).value) || 0,
    }));
  }
  function updateAmaliHints() {
    const used = {};
    amaliRows().forEach((r) => {
      const left = $('.left', r.row);
      const it = S.item(r.itemId);
      if (!it) { left.textContent = ''; return; }
      used[r.itemId] = round((used[r.itemId] || 0) + r.qty);
      const remain = round(S.stockOf(r.itemId) - used[r.itemId]);
      left.textContent = `Baki selepas potong: ${fmt(remain)} ${it.unit}`;
      left.className = 'left' + (remain < 0 ? ' warn' : '');
    });
  }
  amaliForm.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-row]');
    if (add) addAmaliRow(add.dataset.addRow);
    const rm = e.target.closest('[data-remove-row]');
    if (rm) { rm.closest('.amali-row').remove(); updateAmaliHints(); }
  });
  amaliForm.addEventListener('input', updateAmaliHints);
  amaliForm.addEventListener('change', updateAmaliHints);
  amaliForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkRequired(amaliForm)) return;
    const rows = amaliRows().filter((r) => r.itemId || r.qty);
    for (const r of rows) {
      if (!r.itemId) return formError(amaliForm, 'Pilih bahan untuk setiap baris (atau buang baris kosong).', $('.a-item', r.row));
      if (!(r.qty > 0)) return formError(amaliForm, 'Kuantiti mestilah lebih daripada 0.', $('.a-qty', r.row));
    }
    if (!rows.length) return formError(amaliForm, 'Masukkan sekurang-kurangnya satu bahan.');
    const totalsById = {};
    rows.forEach((r) => { totalsById[r.itemId] = round((totalsById[r.itemId] || 0) + r.qty); });
    for (const id of Object.keys(totalsById)) {
      if (totalsById[id] > S.stockOf(id)) {
        const it = S.item(id);
        return formError(amaliForm, `${it.name}: kuantiti melebihi stok semasa (${fmt(S.stockOf(id))} ${it.unit}).`);
      }
    }
    const f = amaliForm;
    S.addTxBatch(rows.map((r) => ({
      itemId: r.itemId, type: 'KELUAR', quantity: r.qty, date: f.date.value,
      person: f.person.value || 'Sesi Amali Pelajar', lecturer: f.lecturer.value, notes: 'Amali: ' + f.recipe.value.trim(),
    })));
    closeDialog($('#dlg-amali'));
    toast(`Penggunaan amali direkod (${rows.length} item dipotong).`);
  });

  /* ---------------- Lecturers ---------------- */

  const lecForm = $('#form-lecturer');
  function renderLecturerList() {
    $('#lecturer-list').innerHTML = S.state.lecturers.map((l) => `
      <li><span class="li-title">${esc(l)}</span>${iconBtn('trash', 'Buang ' + esc(l), `data-del-lec="${esc(l)}"`)}</li>`).join('');
  }
  function openLecturers() {
    lecForm.reset();
    renderLecturerList();
    openDialog($('#dlg-lecturers'));
  }
  lecForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = lecForm.name.value.trim();
    if (!name) return formError(lecForm, 'Masukkan nama pensyarah.', lecForm.name);
    if (S.state.lecturers.some((l) => l.toLowerCase() === name.toLowerCase())) return formError(lecForm, 'Nama ini sudah ada dalam senarai.', lecForm.name);
    S.addLecturer(name);
    lecForm.reset();
    $('.form-error', lecForm).textContent = '';
    renderLecturerList();
    toast('Pensyarah ditambah.');
  });
  $('#lecturer-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-lec]');
    if (!b) return;
    if (S.state.lecturers.length <= 1) return formError(lecForm, 'Sekurang-kurangnya satu pensyarah diperlukan.');
    S.removeLecturer(b.dataset.delLec);
    renderLecturerList();
  });

  /* ---------------- Excel / CSV / backup ---------------- */

  async function xlsx() {
    try {
      await loadScript(XLSX_SRC);
      return window.XLSX;
    } catch (e) {
      toast('Perpustakaan Excel tidak dapat dimuat. Semak sambungan internet.', true);
      throw e;
    }
  }

  function stockSheetRows() {
    return S.stock().map((r, n) => ({
      'No': n + 1,
      'Kod Item': r.item.code,
      'Nama Bahan / Peralatan': r.item.name,
      'Kategori': r.item.category,
      'Unit': r.item.unit,
      'Stok Awal': r.initial,
      'Total Terima': r.in,
      'Total Keluar': r.out,
      'Stok Semasa': r.current,
      'Minima': r.item.minStock,
      'Status': STATUS[r.status].label,
      'Lokasi': r.item.location,
    }));
  }

  async function exportXlsx() {
    if (!S.state.items.length) return toast('Tiada data untuk dieksport.', true);
    const X = await xlsx();
    const txRows = S.txSorted().slice().reverse().map((t, n) => {
      const it = S.item(t.itemId);
      return {
        'No': n + 1, 'Tarikh': t.date, 'Jenis': t.type, 'Kod Item': it ? it.code : '-',
        'Nama Bahan': it ? it.name : 'Dipadam', 'Kuantiti': t.quantity, 'Unit': it ? it.unit : '',
        'Diambil / Diterima Oleh': t.person, 'Pensyarah': t.lecturer, 'Catatan / Resepi': t.notes,
      };
    });
    const wb = X.utils.book_new();
    const ws1 = X.utils.json_to_sheet(stockSheetRows());
    ws1['!cols'] = [6, 12, 38, 22, 8, 10, 12, 12, 12, 9, 13, 16].map((w) => ({ wch: w }));
    const ws2 = X.utils.json_to_sheet(txRows.length ? txRows : [{ 'Tarikh': '', 'Jenis': '' }]);
    ws2['!cols'] = [6, 12, 9, 12, 34, 10, 8, 24, 18, 34].map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws1, 'Stok Semasa');
    X.utils.book_append_sheet(wb, ws2, 'Log Transaksi');
    X.writeFile(wb, `Laporan_Stok_Bakeri_${today()}.xlsx`);
    toast('Laporan Excel dimuat turun.');
  }

  function exportCsv() {
    if (!S.state.items.length) return toast('Tiada data untuk dieksport.', true);
    const rows = stockSheetRows();
    const head = Object.keys(rows[0]);
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [head.map(cell).join(',')].concat(rows.map((r) => head.map((h) => cell(r[h])).join(','))).join('\r\n');
    download(`Ringkasan_Stok_Bakeri_${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    toast('Fail CSV dimuat turun.');
  }

  async function importXlsx(file) {
    const X = await xlsx();
    const wb = X.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = X.utils.sheet_to_json(sheet, { defval: '' });
    const pick = (row, names) => {
      for (const key of Object.keys(row)) {
        if (names.includes(key.trim().toLowerCase()) && String(row[key]).trim() !== '') return String(row[key]).trim();
      }
      return undefined;
    };
    const catNames = S.CATEGORIES.map((c) => c.name);
    const rows = raw.map((r) => {
      const name = pick(r, ['nama bahan / peralatan', 'nama bahan', 'nama', 'name']);
      if (!name) return null;
      const category = pick(r, ['kategori', 'category']);
      const stock = pick(r, ['stok awal', 'initialstock', 'stok semasa', 'stoksemasa']);
      const min = pick(r, ['minima', 'amaran minima', 'minstock']);
      const out = { name };
      const code = pick(r, ['kod item', 'kod', 'code']);
      if (code) out.code = code;
      if (category) out.category = catNames.find((c) => c.toLowerCase() === category.toLowerCase()) || 'Lain-Lain';
      const unit = pick(r, ['unit']);
      if (unit) out.unit = unit;
      if (stock !== undefined && !isNaN(Number(stock))) out.initialStock = Number(stock);
      if (min !== undefined && !isNaN(Number(min))) out.minStock = Number(min);
      const loc = pick(r, ['lokasi', 'location']);
      if (loc) out.location = loc;
      return out;
    }).filter(Boolean);
    if (!rows.length) return toast('Tiada baris dengan lajur "Nama Bahan / Peralatan" dijumpai.', true);
    const { added, updated } = S.importItems(rows);
    toast(`Import selesai: ${added} bahan baru, ${updated} dikemaskini.`);
  }

  function backup() {
    download(`Sandaran_StokBakeri_${today()}.json`, JSON.stringify(S.exportBackup(), null, 2), 'application/json');
    toast('Sandaran dimuat turun.');
  }

  async function restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast('Fail bukan sandaran JSON yang sah.', true); }
    if (!data || !Array.isArray(data.items)) return toast('Fail sandaran tidak sah.', true);
    const ok = await confirmDialog('Pulihkan sandaran?',
      `Data semasa akan diganti dengan ${data.items.length} bahan dan ${(data.transactions || []).length} transaksi daripada sandaran.`, 'Pulihkan');
    if (!ok) return;
    try { S.restoreBackup(data); toast('Data dipulihkan.'); } catch (e) { toast(e.message, true); }
  }

  /* ---------------- Theme ---------------- */

  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark' : darkMQ.matches;
  function syncThemeIcon() { $('#theme-icon').setAttribute('href', isDark() ? '#i-sun' : '#i-moon'); }
  $('#btn-theme').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('stok_bakeri_theme', next); } catch (e) {}
    syncThemeIcon();
  });
  darkMQ.addEventListener && darkMQ.addEventListener('change', syncThemeIcon);

  /* ---------------- Wiring ---------------- */

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-open]');
    if (!t) return;
    const d = t.dataset;
    if (d.open === 'item') openItem();
    else if (d.open === 'tx') openTx();
    else if (d.open === 'amali') openAmali();
    else if (d.editItem) openItem(d.editItem);
    else if (d.txFor) openTx({ itemId: d.txFor });
    else if (d.editTx) openTx({ id: d.editTx });
    else if (d.delItem) {
      const it = S.item(d.delItem);
      const n = S.state.tx.filter((x) => x.itemId === it.id).length;
      if (await confirmDialog(`Padam "${it.name}"?`, n ? `${n} rekod transaksi untuk bahan ini juga akan dipadam.` : 'Bahan ini akan dibuang daripada senarai.')) {
        S.deleteItem(it.id); toast('Bahan dipadam.');
      }
    } else if (d.delTx) {
      if (await confirmDialog('Padam rekod ini?', 'Stok semasa akan dikira semula tanpa rekod ini.')) {
        S.deleteTx(d.delTx); toast('Rekod dipadam.');
      }
    } else if (d.danger === 'tx') {
      if (await confirmDialog('Padam semua log transaksi?', `${S.state.tx.length} rekod akan dipadam. Senarai bahan kekal.`)) { S.clearTx(); toast('Semua log transaksi dipadam.'); }
    } else if (d.danger === 'items') {
      if (await confirmDialog('Padam semua bahan?', 'Semua bahan dan semua transaksi akan dipadam.')) { S.clearAll(); toast('Semua bahan dipadam.'); }
    } else if (d.danger === 'reset') {
      if (await confirmDialog('Reset sistem?', 'Semua data akan dipadam dan diganti dengan data contoh.', 'Reset')) { S.reset(); toast('Sistem di-reset.'); }
    }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-filter-status]');
    if (a) $('#item-status').value = a.dataset.filterStatus;
  });
  if (EMBED) {
    $$('[data-download]').forEach((el) => { el.hidden = true; });
    $$('[data-embed-note]').forEach((el) => { el.hidden = false; });
  }

  $('#btn-lecturers').addEventListener('click', openLecturers);
  $('#active-lecturer').addEventListener('change', (e) => { S.setActiveLecturer(e.target.value); toast('Pensyarah aktif: ' + e.target.value); });
  $('#btn-xlsx').addEventListener('click', () => exportXlsx().catch(() => {}));
  $('#btn-csv').addEventListener('click', exportCsv);
  $('#btn-backup').addEventListener('click', backup);
  $('#file-xlsx').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) importXlsx(f).catch((err) => { console.error(err); toast('Gagal membaca fail. Pastikan formatnya .xlsx, .xls atau .csv.', true); });
  });
  $('#file-backup').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) restore(f);
  });
  ['#item-search', '#item-cat', '#item-status'].forEach((s) => $(s).addEventListener('input', renderItems));
  ['#tx-search', '#tx-type', '#tx-from', '#tx-to'].forEach((s) => $(s).addEventListener('input', renderTx));

  $('#item-cat').insertAdjacentHTML('beforeend', S.CATEGORIES.map((c) => `<option>${esc(c.name)}</option>`).join(''));

  S.load();
  S.onChange(render);
  window.addEventListener('hashchange', route);
  syncThemeIcon();
  route();

  if (!EMBED && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
