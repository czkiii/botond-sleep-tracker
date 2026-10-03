# A27/S07 — elavult ébredés és aktuális kontextus

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S07 helyi kapuja kész. A január 30. 09:00-kor január 28. 06:00-s ébredésből keletkező, 51 órás aktuális ébrenlét és régi elalvási időablak többé nem jelenik meg aktuális becslésként. A felület az utolsó rögzített ébredés dátumát és idejét mutatja, és a hiányzó naplóbejegyzések ellenőrzésére kér.

Kiinduló HEAD: `489e107` — `Align prediction type learning with the selected lookback`, ág: `feat/child-profile-v4`; tiszta munkafa. S06 már commitban volt. S07 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt. M1–M6 kézi elfogadás továbbra is 6/6 lezárva.

## Aktuális kontextus szabálya

- A becslés belső eredménye külön okot ad a nem elérhető állapothoz: **nincs ébredés**, **futó alvás**, **hibás/átfedő időpont**, **elavult ébredés**. Érvényes aktuális ébredés, de kevés történeti minta továbbra is `collecting`, nem hibás adat.
- Nappal az aktuális helyi naptári napon rögzített ébredés használható. Éjféltől a meglévő **06:00-s nappali határig** az előző este **19:00-tól** rögzített ébredés is az aktuális éjszakához tartozhat. A határok az alkalmazás meglévő nappal/éjjel állandói; helyi naptári műveletekkel számolunk, nem fix 24 órát vonunk le az éjszakai váltásnál.
- **Ez konzervatív megjelenítési szabály, nem élettani időkorlát és nem a napló hiánytalanságának bizonyítása.** Nem állítjuk, hogy adott számú órányi ébrenlét lehetetlen vagy veszélyes. Egy hosszú, de mai ébredésből számolt intervallumot nem minősítünk önkényesen hibásnak. Az előző esti hivatkozás 06:00-tól új mai adat nélkül elavult; a felirat ellenőrzést kér, nem állítja biztosan, hogy alvás maradt ki.
- Az elavult eredményben nincs becslési sáv, aktuális ébrenléti idő, típus vagy mintaszámot sugalló fejléc. A külön `lastWakeTime` kizárólag a dátumos magyarázathoz megmarad. Új, tiszta ébredés után a becslés azonnal újraszámolódik; annak törlése után az elavult állapot visszatér.
- Ismeretlen időpontból nem keresünk csendben régebbi „biztos” ébredést. Nem értelmezhető vagy jövőbeli időbélyeg esetén javítást kérünk. A becslés már a jelenhez képest 1 másodperccel jövőbeli ébredést sem kezeli nullára kerekített aktuális ébrenlétként; ez a prediktor szigorúbb használhatósági feltétele, a tárolási/általános minőségellenőrzési toleranciát nem változtatja.
- Az ébrenléti kártya aktuális sora ugyanazt az ellenőrzött aktuális kontextust használja. Régi vagy bizonytalan hivatkozásból itt sem látszik 51 órás „most ébren” szám. A történeti tipikus érték és a múltbeli minták megmaradnak, ha elegendő adat van hozzájuk.
- A kész becslés időablakánál dátum is látszik, ha bármelyik végpont nem a mai napra esik; eltérő év esetén az év is megjelenik. Az aznapi sáv továbbra is rövid óra–perc formátumú. A HU/EN/DE feliratok megkülönböztetik a négy nem elérhető állapotot.

A sessionök, a medián/Q1–Q3, a történeti mintavétel és S06 típustanulási szabálya nem változott. Nincs automatikus alváslezárás, törlés vagy hiányzó alvás kitalálása. A hasonló napok külön aktuális kontextusának hibája S08-ban marad; az alap stopper nem része ennek a statisztikai módosításnak.

## Gépi bizonyíték

- Az első 7 új regresszió javítás előtt **7/7 bukott**: a régi ébredés `ready` maradt; a hibás legújabb végidő mellett régebbi adatból is készült becslés; a hiányzási okok/dátum hiányoztak. A tesztcsomag ezután a határesetekkel és megjelenítéssel bővült.
- `src/predictionContext.test.ts`: **13/13 PASS**. 51 órás auditpélda, hiányzó/futó/hibás adatok, nem értelmezhető végidő, új ébredés/törlés, éjfél és 06:00, 19:00 befoglaló határ, hosszú mai ébrenlét élettani minősítés nélkül, kevés történeti minta, a jelenhez képest 1 másodperccel jövőbeli ébredés, tavaszi/őszi óraátállítási nap helyi 06:00-ja, háromnyelvű dátumos felirat és rövid aznapi időablak. A teszt a bemeneti napló érintetlenségét is ellenőrzi.
- Teljes csomag: **39 fájl, 480/480 PASS**. Frontend typecheck és helyi build/PWA generálás PASS. Meglévő bundle-figyelmeztetés: JS 720,37 kB / gzip 220,33 kB.
- Új `scripts/prediction-context-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. Hiányzó/elavult/futó/átfedő állapot, utolsó ébredés dátuma, régi aktuális számláló elrejtése és történeti minta megőrzése, új ébredés utáni helyreállás, törlés, időszakváltás, dátumos éjszakai becslés, éjfél és 06:00 automatikus percóra-váltása újratöltés nélkül. Nulla oldalhiba és nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --wake-samples-only`, meglévő külső Playwright és `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi naplókkal. Az S04/S05/S06 böngészős regressziók is mind sikeresek. A teljes frissülési parancs is tartalmazza az új S07 próbát; az S02/S03 böngészőkört most nem ismételtük.
- Gitből kizárt képek: `.private-backups/s07-{hu,en,de}-{320,393}-{stale,dated-night}.png`. Magyar 320 px elavult/éjszakai, valamint német 320 px elavult állapot vizuálisan ellenőrizve.
- `git diff --check`: PASS. Új alkalmazásfüggőség nincs. A két új kimeneti mező futás közben számított adat, tárolt napló vagy szerveres API migrációja nem szükséges.

## Folytatás

S01–S07 helyi kapui készek. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S08 — a hasonló napok aktív alvás alatti állapotának javítása, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Handle stale prediction context and explain unavailable estimates`
