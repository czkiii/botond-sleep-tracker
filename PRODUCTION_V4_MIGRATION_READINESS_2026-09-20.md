# Solemi production V4 migrációs előkészítés — 2026-09-20

## Állapot

A production D1 (`solemi-sleep-db`) csak olvasási ellenőrzése és teljes exportja megtörtént. A távoli adatbázis nem változott. A jelenlegi production séma V3: még nincs `children` tábla, és a `sleep_sessions` még nem tartalmaz `child_id` / `day_night_override` mezőt.

Az ellenőrzött `Opoczki-Klima` család állapota az export előtt és után egyaránt:

- family revision: **263**;
- aktív alvások: **102**;
- korábban törölt alvások: **8**.

Mivel a revision és a darabszámok nem változtak, az export időpontjában nem látszik közben érkezett családi módosítás.

## Privát helyi mentések

A fájlok a `.private-backups/production/` mappában vannak. A teljes mappa szerepel a `.gitignore` fájlban; production családi adatot tilos commitolni vagy pusholni.

| Fájl | Méret | SHA-256 |
|---|---:|---|
| `solemi-sleep-db-pre-v4-2026-09-20.sql` | 114906 byte | `EBE17A934C434B5403C9A99B482D6685B12980536EEA64DA15A77AE7F9BC5752` |
| `Opoczki-Klima-v4-2026-09-20.json` | 40355 byte | `7591780EA74F89F154D4CCFD19AD619D9054C30F15ADBCFDA6639E2CF10289FF` |

Az SQL a teljes production D1 pillanatfelvétele. A JSON külön, hordozható Solemi V4 mentés az `Opoczki-Klima` család aktív naplójáról. A már törölt 8 rekord az SQL-ben megmarad, az importálható JSON-ba helyesen nem került vissza.

## Offline migrációs bizonyíték

A teljes SQL-exportot memóriában visszatöltöttük, majd azon futott le a repository `worker/migrations/002_children_v4.sql` migrációja.

- 11 család és 113 összes adatbázis-szintű alvás feldolgozva;
- minden meglévő családhoz létrejött a stabil `child_legacy_<family-id>` gyermek;
- az eredeti alvások azonosítója, ideje, jegyzete, törlési állapota és revisionje változatlan;
- `families`, `devices`, `invite_codes` és `operations` teljes sorhash-e változatlan;
- hiányzó gyermekkapcsolat: 0;
- `PRAGMA foreign_key_check` hiba: 0;
- az `Opoczki-Klima` V4 JSON-ját a Solemi saját `inspectBackup` importellenőrzője javítás és diagnosztika nélkül elfogadta: 1 gyermek, 102 alvás.

Az ellenőrzés reprodukálható a `worker/scripts/prepare-production-v4-backup.mjs` szkripttel. A privát ellenőrzőteszt szintén Gitből kizárt fájl.

## Kritikus deploy-határ

Az új V4 Worker a `children` táblát és a `sleep_sessions.child_id` mezőt várja. A régi Worker viszont a migráció után már nem tudna új alvást létrehozni a kötelező `child_id` nélkül. Ezért a production migráció és Worker-váltás kontrollált karbantartási ablakot igényel; a `main` merge vagy az automatikus deploy nem előzheti meg ezt.

Biztonságos sorrend, külön tulajdonosi engedéllyel:

1. írások rövid leállítása vagy kontrollált karbantartási ablak;
2. közvetlenül előtte új teljes D1 export, SHA-256, családi revision- és rekordszámok;
3. kizárólag a `002_children_v4.sql` egyszeri alkalmazása — nem a teljes `schema.sql`, és nem a már alkalmazott `001` ismétlése;
4. `children`, `sleep_sessions`, gyermekkapcsolatok, aktív alvások és `foreign_key_check` ellenőrzése;
5. ugyanabban az ablakban az ellenőrzött V4 Worker deployja;
6. production smoke: meglévő napló lekérése, új alvás indítása/leállítása, második eszköz szinkronja;
7. csak ezután frontend/main kiadás.

Rollback esetén a régi Worker önmagában nem elég. A régi Worker és a migration előtti D1 export együtt állíthatja vissza a V3 állapotot; a restore destruktív művelet, külön engedélyt és előzetes staging főpróbát igényel. Elsődleges hibaút ezért a migráció utáni validáció és szükség esetén előre javítás.

## Korlát

Ez pillanatfelvétel. Ha a production napló tovább változik, a tényleges migráció előtt új export kötelező. A mostani SQL és V4 JSON vészhelyzeti biztosíték, nem engedély production migrációra vagy deployra.
