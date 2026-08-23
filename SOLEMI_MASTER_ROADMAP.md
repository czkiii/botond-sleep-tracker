# Solemi Sleep — Master Roadmap & Product Audit

Utolsó nagy frissítés: 2026-08-23

Ez a dokumentum a Solemi Sleep közös termék-, UX-, technikai és kiadási iránytűje. Nem végleges specifikáció: a célja az, hogy ne "eszetlenül kódoljunk", hanem minden nagyobb fejlesztés előtt tiszta legyen a cél, a függőség, a kockázat és az elfogadási feltétel.

## 1. Product vision

### Mi a Solemi Sleep?
A Solemi Sleep egy gyors, nyugodt, mobil-first babaalvás-követő alkalmazás, amely egyszerű rögzítésből valós, érthető és hasznos következtetéseket ad a családnak.

### Alapígéret
- Alvás rögzítése 1–2 koppintással.
- A család ugyanazt az adatot látja több készüléken.
- A statisztikák és későbbi becslések kizárólag ténylegesen rögzített adatokból készülnek.
- Az app ne legyen zsúfolt, ne legyen "tanácsadó zaj", és ne állítson biztosat ott, ahol csak becslés van.

### Mit NEM akarunk?
- Bullshit vagy átláthatatlan "Sleep Score".
- Felesleges gamification.
- Reklámos, olcsó hatású felület.
- Olyan AI-szöveg, amely nem vezethető vissza konkrét adatra.
- Túl sok főmenü / nehezen átlátható navigáció.

## 2. Jelenlegi állapot — audit

### Kész / működik
- [x] Mobil-first PWA
- [x] HU / EN / DE lokalizáció
- [x] Alvás indítás / leállítás
- [x] Manuális rögzítés és szerkesztés
- [x] Éjfél átlépés kezelése
- [x] Mai / tegnapi összesítés
- [x] Előzmények
- [x] Napi / heti / havi statisztikák
- [x] 24 órás kördiagram
- [x] Offline helyi működés
- [x] Backup / import-export alapok
- [x] Family Sync Cloudflare Worker + D1
- [x] Meghívókódos párosítás login nélkül
- [x] Családnév
- [x] Kéttelefonos konfliktuskezelés alapjai
- [x] Dupla Start valós teszt
- [x] Dupla Stop valós teszt
- [x] Offline vs online konfliktus valós teszt
- [x] Family Sync státusz / offline / pending / emberibb hibák

### Jelenlegi fő navigáció
- **Alvások**
- **Előzmények**
- **Statisztika**
- külön **Settings** gomb az Alvások képernyő felső részén

Ez a jelenlegi egyszerűség érték, ezért új funkció miatt nem automatikusan kerül be új fő tab.

## 3. Termék-alapelvek új funkciókhoz

Minden új funkciónak legalább egy feltételt teljesítenie kell:
1. Valós rögzített adatokból számolható hasznos információt ad.
2. Érezhetően gyorsabbá vagy kényelmesebbé teszi a napi használatot.
3. A családi együttműködést javítja.
4. Kiadási / biztonsági / üzleti szempontból szükséges.

Ha egyik sem igaz, nem kerül be csak azért, mert "jól hangzik".

## 4. Child Profile — következő nagy alap

### Cél
A mostani "baba neve" mezőből valódi gyerekprofil legyen.

### Tervezett adatok
- név
- opcionális becenév
- születési dátum
- később opcionális profilkép / szín

### Mit nyerünk a születési dátummal?
- pontos életkor nap / hét / hónap bontásban
- életkor szerinti statisztikai kontextus
- wake-window számítások összevetése saját életkori adatokkal
- trendek időbeli értelmezése
- későbbi többgyerekes kezelés alapja

### Multi-child elv
- Nem korlátozzuk mesterségesen két gyerekre az adatmodellt.
- A rendszer több gyermek kezelésére legyen képes.
- A gyerekváltó csak akkor jelenjen meg, ha legalább 2 profil van.
- Egy gyermeknél a UI maradjon olyan egyszerű, mint most.

### Nyitott kérdések
- Hol legyen a gyerekprofil szerkesztése?
- A Family egy családhoz több gyereket kezeljen, vagy gyerekenként külön adatfolyam legyen a háttérben?
- Gyerekváltás a headerben, settingsben vagy kontextuális menüben legyen?
- Profilváltás után minden képernyő azonnal az adott gyerek adataira váltson?

## 5. Adatból számolt új funkciók — jelöltek

### A. Wake Window Analytics
**Érték:** magas  
**Fejlesztési méret:** közepes

Saját adatokból számoljuk:
- előző ébredés → következő elalvás közötti idő
- napszak szerinti átlag
- 7 / 14 / 30 napos trend
- tipikus tartomány, nem egyetlen merev érték

Példa:
> Az elmúlt 14 napban a második nappali alvás előtt az átlagos ébrenléti idő 2 óra 11 perc volt.

### B. Következő alvás becslése
**Érték:** nagyon magas  
**Fejlesztési méret:** közepes / nagy

Adatforrások:
- aktuális ébrenléti idő
- hasonló napszakok
- utolsó 7–14 nap saját mintái
- utolsó alvás hossza
- idővel életkor

Kimenet inkább tartomány:
> Várható következő alvás: 13:30–14:00

Mindig legyen látható, hogy becslés, és miből számoltuk.

### C. Rutin- és mintafelismerés
**Érték:** magas  
**Fejlesztési méret:** közepes

Példák:
- "Az elmúlt 7 napból 6 napon 19:30–20:10 között kezdődött az éjszakai alvás."
- "A reggeli ébredés az elmúlt két hétben kb. 20 perccel korábbra tolódott."

### D. Konzisztencia és szórás
**Érték:** közepes / magas  
**Fejlesztési méret:** kicsi / közepes

Nem pontszám, hanem tényleges szórás / tartomány:
- esti elalvás ± perc
- reggeli ébredés ± perc
- nappali alvások száma / nap

### E. Nappali vs éjszakai alvás bontás
**Érték:** magas  
**Fejlesztési méret:** közepes

Automatikus, de felülírható besorolás szükséges lehet.

### F. Trendek
**Érték:** magas  
**Fejlesztési méret:** kicsi / közepes

- összalvás trend
- éjszakai alvás trend
- nappali alvás trend
- lefekvési idő trend
- ébredési idő trend
- nappali alvások száma

### G. "Hasonló nap" összevetés
**Érték:** kísérleti  
**Fejlesztési méret:** közepes

Későbbi prediction motorhoz jó alap lehet, de csak akkor építjük, ha valóban ad hozzá használható információt.

## 6. Kényelmi funkciók — jelöltek

### Gyors rögzítés
- most aludt el
- most ébredt
- gyors visszadátumozás

### "Még alszik?" emlékeztető
- csak opcionális
- nem zár le automatikusan sessiont
- irreálisan hosszú aktív alvásnál finom jelzés

### Adatminőség ellenőrzés
- gyanúsan hosszú session
- hiányzó / problémás időpont
- statisztikát torzító adat jelzése

### Megosztható napi összefoglaló
Példa:
> 12h 48m összalvás · 3 nappali alvás · 19:42 esti elalvás

### Export
- CSV
- később PDF / megosztható jelentés
- dátumtartomány választás

## 7. Navigáció — NEM eldöntött, csak tervezési alternatívák

A jelenlegi három főmenü erősség. Új Home vagy Insights csak akkor jön, ha valóban jobbá teszi az appot.

### Opció A — jelenlegi 3 tab megtartása
**Alvások · Előzmények · Statisztika**

Új funkciók a Statisztika képernyőn belül szekciók / lapok formájában:
- Áttekintés
- Trendek
- Wake window
- Becslés

**Előny:** minimális navigációs változás.  
**Kockázat:** Statisztika túlterhelődhet.

### Opció B — Insights lesz a Statisztika továbbfejlesztése
**Alvások · Előzmények · Insights**

Az Insights magában foglalja a mostani statisztikát + új intelligens elemzéseket.

**Előny:** nincs negyedik tab.  
**Kockázat:** az elnevezést és információs hierarchiát nagyon jól kell megoldani.

### Opció C — Home + History + Insights
Nagyobb UX-átalakítás.

**Előny:** jövőbiztosabb termékstruktúra.  
**Kockázat:** elveszíthetjük a mostani egyszerű, gyors Alvások képernyőt.

### Jelenlegi irány
**Még nem döntünk.** Előbb megtervezzük a Child Profile + első Insights funkciókat, és csak utána választunk navigációt.

## 8. Family Sync — termék és architektúra

### Jelenlegi modell
- fiók nélkül
- rövid meghívókód
- per-device token
- szerver-authoritative revision
- local-first kliens
- offline operation queue
- max. egy aktív alvás / család / gyerek irányba továbbfejlesztendő

### Recovery döntési irány
Nem cél egy korlátlan "örök cloud backup" szolgáltatás kiépítése csak azért, hogy minden elveszett készülék után garantált visszaállítás legyen.

Jelenlegi preferált modell:
- amíg legalább egy jogosult készülék megvan, új készülék meghívókóddal csatlakozhat;
- ha minden jogosult készülék elveszik, nincs jelenleg garantált recovery;
- ezt később külön üzleti / költség / adatmegőrzési döntésként újra lehet vizsgálni.

### Nyitott Family kérdések
- több gyerek sync modell
- max eszközszám
- családon belüli szerepkörök kellenek-e valaha
- adatmegőrzési idő
- inaktív családok tisztítása
- milyen ponton érdemes cloud adatot archiválni / törölni

## 9. Free vs Solemi Sleep Family

**NEM véglegesítjük, amíg a teljes termék feature-készlete nincs jobban kialakítva.**

Alapelv:
- előbb építünk egy erős, teljes terméket;
- utána osztjuk el a funkciókat Free és Family között;
- a Free ne legyen használhatatlan demo;
- a Family valódi plusz értéket adjon, ne csak mesterséges korlátozásokat oldjon fel.

Később subscription-ready backend kell:
- plan
- entitlementek
- trial státusz
- max devices
- feature flags

Fizetési szolgáltatót csak később kötünk rá.

## 10. Release-ready roadmap

### Termék
- [ ] Child Profile
- [ ] Multi-child alap architektúra
- [ ] első új adat-intelligencia funkciók
- [ ] végleges navigációs döntés
- [ ] Free / Family csomag döntés

### Technika
- [ ] adatmodell verziózás / migrációk
- [ ] multi-child Family Sync
- [ ] entitlement-ready backend
- [ ] hibalog / crash reporting stratégia
- [ ] staging / production folyamat átgondolása
- [ ] automatizáltabb tesztek

### QA
- [ ] regressziós tesztlista
- [ ] kéttelefonos sync tesztlista
- [ ] offline tesztlista
- [ ] időzóna / DST / éjfél edge case-ek
- [ ] import/export kompatibilitás
- [ ] többgyerekes adatizoláció teszt

### Privacy / legal
- [ ] Privacy Policy
- [ ] Terms / EULA szükségesség
- [ ] adatmegőrzési szabályok
- [ ] account nélküli auth modell dokumentálása
- [ ] gyermekhez kapcsolódó adatok adatvédelmi áttekintése

### Store / distribution
- [ ] saját domain döntés
- [ ] App Store / Google Play packaging
- [ ] Capacitor vagy más wrapper végleges döntés
- [ ] app ikon / screenshot készlet
- [ ] store description
- [ ] support contact / support flow

### Business / marketing
- [ ] konkurenciaaudit
- [ ] pricing kutatás
- [ ] célcsoport / positioning
- [ ] App Store keyword research
- [ ] landing page
- [ ] launch terv
- [ ] retention / trial / conversion mérés

## 11. Research backlog

Külön kutatási kör kell többek közt:
- Huckleberry
- Napper
- Baby Daybook
- Baby Tracker
- Nara Baby
- egyéb releváns sleep / baby tracking appok

Minden konkurensnél vizsgáljuk:
- onboarding
- navigáció
- sleep tracking UX
- multi-child
- family sharing
- prediction
- analytics
- pricing
- trial
- store reviews / visszatérő panaszok
- privacy / account modell

Nem cél a másolás; azt keressük, milyen problémát oldanak jól vagy rosszul.

## 12. Fejlesztési workflow — új szabály

Minden nagyobb feature előtt:
1. Probléma és felhasználói érték meghatározása.
2. UX terv / navigációs hely meghatározása.
3. Adatmodell-hatás.
4. Sync-hatás.
5. Migrációs terv.
6. Edge case lista.
7. Implementáció.
8. Build / regressziós teszt.
9. Kézi teszt csak ott, ahol tényleg szükséges.
10. Roadmap frissítése.

## 13. Következő döntési blokk — kérdések, amiket együtt meg kell válaszolni

### Child Profile
1. Kötelező legyen-e a születési dátum, vagy kérhető később is?
2. Ha valaki nem tudja / nem akarja megadni, mely funkciók maradjanak elérhetők?
3. Hol szerkeszthető a profil?
4. Kell-e becenév?

### Multi-child
5. Hogyan adunk hozzá új gyereket?
6. Hol váltunk gyereket?
7. A gyerekváltó csak 2+ profilnál jelenjen meg? **Jelenlegi preferencia: igen.**
8. Legyen-e bármilyen gyerekszám-limit? **Jelenlegi preferencia: ne legyen mesterséges limit az adatmodellben.**
9. Family Sync esetén minden családi készülék ugyanazokat a gyerekprofilokat látja?

### Navigáció
10. Maradjon a három fő tab?
11. A Statisztika nőjön tovább, vagy legyen Insights?
12. Kell-e valaha külön Home, vagy az Alvások maradjon a "home" funkciójú főképernyő?

### Prediction
13. Mennyi adat kell minimum egy becsléshez?
14. Mit mutatunk kevés adatnál?
15. Pontidő helyett tartomány legyen? **Jelenlegi preferencia: igen.**
16. Minden becslés mellett mutassuk-e röviden, miből számoltuk? **Jelenlegi preferencia: igen.**

## 14. Következő javasolt mérföldkő

**Milestone: Child Profile Foundation**

Mielőtt kódoljuk, együtt véglegesítjük:
- profil mezők
- többgyerekes adatmodell
- hozzáadás / váltás UX
- jelenlegi 3-tab navigáció megtartásának feltételei
- Family Sync multi-child követelményei
- backup / migráció hatása

Csak ezután kezdődik az implementáció.

---

### Decision log — jelenleg rögzített fontos döntések
- Solemi Sleep a fő márka.
- Solemi Sleep Family a családi / későbbi prémium termékvonal neve.
- A repo és GitHub Pages útvonal egyelőre nem változik.
- Family Sync account nélkül, invite kóddal működik.
- A szerver a szinkron kanonikus állapota.
- Újonnan csatlakozó eszköz cloud snapshotból indul.
- Nincs átláthatatlan Sleep Score.
- Új funkció vagy adatból számoljon, vagy valódi kényelmet adjon.
- A Free / Family szétosztást nem véglegesítjük túl korán.
- A jelenlegi egyszerű háromtabos navigációt értéknek tekintjük.
- Multi-child adatmodellt nem korlátozzuk két gyerekre.
- Gyerekváltó egygyerekes használatnál ne jelenjen meg.
