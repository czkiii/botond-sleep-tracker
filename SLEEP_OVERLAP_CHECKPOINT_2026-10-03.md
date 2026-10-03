# A27/S13 — átfedések és kézi típusütközések

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S13 helyi kapuja kész. Az audit 12:00–14:00 közötti két, ellentétes kézi típusú bejegyzése többé nem ad kétórányi látszólag tiszta éjszakai mintát az összesítésekhez. A közös minőségellenőrzés és a napi statisztikai forrás ugyanazokat a konfliktuscsoportokat zárja ki. Az eredeti bejegyzések megmaradnak.

Kiinduló HEAD: `2fc8755` — `Clarify monthly report periods and explain skipped months`, ág: `feat/child-profile-v4`; tiszta munkafa. S12 commitban. S13 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Döntés és határok

- Két, valóban átfedő, ellentétes **kézi** nappali/éjszakai címke besorolási konfliktus. Az érintett teljes, átfedésekkel összekapcsolt csoport kimarad minden statisztikai mintából. Egy automatikus vagy duplikált másolat sem hozhatja vissza ugyanazt a vitatott alvást.
- Teljes bejegyzéseket zárunk ki, nem gyártunk tisztának látszó, levágott széleket. A konfliktus egész csoportja a minőségellenőrzés `classification-conflict` jelzésében és a napi forrás `conflictSessionIds` mezőjében követhető. A kezdőlapi figyelmeztetés előnyben részesíti a típusütközés pontos üzenetét.
- A közös csoportkeresés gyermekenként, időrendben működik. Csak pozitív időbeli átfedés kapcsol össze rekordokat; az összeérő végpont nem konfliktus. A napi statisztika továbbra is az aktív gyermekre szűrt naplót kapja.
- Ha két ellentétes kézi címke időben nem fedi egymást, csak egy automatikus rekord köti össze őket, az nem címkeütközés. A kézi címke az érintett időrészen elsőbbséget élvez az automatikus nappal/éjjel besorolással szemben. Azonos prioritású ütközésnél megszűnt az önkényes „éjszaka nyer” szabály.
- Aktív, de érvényes időtartományú bejegyzés is jelezhet konfliktust egy lezárt bejegyzéssel. Hibás vagy a meglévő tolerancián túli jövőbeli intervallum nem képez konfliktuscsoportot; saját minőségi kizárása megmarad. Érvényes időkkel rendelkező túl rövid/túl hosszú rekord nem old fel egy kézi típusellentmondást.
- **Két megnevezett felhasználási szabály marad:** napi összesítés, fejlődés, naplóeltérés és havi riport a nem ütköző átfedések/duplikátumok idejét unióként egyszer számolja; az epizódok és teljes szakaszok korábbi összevonása megmarad. A rutin, ébrenléti/elalvásbecslés és legközelebbi napok összevetése továbbra is kizár minden átfedő bejegyzést, mert a sorrend és az alvásszám bizonytalan. Az audit megengedi a külön, egyértelműen megnevezett szabályokat; nem normalizáltuk át önkényesen a nyers naplót vagy a rutinsorrendet.
- A statisztika HU/EN/DE nyelven lenyitható magyarázatot, konfliktus esetén mindig látható darabszámos jelzést mutat. A darabszám az aktív gyermek teljes naplójára vonatkozik, nem csak az éppen megjelenített diagramablakra. A napló és a nyers idővonal továbbra is az eredeti bejegyzéseket mutatja; a felirat ezt is kimondja.
- Típusjavítás után az összesítés helyreáll. Ha a második rekord továbbra is duplikátum, a sorrendalapú elemzések csak a duplikáció tényleges rendezése után veszik vissza a mintát.
- Nincs tárolási/API-migráció vagy új függőség. Nem törlünk és nem írunk át bejegyzéseket. Az időzóna-szabályok S14-ben maradnak.

## Gépi bizonyíték

- `src/sleepOverlap.test.ts`: **12/12 új próba PASS**. Auditpár minden statisztikai fogyasztón; részleges átfedés és ép kontroll; automatikus/duplikált híd, bemeneti sorrendtől független csoportkizárás; nem átfedő kézi címkék; pontos duplikátum egyszeri uniója; részleges/tartalmazott unió; kézi elsőbbség; összeérő végpont és külön gyermek; aktív konfliktus; hibás/jövőbeli rekord; javítás utáni helyreállás; 60 napnyi konfliktusból nem képződő havi/napi minta. Bemeneti adatmegőrzés ellenőrizve.
- Célzott minőségi, nappal/éjjel és közös forráspróbákkal együtt **45/45 PASS**.
- Teljes készlet: **44 fájl, 533/533 PASS**. Frontend typecheck, helyi build és PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 735,87 kB / gzip 224,81 kB.
- `scripts/sleep-overlap-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. Háromtagú konfliktuscsoportból nulla összesített minta, nyers rekordok megőrzése; javított duplikátumból két óra egyszer; részleges átfedésből három óra; egy tiszta rekordnál minőségi figyelmeztetés eltűnése, mindez újratöltés nélkül. Fordítás, darabszám, feloldott sablonmezők és túlcsordulás ellenőrizve. Nulla oldalhiba, nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --overlap-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplók. A teljes statisztikai parancs tartalmazza az új kört.
- Képek: `.private-backups/s13-{hu,en,de}-{320,393}-conflict.png`; magyar és német 320 px megjelenítés vizuálisan ellenőrizve.
- A közös napi forrás új minőségellenőrzése miatt külön teljesítménykontroll is futott: `--performance-only`, **1800/5000 × Free/Family+, 4/4 PASS**. Mindegyik 3,2 másodperces nyugalmi ablakban nulla statisztikai újraszámolás és nulla mért számítási idő; Free esetén nincs zárt prémium számítás. A fejlesztői, kétszeres kezdeti hívások összesített ideje 12,3 / 1076,5 / 27,2 / 4516,5 ms. Ez a nyugalmi újraszámolás regressziókapuja, nem telefonos sebességígéret vagy az első prémium számítás gyorsításának lezárása. Nyers eredmény: `.private-backups/a22-after.json`.
- `git diff --check`: PASS. A korábbi feladatok összes böngészőkörét most nem ismételtük.

## Folytatás

S01–S13 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6. A teljes A27 és a közös valódi telefonos elfogadás nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő: A27/S14 — időzóna szerinti csoportosítás dokumentált szabálya, utazás, óraátállítás és hónaphatár gépi próbáival. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Exclude conflicting sleep types and clarify overlap handling`
