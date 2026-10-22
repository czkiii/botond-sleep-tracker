# A23 — V1 PDF-export és csomagígéretek felmérése

Dátum: 2026-10-07. Feladatszint: GPT-6 Astra · erős. Kézi tulajdonosi teszt nélkül.
Kiinduló HEAD: `84ae11c` (`Compare sleep conflicts and improve modal keyboard accessibility`), ág: `feat/child-profile-v4`.
Az A20 commitban van. Az itt leírt A23 munka helyi módosítás; commit/push/deploy nem történt.

## Felmérés: ígéret és tényleges állapot

| V1 ígéret | Meglévő alap / mostani eredmény | Ami még nyitott |
|---|---|---|
| Free helyi napló, több gyermek, előzmény, alapstatisztika, JSON-mentés | Meglévő funkciók; a JSON-export továbbra is ingyenes. A PDF nem cseréli le. | Közös kiadási elfogadás. |
| Family / Family+ PDF-export | A `PDF_EXPORT` effektív jogosultság korábban létezett, tényleges PDF-készítő nem. Most gyermekre és időszakra szűrt HU/EN/DE PDF-naplókivonat készült. | Kiadott build, valódi mobilos mentés/megnyitás a közös elfogadásban. |
| Az aktív családtag által adott fizetős hozzáférés | PDF-nél az effektív szerveres funkciólista számít, nem a felhasználó saját csomagneve. Free saját csomag mellett is lehet örökölt PDF-jog. | Valódi store-integráció a későbbi platformos blokkban. |
| Family+ sajátadat-elemzések | Meglévő statisztikák; az A27 helyi javításai megmaradnak. A PDF naplókivonat, nem a prémium havi elemzés PDF-be másolása. | A27 közös telefonos elfogadás. |
| Havi 990 / 1490 Ft; éves 10 havi díjért 12 hónap | Elfogadott célárak, nem működő áruházi ajánlatok. A PDF-zár nem állít sikeres vásárlást és nem indít trialt. | Valódi árpontok, havi/éves store-termékek és paywall végleges összhangja, A11/A23. |
| Egyszeri 7 nap, Familynként legfeljebb négy külön felhasználói trial | A 2026-10-01-i döntés az irányadó; a termékirány és funkciómátrix most erre hivatkozik. Meglévő billingkódban van `trial_ends_at`, de ez nem bizonyítja az account-élettartam és Family-keret kikényszerítését. | A11 szerveroldali szabályok és store-összehangolás. |
| Életkori normák, push, fix/adaptív emlékeztetők | V1-ben kizártak. A születési dátum mellett téves életkorhoz igazított elemzésígéret volt; HU/EN/DE szöveg javítva opcionális profiladatra és sajátadat-elemzésre. | Nem adtunk hozzá új ilyen funkciót. |
| Fióktörlés, teljes account-adatkiadás, privacy, Apple belépés | Nem azonos a PDF-naplókivonattal, JSON-mentéssel vagy családmegszüntetéssel. | A17 meglévő eredményeinek külön felmérése és hiánypótlása, natív/store-bekötés a kijelölt sorrendben. |

A mátrix régi automatikus helyinapló-feltöltési ígérete is pontosítva: meglévő családhoz csatlakozáskor a már megvalósított áttekintés és kifejezett naplóválasztás szükséges. Nem kezdünk új csatlakozási fejlesztést.

## PDF működése és határai

- Beállítások → Alvásnapló PDF. Gyermekválasztás, első/utolsó nap, alapból kikapcsolt megjegyzések; alapértelmezett időszak az utolsó 30 naptári nap.
- A fájl az ezen az eszközön elérhető napló pillanatképe. A PDF-készítés nem küldi el a naplót külső szolgáltatásnak; a szokásos hozzáférés-ellenőrző kérés és helyi fontbetöltés történik. A külön szinkron ettől függetlenül működhet.
- Név, időszak, létrehozás ideje és megjelenítési időzónája, bejegyzések, időszakra vágott összalvás; teljes eredeti kezdés/vég másodpercekkel és UTC-eltolással, kézi/automatikus típus. Fotó, születési dátum, accountadat, token és belső azonosító nem kerül a PDF-adatmodellbe.
- A nyers sorok és kézi típusok megmaradnak; átfedő/duplikált időt az összesítés csak egyszer számol. A sorok időtartamainak összege emiatt eltérhet az összesített időtől. Éjfél/hónaphatár, 23/25 órás nap és aktív alvás kezelve; az aktív sor a készítés pillanatánál záródik az összegben.
- Érvénytelen vagy jövőbeli időpontú rekordok nem adnak kitalált alvásidőt; kihagyásszámláló jelzi őket. A számláló a kiválasztott gyermek naplójában talált hibás rekordokra vonatkozik. Hiányzó napló nem bizonyít nulla alvást.
- A legfeljebb 366 napos export 5000 sorra, 500000 megjegyzéskarakterre és 250 oldalra korlátozott. Túllépéskor nincs csendes csonkolás vagy részfájl; rövidebb időszakot/kevesebb megjegyzést kér.
- Többoldalas A4 tördelés, lábléc, megjegyzés-folytatás jelölése; helyileg csomagolt Noto Sans és részleges fontbeágyazás. Hiányzó jelek, például egyes emojik helyett látható Unicode-kód és magyarázat szerepel. Ez nem minden írásrendszer tipográfiai támogatása.
- A hozzáférést a készítés előtt és után is ellenőrzi. Fiók-/authállapot-váltás, közben módosult napló, elveszett vagy lejárt jogosultság esetén nincs letöltés. Az offline hozzáférést a meglévő A16 aláírás-ellenőrző réteg adhatja; ezt az export nem helyettesíti helyi csomagkapcsolóval.
- A PDF-könyvtár külön, csak exportkor végrehajtott csomag. Az internal build PDF-csomagja 1149,40 kB, gzip 509,44 kB; a font 569208 bájt. A production PWA előtárolja a fontot és a külön csomagot: ez háttérben letöltési/tárhelytöbblet, nem nulla költség. Az internal preview magától továbbra sem regisztrál service workert.
- A PDF nyomtatható/olvasható kivonat, nem importálható mentés, nem orvosi értékelés és nem teljes account-adatexport. A letöltés utáni tárolás/megosztás a felhasználó döntése. A PDF nincs titkosítva, és nem állítunk PDF/UA megfelelést.

## Gépi és képi ellenőrzés

- `npm test`: **56 fájl, 762/762 PASS**, ebből 25 új PDF-próba. Dátumhatárok, DST, utazási időzóna, átfedés, adatminimalizálás, méretkorlát, effektív családi jog, lejárat, fiók/naplóváltás és betűfájl-hiba.
- Frontend és Worker typecheck: PASS.
- `npm run test:pdf`: **4/4 PASS**, elkülönített Edge **154.0.4258.62**, 320 px, a `/botond-sleep-tracker/` útvonalra készített optimalizált helyi build. HU Family, EN Family offline, DE Family+, Free PDF-zár és továbbra is működő JSON-export. Valódi letöltött bájtok, név, változatlan napló, Escape/fókuszvisszaadás, túlcsordulás és külső kérések ellenőrzése.
- Az offline próba a previewhoz kifejezetten regisztrálta a ténylegesen generált service workert, majd még az első PDF előtt kikapcsolta a hálózatot. Ez az előtárolt renderer/font működését bizonyítja. Nem helyettesíti a valódi aláírt offline grant telefonos elfogadását; a hozzáférési réteg A16 próbái és az export unit próbái külön bizonyítékok.
- `scripts/verify-pdf-output.py --render`: **3/3 fájl, összesen 5 oldal PASS**. Szövegkinyerés, HU/DE ékezetek, 13 órás átfedésmentes összeg, megjegyzések opt-in, hosszú szöveg vége, Unicode-helyettesítés, másik gyermek/adatmezők kizárása, oldalszám és szöveghatárok ellenőrzése. Popplerrel minden oldal PNG-re alakítva és képpel átnézve. A 320 px-es német exportablak is képpel ellenőrizve.
- Minták: HU 1 oldal / 11807 bájt, EN 2 oldal / 14250 bájt, DE 2 oldal / 14112 bájt. Csak mesterséges tesztadatok; a minták és eredmények a Gitből kizárt `.private-backups/pdf-export/` könyvtárban vannak.
- `npm run test:settings`: **6/6 PASS**, HU/EN/DE × 320/393 px; sorrend, beállításmentés, billentyűzet és modális ablak regresszió.
- Internal, fiókos frontend build: PASS. A meglévő főcsomag és az új, külön PDF-csomag 500 kB-os méretfigyelmeztetése megmarad.
- A függőségellenőrzés új találata miatt a fejlesztői `source-map-js` 1.2.1 → 1.2.2 kompatibilis javítása bekerült a lockfile-ba. Ezután a frontend audit **0 találat**. A teljes teszt/typecheck előtte, a beállításpróba és végső internal build a lockfrissítés után sikeres. [Hibaleírás és javított verzió](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Új futtatás: `npm run test:pdf`; Playwright a `SOLEMI_PLAYWRIGHT_MODULE` elérési útról vagy telepített csomagból, Edge a `SOLEMI_BROWSER_CHANNEL=msedge` beállítással. A PDF-ellenőrzőhöz pypdf/pdfplumber, képekhez Poppler szükséges; a helyi Codex runtime ezeket biztosította. A repó alaptesztjeihez ezek nem szükségesek.

Források: [pdf-lib](https://pdf-lib.js.org/), [hivatalos repository](https://github.com/Hopding/pdf-lib), a betű licencét és ellenőrzőösszegét a `public/fonts/README.md` és `OFL.txt` tartalmazza.

## Folytatás

**A23 kért helyi blokkja — felmérés és PDF-hiánypótlás — kész.** A teljes A23 ár/paywall/store és kiadott verziós elfogadása még nyitott. Most nem szükséges kézi teszt, M1–M6 nem ismétlendő, élő családi adat nem változott.

**Következő: A11 — az egyszeri 7 napos trial és a családonként legfeljebb négy külön felhasználói trial szerveroldali szabályainak megvalósítása, a meglévő billing-alapok felhasználásával, gépi próbákkal. GPT-6 Astra · erős; most kézi teszt nélkül indítható.** A tényleges store-ajánlat és vásárlási felület a platformos bekötéssel egyeztetendő; nem találunk ki új üzleti szabályt.

## GitHub Desktop

Summary: `Add localized PDF diary export with paid access checks`

Description: Add child/date selection, optional notes, local Unicode PDF generation, overlap-safe totals and verified access/context checks. Preserve free JSON backups, precache PDF assets, and align V1 product/trial promises. Validate 762 tests, both typechecks, internal build, four PDF browser cases, five rendered PDF pages and six settings cases. Update the vulnerable development source-map dependency. Store/trial implementation and final device acceptance remain open.
