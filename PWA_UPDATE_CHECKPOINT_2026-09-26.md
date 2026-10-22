# A24 — PWA-frissítés és helyi adatok megőrzése

Dátum: 2026-09-26. Alapcommit: `242770e5740f4cd9e9d6a642b27241d1c7422140`.
Feladatszint: **GPT-6 Astra · high**. Helyi javítás és automatizált próba;
production deploy, adatbázis-módosítás és felhasználói kézi teszt nem történt.

## Feltárt hibák és javítás

1. A korábbi `autoUpdate`, `skipWaiting: true`, `clientsClaim: true` beállítás
   és a virtuális regisztráló aktiválási eseménye újratölthette a nyitott appot.
   Az el nem mentett szerkesztőmező ilyenkor elveszhetett. A Vite PWA
   [dokumentációja is jelzi ezt az űrlapos kockázatot](https://vite-pwa-org.netlify.app/guide/auto-update).
   Most natív regisztráció fut, az új SW várakozik, nincs programozott újratöltés,
   `SKIP_WAITING` üzenet vagy kliensátvétel. A böngésző a régi verziót használó
   összes appablak/lap bezárása után aktiválhatja az újat, a
   [normál SW-életciklus szerint](https://web.dev/articles/service-worker-lifecycle).
2. Az indításkori fiókvisszaállítás korábban minden refresh hibát kijelentkezésnek
   vett. Így egy offline újranyitás — különösen az összes lap bezárása után,
   amikor már nincs tabhoz kötött access token — vendégnaplóra válthatott.
   A fióknapló a saját mentésében megmaradt, de az aktív alvás eltűnt a látható
   naplóból. Most az offline/hálózati/timeout/szerverhiba meghagyja az aktív
   fiók munkaterületét és a függő sorát. Később újrapróbálható a hitelesítés.
   Ez nem ad hitelesített szerveres hozzáférést vagy fizetős jogosultságot.
   Igazolt `401 SESSION_INVALID` / `REFRESH_REUSED` esetén továbbra is megtörténik
   a kijelentkezési átmenet, a fióknapló saját munkaterületén való megőrzésével.

Az adatformátum változatlan. A napló és az outbox továbbra is egy atomi
`solemiSleep:v4` tárolóérték része. A gyorsítótár takarítása az alkalmazás
fájljait kezeli; nem törli a localStorage naplóját vagy fiókmentéseit. Az `/api`
navigáció nem kaphatja az alkalmazás HTML-jét offline fallbackként.

## Automatizált böngészős bizonyíték

A `scripts/check-pwa-lifecycle.mjs` két helyi buildet készít, saját localhost
szervert és elkülönített, headless Edge-profilt használ. Külső appkéréseket
blokkol, kizárólag mesterséges adatot tárol. A fiókos indítás engedélyezett;
az app számára offline állapotot szimulál, majd valódi böngészős offline
megnyitást is végez. Playwright 1.62.1, Edge 153.0.4234.48.

Ellenőrzött helyzetek a `/` és `/botond-sleep-tracker/` alapútvonalon:

- Egy sikertelen új precache-letöltés után a korábbi app és a nyitott,
  el nem mentett megjegyzés változatlan marad.
- A sikeresen letöltött új verzió két megnyitott lap mellett várakozik.
  Az első bezárása önmagában nem aktiválja; nincs kényszerített újratöltés.
- A megjegyzés mentése a három korábbi függő művelet mellé negyediket tesz;
  a korábbi műveletazonosítók, tartalmak és revíziók megmaradnak.
- Mindkét lap bezárása után az új verzió aktív. Új lapon és offline
  megnyitáskor is megmarad az aktív alvás kezdete, jegyzete, típusa, a négy
  függő művelet, a fiókazonosító és egy másik fiók tárolt mentése.
- A kompatibilis korábbi tesztartifact visszaszolgálása ugyanígy várakozva
  aktiválódik; a fenti adatok utána is megmaradnak.
- A cache csak helyi alkalmazásfájlokat tartalmaz, API-választ nem;
  az `/api/health` navigáció a szerver hibaválaszát kapja, nem az app HTML-jét.

**A próba határa:** A és B ugyanabból a jelenlegi forrásból készül,
eltérő HTML-verziójelöléssel. Valódi SW-letöltést, várakozást, aktiválást és
cache-cserét vizsgál, de nem bizonyít tetszőleges történeti kiadás vagy új
adatséma visszafelé kompatibilitását. Az internal preview továbbra sem
regisztrál SW-t, így az internal oldalon végzett telefonos teszt önmagában
nem PWA-frissítési bizonyíték.

Az egységtesztek külön fedik a hálózati hibát, időtúllépést, hibás választ,
szerverhibát, `/me` hibát, sikeres online újrapróbálást, igazolt kijelentkezést
és a másik fiók visszaállítását úgy, hogy az offline sor az eredeti fióknál marad.
Teljes eredmény: **30 fájl / 338 teszt**, frontend és Worker typecheck sikeres.
Az internal build külön ellenőrizve: nincs benne SW-regisztráló kód.

## Újrafuttatás

A normál `npm test` futtatja a regisztráció és fiókvisszaállítás regresszióit.
A külön `npm run test:pwa` a böngészős próbát indítja. Ehhez a tesztkörnyezetben
Playwright és Chromium, vagy egy telepített Chrome/Edge szükséges. A böngészős
próba nem része jelenleg a GitHub CI-nak.

PowerShell, a repo gyökeréből, az elérhető Playwright-csomag tényleges útvonalával:

```powershell
$env:SOLEMI_PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:SOLEMI_BROWSER_CHANNEL = 'msedge'
$env:SOLEMI_PWA_TEST_BASE = '/'
npm run test:pwa
$env:SOLEMI_PWA_TEST_BASE = '/botond-sleep-tracker/'
npm run test:pwa
```

A kimeneti tesztbuild a Gitből kizárt `.wrangler/pwa-check-*` könyvtárba kerül.
A szerver és a tesztböngésző a próba végén bezáródik; a valódi böngészőprofilok
és a családi adatok nem vesznek részt benne. Az építés a korábban is ismert
500 kB feletti chunkméretre figyelmeztet, buildhibát nem ad.

## Visszaállási és kiadási feltételek

- Visszaállás csak olyan ellenőrzött V4 artifactra tervezhető, amely érti a
  `__solemiLocal.familySyncV1` outboxot és a `workspaceData:v1` munkaterületeket,
  megtartja a várakozó SW-politikát és az offline fiókvisszaállítás védelmét.
  A régi V3/main kiadás nem ilyen visszaállási cél. Bizonyíték nélkül előre
  javító kiadás szükséges, nem adatformátum-visszaléptetés.
- A visszaállított klienshez kompatibilis Worker/séma kell. A frontend
  visszaállítása nem adatbázis-visszaállítás, és nem vonja vissza a már elfogadott
  családi módosításokat. A függő műveletek azonosítóit nem szabad újragenerálni.
- Frissítési hiba esetén nem javítás a böngészési adatok/localStorage törlése
  vagy a PWA újratelepítése: ezek a helyi, még fel nem töltött adatokat érinthetik.
- **A24 még nyitott:** tényleges régi→új kiadási artifact, telepített telefonos
  PWA (különösen iOS), a valódi cookie-s fiókvisszaállítás és az online feltöltés
  teljes lánca későbbi elfogadási feltétel. Az A05/A16 fiókos/offline kapukat ez
  a célzott helyi javítás nem zárja le.

## Kapcsolódó staging-verzióellenőrzés

Az előző commit Worker-deployja igazolt: a staging `/health` törzse és fejléce
`242770e5740f4cd9e9d6a642b27241d1c7422140` SHA-t adott. Az erre a SHA-ra futtatott
helyi auth-boundary smoke minden ponton sikeres; családi adatot nem módosított.
A GitHub connector nem adott workflow-run rekordot, ezért a GitHub Actions
saját futására ebből nem állítunk sikeres eredményt.
