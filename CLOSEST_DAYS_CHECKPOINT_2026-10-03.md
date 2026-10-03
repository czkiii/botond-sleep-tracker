# A27/S09 — legközelebbi elérhető napok

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S09 helyi kapuja kész. A kártya neve HU/EN/DE nyelven következetesen **Legközelebbi elérhető napok / Closest available days / Nächstliegende verfügbare Tage**. Három korábbi nap rendelkezésre állása nem jelent igazolt hasonlóságot. A fejléc darabszámot mutat; a gyűjtési és a kész állapot szövege is rangsorolásról beszél.

Kiinduló HEAD: `a32e651` — `Hide similar-day comparisons during active sleep`, ág: `feat/child-profile-v4`; tiszta munkafa. S08 már commitban. S09 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Döntés és megjelenítés

- Az audit két lehetséges lezárása közül a rangsor pontos megnevezését választottuk. Nem vezettünk be bizonyíték nélküli hasonlósági küszöböt. A meglévő távolságfüggvény termékheurisztika: nappali alvásszám eltérése × 2, összalvás eltérése / 2 óra, ébrenlét eltérése / 1 óra; a három legkisebb pontszámú nap jelenik meg. A súlyozás nem változott.
- Minden találat mellett megjelenik a **mai értékektől való eltérés nagysága**, külön a nappali alvásszámra, az addigi alvásidőre és az ébrenlétre. Ezek abszolút különbségek, nem előjeles több/kevesebb értékek. A korábbi nap eredeti értékei is látszanak; az időtartamok a meglévő perc alapú formátumot használják.
- Az audit 00:00–11:00-s régi napjai a mai 08:00–09:00 mellett továbbra is megjelenhetnek, de a **10 óra alvásidő-eltérés** és a 2 óra ébrenléti eltérés kifejezetten látható. A magyarázat kimondja, hogy a legközelebbi napok is jelentősen eltérhetnek a maitól.
- A keresés az előző legfeljebb **730 helyi naptári napra** terjed ki, és független a 7/14/30 napos Insights-választástól. Az összevetés azonos óraidőig nézi a napokat. A 730-as határ egy közös kódbeli állandóból kerül a felületre; nem ígérünk korlátlan előzményt.
- **Életkor és naplózási szokás:** régi, számszerűen közelebb eső nap megelőzhet egy friss, eltérő napot. Nincs életkori normalizálás vagy a napló teljességét bizonyító adat; a meglévő minőségi szűrés nem tudja felismerni az összes kihagyott alvást. A felület ezt jelzi. A találatok dátumában az év is látszik, így egy előző évi nap nem tűnik frissnek. Nem készült új életkori tanácsadó vagy új súlyozási szabály.
- A régi napon később rögzített alvást a felület történeti adatként magyarázza, nem mai előrejelzésként. Az S08 futóalvás-védelme és a minimum három rangsorolható nap változatlan.
- A zárolt Family+ előnézet ugyanazt a címfordítást használja. A korábbi alternatív fordításkulcsok megnevezéseit is egyeztettük.

## Gépi bizonyíték

- `src/similarDaysRanking.test.ts`: **3/3 PASS**. Auditpélda teljes számértékei és bemeneti napló megőrzése; 100 napos pontos egyezés a friss távoli napok előtt, mindhárom Insights-időszakkal; a 730. nap befoglaló és 731. nap kizáró keresési határa. Ezek a rangsor meglévő viselkedését rögzítik, nem algoritmusváltozást igazolnak.
- Hasonló napok célzott csomagja: **18/18 PASS**. Teljes csomag: **41 fájl, 493/493 PASS**. Frontend typecheck, build és PWA generálás PASS. Meglévő bundle-figyelmeztetés: JS 722,28 kB / gzip 220,90 kB.
- `scripts/prediction-context-check.mjs` S09 bővítés: **HU/EN/DE × 320/393 px, 6/6 PASS**. Pontos új cím, tízórás és kétórás eltérés a sorokban, nulla eltérés régi pontos egyezésnél, 2025-ös év feltüntetése, későbbi történeti alvás ideje, 7/14/30 váltás, két napnál gyűjtési állapot, keresési határ és korlátok magyarázata. Túlcsordulás, oldalhiba és váratlan API/külső kérés nélkül.
- Az első böngészőfutás a régi dátumból hiányzó évnél megállt; a megfelelő dátumformázó javítása után a teljes célzott böngészőkör sikeres. Az S04–S08 regressziók is lefutottak.
- Futtatás: `node scripts/check-statistics-performance.mjs --wake-samples-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplókkal. A teljes teljesítmény- és S02/S03 böngészőkört most nem ismételtük.
- Gitből kizárt képek: `.private-backups/s09-{hu,en,de}-{320,393}-{distant,old-exact,collecting}.png`. Keskeny magyar és német kész állapot vizuálisan ellenőrizve. `git diff --check`: PASS.

## Folytatás

S01–S09 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6 lezárva. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S10 — a leghosszabb alvásszakasz közös nevezője, naphoz/hónaphoz rendelése és felirata, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Clarify closest-day rankings and show differences from today`
