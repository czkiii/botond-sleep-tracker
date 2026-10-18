# A17 — elkülönített Cloudflare bekötési és helyreállítási főpróba

Dátum: 2026-10-18. Előzmény: [konkrét végrehajtási csomag](A17_STAGING_REHEARSAL_PREPARATION_2026-10-17.md).

**Állapot: PASS — az elkülönített bekötési/helyreállítási főpróba lezárva.** A visszatöltés, a hozzáférési ellenőrzések és az újraindított valódi ütemező igazoltak. 2026-10-18 17:42:12 UTC-kor a próba végpontja és cronja kikapcsolva, a Worker maintenance-zárja aktív, a restore-job lezárva. A teljes A17 kiadási kapu ettől még nyitott a lent felsorolt közös környezeti/üzemeltetési feltételekig.

## Végrehajtott terjedelem

A tulajdonos engedélyezte az elkülönített környezet létrehozását és a gépi főpróbát. Kizárólag mesterséges account-, család-, napló- és store-adatot használtunk. A műveletek célját a vezérlő konkrét Worker-névre és három adatbázis-UUID-ra korlátozta.

| Erőforrás | Név | Azonosító |
|---|---|---|
| Worker | `solemi-sleep-a17-rehearsal-staging` | Saját workers.dev végpont, csak a HTTP-próba idejére |
| Forrás D1 | `solemi-a17-rehearsal-source` | `1ad974d7-6fa4-4d1d-8903-46210b875881` |
| Független journal D1 | `solemi-a17-rehearsal-journal` | `5dc70e65-32e0-4678-8c6f-086fa83a9ac9` |
| Visszaállított D1 | `solemi-a17-rehearsal-restore` | `dfa60add-de87-478b-8466-d9d7d1e19452` |

A telepített Worker mindkét bindinggal a teljes **`c81e1766ea2310c52a6c070eaa1b0ae07f1d2930`** commitot futtatta. A próba során feltárt javítások offline helyreállítási eszközöket érintenek; a Worker futó forrása és függőségei nem változtak. A végső lezáró telepítés ezt a commithoz külön ellenőrzi akkor is, ha az offline javítások már a munkafában vannak.

A közös `solemi-sleep-sync-staging`, a production Worker és adatbázisaik nem voltak írási célok. Nem történt main-merge, valódi felhasználói migráció vagy közös staging aktiválás. A három próbaadatbázis külön marad; a journal soha nem kapott régi mentést. A `DB` binding váltott forrásról célra, a `DELETION_SOURCE_DATABASE_ID` továbbra is az eredeti forrás-UUID.

## Bizonyított viselkedés

| Ellenőrzés | Eredmény / bizonyíték |
|---|---|
| Tényleges ütemezett törlés a forráson | 2026-10-17 21:15:25.332 UTC: egy kérelem feldolgozva, nulla hibás és nulla hátralévő; `erase-b` véglegesítve |
| Régi mentés + új üzleti előzmények | A kiválasztott régi napló `Original rehearsal diary` bejegyzése került vissza; a későbbi négy trial, refund és tokenreplacement megmaradt |
| Távoli visszatöltés | Minden alkalmazástábla összes sora egyezik a helyben előkészített kimenettel; idegenkulcs-ellenőrzés sikeres |
| Független nyilvántartás | A journal teljes exportjának hash-e nem változott a restore importja alatt |
| Régi hitelesítő | A régi, visszavont munkamenetre kiállított frissen aláírt teszt-JWT: HTTP 401 |
| Új munkamenet | Külön létrehozott szintetikus eszköz/munkamenet: HTTP 200 |
| Refund után hozzáférés | Az account feature-listája üres; a régi fizetős grant nem éledt fel |
| Ötödik családi trial | HTTP 409, `TRIAL_FAMILY_LIMIT` |
| Törölt account újraregisztrációja azonos Google-subjecttel | Új szintetikus account, ugyanaz a korábbi belépési subject: HTTP 409, `TRIAL_ACCOUNT_USED` |
| Törlés megőrzése | A régi `b` account `DELETED`, belépési identitása nincs; a független trialjelölés érvényes |
| Visszaállítás utáni valódi ütemezés | 2026-10-18 17:41:00.760 UTC: a journalban létrejött az eredeti `erase-b` kérelem `deletion_completion` sora; tényleges `retention_maintenance` naplóesemény, nincs manuális handler-indítás |
| Végső fagyasztás | `RESTORE_MAINTENANCE=true`, üres cronlista, workers.dev és preview kikapcsolva; a `restore_jobs/a17-rehearsal` lezárva, teljes evidence státusz `PASS` |

A hozzáférési eredmények ideje: 2026-10-18 17:31:07–17:31:10 UTC. A megszakadt vezérlő újraindításakor kizárólag a próba-Worker `AUTH_SECRET` kulcsa változott, a friss szintetikus JWT-khez. A `TRIAL_IDENTITY_SECRET` és a hozzá kötött program/marker változatlan maradt. A régi sessionre szóló JWT az új, érvényes kulccsal készült: a 401 nem egy elavult aláírókulcs következménye.

Az ütemezés visszakapcsolása 17:31:07 UTC, az első igazolt retention completion 17:41:00.760 UTC. A konfiguráció jelenlétét nem számítottuk sikeres futásnak. A Cloudflare dokumentációja szerint a cronváltozások terjedése akár 15 perc lehet; ezért a futás saját adatbázis- és naplóbizonyítékát vártuk meg. [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Ez közvetlen Worker/D1/journal és jogosultsági bizonyíték. Nem valódi Google OAuth-belépés, nem frontend–proxy próba, nem valódi bolti vásárlás, nem telefonos elfogadás. A régi napló helyreállítása a korábban dokumentált kompatibilis account-/családi körön belül történt; eltérő kapcsolatok automatikus összemosását továbbra is tiltjuk.

## A főpróbán talált és javított három hiba

1. **Cloudflare-export betöltése:** az export adatokat helyezhet el a hivatkozott egyedi index létrehozása előtt. Az offline memóriabeli betöltés alatt kikapcsoljuk az FK-ellenőrzést, majd kötelezően visszakapcsoljuk és teljes FK-ellenőrzést végzünk. Hibás referencia vagy nyitva hagyott tranzakció esetén nincs elfogadott kimenet. Mind a törlési, mind az üzleti restore ezt használja.
2. **Eredeti törlési kérelem megőrzése:** az erasure replay korábban új helyi kérésazonosítót képezhetett. A restore-eszköz most visszaállítja a journal eredeti ID-ját, módját és időpontjait, így a későbbi retention ugyanazt a kérelmet tudja lezártként igazolni. A korábban meglévő történeti sorokat nem törli. Gépi regresszió igazolja a completion-bejegyzést és az ismételt előkészítés változatlanságát.
3. **D1-import:** az általános offline SQL nem közvetlen D1-bemenet. A `prepare-d1-restore.mjs` hash-egyező üzleti riportot kér, szülőtábla → egyedi index → adat → trigger/view sorrendben ír új SQL-t, majd FK-val és tartalmi egyezéssel ellenőrzi. A korábbi két távoli import `D1_RESET_DO` hibával megállt; a cél ürességét minden ismétlés előtt ellenőriztük. A függőségi sorrenddel az import és az összes sor összevetése sikeres lett. Az ismert köztes hibák nem minősülnek sikeres futásnak.

A D1 adapter nem végez hálózati műveletet, nem telepít és nem nyit forgalmat. Kereszttáblás ciklus, journal-adatbázis vagy még blokkolt üzleti állapot esetén megáll. [Cloudflare D1 import/export dokumentáció](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Gépi ellenőrzés

- `npm run test:recovery`: **106/106**, 7 fájl.
- Teljes `npm test`: **906/906**, 65 fájl.
- Frontend és Worker típusellenőrzés: **PASS**.
- A végleges, követett D1 adapter a valódi próbaexportból bájtra ugyanazt az SQL-t állította elő, mint a sikeres távoli import: SHA-256 `d48a0810a2bc45fa38569d09fe070c2a066acceb9046beeac94aa041a4e5eaf0`.
- Az egyeztetett köztes SQL SHA-256: `c79074feee689cad7e49f63a7774775d531e1ed11484b4b53adb61200b70d839`.
- A tényleges adapter-CLI meglévő kimenetre ismételve elutasította a felülírást; a fájl hash-e változatlan maradt.

## Bizonyítékok és lezárás

A részletes helyi bizonyítékok Gitből kizárt könyvtára: `worker/.private-backups/a17-live-2026-10-17/`. Az `evidence.json` tartalmazza a műveletek idejét, céljait és ellenőrzéseit; az SQL-ek mesterséges adatot tartalmaznak. A titkos kulcsok nem kerültek a jegyzőkönyvbe vagy a Gitbe. A karbantartási naplóból csak kiválasztott eseménysorokat mentünk.

A végső telepítés ismét ellenőrizte a commitot, a Worker forrását és függőségeit, majd a távoli bindingokat, üres cronlistát és kikapcsolt végpontot. A három D1 megmaradt a bizonyítékhoz; automatikus próbamunka nem maradt bekapcsolva. A követett javítások és ez a jegyzőkönyv még helyi módosítások, commit/push nem történt.

A próbaerőforrások későbbi törlése név/UUID alapján külön takarítás. A helyi próbaexportok és a szolgáltatói másolatok megőrzését a jóváhagyott legfeljebb 30 napos szabály szerint kell kezelni; ez a főpróba önmagában nem igazolja az összes szolgáltatói napló- és mentési beállítást.

**Következő határ:** a közös staging A17 bekötése mentéssel, 011–013 migrációkkal, külön journal/kulcs/ütemező beállításával és célzott gépi ellenőrzéssel. Ez már a kiadási környezet bekötési munkája; nem ismételjük meg az elkészült helyi fejlesztést. A teljes A17 kiadási kapuhoz a tényleges mentés-/logüzemeltetés, jogi/bizonylati véglegesítés és a kapcsolódó store-feladatok is megmaradnak.

Javasolt: **GPT-6 Astra · erős (high)**. Kézi app-teszt ehhez a következő bekötési blokkhoz nem szükséges; a közös staging távoli módosítása külön következő feladat.
