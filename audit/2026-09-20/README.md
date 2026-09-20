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
- A kb. 5 perces alvás a főoldali összegben szerepelt, a heti statisztikában
  0 perc látszott. A későbbi statisztikai próba pontosította az okot:
  az 5/7 perces napi átlag lefelé kerekítése ad 0-t, nem a rekord kiszűrése.
  Az 5 perces alvás megmarad; az elemzési minimum külön szabály, 2 perc.
- Statisztika és beállítások megnyithatók, a vizsgált mobilméretű statisztika
  felső részén nem látszott vízszintes szétesés. Ez nem teljes képernyőmátrix.
- „Profil szerkesztése” fókuszált vezérlőn Enter nem nyitott szerkesztőt;
  kattintás igen. A megnyitott szerkesztőből Escape nem lépett ki.
- Az akadálymentes fában a profilszerkesztő bezárógombja és az előzmények
  hozzáadásgombja név nélkül szerepelt; a háttér a szerkesztő mellett elérhető maradt.

A helyi preview folyamatát és az ideiglenes böngészőlapot lezártuk, a viewportot
visszaállítottuk. A valódi iPhone/Android/native/store és staging restore
elfogadások külön, nyitott kiadási kapuk.

## Family+ számítási kiegészítés

Jelentés: [FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md](../../FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md).
HEAD `3a0a687`, változatlan alkalmazáskód az `e9374f4` audit óta.
Az archív `family-plus-statistics.probe.ts.txt` 7 független kontrollt és
15 jelenlegi eltérést/értelmezési korlátot igazoló próbát tartalmaz.
**Nem javítási regressziós teszt:** S01–S15 a jelenlegi eredményt várja;
javításkor a kívánt viselkedés legyen az új elvárás.

2026-09-20, a végső együttes futás: **9 fájl / 72 teszt sikeres**,
ebből 22 auditpróba és 50 meglévő statisztikai/adatminőségi/időhatár teszt.
Az uniókontroll 50 rögzített véletlenmagú adathalmazt ellenőriz egyetlen
teszten belül. A próbakészítés közbeni korábbi futásban a UTC/Budapest
elvárt napszám felcserélése teszthibát okozott; ezt a próbában javítottuk.
Alkalmazáskód nem változott. A végső futás időtartama 515 ms volt;
ez tesztfutási idő, nem telefonos teljesítménymérés.

A repository gyökeréből, nem létező ideiglenes célfájllal:

```powershell
Copy-Item -LiteralPath audit/2026-09-20/family-plus-statistics.probe.ts.txt -Destination family-stats-audit.test.ts
node node_modules/vitest/dist/cli.js run family-stats-audit.test.ts src/insights.test.ts src/prediction.test.ts src/similarDays.test.ts src/sleepDevelopment.test.ts src/sleepChange.test.ts src/monthlyReport.test.ts src/dataQuality.test.ts src/timeBoundaries.test.ts
Remove-Item -LiteralPath family-stats-audit.test.ts
```

A próbák mesterséges, egygyermekes adatokon futnak; a `TZ` környezeti értéket
próbánként visszaállítják. Nincs hálózati hívás, valódi alvásadat vagy távoli
adatmódosítás. Az ideiglenes futtatható teszt archiválva lett; a normál
tesztcsomag és az alkalmazás forrása nem módosult.
