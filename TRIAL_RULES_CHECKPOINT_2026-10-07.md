# A11 — egyszeri account-trial és családi keret

Dátum: 2026-10-07; dokumentáció lezárva: 2026-10-08. Feladatszint: GPT-6 Astra · erős. Kézi tulajdonosi teszt nélkül.
Kiinduló HEAD: `337d04a` — `Add localized PDF diary export with paid access checks`, ág: `feat/child-profile-v4`; tiszta munkakönyvtár.

## Elfogadott szabály és helyi eredmény

Az alap a [2026-10-01-i termékdöntés](SOLEMI_V1_TRIAL_RULES_2026-10-01.md). A tulajdonos 2026-10-07-én három nyitott részletet is eldöntött: család nélkül kezdett trial egyszer hozzárendelhető a maradék idejével és egy családi hely elfogyasztásával; a kötött trial nem vihető másik családba; egy családban egyszerre egy trial futhat.

- Új, szerveren tárolt `account_trials` nyilvántartás, accountonként egy sorral. A Family/Family+ csomag, eredeti aktiválás, eredeti és későbbi első családi kötés megmarad. Pontosan 7 × 24 óra, szerveridővel; az időzóna/óraátállítás nem ad új napot.
- Aktiváláskor a szerver a tényleges aktív tagságból veszi a Familyt. Az account ID, Family ID és lejárat nem a kliens döntése. Egy SQL-írásban történik a létrehozás, a családonkénti négyes és az egyidejűségi ellenőrzés. Adatbázis-trigger védi a határokat és a megváltoztathatatlan adatokat.
- Ugyanazon account azonos műveletazonosítójú, azonos csomagú ismétlése az eredeti eredményt adja; nem hosszabbít. Másik kérés/csomag, új belépés, másik eszköz vagy már lejárt trial után sincs új jog. A helyi export/import és napló-visszaállítás nem fér ehhez a szerveres nyilvántartáshoz.
- Egy családban egyszerre egy trial; az ötödik eltérő account már nem indíthat ott trialt. Az elutasított account joga nem fogy el. A lejárt vagy kilépett tag által elfogyasztott családi hely megmarad. A négy egymás utáni teljes próba legfeljebb 28 nap, nincs automatikus sorba állítás.
- Család nélküli trial első csatlakozásakor/létrehozásakor a tagság és kötés egy tranzakcióban történik. Elfoglalt/betelt családba is be lehet lépni, de a meglévő személyes trial nem ad új családi hozzáférést. Később kifejezett hozzárendelési kérés adható, amíg van maradék idő és szabad hely; a kezdés/lejárat nem változik.
- Kötött trial nem vihető át. A személyes PDF/Insights jog az eredeti lejáratig megmarad; a családi hozzájárulás csak az eredeti Familyhez és a trial tulajdonosának aktív tagságához kötött. Kilépés után az eredeti család nem örökli tovább; visszalépés ugyanoda a maradék időre helyreállítja. A családi helyet/időszakot kilépéssel nem lehet felszabadítani.
- Családmegszüntetéskor a történeti Family-azonosító megmarad a trial rekordban; új család létrehozása nem reseteli az accountot. Nem vezettünk be IP-/fingerprint-védelmet.
- A fizetett jogosultságokkal közös olvasási modell adja az online hozzáférést és a meglévő A16 aláírt offline igazolást. A trialból eredő offline jog legfeljebb a trial végéig érvényes. Fizetős folytatás vagy másik fizető családtag külön joga továbbra is működik.
- Korábbi, ismert store-trial accountszinten felhasználtnak számít. A migráció és a későbbi előfizetés-frissítési triggerek megőrzik ezt akkor is, ha egy fizetett megújulásból eltűnik a régi `trial_ends_at`. Az ismeretlen korábbi Familyt és időtartamot nem találjuk ki: `LEGACY_STORE` felhasználási jelölés, új próbahozzáférés nélkül.

## API és bolti határ

- `GET /v1/auth/trial`: saját felhasználási állapot és az aktuális család összesített kerete/aktív időszaka. Más tagok neve/azonosítója nem kerül a válaszba.
- `POST /v1/auth/trial/activate`: `product: FAMILY | FAMILY_PLUS`, `operationId` (8–100 ASCII betű/szám/aláhúzás/kötőjel). Account a hitelesített munkamenetből; a többi kliensmező nem állít jogosultságot.
- `POST /v1/auth/trial/bind`: még kötetlen, aktív személyes trial első hozzárendelésének ismétlése; a korábbi kötést nem változtatja meg.
- A három útvonal csak `TRIAL_ENABLED=true` mellett érhető el. A kapcsoló nincs bekapcsolva a repository kiadási konfigurációiban. Hiányában 404; bekapcsolva kötelező a hitelesített munkamenet, módosításnál az engedélyezett Origin. A proxy pontos útvonallistája és a belépési kéréskorlát az új műveletekre is kiterjed.
- A kapcsoló új műveleteket zár, már megadott trialt nem von vissza. Az aktiválási útvonal szerveres előkészítés; még nincs paywall-indítógomb, vásárlás vagy automatikus megújulás bekötve hozzá.
- A store-feldolgozó jelenleg `STORE_TRIAL_REQUIRES_RECONCILIATION` hibával elutasítja a `TRIALING`, illetve még folyamatban lévő trial-időszakú snapshotot. Így a későbbi native/store bekötés nem kerülheti meg véletlenül a Solemi nyilvántartását. A rendes, hitelesített fizetett előfizetések meglévő feldolgozása megmaradt.
- **A tényleges Apple/Google trialajánlat összehangolása még hátravan:** jogosultságvizsgálat a vásárlás előtt, azonos tranzakció/trial hozzárendelése, elutasítás/visszaállítás/értesítés/acknowledgement és paywall-szövegek. A store által már elfogadott vásárlást nem tekintjük rendezettnek pusztán a Solemi utólagos elutasításától. Új áruházi trialajánlatot addig nem szabad bekapcsolni.

## Gépi ellenőrzés

- **57 fájl, 791/791 teszt PASS**, 29 új próbával. A külön trial-fájl 21 eset: két csomag és pontos lejárat, azonos/más kérés ismétlése, párhuzamos ugyanazon account és családi negyedik hely, ötödik elutasítása, egyszeri kötés, foglalt/betelt család, kilépés/visszalépés/más család, családmegszüntetés, lejárt trial, immutabilitás, inaktív account, tranzakció-visszagörgetés, fizetős folytatás, offline lejárat és történeti migráció.
- Új route/proxy próbák: hiányzó kapcsoló, hamis auth, hibás termék/kérésazonosító; idegen account/Family/lejárat mező nem hatásos; új munkamenet sem resetel; család létrehozása megmaradó trialból; GET/POST metódushatár; új útvonalak Origin/Fetch Metadata védelme és 429 korlátja. Két új store-próba a második, még össze nem egyeztetett próbahozzáférés ellen.
- Frontend és Worker typecheck PASS.
- Worker helyi `wrangler deploy --dry-run` csomagolás PASS, távoli kiadás nélkül.
- Új, elkülönített helyi Wrangler/D1-adatbázison a séma + 003–010 migrációk, tesztaktiválás és a közös jogosultsági nézet PASS. Három Family+ funkció a pontos 7 napos lejárattal; `PRAGMA foreign_key_check` üres. Csak mesterséges account szerepelt benne.
- A korábbi fizetett előfizetés és grant sorai a migrációs próbában változatlanok maradtak. A párhuzamos szolgáltatáskérések próbái helyi SQLite írássorosítást használnak; ez nem terhelési bizonyíték a távoli D1-ről.

## Kötelező kiadási sorrend és fennmaradó kapuk

**Az új Worker kiadása előtt a 010-es migráció szükséges, kikapcsolt trial-aktiválás mellett is.** A közös hozzáférési lekérdezések már az új nézetet olvassák. Automatikusan telepítő Workerhez ne történjen push a céladatbázis előkészítése előtt. A jelen munkában sem távoli migráció, sem commit/push/deploy nem történt.

1. Célkörnyezet azonosítása és mentés; régi trial-előzmények, különösen meglévő aktív `TRIALING` vagy trial-időszakú store-grantok felmérése. Ismeretlen régi családi keretet nem becslünk meg automatikusan. A régi grantokat a migráció nem vonja vissza: ezek egyeztetése az új aktiválás engedélyezése előtt kell.
2. 010 migráció alkalmazása 003–009 után; integritás és változatlan fizetett jogosultságok ellenőrzése. Ezután Worker/proxy kiadás és célzott staging próba. A régi Workerre visszaállás a régi fizetett grantokat ismeri, az új trialokat nem; rollback nem törölheti a nyilvántartást.
3. A17: fióktörlés és a minimális trial-előzmény megőrzési idejének jogi/termékbeli rendezése. Most csak account-/Family-azonosító és trialadat kerül a nyilvántartásba; hard accounttörlésnél a fizetési táblához hasonló idegenkulcs-védelem akadályozza az észrevétlen resetet. Ez nem döntés korlátlan személyesadat-megőrzésről, és újraregisztrált másik account elleni agresszív védelem sincs.
4. Paywall és platformos store-összehangolás, majd kifejezett engedélyezés. A már letöltött offline igazolás családváltás után offline nem vonható vissza azonnal; az A16 korlátozott lejárati szabálya megmarad, trial esetén legfeljebb az eredeti trialvégig.

**A11 kért helyi szerveres szabályblokkja kész; a teljes fizetési/áruházi A11 még nyitott.** Most nincs kézi tesztkérés, M1–M6 nem ismétlendő, valódi családi napló nem módosult.

**Következő: A17 — a meglévő fióktörlés és adatkezelés felmérése, majd a hiányok pótlása, a trial-előzmények kezelésével együtt, gépi próbákkal. GPT-6 Astra · erős; kézi teszt nélkül indítható.** Előbb a meglévő kódot és döntéseket vesszük számba; nem indul újra a helyi naplótörlés vagy családmegszüntetés fejlesztése.

## GitHub Desktop

Summary: `Enforce lifetime account trials and bounded family trial sharing`

Description: Add a durable seven-day trial ledger with atomic lifetime/family limits, idempotent activation and one-time family binding. Reuse effective access and signed offline expiry, preserve historical store usage, and guard auth/proxy/rate limits. Validate 791 tests, both typechecks, Worker dry-run and an isolated local D1 migration. Apply migration 010 before deploying; activation and store trial offers remain disabled pending release and billing integration.
