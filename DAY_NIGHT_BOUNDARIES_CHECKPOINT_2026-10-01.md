# A27/S01 — pontos nappal/éjjel bontás

Dátum: 2026-10-01. Feladatszint: GPT-6 Astra · erős.

## Eredmény és állapot

Az S01 közös számítási javítása helyben kész, gépi regresszióval igazolva. Az A27 teljes kiadási kapuja és annak későbbi közös telefonos elfogadása ettől még nyitott. A tulajdonostól most nem kérünk kézi próbát.

Kiindulás: `feat/child-profile-v4`, `3acac04` — `Improve settings usability and reduce statistics recalculation`. Az előző A20/A22 csomag már commitban van, a munkafa a kör elején tiszta volt. A mostani S01 változások helyiek; commit/push/deploy nem történt. Távoli staging buildet nem ellenőriztünk, fiókhoz vagy valódi családi adatokhoz nem nyúltunk.

## Javított hiba

Korábban a `splitDayNight` az alvás kezdetétől egyperces lépésekben sorolt be. A 18:59:30–19:02:30 szakasz 60 másodperc nappalt és 120 másodperc éjszakát kapott a helyes 30/150 helyett. Közel azonos aránynál ettől a teljes alvás típusa is megfordulhatott.

Az új `src/sleepTime.ts` közös szakaszbontást és 06:00/19:00 konstansokat ad. Valós helyi éjfél-, nappal- és éjszakahatárokig lép, időbélyeg-különbséget számol, megőrzi a rész-másodperceket. A 23/25 órás naphoz nem ad fix 24 órát. A `utils.ts` és a `sleepDevelopment.ts` ugyanazt használja; a fejlődés, változásfigyelő, havi riport és az ébrenléti/hasonló napos/becslési modulok ezen keresztül közös időbontásra támaszkodnak.

A kézi nappal/éjjel besorolás, a meglévő átfedési elsőbbség és az elemzési minőségszűrés megmaradt. Érvénytelen, fordított vagy üres időszakból nulla idő keletkezik, nem NaN. A számítás a készülék helyi időzónáját használja; a család állandó időzónájának termékdöntése továbbra is külön S14 feladat.

## Ellenőrzések

- A javítás előtt **5 új teszt bukott**, pontosan a 06:00/19:00 másodperces, ezredmásodperces és aktív alvási határokon. Ugyanezek a javítás után átmentek.
- Új `dayNightSplit.test.ts`: **23/23 PASS**. UTC határok, éjfél, több nap, tényleges idő megőrzése, aktív alvás, kézi típusok, hibás bemenetek; Budapest és New York egyórás, Lord Howe félórás tavaszi/őszi óraátállításai. Külön budapesti automatikus DST-éjszakák egyeznek a napi riporttal.
- Egy 60 napos közös napló az összes érintett elemzőn végigmegy. Az 05:58:50–06:01:30 alvás helyesen nappali többségű (90 másodperc nappal / 70 éjjel), és a napi, fejlődési, havi, rutin-, ébrenléti, hasonló napos és becslési eredmények ezt követik.
- Teljes csomag: **33 fájl, 405/405 PASS**.
- Frontend typecheck: PASS. Build, PWA service worker generálással: PASS. A korábbi bundle-figyelmeztetés megmaradt (JS 713,53 kB / gzip 218,11 kB).
- `npm run test:statistics`: **4/4** 1800/5000 × Free/Family+ mérési eset PASS, a másodpercek alatt továbbra is nulla felesleges újraszámolás. A vezérelt órás adat-/gyermek-/jogosultság-/háttér-/éjfél-/stopper-regresszió is PASS. Edge 154.0.4258.37; elkülönített kontextusok, mesterséges adatok, nulla váratlan API/külső kérés vagy oldalhiba.
- `git diff --check`: PASS.

## Teljesítménymérés és határa

`node scripts/measure-day-night.mjs`: helyi Node v24.21.0, Europe/Budapest, napi négy darab kétórás automatikus alvás, 10 másodperces eltolással. Mindkét algoritmus bemelegítve, hét váltott mérés mediánja. A mérőben a korábbi perces algoritmus másolata szerepel; ez csak mérési referencia, az alkalmazás nem használja.

| Bejegyzés | Régi perces lépések | Új szakaszok | Régi medián | Új medián | Arány |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1800 | 216 000 | 2392 | 11,27 ms | 2,61 ms | 4,32× |
| 5000 | 600 000 | 6576 | 31,72 ms | 7,24 ms | 4,38× |

Ez **az időbontás** gyorsulása, nem a teljes alkalmazásé. A teljes prémium függvénycsoport két StrictMode-számítása 1800 bejegyzésen 1097,2 ms, 5000-en 4728,9 ms lett; a korábbi 1136,3/4720,8 ms-hoz képest nincs jelentős általános gyorsulás. Ezek fejlesztői egyszeri minták, nem teljes oldalbetöltési vagy telefonos értékek. A mikrobenchmark időmérése külön futott; a teljes böngészőmérés nem elkülönített laborprofil. A további költséges, teljes történetet ismételten feldolgozó elemzések optimalizálása és a valódi telefonos profil az A22 alatt nyitott marad.

Nyers helyi adatok (Gitből kizárva): `.private-backups/s01-day-night-performance.json`, `.private-backups/s01-before-statistics.json`, `.private-backups/s01-after-statistics.json`. A mérőszkript nem telepít új függőséget és nem kér fiókot.

## Folytatás

M1/M2/M4 kézi ellenőrzés kész; M3/M5/M6 megálló megőrizve, nem indítunk ismételt teljes tesztkört. Részletek a `MANUAL_ACCEPTANCE_2026-09-26.md` fájlban.

**Következő feladat: A27/S02 — a megszakított éjszaka és a valódi reggeli ébredés elkülönítése, közös mesterséges naplóval és automatikus próbákkal. Feladatszint: GPT-6 Astra · erős.** Az ébrenléti szünetet nem szabad alvásként összeadni. Ehhez a helyi munkához sem kell tulajdonosi kézi teszt.

GitHub Desktop Summary:

```text
Fix exact day/night boundaries and share sleep time splitting
```
