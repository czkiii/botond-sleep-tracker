# Solemi — szinkron újrateszt és folytatási pont

Dátum: 2026-09-17. A helyi javítás 138/138 teszten átment, de az eredeti telefonos duplikáció **még nincs elfogadva**. Ez a fájl segít a következő esti tesztet ugyanonnan folytatni.

## Élő újrateszt — bbac40b

A tulajdonos jelezte a sikeres deployt. Az első rövid próba már az alvás indításának másik telefonon való megjelenésénél elakadt. A két telefon családi panelállapota, pending/conflict száma, jogosultsága és mindkét futó build SHA-ja még egyeztetésre vár. A feltöltés és a fogadó oldali letöltés hibáját ebből a beszámolóból nem lehet megkülönböztetni. A teszt nem elfogadott; előbb ezt a normál Start-megosztást diagnosztizáljuk, a konfliktuskör még nem kezdődik. Korábbi adatot nem törlünk, nem párosítunk újra diagnózis nélkül.

Későbbi pontosítás: tulajdonos Family+, fotón `bbac40b`, Opo, 6 várakozó módosítás, „Adatok frissítése…”. Feleség Free és „szinkron most”. A fotó a beállítások kártyáját mutatja, nem a megnyitott családi panelt. A pontos feltöltési hiba még nem ismert.

Új, még nem commitolt hibajelzési szelet készült; 145/145 teszt, frontend typecheck és mindkét helyi build sikeres. A nem nyugtázott feltöltési hibát nem nyeli el és nem törli a pending műveletet; az internal családi panel hibakódot mutat. 15 másodperces teljes request/body határ védi a szinkronsort. Ez diagnózist és biztonságos újrapróbálást ad, a telefonos gyökérokot még nem bizonyítja.

Javasolt következő Summary: `Preserve failed sync operations and surface upload errors`. Az új internal build után nálad nyisd meg az Opo családi kártyát és olvasd le az esetleges hibakódot. Ne indíts újabb alvásokat a várakozó sor mellé és ne törölj adatot. Ha a sor kiürül, a már elindított alvás másik telefonon való megjelenését ellenőrizzük először. Nincs új Worker-kód vagy migráció, Codex nem deployolt.

## Előkészítés

1. Commit/push a tulajdonos GitHub Desktopjából. Javasolt Summary: `Document product direction and fix family sync races`.
2. Várd meg az internal Pages buildet és a zöld ellenőrzéseket. Mindkét telefonon az internal oldalt nyisd meg, ugyanazzal az új commit SHA-val; az alkalmazás frissítése után ellenőrizd a verziót. Production oldal nem része a próbának.
3. Mindkét telefon adatait exportáld mentésként. **Ne töröld a korábbi hibás előzményeket.** A mentések személyes adatot tartalmazhatnak; ne töltsd fel őket nyilvános issue-ba.
4. Két külön Google-fiók, ugyanaz a család; legalább az egyik aktív családtag Family/Family+ jogosultságú. Várd meg a „családi adatok megosztva” állapotot, és oldd fel a korábbi várakozó konfliktusokat tudatos választással. A régi eltérések pontos eredetét ez nem állapítja meg.

## Első rövid próba — normál használat

A telefonon indíts egy új alvást. B telefonon jelenjen meg ugyanaz az aktív alvás. A-n igazítsd vissza 5 perccel, majd zárd le. B-n frissüljön a kezdet és a vég. Mindkét előzményben **egy** új alvás legyen; a korrekció ne hozzon létre új sort vagy saját módosításból konfliktust. Újratöltés után is azonos időpontok maradjanak.

Ha ez hibás, álljunk meg; ne keverjük bele a következő próbát.

## Konfliktus — két külön kör

1. Válasszatok ki egy már lezárt, mindkét telefonon megjelent **azonos meglévő alvást**, ne hozzatok létre helyette új kézi alvásokat. Jegyezzétek fel az eredeti időpontját és az előzmény darabszámát.
2. Mindkét telefonon kapcsold ki a hálózatot (Wi-Fi és mobiladat). Szerkeszd ugyanennek a sornak a kezdetét: A-n például −5, B-n −10 perccel, és mentsd mindkettőt.
3. Előbb A legyen online, várd meg a feltöltést; utána B. B-n meg kell jelennie a konfliktusnak. Válaszd az ezen a telefonon lévő változatot. Mindkét telefon ugyanazt az egyetlen, B által választott sort mutassa; az alvások darabszáma ne nőjön.
4. Külön körben ismételd meg új, megkülönböztethető időpontokkal, és B-n most a családi változatot válaszd. Az A-n feltöltött időpont maradjon mindkét készüléken, továbbra is egy sorban.

## Nyitott szerkesztő — csak az előző körök után

B-n nyisd meg a közös lezárt alvás szerkesztőjét, írj be egy jegyzetet, de még ne mentsd. A-n módosítsd és mentsd ugyanezt az alvást. B-n hagyj időt a szinkronnak: az űrlap ne záródjon be, a beírt jegyzet maradjon. B mentése kérjen konfliktusválasztást, mert a megnyitott űrlap régebbi változatból indult. A feloldás ne hozzon létre második alvást.

## Ha újra eltérés van

Rögzítsük mindkét build SHA-ját, a lépéseket, az időpontokat, a megjelent konfliktust és a választott gombot. Export mindkét állapotról, még törlés/újabb szerkesztés előtt. A további diagnózis összeveti a session ID-ket és a pending műveleteket; hasonló időpont önmagában nem ok rekordok összevonására. Belépési vagy családi eszközkulcsot ne másolj üzenetbe.

## Mi kész, mi maradt

- Helyi reprodukciók és javítások: párhuzamos kérések, lassú válasz miatti felülírás, letöltés közbeni helyi mentés, régi családi válasz, nyitott űrlap revisionje, saját feltöltés utáni téves konfliktus, párhuzamos Start.
- 6 új kliens-egységteszt, 5 tényleges kliens–Worker integrációs teszt helyi SQLite-tal. Mindkét konfliktusválasztás után egy szerverrekord és egyező készülékadat ellenőrizve.
- Frontend/Worker typecheck, 138/138 teszt, production és auth-enabled internal helyi build sikeres. Böngészőben gyors korrekció/lezárás/reload és nyitott űrlap megőrzése ellenőrizve.
- Az eredeti három külön előzménysor pontos oka és a telefonos elfogadás nyitott. Külön lapok közötti közös zárolás nincs ebben a javításban.
- Termékirány dokumentálva: `PRODUCT_DIRECTION.md`. A teljes családnak járó Family+ Insights kódátállítása a szinkron elfogadása után következik.
- Ebben a munkamenetben nincs commit, push, deploy, távoli adatbázismódosítás vagy új migráció.
