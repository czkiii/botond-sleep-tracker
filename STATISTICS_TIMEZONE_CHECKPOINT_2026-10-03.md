# A27/S14 — megjelenítői időzóna és naptári határok

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény és döntés

Az S14 helyi kapuja kész. V1-ben a statisztikák **a megjelenítő eszköz időzónáját** használják, a korábban rögzített bejegyzések újraértelmezésekor is. Nem vezetünk be családi időzóna-beállítást vagy tárolási migrációt. A HU/EN/DE felület kiírja az aktuális időzónát, és lenyithatóan elmagyarázza a következményeket.

Kiinduló HEAD: `378ad9e` — `Exclude conflicting sleep types and clarify overlap handling`, ág: `feat/child-profile-v4`; tiszta munkafa. S13 commitban. S14 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

- Azonos mentett időpontokból UTC-ben, Budapesten és Tokióban eltérő dátumcsoportok, nappali/éjszakai arányok és mintaszámok adódhatnak. Emiatt a havi riport minimuma is másként teljesülhet. Ez dokumentált megjelenítői értelmezés, nem szinkroneltérés. Az eredeti időpontok és az eltelt idő változatlanok.
- A napi/havi összesítés és a diagram helyi naptári dátumokat használ; az időtartamok időbélyeg-különbségekből készülnek. Óraátállításkor a helyi nap lehet 23/25 órás. Az automatikus nappal/éjjel felosztás a megjelenítői 06:00/19:00 határt követi; kézi típus változatlan.
- A naplóeltérés öt lezárt helyi naptári dátumot hasonlít az előző 28-hoz. A havi riport helyi naptári hónapokkal és a meglévő 14 adatos dátumos minimummal működik. A teljes leghosszabb szakasz a helyi kezdési nap/hónap mintájához tartozik.
- Az ébrenléti ablak, rutin és elalvásbecslés **7/14/30 × 24 órás gördülő** visszatekintést használ; ezt nem nevezzük 7/14/30 teljes naptári napnak. A határ közös `statisticsLookbackStart` függvénybe került, értéke nem változott. A becsléstípus tanulása ezen belül továbbra is a lezárt egész napokat használja (S06); az éjszakai rutin dél–dél mintacsoportja változatlan (S02).
- A legközelebbi napok keresése legfeljebb 730 korábbi helyi dátum. A keresési hossz és az egyedi diagramtartomány már naptári dátumkülönbségből képződik, nem eltelt 24 órák osztásából. Dátumvonal-váltáskor normalizálódó, nem létező dátum nem hozhat létre ismételt diagramnapot vagy ismételt összehasonlítási jelöltet.
- Az időzónát a statisztikai óra a látható oldal percfordulóin és visszatéréskor (focus/visibility) ellenőrzi. Az időzóna a számítások gyorsítótárának része: azonos időbélyeg mellett is újraszámolunk, ha a zóna változott. A másodperces stopper nem indít új statisztikai kört. Nincs folyamatos rejtett háttérpolling.
- Nincs új függőség vagy fiók-/családi adatváltozás. Az alkalmazás többi nézetének teljes időzóna-auditja és az éjszakai visszaalvások mintacsoportja nem része ennek a feladatnak; utóbbi S15.

## Gépi bizonyíték

- `src/statisticsTimeZone.test.ts`: **14/14 új próba PASS**. Audit UTC/Budapest/Tokió; kétórás időtartam megőrzése; év/hónap szerinti átrendeződés és visszautazás; eltérő havi minimum; Budapest és New York tavaszi/őszi óraátállítása, 23/25 órás nap és 11/13 órás éjszaka; pontos 168 órás határ, határegyezés és -1 ms kizárás; öt és 28 lezárt naptári dátum; Apia dátumvonal-ugrása, ismételt jelölt nélkül. Bemeneti adatmegőrzés ellenőrizve.
- Teljes készlet: **45 fájl, 547/547 PASS**. Frontend typecheck, helyi build és PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 739,40 kB / gzip 225,94 kB.
- `scripts/statistics-timezone-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. Egyazon oldalon UTC → Budapest → Tokió → UTC, újratöltés nélkül. Azonos, megállított időpontnál focus frissít, visibility és percforduló is frissít. A havi riport UTC/Tokió hét dátumos gyűjtésből Budapesten 14 dátumos kész állapotra vált, majd vissza. Mentett időpontok és rekordok változatlanok; egy másodperc alatt nincs újraszámolás. Nincs oldalhiba, váratlan API/külső kérés, túlcsordulás vagy feloldatlan sablonmező.
- Futtatás: `node scripts/check-statistics-performance.mjs --timezone-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`. A teszt elkülönített helyi naplót használ, az időzónát egyetlen CDP-kapcsolat vezérli; az óra csak az oldal betöltése után áll meg. A teljes statisztikai parancs is tartalmazza ezt a próbát.
- Képek: `.private-backups/s14-{hu,en,de}-{320,393}-timezone.png`; magyar és német 320 px állapot vizuálisan ellenőrizve.
- `--performance-only`: **1800/5000 × Free/Family+, 4/4 PASS**. Mind a négy 3,2 másodperces nyugalmi ablakban nulla statisztikai újraszámolás és nulla mért számítási idő; Free alatt nincs zárt prémium számítás. Kezdeti, fejlesztői kétszeres számítás összesen 13 / 1154,3 / 28,2 / 4741,2 ms. Ez nyugalmi regressziókontroll, nem telefonos sebességígéret vagy az első prémium számítás optimalizálásának lezárása. Nyers eredmény: `.private-backups/a22-after.json`.
- `git diff --check`: PASS. Korábbi alfeladatok összes böngészőkörét nem ismételtük; nincs új tulajdonosi kézi tesztkör.

## Folytatás

S01–S14 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6. A teljes A27 és a közös valódi telefonos elfogadás nyitott.

**Következő: A27/S15 — esti lefekvés és éjszakai visszaalvás elkülönítése az ébrenléti ablakokban és a becslésben, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Clarify statistics time zones and refresh calendar grouping after travel`
