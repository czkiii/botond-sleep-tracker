# Solemi Sleep — Execution Plan

Utolsó nagy frissítés: 2026-08-23

Ez a dokumentum a `SOLEMI_MASTER_ROADMAP.md` végrehajtási párja. A roadmap azt mondja meg, **mit és miért** építünk; ez a fájl azt követi, **milyen sorrendben, milyen függőségekkel, kockázattal és kész definícióval** haladunk.

## Jelölések

- **P0** — blokkoló / azonnali
- **P1** — következő nagy fejlesztési blokk
- **P2** — fontos, de nem blokkolja a következő mérföldkövet
- **P3** — későbbi / opcionális / kutatási

Fejlesztési méret:
- **S** — kicsi
- **M** — közepes
- **L** — nagy
- **XL** — több nagy alrendszert érint

Kockázat:
- **Alacsony** — izolált UI / számítás, kevés adatmodell-hatás
- **Közepes** — több képernyő, migráció vagy sync-hatás
- **Magas** — core adatmodell + Family Sync + migráció + kompatibilitás

---

## 1. Aktuális mérföldkő — Child Profile Foundation

**Prioritás:** P1  
**Méret:** L  
**Kockázat:** magas  
**Cél:** a jelenlegi baba-név mezőből stabil, több gyerekre alkalmas profilrendszer legyen úgy, hogy az egygyerekes használat egyszerű maradjon.

### Scope
- név
- születési dátum
- opcionális becenév döntés
- több profilra alkalmas helyi adatmodell
- aktív gyerek fogalma
- sessionök egyértelmű `childId` kötése
- gyerekprofilok Family Sync-kompatibilis modellje
- backup / import migráció
- egygyerekes UI-ban nincs felesleges gyerekváltó
- 2+ profil esetén megjelenő gyerekváltó

### Függőségek
- UX-döntés a profil szerkesztési helyéről
- UX-döntés a gyerekváltás helyéről
- Family Sync multi-child szervermodell
- storage schema migrációs terv

### Fő kockázatok
- régi sessionök elvesztése vagy rossz gyerekhez kötése
- Family Sync revision és child scope összekeverése
- backup kompatibilitás törése
- egy aktív alvás szabályának pontosítása: családonként vagy gyerekenként

### Definition of Done
- régi egygyerekes adatok automatikusan migrálódnak egy profil alá
- egy gyereknél a jelenlegi fő UX egyszerűsége megmarad
- több gyereknél minden alvás egyértelműen a kiválasztott gyerekhez tartozik
- két külön gyereknek lehet egymástól független aktív alvása, ha ezt véglegesítjük
- Family Sync mindkét telefonon ugyanazokat a profilokat és gyerekhez kötött sessionöket mutatja
- import/export nem kever gyerekeket
- HU / EN / DE szövegek elkészülnek
- regressziós teszt kész

### Kódolás előtt közösen eldöntendő
1. Kötelező-e a születési dátum?
2. Kell-e becenév V1-ben?
3. Hol szerkesztjük a gyerekprofilt?
4. Hol jelenik meg a gyerekváltó 2+ profilnál?
5. Gyerekenként lehessen-e külön aktív alvás? **Technikailag ezt tartjuk logikus iránynak.**
6. Family Sync minden családi eszközön automatikusan ossza-e az összes gyerekprofilt? **Jelenlegi javaslat: igen.**

---

## 2. Adat-intelligencia alapok

### 2.1 Wake Window Analytics
**Prioritás:** P1  
**Méret:** M  
**Kockázat:** közepes

**Felhasználói érték:** saját adatokból mutatja, mennyi ébrenlét előzi meg tipikusan az egyes alvásokat.

**Függőség:** Child Profile + stabil nappali/éjszakai és session sorrend.

**Definition of Done:**
- ébredés → következő elalvás intervallum számolható
- 7 / 14 / 30 napos nézet
- napszak / napi alvássorrend szerinti bontás, ha elég adat van
- nincs állítás kevés adatból
- konkrét átlag + tartomány jelenik meg
- minden érték visszavezethető a rögzített sessionökre

### 2.2 Trend Engine
**Prioritás:** P1  
**Méret:** M  
**Kockázat:** alacsony / közepes

**Scope:**
- napi összalvás trend
- nappali / éjszakai alvás trend
- lefekvési idő
- ébredési idő
- nappali alvások száma
- konzisztencia / szórás

**Definition of Done:**
- nincs mesterséges score
- időablakok összehasonlíthatók
- szélsőséges / hibás adat nem torzíthat csendben
- trend iránya és nagysága számszerűen megjelenik

### 2.3 Nappali vs éjszakai besorolás
**Prioritás:** P1  
**Méret:** M  
**Kockázat:** közepes

**Nyitott kérdés:** fix napszak, adaptív szabály vagy felülírható automatikus besorolás.

**Definition of Done:**
- besorolás determinisztikus
- felhasználó érti, mit tekintünk nappalinak / éjszakainak
- szükség esetén korrigálható
- statisztika ugyanazt a szabályt használja mindenhol

---

## 3. Prediction

### Sleep Prediction Lite
**Prioritás:** P2  
**Méret:** L  
**Kockázat:** közepes / magas

**Cél:** következő várható alvás **tartományának** becslése saját adatokból.

**Nem cél:** orvosi tanács, biztos pontidő, fekete dobozos AI.

**Bemenetek jelöltjei:**
- aktuális ébrenléti idő
- utolsó alvás hossza
- hasonló napszakok
- elmúlt 7–14 nap wake window mintái
- életkor
- napi alvássorrend

**Definition of Done:**
- minimum adatmennyiség rögzítve
- kevés adatnál nincs hamis pontosság
- tartományt ad, nem egyetlen percet
- rövid indoklás: miből számoltuk
- bizonytalanság látható
- algoritmus determinisztikusan tesztelhető

**Kutatási kapu:** implementáció előtt konkurenciaaudit + saját tesztadatokon offline prototípus.

---

## 4. Kényelmi funkciók

### 4.1 Gyors rögzítés finomítása
**Prioritás:** P2  
**Méret:** S/M  
**Kockázat:** alacsony

**Cél:** kevesebb koppintás, gyors visszadátumozás.

### 4.2 „Még alszik?” emlékeztető
**Prioritás:** P2  
**Méret:** M  
**Kockázat:** közepes

**Szabály:** opcionális, nem zár le automatikusan alvást.

### 4.3 Adatminőség ellenőrzés
**Prioritás:** P1  
**Méret:** M  
**Kockázat:** alacsony / közepes

**Cél:** prediction és analytics előtt kiszűrni a torzító sessionöket.

**Jelöltek:**
- irreálisan hosszú aktív session
- end <= start
- nagyon hosszú / extrém session
- duplikációgyanú
- hiányos import

### 4.4 Megosztható napi összefoglaló
**Prioritás:** P2  
**Méret:** M  
**Kockázat:** alacsony

### 4.5 Export 2.0
**Prioritás:** P2  
**Méret:** M  
**Kockázat:** közepes

CSV előbb, PDF később. Dátumtartomány + gyerek kiválasztás szükséges.

---

## 5. Navigációs döntési kapu

**Prioritás:** P1  
**Kódolás:** csak Child Profile és első analytics UX váz után.

### Megőrzendő alapérték
A jelenlegi:
**Alvások · Előzmények · Statisztika + külön Settings**
ma gyors és átlátható.

### Döntési kritériumok
Új fő tab csak akkor jön, ha:
- a jelenlegi Statisztika ténylegesen túlterhelődik;
- az új funkciók napi használatban önálló célterületet alkotnak;
- kevesebb navigációs súrlódást okoz, mint amennyit hozzáad.

### Kötelező prototípusok döntés előtt
- A: 3 tab marad, Statisztika belső szekciókkal
- B: Statisztika → Insights
- C: Home / History / Insights

**Definition of Done:** nem „érzésre” választunk; a három verziót konkrét információs hierarchiával összevetjük.

---

## 6. Family Sync — következő evolúció

### Multi-child Sync
**Prioritás:** P1  
**Méret:** XL  
**Kockázat:** magas

**Fő elv:** session mindig `childId`-hoz tartozik.

**Vizsgálandó szerver-szabály:** egy aktív alvás **gyerekenként**, nem családonként.

**Definition of Done:**
- profil create/update sync
- gyerekhez kötött session CRUD
- gyerekenkénti aktív-session constraint
- offline queue megtartja a child scope-ot
- join snapshot minden profilt helyesen hoz
- delete/edit/start/stop konfliktusok gyerekenként izoláltak

### Recovery
**Prioritás:** P3 / későbbi üzleti döntés

Nem blokkolja a kiadást. Jelenlegi modell: meglévő jogosult készülék invite kóddal visszahívhat új készüléket.

### Cloud retention / költség
**Prioritás:** P2 research

Kiadás előtt dönteni kell:
- mennyi ideig marad adat a cloudban aktív Family használatnál
- mi történik inaktív családnál
- lemondás után mi történik
- szükséges-e archiválás / törlés

---

## 7. Subscription-ready rendszer

**Prioritás:** P2  
**Méret:** M/L  
**Kockázat:** közepes

Fizetés nélkül megépíthető.

### Backend alap
- `plan`
- entitlementek
- trial állapot
- max devices
- feature flags
- később billing provider reference

### Definition of Done
- app funkciói entitlementből engedélyezhetők
- nincs fizetési szolgáltatóhoz kötve a core app
- tesztcsalád kézzel Family jogosultságot kaphat
- később StoreKit / Play Billing / Stripe ráilleszthető adatmodell-törés nélkül

### Csomagolási döntés
Free vs Solemi Sleep Family **csak a teljesebb termék után véglegesül**.

---

## 8. Release Engineering

### P1 — szükséges kiadás előtt
- stabil adatmodell migrációk
- regressziós tesztlista
- backup/import kompatibilitás
- staging vs production stratégia
- hibalog / crash reporting döntés
- privacy és adatmegőrzési modell

### P2 — store packaging
- Capacitor döntés
- iOS build
- Android build
- app signing
- store metadata
- ikon / screenshot készlet
- support flow
- saját domain döntés

### Definition of Done — release candidate
- új telepítés működik
- upgrade régi verzióról működik
- offline alapfunkciók működnek
- Family Sync regresszió tesztelve
- többgyerekes izoláció tesztelve
- adatvesztéses ismert bug nincs
- privacy/terms elérhető
- store review követelményei teljesülnek

---

## 9. QA rendszer

Minden nagy feature kapjon saját tesztmátrixot.

### Kötelező kategóriák
- happy path
- offline
- két készülék
- stale UI
- gyors dupla interakció
- app háttérbe / előtérbe
- reload
- éjfél
- időzóna
- DST
- import/export
- migráció
- több gyerek
- törlés vs szerkesztés

### Release gate
P0/P1 ismert adatvesztési vagy sync bug mellett nincs release candidate.

---

## 10. Research program

### Konkurenciaaudit
**Prioritás:** P1/P2 folyamatos

Vizsgálandó:
- Huckleberry
- Napper
- Baby Daybook
- Baby Tracker
- Nara Baby
- további releváns appok

Minden appnál:
- onboarding
- napi rögzítés sebessége
- navigáció
- multi-child
- family sharing
- prediction módszer és kommunikáció
- analytics
- pricing / trial
- store rating és visszatérő panaszok
- adatkezelési modell

### Kutatási szabály
Nem funkciót másolunk. Problémát, felhasználói elvárást és piaci rést azonosítunk.

---

## 11. Business / kiadói szerep

### Kiadás előtt tisztázandó
- célpiac első körben
- HU/EN/DE launch egyszerre vagy fokozatosan
- pricing teszt
- havi vs éves súlyozás
- trial
- Family entitlement pontos értéke
- store fee / backend költség modell
- privacy / support költség

### Mérőszámok később
- install → first sleep conversion
- D1 retention / D7 / D30
- Family pairing rate
- trial → paid conversion
- churn
- sync error rate
- crash-free sessions

Nem gyűjtünk analitikát csak azért, mert lehet; csak olyan mérés kerül be, amelyhez konkrét termékdöntés tartozik.

---

## 12. Marketing csak feature-complete után

**Prioritás:** P3 jelenleg

Későbbi scope:
- positioning
- landing page
- store screenshots
- demo videó
- ASO
- launch messaging
- creator / parenting community outreach vizsgálata
- review / feedback loop

Marketing állítás csak olyan funkcióról tehető, amely ténylegesen működik és tesztelt.

---

## 13. Döntési napló használata

Nagy döntés után a master roadmap Decision Log része frissül.

Rögzítendő:
- döntés
- dátum
- rövid ok
- milyen alternatívákat vetettünk el
- kell-e később újravizsgálni

Ez azért fontos, hogy 2 hónap múlva ne kelljen újra kitalálni, miért lett valami úgy, ahogy.

---

## 14. Következő konkrét sorrend

1. **Child Profile kérdések véglegesítése**
2. **Multi-child adatmodell specifikáció**
3. **Family Sync multi-child terv**
4. **Migráció / backup terv**
5. **Child Profile implementáció**
6. **Multi-child regresszió + kéttelefonos teszt**
7. **Adatminőség engine**
8. **Wake Window Analytics**
9. **Trend Engine + nappali/éjszakai modell**
10. **Navigációs prototípus-döntés**
11. **Sleep Prediction Lite prototípus**
12. **Subscription-ready entitlement rendszer**
13. **Release engineering / legal / store csomagolás**
14. **Free vs Family végleges csomagolás**
15. **Launch + marketing**

A sorrend nem kőbe vésett; minden mérföldkő után auditáljuk, hogy az új tapasztalat változtat-e rajta.
