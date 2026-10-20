# Nyilvános mentések rendezése és merge-előkészítés

Állapot: **a helyi tisztítás és összevonási próba kész; a távoli előzménytisztítás és a valódi merge még nem történt meg.** Dátum: 2026-10-20. Kézi app-teszt nem szükséges.

## Elkészült

- A GitHubról külön teljes tükörmásolat, ellenőrzött Git-bundle és a négy érintett eredeti fájl külön másolata készült, a Gitből kizárt helyi munkaterületen. A mentések tartalma nem került új commitba vagy tesztadatba.
- Minden commit fájlfájának vizsgálata alapján négy mentési fájl érintett. Az érintett referenciák: `main` és a GitHub által képzett `refs/pull/3/merge`. A többi fejlesztési ág nem igényel átírást.
- Elkészült a szűk helyi tisztítás: a csak mentéseket hozzáadó `57357fd8c049bcd061f3154a299dafe4a5db7ec8` kiesik, a main célja a szülő `a529a640bd9158bda4e8fcf4024b518b77e1896a`. Az appkód bájtonként változatlan, a különbség pontosan négy mentési fájl törlése. Minden más branch SHA változatlan.
- A megtisztított ágakból elérhető történetben nulla `.private-backups/` fájl van. **Ez nem jelenti a GitHub PR-cache vagy az összes távoli/külső másolat eltávolítását.**
- A két SQL-pillanatfelvétel sértetlenségi ellenőrzése sikeres. A megvizsgált, kitöltött hitelesítési mezők hashértékeket tartalmaztak; ebből nem következik, hogy minden fájl minden mezője titokmentes. A személyes napló- és fiókadatok kitettsége ettől még rendezendő.
- Új `npm run check:repository` ellenőrzés védi a CI, az internal preview és a kézi Pages workflow-t a követett `.private-backups/` fájloktól. A régi main indexén helyesen hibázik, a tiszta feature indexén sikeres; privát fájlneveket/tartalmat nem ír a logba. A védelem a megnevezett könyvtárra szól, nem általános titokkereső.
- A teljes tesztet futtató internal preview és Pages workflow Node 24-re állt, összhangban a helyreállítási tesztek `node:sqlite.setAuthorizer` követelményével. A CI frontend már korábban is Node 24 volt.

## Összevonási próba és eredmény

Külön helyi klónban a `3509b3c1f614ec4e6f0caa606c2054ff6dff39da` feature HEAD és a megtisztított main összevonása történt, commit és push nélkül. Az egyetlen konfliktus a frontend lockfile volt; a jelenlegi `package.json`-hoz tartozó feature-lockfile maradt. A forrásalkalmazás és lockfile a feature verzióval azonos.

A tesztelt indexfához hozzáadtuk a fenti öt CI/script-módosítást. Azonosítója: `96f380021901d449c0f4a90bfbaa0d69eb3a9677` (**Git tree**, nem kiadási commit). A jelen checkpoint és a hozzá kapcsolt státuszdokumentáció később készült; ezek nem változtatják a tesztelt appkódot.

| Ellenőrzés | Eredmény |
|---|---|
| Tiszta frontend és Worker `npm ci` | PASS |
| Követett privát mentések a jelöltben | 0 |
| Frontend és Worker typecheck | PASS |
| Teljes gépi teszt | **65 fájl, 907/907 PASS** |
| Frontend build | PASS; meglévő nagy chunk figyelmeztetés |
| Staging Worker dry-run | PASS, nincs feltöltés |
| Frontend és Worker dependency audit | PASS, nulla sérülékenység |
| Git diff whitespace-ellenőrzés | PASS |

A frontend build az alap konfigurációval futott; ez **nem** a még létrehozandó új production erőforrások és kulcsok végleges buildje. A dry-run helyi azonosítót használt, nem állít kiadott commitot. A 195/195 naplóimport-próbát és az A17 staging-főpróbát nem ismételtük.

## Távoli végrehajtás: egy rövid, lezárandó lépés

1. **Kiadási kapcsolók:** a GitHub `Deploy to GitHub Pages` workflow azonosítója `339938895`, jelenleg aktív; a régi main pushra publikál. Ezt a main referencia változtatása előtt le kell tiltani, és a váltásig tiltva tartani. A már kiszolgált régi oldalt nem töröljük. A repository láthatóságát nem váltjuk át vakon: az a régi Pages elérhetőségét is érintheti.
2. **Egy konkrét hozzáférési hiány:** a Cloudflare Workers Builds triggerlekérdezése a legacy és staging Worker esetén is HTTP 403 / `10000` választ adott. Ez szolgáltatói jogosultsághiány, nem automatikus jóváhagyási elutasítás. A branch/deploy-kapcsolók a dashboardból vagy meglévő, megfelelő olvasási jogosultsággal még ellenőrizendők. Amíg nem igazolt, hogy a main-frissítés nem indít legacy Worker-kiadást, a távoli tisztítás nem indítható. Ehhez nem kell appban tesztelni.
3. **Tulajdonosi jóváhagyással, pontos referenciavédelemmel:** kizárólag main `57357fd… → a529a64…`. Nincs mirror-push, más ágak átírása, repository-láthatóság-váltás vagy adatbázis-művelet. Ha a távoli main időközben megváltozik, a művelet megáll. A privát végrehajtási lap tartalmazza a teljes SHA-kat és a konkrét parancsot.
4. **Utóellenőrzés:** main SHA, változatlan többi ág, régi Pages elérhetősége, nem indult legacy kiadás. A PR #3 merge-referenciáját és a korábbi commit/cache elérhetőségét külön ellenőrizzük. A GitHub által kezelt cache/ref eltávolítására szükség esetén GitHub Support-kérés kell; ennek piszkozata elkészült, elküldés nem történt.
5. **Valódi merge előtt:** a dokumentált main-védelem/kötelező frontend és Worker check, az aktuális feature commit zöld CI-je és a kiadási kapcsolók ellenőrzése marad. A mostani helyi próba nem jogosít automatikus merge-re vagy production kiadásra.

Az előzménytisztítás után a régi klónokból tilos visszapusholni a szennyezett main-t. A helyi munka megőrzése után friss klón vagy ellenőrzött referenciafrissítés szükséges. A régi mentési commitot visszaútként sem publikáljuk újra; az alkalmazáskód a tiszta mainen változatlan.

## Privát bizonyítékok és megőrzés

Munkakönyvtár: `worker/.private-backups/repository-cleanup-2026-10-19/`. Fontos fájlok: `before-cleanup.bundle`, `inventory.json`, `verification.json`, `merge-verification.json`, a `merge-*` gépi eredmények, `github-release-settings.json`, `cloudflare-triggers.json`, `REMOTE_EXECUTION.md` és `SUPPORT_DRAFT.md`. A választott tisztított klón **`cleaned-minimal.git`**; a korábbi teljes átírásos kísérlet nem kiadási forrás.

A bundle, az eredeti tükör és egyes másolatok személyes adatot tartalmaznak. A Git-ignore nem titkosítás; ezek nem kerülhetnek nyilvános megosztásba vagy CI-artifactba. A másolatok nem indítják újra az eredeti mentések megőrzési idejét. A szeptember 20-i pillanatfelvétel október 20-án eléri a 30 napot: a távoli rendezés lezárásakor az összes tartalmi másolat és Git-objektum selejtezését is rendezni kell, az eredeti kor alapján. További megőrzést nem minősítünk automatikusan jóváhagyottnak. A mentési határidő rendezése még nyitott; az integritási igazolás önmagában nem megőrzési jogcím.

Források a szolgáltatói eljáráshoz: [GitHub sensitive-data removal](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), [repository visibility és Pages](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), [Cloudflare Workers Builds trigger API](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/list/).

## GitHub Desktop

**Summary:** `Prepare safe backup-history cleanup and verify main merge`

**Description:** `Add a tracked-backup CI guard, align full-test workflows on Node 24, and document the verified local cleanup and merge rehearsal. 907 tests, both typechecks, build, Worker dry-run and dependency audits pass. Remote history cleanup, PR cache removal and actual merge remain pending.`

**Következő:** a Cloudflare kiadási kapcsolók hiányzó olvasási ellenőrzése, majd a konkrét main-előzménytisztítás jóváhagyott végrehajtása és a PR-cache rendezése. **GPT-6 Astra · erős; kézi app-teszt nem szükséges.** A kész helyi merge-próbát nem kell elölről kezdeni.
