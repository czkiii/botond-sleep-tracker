# Solemi Sleep — Family+ statisztikai audit

**Dátum:** 2026-09-20. **Ág:** `feat/child-profile-v4`.
**Vizsgált HEAD:** `3a0a687` — `Document full release audit and pre-launch blockers`.
Az alkalmazás forrása az előző audit `e9374f4` állapotával azonos.
Ez audit és javítási terv: alkalmazáskód, csomagok, árak és termékígéretek nem változtak.

## Következtetés

A hét Family+ kártya megtartható alapokra épül, de a számítások jelenlegi
értelmezése még nem mindenütt elég megbízható a fizetős kiadáshoz.
A vizsgált medián, interpolált kvartilis, intervallumunió és óraátállításos
időtartam helyes. A fontos hibák az éjszakai szakaszok csoportosításában,
a hiányos napló értelmezésében, a kártyák közötti eltérő nevezőkben és az
aktuális állapot figyelembevételében vannak.

Három kézzel is ellenőrizhető példa:

- Három 20:00–01:00 és 01:30–06:00 szakaszokra bontott éjszakánál a rutin
  **01:00-t mutat tipikus ébredésnek**, az utolsó 06:00-s ébredések helyett.
- Havi hét, egyenként 12 órás, különálló éjszakánál az alvásfejlődés
  **12 órás**, a havi riport **6 órás** átlagos leghosszabb szakaszt ad.
- A „Hasonló napok” aktív alvás alatt is kész eredményt adhat, és közben
  háromórás aktuális ébrenlétet számolhat.

Ez a [teljes audit](FULL_RELEASE_AUDIT_2026-09-20.md) **A27** kiegészítése,
az A21 statisztikai egységességi tétel részletes kibontásával.
Nincs automatikusan első frissítésre halasztott megállapítás.

## Megbízás, módszer és bizonyíték

Az audit kérdése: ugyanannak a gyermeknek ugyanazon naplójából minden kártya
azt számolja-e, amit a felirat állít? Ellenőrizendő a képlet, mértékegység,
időszak, nevező, minimum minta, kizárás, aktív alvás, hiányos nap, átfedés,
éjfél, hónaphatár, időzóna, valamint a bizonytalanság felületi megjelenítése.
Leíró statisztikát vizsgálunk; nem igazolunk orvosi vagy altatási ajánlást.

Átolvasott modulok: `utils`, `insights`, `prediction`, `similarDays`,
`sleepDevelopment`, `sleepChange`, `monthlyReport`; kapcsolódó tesztek,
`App.tsx` megjelenítés és HU/EN/DE feliratok. Az App a kiválasztott gyermek
adatait adja át; a számítási modulok ezt a hívói előfeltételt használják.

**Helyi eredmény: 9 fájl / 72 sikeres teszt.** Ebből 50 meglévő teszt és
22 új auditpróba: 7 kontroll, 15 reprodukció. A reprodukciók a jelenlegi
eltérést igazolják, nem kijavított hibák. Egy kontrollon belül 50 rögzített
véletlenmagú adathalmazt ellenőriztünk független, foglalt perceket számláló
referenciával; ez nem további 50 teszteset a Vitest darabszámában.

Kontrollok: [1, 2, 3, 4] órás szünetek mediánja 2,5 óra, kvartilisei
1,75/3,25 óra; sorrend- és pontosduplikátum-invariáns unió; Budapest tavaszi
7 és őszi 9 tényleges órás éjszakája; azonos időszakokra semleges változás;
havi átlagok mediánjából pontos +60 perces trend; az 5 perces alvás megőrzése.

Archivált próbák és futtatás: [audit/2026-09-20/README.md](audit/2026-09-20/README.md).
Mesterséges adatok, helyi Node/Vitest. Ebben a kiegészítésben nem volt új
telefonos, böngészős vagy távoli próba, valódi családi adatok elemzése vagy
előrejelzési pontosságmérés. Az alkalmazás korábbi 185 tesztjét nem futtattuk
újra teljes egészében; itt a kapcsolódó 50 meglévő teszt futott.

## A hét kártya tényleges számítási szerződése

| Kártya | Jelenlegi képlet és minta | Fő korlát |
|---|---|---|
| Ébrenléti ablak | Egymást követő, használható lezárt alvások 5 perc–12 óra közötti szüneteinek mediánja és Q1–Q3; 7/14/30 × 24 óra; kész állapot 3 mintától | Éjszakai visszaalvás és lefekvés közös csoport; a felület 1 mintát is kiemelhet |
| Rutinminták | Kezdési naponként leghosszabb, többségében éjszakai alvás kezdése/vége; medián, Q1–Q3; mutatónként legalább 3 minta | Szakasz vége nem feltétlen reggeli ébredés; éjféli körkörösség |
| Hasonló napok | Azonos helyi óraidőig megfigyelt napok; távolság = 2 × alvásszámkülönbség + alvásidőkülönbség/2 óra + ébrenlétkülönbség/1 óra; 3 legközelebbi | Nincs hasonlósági küszöb; aktív alvás hibája; legfeljebb 730 nap |
| Prediction Lite | Következő alvástípushoz tartozó szünetek mediánja és Q1–Q3 hozzáadva az utolsó ébredéshez; legalább 3 minta | Régi előzmény befolyásolja a típust; elavult utolsó ébredés; éjszakai mintakeverés |
| Alvásfejlődés | 3/6/12 hónap vagy egyedi tartomány, jelenlegi hónappal; havi átlagok, első/utolsó alkalmas hónap összevetése; ≥3 adatos dátum/hó, ≥2 hónap | Adatos dátum nem teljes nap; leghosszabb szakasz nevezője eltér a riportétól |
| Változásfigyelés | Utolsó 5 lezárt naptári nap és az azt megelőző 28 nap mediánjai; legalább 4/14 adatos dátum | Hiányos napló teljes napnak tűnhet; a szöveg 5 teljes napot ígér |
| Havi riport | Legutóbbi alkalmas lezárt hónap, ≥14 adatos dátummal; előző legfeljebb 3 alkalmas hónap átlagainak mediánja | Nem feltétlen legutóbbi lezárt hónap; hiányos napok, eltérő nevező |

A közös időhatár alapból nappal 06:00–19:00; kézi day/night felülírás létezik.
Az elemzési minimum 2 perc; a legalább 18 órás lezárt alvás kizárt, a jövőbeli
időpont toleranciája 60 másodperc. A legalább 12 órás aktív alvás külön
adatminőségi figyelmeztetés és kizárás. Ezek termékheurisztikák, nem ebben az
auditban igazolt élettani határok. A nyers napló megőrzésétől külön kezelendők.

Változásküszöbök: összes idő max(1 óra, 12%), leghosszabb max(1 óra, 18%),
nappal/éjjel max(45 perc, 15%), epizódszám max(1, 25%). Legalább 3 közelmúltbeli
nap azonos irányú, a küszöb 60%-át elérő eltérése kell; „strong” jelzéshez
1,5-szeres mediáneltérés és legalább 4 ilyen nap. Ez nem szignifikanciateszt.

A fejlődési mérföldkő 45 percnyi időváltozás vagy 0,75-tel kevesebb epizód.
A havi trend összes/leghosszabb idejénél 45 perc, nappali/éjszakai időnél
30 perc, epizódszámnál 0,5 a küszöb. Havi rekordjelzéshez legalább két korábbi
alkalmas hónap és az előző szélsőértékhez képest 30 perc / 0,5 eltérés kell.
A havi alap nem az összes nap súlyozott átlaga, és a hónapok nem szükségszerűen
szomszédosak. Ezt önmagában nem minősítjük képlethibának; meg kell nevezni.

## Tételes eltérések és lezárási feltételek

**P1:** a fizetős számítás megbízhatóságát érdemben érinti.
**P2:** P1 után, de szintén kiadás előtt lezárandó. Az S05/S09/S11/S14
modell- vagy jelentésbeli korlátot is jelöl; nem mindegyik puszta programhiba.
A forráshivatkozások a fenti vizsgált SHA-ra értendők.

### S01 — P2 — Perces léptetés eltolja a nappal/éjjel bontást

`src/utils.ts:97`, `src/sleepDevelopment.ts` / `splitClassified`.
18:59:30–19:02:30 esetén a `splitDayNight` 60/120 másodpercet ad,
az egzakt határos bontás helyesen 30/150-et. Az összidő megmarad, de a
besorolási hiba közel azonos aránynál típust is válthat.
**Lezárás:** közös, pontos időhatár-kezelés; másodperces kezdések 06:00/19:00,
éjfél és DST körül minden érintett modulban ugyanazt az eredményt adják.

### S02 — P1 — Éjszakai részébredésből „reggeli ébredés” lesz

`src/insights.ts` / `nighttimeByStartDay`, `wakeValues`.
Három 20:00–01:00 + 01:30–06:00 éjszaka medián ébredése 01:00;
4 szakaszminta és 3 megfigyelt nap keveredik. A leghosszabb, azonos kezdési
dátumú szakasz kiválasztása elveszíti az éjszaka utolsó ébredésének jelentését.
**Lezárás:** explicit éjszakacsoport és azon belüli első kezdés/utolsó ébredés,
vagy a szűkebb szakaszmutatót pontosan megnevező, jóváhagyott termékdöntés.
Az ébrenléti szüneteket nem szabad hozzáadni az alvásidőhöz vagy folytonos
alvásként összevonni. Megszakított, éjfél után kezdődő éjszaka is tesztelendő.

### S03 — P2 — Éjfél körüli óraidők mediánja délre kerül

`src/insights.ts` / `clockPattern`, `wakeValues`.
A 23:55, 00:05, 23:55, 00:05 végidők lineáris mediánja 12:00.
A lefekvésnél van eltolás, az ébredési mintánál nincs megfelelő körkezelés.
**Lezárás:** dokumentált körkörös óraidő-statisztika és tartomány; éjfél
környéki, szórt és kétcsúcsú mintára is érthető eredmény vagy elégtelen minta.

### S04 — P2 — Egy mintából kiemelt „tipikus” érték

`src/insights.ts` / `typicalMs`; `src/App.tsx:367`.
A 08:00–09:00 és 11:00–12:00 alvásból 1 minta, 2 órás medián és 2–2 órás
tartomány keletkezik. Az állapot `collecting`, a hero mégis megjeleníti.
A medián matematikailag helyes; a felületi bizonyosság/minimum minta nem egységes.
**Lezárás:** 0/1/2/3 mintás állapotot egyeztetett szabály vezérelje, és a
kevés adat ne nézzen ki stabil személyes mintának HU/EN/DE nyelven sem.

### S05 — P2 — A bizonyossági címke kizárólag mintaszámot jelent

`src/insights.ts` / `confidence`; `src/prediction.ts:129`; `src/App.tsx:366`.
Egyetlen nap 7 szünete már `medium`, a felirat „Stabilabb minta”. Nincs külön
napokhoz, szóráshoz vagy korábbi becslési pontossághoz kötött minősítés.
A wake-kártya globális címkéje a kiemelt alcsoport eltérő mintaszámához is kerülhet.
**Lezárás:** a címke az adott mutató tényleges bizonyítékát írja le. A Q1–Q3
a múltbeli minták középső 50%-a, nem validált előrejelzési konfidenciasáv.
Erősebb pontossági állítás csak külön visszaméréssel; addig semleges mintaszám.

### S06 — P1 — A kiválasztott időszakon kívüli adatok váltanak becsléstípust

`src/prediction.ts` / `nextBucket(cleanCompleted, now)`.
7 napos nézet, három közelmúltbeli kétalvásos nap és egy mai alvás mellett
`day-2` a következő típus. Húsz régebbi, a 7 napon kívüli egyalvásos nap
hozzáadása `night`-ra változtatja. A típus teljes előzményből, az időtartam
a kiválasztott ablakból számolódik.
**Lezárás:** azonos mintavételi időszak vagy kifejezetten dokumentált külön
kontextus; régi import ne változtassa meg észrevétlenül a „7 nap alapján” becslést.

### S07 — P1 — Többnapos hiányból aktuálisnak látszó becslés

`src/prediction.ts` / `lastCompleted`, `lastWake`; `src/App.tsx:423`.
Január 30-án 09:00-kor az utolsó január 28-i 06:00-s ébredésből még `ready`
állapot és január 28-i 08:00-s ablakvég képződik; az ébrenlét 51 óra.
A felület óraidőt és „elmúlt” állapotot ír, a kétnapos dátumkülönbséget nem.
**Lezárás:** friss, értelmezhető aktuális kontextus nélkül ne legyen aktuális
becslés; naplóhiány és elavult adat érthető állapota, szükség esetén dátum.
Nem szabad önkényes élettani ébrenléti határt tudományos tényként bevezetni.

### S08 — P1 — Hasonló napok aktív alvás közben

`src/similarDays.ts` / `snapshotForDay`, `sleepingAtCutoff`.
08:00–09:00 lezárt alvás és 11:00-tól aktív alvás mellett 12:00-kor
3 órás ébrenlét és `ready` eredmény adódik. Az aktív vég `now`, a vizsgálat
pedig `end > cutoff`, így az egyenlő határ nem jelzi az alvást.
**Lezárás:** aktív állapot explicit kezelése; lezárás után helyes újraszámolás;
pillanatnyi kezdés, éjféli aktív alvás és hibás aktív rekord külön próba.

### S09 — P2 — A legközelebbi nap nem feltétlen hasonló

`src/similarDays.ts` / `distance`, `candidates`.
Három korábbi 00:00–11:00 alvásos nap és egy mai 08:00–09:00 mellett
mindhárom találat megjelenik, noha az addigi alvásidő eltérése 10 óra.
Nincs elutasítási küszöb; a súlyok termékheurisztikák.
**Lezárás:** validált hasonlósági feltétel vagy következetesen „legközelebbi
elérhető napok” megnevezés az eltérés bemutatásával. A kor/naplórutin változásának
hatását értékelni kell; ez nem felhívás új életkori tanácsadó funkcióra.

### S10 — P1 — Eltérő nevező a leghosszabb alvásnál

`src/sleepDevelopment.ts` / `episodeStartsByDay`, `longestDays`;
`src/monthlyReport.ts` / `summarizeMonths`.
Havi 7 különálló, 20:00–08:00 közötti éjszaka 14 adatos dátumot érint.
A fejlődés 7 kezdési nappal oszt: 12 óra. A riport 14 nappal: 6 óra.
A szakasz teljes hossza a kezdési naphoz tartozik, másnap 0-s maximum marad.
**Lezárás:** közös mutató és nevező; „nincs kezdődő szakasz” ne legyen észrevétlen
nullás megfigyelés. A „leghosszabb alvás” felirat különítse el az időszaki
maximumot a napi maximumok átlagától. Hónapon átnyúló szakasz hozzárendelése
is dokumentált legyen: az összidő felosztása és a teljes szakasz más fogalom.

### S11 — P1 — Részleges napló alapján erős változásjelzés

`src/sleepDevelopment.ts` / `buildSleepDaySource`; `src/sleepChange.ts:65`;
`src/i18n.ts` / `changeCollectingPlain`.
14 korábbi, 10 órát tartalmazó nap és 4 közelmúltbeli, csupán 1 órát tartalmazó
nap elég `changed` és `strong` jelzéshez. A napló nem bizonyítja, hogy tényleg
csökkent az alvás: az új napok lehetnek hiányosan vezetettek is.
Az UI 5 teljes napot említ; a kód 4 adatos dátumot elfogad. Más modulokban is
adatosságot számolunk: 7 éjszaka 14 dátumként eléri a riport minimumát;
csak éjszakát tartalmazó napból a rutin 0 nappali alvást képezhet.
**Lezárás:** adatos dátum, teljes megfigyelés és valódi nulla külön fogalom;
összehasonlíthatóság/naplólefedettség jelzése, egységes minimumszöveg.
Ne állítsunk bizonyított gyermekbeli változást naplóhiányból. A megoldás
ne tegyen kötelező, mindennapos új adminisztrációt a szülőre.

### S12 — P2 — Régi riport „legutóbbi lezárt hónapként”

`src/monthlyReport.ts:87`; `src/i18n.ts` / `monthlyOwnData`.
Május/június elegendő adattal, július/augusztus adat nélkül: szeptember 20-án
június a kész riport. A hero dátuma helyes, de a lábléc legutóbbi lezárt hónapot
említ a legutóbbi alkalmas hónap helyett.
**Lezárás:** pontos időszak- és bázisfelirat, kihagyott hónapok érthető jelzése;
a részleges aktuális hónap és a lezárt havi riport ne legyen összetéveszthető.

### S13 — P1 — Ugyanaz az ütköző adat egyik helyen kizárt, másikon éjszaka

`src/utils.ts:114`; `src/insights.ts:87`;
`src/sleepDevelopment.ts` / `classifyUnion`.
Azonos 12:00–14:00 intervallum két külön ID-val, ellentétes day/night
felülírással: a minőségellenőrzés mindkettőt kizárja, a napi összesítés
2 órányi éjszakát számol. Azonos prioritásnál a night nyer, magyarázat nélkül.
**Lezárás:** közös vagy egyértelműen megnevezett kizárási/összevonási politika;
feloldatlan besorolási konfliktusból ne legyen látszólag tiszta éjszakai minta.
A nyers adatok megmaradnak. A pontos duplikátumok uniója külön, sikeres kontroll.

### S14 — P2 — Eszközidőzóna változtatja a napi mintaszámot

`src/sleepDevelopment.ts` / `dateKey`, `nextLocalBoundary`; a többi modul
helyi dátumcsoportosítása. Ugyanaz a január 1-i 21:30–23:30 UTC alvás UTC-ben
1, Budapesten 2 dátumot érint, Tokióban január 2-re esik. Az időtartam helyes.
Ez önmagában érvényes helyi értelmezés, de azonos családi adatokból más
eszközön eltérő napi átlag és minimum-minta teljesülés következhet.
**Lezárás:** családi vagy megjelenítői időzóna dokumentált döntése és jelzése;
utazás, DST és hónaphatár teszt. A 7 × 24 órás ablak és 7 naptári nap különbsége
szintén legyen tudatos; a pozitív DST-időtartamteszt nem dönt ezekről.

### S15 — P1 — Éjszakai visszaalvások torzítják az esti ébrenléti ablakot

`src/insights.ts` / `samples.bucket`; `src/prediction.ts` / `sampleBucket`.
Három nap 12:00–13:00 nappali alvás, 20:00–00:00, 00:15–03:00,
03:15–06:00 éjszakai szakasz mellett a night csoport 9 mintás mediánja
15 perc. Három 7 órás lefekvés előtti szünet és hat 15 perces éjszakai
visszaalvás keveredik. Ezt az UI éjszakai alvás előtti ablakként jeleníti meg.
**Lezárás:** esti lefekvés és éjszakai visszaalvás eltérő mintacsoport;
ugyanaz a csoportosítás a rutinban, ébrenléti ablakban és becslésben.
Az éjszakai szakaszok nem törlendők a naplóból, és a szünet nem alvásidő.

## Pontosítások: mi nem bizonyított hiba

- Az előző audit 5 perces alvásának heti „0 p” értékét tévesen a rövid alvás
  kiszűrésével magyaráztuk. A rekord megmarad: 5/7 perc napi átlag lefelé
  kerekítése ad 0-t. Az A21 és az eredeti bizonyítékleírás javítva.
  A tényleges 2 perces elemzési minimum külön szabály.
- A Hasonló napok tudatosan régebbi importált előzményben is keres; erre
  meglévő teszt és felirati magyarázat van. A 7/14/30 paraméter nem szűkíti
  a keresést. Ezt nem az S06 hibájával azonosítjuk. Az API jelentését és a
  „teljes előzmény” felirat mellett a 730 napos korlátot viszont egyeztetni kell.
- A későbbi alvás megjelenítése egy múltbeli hasonló napon visszatekintő adat;
  nem bizonyított előretekintő adatszivárgás. A hasonlóság az akkori óraidőig számol.
- A meglévő minimum minták és küszöbök hasznos óvatossági eszközök, de
  önmagukban nem igazolják a „stabil”, „várható” vagy „erős változás” pontosságát.
  A vizsgált forrásban és tesztekben nincs erre empirikus kalibráció.

## Javasolt javítási sorrend és elfogadás

Az alkalmazás egészében továbbra is **A01 adatmegőrzés az első fejlesztési
szelet**. A statisztikai javítás külön, az alábbi függőségi sorrendben történjen:

1. Közös számítási szabályok: nap/éjszaka/szakasz jelentése, időzóna,
   kizárások és naplólefedettség. S02/S10/S11/S13/S14/S15 együtt értelmezendő.
2. Az igazolt aktív- és elavultállapot-hibák, valamint a mintavételi ablak
   javítása: S06/S07/S08. Ez nem igényel új funkciót.
3. Pontos határszámítás, körkörös óraidők, mintaszám és feliratok:
   S01/S03/S04/S05/S09/S12; HU/EN/DE egyezéssel.
4. A hibát igazoló archív próbákból a kívánt eredményt kérő regressziós
   tesztek készüljenek. Ugyanaz a mesterséges napló minden kártyán végigmegy;
   változtatási/import/sync sorrend ne módosítsa azonos végállapot eredményét.
5. Két telefonon azonos gyermek/adatok/időzóna, aktív alvás, megszakított
   éjszaka, hiányos napló és hónaphatár felületi elfogadása. A hiányos adatot
   érthető jelzés kövesse, ne magabiztos, félrevezető következtetés.

Az archív bizonyítékok nem helyettesítik a jövőbeli javítások ellenőrzését.
A leíró irány, a hét kártya és az egyszerű főképernyő megőrizhető; nem szükséges
AI, több babakövetési mező vagy altatási tanács a számítások megbízhatóvá tételéhez.
