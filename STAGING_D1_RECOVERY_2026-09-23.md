# Staging D1 mentési és visszaállítási checkpoint — 2026-09-23

## Elvégzett, csak olvasási ellenőrzés

- Cél: `solemi-sleep-db-staging`, a `feat/child-profile-v4` ág `b08cd41` commitja mellett.
- A Wrangler OAuth-belépés megújult. A D1-info és az aktuális Time Travel könyvjelző lekérdezése sikeres volt.
- Teljes távoli SQL-export készült a Gitből kizárt `.private-backups/staging-d1-2026-09-23-a25.sql` fájlba. Méret: 1 513 128 bájt; SHA-256: `707138AF8BCA98D8CB87D42C5F7B288D4725E92545C21493535DBBFEC60E0F2F`.
- A teljes SQL-export helyi, memóriabeli SQLite adatbázisba betölthető. Az ellenőrző szkript hat alapvető tábla sorait és hashét kiszámította; `PRAGMA foreign_key_check`: 0 hiba; `PRAGMA integrity_check`: `ok`.
- Az exportban a vizsgált családhoz 1 aktív gyermekprofil és 1799 aktív alvás tartozik. Az adatbázis egészében 37 család szerepel.

Az SQL-fájl fiók- és családi adatokat tartalmaz. Nem kerülhet commitba, issue-ba vagy képernyőképre; a `.private-backups/` szerepel a `.gitignore` fájlban.

## Mit nem igazol ez

Nem történt távoli D1 restore, így a Cloudflare oldali visszaállítás gyakorlati menete és a Worker alkalmazás utáni ellenőrzése még nyitott. A Time Travel az egész D1 adatbázist egy korábbi állapotra állítaná vissza, ezért az egyetlen család törléses próbájának hibakezelésére nem használható úgy, hogy közben más staging családok változásai megmaradjanak.

A jelenlegi család 1799 alvásos exportjának UI-s visszaimportja külön szinkronműveleteket képez, nem atomi szerveres rollback. A tényleges családi törlést ezért egy kis, elkülönített staging tesztcsaládon kell végigpróbálni. Az admin/tagszerep, a családnév-megerősítés, a két böngészős törlési hatás és az exportból történő újraimport ott külön elfogadási lépések. A meglévő család 1799 aktív alvását a 2026-09-23-i próbák végén mindkét böngésző egyezően mutatta; a távoli adatbázis nem módosult ebben a mentési ellenőrzésben.

## Tesztfiókok és a visszaút korlátja

**Későbbi, helyi fejlesztési kiegészítés:** a lent leírt hiányzó megszüntetési út helyben elkészült, automatizált ellenőrzése sikeres. Commit/push és a staging build elfogadása még szükséges; az új, kis tesztcsaládos próba menetét a [FAMILY_DISSOLUTION_CHECKPOINT_2026-09-23.md](FAMILY_DISSOLUTION_CHECKPOINT_2026-09-23.md) rögzíti. Az alábbi bekezdés a mentés készítésekor fennálló korlátot dokumentálja.

A két jelenlegi tesztfiók egyikének átvitele egy új családba csak akkor jó próba, ha a visszaút is kész: az utolsó aktív családtag jelenleg `FAMILY_DISSOLUTION_REQUIRED` hibával nem tud kilépni, és a külön családmegszüntetési felület még nincs kész. Egy egyfiókos tesztcsalád létrehozása ezért átmenetileg ott ragaszthatja a fiókot. Az Opo családban maradó Free-tag szinkronja ráadásul szünetelhet, ha az utolsó fizető kilép. A két meglévő fiókot ne mozgassuk át erre a próbára addig, amíg a tesztcsalád megszüntetésének és az Opo családba visszacsatlakozásnak a teljes útja nincs rendezve, vagy nincs külön, erre fenntartott tesztfiók.

Az offline fájlimport nem szerveroldali visszagörgetés. A meglévő Opo-exportot nem szabad az elkülönített tesztcsaládba importálni, mert az 1799 meglévő bejegyzést oda is feltöltheti.
