# Solemi Sleep — App Store és Google Play vásárlási integráció

**Állapot:** a közös contract és a helyi persistence első implementációja megvan; kiadás előtt auditjavítás szükséges

**Dátum:** 2026-09-20

**Érintett csomagok:** Family (990 Ft/hó), Family+ (1 490 Ft/hó)

**Auditkapu:** a [teljes audit](FULL_RELEASE_AUDIT_2026-09-20.md) A08–A10 pontja
reprodukálta az egyidejű eseménykezelés/időrend, Google linked-token csere és
sandbox/production kerítés hiányait. A korábbi 29 célzott teszt soros esetekben
sikeres; ez nem teljes fizetési biztonsági elfogadás. Előbb ezek javítása és
regressziós tesztje, csak utána vásárlási HTTP-bekötés. A11/A12 tartalmazza a
provider és natív kiadás további kapuit. A teljes projekt következő munkája A01.

## Cél

A telefon csak az Apple vagy a Google natív vásárlási folyamatát indítja el.
Family vagy Family+ jogosultságot kizárólag a Solemi Worker adhat, miután az
áruház válaszát ellenőrizte és az accounttal összekapcsolta. A kliens által
beküldött csomagnév, ár, fizetett jelző vagy lejárat soha nem lehet jogosultság
forrása.

A már elfogadott családi szabály változatlan: bármely aktív családtag érvényes
előfizetése az egész aktív családnak biztosítja az adott csomag funkcióit. A
vásárlás, számlázás és visszaállítás továbbra is a vásárló accountjához tartozik.

## Kiinduló helyzet

- A frontend jelenleg React/Vite PWA; nincs iOS- vagy Android-projekt.
- A Worker már külön tárolja a subscription, subscription event és account
  entitlement adatokat.
- A `MANUAL` provider kizárólag belső tesztelésre működik.
- A családi effektív Family/Family+ jog kiszámítása és kéttelefonos staging
  elfogadása elkészült.
- Az áruházi vásárlás, visszaállítás, értesítés és visszatérítés kezelése még
  nincs bekötve.

## Kötelező biztonsági határ

### Amit a telefon beküldhet

- Apple: a StoreKit 2 által adott aláírt tranzakció (`signedTransaction`).
- Google Play: a Play Billing által adott átlátszatlan `purchaseToken`.

### Amit a telefon nem állíthat

- account ID;
- Family vagy Family+ termék;
- fizetett vagy aktív állapot;
- lejárat vagy hozzáférési idő;
- próbaidő, türelmi idő vagy automatikus megújítás.

A Worker a bejelentkezett sessionből ismeri az accountot. A terméket a saját,
szerveroldali store-product térképéből állapítja meg, a státuszt és az időket az
Apple vagy a Google friss válaszából veszi.

## Közös provider contract

A `worker/src/billingContract.ts` rögzíti az áruházfüggetlen formát:

- provider: `APPLE` vagy `GOOGLE_PLAY`;
- környezet: `SANDBOX` vagy `PRODUCTION`;
- termék: `FAMILY` vagy `FAMILY_PLUS`;
- normalizált státusz: `TRIALING`, `ACTIVE`, `GRACE_PERIOD`, `PAST_DUE`,
  `CANCELED`, `EXPIRED`, `REVOKED`;
- stabil provider subscription ID;
- aktuális tranzakció ID;
- Solemi-accounttal összekötött átlátszatlan külső account token;
- kezdőidő, megújítás, próbaidő, periódus vége, hozzáférési határ és
  ellenőrzési idő.

Az első helyi szelet a következő döntéseket teszteli:

| Store-állapot | Hozzáférés |
| --- | --- |
| Próbaidő | Igen, az igazolt `accessUntil` időpontig |
| Aktív | Igen, az igazolt `accessUntil` időpontig |
| Türelmi idő | Igen, az igazolt türelmi idő végéig |
| Lemondott, de még kifizetett | Igen, a periódus végéig |
| Fizetési hátralék / account hold | Nem |
| Lejárt | Nem |
| Visszavont vagy visszatérített | Nem, azonnal |

A határidő kizáró: ha `now === accessUntil`, a hozzáférés már nem él.

## Account és store összekapcsolása

Az internal `acc_...` azonosító nem kerülhet közvetlenül egyik áruházhoz sem.
A Worker minden bejelentkezett accounthoz provider-specifikus, véletlen,
személyes adatot nem tartalmazó aliaszt ad:

- Apple `appAccountToken`: szabványos UUID;
- Google `obfuscatedAccountId`: legfeljebb 64 karakteres base64url token.

A helyi additív `007_store_billing_state.sql` migráció létrehozza:

1. `billing_account_links`
   - `account_id`, `provider`, `external_account_token`, időbélyegek;
   - egy account/provider párhoz egy token;
   - egy provider/token pár csak egy accounthoz tartozhat.
2. `store_subscription_state`
   - hivatkozás a meglévő `subscriptions` rekordra;
   - környezet, aktuális provider transaction ID, külső account token;
   - utolsó provider-ellenőrzés és provider-esemény ideje;
   - Google acknowledgement állapot;
   - lecserélt/összekapcsolt korábbi subscription ID.

Kiegészítő táblákkal a meglévő `006` adatok átírás nélkül megmaradnak. A
migráció csak külön staging backup/restore próbával kerülhet távoli D1-re.

Az A08 helyi javításához a `008_billing_event_order.sql` két mezőt ad a
`store_subscription_state` táblához: az utoljára ténylegesen alkalmazott
eseményazonosítót és státuszt. Az eseményfoglalás, állapotváltás és grantok
egy batchben maradnak; azonos ellenőrzési időnél a visszavonás elsőbbséget kap.
Ezt a migrációt sem alkalmaztuk távoli D1-en. A provider-állapotverzió és a
valódi Apple/Google adapteres párhuzamos próba nélkül A08 továbbra is nyitott.

## Apple folyamat

1. Az app a Servertől lekéri a bejelentkezett account stabil
   `appAccountToken` értékét.
2. StoreKit 2 megjeleníti az App Store-ból kapott terméket és helyi árat.
3. Sikeres, helyileg ellenőrzött tranzakció után az app beküldi az aláírt
   tranzakciót a Workernek.
4. A Worker ellenőrzi az Apple JWS láncot, bundle ID-t, környezetet,
   `appAccountToken` értéket és a szerveroldali product ID térképet, majd az
   App Store Server API-ból friss állapotot kér.
5. A Worker idempotensen menti az eseményt, subscriptiont és entitlementeket.
6. A kliens csak a sikeres szerverválasz után fejezi be a tranzakciót.
7. Az App Store Server Notifications V2 minden változásnál újraellenőrzést
   indít; maga az értesítés nem írhat közvetlenül jogosultságot.

Visszaállításkor először a StoreKit aktuális entitlementjeit olvassuk. Az
`AppStore.sync()` csak a felhasználó külön „Vásárlások visszaállítása”
választására hívható, mert App Store-hitelesítést kérhet.

Az elavult `verifyReceipt` végpont nem része az új megoldásnak.

## Google Play folyamat

1. Az app a Servertől lekéri a stabil `obfuscatedAccountId` értéket.
2. Play Billing 9.x a Play Store-ból kapott terméket és helyi árat mutatja.
3. Sikeres vásárláskor az app csak a `purchaseToken` értéket küldi a Workernek.
4. A Worker a Google Play Developer API
   `purchases.subscriptionsv2.get` végpontján lekéri a friss állapotot, és
   ellenőrzi a package nevet, az account aliaszt és a product ID térképet.
5. `PENDING` vásárlásból nem keletkezik entitlement.
6. A mentés után a backend nyugtázza az új purchase tokent; a nyugtázás
   állapota külön tárolódik és biztonságosan újrapróbálható.
7. Real-time Developer Notifications (Pub/Sub) csak újraellenőrzést indít. A
   Worker mindig a Developer API friss válaszából számol jogosultságot.
8. Upgrade vagy downgrade esetén a `linkedPurchaseToken` alapján a régi tokent
   lezárjuk, hogy két subscription ne adjon párhuzamos grantot.

## Szerveroldali írási sorrend

1. Session és account ellenőrzése.
2. Provider account alias betöltése.
3. Store-bizonyíték és provider-válasz ellenőrzése.
4. Product ID → Solemi termék leképezése kizárólag szerverkonfigurációból.
5. Régebbi provider-állapot elutasítása az esemény/ellenőrzés időpontja alapján.
6. `subscription_events`, `subscriptions`, provider state és
   `account_entitlements` atomi D1 batchben történő frissítése.
7. Google acknowledgement külön, idempotens külső lépésként; hibánál
   `PENDING` állapot és újrapróbálás.
8. A kliens a már meglévő `/v1/auth/access` válaszból kapja meg az effektív
   személyes és családi jogokat.

## Tervezett API-felület

- `GET /v1/billing/context` — provider account aliasok és a szerver által
  támogatott termékek; ár nélkül.
- `POST /v1/billing/apple/verify` — Apple aláírt tranzakció ellenőrzése.
- `POST /v1/billing/google-play/verify` — Google purchase token ellenőrzése.
- `POST /v1/billing/apple/notifications` — App Store Notifications V2.
- `POST /v1/billing/google-play/notifications` — hitelesített Pub/Sub push.
- `POST /v1/billing/reconcile` — bejelentkezett vásárló explicit
  visszaállításának és újraellenőrzésének indítása.

A pontos útvonalak az alkalmazási szolgáltatás elkészítésekor véglegesülnek.
A notification végpontok nem account-sessionnel, hanem provider által
hitelesített üzenettel működnek.

## Mobilalkalmazás

A jelenlegi React felület megtartható, de App Store/Google Play fizetéshez
natív konténer szükséges. Elsőként Capacitor 8 megvalósíthatósági próbát kell
készíteni ugyanebből a forrásból. Az áruházi réteg saját, kicsi natív bridge-et
kap StoreKit 2-höz és Play Billing 9.x-hez; harmadik fél IAP plugint csak külön
karbantartási és biztonsági áttekintés után választunk.

A paywall az áruház által visszaadott nevet, időszakot és helyi árat mutatja,
nem kódban rögzített árat. Legyen rajta vásárlás, visszaállítás és előfizetés
kezelése. A már másik áruházban aktív előfizetőnek az app nem ajánlhat
észrevétlen második előfizetést; megmutatja, melyik áruházban kezelhető.

Az iOS/Android indulás további blokkolói: natív Google-belépés vagy rendszeres
böngészős OAuth, iOS-en a Sign in with Apple követelményének ellenőrzése,
alkalmazáson belüli accounttörlés, Privacy Policy, support oldal, végleges
bundle/package azonosító és iOS buildhez macOS/Xcode hozzáférés.

## Termékkatalógus

- Apple: egy subscription group, azon belül havi Family és Family+.
- Google Play: havi Family és Family+ termék/base plan egyértelmű upgrade és
  downgrade kapcsolattal.
- A 7 napos próba csak Family+ termékhez tartozik.
- A végleges store product ID-k csak a bundle/package ID rögzítése után
  készülnek el.
- A magyar 990/1 490 Ft tervet az áruházak támogatott árszintjeire kell
  illeszteni; a felületen mindig az áruház aktuális ára jelenik meg.

## Megvalósítási sorrend és kapuk

1. **Közös contract és tiszta tesztek — elkészült helyben.**
   - proof-only klienskérés;
   - termék-feature térkép;
   - hozzáférési állapotmátrix;
   - provider-specifikus account alias formátum.
2. **D1 persistence és alkalmazási szolgáltatás — elkészült helyben.**
   - additív `007` migráció;
   - idempotens, időrendvédett snapshot alkalmazás;
   - régi grant visszavonása és új grant létrehozása egy batchben;
   - valódi SQLite/D1 tesztek.
3. **Mock provider adapterek és HTTP-végpontok.**
   - nincs hálózati vagy store secret;
   - purchase, restore, duplicate event, stale event, refund teszt.
4. **Capacitor megvalósíthatósági próba.**
   - ugyanaz a React build iOS/Android shellben;
   - auth/session és offline/local storage megőrzése;
   - natív billing bridge szerződése.
5. **Apple adapter és sandbox.**
6. **Google Play adapter és license tester/closed test.**
7. **Notification, rendszeres reconciliation és hibás acknowledgement
   újrapróbálás.**
8. **Kétaccountos, kéttelefonos elfogadás minden csomagváltással.**
9. **Production csak külön jóváhagyással.**

## Kötelező tesztmátrix

- új Family és Family+ vásárlás;
- Family+ 7 napos próba, lejáró próba és fizetős folytatás;
- megújítás;
- lemondás periódus közben;
- lejárat;
- türelmi idő és annak vége;
- Google account hold/PENDING;
- refund/revoke azonnali jogvesztéssel;
- Family ↔ Family+ upgrade/downgrade;
- ugyanazon esemény többszöri beérkezése;
- régi esemény későbbi beérkezése;
- elveszett kliensválasz utáni ismételt verify;
- újratelepítés és vásárlás-visszaállítás;
- rossz accounthoz tartozó `appAccountToken`/`obfuscatedAccountId`;
- sandbox bizonyíték production végponton és fordítva;
- aktív családban másik fizető megmaradása;
- utolsó fizető lejárata: sync pause, adatok megmaradnak;
- másik áruházban már aktív account kezelése dupla terhelés nélkül.

## Hivatalos műszaki alapok

- Apple App Store Server API: <https://developer.apple.com/documentation/appstoreserverapi>
- Apple App Store Server Notifications V2:
  <https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications>
- Apple StoreKit aktuális entitlementek:
  <https://developer.apple.com/documentation/storekit/transaction/currententitlements>
- Apple `appAccountToken`:
  <https://developer.apple.com/documentation/appstoreserverapi/appaccounttoken>
- Google Play Billing integráció:
  <https://developer.android.com/google/play/billing/integrate>
- Google Play backend és RTDN:
  <https://developer.android.com/google/play/billing/backend>
- Google Play vásárlásbiztonság:
  <https://developer.android.com/google/play/billing/security>
- Google `purchases.subscriptionsv2.get`:
  <https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get>
- Capacitor meglévő webapp integráció:
  <https://capacitorjs.com/docs>

## Ebben a szeletben nincs

- App Store Connect vagy Google Play Console módosítás;
- store-termék létrehozása;
- kulcs vagy secret bekérése/tárolása;
- távoli D1 migráció;
- staging vagy production deploy;
- működő fizetési gomb.

Ezek csak a persistence, a natív shell és a provider adapterek célzott
elkészítése után tesztelhetők biztonságosan.
