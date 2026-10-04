# A06 — fizetős családi szinkron, megmaradt hozzáférési ellenőrzések

Dátum: 2026-10-04. Alap HEAD: `f24edd0` (`feat/child-profile-v4`). Feladatszint: GPT-6 Astra · erős (high). Helyi javítás és gépi ellenőrzés; commit, push, deploy és valódi családi adatváltoztatás nem történt.

## Eredmény

Az A06 kért helyi gépi része kész. A meglévő fizetős naplóvédelmet megtartottuk; két igazolt rést javítottunk:

1. A `GET /v1/device` és `POST /v1/device/leave` enforcement mellett eddig csak a régi családi eszköztokent ellenőrizte. Most ugyanúgy kötelező a hiteles account-session, a megfelelő account-eszköz és az aktív családtagsághoz tartozó eszköz-hozzárendelés. Másik fiók/eszköz vagy kilépett tag nem kérheti le és nem választhatja le az eszközt.
2. A családi API-n az érvénytelen vagy visszavont account-session hibája 500-as szerverhibává válhatott. Most szabályos `401 SESSION_INVALID` válasz érkezik. A váratlan belső hibákat továbbra sem fedjük el.

A tagságellenőrzés különvált a fizetős jogosultságtól: a saját eszköz lekérése és leválasztása Free csomaggal is lehetséges. A napló olvasása/írása és a meghívó továbbra is aktív családi `FAMILY_SYNC` jogosultságot igényel. Az enforcement nélküli régi működés kompatibilitását megtartottuk. Az accountos családmegszüntetés és adateltávolítás meglévő, Free mellett is elérhető adminszabályait nem szigorítottuk előfizetéssel.

## Gépi bizonyíték

`worker/tests/authRoutes.test.ts`: **58/58 PASS**, ebből **16 új A06-eset**, valamint a meglévő migrációs próba adatmegőrzési kiegészítése.

- Tíz állapot × tizenkét végpont: csak régi token; hiányzó/hibás/lejárt/visszavont session; visszavont account-eszköz; visszavont családi eszköz; másik account; másik account-eszköz; kilépett tag. Kontrollált 401/403 válasz, változatlan család, profil, alvás, művelet és meghívó; jogosulatlan leválasztás nincs.
- Free: mind a tíz napló-/meghívó-végpont `FAMILY_SYNC_PAUSED`; saját eszköz lekérése és leválasztása sikeres, napló megmarad.
- Jogosultság: kezdőpillanatban érvényes, lejárati pillanatban már nem; jövőbeli vagy visszavont grant, illetve csak más funkcióra szóló jog nem enged szinkront.
- Régi, nem üres család claimje: Free mellett is hozzárendelhető, de a hozzárendelés nem ad fizetős hozzáférést. A profil, aktív alvás, jegyzet és revízió változatlan; Family jogosultság után ugyanazok az adatok letölthetők.
- A meglévő accountos létrehozás/join, fizető családtag kilépése, családmegszüntetés, proxy és kliensregressziók is sikeresek.

Teljes `npm test`: **49 fájl, 628/628 PASS**. Frontend és Worker typecheck: PASS. Internal build: PASS. A meglévő 500 kB feletti frontendcsomag-figyelmeztetés megmaradt. Az A04 szándékosan injektált visszavonási hibájának stderr sora elvárt, az érintett visszagörgetési teszt PASS.

## Kiadási határ és folytatás

Most nem szükséges tulajdonosi tesztelés. Ez helyi Worker–SQLite gépi bizonyíték, nem távoli D1-, store-vásárlási vagy telefonos elfogadás. A jogosultsági próbák helyi tesztgrantokat használnak; a valódi fizetési bekötés külön feladat. Az A06 kiadási jelölő az azonosított új build és környezeti ellenőrzésig nyitott. A korábbi M1–M6 kézi körök nem ismétlendők.

**Következő: A16 — az offline fizetős hozzáférés és a belépési munkamenet frissítésének megmaradt esetei, gépi próbákkal. Javasolt modell: GPT-6 Sol · erős (high). Most nem szükséges tulajdonosi tesztelés.** A meglévő megoldásból és próbákból indulunk; a valódi harmadik eszközös/telefonos elfogadás későbbi kapu.

GitHub Desktop Summary: `Enforce account membership on family device access and handle invalid sessions`
