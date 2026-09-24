# Család megszüntetése — helyi megvalósítás és staging próba

Dátum: 2026-09-23. Kiinduló commit: `c2bccdc`, ág: `feat/child-profile-v4`.
Állapot: a családmegszüntetés `badb0a9` commitban stagingre került; a 2026-09-24-i eszközkötési javítás helyi, commit/push és staging elfogadás még szükséges. A 2026-09-23-i megvalósítás során távoli adatváltoztatás vagy deploy nem történt.

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

## 2026-09-24-es staging megálló és javítás

Az első három kézi lépés közül az Opo export, a nem admin Chrome-fiók kilépése és a Chrome kizárólag helyi törlése sikeres volt. Az Edge-admin Opo családja továbbra is 1799 alvást mutat. A tesztcsalád létrehozása `409 ACCOUNT_DEVICE_ALREADY_LINKED` hibával megállt; a frissítés után a Chrome-ban nem látszott családi tagság, ezért nem indult családi törlés vagy import.

Ok: a korábbi account-kilépés minden régi tokent visszavont, de az `account_family_devices` kapcsolatot meghagyta. Az új család létrehozása ezt aktív eszközkötésnek értelmezte. Helyi javítás: a kilépés végén ugyanabban a D1 batchben törlődnek a kilépő account eszközkötései; a már régebbről megmaradt kapcsolat csak akkor szabadul fel új család létrehozásakor vagy meghívós csatlakozáskor, ha a régi token visszavont és nincs aktív tagság. A régi család, saját fiók, revokált eszköz és más családtagok adatai megmaradnak. Az internal felület ezentúl a szerver hibakódját is megmutatja.

Következő kapu a javítás idején: commit/push, új staging Worker- és Pages-build, zöld ellenőrzések. Utána Chrome-ban az üres naplóból egyszer újra létrehozni a `Solemi törlési próba` családot; az Edge Opo családját nem módosítani. Csak a sikeres, szinkronizált tesztcsalád után folytatni a 3–8. kézi lépést.

Helyi ellenőrzés: frontend és Worker TypeScript sikeres; a teljes verziókezelt Vitest-készlet 27 fájlban 292/292 sikeres; az internal/staging frontend build sikeres. A célzott tesztek igazolják az account-kilépés utáni kapcsolatlezárást, a régi Worker által meghagyott revokált kapcsolat újrahasználatát és a meghívós visszacsatlakozást a régi token feltámasztása nélkül.

**2026-09-24, javított staging `98a8a71`:** a Chrome-fiók az üres helyi naplóból sikeresen létrehozta a külön `Solemi törlési próba` családot. Ugyanazzal a tesztfiókkal az Edge InPrivate új eszközként automatikusan a családba került, meghívókód megadása nélkül; egy üres, névtelen gyermekprofil és 0 alvás látszott, friss szinkronnal. Az eredeti Edge-admin Opo ablaka érintetlen. Következő kézi kapu: egy minta gyermekprofil és egy rövid tesztalvás két eszköz közti egyezése, majd az A03 kis családon végzett törlési és visszaállítási próbája.

**2026-09-24, mintaadat két böngészőn:** az Edge InPrivate ablakban a kezdő gyermekprofil `Tesztbaba` nevet kapott, és a Chrome-ban is ugyanígy jelent meg. Egy rövid, befejezett tesztalvás után mindkét eszköz 1 alvást mutatott. A következő lépés a kis család exportja mindkét böngészőből és a családi törlés előnézetének ellenőrzése. Az Opo 1799 alvásos családjára nem szabad ezt az exportot vagy a törlést alkalmazni.

**2026-09-24, A03 kis család tényleges törlése:** az Edge InPrivate előnézete a `Solemi törlési próba` családnál 1 gyermekprofil és 1 alvás törlését, valamint 1 üres kezdőprofil létrehozását jelezte; a véglegesítés előtt külön mentés letölthető volt, és pontos családnév-megerősítést kért. A végrehajtás után mind az Edge InPrivate, mind a Chrome üres, névtelen profilt és 0 alvást mutatott, `Utolsó szinkron: most` állapottal; a tesztcsalád megmaradt. A következő kapu a kizárólag e családból készült, 1 alvásos export visszaimportja és a két eszköz egyezése.

**2026-09-24, export visszaimportja:** az Edge InPrivate a külön tesztcsalád 1 alvásos mentéséből családi importot készített elő. Az előnézet 1 gyermek hozzáadását, 1 üres profil törlését és 1 alvás hozzáadását mutatta; az import előtti 0 alvásos állapotból visszaállítási pont készült. Alkalmazás után mind az Edge InPrivate, mind a Chrome ismét `Tesztbaba` profilt és 1 alvást mutatott, friss családi szinkronnal. A következő kapu a 0 alvásos visszaállítási pont tényleges alkalmazása és két eszközön történő ellenőrzése.

**2026-09-24, üres visszaállítás elakadása — [GPT-6 Astra · high]:** az InPrivate a jóváhagyott visszaállítás után névtelen profilt és 0 alvást mutatott; az előző 1 alvásos állapotból 22:15-kor biztonsági pont készült. Két módosítás várakozott „Szinkron ellenőrzése szükséges” jelzéssel. A Chrome Tesztbaba / 1 alvás állapotban maradt. Ezt a próbát nem fogadtuk el.

Helyi kliens+Worker+SQLite teszt a hibát `400 INVALID_REQUEST: Invalid child.name.` válasszal reprodukálta: az üres profil létrehozása az általános, nem üres szöveget követelő validátort használta. A törlési kérés ezért még nem indulhatott el. A célzott Worker-javítás a gyermeknévnél engedi az üres szöveget create és patch esetén, továbbra is elutasítja a hiányzó/nem szöveges és 60 karakternél hosszabb értékeket. Családnév, azonosító és jogosultság ellenőrzése nem változott; nincs migráció.

Ellenőrzés: a két új reprodukciós teszt javítás előtt ugyanott bukott; javítás után az ismételt üres restore → kis import → üres restore mindkét szimulált eszközön egyezik. Külön teszt igazolja a régi elutasítás után megőrzött két művelet azonos ID-val és payload-dal történő folytatását, a név törlését az alvás megőrzésével és a hibás értékek írás nélküli elutasítását. Teljes helyi készlet: 27 fájl, 296/296 sikeres; frontend és Worker TypeScript sikeres. Staging javítás és kézi elfogadás még nem történt.

**Következő kapu — [GPT-6 Sol · medium]:** tulajdonosi commit/push, sikeres staging Worker-deploy, majd a már sorban álló feltöltés újrapróbálása. A meglévő InPrivate ablak maradjon nyitva; új import/törlés/felülírás ne kerüljön a sorba. Mindkét tesztablakban névtelen profil / 0 alvás, üres feltöltési sor és friss szinkron szükséges. Ezután a kis mentés visszaimportjával folytatható a családmegszüntetési próba. Az Opo naplóját egyik lépés sem célozza.

A tulajdonos a családi kártyán `Nem sikerült frissíteni a családi adatokat. · INVALID_REQUEST · INVALID_REQUEST` üzenetet olvasott le, ami összhangban van a helyi reprodukcióval. A végső account-authos internal build és a `git diff --check` sikeres; a meglévő 500 kB feletti bundle-figyelmeztetés megmaradt. Távoli deployt ebben a javításban nem végeztünk.
