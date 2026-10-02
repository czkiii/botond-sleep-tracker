# A27/S05 — tényszerű mintaszám és történeti tartomány

Dátum: 2026-10-02. Feladatszint: GPT-6 Astra · erős.

## Eredmény

Az S05 helyi számítási/felületi kapuja kész. Az ébrenléti ablak és a következő alvás becslése kártyán a „Korai jelzés” / „Stabilabb minta” címke helyett **a tényleges mintaszám** látszik. Hét megfigyelés önmagában nem minősül nagyobb pontosságnak vagy stabilitásnak.

Kiinduló HEAD: `e344b12` — `Align wake-window minimum samples and highlighted evidence`, ág: `feat/child-profile-v4`; tiszta munkafa. S04 már commitban volt. S05 helyi módosítás; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt. M1–M6 kézi elfogadás továbbra is 6/6 lezárva.

## Megjelenítési szabály

- A wake-kártya címkéje a kiemelt érték mintacsoportjának darabszámát mutatja. Például 9 összesített megfigyelésből a második alvás előtti 3 minta kiemelésekor a fejléc is **3 minta**.
- A becslés saját, azonos alvássorrendű mintáinak darabszámát mutatja, kizárólag kész becslésnél. Gyűjtési/nem elérhető állapotban nincs bizonyosságot sugalló fejléc vagy kész tartománymagyarázat.
- A belső, futás közben számított `confidence` mezőt és a pusztán 3/7 darab alapján osztályozó segédfüggvényt eltávolítottuk. Ezek nem mentett naplómezők vagy szerveres API-adatok, ezért adatvándoroltatás nem szükséges. A két elavult fordításkulcs is megszűnt.
- A történeti tartomány megnevezése HU/EN/DE nyelven a **korábbi ébrenlétek középső 50%-a**. A magyarázat szerint ez a tiszta múltbeli időtartamok alsó és felső negyede közötti sáv (Q1–Q3), nem a következő elalvás valószínűsége.
- A becslés magyarázata külön kimondja: az azonos alvássorrendű történeti időtartamok középső 50%-át az utolsó rögzített ébredéstől számítjuk. Ez **nem jelent 50% esélyt** arra, hogy a következő elalvás a kijelzett sávba esik.
- A medián, az interpolált kvartilisek, az időpontok és a mintavétel számítása változatlan. Például 1/2/3/4/5/6/7 órás mintából Q1 = 2 óra 30 perc, Q3 = 5 óra 30 perc; 09:00-s utolsó ébredés mellett a becslés sávja 11:30–14:30. Hét azonos kétórás mintából a történeti tartomány és a becslési sáv ponttá szűkülhet; ez sem kap bizonyossági minősítést.

Ez az auditban elfogadott konzervatív V1 megoldás: semleges mintaszám, pontossági ígéret nélkül. Nem vezetünk be új, visszamérés nélküli szórás-/napalapú „bizonyossági” pontszámot. Az S04 hárommintás minimuma megmarad. A kiválasztott időszakon kívüli kontextus S06, az elavult ébredés S07; nem részei ennek a lezárásnak.

## Gépi bizonyíték

- Javítás előtt az új `src/wakeEvidence.test.ts` **3/3 esetben bukott**: egyetlen nap hét megfigyelése, hét azonos, illetve hét szóródó megfigyelés is `medium` confidence értéket kapott.
- Javítás után **3/3 PASS**: semleges adatkimenet, pontos medián/Q1–Q3, az utolsó ébredéshez igazított becslési sáv, változatlan bemeneti sessionök. A korábbi confidence-elvárások az új szerződésre változtak; az S04 0/1/2/3 próbái megmaradtak.
- Teljes csomag: **37 fájl, 458/458 PASS**. Frontend typecheck és helyi build/PWA generálás PASS. Meglévő bundle-figyelmeztetés: JS 717,57 kB / gzip 219,56 kB.
- Bővített `scripts/wake-window-samples-check.mjs`: **HU/EN/DE × 320/393 px, 6/6 PASS**, az S04 esetekkel együtt. Ellenőrzi a 9 összesített / 3 kiemelt mintát, hét egy napon mért szünetet, azonos és szórt hétmintás történetet, a két kártya saját darabszámát, a háromnyelvű tartománymagyarázatot, a becslés számszerű sávját és a keskeny nézet illeszkedését. Nulla oldalhiba és nulla váratlan API/külső kérés.
- Futtatás: `node scripts/check-statistics-performance.mjs --wake-samples-only`, a meglévő külső Playwright modullal és `SOLEMI_BROWSER_CHANNEL=msedge` beállítással, elkülönített helyi naplókon. Új alkalmazásfüggőség nincs. A teljes frissülési parancs is tartalmazza ezt a próbát; az S02/S03 böngészőkört ebben a körben nem ismételtük.
- Gitből kizárt képek: `.private-backups/s05-{hu,en,de}-{320,393}-{identical,spread}-{wake,prediction}.png`. Magyar 320 px wake/becslés és német 320 px becslés vizuálisan ellenőrizve. A képek előtt a kártya a nézet közepére görget, így az alsó navigáció nem takarja a magyarázatot.
- `git diff --check`: PASS.

## Folytatás

S01–S05 helyi kapui készek. A teljes A27 és a közös valódi telefonos elfogadás továbbra is nyitott. Ehhez a változáshoz nincs új tulajdonosi kézi tesztkör.

**Következő feladat: A27/S06 — a becsléstípus és a kiválasztott mintavételi időszak egyeztetése, gépi próbákkal. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Replace confidence labels with sample counts and explain historical ranges`
