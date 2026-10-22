# A27/S12 — tényleges riportidőszak és kihagyott hónapok

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S12 helyi kapuja kész. A havi riport a legutóbbi **legalább 14 adatos dátumot tartalmazó lezárt hónapról** szól. A felület megnevezi az eltérésekhez ténylegesen használt korábbi hónapokat, a folyamatban lévő, még kizárt hónapot, valamint a kihagyott lezárt hónapokat és azok okát.

Kiinduló HEAD: `870ea00` — `Clarify diary coverage and remove unverified sleep-change claims`, ág: `feat/child-profile-v4`; tiszta munkafa. S11 commitban. S12 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Szabályok és határok

- A kiválasztás és a numerikus összehasonlítás változatlan: legalább 14 adatos dátumú lezárt hónap, az eltérésekhez legfeljebb három korábbi alkalmas hónap mediánja. A hónapokat külön, évvel együtt soroljuk fel; kihagyás esetén sem sugallunk folytonos mintavételt.
- Az auditpéldában május/június alkalmas, július üres, augusztus elégtelen: szeptemberben június marad a riport, május az alap. Július „nincs felhasználható adat”, augusztus például „13 adatos dátum; legalább 14 szükséges”. A nulla használható adat nem állít nulla tényleges alvást.
- A kihagyott hónapok lenyitható listája az első összehasonlítási hónaptól az utolsó lezárt hónapig terjed. Összehasonlítás hiányában az első adatos hónaptól indul. A felület ezt a határt kimondja; a lista nem a teljes élettörténet összes kizárása. Összefüggő üres időszakot egy dátumtartományként jelenítünk meg, hónapszámmal az összesítésben. Többéves hiány nem generál több száz sort.
- A személyes havi csúcsok az összes korábbi alkalmas hónaphoz viszonyítanak, ezért külön megkapják e hónapok listáját; nem keverjük össze őket a legfeljebb három hónapos eltérésalappal. A leghosszabb szakasznál csak értékkel rendelkező hónapok vesznek részt, ezt külön jelzi a magyarázat.
- A folyamatban lévő hónap akkor is kimarad a riportból és az összehasonlításból, ha már 14 vagy több adatos dátuma van. Helyi éjfélkor, hónapváltás után a meglévő statisztikai óra újratöltés nélkül frissít.
- Egyetlen alkalmas lezárt hónap esetén továbbra is gyűjtési állapot látható, de megnevezzük az alkalmas hónapot és a korábbi összehasonlítás hiányát. Üres és csak aktuális havi naplóhoz nem találunk ki régebbi kihagyásokat.
- A napi forrás, mintaszámok, küszöbök és tárolt napló változatlanok. Nincs új függőség, tárolási vagy API-migráció. Az átfedés/besorolás kérdése S13-ban marad.

## Gépi bizonyíték

- `src/monthlyReport.test.ts`: 7 új próba, összesen **12/12 PASS**. Régebbi riport; üres/13 dátumos hónap; 13/14 határ és hónapváltás; nem egymást követő legfeljebb három alap; külön teljes csúcstörténet; 24 üres hónap csoportosítása; üres/aktuális/elégtelen napló; évváltás és bemeneti adatok megőrzése.
- A közös statisztikai forrás próbáival együtt célzottan **15/15 PASS**; közvetlen és előkészített adatból azonos riport.
- Teljes készlet: **43 fájl, 521/521 PASS**. Frontend typecheck, helyi build és PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 731,89 kB / gzip 223,52 kB.
- Új `scripts/monthly-period-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. Régebbi riport és pontos alap, üres/elégtelen hónapok, aktuális hónap kizárása, helyi szeptember–október éjfél automatikus frissülése, külön csúcstörténet, gyűjtési állapot; túlcsordulás és helyettesítetlen mező nélkül. Nulla oldalhiba, nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --monthly-period-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplókkal. A teljes statisztikai parancs is tartalmazza az új próbát. Más alfeladatok böngészőkörét és a nagy naplós teljesítménymérést most nem ismételtük.
- A böngészőpróba első futása a magyar hónap CSS-nagybetűsítésénél bukott; a dátumellenőrzés ezután kis/nagybetűtől független, a teljes hónapot és évet továbbra is egyezteti. A termékkódot nem kellett emiatt változtatni.
- Képek: `.private-backups/s12-{hu,en,de}-{320,393}-{older-report,month-boundary,nonconsecutive-baseline,collecting}.png`. A képkészítés idejére elrejtjük a riportot takaró rögzített navigációt és tesztbannert. Magyar és német 320 px állapot vizuálisan ellenőrizve.

## Folytatás

S01–S12 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6. A teljes A27 és a közös valódi telefonos elfogadás nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő: A27/S13 — átfedések, duplikátumok és ellentétes kézi alvástípusok egységes kezelése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Clarify monthly report periods and explain skipped months`
