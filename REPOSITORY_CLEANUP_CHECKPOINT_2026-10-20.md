# Nyilvános mentések rendezése és merge-előkészítés

Állapot, 2026-10-21: **a jóváhagyott távoli main-tisztítás és a helyi referencia-egyeztetés kész; a GitHub PR-cache eltávolítása még nyitott. Valódi merge nem történt.** Kézi app-teszt nem szükséges.

## Távoli végrehajtás eredménye — 2026-10-20–21

A tulajdonos „rendben csináld :)” jóváhagyása után a GitHub Pages automatikus kiadási workflow-ját letiltottuk; nem maradt aktív kiadási futás. A kizárólag main-re korlátozott, pontos régi SHA-t ellenőrző push sikeres: **57357fd → a529a64**. A többi távoli ág változatlan.

Október 21-i friss utóellenőrzés:

- Friss távoli tükörben **7 ág, 0 privát mentési path és 0 eredeti mentési blob** az ágak/tag-ek elérhető történetében.
- A kiszolgált régi Pages HTML HTTP 200, SHA-256 azonos a tisztítás előttivel; a workflow továbbra is disabled_manually.
- A régi solemi-sleep-sync Worker módosítási ideje változatlan: 2026-08-24T22:07:51.161377Z. Cloudflare DB-műveletet vagy deployt nem végeztünk.
- A fő munkakönyvtár main és origin/main hivatkozása egyaránt a529a64. Az inaktív helyi main pontos régi SHA ellenőrzésével lett átállítva; a feature ág és a helyi dokumentáció megmaradt. A régi állapot a privát visszaállítási csomagban és helyi Git-objektumokban még megvan, nincs teljes helyi adattörlésnek állítva.
- **Nyitott:** refs/pull/3/merge továbbra is a 4d0645b7d8135b712f169957f0540a9a19371106 commitra mutat, amelynek őse a mentési commit. Ezért a teljes nyilvános eltávolítás még nem igazolt. A frissített, beküldésre kész Support-szöveg privát SUPPORT_DRAFT.md fájlban van; elküldéshez külön felhasználói felhatalmazás szükséges.

Az előző körben a helyi fetch művelet automatikus jóváhagyás-ellenőrzése használati korlát miatt megszakadt; az a parancs nem hajtódott végre. Október 21-én a megengedett ellenőrzés és referenciafrissítés sikeresen lefutott. Nem kellett a távoli push-t vagy a 907 tesztet megismételni.

Bizonyítékok a privát munkakönyvtárban: remote-execution.json, post-cleanup-verification.json és legacy-worker-postcheck.json. A main megtisztítása nem az új app kiadása és nem PR-merge. A korábbi, alábbi végrehajtási lista most már eljárásleírás; az aktuális nyitott pont a PR-cache és a mentési másolatok megőrzésének rendezése.

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

**Tulajdonosi képi ellenőrzés, 2026-10-20:** a legacy `solemi-sleep-sync` Settings / Builds részében a Git repository mellett **Connect** látszik: nincs csatlakoztatott Workers Builds repository. A staging képen a repository `czkiii/botond-sleep-tracker`, Production branch `feat/child-profile-v4`, Disable builds kikapcsolva, Build command nincs, Deploy command `npm run deploy:staging`, Root directory `/worker`. A staging a külön `wrangler.staging.jsonc` fájlt választó meglévő wrapperrel készül; a dashboard alapértelmezett `worker/wrangler.jsonc` névfigyelmeztetése miatt ezt nem írjuk át. A **Previews Base** képen a **Builds for Preview branches** kapcsoló kikapcsolva. A megjelenített preview parancs `npx wrangler preview`, root `/worker`; kikapcsolt preview mellett nem indul ettől main-build. A buildváltozók/titkok listája üres; ez nem a Worker futásidejű titkainak listája. A Workers Builds képi ellenőrzése ezzel teljes. Távoli beállítást nem módosítottunk.

1. **Kiadási kapcsolók:** a GitHub `Deploy to GitHub Pages` workflow azonosítója `339938895`, jelenleg aktív; a régi main pushra publikál. Ezt a main referencia változtatása előtt le kell tiltani, és a váltásig tiltva tartani. A már kiszolgált régi oldalt nem töröljük. A repository láthatóságát nem váltjuk át vakon: az a régi Pages elérhetőségét is érintheti.
2. **API-hozzáférési hiány és képi pótlása:** a Cloudflare Workers Builds triggerlekérdezése a legacy és staging Worker esetén is HTTP 403 / `10000` választ adott. Ez szolgáltatói jogosultsághiány, nem automatikus jóváhagyási elutasítás. A legacy Git-kapcsolat hiányát és a staging Production ágát a fenti tulajdonosi képek már igazolják; ezeket nem kérjük újra. A staging preview-buildje a további képen kikapcsolva; ezzel a kapcsolóleltár hiánya lezárva. A távoli végrehajtás előtt az ismert GitHub Pages automatikus kiadását kell letiltani, majd az előkészített main-referencia módosítása jóváhagyható.
3. **Tulajdonosi jóváhagyással, pontos referenciavédelemmel:** kizárólag main `57357fd… → a529a64…`. Nincs mirror-push, más ágak átírása, repository-láthatóság-váltás vagy adatbázis-művelet. Ha a távoli main időközben megváltozik, a művelet megáll. A privát végrehajtási lap tartalmazza a teljes SHA-kat és a konkrét parancsot.
4. **Utóellenőrzés:** main SHA, változatlan többi ág, régi Pages elérhetősége, nem indult legacy kiadás. A PR #3 merge-referenciáját és a korábbi commit/cache elérhetőségét külön ellenőrizzük. A GitHub által kezelt cache/ref eltávolítására szükség esetén GitHub Support-kérés kell; ennek piszkozata elkészült, elküldés nem történt.
5. **Valódi merge előtt:** a dokumentált main-védelem/kötelező frontend és Worker check, az aktuális feature commit zöld CI-je és a kiadási kapcsolók ellenőrzése marad. A mostani helyi próba nem jogosít automatikus merge-re vagy production kiadásra.

Az előzménytisztítás után a régi klónokból tilos visszapusholni a szennyezett main-t. A helyi munka megőrzése után friss klón vagy ellenőrzött referenciafrissítés szükséges. A régi mentési commitot visszaútként sem publikáljuk újra; az alkalmazáskód a tiszta mainen változatlan.

## Privát bizonyítékok és megőrzés

Munkakönyvtár: `worker/.private-backups/repository-cleanup-2026-10-19/`. Fontos fájlok: `before-cleanup.bundle`, `inventory.json`, `verification.json`, `merge-verification.json`, a `merge-*` gépi eredmények, `github-release-settings.json`, `cloudflare-triggers.json`, `REMOTE_EXECUTION.md` és `SUPPORT_DRAFT.md`. A választott tisztított klón **`cleaned-minimal.git`**; a korábbi teljes átírásos kísérlet nem kiadási forrás.

A bundle, az eredeti tükör és egyes másolatok személyes adatot tartalmaznak. A Git-ignore nem titkosítás; ezek nem kerülhetnek nyilvános megosztásba vagy CI-artifactba. A másolatok nem indítják újra az eredeti mentések megőrzési idejét. A szeptember 20-i pillanatfelvétel október 20-án eléri a 30 napot: a távoli rendezés lezárásakor az összes tartalmi másolat és Git-objektum selejtezését is rendezni kell, az eredeti kor alapján. További megőrzést nem minősítünk automatikusan jóváhagyottnak. A mentési határidő rendezése még nyitott; az integritási igazolás önmagában nem megőrzési jogcím.

Források a szolgáltatói eljáráshoz: [GitHub sensitive-data removal](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), [repository visibility és Pages](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), [Cloudflare Workers Builds trigger API](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/list/).

## GitHub Desktop

**Summary:** `Record completed main cleanup and remaining GitHub cache removal`

**Description:** `Record the approved main history cleanup, disabled automatic Pages deployment, local main alignment and fresh verification. All seven branch histories are free of the backup blobs; the legacy page and Worker are unchanged. GitHub PR #3 cache removal remains pending; no merge or production cutover occurred.`

**Következő:** a GitHub PR #3 régi merge-hivatkozásának és cache-ének Support általi eltávolítása, majd a main merge-védelmének és az új éles környezet kiadási csomagjának előkészítése. **GPT-6 Astra · erős; kézi app-teszt nem szükséges.** A tisztítást és a kész merge-próbát nem kezdjük újra.
