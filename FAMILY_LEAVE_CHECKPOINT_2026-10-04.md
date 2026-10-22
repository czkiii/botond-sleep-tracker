# A04 — családi kilépés: a megmaradt gépi esetek lezárása

Dátum: 2026-10-04. Feladatszint: GPT-6 Astra · erős.
Alap: `6eddc65` (`feat/child-profile-v4`). A jelen javítások helyi módosítások; commit, push és deploy nem történt. Valódi fiókhoz vagy családi adathoz nem nyúltunk.

## Eredmény és határ

Az A04 kért helyi fejlesztési és gépi ellenőrzési része kész. A meglévő account-kilépést, eszközleválasztást, adminátadást és fizető nélküli szüneteltetést nem írtuk újra. Két igazolt párhuzamossági hibát javítottunk, 18 célzott teszttel bővítettük a meglévő csomagot.

A kiadási jelölő azért marad nyitott, mert az új kliens- és Worker-javítás még nincs kiadva és azonosított staging builddel ellenőrizve. Ez nem új kézi tesztsor: a korábbi sikeres adminátadás, kilépés, visszacsatlakozás és M5 családmegszüntetés bizonyítéka megmarad. Az M1–M6 kör nem ismétlendő. Most tulajdonosi tesztelés nem szükséges.

## Javított hibák

1. **Adminná előléptetett tag folyamatban lévő kilépése.** B még tagként kezdi a kilépést. A közben kilép és B-t adminná teszi. B korábban beolvasott szereppel futó kérése eddig adminátadás nélkül kiléptette B-t, így C admin nélkül maradhatott. A tranzakció most a beolvasott szerep egyezését is ellenőrzi; eltéréskor 409 `FAMILY_MEMBERSHIP_CHANGED`, a tagság és eszköz megmarad. Újrapróbáláskor már adminként adja át a szerepet C-nek.
2. **Késői kilépési válasz másik helyi fióknál/családnál.** Account-kilépés és eszközleválasztás után a válasz eddig feltétel nélkül ürítette az aktuális szinkronállapotot. Most csak az eredeti fiók-munkaterület, kapcsolat és előkészített kapcsolat egyezésekor alkalmazható. Másik fiók/család kapcsolata, függő műveletei és naplója megmarad. A korábbi szerveres kilépést ez nem vonja vissza; az új helyi állapot felülírását akadályozza meg.

A régi szerverkóddal a szerepváltási regresszió 409 helyett 200-at kapott. A régi klienskóddal mind a négy kezdeti késői-válasz próba hibázott (account/eszköz × fiók/kapcsolat váltás). Javítás után ezek és az előkészített kapcsolatra kiegészített próbák is sikeresek.

## Gépi bizonyítékok

`worker/tests/authRoutes.test.ts`: a meglévő HTTP–Worker–SQLite próbák mellé 8 új eset:

- Automatikus adminutód: legrégebbi aktív tag, azonos csatlakozási időnél stabil tagságazonosító szerinti sorrend; korábban kilépett tag kizárása.
- Tag → admin szerepváltás a kilépési tranzakció előtt, elutasítás és sikeres újrapróbálás.
- Kiválasztott utód közben kilép: az eredeti admin és eszköze megmarad, automatikus utóddal újrapróbálható.
- Eszköz-visszavonásba injektált adatbázishiba: tagság, adminátadás, eszköz-hozzárendelések és napló együtt visszagörgetve. A teszt kimenetében a szándékos `injected revocation failure` hibanapló elvárt.
- Négy jogosultsági eset: admin vagy tag fizető távozik, másik fizetővel vagy anélkül. Másik Family-fizető mellett a Family+ helyett a megmaradt csomag jogai élnek; nélküle olvasás és írás is `FAMILY_SYNC_PAUSED`. Gyermek, aktív alvás, jegyzet és családi revízió változatlan. A kilépő saját fiókja és vásárolt jogosultsága megmarad. Ismételt kilépés ártalmatlan; megmaradt tag jogosultságával a szinkron adat-visszaállítás nélkül újraindul.

`src/familySync.test.ts`: 10 új klienspróba:

- Offline, függő módosítás és sérült szinkronállapot mellett account-kilépés tiltva, kérés és adateldobás nélkül.
- Elveszett válasz után kapcsolat és napló megőrzése; sikeres újrapróbálás után is változatlan aktív alvások, profilfotó-hivatkozások és biztonsági mentés. A fotófájlok tényleges IndexedDB-tartalmát ez a teszt nem vizsgálja.
- Account-kilépés és eszközleválasztás közben fiók-, kapcsolat- vagy előkészítettkapcsolat-váltás: késői válasz nem írja felül az új állapotot (6 eset).

A korábbi utolsótag-védelem, kiválasztott adminutód, régi eszköztoken visszavonása, leválasztott eszköz automatikus visszacsatlakozásának tiltása és szünetelő szinkron függő sorának megőrzése meglévő tesztként szintén lefutott.

## Ellenőrzések

- Teljes `npm test`: **49 fájl, 606/606 PASS**.
- Frontend `npm run typecheck`: PASS.
- Worker `npm run typecheck --prefix worker`: PASS.
- `npm run build -- --mode internal`: PASS, PWA generálás kész. A meglévő 500 kB feletti csomagméret-figyelmeztetés megmaradt; ez nem buildhiba és nem új A22 feladat.
- A szerveres versenyeket valódi helyi SQLite-tranzakciók közé illesztett másik HTTP-kérés reprodukálja. Ez nem távoli D1-terhelési mérés. A klienspróbák késleltetett hálózati válaszokkal futnak; új böngészős vagy telefonos elfogadást nem állítunk.

## Következő lépés

**A05 — fiókváltás és vendégnapló megmaradt eseteinek áttekintése, csak a tényleges hiányok pótlása gépi próbákkal. Javasolt modell: GPT-6 Sol · erős (high). Most nem szükséges tulajdonosi tesztelés.** A meglévő M4 és accountWorkspace bizonyítékból kell kiindulni; újratelepítés utáni helyi adatmegőrzést nem szabad a böngészős visszatérésből automatikusan igazoltnak tekinteni.

GitHub Desktop Summary: `Protect family leave during concurrent admin and account changes`
