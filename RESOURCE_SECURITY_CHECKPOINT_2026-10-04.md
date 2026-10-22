# A19 — kéréskorlátok, nagy naplók, fejlécek és függőségek

2026-10-04. Kiinduló HEAD: `eeb5b7d`, ág: `feat/child-profile-v4`.
Helyi gépi rész elkészült. Commit/push/deploy és valódi családi adatváltoztatás nem történt; most nem kell tulajdonosi kézi teszt. A teljes kiadási kapu nyitott.

## Elkészült változás

- Cloudflare Rate Limiting bindingek: **6000 API-kérés/60 s**, ezen belül **120 belépési/challenge/refresh/családlétrehozási/csatlakozási kérés/60 s összesen**, valamint **30 meghívó/60 s hitelesített családonként**. Ezek szolgáltatásszintű védőkorlátok, nem accountonkénti termékkvóták. A két első számláló kulcsa állandó, így hamis/forgatott tokennel vagy IP-fejléccel nem kerülhető meg. A meghívó családazonosítója sikeres hitelesítésből/jogosultságellenőrzésből jön. Staging/production külön számlálótereket használ.
- Limitnél `429 RATE_LIMITED` és `Retry-After: 60`, még az érintett adatbázis-/Google-művelet előtt. Hiányzó staging/production binding vagy limiterhiba esetén védetten leálló 503; nincs korlát nélküli tartalékút. Health és OPTIONS nem végez adatbázismunkát, elérhető marad. A frontend az adott API-origin további kéréseivel vár, megőrzi a sessiont, naplót és várakozó műveleteket. Érvényes aláírt helyi PDF/Insights jog 429 alatt használható, felhős szinkronjogot nem ad.
- Megmaradt a **64 KiB-os, stream olvasás közben is érvényes JSON-bodykorlát**. Az eredeti Worker CPU-beállítás 50 ms/kérés volt; **2026-10-08-i korrekció:** a tényleges Free account ezt 100328 hibával elutasítja, ezért az egyedi CPU-beállítás kikerült, és a platform Free-korlátja érvényesül (jelenleg 10 ms/HTTP kérés). A proxy upstream határidő 12 s (a frontend teljes válaszolvasási határideje továbbra is 15 s). Nem állítunk teljes infrastruktúra-költségplafont vagy igazolt Free-terhelhetőséget.
- Az új kliens **500 alvásos oldalakban** tölti le a szinkront. A Worker családrevízióhoz köti a folytatást; közben érkezett változásnál a kliens legfeljebb három teljes letöltést próbál. A napló és kurzor csak a teljes, azonos revíziójú eredménnyel frissül. Azonos revíziójú tömeges sorok stabil `revision, id` sorrendben érkeznek. Bootstrap, normál szinkron és elutasított gyermektörlés utáni helyreállítás egyaránt ezt használja.
- Védelmi letöltési felső határ: **10000 alvás / teljes kliensletöltés**, **1000 gyermekrekord / válasz**, a törölt rekordokkal együtt. A régi, lapozást nem kérő kliens és a családmegszüntetési előnézet legfeljebb **5000 alvást** kap; túllépésnél 413, soha nem csonka sikeres válasz. Ezek technikai biztonsági korlátok, nem új csomagígéretek. A határ fölötti napló további letöltési/export támogatása a nyilvános kiadás előtt felülvizsgálandó; nincs automatikus adattörlés. A jelenlegi 1799-es napló és az 5001-es lapozott gépi példa a határon belül van.
- Pages `public/_headers`: érvényesített CSP, nosniff, referrer-, frame-, popup- és eszközhozzáférési szabályok. A CSP engedi a saját buildet, a szükséges Google GIS script/style/frame/connect útvonalakat, a két jelenlegi pontos Worker-origint, valamint a helyi adat-/blobképeket. Inline JavaScript, eval, tetszőleges külső kapcsolat, object és külső beágyazás tiltott. Inline CSS megmarad az app dinamikus stílusaihoz. `same-origin-allow-popups` kompatibilis a Google popup-folyamattal.
- Worker és proxy sikeres/hibás API-válaszai: no-store, nosniff, no-referrer és csak tiltó API-CSP. Proxy upstream hiba általános 502; a Worker váratlan hibából csak `SOLEMI_INTERNAL_ERROR` kódot naplóz, nyers kivételt, SQL-értéket, URL-t, tokent vagy request-bodyt nem.
- Frontend Vite **7.1.7 → 7.3.6**, Vitest **3.2.4 → 4.1.11**; Worker lockban Wrangler **4.147.0**, Undici **7.29.1**. A javítás előtti audit mindkét csomagban 3 érintett csomagot jelzett, a fejlesztői eszközláncban. Vitestnél főverzióváltás kellett a jelzett mocker-hiba javított verziójához. A végleges két audit **0 ismert sérülékenység**. Ez az audit adatbázisának eredménye, nem a teljes app hibamentességének bizonyítéka. CI-be közepes/súlyos találatnál megálló függőségaudit került.

## Gépi bizonyíték

- **53 tesztfájl, 730/730 PASS; 42 új próba** a korábbi 688 mellé.
- Ismert méretű limiterhelyettesítővel pontosan 120 engedett belépési kérés, következő tiltva; 30 meghívó után az adott család tiltott, másik család megmarad. Binding hiánya/hibája, hamis identitás, érintetlen adatbázis, no-store és hibaredakció ellenőrizve. Ez a kód és a konfiguráció helyi vizsgálata, nem éles Cloudflare terhelésmérés.
- Valódi Worker + memóriabeli SQLite + valódi frontend szinkron: **5001 azonos revíziójú alvás 11 oldalon**, hiány és ismétlés nélkül, egyszeri helyi alkalmazással. Második oldal hálózati hibája nem mozdítja a kurzort; újrapróbálás teljes. Közben történt gyermek-/alvásmódosítás új letöltést indít, és a friss adatok érkeznek meg. Régi kliens 5001 sornál 413-at kap. Hibás offset/revízió, folyamatos változás, pontos 10000-es határ és végtelen folytatás ellenőrizve.
- Frontend és Worker typecheck PASS; internal build PASS. A meglévő nagy JS-csomagra figyelmeztetés megmaradt. Az A04 szándékos hibapróbája most csak az általános hibakódot naplózza.
- Worker staging **dry-run PASS**, mindhárom Rate Limit bindinget felismeri; nincs telepítés.
- `npm run test:security`: **3/3 elkülönített Edge-próbablokk PASS** a build tényleges `_headers` tartalmával kiszolgálva. App/beállítások betöltése és HTML-ként megadott profilnév szövegként kezelése; Google GIS script/style/frame engedése helyettesített tartalommal; inline script/eval/idegen kapcsolat tiltása. Ez nem valódi Google-login. A próba nem használ személyes böngészőprofilt; a service worker ki van kapcsolva ebben a CSP-próbában.
- `npm run test:account-access`: a korábbi **3/3 böngészőpróba PASS** az új eszközökkel: kétlapos sessionfrissítés, aláírt offline helyi jog, lejárat. Nem telepített telefonos offline PWA-próba.
- Mindkét végleges `npm audit --json`: nulla találat; `git diff --check` PASS.

Lockfájlok SHA-256:

```
package-lock.json         DC0D113CE441A0DD541E7D22642DEF5E2D0A8F57A7F2DFD8E2B7CBE37DADA85A
worker/package-lock.json  D4CDF3658BABC86CF7406BF11F90B3EF76ADAEB98E7360AAA58D0F1054F5CB44
```

## Kiadáskor megmaradó ellenőrzés és üzemeltetés

1. Worker előbb, majd frontend/Pages kiadás azonosított commitból. Az új Worker a régi klienssel 5000 alvásig kompatibilis; az új kliens a régi Worker teljes válaszát is kezeli a saját felső határáig. A konfigurált névterek (`19100–19102`, `19200–19202`) egyediségét a Cloudflare account többi Workeréhez képest ellenőrizni kell. A helyi dry-run nem bizonyítja a távoli limiter működését vagy a CPU-limit megfelelőségét a szolgáltatási csomagban.
2. Azonosított stagingen kis, elkülönített próbával 429/Retry-After és a helyreállás ellenőrzése, használati mutatók alapján küszöbhangolás; valódi Google-belépés és PWA az összevont kiadási körben. A közös belépési védőkorlát szándékosan összesített, így nagy egyidejű forgalomnál legitim felhasználók is várhatnak. Nem teszteltünk az élő családok ellen terhelést.
3. A [Cloudflare dokumentációja](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) szerint a limiter PoP-onkénti és idővel konzisztens, nem szigorú globális számláló. Elosztott támadás, tartós tárhely-növekedés, Cloudflare-invokációs költség ellen önmagában nem elég. Külső WAF/költségriasztás, adatmegőrzés és üzemeltetési monitorozás továbbra is az A17/A26 és a kiadási kapu része; az idempotenciát őrző műveletnaplót nem takarítjuk bizonyítatlan TTL alapján.
4. A `_headers` Cloudflare Pages statikus kiszolgálásra vonatkozik; a Function saját fejléceket ad. GitHub Pages nem alkalmazza ezt a fájlt. A végleges hoszton valódi HTTP-fejlécekkel kell igazolni; új API-origin esetén a CSP-t hozzá kell igazítani. A Google-engedélylista alapja a [hivatalos GIS útmutató](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Helyi tárolóban továbbra is érzékeny naplóadat van: a CSP védelem, nem kliensoldali titkosítás, és nem védi az adatokat kompromittált, engedélyezett JavaScripttől.
5. Titkok kezelése/rotáció: külön staging/production secret, soha nem frontend `VITE_` változóban vagy naplóban. Az `AUTH_SECRET` session-, nonce- és telepítésazonosító-hash-eket, a `TOKEN_PEPPER` családi tokenhash-eket is érint; ezeket nem szabad egyszerű, következmény nélküli rotációként átírni. Backup → elkülönített staging forgatási/visszacsatlakozási próba → tervezett session-visszavonás/eszköz-úrakapcsolás vagy verziózott hash-migráció → ellenőrzött kiadás szükséges. A konkrét távoli rotációs főpróba még nincs elvégezve. A16 offline ES256 privát/nyilvános kulcspár kiadása külön nyitott feladat; kulcsváltásnak az offline igazolások elfogadására is hatása van.

## Következő és GitHub Desktop Summary

**Következő: A20 — az alváskonfliktusok összehasonlítható megjelenítésének és a megmaradt akadálymentességi eseteknek a lezárása, gépi próbákkal. GPT-6 Astra · erős (high); most nem szükséges tulajdonosi tesztelés.** A már elkészült beállításrendezést és a kézzel elfogadott gyermekkonfliktusokat nem kezdjük újra.

Summary: `Add request budgets, bounded snapshot downloads and security headers`

Description: `Preserve diary and session state under rate limits and interrupted paginated sync. Enforce Google-compatible CSP and safe API errors, update vulnerable development dependencies, and add automated security checks.`
