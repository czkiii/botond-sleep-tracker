# A27/S02 — megszakított éjszaka és reggeli ébredés

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

S02 helyi javítása és gépi elfogadása kész. A három 20:00–01:00 + 01:30–06:00 éjszaka rutinja most 20:00-s elalvás, 06:00-s utolsó rögzített ébredés és pontosan 3 éjszakaminta. Korábban a kezdési dátumonként leghosszabb szakasz kiválasztása 01:00-s ébredést és 4 mintát adott.

Kiinduló HEAD: `344f448` — `Trial rules and checklist`, ág `feat/child-profile-v4`; tiszta munkafa. A változások helyiek, commit/push/deploy és távoli adatírás nem történt. M1–M6 kézi elfogadás továbbra is 6/6 kész; új tulajdonosi kézi tesztet nem kérünk.

## Pontos csoportosítási szabály

- A rutin meglévő déli óraidő-választóhatárával összhangban egy éjszakaminta a készülék helyi déltől következő délig tartó naptári ablakához tartozik. Az éjfél utáni kezdés az előző este ablakába kerül. DST-nél naptári napváltás történik, nem fix 24 óra hozzáadása.
- A meglévő éjszakai besorolást használjuk: `splitDayNight` szerint éjszakai többség, a kézi nappal/éjjel felülírással együtt. A nappali szakaszok nem lesznek az éjszakai rutin részei. Ez a napló szerinti osztályozás, nem fiziológiai ébredésfelismerés; a nem rögzített visszaalvás nem következtethető ki.
- Egy csoport első éjszakai szakaszának kezdése és utolsó éjszakai szakaszának vége adja a rutint, a szakaszok hosszától függetlenül. A mintaszám éjszakákat számol, nem éjfél által szétvágott kezdési dátumokat.
- A csoportot előbb a teljes bemenetből alakítjuk ki, majd az utolsó ébredés alapján alkalmazzuk a kiválasztott időtávot. Így egy időtávhatár nem változtatja a hajnali visszaalvást esti elalvássá.
- A rutin csak a következő helyi dél elérésekor veszi fel a mintát. A mostani éjszaka reggel még nem végleges: későbbi rögzített visszaalvás módosíthatná az eredményt. Aktív vagy minőségszűrésből kizárt bejegyzéshez tartozó ablakot konzervatívan kihagyunk; az éjszaka hiányzó utolsó szakasza helyett nem használjuk az előző ébredést. A déli határon átnyúló éjszakai szakasz sem ad lezárt mintát.
- Ez kizárólag a rutinminták csoportosítása. Nincs session-összevonás, naplómódosítás vagy ébrenléti szünet alvásként hozzáadása. A példa három éjszakájának alvásösszege 28,5 óra, leghosszabb folytonos szakasza 5 óra, összesen 6 külön epizód.
- HU/EN/DE felületi magyarázat jelzi az első elalvás/utolsó rögzített ébredés használatát és a déli lezárást.

## Ellenőrzések

- A régi kódon az első 14 új eset közül **12 bukott**, köztük az audit hibapéldája, az éjfél utáni első elalvás, a nyitott/hibás éjszaka, az időtávhatár és a DST-csoportosítás.
- Végleges `src/nightRoutine.test.ts`: **18/18 PASS**. Megszakított és éjfél után kezdődő éjszaka, több szakasz egyetlen éjszakán, 02:00/07:00 köztes állapot, déli határ ezredmásodperces ellenőrzése, aktív és hibás utolsó szakasz, átfedés, bemeneti sorrend, 7/14 napos szűrés, kézi típus, nappali alvások, alvásösszeg és folytonos szakasz megőrzése. Budapest/New York/Lord Howe óraátállítás.
- Teljes helyi tesztcsomag: **34 fájl, 423/423 PASS**.
- Frontend TypeScript ellenőrzés: PASS.
- Helyi build és PWA-generálás: PASS. Korábbi bundle-méretfigyelmeztetés továbbra is fennáll (JS 714,78 kB, gzip 218,51 kB).
- Elkülönített helyi Edge: `check-statistics-performance.mjs --freshness-only` PASS. Az új böngészős eset 11:59:59-kor két lezárt éjszakával még nem mutat reggeli mintát; 12:00-kor kattintás/újratöltés nélkül 06:00 és 3/3 jelenik meg. A meglévő stopper-, perces frissítés-, adatcsere-, gyermekváltás-, háttér/visszatérés-, éjféli és jogosultságváltás-próbák is sikeresek. Mesterséges adatok, nulla oldalhiba és nulla váratlan API/külső kérés.
- `git diff --check`: PASS. A böngészőpróba meglévő külső Playwright futtatókörnyezetet használt, új függőség nélkül.

## Határok és következő feladat

Ez az S02 helyi számítási kapuját zárja. Az A27 közös telefonos elfogadása, a hiányos napok értelmezése (S11), a teljes besorolási/átfedési szabály (S13), az állandó családi időzóna (S14), az esti és visszaalvási becslési minták (S15) továbbra is külön nyitott feladat. S03 éjfél körüli körkörös óraidő-statisztikája nem része ennek a javításnak.

**Következő feladat: A27/S03 — éjfél körüli óraidők körkörös statisztikája, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Fix fragmented-night routine grouping and final waking`
