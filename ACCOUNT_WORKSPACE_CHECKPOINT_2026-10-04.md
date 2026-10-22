# A05 — fiókváltás és vendégnapló megmaradt gépi esetei

Dátum: 2026-10-04. Alap HEAD: `456410f` (`feat/child-profile-v4`). Feladatszint: GPT-6 Sol · erős (high). A javítás helyi; commit, push és deploy ebben a feladatban nem történt. Valódi fiókokat és naplókat nem módosítottunk.

## Eredmény

Az A05 megmaradt, géppel vizsgálható helyi része kész. A meglévő M4 staging eredmények és a korábbi A→vendég→B→A, függő műveleteket elkülönítő tesztek megmaradtak, nem ismételtünk teljes kézi kört.

Két tényleges rést zártunk:

1. **Megszakított helyi törlés vagy vendégnapló-átvétel.** A kilépéskor kért „törlés erről a telefonról” eddig a fiók mentett példányát a váltás befejezése előtt törölte. Ha közben a tároló írása elakadt, a megmaradt napló később elveszhetett. A munkaterület-váltás most naplózza a váltás után végrehajtandó törlést; addig a forrás mentett példánya létezik. Újrainduláskor a félbemaradt váltás és a kért törlés befejezhető. Ugyanezzel a szabállyal a kifejezetten átvett vendégnapló régi vendégmásolata sem jelenik meg újra megszakítás után. Sérült, másik fiók törlését célzó helyreállítási naplót elutasítunk.
2. **Közösen hivatkozott helyi profilkép.** Ha két elkülönített napló ugyanazt a helyi képhivatkozást tartalmazza, az egyik fiók helyi törlése a másik képét is eltávolíthatta. A törlésre visszaadott képlistából most kimarad minden hivatkozás, amelyet a látható vagy bármely megőrzött munkaterület naplója/biztonsági mentése még használ. Sérült mentett állapotnál a képfájl törlését inkább kihagyjuk.

## Gépi bizonyíték

`src/accountWorkspace.test.ts`: 7 korábbi és 6 új teszt sikeres. Az új esetek: tárolási hiba a vendég mentése előtt; megszakítás a kilépés utáni aktív jelölőnél és a régi fiókmásolat eltávolításánál; megszakított vendégátvétel; sérült helyreállítási napló; két fiók azonos képhivatkozása. A hibák a javítás előtt célzottan reprodukálhatók voltak. Az account helyreállításának meglévő 10 próbája szintén sikeres.

Teljes `npm test`: **49 fájl, 612/612 PASS**. Frontend `npm run typecheck`: PASS. `npm run build -- --mode internal`: PASS. A build meglévő, 500 kB feletti csomagméret-figyelmeztetése nem buildhiba. A korábbi A04 teszt szándékosan injektált adatbázishibájának stderr sora elvárt; az érintett teszt is PASS.

## Kiadási határ

Most nem szükséges tulajdonosi tesztelés. Az A05 új javítása még nem került ki stagingre. A tényleges böngésző-/telefon-újratelepítés a helyi tárolót eltávolíthatja; helyi vendégnapló és fel nem töltött művelet megőrzését ilyen esetben nem ígérjük. A felhőben már meglévő családi adatok újracsatlakozása külön kiadási próba. A helyi képfájlok IndexedDB-törlése aszinkron: az accountadat helyi törlése és a képfájl eltávolítása közötti alkalmazásleállásból maradó árva kép külön adatkezelési auditpont, nem igazoltan rendezett ebben a gépi körben. A teljes A05 kiadási jelölő az azonosított build és a valódi telepített eszközös ellenőrzésig nyitott.

## Következő

**A06 — a fizetős családi szinkron hozzáférési korlátainak megmaradt ellenőrzése, gépi próbákkal. Javasolt modell: GPT-6 Astra · erős (high). Most nem szükséges tulajdonosi tesztelés.** A meglévő implementációból és regressziókból indulunk; az M1–M6 kézi eredmények nem ismétlendők.

GitHub Desktop Summary: `Make account workspace switching recoverable after interrupted deletion`
