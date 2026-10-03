# A27/S11 — naplólefedettség és tényleges mintaszám

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S11 helyi kapuja kész. A változásfigyelő **a rögzített adatok eltéréséről** beszél, nem bizonyított gyermekbeli változásról. A 14 korábbi, tízórás és 4 friss, egyórás napból továbbra is kiszámítható a naplózott értékek különbsége, de nincs „erős változás” minősítés. A felület az adatos dátumok arányát és a tényleges mintaszámot mutatja, és jelzi a hiányzó bejegyzések lehetséges hatását.

Kiinduló HEAD: `aaf49b9` — `Unify daily longest sleep averages across monthly statistics`, ág: `feat/child-profile-v4`; tiszta munkafa. S10 már commitban. S11 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Döntés és határok

- **Adatos dátum nem teljes megfigyelés.** A tárolt adatok nem tartalmaznak megbízható teljesnap-jelölést. Nem vezettünk be önkényes alvásmennyiségi küszöböt a teljesség eldöntésére, és nem kérünk új napi adminisztrációt a szülőtől. A változásfigyelő kimenetében `coverage: 'unverified'` szerepel minden állapotban.
- **Minimum: 4/5 és 14/28.** Az utóbbi öt lezárult helyi naptári napból legalább négy adatos dátum, az azt megelőző 28 napból legalább 14 kell. A mai nap kimarad. A két minimum közös kódbeli állandóból kerül a számításba és a HU/EN/DE gyűjtési feliratba; a korábbi „5 teljes nap” állítás megszűnt.
- A lefedettségi sor például **4/5 friss, 14/28 korábbi adatos dátumot** mutat. Az egyes jelzések saját tényleges mintaszámot kapnak, így négy friss értékből négy eltérés jelölése **4/4 minta**, nem 4/5. Ez a hiányzó napi maximumot kihagyó S10-szabállyal is összhangban van.
- A numerikus eltérések és küszöbök továbbra is a naplózott adatok összevetésére szolgálnak. A `severity` mező és az erős minősítéshez tartozó külön színezés megszűnt. A „nincs kiemelt eltérés” sem állítja, hogy az alvás bizonyítottan változatlan vagy a napló teljes.
- **Hiányzó dátum nem nulla alvás.** A napi forrás továbbra sem gyárt üres dátumokat a kihagyott napokra. A naplózott nappali/éjszakai idő vagy darabszám nulla értéke csak az adott naplóban szereplő érték, nem igazolt alvásmentesség. Teljesen megfigyelt valódi nulla nap jelenleg nem igazolható ebből az adatmodellből.
- **Nappali darabszám:** csak korábbi helyi naptári dátumok számítanak, amelyeken van használható, lezárt nappali bejegyzés. A csak éjszakai bejegyzés nem ad nulla nappali mintát. A mai részleges nap kimarad; legalább három, nappali adatot tartalmazó korábbi dátum kell. A felirat „Rögzített nappali alvásszám”, a magyarázat kimondja ezt a feltételes mintavételt és annak hiányosságát. Ez nem a gyermek összes napjára vonatkozó napközbeni alvásszám becslése.
- A fejlődési nézet és a havi riport is elmagyarázza, hogy az adatos dátum nem teljes megfigyelés, és egy éjfelen átnyúló alvás két dátumot érinthet. A riport 14 dátumos jogosultsági feltétele változatlan, de már nem sugall 14 teljes megfigyelt napot. A havi „stabil” szöveg és trendcím is rögzített adatokra szűkült.
- A tényleges riportidőszak és a kihagyott hónapok jelzése **S12-ben marad**. A napi forrás átfedéskezelését és a szélesebb adatminőségi szabályokat ez a kör nem alakította át.

## Gépi bizonyíték

- Javítás előtt **2/2 új reprodukció bukott**: hiányzott az ismeretlen lefedettség kifejezett jelzése; a csak éjszakai napokból 0-s nappali rutin képződött.
- `src/logCoverage.test.ts`: **10/10 PASS**. Auditpélda és bemeneti adatmegőrzés, 3/14–4/13–4/14–5/14 minimumhatárok, változatlan naplóértékek ismeretlen teljessége, hiányzó/mai/túl régi dátum, csak éjszakai minták, három nappali adatos dátum és mai részleges nap kizárása, egy alvás két érintett dátuma, üres napló.
- A korábbi változásfigyelő-próba a számértékeket és tényleges mintaszámot ellenőrzi az eltávolított `strong` minősítés helyett. Az éjszakairutin-próba megőrzi a reggeli ébredés és kézi nappali típus ellenőrzését, és a három nappali mintát csak a harmadik naptári nap lezárulta után várja.
- Teljes csomag: **43 fájl, 514/514 PASS**. Frontend typecheck, helyi build és PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 727,96 kB / gzip 222,39 kB.
- Új `scripts/log-coverage-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. 3/4/5 adatos dátum, tényleges 4/4 jelzés, ismeretlen teljesség, erős minősítés hiánya, éjszakai adatból nem képzett nulla nappali rutin, három nappali mintából darabszám, hiányzó mintára visszaállás újratöltés nélkül; fejlődési/havi lefedettségmagyarázat; túlcsordulás és helyettesítetlen sablonmező nélkül. Nulla oldalhiba és nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --coverage-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplókkal. A teljes statisztikai parancs is tartalmazza az új próbát; az S02–S10 böngészőköröket és a nagy naplós teljesítménymérést most nem ismételtük.
- Képek a Gitből kizárt `.private-backups/s11-{hu,en,de}-{320,393}-{collecting,audit,unchanged-records}.png` fájlokban. Magyar 320 px auditállapot és német 320 px változatlan naplóállapot vizuálisan ellenőrizve. `git diff --check`: PASS.
- A keret elfogyása miatt az automatikus jóváhagyás először nem tudta elindítani a végső ellenőrzéseket. A felhasználó visszatérése és a keret helyreállása után mind a négy ellenőrzés szabályosan, sikeresen lefutott; nem történt megkerülés.
- Nincs új függőség vagy tárolási/API-migráció; a lefedettségi jelzés és mintaszámok futás közben képzett statisztikai mezők.

## Folytatás

S01–S11 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6 lezárva. A teljes A27 és a közös valódi telefonos elfogadás nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S12 — a havi riport és összehasonlítás tényleges időszakának, valamint a kihagyott hónapoknak a jelzése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Clarify diary coverage and remove unverified sleep-change claims`
