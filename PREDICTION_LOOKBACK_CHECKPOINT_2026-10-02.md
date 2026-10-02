# A27/S06 — becsléstípus és mintavételi időszak

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S06 helyi kapuja kész. A következő alvás típusának tanulása is a kiválasztott **7/14/30 napos időszakon belüli** előzményeket használja. Az időszakon kívüli régebbi egyalvásos napok importja nem írja felül a közelmúlt kétalvásos napjaiból tanult típust.

Kiinduló HEAD: `4b39202` — `Replace confidence labels with sample counts and explain historical ranges`, ág: `feat/child-profile-v4`; tiszta munkafa. S05 már commitban volt. S06 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt. M1–M6 kézi elfogadás továbbra is 6/6 lezárva.

## Határszabály

- Közös bal határ: `now - lookbackDays × 24 óra`, a korábbi időtartam-mintavétel gördülő időszakával egyezően.
- A napi nappali alvásszám tanulásába csak az időszakba **teljes egészükben beleférő korábbi helyi naptári napok** kerülhetnek. A bal határ által kettévágott napot nem értelmezzük teljes napi mintának. Például szeptember 30. délben a 7 napos határ szeptember 23. dél: a napi darabszám tanulásában az első lehetséges nap szeptember 24.
- Ez időszakbeli teljesség, nem a napló hiánytalanságának bizonyítása. Továbbra is a rögzített, tiszta nappali alvásokat tartalmazó napokból tanulunk; a hiányzó nap/valódi nulla általános szabálya más auditpont része.
- A mai alvásszám aktuális kontextus, nem korábbi napi tanítóminta. A nappali/éjszakai óraszabály, a legalább három korábbi nap követelménye és a kevés adatnál használt első/második/későbbi alvás szerinti visszaesés megmarad. Régi, időszakon kívüli napokkal a háromnapos küszöb sem tölthető fel.
- Az ébrenléti időtartamok továbbra is a teljes eredeti sorrendben szomszédos sessionökből származnak, és a korábbi ébredésnek legalább a közös bal határra kell esnie. A napi tényleges alvássorrendet is megőrizzük. Az előzményeket nem vágjuk le a párok képzése előtt, mert az mesterséges rést vagy a határnap későbbi alvásának téves első-alvás besorolását okozhatná. Ez sorrendi kontextus, nem az időszakon kívüli napi darabszám tanulása.
- Az időszak bővítése szándékosan változtathat a típuson: a 14/30 napba bekerülő egyalvásos napok indokolhatnak éjszakai becslést. Visszaváltáskor a 7 napos saját minta visszaáll.

A medián, Q1–Q3, aktuális ébredés kezelése, tárolt napló és fordítások nem változtak. Az elavult ébredés/hiányos aktuális kontextus az S07-ben marad.

## Gépi bizonyíték

- Javítás előtt `src/predictionLookback.test.ts`: **6/9 bukott**. Mindhárom időszaknál régi importból téves `night` besorolás, időszakváltás, a tanulási minimum régi napokból pótlása, illetve a kezdőhatár töredéknapjának beszámítása.
- Javítás után **9/9 PASS**: 7/14/30 napos régi import változatlansága teljes becslési kimenetre; fordított bemeneti sorrend és érintetlen sessionök; tudatos időszakbővítés; háromnapos minimum; töredéknap kizárása és első teljes nap bevétele; éjszakai óraszabály; bal határon pontosan és 1 ms-mal előtte végződő ébredés mintavétele.
- Teljes csomag: **38 fájl, 467/467 PASS**. Frontend typecheck és helyi build/PWA generálás PASS. Meglévő bundle-figyelmeztetés: JS 717,63 kB / gzip 219,56 kB.
- A meglévő `scripts/wake-window-samples-check.mjs` S06-tal bővült. **HU/EN/DE × 320/393 px, 6/6 PASS**, az S04/S05 próbákkal együtt. Szintetikus három kétalvásos nap és egy mai alvás mellett a 7 napos becslés második nappali alvás, 11:00–11:00, 3 mintából. Húsz régebbi egyalvásos nap importja ezt változatlanul hagyja. 14/30 napra bővítve éjszakai típus, 17:00–17:00, 3 mintából; vissza 7 napra az eredeti kártyaszöveg és kiemelt ébrenléti érték pontosan visszaáll.
- Futtatás: `node scripts/check-statistics-performance.mjs --wake-samples-only`, a meglévő külső Playwright modullal és `SOLEMI_BROWSER_CHANNEL=msedge` beállítással, elkülönített helyi naplókon. Nulla oldalhiba és nulla váratlan API/külső kérés. Új függőség nincs.
- Gitből kizárt képek: `.private-backups/s06-{hu,en,de}-{320,393}-{7-days,30-days}.png`. A két magyar 320 px állapot vizuálisan is ellenőrizve.
- `git diff --check`: PASS.

## Folytatás

S01–S06 helyi kapui készek. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a javításhoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S07 — elavult ébredés és hiányos aktuális kontextus kezelése a becslésben, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Align prediction type learning with the selected lookback`
