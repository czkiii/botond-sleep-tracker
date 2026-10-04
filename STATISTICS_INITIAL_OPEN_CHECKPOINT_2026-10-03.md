# A22 — az első prémium számítás gyorsítása

Dátum: 2026-10-03. Kiinduló HEAD: `3197e0d`, `feat/child-profile-v4`, a már meglévő helyi A21 javítások megtartásával.

Dokumentáció lezárása: 2026-10-04, a használati korlát miatti megszakítás után. A kód és a sikeres futások megmaradtak; nem kellett újraimplementálni vagy indokolatlanul megismételni az ellenőrzéseket.

## Elkészült rész

A szeptember 30-án megoldott másodperces újraszámolást nem kezdtük újra. A mostani feladat a statisztikai oldal első megnyitásakor végzett prémium számítás költsége volt.

A függvényenkénti profilban a `buildSimilarDaysInsight` adta az első számítás több mint 95%-át: minden korábbi naphoz újra átnézte és többször feldolgozta a teljes naplót. Most a legfeljebb 730 keresett történeti naphoz egyszer készül naptári index, és egy nap elemzése csak az oda tartozó rekordokat vizsgálja. Az első érintett napot bináris keresés választja ki. A hibás rekordok érintett napjai külön listát kapnak.

Megmaradt a 730 napos keresés, a minőségi szűrés, az eredeti bemeneti sorrend és azonos pontszámú találatok sorrendje, a minták és a rangsorolás. Az index befoglaló határai az éjféli ébredést és a vizsgálati időpontban kezdődő alvást is megőrzik; a végső számítás az eredeti szigorú átfedési feltételeket alkalmazza. Nincs hívások között megőrzött cache, így napló-, időpont- és időzónaváltás nem hagyhat régi indexet.

## Előtte–utána mérés

Azonos helyi Edge, Vite fejlesztői környezet, React StrictMode, 393×852 nézet, Budapest. Mesterséges 1800/5000 rekord, napi négy kétórás alvás; valós mérési óra, CPU-lassítás nélkül. A StrictMode két számítását mindkét oldalon tartalmazza. A táblázat a mért elemzőfüggvények összesített ideje, **nem teljes képernyő-betöltés és nem telefonos mérés**. Egymásba ágyazott függvényidőt az összesítés nem dupláz.

| Napló / csomag | Előtte | Utána | Csökkenés |
| --- | ---: | ---: | ---: |
| 1800 / Free | 13,5 ms | 13,8 ms | Lényegében változatlan |
| 1800 / Family+ | 1113,6 ms | 64,0 ms | 94,3% |
| 5000 / Free | 27,4 ms | 28,0 ms | Lényegében változatlan |
| 5000 / Family+ | 4550,6 ms | 146,1 ms | 96,8% |

Csak a történeti napkeresés: 1800 rekordnál 1060 → 14,4 ms; 5000-nél 4422,9 → 25,6 ms. Ezek helyi egyszeri minták, nem garantált időhatárok. A stabil gépi feltétel az eredményegyezés és a teljes napló ismételt feldolgozásának elmaradása.

Mind a négy esetben 3,2 másodperc változatlan nézet alatt **0 további statisztikai számítás**; Free módban a zárolt prémium számítások továbbra sem futnak.

Nyers eredmények (Gitből kizárva): `.private-backups/a22-initial-open-before.json`, `.private-backups/a22-initial-open-after.json`. A korábbi szeptemberi baseline-t nem írtuk felül. A mérőszkript függvényenkénti profilt és `--measurement-label=...` fájlnévjelölést kapott; a mérőkód csak a helyi tesztszerverben él.

## Eredményazonosság és ellenőrzés

- `src/similarDaysIndex.test.ts`: 9 új próba. Független referencia a korábbi teljes naplós algoritmus befagyasztott másolata: `test-fixtures/statistics/similarDaysBeforeIndex.ts`, kizárólag tesztimporttal.
- A teljes eredményobjektum egyezése: Budapest tavaszi/őszi DST, New York, UTC, Tokió, Apia kihagyott naptári napja; 7/14/30 napos paraméter, 730 napnál régebbi import, hiányzó dátumok, átfedés, duplikátum, típuskonfliktus, rövid/hosszú/fordított/érvénytelen rekordok, éjfél és pontos vizsgálati időpont. Külön adatcsere, sorrendváltás, idő- és időzónaváltás; a bemenet változatlan marad.
- 5000 rekordnál az időpont-feldolgozások száma a korábbi tizede alatt és 100 × rekordszám alatt marad, azonos eredménnyel. Nincs gépfüggő milliszekundumos tesztküszöb.
- Teljes tesztcsomag: **49 fájl, 588/588 PASS**; frontend typecheck és production/PWA build PASS. A meglévő nagy bundle figyelmeztetés megmaradt, a csomagméret-csökkentés nem ennek a javításnak a tárgya.
- Böngészős közös elfogadás: **6/6 PASS**, HU/EN/DE × 320/393 px, hét kártya és két elkülönített böngészőkörnyezet, adatcsere/újratöltés/aktív/üres napló. Kontextuscsomag: **36/36 PASS**, ébrenléti minták, becslési időszak, hiányos/elavult kontextus, aktív alvás, legközelebbi napok/rangsorolás és nyelvi megjelenítés. Mindkét folyamat exit 0, nincs váratlan oldalhiba vagy külső/API kérés. Helyi naplók: `.private-backups/a22-initial-acceptance.log`, `.private-backups/a22-initial-context.log`. Edge: `154.0.4258.53`.
- `git diff --check` PASS.

Ismétlés a projektben használt Playwright környezettel:

```powershell
$env:SOLEMI_PLAYWRIGHT_MODULE='C:/Users/bobaa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:SOLEMI_BROWSER_CHANNEL='msedge'
node scripts/check-statistics-performance.mjs --performance-only --measurement-label=initial-open-check
npm test -- src/similarDaysIndex.test.ts
```

A régi időméréshez a régi forrás szükséges; az új forráson futtatott mérés nem állítja elő újra a régi baseline-t.

## Megálló és maradék

**Az A22 első prémium számításának helyi gyorsítása elkészült.** A teljes A22 kiadási kapuból a valódi gyengébb telefonon végzett használati/terhelési ellenőrzés maradt. Most nincs új tulajdonosi tesztkérés; ezt a későbbi összevont készülékes elfogadáshoz kapcsoljuk. A27 telefonos elfogadása továbbra is várakozik.

Az előző A21 és az új A22 módosítások helyiek; commit/push/deploy, natív csomagolás és valódi fiók/családi adat módosítása nem történt.

Következő önálló munkarész: az A04 családi kilépés/adminutód meglévő implementációjának és bizonyítékainak áttekintése; csak a ténylegesen hiányzó rész pótlása. A PDF, csomagígéretek és adatkezelés továbbra is a natív csomagolás előtti szakaszhoz tartoznak.

GitHub Desktop Summary az A22 részhez: `Speed up initial premium statistics with indexed day lookup`
