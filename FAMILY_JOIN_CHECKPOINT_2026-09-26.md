# A15 — meglévő napló csatlakozása és gyermekprofilok

Dátum: 2026-09-26. Feladatszint: GPT-6 Astra · erős (high).
Alap: `1547fa7`, `feat/child-profile-v4`. A változások helyiek; commit/push a tulajdonos feladata.

## Elkészült viselkedés

- A meghívó elfogadása vagy a fiók családi kapcsolatának helyreállítása először csak előkészíti a készülékkapcsolatot. A hitelesítő adatok a helyi naplóval együtt, tartósan megmaradnak, de ebből az állapotból nincs naplófeltöltés.
- Nem üres helyi naplónál külön áttekintés mutatja a helyi és a családi gyermekprofilokat, születési dátumokat és alvásszámokat. A névazonosság nem jelent profilazonosságot. A családi napló használata külön választás; előtte letölthető a helyi JSON-mentés.
- A választás elhalasztható és újratöltés után folytatható. Ilyenkor a családi tagság már létrejöhetett, de a helyi naplóval lehet tovább dolgozni, és annak változásai még nem kerülnek a családhoz.
- Jóváhagyáskor a teljes helyi naplóról visszaállítási pont készül, az aktív alvással együtt. A családi napló, a szinkronkurzor és a kapcsolat egyetlen helyi írással kerül használatba. Quota-/íráshiba esetén a régi látható napló és az előkészített kapcsolat megmarad.
- Csak a valóban üres kezdőprofil csatlakozik külön naplóválasztás nélkül. Név, születési dátum, fotó vagy alvás megléte már áttekintést igényel. Az automatikus fiók-helyreállításra és az eszköz újracsatlakoztatására is ez vonatkozik.
- A megszakadt első letöltés új meghívókód nélkül újrapróbálható, ha a kapcsolat válasza már helyben elmentődött. Közben változó helyi napló, fiókmunkaterület vagy kapcsolat érvényteleníti a régi áttekintést. Hiányzó gyermekre mutató családi alvás nem kerül csendben eldobásra: a letöltés ellenőrzése megállítja az átvételt.
- Az eltérő helyi napló automatikus feltöltése és a gyermekek név szerinti összepárosítása nem része ennek a folyamatnak. A felület ezt előre elmagyarázza. Későbbi import továbbra is a meglévő, külön megerősített adatcsere-folyamaton történik, annak családi hatásával együtt.

## Párhuzamos módosítások

- A gyermekpatch kizárólag a szerkesztett mezőket írja. Bekapcsolt `RECONCILIATION_CONFLICTS` mellett a korábbi mezőértékeket ugyanabban az adatbázis-tranzakcióban ellenőrzi, amelyben a módosítást végrehajtja. Egy névváltoztatás és egy születésidátum-változtatás megfér egymás mellett.
- Ugyanazon mező két eltérő módosítása `CHILD` konfliktust ad. A helyi változat és a függő művelet megmarad; a felület megmutatja a helyi és a családi nevet/dátumot, majd választást kér. A régi kliensből megmaradt, mezőelőfeltétel nélküli műveletekre revízióellenőrzés vonatkozik.
- A már nyitott gyermekszerkesztő csak a ténylegesen szerkesztett mezőket alkalmazza a friss naplóra. A közben letöltött másik mezőt megtartja; azonos mező ütközése vagy törölt profil esetén a mentés megáll és a szerkesztő nyitva marad.
- Ha a gyermek törlése megelőzi az alvás létrehozásának atomi írását, új aktív vagy lezárt alvás már nem jöhet létre alatta. Fordított sorrendben a törlés az új alvást is lefedi. A vesztes módosítás nem fogyaszt műveletazonosítót és nem növeli a család revízióját.
- A letöltés gyermekei, alvásai és kurzora egyetlen D1 read batchből származnak. A batch tranzakciós viselkedésének alapja a [Cloudflare D1 dokumentációja](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). A kliens a kapott naplót és a kurzort szintén együtt menti.
- Lezárt alvás aktívként történő importja új rekordazonosítót kap, a régi lezárt rekord törlésével. Más gyermekhez áthelyezett importált alvás szintén új azonosítót kap; a korábbi profilhoz kötés így nem marad meg észrevétlenül.

## Ellenőrzés

- Teljes Vitest: **31 fájl, 371/371 sikeres teszt**. A korábbi 338-hoz képest 33 új regresszió.
- Frontend és Worker typecheck sikeres.
- Helyi Vite production build sikeres. A meglévő 500 kB feletti JS-csomag figyelmeztetés továbbra is fennáll; nem buildhiba.
- `npm run test:family-join`: elkülönített, headless Edge **153.0.4234.48**, **393×852** viewport. Valódi React felület, helyi szimulált API, tiltott külső hálózati kérések, új böngészőkörnyezet. Sikeres: azonos nevű eltérő gyermekek áttekintése; elhalasztás és újranyitás; megszakadt letöltés és újrapróbálás; JSON-letöltés; családi napló elfogadása a helyi mentés megőrzésével. A meghívó egyszer fogyott el, naplófeltöltés nem történt.
- Kliens–valódi Worker–helyi SQLite próbák: meghívós csatlakozás eltérő helyi profillal; gyermekmezők párhuzamos szerkesztése; helyi/családi konfliktusválasztás; régi kliens művelete; törlés és alvásindítás mindkét sorrendje; letöltési tranzakció előtti/utáni írás; lezárt→aktív import két készülékre szinkronizálása.
- Külön klienspróbák: hitelesített join/bootstrap útvonal, helyi aktív alvás megőrzése, elhalasztás alatti helyi szerkesztés, megszakadás, fiókváltás, hibás snapshot, quota mindkét mentési lépésnél, meglévő függő sor védelme, **2000 alvásos / kétprofilos** bootstrap és a letöltött adatok/kurzor együttes mentése.

A böngészős próba ugyanúgy külső Playwright futtatókörnyezetet használ, mint a PWA-próba. A `SOLEMI_PLAYWRIGHT_MODULE` és opcionálisan a `SOLEMI_BROWSER_CHANNEL=msedge` megadásával ismételhető. Új projektfüggőséget nem telepítettünk. A headless próba helyi fejlesztői felületet és szimulált API-t használ, nem igazol éles OAuth/cookie vagy mobil-PWA működést.

## Nyitott elfogadás és korlátok

- **A15 kiadási kapuja még nyitott:** új staging Worker/Pages build után külön, kis tesztcsaláddal kell igazolni a hitelesített kétkészülékes folyamatot. Az Opo/Boti naplóhoz és a meglévő családi szerepekhez a munka során nem nyúltunk.
- A tényleges D1-terhelés, mobilos hálózatváltás és telepített telefonos app működése nincs igazolva. A 2000 rekordos helyi próba nem teljesítménygarancia korlátlan naplóméretre.
- A régi kliens által korábban már összekevert helyi/családi naplókat ez a változás nem javítja visszamenőleg automatikusan.
- A korábbi kliens nem ismeri az új előkészített kapcsolatot és a gyermekkonfliktus-választást. Történeti kliensre történő visszaállás ezekkel a köztes állapotokkal külön kompatibilitási vizsgálatot igényel; az A24 korábbi, azonos kódú A/B próbája ezt nem igazolja.
- A későbbi kézi próba: (1) eltérő helyi gyermek és aktív alvás → csatlakozás → elhalasztás; (2) újranyitás → mentés → családi napló választása; (3) két telefonon eltérő mező szerkesztése; (4) ugyanazon mező ütközése, mindkét választási irány; (5) letöltés megszakítása és visszatérés. Valódi naplóval törlési próbát nem kell megismételni.

Javasolt commit Summary: `Protect existing diaries during family join and resolve child profile conflicts`

**Következő önálló feladat:** A16 — offline jogosultság és párhuzamos bejelentkezés-frissítés ellenőrzése, automatikus próbákkal. **Feladatszint: GPT-6 Astra · erős.**
