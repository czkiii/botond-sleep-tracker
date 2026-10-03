# A27/S15 — esti elalvás és éjszakai visszaalvás

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S15 helyi javítása kész. Az ébrenléti ablak és a becslés külön mintacsoportot használ az éjszaka első rögzített elalvására és az ugyanazon éjszakán belüli visszaalvásokra. Az audit három 7 órás esti és hat 15 perces visszaalvási mintája már nem keveredik: az esti becslés 20:00, a 00:00-s ébredés utáni visszaalvás becslése 00:15 a mesterséges naplóban.

Kiinduló HEAD: `7382115` — `Clarify statistics time zones and refresh calendar grouping after travel`, ág: `feat/child-profile-v4`; tiszta munkafa. S14 commitban. S15 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

- A rutinból kiemelt közös `nightGroups.ts` a megjelenítő helyi déltől következő délig tartó éjszakáit használja. Az első éjszakai szakasz az első-elalvás csoportba kerül akkor is, ha éjfél után kezdődik; a továbbiak a visszaalvás csoportba. A kézi alvástípus és a meglévő többségi nappal/éjjel besorolás megmarad.
- A rutin továbbra is megvárja a déli csoportzárást az első elalvás/utolsó ébredés mintájához. Hibás vagy aktív töredék esetén a teljes éjszakai csoport kimarad a történeti mintákból. A minőségi szűrés nem hoz létre mesterséges szomszédos alváspárt.
- A becslés a meglévő éjszakai óraidőben (19:00–06:00) akkor választ visszaalvást, ha az aktuális éjszakai csoportban már van tiszta, lezárt éjszakai alvás. Reggel visszatér a nappali kontextushoz; a következő dél új éjszakai csoportot kezd. Ez naplóértelmezési szabály, nem életkori/élettani állítás.
- A rövid visszaalvási minták az általános tipikus ébrenléti értékbe sem kerülnek bele. Az alcsoportos bontásban továbbra is látszanak, ha elérik a három mintát.
- Ha a kiválasztott éjszakai csoportban még nincs három minta, gyűjtési állapot jelenik meg. A kiemelt érték nem helyettesíti a hiányzó esti/visszaalvási mintát általános vagy másik csoportból származó értékkel. A kiemelt érték, mintaszám és becslés ugyanazt a csoportot használja.
- A 7/14/30 × 24 órás visszatekintés, a 3 mintás minimum és az 5 perc–12 óra szűrő változatlan. Óraátállításkor az ébrenlét valós eltelt idő. A nyers bejegyzések változatlanok, az ébrenléti szünetek nem válnak alvásidővé.
- HU/EN/DE felirat és magyarázat jelzi a két csoport jelentését, valamint hogy hiányos naplóban az első rögzített alvás nem feltétlenül a valódi lefekvés. A hosszabb címkék keskeny képernyőn is tördelődnek.

## Gépi bizonyíték

- `src/nightResettling.test.ts`: **14/14 új próba PASS**. Az audit mintája; esti/visszaalvási becslés és mintaszám-egyezés; kétirányú elégtelen minta; éjfél utáni első elalvás; 06:00 és következő este; kézi nappali típus; hibás/aktív csoport; eredeti szomszédság; változatlan alvásösszeg; fordított bemeneti sorrend; gördülő kezdőhatár és -1 ms; Budapest tavaszi/őszi óraátállítása.
- Teljes készlet: **46 fájl, 561/561 PASS**. `npm run typecheck`, `npm run build`, PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 741,74 kB / gzip 226,60 kB; ez a feladat nem zárja le a csomagméret/első betöltés kérdését.
- `node scripts/check-statistics-performance.mjs --night-resettling-only`: **HU/EN/DE × 320/393 px, 6/6 PASS**, állapotonként esti, visszaalvási, kétféle elégtelen minta és aktív alvás. 7 órás/15 perces érték, 3/6 minta, 20:00/00:15 becslés, tiltott helyettesítés hiánya, nyers aktív alvás megőrzése ellenőrizve. Nincs oldalhiba, váratlan külső/API-kérés, túlcsordulás vagy feloldatlan sablonmező.
- `--wake-samples-only`: a korábbi minimum-, bizonyíték-, időszak-, aktuális kontextus- és legközelebbi napok böngészőpróbái mind sikeresek HU/EN/DE × 320/393 px méreten. A korábbi éjszakai felirat elvárása az új pontos elnevezésre frissítve.
- Böngésző: elkülönített helyi Edge, külső Playwright, vezérelt óra és mesterséges adatok. Képek: `.private-backups/s15-{hu,en,de}-{320,393}-{bedtime,resettling,sparse-bed,sparse-back}-{wake,prediction}.png`. Magyar becslés és német ébrenléti kártya 320 px képe vizuálisan ellenőrizve.
- `--performance-only`: **1800/5000 × Free/Family+, 4/4 PASS**. Mindegyik 3,2 másodperces nyugalmi mérésben nulla statisztikai újraszámolás és nulla mért számítási idő; Free alatt nincs zárt prémium számítás. Kezdeti, fejlesztői kétszeres számítás összesen 12,7 / 1088,2 / 29,7 / 4559,1 ms. Ez nyugalmi regressziókontroll, nem telefonos sebességígéret vagy az A22 kezdeti prémium számítás optimalizálásának lezárása. Nyers eredmény: `.private-backups/a22-after.json`.
- `git diff --check`: PASS. A korábbi összes böngészőkört nem ismételtük. Nincs új tulajdonosi kézi tesztkör.

## Folytatás

**S01–S15 helyi javításai készültek el.** A teljes A27 kiadási kapu és a közös valódi telefonos elfogadás még nyitott; M1–M6 kézi kör továbbra is 6/6, nem ismétlendő.

**Következő: A27 közös elfogadásának előkészítése — a javított kártyák összevont gépi ellenőrzése közös tesztnaplóval, a bizonyítékok és a fennmaradó célzott telefonos próba rövid listájával. Feladatszint: GPT-6 Astra · erős.** Ez az audit meglévő lezárási lépése, nem új S16 funkció. Az előkészítéshez nem szükséges tulajdonosi kézi teszt; távoli kiadás ebből nem következik automatikusan.

GitHub Desktop Summary: `Separate bedtime and night resettling in wake windows and predictions`
