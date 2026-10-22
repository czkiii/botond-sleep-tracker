# Main-merge: lezárt előkészítés és végrehajtási lap

**Végrehajtási folytatás, 2026-10-22:** a main-védelem aktív és visszaellenőrzött, PR #3 már nem draft. Az `1e19638` minden checkje sikeres, de a PR-review két konkrét hibát talált. Javításuk: nap/hónap komponensek rendezhető dátumkulcsa; lecserélt/törölt profilképek tartós törlési sora, törlés csak sikeres naplómentés után, más munkaterület és safety backup által használt képek megtartásával. Célzott **37/37** próba és frontend typecheck PASS; a módosított commit teljes CI-je még szükséges. Az előző megszakítást használati korlát miatti automatikus jóváhagyás-ellenőrzési hiba okozta; akkor nem történt main-merge.

**Végrehajtás elindítva, 2026-10-21:** az ismert lockfile-konfliktus a `5f71401` feature-merge-commitban feloldva, a teljes fájlfa változtatása nélkül. A közben feltöltött `b6f9506` frontend CI-jét új npm audit-találatok állították meg. Célzott javítás: Vite `7.3.6 → 7.3.7`, Vitest `4.1.11 → 4.1.12`, rögzített lockfile; telepítés után nulla audit-találat. Alkalmazásforrás nem változott. Az alábbi korábbi 907/907 eredmény történeti bizonyíték; az új eszközverziókat a végső commit rendes CI-futása ellenőrzi, sikerét előre nem állítjuk. [Vite kiadás](https://github.com/vitejs/vite/releases/tag/v7.3.7), [Vitest kiadás](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12).

**Állapot, 2026-10-21:** az előkészítés kész. A tényleges merge, az ág-védelem aktiválása és az élesítés nem történt meg. Ezek végrehajtási lépések, nem új fejlesztési vagy tesztelési projektek. Kézi app-teszt most nem kell.

**Tulajdonosi döntés:** GitHub Support-kérést nem küldünk, és az nem merge- vagy kiadási előfeltétel. A normál ágak mentésektől megtisztított története megmarad. A korábban igazolt PR-hivatkozás/cache esetleges elérhetősége ismert maradvány; teljes visszamenőleges eltávolítást nem állítunk. A repository későbbi privatizálását a régi GitHub Pages kiváltása után kezeljük, most nem változtatjuk meg a láthatóságot.

## Ellenőrzött összevonási tartalom

| Tétel | Eredmény |
|---|---|
| Main, helyben és GitHubon | `a529a640bd9158bda4e8fcf4024b518b77e1896a` |
| Helyi feature a mostani dokumentáció szerkesztése előtt | `cb355e780e311fd29c337d8045a0fda825e2559d` |
| GitHub PR #3 feje | `1b5e6d7bdd3a27b10f72edff4b0c6deb0b7b271b`; a helyi `cb355e7` még nincs feltöltve |
| PR állapota | Nyitott, draft; az ismert `package-lock.json` konfliktus miatt még nem összevonható |
| Konfliktus megoldása | A feature `package-lock.json` marad a hozzá tartozó feature `package.json` mellett |
| Friss, elkülönített előnézet | A feloldott teljes fájlfa pontosan azonos a helyi feature fájlfájával: `01c1a8e08fda9015ed68216a6b9b2e4410ff9549` |
| Eltérés a 907/907 tesztes jelölttől | Kizárólag öt Markdown dokumentum; alkalmazáskód, lockfile-ok, konfigurációk és CI azonosak |
| Mentési fájl a jelöltben | 0 követett `.private-backups/` fájl |
| Távoli ellenőrzések a PR jelenlegi fején | Frontend checks, Worker checks, Cloudflare Pages és staging Workers Builds: mind sikeres |
| Régi GitHub Pages kiadási workflow | `339938895`, `disabled_manually`, frissen ellenőrizve |
| Main-védelem | Még nincs aktiválva; konkrét beállítás alább |

A korábbi bizonyíték: **65 fájl / 907 sikeres teszt**, tiszta frontend/Worker telepítés, két typecheck, frontend build, staging Worker dry-run és nulla audit-találat. Az összehasonlított tesztelt Git-tree: `96f380021901d449c0f4a90bfbaa0d69eb3a9677`. Most nem futtatjuk újra a teljes csomagot változatlan kódra. A végső feltöltés szokásos GitHub CI-futása megmarad; a jelenlegi zöld státuszt nem tulajdonítjuk egy későbbi commitnak.

Privát, személyes tartalmat nem kiíró bizonyíték: `worker/.private-backups/repository-cleanup-2026-10-19/final-merge-preparation.json`, `main-protection-inventory.json`, `github-release-settings.json`. A külön index előnézete nem hozott létre merge-commitot és nem mozdított el ágat.

## A merge végrehajtása — egy következő munkamenet

1. **A mostani dokumentáció commitja.** GitHub Desktop Summary: `Finalize main merge preparation and cutover sequence`. Nincs új alkalmazáskód. A helyi `cb355e7` és ez a commit együtt kerülhet feltöltésre.
2. **Aktuális referenciák ellenőrzése és konfliktusfeloldás.** Tiszta munkafán fetch; az elvárt main `a529a64`. Eltérő main vagy új kódváltozás esetén csak az eltérést vizsgáljuk meg. A `feat/child-profile-v4` ágba beemeljük az `origin/main` előzményeit, a kizárólagos lockfile-konfliktust a kipróbált feature-változattal oldjuk fel, és összevonási commitot készítünk. Ez még nem a PR main-be olvasztása. A feloldott fájlfa az összevonás előtti feature fájlfájával egyezzen, ne maradjon konfliktusjelölés vagy követett mentés. Más konfliktus esetén nincs automatikus felülírás.
3. **Feature feltöltése és a normál CI befejezése.** A staging automatikus buildje ettől elindulhat; a legacy production nem célpont. A végleges feature SHA-n a `Frontend checks` és `Worker checks` sikerét ellenőrizzük. A régi sikeres futás nem helyettesíti ezt. PR #3 előkészített állapotból felülvizsgálhatóra állítható.
4. **Main-védelem aktiválása és visszaolvasása.** Az alábbi kész beállítással. A GitHub Pages kiadási workflow tiltása továbbra is maradjon érvényben. A staging Worker a `feat/child-profile-v4` ághoz kötött, preview-buildje kikapcsolt; a legacy Workernek nincs Git buildkapcsolata. A belső Pages main-preview-ja, ha létrejön, nem éles publikálás.
5. **Külön jelzés és jóváhagyás a tényleges main-merge előtt.** Megnevezzük a PR-t, az aktuális head/base SHA-t és a sikeres checkeket. Ezután PR #3 merge-committal összevonható. Nincs force push, history-tisztítás vagy automatikus feature-ág törlés: a staging továbbra is ezt az ágat használja. Az új main SHA-t rögzítjük, ellenőrizzük a main CI-jét és azt, hogy nem indult legacy kiadás.

**Ennek a munkamenetnek a vége:** az új kód mainen van; a napi használatú régi alkalmazás még a korábbi változatot szolgálja ki. A production környezet hiánya nem akadálya ennek a kontrollált, kiadás nélküli merge-nek. Nem kezdünk újabb általános merge-előkészítési kört.

### Kész main-védelmi beállítás

- PR-on keresztüli összevonás; automatikus merge nincs.
- Kötelező `Frontend checks` és `Worker checks`, a GitHub Actions alkalmazáshoz kötve (`app_id: 15368`). Az ágnak a mainhez képest naprakésznek kell lennie.
- A védelem az adminra is vonatkozik; force push és ágtörlés tiltva; a nyitott felülvizsgálati beszélgetéseket rendezni kell.
- Kötelező külső jóváhagyók száma **0**: az egy tulajdonossal működő projekt ne várjon saját maga által nem adható review-ra. A PR és a CI ettől még kötelező.
- Lineáris történet nem követelmény, hogy a tervezett merge-commit használható maradjon.
- Nem kötelező check a staging környezethez kötött Cloudflare deploy. A frontend/Worker CI a mainre és main-célú PR-ra is be van kötve.

A pontos, előkészített API-payload: `worker/.private-backups/repository-cleanup-2026-10-19/main-protection-proposal.json`. Ez nem aktivált védelem; a végrehajtáskor alkalmazni és visszaolvasni kell. Ha egy beállítási hiba marad, nem jelöljük a védelmet késznek.

## A main után: konkrét felhasználói átállás

1. **Új Cloudflare kiadási csomag és bekötés.** Javasolt appcím `app.solemi-sleep.app`, új `solemi-sleep-sync-v4` Worker, `solemi-sleep-db-v4` appadatbázis és külön production törlési journal. A staging működő felépítését követjük, új éles erőforrásokkal/kulcsokkal. A részletes változó- és sémalista a [main-átállási tervben](MAIN_TRANSITION_PLAN_2026-10-19.md) már elkészült. Az appcím jóváhagyása és az egy átálló család lejáratos, trialt nem fogyasztó hozzáférésének pontos fiókja/időtartama még szükséges, de nem a main-merge feltétele.
2. **Külön jelzés az éles bekötés előtt; gépi ellenőrzés az új célon.** Pontos main-SHA, külön DB/journal, proxy/belépés, tesztkapcsolók kikapcsolva, kulcsok és ütemezés. A production konfigurációs build és feltöltés nélküli csomagpróba itt készül el; az eddigi staging dry-run nem production-bizonyíték. A legacy rendszert ez nem írja felül.
3. **Egyszeri, egyeztetett költözés.** Rövid naplózási szünet, friss export és szervermentés; a friss export átalakítása a már kipróbált eljárással; új belépés, egyetlen import, új család, majd a többi eszköz csatlakoztatása. Az aktuális alvásokat és függő változásokat megőrizzük. A mezőnkénti egyezést az akkori friss naplóra ellenőrizzük, nem a régi 195-ös darabszámhoz ragaszkodunk.
4. **Egy összevont webes főteszt.** A már kész bizonyítékokra épülő, ténylegesen hiányzó készülékes esetek; productionban nincs belső tesztcsík. Ekkor kell majd a tulajdonos rövid kézi részvétele. Nem ismételjük végig a korábbi tesztprogramot.
5. **Régi rendszer lezárása és későbbi privatizálás.** A régi oldal/DB eltávolítása csak sikeres átvitel és külön jóváhagyás után; a repository privátra váltása a GitHub Pages kiváltása után. Az Android/iOS és valódi fizetési bekötés a meglévő következő blokk, nem feltétele a mostani kódösszevonásnak.

**Visszaút:** felhasználói váltás előtt a régi rendszer változatlanul használható. Ha már új V4-adat keletkezett, nem kapcsolunk vissza vakon V3-ra: előbb megőrizzük az új adatokat, és a már dokumentált V4-helyreállítási utat használjuk. [Részletes visszaút](MAIN_TRANSITION_PLAN_2026-10-19.md#4-visszaút--attól-függ-mikor-történt-a-hiba).

**Következő:** a fenti merge-végrehajtás: konfliktusfeloldás, feature feltöltése, main-védelem bekapcsolása, végső CI, majd külön jelzett main-merge. **GPT-6 Astra · erős; kézi app-teszt nem szükséges.**
