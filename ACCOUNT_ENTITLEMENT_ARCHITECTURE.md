# Solemi Sleep — végleges account, membership, subscription és entitlement D1 architektúra

Státusz: **ARCHITEKTÚRA LEZÁRVA — implementáció előtt**

Dátum: 2026-08-24
Ellenőrzött GitHub-alap: `main` / `37d1728` (`Lock Free Family Family+ feature matrix`)

Ez a dokumentum a következő backend-implementáció normatív terve. Nem migráció és nem módosítja a live Cloudflare D1-et vagy Workert. A jelenlegi prototípus `worker/schema.sql` és `worker/src/index.ts` fájljait a célarchitektúrára való átálláskor, külön ellenőrzött migrációkkal kell módosítani.

Kapcsolódó lezárt döntések: `FEATURE_ENTITLEMENT_MATRIX.md`, `PRODUCT_DESIGN_LOCK.md`, `TECHNICAL_COLLISION_AUDIT.md`.

## 1. Lezárt termékszabályok

- V1-ben kizárólag Google-belépés van. A Google csak identitásszolgáltató, nem alvásadat-tároló.
- Egy embernek egy Solemi accountja van; egy accountnak legfeljebb 2 aktív eszköze lehet.
- Egy account egyszerre legfeljebb 1 aktív Family tagja lehet. A korábbi tagságok historyként megmaradnak.
- A Family létrehozója automatikusan admin. Több admin lehet.
- Bármely aktív Family-tag készíthet meghívót.
- A rövid, egyszer használható invite kód beváltása után a belépő automatikusan tag lesz; nincs admin-jóváhagyás.
- Mindenki kiléphet saját maga. Más tagot csak admin távolíthat el.
- Az utolsó admin nem léphet ki és nem távolítható el. Előbb másik aktív tagot adminná kell tenni.
- A harmadik eszköz belépése nem dob ki automatikusan senkit: a user választ egy régi aktív eszközt, azt visszavonja, majd regisztrálja az újat.
- A Family végleges törlését csak admin indíthatja, friss újraazonosítás és erős megerősítés után.
- Family Sync akkor aktív, ha legalább egy aktív tag rendelkezik érvényes Family vagy Family+ eredetű `FAMILY_SYNC` entitlementtel.
- Ha az utolsó fizető tag kilép vagy az entitlementje lejár, a sync azonnal szünetel. A cloud adat és a Family-kapcsolat megmarad.
- Family+ Insights account-szintű, személyes jogosultság. Nem öröklődik a többi családtagra.
- Trial: 7 nap Family+. Offline entitlement cache: legfeljebb 30 nap, de soha nem nyúlhat túl a szerver által engedélyezett hozzáférési időn.
- A Free account alvásadata local-first. Az account önmagában nem jelent automatikus cloud backupot.

## 2. Biztonsági és adattárolási határok

```text
Google ID token
  -> Solemi account
  -> account device + session
  -> egyetlen aktív family membership

Billing provider event
  -> subscription (billing truth)
  -> account entitlement grants
     -> személyes feature gate
     -> aktív membershipen keresztül Family Sync hozzájárulás

Sleep data
  Free: local-first
  aktív Family Sync: family-szintű kanonikus D1-adat
```

Az account, eszköz, tagság, billing és feature-jogosultság külön fogalom. A nyers child/session séma minden csomagban azonos; a csomagok funkciót, nem adattípust kapcsolnak be.

## 3. D1 konvenciók

- Minden ID szerver által generált, nem kitalálható `TEXT` ID, típusprefixszel (`acc_`, `dev_`, `fam_`, `mem_`, `sub_`, `ent_`).
- Minden időpont `INTEGER`, Unix epoch milliszekundum UTC-ben. Időzóna csak megjelenítési adat.
- Boolean érték `INTEGER NOT NULL CHECK (... IN (0,1))`.
- Minden Worker request elején `PRAGMA foreign_keys = ON` elvárás; minden migration ugyanezt használja.
- Titkos tokenből csak legalább SHA-256/HMAC hash kerül D1-be, környezeti pepperrel. Nyers Google token, session token, device credential, invite kód és provider receipt nem tárolható.
- E-mail nem identitáskulcs. A stabil kulcs a Google issuer + `sub`.
- D1 constraint az utolsó védelmi vonal; role-, entitlement- és tulajdonosi ellenőrzés a Workerben is kötelező.
- Provider webhook és kliens write idempotens. A provider eseményazonosítója és a kliens `operationId` egyedi.

## 4. Cél D1 séma

Az alábbi SQL a célállapot specifikációja. Külön, sorszámozott migration fájlokra kell bontani; **nem futtatható egyben a jelenlegi live adatbázison**.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id                 TEXT PRIMARY KEY,
  email              TEXT,
  display_name       TEXT,
  avatar_url         TEXT,
  locale             TEXT,
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'DELETION_PENDING', 'DELETED')),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  last_login_at      INTEGER NOT NULL,
  deleted_at         INTEGER,
  CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL))
);

CREATE TABLE account_identities (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  provider           TEXT NOT NULL CHECK (provider = 'GOOGLE'),
  issuer             TEXT NOT NULL,
  subject            TEXT NOT NULL,
  email_at_login     TEXT,
  email_verified     INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  created_at         INTEGER NOT NULL,
  last_verified_at   INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (provider, issuer, subject)
);

CREATE UNIQUE INDEX idx_one_google_identity_per_account
ON account_identities(account_id)
WHERE provider = 'GOOGLE';

CREATE TABLE account_devices (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  installation_hash  TEXT NOT NULL UNIQUE,
  credential_hash    TEXT NOT NULL UNIQUE,
  name               TEXT,
  platform           TEXT CHECK (platform IN ('WEB', 'IOS', 'ANDROID', 'OTHER')),
  created_at         INTEGER NOT NULL,
  last_seen_at       INTEGER NOT NULL,
  revoked_at         INTEGER,
  revoke_reason      TEXT CHECK (revoke_reason IS NULL OR revoke_reason IN
                     ('USER_REPLACED', 'USER_REVOKED', 'SECURITY', 'ACCOUNT_DELETED')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);

CREATE INDEX idx_account_devices_active
ON account_devices(account_id, last_seen_at DESC)
WHERE revoked_at IS NULL;

CREATE TRIGGER account_devices_max_two_insert
BEFORE INSERT ON account_devices
WHEN NEW.revoked_at IS NULL AND
     (SELECT COUNT(*) FROM account_devices
      WHERE account_id = NEW.account_id AND revoked_at IS NULL) >= 2
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_DEVICE_LIMIT');
END;

CREATE TRIGGER account_devices_max_two_reactivate
BEFORE UPDATE OF revoked_at ON account_devices
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL AND
     (SELECT COUNT(*) FROM account_devices
      WHERE account_id = NEW.account_id AND revoked_at IS NULL) >= 2
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_DEVICE_LIMIT');
END;

CREATE TABLE account_sessions (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  device_id          TEXT NOT NULL,
  refresh_hash       TEXT NOT NULL UNIQUE,
  created_at         INTEGER NOT NULL,
  last_used_at       INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  revoked_at         INTEGER,
  rotation_counter   INTEGER NOT NULL DEFAULT 0 CHECK (rotation_counter >= 0),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES account_devices(id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_account_sessions_device_active
ON account_sessions(device_id, expires_at)
WHERE revoked_at IS NULL;

CREATE TABLE families (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  revision           INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'DELETING')),
  created_by_account_id TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  delete_requested_at INTEGER,
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CHECK ((status = 'DELETING') = (delete_requested_at IS NOT NULL))
);

CREATE TABLE family_memberships (
  id                 TEXT PRIMARY KEY,
  family_id          TEXT NOT NULL,
  account_id         TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  joined_at          INTEGER NOT NULL,
  ended_at           INTEGER,
  ended_by_account_id TEXT,
  end_reason         TEXT CHECK (end_reason IS NULL OR end_reason IN
                     ('SELF_LEFT', 'ADMIN_REMOVED', 'FAMILY_DELETED')),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (ended_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CHECK ((status = 'ACTIVE') = (ended_at IS NULL)),
  CHECK ((status = 'ACTIVE') = (end_reason IS NULL)),
  CHECK (status != 'LEFT' OR ended_by_account_id = account_id)
);

CREATE UNIQUE INDEX idx_one_active_family_per_account
ON family_memberships(account_id)
WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX idx_no_duplicate_active_membership
ON family_memberships(family_id, account_id)
WHERE status = 'ACTIVE';

CREATE INDEX idx_family_memberships_active
ON family_memberships(family_id, role, joined_at)
WHERE status = 'ACTIVE';

CREATE TRIGGER family_keep_last_admin_on_end
BEFORE UPDATE OF status ON family_memberships
WHEN OLD.status = 'ACTIVE'
 AND OLD.role = 'ADMIN'
 AND NEW.status != 'ACTIVE'
 AND (SELECT status FROM families WHERE id = OLD.family_id) = 'ACTIVE'
 AND NOT EXISTS (
   SELECT 1 FROM family_memberships
   WHERE family_id = OLD.family_id
     AND status = 'ACTIVE'
     AND role = 'ADMIN'
     AND id != OLD.id
 )
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_REQUIRES_ADMIN');
END;

CREATE TRIGGER family_keep_last_admin_on_demote
BEFORE UPDATE OF role ON family_memberships
WHEN OLD.status = 'ACTIVE'
 AND OLD.role = 'ADMIN'
 AND NEW.role != 'ADMIN'
 AND (SELECT status FROM families WHERE id = OLD.family_id) = 'ACTIVE'
 AND NOT EXISTS (
   SELECT 1 FROM family_memberships
   WHERE family_id = OLD.family_id
     AND status = 'ACTIVE'
     AND role = 'ADMIN'
     AND id != OLD.id
 )
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_REQUIRES_ADMIN');
END;

CREATE TABLE family_invites (
  id                 TEXT PRIMARY KEY,
  family_id          TEXT NOT NULL,
  code_hash          TEXT NOT NULL UNIQUE,
  created_by_membership_id TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  redeemed_at        INTEGER,
  redeemed_by_account_id TEXT,
  revoked_at         INTEGER,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_membership_id) REFERENCES family_memberships(id) ON DELETE CASCADE,
  FOREIGN KEY (redeemed_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at),
  CHECK ((redeemed_at IS NULL) = (redeemed_by_account_id IS NULL)),
  CHECK (NOT (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE INDEX idx_family_invites_open
ON family_invites(family_id, expires_at)
WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE subscriptions (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  provider           TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY', 'STRIPE', 'MANUAL')),
  provider_subscription_id TEXT NOT NULL,
  product            TEXT NOT NULL CHECK (product IN ('FAMILY', 'FAMILY_PLUS')),
  status             TEXT NOT NULL CHECK (status IN
                     ('TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REVOKED')),
  auto_renews        INTEGER NOT NULL CHECK (auto_renews IN (0, 1)),
  trial_ends_at      INTEGER,
  current_period_ends_at INTEGER NOT NULL,
  access_until       INTEGER NOT NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  canceled_at        INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (provider, provider_subscription_id),
  CHECK (access_until >= created_at),
  CHECK (trial_ends_at IS NULL OR trial_ends_at > created_at)
);

CREATE INDEX idx_subscriptions_account_access
ON subscriptions(account_id, access_until DESC);

CREATE TABLE subscription_events (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL CHECK (provider IN ('APPLE', 'GOOGLE_PLAY', 'STRIPE', 'MANUAL')),
  provider_event_id  TEXT NOT NULL,
  subscription_id    TEXT,
  event_type         TEXT NOT NULL,
  occurred_at        INTEGER NOT NULL,
  received_at        INTEGER NOT NULL,
  payload_hash       TEXT NOT NULL,
  processed_at       INTEGER,
  processing_error   TEXT,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE account_entitlements (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  feature_key        TEXT NOT NULL CHECK (feature_key IN
                     ('FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS')),
  source_type        TEXT NOT NULL CHECK (source_type IN ('SUBSCRIPTION', 'PROMO', 'ADMIN')),
  source_id          TEXT NOT NULL,
  valid_from         INTEGER NOT NULL,
  valid_until        INTEGER NOT NULL,
  revoked_at         INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK (valid_until > valid_from),
  UNIQUE (account_id, feature_key, source_type, source_id)
);

CREATE INDEX idx_account_entitlements_active
ON account_entitlements(account_id, feature_key, valid_until)
WHERE revoked_at IS NULL;
```

### Miért nincs `family_entitlements` tábla?

A Family Sync jogosultság derivált állapot. Az account entitlement a fizető személyhez tartozik, a sync-hozzájárulás pedig csak az account egyetlen aktív membershipjén keresztül érvényes. Így a fizető kilépésekor nincs késve frissülő family cache: a következő szerverellenőrzés azonnal `false` eredményt ad.

Normatív lekérdezés:

```sql
SELECT EXISTS (
  SELECT 1
  FROM family_memberships m
  JOIN account_entitlements e ON e.account_id = m.account_id
  WHERE m.family_id = ?1
    AND m.status = 'ACTIVE'
    AND e.feature_key = 'FAMILY_SYNC'
    AND e.revoked_at IS NULL
    AND e.valid_from <= ?2
    AND e.valid_until > ?2
) AS can_sync;
```

Egy subscription azért csak egy Familyre hat, mert az account egyszerre csak egy aktív Family tagja lehet. Ha nincs aktív membershipje, az account személyes entitlementje megmarad, de egyetlen Family syncjét sem aktiválja.

## 5. Google-only auth modell

### Tokenellenőrzés

1. A kliens Google Sign-Innel ID tokent kér.
2. A Worker kizárólag szerveroldalon ellenőrzi az aláírást a Google JWKS kulcsaival, a támogatott `iss` értéket, a Solemi OAuth clienthez tartozó `aud` értéket, valamint az `exp`, `iat`, `sub` és `email_verified` claimet.
3. Account lookup kulcsa: `(provider='GOOGLE', issuer, subject)`. Az e-mail változhat, ezért csak profiladat.
4. Első sikeres belépéskor a Worker egy tranzakcióban létrehozza az `accounts` és `account_identities` sort.
5. A Google ID token nem válik Solemi API bearer tokenné és nem kerül D1-be. A Worker rövid access tokent és forgatott, hashként tárolt refresh tokent ad ki a regisztrált eszközhöz.
6. A refresh token újrahasználatának észlelésekor az adott eszköz összes sessionje visszavonandó.
7. E-mail alapján automatikus account-összevonás tilos. V1-ben nincs más provider és nincs password/email recovery.

### Eszközregisztráció és a 2-es limit

- A kliens telepítésenként generál egy erős, stabil installation secretet; D1-be ennek hash-e kerül.
- Az ismert, nem visszavont eszköz új sessiont kaphat.
- Ismeretlen harmadik eszköznél a Worker `409 DEVICE_LIMIT_REACHED` választ ad a két aktív eszköz `id`, `name`, `platform`, `last_seen_at` mezőivel és egy rövid életű, kizárólag device-managementre használható enrollment ticketet ad.
- A user kiválaszt egy régi eszközt. A Worker ugyanabban a tranzakcióban visszavonja annak sessionjeit és device credentialjét, majd regisztrálja az újat.
- Automatikus „legrégebbi eszköz kidobása” nincs. Visszavont eszköz bearer credentialje minden family és sync végponton elutasítandó.

## 6. Family membership és admin szabályok

### Family létrehozás

Az endpoint csak Google-authenticated accounttal hívható. Egy tranzakció:

1. ellenőrzi, hogy nincs aktív membership;
2. létrehozza a Familyt;
3. létrehozza a létrehozó `ADMIN` / `ACTIVE` membershipjét;
4. nem törli a helyi alvásadatot;
5. entitlement esetén külön bootstrap folyamatot indít.

### Invite

- Bármely aktív `ADMIN` vagy `MEMBER` készíthet rövid kódot.
- A kód legalább 128 bit entrópiából származzon; a rövid emberi forma miatt kötelező rate limit, rövid TTL, egyszer használhatóság és csak hash tárolása.
- Ajánlott V1 TTL: 15 perc. Maximum 5 nyitott invite / membership; további kérés a legrégebbit visszavonja vagy 429-et ad.
- Redemption előtt Google login kötelező.
- A beváltás atomi: nyitott/nem lejárt kód feltételes update-je és az `ACTIVE` membership insertje egy tranzakcióban történik.
- Ha az accountnak már van más aktív Familyje, `409 ACTIVE_FAMILY_EXISTS`. Ha ugyanennek a Familynek aktív tagja, idempotens siker. Korábbi `LEFT`/`REMOVED` membership után új history sor készül.
- Jóváhagyás nincs. Ha a Family sync szünetel, a tagság létrejön, de raw snapshot nem tölthető le reaktiválásig.

### Role és eltávolítás

- Aktív admin bármely aktív membert adminná tehet.
- Admin más tagot eltávolíthat; saját magát a self-leave flow-val lépteti ki.
- Nem-admin csak saját magát léptetheti ki.
- Az utolsó admin kilépését/demote-ját a Worker és a trigger is blokkolja `409 FAMILY_REQUIRES_ADMIN` hibával.
- Kilépés/eltávolítás azonnal visszavonja az érintett account Family-adathoz kötött hozzáférését; az account eszközeit nem törli.
- A membership history nem törlendő normál kilépéskor.

### Family végleges törlése

- Csak aktív admin indíthatja.
- Kötelező 5 percen belüli Google reauthentication és erős megerősítés (a Family nevének begépelése vagy platformszintű ekvivalens).
- Első tranzakció: `families.status='DELETING'`, új invite/sync/write tiltása, minden invite visszavonása.
- Ezután a Worker törli a Familyhez tartozó cloud child/session/tombstone/operation adatokat, majd a Family sort. `ON DELETE CASCADE` eltávolítja a membershipet és invite-okat.
- Subscription és account nem törlődik. A fizető account entitlementje megmarad, és új Familyben használható.
- A törlés nem visszavonható; előtte export felajánlása kötelező. A minimális billing/security audit rekord személyes alvásadat nélkül a jogi retention szabály szerint maradhat.

## 7. Subscription és entitlement szabályok

### Billing truth

- A `subscriptions` a provider által igazolt billing állapot. A kliens által küldött „paid=true” soha nem authority.
- A `subscription_events` biztosítja a webhook idempotenciát és auditot; teljes provider payload helyett hash és szükséges normalizált mezők tárolandók.
- `CANCELED` azt jelenti, hogy az auto-renew kikapcsolt; hozzáférés az `access_until` időpontig még lehet aktív.
- `PAST_DUE` önmagában nem ad hozzáférést. `GRACE_PERIOD` csak akkor ad, ha a provider igazolt `access_until` értéke még jövőbeli.
- Refund/revoke esemény az entitlement `revoked_at` mezőjét azonnal beállítja.
- 7 napos trial egy `FAMILY_PLUS` subscription `TRIALING` állapottal. A trial vége explicit, nem a kliens órájából számítandó.

### Grant mapping

| Product | Létrehozott account entitlementek |
|---|---|
| `FAMILY` | `FAMILY_SYNC`, `PDF_EXPORT` |
| `FAMILY_PLUS` | `FAMILY_SYNC`, `PDF_EXPORT`, `FAMILY_PLUS_INSIGHTS` |

Provider update után a Worker egy tranzakcióban upserteli a subscriptiont, rögzíti az eseményt és pontosan ehhez az `access_until` intervallumhoz igazítja a grantokat. A `PROMO` és `ADMIN` source támogatott, de csak szerveroldali adminfolyamat írhatja.

### Feature evaluation

```text
accountCanUse(accountId, featureKey, now)
  = van nem visszavont account_entitlement,
    ahol valid_from <= now < valid_until

familyCanSync(familyId, now)
  = van aktív membershipű account,
    amelyre accountCanUse(FAMILY_SYNC) igaz
```

- Family+ Insights mindig a bejelentkezett account saját `FAMILY_PLUS_INSIGHTS` grantját ellenőrzi.
- Egy Free account aktív syncű Family tagjaként megkaphatja a kanonikus raw adatot, de PDF-et és Family+ view-kat csak saját entitlementtel használhat.
- A sync API minden read és write kérésnél szerveroldalon számolja a `familyCanSync` értéket. A kliens UI cache nem jogosít szerverírásra.

### 30 napos offline cache

A Worker aláírt entitlement snapshotot ad:

```json
{
  "accountId": "acc_…",
  "features": ["FAMILY_SYNC", "PDF_EXPORT"],
  "validatedAt": 0,
  "serverAccessUntil": 0,
  "offlineUntil": 0,
  "version": 1
}
```

`offlineUntil = min(validatedAt + 30 nap, serverAccessUntil)`. A kliens nem hosszabbíthatja meg. A snapshot account- és eszközkötött, szerver által aláírt. A kliens tárolja a legnagyobb már látott szerveridőt és monotonic elapsed időt használ; jelentős visszaállított óra vagy snapshot-integritási hiba online újraellenőrzést kér. Szerveres sync, invite, role és delete művelet mindig aktuális szerverállapotot ellenőriz.

## 8. Sync entitlement életciklus

### Első Family bootstrap

1. Google account, aktív membership és `familyCanSync=true` ellenőrzése.
2. Automatikus, visszaállítható helyi export készítése.
3. A helyi adat változatlan marad; a kliens `bootstrapId` + idempotens operation batch segítségével feltölti a child/session rekordokat.
4. A szerver a létrehozó datasetjét teszi kezdeti kanonikus állapottá.
5. A kliens teljes snapshotot visszaolvas és hash/count/revision ellenőrzést végez.
6. Csak sikeres ellenőrzés után állítja a helyi family sync állapotot aktívra.

Meghívott eszköz nem merge-eli automatikusan saját, független helyi adatbázisát; a Family snapshotját veszi át. Későbbi import csak külön, deduplikáló feature lehet.

### Utolsó entitlement lejárata vagy fizető kilépése

- A következő sync read/write azonnal `403 FAMILY_SYNC_PAUSED` választ ad, benne `familyId`, `pausedAt` és aktuális szerverrevision, de raw delta nélkül.
- Cloud child/session adat, tombstone, membership és Family rekord megmarad.
- Minden eszköz folytathat local-first trackinget, és helyi pending operation logot vezet.
- Family-admin, membership- és subscription-kezelés elérhető marad; ez nem raw sleep sync.
- Nincs 7 napos türelmi idő, kivéve ha a billing provider hitelesített `GRACE_PERIOD` hozzáférést adott.

### Reaktiválás

1. A Worker újra érvényes entitlementet lát, de a normál push előtt `RECONCILIATION_REQUIRED` állapotot ad.
2. Minden eszköz elküldi a pause kezdete óta gyűlt operation manifestet (`operationId`, entity ID, base revision, updated time, tombstone flag), nem vak teljes felülírást.
3. A szerver idempotensen alkalmazza a nem konfliktusos műveleteket. Ugyanazon entity több ágon történt módosítását explicit conflictként adja vissza; törlés nem éledhet fel stale update-ből.
4. A kliens konfliktust old vagy elfogadja a kanonikus rekordot, majd teljes verification snapshotot kér.
5. Csak egyező revision/hash után tér vissza a normál incremental sync.

A részletes conflict policy külön sync-protokoll specifikáció tárgya, de a migráció nem vezethet be silent last-write-wins felülírást.

## 9. Jelenlegi prototípus és célmodell közötti eltérés

A jelenlegi Worker:

- auth nélküli `POST /v1/families` és `POST /v1/join` végpontot használ;
- a `devices` rekordot közvetlenül Familyhez köti, account nélkül;
- minden device-tag készíthet invite-ot;
- nincs account, membership role/history, device/account limit, subscription vagy entitlement;
- a bearer device token önmagában Family-hozzáférést ad;
- a syncet nem gate-eli fizetési jogosultság.

Ezek prototípus-szabályok, nem vihetők változtatás nélkül productionbe. A jelenlegi revision, operation idempotency, tombstone és egy-aktív-alvás constraint megtartandó; az identitás és hozzáférési modell köréjük épül.

## 10. Migrációs sorrend

Minden lépés külön migration fájl, staging D1 próba, backup/export és rollback/runbook mellett történjen. Production deploy csak kompatibilis Workerrel együtt.

1. **Leltár és mentés.** D1 export, sor- és FK-számlák, aktív eszközök/familyk/revisionök rögzítése. A jelenlegi API változatlan.
2. **Additív identity séma.** `accounts`, `account_identities`, `account_devices`, `account_sessions` és index/trigger létrehozása. Még nincs auth-kényszer a régi végpontokon.
3. **Additív membership séma.** Új `families_v2`, `family_memberships`, `family_invites` célstruktúra létrehozása. A meglévő Family sorok adatvesztés nélkül másolódnak `LEGACY_UNCLAIMED` átmeneti állapotú staging mappinggel; a végleges `families` CHECK csak claim után aktiválható.
4. **Billing és entitlement séma.** `subscriptions`, `subscription_events`, `account_entitlements` létrehozása. Minden új account alapértelmezése Free; nincs automatikusan adott paid grant.
5. **Google auth + account/device dual mode.** Az új Worker Google tokent ellenőriz, account sessiont és account device-ot kezel. A régi device bearer ideiglenesen csak legacy claimre és read-only export/snapshotra használható.
6. **Legacy Family claim.** A régi, érvényes device credential + friss Google login együttes bizonyítása hozzárendeli az accountot. Az első claimelő account admin lesz. További régi device csak saját Google accounttal válhat memberré; egy account 2-device constraintje már él. Claim audit és support recovery szükséges.
7. **Invite cutover.** Új invite-ok kizárólag `family_invites` táblába, account membershipből készülnek. Régi kódok rövid grace idő után lejárnak; nem másolandók nyers formában.
8. **Sleep FK cutover.** Stagingben ellenőrzött rebuilddel a child/session/operation FK-k az új Family táblára kerülnek. Revisionök, tombstone-ok és operation ID-k változatlanul megmaradnak. D1-ben constraint módosításhoz table rebuild kell; `foreign_key_check` kötelező.
9. **Entitlement enforcement audit módban.** A Worker kiszámolja és naplózza a `familyCanSync` eredményt, de rövid megfigyelési szakaszban még nem blokkol. Hamis negatívok, provider eventek és claim nélküli legacy Familyk javítása.
10. **Enforcement bekapcsolása.** Új sync read/write szerveroldali entitlement gate-et kap. Legacy bearer többé nem ér el raw adatot; csak időkorlátos recovery út marad.
11. **Régi táblák eltávolítása.** Csak export, count/hash/revision összevetés és legalább egy stabil release után törölhető a régi `devices` és `invite_codes` struktúra. Ez külön, visszafordíthatatlan migration.
12. **Utóellenőrzés.** `PRAGMA foreign_key_check`, unique/partial index tesztek, utolsó-admin, harmadik-device, dupla invite redemption, webhook replay, payer-leave és entitlement-expiry integrációs tesztek.

Migration naming javaslat:

```text
002_accounts_and_sessions.sql
003_memberships_and_invites.sql
004_subscriptions_and_entitlements.sql
005_legacy_claim_bridge.sql
006_family_data_rebuild.sql
007_enforcement_cutover.sql
008_drop_legacy_access.sql
```

A tényleges sorszámokat a deploykor meglévő D1 migration history alapján kell kiosztani; a fájlnevek itt tervet jelentenek.

## 11. Kötelező API-határ és hibakódok

Az új account/family végpontok mind Solemi account sessiont használnak. A device credential az eszközt azonosítja, de a jogosultságot account + membership + entitlement együtt adja.

Minimum stabil hibakódok:

| HTTP | Kód | Jelentés |
|---:|---|---|
| 401 | `GOOGLE_TOKEN_INVALID` | Google assertion nem fogadható el |
| 401 | `SESSION_INVALID` | Solemi session lejárt/visszavont |
| 403 | `DEVICE_REVOKED` | az eszköz vissza lett vonva |
| 403 | `FAMILY_SYNC_PAUSED` | nincs aktív Family Sync hozzájáruló |
| 403 | `ADMIN_REQUIRED` | a művelethez admin kell |
| 409 | `DEVICE_LIMIT_REACHED` | már 2 aktív eszköz van; user választása kell |
| 409 | `ACTIVE_FAMILY_EXISTS` | az account már másik aktív Family tagja |
| 409 | `FAMILY_REQUIRES_ADMIN` | az utolsó admin nem léphet ki/demote-olható |
| 409 | `INVITE_ALREADY_USED` | a kódot más már beváltotta |
| 410 | `INVITE_EXPIRED` | a kód lejárt |
| 409 | `RECONCILIATION_REQUIRED` | pause utáni biztonságos egyeztetés kell |

## 12. Elfogadási tesztek az implementáció előtt

- Ugyanaz a Google `sub` más e-maillel ugyanazt az accountot adja; azonos e-mail más `sub`-bal nem olvad össze.
- Harmadik device insert és reactivation DB-szinten is hibázik; explicit revoke + register sikerül.
- Egy account nem lehet két aktív Family tagja, de korábbi membership historyja megmarad.
- Két adminból az egyik kiléphet; az utolsó admin nem.
- Member invite-ot készíthet és a kód admin-jóváhagyás nélkül, pontosan egyszer váltható be.
- Nem-admin más tagot nem távolíthat el; admin igen; mindenki saját magát kiléptetheti.
- Family végleges törlés admin + friss reauth nélkül tiltott, és nem törli az accountot/subscriptiont.
- Family subscriber + Free member esetén mindkettő szinkronizálhat, de a Free member PDF/Insights gate-je zárt.
- Family+ subscriber mellett csak a subscriber account kap `FAMILY_PLUS_INSIGHTS` hozzáférést.
- Az utolsó entitlement lejárata és a fizető kilépése azonnal pause-olja a syncet, adat- és membership-törlés nélkül.
- Másik aktív fizető tag mellett az első fizető kilépése nem állítja le a syncet.
- Trial pontosan a provider által igazolt végéig aktív; cancellation a `access_until` végéig nem vesz el hozzáférést; revoke azonnal igen.
- Offline snapshot legfeljebb 30 napig és legfeljebb `serverAccessUntil`-ig működik; módosított snapshot elutasítandó.
- Reactivation nem ír felül csendben pause alatt divergens rekordot, és tombstone-t stale update nem támaszt fel.
- Migration után row count, family revision, session ID, tombstone és FK-integritás egyezik az előzetes leltárral.

## 13. Nem része ennek a változtatásnak

- Live D1 migration futtatása.
- Worker endpoint vagy auth implementáció módosítása.
- Google OAuth client, JWKS cache, StoreKit/Play Billing/Stripe konfigurálása.
- Provider-specifikus receipt/webhook contract véglegesítése.
- Pause utáni conflict UI részletes termékterve.
- Free raw sleep history cloud backupja.
- Child profile photo cloud syncje.

Ezek csak a fenti séma és szabályok elfogadása után következhetnek.
