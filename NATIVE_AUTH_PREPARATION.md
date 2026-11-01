# Solemi — natív belépés és mobilos munkamenet

**2026-10-30: helyi implementáció és gépi ellenőrzés; nincs kiadás vagy távoli aktiválás.**

**Lezáró folytatás, 2026-11-01:** a megszakítás után a végleges feliratokat is
tartalmazó natív csomagot és platformszinkront frissítettük. A korábbi sikeres
próbákat nem ismételtük; távoli konfiguráció, migráció és aktiválás nem történt.

## Elkészült

- Natív Google-belépés Androidon és iOS-on, a meglévő Google-identitás alapján
  ugyanahhoz a Solemi-fiókhoz. A natív app nem tölt be böngészős Google-belépési oldalt.
- iOS Apple-belépés előkészítése: natív hívás, aláírt ID-token ellenőrzése,
  külön Apple-identitás és a korábbi trialhasználat megőrzése törlés után is.
  Apple és Google azonos e-mailje nem kapcsol össze két fiókot. A meglévő
  Google-fiók folytatásához iPhone-on is a Google-gombot kell választani.
- Szerver által kiadott, egyszer használható, platformhoz és szolgáltatóhoz
  kötött nonce. Apple: a natív kérésben SHA-256, a szervernek az eredeti kihívás;
  a szerver maga ellenőrzi az egyezést. Aláírás, issuer, audience, idő és nonce
  ellenőrzése; Google natív azp csak külön engedélyezett kliensazonosító lehet.
- Forgó Solemi-refresh kulcs és telepítési titok védett natív tárolóban:
  Android Keystore, iOS Keychain, iCloud-szinkron nélkül, csak ezen az eszközön.
  A rövid access token továbbra is a meglévő munkameneti tárolóban él.
  A frissítőkulcs nem kerül naplóexportba vagy localStorage-ba.
- Elveszett frissítési válasznál a régi kulcsot nem küldjük el újra: új
  bejelentkezést kérünk, a napló megmarad. Kijelentkezés szerveroldali visszavonással;
  fióktörléskor azonnali helyi visszabelépési tiltás, akkor is, ha a Keychain zárolt.
  iOS-újratelepítéskor megmaradt Keychain-bejegyzés nem léptet be automatikusan.
- A korábbi két aktív eszköz, eszközcsere, vendégnapló-választás, fiókváltási
  védelem, jogosultság és natív vásárlás a meglévő account API-n keresztül működik.
- Android activity-result bekötés; iOS SceneDelegate Google-visszatérés,
  URL-séma változó és Apple entitlement. Ezek forrás/config szinten készültek,
  Android/iOS fordítóval és valódi készüléken még nem ellenőrzöttek.

## A bekapcsolás konkrét adatai

Alapból minden új kapcsoló `false`. A `.env.native` továbbra is helyi,
kikapcsolt belépésű/fizetésű előkészítő profil. A webes cookie-kezelés megmaradt;
natív refresh csak POST-törzsből jöhet, natív kérés nem küld browser cookie-t.

| Hely | Szükséges konfiguráció |
| --- | --- |
| Worker adatbázis | Meglévő migrációk után `015_native_apple_identity.sql`, majd `016_apple_signin_lifecycle.sql`; Apple-identitás és titkosított visszavonási sor, Google-adatok megtartásával. Távol még nincs alkalmazva. |
| Worker | `NATIVE_AUTH_ENABLED=true`; `NATIVE_GOOGLE_WEB_CLIENT_ID`, `NATIVE_GOOGLE_IOS_CLIENT_ID`; szükség esetén `NATIVE_GOOGLE_AUTHORIZED_PARTIES` pontos natív kliensazonosítók vesszős listája. Nincs wildcard. |
| Google Console | A végleges Android package + aláírás SHA-ujjlenyomata és iOS bundle ID OAuth-kliensei, megfelelő consent/beállítások. A meglévő webes Google-kliens változatlanul megmarad. |
| iOS Xcode | `SOLEMI_GOOGLE_REVERSED_CLIENT_ID` build setting: a tényleges iOS Google-kliens megfordított URL-sémája. Jelenleg üres; nem helyettesítettük kitalált azonosítóval. |
| Natív build | `VITE_ACCOUNT_AUTH=true`, `VITE_NATIVE_AUTH=true`, explicit HTTPS Worker gyökércím a `VITE_ACCOUNT_API_BASE` és `VITE_SYNC_API_BASE` értékében. Nem a Pages `/api` proxy. |
| Apple, későbbi bekapcsolás | `NATIVE_APPLE_CLIENT_ID`: végleges bundle ID; Apple Developer Sign in with Apple capability + provisioning. Külön `NATIVE_APPLE_AUTH_ENABLED` és `VITE_NATIVE_APPLE_AUTH` kapcsoló. |

A Worker natív kapcsolója kizárólag `capacitor://localhost` (iOS) és
`https://localhost` (Android) eredetet enged. Ez CORS-határ, nem készülékhitelesítés;
a hozzáférést továbbra is ellenőrzött szolgáltatói bizonyíték és Solemi-munkamenet adja.
A `/v1/auth/native/{challenge,login,refresh,logout}` válaszai nem cache-elhetők,
nem állítanak cookie-t, a belépési kéréskorlát vonatkozik rájuk. A nyilvános
Pages proxy nem továbbítja őket. A nem titkos natív Google-kliensazonosítókat a
Worker kihívásválasza adja vissza; szolgáltatói privát kulcs soha nem kerül az appba.

## Ami még nincs kész / igazolva

**2026-11-01: az Apple belépési életciklusának helyi kódja elkészült.**
Szerveres authorization-code csere, titkosított token, végleges fióktörléshez kötött
visszavonás és aláírt Apple-értesítések kezelése kész. A 016 migráció, külön kulcsok,
webhook és cron bekötési sorrendje: [Apple-belépés visszavonása](APPLE_SIGN_IN_LIFECYCLE.md).
Valódi Apple-kulcsok és készülékes elfogadás nélkül továbbra sem aktiváljuk.

**Valódi mobilos elfogadás:** fejlesztői fiókok/azonosítók, Android SDK/JDK,
Mac/Xcode, aláírás és készülékes Google/Apple-belépés még szükséges. A natív
production build tiltása megmarad. A sikeres TypeScript/build nem APK/IPA-fordítás,
nem valódi OAuth- vagy sandbox-vásárlási bizonyíték. Nem indítjuk újra az A27/M1–M6 köröket.

## Ellenőrzés

- `npm run test:native-auth`: **108/108 PASS**, kilenc fájl. JWT-ellenőrzés,
  nonce/Origin/proxy/rate határok, Google-fiók megtartása, Apple-fiók elkülönítése,
  015 migráció, Apple trialjelölés, frissítés/visszavonás és védett tárolóhibák.
- A módosított account-modul meglévő visszaállítási/proxy/jogosultsági és natív
  vásárlási kapcsolatai: további **92/92 PASS**, öt fájl.
- Frontend és Worker typecheck PASS; natív webbuild és `cap sync` Android/iOS PASS;
  bekapcsolt auth-kóddal külön helyi próbabuild PASS; webbuild és repository-higiénia PASS.
- Worker `deploy:staging -- --dry-run`: helyi csomag sikeres, a kimenet
  `--dry-run: exiting now.`. Nincs deploy, migráció vagy távoli titokbeállítás.

Híd: `@capgo/capacitor-social-login@8.7.5`, tároló:
`@aparajita/capacitor-secure-storage@8.0.1`, pontosan rögzített verziókkal.
Bekötési források: [Android](https://capgo.app/docs/plugins/social-login/google/android/),
[iOS](https://capgo.app/docs/plugins/social-login/google/ios/),
[védett tároló](https://github.com/aparajita/capacitor-secure-storage).

**Következő:** fejlesztői fiókok és az első készülékre telepíthető mobilbuild
konkrét beállítása. GPT-6 Astra · erős; tulajdonosi közreműködéssel.
Az Apple-életciklus helyi lezárását és új bizonyítékait a fenti dokumentum tartalmazza.

GitHub Desktop Summary: `Add native Google sign-in and protected mobile sessions`
