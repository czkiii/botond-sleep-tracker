# Solemi V1 — tulajdonosi döntések és folytatási pont

Áttekintés: 2026-09-20. Ág: `feat/child-profile-v4`; HEAD: `fa67411`.
Ez a dokumentum az öt tulajdonosi forrást a meglévő audithoz és az A03 javításához kapcsolja. A forrásokat változatlanul megőrizzük. Jóváhagyott termékdöntés nem jelent elkészült implementációt vagy jogi jóváhagyást.

## Elsődleges források

- [Tulajdonosi termékdöntések](1-SOLEMI_V1_TULAJDONOSI_TERMEEKDONTESEK_2026-09-20.txt): a korábbi, eltérő termékterveket felülíró döntések.
- [Adatmegőrzési szabályzat](SOLEMI_V1_DATA_RETENTION_POLICY_2026-09-20.txt): fejlesztési célállapot; a nyitott megőrzési időket nem tekintjük lezártnak.
- [Fióktörlés és export folyamata](SOLEMI_ACCOUNT_DELETION_FLOW_2026-09-20.txt): implementációs specifikáció és elfogadási esetek.
- [Magyar adatkezelési tájékoztató](SOLEMI_PRIVACY_POLICY_HU_2026-09-20.txt): kiadás előtti tervezet, kitöltendő adatokkal és még megvalósítandó állításokkal.
- [Release adminisztrációs ellenőrzőlista](SOLEMI_RELEASE_ADMIN_HIANYZO_ADATOK_CHECKLIST_2026-09-20.txt): nyitott szolgáltatói, kapcsolattartási és store feladatok.

A műszaki audit A01–A27 és a statisztikai audit S01–S15 kapui megmaradnak. Az új döntések az elfogadási feltételeket pontosítják; önmagukban nem zárják le a hibákat.

## Rögzített döntések és kapcsolódó munka

| Döntés | Következmény / audit |
|---|---|
| Helyi és családi törlés két külön művelet; családi törlés előtt export és második megerősítés | A03: kapcsolódott család mellett is mindkettőnek elérhetőnek kell lennie. |
| Import családi hatása előre látható és megerősítendő | A03/A15: előnézet, adatmegőrzés, konkurens változások és biztonságos helyreállítás. |
| Tag kiléphet; admin átadást ajánlunk, szükség esetén automatikus utód; utolsó tag külön megszüntetés | A04/A17: szerepkör- és tagsági állapotátmenetek, versenyhelyzetek. |
| Bármely aktív tag előfizetése az egész családra érvényes; utolsó fizető kiesése szüneteltet, nem töröl | A06/A11/A16: szerveres ellenőrzés, több fizető és lejárat kezelése. |
| Offline fizetős hozzáférés legfeljebb 30 nap az utolsó sikeres online ellenőrzéstől | A16: hálózati hiba nem kijelentkezés; óra-visszaállítás elleni védelem. |
| PDF export V1-ben Family és Family+; nincs push/fix/adaptív emlékeztető vagy életkori normaösszehasonlítás | A23: PDF megvalósítás és teszt; kizárt funkciók ígéreteinek eltávolítása. A meglévő navigáció maradhat. |
| Google és Apple belépés V1-ben | A12/A17: biztonságos identity linking, Apple token-visszavonás; az e-mail egyezése önmagában nem account-összekapcsolás. |
| Saját fiók törlése nem törli a megmaradó család közös naplóját | A17: személyes/accountadat és közös napló elkülönítése. |
| Végleges törlés most VAGY választható, legfeljebb 30 napos recovery | A17/A25: inaktív recovery, önkiszolgáló restore/korai törlés, automatikus véglegesítés és backup utáni újratörlés. |
| Family 990 Ft/hó, Family+ 1490 Ft/hó; havi és éves ajánlat induláskor | A11/A23: éves cél 10 havi díjért 12 hónap; konkrét store árpontok még beállítandók. |
| Egyetlen 7 napos trial felhasználónként, választható Family vagy Family+ | A11: csomagváltás és összekapcsolt Google/Apple account ne indítson új trialt; két store közötti betartathatóság külön ellenőrizendő. |
| Upgrade azonnali hozzáférés; downgrade és elszámolás a store szabályai szerint | A08–A11: vásárlás, megújulás, visszatérítés, restore és több előfizetés teljes tesztje. |
| Egyszerű support e-mail és minimális diagnosztika elég | A26: tényleges cím, felület és adatot nem szivárogtató hibajelentés még szükséges. |

## A03 — helyi implementáció kész, staging elfogadás hiányzik

A `fa67411` az A02 commitja. Az A03 munkafában elkészült az import/restore előnézet és visszaállítási pont, a családi importazonosítók előkészítése, a külön helyi törlés, valamint a szerveroldalon is adminhoz kötött családi törlés. A törlés exportot kínál, a családi változat családnév-megerősítést kér, és törlés után nem hagy rejtett safety backupot. Frontend és Worker typecheck, 24 fájlban 205/205 teszt, production és auth-enabled internal build sikeres. Commit/push és staging kéttelefonos elfogadás még nincs, ezért A03 nincs lezárva.

A folytatás kötelező sorrendje:

Stagingben még ellenőrizendő:

1. Adminnál megjelenik, tagnál nem jelenik meg a családi törlés; közvetlen tagi kérés szerverről is `FAMILY_ADMIN_REQUIRED` hibát kap.
2. Helyi törlés után a másik telefon közös naplója változatlan; a törlő telefon leválasztva és üres. Újracsatlakozás következménye legyen érthető.
3. Családi törlés csak pontos családnév után indul; mindkét telefonon eltűnnek a régi gyermek- és alvásadatok, és egy üres kezdőprofil marad.
4. Import és restore két eszközön nem duplikál; offline, pending, konfliktus és aktív alvás megfelelően blokkol.
5. Exportfájl használható, profilképek továbbra sem kerülnek a JSON-ba; sikertelen művelet nem hagy félállapotot.

A03 nem nyeli el az egész accounttörlés-projektet: az A17 recovery és szerveres purge külön feladat marad, de az A03 nem építhet vele ellentétes adatmegőrzést.

## Dokumentumok közötti pontosítandó pontok

- A helyi napló JSON-exportja, a teljes fiók/adatexport és a fizetős PDF-jelentés három eltérő cél. A teljes export adatkörét és visszaimportálhatóságát külön sémával kell rögzíteni; auth token vagy más családtag privát fiókadata ne legyen exporttartalom.
- A termékdöntések az utolsó tag kapcsán hangsúlyozzák a recoveryt; a részletes törlési folyamat általános választási lehetőséget ír le. Implementáció előtt tisztázandó a nem utolsó tag recoveryjének tagsági következménye. Helyreállítás nem adhat automatikusan új hozzáférést időközben megszüntetett tagsághoz.
- A normál logok 30 napja belső cél/javaslat; a tényleges szolgáltatói logok és backupok retentionje még ellenőrizendő. A helyi A03 mentés, a 30 napos account recovery és az infrastruktúra backupja nem ugyanaz.
- A tájékoztató „tartalmilag kész” megjegyzése nem jelenti, hogy elég a helyőrzőket kitölteni: az adatkezelési cél–adatkör–jogalap, tényleges szolgáltatók, megőrzés és végrehajtott törlés összhangja is kiadási feltétel. A gyermekadatok és a számviteli kivételek végleges jogi ellenőrzése nyitott; a napló nem számviteli bizonylat.
- A checklist alap Apple EULA használatát célozza; saját ÁSZF/szolgáltatási feltételek ettől még elkészítendők. Nem rögzítünk új, kötelező custom Apple EULA fejlesztési feladatot.

Az accounttörlés iránya összhangban van az ellenőrzött platformforrásokkal: Apple appon belüli törlés és Apple-belépés token-visszavonása; Google appon belüli és külső webes törlési út. Ezek a források nem hitelesítik a teljes magyar tájékoztatót:

- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play: Understanding app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

## Saját domain — megvásárolva, bekötés nincs igazolva

A tulajdonos 2026-09-20-án jelezte a `www.solemi-sleep.app` megvásárlását; a domainterv alapja `solemi-sleep.app`. A domainválasztást nem nyitjuk újra. DNS, tulajdonosi konzol, TLS, e-mail és production bekötés ebben az áttekintésben nem lett ellenőrizve vagy módosítva.

Javasolt, még nem publikált címek: `/privacy`, `/terms`, `/delete-account`, `/support`; az apex/www kanonikus iránya és az app hostja külön konfigurációs döntés. Az eredeti adminlistában a domain üres mezőjét ez a tulajdonosi közlés felülírja; az összes többi beállítás nyitott marad.

A bekötés A07/A12/A18/A24/A26 része: Cloudflare egyedi domain/TLS, OAuth engedélyezett originek és szükség szerinti callbackek, Apple webes konfiguráció, API CORS/proxy origin, store linkek és support-postafiók. A jelenlegi Pages proxy konkrét internal origint tartalmaz. Új domain más böngészős adattárat jelent: a helyi napló, mentés, profilkép és session nem költözik át magától. Migrációs/export út és visszalépési terv kell, különösen Free felhasználóknak.

## Következő lépés

A03 következő lépése a fenti staging elfogadás. Az eredeti öt TXT és ez az index a jövőbeli javítások bemenete. Commit/push a tulajdonosé; éles deploy, main merge és production adatbázis-módosítás külön engedéllyel.
