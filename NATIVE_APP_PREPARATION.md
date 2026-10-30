# Solemi — Android/iOS keret és áruházi vásárlás

**2026-10-29–30 — helyi előkészítés, nem áruházi kiadás.**

Az Android Studio- és Xcode-projekt létrejött. A meglévő React-alkalmazás helyi
csomagként kerül a telefonba; nincs távoli weboldalra mutató `server.url`, és
a natív build nem regisztrál service workert. A meglévő webes kiadás változatlan
buildparancsot használ. Az app azonosítója egyelőre `app.solemi.sleep`; ezt az
első áruházi feltöltés előtt a saját konzolokban véglegesíteni kell.

## Elkészült

- Capacitor 8.6.0 Android/iOS-projektek, meglévő Solemi-ikon, helyi `dist-native`
  csomag, újragenerálható platformbekötés. Android API 24 minimum / 36 target;
  iOS minimum 15.0. Aláírási kulcsok és generált webes csomagok Gitből kizárva.
- `@capgo/native-purchases` 8.9.6: StoreKit 2 / Play Billing 9.1.0 híd. Ez a
  csomag nem igényel RevenueCat- vagy Capgo-előfizetést a vásárlásokhoz; a meglévő
  saját szerver végzi az ellenőrzést. Az npm-csomag forrása/licence megmarad.
- Beállításokban natív, bejelentkezett fiókhoz kötött csomaglista, vásárlás,
  vásárlás-visszaállítás, áruházi előfizetés-kezelés HU/EN/DE szöveggel.
- Terméktérkép és fiókalias a `/v1/auth/billing/{apple|google}/prepare`
  végpontról; ár az áruházból. V1-ben csak normál havi, automatikusan megújuló
  csomag szerepel. A Solemi saját trialszabálya változatlan, store-trialt nem indítunk.
- Apple: `appAccountToken` + JWS → szerver `/verify` vagy `/restore` → csak
  sikeres, tartós feldolgozás után StoreKit `finishTransaction`.
- Google: obfuscated account alias + pontos product/base plan/offer → purchase
  token → szerver. A kliens nem acknowledge-ol; azt továbbra is a Worker végzi.
- Függő vásárlás, megszakítás, eltérő fiók, közben történt ki-/bejelentkezés,
  ár-/termékváltozás, szerverhiba és acknowledge-újrapróba kezelve. Új vásárlást
  nem indít, ha az áruház már meglévő vagy függő előfizetést jelez. A közvetlen
  csomagváltási checkout helyett ilyenkor visszaállítás/áruházi kezelés érhető el.
- Induláskor, előtérbe visszatérve, bejelentkezéskor, hálózat-visszatéréskor és
  StoreKit-frissítéskor a meglévő vásárlások újraellenőrzése. `AppStore.sync`
  csak a felhasználó kifejezett Visszaállítás műveleténél fut. Egy menet legfeljebb
  20 tranzakciót dolgoz fel, egy részhiba nem szakítja meg a többit.
- A helyreállítás forrása az áruház tartós vásárlási listája/befejezetlen sora;
  bizonylatot nem teszünk naplóexportba vagy böngészős helyi tárolóba. Hozzáférést
  kizárólag a meglévő szerveroldali jogosultságlekérés frissít.

## A rögzített vásárlási híd szűk javítása

Az eredeti 8.9.6 Android-kód a base plan első ajánlatát választotta, és hiányzó
találatnál másik ajánlatra eshetett vissza. A `scripts/patch-native-purchases.mjs`
telepítéskor és `native:sync` előtt megköveteli a pontos base plan + offer token
egyezést, offer ID nélkül, egyetlen végtelenül ismétlődő díjszakasszal. Hiányzó
találatnál hibával leáll. A megjelenítendő időszakot is átadja a JavaScriptnek.
Az Android-termékmezők ebben a verzióban: `identifier=basePlanId`,
`planIdentifier=productId`; a frontend szándékosan ehhez illeszkedik.

A javítás az iOS tranzakciólezárás feltétlen azonosító-kiírásait is eltávolítja.
A csomag többi forrását nem írja át. A script más verziót/eltérő javítási pontot
elutasít, ismételten biztonságosan futtatható. A javítás forrása a repositoryban
van; függőségfrissítéskor ezt a néhány pontot újra kell egyeztetni.

## Most futtatható parancsok

```text
npm ci
npm run test:native
npm run typecheck
npm run native:sync
npm run native:android
```

Macen az utolsó helyett `npm run native:ios`. A `native:sync` webes fordítást és
platformszinkront végez, **nem fordít APK/AAB/IPA állományt, nem ír alá és nem tölt fel**.
A CI ugyanezt az előkészítést végzi. A natív előkészítő profil a `.env.native`:
fizetés, fiókbelépés és családi szinkron kikapcsolva, helyi naplóval. Ez nem a
staging webes fiók automatikus átvitele: a külön alkalmazás saját tárhelyet használ.
A régi napló a meglévő export/import folyamattal vihető át.

Ezen a gépen nincs elérhető Android SDK/JDK; Xcode macOS-t igényel.
A platformprojektek tényleges natív fordítása és telefonos futtatása ezért még
nem ellenőrzött. iOS-hoz Mac/Xcode, Androidhoz Android Studio/SDK/JDK kell.

## A következő konkrét bekötés

**Natív bejelentkezés és munkamenet.** A jelenlegi Google Identity Services
böngészős belépést nem szabad működő natív belépésnek tekinteni. A natív Google
azonosítás, az iOS belépési lehetőségei és az API-kérés/munkamenet-kezelés még
bekötendők. A natív eredet (`capacitor://localhost`, Androidon `https://localhost`)
nincs automatikusan hozzáadva a szerver engedélyezett eredeteihez. A cookie-kat,
frissítést és visszavonást a natív bekötéssel együtt kell rendezni, az eddigi
böngészős védelem fellazítása nélkül. Erre saját áruházi fizetési fiók nélkül is
előkészíthető kód, de a tényleges Google/iOS azonosítók kellenek a készülékes próbához.

A vásárlási vezérlő már a meglévő `accountRequest`/`getAccountAccess` felületet
használja, így ehhez a belépési bekötéshez nem kell új fizetési szervert építeni.
A natív production build jelenleg szándékosan megáll; ezt a korlátot a natív
belépés és kiadási konfiguráció elkészültekor kell tényleges feltételekre cserélni.

Utána: saját store-fiókok, végleges app-/termékazonosítók és kulcsok, megfelelő
Worker-konfiguráció/migrációk, majd célzott valódi sandbox vásárlás, függő vásárlás,
újraindítás utáni visszaállítás és refund. A végső fizetési felülethez az elfogadott
csomagígéretek és a végleges adatkezelési/feltétel-linkek is szükségesek. A korábbi
A17/A27/M1–M6 sikeres köröket ez nem nyitja újra.

## Gépi bizonyíték

- 27 célzott próba: alias/ár/termék, függő és megszakított vásárlás, szerverhiba,
  fiókváltás, lezárási sorrend, duplikált visszaállítás, részhiba, Google ack-újrapróba,
  webes mock tiltása és kiadási profil korlátai.
- Frontend + Capacitor-konfiguráció typecheck; natív webcsomag fordítása;
  Android/iOS `cap sync`. Ezek szimulált store-próbák, nem valódi vásárlások.
- A megszakítás után, október 30-án a lezáró typecheck, hagyományos webbuild és
  repository-ellenőrzés is sikeres. A 27 már sikeres próbát nem indítottuk újra.
- Az új függőségek auditjában nincs közepes/magas/kritikus találat. A meglévő
  webes PWA buildlánc `deepmerge@4.3.1` függőségéből 4 alacsony jelzés van;
  ez a verzió már a munka előtti lockfile-ban is szerepelt. Nem futott kényszerített
  függőség-visszabutítás. A natív buildben a PWA-generálás ki van kapcsolva.
- Távoli módosítás, store-aktiválás, aláírás, feltöltés nem történt.

Hivatalos/elsődleges leírások:
[Capacitor telepítés](https://capacitorjs.com/docs/getting-started),
[környezeti feltételek](https://capacitorjs.com/docs/getting-started/environment-setup),
[vásárlási híd forrása és API-ja](https://github.com/Cap-go/capacitor-native-purchases),
[Play ismétlődési módok](https://developer.android.com/reference/com/android/billingclient/api/ProductDetails.RecurrenceMode).

GitHub Desktop Summary: `Add native mobile shells and server-verified purchase flows`
