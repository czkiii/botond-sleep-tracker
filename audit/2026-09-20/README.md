# Auditbizonyítékok — 2026-09-20

Vizsgált alkalmazás: `e9374f4`, `feat/child-profile-v4`.
A részletes jelentés: [FULL_RELEASE_AUDIT_2026-09-20.md](../../FULL_RELEASE_AUDIT_2026-09-20.md).

## Megismételhető helyi próbák

A `reproduction.probe.ts.txt` az audit során használt ideiglenes Vitest-próbák
változatlan másolata. **A hibás jelenlegi viselkedést állítja elvárásként**, ezért
szándékosan nem része a normál tesztcsomagnak. Nem regressziós tesztként kell
átvenni: javításkor a kívánt, biztonságos viselkedést kell tesztelni.

A repository gyökeréből, telepített függőségekkel és Node 22 SQLite-támogatással:

```powershell
Copy-Item -LiteralPath audit/2026-09-20/reproduction.probe.ts.txt -Destination audit-probes.test.ts
node node_modules/vitest/dist/cli.js run audit-probes.test.ts
Remove-Item -LiteralPath audit-probes.test.ts
```

A célfájl ne létezzen előzetesen. A próbák kizárólag memóriabeli SQLite-ot,
mesterséges localStorage-ot és mock fetch-et használnak. Nincs távoli adatírás.
A párhuzamossági próbák a valós szolgáltatás ellenőrzése és batch írása közé
illesztenek egy másik műveletet; determinisztikus interleaving modellek,
nem Cloudflare terheléses tesztek.

## Rögzített eredmények

- 2026-09-19: meglévő **23 tesztfájl / 185 teszt sikeres**; frontend és Worker
  `tsc --noEmit` sikeres. Ekkor az alkalmazás munkafája tiszta volt.
- Első körben 7 auditpróba sikeres; a további futtatást a keret miatti
  automatikus approval-review hiba szakította meg. Nem biztonsági elutasítás.
- 2026-09-20: az új HTTP-próbák először a próbákból hiányzó JSON Content-Type
  miatt 400 választ kaptak. A tesztfejléc javítása után 10/10, a további
  kiegészítéssel **14/14 auditpróba sikeres**. Alkalmazáskód nem módosult.
- A 14 próbából 13 hibás vagy kiadás előtt korlátozandó viselkedést reprodukál;
  a 14. teljesítménymérés. 1800 lezárt, kétórás, nem átfedő alvásnál a
  statisztikai függvénycsoport egyszeri futása ezen a Windows/Node gépen **91 ms**.
  Ez nem telefonos renderidő, nem p95 mérés és nem szolgáltatási garancia.
- Production helyi build: siker; fő JS **660,64 kB / gzip 202,82 kB**.
- Auth-enabled internal helyi build: siker; fő JS **669,24 kB / gzip 205,51 kB**.
  Mindkettő 500 kB feletti chunk-figyelmeztetést adott, buildhibát nem.
- A buildkimenetek az ignorált `dist/audit-production` és `dist/audit-internal`
  mappába kerültek. Nem kerültek telepítésre.

## Böngészős megfigyelés

Elkülönített localhost előnézet, Codex Chromium böngésző, egy új tesztalvás,
390 × 844 viewport. A távoli bejelentkezést/családi csatlakozást nem használtuk;
a helyi preview nem futtatja a Pages `/api` funkciót, ezért a fiókszolgáltatás
elérhetetlensége itt várható, nem staginghibának minősített eredmény.

- Indítás → −5 perc → reload: aktív alvás és korrigált kezdés megmaradt.
- Lezárás → Előzmények: egy lezárt sor jelent meg.
- Friss indításkor röviden téves „Az alvás időpontjai hibásak” jelzés jelent meg.
- A kb. 5 perces alvás a főoldali összegben szerepelt, a statisztikában 0 perc
  látszott; az elemzési minimum minta/szűrés hatása nincs itt megmagyarázva.
- Statisztika és beállítások megnyithatók, a vizsgált mobilméretű statisztika
  felső részén nem látszott vízszintes szétesés. Ez nem teljes képernyőmátrix.
- „Profil szerkesztése” fókuszált vezérlőn Enter nem nyitott szerkesztőt;
  kattintás igen. A megnyitott szerkesztőből Escape nem lépett ki.
- Az akadálymentes fában a profilszerkesztő bezárógombja és az előzmények
  hozzáadásgombja név nélkül szerepelt; a háttér a szerkesztő mellett elérhető maradt.

A helyi preview folyamatát és az ideiglenes böngészőlapot lezártuk, a viewportot
visszaállítottuk. A valódi iPhone/Android/native/store és staging restore
elfogadások külön, nyitott kiadási kapuk.
