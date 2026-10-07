# stok_bakeri
Android app (APK) that opens https://2026hbp.edgeone.dev/ full screen.

## Get the APK

Every push is built by GitHub Actions (`.github/workflows/build-apk.yml`).

- Easiest: open the repo's **Releases** page, pick **Stok Bakeri (latest build)** and download `StokBakeri.apk`.
- Or: **Actions** tab → latest **Build APK** run → download the `StokBakeri-apk` artifact (a zip containing the APK).

On the phone, open the APK and allow "Install unknown apps" when asked.

## Change the website or name

- Website: `app/src/main/res/values/strings.xml` → `start_url`
- App name: same file → `app_name`
- Icons: `app/src/main/res/mipmap-*/`

The APK is signed with `app/debug.keystore` (committed on purpose, so new builds install as updates). It is not suitable for the Play Store.
