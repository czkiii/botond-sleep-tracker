# A27/S04 — minimum mintaszám és kiemelt ébrenléti érték

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S04 helyi számítási és felületi javítása kész. **0, 1 vagy 2 tiszta ébrenléti ablakból nincs kiemelt tipikus érték vagy tartomány; legalább 3 szükséges.** Ugyanez a küszöb érvényes az összesített és az alvási sorrend szerinti részmintákra. Három megfigyelés megjelenítési minimum, nem igazolt előrejelzési pontosság.

Kiinduló HEAD: `f3f85c1` — `Fix circular routine clock statistics and ambiguous patterns`, ág: `feat/child-profile-v4`; tiszta munkafa. S03 már commitban volt. S04 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt. M1–M6 kézi elfogadás továbbra is 6/6 lezárva.

## Egységes működés

- A minimumot maga a számító függvény tartja be: kevés mintánál `typicalMs` és `typicalRange` null. Nem csak a felület rejti el a túl korai értéket.
- A kiválasztott 7/14/30 nap tiszta mintái számítanak. Törlés, hibás adat vagy szűkebb időszak után a kiemelt érték azonnal visszavonódik, ha a mintaszám három alá esik.
- Kevés adatnál egyetlen gyűjtési szöveg jelenik meg a tényleges 0/3, 1/3 vagy 2/3 állapottal; nincs tipikus érték, tartomány és bizonyossági címke.
- Futó alvás alatt az aktuális ébrenlét nem számítható, de a már elegendő történeti minta megmarad. A történeti kártya ilyenkor nem ír tévesen „gyűjtjük (3/3)”. Az üres napló sem kap téves „futó alvás” magyarázatot.
- A kiemelt érték, a hozzá tartozó mintaszám, az alsó magyarázat és a meglévő címke ugyanahhoz a mintacsoporthoz igazodik. A 9 összesített ablakból kiválasztott 3 második-alvás előtti minta esetén mindenütt 3 a kiemelt érték alapja.
- Ha a következő alvási sorrendhez nincs legalább három minta, továbbra is az összesített történeti érték jelenhet meg, általános „Jellemző érték” címmel, amennyiben annak már van három mintája. Nem nevezzük át az elégtelen alcsoport értékévé.

A medián és Q1–Q3 képlete, az alvásadatok, az aktuális ébrenlét számítása és a becsléstípus kiválasztása nem változott. A címke továbbra is a meglévő 3/7 mintás szabályt követi, most a ténylegesen kiemelt csoportra. Ennek semleges megfogalmazása és a Q1–Q3 pontos jelentése **S05**, az elavult aktuális ébrenlét kezelése **S07**; ezek nincsenek ezzel lezárva.

## Gépi bizonyíték

- Javítás előtt a célzott 20 próbából **5 bukott**: a régi egymintás eset, az új 1/2 mintás esetek, az adateltávolítás és a mintavételi időszak szűkítése.
- `src/wakeWindowSamples.test.ts`: **8/8 PASS**, 0/1/2/3 minta, aktív alvás melletti történeti érték, eltávolítás/érvénytelen adat, 7/14/30 napos minimum, alulmintázott alcsoport. A meglévő egymintás regresszió elvárása is az elfogadott minimumra változott.
- Teljes csomag: **36 fájl, 455/455 PASS**. Frontend typecheck és helyi build/PWA generálás: PASS. Meglévő bundle-figyelmeztetés: JS 716,48 kB / gzip 219,27 kB.
- A korábbi statisztikai frissülés, perces óra, jogosultságváltás és S02 déli lezárás böngészőpróbája PASS. Az S03 körkörös rutin próbái HU/EN/DE × 320/393 px esetben PASS.
- `scripts/wake-window-samples-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**, 0/1/2/3 minta, futó alvás, azonnali visszavonás, 9 összesített/3 kiemelt minta, időszakváltás és túlcsordulás. Nulla oldalhiba, nulla váratlan API/külső kérés.
- A böngészős tesztet két helyen pontosítottuk: a már meglévő, teljes alvási sorrend-feliratokat várja; a kiemelt sor 8 px-es díszítő margóját a kártya széléhez méri. A felülethez emiatt nem kellett CSS-változás.
- Külön ismételhető célzott parancs: `node scripts/check-statistics-performance.mjs --wake-samples-only`. A teljes frissülési ellenőrzés (`--freshness-only`) is tartalmazza az S04 próbát. A meglévő külső Playwright modul és `SOLEMI_BROWSER_CHANNEL=msedge` használatával, kizárólag elkülönített helyi adatokkal futott.
- Gitből kizárt képek: `.private-backups/s04-{hu,en,de}-{320,393}-{2-samples,3-samples,subgroup}.png`. Magyar 320 px gyűjtési/alcsoport és német 320 px alcsoport vizuálisan is ellenőrizve.

## Folytatás

S01–S04 helyi kapui készek; a teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a változáshoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S05 — adatokhoz igazodó bizonyossági címke és a Q1–Q3 tartomány pontos magyarázata, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Align wake-window minimum samples and highlighted evidence`
