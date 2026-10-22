# A27/S03 — körkörös óraidő-statisztika

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S03 helyi számítási és felületi javítása kész. A `23:55, 00:05, 23:55, 00:05` minta eredménye **00:00**, a középső 50% tartománya **23:55–00:05, éjfélen át**, 4/4 megfigyeléssel a ±30 perces sávon belül. Korábban 12:00-s medián és fordított értelmű 00:05–23:55 tartomány keletkezett.

Kiinduló HEAD: `77b358c` — `Fix fragmented-night routine grouping and final waking`, `feat/child-profile-v4`; tiszta munkafa. Az S02 már commitban volt. S03 helyi módosítás: commit/push/deploy, távoli családi adat vagy valódi fiók módosítása nem történt. M1–M6 kézi elfogadás továbbra is 6/6 lezárva.

## Dokumentált algoritmus és megjelenítés

1. Legalább három véges óraidő szükséges. Az időpontokat 0–1439 perc közé normalizáljuk, az eredeti bemenet módosítása nélkül.
2. Az órakör legnagyobb üres szakaszánál vágunk. Az így egybefüggővé tett megfigyelésekből számítjuk a mediánt és az interpolált Q1–Q3 tartományt. Ugyanez a függvény számolja az elalvási és az ébredési mintát; nincs külön déli eltolás az elalvási mediánhoz.
3. Csak **12 óránál rövidebb befoglaló íven** adunk középértéket. Legalább fél kört lefedő vagy átellenes mintánál konzervatívan nincs egyetlen tipikus időpont. Ez szándékosan egy domináns csoport és egy átellenes szélsőérték esetén is visszatarthatja a kijelzést.
4. Az unrounded medián körüli, meglévő **±30 perces sávba a minták szigorú többségének** kell esnie. Így a két azonos súlyú, távoli csoport közötti, megfigyeléssel nem támogatott közép nem lesz kiemelt rutin. Egy domináns közeli csoport mellett a távolabbi értékek továbbra is beleszámítanak a mintaszámba és a kvartilisekbe. Ez konzervatív megjelenítési szabály, nem klinikai vagy általános multimodalitási teszt.
5. A kimenet percenként kerekített. A Q1–Q3 határokat sorrendjük megtartásával visszavezetjük az órakörre; ha az alsó óraidő nagyobb a felsőnél, `rangeCrossesMidnight` jelöli a tartomány éjféli átlépését.
6. A rutin sorában HU/EN/DE nyelven látszik az „időpontok középső 50%-a” és szükség esetén az „éjfélen át” jelzés. Elegendő, de szórt adatoknál külön változó-minta szöveg jelenik meg. Ezt nem nevezzük három hiányzó megfigyelésnek; háromnál kevesebb mintánál továbbra is a gyűjtési állapot marad.

Az S02 éjszakacsoportosítása, déli lezárása, a sessionök, időtartamok, alvásösszegek és ébrenléti ablakok számítása változatlan. A globális rutin-kártya a nappali alvásszám miatt akkor is lehet kész, ha valamelyik óraidőre nincs egységes minta; a két óraidő saját visszajelzést kap.

## Gépi bizonyíték

- Javítás előtt az első 5 integrációs esetből **3 bukott**: éjfélből 12:00; 01:00 és 05:00 csoportjaiból meg nem figyelt 03:00; teljes órakörre szórt mintából 09:00.
- `src/clockRoutine.test.ts`: **24/24 PASS**. Éjfél és rendes reggeli minta, azonos időpontok, normalizálás, minimális mintaszám, hibás bemenet, átellenes/szórt/kétcsúcsú minták, domináns csoport és szélsőérték, ±30 perc pontos határa, tiszta bemenet. Egy tulajdonságteszt a mintát mind az **1440 egészperces eltolásban** elforgatja, és ellenőrzi a medián, Q1–Q3 és éjféli jelző eltoláshelyességét, fordított bemeneti sorrenddel is.
- Teljes csomag: **35 fájl, 447/447 PASS**.
- Frontend typecheck: PASS. Helyi build és PWA service worker generálás: PASS. A meglévő bundle-figyelmeztetés fennmaradt: JS 716,45 kB / gzip 219,21 kB.
- `check-statistics-performance.mjs --freshness-only`: a korábbi statisztikai frissülés és S02 déli váltás PASS. Az új `routine-clock-check.mjs` **HU/EN/DE × 320/393 px, 6/6** esetben ellenőrzi az éjféli középértéket, tartományt, kétcsúcsú/szórt minta magyarázatát, kevés minta állapotát és a keskeny nézet túlcsordulását. Nulla oldalhiba és váratlan API/külső kérés.
- Tesztartefaktok Gitből kizárva: `.private-backups/s03-{hu,en,de}-{320,393}-{midnight,variable}.png`. A magyar 320 px éjféli és változó-minta képek vizuálisan is ellenőrizve.
- `git diff --check`: PASS. Új alkalmazásfüggőség nincs; a meglévő külső Playwright és elkülönített helyi Edge futtatás szolgálta a felületi próbát.

## Folytatás

Az S01–S03 helyi kapuk lezárva. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott; nem indítunk új tulajdonosi kézi kört ehhez a javításhoz.

**Következő feladat: A27/S04 — minimum mintaszám és a kiemelt tipikus ébrenléti érték egyeztetése, 0/1/2/3 mintás gépi és felületi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Fix circular routine clock statistics and ambiguous patterns`
