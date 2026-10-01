# A22 — statisztikai újraszámolás, mérés és folytatási összefoglaló

Dátum: 2026-09-30. Feladatszint: GPT-6 Astra · erős.

## Megálló

A kért A22 helyi rész elkészült. A tulajdonos kézi teszt nélkül kért előrelépést; a próbák elkülönített, helyi böngészőben, mesterséges naplókon futottak. Az eredeti Edge/Chrome fiókokat és a családokat nem módosítottuk.

Ág: `feat/child-profile-v4`, HEAD: `bc7b298` (`Recover rejected last-child deletions without losing local data`). Az előző A20 és a mostani A22 változásai együtt helyi, még nem commitolt módosítások. Commit/push/deploy/main-merge nem történt; a távoli staging verzióját ez a kör nem ellenőrizte.

## Változások

- A `StatsPage` levált az App másodperces `now` értékéről, és memoizált komponens lett. A stopper működése változatlanul másodperces.
- A `useStatisticsTime` perchatárra időzíti a statisztikát. Napló-/gyermekváltáskor a tényleges aktuális idővel azonnal számol; nem kerekíti vissza az időt egy frissen lezárt alvás elé.
- Rejtett lapon az időzítő nem indít periodikus elemzést. Visszatéréskor/fókuszkor azonnal frissít és újra időzít. Unmountkor az időzítő és az eseménykezelők megszűnnek.
- A jogosultsággal nem elérhető prémium számítások nem futnak. Nyitott statisztikánál a jogosultság változása is érvényesül.
- A napi előfeldolgozás eredményét a fő diagram, fejlődés, változásfigyelő és havi összefoglaló megosztja. Az önálló elemzőfüggvények korábbi hívási módja megmaradt.
- A számítások matematikai szabályait ebben a körben nem változtattuk meg. A közös előfeldolgozás eredményazonosságát üres, tiszta, illetve átfedő/aktív/jövőbeli/hibás adatokat tartalmazó naplókon is teszteltük.

## Gépi mérés

Edge **154.0.4258.37**, helyi Vite fejlesztői build, React StrictMode, 393×852 nézet, Europe/Budapest időzóna. Mesterséges, nem átfedő, napi négy darab kétórás alvás, összesen 1800 vagy 5000 bejegyzés; Free és Family+ nézet. Nincs CPU-lassítás vagy valódi telefonos mérés.

A mérőszkript csak a tesztszerveren csomagolja be a hét elemző belépési pontot; a javítás után az új közös előfeldolgozót is. Hívásszámot és `performance.now()` időt gyűjt. Egymásba ágyazott hívások idejét nem adja össze kétszer. A fejlesztői StrictMode duplázását nem rejti el. A mérési órát csak a külön frissítési próbában helyettesítjük, az időmérés valós órán fut.

Változatlan statisztikai nézet, névleg 3200 ms várakozással vett minta:

| Napló / nézet | Előtte: egy-egy prémium belépési pont új hívásai | Utána: összes mért elemző új hívása | Előtte: mért számítási idő | Utána |
| --- | ---: | ---: | ---: | ---: |
| 1800 / Free | 6 | 0 | 3369,3 ms | 0 ms |
| 1800 / Family+ | 6 | 0 | 3468,1 ms | 0 ms |
| 5000 / Free | 2 | 0 | 4721,5 ms | 0 ms |
| 5000 / Family+ | 2 | 0 | 4724,6 ms | 0 ms |

Az előtte mért idő meghaladhatja a névleges várakozást: a hosszú szinkron számítás a böngésző főszálát és a mintavételt is késleltette. A nagyobb napló kevesebb hívása ezért nem jobb teljesítmény. Ezek egyszeri helyi minták, nem telefonos CPU-/akkumulátoradatok és nem statisztikai percentilisek. A stabil regressziós feltétel az új hívások **nulla** száma a változatlan másodpercek alatt, nem egy gépfüggő időhatár.

A javított első megjelenítés mért függvényideje (StrictMode miatt két számítás): Free 1800: **11,2 ms**, Free 5000: **24,2 ms**; Family+ 1800: **1136,3 ms**, Family+ 5000: **4720,8 ms**. Ez nem teljes képernyő-betöltési idő. A Family+ első kiszámítása továbbra is költséges; ezt a ritkítás nem oldja meg. Az A27/S01 időbontás és a további előfeldolgozás/kódbontás után új profil szükséges.

Nyers helyi eredmények (Gitből kizárva): `.private-backups/a22-baseline.json`, `.private-backups/a22-after.json`. A kiinduló mérés az A22 módosításai előtt, a már meglévő A20 munkán készült.

## Ellenőrzések

- Teljes tesztcsomag: **32 fájl, 382/382 PASS** (három új közös-előfeldolgozási regresszió).
- Frontend `npm run typecheck`: PASS.
- `npm run build`: PASS, a PWA service worker generálásával együtt. Meglévő nagy bundle figyelmeztetés: JS 713,41 kB / gzip 218,08 kB. Worker-kódot nem változtattunk; a teljes tesztcsomag a Worker tesztjeit is lefuttatta.
- Új `npm run test:statistics`: mind a négy 1800/5000 × Free/Family+ mérési eset PASS.
- Külön vezérelt órás böngészőpróba PASS: másodperces stopper; másodpercek alatt változatlan elemzésszám; perchatár; időszakválasztás napi előfeldolgozás ismétlése nélkül; aktív alvás változatlanul nyitva marad; alvás lezárásának azonnali beleszámítása; gyermekváltás és elkülönítés; törlés; háttér/visszatérés; fókusz és éjfél; Free/Family+ váltás; unmount utáni takarítás.
- Böngészőpróbákban nulla váratlan oldalhiba vagy külső/API-kérés.
- `git diff --check`: PASS.

Futtatás a meglévő Playwright futtatókörnyezettel:

```powershell
$env:SOLEMI_PLAYWRIGHT_MODULE='C:/Users/bobaa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:SOLEMI_BROWSER_CHANNEL='msedge'
npm run test:statistics
```

Új projektfüggőség nincs. A `--freshness-only` csak a gyors időzítési próbát futtatja. A `--baseline` az éppen megnyitott forrást méri regressziós elvárások nélkül; régi mérés reprodukálásához a régi forrás szükséges, és a kapcsoló felülírja a helyi baseline JSON-t.

## Megmaradó kapuk és következő feladat

**Az A22 teljes kiadási kapuja még nyitott:** gyengébb valódi telefonon 1800/5000 bejegyzés, hosszabb használat, interakció- és akkumulátorterhelés, illetve az első prémium számítás további gyorsítása még szükséges. A teljes alkalmazás kiadási készültségére ebből nem adunk százalékot.

A korábbi A20 eredmények a `SETTINGS_UX_CHECKPOINT_2026-09-30.md` fájlban vannak; a beállításrendezés és a gyermekdialog javításai megmaradtak.

Kézi elfogadás: **M1/M2/M4 kész, 3/6; M3/M5/M6 parkol** a `MANUAL_ACCEPTANCE_2026-09-26.md` szerint. A korábbi sikeres kézi köröket nem indítjuk újra. Most nincs tulajdonosi tesztfeladat.

**Következő önálló feladat: A27/S01 — másodpercpontos nappal/éjjel időbontás és közös időhatár-kezelés, automatikus határesetekkel és új teljesítményméréssel. Feladatszint: GPT-6 Astra · erős.** A perces léptetés helyett pontos szakaszbontás készülhet; külön ellenőrizendő a másodperc, az éjfél, a nyári/téli időváltás és a kézi nappal/éjjel besorolás. Ez a következő feladat, ebben a körben még nem implementáltuk.
