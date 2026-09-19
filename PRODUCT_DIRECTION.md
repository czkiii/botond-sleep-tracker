# Solemi Sleep — elfogadott termékirány

Elfogadva a tulajdonossal: **2026-09-17**. Ez a dokumentum a jelenlegi termékdöntések forrása; az auditok alternatívái nem írják felül. A végrehajtás állapotát a `CODEX_PROJECT_STATUS.md` követi.

## Cél és határok

A Solemi valós felhasználói igényekből készült, nem kizárólag a fejlesztő és párja ötletéből. Könnyen vezethető, alvásra összpontosító napló, opcionális közös családi használattal. A korábbi igényfeltárás részletei és mintája nincsenek a repóban dokumentálva; ezek hiányából nem következik, hogy igényfeltárás nem történt.

Az app feljegyzi és bemutatja, mi történt és hogyan változott a gyermek alvása. Nem minősíti a szülőt, nem ír elő altatást, étkezést vagy napirendet; nem ígér jobb vagy hosszabb alvást. Nem teljes babakövető: etetés, ivás, pelenka, gyógyszer és séta naplózása nem része a választott termékiránynak. AI-asszisztens és kéretlen ajánlás nem cél.

**Előbb a gyermek, az app ráér utána.** A főképernyő nagy ébren/alszik gombja, a sötét megjelenés és az 5/10/15 perces visszamenőleges korrekció tudatos döntések. A naplózás ne követeljen azonnali figyelmet az elalvás pillanatában. Megőrzendő a gyors, kevés adminisztrációt kérő működés.

Az elemzések saját feljegyzésekből származó leíró statisztikák és visszanézhető jelentések. Értékük az alvás változásainak megértése és későbbi személyes visszatekintés is. A meglévő következőalvás-becslés kommunikációját ehhez kell igazítani: korábbi saját minta, nem előírás vagy eredményígéret. Ezt a szöveges/funkcionális ellenőrzést még külön el kell végezni.

## Elfogadott csomagok és havi árak

| Csomag | Havi ár | Fő érték |
|---|---:|---|
| Free | 0 Ft | Teljes helyi alap-alvásnapló, előzmény, korrekció, alapstatisztika és több gyermek. |
| Family | 990 Ft | Free + közös, eszközök közötti családi alvásnapló. |
| Family+ | 1 490 Ft | Family + kiválasztott haladó statisztikák és az alvás változásait bemutató jelentések. |

A közös szinkron önálló fizetős érték a terméktervben. Konkurens ingyenes megoldás létezése nem automatikus ok a csomag elhagyására. Family+ tényleges választható többlet; nem kizárólag árpszichológiai összehasonlító csomag. A csomagokat most megtartjuk; az auditok Free + egyetlen Plus ajánlata nem elfogadott döntés.

Éves listaár, regionális árak, áruházi megjelenítés és a díjak/adók utáni gazdaságosság még nincs véglegesítve. A havi árak jóváhagyott termékterv, nem már működő bolti ajánlat vagy bizonyított fizetési hajlandóság. A PDF/értesítés és más korábbi tervek nem válnak ettől elkészült, értékesíthető funkcióvá.

## Családi hozzáférés — kötelező szabály

**Ha bármelyik aktív családtag érvényes Family vagy Family+ előfizetéssel rendelkezik, az egész aktív család megkapja az adott csomag fizetős funkcióit.** Nem számít, ki hozta létre a családot, és a fizetőnek nem kell adminnak lennie.

- Family + Free: minden aktív tag használhatja a Family funkciókat.
- Family+ + Free vagy Family: minden aktív tag használhatja a Family+ funkciókat és jelentéseket.
- Több előfizetés esetén az aktív tagok közül a legmagasabb érvényes csomag adja a családi hozzáférést. A másik szülőnek nem kell külön fizetnie.
- Ha a Family+ lejár/kilépő taghoz tartozik, de más aktív tag Family joga megmarad, a közös napló működik, a Family+ hozzáférés megszűnik.
- Ha nincs aktív fizető tag, a korábban rögzített megőrzési szabály szerint a család és adatai megmaradnak, az aktív szinkron szünetel; a helyi napló tovább vezethető.
- A számlázási előfizetés tulajdonosa továbbra is a vásárló account; a családi használati jog ebből, az aktív tagságon keresztül származik. Ez nem azonos az Apple Family Sharing szolgáltatással.

**Implementációs állapot — 2026-09-19:** a Worker és kliens külön tartja a vásárló saját grantjait, és az aktív család legmagasabb jogosultságából számolja az effektív funkciókat. A Family+ Insights így minden aktív családtagnak elérhető, ha bármelyik aktív tag Family+ jogosultsága érvényes. A Family+ + Free, Free + Free, Free + Family és fordított fizetőjű Free + Family+ staging kéttelefonos próbák sikeresek.

## Indulás és következő munka

Cél: rendszeresen használó családok és kis, fenntartható mellékbevétel; heti 5–8 órás fejlesztési/tesztelői kapacitással. Nyilvános induláskor App Store és Google Play jelenlét is szükséges. Az egyszerűséget és a csomagok értékét további családokkal ellenőrizzük, új funkciók automatikus hozzáadása nélkül.

A következő fejlesztési feladat az App Store és Google Play vásárlás-ellenőrzési és visszaállítási adaptereinek megtervezése a meglévő entitlement modellhez. Későbbi kutatási feladat: szülői Reddit-beszélgetések és más közösségi visszajelzések áttekintése arról, miért kezdenek naplózni, mikor válik teherré, és miért hagyják abba. Kutatás ebben a munkamenetben nem indul.

Commit/push a tulajdonos feladata. Éles deploy, main merge és production adatbázis-módosítás külön engedélyhez kötött.
