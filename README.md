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

**Di Vercel dengan pangkalan data (disyorkan):** semua orang yang membuka laman melihat data yang
sama. Perubahan muncul pada peranti lain dalam ~10 saat. Jika internet terputus, rekod tetap boleh
dibuat; ia disimpan dalam telefon dan dihantar apabila sambungan pulih.

**Tanpa pangkalan data** (hos statik lain, atau sebelum pangkalan data disambung): data disimpan
dalam pelayar peranti itu sahaja. Status ditunjukkan di penjuru atas: *Dikongsi*, *Luar talian*
atau *Peranti ini*.

### Sambungkan pangkalan data di Vercel

1. Buka projek di vercel.com → tab **Storage** → **Create Database** → pilih **Upstash for Redis**
   (pelan percuma) → **Connect** ke projek ini. Vercel akan menambah `KV_REST_API_URL` dan
   `KV_REST_API_TOKEN` secara automatik.
2. (Disyorkan) **Settings → Environment Variables** → tambah `APP_PASSWORD` dengan kata laluan
   pilihan anda. Tanpanya, sesiapa yang ada pautan boleh mengubah data.
3. **Deployments** → ⋯ pada deployment terkini → **Redeploy**.

Peranti pertama yang membuka laman selepas itu akan memuat naik datanya (atau data contoh) ke
pangkalan data. Untuk membawa masuk bahan dari laman lama (edgeone.dev): di laman lama tekan
**Eksport Excel**, kemudian di laman baharu **Laporan & Data → Import bahan dari Excel**. Setiap
bahan bermula dengan stok semasanya; log transaksi lama tidak diimport.

API: `api/data.js` (fungsi Vercel, tiada pakej npm diperlukan).

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
