# A17 — fióktörlés és adatkezelés: helyi fejlesztési checkpoint

**Folytatás, 2026-10-14:** az alábbi történeti állapot után az üzemeltetési helyi előkészítés is elkészült. Az aktuális ütemező egy fiókot kezel futásonként; részletek és további feltételek az [új checkpointban](ACCOUNT_DELETION_OPERATIONS_2026-10-13.md). Az előző blokk az `ae8d1db` commitban szerepel.

Dátum: 2026-10-13. Ág: `feat/child-profile-v4`, kiinduló HEAD: `be15083`.
Feladatszint: GPT-6 Astra · erős. Most nincs tulajdonosi kézi tesztkérés.

## Eredmény és határ

A fióktörlés, választható 30 napos helyreállítás és személyes adatexport helyi implementációja és gépi ellenőrzése elkészült. A17 teljes kiadási kapuja **nyitott**: az alábbi üzemeltetési és adatkezelési feltételek még szükségesek. Nem történt commit/push/deploy, távoli migráció, valódi fióktörlés vagy trialaktiválás.

A korábban kész helyi naplótörlés, családi naplótörlés és családmegszüntetés megmaradt. A fiókművelet külön HU/EN/DE „Fiókom és adataim” felületet kapott, és azonos hitelesítéssel a `/delete-account` webes útvonalról is elérhető. Ez az útvonal helyben igazolt, még nem publikált szolgáltatás.

## Elkészült működés

- Külön fiókexport és visszaállítható helyi naplóletöltés. A fiókexport a szerveres profilból, saját előfizetési/trial/eszközadatokból, hozzáférhető közös naplóból, valamint a jelenlegi eszköz aktuális helyi naplójából és elérhető profilképeiből áll. Nem tartalmaz belépési titkokat vagy más felnőttek fiókprofilját. Nem állítjuk, hogy más eszközök offline adatait, minden korábbi mentést vagy minden üzemeltetési nyilvántartást lefed.
- Szerveren hitelesített törlési előnézet. Közben megváltozott család/tagság/revízió esetén 409, változtatás nélkül. Az utolsó tag pontos családnév-megerősítést ad; a felület külön következményelfogadást kér.
- Azonnali törlés vagy opcionális, legfeljebb 30 napos helyreállítás. Kéréskor normál szerveres hozzáférés és régi belépések visszavonása; más családtag naplója megmarad, szükség esetén automatikus adminutódlással.
- Az utolsó tag saját családja helyreállításkor szünetel, véglegesítéskor törlődik. A megmaradó közös családba helyreállítás után nincs automatikus visszalépés; új meghívás kell.
- Helyreállítást csak friss Google-azonosítás után kiadott, tízperces, külön célú és konkrét törlési kéréshez kötött igazolás enged. Ez nem használható normál fiókhozzáféréshez. A határidő pontosan ellenőrzött, a korábbi sessionök és előfizetési grantok nem élednek újra.
- Azonnali helyi törlés eltávolítja az adott fiók munkaterületét és más napló által nem használt profilképeit. A képtakarítás tartós várólistát használ: adatbázishiba után újrapróbálható, indításkor az írózár után folytatható. Más fiók és közösen hivatkozott kép megmarad. A helyreállítási mód helyben elkülönítve megtartja a naplót.
- Véglegesítés után profil- és azonosítási adatok törlése; minimális technikai account-, trial-, számlázási és törlési nyilvántartás megmarad. A család trialszámlálója és a meglévő trial lejárata nem nullázódik. Késői számlázási grant nem adhat hozzáférést inaktív fióknak.
- Lejárt kérelmekhez ütemezhető feldolgozó és adatbázis-visszaállítás után alkalmazható törlési nyugta-visszajátszás készült. Ezek helyi implementációk, **nem működő távoli üzemeltetési rendszer**.

## Bizonyíték — 2026-10-13

| Ellenőrzés | Eredmény |
| --- | --- |
| Teljes regresszió | 59 fájl, **818/818 PASS** |
| Frontend és Worker típusellenőrzés | Mindkettő PASS |
| Frontend build, PWA előtárolás | PASS; meglévő nagy-csomag figyelmeztetés marad |
| Staging Worker csomagolása feltöltés nélkül | PASS, `--dry-run`; feltöltés nincs |
| Elkülönített Edge felület | **6/6 PASS**: HU/EN/DE × azonnali/helyreállítás, 320 px |
| Közvetlen webes belépési oldal | `/delete-account` PASS helyben |

A böngészőpróba valódi React-felületet és helyi IndexedDB-képet használ, az API-válaszok tesztválaszok; külső hálózat tiltott. Export letöltése/parse, kép beágyazása, megerősítés, elavult előnézet, újrapróbálás, hitelesítési adatok törlése, helyi napló/kép törlése vagy megtartása és recovery-header ellenőrzött. Képek: Gitből kizárt `.private-backups/account-deletion-*.png`; a magyar keskeny nézet szemrevételezve is olvasható.

A Worker-próbák SQLite-on, a migrációkkal ellenőrzik a tényleges SQL-tranzakciókat: családmegőrzés, adminátadás, session- és régi device-token visszavonás, határidő, rollback/újrapróbálás, párhuzamos előnézet-változások, export és hitelesítési határok, törlési nyugta visszajátszása, trialkeret. Ez nem távoli D1-terhelési vagy store-elfogadás.

Ismételhető parancsok: `npm test`, `npm run typecheck`, `npm --prefix worker run typecheck`, `npm run build`, `npm --prefix worker run deploy:staging -- --dry-run`, `npm run test:account-deletion` (Playwright elérési út a gépen a `SOLEMI_PLAYWRIGHT_MODULE` változóval adható meg).

## Trial: egy még nem jóváhagyott részlet

A korábban elfogadott egyszeri accounttrial és négy családi trial szabálya megmarad. A teljes fióktörlés utáni **új regisztráció összekapcsolásáról** feltett kiegészítő kérdésre még nincs válasz.

A jelenlegi, kikapcsolt helyi változat a végleges törléskor az e-mailt és Google-azonosítót is törli. A technikai trialrekord megmarad, de egy későbbi új regisztrációt nem kapcsolunk a törölt accounthoz. Ezért ugyanazzal a Google-identitással később létrehozott új account trialjának kizárása **nem biztosított**; az eredeti család négyes kerete ettől még megmarad. Ez előzetes implementációs feltételezés, nem új tulajdonosi jóváhagyás. Bekapcsolás előtt választás szükséges; agresszív fingerprint/IP-védelem nem készült.

## Megőrzési leltár és még szükséges kiadási feltételek

| Adat | Jelenlegi működés | Nyitott feltétel |
| --- | --- | --- |
| Profil, e-mail, Google-azonosító | Azonnal vagy a választott határidő utáni véglegesítéssel törlődik | Távoli ütemezés és a határidőn túli fizikai törlési késés felügyelete |
| Saját utolsó család naplója | Szüneteltetés/helyreállítás vagy végleges törlés | Elkülönített staging kiadás és elfogadás |
| Más tagok közös naplója | Megmarad; törölt account tagsága megszűnik | A szövegezés végleges adatkezelési tájékoztatóhoz igazítása |
| Helyi naplók, képek, exportok | Ezen eszközön kezelhetők; más offline készülék és letöltött fájl nem távolítható el innen | Offline jogosultságok korlátainak és készülékenkénti felelősségnek pontos leírása |
| Trial, számlázás, törlési nyugták | Elkülönített minimális technikai rekordok maradnak | Megőrzési idő/cél és újraregisztráció szabályának véglegesítése; technikai azonosító nem teljes anonimizálás |
| Mentések, szolgáltatói naplók | A meglévő infrastruktúrában lehetnek régebbi adatok | Tényleges megőrzési idők; független törlési journal és visszaállítási eljárás |

Bekapcsolási sorrend:

1. A fenti trial-döntés és megőrzési táblázat véglegesítése, adatkezelő/support/domain hiányzó adatai alapján. A meglévő tulajdonosi retention-specifikáció nincs észrevétlenül átírva.
2. Független, tartós törlési journal megvalósítása és próbája. A mostani `erasure_receipts` ugyanabban a D1-ben van: **önmagában nem éli túl egy korábbi adatbázismentés visszatöltését**. A helyi visszajátszó csak a külön megőrzött nyugták feldolgozását igazolja. Régi mentés forgalomba állítása előtt minden későbbi törlési rendelkezést alkalmazni kell; eltérő családi hatókörnél a kód megáll.
3. Mentéssel és ellenőrzéssel `011_account_deletion.sql` alkalmazása előbb stagingen; időzített purge és felügyelet kiépítése. A feldolgozó futásonként legfeljebb 50 kérést kezel, ezért a futási gyakoriságot és a legrégebbi lejárt kérés korát figyelni kell. Az auth tiltás a határidőtől függetlenül a kéréskor indul; a fizikai takarítás ütemezéstől függ.
4. Worker `ACCOUNT_DELETION_ENABLED=true`, frontend `VITE_ACCOUNT_DELETION=true` kizárólag a fenti feltételek után, egyeztetett kiadásban. Jelenleg mindkettő kikapcsolt/nincs megadva. Pending törlések alatt nem szabad egyszerűen lekapcsolni a kapcsolót és ezzel a helyreállítást/ütemezést megszakítani.
5. Apple-belépés integrációjakor a provider-token visszavonása, valódi áruházi előfizetéskezelés és store adatkezelési nyilatkozatok. A törlés nem automatikus előfizetés-lemondás. Ez az Android/iOS/store szakaszhoz tartozik.

Nem állítjuk, hogy a teljes jogi tájékoztató vagy a két store megfelelősége ezzel elkészült. Az új kód ellenőrzött helyi alap; a meglévő kiadási kapuk megmaradnak, M1–M6 nem ismétlendő.

## Következő és GitHub Desktop Summary

**Következő: A17 üzemeltetési előkészítés — független törlési nyilvántartás, lejárt törlések ütemezése és visszaállítási eljárás. GPT-6 Astra · erős; helyben, kézi teszt nélkül kezdhető.** A trial újraregisztrációs és megőrzési döntések nélkül távoli aktiválás nem következik.

Summary: `Add account deletion, recovery and personal data export`

Description: Account-bound deletion preview and export, immediate or 30-day recovery, session revocation, shared-family preservation, retained trial ledger, resumable local photo cleanup and HU/EN/DE self-service UI. Disabled pending retention/journal/scheduler rollout. 818 tests, both typechecks, frontend build, Worker dry-run and six isolated browser scenarios plus direct web entry passed.
