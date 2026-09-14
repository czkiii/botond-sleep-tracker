# Solemi Sleep — Google-belépés internal beállítása

Státusz: a kód, a staging D1 séma és a Google OAuth Web client elkészült; a staging Worker auth-verziója deployolva van. Az internal Pages buildkapcsoló és a valódi Google-login próba még hátravan.

## Google Cloud Console

1. Válaszd ki vagy hozd létre a Solemi Sleephez tartozó Google Cloud projektet.
2. A Google Auth Platform felületén állítsd be az alkalmazás nevét, support e-mailjét és fejlesztői kapcsolattartóját.
3. Tesztelés alatt add hozzá a belépésre használható Google-fiókokat tesztfelhasználóként.
4. Hozz létre egy `Web application` típusú OAuth 2.0 clientet `Solemi Sleep Internal` néven.
5. Engedélyezett JavaScript originek:
   - `https://solemi-sleep-internal.pages.dev`
   - `http://localhost:5173`
6. Redirect URI nem szükséges a jelenlegi Google Identity Services popup-alapú belépéshez.
7. Másold ki a publikus, `.apps.googleusercontent.com` végű client ID-t. A böngészős folyamathoz a client secret nem szükséges; ne küldd el és ne tedd a repóba.

A Google hivatalos útmutatója: [OAuth client ID létrehozása](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). A szerver a Google előírása szerint ellenőrzi az aláírást, audience-ot, issuert és lejáratot, és kizárólag a `sub` claimet használja stabil identitásként: [ID token szerveroldali ellenőrzése](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Staging konfiguráció

1. A publikus client ID `GOOGLE_CLIENT_ID` Worker-változóként bekerült a `worker/wrangler.staging.jsonc` fájlba.
2. Az `AUTH_SECRET` staging secret 2026-09-14-én már létrejött; ne cseréld rutin deploynál, mert az minden meglévő Solemi sessiont érvénytelenítene.
3. Futtasd a Worker typechecket, teszteket és `wrangler deploy --dry-run` csomagolást.
4. A staging Worker auth-verziója 2026-09-14-én deployolva lett; production nem változott.
5. A Cloudflare Pages internal build környezetében állítsd `VITE_ACCOUNT_AUTH=true` értékre, a meglévő `VITE_SYNC_API_BASE` megtartásával, majd indíts új internal buildet.

## Kötelező internal smoke test

- Google popup sikeresen megnyílik az internal originről.
- Első belépés egy accountot, identityt, account device-ot és sessiont hoz létre.
- Reload után a session visszaáll.
- Kijelentkezés után a refresh és access token nem használható.
- Két eszköz beléphet; a harmadik `DEVICE_LIMIT_REACHED` állapotot kap és egyik korábbi eszköz sem lép ki automatikusan.
- Azonos Google `sub` megváltozott e-maillel ugyanaz marad; azonos e-mail más `sub`-bal külön account.
- A meglévő legacy Family Sync végpontok tovább működnek.

Az internal frontend és a staging Worker jelenleg külön webhelyen van (`pages.dev` és `workers.dev`). Emiatt a HttpOnly, `SameSite=None` refresh sütit egyes mobilböngészők harmadik féltől származó sütiként blokkolhatják. Ezt telefonon külön ellenőrizni kell. Nyilvános kiadás előtt az API-t az appal azonos webhely alatti saját domainre kell tenni, vagy más, dokumentált natív sessiontárolási megoldást kell választani.
