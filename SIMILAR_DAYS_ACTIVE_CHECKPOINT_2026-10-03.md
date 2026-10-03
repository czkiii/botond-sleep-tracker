# A27/S08 — hasonló napok aktív alvás alatt

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S08 helyi kapuja kész. A 08:00–09:00 lezárt és 11:00-tól futó alvás mellett 12:00-kor többé nem jelenik meg háromórás ébrenléten alapuló nap-összehasonlítás. Futó alvás alatt a kártya a meglévő HU/EN/DE magyarázatot mutatja: az összehasonlításhoz mai befejezett alvás és aktuális ébrenlét kell. Nincs találat vagy kész állapotot sugalló fejléc. Lezárás után az új ébredésből azonnal újraszámolódik, oldalfrissítés nélkül.

Kiinduló HEAD: `ea3a907` — `Handle stale prediction context and explain unavailable estimates`, ág: `feat/child-profile-v4`; tiszta munkafa. S07 már commitban. S08 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Szabály és határok

- Bármely lezáratlan bejegyzésnél az eredmény `unavailable`, az aktuális pillanatkép `null`, a jelöltek száma nulla, a találatok listája üres.
- Az ellenőrzés a minőségi szűrés előtt fut: hibás vagy jövőbeli kezdetű, régen nyitva maradt vagy több aktív bejegyzés kiszűrése nem teheti a korábbi ébredést újra aktuálisnak.
- A bejegyzéseket nem módosítjuk és nem zárjuk le automatikusan. Ez használhatósági feltétel az összehasonlításhoz, nem élettani időkorlát.
- Lezáráskor az éppen rögzített ébredés nulla ébrenléti idővel már érvényes. A történeti `end > cutoff` határ változatlan: pontosan a vizsgált időpontban véget érő alvás lezárt, egy ezredmásodperccel később végződő még futott. Egyszerű `>=` csere ezt elrontaná.
- A történeti keresés, távolságsúlyok és minimum három nap szabálya változatlan. A „hasonló” és „legközelebbi elérhető” jelentésének egyeztetése külön S09 feladat.

## Gépi bizonyíték

- Javítás előtt az új tíz regresszióból **6 bukott, 4 már megfelelt**. Javítás után `src/similarDaysActive.test.ts`: **10/10 PASS**; meglévő hasonló nap tesztekkel együtt **15/15 PASS**.
- Lefedés: egy órája, egy ezredmásodperce és pontosan most kezdődő alvás; lezárás és újranyitás; hibás/jövőbeli/régi/többszörös aktív adat; éjfél előtti, éjféli és következő napi állapot; történeti lezárt intervallum határa; bemeneti napló megőrzése. Lezárás után a kétórás összalvás, két nappali alvás és nulla ébrenlét, valamint a találatok eltérései is ellenőrzöttek.
- Teljes csomag: **40 fájl, 490/490 PASS**. Frontend typecheck és helyi build/PWA generálás PASS. Meglévő bundle-figyelmeztetés: JS 720,48 kB / gzip 220,34 kB.
- `scripts/prediction-context-check.mjs` S08 bővítés: **HU/EN/DE × 320/393 px, 6/6 PASS**. Kezdés, lezárás, újranyitás, jövőbeli nyitott bejegyzés, éjféli percóra-váltás; találatok elrejtése/visszatérése újratöltés nélkül, keskeny elrendezés. Nulla oldalhiba és nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --wake-samples-only`, külső Playwright, `SOLEMI_BROWSER_CHANNEL=msedge`, elkülönített helyi szintetikus naplókkal. Az S04/S05/S06/S07 böngészős regressziók is mind sikeresek. A teljes teljesítmény- és S02/S03 böngészőkört most nem ismételtük.
- Gitből kizárt képek: `.private-backups/s08-{hu,en,de}-{320,393}-{active,awake}.png`. Magyar 320 px aktív és ébredés utáni állapot vizuálisan ellenőrizve.
- `git diff --check`: PASS. Új függőség, tárolási vagy API-migráció nincs.

## Folytatás

S01–S08 helyi kapui készek; M1–M6 kézi kör továbbra is 6/6 lezárva. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S09 — a hasonlóság és a legközelebbi elérhető napok következetes jelentése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Hide similar-day comparisons during active sleep`
