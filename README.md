# StokBakeri

Laman web pengurusan stok bahan, peralatan dan pembungkusan untuk dapur bakeri & pastri.

- **Papan Utama** — jumlah bahan, stok rendah / habis, pergerakan terkini, jadual stok semasa
- **Bahan** — tambah, kemaskini, padam; cari & tapis ikut kategori atau status
- **Transaksi** — stok terima (+) dan stok keluar (−), boleh dikemaskini; tapis ikut jenis dan tarikh
- **Penggunaan amali** — potong beberapa bahan, peralatan dan kotak sekali gus untuk satu kelas
- **Laporan & Data** — laporan Excel (.xlsx), CSV, import bahan dari Excel, sandaran & pulih (.json)
- Boleh dipasang di telefon seperti aplikasi (PWA) dan berfungsi tanpa internet

Stok semasa = stok awal + jumlah terima − jumlah keluar.

## Di mana data disimpan

Data disimpan dalam pelayar (localStorage) **peranti yang digunakan sahaja**. Setiap telefon/komputer
ada data sendiri. Untuk pindah data, guna **Laporan & Data → Muat turun sandaran**, kemudian
**Pulihkan dari sandaran** di peranti lain. Kunci storan sama dengan versi lama StokBakeri, jadi
jika laman ini diletak di alamat yang sama, data lama akan terus muncul.

## Menerbitkan laman

Ini laman statik biasa (HTML, CSS, JS) tanpa langkah build. Muat naik semua fail dalam repo ini
(`index.html`, `manifest.webmanifest`, `sw.js`, folder `assets/`) ke mana-mana hos statik:

- **EdgeOne Pages** (hos laman sekarang): buat projek baru atau kemas kini projek sedia ada dan
  muat naik folder ini, atau sambungkan repo GitHub ini.
- **Netlify Drop**: seret folder ke <https://app.netlify.com/drop>.
- **GitHub Pages**: Settings → Pages → Deploy from a branch (repo awam, atau pelan berbayar untuk repo peribadi).

Laman perlu dibuka melalui `https://` supaya boleh dipasang sebagai aplikasi dan berfungsi luar talian.

## Pasang di telefon

- **Android (Chrome)**: buka laman → menu ⋮ → *Pasang aplikasi* / *Tambah ke skrin utama*.
- **iPhone (Safari)**: butang Kongsi → *Tambah ke Skrin Utama*.

## Uji di komputer

```sh
python3 -m http.server 8000
# buka http://localhost:8000
```

Selepas mengubah mana-mana fail, naikkan `VERSION` dalam `sw.js` supaya telefon yang sudah
memasang aplikasi mendapat versi baru.
