# Solemi — Apple-belépés visszavonása

**2026-11-01: helyi megvalósítás és célzott gépi ellenőrzés kész.** Távoli
migráció, kulcsbeállítás, aktiválás vagy készülékes próba nem történt.
Ez a belépéshez tartozik; az App Store előfizetések külön értesítési rendszere megmarad.

## Működés

- A natív iOS híd `useProperTokenExchange: true` módban külön authorization code-ot
  ad vissza. A cserét a Worker végzi, a privát Apple-kulcs sosem kerül az appba.
  A visszakapott ID-token aláírása, címzettje, nonce-a és felhasználója is ellenőrzött.
- Az Apple refresh token AES-GCM titkosítással kerül a D1-be. A titkosítókulcs külön
  Worker-secret; az azonosítókhoz külön származtatott HMAC-kulcs tartozik.
  A token, a kód és a szolgáltatói válasz nem kerül naplóba vagy fiókexportba.
- Végleges Solemi-fióktörléskor az adatbázis ugyanabban a tranzakcióban visszavonási
  sorba teszi a kulcsot. A Solemi-törlést nem akadályozza Apple-kiesés. A kiválasztott
  30 napos helyreállítás alatt a kapcsolat megmarad; véglegesítéskor kerül sorba.
- A külön, ötpercenkénti feldolgozó legfeljebb egy Apple-hívást indít. Foglalás védi
  a párhuzamos feldolgozást, hiba után növekvő késleltetéssel újrapróbál. Csak Apple
  HTTP 200 után törli az érintett titkosított tokent; minden külön tokent ellenőriz.
  A már aktívval azonos, félbehagyott tokenmásolatot külső visszavonás nélkül takarítja.
- Függő visszavonás alatt ugyanazzal az Apple-identitással nem ad új Solemi-belépést.
  A visszavonás után új, friss Apple-hitelesítés szükséges. A korábbi trialjelölés megmarad.
- A `/v1/apple-signin/notifications` csak aláírt, megfelelő Apple-kibocsátótól és
  a beállított bundle ID-nak címzett üzenetet fogad. `consent-revoked` és
  `account-deleted` esetén megszünteti az érintett hozzáférést, a családi eszközét is.
  A késői/ismételt esemény nem vonja vissza az esemény után újra hitelesített belépést.
  Apple-fiók megszüntetése tiltja az érintett identitás új belépését.
- Az Apple-értesítés önmagában **nem törli a Solemi-naplót és nem mond le előfizetést**.
  Az `email-enabled`/`email-disabled` állapotot időrendben tárolja; nem jelentkeztet ki.
  A fogadási bejegyzés és a hozzáférés változása együtt, atomikusan történik.

## Konkrét bekötés, amikor megvannak a fejlesztői adatok

1. Mentés és az aktuális séma ellenőrzése után alkalmazandó a még ki nem adott
   `015_native_apple_identity.sql`, majd `016_apple_signin_lifecycle.sql` migráció.
   Most kizárólag memóriabeli tesztadatbázison futottak.
2. Apple Developer: Sign in with Apple képesség, végleges bundle ID, az ehhez
   használható Sign in with Apple kulcs, Team ID és Key ID.
3. Worker változók: `NATIVE_APPLE_CLIENT_ID` (bundle ID), `APPLE_SIGN_IN_TEAM_ID`,
   `APPLE_SIGN_IN_KEY_ID`. Külön secretek: `APPLE_SIGN_IN_PRIVATE_KEY` (PKCS8 PEM),
   `APPLE_SIGN_IN_TOKEN_KEY` (független, kriptográfiailag véletlen 32 bájt, 64 hex karakter).
   Ezek nem az App Store vásárlás-ellenőrzésének kulcsai, és nem kerülnek Gitbe.
4. Az Apple elsődleges App ID-ján a server-to-server értesítési URL az adott,
   tényleges Worker HTTPS-címe + `/v1/apple-signin/notifications`. Nem a Pages-proxy,
   nem a vásárlási `/v1/billing/notifications/apple` útvonal.
5. Worker cron: `4-59/5 * * * *`. Csak konfiguráció/migráció után kapcsolható be
   `APPLE_SIGN_IN_LIFECYCLE_ENABLED`, majd a natív Apple-belépés Worker- és
   appkapcsolója. A közös natív auth és az iOS provisioning feltételei továbbra is
   a [natív bekötési leírásban](NATIVE_AUTH_PREPARATION.md) szerepelnek.
6. A végleges kulcsokkal és aláírt iOS csomaggal egyszer szükséges a valódi belépés,
   fióktörlés és Apple-ből visszavonás ellenőrzése. A gépi próbák ezt nem helyettesítik.

Minden kapcsoló most `false`. A Google-belépéshez nem kell Apple-kulcsot megadni,
amíg az Apple-belépés ki van kapcsolva. Az Apple webhook és feldolgozó maradjon
aktív, amíg korábbi Apple-belépések vagy függő visszavonások léteznek, akkor is,
ha új Apple-belépéseket már nem fogadunk.

## Üzemeltetés és helyreállítás

- `apple_signin_maintenance`: utolsó futás időpontja, feldolgozott/hibás/függő darabszám.
  A cron hibás visszavonásnál sikertelen futást jelez. A tartós hiba, növekvő várólista
  vagy elmaradt cron riasztása az éles üzemeltetés bekötésének része; nincs új távoli
  riasztási szolgáltatás létrehozva ebben a feladatban.
- A titkosított token a kapcsolat fennállásáig, törlés után csak a visszavonás
  befejezéséhez marad meg. Tartós hiba esetén üzemeltetői javítás szükséges;
  pusztán a token törlése nem igazolja a szolgáltatói visszavonást. A kulcsot nem
  szabad eldobni vagy helyben lecserélni a meglévő titkosított sorok újratitkosítása nélkül.
- A hash-elt értesítési bejegyzések 30 nap után takaríthatók; a visszavonási
  időhatár csak inaktív/törölt fiók és üres tokenvárólista mellett, 30 nap után.
  Az aktív fiók tiltó állapota és az egyszeri trial külön nyilvántartása megmarad.
- Helyreállításkor `RESTORE_MAINTENANCE=true` megállítja a webhookot és a cront.
  Az üzleti helyreállító a tokeneket, tiltó állapotokat és értesítési bejegyzéseket
  kizárólag a friss, befagyasztott forrásból veszi át. Régi naplómentés nem éleszthet
  újra régi Apple-kulcsot. A törlés-visszajátszás ugyanazokat a sorba állító triggereket használja.
  Visszaállítás után a kulcs és bundle ID egyezése, a függő sorok és a cron ellenőrzendő.

## Elvégzett ellenőrzés

- `npm run test:apple-signin`: **118/118 PASS**, hat fájl. Valódi helyi JWT-aláírás,
  titkosított tárolás, visszavonás/újrapróba, párhuzamos foglalás, újraregisztráció,
  időrendi értesítések, HTTP bekötés, törlés, trialmegőrzés és üzleti visszaállítás.
- `npm run test:native-auth`: **111/111 PASS**, kilenc fájl. A fenti csomaggal
  részben átfed; a számok nem adhatók össze egyedi próbák számaként.
- Frontend/Worker typecheck, webbuild, natív webbuild és Android/iOS `cap sync` PASS.
- Worker staging **dry-run PASS**, 1195,34 KiB / gzip 219,85 KiB;
  `--dry-run: exiting now.` Távoli módosítás nem történt.
- A már lezárt A27/M1–M6 és általános auditkörök nem indultak újra.

Hivatalos szerződések:
[Apple token-visszavonás](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens),
[Apple fiókváltozási értesítések](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts),
[értesítési URL beállítása](https://developer.apple.com/help/account/capabilities/enabling-server-to-server-notifications).

GitHub Desktop Summary: `Handle Apple sign-in revocation and account deletion`

**Következő:** a fejlesztői fiókok és az első készülékre telepíthető mobilbuild
konkrét beállítása. GPT-6 Astra · erős; ehhez már tulajdonosi fiókadatok és
Android SDK/JDK, iOS-hoz Mac/Xcode szükséges. Új általános audit nem előfeltétel.
