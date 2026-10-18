# Solemi V1 — lezárási terv és tényleges készültség

Dátum: 2026-10-16. Tulajdonosi kérésre készült összegzés, nem új funkciólista.

**Az összegzés utáni A17 előrelépés, 2026-10-18:** az üzleti restore-egyeztetés és az elkülönített, valódi Cloudflare bekötési/helyreállítási főpróba is sikeres. A régi napló mellett a friss trial/refund/törlés megmaradt, az ütemező a visszatöltés után is működött; a próba végpontja/cronja lezárva. **906/906** gépi teszt, két typecheck PASS. [Főpróbaeredmény](A17_ISOLATED_REHEARSAL_RESULT_2026-10-18.md). Az 1. blokk kompatibilis körének technikai főpróbája elkészült; a következő feladat a 2. blokkhoz tartozó közös staging-bekötés. A teljes A17 kiadási kapu nyitott a tényleges üzemeltetés/jogi/store feltételekig. Az alábbi pillanatfelvétel az eredeti összegzés készítésekor érvényes állapotot őrzi.

Ez a dokumentum az aktuális sorrend összefoglalója. A részletes bizonyítékokat a [kiadási ellenőrzőlista](RELEASE_CHECKLIST.md) és a hivatkozott checkpointok őrzik; a régi „következő feladat” bejegyzések történetiek. Az új sorrend nem minősít korábban nyitott kaput teljesítettnek.

## Hol tartunk?

Az app fő funkcióinak jelentős része elkészült. A hátralévő munka egy része már kész kód tényleges bekötése és kiadási igazolása; más része valódi fejlesztés, különösen a store-integráció és a helyreállítás üzleti előzményeinek egyeztetése. Nem helyes azt mondani, hogy már csak egy végső teszt van hátra.

A sok nyitott auditjelölő nem ugyanannyi új fejlesztés. Eddig a „helyben kész” és a „kiadásra elfogadott” állapot egy listában szerepelt, ezért a haladás nehezen volt követhető. Most hat lezárható munkablokkba rendezzük a meglévő teendőket. Ezek nem hat estét vagy hat munkamenetet jelentenek.

Ellenőrzött helyi állapot:

- Fejlesztési ág: `feat/child-profile-v4`, `e960c2b` — `Enforce trial identity and retention safeguards`. Az összegzés előtt tiszta munkafa.
- Helyi `main`: `57357fd`. Két csak main-en lévő commit: `a529a64`, `57357fd`; az összevonáskor tartalmukat külön meg kell vizsgálni. A fejlesztési ágon 163 külön commit van; ez nem 163 hátralévő feladat.
- A helyi origin-referenciák egyeznek a két ág fejével. Most nem történt hálózati fetch vagy az aktuális távoli ellenőrzések újraigazolása.
- Legutóbbi dokumentált gépi eredmény: **874/874 teszt**, frontend és Worker típusellenőrzés, frontend build, Worker feltöltés nélküli csomagpróba és 6 helyi böngészőeset sikeres. Ezek az A17 legutóbbi munkájának eredményei; most nem futtattuk újra őket.
- A korábbi `be15083` staging kiadás öt zöld ellenőrzése történeti bizonyíték, nem az aktuális `e960c2b` távoli elfogadása.

## Ami elkészült — nem kezdjük újra

| Terület | Elkészült eredmény | Megmaradt kiadási határ |
|---|---|---|
| Napló, gyermekprofilok, helyi adatvédelem | V3→V4 átalakítás, sérült adatok megőrzése, több böngészőlap kezelése, import/export és visszaállítási pont | A jelenlegi valódi felhasználó régi verzióról átállása még nem próbált |
| Családi működés | Kilépés, fiókváltás, vendégnapló, csatlakozás, konfliktuskezelés, utolsó gyermek védelme; M1–M6 közös kör 6/6 lezárva | Aktuális kiadás bekötése és csak a még hiányzó készülékes esetek |
| Statisztikák | A27 S01–S15 javítások, alapstatisztikák egyeztetése, közös gépi próbanapló | Előkészített, háromblokkos valódi telefonos elfogadás |
| Sebesség | A22 másodperces újraszámolás és első prémium számítás gyorsítása | Gyengébb valódi készüléken használati ellenőrzés |
| PDF és felület | HU/EN/DE PDF, csomagígéretek felmérése, konfliktusok összehasonlítása, billentyűzet/fókusz javítások | Mobilos PDF-mentés, rendszer-betűméret és képernyőolvasó |
| Hozzáférés és biztonság | Fizetős szinkronkorlát, offline igazolás, session-frissítés, proxy, kéréskorlátok, fejlécek helyi ellenőrzése | Kulcsok/config tényleges bekötése, éles konfiguráció és terhelési/költségkeret |
| Trial | Egyszer 7 nap, családonként legfeljebb négy, egyszerre egy; törlés utáni jelölés és jóváhagyott szabályok | Távoli aktiválás és a valódi vásárlási rendszerrel egyeztetés |
| Fióktörlés/adatkezelés | Törlés, adatexport, független törlési nyilvántartás, megőrzési eszközök és tájékoztatótervezet | Teljes helyreállítás, tényleges üzemeltetés és jogi/könyvelői véglegesítés |

## Hátralévő hat munkablokk, sorrendben

| Sorrend | Eredmény, amivel lezárható | Tulajdonosi részvétel |
|---|---|---|
| **1. A17 és helyreállítás befejezése** | Régi mentésből sem éled fel törölt fiók, nem indul új trial és nem áll vissza elavult fizetős jog. Friss account-/családi trial- és store-előzmények egyeztetése; elkülönített helyreállítási próba. | Gépi előkészítéshez nincs kézi app-teszt. Távoli bekötés külön egyeztetett művelet. |
| **2. Kiadási környezet és V1 tartalom lezárása** | Domain, belépés, kulcsok, fizetős hozzáférés beállításai, törlési nyilvántartás/ütemezés, tényleges mentés- és logmegőrzés, költségkorlátok; árak/paywall-szövegek, adatkezelői és supportadatok, privacy/feltételek egyeznek a működéssel. | Konkrét üzleti/üzemeltetési adatok és jogi/könyvelői véglegesítés. A már elfogadott trial- és megőrzési döntéseket nem kérdezzük újra. |
| **3. Régi→új migráció és `feat/child-profile-v4 → main`** | A meglévő felhasználó másolatán igazolt átállás, visszaút, ellenőrzött merge és külön vezérelt kiadás; utána a valódi napló egyezése. | A felhasználó eszközén egyszeri mentés/átállás, egyeztetett időpontban; éles műveletek előtt jóváhagyás. |
| **4. Egy összevont webes főteszt és tiszta kiadási felület** | Aktuális, azonosított verzióra összegyűjtött gépi bizonyíték + még hiányzó telefonos kör; statisztikák, offline/PWA-frissítés, PDF, megjelenítés és hozzáférés. Tesztjelölések nélküli kiadási build ellenőrzése. | Egy előre összeállított tesztmenet; M1–M6 teljes újrajátszása nélkül. Talált hibánál célzott újrapróba. |
| **5. Android/iOS csomag és valódi store-integráció** | Telepíthető csomag, natív Google/Apple belépés, havi/éves termékek, vásárlás, visszaállítás, lejárat/visszatérítés és szerverértesítések; trial egyezése; áruházi tesztkörnyezetben ellenőrzés. | Fejlesztői fiókok, aláírások és tényleges készülékes vásárlási/belépési próba; a csomagépítést a tulajdonos is futtathatja. |
| **6. Áruházi beadás és indulás** | Store-adatlapok/képek/adatkezelési nyilatkozatok, support, monitoring, kiadási bizonyítékok, jóváhagyott feltöltés. | Tulajdonosi adatok, végső jóváhagyás; az áruházi elbírálás külső lépés. |

Az 1–2. blokk és a 3. blokk olvasási leltára/másolatos előkészítése átfedhet. A **3. blokk tényleges átállása** csak a szükséges előfeltételek és a célzott migrációs próba után következhet. A 4. blokk a már összevont változat fő elfogadása; ez nem jelenti azt, hogy merge előtt semmilyen ellenőrzés nem kell.

**Csomagolás indításának feltétele:** az 1–4. blokk lezárása. A végleges, pénzért kiadható csomaghoz az 5–6. blokk is kell. A valódi fizetés nem opcionális utómunka: a most meglevő jogosultsági alapokra épül, de a store-bekötés még külön nagy feladat.

## A jelenlegi egy felhasználó átállása

A tulajdonos szerint a main-es verziót egy tesztfelhasználó komolyan, napi használatban használja. A történeti Opo/Boti/1799 próba nem bizonyítja ennek a felhasználónak a mostani állapotát; nem feltételezzük, hogy ugyanaz a személy, napló vagy környezet.

1. **Leltár, módosítás nélkül:** pontos használt URL, alkalmazásverzió, böngésző/telepített PWA, helyi napló, esetleges szerveres családi adat, függő módosítás, aktív alvás és hozzáférés. A main forrás V3-at használ; a tényleges telepített verziót ettől külön kell azonosítani.
2. **Mentés és ellenőrzés:** friss helyi export; ha van szerveres adat, külön adatbázismentés és sémaleltár. Az eredeti példányt nem írjuk felül; a mentés olvashatóságát ellenőrizzük. Személyes mentés nem kerül Gitbe.
3. **Másolatos főpróba:** V3→V4, belépés/fiókhoz rendelés és szükség esetén családi átállás. Alvások azonosítói, időpontjai, jegyzetei, darabszáma, profilkapcsolatai és aktív állapota egyezzenek; függő írás és elérhető képek se vesszenek el. A teszt nem a napi használatú naplón fut.
4. **Webcímváltás külön kezelése:** más domain nem látja automatikusan a régi webcím böngészős adatait. Ha költözés is lesz, ellenőrzött átvitel kell; a kódban meglévő automatikus migráció önmagában nem oldja meg ezt. Az új fiókhoz kapcsolás nem írhatja felül a meglevő naplót.
5. **Hozzáférési átmenet:** rögzíteni kell, hogyan marad használható a meglévő felhasználó naplója az új fizetős kapuk mellett. Nem fogyasztunk el észrevétlenül trialt, és nem feltételezünk automatikus fizetős jogosultságot. Ez a leltár alapján célzott döntési pont lehet.
6. **Összevonási/kiadási terv:** a main két saját commitjának vizsgálata, kötelező ellenőrzések, a GitHub és Cloudflare automatikus kiadási kapcsolóinak ellenőrzése. A helyi main GitHub Pages munkafolyamata még pushra publikál; az új ágban már csak kézzel indul. Az összefésült végállapotot kell igazolni, nem csak az egyik ág beállítását.
7. **Kontrollált átállás:** szükség esetén rövid írási szünet, utolsó mentés, szükséges adatbázismigrációk, összeillő backend/frontend, felhasználói adat- és működésellenőrzés. A konkrét sorrendet a sémák kompatibilitása szabja meg.
8. **Visszaút és lezárás:** hibánál megállítás és előre próbált helyreállítás; az átállás után keletkezett új bejegyzéseket is meg kell őrizni. Egy régi frontend visszarakása nem feltétlenül visszaállítás. Mentések megőrzése a jóváhagyott határidők szerint.

Az új production konfiguráció Cloudflare Pages és saját `/api` útvonal használatát követeli. A jelenlegi GitHub Pages build ennek nem felel meg. Emiatt a merge és az új verzió felhasználónak történő kiadása két külön ellenőrzött lépés.

## A sárga/narancssárga jelzések

A kódban az `INTERNAL / TEST` felső sáv és a tesztadat-betöltés belső buildkapcsolóhoz kötött. A production konfiguráció a belső módot és a manuális csomagtesztelést kizárja. Ezek eltűnését az elkészült kiadási builden ellenőrizzük, nem az alkalmazás teljes felületét írjuk át miatta.

Ha a tulajdonos más sárga visszajelzésre is gondol, azt a főteszt során konkrétan azonosítjuk. Valódi szinkronhiba, hiányos adat vagy bizonytalan becslés jelzését nem töröljük pusztán a színe miatt.

## Hogyan marad véges a munka?

- A hat blokk a mostani teendők csoportosítása; új ötletek külön következőverziós listára kerülhetnek, a V1-be emelésük külön döntés.
- Minden folytatásnál megnevezzük a blokkot, a most lezárandó eredményt és azt, kell-e tulajdonosi teszt. Nem csak újabb auditazonosítót adunk.
- Kész feladatot konkrét új hiba vagy hiányzó bizonyíték nélkül nem kezdünk újra. A korábbi sikeres teszteket felhasználjuk.
- Nem ígérünk százalékot vagy kiadási dátumot a még nem próbált migráció és store-integráció ismerete nélkül. A nagy nyitott fejlesztések nevesítve vannak fent.
- Távoli állapotot csak friss ellenőrzés után jelölünk késznek. A régi checkpointok történeti mondatai nem indítanak új munkát.

**Következő javasolt munkamenet:** a 3. blokk régi→új átállási leltára és másolatos migrációs tervének elkészítése; merge, deploy és valódi adatváltoztatás nélkül. **GPT-6 Astra · erős.** Kezdetben kézi app-teszt nem kell; a használt régi URL/eszköz és a mentés forrása később rövid tulajdonosi egyeztetést igényelhet. Ezután az 1–2. blokk konkrét előfeltételeit zárjuk le a migráció végrehajtásához.

Ebben az összegző munkamenetben alkalmazáskód, távoli adat, main ág vagy kiadás nem változott; csak a tervezési dokumentumok frissültek.
