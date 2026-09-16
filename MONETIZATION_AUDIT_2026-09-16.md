# Solemi Sleep — monetizációs audit

Dátum: 2026-09-16. Ág: `feat/child-profile-v4`; ellenőrzött HEAD: `fec5393`.
Státusz: **döntési javaslat, nem jóváhagyott új termékszabály**.
Alkalmazáskód, konfiguráció, funkciómátrix és jogosultság nem változott.

## Vezető megállapítás

A jelenlegi Family csomag önálló előfizetésként gyenge: fő értéke a családi
szinkron és a PDF, miközben az alap közös naplózásnak vannak ingyenes alternatívái.
A Family+ erősebb irány, de a puszta következőalvás-becslés már nem kizárólagosan
fizetős piaci funkció. A fizető szülőre korlátozott Insights különösen nehezen
egyeztethető össze a Family+ névvel és a család közös használatával.

Elsődleges javaslat: induláskor **Free + egy családra érvényes fizetős csomag**.
A második fizetős szintet csak önálló, validált felhasználói igény indokolja.
Az ingyenes szinkron gazdaságosságát külön mérni kell; a versenytársak kínálata
nem bizonyítja automatikusan a Solemi azonos modelljének fenntarthatóságát.

## Módszer és korlátok

A repository termékterveit, az entitlement-listát és az Insights megjelenítését
olvastam össze hivatalos termékoldalakkal, súgókkal és áruházi leírásokkal.
Nem vásároltam előfizetést, nem teszteltem konkurens appokat bejelentkezve.
Az árak megfigyelt webes/USD/EUR példák; nem ellenőrzött magyar checkoutárak.
A kereső kivonata és az élő oldal közti eltérést külön jelölöm.

Helyi alap: `FEATURE_ENTITLEMENT_MATRIX.md`, `PRODUCT_DESIGN_LOCK.md`,
`ACCOUNT_ENTITLEMENT_ARCHITECTURE.md`, `src/entitlements.ts`, `src/App.tsx`.
A mátrix architektúrához lezárt, de ez az audit a felhasználó kérésére felülvizsgálja
a kereskedelmi felosztást; nem írja felül automatikusan a korábbi döntést.

## A jelenlegi terv

| Csomag | Tervezett érték |
|---|---|
| Free | Teljes helyi alvásnapló, teljes előzmény, napi/heti/havi alapstatisztika, több gyermek, korrekciók, alapfigyelmeztetések, kézi emlékeztető. |
| Family | Free + aktív családi/eszközök közötti szinkron, közös profilok és előzmények, PDF. |
| Family+ | Family + személyes ébrenléti elemzés, referencia-összevetés, becslés, rutinok, hasonló napok, haladó trendek, adaptív emlékeztetés. |

Egy fizető aktiválja a családi szinkront, de a PDF és Family+ Insights személyes
jog marad. Két aktív eszköz/account a jelenlegi döntés. A próba 7 nap Family+;
az éves célkedvezmény kb. két hónap. Konkrét lezárt listaárat az átnézett
termékdokumentumokban nem találtam.

A jelenlegi kliens hét teljes Insights-kártyát zár együtt. Az ébrenléti kártyában
egyszerű „mióta ébren?” érték és mélyebb személyes elemzés is van; a havi riportban
alapátlagok és többhavi összehasonlítás együtt szerepelnek. Eltérő értékű elemek
kerülnek ugyanazon fizetős határ mögé.

## Ellenőrzött konkurenshelyzet

| Termék | Ingyenes vagy fizetős határ | Következmény a Solemire |
|---|---|---|
| Huckleberry | Free: napló, alapriportok, több gyermek, többeszközös gondozói szinkron. Plus: SweetSpot-becslés, Insights és haladó riportok. A megosztás ugyanazzal az accounttal történik. | A puszta családi szinkron gyenge fizetős főérv. A személyre szabott segítségnek viszont van fizetős precedense. [Free](https://huckleberrycare.com/product/free), [Plus](https://huckleberry.zendesk.com/hc/en-us/articles/1500007717641-What-is-Huckleberry-Plus). |
| Baby Daybook | Saját összehasonlításuk szerint ingyenes a következő alvás előrejelzése; fizetős a teljes napi előrejelzés, Family Sync, haladó riport és teljes Timeline. | A „következő alvás csak prémiumban” nem elég erős különbség önmagában. [Saját funkcióbontás](https://babydaybook.app/blog/best-baby-sleep-tracking-apps-2026/). |
| Napper | Árlistájuk Free oszlopában napi alvásnapló és életkor szerinti alvási ütemezés szerepel. A személyre szabás Unlimited-funkció. A Free/Unlimited pipákat az oldal HTML-jében is ellenőriztem. | Általános életkori támpontért gyenge külön előfizetési érvet építeni; ez nem azonos a saját adatok elemzésével. [Árlista](https://napper.app/en/pricing/). |
| Nara Baby | **Ellentmondó nyilvános tájékoztatás.** A kereső régi kivonata és a Google Play leírás ingyenes appot ír; az aktuális GYIK havi/lifetime fizetést, 7 nap próbát, utána csak megtekintést/exportot közöl. | Nem számítható biztos, tartósan ingyenes szinkronalternatívának. A jelenlegi GYIK szerint egy fizetés a teljes családi gondozói kört lefedi. [Aktuális GYIK](https://nara.com/pages/nara-baby-app-faqs), [Google Play](https://play.google.com/store/apps/details?id=com.naraorganics.nara&hl=en). |
| Baby Tracker — Nighp | A jelenlegi főoldalról linkelt GYIK a szinkront alapfolyamatként, a régi teljes verziót Watch/Siri/reklámmentességként írja le. Az aktuális iOS leírásban a What’s Next becslés 3 nap után Plus-előfizetéses. | A dokumentáció alapján az alap szinkron ingyenesnek tűnik, de ezt friss fiókos készülékteszt nélkül közepes bizonyosságúnak tekintem. A predikciót nem sorolom ingyenesnek. [GYIK](https://www.nighp.com/babytracker/babytracker_faq.html), [iOS](https://apps.apple.com/us/app/baby-tracker-newborn-log/id779656557). |
| nappi — kiegészítő összehasonlítás | A saját FAQ egyértelműen ingyenes családi szinkront és CSV-exportot ír; a személyre szabott becslés fizetős, egy prémium tag az egész háztartást lefedi. | További elsődleges forrás az ingyenes együttműködés + közösen használható prémium modellre. Nem állítok piacvezető státuszt. [Hivatalos oldal](https://www.nappi.app/). |

Fontos különbségek: ingyenes letöltés ≠ ingyenes funkció; időszakos próba ≠ tartós
Free; kézi ébrenléti emlékeztető ≠ saját adatokból tanuló emlékeztető;
CSV-adatexport ≠ formázott PDF-riport; közös account ≠ külön családtag-accountok.

## Paywall-elemek értékelése

| Elem | Értékelés | Javaslat |
|---|---|---|
| Alap két szülős szinkron | Gyenge önálló előfizetési érv; Huckleberry és nappi ingyen adja. | Legalább két külön szülői account közös naplója kerüljön Free-be, ha a költségmérés fenntarthatónak mutatja. |
| Saját account második eszköze | Gyenge megkülönböztetés; bejelentkezéskor könnyű automatikus adatátvitelt várni. A Solemi élő tesztjén is felmerült. | Az alap adatfolytonosság és visszaállítás legyen világos; lehetőleg a Free része. A szinkron nem helyettesít verziózott biztonsági mentést. |
| PDF | Kiegészítő érték; a Baby Daybook is fizetőssé teszi. Önmagában kevés ismétlődő havi értéket adhat. | Egyszerű adatkivitel maradjon ingyen; összehasonlító, magyarázott, jól nyomtatható riport lehet prémium. |
| Általános életkori támpont | Gyenge kizárólagos prémiumelem a Napper Free mellett. | Ingyenes alapinformáció, egyértelműen elkülönítve a személyes megfigyeléstől. |
| Aktuális ébrenléti idő / alapösszesítés | Gyenge: alapadatok újracsomagolása nem új segítség. | Free; a nappali alvássorrend szerinti személyes tartományok és összehasonlítás lehetnek fizetősek. |
| Következő alvás becslése | Közepes: Huckleberry fizetősen, Baby Daybook a következő becslést ingyen kínálja. | Érdemes alapbecslést ingyen kipróbálhatóvá tenni; a prémiumhoz bizonyítottan hasznosabb értelmezés és alkalmazkodás kell. A bizonytalanság korrekt jelzését ne zárjuk fizetés mögé. |
| Havi alapátlag / egyszerű trendgrafikon | Gyenge, és a saját Free havi statisztikánkkal is átfed. | Az alapérték Free; több időszak értelmezett összevetése, mintázatok és változások legyenek prémium. |
| Hasonló napok, személyes rutin, tartós változás felismerése | Ígéretes fizetős mag, de a hasznosságot és megkülönböztetést még igazolni kell. | Konkrét szülői kérdést válaszoljon meg, mutassa az alapul szolgáló adatokat és a bizonytalanságot. |
| Saját mintából működő adaptív emlékeztetés | Védhetőbb, ha valóban több egy kézzel beállított visszaszámlálónál. | Napi használatban mérjük az értékét, ne pusztán a funkció meglétét árazzuk. |
| Family+ csak a fizető szülőnek | Erős csomagolási gyengeség. | Egy család előfizetése adja a közös gyermekek prémium nézeteit a kapcsolódó családtagoknak is. |

A Baby Daybook Premium-oldala külön kimondja a gondozók közös prémiumjogát és a
fizetős PDF-et. Ez a Family+ családi hozzáférésére tett javaslat közvetlen
összehasonlítási alapja. [Premium](https://babydaybook.app/premium/).

## Ajánlott csomagolás — döntésre

**Free:** a jelenlegi teljes napló és többgyermekes alap; alapstatisztika;
aktuális ébrenléti idő; általános életkori támpont; hordozható adatkivitel;
alap családi együttműködés és adat-visszaállítás, előzetes költségellenőrzéssel.
Az alap következőalvás-becslés ingyenességét külön tesztelném: ne csak egy zárt
kártyából ismerje meg a felhasználó a Solemi segítségét.

**Family+ / Solemi Plus:** egy előfizetés az adott családra; saját mintákból
származó részletes elemzés, hasonló napok, tartós változások magyarázata,
összehasonlítható időszakok, adaptív emlékeztetés és értelmezett PDF-riport.
A meglévő, tesztelt képességeket és a még csak tervezett ígéreteket a paywallon
külön kell kezelni. Teljes napi újratervezést például csak elkészítés és validáció
után szabad értékesítési érvként használni.

**Family középső fizetős csomag:** induláskor elhagynám. Ha később marad,
önálló többletérték kell, például részletes gondozói szerepkörök, átadási
összefoglalók vagy verziózott visszaállítás. Ezek most javasolt későbbi funkciók,
nem jelenleg kész képességek. Mesterséges korlátok hozzáadása nem megoldás.

A meglévő szerveroldali jogosultsági munka továbbra is hasznos: fizetésellenőrzés,
lejárat, családi tagság, vásárlás-visszaállítás és személyes/családi jogok külön
kezelése akkor is kell, ha a kereskedelmi határ később elmozdul.

## Próbaidő, ár és validáció

**Belső ellentmondás:** a terv 7 használható napot kér a személyes predikcióhoz,
de a próba is 7 nap. Ha regisztrációnál indul, a felhasználó a próba nagy részét
adatgyűjtéssel töltheti. Javaslat: az adatgyűjtés ingyenes; a felhasználó akkor
indíthassa a próbát, amikor van mit kipróbálnia. Alternatíva a 14 napos próba.
Az indulás és a terhelés időpontja legyen egyértelmű, külön választással.

Megfigyelt árhorgonyok, nem magyar árajánlatok:

- Huckleberry Plus: az oldalon 5,74 USD/hó éves számlázással; Premium 9,99 USD/hó éves számlázással. Két hét hozzáférést említenek. [Árlista](https://huckleberrycare.com/pricing).
- Napper Unlimited: a közvetlenül megnyitott oldal 47,99 EUR/évet, a kereső kivonata 69,99 USD/évet mutatott. Régió/ajánlat eltérhet; 7 napos próba szerepel. [Árlista](https://napper.app/en/pricing/).
- Nara aktuális GYIK: 9,99 USD/hó vagy 99,99 USD egyszeri, családi hozzáféréssel; régi ingyenes kommunikációval ütközik. [GYIK](https://nara.com/pages/nara-baby-app-faqs).
- Baby Daybook US áruház: több havi, éves és lifetime termék szerepel; ebből nem állapítható meg minden új felhasználó tényleges ajánlata. Nem választok önkényesen egyet listaárnak. [Áruház](https://apps.apple.com/us/app/baby-daybook-newborn-tracker/id1446283219).

Solemi árazási teszthipotézis: **3,99 EUR/hó vagy 39,99 EUR/év/család**, később
összehasonlítva **4,99 EUR/hó vagy 49,99 EUR/év/család** ajánlattal. Ez saját
javaslat, nem mért fizetési hajlandóság vagy nyereségességi számítás.
A végleges magyar árhoz a platform díjait, adókat, támogatási és infrastruktúra-
költségeket, használati időt és konverziót is ismerni kell.

Mérendő: sikeres családi meghívás és tényleges közös használat; visszatérő naplózás;
első hasznos személyes eredményig eltelt idő; prémiumpróba használata és fizetővé
válás; megtartás; családonkénti backend/support költség; előrejelzés pontossága és
a szülő által jelzett hasznosság. Kis tesztelői mintából ne állítsunk piaci bizonyítékot.

Megtartandó döntések: hasznos Free, teljes előzmény, több gyermek, tisztességes
adathozzáférés, szándékos kattintásra megjelenő paywall, kitalált személyes
eredmények nélküli előnézet. A hét zárt kártya helyett kevesebb, érthető prémium-
ajánlatot javaslok. A magyar nyelv előny lehet, de nem kizárólagos: a Baby Daybook
aktuális áruházi nyelvlistájában magyar is szerepel.

## Következő döntés és megőrzött fejlesztési checkpoint

Előbb a két- vagy háromcsomagos modellről és a családi prémium hozzáférésről
érdemes dönteni, utána a vásárlási termékazonosítókat és paywallt véglegesíteni.
A konkrét ár későbbi validációs feladat.

A következő kódolás előtt a tegnapi kéttelefonos duplikációt kell kivizsgálni.
A Family+ telefonon három változat, a másikon csak a helyi változat jelent meg;
az ok ismeretlen. A részletes hibajegy a `CODEX_PROJECT_STATUS.md` fájlban van.
Az audit nem jelenti a szinkronhiba elfogadását vagy javítását.
