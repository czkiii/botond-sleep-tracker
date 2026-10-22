# A27 — közös elfogadás és rövid telefonos folytatás

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Mit zárunk le?

Az S01–S15 javításai elkészültek. A közös elfogadás azt igazolja, hogy a javított kártyák ugyanazt a naplót következetesen értelmezik, és a szöveg a számítás tényleges jelentését írja le. Nem új funkció és nem újabb 15 kézi teszt. A teljes A27 kiadási kapu a telefonos bizonyítékig nyitott marad; a többi kiadási kaput ez nem zárja le.

Kiinduló commit: `2ecc857` — `Separate bedtime and night resettling in wake windows and predictions`, `feat/child-profile-v4`, tiszta munkafa. Az előkészítés új gépi próbákból, közös mesterséges naplóból és dokumentációból áll; az alkalmazás számítási kódját nem módosítja. Commit/push/deploy és valódi családi adat módosítása nem történt.

## Egyetlen közös próbanapló

Fájl: [a27-common-diary.json](test-fixtures/a27-common-diary.json). Valós személyes adatot nem tartalmazó, a tényleges V4 mentésértelmezővel ellenőrzött importfájl: egy `A27 próbanapló` gyermek, 162 alvás.

Budapesti idő szerint augusztus 1–20. és szeptember 10–29. napjain: 12:00–13:00 nappali alvás; 20:00–00:00, 00:15–03:00 és 03:15–06:00 éjszakai szakaszok. Szeptember 30-án nappali alvás és 20:00–október 1. 00:00 szakasz. A gépi referencia **2026-10-01 00:05, Europe/Budapest**; a valódi telefonos próba a tényleges aktuális időben történik.

| Közös ellenőrzés | Gépi referenciaeredmény |
| --- | --- |
| Összes idő, napi bontás | 425 óra összesen; minden dátumon nappal + éjjel = összes; az éjféli vég nem hoz létre októberi adatos napot |
| Ébrenléti ablak és becslés, 14 nap | Visszaalvás 15 perc, 27 minta, 00:15–00:15 becslés; első éjszakai elalvás előtt külön 7 óra / 14 minta |
| Rutin | 20:00 első elalvás, 06:00 utolsó ébredés; 14 lezárt éjszaka |
| Fejlődés és havi riport | Szeptember 21 adatos dátum, 10 óra 14 perc megjelenített napi átlag; nappal 1 óra, éjjel 9 óra 14 perc; napi maximumátlag 4 óra / 21 kezdési nap. A pontos átlagokat csak a megjelenítés kerekíti lefelé |
| Riport időszaka | Szeptember; összevetés augusztussal; október még folyamatban |
| Naplóeltérés | 5/5 friss, 16/28 korábbi adatos dátum; nincs kiemelt eltérés, teljesség továbbra is ismeretlen |
| Legközelebbi napok | 00:05-kor még nincs mai lezárt alvás, ezért nincs találat; ez szándékosan eltér a tegnap esti ébredést még használó éjszakai becsléstől |

Az általános diagram, a gördülő 7/14/30 nap, a háromhavi fejlődés és a lezárt havi riport más időszakot használhat: ezek számait nem kell mesterségesen azonossá tenni. A megnevezett időszak, a mintaszám és az alkalmazott szabály egyezése az elfogadási feltétel.

## Gépi lefedettség

- `src/statisticsAcceptance.test.ts`: közös napi forrás és az összes elemző, 7/14/30 napos mintaváltás, eredeti rekordok megőrzése; V4 importértelmezés; szerializálás, fordított érkezési sorrend és törlés–visszaillesztés után azonos végállapot; aktív és üres napló, helyreállítás.
- `scripts/statistics-acceptance-check.mjs`: ugyanaz a JSON a hét kártyán, HU/EN/DE × 320/393 px; egymástól független böngészőkörnyezeti egyezés, fordított naplócsere, újratöltés, aktív alvás, üres napló és visszaállítás. Kártyaszövegek, túlcsordulás, sablonmezők, oldalhibák, váratlan hálózati hívások ellenőrzése.
- A teljes `npm run test:statistics` futtatás a korábbi célzott S01–S15 köröket, frissülési próbát, nyugalmi teljesítménykontrollt és az új közös ellenőrzést is tartalmazza. Csak a közös próba: `node scripts/check-statistics-performance.mjs --acceptance-only`.
- A böngészőpróba helyi adatcserét és az app távoli frissítési eseményét használja. **Nem igazol valódi szerveres szinkront, fizetős jogosultságot vagy telepített telefonos PWA-viselkedést.** Ezeket nem jelöljük késznek gépi felületi eredmény alapján.
- Részletes futási eredmény: [A27 checkpoint](A27_ACCEPTANCE_PREPARATION_CHECKPOINT_2026-10-03.md).

## Telefonos folytatás — előkészített terv, még NEM teljesített teszt

**2026-10-03, tulajdonosi halasztás:** a telefonos teszt most várakozik; helyette az önállóan végezhető [A21 javítással](BASIC_STATISTICS_CHECKPOINT_2026-10-03.md) haladtunk. Az alábbi három blokk megmarad, új külön telefonos sorozatot nem adunk hozzá. Az A21 megjelenítésének végső készülékes ellenőrzése ehhez a körhöz kapcsolódik. Az új A21 változások helyiek; a lent rögzített `3197e0d` távoli buildben még nincsenek benne, így a tényleges kezdéskor az aktuális buildet ismét azonosítani kell.

### Indulási feltételek

**2026-10-03, távoli build ellenőrizve:** a `https://solemi-sleep-internal.pages.dev/` oldal HTTP 200 választ adott; a kiszolgált `/assets/index-DHUF28gI.js` beégetett azonosítója `3197e0d5c3f386ddfc6bffc31d75a92cb4f0b3e6`, azonos a helyi HEAD-del. A staging Worker `/health` törzse és `X-Solemi-Build-Sha` fejléce ugyanezt a SHA-t adta. A helyi HEAD-ből származó elvárt SHA-val futtatott `npm run smoke:staging` PASS: minden válasz verzióazonos, health/CORS rendben, anonim legacy létrehozás/csatlakozás tiltott, fiókos hozzáférés/családi műveletek/tesztcsomag munkamenetet kérnek. Nem történt deploy vagy családi adatváltoztatás. Ez nem igazolja a telefonok gyorsítótárát, bejelentkezését vagy Family+ jogosultságát; ezek még azonosítandók.

Az asszisztens előbb azonosítja és igazolja a javításokat tartalmazó belső build pontos SHA-ját és URL-jét, valamint mindkét telefon Family+ hozzáférését. Az előkészítés során nem telepítettünk új távoli buildet. Telefonon nem adunk meg addig kattintási utasításokat, amíg a tesztkörnyezet nincs konkrétan megnevezve.

Két valódi telefon, azonos build, `Europe/Budapest` időzóna és azonos tesztgyermek. Egy külön, eldobható **A27 elfogadási tesztcsalád** használható. Az Opo/Boti napló nem tesztcélpont. Az importot csak az előkészített tesztcsaládban végezzük: a családi import a többi eszköz adatát is cseréli. A belépés/család-előkészítés egyszeri előfeltétel, nem az M1–M6 újrafuttatása.

### 1. Közös történeti napló — egy import, két telefon

Az előkészített tesztcsalád egyik telefonján a fenti fájl importja, majd a másikon szinkron után ugyanaz a gyermek és 162 alvás. A statisztikában mindkét telefonon azonos szűrők. A szeptemberi fejlődés/riport közös számai: **21 adatos dátum, 10 óra 14 perc átlag, 4 óra maximumátlag / 21 kezdési nap**. A szeptember 30-i szakasz éjfélkor véget ér; nem ad október 1-re alvásidőt.

Ez a történeti ellenőrzés a megszakított éjszakát és a hónaphatárt együtt fedi. Az aktuális becslés/mintaszám a telefon valós dátumát követi, ezért a 00:05-ös gépi referenciaértéket nem kérjük számon. Régi ébredésből ne jelenjen meg aktuális becslés. Ha az aktuális dátum miatt más riport/időszak jelenik meg, azt a kijelzett időszakkal együtt értékeljük; nem állítjuk át a telefon óráját.

### 2. Aktív alvás — indítás, átvétel, lezárás

Az első telefonon új tesztalvás indítása. A másodikon szinkron után is aktív, és a statisztika megnyitása nem zárja le. Mindkét oldalon eltűnik a következő alvás időpontbecslése és az aktuális ébrenléthez kötött naplista. A történeti rutin/havi riport ettől még látható maradhat.

Legalább két perc után a második telefonon lezárás. Az elsőn is lezárttá válik, a statisztika az új ébredést használja. Kevés azonos típusú mintánál gyűjtési állapot is helyes; a régi ébredés/számláló nem maradhat ott. Ez egyetlen aktív-alvásos menet, nem szinkronhibák ismételt tesztelése.

### 3. Kevés adat — egy üres tesztgyermek

A tesztcsaládban létrehozott külön üres gyermeket mindkét telefonon kiválasztjuk. Nincs előző gyermekből átmaradt becslés, rutin, havi eredmény vagy találat; a felület érthetően adatot kér. Visszaváltva az eredeti próbagyermekre visszatérnek annak adatai. Nem kell a családi naplót törölni.

### Mit rögzítünk és mikor kész?

| Blokk | Állapot | Bizonyíték |
| --- | --- | --- |
| Build, telefonok, fiókok/jogosultság, időzóna azonosítva | RÉSZBEN KÉSZ | Frontend + Worker `3197e0d`, staging smoke PASS; telefonok/fiókok/jogosultság/időzóna még nyitott |
| 1. Közös történet és hónaphatár | NYITOTT | Két telefon megfelelő kártyái, egyező adatok |
| 2. Aktív alvás és lezárás | NYITOTT | Aktív/lezárt állapot és becslési viselkedés |
| 3. Üres gyermek és visszaváltás | NYITOTT | Gyűjtési állapot, majd helyes visszatérés |

Egy bizonyítékot minden kapcsolódó S-ponthoz felhasználunk. A nyelvi változatok, éjfél, DST, sérült/duplikált adatok és pontos küszöbök részletes gépi próbáit nem ismételtetjük végig telefonon. A már lezárt M1–M6 kör 6/6 marad. Eltérés esetén csak az érintett rész javítása és célzott újraellenőrzése szükséges. A27 csak a rögzített gépi eredmény és e telefonos blokkok sikeres lezárása után pipálható ki.
