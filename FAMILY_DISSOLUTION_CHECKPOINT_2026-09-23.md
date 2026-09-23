# Család megszüntetése — helyi megvalósítás és staging próba

Dátum: 2026-09-23. Kiinduló commit: `c2bccdc`, ág: `feat/child-profile-v4`.
Állapot: helyi implementáció és automatizált ellenőrzés; commit/push és staging elfogadás még szükséges. Távoli adatváltoztatás vagy deploy nem történt.

## Megvalósított viselkedés

- A „Kilépés a családból” az utolsó aktív tagnál külön „Család megszüntetése” előnézetet nyit. Több tag mellett megmarad a normál kilépés és adminátadás, előtte helyi exportlehetőséggel.
- Az utolsó aktív admin friss, szerverről olvasott családi naplót exportálhat; ez leválasztott eszközről és Free jogosultsággal is elérhető. A helyi naplót az előnézet nem írja felül.
- A végrehajtás a család pontos nevének megadását igényli. Offline, pending vagy rendezetlen szinkronállapotban nem indul el.
- Az előnézet családazonosítója, neve és revíziója a végrehajtás része. A szerver az atomi batchen belül minden törlés előtt ellenőrzi az utolsó aktív admin szerepet, a család nevét és revízióját. Közben érkező tagság/adatmódosítás minden törlést megállít; egy SQL-hiba a teljes batch visszagörgetését okozza.
- A működő adatbázisból törlődik a család, a gyermek- és alvásadat (korábbi tombstone is), a meghívó, családi műveletnapló, családi eszköz és a kapcsolódó tagság/eszköz-hozzárendelés. Más család, a saját account, account-session és az előfizetési jogosultság megmarad.
- A művelet nem mondja le a store-előfizetést. A megerősítő szöveg ezt és a helyi naplók megmaradását kifejezetten közli HU/EN/DE nyelven.
- Elveszett válasz után ugyanaz a megszüntetés újrapróbálható. Egy később létrehozott másik családhoz a régi kérés nem nyúlhat.
- Másik eszközön a bizonyítottan érvénytelen/visszavont családi token lezárja a régi kapcsolatot. A helyi napló és az abba mentett helyi szerkesztések megmaradnak, erről tartós állapotjelzés látható. A régi család műveleteit az app nem küldi másik családba. Általános hálózati/szerverhiba nem indít ilyen lezárást.

## Új API-útvonalak

- `GET /v1/auth/family/dissolution-preview`: aktív, utolsó admin; fizetős jog nem feltétel. A szerver revízióellenőrzéssel védi a teljes aktív napló pillanatképét.
- `POST /v1/auth/family/dissolve`: hiteles account, engedélyezett Origin, utolsó aktív admin. Bemenet: `familyId`, `expectedFamilyName`, `expectedRevision`.
- Az account Pages proxy továbbítását mindkét új útvonalra célzott teszt ellenőrzi.
- Új adatbázisséma/migráció ehhez a szelethez nem szükséges.

## Elvégzett helyi ellenőrzések

- Frontend és Worker TypeScript-ellenőrzés: sikeres.
- Teljes Vitest-futtatás: 28 fájl, 291 sikeres teszt. Ebből 27 fájl / 290 teszt verziókezelt; egy további, Gitből kizárt helyi mentésellenőrzés is sikeres.
- Célzott lefedettség: Free utolsó admin, nem admin és idegen account elutasítása, másik család/adat/fiók/jogosultság megőrzése, két eszköz visszavonása, régi meghívó érvénytelensége, név/revízió eltérés, előnézet közbeni írás, végrehajtás közbeni csatlakozás/írás, SQL-hiba teljes rollbackje, elveszett válasz újrapróbálása és későbbi új család védelme.
- Kliens: szerveradatból importálható export, leválasztott eszköz, offline/pending tiltás, helyi napló megőrzése, visszavont kapcsolat lezárása, általános hálózati hiba esetén kapcsolatmegőrzés.
- Account-authos internal/staging Vite-build: sikeres. A meglévő 500 kB feletti bundle-figyelmeztetés továbbra is fennáll.
- `git diff --check`: sikeres. Kézi UI- és staging-elfogadás még nem történt.

## Még nem lezárt kiadási feltételek

Ez a család megszüntetése, nem a saját Solemi-account törlése. Az accounttörlés 30 napos recovery választása, automatikus véglegesítése és Apple-visszavonása az A17 további feladata.

A régi infrastruktúra-mentések megőrzési ideje és a végleges törlések backup-visszaállítás utáni újraérvényesítése továbbra is A17/A25 kiadási feltétel. A mostani SQL-export nem törlési napló, és nem teszi biztonságossá a régi backup feltétel nélküli éles visszatöltését. Távoli restore/rollback főpróba még nem történt.

Az A03 családi naplótörlés és ez a megszüntetés külön művelet: az előbbi üres naplóval megtartja a családot, az utóbbi magát a családi kapcsolatot is lezárja. Mindkettő staging elfogadása szükséges.

## Kézi próba — csak az új build sikeres Worker/Pages deployja után

1. Az eredeti Opo család Edge-adminját hagyjuk a helyén. Chrome-ban a nem admin tesztfiók exportáljon, várja meg a függő módosítások végét, majd lépjen ki az Opo családból. Edge-en ellenőrizzük, hogy a családi napló megmaradt.
2. Chrome-ban, már családon kívül töröljük csak a helyi naplót, majd hozzunk létre egy külön, egyértelműen elnevezett családot, például `Solemi törlési próba`. A staging tesztcsomag szükség esetén Family legyen. Csak egy mintagyermeket és egy rövid tesztalvást használjunk. Az Opo exportját ne töltsük ebbe a családba.
3. Edge InPrivate ablakában ugyanazzal a tesztfiókkal jelentkezzünk be. Két eszköz lesz, de egy családtag. Az eredeti Edge-admin normál ablaka maradjon meg. Mindkét tesztablakban egyezzen a mintaadat.
4. A03: exportáljuk a kis tesztnaplót, majd annak adminfelületén végezzük el a „Családi alvásnapló törlése mindenkinél” műveletet. Mindkét tesztablak üres naplót mutasson, a család pedig maradjon meg. Importáljuk vissza csak a kis tesztcsalád exportját, és ellenőrizzük a másik ablak eredményét.
5. Megszüntetés: „Kilépés a családból” → a külön előnézetben ellenőrizzük a család nevét és a darabszámokat. Töltsük le az exportot. Hibás névvel a végleges gomb ne legyen használható; Mégse ne módosítson adatot.
6. Pontos névvel szüntessük meg a kis tesztcsaládot. A fiók maradjon bejelentkezve, a helyi napló maradjon meg, családi kapcsolat ne legyen. A másik tesztablak fókusz/visszatérés és hálózati ellenőrzés után jelezze ugyanezt a helyi adatok elvesztése nélkül.
7. Újraindítás után se kapcsolódjon vissza a megszüntetett családhoz. A régi meghívó ne működjön. Külön ellenőrizendő a Free állapotú, utolsó admin megszüntetési útja is, feltöltetlen művelet nélkül.
8. Visszaút: zárjuk be az InPrivate tesztablakot. Chrome-ban szükség szerint töröljük csak a helyi tesztnaplót, majd az eredeti Edge-admin új Opo-meghívójával csatlakozzunk vissza. Ellenőrizzük a családi adatok egyezését. A feleség tagságát ez a lépéssor nem módosítja.

A kézi lépéseket a tulajdonossal kis adagokban végezzük; nem jelölhetők késznek pusztán a kód vagy az automatizált teszt alapján.
