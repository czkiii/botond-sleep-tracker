# Összevont kézi elfogadás — 2026-09-26

Feladatszint: GPT-6 Astra · erős. Staging: `a83b39a`.

**Legfrissebb megálló — 2026-10-01:** M6 funkcionális staging elfogadás kész; az összevont kör 6/6 lezárva kézi és meglévő gépi bizonyítékokkal. Chrome ae3dbac: a külön helyi Próbababa / 1 alvás napló áttekintése és elhalasztása után az Opo családi napló választása sikeres. Végül normál Edge 3acac04 és Chrome ae3dbac is Opo / Boti / 1799 alvás, bejelentkezve és friss szinkronnal. M1–M6 nem ismétlendő konkrét új ok nélkül. Következő önálló feladat A27/S02; ez nem a teljes kiadás lezárása.

## Aktuális megálló és elsőbbség

Ez a dokumentum a kézi tesztelés aktuális sorrendje. A régebbi checkpointok történeti bizonyítékok; a bennük maradt „következő” és „nyitott” mondatok nem indítanak újabb teljes tesztkört. A kiadási kapuk állapotát továbbra is a RELEASE_CHECKLIST.md tartalmazza. A terv nem sikeres teszteredmény.

A tulajdonos kérésére az ismétléseket összevonjuk. Már sikeres lépést csak konkrét érintett kódváltozás, új hiba vagy hiányzó bizonyíték miatt ismétlünk. Előtte megnevezzük az okot. A tesztkörnyezet előkészítését nem számoljuk új funkciótesztnek. Egy megfigyelést minden érintett auditponthoz felhasználunk, de nem állítjuk vele nem vizsgált feltételek teljesülését.

**Jelenlegi állapot:** a 2026-09-26-i `codex-clipboard-7ebe119d-0cca-44e1-aad5-0a665d225d86.png` képen Edge: Opo, Boti / 1799, adminművelet és friss szinkron. Chrome: Boti / 1799 helyben, helyi import, nincs család összekapcsolva. Mindkettő `a83b39a`. Ez a korábban már igazolt tagi kilépés/helyi megőrzés ismételt eredménye; nem új lezárt auditpont. A képből az új exportfájl letöltése és a bejelentkezés fennmaradása önmagában nem állapítható meg.

## Meglévő eredmények — nem kérjük újra végig

| Bizonyíték | Felhasználás | Forrás |
| --- | --- | --- |
| Import, visszaállítás, helyi és külön családi törlés; offline és online-pending importtiltás; feltöltés utáni 1799-re visszatérés | A03 lezárt; kapcsolódó adatvédelem bizonyítéka | FAMILY_DISSOLUTION_CHECKPOINT_2026-09-23.md, szeptember 23–25. |
| Tagi kilépés, helyi napló megmaradása, visszacsatlakozás | A04 már elfogadott rész | Ugyanott; mai kép ismételten megerősíti |
| Kifejezett Edge → Chrome → Edge adminátadás, emailes utódazonosítás | A04 már elfogadott rész | Ugyanott, `dcbc7ca` |
| Utolsó tag és Free utolsó admin külön családjának tényleges megszűnése; régi meghívó elutasítása | A04 már elfogadott rész; a téves siker utáni hibajelzés javítása külön retest | Ugyanott |
| Worker pontos `a83b39a` SHA és helyi staging auth-boundary smoke; két böngésző Pages-verziója | A06/A24 részbizonyíték; nem teljes hitelesített jogosultsági mátrix vagy GitHub-futásigazolás | FAMILY_JOIN_CHECKPOINT_2026-09-26.md és mai képek |
| 371 helyi automatikus teszt, A15 elkülönített felületpróba; két útvonalas PWA A/B próba | Versenyek, mentési hibák és ismétlések gépi bizonyítékai | A15 és PWA checkpoint |

## Egy előkészítés, három összefüggő blokk

Az eredeti Edge/Opo és a feleség tagsága marad. Chrome-ban egyszer készítünk kis külön tesztcsaládot. Második eszköznek külön Edge InPrivate ablak használható a Chrome tesztfiókjával; ez nem a normál Edge munkaterülete. Ugyanazon fiók két eszköze nem bizonyít két külön account elkülönítését.

Előkészítés: meglevő, ellenőrzött 1799-es export megőrzése; ha a most kért export már elkészült, nem kérünk újat. A családon kívüli Chrome helyi naplóját egyszer ürítjük, majd kis, egyértelműen elnevezett próbaprofilt és külön `Solemi közös próba` családot készítünk. Az Opo-export nem kerül a próbacsaládba. A konkrét gombokat a felület aktuális állapota alapján, rövid részletekben adjuk meg.

### 1. Közös alvás és gyermekprofilok

- [x] **M1 / A13:** stagingen két böngészőn egyező aktív alvás, jegyzet, kézi típus és frissítés utáni folytatás; a megszakított feltöltés újrapróbálását 2026-09-28-án valódi helyi kliens–Worker–SQLite teszt egészíti ki. Szerveres mentés után elveszett válasz, azonos művelet újraküldése, pontosan egy aktív sor, változatlan mezők és második eszközös egyezés: PASS. Nem állítunk új kézi hálózati próbát.
- [x] **M2 / A15, A20 része:** ugyanebben a családban gyermeknév és születési dátum eltérő eszközös szerkesztése, majd ugyanazon mező két eltérő értéke; a helyi/családi választás és az érthető összehasonlítás ellenőrzése. Mindhárom rész sikeres `a83b39a` stagingen, 2026-09-26. Részletes képi bizonyíték lent. Ez az M2 forgatókönyvet zárja le, nem a teljes A15/A20 auditot.
- [x] **M3 / A14:** a bc7b298 kliensjavítás gépi bizonyítékait 2026-10-01-én ae3dbac stagingen két readi-eszközös elfogadás egészíti ki: kontrollált offline/online törlés, 409 elutasítás, régi profil és 1 alvás helyreállítása, érthető magyarázat, újratöltés utáni megőrzés és friss szinkron. A képek nem mutatják a nyers outboxot; annak atomi feloldását a korábbi regressziók igazolják. Részletek a dokumentum végén.

### 2. Fiókok és megőrzött változások ugyanebben a környezetben

- [x] **M4 / A05, A06/A18 működési részbizonyíték:** a stagingen külön vendégfelület, tényleges vendégátvételi kérdés, B-fiók helyes Boti/1799 naplója és a normál Chrome-ban kijelentkezésen át megőrzött, később feltöltött függő változás igazolt. A vendég Mégse utáni megőrzését és az A→B→A pending-elkülönítést a 7 sikeres accountWorkspace gépi próba egészíti ki. Az eredeti Vendég M4 marker kézi visszaútját a gépújraindítás megszakította; ezt nem állítjuk kézzel ellenőrzöttnek, és nem ismételtetjük végig. Ez az összevont funkcionális forgatókönyv lezárása, nem a teljes A05/A06/A18 audit.
- A működő login/sync a proxy megengedett útjának bizonyítéka, nem igazolja önmagában a tiltott Origin vagy a visszavont token elutasítását. Ezeket az agent célzott gépi ellenőrzéssel vizsgálja, megfelelő izolációval; nem kér a tulajdonostól nyers API-kérések kézi másolgatását.

### 3. A próbacsalád lezárása és az A15 visszaút

- [x] **M5 / A04 javítás retest:** 2026-10-01, ae3dbac: kis Solemi közös próba. megszüntetése; előnézet 1 gyermek / 1 alvás, a mentés letöltését a tulajdonos megerősítette. Utána mindkét próbaeszköz bejelentkezve maradt, a helyi profil és 1 alvás megmaradt, nincs család összekapcsolva. A végállapotban nincs téves megváltozott-adatok hiba. Ez a célzott funkcionális retest lezárása; a képernyőképek nem hálózati válasznaplók és nem pontos Worker-verzióigazolások.
- [x] **M6 / A15, A04 visszaút:** 2026-10-01: Chrome ae3dbac helyi Próbababa / 1 alvás és Opo családi Boti / 1799 külön áttekintése, elhalasztás utáni helyi megőrzés és újranyitott összehasonlítás képpel igazolt. Családi napló választása után mindkét böngésző Opo / Boti / 1799, bejelentkezve és friss szinkronnal. A kis napló mentését M5 előtt a tulajdonos megerősítette; a második export tényleges letöltését és az F5 eseményt önmagukban a képek nem bizonyítják. A backup/tartósság meglévő A15 gépi bizonyítékaival együtt lezárt funkcionális forgatókönyv. Aktuális szerepköröket a végső kép nem mutatja; teljes A15 kapu továbbra is nyitott.

## Mi marad külön, és mi nem jelent újabb teljes kézi kört?

- A04 automatikus adminutód és utolsó fizető kilépésének teljes bizonyítékát az agent először összeveti a meglévő determinisztikus tesztekkel. A jelenlegi család egyfiókos/többeszközös próbája ezt nem fedi. Ha külön kézi kapu szükséges, az csak külön kontrollált tagságokkal végezhető, nem az Opo véletlen utódválasztásával.
- A05 újratelepítés; A15 valódi telefon/hálózat és D1-terhelés; A24 telepített telefonos frissítés/történeti visszaállás külön környezeti bizonyíték. Ezeket egy későbbi telefonos blokkba rendezzük; desktop screenshot nem váltja ki őket.
- A16 még fejlesztési munka, a store/native/éles konfiguráció és a statisztikai audit nem zárható le ezzel a hat ellenőrzéssel.
- Ha egy blokk hibát talál: a javítás után az érintett lépés és közvetlen következménye ismétlendő, nem a teljes három blokk.
- Minden eredményhez build, környezet, várt/tényleges viselkedés és bizonyíték kell. **6/6 összevont ellenőrzés kész (M1–M6)**, kézi és célzott gépi bizonyítékok együtt. Az összevont körben nincs nyitott forgatókönyv. Ez nem a teljes kiadás százaléka; a fennmaradó kiadási kapukat a RELEASE_CHECKLIST.md tartalmazza.

## Előkészítés eredménye

2026-09-26, `codex-clipboard-3f02efa1-e9a1-4fd7-842a-e35d672bd362.png`: Chrome `a83b39a`, `Próbababa` / 0 alvás, nincs születési dátum; külön család a felületen `Solemi közös próba.` néven (záró ponttal), friss szinkron és adminművelet. Edge továbbra is `a83b39a`, Opo/Boti/1799 és friss szinkron. A tulajdonos a létrehozást megerősítette. Meghívókódot nem rögzítünk a repóban. A második próbaeszköz és az M1 eredménye még nincs igazolva. Második eszköznek Edge InPrivate, ugyanazzal a Chrome-os Solemi-fiókkal; a saját család fiókból helyreállítható, ehhez új tag meghívása nem szükséges.

### Második próbaeszköz: eszközkorlát és részleges M1

2026-09-26, `codex-clipboard-45177f93-a712-4801-8eac-10d3ebe8f8e1.png`: az InPrivate belépés két korábbi eszközt listáz (`Edge · Windows`, `Chrome · Windows`) és kifejezett megtartási döntést kér. A kezdeti leírás ezt kihagyta. A felhasználó szerint választás nélkül kijelentkezett állapotba kerül. A képen az új ablak belépése még nem teljes; más meglévő eszköz kijelentkeztetése ebből nem igazolt.

A forrás (`AccountCard.tsx`, `accountDeviceSelection.ts`, `authService.ts`) szerint a kiválasztott régi eszköz marad, a másik régi eszköz az új Google-megerősítés sikeres tranzakciójakor visszavonódik. A lista az adott Google-fiókhoz tartozik. Következő: `Chrome · Windows` megtartása, majd ugyanazzal a Chrome-os Google-fiókkal új megerősítés. A normál Opo Edge másik fiókjának kapcsolatát ez a művelet nem célozza. A harmadik-eszköz választó megjelenése A16 részbizonyíték; a csere eredménye és az elutasított régi eszköz hozzáférése még nincs igazolva, A16 ettől nem zárható le.

Chrome-ban már látható egy aktív, `20:54 – most` próbaalvás `M1 közös próba` jegyzettel. A kézi típus a listán nem olvasható, a második eszközös egyezés és reload még nyitott. Új próbaalvást nem hozunk létre: ezzel az egy meglévő sorral folytatjuk.

### M1: aktív alvás egyezése két böngészőkörnyezetben

2026-09-26, `codex-clipboard-ef3cbec5-c74c-4b35-bc7b-6fc847f919a7.png`: Edge InPrivate és Chrome egyaránt `a83b39a`; a részletekben szeptember 26. 20:54-es kezdés, bekapcsolt „Jelenleg is alszik”, kijelölt `Nappali` és pontosan `M1 közös próba` megjegyzés látszik. A két eszközös aktív note/type szinkron elfogadott részeredmény. Újratöltést előzőleg kértünk, de a kép annak megtörténtét önmagában nem bizonyítja, a tulajdonos külön nem erősítette meg; célzott megszakítás/újrapróbálás sem történt még ebben a kézi körben. Az M2 előtti közös frissítésnél ugyanennek a bejegyzésnek a megmaradását is ellenőrizzük, új sort nem hozunk létre.

A tulajdonos külön jelezte, hogy eszközválasztás után újra be kell jelentkeznie. Ez megfelel a jelenlegi megvalósítás új Google-megerősítésének, de körülményes UX. A20-hoz feljegyzett javítandó/értékelendő pont: az eszközválasztás és a befejezetlen belépés folyamatának érthetősége. A két jelenlegi eszköz működése látható, a régi visszavont eszköz elutasítása továbbra sem ellenőrzött. Ezzel nem zárjuk le A16-ot.

### M2: eltérő mezők megőrzése sikeres; M1 frissítés utáni kontroll

2026-09-26, `codex-clipboard-1b0b7a2a-90bb-42b9-bf0e-1b91b65d0757.png`: mindkét ablak `a83b39a`, ugyanazzal a tesztfiókkal bejelentkezve. Mindkét gyermekprofil-kártyán `Próbababa M2`, `2026-01-01`, 1 alvás látszik. A felhasználó a frissítés és a két előre megnyitott szerkesztő eltérő mezős mentésének lépéseire „szuper és az alvás szépen megy tovább” visszajelzést adott. Az eltérő mezők közös megmaradása képen, az aktív alvás folytatódása tulajdonosi visszajelzéssel igazolt. Az előző körben kért frissítés utáni alváskontrollt e visszajelzésként rögzítjük, nem kérjük újra. Az M1 célzott hálózati újrapróbálásának bizonyíték-összesítése még nyitott.

M2 azonos mezős ütközésének és mindkét feloldási irányának próbája még hátra van. Ugyanazt a profilt és alvást használjuk. Első irány: kizárólag InPrivate DevTools Offline → ott `Próbababa helyi` név helyi mentése → az online Chrome-ban `Próbababa családi` mentése és friss szinkron → InPrivate No throttling, konfliktus megnyitása a családi kártyán. A két változatról kép, majd `A családi változat maradjon`; mindkét oldalon a családi név, változatlan dátum és 1 alvás a várt eredmény. E lépések még csak terv, nem eredmény.

### M2: azonos névmező ütközése, családi feloldás sikeres

2026-09-26, `codex-clipboard-7cf2c61b-0f9d-48ad-b1e5-fb9c8662819e.png`: az InPrivate családi panel gyermekprofil-ütközést jelez. Külön látszik a helyi `Próbababa helyi` és a családi `Próbababa családi`, mindkettő `2026-01-01` dátummal; mindkét döntési gomb elérhető. A Network gyermekmódosítása 409-et mutat, miközben a hozzáférés/szinkron lekérések sikeresek. Ez ebben a helyzetben a várt ütközésjelzés.

A `codex-clipboard-6e3e4059-669d-4bb9-af60-44f6db500ee0.png` képen a kért családi választás után mindkét profil `Próbababa családi` / `2026-01-01` / 1 alvás; a felhasználó a várt működést megerősítette. A családi feloldási irány elfogadott. A15 és A20 összehasonlíthatósági részbizonyíték; a helyi választási irány még nyitott. A régi 409 sor a hálózati naplóban történeti, önmagában nem új hiba.

**Tulajdonosi UX-ötlet / A20:** a Családi megosztás/szinkron kártya közvetlenül a Gyerekek rész alá, az export/import/törlési műveletek elé kerülhetne. Indok: a kapcsolódás és a szinkronprobléma hamarabb észrevehető, közel a profilokhoz. Ötletként rögzítve; alkalmazáskód és a most tesztelt build nem változott. A jelenlegi kör után értékelendő a többi felületi észrevétellel együtt.

### M2 lezárva; felületi észrevételek és a folytatás sorrendje

2026-09-26, `codex-clipboard-8f27ebfa-962b-4c97-9779-0501c38f74b7.png`: a kért helyi feloldás után mindkét ablak `a83b39a`, `Próbababa helyi nyer` / `2026-01-01` / 1 alvás; a két családi kártya friss szinkront mutat. A tulajdonos kifejezetten sikeresnek jelölte az ellenőrzést. A helyi választás és a másik eszközre feltöltés elfogadva. M2 eltérő mezős szerkesztése és mindkét konfliktusfeloldási iránya lezárt, nem ismétlendő új ok nélkül.

**További tulajdonosi felületi kérés / A20:** a nyelvválasztó legyen legalul. A szinkronkártya Gyerekek alá helyezésével együtt rögzítve a későbbi felületi rendezéshez; a nyelvválasztó és a jelenleg vele egy kártyán lévő „Még alszik?” kapcsoló elhelyezése külön kezelendő. Alkalmazáskód nem változott.

**Sorrendpontosítás:** M4 megelőzi M3-at, hogy a meglévő profil és aktív alvás megmaradjon a fiókelkülönítési próbához. Utána következik a próbagyermekek törlési vizsgálata, majd a család megszüntetése és az A15 visszaút. Új család nem szükséges.

M4 első szakasza: az InPrivate Network már megfigyelt `child_…` kérésének pontos URL-jét blokkoljuk (helyi DevTools „Block request URL”), a hálózat egyébként No throttling marad. Itt egy új `Próbababa függő` névváltozás várakozik, az online Chrome neve változatlan. A várakozó állapot ellenőrzése után InPrivate kijelentkezés a `Maradjon ezen a telefonon` döntéssel. A vendégfelületnek nem szabad a tesztfiók naplóját mutatnia; a fiókhoz tartozó várakozó változásnak meg kell maradnia későbbi visszalépésre. A blokkolás maradjon meg addig. Ez még terv, nem igazolt eredmény. Teljes Offline mód nem jó ehhez, mert a kijelentkezés szerverhívást igényel.

### M4: függő módosítás után kijelentkezés és külön vendégnapló igazolt

2026-09-26: `codex-clipboard-8d878205-c575-42ec-a051-98ec207ab0c8.png` mutatja az InPrivate `Próbababa függő` / `2026-01-01` / 1 alvás állapotát és 1 várakozó módosítást, bekapcsolt Request conditions blokkolással, miközben Chrome `Próbababa helyi nyer` / 1 alvás és friss szinkron marad. A minta teljes URL-je nem olvasható, de a célzott függő állapot igazolt.

A `codex-clipboard-28bbcaaf-810a-4d1d-8f90-b35a405acb20.png` a helyi napló megtartása/törlése döntést mutatja a tesztfiókhoz. A `codex-clipboard-a121342e-bdfb-45cf-81b8-08faa2f99804.png` már kijelentkezett Google-belépőgombot és névtelen / 0 alvásos, helyi vendégnaplót mutat, Chrome változatlan. A tulajdonos attól tartott, hogy hibázott a kijelentkezéssel; ez pontosan a kért lépés és várt külön vendégállapot. A fiók függő sorának tartós megmaradását a visszabelépés előtt még nem állítjuk bizonyítottnak.

**Folytatás egyetlen fiókváltási körben:** InPrivate vendégprofilt `Vendég M4` névre nevezni (0 alvás); ugyanitt a normál Edge-ben használt másik saját fiókkal (`czki.adam@gmail.com`) belépni. A vendégnapló hozzárendelési kérdésénél `Mégse`, így külön marad; a belépés ettől folytatódik. Várt B-fiók: Opo / Boti / 1799, a vendég és a readi-fiók függő adatai nélkül. Ha ennél a másik fióknál eszközválasztó jelenik meg, előbb a képet azonosítjuk; névazonosság esetén nem választunk találomra régi eszközt. Ezután B kijelentkezés helyi megtartással, vendégjelölés kontrollja, végül vissza readi-fiókhoz a még blokkolt függő sor ellenőrzésére és feloldására. A sorrend A→guest→B→guest→A, nem külön megismételt A→guest→A kör. A normál Chrome változatlan kontroll marad, az InPrivate ablakot nem zárjuk be.

### M4: vendégjelölés megvan, B-belépés eszközválasztásnál

2026-09-26, új képek: `codex-clipboard-35879b91-edfe-4ab8-bee1-e66269363cbb.png` helyi naplótörlési előnézetet mutat (1 profil cseréje, 0 alvás), nem a belépéskori vendégátvételi kérdést. A tulajdonos szerint Mégsét választott; a következő képeken `Vendég M4` / 0 alvás megmaradt, ezért a vendégnapló átvételének elutasítását még nem jelöljük teljesítettnek.

A `codex-clipboard-457effa8-4ee5-41fe-b492-565a42c5a58a.png` köztes Google-belépési hibát jelez: lejárt vagy érvénytelen kérés. Pontos hibakód/ok nem látszik. A `codex-clipboard-b28cc4e0-9506-4402-becb-36da56f10107.png` már az eszközkorlát választóját mutatja: `Edge · Windows` (szept. 23. 20:07) és `Chrome · iPhone` (szept. 22. 22:08). A B-fiók végleges belépése még nincs igazolva, email nem látható a választón. A normál Chrome továbbra is az egyalvásos próbacsalád változatlan kontrollja; a blokkolás bekapcsolva maradt.

Következő lépés a korábban kért `czki.adam@gmail.com` fiókkal: `Edge · Windows` megtartása, majd új Google-megerősítés. A kijelzett `Chrome · iPhone` korábbi eszközbelépése ennek sikerénél visszavonódik; ezt előre egyértelműen közöljük. A normál Edge-belépést így megtartjuk. A később megjelenő, kifejezetten vendégnapló hozzárendeléséről kérdező ablakban Mégse, majd email/Opo/Boti/1799 kontroll. Nincs szükség új helyi törlésre. Az M4 és a régi eszköz hozzáférésének elutasítása továbbra is részleges bizonyíték.

### Megszakítás előtti utolsó eredmény és folytatási összefoglaló

Rögzítve: 2026-09-28, a keretelfogyás miatt félbeszakadt összefoglaló befejezéseként. HEAD továbbra is `a83b39a`; kizárólag dokumentáció változott, új kód/build/tesztfuttatás/commit/push nem történt.

- `codex-clipboard-d636dc3b-61de-4b10-ad7b-15aeeb7da0dc.png`: most valóban a vendégnapló hozzárendelési kérdése látszik, a háttérben Vendég M4 / 0 alvás. A korábbi helyi törlési ablak ettől külön művelet volt.
- `codex-clipboard-ff750dec-d83b-47b7-9c51-86ceb7921b80.png`: InPrivate bejelentkezve `czki.adam@gmail.com`, Boti / 2025-08-23 / 1799 alvás; normál Chrome bejelentkezve `readi.studio@gmail.com`, Próbababa helyi nyer / 2026-01-01 / 1 alvás. Mindkettő `a83b39a`, az InPrivate Request conditions blokkolása továbbra is bekapcsolva. Az Opo-kártya neve ezen a képen nincs a látható részben, a B-fiók és annak helyes naplója viszont igen.
- B sikeres belépése és a helyes fióknapló megjelenése igazolt; a tényleges Mégse-kattintás nincs külön megnevezve a legutóbbi üzenetben. Vendég M4 elkülönített megőrzését a következő kijelentkezéskor ellenőrizzük. A readi-fiók félretett `Próbababa függő` változásának megmaradása szintén még nyitott.

**Elfogadott és újra nem indítandó:** M2 mindhárom része (eltérő mezők; családi és helyi konfliktusfeloldás). M1 aktív állapot/jegyzet/Nappali típus két eszközös egyezése és frissítés utáni folytatása. M4 első szakaszának 1 függő módosítása, kijelentkezés, külön vendégfelület, majd B-fiók helyes naplója. M1 újrapróbálási bizonyítékainak összesítése és M4 visszaút még nyitott; a hat forgatókönyvből csak M2 teljesen lezárt. A korábbi A03 és adminátadási próbák továbbra is elfogadottak.

**Pontos visszaút, ha ugyanaz az InPrivate munkamenet megvan:**

1. Ellenőrizni a jelenlegi fiókot és a kérésblokkolást; egyelőre ne oldjuk fel a blokkolást.
2. InPrivate B-fiók kijelentkezése `Maradjon ezen a telefonon` választással → Vendég M4 / 0 alvás kontroll. Más eredménynél rögzíteni és kivizsgálni, nem automatikusan új vendégprofilt létrehozni.
3. Ugyanitt visszabelépés a readi-fiókba. Ha eszközválasztás szükséges, a működő normál Chrome Windows kapcsolatát kell megtartani; eltérő/azonos nevű listánál előbb azonosítani. A mentett readi-munkaterület miatt a kód szerint új vendégátvételi döntés általában nem szükséges.
4. Még blokkolt gyermek-URL mellett várt: Próbababa függő / 2026-01-01 / 1 alvás, 1 várakozó módosítás. Normál Chrome egyelőre Próbababa helyi nyer. Ezzel bizonyítható a félretett sor fiókváltáson át megmaradása.
5. Ezután blokkolás kikapcsolása → mindkét próbaeszközön Próbababa függő és friss szinkron, változatlan 1 alvás. Az alvás a szünet alatt hosszúra nyúlhatott; ez próbaadat, a tényleges állapotát ellenőrizni kell.

**Ha az összes InPrivate ablak közben bezárult vagy a böngésző/gép újraindult:** a privát helyi tár és a benne parkolt függő/vendégmunkaterületek elveszhettek. Ez önmagában nem alkalmazáshiba, és a Gitbe mentett tesztnapló nem menti a böngésző adatait. Az eredeti pending tartóssági próba ilyenkor nem zárható le; csak az M4 szükséges helyi előkészítését ismételjük, a már elfogadott M2-t és más teszteket nem. A felhőben levő külön próbacsalád és a normál Chrome állapotát először felmérjük.

**Utána:** M3 utolsóprofil-védelem (előbb a kliens elutasított törlésének kezelése és a gépi bizonyíték áttekintendő), M5 sikeres családmegszüntetés hibajelzésének retestje, M6 meglévő helyi naplós Opo-visszacsatlakozás. Nem kell új teljes import/törlés/restore kört kezdeni. Felületi teendők megőrizve: szinkronkártya a Gyerekek alá; nyelvválasztó legalulra; eszközválasztás utáni új Google-belépés érthetősége. Ezek még nem kódmódosítások.

**Következő feladat:** M4/A05 — a meglévő InPrivate állapot ellenőrzése, majd vendég→readi visszatérés és a függő módosítás feltöltésének igazolása. **Feladatszint: GPT-6 Astra · erős.**

### M4 hiányzó visszatérésének pótlása normál Chrome-ban

2026-09-28, codex-clipboard-f72cc303-b76e-41c0-8cfe-99ac4f02b915.png: a mai normál Chrome állapota a fenti aktuális megálló szerint igazolt, a readi-fiókot a tulajdonos szövegesen megerősítette. Az Edge saját fiókja és Boti/1799 látható. A 71f5846 commit csak öt dokumentumot érint; új regressziós tesztkör nem indokolt pusztán a buildazonosító változása miatt. A Worker mai pontos SHA-ját ebben a lépésben nem ellenőriztük újra.

Következő tervezett rövid kör, kizárólag normál Chrome: Network megnyitása; online névváltoztatás Próbababa M4 alap névre a gyermek PATCH kérésének megjelenítéséhez. A friss child_… kérés pontos URL-jének blokkolása jobb kattintással, egyéb hálózat No throttling. Ezután Próbababa függő név mentése, 1 pending kontroll. Kijelentkezés Maradjon ezen a telefonon választással, majd visszalépés ugyanabba a readi-fiókba, blokkolás folyamatosan bekapcsolva. Várt a függő név, ugyanaz az 1 alvás és 1 várakozó módosítás visszatérése; erről bizonyíték kell még a blokkolás feloldása előtt. Utána blokkolás kikapcsolása, friss szinkron és várakozó sor megszűnése. A B-fiókos kitérőt nem ismételjük, mert annak helyes naplóját már igazoltuk. Az eredmények még nincsenek meg; nem jelöljük lezártnak M4-et.

### M4: normál Chrome-ban a pending sor kijelentkezés után visszatért

2026-09-28, codex-clipboard-10684dd6-4ff5-4920-8320-79196afc8f5a.png, 71f5846: a tulajdonos a teljes kért lépéssort elvégezte. Próbababa függő / 2026-01-01 / 1 alvás, családi kártyán 1 módosítás várakozik. A Network logout, challenge, google, access/plan/claim és ismét blokkolt child-kérést mutat. A readi-fiók új belépését a lépéssor elvégzéséről szóló visszajelzés támasztja alá; az email ezen a képen nincs a látható részben. A kijelentkezésen át megőrzött és visszatért függő változás elfogadott részeredmény.

A Request conditions alatt két bekapcsolt szabály van: korábbi session-minta (0 affected) és gyermek-URL (3 affected). A Response panel egy korábbi Próbababa M4 alap / revision 7 választ mutat; ez önmagában nem a függő név feltöltésének bizonyítéka. Következő a teljes Enable blocking and throttling pipa kivétele, várakozás friss szinkronig, majd oldalfrissítés. Várt név továbbra is Próbababa függő, dátum 2026-01-01, 1 alvás, nincs várakozó módosítás. Erről még kép szükséges. A régi blokkolt/piros hálózati sorok megmaradhatnak előzményként.

### 2026-09-28 — M4 feltöltés és frissítés utáni megőrzés: PASS

`codex-clipboard-0361ee91-29dc-4ae2-892d-ac7ba17f0bdf.png`, normál Chrome `71f5846`: Request conditions főkapcsoló kikapcsolva, Próbababa függő / 2026-01-01 / 1 alvás, Solemi közös próba. / Utolsó szinkron: most, nincs várakozó módosítás. A tulajdonos a kért feloldás→friss szinkron→F5 sorra „így történt” visszajelzést adott. A Network későbbi sync-kérései after=8-ig jutnak. A kijelölt Response továbbra is régi Próbababa M4 alap / revision 7 adat; ezt nem tekintjük a legutóbbi válasznak. A megőrzött függő név feltöltése és frissítés utáni megmaradása elfogadva.

### Gépi bizonyítékok összevonása — 41/41 PASS

Célzott futtatás: `npx vitest run src/accountWorkspace.test.ts worker/tests/familySyncClient.test.ts`, 2026-09-28. 7 fiókmunkaterület-próba és 34 kliens–Worker–SQLite próba sikeres. Az új, repóban maradó A13 teszt: `retries an active sleep after a lost acknowledgement without duplicating or losing its initial fields`. A valódi Worker elmenti az aktív sort, a teszt ezután eldobja a választ. A kliens megőrzi a helyi sort és a pontos függő műveletet, majd ugyanazzal a payload/műveletazonosítóval újraküldi; egy aktív sor marad, jegyzet és kézi típus egyezik, a második szimulált eszköz is ugyanazt kapja. A szerver létrehozási/frissítési időpontjai szerver által kiosztott adatok, nem a helyi draft időpontjai.

M1 és M4 lezárása vegyes bizonyítékú: a valós staging képek mellé a kimaradt determinisztikus szélső eseteket géppel ellenőriztük. Ez nem állít valódi telefonos, újratelepítési, teljes hitelesítési vagy adatbázisterhelési elfogadást. Az alkalmazás futó kódja nem változott; teszt és dokumentáció módosult. Commit/push továbbra is a tulajdonos feladata.

### M3 / A14 előellenőrzés: reprodukált klienshiba, még nincs javítva

A korábbi teszt az atomi szervervédelmet vizsgálta, az optimista kliensállapot helyreállítását nem. Egy ideiglenes, a valódi kliens és Worker fölött futó SQLite próba az alábbi lépéssorral a várt helyreállítás helyett `LAST_CHILD` hibával bukott:

1. Szerveren child-a + shared-sleep, majd child-b létrehozása; kliens lehúzza mindkét profilt.
2. Offline kliens `removeChildProfile(data, 'child-a')` + `saveLocalData`: helyben csak child-b és 0 alvás marad, child-a DELETE függőben.
3. Másik eszköz szerveres child-b DELETE-je sikeres.
4. Első kliens online `pullRemote()`: child-a DELETE 409 LAST_CHILD, a pending sor bennmarad; a letöltés a kivétel miatt nem fut le. A helyi profil és alvás nem áll helyre, későbbi szinkron is elakad.

Forrás: `src/familySync.ts` → `flushPendingNow` általános hibakezelése és `pullRemoteNow` feltöltés-előtti letöltésgátja; `src/childProfiles.ts` → optimista profil/alvás eltávolítás. A szerveres védelem és a megmaradó alvás adatai biztonságban vannak, de a klienshelyreállítás kiadást blokkoló hiány. Az ideiglenes bukó próba nem maradt a rendes tesztcsomagban; a végső 41/41 PASS ezt az ismert hibát NEM minősíti javítottnak.

**Következő feladat: A14 — LAST_CHILD után a megmaradó profil és régi alvásai biztonságos helyreállítása, az elutasított törlés sorból kivezetése, érthető felületi jelzés és tartós regresszió. Feladatszint: GPT-6 Astra · erős.** A javításnak a sikertelen letöltést/mentést, közben keletkező helyi módosítást, fiókváltást és újratöltést is kezelnie kell. A részleges (aktuális cursor utáni) sync önmagában nem hozza vissza az optimistán törölt régi alvásokat; nem szabad vakon üríteni az outboxot vagy más függő adatot felülírni. A profillal együtt kezelt helyi fotó sorsát is át kell tekinteni. Ehhez most nem kell tulajdonosi kézi törlés. M5 és M6 utána folytatható a meglevő kis próbacsaláddal.

### 2026-09-28 — A14 klienshelyreállítás javítva helyben

A fenti reprodukció után a javítás elkészült, még nincs commit/push/deploy. A korábbi „még nincs javítva” bekezdés történeti megálló, az aktuális állapotot ez a rész és a dokumentum eleje írja le.

- A LAST_CHILD választ kapó DELETE tartósan helyreállítandó műveletté válik. Nem küldjük el újra törlésként, akkor sem, ha közben új gyermek jön létre és a törlés már átmenne.
- Teljes szerveres snapshotból csak az érintett profilt és alvásait állítjuk helyre. A régi alvások is visszajönnek; a teljes letöltési cursor nem ugrik előre, más változások a szokásos pull során érkeznek.
- A helyreállított napló és az elutasított sor kivezetése egy atomi helyi írás. Hálózati vagy mentési hiba esetén a helyreállítási sor megmarad. Letöltés közbeni munkaterületváltás vagy helyi változás elhalasztja az alkalmazást; más függő műveletek megmaradnak.
- A törlendő profil fotóhivatkozása helyben az outboxhoz kerül, nem az API-payloadba. A fotó tényleges eltávolítását a szerveres törlés elfogadásáig halasztjuk; visszautasításkor a hivatkozás helyreáll. A régi kliens által korábban már törölt fotófájlt ez nem tudja utólag visszahozni.
- HU/EN/DE tájékoztatás és Értem gomb került a családi panelbe. A jelzés újratöltés után is megmarad, de nem blokkolja a szinkront; a kártyán is látszik, hogy a törlést nem hajtottuk végre.

Ellenőrzések: `npx vitest run` → 31 fájl, **379/379 PASS**. A hét új A14 eset: profil/régi alvás/fotó helyreállítás és jelzés; hálózati hiba; mentési hiba; munkaterületváltás a kérés közben; helyi szerkesztés a kérés közben; más függő írás megőrzése; fotó eltávolítása csak sikeres törlés után. Frontend és Worker typecheck PASS; `npm run build` PASS (ismert nagy-bundle figyelmeztetés).

`node scripts/check-child-deletion.mjs` → **PASS**, elkülönített headless Edge 154.0.4258.37, 393×852. Valódi React felületen törlésgomb/megerősítés → helyi szimulált API 409 → megmaradó profil és régi aktív alvás → tájékoztatás → újratöltés → Értem; pontosan egy DELETE, nincs váratlan külső kérés vagy futási hiba. Kép: `.private-backups/a14-child-deletion.png`, vizuálisan ellenőrizve. Ez nem staging OAuth vagy valódi D1-terhelési bizonyíték. A parancs külső Playwrightot használ (`SOLEMI_PLAYWRIGHT_MODULE`, opcionális `SOLEMI_BROWSER_CHANNEL=msedge`), új projektfüggőség nincs.

**Következő feladat: A14/M3 — tulajdonosi commit/push és az új staging build után célzott kétböngészős elfogadás. Feladatszint: GPT-6 Astra · erős.** Javasolt commitcím: `Recover rejected last-child deletions without losing local data`.

A következő kézi kör terve (csak az új build után, kis Solemi közös próba. család): Chrome readi és külön Edge InPrivate readi, normál Edge/Opo/Boti/1799 érintetlen. Új InPrivate belépéskor esetleges eszközválasztásnál a normál Chrome Windows kapcsolat maradjon, majd a szükséges új Google-megerősítés. Más listánál előbb azonosítjuk a fiókot/eszközöket. A meglévő, 1 alvásos gyermek mellé egy üres próbagyermek. InPrivate Offline módban a meglévő, alvásos gyermek törlése; online Chrome-ban az üres második gyermek törlése. Ezután InPrivate No throttling: a szerver LAST_CHILD-dal védi az alvásos profilt; a kliens visszahozza azt és az 1 alvást. Kontroll mindkét oldalon, jelzés/Értem és F5. Külön alvást nem indítunk és a családi naplóürítés gombját nem használjuk. M5-höz/M6-hoz az egyalvásos napló megmarad. Ezt rövid lépésekben adjuk ki a tényleges új build és bejelentkezett fiókok alapján; még nem elvégzett próba.


### 2026-10-01 — M3 kiindulás igazolva

Bizonyíték: `codex-clipboard-a6c36c25-813a-4c47-af92-9441269e9979.png`. Edge InPrivate és normál Chrome: mindkettő `ae3dbac`, readi-fiók, Solemi közös próba. / Próbababa függő / 2026-01-01 / 1 alvás, Utolsó szinkron: most. A normál Edge/Opo nincs a képen; annak módosítását nem kértük. A DevTools aktuális hálózati beállításai nem látszanak.

Kiadott következő részlépések: Chrome-ban M3 üres nevű második profil (0 alvás), megvárni a megjelenését mindkét oldalon; csak Edge InPrivate Network Offline, ott a Próbababa függő profil törlése a profilszerkesztőből. Az Edge egyelőre offline marad, a Chrome-on még nem kérünk törlést. Várt köztes állapot: Edge-en csak M3 üres / 0 alvás és várakozó módosítás; Chrome-on még mindkét profil, a régi 1 alvás megmarad. Ez terv, nem elvégzett eredmény.

### 2026-10-01 — M3 offline köztes állapot igazolva

Bizonyíték: `codex-clipboard-089368f7-a18d-4867-b874-93e0e9b15fb2.png`, mindkét ablak `ae3dbac`. Edge InPrivate readi: Network Offline, csak M3 üres / 0 alvás, családi kártya Offline és helyi mentést/későbbi küldést jelző szöveg. Normál Chrome readi: Próbababa függő / 2026-01-01 / 1 alvás és M3 üres / 0 alvás, friss szinkron. A Próbababa offline helyi törlése és a másik eszköz változatlan állapota igazolt. A képen nincs számszerű pending-jelzés; konkrét outbox-darabszámot nem állítunk.

Következő kiadott lépések: Edge továbbra is Offline; online Chrome-ban kizárólag M3 üres profil törlése, majd várakozás arra, hogy csak Próbababa függő / 1 alvás és friss szinkron látszódjon. Csak ezután Edge No throttling, automatikus helyreállítás megvárása és a családi tájékoztatás megnyitása. Várt: mindkét oldalon a régi profil és 1 alvás; Edge-en az elutasított utolsóprofil-törlés érthető jelzése. Eredmény még nincs, M3 nincs lezárva.


### 2026-10-01 — M3 elutasított törlés utáni helyreállítás igazolva

`codex-clipboard-2cba93a6-2519-4db1-ab92-c00d04fb4024.png`: Edge továbbra is Offline / M3 üres / 0 alvás; online Chrome-ban már csak Próbababa függő / 2026-01-01 / 1 alvás, friss szinkron. Az üres második profil online törlése igazolt.

`codex-clipboard-872b0a1b-5070-401e-968b-75ea2b65d771.png`: Edge No throttling, mindkét oldalon Próbababa függő / 2026-01-01 / 1 alvás; M3 üres eltűnt. Edge családi kártya: A gyermektörlést nem hajtottuk végre., állapot A családi adatok megosztva. Network gyermek DELETE 409, utána sync?after=0, sync?after=9 és sync?after=10 sikeres 200. A 409 válasz törzsét nem láttuk, konkrét hibakódot a képből nem állítunk. Az elutasítás és a régi profil/alvás helyreállítása, a szinkron folytatódása igazolt.

Következő: Edge online F5, Beállítások profil/alvás kontroll, családi panel megnyitása és a tartós tájékoztatás megtekintése; Értem nyugtázás és friss szinkron kontroll. M3 csak ennek eredménye után jelölhető lezártnak.

### 2026-10-01 — M3/A14 lezárás, magyarázat és újratöltés

`codex-clipboard-d5d0fd58-f90c-4419-aaf8-23277fdc84c5.png`: Edge családi panelen a teljes magyarázat látható: az utolsó gyermek profilját és alvásait megvédtük, a családi változatot újra lekértük; Értem gomb. Chrome-on változatlan Próbababa függő / 1 alvás.

`codex-clipboard-9a73acc3-f5ca-4c6f-a514-e4575416c605.png`: mindkét böngésző ae3dbac, readi-fiók, Solemi közös próba., Próbababa függő / 2026-01-01 / 1 alvás, Utolsó szinkron: most. Edge-en eltűnt az elutasítási jelzés; Network No throttling, friss dokumentum- és erőforrásbetöltés, sikeres me/access/plan/claim és sync?after=10. Az újratöltés utáni helyreállt állapot igazolt; az Értem kattintás és újratöltés pontos egymáshoz viszonyított sorrendjét nem állítjuk. A tájékoztatás tartósságát a korábbi gépi regresszió is vizsgálja.

M3/A14 elfogadva a kézi és meglévő gépi bizonyítékok együttese alapján. Ez nem a szerver pontos SHA-jának vagy a valódi mobilos működésnek igazolása. Következő: M5, csak a kis próbacsalád megszüntetése Chrome-ban, a helyi napló megtartásával az M6 visszacsatlakozáshoz. Feladatszint: GPT-6 Astra · erős.
### 2026-10-01 — M5 előnézet és sikeres megszüntetés

`codex-clipboard-0f01d868-dd0b-4efd-94c7-9c3983eace0c.png`: Chrome megszüntetési előnézet, pontos családnév Solemi közös próba., 1 gyermekprofil / 1 alvásbejegyzés, beírt megerősítő név. A tulajdonos megerősítette a mentés letöltését; a fájl tartalmát nem vizsgáltuk.

`codex-clipboard-651ba055-c0ab-4597-949d-c2728e3e2e2c.png`: véglegesítés után mindkét böngésző ae3dbac, readi-fiók bejelentkezve, Próbababa függő / 2026-01-01 / 1 alvás. Mindkét családi kártyán Nincs család összekapcsolva és a megszűnt kapcsolat/helyi megőrzés tájékoztatása. Helyi importfelirat látszik. A végállapotban nem jelenik meg a korábbi téves adatok-megváltoztak hiba; köztes HTTP-válaszokat a kép nem igazol. M5 célzott funkcionális elfogadás kész, az A04 fennmaradó bizonyítékai külön nyitottak.

Következő M6, GPT-6 Astra · erős: az InPrivate próbaablak bezárható; normál Edge eredeti Opo admin és normál Chrome readi helyi próbanapló. Opo friss meghívója után Chrome Csatlakozás kóddal, a helyi és családi napló összehasonlítása, majd elhalasztás/újranyitás és családi napló elfogadása. Az utóbbi lépések még terv, nem elvégzett eredmény. A próbanaplót nem töröljük és nem importáljuk az Opóba.
### 2026-10-01 — M6 áttekintés, elhalasztás és visszacsatlakozás lezárva

`codex-clipboard-c51459c0-5c75-464e-94ff-6a863a564adc.png`: normál Edge 3acac04, eredeti fiók, Opo / Boti / 1799 és friss szinkron. Chrome csatlakozási áttekintés: helyi Próbababa függő / 2026-01-01 / 1 alvás, családi Opo / Boti / 2025-08-23 / 1799 alvás. A két napló külön szerepel, nincs automatikus összekeverés.

`codex-clipboard-e7919909-b861-4b23-bd0f-ab1395531f39.png`: Chrome ae3dbac readi-fiókkal, továbbra is Próbababa függő / 1 alvás; családi kapcsolat előkészítve, szinkron a naplóválasztás után indul. `codex-clipboard-2488b8c5-dc63-4165-96ee-cda2d6fb4bc7.png`: újranyitott összehasonlításban ugyanaz a külön helyi és családi napló. A kért lépések közt F5 volt, de a képek önmagukban a frissítés eseményét nem igazolják; a megőrzött és újranyitható állapotot igen.

`codex-clipboard-9ba728f6-49ec-4dc1-b730-d0fcd46c502f.png`: családi napló elfogadása és kért F5 utáni visszaküldött végállapot. Normál Edge 3acac04 az eredeti fiókkal és normál Chrome ae3dbac a readi-fiókkal: mindkettő Opo / Boti / 2025-08-23 / 1799 alvás és Utolsó szinkron: most. A felületen a próbagyermek nincs a családi gyermeklistában, a bejegyzésszám változatlan. Ez nem teljes rekordtartalom-összehasonlítás. A szerepkörök nem látszanak ezen a képen; új adminátadást nem kértünk.

M6 funkcionális elfogadás kész a képi és meglévő A15 gépi bizonyítékok együttese alapján. A második, M6 közbeni export letöltése nem külön igazolt; az azonos kis napló M5 előtti mentését a tulajdonos megerősítette. Nem ismételtetjük a teljes folyamatot. M1–M6: 6/6 kész. Nincs új kódfuttatás vagy tesztfuttatás ebben a dokumentálási körben. Következő feladat: A27/S02 — megszakított éjszaka és valódi reggeli ébredés elkülönítése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.