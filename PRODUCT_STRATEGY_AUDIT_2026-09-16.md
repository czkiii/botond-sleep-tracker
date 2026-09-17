# Solemi Sleep — termékstratégiai és piacra lépési audit

**Utólagos pontosítás — 2026-09-17:** az audit készítése után a tulajdonos tisztázta a valós felhasználói igényfeltárást, a havi 990/1490 Ft-os árakat és a jelentések leíró/visszatekintő szerepét. Elfogadott irány a `PRODUCT_DIRECTION.md`: Free / Family / Family+ marad, bármely aktív tag előfizetése családi hozzáférést ad az adott csomaghoz. Az alábbi csomagösszevonási és EUR-árazási ajánlatok történeti, nem elfogadott hipotézisek; nem ezekből kell implementálni.

**Ajánlás:** gyors, alvásra összpontosító naplót érdemes kiadni azoknak a szülőknek, akik elsősorban emlékezni szeretnének az alvásokra, javítani a feljegyzéseket, és szükség esetén együtt követni a napot. A meglévő termék ehhez már elég gazdag. A következő értékteremtő lépés a megbízhatóság és az érthetőség javítása, majd annak megfigyelése, hogy idegen családok segítség nélkül is visszatérnek-e hozzá.

Ez **ígéretes irány, nem bizonyított piaci rés**. Jelenleg nincs bizonyíték arra, hogy a Solemi számottevően jobb választás a konkurenseknél, vagy hogy az elemzéseiért fizetnének. Nem szükséges funkciószámban győzni, de az „egyszerű” jelző önmagában kevés: a használatnak kell ezt igazolnia.

**Auditállapot:** 2026-09-16; `feat/child-profile-v4`; HEAD `8de2928` — `Document monetization audit and sync bug checkpoint`. A munkafa az audit elején tiszta volt. Ez önálló döntés-előkészítő dokumentum; nem módosítja a korábban lezárt funkciómátrixot vagy architektúrát. Alkalmazáskód, konfiguráció, távoli adatbázis és telepítés nem változott.

**A tulajdonos válaszai:** siker = rendszeresen használó családok és kis, fenntartható mellékbevétel; induláskor mindkét áruház szükséges; rendelkezésre áll heti 5–8 óra. Nyolc hétre ez körülbelül 40–64 munkaóra, amelyből tesztelői beszélgetésekre és hibákra is kell tartalék.

**Bizonyítékszintek:** „tény” = forrásból vagy kódból ellenőrzött; „megfigyelés” = az audit helyi böngészős próbája; „következtetés” = ezek értelmezése; „hipotézis/javaslat” = még tesztelendő. A korábbi telefonos sikerek felhasználói beszámolók, nem ebben az auditban megismételt tesztek. A helyi felületet üres adatokkal, kikapcsolt accounttal és szinkronnal vizsgáltam; konkurens alkalmazásokba nem jelentkeztem be, nem vásároltam. Ez nem teljes biztonsági vagy jogi audit.

**1. Mi a Solemi ma?**

| Terület | Ellenőrzött jelenlegi állapot | Elfogadási határ |
|---|---|---|
| Alapnapló | Megvalósult indítás/leállítás, kézi bevitel, időkorrekció, megjegyzés, nappal/éjjel felülbírálás, előzmény és törlés. | A főképernyőt helyben megvizsgáltam; minden készülékes és háttérből visszatérési esetet most nem futtattam újra. |
| Gyermekprofilok | Több gyermek, külön alvások, név/születési dátum és helyi fénykép. | A gyermekarchiválás terv; a fotó hordozhatósága nem azonos a naplóadatok szinkronjával. |
| Alapstatisztika | Napi/heti/havi és egyedi időszak, idővonal és összesítések a kódban és a felületen. | Az egyedi időszak tehát már létezik; nem szükséges új prémiumígéretként megépíteni. |
| Haladó elemzések | Ébrenléti ablak, rutinok, hasonló napok, változások, alvásfejlődés, havi riport, Prediction Lite számításai megvannak. | A tesztelt matematika nem bizonyítja a szülői hasznosságot vagy az előrejelzések valós pontosságát. |
| Google-belépés | Account/session és staging Google-auth megvalósult; a tulajdonos sikeres belépést, tartós munkamenetet és kijelentkezést jelzett. | Natív iOS/Android belépés nem készült el; fióktörlés nincs kész. |
| Családi használat | Család, meghívás, accountos visszacsatlakozás, függő változások és konfliktusválasztó megvalósult. A tulajdonos párjával normál szinkron és adat-visszatöltés működött. | **A kéttelefonos konfliktusteszt duplikációt és eltérő előzményeket mutatott. Nem elfogadott teljes egészében.** |
| Jogosultságok | Staging szerver ellenőrzi az aktív családi szinkronjogot; providerfüggetlen előfizetési és jogosultsági táblák vannak. | A manuális tesztjog nem bolti vásárlás. A statisztikák prémiumkapuja a kliens tesztcsomagját használja; production ágú futásban a függvény `familyPlus` értéket ad. |
| Mentés | V4 JSON export/import, V3 migráció, importellenőrzés; import előtt meglévő adatok exportja. | Nem PDF, nem CSV, nem verziózott felhős biztonsági mentés. A helyi fotófájlok nem kerülnek a JSON-ba. |
| Emlékeztetés | 12 órán túli aktív alvás figyelmeztetése a felületen. | Nem háttérben időzített push. Kézi/adaptív értesítés és PDF-export még tervezett. |
| Terjesztés | React/TypeScript/Vite webalkalmazás PWA-támogatással; külön internal Pages és staging Worker/D1. | Nincs kész natív áruházi projekt, StoreKit/Play Billing integráció vagy vásárlás-visszaállítás. |

A `RELEASE_CHECKLIST.md` és státusz korábbi sikeres automatizált ellenőrzéseket rögzít. Az audit során ezeket nem futtattam újra, és nem minősítem a mostani teljes rendszert tesztelten kiadhatónak. A dokumentáció történeti bekezdései helyenként régebbi állapotot mondanak; a kód és a későbbi checkpoint együtt értelmezendő.

**2. Egyszerűség: a fő folyamatok**

| Folyamat | Ami jó | Súrlódás és javaslat |
|---|---|---|
| Első használat | Fiók nélkül, azonnal látható „Elaludt” gomb. | Az üres „Névtelen profil” és a korábbi ébredés nélküli 00:00:00 nem magyarázza a kezdőállapotot. Rövid, helyben megjelenő magyarázat elég; ne legyen kötelező kérdőív. |
| Napi rögzítés | Egy fő cselekvés; gyors −5/−10/−15 perces korrekció. | Ezt őrizném meg. Valós telefonon mérendő az egykezes használat, kis kijelző, nagy betűméret, kontraszt és képernyőolvasó. A desktop nézet nem igazolja ezeket. |
| Javítás/előzmény | Meglévő bejegyzés szerkesztése megtartja annak azonosítóját; dátum/idő/megjelölés módosítható. | A szinkronkonfliktusnál a két változat konkrét ideje és tartalma helyett általános választógombok vannak. A döntéshez látni kellene, mit választ a szülő. |
| Statisztika | Használható alapgrafikonok és teljes történet. | Hét haladó kártya, több külön időszakválasztó; Free-ben hét zárolt kártya. Egy alapösszefoglaló és egy visszafogott, konkrét prémiumbemutató egyszerűbb lehet. Előbb használati próbával igazoljuk. |
| Gyermekváltás | Több gyermeknél külön kapcsoló; egy gyermeknél nincs felesleges váltó. | A törlés és későbbi archiválás külön fogalom. Archiválás nélkül is lehet indulni, ha a meglévő törlés hatása világos. |
| Belépés/megosztás | Google-belépés, meghívó, saját másik eszköz visszacsatlakozása létezik. | A felhasználó egyszerre találkozik accounttal, családdal, csomaggal, eszközzel és szinkronnal. A felületen a „Közös napló” és „Partner meghívása” legyen a kiindulás; a technikai állapot maradjon részletekben. |
| Mentés/visszaállítás | Exportálható saját adat, ellenőrzött import. | Pontosan el kell különíteni: ezen az eszközön mentve; közös naplóba szinkronizálva; letöltött biztonsági másolat. A bejelentkezés önmagában nem backup. |

**Konkrét hibák és kockázatok:**

- **Nyitott, felhasználó által tapasztalt hiba:** az egyik telefonon ugyanazon alvás eredeti és mindkét módosított változata látszott, a másikon csak a saját módosítás. Következő fejlesztéskor azonos build, azonos bejegyzésazonosító, függő műveletek és szerverállapot összevetése kell. Az ok nem bizonyított; nem nevezem ezt pusztán megjelenítési vagy azonosítóhibának. A részletes checkpoint már szerepel a `CODEX_PROJECT_STATUS.md` végén.
- **Kódból igazolt félrevezető szöveg:** a Beállítások feltétel nélkül azt írja, hogy az adatok kizárólag ezen az eszközön maradnak. Ez a bekapcsolt családi szinkronnal nem egyeztethető össze.
- **Kódból következő adatkezelési veszély:** az „összes alvásadat törlése” kiüríti a sessions listát; az import lecseréli az adatállapotot. A mentési eseményeket a családi réteg változásként kezeli, az eltűnt bejegyzésekből DELETE műveletek készülnek. Kapcsolt naplóban ezt nem szabad puszta helyi takarításként bemutatni. A pontos eszközök közötti hatást izolált tesztben kell ellenőrizni; most nem töröltem adatot.
- **Kódból következő helyreállítási kockázat:** hibásan olvasható/érvénytelen helyi adatnál a betöltés alapadatokra esik vissza, az App automatikusan ment. Ez elfedheti és felülírhatja a hibás eredetit. Kiadás előtt sérült adattárolós teszt és az eredeti megőrzése szükséges; ezt most nem reprodukáltam a felhasználó adatain.
- **Helyi megfigyelés:** üres naplóban az ébrenléti ablak kártyája futó alvásra hivatkozó magyarázatot mutatott, bár nem futott alvás. A „még nincs adat”, „éppen alszik” és „ellentmondó adat” külön állapot legyen.
- **Kódból következő UX-kockázat:** távoli változás több helyen teljes oldalújratöltést indít. Ez megszakíthat szerkesztést; a veszteséget nem reprodukáltam. A teszttervbe kerüljön a nyitott szerkesztő melletti távoli módosítás.

**A becslés és a prémiumérték fontos pontosítása:** a mostani Prediction Lite legalább **3 megfelelő mintát** kér az adott alvási kategóriából. 7 mintától „medium”, előtte „low” jelzést ad; 7/14/30 nap a visszatekintési ablak. Ez nem 7 kötelező nap, és nem mért pontosságú valószínűség. Saját előzmények mediánját és kvartiliseit használja, születési dátumot nem kap. A korábbi audit 7 napos figyelmeztetése a tervből következett, nem ezt a konkrét implementációt írta le.

A havi riport viszont legalább **két lezárt hónapot**, mindkettőben legalább **14 rögzített napot** igényel. Új felhasználónak emiatt nem jó fő vásárlási érv egy 7 napos próbában. Nem új riport kell elsőként, hanem a már elérhető érték őszinte bemutatása és a későbbi elemzések háttérbe helyezése.

**3. Technikai felépítés: megtartani, célzottan javítani**

**Tény:** a számítások külön modulokban vannak, az alapadatmodell többgyermekes, vannak migrációk és tesztek. A Worker elkülöníti a fiókot, tagságot és jogosultságot. Ez használható alap; teljes újraírásra az audit nem ad indokot.

**Következtetés:** a legnagyobb fenntartási teher a helyi állapot, felhő, függő módosítás és belépés összekapcsolása. Az App és FamilySyncLayer külön gyökérkomponens, custom eseményekkel, helyi tárhellyel, DOM-megfigyelővel és újratöltésekkel kapcsolódik. Később egy közös, egyértelmű adat- és szinkronállapot csökkentheti a rejtett kölcsönhatásokat. Ez célzott egyszerűsítés legyen a reprodukálható hibák körül, ne új keretrendszer vagy általános refaktorprojekt.

További kiadási ellenőrzések: reprodukálható függőségtelepítés (a repóban nincs lockfile, CI `npm install`-t használ); frissítés alatti adatmegőrzés; offline mód és újracsatlakozás; időzóna/óraátállítás; párhuzamos módosítás és törlés; másik gyermek; lejárt jogosultság; harmadik eszköz. Az internal build nem regisztrál service workert, ezért a sikeres internal telefonpróba nem igazolja a production PWA frissítési/offline működését.

**4. Konkurensek és a fizetős határok**

Elsődleges termékoldalak/súgók alapján, 2026-09-16. Ezek a szolgáltatók saját állításai, nem független pontosságmérések. Az áruházi régiók és ajánlatok eltérhetnek. Ingyenes letöltést vagy próbát nem számítok tartósan ingyenes funkciónak.

| Alternatíva | Ellenőrzött releváns kínálat | Következtetés a Solemire |
|---|---|---|
| Huckleberry | Free naplózás, alapriportok és gondozói szinkron; a megosztás ugyanazzal a bejelentkezéssel működik. [Hivatalos Free oldal](https://huckleberrycare.com/product/free) | Az alap szinkron fizetős volta önmagában gyenge választási érv. A külön partnerfiók kényelmi különbség, de nem automatikus fizetési indok. |
| Baby Daybook | Saját aktuális leírásuk szerint a következő alvás előrejelzése és alapstatisztika ingyenes; teljes napi előrejelzés, Family Sync és haladó riport fizetős. A közvetlen oldal időnként 502 hibát adott, az aktuális keresőben a hivatalos cikk tartalma elérhető volt. [Saját funkcióbontás](https://babydaybook.app/blog/best-baby-sleep-tracking-apps-2026/) | A következő alvás puszta becslése nem kizárólag fizetős piaci képesség. Ugyanakkor nem igaz, hogy minden konkurens ingyen szinkronizál. |
| Napper | A Free/Unlimited táblában napi alvásnapló és életkori ütemezés Free; személyre szabás és haladó statisztika Unlimited. A táblázat pipáit a korábbi audit HTML-ben is ellenőrizte. Az aktuális webes éves ár 47,99 EUR. [Árlista](https://napper.app/en/pricing/) | Az alvásfókusz sem üres piac. Általános életkori információért külön fizetést kérni gyenge; személyes elemzés más érték. |
| Baby Tracker — Nighp | GYIK-jük szinkront ír le; a teljes verzió előnyei közt Watch/Siri/reklámmentesség szerepel. Az újabb iOS-leírás a What’s Next becslést próba utáni Plus-funkcióként írja. [GYIK](https://www.nighp.com/babytracker/babytracker_faq.html), [iOS](https://apps.apple.com/us/app/baby-tracker-newborn-log/id779656557) | A szinkron ingyenessége közepes bizonyosságú a régebbi GYIK miatt; a becslést nem sorolom biztosan ingyenesnek. |
| Nara Baby | A korábbi, ugyanaznapi audit aktuális FAQ-ja fizetős használatot/próbát írt, miközben régebbi leírások ingyenes appot említenek. A FAQ most nem volt stabilan újranyitható. [FAQ](https://nara.com/pages/nara-baby-app-faqs), [Google Play](https://play.google.com/store/apps/details?id=com.naraorganics.nara&hl=en) | **Nem tekintem biztos, tartósan ingyenes ellenpéldának.** Friss készülékes ellenőrzés nélkül erre ne építsünk döntést. |
| nappi, kiegészítő példa | Hivatalos FAQ: ingyenes családi szinkron, CSV, napi riport; 14 nap előzmény. Prémium: személyes becslés és mélyebb riport, egy előfizetés a háztartásra. 3,99 USD/hó vagy 39,99 USD/év a weben. [Hivatalos oldal](https://www.nappi.app/) | A szinkron + ingyenes export alternatíva bizonyítottan létezik. A CSV nem azonos PDF-fel; teljes ingyenes helyi előzményünk ehhez képest valós különbség. Nem állítok piacvezető státuszt. |

**Gyenge paywall-elemek:** alap partneri együttműködés; saját másik eszköz adatfolytonossága; aktuális ébrenléti idő és alapösszesítések; általános életkori támpont; kizárólag a „következő alvás” címke; külön fizetés ugyanazon családi elemzés másik szülő általi megtekintéséért. A PDF kiegészítő lehet, de önmagában kevés rendszeres értéket ígér, és jelenleg még nincs kész.

Pontosítás: az aktuális ébrenléti idő **már látszik a Solemi főképernyőjén**. A zárolt elemzési kártya átfedése ezért nem azt jelenti, hogy a teljes alapadat fizetős. Az alap havi grafikon is elérhető; ne áruljuk ugyanezt új néven.

**Mi nem bizonyított versenyelőny?** Az egyszerűséget mások is ígérik; a magyar nyelv önmagában nem védhető előny; az alvásfókusz nem egyedülálló. A fiók nélküli kezdés és saját előzmények átláthatósága valós termékjellemző, de választási erejük tesztelendő. A local-first működés nem jelent végpontok közötti titkosítást. Nem állítom, hogy a konkurensek rosszul használhatók: erre most nincs összehasonlító felhasználói teszt.

**5. Legfeljebb három reális pozicionálás**

| Irány | Kinek és milyen helyzetben? | Választási ok és kompromisszum | Legolcsóbb próba |
|---|---|---|---|
| **A. Gyors, nyugodt alvásnapló — elsődleges** | Szülőknek, akik naponta többször rögzítenek alvást, de nem akarnak teljes babamenedzsmentet vagy részletes napirendi tanácsadót. Első toborzás magyar nyelven. | Kevés teendő, gyors javítás, saját történet; partner opcionális. Kisebb funkciókörért nem mindenki fizet, a haladó elemzések nem lehetnek útban. | 5–10 külső család 14 napig; első rögzítés/javítás segítség nélkül. Válasszanak a saját megszokott módszerük és a Solemi között. |
| B. Közös alvásnapló váltásban gondozóknak | Két szülő vagy más gondozók, akik rendszeresen átadják egymásnak a gyermeket. | Mindketten ugyanazt látják, kevesebb visszakérdezés. Ingyenes konkurens együttműködés létezik; a mostani konfliktushiba kizárja a megbízhatósági ígéretet. | Öt pár önálló meghívása, egy hét valódi átadás; megkérdezni, mit kellett korábban üzenetben egyeztetniük. |
| C. Fiók nélkül induló, helyben használható napló | Aki nem akar regisztrálni vagy felhőbe tölteni minden feljegyzést. | Azonnali kezdés, helyi adat és export. A böngészőtárhely nem garantált backup; az opcionális felhő határát őszintén el kell mondani. Fizetési hajlandóság bizonytalan. | Öt ilyen szülőnél megfigyelni, valóban elutasítják-e a fiókos alternatívát, és önállóan tudnak-e menteni/visszaállítani. |

**Ajánlott üzenet tesztelésre:** „Alvásnapló, amit félálomban is könnyű vezetni. Rögzítsd, javítsd, és kövesd együtt a pároddal.” Az utolsó mondat csak a szinkron elfogadása után lehet nyilvános ígéret.

Az A irányt választanám, B-t támogató használati helyzetként. Nem szűkíteném mesterségesen ikrekre, alvászavarokra vagy valamely nevelési módszer követőire. Az egyedül gondozó szülőt sem zárnám ki. A magyar indulás toborzási fókusz, nem bizonyított piaci méret vagy kizárólagos nyelvi cél.

**Mi cáfolná?** Ha tíz valóban célcsoportba tartozó családból legfeljebb kettő marad aktív a második héten, többségük inkább a korábbi megoldást használja, és nem tud konkrét könnyebbséget megnevezni, az egyszerűségre építő választási ok nincs igazolva. Ha a távozás fő oka duplikáció vagy belépési hiba, előbb a minőséget kell helyreállítani: ez még nem tiszta piaci cáfolat. Kis mintából egyik esetben sem számítunk megbízható piaci arányt.

**6. Monetizáció: kevesebb csomag, egyértelmű családi érték**

**Javaslat, nem elfogadott változtatás:** indulásra Free + egy fizetős, családra érvényes Plus irányát tesztelném. A külön Family és Family+ szint jelenleg több magyarázatot igényel, mint amennyi jól elkülönülő értéket ad. A partner ugyanazt az elemzést láthassa, ha egy jogosult családtag fizet; ez Solemi-családi hozzáférés, nem automatikusan az Apple Family Sharing funkciója.

| Alapérték | Fizetős értékjelölt | Egyelőre nem ígérném |
|---|---|---|
| Korlátlan helyi napló és előzmény, korrekció, több gyermek, alapstatisztika, JSON-mentés; két szülő közös naplója akkor, ha fenntartható. | Meglévő sajátadat-alapú minták és változások érthető értelmezése, hasonló napok, családi hozzáféréssel. Ezekből csak az kerüljön előtérbe, amit tesztelők tényleg használnak. | PDF, adaptív push, szakértői tanácsadás, teljes nap automatikus újratervezése vagy bizonyított alvásjavítás. Ezek jelenleg nem kész, igazolt képességek. |

**Az előfizetés nem adottság.** Ha a szülők rendszeresen visszatérnek az elemzésekhez és a közös szolgáltatáshoz, egy családi előfizetés indokolható. Ha csak egyszerű helyi naplót és alkalmi elemzést használnak, az egyszeri helyi Pro-vásárlás jobban illeszkedhet. Egyszeri fizetésért korlátlan élettartamú felhős szolgáltatást nem ajánlok költségbizonyíték nélkül. Reklámra és adatértékesítésre nem építeném ezt a terméket.

A korábbi **3,99 EUR/hó / 39,99 EUR/év** ajánlat maradjon tesztár, ne kész listaár. Ez nem fizetési hajlandóság, és a nappi hasonló USD-ára sem bizonyítja azt. Tíz megtartott családnál mutassuk meg pontosan a meglévő fizetős értéket ezzel az árral; kérjük a választást az ingyenes folytatás és a fizetős csomag között. A „jól hangzik” gyengébb jel, mint a kész vásárlási folyamatban történő fizetés. Valós fizetést csak szabályos, ellenőrzött vásárlási rendszerrel kérjünk.

A havi opció különösen fontos: nem tudjuk még, hány hónapig használják rendszeresen. Nem indokolt éves előfizetést tekinteni természetesnek. A próbát ne pusztán a regisztráció indítsa; olyan pillanatban lehessen választani, amikor már bemutatható a most elérhető többlet. A két hónap adatot váró riport ne legyen a rövid próba fő ígérete.

**Fenntarthatóság mérése:** aktív családonkénti szerverkérések/adatbázisműveletek, tárolás, jogosultság-ellenőrzés, bolti díjak, adók és támogatási idő. A kódban 15 másodperces lekérdezési ciklusok vannak, ezért költségmérés nélkül ne mondjuk, hogy az ingyenes szinkron korlátlanul olcsó. Az árbevétel nem nyereség: például 100 család × 39,99 EUR/év = 3 999 EUR éves bruttó bevétel, havi átlagban kb. 333 EUR, minden levonás előtt. Ez számolási példa, nem előrejelzés.

Ha az ingyenes alap-szinkron költsége túl nagy, a helyi Free + fizetős közös napló modell maradhat alternatíva, de ezt gyengébb versenyhelyzetű ajánlatként kell tesztelni. Ne ígérjünk most örökre ingyenes felhőt. Ha az elemzésekért senki nem választ fizetést, ne mesterséges adatkorlátozással próbáljuk pótolni a hiányzó értéket.

**7. Megtartani / egyszerűsíteni / elhagyni / kiadás előtt javítani**

- **Megtartani:** egyérintéses napló, gyors korrekció, teljes helyi előzmény, több gyermek, fiók nélküli kezdés, export, HU/EN/DE, meglévő számítási modulok. A közös napló célját is megtartanám, elfogadott működéshez kötve.
- **Egyszerűsíteni:** csomagválasztás; közös napló csatlakoztatása; mentési állapotok szövege; statisztika prioritásai; zárolt és adatgyűjtő kártyák. Először kevesebbet mutatni, részleteket kérésre.
- **Elhagyni az indulási tervből:** második fizetős szint; hét egyforma lakatos kártya; új etetés/pelenka/modulcsomag; AI-asszisztens; közösségi funkció; új szakértői alvásprogram; PDF és adaptív értesítés mint kötelező v1-feladat. A kész elemzőkódot nem szükséges törölni attól, hogy kevésbé hangsúlyos.
- **Kiadás előtt javítani:** szinkronütközés és konvergencia; törlés/import/helyreállítás jelentése és védelme; account- és adatkezelési útvonalak; bolti csomagok és belépés; vásárlás/jogosultság, ha fizetős funkcióval indulunk; pontos állapot- és üreshiba-szövegek.

**8. Mindkét áruház: valódi munkacsomag, nem feltöltési lépés**

**Tény:** a jelenlegi repó webes projekt, nincs kész iOS/Android csomag. **Javaslat:** elsőként a meglévő React app újrahasznosítását próbálnám ki Capacitorral. Ez lehet technikai út, nem bizonyított kész megoldás. Az iOS buildhez macOS/Xcode környezet vagy megfelelő távoli buildelés kell; a fejlesztő rendelkezésre álló hozzáférése még nem ismert. [Capacitor környezet](https://capacitorjs.com/docs/getting-started/environment-setup)

A próba az app bezárása/újranyitása, helyi adatmegőrzése, frissítése, export/importja és belépése körül forogjon. A mostani Pages azonos eredetű cookie/proxy megoldás nem vihető át igazolás nélkül natív csomagba. A Google a beágyazott user-agentben futó OAuth-folyamatot korlátozza; támogatott natív/rendszerböngészős belépési út kell. [Google natív OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)

Az Apple 4.2 használható alkalmazásélményt vár, nem pusztán újracsomagolt weboldalt. Ez nem általános tiltás a webes technológiára. Google elsődleges belépés mellett a 4.8 követelményeinek megfelelő másik opcióval kell tervezni; a Soleminél kézenfekvő a Sign in with Apple. Fióklétrehozás esetén alkalmazáson belüli fióktörlés szükséges. Digitális prémiumérték értékesítésénél a 3.1 szerinti vásárlási szabályokat kell megtervezni, az országonkénti kivételek figyelembevételével. [Apple ellenőrzési szabályok: 3.1, 4.2, 4.8, 5.1.1](https://developer.apple.com/app-store/review/guidelines/)

A Google Play fióklétrehozásnál alkalmazáson belüli törlési utat és külső webes kérelmezési lehetőséget is kér. A kijelentkezés vagy helyi alvások törlése ezt nem helyettesíti. [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

Új, 2023. november 13. után létrehozott személyes Play fejlesztői fióknál legalább 12, folyamatosan 14 napig csatlakozott zárt tesztelő kell a production-hozzáférés kérelmezéséhez. A fiók típusa/ideje ellenőrizendő; a teszt letelte nem automatikus jóváhagyás. [Google tesztelési feltételek](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

Ha fizetéssel indulunk, szükséges a bolti vásárlás és visszaállítás, szerveroldali ellenőrzés, lejárat/megújulás/visszatérítés kezelése és a családi hozzáférés frissítése. A két platformon ugyanahhoz a Solemi-fiókhoz tartozó jogosultságot össze kell vezetni, kettős fizetésre ösztönzés nélkül. Szolgáltatói előfizetés-kezelő bevonható későbbi döntésként, de most nem választottam szolgáltatót vagy díjcsomagot.

Adatkezelési tájékoztató, támogatási elérhetőség, valós adattovábbítást tükröző store-nyilatkozatok és ellenőrizhető törlési szabály szükséges. Ezeknek a tényleges helyi/felhős viselkedést kell leírniuk; a „minden csak nálad van” állítás jelenleg nem megfelelő a közös használatra. Nyilvános indulás előtt a production frontend–API hosting útvonalát is rögzíteni kell: a jelenlegi main GitHub Pages és az internal Pages Functions eltérő környezet.

**9. 30–60 napos terv heti 5–8 órára**

A nyilvános indulás továbbra is **mindkét áruházban** történjen. Az első 60 nap sikere lehet a stabil, mindkét platformon tesztelhető béta és bizonyított visszatérés; teljes áruházi megjelenést ennyi időre most nem lehet felelősen garantálni. Ha a belépés, adatvédelem vagy fizetés több időt kér, a dátum tolódjon, ne a minőségi kapu tűnjön el.

| Időszak | Fókusz és hozzávetőleges keret | Továbbhaladás feltétele |
|---|---|---|
| 1–2. hét, 10–16 óra | 6–9 óra: konfliktushiba reprodukálása/javítása és adatkezelési utak feltérképezése. 2–4 óra: natív technikai próba és fejlesztői hozzáférések. 2–3 óra: öt család toborzása, rövid problémafeltárás. A kereten túli hibamunka a következő hétre tolódik. | Azonos bejegyzés javítása után mindkét eszköz ugyanazt mutatja, elveszett/dupla adat nélkül; a platformpróba eredménye alapján újrabecsült munkalista. |
| 3–4. hét, 10–16 óra | Legfontosabb szöveg/folyamat egyszerűsítés, account/törlés és natív életciklus munkája. Stabil belső builddel 5–10 család 14 napos használata; heti két 15–20 perces beszélgetés. | A napló segítség nélkül használható; ismert kritikus adatvesztési hiba nincs. 30. nap körül döntés a folytatásról és terjedelemről. |
| 5–6. hét, 10–16 óra | Adatok alapján csak megtartást akadályozó javítások. TestFlight és Play tesztcsatorna előkészítése, ha a csomag kész; szükség esetén a 12 fő/14 nap feltétel teljesítése. A fizetős ajánlat bemutatása a megtartott családoknak. | Megértett mentés/megosztás; rendszeres visszatérés. Fizetési integráció csak rögzített csomaghatár alapján; ha még nincs kész, továbbra is zárt béta. |
| 7–8. hét, 10–16 óra | Bolti/jogosultsági és adatkezelési hiányok lezárása, készülékes regresszió, rövid store-leírás és valós képernyőképek, kiadási ellenőrzés. | Mindkét platform elfogadható állapotú; a fizetős funkció, ha része az indulásnak, vásárolható/visszaállítható/lejáratható. Ellenkező esetben új, becsült kiadási dátum, további funkciók nélkül. |

A heti időből körülbelül 60% javítás/készítés, 20% tesztelői kapcsolat, 20% ellenőrzés és adminisztráció legyen. Ez tervezési felosztás, nem garantált fejlesztési becslés. Egyszerre legfeljebb egy nagy műszaki munkacsomag haladjon. A natív próba eredménye nélkül a fizetési integráció teljes ideje nem becsülhető hitelesen.

**Toborzás és elérés:** először 5–10, nem csak közeli családból álló szülői kör. Személyes ajánlás és legfeljebb 1–2 magyar szülői közösség, adminengedéllyel, célzott tesztelői felhívással. Kétoldalú beszélgetés legyen, ne napi tartalomgyártás. Induláskor egy rövid termékoldal, három valós használati jelenet (indítás, javítás, közös napló), világos ár és támogatási cím elég. Fizetett hirdetés csak később, megtartási bizonyíték után.

**Néhány mérőszám — javasolt döntési küszöb, nem iparági benchmark:**

- Aktiválás: 10 családból legalább 8 segítség nélkül rögzít és javít egy alvást; célszerű cél az első értelmes művelet 2 percen belül. A segítséget külön jegyezzük fel.
- Második heti használat: legalább 5/10 család legalább 4 külön napon rögzít a 8–14. nap között. Aki közben már nem szeretne naplózni, annak okát is rögzítsük, ne csak „lemorzsolódásként” kezeljük.
- Közös használat: legalább 4/5 kipróbáló pár önállóan összekapcsolódik; előre definiált konfliktus/offline próbákban nulla elveszett vagy duplázott bejegyzés. Ez elfogadási feltétel, nem minden későbbi hiba kizárása.
- Érték/fizetés: a megtartott családok legalább fele megnevez egy konkrét, ismétlődő előnyt. Első gyenge jel 3/10 konkrét fizetős választás a pontos ajánlat mellett; valódi megerősítés a későbbi tényleges vásárlás és következő havi használat.
- Fenntartás: a kezdeti betanulás után legfeljebb heti 1–2 óra támogatás a kis tesztcsoportnál; mérjük a felhőköltséget és az adatkezelési kérdések számát. Ez a tulajdonos kapacitásából választott küszöb.

Kezdetben önkéntes rövid visszajelzés és egyszerű, családonkénti összesítés elegendő. Nem kell új analitikai terméket vagy alvásadatokat külső marketingrendszerbe küldő SDK-t integrálni. Az audit nem keresett meg senkit és nem publikált felhívást.

**10. Öt következő döntés, sorrendben**

1. **A következő fejlesztési feladat a már rögzített szinkronhiba és az adatkezelési határok lezárása legyen.** Siker: két telefonon azonos, duplikációmentes előzmény, dokumentált tesztesetekkel. Nem új fizetős funkció.
2. **Fogadjuk-e el elsődleges célként a gyors alvásnaplót, opcionális közös használattal?** Javaslat: igen; új gondozási modulok nélkül, öt külső családdal megvizsgálva.
3. **Készüljön-e rövid natív megvalósíthatósági próba a meglévő kódra?** Javaslat: igen, mielőtt áruházi dátumot ígérünk; Mac/buildhozzáférés, accounttípus és mobilos belépés tisztázásával.
4. **A három csomag helyett egy családi Plus ajánlatát teszteljük-e?** Javaslat: igen, de az ingyenes szinkron határa költségméréshez, az előfizetés értéke használati bizonyítékhoz kötve. A jelenlegi mátrix ettől még nem változott.
5. **A 60 nap célja feltételes, kétplatformos béta/kiadás legyen-e fix dátum helyett?** Javaslat: igen; két áruházas nyilvános indulással, csak a minőségi és account/vásárlási feltételek teljesülésekor.

**Helyi bizonyítékok és folytatási pontok**

- [Projektállapot és nyitott telefonos hibajegy](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/CODEX_PROJECT_STATUS.md)
- [Funkciómátrix](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/FEATURE_ENTITLEMENT_MATRIX.md), [termékterv](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/PRODUCT_DESIGN_LOCK.md), [account-architektúra](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/ACCOUNT_ENTITLEMENT_ARCHITECTURE.md), [release-feltételek](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/RELEASE_CHECKLIST.md)
- [Korábbi, felülvizsgálható monetizációs audit](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/MONETIZATION_AUDIT_2026-09-16.md)
- [Klienscsomag és Insights-kapu](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/App.tsx:31), [import/törlés/beállítások](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/App.tsx:485)
- [Adatbetöltés és mentés](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/storage.ts:129), [szinkronműveletek](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/familySync.ts:297), [mentés–szinkron kapcsolat](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/FamilySyncLayer.tsx:201)
- [Becslés](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/prediction.ts:73), [havi riport adatfeltétele](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/monthlyReport.ts:84), [internal/PWA határ](C:/Users/bobaa/Documents/GitHub/botond-sleep-tracker/src/main.tsx:15)

Az audit elkészültével a következő kódolási alkalom a fenti 1. döntésből induljon. Előbb a konkrét hibát reprodukáljuk; a fizetési rendszert és a termékmátrix átalakítását külön, elfogadott feladatként kezeljük.
