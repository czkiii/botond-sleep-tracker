# A27/S10 — napi leghosszabb alvásszakaszok átlaga

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S10 helyi kapuja kész. Hét különálló, 20:00–08:00 közötti éjszaka esetén a fejlődési nézet és a havi riport egyaránt **12 órát, 7 kezdési nap alapján** mutat. Korábban a havi riport a 14 érintett dátummal osztott, és 6 órát írt. Az összalvás napi átlaga ebben a példában továbbra is 6 óra / 14 adatos dátum: ez más mutató, nem a leghosszabb szakasz átlaga.

Kiinduló HEAD: `57a7685` — `Clarify closest-day rankings and show differences from today`, ág: `feat/child-profile-v4`; tiszta munkafa. S09 már commitban. S10 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Közös számítás

- A `summarizeSleepMonths` ugyanazt a havi összesítést adja a fejlődésnek és a riportnak. A nézetek külön időszak- és minimumszűrése megmarad.
- Egy helyi kezdési naphoz az azon kezdődő, lezárt alvásszakaszok **legnagyobb teljes időtartama** tartozik. A havi érték ezek számtani átlaga. Nem az összes alvásszakasz átlaga és nem a hónap egyetlen legnagyobb időtartama.
- A nevező csak a tényleges napi maximumot adó kezdési dátumok száma. A `longestBlockSampleDays` ezt a számot mindkét felületen megmutatja, az összalvásnál használt `recordedDays` mellett, külön fogalomként.
- A csak előző napról folytatódó alvást tartalmazó nap maximuma `null`, nem nulla. Ha a hónapnak nincs kezdődő szakasza, az átlag is `null`; a felirat „Nincs kezdődő szakasz”, a mintaszám nulla. Nem jelenik meg mesterséges 0 perces alvás.
- A teljes szakasz a **helyi kezdési naphoz és hónaphoz** tartozik. December 31. 20:00–január 1. 08:00 esetén a decemberi maximum 12 óra, a január 1-jei maximum hiányzik. Az összalvás ettől függetlenül decemberre 4, januárra 8 órát kap. Ha január 1-jén külön 2 órás alvás kezdődik, az aznapi maximum 2 óra, nem az előző éjszaka 8 órás töredéke.
- Pontosan éjfélkor véget érő szakasz nem hoz létre új másnapi mintát; éjfélkor kezdődő szakasz az új naphoz tartozik. Óraátállításkor a ténylegesen eltelt idő számít, nem a faliórák egyszerű különbsége.
- A meglévő átfedő/érintkező intervallum-összevonás és a lezáratlan/hibás bejegyzések kizárása változatlan. Ezek egységes adatminőségi felülvizsgálata külön S13 feladat.
- A havi trendek és mérföldkövek, valamint a fejlődési mérföldkövek hiányzó értékből nem képeznek csökkenést vagy rekordot. A havi trend hiányzó bázisértéknél kimarad; a leghosszabb szakasz rekordjához legalább két korábbi használható havi maximumátlag szükséges.
- A változásfigyelő is kihagyja a hiányzó napi maximumot a mediánból és az egyező napok számából. A meglévő 14 korábbi / 4 friss minta követelményét a tényleges értékekre alkalmazza. Az általános naplólefedettség és a 4/5 napos szöveg eltérése **S11-ben marad**; itt csak a nullás maximum félreértelmezését szüntettük meg.

## Felület

HU/EN/DE nyelven „Napi leghosszabb szakaszok átlaga” szerepel mindkét havi megjelenítésben, a havi trend címében és a kapcsolódó mérföldkövek magyarázatában is az átlag jelentése egyértelmű. Mindkét nézet elmagyarázza a kezdési dátum szerinti hozzárendelést és az összalvás naptári felosztását. A havi riportban ez a mutató teljes szélességű sort kapott, hogy a felirat és a mintaszám keskeny kijelzőn is elférjen.

## Gépi bizonyíték

- Javítás előtt a két reprodukció **2/2 bukott**: riport 6 óra a 12 helyett; folytatódó napon nulla a hiányzó maximum helyett.
- `src/longestBlock.test.ts`: **11/11 PASS**. Hét éjszaka / 14 érintett dátum; napi maximumok átlaga; hónap- és évváltás; éjféli kezdet/vég; duplikált és érintkező szakaszok; aktív/hibás rekord; hiányzó havi és változásfigyelő értékek; tavaszi 11 órás és őszi 13 órás éjszaka Budapest időzónában; bemeneti napló megőrzése.
- Teljes csomag: **42 fájl, 504/504 PASS**. A közös napi forrás közvetlen és előkészített használatának meglévő regressziói is sikeresek. A korábbi éjszakairutin-próba csak a nullable maximum típusához igazodott; az 5 órás elvárt eredmény változatlan.
- Frontend typecheck, helyi build és PWA-generálás PASS. Meglévő bundle-figyelmeztetés: JS 724,27 kB / gzip 221,44 kB.
- Új `scripts/longest-block-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**. Mindkét nézet 12 órát / 7 kezdési napot mutat, helyes felirat és magyarázat, hiányzó havi maximum és visszaállás újratöltés nélkül, túlcsordulás nélkül. Nulla oldalhiba és nulla váratlan API/külső kérés.
- A hiányzó havi maximum UI-ágát mesterséges, érintkező naplófragmentumokkal teszteltük; ez a hiányzóérték-kezelés próbája, nem élettanilag valószerű alvásminta.
- Futtatás: `node scripts/check-statistics-performance.mjs --longest-block-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplókkal. A teljes statisztikai parancs is tartalmazza az új próbát; az S02–S09 böngészőkört és a nagy naplós teljesítménymérést most nem ismételtük.
- Képek a Gitből kizárt `.private-backups/s10-{hu,en,de}-{320,393}-{development,report,missing}.png` fájlokban. Magyar 320 px riport, német 320 px fejlődési összevetés és angol 320 px hiányzóérték-állapot vizuálisan ellenőrizve. `git diff --check`: PASS.
- Nincs új függőség vagy tárolási/API-migráció: a nullable maximum és a mintaszám futás közben képzett statisztikai adat.

## Folytatás

S01–S10 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6 lezárva. A teljes A27 és a közös valódi telefonos elfogadás nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S11 — hiányos napló, teljes megfigyelés és valódi nulla elkülönítése, a 4/5 napos minimum és a változásjelzés egyeztetése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Unify daily longest sleep averages across monthly statistics`
