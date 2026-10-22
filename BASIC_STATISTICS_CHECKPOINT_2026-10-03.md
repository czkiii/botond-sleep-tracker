# A21 — alapösszegek, szűrés és időpontjelzések

Dátum: 2026-10-03. Kiinduló HEAD: `3197e0d5c3f386ddfc6bffc31d75a92cb4f0b3e6`, `feat/child-profile-v4`.

A tulajdonos most nem tud telefonon tesztelni. Az A27 három előkészített telefonos blokkja ezért várakozik; a már sikeres gépi és M1–M6 bizonyítékot megőrizzük. Helyette a meglévő kiadási audit A21 pontjának helyi javítása készült el.

## Eredmény

- A főoldal mai összege az átfedő időt egyszer számolja: 12:00–13:00 és 12:30–13:30 együtt 90 perc. A nyers rekordok megmaradnak. Az összefésülés közös segédfüggvény a statisztikai napi forrással.
- A főoldal a mai napra eső nyers időt mutatja, beleértve az aktív alvás eddigi részét. A rövid, hosszú és ellentétes kézi típusú rekordok itt megmaradnak; hibás időtartam és egy percnél távolabbi jövőbeli időpont nem növeli az összeget.
- Az elemzés korábbi minőségi szűrése változatlan: legalább 2 perces, 18 óránál rövidebb lezárt rekordok; hibás/jövőbeli és kézi típuskonfliktusos csoportok kizárva. A sorrendalapú elemzések átfedéskizárása szintén megmaradt. HU/EN/DE lenyitható szöveg magyarázza a nyers és az elemzett összeg különbségét, valamint a naptári napokkal és az adatos dátumokkal képzett átlag eltérését.
- A pozitív, egy percnél kisebb időtartam `<1 p` / `<1 min` / `<1 Min.`. Öt perc hétnapos átlaga nem látszik valódi nullának; a pontos számítás nem változott.
- Az alvás indítása egyetlen friss időpontot használ. A nulla eltelt idejű új aktív rekord nem kap téves időhibát; a tényleges hibás/jövőbeli rekordok védelme megmaradt.
- A mai lista valódi napátfedést használ: az éjfélkor végződő alvás nem kerül a következő napra, az előző napon indult aktív alvás viszont megjelenik.
- Az előzmények „Ma” / „Tegnap” címkéje tényleges helyi dátumhoz kötött, nem a lista első/következő eleméhez. A fejléc évet is tartalmaz, és időzónaváltáskor újracsoportosul.

## Ellenőrzés

- `src/basicStatistics.test.ts`: 10 új próba, átfedés/duplikátum, nyers–elemzett eltérés, ötperces rekord, éjfél, hibás/jövőbeli idő, indítás, tavaszi/őszi óraátállítás, hónaphatár és UTC/Budapest/Tokió.
- Teljes Vitest: **48 fájl, 579/579 PASS**. Frontend typecheck és production build PASS; a korábbi nagy bundle figyelmeztetés megmaradt.
- `npm run test:basic-statistics`: **6/6 PASS**, HU/EN/DE × 320/393 px. Főoldali és napi statisztikai egyezés, nap/hét váltás, `<1 perc`, azonnali indítás, történeti év/dátum, napváltás és élő időzónaváltás ugyanabban a lapban. Nincs oldalhiba vagy váratlan külső/API kérés. A HU 320 px főoldal és DE 320 px magyarázat képi ellenőrzése rendben.
- A gépi próba helyi Vite és elkülönített Edge-környezetet használ, mesterséges adatokkal; nem telefonos vagy szerveres szinkronpróba. Futtatáshoz Playwright szükséges, a meglévő `SOLEMI_PLAYWRIGHT_MODULE` és `SOLEMI_BROWSER_CHANNEL` beállításokkal.
- Teljes korábbi statisztikai böngészőregresszió: **85 PASS próbasor + 4/4 teljesítménykontroll**, exit 0. Az S01–S15 és a közös A27 napló eredményei megmaradtak. Helyi napló: `.private-backups/a21-statistics-regression.log`.
- A 3,2 másodperces nyugalmi mérésben 1800/5000 rekord × Free/Family+ esetben nulla új statisztikai számítás. A fejlesztői környezet első számításainak összesített mért ideje sorrendben 14,8 / 1085,3 / 31,3 / 4574,5 ms; ezek az instrumentált függvényidők, nem valódi telefonos renderidők. Az első prémium számítás költsége továbbra is A22 feladat.
- `git diff --check` PASS.

## Határ és folytatás

Az A21 változások helyiek; commit/push/deploy nem történt. A korábban ellenőrzött távoli `3197e0d` frontend/Worker ezeket még nem tartalmazza. Valódi fiók vagy családi adat nem változott.

A teljes kiadási kapu és az A27 telefonos elfogadás nyitott. Nem indítunk külön új telefonos tesztsorozatot az A21 miatt: a megjelenítés végső készülékes ellenőrzése a már előkészített közös körhöz kapcsolódik, amikor a tulajdonos ráér.

Az akkori következő feladat, **A22 — az első prémium számítás gyorsítása**, még 2026-10-03-án helyben elkészült. [Friss mérés és folytatás](STATISTICS_INITIAL_OPEN_CHECKPOINT_2026-10-03.md). A már megoldott másodperces újraszámolást nem nyitottuk újra.

GitHub Desktop Summary: `Unify daily sleep totals and clarify statistics filtering and dates`
