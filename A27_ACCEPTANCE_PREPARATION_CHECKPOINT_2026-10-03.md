# A27 — közös elfogadás előkészítése, gépi eredmény

Dátum: 2026-10-03. Feladatszint: GPT-6 Astra · erős.

Az előkészítés helyben kész. A közös tesztnapló, ismételhető gépi próbák és a háromblokkos telefonos menet az [A27 közös elfogadás](A27_COMMON_ACCEPTANCE_2026-10-03.md) dokumentumban találhatók. A teljes A27 és a fizetős kiadási kapu továbbra is nyitott.

Kiinduló HEAD: `2ecc857`, `Separate bedtime and night resettling in wake windows and predictions`, ág `feat/child-profile-v4`, tiszta munkafa. S01–S15 javításai commitban. Ebben a körben az alkalmazás forráskódja változatlan; új próbák, tesztadat és dokumentáció készültek. Commit/push/deploy, valódi család vagy fiók módosítása nem történt.

## Eredmények

- `src/statisticsAcceptance.test.ts`: **8/8 új próba PASS**. A teljes 162 bejegyzéses közös napló minden statisztikai elemzőn végigmegy; 425 órás összeg, nappal/éjjel egyezés, rutin, ébrenléti alcsoport/becslés, havi és fejlődési nevezők; 7/14/30 nap; importértelmező, szerializálás/sorrend, aktív/üres/helyreállított napló és bemenetmegőrzés.
- Teljes regresszió: **47 fájl, 569/569 teszt PASS**. Frontend typecheck PASS. Helyi build és PWA-generálás PASS; alkalmazáscsomag változatlan: JS `index-Cqq-Z1SA.js`, 741,74 kB / gzip 226,60 kB. Az ismert nagycsomag-figyelmeztetés megmaradt, nem új regresszió.
- Új közös böngészőpróba: **HU/EN/DE × 320/393 px, 6/6 PASS**, hét kártya, egymástól független környezetek közötti egyezés; fordított naplócsere, újratöltés, aktív állapot, üres napló és visszaállítás. Ugyanazt a JSON-fájlt használja, mint a számítási teszt. A végleges V4 mentésborítékkal is sikeresen megismételve.
- **Teljes összevont böngészőcsomag PASS, exit 0**: 85 PASS eredménysor (összetett forgatókönyvek, nem 85 külön egységteszt), valamint 4 sikeres teljesítménymérés. Tartalmazza a korábbi rutin-, minimum-/bizonyossági-/időszak-, aktuális kontextus-, legközelebbi napok-, leghosszabb szakasz-, naplólefedettség-, havi időszak-, átfedés-, időzóna- és visszaalvási próbákat, az új közös naplót, illetve frissülési/fókusz/éjfél/jogosultsági ellenőrzést.
- Nyugalmi kontroll: 1800/5000 × Free/Family+, minden 3,2 másodperces ablakban **0 újraszámolás, 0 mért számítási idő**. Free alatt zárt prémium számítás nem futott. Kezdeti fejlesztői kétszeres számítás 11,4 / 1056,2 / 27,3 / 4554,1 ms. Ez nem telefonos sebességmérés és nem zárja le az A22 kezdeti prémium számítási költségét.
- Magyar naplóeltérés- és német havi kártya 320 px képei vizuálisan ellenőrizve. Feliratok nem lógnak ki, és a mintaszámok/időszakok olvashatók. `git diff --check`: PASS.

## Ismétlés és bizonyíték

Windows PowerShell, külső Playwright, telepített Edge:

```powershell
$env:SOLEMI_PLAYWRIGHT_MODULE = 'C:\Users\bobaa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:SOLEMI_BROWSER_CHANNEL = 'msedge'
npm test
npm run typecheck
npm run build
npm run test:statistics
```

Csak a közös felületi forgatókönyv: `node scripts/check-statistics-performance.mjs --acceptance-only`.

Helyi, Gitből kizárt bizonyítékok:

- `.private-backups/a27-consolidated-browser.log`: teljes összevont futás.
- `.private-backups/a27-common-browser.json`: böngészőverzió, rögzített referenciaidő/időzóna, nyelv/szélesség és hét kártya szövege.
- `.private-backups/a27-common-{hu,en,de}-{320,393}-{0..6}.png`: közös napló kártyaképei.
- `.private-backups/a22-after.json`: nyugalmi teljesítménymérés.

Az induló sandbox-futtatás nem tudta betölteni a Vite konfigurációját; az engedélyezett helyi futtatás sikeres. Új függőség nem került a projektbe. A mentés csak mesterséges adatot tartalmaz, valódi API/külső hálózati kérést a böngészőpróbák elutasítanak.

## Mi maradt és mi nem ismétlendő?

1. A telefonos próbához a pontos belső build/SHA és két teszttelefon környezetének azonosítása, külön tesztcsaláddal és Family+ hozzáféréssel.
2. Az elfogadási dokumentum három rövid blokkja: történeti egyezés/hónaphatár; aktív alvás/lezárás; üres gyermek/visszaváltás.
3. A tényleges eredmény és bizonyíték rögzítése után az A27 kiadási kapu elbírálása.

Az M1–M6 kézi kör 6/6 marad, nem ismétlendő. A gépi kör nem helyettesíti a telefonos szinkront/PWA-t vagy a szerveres jogosultságot, és nem igazolja automatikusan az alkalmazás többi kiadási kapuját. Most nem indítottunk kézi tesztet.

**Következő: A27 célzott telefonos elfogadás előkészített három blokkja, előtte pontos belső build- és tesztkörnyezet-azonosítás. Feladatszint: GPT-6 Astra · erős.**

GitHub Desktop Summary: `Prepare consolidated A27 statistics acceptance and shared test diary`
