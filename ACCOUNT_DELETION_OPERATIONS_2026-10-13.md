# A17 — törlési nyilvántartás, ütemezés és visszaállítás

Elkezdve: 2026-10-13; helyi lezárás: 2026-10-14 · GPT-6 Astra, erős · kiinduló commit: `ae8d1db`.

## Státusz

**Újabb döntési checkpoint:** a megőrzési idők és az újraregisztrációs trialszabály 2026-10-14-én [tulajdonosi jóváhagyást kapott](A17_RETENTION_DECISIONS_2026-10-14.md). A lenti korábbi döntési nyitottságot ez felülírja. A technikai érvényesítés és a távoli aktiválás még nyitott.

Az üzemeltetési **helyi előkészítés elkészült**: külön D1-nyilvántartás adaptere és sémája, megszakításbiztos véglegesítési/helyreállítási döntés, korlátozott ütemezett feldolgozó, konfiguráció-előkészítő, offline mentés-helyreállító és gépi próbák. Távoli adatbázist, cron-feladatot vagy funkciót nem hoztunk létre és nem kapcsoltunk be. Commit/push/deploy nem történt.

Ez a dokumentum az előző [A17 checkpoint](ACCOUNT_DELETION_CHECKPOINT_2026-10-13.md) üzemeltetési hiányait viszi tovább. A végleges megőrzési idők, a törlés utáni újraregisztráció trial-kezelése és az Apple/store-integráció továbbra is külön nyitott feltétel. Kézi felhasználói teszt most nem szükséges.

## A működő helyi megoldás

- A fő adatbázis `012_deletion_resolution.sql` migrációja rögzíti, hogy egy törlési kérés végleges törlésre vagy helyreállításra lett lefoglalva. A két döntés nem nyerhet egyszerre. A határidő előtt lefoglalt helyreállítást egy infrastruktúra-hiba nem változtatja utólag törléssé.
- A **külön** adatbázis sémája: `worker/erasure-journal/schema.sql`. `ERASURE_JOURNAL` kötés; a `journal_identity` a környezetet és az eredeti naplóadatbázis azonosítóját ellenőrzi. E-mailt, Google-azonosítót, gyermeknevet, alvásnaplót, tokent nem tárol; a technikai azonosítók ettől még korlátozott célú, nem teljesen anonim adatok.
- A nyilvántartás export/import után is megmaradó, explicit sorszámmal tárolja a kérések sorrendjét. A PENDING kérést és annak ERASE/RESTORE döntését őrzi. Végleges adateltávolítás vagy fiók-újraaktiválás előtt a döntésnek sikeresen bele kell kerülnie. Az elfogadott törlési kérés külső rögzítés nélkül nem kap sikeres választ. Átmeneti hibánál a már hozzáférhetetlenné tett kérés megmarad, az ütemező folytatja.
- A végleges döntés módosítását és a nyilvántartás sorainak törlését adatbázis-trigger tiltja. Ez működési védelem, nem helyettesít hozzáférés-szabályozást vagy katasztrófa elleni mentést. A majdani megőrzési politika szerinti lejáratás külön, kontrollált változtatást igényel; nem állítunk korlátlan jogszerű megőrzést.
- A külön adatbázist **nem szabad a naplóadatbázissal együtt régebbi állapotra visszaállítani**. A normál naplóban lévő régi `erasure_receipts` csak kiegészítő nyugta.
- Az ütemező külön `ACCOUNT_DELETION_MAINTENANCE` kapcsolót kapott: az új törlések felületi leállítása nem állítja le a már elfogadottak feldolgozását. Új kérés nem fogadható, ha ez a kapcsoló nincs bekapcsolva.
- Egy futás legfeljebb **egy fiókműveletet**, továbbá legfeljebb 50 lejárt sessiont és 50 lejárt belépési kihívást takarít. Hibánál az érintett kérés 15 perc múlva próbálható újra; a következő futások más kéréssel haladhatnak. A korábbi `purgeDue` segéd nem az éles ütemező belépési pontja.
- A `deletion_maintenance_runs` csak a legutóbbi futás összesített állapotát tartja. A Worker naplója darabszámot/időpontot ír, hibás fiókazonosítót, SQL-hibaszöveget vagy naplótartalmat nem. Sikertelen fiókműveletnél a scheduled futás hibával zárul, hogy megfigyelhető legyen.

## Ütemezési konfiguráció előkészítése

A következő parancs **csak új helyi konfigurációs fájlt készít**; nem hoz létre erőforrást és nem telepít. A külön, megfelelő környezetű journal-adatbázis valódi UUID-jét kell megadni. A kimenet maradjon az eredeti konfiguráció könyvtárában a relatív utak miatt.

```powershell
node worker/scripts/prepare-deletion-config.mjs worker/wrangler.staging.jsonc <journal-adatbazis-uuid> worker/wrangler.deletion-candidate.jsonc
```

A generált konfiguráció:

- külön adatbázis-kötést és `DELETION_SOURCE_DATABASE_ID` értéket tartalmaz;
- `*/5 * * * *` ütemezést állít elő;
- az új kérések és az automatikus feldolgozás kapcsolóját is **false** értéken hagyja;
- azonos fő/journal adatbázis-azonosítót elutasít, meglévő fájlt nem ír felül.

Az ötperces ütemezés UTC szerint fut. A Cloudflare szerint a cron-konfiguráció változásának terjedése akár 15 perc is lehet; ezért a kiadási ellenőrzésnek tényleges futási bizonyítékot kell megvárnia. [Cron-dokumentáció](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

A konzervatív, egyfiókos feldolgozás a Free környezet miatt szándékos. A D1 Free kerete hívásonként 50 lekérdezés; a gépi próba az azonnali törlés szolgáltatását és egy teljes karbantartást külön-külön legfeljebb 44 SQL-utasításra ellenőrzi, a batch tagjait külön számítva. A hitelesítés egy további SQL-olvasást használ. Ez lekérdezésszám-próba, nem távoli CPU-/nagyadat-terhelési mérés. [D1-korlátok](https://developers.cloudflare.com/d1/platform/limits/)

## Bekapcsolási sorrend — még nem végrehajtva

1. A trial/retention döntések rendezése. A fiókexport és törlési szövegek maradjanak összhangban az elfogadott szabállyal.
2. Teljes, ellenőrzött mentés; stagingen külön journal-D1 létrehozása. A journal sémája csak oda kerülhet, 011 és 012 csak a naplóadatbázisba. Production és staging külön journal. Ha korábbi végleges törlés már létezne, annak hiányzó külső nyilvántartását aktiválás előtt kontrolláltan rendezni kell; az ütemező nem feltételezi, hogy azt visszamenőleg automatikusan pótolta.
3. `journal_identity` egyszeri feltöltése a tényleges környezettel és az eredeti napló-D1 UUID-jével. Példa szerkezet, nem végrehajtott parancs:

```sql
INSERT INTO journal_identity (id, environment, source_database_id)
VALUES (1, 'staging', '<eredeti-naplo-D1-uuid>');
```

4. Az előállított konfiguráció áttekintése, mentési és hozzáférési szabályok beállítása mindkét D1-hez, majd külön jóváhagyott staging kiadás. A journal ne szerepeljen a napló adatbázisának rollback-céljai között.
5. A karbantartás bekapcsolása, tényleges scheduled-futás és adatbázis-nyugta ellenőrzése. Előbb kis szintetikus fiókkal: PENDING, RESTORE, ERASE, hiba/újrapróbálás, elkülönített restore. Valódi családi naplóval nem kell újra eljátszani a törlési teszteket.
6. Csak ezután `ACCOUNT_DELETION_ENABLED=true` és a megfelelő frontend `VITE_ACCOUNT_DELETION=true`; publikus webes oldal, működő recovery és megfigyelés együtt.

Figyelési minimum: hibaesemény/sikertelen scheduled futás, 15 percnél régebbi utolsó sikeres ellenőrzés, növekvő `due_remaining`, illetve 15 percnél régebbi esedékes tétel. Ezek induló üzemeltetési riasztási küszöbök, nem termékígéretek. A riasztás tényleges célja/címzettje és a Cloudflare-megfigyelés távoli beállítása még nincs létrehozva.

A 30 napos helyreállítás lejárata nem hosszabbodik meg. A fizikai törlés a következő sikeres futásban történik: az ötperces ritmus, torlódás vagy szolgáltatói kiesés késést okozhat. Egyfiókos futással legfeljebb 288 ütemezett fiókművelet/nap az elméleti kapacitás. Növekvő sor esetén a kapacitást/gyakoriságot igazoltan módosítani kell; ezt a tájékoztatásban és a végleges retention-szabályban nem szabad „pontosan a 30. nap milliszekundumában törlünk” ígéretként feltüntetni.

## Régi mentés visszaállítása

**Soha ne töltsük rá közvetlenül a forgalmat egy régi mentésre.** Ez az eljárás jelenleg helyben tesztelt előkészítő; távoli főpróba és tényleges visszaállítás nem történt.

1. A kiszolgáló `RESTORE_MAINTENANCE=true` állapota 503-mal lezárja az HTTP-hozzáférést és kihagyja az ütemezett módosításokat. Állítsuk le az egyéb admin/billing írókat is, és ellenőrizzük a már futó kérések/munkák befejeződését. A flag nem szakítja meg varázsütésre a korábban indult futásokat.
2. Ekkor exportáljuk a **friss külön journal-adatbázist**, és őrizzük meg változatlanul, hozzáférés-korlátozással. Az export teljességét/frissességét a forrás környezetében is ellenőrizni kell; a helyi eszköz nem tudja bizonyítani, hogy az operátor valóban a legújabb távoli exportot adta át.
3. A kiválasztott régi naplómentés egy izolált másolatán alkalmazzuk a szükséges migrációkat 012-ig. A program szándékosan megáll régi/hiányos sémán; nem találgat migrációs állapotot. A journal a régi naplómentéstől független marad.
4. A repo gyökeréből, Node **24.10 vagy újabb** és telepített Worker-függőségek mellett:

```powershell
node worker/scripts/prepare-deletion-restore.mjs .private-backups/diary-current-schema.sql .private-backups/journal-frozen.sql staging <eredeti-naplo-D1-uuid> .private-backups/restore-prepared.sql --traffic-frozen
```

A program csak memóriabeli SQLite-másolatokat módosít. A SQLite-engedélyező tiltja az ATTACH/DETACH műveletet, a fájlba exportáló VACUUM-ot és a nem engedélyezett PRAGMA utasításokat. A helyi eszköz és a teljes teszt-CI Node 24-et használ; a külön Worker CI Node 22-n marad. Külső hálózatot nem használ, távoli adatot nem ír, forrásfájlt és meglévő kimenetet nem ír felül. A `--traffic-frozen` az operátor állításának rögzítése, nem automatikus távoli ellenőrzés.

5. Az ERASE rendelkezéseket újra érvényesíti; az érvényes PENDING eredeti határidejét és inaktív állapotát megőrzi; a RESTORE döntést érvényesíti. A legújabb kérés számít accountonként. Eltérő családi hatókör, hiányos nyilvántartás, fel nem oldott lejárt kérés vagy ellentmondó állapot esetén megáll; nem ír ki átadható eredményt. Az ilyen esetet izoláltan kell egyeztetni, a hibát nem szabad kapcsolóval megkerülni.
6. Minden régi session és legacy eszközhozzáférés visszavonódik, meghívók és belépési kihívások törlődnek. A helyreállítás nem állítja vissza a régi belépési jogosultságokat. Érintett felhasználók friss bejelentkezése/újracsatlakozása szükséges lehet.
7. Az új SQL mellé `.report.json` készül: környezet, eredeti adatbázis, bemeneti/kimeneti SHA-256, darabszámok; nincs naplótartalom. Csak a teljes SQL + jelentés pár tekinthető elkészült előkészítésnek. Félbeszakadt párt ne alkalmazzunk; új kimeneti névvel ismételjük.
Az eszköz a törlési döntések visszaállítási rétegét kezeli, nem teljes üzleti katasztrófa-helyreállító: a mentés után létrejött trial-/számlázási előzményeket nem tudja a törlési journalból rekonstruálni. A teljes visszaállítás előtt ezek friss forrásból történő egyeztetése kötelező; enélkül nem nyitható vissza a hozzáférés, mert egy régi mentés új próbajogot eredményezhetne. Ez a távoli restore-főpróba nyitott ellenőrzése.

8. Üres, elkülönített cél-D1-be töltsük vissza, ellenőrizzük az integritást, a nyilvántartás egyezését, a trialelőzményeket, az érintetlen családokat és a visszavont belépéseket. Új cél-D1 UUID esetén a **logikai eredeti** `DELETION_SOURCE_DATABASE_ID` és a journal identity változatlanul az eredeti adatállományt azonosítja; a DB-kötés fizikai célját külön kell ellenőrizni. A konfiguráció-generátor normál friss környezetre készül, helyreállított adatállomány költöztetésekor ezt tudatosan kell egyeztetni.
9. Csak friss, teljes journal-egyeztetés és sikeres izolált ellenőrzés után nyitható vissza a forgalom/ütemező. A journal-adatbázist nem állítjuk vissza a régi napló időpontjára. Ha a journal hiányzik vagy sérült, a régi napló nem minősíthető kiadhatónak pusztán attól, hogy az SQL-import sikerült.

## Gépi ellenőrzés

**2026-10-14: 60 fájl / 841 teszt PASS; ebből 42 célzott törlési/restore próba. Frontend és Worker typecheck, frontend build, staging Worker dry-run PASS (184,28 KiB; gzip 37,16 KiB).** A frontend build a meglévő nagy chunkokra figyelmeztet, de sikeres. A külön journal/cron konfiguráció korábbi dry-runja szintén sikeres. A külön konfiguráció dry-runjához szándékosan szintetikus journal-UUID szerepelt; erőforrás nem jött létre. A sémák és tranzakciók valódi helyi SQLite-on, a CLI külön Node-folyamatban vizsgálva.

Célzott próbák: journal-kiesés mindkét döntésnél, késői újrapróbálás, ütköző döntések, változtathatatlan terminal rekord, rossz környezet, egy hibás tétel utáni továbbhaladás, bounded session/challenge takarítás, régi mentés három állapotának visszajátszása, változott család/hiányzó tulajdonos/hiányos journal tiltása, ismételt restore, CLI-felülírás és SQL fájlhozzáférés tiltása, exportsorrendtől független kérésrend, nullbájtos szöveg megőrzése, lekérdezésszám-határ, maintenance HTTP/cron védelem.

## Folytatás és GitHub Desktop

Az itt eredetileg következőként jelölt termékegyeztetés [elkészült](A17_RETENTION_DECISIONS_2026-10-14.md). **Következő: A17 — a jóváhagyott trialjelölés és megőrzési határidők technikai érvényesítése. GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** Ezután jöhet a külön jóváhagyott staging bekötés és gépi üzemeltetési főpróba. Apple/store és teljes kiadási kapu megmarad.

Summary: `Prepare independent deletion journal and safe backup recovery`

Description: Add an independent D1 deletion journal, durable erase/restore decisions, bounded scheduled maintenance with retry and status evidence, disabled configuration generation and an offline journal-aware restore tool. Cover interrupted writes, races, old backups, credential revocation and Free-plan query limits. Remote resources and feature activation remain unchanged.
